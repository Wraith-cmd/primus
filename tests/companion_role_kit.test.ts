import { describe, expect, it } from 'vitest';
import {
  type CompanionRole,
  canRecruit,
  companionTemplateFor,
  DEFAULT_COMPANION_ROLES,
  type EnemyView,
  isPartyEngagement,
  kitFor,
  MAX_COMPANIONS,
  missingRoles,
  partyComposition,
  ROLE_KITS,
  resolveTarget,
  suggestNextRole,
} from '../src/sim/companions/role_kit';

const enemy = (id: number, extra: Partial<EnemyView> = {}): EnemyView => ({
  id,
  distance: 5,
  hpFrac: 1,
  attackingId: null,
  heldByTank: false,
  ...extra,
});

describe('companions assist, they do not pull', () => {
  // THE BUG: the companion brain considered EVERY hostile in range a candidate,
  // so a hired party walked into a dungeon and started fights nobody asked for.
  // A companion may act on a mob only when the mob is already fighting the
  // party, or when the owner has committed to it.
  const base = {
    ownerId: 1,
    companionIds: [2, 3, 4, 5],
    ownerTargetId: null,
    ownerInCombat: false,
  };

  it('ignores a hostile that is minding its own business', () => {
    expect(isPartyEngagement({ id: 99, attackingId: null }, base)).toBe(false);
  });

  it('defends the owner', () => {
    expect(isPartyEngagement({ id: 99, attackingId: 1 }, base)).toBe(true);
  });

  it('defends another companion', () => {
    expect(isPartyEngagement({ id: 99, attackingId: 4 }, base)).toBe(true);
  });

  it('does not pull the owner’s target on a bare tab-target', () => {
    // Merely CYCLING targets must not start a fight, or tab targeting becomes a
    // pull button.
    expect(isPartyEngagement({ id: 99, attackingId: null }, { ...base, ownerTargetId: 99 })).toBe(
      false,
    );
  });

  it('assists once the owner has actually committed', () => {
    expect(
      isPartyEngagement(
        { id: 99, attackingId: null },
        { ...base, ownerTargetId: 99, ownerInCombat: true },
      ),
    ).toBe(true);
  });

  it('still ignores an unrelated hostile while the owner fights something else', () => {
    expect(
      isPartyEngagement(
        { id: 77, attackingId: null },
        { ...base, ownerTargetId: 99, ownerInCombat: true },
      ),
    ).toBe(false);
  });
});

describe('the template complements the owner', () => {
  // THE BUG: the template was a fixed tank/healer/dps/dps regardless of who was
  // hiring, so a tank who typed /hire got a SECOND tank and ran a five man with
  // two shields and two damage dealers.
  it('does not hire a tank for a tank', () => {
    const template = companionTemplateFor('tank');
    expect(template).not.toContain('tank');
    expect(template).toEqual(['healer', 'dps', 'dps', 'dps']);
    expect(suggestNextRole([], template)).toBe('healer');
  });

  it('does not hire a healer for a healer', () => {
    const template = companionTemplateFor('healer');
    expect(template).not.toContain('healer');
    expect(suggestNextRole([], template)).toBe('tank');
  });

  it('keeps the standard group for a damage dealer', () => {
    expect(companionTemplateFor('dps')).toEqual(DEFAULT_COMPANION_ROLES);
    expect(suggestNextRole([], companionTemplateFor('dps'))).toBe('tank');
  });

  it('falls back to the standard group when the owner has no spec yet', () => {
    expect(companionTemplateFor(null)).toEqual(DEFAULT_COMPANION_ROLES);
  });

  it('still fills a whole group of four for every owner role', () => {
    for (const role of ['tank', 'healer', 'dps'] as const) {
      expect(companionTemplateFor(role)).toHaveLength(MAX_COMPANIONS);
    }
  });
});

