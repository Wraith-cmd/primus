// Companion reactions wired to the live world (src/sim/companions/reactions.ts):
// the ground-hazard dodge and the interrupt, proven on BOTH consumers, the delve
// companion (Acolyte Tessa) and a hired dungeon-party companion. The pure cores
// are covered by companion_ground_avoidance / companion_interrupt_policy; what is
// under test here is the wiring: does a live companion actually leave the fire,
// and does a live channel actually break?

import { describe, expect, it } from 'vitest';

import {
  COMPANION_LEASH_DISTANCE,
  companionPartyFor,
  recruitCompanion,
  updateDungeonCompanion,
} from '../src/sim/companions/party';
import {
  COMPANION_INTERRUPT_COOLDOWN,
  companionCasts,
  companionHazards,
  tryCompanionInterrupt,
} from '../src/sim/companions/reactions';
import { DUNGEONS, MOBS } from '../src/sim/data';
import { updateDelveCompanion } from '../src/sim/delves/companion';
import { createMob } from '../src/sim/entity';
import { NYTHRAXIS_SPIRIT_MENDING_CAST_ID } from '../src/sim/mob/healer_channel';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import { dist2d, type Entity } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

function ctxOf(sim: Sim): SimContext {
  return (sim as unknown as { ctx: SimContext }).ctx;
}

function teleport(sim: Sim, x: number, z: number): void {
  const p = sim.player;
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = terrainHeight(x, z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
}

/** Drop a damaging puddle centred on `on`. Mirrors the shape effect_dispatch
 *  pushes for Consecration and friends. */
function dropPuddle(sim: Sim, on: Entity, radius = 6): void {
  ctxOf(sim).groundAoEs.push({
    sourceId: 90001,
    pos: { ...on.pos },
    radius,
    min: 10,
    max: 12,
    remaining: 30,
    interval: 1,
    tickTimer: 1,
    school: 'fire',
    ability: 'test_puddle',
  });
}

/** A live delve run with Acolyte Tessa in it. */
function delveWithCompanion(): { sim: Sim; companion: Entity } {
  const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true });
  sim.setPlayerLevel(10);
  teleport(sim, 0, 0);
  sim.enterDelve('collapsed_reliquary', 'normal');
  const run = sim.delveRunForPlayer(sim.playerId)!;
  return { sim, companion: sim.entities.get(run.companion!.entityId)! };
}

/** A hired dungeon-party companion, standing on the Hollow Crypt door. */
function partyWithCompanion(role: 'tank' | 'healer' | 'dps'): { sim: Sim; companion: Entity } {
  const sim = new Sim({ seed: 11, playerClass: 'druid', autoEquip: true });
  sim.setPlayerLevel(15);
  const door = DUNGEONS.hollow_crypt.doorPos;
  teleport(sim, door.x, door.z + 2);
  sim.player.inCombat = false;
  expect(recruitCompanion(ctxOf(sim), role)).toBe(true);
  const party = companionPartyFor(ctxOf(sim), sim.playerId)!;
  return { sim, companion: sim.entities.get(party.members[0].entityId)! };
}

describe('companion ground avoidance (wired)', () => {
  it('the delve companion steps out of a puddle she is standing in', () => {
    const { sim, companion } = delveWithCompanion();
    dropPuddle(sim, companion);
    const hazard = ctxOf(sim).groundAoEs[0];
    expect(dist2d(companion.pos, hazard.pos)).toBeLessThan(hazard.radius);
    // Several ticks: one dodge is one movement step, not a teleport.
    for (let i = 0; i < 40; i++) updateDelveCompanion(ctxOf(sim), companion);
    expect(dist2d(companion.pos, hazard.pos)).toBeGreaterThan(hazard.radius);
  });

  it('the delve companion does not walk back into the fire to reach melee', () => {
    const { sim, companion } = delveWithCompanion();
    // A hostile parked in the middle of the puddle: without the dodge she closes
    // to melee and stands in it.
    const mob = createMob(
      (sim as unknown as { nextId: number }).nextId++,
      MOBS.crypt_shambler,
      10,
      sim.groundPos(companion.pos.x + 3, companion.pos.z),
    );
    mob.hostile = true;
    sim.addEntity(mob);
    sim.player.targetId = mob.id;
    sim.player.inCombat = true;
    dropPuddle(sim, mob, 7);
    for (let i = 0; i < 40; i++) updateDelveCompanion(ctxOf(sim), companion);
    const hazard = ctxOf(sim).groundAoEs[0];
    expect(dist2d(companion.pos, hazard.pos)).toBeGreaterThan(hazard.radius);
  });

  it('a hired party companion steps out of a puddle', () => {
    const { sim, companion } = partyWithCompanion('dps');
    dropPuddle(sim, companion);
    const hazard = ctxOf(sim).groundAoEs[0];
    for (let i = 0; i < 40; i++) updateDungeonCompanion(ctxOf(sim), companion);
    expect(dist2d(companion.pos, hazard.pos)).toBeGreaterThan(hazard.radius);
    // It stays with the owner: a dodge is a sidestep, never a bolt for the horizon.
    expect(dist2d(companion.pos, sim.player.pos)).toBeLessThan(COMPANION_LEASH_DISTANCE);
  });

  it('a FRIENDLY zone is never fled', () => {
    const { sim, companion } = partyWithCompanion('dps');
    ctxOf(sim).groundAoEs.push({
      sourceId: 90002,
      pos: { ...companion.pos },
      radius: 6,
      min: 0,
      max: 0,
      remaining: 30,
      interval: 1,
      tickTimer: 1,
      school: 'arcane',
      ability: 'rune_of_power',
      allyBuffPct: 0.1,
    });
    expect(companionHazards(ctxOf(sim), companion)[0].hostile).toBe(false);
    const before = { ...companion.pos };
    updateDungeonCompanion(ctxOf(sim), companion);
    expect(dist2d(companion.pos, before)).toBeLessThan(0.5);
  });

  it('an unhazarded world leaves movement untouched', () => {
    const { sim, companion } = partyWithCompanion('dps');
    expect(companionHazards(ctxOf(sim), companion)).toEqual([]);
  });
});

