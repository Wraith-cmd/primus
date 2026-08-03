// Thin-class kit completion (2026-08): the mage / priest / shaman / paladin /
// hunter abilities added to bring those base kits up to the depth warrior and
// druid already had. Every one reuses an existing AbilityEffect kind, so these
// tests assert the WIRING (learn level, base-kit membership, resolved effect
// shape) plus the one behavior each ability actually owns.
import { describe, expect, it } from 'vitest';
import { abilitiesKnownAt } from '../src/sim/content/classes';
import { ABILITIES, CLASSES, MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Aura, Entity, PlayerClass } from '../src/sim/types';

type AnyEntity = Entity & Record<string, unknown>;

const NEW_KIT: Record<PlayerClass | string, string[]> = {
  mage: ['fire_ward', 'remove_lesser_curse', 'mana_shield'],
  priest: ['resurrection', 'inner_fire', 'holy_fire', 'dispel_magic', 'devouring_plague'],
  shaman: ['purge', 'ancestral_spirit', 'windfury_weapon', 'fire_nova', 'lesser_healing_wave'],
  paladin: ['redemption', 'blessing_of_wisdom', 'seal_of_the_crusader'],
  hunter: ['hunters_mark', 'immolation_trap'],
};

function spawnHostile(sim: Sim, level = 5, offset = 2): AnyEntity {
  const p = sim.player as AnyEntity;
  const pos = p.pos as { x: number; y: number; z: number };
  const mob = createMob(sim.nextId++, MOBS.forest_wolf, level, {
    x: pos.x + offset,
    y: pos.y,
    z: pos.z,
  }) as AnyEntity;
  mob.hostile = true;
  mob.maxHp = 100_000;
  mob.hp = mob.maxHp;
  sim.addEntity(mob as Entity);
  return mob;
}

// Auras are seeded through the real Sim seam (ctx.applyAura), so the CC-immunity
// and stacking rules the engine uses apply to the fixtures too.
function applyAura(sim: Sim, target: Entity, aura: Aura): void {
  (sim as unknown as { ctx: { applyAura(t: Entity, a: Aura): void } }).ctx.applyAura(target, aura);
}

// Settle the global cooldown (and any projectile travel) between presses.
function settle(sim: Sim, ticks = 40): void {
  for (let i = 0; i < ticks; i++) sim.tick();
  sim.player.resource = sim.player.maxResource;
}

function ready(cls: PlayerClass, level: number, seed = 991): Sim {
  const sim = new Sim({ seed, playerClass: cls, autoEquip: true });
  sim.setPlayerLevel(level);
  sim.player.resource = sim.player.maxResource;
  return sim;
}

