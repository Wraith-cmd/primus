// Companion interrupt policy.
//
// The delve companion has no notion of a cast bar: it swings at whatever the
// owner swings at and lets the healer add finish its channel. A player watching
// the same fight kicks the heal, and ignores the boss hardcast it cannot stop.
// Deciding WHETHER to kick, and WHOM, is the whole difference.
//
// The three rules this core encodes are the ones a competent interrupter follows:
//  1. Never spend the cooldown on a cast that will be over before you can reach
//     it. A kick thrown at a cast with 0.2s left, from 12 yards out, is a wasted
//     cooldown and the next cast goes off uncontested.
//  2. Not every cast is worth a kick. A boss hardcast on a CC-immune mob cannot
//     be stopped at all, and a filler nuke is not worth the cooldown the healer
//     add's channel is about to need.
//  3. When two casts both matter, take the more dangerous one, and among equals
//     take the one landing soonest.
//
// Pure leaf: no SimContext, no Entity, no rng, no clock. The owning system module
// reads `castingAbility` / `castRemaining` / `castTotal` off nearby hostiles and
// hands the flattened rows in. Deterministic: candidates are compared on a total
// ordering that ends in the caster id.

import { NYTHRAXIS_SPIRIT_MENDING_CAST_ID } from '../mob/healer_channel';

/** How much a cast is worth interrupting. Ordered least to most severe. */
export type CastThreat = 'ignore' | 'minor' | 'serious' | 'critical';

/** Numeric rank of each band, for comparisons and for the `minThreat` filter. */
export const CAST_THREAT_RANK: Record<CastThreat, number> = {
  ignore: 0,
  minor: 1,
  serious: 2,
  critical: 3,
};

/** One hostile mid-cast, flattened off its entity. */
export interface HostileCast {
  /** The caster's entity id. Also the final deterministic tie-break. */
  id: number;
  /** `Entity.castingAbility`. Empty means "not really casting": ignored. */
  abilityId: string;
  /** `Entity.castRemaining`, seconds until the cast completes. */
  castRemaining: number;
  /** `Entity.castTotal`, the cast's full duration. Used by the fallback ranking:
   *  an unknown ability with a long bar is a big spell far more often than not. */
  castTotal?: number;
  /** Distance from the companion, world units. */
  distance: number;
  /** false when the caster cannot be interrupted at all (a `ccImmune` boss).
   *  Defaults to true. */
  interruptible?: boolean;
}

/** The companion's own interrupt state. */
export interface InterruptState {
  /** Interrupt off cooldown. */
  ready: boolean;
  /** Range of the interrupt itself, world units. */
  range: number;
  /** World units per second the companion closes at. 0 or omitted means it will
   *  not chase to land a kick, so only casters already in range are candidates. */
  closeSpeed?: number;
  /** Decision plus cast-start latency. A companion that reacts in exactly zero
   *  time reads as a machine, and pretending otherwise would also make this core
   *  promise interrupts the live loop cannot actually land. */
  reactionSeconds?: number;
  /** The lowest band worth spending the cooldown on. */
  minThreat?: CastThreat;
}

export interface InterruptPlan {
  targetId: number;
  abilityId: string;
  threat: CastThreat;
  /** Seconds from now until the interrupt would land (reaction plus travel). */
  timeToLand: number;
  /** How much of the cast is left once the interrupt lands. Always positive:
   *  a non-positive slack means the cast finishes first and is not a candidate. */
  slack: number;
}

/** Default reaction budget, in seconds: 6 sim ticks at 20 Hz. */
export const INTERRUPT_REACTION_SECONDS = 0.3;
/** Extra cast time the plan insists on beyond the moment the kick lands, so a
 *  cast that would end on the exact same tick is never counted as catchable. */
export const INTERRUPT_LAND_MARGIN = 0.1;
/** An unknown ability with a bar at least this long is treated as a real spell
 *  rather than filler. */
export const LONG_CAST_SECONDS = 2.5;
/** Default floor: fillers are left alone, real spells are not. */
export const DEFAULT_MIN_THREAT: CastThreat = 'serious';

/** Scripted casts that exist purely as telegraphs on CC-immune mobs. Kicking
 *  one is not merely low value, it does nothing at all, so it never ranks.
 *  (`thunzharr_stormcall` and both Nythraxis boss casts belong to `ccImmune`
 *  bosses; `nythraxis_spirit_mending` is deliberately NOT here, it is the
 *  interruptible healer channel the encounter is built around.) */
export const UNINTERRUPTIBLE_CAST_IDS: ReadonlySet<string> = new Set([
  'thunzharr_stormcall',
  'nythraxis_heroic_summon',
  'nythraxis_deathless_rage',
]);

/** Explicit rankings for casts we know by name. Anything absent falls through to
 *  the token heuristics below. */
export const CAST_THREAT_TABLE: Readonly<Record<string, CastThreat>> = {
  // The escalating boss heal the raid must break: the canonical kick target.
  [NYTHRAXIS_SPIRIT_MENDING_CAST_ID]: 'critical',
};

