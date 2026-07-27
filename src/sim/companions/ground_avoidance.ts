// Companion ground-hazard avoidance.
//
// The delve companion walks to its target and stands there. A ground AoE (the
// `GroundAoE` records the sim drains in entity_roster.ts: a centre, a radius and
// a repeating pulse) does not move it at all, so it eats every tick of a fire
// puddle until it dies. Nothing reads more like a bot than an ally standing in
// the fire while the owner sidesteps it.
//
// This core answers the two questions a player answers in that moment: "am I
// standing in something?" and "where is the closest place that is out of it and
// still lets me keep doing my job?". It returns a destination, never a heading,
// so it cannot flee to infinity: every candidate is a concrete point just past a
// hazard edge (or a spot that holds range on the thing the companion is working
// on), and the nearest good one wins.
//
// Pure leaf: no SimContext, no Entity, no rng, no clock. The owning system module
// maps live `GroundAoE`s and entity positions onto these plain structs (hostile =
// a damaging zone, i.e. not one of the friendly `allyBuffPct` zones) and feeds
// the returned point to `moveToward`.
//
// Determinism: candidate points are generated from fixed angle ladders and
// compared on a total ordering that ends in a unique (group, sample) key, so the
// same world state yields the same destination no matter what order the hazards
// arrive in. A wobble here would fork the world, since this runs inside the tick.

/** A point on the XZ plane, world units. Ground hazards are 2D circles: the sim
 *  measures them with `dist2d`, so height never enters this core. */
export interface AvoidPoint {
  x: number;
  z: number;
}

/** One active ground effect, flattened off a `GroundAoE`. */
export interface GroundHazard {
  /** Stable identity (the effect's `sourceId` works). Used only as the final
   *  tie-break, so it never has to mean anything beyond "unique". */
  id: number;
  x: number;
  z: number;
  radius: number;
  /** true when standing in it hurts. A friendly zone (Rune of Power's
   *  `allyBuffPct` pulse) is `false`: not avoided, and mildly preferred. */
  hostile: boolean;
}

/** The thing the companion is currently working on: its combat target, or the
 *  ally it is about to heal. The dodge tries to stay inside `range` of it so
 *  stepping out of the fire does not also drop the cast. */
export interface AvoidAnchor {
  x: number;
  z: number;
  range: number;
}

export interface AvoidOptions {
  /** Clearance kept beyond the hazard edge, so a dodge that lands exactly on the
   *  rim does not get clipped back in by the next pulse or a rounding wobble. */
  margin?: number;
  /** Furthest the companion is willing to travel for one dodge. Caps the search
   *  so a big overlapping mess never turns into a run across the room. */
  maxStep?: number;
}

export interface AvoidMove {
  x: number;
  z: number;
  /** Distance from the current position to the chosen spot. */
  distance: number;
  /** true when the spot is clear of every hostile hazard. false means the room
   *  is covered and this is only the least-bad reachable spot. */
  safe: boolean;
  /** true when the spot keeps the anchor in range (always true with no anchor). */
  keepsAnchor: boolean;
}

/** Default clearance past a hazard edge. */
export const AVOID_MARGIN = 1.5;
/** Default cap on how far one dodge may travel. */
export const AVOID_MAX_STEP = 30;
/** Directions sampled around each hazard (and around the anchor). 16 is fine
 *  enough that the chosen exit is within a couple of degrees of the ideal one
 *  and cheap enough to run per companion per tick. */
export const AVOID_RING_SAMPLES = 16;
/** Fraction of the anchor's range the anchor ring is sampled at: comfortably
 *  inside, not sitting on the edge where one step drops the target. */
export const ANCHOR_RING_FRAC = 0.8;

// Containment is tested with a hair of slack so a candidate placed exactly on
// the inflated rim reads as outside despite floating-point noise.
const CONTAIN_EPS = 1e-6;
// Distances are compared in millimetre buckets. Points that are the same walk
// away differ in the last bits of a sqrt, and comparing raw floats would let
// that noise outrank the deliberate tie-breaks below.
const DISTANCE_BUCKET = 1e-3;

