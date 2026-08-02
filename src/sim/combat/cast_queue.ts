// Single-slot spell queue POLICY: the classic-era feel where pressing the next
// button a hair early is remembered, and fires the instant you are free, instead
// of being thrown away.
//
// Pure leaf: no SimContext, no state, no rng, no clock. A Vitest imports it
// directly. `combat/casting_lifecycle.ts` is the only consumer and owns every
// Entity mutation; this module only answers questions about plain numbers.
//
// WHY THE WINDOW IS IN TICKS. The sim is a fixed 20 Hz step and deliberately has
// no wall clock (tests/architecture.test.ts bans Date.now / performance.now
// anywhere under src/sim). A queue window measured in real milliseconds would
// fork determinism between the offline, server, and headless hosts AND would
// drift with the render frame rate. So the window is authored as a TICK COUNT and
// converted once, in types.ts, to the seconds form that the two DT-decremented
// sim clocks (castRemaining, gcdRemaining) are compared against. 8 ticks is
// exactly 0.4 sec at DT = 1/20, and the multiply is exact in binary floating
// point, so the seconds threshold always lands on a real tick boundary.

import { type AbilityDef, CAST_QUEUE_WINDOW_SEC } from '../types';

/** Whether a DT-decremented sim clock (castRemaining or gcdRemaining) has entered
 *  the queue window. Both clocks count down in whole DT steps, so this is exactly
 *  "the last CAST_QUEUE_WINDOW_TICKS ticks of it": frame-rate independent by
 *  construction, with no wall-clock term anywhere in the comparison. */
export function withinCastQueueWindow(remainingSec: number): boolean {
  return remainingSec <= CAST_QUEUE_WINDOW_SEC;
}

/** Should a fresh press with NO cast in progress take the single queue slot rather
 *  than be dropped on the floor?
 *
 *  This is the common case in real play and the half that was missing: most presses
 *  follow an INSTANT ability, where there is no cast bar to queue against, only the
 *  global cooldown. Outside the window the press is still refused exactly as before
 *  (classic spams the button), so this only ever converts a near-miss into a hit. */
export function shouldQueueOnGcd(opts: { gcdRemaining: number; offGcd: boolean }): boolean {
  // An off-GCD ability is never blocked by the GCD, so it has nothing to wait for.
  if (opts.offGcd) return false;
  // Already free: cast now, never queue. Keeps the slot for genuine near-misses.
  if (opts.gcdRemaining <= 0) return false;
  return withinCastQueueWindow(opts.gcdRemaining);
}

/** An ability whose queued press is meaningless without a living hostile target.
 *  Friendly-target abilities are excluded on purpose: they fall back to a self-cast
 *  when the target is gone, so a missing target does not invalidate them. Combat
 *  resurrection (targetsDead) is excluded for the obvious reason. */
export function needsLivingTargetToQueue(def: AbilityDef): boolean {
  return def.requiresTarget && def.targetType !== 'friendly' && !def.targetsDead;
}

/** Cheap re-validation the instant before a queued press actually fires.
 *
 *  Scope is deliberately narrow: only the UNAMBIGUOUS invalidations, the ones where
 *  the player plainly did not ask for what would happen. Those are dropped QUIETLY,
 *  with no error toast, because the press was aimed at a living target that no
 *  longer exists. Every other refusal (resource, cooldown, range, facing, line of
 *  sight) is left to the full castAbility gate set, which drops the press and
 *  surfaces the same error a live press would have produced. That keeps one set of
 *  rules for refusals instead of a second, drifting copy of them here. */
export function queuedCastStillValid(opts: {
  casterDead: boolean;
  needsLivingTarget: boolean;
  targetMissing: boolean;
  targetDead: boolean;
}): boolean {
  if (opts.casterDead) return false;
  if (opts.needsLivingTarget && (opts.targetMissing || opts.targetDead)) return false;
  return true;
}
