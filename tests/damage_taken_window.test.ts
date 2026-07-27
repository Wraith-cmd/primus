// The rolling damage-taken window (src/sim/combat/damage_history.ts): the ONE
// piece of state that can answer "how much damage did this player eat in the
// last N seconds", as opposed to the LIFETIME `PlayerMeta.counters.damageTaken`.
//
// It predates this suite as Chronomancy's Rewind input; these cases pin the
// contract the Guardian Druid's Savage Mending now also depends on: sim-tick
// keyed (never wall-clock), bounded, exact at the window edges, and fed from
// the single damage-taken site in combat/damage.ts.
import { describe, expect, it } from 'vitest';
import {
  damageTakenWithin,
  pruneDamageHistory,
  recordDamageTaken,
  REWIND_WINDOW_SEC,
  REWIND_WINDOW_TICKS,
} from '../src/sim/combat/damage_history';
import { Sim } from '../src/sim/sim';
import { DT, type Entity } from '../src/sim/types';

function bareTarget(): Entity {
  return { damageHistory: undefined } as unknown as Entity;
}

describe('rolling damage-taken window (unit)', () => {
  it('spans 5 seconds of the fixed 20 Hz clock', () => {
    expect(REWIND_WINDOW_SEC).toBe(5);
    expect(REWIND_WINDOW_TICKS).toBe(REWIND_WINDOW_SEC / DT);
  });

  it('sums only what landed inside the window and forgets the rest', () => {
    const e = bareTarget();
    recordDamageTaken(e, 100, 0);
    recordDamageTaken(e, 30, 40); // 2s later
    recordDamageTaken(e, 7, 100); // 5s after the first hit

    // The tick-100 write pruned everything at or before its own cutoff (tick 0),
    // so the opening hit is gone and only the last 5 seconds remain.
    expect(damageTakenWithin(e, 100)).toBe(37);
    // A narrower query is honored independently of the ring's own pruning.
    expect(damageTakenWithin(e, 100, 20)).toBe(7);

    // Reading BEFORE the aging write still sees the full window.
    const fresh = bareTarget();
    recordDamageTaken(fresh, 100, 0);
    recordDamageTaken(fresh, 30, 40);
    expect(damageTakenWithin(fresh, 99)).toBe(130);
    expect(damageTakenWithin(fresh, 100)).toBe(30);
  });

  it('ignores non-positive amounts (a fully absorbed or avoided hit)', () => {
    const e = bareTarget();
    recordDamageTaken(e, 0, 10);
    recordDamageTaken(e, -5, 10);
    expect(e.damageHistory ?? []).toEqual([]);
    expect(damageTakenWithin(e, 10)).toBe(0);
  });

  it('stays bounded: entries older than the window are pruned on write', () => {
    const e = bareTarget();
    for (let tick = 0; tick < 2000; tick++) recordDamageTaken(e, 1, tick);
    expect(e.damageHistory!.length).toBeLessThanOrEqual(REWIND_WINDOW_TICKS + 1);
    expect(damageTakenWithin(e, 1999)).toBe(REWIND_WINDOW_TICKS);
  });

  it('reads never mutate, so two consumers see the same window', () => {
    const e = bareTarget();
    recordDamageTaken(e, 50, 0);
    recordDamageTaken(e, 50, 10);
    const before = e.damageHistory!.length;
    expect(damageTakenWithin(e, 10)).toBe(100);
    expect(damageTakenWithin(e, 10)).toBe(100);
    expect(e.damageHistory!.length).toBe(before);
  });

  it('prunes a prefix only (entries stay in tick order)', () => {
    const history = [
      { tick: 1, amount: 5 },
      { tick: 150, amount: 9 },
      { tick: 160, amount: 4 },
    ];
    pruneDamageHistory(history, 160);
    expect(history).toEqual([
      { tick: 150, amount: 9 },
      { tick: 160, amount: 4 },
    ]);
  });
});

describe('rolling damage-taken window (fed by the sim)', () => {
  it('the damage-taken site logs real HP loss, and it is not the lifetime counter', () => {
    const sim = new Sim({ seed: 11, playerClass: 'druid', autoEquip: true });
    sim.setPlayerLevel(20);
    for (let i = 0; i < 5; i++) sim.tick();
    const p = sim.player;
    const meta = sim.players.get(sim.playerId)!;

    (sim as any).dealDamage(null, p, 40, false, 'physical', 'test', 'hit', true);
    expect(damageTakenWithin(p, sim.tickCount)).toBe(40);
    expect(meta.counters.damageTaken).toBe(40);

    // Six seconds later the window has forgotten it; the lifetime counter has not.
    for (let i = 0; i < 20 * 6; i++) sim.tick();
    expect(damageTakenWithin(p, sim.tickCount)).toBe(0);
    expect(meta.counters.damageTaken).toBe(40);
  });

  it('is deterministic: the same seeded run yields the same window', () => {
    const run = () => {
      const sim = new Sim({ seed: 7, playerClass: 'druid', autoEquip: true });
      sim.setPlayerLevel(20);
      for (let i = 0; i < 5; i++) sim.tick();
      const p = sim.player;
      for (const amount of [12, 30, 8]) {
        (sim as any).dealDamage(null, p, amount, false, 'physical', 'test', 'hit', true);
        for (let i = 0; i < 10; i++) sim.tick();
      }
      return damageTakenWithin(p, sim.tickCount);
    };
    expect(run()).toBe(run());
    expect(run()).toBeGreaterThan(0);
  });
});
