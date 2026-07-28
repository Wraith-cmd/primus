// The Legion-era Guardian Druid kit: two rage GENERATORS (Ravage, Rending Storm)
// feeding two rage SPENDERS that buy mitigation instead of aggro (Ironpelt,
// Savage Mending), with the threat budget carried passively by Bruin Form.
// Covers the two new ability-effect kinds (`stackingSelfBuff`, `recentDamageHeal`),
// the bear-form gate, and the tick-driven damage-taken window behind Savage Mending.
import { describe, expect, it } from 'vitest';
import { INDEPENDENT_STACK_SEPARATOR } from '../src/sim/combat/aura_stacking';
import { ABILITIES, CLASSES } from '../src/sim/content/classes';
import { Sim } from '../src/sim/sim';
import { BEAR_FORM_THREAT_MULT, threatModifier } from '../src/sim/threat';
import type { Entity, SimEvent } from '../src/sim/types';
import { placePlayerInOpenField } from './helpers/open_field';

const IRONFUR_STACK_PREFIX = `ironfur${INDEPENDENT_STACK_SEPARATOR}`;
const IRONFUR_CAP = 4;
const IRONFUR_DURATION = 7;
// Savage Mending: 50% of the damage taken in the last 5 sec, floored at 5% max HP.
const SAVAGE_MENDING_FLOOR_PCT = 0.05;

function makeSim(seed = 42) {
  return new Sim({ seed, playerClass: 'druid', autoEquip: true });
}

/** A level-20 druid parked in the empty test lane, in Bruin Form, off the GCD. */
function bearDruid(sim: Sim): Entity {
  sim.setPlayerLevel(20);
  placePlayerInOpenField(sim);
  sim.castAbility('bear_form');
  for (let i = 0; i < 40; i++) sim.tick();
  const p = sim.player;
  expect(p.auras.some((a) => a.kind === 'form_bear')).toBe(true);
  expect(p.resourceType).toBe('rage');
  return p;
}

/** A caster-form level-20 druid in the same lane (the out-of-form control). */
function casterDruid(sim: Sim): Entity {
  sim.setPlayerLevel(20);
  placePlayerInOpenField(sim);
  for (let i = 0; i < 40; i++) sim.tick();
  const p = sim.player;
  expect(p.auras.some((a) => a.kind === 'form_bear')).toBe(false);
  return p;
}

/** Park a beefed-up mob in melee range and let the spatial grid re-bucket it, so
 *  the radius queries an AoE sweep runs actually see it. */
function meleeDummy(sim: Sim): Entity {
  const p = sim.player;
  let dummy: Entity | null = null;
  for (const e of sim.entities.values()) {
    if (e.kind === 'mob' && !e.dead && e.ownerId === null) {
      dummy = e;
      break;
    }
  }
  if (!dummy) throw new Error('test fixture needs a mob to park');
  dummy.pos = { x: p.pos.x + 2, y: p.pos.y, z: p.pos.z };
  dummy.prevPos = { ...dummy.pos };
  dummy.maxHp = 100000;
  dummy.hp = 100000;
  sim.tick();
  p.targetId = dummy.id;
  p.facing = Math.atan2(dummy.pos.x - p.pos.x, dummy.pos.z - p.pos.z);
  p.gcdRemaining = 0;
  return dummy;
}

function ironfurStacks(p: Entity) {
  return p.auras.filter((a) => a.id.startsWith(IRONFUR_STACK_PREFIX));
}

function errorTexts(events: SimEvent[]): string[] {
  return events.filter((e) => e.type === 'error').map((e) => (e as { text: string }).text);
}

/** Total REAL healing Savage Mending delivered, read off the emitted heal events.
 *  The zero-amount `cueOnly` heal2 the HoT application emits for the client sound
 *  is filtered out, so this is the healing that actually landed. */
function collectSavageMendingHealing(sim: Sim, ticks: number): number {
  let total = 0;
  for (let i = 0; i < ticks; i++) {
    for (const ev of sim.tick()) {
      if (ev.type === 'heal2' && ev.abilityId === 'frenzied_regeneration' && ev.amount > 0)
        total += ev.amount;
    }
  }
  return total;
}