function distanceBetween(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

function containsPoint(h: GroundHazard, x: number, z: number, margin: number): boolean {
  const reach = h.radius + margin;
  const dx = x - h.x;
  const dz = z - h.z;
  return dx * dx + dz * dz < reach * reach - CONTAIN_EPS;
}

/** How many hostile hazards cover this point (0 = safe). Order independent by
 *  construction: it is a count, not a pick. */
export function dangerAt(
  x: number,
  z: number,
  hazards: readonly GroundHazard[],
  margin: number = AVOID_MARGIN,
): number {
  let count = 0;
  for (const h of hazards) {
    if (!h.hostile) continue;
    if (containsPoint(h, x, z, margin)) count++;
  }
  return count;
}

/** True when the companion is standing in (or within `margin` of) something
 *  that hurts. The cheap gate the caller can run before planning a move. */
export function isInDanger(
  self: AvoidPoint,
  hazards: readonly GroundHazard[],
  margin: number = AVOID_MARGIN,
): boolean {
  return dangerAt(self.x, self.z, hazards, margin) > 0;
}

/** True when the point is inside a friendly zone worth standing in. */
function inFriendlyZone(x: number, z: number, hazards: readonly GroundHazard[]): boolean {
  for (const h of hazards) {
    if (h.hostile) continue;
    if (containsPoint(h, x, z, 0)) return true;
  }
  return false;
}

interface Candidate {
  x: number;
  z: number;
  distance: number;
  /** `distance` in comparison buckets: the field the ordering actually reads. */
  distanceKey: number;
  danger: number;
  /** 0 when the anchor stays in range (or there is no anchor), else 1. */
  anchorPenalty: 0 | 1;
  /** 0 when the spot sits in a friendly zone, else 1. */
  friendlyPenalty: 0 | 1;
  /** 0 for a hazard-edge sample, 1 for an anchor-ring sample. Part of the key. */
  groupKind: 0 | 1;
  groupId: number;
  sample: number;
}

// The total ordering. Every field is derived from the candidate itself, and the
// last three make the key unique, so "which candidate is best" never depends on
// the order the hazards were iterated in.
//
// Danger first: holding range is never worth standing in fire. Then the anchor,
// because a dodge that drops the target costs the companion its next cast. Then
// nearness, which is what keeps this from wandering off. Friendly zones only
// break exact distance ties (a player steps back into their own buff circle when
// it is free to do so, and never walks further for it).
function isBetter(a: Candidate, b: Candidate): boolean {
  if (a.danger !== b.danger) return a.danger < b.danger;
  if (a.anchorPenalty !== b.anchorPenalty) return a.anchorPenalty < b.anchorPenalty;
  if (a.distanceKey !== b.distanceKey) return a.distanceKey < b.distanceKey;
  if (a.friendlyPenalty !== b.friendlyPenalty) return a.friendlyPenalty < b.friendlyPenalty;
  if (a.groupKind !== b.groupKind) return a.groupKind < b.groupKind;
  if (a.groupId !== b.groupId) return a.groupId < b.groupId;
  return a.sample < b.sample;
}

/** Decide whether to move out of the ground effects, and to where.
 *
 *  Returns null when the companion should stay put: either nothing hostile
 *  covers it, or nothing reachable within `maxStep` is an improvement. Null
 *  means "keep doing what you were doing", never "panic".
 *
 *  The returned point is the nearest spot that is out of the fire, biased toward
 *  spots that keep `anchor` in range. */
export function planGroundAvoidance(
  self: AvoidPoint,
  hazards: readonly GroundHazard[],
  anchor: AvoidAnchor | null = null,
  options: AvoidOptions = {},
): AvoidMove | null {
  const margin = options.margin ?? AVOID_MARGIN;
  const maxStep = options.maxStep ?? AVOID_MAX_STEP;
  const currentDanger = dangerAt(self.x, self.z, hazards, margin);
  if (currentDanger === 0) return null;

  let best: Candidate | null = null;
  const consider = (
    x: number,
    z: number,
    groupKind: 0 | 1,
    groupId: number,
    sample: number,
  ): void => {
    const distance = distanceBetween(x, z, self.x, self.z);
    if (distance > maxStep) return;
    const danger = dangerAt(x, z, hazards, margin);
    if (danger >= currentDanger) return; // never trade one puddle for another
    const anchorPenalty: 0 | 1 =
      anchor === null || distanceBetween(x, z, anchor.x, anchor.z) <= anchor.range ? 0 : 1;
    const candidate: Candidate = {
      x,
      z,
      distance,
      distanceKey: Math.round(distance / DISTANCE_BUCKET),
      danger,
      anchorPenalty,
      friendlyPenalty: inFriendlyZone(x, z, hazards) ? 0 : 1,
      groupKind,
      groupId,
      sample,
    };
    if (best === null || isBetter(candidate, best)) best = candidate;
  };

  for (const h of hazards) {
    if (!h.hostile) continue;
    const reach = h.radius + margin;
    // Sample -1 is the straight-out exit: the point on the rim directly away
    // from the hazard centre through the companion, i.e. the shortest possible
    // step out of THIS hazard. The fixed ring below covers the cases where that
    // exit lands in a second puddle or drops the anchor.
    const dx = self.x - h.x;
    const dz = self.z - h.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 0) consider(h.x + (dx / len) * reach, h.z + (dz / len) * reach, 0, h.id, -1);
    for (let i = 0; i < AVOID_RING_SAMPLES; i++) {
      // Angles measured off +z, matching the sim's atan2(dx, dz) facing convention.
      const angle = (i / AVOID_RING_SAMPLES) * Math.PI * 2;
      consider(h.x + Math.sin(angle) * reach, h.z + Math.cos(angle) * reach, 0, h.id, i);
    }
  }

  if (anchor !== null) {
    // A ring comfortably inside the anchor's range, for the case where every
    // hazard exit would drop the target: these spots hold range by construction.
    const ringRadius = anchor.range * ANCHOR_RING_FRAC;
    for (let i = 0; i < AVOID_RING_SAMPLES; i++) {
      const angle = (i / AVOID_RING_SAMPLES) * Math.PI * 2;
      consider(
        anchor.x + Math.sin(angle) * ringRadius,
        anchor.z + Math.cos(angle) * ringRadius,
        1,
        0,
        i,
      );
    }
  }

  if (best === null) return null;
  const chosen: Candidate = best;
  return {
    x: chosen.x,
    z: chosen.z,
    distance: chosen.distance,
    safe: chosen.danger === 0,
    keepsAnchor: chosen.anchorPenalty === 0,
  };
}
