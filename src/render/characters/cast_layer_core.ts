// The procedural spell-cast pose layer: the PURE half.
//
// The KayKit rigs ship three generic spellcast clips and nothing else, so the
// readable part of a cast (a windup that builds, a held coil, then a snap on
// release) cannot come from the clips. It comes from here: given cast progress
// (0 to 1), the cast style, and a live knob struct, this returns ADDITIVE pose
// offsets in radians. `visual.ts` adds them to the rig AFTER the AnimationMixer
// has written its sampled pose, exactly the way the sheathe gesture's arm lift
// already does (STOW_ARM_BONE / STOW_ARM_LIFT_RAD). The base clip is untouched:
// no remix, no retime, no clip splitting. This is a layer on top.
//
// Numbers only: no three.js, no DOM, no i18n, no Math.random / Date.now /
// performance.now. Same inputs give the same outputs, so a plain Vitest drives
// every curve directly (tests/cast_layer_core.test.ts). The live knob object the
// owner tunes from the browser console lives in the non-pure sibling
// `cast_knobs.ts`, which owns window + localStorage; this file never sees them.
import { type Entity, isNonSpellCast } from '../../sim/types';

/** Which pose layer a cast gets. `none` yields all-zero offsets: non-spell
 *  activity casts (fishing, gathering) and self-centered spins must not get a
 *  spellcast windup laid over them. */
export type CastLayerStyle = 'none' | 'hardcast' | 'channel';

/**
 * The tunable surface. Every field is a plain number so the whole struct can be
 * mutated live from the console and JSON-round-tripped through localStorage.
 * Angles are radians; the sign conventions are the rig's (see the comments on
 * the defaults below and the bone map in visual.ts).
 */
export interface CastLayerKnobs {
  /** Master blend over every channel. 0 disables the layer entirely. */
  master: number;
  /** Forward lean of the lower torso (spine bone, parent-space X). */
  torsoLean: number;
  /** Twist that brings the casting shoulder forward (chest bone, Y). */
  torsoTwist: number;
  /** Casting (right) upper-arm lift. NEGATIVE raises on this rig. */
  armMain: number;
  /** Off (left) upper-arm lift. NEGATIVE raises on this rig. */
  armOff: number;
  /** Head pitch. NEGATIVE lifts the chin, countering the torso lean. */
  headTilt: number;
  /** Chest thrust magnitude of the release impulse (hardcast only). */
  punch: number;
  /** Progress at which the windup finishes and the hold begins. */
  windupEnd: number;
  /** Progress at which the release begins. */
  releaseStart: number;
  /** How far past neutral every channel swings through on release. */
  overshoot: number;
  /** Extra build accumulated across the hold, as a fraction of the windup peak. */
  holdCoil: number;
  /** Channel-only sway amplitude, as a fraction of the windup peak. */
  channelSway: number;
  /** Channel-only sway cycles across the hold. */
  channelSwayCycles: number;
}

/** Additive radians per joint channel. One field maps to exactly one bone axis
 *  in visual.ts, so a zeroed knob provably zeroes exactly one thing. */
export interface CastPoseOffsets {
  /** spine.rotation.x += (positive leans forward) */
  torsoLean: number;
  /** chest.rotation.y += (positive brings the right shoulder forward) */
  torsoTwist: number;
  /** upperarmr.rotation.x += (negative raises) */
  armMain: number;
  /** upperarml.rotation.x += (negative raises) */
  armOff: number;
  /** head.rotation.x += (negative lifts the chin) */
  headTilt: number;
  /** chest.rotation.x += (the release thrust) */
  punch: number;
}

// ---------------------------------------------------------------------------
// Defaults. These are the shipped starting point; the owner retunes them live
// and pastes __primusCastKnobs.dump() back over this block once he likes a set.
// ---------------------------------------------------------------------------

/** Master blend. */
export const CAST_MASTER = 1;
/** Lower torso leans into the cast. Small: past ~0.35 the hips read as broken. */
export const CAST_TORSO_LEAN_RAD = 0.22;
/** Upper torso twists the casting shoulder forward. */
export const CAST_TORSO_TWIST_RAD = 0.2;
/** Casting arm lift. Negative raises (same sign convention as STOW_ARM_LIFT_RAD). */
export const CAST_ARM_MAIN_RAD = -0.62;
/** Off arm lift: about half the casting arm, so the pose stays asymmetric. */
export const CAST_ARM_OFF_RAD = -0.34;
/** Chin lifts a touch so the lean does not bury the face in the chest. */
export const CAST_HEAD_TILT_RAD = -0.14;
/** Chest thrust on release. This is the beat that sells the spell leaving. */
export const CAST_PUNCH_RAD = 0.3;
/** The windup owns the first third of the cast. */
export const CAST_WINDUP_END = 0.34;
/** The release owns the last fifth. */
export const CAST_RELEASE_START = 0.78;
/** Swing-through past neutral on release: what makes it read as a snap. */
export const CAST_OVERSHOOT = 0.55;
/** The hold keeps coiling slightly instead of sitting frozen. */
export const CAST_HOLD_COIL = 0.12;
/** Channels breathe instead of snapping. */
export const CAST_CHANNEL_SWAY = 0.1;
/** Sway cycles across a channel's hold. */
export const CAST_CHANNEL_SWAY_CYCLES = 3;