describe('guardian druid kit definitions', () => {
  it('registers the four Legion Guardian abilities as bear-only druid spells', () => {
    for (const id of ['mangle', 'thrash', 'ironfur', 'frenzied_regeneration'] as const) {
      const def = ABILITIES[id];
      expect(def, `${id} missing from ABILITIES`).toBeTruthy();
      expect(def.class).toBe('druid');
      expect(def.requiresForm).toBe('bear');
      expect(CLASSES.druid.abilities).toContain(id);
    }
    // The generators are free, the mitigation spenders are what rage buys.
    expect(ABILITIES.mangle.cost).toBe(0);
    expect(ABILITIES.thrash.cost).toBe(0);
    expect(ABILITIES.ironfur.cost).toBeGreaterThan(0);
    expect(ABILITIES.frenzied_regeneration.cost).toBeGreaterThan(0);
  });
});

describe('guardian druid rage generators', () => {
  it('Ravage generates rage on a target in Bruin Form', () => {
    const sim = makeSim();
    const p = bearDruid(sim);
    const dummy = meleeDummy(sim);
    const gain = ABILITIES.mangle.effects.find((e) => e.type === 'gainResource');
    expect(gain).toBeTruthy();
    p.resource = 0;
    sim.castAbility('mangle');
    // Read before the tick advances: nothing else (mob swings, regen) has moved
    // the rage bar yet, so this is Ravage's contribution exactly.
    expect(p.resource).toBe((gain as { amount: number }).amount);
    expect(p.resource).toBeGreaterThan(0);
    const events = sim.tick();
    expect(
      events.some(
        (e) =>
          e.type === 'damage' && e.targetId === dummy.id && e.ability === ABILITIES.mangle.name,
      ),
    ).toBe(true);
  });

  it('Rending Storm generates rage and bleeds everything it sweeps', () => {
    const sim = makeSim();
    const p = bearDruid(sim);
    const dummy = meleeDummy(sim);
    const gain = ABILITIES.thrash.effects.find((e) => e.type === 'gainResource');
    expect(gain).toBeTruthy();
    p.resource = 0;
    sim.castAbility('thrash');
    expect(p.resource).toBe((gain as { amount: number }).amount);
    expect(p.resource).toBeGreaterThan(0);
    const events = sim.tick();
    expect(
      events.some(
        (e) =>
          e.type === 'damage' && e.targetId === dummy.id && e.ability === ABILITIES.thrash.name,
      ),
    ).toBe(true);
    expect(dummy.auras.some((a) => a.id === 'thrash_bleed' && a.kind === 'dot')).toBe(true);
  });
});

describe('guardian druid bear-form gate', () => {
  it('refuses all four abilities outside Bruin Form and charges nothing', () => {
    const sim = makeSim();
    const p = casterDruid(sim);
    for (const id of ['mangle', 'thrash', 'ironfur', 'frenzied_regeneration'] as const) {
      const resourceBefore = p.resource;
      p.gcdRemaining = 0;
      sim.castAbility(id);
      const errors = errorTexts(sim.tick());
      expect(errors, `${id} was not refused out of form`).toContain('You must be in Bruin Form.');
      // A refused cast pays no cost and starts no cooldown.
      expect(p.resource).toBe(resourceBefore);
      expect(p.cooldowns.has(id)).toBe(false);
    }
    expect(ironfurStacks(p)).toHaveLength(0);
    expect(p.auras.some((a) => a.id === 'frenzied_regeneration')).toBe(false);
  });

  it('refuses the generators with a target selected but the form dropped', () => {
    const sim = makeSim();
    const p = bearDruid(sim);
    const dummy = meleeDummy(sim);
    // Shift out; the target and the melee range stay exactly as they were.
    p.gcdRemaining = 0;
    sim.castAbility('bear_form');
    for (let i = 0; i < 40; i++) sim.tick();
    expect(p.auras.some((a) => a.kind === 'form_bear')).toBe(false);
    p.targetId = dummy.id;
    p.gcdRemaining = 0;
    sim.castAbility('mangle');
    expect(errorTexts(sim.tick())).toContain('You must be in Bruin Form.');
    p.gcdRemaining = 0;
    sim.castAbility('thrash');
    expect(errorTexts(sim.tick())).toContain('You must be in Bruin Form.');
  });
});