describe('role kits', () => {
  it('gives each role a distinct job', () => {
    expect(kitFor('tank').taunts).toBe(true);
    expect(kitFor('tank').heals).toBe(false);
    expect(kitFor('healer').heals).toBe(true);
    expect(kitFor('healer').taunts).toBe(false);
    expect(kitFor('dps').heals).toBe(false);
    expect(kitFor('dps').taunts).toBe(false);
  });

  it('has exactly one role that builds threat', () => {
    const builders = (['tank', 'healer', 'dps'] as CompanionRole[]).filter(
      (r) => ROLE_KITS[r].threatPosture === 'build',
    );
    expect(builders).toEqual(['tank']);
  });

  it('makes the tank generate more threat than anyone else, with no ceiling', () => {
    expect(ROLE_KITS.tank.threatMultiplier).toBeGreaterThan(1);
    expect(ROLE_KITS.dps.threatMultiplier).toBeLessThan(1);
    expect(ROLE_KITS.healer.threatMultiplier).toBeLessThan(1);
    expect(ROLE_KITS.tank.threatCeiling).toBe(Number.POSITIVE_INFINITY);
    // A back-line role has more headroom before a mob switches to it than a
    // melee one does (130% at range vs 110% in melee).
    expect(ROLE_KITS.healer.threatCeiling).toBeGreaterThan(ROLE_KITS.dps.threatCeiling);
    expect(ROLE_KITS.dps.threatCeiling).toBeGreaterThan(1);
  });

  it('stands the healer back and the fighters in melee', () => {
    expect(ROLE_KITS.healer.preferredRange).toBeGreaterThan(ROLE_KITS.tank.preferredRange);
    expect(ROLE_KITS.dps.preferredRange).toBe(ROLE_KITS.tank.preferredRange);
  });

  it('starts the tank on peels and everyone else on assist', () => {
    expect(ROLE_KITS.tank.targetPriority[0]).toBe('attackerOfHealer');
    expect(ROLE_KITS.healer.targetPriority[0]).toBe('ownerTarget');
    expect(ROLE_KITS.dps.targetPriority[0]).toBe('ownerTarget');
  });
});

describe('party composition', () => {
  it('fills a five-man with the owner plus four', () => {
    expect(MAX_COMPANIONS).toBe(4);
    expect(DEFAULT_COMPANION_ROLES.length).toBe(MAX_COMPANIONS);
  });

  it('tallies what has been recruited', () => {
    expect(partyComposition(['dps', 'tank', 'dps'])).toEqual({
      tank: 1,
      healer: 0,
      dps: 2,
      total: 3,
    });
  });

  it('reports the gaps in fill order', () => {
    expect(missingRoles([])).toEqual(['tank', 'healer', 'dps', 'dps']);
    expect(missingRoles(['dps'])).toEqual(['tank', 'healer', 'dps']);
    expect(missingRoles(['tank', 'healer', 'dps', 'dps'])).toEqual([]);
  });

  it('counts an off-template pick as filling nothing', () => {
    // Two tanks is legal but the party is still short a tank slot's worth of
    // healing and damage.
    expect(missingRoles(['tank', 'tank'])).toEqual(['healer', 'dps', 'dps']);
  });

  it('suggests the most needed role next', () => {
    expect(suggestNextRole([])).toBe('tank');
    expect(suggestNextRole(['tank'])).toBe('healer');
    expect(suggestNextRole(['tank', 'healer'])).toBe('dps');
    expect(suggestNextRole(['tank', 'healer', 'dps', 'dps'])).toBeNull();
  });

  it('is order independent when reading an existing party', () => {
    const roles: CompanionRole[] = ['dps', 'tank', 'dps'];
    expect(missingRoles(roles)).toEqual(missingRoles([...roles].reverse()));
    expect(partyComposition(roles)).toEqual(partyComposition([...roles].reverse()));
  });
});

describe('recruiting', () => {
  const base = { atDungeonEntrance: true, inCombat: false, currentRoles: [] as CompanionRole[] };

  it('allows a hire at a dungeon entrance, out of combat, with room', () => {
    expect(canRecruit(base)).toEqual({ allowed: true, refusal: null });
  });

  it('refuses anywhere but a dungeon entrance', () => {
    expect(canRecruit({ ...base, atDungeonEntrance: false })).toEqual({
      allowed: false,
      refusal: 'notAtDungeonEntrance',
    });
  });

  it('reports the place before anything else, so the reason is stable', () => {
    const decision = canRecruit({
      atDungeonEntrance: false,
      inCombat: true,
      currentRoles: ['tank', 'healer', 'dps', 'dps'],
    });
    expect(decision.refusal).toBe('notAtDungeonEntrance');
  });

  it('refuses mid-fight', () => {
    expect(canRecruit({ ...base, inCombat: true }).refusal).toBe('inCombat');
  });

  it('refuses a fifth companion', () => {
    expect(canRecruit({ ...base, currentRoles: ['tank', 'healer', 'dps', 'dps'] }).refusal).toBe(
      'partyFull',
    );
  });
});