export const CAST_LAYER_DEFAULTS: Readonly<CastLayerKnobs> = Object.freeze({
  master: CAST_MASTER,
  torsoLean: CAST_TORSO_LEAN_RAD,
  torsoTwist: CAST_TORSO_TWIST_RAD,
  armMain: CAST_ARM_MAIN_RAD,
  armOff: CAST_ARM_OFF_RAD,
  headTilt: CAST_HEAD_TILT_RAD,
  punch: CAST_PUNCH_RAD,
  windupEnd: CAST_WINDUP_END,
  releaseStart: CAST_RELEASE_START,
  overshoot: CAST_OVERSHOOT,
  holdCoil: CAST_HOLD_COIL,
  channelSway: CAST_CHANNEL_SWAY,
  channelSwayCycles: CAST_CHANNEL_SWAY_CYCLES,
});

/** Stable knob order for the console dump and the persisted payload. */
export const CAST_KNOB_KEYS: readonly (keyof CastLayerKnobs)[] = Object.freeze([
  'master',
  'torsoLean',
  'torsoTwist',
  'armMain',
  'armOff',
  'headTilt',
  'punch',
  'windupEnd',
  'releaseStart',
  'overshoot',
  'holdCoil',
  'channelSway',
  'channelSwayCycles',
] as (keyof CastLayerKnobs)[]);

