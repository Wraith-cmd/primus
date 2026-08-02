// Paired unit test for src/sim/combat/cast_queue.ts (the pure spell-queue policy)
// plus the behaviour it buys through a real Sim: a press made inside the tail of
// the GLOBAL COOLDOWN is remembered and fires the instant the GCD clears, instead
// of being dropped on the floor. The cast-bar half of the queue was already
// covered by tests/combat_casting_lifecycle.test.ts; this file covers the GCD half
// (the common case in play, since most presses follow an instant), the single-slot
// rule, the quiet drop of a press that went stale, and the tick measurement.

import { describe, expect, it } from 'vitest';
import {
  needsLivingTargetToQueue,
  queuedCastStillValid,
  shouldQueueOnGcd,
  withinCastQueueWindow,
} from '../src/sim/combat/cast_queue';
import { castAbility } from '../src/sim/combat/casting_lifecycle';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { AbilityDef, Entity, PlayerClass } from '../src/sim/types';
import { CAST_QUEUE_WINDOW_SEC, CAST_QUEUE_WINDOW_TICKS, DT } from '../src/sim/types';
import { placePlayerInOpenField } from './helpers/open_field';

type AnySim = Sim & Record<string, any>;
type AnyEntity = Entity & Record<string, any>;

function makeSim(cls: PlayerClass, level: number): { sim: AnySim; p: AnyEntity } {
  const sim = new Sim({ seed: 99, playerClass: cls, autoEquip: true }) as AnySim;
  sim.setPlayerLevel(level);
  placePlayerInOpenField(sim);
  const p = sim.player as AnyEntity;
  p.resource = p.maxResource;
  return { sim, p };
}

// An idle hostile target in range + faced, so an offensive cast passes its guards.
function spawnTarget(sim: AnySim, p: AnyEntity, dz = 6): AnyEntity {
  const mob = createMob(sim.nextId++, MOBS.forest_wolf, 1, {
    x: p.pos.x,
    y: p.pos.y,
    z: p.pos.z + dz,
  }) as AnyEntity;
  mob.maxHp = 500000;
  mob.hp = 500000;
  mob.hostile = true;
  mob.aiState = 'idle';
  sim.addEntity(mob);
  p.facing = Math.atan2(mob.pos.x - p.pos.x, mob.pos.z - p.pos.z);
  sim.targetEntity(mob.id, p.id);
  return mob;
}

/** Collect every event the sim emits while `fn` runs, so a test can prove an
 *  error toast was or was NOT produced. */
function captureEvents(sim: AnySim, fn: () => void): Array<Record<string, any>> {
  const seen: Array<Record<string, any>> = [];
  // Same emit-intercept idiom as tests/combat_casting_lifecycle.test.ts.
  const orig = (sim as any).emit.bind(sim);
  (sim as any).emit = (e: Record<string, any>) => {
    seen.push(e);
    orig(e);
  };
  try {
    fn();
  } finally {
    (sim as any).emit = orig;
  }
  return seen;
}

const def = (over: Partial<AbilityDef> = {}): AbilityDef =>
  ({ requiresTarget: false, ...over }) as AbilityDef;

describe('cast_queue: the window is measured in ticks, not wall-clock time', () => {
  it('derives the seconds threshold from an exact tick count', () => {
    expect(CAST_QUEUE_WINDOW_TICKS).toBe(8);
    // The multiply is exact in binary floating point, so the seconds form still
    // lands precisely on a tick boundary rather than a hair either side of one.
    expect(CAST_QUEUE_WINDOW_SEC).toBe(CAST_QUEUE_WINDOW_TICKS * DT);
    expect(CAST_QUEUE_WINDOW_SEC).toBe(0.4);
  });

  it('accepts exactly CAST_QUEUE_WINDOW_TICKS of remaining clock and no more', () => {
    // Walk whole DT steps, the only way a sim clock can ever be sampled: the
    // boundary must fall between tick 8 and tick 9, independent of frame rate.
    expect(withinCastQueueWindow(CAST_QUEUE_WINDOW_TICKS * DT)).toBe(true);
    expect(withinCastQueueWindow((CAST_QUEUE_WINDOW_TICKS - 1) * DT)).toBe(true);
    expect(withinCastQueueWindow((CAST_QUEUE_WINDOW_TICKS + 1) * DT)).toBe(false);
  });

  it('is frame-rate independent: the same tick count queues at any wall-clock pace', () => {
    // Two "hosts" sampling the same DT-decremented clock at wildly different real
    // world rates see identical answers, because no term is wall-clock derived.
    const clockAfter = (ticks: number) => Math.max(0, 40 * DT - ticks * DT);
    for (const ticks of [0, 16, 31, 32, 33, 40]) {
      const a = withinCastQueueWindow(clockAfter(ticks));
      const b = withinCastQueueWindow(clockAfter(ticks));
      expect(a).toBe(b);
    }
    // 40 - 32 = 8 ticks left: inside. 40 - 31 = 9 ticks left: outside.
    expect(withinCastQueueWindow(clockAfter(32))).toBe(true);
    expect(withinCastQueueWindow(clockAfter(31))).toBe(false);
  });
});