describe('role target selection', () => {
  it('has the tank peel whatever is on the healer, ahead of the owner target', () => {
    const enemies = [
      enemy(1, { attackingId: 99 }), // on the healer
      enemy(2), // the owner's target
    ];
    const target = resolveTarget(kitFor('tank'), enemies, {
      ownerTargetId: 2,
      healerIds: [99],
    });
    expect(target).toBe(1);
  });

  it('has the tank grab a loose attacker when the healer is safe', () => {
    const enemies = [enemy(1, { attackingId: 50 }), enemy(2)];
    expect(resolveTarget(kitFor('tank'), enemies, { ownerTargetId: 2 })).toBe(1);
  });

  it('lets the tank assist once everything is already held', () => {
    const enemies = [enemy(1, { attackingId: 50, heldByTank: true }), enemy(2)];
    expect(resolveTarget(kitFor('tank'), enemies, { ownerTargetId: 2 })).toBe(2);
  });

  it('falls back to the nearest enemy when no rule matches', () => {
    const enemies = [enemy(1, { distance: 12 }), enemy(2, { distance: 3 })];
    expect(resolveTarget(kitFor('tank'), enemies, {})).toBe(2);
  });

  it('has dps assist the owner', () => {
    const enemies = [enemy(1, { hpFrac: 0.1 }), enemy(2)];
    expect(resolveTarget(kitFor('dps'), enemies, { ownerTargetId: 2 })).toBe(2);
  });

  it('has dps finish the lowest enemy when the owner has no target', () => {
    const enemies = [enemy(1, { hpFrac: 0.8 }), enemy(2, { hpFrac: 0.2 }), enemy(3, { hpFrac: 1 })];
    expect(resolveTarget(kitFor('dps'), enemies, { ownerTargetId: null })).toBe(2);
  });

  it('ignores anything outside the role range', () => {
    const enemies = [enemy(1, { distance: 30 })];
    // The healer only acts inside its heal range; a fighter reaches much further.
    expect(resolveTarget(kitFor('healer'), enemies, {})).toBeNull();
    expect(resolveTarget(kitFor('dps'), enemies, {})).toBe(1);
  });

  it('honours a caller supplied engage range', () => {
    const enemies = [enemy(1, { distance: 30 })];
    expect(resolveTarget(kitFor('dps'), enemies, { engageRange: 10 })).toBeNull();
  });

  it('breaks a tie by distance, then by id', () => {
    const byDistance = [enemy(1, { distance: 9 }), enemy(2, { distance: 4 })];
    expect(resolveTarget(kitFor('dps'), byDistance, {})).toBe(2);
    const byId = [enemy(8), enemy(3), enemy(5)];
    expect(resolveTarget(kitFor('dps'), byId, {})).toBe(3);
  });

  it('breaks a health tie by distance for the execute rule', () => {
    const enemies = [
      enemy(1, { hpFrac: 0.2, distance: 9 }),
      enemy(2, { hpFrac: 0.2, distance: 4 }),
    ];
    expect(resolveTarget(kitFor('dps'), enemies, {})).toBe(2);
  });

  it('is order independent for every role', () => {
    const enemies = [
      enemy(4, { attackingId: 99, distance: 8 }),
      enemy(2, { attackingId: 50, hpFrac: 0.3 }),
      enemy(7, { hpFrac: 0.3, distance: 5 }),
      enemy(1, { distance: 5, heldByTank: true }),
    ];
    const ctx = { ownerTargetId: 7, healerIds: [99] };
    for (const role of ['tank', 'healer', 'dps'] as CompanionRole[]) {
      const forward = resolveTarget(kitFor(role), enemies, ctx);
      const reversed = resolveTarget(kitFor(role), [...enemies].reverse(), ctx);
      expect(reversed).toBe(forward);
      expect(forward).not.toBeNull();
    }
  });

  it('returns null with no enemies at all', () => {
    expect(resolveTarget(kitFor('tank'), [], { ownerTargetId: 3 })).toBeNull();
  });
});
