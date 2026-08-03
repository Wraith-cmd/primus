// Reproduction attempt for the 2026-08-02 live report: "the hire party spawned in
// as soon as I logged into the keystone mode, and just started attacking
// everything in sight."
//
// Run mode is the interesting case because it sets `companionsAnywhere`, which
// lifts the dungeon-door gate and therefore hires the party in the OPEN WORLD,
// surrounded by wandering hostiles. Ordinary `/hire` can only happen at a door.
//
// Two competing explanations, and these tests are built to tell them apart:
//   A. The assist gate is broken on the run-mode path, so companions pull
//      unengaged mobs. That would be a defect.
//   B. The gate holds, and what the player saw was wandering mobs aggroing the
//      COMPANIONS first, with the companions correctly fighting back. That would
//      be a consequence of hiring in the open world, i.e. a design question.
//
// Driving the real Sim through the real verbs, per tests/CLAUDE.md.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  companionPartyFor,
  recruitCompanion,
  updateDungeonCompanion,
} from '../src/sim/companions/party';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import type { Entity } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

function ctxOf(sim: Sim): SimContext {
  return (sim as unknown as { ctx: SimContext }).ctx;
}

/** A run-mode Sim: the door gate lifted, exactly as `run_mode.ts` builds it. */
function runSim(): Sim {
  return new Sim({ seed: 7, playerClass: 'warrior', autoEquip: true, companionsAnywhere: true });
}

function teleport(sim: Sim, x: number, z: number): void {
  const p = sim.player;
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = terrainHeight(x, z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
  sim.rebucket(p);
}

/** Hire the run-mode party away from any door, the way `hireParty` does. */
function hireRunParty(sim: Sim): Entity[] {
  sim.player.inCombat = false;
  for (const role of ['tank', 'healer', 'dps', 'dps'] as const) {
    expect(recruitCompanion(ctxOf(sim), role)).toBe(true);
  }
  const party = companionPartyFor(ctxOf(sim), sim.playerId);
  return (party?.members ?? []).map((m) => sim.entities.get(m.entityId)!);
}

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

describe('run mode: do hired companions pull, or only assist?', () => {
  let sim: Sim;
  let companions: Entity[];

  beforeEach(() => {
    sim = runSim();
    sim.setPlayerLevel(15);
    teleport(sim, 0, 0); // open world, nowhere near a dungeon entrance
    companions = hireRunParty(sim);
    expect(companions).toHaveLength(4);
  });

  // EXPLANATION A. If this fails, the assist gate is broken on the run-mode path.
  it('leaves an idle hostile alone: nobody has engaged it', () => {
    const bystander = spawnEnemy(sim, 3, 3);
    const hpBefore = bystander.hp;
    // Nothing has engaged it: it attacks no one, and the owner is neither in
    // combat nor targeting it.
    bystander.aggroTargetId = null;
    sim.player.inCombat = false;
    sim.player.targetId = null;

    for (let i = 0; i < 40; i++) {
      for (const c of companions) updateDungeonCompanion(ctxOf(sim), c);
    }

    expect(bystander.hp, 'an unengaged bystander took damage: companions pulled').toBe(hpBefore);
    expect(
      companions.filter((c) => c.inCombat).length,
      'companions entered combat with nothing engaged',
    ).toBe(0);
  });

  // EXPLANATION B, the control. A mob that attacks a COMPANION is engaged by
  // definition, and fighting back is correct. If this passes alongside the test
  // above, "attacking everything in sight" is the open-world hire surfacing
  // ordinary retaliation, not a broken gate.
  it('fights back when a mob attacks a companion', () => {
    const attacker = spawnEnemy(sim, companions[0].pos.x + 2, companions[0].pos.z);
    const hpBefore = attacker.hp;
    attacker.aggroTargetId = companions[0].id;
    attacker.threat.set(companions[0].id, 500);

    for (let i = 0; i < 40; i++) {
      for (const c of companions) updateDungeonCompanion(ctxOf(sim), c);
    }

    expect(attacker.hp, 'companions ignored a mob actively attacking one of them').toBeLessThan(
      hpBefore,
    );
  });

  // The owner's target is an engagement too (isPartyEngagement), so tab-targeting
  // while in combat legitimately sends the party in. Pinned so the distinction
  // between "assist on my target" and "pull anything nearby" stays explicit.
  it("assists the owner's target while the owner is in combat", () => {
    const mark = spawnEnemy(sim, 3, 0);
    const hpBefore = mark.hp;
    sim.player.inCombat = true;
    sim.player.targetId = mark.id;

    for (let i = 0; i < 40; i++) {
      for (const c of companions) updateDungeonCompanion(ctxOf(sim), c);
    }

    expect(mark.hp, "companions ignored the owner's target in combat").toBeLessThan(hpBefore);
  });

  // THE ANSWER. Everything above drives the companion brain directly, which
  // skips mob AI. Through a REAL tick the picture inverts: a wandering hostile
  // that nobody engaged aggros a COMPANION on proximity (the party is the
  // nearest body, and run mode put it in the open world), the companions
  // retaliate correctly, and the owner is pulled into a fight they never
  // started. From the player's seat that is indistinguishable from "the
  // companions attacked everything in sight", which is what was reported.
  //
  // So the assist gate is NOT broken. The cause is WHERE run mode hires: with
  // `companionsAnywhere` the party stands in the open world instead of at a
  // door or inside the instance. Whether that should change is a design call
  // (see ROADMAP.md); this pins the mechanism so the diagnosis is not
  // re-litigated from scratch.
  it('is aggroed BY the world: a mob picks a companion and the party is dragged in', () => {
    const wanderer = spawnEnemy(sim, 8, 0);
    wanderer.aggroTargetId = null;
    sim.player.inCombat = false;
    sim.player.targetId = null;

    for (let i = 0; i < 200; i++) sim.tick();

    const companionIds = companions.map((c) => c.id);
    expect(
      companionIds.includes(wanderer.aggroTargetId ?? -1),
      'the wandering mob did not pick a companion, so this is no longer the reported mechanism',
    ).toBe(true);
    expect(sim.player.inCombat, 'the owner was not dragged into the fight').toBe(true);
  });

  // The sharper form of the report: a bystander standing near a fight the party
  // IS legitimately in must not get dragged in by proximity.
  it('does not spread to a bystander next to a fight it is not part of', () => {
    const engaged = spawnEnemy(sim, companions[0].pos.x + 2, companions[0].pos.z);
    engaged.aggroTargetId = companions[0].id;
    engaged.threat.set(companions[0].id, 500);

    const bystander = spawnEnemy(sim, companions[0].pos.x + 3, companions[0].pos.z + 1);
    bystander.aggroTargetId = null;
    const bystanderHp = bystander.hp;

    for (let i = 0; i < 40; i++) {
      for (const c of companions) updateDungeonCompanion(ctxOf(sim), c);
    }

    expect(bystander.hp, 'a neighbouring bystander was pulled into an unrelated fight').toBe(
      bystanderHp,
    );
  });
});