describe('cast_queue: shouldQueueOnGcd policy', () => {
  it('queues a press inside the tail of the GCD', () => {
    expect(shouldQueueOnGcd({ gcdRemaining: 4 * DT, offGcd: false })).toBe(true);
  });

  it('refuses a press made too early in the GCD', () => {
    expect(shouldQueueOnGcd({ gcdRemaining: 20 * DT, offGcd: false })).toBe(false);
  });

  it('never queues when the GCD is already clear (cast now, do not queue)', () => {
    expect(shouldQueueOnGcd({ gcdRemaining: 0, offGcd: false })).toBe(false);
  });

  it('never queues an off-GCD ability: it was never blocked in the first place', () => {
    expect(shouldQueueOnGcd({ gcdRemaining: 4 * DT, offGcd: true })).toBe(false);
  });
});

describe('cast_queue: queuedCastStillValid policy', () => {
  const base = {
    casterDead: false,
    needsLivingTarget: true,
    targetMissing: false,
    targetDead: false,
  };

  it('holds a press aimed at a living target', () => {
    expect(queuedCastStillValid(base)).toBe(true);
  });

  it('drops a press whose target died while the queue ran', () => {
    expect(queuedCastStillValid({ ...base, targetDead: true })).toBe(false);
  });

  it('drops a press whose target vanished entirely', () => {
    expect(queuedCastStillValid({ ...base, targetMissing: true })).toBe(false);
  });

  it('drops every queued press once the caster is dead', () => {
    expect(queuedCastStillValid({ ...base, casterDead: true })).toBe(false);
  });

  it('keeps a targetless ability valid with no target at all', () => {
    expect(queuedCastStillValid({ ...base, needsLivingTarget: false, targetMissing: true })).toBe(
      true,
    );
  });

  it('treats only hostile-target abilities as needing a living target', () => {
    expect(needsLivingTargetToQueue(def({ requiresTarget: true }))).toBe(true);
    expect(needsLivingTargetToQueue(def({ requiresTarget: true, targetType: 'any' }))).toBe(true);
    // friendly abilities self-cast when the target is gone, so a missing one is fine
    expect(needsLivingTargetToQueue(def({ requiresTarget: true, targetType: 'friendly' }))).toBe(
      false,
    );
    // combat res deliberately wants a dead target
    expect(needsLivingTargetToQueue(def({ requiresTarget: true, targetsDead: true }))).toBe(false);
    expect(needsLivingTargetToQueue(def({ requiresTarget: false }))).toBe(false);
  });
});