describe('Ironpelt (stacking self buff)', () => {
  it('costs rage, raises armor per stack, and stops at its cap', () => {
    const sim = makeSim();
    const p = bearDruid(sim);
    const cost = ABILITIES.ironfur.cost;
    p.resource = cost * (IRONFUR_CAP + 1);
    const baseArmor = p.stats.armor;
    let lastArmor = baseArmor;
    for (let stack = 1; stack <= IRONFUR_CAP; stack++) {
      const rageBefore = p.resource;
      sim.castAbility('ironfur');
      sim.tick();
      expect(p.resource).toBe(rageBefore - cost);
      expect(ironfurStacks(p)).toHaveLength(stack);
      expect(p.stats.armor).toBeGreaterThan(lastArmor);
      lastArmor = p.stats.armor;
    }
    expect(p.stats.armor).toBeGreaterThan(baseArmor);
    // At the cap a further cast refreshes the stack with the least time left
    // rather than adding a fifth: the armor total does not keep climbing.
    const cappedArmor = p.stats.armor;
    sim.castAbility('ironfur');
    sim.tick();
    expect(ironfurStacks(p)).toHaveLength(IRONFUR_CAP);
    expect(p.stats.armor).toBe(cappedArmor);
    // Every live stack is its own aura with its own slot id, never one shared
    // aura carrying a stack counter.
    expect(new Set(ironfurStacks(p).map((a) => a.id)).size).toBe(IRONFUR_CAP);
  });

  it('expires one stack at a time, each on its own timer', () => {
    const sim = makeSim();
    const p = bearDruid(sim);
    p.resource = p.maxResource;
    const baseArmor = p.stats.armor;

    sim.castAbility('ironfur');
    sim.tick();
    const oneStackArmor = p.stats.armor;
    expect(ironfurStacks(p)).toHaveLength(1);

    // Buy the second stack two seconds later, so the two timers are staggered.
    const gapTicks = 20 * 2;
    for (let i = 0; i < gapTicks; i++) sim.tick();
    sim.castAbility('ironfur');
    sim.tick();
    expect(ironfurStacks(p)).toHaveLength(2);
    const twoStackArmor = p.stats.armor;
    expect(twoStackArmor).toBeGreaterThan(oneStackArmor);
    // The older stack really is closer to falling off than the fresh one.
    const remaining = ironfurStacks(p)
      .map((a) => a.remaining)
      .sort((a, b) => a - b);
    expect(remaining[1] - remaining[0]).toBeCloseTo(gapTicks / 20, 1);

    // Just past the FIRST stack's 7 sec: one stack gone, one still holding.
    const ticksSinceFirst = gapTicks + 1;
    for (let i = 0; i < IRONFUR_DURATION * 20 - ticksSinceFirst + 2; i++) sim.tick();
    expect(ironfurStacks(p)).toHaveLength(1);
    expect(p.stats.armor).toBe(oneStackArmor);
    expect(p.stats.armor).toBeLessThan(twoStackArmor);

    // Past the SECOND stack's own 7 sec: the buff is fully gone.
    for (let i = 0; i < gapTicks + 4; i++) sim.tick();
    expect(ironfurStacks(p)).toHaveLength(0);
    expect(p.stats.armor).toBe(baseArmor);
  });
});

