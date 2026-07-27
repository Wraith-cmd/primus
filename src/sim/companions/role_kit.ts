// Companion role kits: what "tank", "healer" and "dps" mean mechanically.
//
// The single delve companion has no role. She melees the owner's target and
// heals, because that is all one companion can do. A party of four has to divide
// the work: one holds the pull, one keeps everyone alive, two burn the target
// down, and each of them wants something different out of the same fight. Every
// downstream behaviour (who to attack, whether to taunt, how close to stand, how
// much threat to make) asks the same three questions of the role, so the role is
// worth being a real data record instead of scattered `if (isTank)` branches.
//
// This module is data-as-code plus small pure resolvers. It picks targets and
// answers questions ABOUT a role; it never moves anything, casts anything, or
// touches the world. The behaviour modules (ground avoidance, interrupt policy,
// heal triage) stay independent of it and are composed by the caller.
//
// Recruiting is deliberately gated: the owner assembles the party at a DUNGEON
// ENTRANCE, not mid-pull and not in the open world. `canRecruit` is where that
// rule lives, so every caller enforces it the same way.
//
// Pure leaf: no SimContext, no Entity, no rng, no clock. Numbers come from the
// existing classic-era tuning constants rather than being invented here.

import {
  CAT_FORM_THREAT_MULT,
  DEFENSIVE_STANCE_THREAT_MULT,
  HEAL_THREAT_FACTOR,
  MELEE_SWITCH_MULT,
  RANGED_SWITCH_MULT,
} from '../threat';
import { MELEE_RANGE } from '../types';

export type CompanionRole = 'tank' | 'healer' | 'dps';

/** Every role, in the order a party is filled. Also the canonical iteration
 *  order wherever roles are enumerated, so readouts never wobble. */
export const COMPANION_ROLES: readonly CompanionRole[] = ['tank', 'healer', 'dps'];

/** What the role wants its threat to do.
 *  - `build`: wants to be at the top of every hate table and taunts to get back
 *    there. The tank, and only the tank.
 *  - `shed`: actively stays under the tank; the classic threat ceiling below is
 *    the number it plays against.
 *  - `hold`: neither, for a companion that should simply keep doing its thing
 *    (no role uses it yet; it exists so "no threat opinion" is expressible
 *    without overloading `shed`). */
export type ThreatPosture = 'build' | 'shed' | 'hold';

/** One rule in a role's target priority, evaluated in order, first match wins.
 *  - `attackerOfHealer`: something is hitting the healer. Peel it, now.
 *  - `looseAttacker`: something is hitting an ally that the tank does not hold.
 *  - `ownerTarget`: whatever the owner is fighting (assist, the classic default).
 *  - `lowestHealthEnemy`: finish what is nearly dead before it gets a cast off.
 *  - `nearestEnemy`: the fallback so a role is never left with nothing to do. */
export type TargetRule =
  | 'attackerOfHealer'
  | 'looseAttacker'
  | 'ownerTarget'
  | 'lowestHealthEnemy'
  | 'nearestEnemy';

export interface RoleKit {
  role: CompanionRole;
  /** Ordered priority list; the first rule with any match decides the target. */
  targetPriority: readonly TargetRule[];
  /** Uses taunt to pull something back off an ally. */
  taunts: boolean;
  /** Runs the heal triage core at all. */
  heals: boolean;
  threatPosture: ThreatPosture;
  /** Stance-style multiplier on the threat this role generates. */
  threatMultiplier: number;
  /** The multiple of the tank's threat at which this role would rip the mob off
   *  the tank, so the line a `shed` role plays under. Infinite for the tank,
   *  which has no ceiling to respect. */
  threatCeiling: number;
  /** Distance the role wants to stand from its target, world units. */
  preferredRange: number;
  /** Furthest the role will act from: engage range for a fighter, heal range
   *  for the healer. */
  maxRange: number;
}

// Melee reach the delve companion already closes to (delves/companion.ts uses
// MELEE_RANGE * 0.9 so it is comfortably inside the swing arc rather than
// dancing on the edge of it).
const MELEE_STAND_RANGE = MELEE_RANGE * 0.9;
// The healer stands off, inside its heal range with room to move without
// dropping the party (the delve companion heals out to 22).
const HEAL_RANGE = 22;
const HEALER_STAND_RANGE = 18;
// How far a fighter will go looking for something to hit. Mirrors the scan
// radius the delve companion already uses when the owner has no target.
const ENGAGE_RANGE = 40;

