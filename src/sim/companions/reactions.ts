// Companion reactions: the two per-tick reflexes every companion runs, wired to
// the live world.
//
// `ground_avoidance.ts` and `interrupt_policy.ts` are pure cores: they answer
// "where should I stand?" and "whose cast should I stop?" from plain structs and
// know nothing about entities, ground effects, or the sim clock. This module is
// the ONE place those cores are fed real world state and their answers are
// executed, so the delve companion (Acolyte Tessa) and every dungeon-party
// companion react identically instead of drifting apart in two copies.
//
// Both reflexes draw ZERO rng. The dodge is a `moveToward` (pure movement math)
// and the interrupt is a `cancelCast` plus a lockout aura whose duration comes
// from the shared diminishing-returns helper. That matters: companions run
// inside the mob loop in entity-iteration order, so a draw here would shift the
// global stream for every entity behind them.
//
// `src/sim`-pure: no DOM/Three/render/ui/game/net imports, no Math.random,
// no Date.now (enforced by tests/architecture.test.ts).

import { ABILITIES } from '../data';
import { SCRIPTED_INTERRUPTIBLE_CHANNELS } from '../mob/healer_channel';
import type { SimContext } from '../sim_context';
import { type Aura, dist2d, type Entity, isNonSpellCast } from '../types';
import { type AvoidAnchor, type GroundHazard, planGroundAvoidance } from './ground_avoidance';
import { type HostileCast, type InterruptState, planInterrupt } from './interrupt_policy';

/** Ground effects further away than this cannot be standing on the companion, so
 *  they never enter the dodge search. Keeps the per-tick candidate set small. */
export const COMPANION_HAZARD_SCAN_RADIUS = 45;
/** How far a companion looks for something worth interrupting. */
export const COMPANION_CAST_SCAN_RADIUS = 35;
/** Reach of a companion's interrupt, world units. Roughly a caster-side kick. */
export const COMPANION_INTERRUPT_RANGE = 8;
/** Seconds between interrupts. Long enough that the policy's "is this worth the
 *  cooldown?" question is a real one, short enough to answer a second channel. */
export const COMPANION_INTERRUPT_COOLDOWN = 12;
/** School lockout applied on a successful interrupt, before diminishing returns. */
export const COMPANION_INTERRUPT_LOCKOUT = 4;
/** Aura id the lockout lands under. Stable so a second kick refreshes rather than
 *  stacking a parallel lockout. */
export const COMPANION_INTERRUPT_AURA_ID = 'companion_interrupt_lockout';

/** Per-companion reflex timers. Keyed by companion ENTITY id on `Sim`, so a
 *  companion that is dropped and re-summoned starts on a fresh cooldown rather
 *  than inheriting a dead entity's. */
export interface CompanionCooldowns {
  /** Sim time at which the interrupt comes off cooldown. */
  interruptReadyAt: number;
  /** Sim time at which the tank may taunt again. */
  tauntReadyAt: number;
}

export function companionCooldownsFor(ctx: SimContext, id: number): CompanionCooldowns {
  let cd = ctx.companionCooldowns.get(id);
  if (!cd) {
    cd = { interruptReadyAt: 0, tauntReadyAt: 0 };
    ctx.companionCooldowns.set(id, cd);
  }
  return cd;
}

/** Drop timers for companions that no longer exist. Called from the party sweep;
 *  the map only ever holds a handful of entries, so this is a cheap full pass. */
export function pruneCompanionCooldowns(ctx: SimContext): void {
  for (const id of [...ctx.companionCooldowns.keys()]) {
    if (!ctx.entities.has(id)) ctx.companionCooldowns.delete(id);
  }
}

/** Flatten the live ground effects near `self` onto the avoidance core's structs.
 *
 *  A `GroundAoE` with `allyBuffPct` is Rune of Power, a FRIENDLY zone, so it is
 *  reported as non-hostile: the core will not run out of it, and mildly prefers
 *  standing in it. Everything else pulses damage and is avoided. */
export function companionHazards(ctx: SimContext, self: Entity): GroundHazard[] {
  const out: GroundHazard[] = [];
  for (const effect of ctx.groundAoEs) {
    if (dist2d(self.pos, effect.pos) > COMPANION_HAZARD_SCAN_RADIUS + effect.radius) continue;
    out.push({
      id: effect.sourceId,
      x: effect.pos.x,
      z: effect.pos.z,
      radius: effect.radius,
      hostile: effect.allyBuffPct === undefined,
    });
  }
  return out;
}

