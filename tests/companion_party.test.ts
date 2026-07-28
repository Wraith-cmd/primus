// The dungeon companion party (src/sim/companions/party.ts): the system that lets
// one player run a five-man solo. These drive the REAL Sim (recruit through the
// public verb, tick the real loop), not a hand-built fixture, so the entrance gate,
// the level scaling, the roster cap, the per-role brain and the disband rule are
// all proven against the code that actually ships.

import { beforeEach, describe, expect, it } from 'vitest';

import {
  COMPANION_ENTRANCE_RADIUS,
  companionPartyFor,
  companionSlotsFree,
  dungeonEntranceIdAt,
  isDungeonCompanionMob,
  recruitCompanion,
  updateCompanionParties,
  updateDungeonCompanion,
} from '../src/sim/companions/party';
import { DEFAULT_COMPANION_ROLES, MAX_COMPANIONS, ROLE_KITS } from '../src/sim/companions/role_kit';
import { DUNGEONS, MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import type { Entity } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

const CRYPT_DOOR = DUNGEONS.hollow_crypt.doorPos;

function makeSim(seed = 7): Sim {
  return new Sim({ seed, playerClass: 'druid', autoEquip: true });
}

function ctxOf(sim: Sim): SimContext {
  return (sim as unknown as { ctx: SimContext }).ctx;
}

function teleport(sim: Sim, x: number, z: number): void {
  const p = sim.player;
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = terrainHeight(x, z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
  sim.rebucket(p);
}

/** Park the owner on the Hollow Crypt door, out of combat: the one place a party
 *  may legally be hired. */
function standAtCryptDoor(sim: Sim): void {
  teleport(sim, CRYPT_DOOR.x, CRYPT_DOOR.z + 2);
  sim.player.inCombat = false;
  sim.player.combatTimer = 999;
}

describe('companion party: the recruit gate', () => {
  let sim: Sim;
  beforeEach(() => {
    sim = makeSim();
    sim.setPlayerLevel(15);
  });

  it('recruits four companions in the standard tank/healer/dps/dps order', () => {
    standAtCryptDoor(sim);
    for (let i = 0; i < MAX_COMPANIONS; i++) {
      expect(recruitCompanion(ctxOf(sim))).toBe(true);
    }
    const party = companionPartyFor(ctxOf(sim), sim.playerId)!;
    expect(party.members.map((m) => m.role)).toEqual([...DEFAULT_COMPANION_ROLES]);
    expect(party.dungeonId).toBe('hollow_crypt');
    expect(companionSlotsFree(ctxOf(sim), sim.playerId)).toBe(0);
  });

  it('refuses a fifth companion', () => {
    standAtCryptDoor(sim);
    for (let i = 0; i < MAX_COMPANIONS; i++) recruitCompanion(ctxOf(sim));
    const before = companionPartyFor(ctxOf(sim), sim.playerId)!.members.length;
    const errors: string[] = [];
    // The refusal is a player-facing toast, not a silent no-op.
    const fifth = recruitCompanion(ctxOf(sim));
    for (const ev of sim.tick()) if (ev.type === 'error') errors.push(ev.text);
    expect(fifth).toBe(false);
    expect(companionPartyFor(ctxOf(sim), sim.playerId)!.members.length).toBe(before);
    expect(errors.some((t) => t.includes('full'))).toBe(true);
  });

  it('refuses to recruit away from a dungeon entrance', () => {
    // Deliberately in the open world, nowhere near a door.
    teleport(sim, 0, 0);
    sim.player.inCombat = false;
    expect(recruitCompanion(ctxOf(sim))).toBe(false);
    expect(companionPartyFor(ctxOf(sim), sim.playerId)).toBeNull();
    const errors = sim.tick().filter((e) => e.type === 'error');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('refuses to recruit in combat even at the door', () => {
    standAtCryptDoor(sim);
    sim.player.inCombat = true;
    expect(recruitCompanion(ctxOf(sim))).toBe(false);
    expect(companionPartyFor(ctxOf(sim), sim.playerId)).toBeNull();
  });

  it('scales each companion to the owner level at summon time', () => {
    for (const level of [5, 12, 20]) {
      const s = makeSim();
      s.setPlayerLevel(level);
      standAtCryptDoor(s);
      expect(recruitCompanion(ctxOf(s))).toBe(true);
      const party = companionPartyFor(ctxOf(s), s.playerId)!;
      const member = party.members[0];
      expect(member.level).toBe(level);
      expect(s.entities.get(member.entityId)!.level).toBe(level);
    }
  });

  it('does not re-level a companion when the owner levels after the summon', () => {
    standAtCryptDoor(sim);
    recruitCompanion(ctxOf(sim));
    const member = companionPartyFor(ctxOf(sim), sim.playerId)!.members[0];
    sim.setPlayerLevel(20);
    expect(sim.entities.get(member.entityId)!.level).toBe(15);
  });

  it('spawns companions as live, owned, non-hostile sim entities', () => {
    standAtCryptDoor(sim);
    recruitCompanion(ctxOf(sim), 'tank');
    const member = companionPartyFor(ctxOf(sim), sim.playerId)!.members[0];
    const e = sim.entities.get(member.entityId)!;
    expect(e.kind).toBe('mob');
    expect(e.ownerId).toBe(sim.playerId);
    expect(e.hostile).toBe(false);
    expect(isDungeonCompanionMob(ctxOf(sim), e)).toBe(true);
  });

  it('the entrance gate is the door, not the whole zone', () => {
    expect(dungeonEntranceIdAt({ x: CRYPT_DOOR.x, y: 0, z: CRYPT_DOOR.z })).toBe('hollow_crypt');
    expect(
      dungeonEntranceIdAt({
        x: CRYPT_DOOR.x,
        y: 0,
        z: CRYPT_DOOR.z + COMPANION_ENTRANCE_RADIUS + 5,
      }),
    ).toBeNull();
    // Inside an instance is not an entrance either.
    expect(dungeonEntranceIdAt({ x: 940, y: 0, z: 0 })).toBeNull();
  });

  it('the raid arena, reached only through an internal door, is not an entrance', () => {
    // nythraxis_boss_arena shares a doorPos with nythraxis_crypt but is
    // overworldDoor:false, so the crypt must win the lookup.
    const arenaDoor = DUNGEONS.nythraxis_boss_arena.doorPos;
    expect(dungeonEntranceIdAt({ x: arenaDoor.x, y: 0, z: arenaDoor.z })).toBe('nythraxis_crypt');
  });
});

describe('companion party: lifecycle', () => {
  it('disbands when the owner walks away from the door before entering', () => {
    const sim = makeSim();
    sim.setPlayerLevel(15);
    standAtCryptDoor(sim);
    recruitCompanion(ctxOf(sim));
    const member = companionPartyFor(ctxOf(sim), sim.playerId)!.members[0];
    teleport(sim, 0, 0);
    updateCompanionParties(ctxOf(sim));
    expect(companionPartyFor(ctxOf(sim), sim.playerId)).toBeNull();
    expect(sim.entities.has(member.entityId)).toBe(false);
  });

  it('survives zoning in, then disbands on leaving the dungeon', () => {
    const sim = makeSim();
    sim.setPlayerLevel(15);
    standAtCryptDoor(sim);
    for (let i = 0; i < MAX_COMPANIONS; i++) recruitCompanion(ctxOf(sim));
    const ids = companionPartyFor(ctxOf(sim), sim.playerId)!.members.map((m) => m.entityId);

    expect(sim.enterCrypt()).not.toBe(false);
    sim.tick();
    const inside = companionPartyFor(ctxOf(sim), sim.playerId)!;
    expect(inside.entered).toBe(true);
    expect(inside.members.length).toBe(MAX_COMPANIONS);
    // The party comes through the door with the owner rather than being left
    // standing outside it.
    for (const id of ids) {
      expect(Math.abs(sim.entities.get(id)!.pos.x - sim.player.pos.x)).toBeLessThan(80);
    }

    sim.leaveCrypt();
    sim.tick();
    expect(companionPartyFor(ctxOf(sim), sim.playerId)).toBeNull();
    for (const id of ids) expect(sim.entities.has(id)).toBe(false);
  });

  it('drops a dead companion from the roster', () => {
    const sim = makeSim();
    sim.setPlayerLevel(15);
    standAtCryptDoor(sim);
    recruitCompanion(ctxOf(sim));
    recruitCompanion(ctxOf(sim));
    const party = companionPartyFor(ctxOf(sim), sim.playerId)!;
    const doomed = party.members[0].entityId;
    const e = sim.entities.get(doomed)!;
    e.dead = true;
    e.hp = 0;
    updateCompanionParties(ctxOf(sim));
    const after = companionPartyFor(ctxOf(sim), sim.playerId)!;
    expect(after.members.map((m) => m.entityId)).not.toContain(doomed);
    expect(after.members.length).toBe(1);
  });

  it('disbands the party when the owner leaves the world', () => {
    const sim = makeSim();
    sim.setPlayerLevel(15);
    sim.addPlayer('warrior', 'Second');
    standAtCryptDoor(sim);
    recruitCompanion(ctxOf(sim));
    const id = companionPartyFor(ctxOf(sim), sim.playerId)!.members[0].entityId;
    const pid = sim.playerId;
    sim.removePlayer(pid);
    expect(companionPartyFor(ctxOf(sim), pid)).toBeNull();
    expect(sim.entities.has(id)).toBe(false);
  });

  it('the lifecycle phase draws no rng', () => {
    const sim = makeSim();
    sim.setPlayerLevel(15);
    standAtCryptDoor(sim);
    for (let i = 0; i < MAX_COMPANIONS; i++) recruitCompanion(ctxOf(sim));
    const rng = ctxOf(sim).rng as unknown as { s: number };
    const before = JSON.stringify(rng);
    updateCompanionParties(ctxOf(sim));
    expect(JSON.stringify(rng)).toBe(before);
  });
});

// A hostile mob planted right next to the party, with the instance-free open world
// as the arena: enough to drive the per-role brain without a full dungeon pull.
function spawnEnemy(sim: Sim, x: number, z: number, level = 15): Entity {
  const mob = createMob(
    (sim as unknown as { nextId: number }).nextId++,
    MOBS.crypt_shambler,
    level,
    sim.groundPos(x, z),
  );
  mob.hostile = true;
  sim.addEntity(mob);
  return mob;
}

describe('companion party: the role kits', () => {
  function hire(sim: Sim, role: 'tank' | 'healer' | 'dps'): Entity {
    standAtCryptDoor(sim);
    expect(recruitCompanion(ctxOf(sim), role)).toBe(true);
    const party = companionPartyFor(ctxOf(sim), sim.playerId)!;
    return sim.entities.get(party.members[party.members.length - 1].entityId)!;
  }

  it('the tank taunts what it does not already hold', () => {
    const sim = makeSim();
    sim.setPlayerLevel(15);
    const tank = hire(sim, 'tank');
    const mob = spawnEnemy(sim, tank.pos.x + 2, tank.pos.z);
    // The mob is chewing on the owner, which is exactly what a tank peels.
    mob.aggroTargetId = sim.playerId;
    mob.threat.set(sim.playerId, 500);
    updateDungeonCompanion(ctxOf(sim), tank);
    expect(mob.threat.get(tank.id) ?? 0).toBeGreaterThanOrEqual(500);
  });

  it('the tank builds extra threat on top of its swings', () => {
    const sim = makeSim();
    sim.setPlayerLevel(15);
    const tank = hire(sim, 'tank');
    const mob = spawnEnemy(sim, tank.pos.x + 1, tank.pos.z);
    mob.aggroTargetId = tank.id;
    tank.swingTimer = 0;
    updateDungeonCompanion(ctxOf(sim), tank);
    // The stance-style premium alone puts it on the table even before the swing's
    // own damage threat is counted.
    expect(mob.threat.get(tank.id) ?? 0).toBeGreaterThan(0);
    expect(ROLE_KITS.tank.threatMultiplier).toBeGreaterThan(1);
  });

  it('the healer tops up a hurt owner', () => {
    const sim = makeSim();
    sim.setPlayerLevel(15);
    const healer = hire(sim, 'healer');
    const p = sim.player;
    p.hp = Math.round(p.maxHp * 0.4);
    const before = p.hp;
    healer.wanderTimer = 0;
    updateDungeonCompanion(ctxOf(sim), healer);
    expect(p.hp).toBeGreaterThan(before);
  });

  it('the healer answers an emergency immediately rather than on an interval', () => {
    const sim = makeSim();
    sim.setPlayerLevel(15);
    const healer = hire(sim, 'healer');
    const p = sim.player;
    p.hp = Math.round(p.maxHp * 0.9);
    healer.wanderTimer = 0;
    updateDungeonCompanion(ctxOf(sim), healer);
    // A top-off buys a long interval...
    expect(healer.wanderTimer).toBeGreaterThan(1);
    // ...but an emergency resets it to zero, so the very next tick heals again.
    p.hp = Math.round(p.maxHp * 0.1);
    healer.wanderTimer = 0;
    updateDungeonCompanion(ctxOf(sim), healer);
    expect(healer.wanderTimer).toBe(0);
  });

  it('a dps assists the owner target', () => {
    const sim = makeSim();
    sim.setPlayerLevel(15);
    const dps = hire(sim, 'dps');
    const near = spawnEnemy(sim, dps.pos.x + 3, dps.pos.z);
    const far = spawnEnemy(sim, dps.pos.x + 12, dps.pos.z);
    sim.player.targetId = far.id;
    const startX = dps.pos.x;
    updateDungeonCompanion(ctxOf(sim), dps);
    // It walks toward the owner's target, not the closer mob.
    expect(dps.pos.x).toBeGreaterThan(startX);
    expect(near.hp).toBe(near.maxHp);
  });

  it('a companion with nothing to fight falls in behind the owner', () => {
    const sim = makeSim();
    sim.setPlayerLevel(15);
    const dps = hire(sim, 'dps');
    dps.pos.x = sim.player.pos.x + 30;
    dps.pos.z = sim.player.pos.z;
    const before = dps.pos.x;
    updateDungeonCompanion(ctxOf(sim), dps);
    expect(dps.pos.x).toBeLessThan(before);
  });

  it('an orphaned companion despawns itself', () => {
    const sim = makeSim();
    sim.setPlayerLevel(15);
    const dps = hire(sim, 'dps');
    // Forget the party but leave the entity: the brain must not keep running a
    // companion nobody owns.
    ctxOf(sim).companionParties.delete(sim.playerId);
    updateDungeonCompanion(ctxOf(sim), dps);
    expect(sim.entities.has(dps.id)).toBe(false);
  });
});

// The player-facing entry point. It matters that this is an ORDINARY slash command
// on the chat router and not a /dev cheat: ALLOW_DEV_COMMANDS is off in production
// and the owner still has to be able to assemble the party.
describe('companion party: the /hire verb', () => {
  it('hires and dismisses through chat, with dev commands off', () => {
    const sim = new Sim({ seed: 3, playerClass: 'druid', autoEquip: true });
    expect(sim.devCommands).toBe(false);
    sim.setPlayerLevel(15);
    standAtCryptDoor(sim);

    sim.chat('/hire tank');
    sim.chat('/hire');
    const party = companionPartyFor(ctxOf(sim), sim.playerId)!;
    expect(party.members.map((m) => m.role)).toEqual(['tank', 'healer']);

    sim.chat('/hire dismiss');
    expect(companionPartyFor(ctxOf(sim), sim.playerId)).toBeNull();
  });

  it('is refused away from a door, like every other recruit path', () => {
    const sim = new Sim({ seed: 3, playerClass: 'druid', autoEquip: true });
    sim.setPlayerLevel(15);
    teleport(sim, 0, 0);
    sim.player.inCombat = false;
    sim.chat('/hire');
    expect(companionPartyFor(ctxOf(sim), sim.playerId)).toBeNull();
  });
});