/** The kits. Data, not behaviour: a resolver reads these, nothing mutates them. */
export const ROLE_KITS: Readonly<Record<CompanionRole, RoleKit>> = {
  tank: {
    role: 'tank',
    // Peel first, hold second, assist last: a tank that just assists the owner is
    // a dps in plate, and the healer dies behind it.
    targetPriority: ['attackerOfHealer', 'looseAttacker', 'ownerTarget', 'nearestEnemy'],
    taunts: true,
    heals: false,
    threatPosture: 'build',
    threatMultiplier: DEFENSIVE_STANCE_THREAT_MULT,
    threatCeiling: Number.POSITIVE_INFINITY,
    preferredRange: MELEE_STAND_RANGE,
    maxRange: ENGAGE_RANGE,
  },
  healer: {
    role: 'healer',
    // It fights only when nobody needs healing, so it simply assists.
    targetPriority: ['ownerTarget', 'nearestEnemy'],
    taunts: false,
    heals: true,
    threatPosture: 'shed',
    // Classic pays 0.5 threat per point of effective healing, so a healer's
    // output is already halved before any stance enters into it.
    threatMultiplier: HEAL_THREAT_FACTOR,
    // At range a mob only switches at 130% of the tank's threat, so a back-line
    // role has that much headroom before it pulls.
    threatCeiling: RANGED_SWITCH_MULT,
    preferredRange: HEALER_STAND_RANGE,
    maxRange: HEAL_RANGE,
  },
  dps: {
    role: 'dps',
    targetPriority: ['ownerTarget', 'lowestHealthEnemy', 'nearestEnemy'],
    taunts: false,
    heals: false,
    threatPosture: 'shed',
    threatMultiplier: CAT_FORM_THREAT_MULT,
    // In melee the switch happens at 110%, so a melee dps has less room than the
    // healer does.
    threatCeiling: MELEE_SWITCH_MULT,
    preferredRange: MELEE_STAND_RANGE,
    maxRange: ENGAGE_RANGE,
  },
};

export function kitFor(role: CompanionRole): RoleKit {
  return ROLE_KITS[role];
}

/** A full group is five, the owner included. */
export const DUNGEON_PARTY_SIZE = 5;
/** So the owner can recruit four. */
export const MAX_COMPANIONS = DUNGEON_PARTY_SIZE - 1;
/** The composition a five-man is filled toward, in fill order. */
export const DEFAULT_COMPANION_ROLES: readonly CompanionRole[] = ['tank', 'healer', 'dps', 'dps'];

export interface PartyComposition {
  tank: number;
  healer: number;
  dps: number;
  total: number;
}

/** Count the roles already recruited. Order independent: it is a tally. */
export function partyComposition(roles: readonly CompanionRole[]): PartyComposition {
  const counts: PartyComposition = { tank: 0, healer: 0, dps: 0, total: 0 };
  for (const role of roles) {
    counts[role]++;
    counts.total++;
  }
  return counts;
}

/** Which roles the party still wants, in fill order. Extra picks beyond the
 *  template (a second tank) are simply not counted as filling anything, so the
 *  gaps they leave still show up here. */
export function missingRoles(
  roles: readonly CompanionRole[],
  template: readonly CompanionRole[] = DEFAULT_COMPANION_ROLES,
): CompanionRole[] {
  const have = partyComposition(roles);
  const remaining: Record<CompanionRole, number> = {
    tank: have.tank,
    healer: have.healer,
    dps: have.dps,
  };
  const gaps: CompanionRole[] = [];
  for (const role of template) {
    if (remaining[role] > 0) remaining[role]--;
    else gaps.push(role);
  }
  return gaps;
}

/** The role the party most needs next, or null when the template is satisfied
 *  (or there is no room left). Deterministic: it is the first gap in fill
 *  order, never a preference poll. */
export function suggestNextRole(
  roles: readonly CompanionRole[],
  template: readonly CompanionRole[] = DEFAULT_COMPANION_ROLES,
): CompanionRole | null {
  if (roles.length >= MAX_COMPANIONS) return null;
  return missingRoles(roles, template)[0] ?? null;
}

/** Why a recruit attempt was refused. null in `RecruitDecision` means allowed. */
export type RecruitRefusal = 'notAtDungeonEntrance' | 'inCombat' | 'partyFull';

