// Classic-MMO-style threat. Values follow the community-verified classic-era
// research (Kenco's threat research / the classic warrior threat tables):
//  - threat = (damage * abilityMult + flat bonus) * stance/form modifiers
//  - Defensive Stance multiplies threat by 1.3 and Cat Form by 0.71, Righteous
//    Fury multiplies HOLY damage threat by 1.6; Bruin Form is the Legion-era
//    outlier and carries its whole budget passively (see BEAR_FORM_THREAT_MULT)
//  - each point of effective healing = 0.5 threat, split among all enemies
//    in combat with the healer's party
//  - a mob switches targets only when an attacker in melee range exceeds
//    110% of the current target's threat, or 130% at range
//  - Taunt/Growl set the caster's threat to the table's top value and force
//    the mob to attack the caster for 3 seconds
import type { Entity } from './types';
import { dist2d } from './types';

export const MELEE_SWITCH_MULT = 1.1;
// Boss-summoned adds spawn with this much threat on the boss's current target
// (the tank): enough that normal healing cannot peel a fresh wave, low enough
// that sustained DPS focus still rips one loose. Consumed by Sim.spawnBossAdds
// (the five-man summoners) AND the Nythraxis encounter-script spawners, so the
// two paths cannot drift. Pinned by tests/summon_threat_seed.test.ts.
export const SUMMONED_ADD_THREAT_SEED = 750;
export const RANGED_SWITCH_MULT = 1.3;
export const HEAL_THREAT_FACTOR = 0.5;
export const DEFENSIVE_STANCE_THREAT_MULT = 1.3;
// Bruin Form is the one LEGION-era tank kit in the game (the warrior and paladin
// stay on the classic 1.3 / 1.6 numbers above). In Legion, Guardian rage buys
// MITIGATION (Ironpelt, Savage Mending), not aggro, so the form has to carry the
// whole threat budget by itself instead of being topped up by Bonecrush spam.
// 4.0 is deliberately not Legion's literal 750%: it reproduces the DESIGN (rage
// is free for defence, threat is not something the tank thinks about) while
// staying in the same universe as the other two tank kits and the 110%/130%
// pull-over thresholds, which a 7.5x would turn into noise. Roughly: 1.3x plus
// the ~2.5x a Bonecrush-every-swing rotation used to add, plus headroom.
export const BEAR_FORM_THREAT_MULT = 4.0;
export const CAT_FORM_THREAT_MULT = 0.71;
export const RIGHTEOUS_FURY_THREAT_MULT = 1.6; // holy school only
export const TAUNT_FORCE_SECONDS = 3;
// Stealth shrinks detection at equal level; higher-level observers pierce it
// more easily, lower-level observers struggle. Shared by mobs and players.
export const STEALTH_DETECTION_MULT = 0.25;
export const STEALTH_DETECTION_PER_LEVEL = 0.08;
export const STEALTH_DETECTION_MIN_MULT = 0.1;
export const STEALTH_DETECTION_MAX_MULT = 1;

/** Stance/form threat modifier for everything `source` does (flat bonus
 *  threat included, as in classic). School-specific modifiers (Righteous
 *  Fury) only apply to matching damage. */
export function threatModifier(source: Entity, school: string): number {
  let mod = 1;
  for (const a of source.auras) {
    if (a.kind === 'defensive_stance') mod *= DEFENSIVE_STANCE_THREAT_MULT;
    else if (a.kind === 'form_bear') mod *= BEAR_FORM_THREAT_MULT;
    else if (a.kind === 'form_cat') mod *= CAT_FORM_THREAT_MULT;
    else if (a.kind === 'righteous_fury' && school === 'holy') mod *= RIGHTEOUS_FURY_THREAT_MULT;
  }
  return mod;
}

export function stealthDetectionMultiplier(observerLevel: number, stealthedLevel: number): number {
  const raw =
    STEALTH_DETECTION_MULT + (observerLevel - stealthedLevel) * STEALTH_DETECTION_PER_LEVEL;
  return Math.max(STEALTH_DETECTION_MIN_MULT, Math.min(STEALTH_DETECTION_MAX_MULT, raw));
}

export function stealthDetectionRadius(
  observer: Entity,
  stealthed: Entity,
  baseRadius: number,
): number {
  return baseRadius * stealthDetectionMultiplier(observer.level, stealthed.level);
}

export function canDetectStealthedTarget(
  observer: Entity,
  target: Entity,
  baseRadius: number,
): boolean {
  if (!target.auras.some((a) => a.kind === 'stealth')) return true;
  return dist2d(observer.pos, target.pos) <= stealthDetectionRadius(observer, target, baseRadius);
}

export function addThreat(mob: Entity, sourceId: number, amount: number): void {
  if (mob.dead || amount <= 0) return;
  mob.threat.set(sourceId, (mob.threat.get(sourceId) ?? 0) + amount);
}

export function clearThreat(mob: Entity): void {
  mob.threat.clear();
  mob.forcedTargetId = null;
  mob.forcedTargetTimer = 0;
}

/** Remove ONE attacker from the hate table (they left the instance or otherwise
 *  stopped existing for this mob). A taunt lock (forcedTargetId) pointing at
 *  that attacker is released with the entry. */
export function dropThreat(mob: Entity, sourceId: number): void {
  mob.threat.delete(sourceId);
  if (mob.forcedTargetId === sourceId) {
    mob.forcedTargetId = null;
    mob.forcedTargetTimer = 0;
  }
}

/** Highest threat value on the table (0 when empty) — taunt matches this. */
export function topThreatValue(mob: Entity): number {
  let top = 0;
  for (const v of mob.threat.values()) if (v > top) top = v;
  return top;
}

/** Top-N table entries, highest first, for the wire / meters. */
export function threatEntries(mob: Entity, limit: number): [number, number][] {
  return [...mob.threat.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, t]) => [id, Math.round(t)]);
}
