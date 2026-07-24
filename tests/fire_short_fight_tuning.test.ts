// Fire mage short-fight burst regression (live report 2026-07-24): on a 27s
// Nythraxis kill a fire mage in Soulflame 4pc + Mournweave 3pc parsed 363 DPS
// against ~149-158 for comparable players (~2.3x). The root cause is
// Cinderfall's action economy inside the Fire proc loop, not base spell
// damage: every Cinderfall press is a guaranteed crit that is simultaneously
// instant damage, a 40% Ignite bank, a Hot Streak builder (a free instant
// Pyrelance every second press), and Phoenix Trance CDR, at zero rotational
// cost (off-GCD, usable while casting, three banked charges).
//
// This harness reproduces the reported fight deterministically: the EXACT
// reported gear, the Phoenix Trance opener, the Cinderfall dump, Hot Streak
// Pyrelances, Meteor on cooldown, Cinderbolt filler. The comparator is frost
// in the IDENTICAL gear playing its real kit (Water Elemental pre-summoned,
// Icy Veins, Frozen Orb, Brain Freeze Flurries, Fingers-of-Frost Ice Lances,
// Glacial Spike at five icicles, Rimelance filler), a fuller baseline than
// chronomancy_balance.test.ts' Frostbolt-spam "cryo" proxy so the burst band
// is honest. Mana is pinned to full: the report's premise is that mana never
// matters at 27s.
//
// Target band (this fix): fire's short-fight DPS stays a real burst edge over
// the sustained comparator, but bounded: floor 1.0x, ceiling 1.6x. On the
// pre-fix values the ratio is ~2x+, so the ceiling assertion is the failing
// regression this change turns green.
import { describe, expect, it } from 'vitest';
import { ABILITIES, ITEMS, MOBS } from '../src/sim/data';
import { createMob, type PlayerEquipment, recalcPlayerStats } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

const FIGHT_SECONDS = 27; // the reported Nythraxis kill length
const SHORT_FIGHT_DPS_CEILING = 1.6; // x the sustained comparator, 27s window
const SHORT_FIGHT_DPS_FLOOR = 1.0; // the nerf must not gut the burst identity

// The reported player's exact equipment: Soulflame (Wraithfire Regalia) 4pc +
// Mournweave 3pc + heroic-vendor jewelry, epic staff and offhand.
const REPORTED_GEAR: PlayerEquipment = {
  helmet: 'soulflame_cowl',
  neck: 'zense_meridian',
  shoulder: 'soulflame_mantle',
  chest: 'necromancers_starshroud',
  mainhand: 'deathless_heartwood',
  offhand: 'wraithfire_orb',
  gloves: 'soulflame_gloves',
  waist: 'soulflame_cord',
  legs: 'necromancers_legwraps',
  feet: 'necromancers_soulsteps',
  ring1: 'nielas_coldlight_band',
  ring2: 'nielas_coldlight_band',
};

type Spec = 'fire' | 'frost';

interface CtxLike {
  players: Map<number, { cls: string; equipment: PlayerEquipment; equipmentInstance?: unknown }>;
  playerMods: (meta: unknown) => unknown;
}

function gearedMage(spec: Spec): { sim: Sim; p: Entity } {
  const sim = new Sim({ seed: 41, playerClass: 'mage', autoEquip: true });
  sim.setPlayerLevel(20);
  expect(sim.setSpec(spec)).toBe(true);
  sim.tick();
  const p = sim.player;
  const ctx = (sim as unknown as { ctx: CtxLike }).ctx;
  const meta = ctx.players.get(p.id);
  if (!meta) throw new Error('player meta missing');
  meta.equipment = { ...REPORTED_GEAR };
  recalcPlayerStats(
    p,
    meta.cls as never,
    meta.equipment,
    ctx.playerMods(meta) as never,
    meta.equipmentInstance as never,
  );
  p.resource = p.maxResource;
  return { sim, p };
}

function addBossDummy(sim: Sim, dist = 6): Entity {
  const p = sim.player;
  const mob = createMob(9500, MOBS.training_dummy, 20, {
    x: p.pos.x,
    y: p.pos.y,
    z: p.pos.z + dist,
  });
  mob.hostile = true;
  mob.maxHp = mob.hp = 1_000_000_000;
  (sim as unknown as { addEntity(e: Entity): void }).addEntity(mob);
  return mob;
}

function free(p: Entity): boolean {
  const q = p as unknown as { castingAbility: string | null; gcdRemaining: number };
  return q.castingAbility == null && q.gcdRemaining <= 1e-6;
}

function offCooldown(p: Entity, id: string): boolean {
  return (p.cooldowns.get(id) ?? 0) <= 0;
}

function hasCharge(p: Entity, id: string): boolean {
  const state = p.abilityCharges?.[id];
  return !state || state.charges > 0; // lazily initialized: absent = full
}

interface BurstResult {
  dps: number;
  damage: number;
  byAbility: Record<string, number>;
}