describe('Savage Mending (recent-damage heal)', () => {
  it('heals more after taking more damage inside the window', () => {
    const healingFor = (damage: number) => {
      const sim = makeSim();
      const p = bearDruid(sim);
      p.resource = p.maxResource;
      (sim as any).dealDamage(null, p, damage, false, 'physical', 'test');
      expect(p.dead).toBe(false);
      // Plenty of missing health in both runs, so nothing is lost to overheal.
      p.hp = 100;
      sim.castAbility('frenzied_regeneration');
      return collectSavageMendingHealing(sim, 20 * 5);
    };
    const small = healingFor(120);
    const large = healingFor(600);
    expect(small).toBeGreaterThan(0);
    expect(large).toBeGreaterThan(small);
  });

  it('falls back to the 5% max-health floor when no damage was taken', () => {
    const sim = makeSim();
    const p = bearDruid(sim);
    p.resource = p.maxResource;
    // Nothing was ever taken: the rolling window is empty.
    expect(p.damageHistory ?? []).toHaveLength(0);
    // Drop HP directly (not through dealDamage) so there is room to heal without
    // putting anything into the damage-taken window.
    p.hp = 100;
    const floor = Math.round(p.maxHp * SAVAGE_MENDING_FLOOR_PCT);
    sim.castAbility('frenzied_regeneration');
    const healed = collectSavageMendingHealing(sim, 20 * 5);
    expect(healed).toBeGreaterThanOrEqual(floor);
    // It IS the floor, not a real payback: nowhere near a damage-fed heal.
    expect(healed).toBeLessThan(floor * 2);
  });

  it('ages the damage-taken window out: old damage no longer pays back', () => {
    const heavyDamage = 600;
    const windowTicks = 20 * 5;

    const immediate = makeSim();
    const pNow = bearDruid(immediate);
    pNow.resource = pNow.maxResource;
    (immediate as any).dealDamage(null, pNow, heavyDamage, false, 'physical', 'test');
    pNow.hp = 100;
    immediate.castAbility('frenzied_regeneration');
    const healedNow = collectSavageMendingHealing(immediate, 20 * 5);

    const stale = makeSim();
    const pLater = bearDruid(stale);
    pLater.resource = pLater.maxResource;
    (stale as any).dealDamage(null, pLater, heavyDamage, false, 'physical', 'test');
    // Let the same hit age past the 5 sec look-back before spending the rage.
    for (let i = 0; i < windowTicks + 20; i++) stale.tick();
    pLater.resource = pLater.maxResource;
    pLater.hp = 100;
    stale.castAbility('frenzied_regeneration');
    const healedLater = collectSavageMendingHealing(stale, 20 * 5);

    expect(healedNow).toBeGreaterThan(0);
    expect(healedLater).toBeGreaterThan(0); // the floor still pays
    expect(healedLater).toBeLessThan(healedNow);
    const floor = Math.round(pLater.maxHp * SAVAGE_MENDING_FLOOR_PCT);
    expect(healedLater).toBeLessThan(floor * 2);
  });
});

describe('Bruin Form threat', () => {
  it('carries the Guardian threat budget passively', () => {
    const sim = makeSim();
    const p = casterDruid(sim);
    expect(threatModifier(p, 'physical')).toBe(1);
    bearDruid(sim);
    expect(threatModifier(p, 'physical')).toBe(BEAR_FORM_THREAT_MULT);
    expect(BEAR_FORM_THREAT_MULT).toBeGreaterThan(1);
  });

  it('multiplies the threat a bear puts on the hate table', () => {
    const damage = 100;
    const threatFrom = (bear: boolean) => {
      const sim = makeSim();
      const p = bear ? bearDruid(sim) : casterDruid(sim);
      const dummy = meleeDummy(sim);
      dummy.threat.clear();
      (sim as any).dealDamage(p, dummy, damage, false, 'physical', null, 'hit', true);
      return dummy.threat.get(sim.playerId) ?? 0;
    };
    const casterThreat = threatFrom(false);
    const bearThreat = threatFrom(true);
    expect(casterThreat).toBeGreaterThan(0);
    // Both runs pay the same flat aggro seed on entering combat; only the damage
    // part of the number is multiplied by the form.
    const aggroSeed = casterThreat - damage;
    expect(bearThreat).toBeCloseTo(damage * BEAR_FORM_THREAT_MULT + aggroSeed, 5);
    expect(bearThreat).toBeGreaterThan(casterThreat);
  });
});