describe('cast_queue: the GCD arm through a real Sim', () => {
  // Icebind (frost_nova) is an instant, on-GCD, spec-agnostic, targetless mage
  // ability: pressing it leaves a running GCD with NO cast bar, which is exactly
  // the case that used to throw the follow-up press away.
  const INSTANT = 'frost_nova';

  const armGcd = (sim: AnySim, p: AnyEntity) => {
    castAbility(sim.ctx, INSTANT, p.id);
    expect(p.castingAbility).toBeNull(); // instant: no cast bar to queue against
    expect(p.gcdRemaining).toBeGreaterThan(0);
  };

  it('remembers a press made inside the GCD tail and fires it when the GCD ends', () => {
    const { sim, p } = makeSim('mage', 20);
    spawnTarget(sim, p);
    armGcd(sim, p);

    // drain the GCD down into the queue window
    while (p.gcdRemaining > CAST_QUEUE_WINDOW_SEC) sim.tick();
    expect(p.gcdRemaining).toBeGreaterThan(0); // still busy: a live press would be refused

    p.resource = p.maxResource;
    castAbility(sim.ctx, 'fireball', p.id);
    expect(p.queuedCastAbility).toBe('fireball'); // remembered, not dropped
    expect(p.castingAbility).toBeNull(); // and it has NOT jumped the GCD

    // the queued press fires on its own once the GCD clears
    let guard = 0;
    while (p.queuedCastAbility && guard++ < 40) sim.tick();
    expect(p.queuedCastAbility).toBeNull();
    expect(p.castingAbility).toBe('fireball');
  });

  it('still refuses a press made outside the window, exactly as before', () => {
    const { sim, p } = makeSim('mage', 20);
    spawnTarget(sim, p);
    armGcd(sim, p);
    expect(p.gcdRemaining).toBeGreaterThan(CAST_QUEUE_WINDOW_SEC);

    const events = captureEvents(sim, () => castAbility(sim.ctx, 'fireball', p.id));
    expect(p.queuedCastAbility).toBeNull(); // dropped, not queued
    expect(p.castingAbility).toBeNull(); // and certainly not cast
    // the early press stays SILENT, the long-standing classic behaviour
    expect(events.some((e) => e.type === 'error')).toBe(false);
  });

  it('keeps a single slot: a later press inside the window replaces the earlier one', () => {
    const { sim, p } = makeSim('mage', 20);
    spawnTarget(sim, p);
    armGcd(sim, p);
    while (p.gcdRemaining > CAST_QUEUE_WINDOW_SEC) sim.tick();

    p.resource = p.maxResource;
    castAbility(sim.ctx, 'fireball', p.id);
    expect(p.queuedCastAbility).toBe('fireball');
    castAbility(sim.ctx, 'frostbolt', p.id);
    expect(p.queuedCastAbility).toBe('frostbolt'); // replaced, not stacked behind

    let guard = 0;
    while (p.queuedCastAbility && guard++ < 40) sim.tick();
    expect(p.castingAbility).toBe('frostbolt'); // only the last press ever fires
  });

  it('drops a queued press quietly when its target died before the GCD ended', () => {
    const { sim, p } = makeSim('mage', 20);
    const mob = spawnTarget(sim, p);
    armGcd(sim, p);
    while (p.gcdRemaining > CAST_QUEUE_WINDOW_SEC) sim.tick();

    p.resource = p.maxResource;
    castAbility(sim.ctx, 'fireball', p.id);
    expect(p.queuedCastAbility).toBe('fireball');

    mob.hp = 0;
    mob.dead = true;

    const events = captureEvents(sim, () => {
      let guard = 0;
      while (p.queuedCastAbility && guard++ < 40) sim.tick();
    });
    expect(p.queuedCastAbility).toBeNull(); // slot released
    expect(p.castingAbility).toBeNull(); // and the stale press never fired
    expect(events.some((e) => e.type === 'error')).toBe(false); // dropped QUIETLY
  });

  it('drops a queued press that can no longer be paid for, and does not fire it', () => {
    const { sim, p } = makeSim('mage', 20);
    spawnTarget(sim, p);
    armGcd(sim, p);
    while (p.gcdRemaining > CAST_QUEUE_WINDOW_SEC) sim.tick();

    p.resource = p.maxResource;
    castAbility(sim.ctx, 'fireball', p.id);
    expect(p.queuedCastAbility).toBe('fireball');

    p.resource = 0; // the mana is gone by the time the queue comes due

    let guard = 0;
    while (p.queuedCastAbility && guard++ < 40) sim.tick();
    expect(p.queuedCastAbility).toBeNull();
    expect(p.castingAbility).toBeNull(); // refused, never cast
  });

  it('does not let a queued press jump the GCD it was queued against', () => {
    const { sim, p } = makeSim('mage', 20);
    spawnTarget(sim, p);
    armGcd(sim, p);
    while (p.gcdRemaining > CAST_QUEUE_WINDOW_SEC) sim.tick();

    p.resource = p.maxResource;
    castAbility(sim.ctx, 'fireball', p.id);
    // every tick while the GCD still runs, the press stays held rather than firing
    while (p.gcdRemaining > 0) {
      expect(p.castingAbility).toBeNull();
      sim.tick();
    }
  });

  it('is deterministic: the same queued sequence replays identically', () => {
    const run = () => {
      const { sim, p } = makeSim('mage', 20);
      spawnTarget(sim, p);
      castAbility(sim.ctx, INSTANT, p.id);
      while (p.gcdRemaining > CAST_QUEUE_WINDOW_SEC) sim.tick();
      p.resource = p.maxResource;
      castAbility(sim.ctx, 'fireball', p.id);
      for (let i = 0; i < 60; i++) sim.tick();
      return { hp: p.hp, resource: p.resource, casting: p.castingAbility, tick: sim.tickCount };
    };
    expect(run()).toEqual(run());
  });
});