// Drive one spec's short-fight loop for `seconds` and sum every point of
// player damage on the dummy (direct hits, DoTs, Ignite and the frost pet all
// attribute to the mage: pet damage resolves through ownerId). Deterministic:
// fixed seed, fixed tick script, no rng beyond the sim's own stream.
function runShortFight(spec: Spec, seconds: number): BurstResult {
  const { sim, p } = gearedMage(spec);
  const dummy = addBossDummy(sim);
  sim.targetEntity(dummy.id);
  if (spec === 'frost') {
    // A raider walks in with the Water Elemental already up: summon it before
    // the pull so the 27s window measures the fight, not the setup cast.
    sim.castAbility('summon_water_elemental');
    for (let i = 0; i < 60; i++) sim.tick(); // 3s: cast lands, pet settles
    p.resource = p.maxResource;
  }
  const mine = (sourceId: number): boolean => {
    if (sourceId === p.id) return true;
    const src = sim.entities.get(sourceId);
    return src?.ownerId === p.id;
  };
  let damage = 0;
  const byAbility: Record<string, number> = {};
  const ticks = Math.round(seconds * 20);
  for (let i = 0; i < ticks; i++) {
    p.resource = p.maxResource; // mana never matters at 27s (report premise)
    if (spec === 'fire') {
      // Off-GCD presses first, exactly as a player mashes them: the Trance
      // opener, then every banked Cinderfall (off-GCD, usable while casting).
      if (offCooldown(p, 'combustion')) sim.castAbility('combustion');
      if (hasCharge(p, 'fire_blast')) sim.castAbility('fire_blast');
      if (free(p)) {
        if (p.auras.some((a) => a.id === 'hot_streak')) sim.castAbility('pyroblast');
        else if (offCooldown(p, 'meteor'))
          sim.castAbilityAt('meteor', { x: dummy.pos.x, z: dummy.pos.z });
        else sim.castAbility('fireball');
      }
    } else if (free(p)) {
      // Frost plays its real kit: Icy Veins opener, Glacial Spike at five
      // icicles, Brain Freeze Flurry, proc-fed Ice Lance, Frozen Orb on
      // cooldown, Rimelance filler.
      const icicles = p.auras.find((a) => a.kind === 'icicles');
      if (offCooldown(p, 'icy_veins')) sim.castAbility('icy_veins');
      else if ((icicles?.stacks ?? 0) >= 5) sim.castAbility('glacial_spike');
      else if (p.auras.some((a) => a.id === 'brain_freeze')) sim.castAbility('flurry');
      else if (
        p.auras.some((a) => a.id === 'fingers_of_frost') ||
        dummy.auras.some((a) => a.id === 'winters_chill')
      )
        sim.castAbility('ice_lance');
      else if (offCooldown(p, 'frozen_orb')) sim.castAbility('frozen_orb');
      else sim.castAbility('frostbolt');
    }
    for (const e of sim.tick()) {
      if (e.type === 'damage' && mine(e.sourceId) && e.targetId === dummy.id) {
        damage += e.amount;
        const key = e.ability ?? 'auto';
        byAbility[key] = (byAbility[key] ?? 0) + e.amount;
      }
    }
  }
  return { dps: damage / seconds, damage, byAbility };
}

describe('fire mage short-fight burst (27s live report harness)', () => {
  const fire = runShortFight('fire', FIGHT_SECONDS);
  const frost = runShortFight('frost', FIGHT_SECONDS);

  it('the reported gear resolves (every id exists on its slot)', () => {
    for (const [slot, id] of Object.entries(REPORTED_GEAR)) {
      const def = ITEMS[id as string];
      expect(def, `${id} exists`).toBeTruthy();
      const wanted = slot === 'ring1' || slot === 'ring2' ? 'ring' : slot;
      expect(def.slot, `${id} slot`).toBe(wanted);
    }
  });

  it('reports the measured short-fight numbers (owner harness)', () => {
    const fmt = (label: string, r: BurstResult) => {
      const parts = Object.entries(r.byAbility)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}=${v}`)
        .join(' ');
      return `${label.padEnd(6)}: DPS=${r.dps.toFixed(1)} total=${r.damage} [${parts}]`;
    };
    const lines = [fmt('fire', fire), fmt('frost', frost)].join('\n');
    expect(lines.length).toBeGreaterThan(0);
    console.log(
      `\n[fire short fight] ${FIGHT_SECONDS}s, reported gear, ratio=${(fire.dps / frost.dps).toFixed(2)}\n${lines}\n`,
    );
  });

  it('both loops actually fired (harness sanity)', () => {
    expect(fire.damage).toBeGreaterThan(0);
    expect(frost.damage).toBeGreaterThan(0);
    // The fire loop really exercised the reported machinery: Trance-fed Hot
    // Streak Pyrelances and Ignite both landed damage.
    expect(fire.byAbility.Pyrelance ?? 0).toBeGreaterThan(0);
    expect(fire.byAbility.Ignite ?? 0).toBeGreaterThan(0);
    expect(fire.byAbility.Cinderfall ?? 0).toBeGreaterThan(0);
  });

  it(`fire's 27s burst stays within ${SHORT_FIGHT_DPS_CEILING}x the sustained comparator`, () => {
    expect(fire.dps).toBeLessThanOrEqual(frost.dps * SHORT_FIGHT_DPS_CEILING);
  });

  it('the burst edge survives (the fix must not gut the spec)', () => {
    expect(fire.dps).toBeGreaterThanOrEqual(frost.dps * SHORT_FIGHT_DPS_FLOOR);
  });
});

describe('the tuned knobs (balance 2026-07-24)', () => {
  it('Cinderfall banks two charges on a 15s recharge (was three on 8s)', () => {
    expect(ABILITIES.fire_blast.maxCharges).toBe(2);
    expect(ABILITIES.fire_blast.cooldown).toBe(15);
  });
});