/** Step out of the fire if the companion is standing in any.
 *
 *  Returns true when it moved (or wanted to and was rooted), which is the signal
 *  the caller uses to SKIP its ordinary combat movement this tick: a companion
 *  that dodged and then immediately walked back into melee never left the puddle.
 *
 *  Returns false when nothing hostile covers the companion, so a hazard-free
 *  world leaves the pre-existing movement untouched, byte for byte. */
export function companionAvoidGround(
  ctx: SimContext,
  self: Entity,
  anchor: AvoidAnchor | null,
): boolean {
  const hazards = companionHazards(ctx, self);
  if (hazards.length === 0) return false;
  const move = planGroundAvoidance(self.pos, hazards, anchor);
  if (!move) return false;
  // Rooted in the fire is still "handling the hazard": the companion must not
  // fall through to walking further into it.
  if (ctx.isRooted(self)) return true;
  ctx.moveToward(
    self,
    { x: move.x, y: self.pos.y, z: move.z },
    self.moveSpeed * ctx.moveSpeedMult(self),
  );
  return true;
}

// The school a cast's interrupt would lock out, or null when the cast cannot be
// interrupted at all. Mirrors the player interrupt effect's gate exactly
// (combat/effect_dispatch.ts, `case 'interrupt'`): non-spell activities, casts
// that resolve to no ability def and are not a registered scripted channel,
// physical casts, and explicitly uninterruptible abilities are all immune.
function interruptSchoolFor(ctx: SimContext, caster: Entity): Aura['school'] | null {
  const castId = caster.castingAbility;
  if (castId === null || isNonSpellCast(castId)) return null;
  const def = ctx.resolvedAbility(castId, caster.id)?.def ?? ABILITIES[castId];
  if (!def) return SCRIPTED_INTERRUPTIBLE_CHANNELS[castId]?.school ?? null;
  if (def.school === 'physical' || def.uninterruptible) return null;
  return def.school;
}

/** Flatten every nearby hostile mid-cast onto the interrupt core's structs.
 *
 *  `interruptible` is resolved HERE rather than left to the core, so the policy
 *  never picks a target this module would then refuse to kick. A `ccImmune` mob
 *  and any cast the player interrupt could not stop are both reported as
 *  uninterruptible. */
export function companionCasts(ctx: SimContext, self: Entity): HostileCast[] {
  const out: HostileCast[] = [];
  for (const e of ctx.entities.values()) {
    if (e.kind !== 'mob' || e.dead || e.castingAbility === null) continue;
    if (!ctx.isHostileTo(self, e)) continue;
    const distance = dist2d(self.pos, e.pos);
    if (distance > COMPANION_CAST_SCAN_RADIUS) continue;
    out.push({
      id: e.id,
      abilityId: e.castingAbility,
      castRemaining: e.castRemaining,
      castTotal: e.castTotal,
      distance,
      interruptible: e.ccImmune !== true && interruptSchoolFor(ctx, e) !== null,
    });
  }
  return out;
}

/** Kick the most dangerous catchable cast in reach, if the policy says to.
 *
 *  Returns the interrupted caster, or null when the companion held its cooldown
 *  (nothing worth stopping, everything out of reach, or the cast would finish
 *  before the kick could land). Draws no rng. */
export function tryCompanionInterrupt(ctx: SimContext, self: Entity): Entity | null {
  const cd = companionCooldownsFor(ctx, self.id);
  const state: InterruptState = {
    ready: cd.interruptReadyAt <= ctx.time,
    range: COMPANION_INTERRUPT_RANGE,
    closeSpeed: self.moveSpeed * ctx.moveSpeedMult(self),
  };
  if (!state.ready) return null;
  const plan = planInterrupt(companionCasts(ctx, self), state);
  if (!plan) return null;
  const target = ctx.entities.get(plan.targetId);
  if (!target || target.dead) return null;
  const school = interruptSchoolFor(ctx, target);
  if (school === null) return null;
  // The cooldown is spent on the decision, not on the outcome, exactly like a
  // player kick: this is what makes the policy's "is it worth it?" real.
  cd.interruptReadyAt = ctx.time + COMPANION_INTERRUPT_COOLDOWN;
  const abilityName = ABILITIES[plan.abilityId]?.name ?? 'Interrupted';
  ctx.cancelCast(target);
  const remaining = ctx.diminishedCrowdControlDuration(
    self,
    target,
    'lockout',
    COMPANION_INTERRUPT_LOCKOUT,
  );
  if (remaining !== null) {
    ctx.applyAura(target, {
      id: COMPANION_INTERRUPT_AURA_ID,
      name: abilityName,
      kind: 'lockout',
      remaining,
      duration: remaining,
      value: 0,
      sourceId: self.id,
      school,
    });
  }
  ctx.emit({ type: 'spellfx', sourceId: self.id, targetId: target.id, school, fx: 'flourish' });
  return target;
}