// Timing guards. A knob edit must never divide by zero or invert the phases, so
// the shape parameters are clamped into a sane band before any curve uses them.
const MIN_WINDUP = 0.05;
const MAX_WINDUP = 0.9;
const MIN_PHASE_GAP = 0.05;
const MAX_RELEASE_START = 0.99;
// Fraction of the release window the impulse takes to reach its peak. Fast
// attack, slower decay: that asymmetry is what reads as an impact.
const RELEASE_ATTACK = 0.18;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function num(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

/** Smootherstep (zero first AND second derivative at both ends): the windup
 *  builds instead of ramping linearly, which is the whole point of the curve. */
function smootherstep(u: number): number {
  const t = clamp(u, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Fast collapse toward neutral once the release starts. */
function easeOutQuint(u: number): number {
  const t = clamp(u, 0, 1);
  const inv = 1 - t;
  return 1 - inv * inv * inv * inv * inv;
}

/**
 * The release impulse: 0 at both ends of the release window, a quick smooth
 * attack to 1 at `RELEASE_ATTACK`, then a cubic decay back to 0. Exported for
 * the tests, which pin the peak location and the decay.
 */
export function releaseImpulse(u: number): number {
  if (!(u > 0) || u >= 1) return 0;
  if (u < RELEASE_ATTACK) {
    const a = u / RELEASE_ATTACK;
    return a * a * (3 - 2 * a);
  }
  const d = (u - RELEASE_ATTACK) / (1 - RELEASE_ATTACK);
  const inv = 1 - d;
  return inv * inv * inv;
}

interface CastPhases {
  windupEnd: number;
  releaseStart: number;
}

function phases(k: CastLayerKnobs): CastPhases {
  const windupEnd = clamp(num(k.windupEnd, CAST_WINDUP_END), MIN_WINDUP, MAX_WINDUP);
  const releaseStart = clamp(
    num(k.releaseStart, CAST_RELEASE_START),
    windupEnd + MIN_PHASE_GAP,
    MAX_RELEASE_START,
  );
  return { windupEnd, releaseStart };
}

/**
 * The shared envelope every joint channel rides, as a multiple of its knob.
 *
 * 0 to windupEnd   : smootherstep 0 -> 1 (the build)
 * windupEnd to release : 1 -> 1 + holdCoil (the hold keeps coiling); a channel
 *                    also gets a sine sway here instead of a release snap
 * release to 1     : a quintic collapse toward 0 with an overshoot swing
 *                    through neutral (the snap). A channel just eases out.
 *
 * Exported so the tests can pin the shape independently of the knob scaling.
 */
export function castEnvelope(progress: number, style: CastLayerStyle, k: CastLayerKnobs): number {
  if (style === 'none') return 0;
  const p = clamp(num(progress, 0), 0, 1);
  if (p <= 0) return 0;
  const { windupEnd, releaseStart } = phases(k);
  const coil = Math.max(0, num(k.holdCoil, CAST_HOLD_COIL));
  const peak = 1 + coil;

  if (p < windupEnd) return smootherstep(p / windupEnd);

  if (p < releaseStart) {
    const u = (p - windupEnd) / (releaseStart - windupEnd);
    let v = 1 + coil * smootherstep(u);
    if (style === 'channel') {
      const cycles = Math.max(0, num(k.channelSwayCycles, CAST_CHANNEL_SWAY_CYCLES));
      const sway = num(k.channelSway, CAST_CHANNEL_SWAY);
      v += sway * Math.sin(2 * Math.PI * cycles * u);
    }
    return v;
  }

  const u = (p - releaseStart) / (1 - releaseStart);
  // A channel has no projectile to throw: it just lets go.
  if (style === 'channel') return peak * (1 - smootherstep(u));
  const overshoot = Math.max(0, num(k.overshoot, CAST_OVERSHOOT));
  return peak * (1 - easeOutQuint(u)) - overshoot * releaseImpulse(u);
}

/** The release punch, 0 outside the release window and hardcast-only. */
export function castPunch(progress: number, style: CastLayerStyle, k: CastLayerKnobs): number {
  if (style !== 'hardcast') return 0;
  const p = clamp(num(progress, 0), 0, 1);
  const { releaseStart } = phases(k);
  if (p < releaseStart) return 0;
  return releaseImpulse((p - releaseStart) / (1 - releaseStart));
}

/** A zeroed offsets struct callers can own and refill every frame. */
export function emptyCastPoseOffsets(): CastPoseOffsets {
  return { torsoLean: 0, torsoTwist: 0, armMain: 0, armOff: 0, headTilt: 0, punch: 0 };
}

/**
 * Fill a caller-owned offsets struct: the allocation-free per-frame entry
 * (same contract as nameplatePlanInto). `progress` is 0 at cast start and 1 at
 * completion; anything outside that is clamped.
 */
export function castLayerOffsetsInto(
  out: CastPoseOffsets,
  progress: number,
  style: CastLayerStyle,
  k: CastLayerKnobs,
): CastPoseOffsets {
  const master = style === 'none' ? 0 : num(k.master, CAST_MASTER);
  if (master === 0) {
    out.torsoLean = 0;
    out.torsoTwist = 0;
    out.armMain = 0;
    out.armOff = 0;
    out.headTilt = 0;
    out.punch = 0;
    return out;
  }
  const env = castEnvelope(progress, style, k) * master;
  out.torsoLean = num(k.torsoLean, CAST_TORSO_LEAN_RAD) * env;
  out.torsoTwist = num(k.torsoTwist, CAST_TORSO_TWIST_RAD) * env;
  out.armMain = num(k.armMain, CAST_ARM_MAIN_RAD) * env;
  out.armOff = num(k.armOff, CAST_ARM_OFF_RAD) * env;
  out.headTilt = num(k.headTilt, CAST_HEAD_TILT_RAD) * env;
  out.punch = num(k.punch, CAST_PUNCH_RAD) * castPunch(progress, style, k) * master;
  return out;
}

/** Allocating convenience wrapper (tests, one-off inspection). */
export function castLayerOffsets(
  progress: number,
  style: CastLayerStyle,
  k: CastLayerKnobs,
): CastPoseOffsets {
  return castLayerOffsetsInto(emptyCastPoseOffsets(), progress, style, k);
}

// ---------------------------------------------------------------------------
// Entity -> layer inputs. Same fields the overhead cast bar reads
// (src/render/cast_bar.ts): castingAbility + castRemaining + castTotal.
// ---------------------------------------------------------------------------

/**
 * Which pose layer this entity's cast gets, or `none`. Fishing and gathering
 * are activity casts, not spells (isNonSpellCast), so they stay unlayered: a
 * spell windup over a fishing rod reads as a bug.
 */
export function castLayerStyleFor(e: Entity): CastLayerStyle {
  if (e.dead || e.kind === 'object') return 'none';
  if (!e.castingAbility || !(e.castTotal > 0)) return 'none';
  if (isNonSpellCast(e.castingAbility)) return 'none';
  return e.channeling ? 'channel' : 'hardcast';
}

/** Cast progress, 0 at cast start to 1 at completion. Channels advance the same
 *  way (the bar drains, the pose still runs start to finish). */
export function castLayerProgress(e: Entity): number {
  if (!(e.castTotal > 0)) return 0;
  return 1 - clamp(e.castRemaining / e.castTotal, 0, 1);
}