export interface RecruitContext {
  /** The owner is standing at a dungeon entrance. The party is assembled there
   *  and nowhere else: no summoning a tank mid-pull, no open-world posse. */
  atDungeonEntrance: boolean;
  /** Companions are hired between fights, not during one. */
  inCombat: boolean;
  /** Roles already recruited. */
  currentRoles: readonly CompanionRole[];
}

export interface RecruitDecision {
  allowed: boolean;
  refusal: RecruitRefusal | null;
}

/** Whether the owner may recruit another companion right now.
 *
 *  Refusal reasons are checked in a fixed order (place, then combat, then room)
 *  so the same situation always reports the same reason. The reason is an id,
 *  not a sentence: player-facing text belongs at the emit site. */
export function canRecruit(ctx: RecruitContext): RecruitDecision {
  if (!ctx.atDungeonEntrance) return { allowed: false, refusal: 'notAtDungeonEntrance' };
  if (ctx.inCombat) return { allowed: false, refusal: 'inCombat' };
  if (ctx.currentRoles.length >= MAX_COMPANIONS) return { allowed: false, refusal: 'partyFull' };
  return { allowed: true, refusal: null };
}

/** One hostile as a role resolver sees it. Flattened off an entity by the
 *  caller so this core stays testable with plain numbers. */
export interface EnemyView {
  id: number;
  /** Distance from the companion, world units. */
  distance: number;
  /** Current health as a fraction of max, 0..1. */
  hpFrac: number;
  /** The ally this enemy is currently attacking (`Entity.aggroTargetId`), or
   *  null when it is not engaged with anyone. */
  attackingId: number | null;
  /** True when the party's tank already holds this enemy's attention, so nobody
   *  needs to peel it. */
  heldByTank: boolean;
}

export interface TargetContext {
  /** What the owner is fighting, for the assist rule. */
  ownerTargetId?: number | null;
  /** Party members that must not be left tanking anything. */
  healerIds?: readonly number[];
  /** Overrides the kit's `maxRange` when the caller knows better. */
  engageRange?: number;
}

function matchesRule(rule: TargetRule, enemy: EnemyView, ctx: TargetContext): boolean {
  switch (rule) {
    case 'attackerOfHealer':
      return enemy.attackingId !== null && (ctx.healerIds ?? []).includes(enemy.attackingId);
    case 'looseAttacker':
      return enemy.attackingId !== null && !enemy.heldByTank;
    case 'ownerTarget':
      return ctx.ownerTargetId !== null && ctx.ownerTargetId !== undefined
        ? enemy.id === ctx.ownerTargetId
        : false;
    case 'lowestHealthEnemy':
      return true;
    case 'nearestEnemy':
      return true;
  }
}

// What each rule sorts its matches by, lower first. Distance is the sensible
// default; only the execute rule cares about health.
function rulePrimary(rule: TargetRule, enemy: EnemyView): number {
  if (rule === 'lowestHealthEnemy') return enemy.hpFrac;
  return enemy.distance;
}

/** Pick what this role should be hitting.
 *
 *  Walks the kit's priority list in order and returns the best match for the
 *  first rule that matches anything, so a tank abandons a rule-4 fallback the
 *  moment a rule-1 peel appears. Ties inside a rule go to the closer enemy, then
 *  to the lower id, so the answer never depends on the order the enemies were
 *  scanned in. Returns null when nothing is in range. */
export function resolveTarget(
  kit: RoleKit,
  enemies: readonly EnemyView[],
  ctx: TargetContext = {},
): number | null {
  const range = ctx.engageRange ?? kit.maxRange;
  for (const rule of kit.targetPriority) {
    let best: EnemyView | null = null;
    let bestPrimary = 0;
    for (const enemy of enemies) {
      if (enemy.distance > range) continue;
      if (!matchesRule(rule, enemy, ctx)) continue;
      const primary = rulePrimary(rule, enemy);
      if (best === null) {
        best = enemy;
        bestPrimary = primary;
        continue;
      }
      if (primary !== bestPrimary) {
        if (primary < bestPrimary) {
          best = enemy;
          bestPrimary = primary;
        }
        continue;
      }
      if (enemy.distance !== best.distance) {
        if (enemy.distance < best.distance) best = enemy;
        continue;
      }
      if (enemy.id < best.id) best = enemy;
    }
    if (best !== null) return best.id;
  }
  return null;
}