describe('thin-class kit completion: wiring', () => {
  it('every new ability sits in its class base kit and is learned at its level', () => {
    for (const [cls, ids] of Object.entries(NEW_KIT)) {
      for (const id of ids) {
        const def = ABILITIES[id];
        expect(def, `${id} is defined`).toBeTruthy();
        expect(def.class, `${id} belongs to ${cls}`).toBe(cls);
        expect(CLASSES[cls as PlayerClass].abilities, `${cls} base kit lists ${id}`).toContain(id);
        // No spec gate: these are kit-wide, so a specless character keeps them
        // and so does every spec.
        expect(def.specs, `${id} is not spec-gated`).toBeUndefined();
        const known = abilitiesKnownAt(cls as PlayerClass, def.learnLevel).map((k) => k.def.id);
        expect(known, `${id} known at level ${def.learnLevel}`).toContain(id);
        const early = abilitiesKnownAt(cls as PlayerClass, def.learnLevel - 1).map((k) => k.def.id);
        expect(early, `${id} not known one level early`).not.toContain(id);
      }
    }
  });

  it('lifts the five thin base kits above the old rogue/warlock floor', () => {
    // The audit that drove this change: priest 10 and shaman 11 base abilities
    // against warrior 39 / druid 38. The floor to clear is rogue's 22-ability
    // kit minus its eight talent/spec grants, i.e. every thin class now carries
    // at least fifteen base abilities of its own.
    for (const cls of ['mage', 'priest', 'shaman', 'paladin', 'hunter'] as const) {
      expect(CLASSES[cls].abilities.length, `${cls} base kit size`).toBeGreaterThanOrEqual(15);
    }
  });

  it('the three resurrection rites share one shape: dead target, out of combat', () => {
    for (const id of ['resurrection', 'ancestral_spirit', 'redemption']) {
      const def = ABILITIES[id];
      expect(def.targetsDead, `${id} targets the dead`).toBe(true);
      expect(def.requiresOutOfCombat, `${id} is out-of-combat only`).toBe(true);
      expect(def.targetType).toBe('friendly');
      expect(def.effects).toEqual([{ type: 'resurrectAlly', hpFrac: 0.6 }]);
    }
  });

  it('a resurrection rite is refused in combat', () => {
    const sim = ready('priest', 12);
    const mob = spawnHostile(sim);
    (sim as unknown as { enterCombat(a: Entity, b: Entity): void }).enterCombat(
      sim.player,
      mob as Entity,
    );
    sim.drainEvents();
    sim.castAbility('resurrection');
    const errors = sim.drainEvents().filter((e) => e.type === 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(sim.player.castingAbility).toBeNull();
  });
});

describe('priest kit completion', () => {
  it('Emberfaith raises armor and ranks up at 20', () => {
    const sim = ready('priest', 12);
    const armorBefore = sim.player.stats.armor;
    sim.castAbility('inner_fire');
    const aura = sim.player.auras.find((a) => a.id === 'inner_fire');
    expect(aura?.kind).toBe('buff_armor');
    expect(aura?.value).toBe(120);
    expect(sim.player.stats.armor).toBe(armorBefore + 120);

    const capped = ready('priest', 20, 992);
    capped.castAbility('inner_fire');
    expect(capped.player.auras.find((a) => a.id === 'inner_fire')?.value).toBe(220);
  });

  it('Kindled Wrath lands a direct hit and leaves a burn', () => {
    const sim = ready('priest', 18);
    const mob = spawnHostile(sim);
    sim.targetEntity(mob.id as number);
    sim.castAbility('holy_fire');
    settle(sim, 80); // the 2 sec cast plus the holy bolt's travel
    expect(mob.hp as number).toBeLessThan(mob.maxHp as number);
    expect(
      (mob.auras as Entity['auras']).some((a) => a.id === 'holy_fire' && a.kind === 'dot'),
    ).toBe(true);
  });

  it('Wasting Blight leeches its tick damage back to the priest', () => {
    const sim = ready('priest', 20);
    const mob = spawnHostile(sim);
    sim.targetEntity(mob.id as number);
    sim.player.hp = Math.max(1, Math.floor(sim.player.maxHp / 2));
    sim.castAbility('devouring_plague');
    settle(sim, 20); // instant, but the shadow bolt still has to land
    expect((mob.auras as Entity['auras']).find((a) => a.id === 'devouring_plague')?.kind).toBe(
      'dot',
    );
    // Read the leech off the emitted heals rather than the health bar: the
    // wolf is hitting back, so raw HP is not a clean signal.
    let leeched = 0;
    for (let i = 0; i < 140; i++) {
      for (const ev of sim.tick()) {
        if (
          ev.type === 'heal2' &&
          ev.targetId === sim.player.id &&
          ev.ability === 'Wasting Blight'
        ) {
          leeched += ev.amount;
        }
      }
    }
    expect(mob.hp as number).toBeLessThan(mob.maxHp as number);
    expect(leeched).toBeGreaterThan(0);
  });

  it('Unbinding Word strips two harmful magic effects from an ally', () => {
    const sim = ready('priest', 18);
    const allyId = sim.addPlayer('warrior', 'Dispel Target');
    const ally = sim.entities.get(allyId);
    if (!ally) throw new Error('missing dispel target');
    for (const id of ['curse_a', 'curse_b', 'curse_c']) {
      applyAura(sim, ally, {
        id,
        name: id,
        kind: 'dot',
        remaining: 60,
        duration: 60,
        value: 1,
        sourceId: sim.player.id,
        school: 'shadow',
      });
    }
    sim.targetEntity(allyId);
    sim.castAbility('dispel_magic');
    settle(sim, 20);
    expect(ally.auras.filter((a) => a.id.startsWith('curse_'))).toHaveLength(1);
  });
});

describe('shaman kit completion', () => {
  it('leaves Ancestral Strike as the Enhancement signature (doc vs code)', () => {
    // docs/design/spell-ranks.md lists stormstrike@20 as a shaman BASE ability,
    // but the shipped design made it the Enhancement spec signature and
    // tests/spec_signatures.test.ts pins that exclusivity. Code wins over the
    // doc: this pin records the deliberate deviation so a later reading of
    // spell-ranks.md does not "fix" it back.
    expect(CLASSES.shaman.abilities).not.toContain('stormstrike');
    expect(ABILITIES.stormstrike.learnLevel).toBe(20);
  });

  it('Windscour strips a beneficial effect off an enemy', () => {
    const sim = ready('shaman', 12);
    const mob = spawnHostile(sim);
    applyAura(sim, mob as Entity, {
      id: 'mob_hardening',
      name: 'Hardening',
      kind: 'buff_armor',
      remaining: 60,
      duration: 60,
      value: 50,
      sourceId: mob.id as number,
      school: 'nature',
    });
    sim.targetEntity(mob.id as number);
    sim.castAbility('purge');
    settle(sim, 20);
    expect((mob.auras as Entity['auras']).some((a) => a.id === 'mob_hardening')).toBe(false);
  });

  it('Emberburst sears every enemy around the shaman with no target required', () => {
    const sim = ready('shaman', 18);
    expect(ABILITIES.fire_nova.requiresTarget).toBe(false);
    const near = spawnHostile(sim, 5, 3);
    const far = spawnHostile(sim, 5, 40);
    sim.castAbility('fire_nova');
    for (let i = 0; i < 10; i++) sim.tick();
    expect(near.hp as number).toBeLessThan(near.maxHp as number);
    expect(far.hp as number).toBe(far.maxHp as number);
  });

  it('Galebrand Weapon is the strongest shaman imbue and refreshes the imbue slot', () => {
    const sim = ready('shaman', 16);
    sim.castAbility('windfury_weapon');
    const imbue = sim.player.auras.find((a) => a.kind === 'imbue');
    expect(imbue?.id).toBe('windfury_weapon');
    expect(imbue?.value).toBe(16);
    const rockbiter = ABILITIES.rockbiter_weapon.ranks?.at(-1)?.effects[0];
    expect(rockbiter?.type).toBe('imbue');
    if (rockbiter?.type === 'imbue') expect(imbue?.value).toBeGreaterThan(rockbiter.bonus);
  });

  // Being the strongest is intended. Being strongest AND cheapest at the same learn
  // level is not: it made Stonebound R3 dead content the moment it became trainable,
  // because all four imbues feed the same flat imbueBonus and there is no
  // compensating niche. The assertion above only pinned "stronger", which is exactly
  // how that shipped, so pin the TRADEOFF too: the premium imbue must cost more than
  // the workhorse it competes with, or there is no choice to make.
  it('Galebrand costs more than the Stonebound rank it competes with', () => {
    const rockbiterR3 = ABILITIES.rockbiter_weapon.ranks?.at(-1);
    const galebrandR2 = ABILITIES.windfury_weapon.ranks?.at(-1);
    expect(rockbiterR3).toBeDefined();
    expect(galebrandR2).toBeDefined();
    // Base ranks: both reachable at the same level, so price is the whole decision.
    expect(ABILITIES.windfury_weapon.cost).toBeGreaterThan(rockbiterR3?.cost ?? 0);
    // And the top rank stays the expensive one.
    expect(galebrandR2?.cost ?? 0).toBeGreaterThan(rockbiterR3?.cost ?? 0);
    // Mana EFFICIENCY should favour the cheap workhorse, which is what makes it a
    // real choice rather than a strictly worse button.
    const rbEff = (rockbiterR3?.effects[0] as { bonus: number }).bonus / (rockbiterR3?.cost ?? 1);
    const wfEff =
      (ABILITIES.windfury_weapon.effects[0] as { bonus: number }).bonus /
      ABILITIES.windfury_weapon.cost;
    expect(rbEff).toBeGreaterThan(wfEff);
  });

  it('Quickening Waters is the shaman fast heal', () => {
    const sim = ready('shaman', 20);
    const def = ABILITIES.lesser_healing_wave;
    expect(def.castTime).toBe(1.5);
    // Faster than the level-20 rank of the big wave (2.5 sec), which is the point.
    expect(def.castTime).toBeLessThan(ABILITIES.healing_wave.ranks?.at(-1)?.castTime ?? 0);
    sim.player.hp = 1;
    sim.castAbility('lesser_healing_wave');
    settle(sim, 60);
    expect(sim.player.hp).toBeGreaterThan(1);
  });
});

describe('mage kit completion', () => {
  it('Emberward and Aetherguard are class-wide absorbs (the barriers are spec-gated)', () => {
    for (const id of ['fire_ward', 'mana_shield']) {
      expect(ABILITIES[id].specs, `${id} is not spec-gated`).toBeUndefined();
    }
    for (const id of ['ice_barrier', 'blazing_barrier', 'temporal_barrier']) {
      expect(ABILITIES[id].specs, `${id} stays spec-gated`).toBeTruthy();
    }
    const sim = ready('mage', 20);
    expect(sim.setSpec('fire')).toBe(true);
    sim.player.resource = sim.player.maxResource;
    sim.castAbility('fire_ward');
    expect(sim.player.auras.find((a) => a.id === 'fire_ward')?.kind).toBe('absorb');
    settle(sim, 40); // clear the global cooldown before the second press
    sim.castAbility('mana_shield');
    const shield = sim.player.auras.find((a) => a.id === 'mana_shield');
    expect(shield?.kind).toBe('absorb');
    expect(shield?.value).toBeGreaterThanOrEqual(220);
  });

  it('Hexbreak gives the mage its only dispel', () => {
    const sim = ready('mage', 18);
    applyAura(sim, sim.player, {
      id: 'test_hex',
      name: 'Hex',
      kind: 'dot',
      remaining: 60,
      duration: 60,
      value: 1,
      sourceId: sim.player.id,
      school: 'shadow',
    });
    sim.castAbility('remove_lesser_curse');
    settle(sim, 20);
    expect(sim.player.auras.some((a) => a.id === 'test_hex')).toBe(false);
  });
});

describe('paladin kit completion', () => {
  it('Zealbrand trades swing damage for a far heavier Verdict', () => {
    const zeal = ABILITIES.seal_of_the_crusader.effects[0];
    const oath = ABILITIES.seal_of_righteousness.ranks?.at(-1)?.effects[0];
    expect(zeal.type).toBe('imbue');
    expect(oath?.type).toBe('imbue');
    if (zeal.type !== 'imbue' || oath?.type !== 'imbue') throw new Error('imbue shape changed');
    expect(zeal.bonus).toBeLessThan(oath.bonus);
    expect(zeal.judgeMin ?? 0).toBeGreaterThan(oath.judgeMin ?? 0);
    expect(zeal.judgeMax ?? 0).toBeGreaterThan(oath.judgeMax ?? 0);
  });

  it('Zealbrand replaces Oathbrand in the imbue slot and Verdict consumes it', () => {
    const sim = ready('paladin', 16);
    sim.castAbility('seal_of_righteousness');
    expect(sim.player.auras.find((a) => a.kind === 'imbue')?.id).toBe('seal_of_righteousness');
    settle(sim, 40); // clear the global cooldown before the second seal
    sim.castAbility('seal_of_the_crusader');
    const imbues = sim.player.auras.filter((a) => a.kind === 'imbue');
    expect(imbues).toHaveLength(1);
    expect(imbues[0].id).toBe('seal_of_the_crusader');
  });

  it('Oath of Insight blesses the party with a resource trickle', () => {
    const sim = ready('paladin', 14);
    sim.castAbility('blessing_of_wisdom');
    const aura = sim.player.auras.find((a) => a.id === 'blessing_of_wisdom');
    expect(aura?.kind).toBe('resource_sap');
    expect(aura?.value).toBe(6);
    expect(aura?.duration).toBe(1800);
  });
});

describe('hunter kit completion', () => {
  it('Quarry Mark makes the target take more damage from everyone', () => {
    const sim = ready('hunter', 6);
    const mob = spawnHostile(sim);
    sim.targetEntity(mob.id as number);
    sim.castAbility('hunters_mark');
    settle(sim, 20);
    const mark = (mob.auras as Entity['auras']).find((a) => a.id === 'hunters_mark_vulnerability');
    expect(mark?.kind).toBe('vulnerability');
    expect(mark?.value).toBeCloseTo(0.05, 5);
    expect(mark?.duration).toBe(120);
  });

  it('Scorchsnare is a ground-aimed fire zone', () => {
    const def = ABILITIES.immolation_trap;
    expect(def.targetMode).toBe('position');
    expect(def.scalesWith).toBe('ranged');
    const sim = ready('hunter', 16);
    const mob = spawnHostile(sim, 5, 2);
    const pos = mob.pos as { x: number; z: number };
    sim.castAbility('immolation_trap', undefined, { x: pos.x, z: pos.z });
    for (let i = 0; i < 60; i++) sim.tick();
    expect(mob.hp as number).toBeLessThan(mob.maxHp as number);
  });
});