// Token heuristics for content this core has never heard of. Ability ids in this
// repo are lower snake_case, so substring tokens are a workable stand-in for a
// per-ability table that would rot the moment someone adds a mob.
const CRITICAL_TOKENS = [
  'heal',
  'mend',
  'renew',
  'regen',
  'restor',
  'resurrect',
  'revive',
  'summon',
  'raise',
];
const SERIOUS_TOKENS = [
  'fear',
  'sleep',
  'polymorph',
  'charm',
  'entangle',
  'bolt',
  'blast',
  'nova',
  'storm',
  'lightning',
  'fire',
  'shadow',
  'curse',
];

function hasToken(id: string, tokens: readonly string[]): boolean {
  for (const token of tokens) {
    if (id.includes(token)) return true;
  }
  return false;
}

/** Rank one cast. Exported so a caller can reuse it, wrap it, or replace it
 *  wholesale via `planInterrupt`'s classifier argument (a boss script that wants
 *  its own ordering should pass its own function rather than edit this table). */
export function classifyCast(cast: HostileCast): CastThreat {
  const id = cast.abilityId.toLowerCase();
  if (id === '') return 'ignore';
  if (cast.interruptible === false) return 'ignore';
  if (UNINTERRUPTIBLE_CAST_IDS.has(id)) return 'ignore';
  const known = CAST_THREAT_TABLE[id];
  if (known !== undefined) return known;
  // A heal or a summon undoes the whole pull, so those outrank raw damage.
  if (hasToken(id, CRITICAL_TOKENS)) return 'critical';
  if (hasToken(id, SERIOUS_TOKENS)) return 'serious';
  if ((cast.castTotal ?? 0) >= LONG_CAST_SECONDS) return 'serious';
  return 'minor';
}

/** Seconds until the companion could land an interrupt on this caster: its
 *  reaction, plus the time to close whatever distance the interrupt's range does
 *  not already cover. `Infinity` when the caster is out of range and the
 *  companion will not chase. */
export function interruptTimeToLand(cast: HostileCast, state: InterruptState): number {
  const reaction = state.reactionSeconds ?? INTERRUPT_REACTION_SECONDS;
  const gap = cast.distance - state.range;
  if (gap <= 0) return reaction;
  const speed = state.closeSpeed ?? 0;
  if (speed <= 0) return Number.POSITIVE_INFINITY;
  return reaction + gap / speed;
}

/** True when the cast is still running by the time the interrupt lands. This is
 *  the "do not waste the cooldown" rule, and it is why a distant caster with a
 *  nearly finished bar is not a target no matter how dangerous the spell is. */
export function canLandInterrupt(cast: HostileCast, state: InterruptState): boolean {
  const timeToLand = interruptTimeToLand(cast, state);
  return cast.castRemaining >= timeToLand + INTERRUPT_LAND_MARGIN;
}

interface Ranked {
  cast: HostileCast;
  threat: CastThreat;
  rank: number;
  timeToLand: number;
}

// Total ordering: danger, then the cast landing soonest (kicking that one may
// still leave time to reach the other), then the closest caster, then the id.
function isBetter(a: Ranked, b: Ranked): boolean {
  if (a.rank !== b.rank) return a.rank > b.rank;
  if (a.cast.castRemaining !== b.cast.castRemaining)
    return a.cast.castRemaining < b.cast.castRemaining;
  if (a.cast.distance !== b.cast.distance) return a.cast.distance < b.cast.distance;
  return a.cast.id < b.cast.id;
}

/** Decide whether to interrupt, and whom.
 *
 *  Returns null when the interrupt should be held: it is on cooldown, nothing
 *  nearby is casting anything worth stopping, or everything worth stopping will
 *  be over before the companion could get there.
 *
 *  `classify` swaps the danger ranking out entirely (per encounter, per role, or
 *  for a test); it defaults to `classifyCast`. */
export function planInterrupt(
  casts: readonly HostileCast[],
  state: InterruptState,
  classify: (cast: HostileCast) => CastThreat = classifyCast,
): InterruptPlan | null {
  if (!state.ready) return null;
  const floor = CAST_THREAT_RANK[state.minThreat ?? DEFAULT_MIN_THREAT];
  let best: Ranked | null = null;
  for (const cast of casts) {
    if (cast.castRemaining <= 0) continue;
    const threat = classify(cast);
    const rank = CAST_THREAT_RANK[threat];
    if (rank < floor || rank === CAST_THREAT_RANK.ignore) continue;
    const timeToLand = interruptTimeToLand(cast, state);
    if (cast.castRemaining < timeToLand + INTERRUPT_LAND_MARGIN) continue;
    const candidate: Ranked = { cast, threat, rank, timeToLand };
    if (best === null || isBetter(candidate, best)) best = candidate;
  }
  if (best === null) return null;
  const chosen: Ranked = best;
  return {
    targetId: chosen.cast.id,
    abilityId: chosen.cast.abilityId,
    threat: chosen.threat,
    timeToLand: chosen.timeToLand,
    slack: chosen.cast.castRemaining - chosen.timeToLand,
  };
}