/** Park a hostile mid-channel next to `near`. The Nythraxis spirit-mending
 *  channel is the canonical kick target: a scripted, interruptible heal. */
function spawnChanneler(sim: Sim, near: Entity, remaining = 5): Entity {
  const mob = createMob(
    (sim as unknown as { nextId: number }).nextId++,
    MOBS.crypt_shambler,
    12,
    sim.groundPos(near.pos.x + 3, near.pos.z),
  );
  mob.hostile = true;
  mob.castingAbility = NYTHRAXIS_SPIRIT_MENDING_CAST_ID;
  mob.castRemaining = remaining;
  mob.castTotal = 6;
  sim.addEntity(mob);
  return mob;
}

describe('companion interrupts (wired)', () => {
  it('the delve companion kicks a healer channel in reach', () => {
    const { sim, companion } = delveWithCompanion();
    const healer = spawnChanneler(sim, companion);
    updateDelveCompanion(ctxOf(sim), companion);
    expect(healer.castingAbility).toBeNull();
    expect(healer.auras.some((a) => a.kind === 'lockout')).toBe(true);
  });

  it('a hired party companion kicks the same channel', () => {
    const { sim, companion } = partyWithCompanion('dps');
    const healer = spawnChanneler(sim, companion);
    updateDungeonCompanion(ctxOf(sim), companion);
    expect(healer.castingAbility).toBeNull();
  });

  it('holds the kick for a cast that finishes before it could land', () => {
    const { sim, companion } = partyWithCompanion('dps');
    // 0.05s left: the reaction budget alone outlasts it.
    const healer = spawnChanneler(sim, companion, 0.05);
    expect(tryCompanionInterrupt(ctxOf(sim), companion)).toBeNull();
    expect(healer.castingAbility).toBe(NYTHRAXIS_SPIRIT_MENDING_CAST_ID);
  });

  it('spends a real cooldown, so a second channel is not free', () => {
    const { sim, companion } = partyWithCompanion('dps');
    const first = spawnChanneler(sim, companion);
    expect(tryCompanionInterrupt(ctxOf(sim), companion)).toBe(first);
    const second = spawnChanneler(sim, companion);
    expect(tryCompanionInterrupt(ctxOf(sim), companion)).toBeNull();
    expect(second.castingAbility).toBe(NYTHRAXIS_SPIRIT_MENDING_CAST_ID);
    // ...until the cooldown is up.
    ctxOf(sim).companionCooldowns.get(companion.id)!.interruptReadyAt =
      ctxOf(sim).time - COMPANION_INTERRUPT_COOLDOWN;
    expect(tryCompanionInterrupt(ctxOf(sim), companion)).toBe(second);
  });

  it('reports a CC-immune caster as uninterruptible', () => {
    const { sim, companion } = partyWithCompanion('dps');
    const boss = spawnChanneler(sim, companion);
    boss.ccImmune = true;
    const rows = companionCasts(ctxOf(sim), companion);
    expect(rows.find((c) => c.id === boss.id)!.interruptible).toBe(false);
    expect(tryCompanionInterrupt(ctxOf(sim), companion)).toBeNull();
    expect(boss.castingAbility).toBe(NYTHRAXIS_SPIRIT_MENDING_CAST_ID);
  });

  it('draws no rng', () => {
    const { sim, companion } = partyWithCompanion('dps');
    spawnChanneler(sim, companion);
    const rng = ctxOf(sim).rng;
    const before = JSON.stringify(rng);
    tryCompanionInterrupt(ctxOf(sim), companion);
    expect(JSON.stringify(rng)).toBe(before);
  });
});
