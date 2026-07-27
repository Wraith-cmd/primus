import { describe, expect, it } from 'vitest';
import {
  CAST_THREAT_RANK,
  canLandInterrupt,
  classifyCast,
  type HostileCast,
  INTERRUPT_LAND_MARGIN,
  INTERRUPT_REACTION_SECONDS,
  type InterruptState,
  interruptTimeToLand,
  planInterrupt,
} from '../src/sim/companions/interrupt_policy';

const caster = (id: number, abilityId: string, extra: Partial<HostileCast> = {}): HostileCast => ({
  id,
  abilityId,
  castRemaining: 2,
  castTotal: 2,
  distance: 4,
  ...extra,
});

// In range of the kick, standing still, ready to go.
const READY: InterruptState = { ready: true, range: 8 };

describe('cast danger ranking', () => {
  it('puts a heal or a summon above raw damage', () => {
    expect(classifyCast(caster(1, 'spirit_mending'))).toBe('critical');
    expect(classifyCast(caster(1, 'raise_dead'))).toBe('critical');
    expect(classifyCast(caster(1, 'shadow_bolt'))).toBe('serious');
    expect(CAST_THREAT_RANK.critical).toBeGreaterThan(CAST_THREAT_RANK.serious);
  });

  it('knows the Nythraxis healer channel by name', () => {
    expect(classifyCast(caster(1, 'nythraxis_spirit_mending'))).toBe('critical');
  });

  it('never ranks a cast on a caster that cannot be interrupted', () => {
    expect(classifyCast(caster(1, 'thunzharr_stormcall'))).toBe('ignore');
    expect(classifyCast(caster(1, 'nythraxis_heroic_summon'))).toBe('ignore');
    expect(classifyCast(caster(1, 'spirit_mending', { interruptible: false }))).toBe('ignore');
  });

  it('treats an unknown long cast as a real spell and a short one as filler', () => {
    expect(classifyCast(caster(1, 'strange_ritual', { castTotal: 3 }))).toBe('serious');
    expect(classifyCast(caster(1, 'strange_ritual', { castTotal: 0.8 }))).toBe('minor');
  });

  it('ignores an entity that is not really casting', () => {
    expect(classifyCast(caster(1, ''))).toBe('ignore');
  });
});

describe('interrupt reachability', () => {
  it('costs only the reaction when the caster is already in range', () => {
    expect(interruptTimeToLand(caster(1, 'shadow_bolt', { distance: 8 }), READY)).toBeCloseTo(
      INTERRUPT_REACTION_SECONDS,
      6,
    );
  });

  it('adds the travel time for the part of the gap the range does not cover', () => {
    const state: InterruptState = { ready: true, range: 8, closeSpeed: 7 };
    const time = interruptTimeToLand(caster(1, 'shadow_bolt', { distance: 22 }), state);
    expect(time).toBeCloseTo(INTERRUPT_REACTION_SECONDS + 2, 6);
  });

  it('is unreachable when the caster is out of range and the companion will not chase', () => {
    expect(interruptTimeToLand(caster(1, 'shadow_bolt', { distance: 30 }), READY)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it('refuses a cast that finishes before the kick would land', () => {
    const state: InterruptState = { ready: true, range: 8, closeSpeed: 7 };
    const nearlyDone = caster(1, 'shadow_bolt', { distance: 22, castRemaining: 1 });
    expect(canLandInterrupt(nearlyDone, state)).toBe(false);
    const stillTime = caster(1, 'shadow_bolt', { distance: 22, castRemaining: 3 });
    expect(canLandInterrupt(stillTime, state)).toBe(true);
  });

  it('does not count a cast that ends on the exact tick the kick lands', () => {
    const onTheEdge = caster(1, 'shadow_bolt', {
      castRemaining: INTERRUPT_REACTION_SECONDS + INTERRUPT_LAND_MARGIN - 0.01,
    });
    expect(canLandInterrupt(onTheEdge, READY)).toBe(false);
  });
});

describe('interrupt policy', () => {
  it('holds the interrupt while it is on cooldown', () => {
    const plan = planInterrupt([caster(1, 'spirit_mending')], { ready: false, range: 8 });
    expect(plan).toBeNull();
  });

  it('does nothing when nobody is casting', () => {
    expect(planInterrupt([], READY)).toBeNull();
  });

  it('kicks a dangerous cast in range', () => {
    const plan = planInterrupt([caster(4, 'spirit_mending')], READY);
    expect(plan).not.toBeNull();
    if (!plan) return;
    expect(plan.targetId).toBe(4);
    expect(plan.threat).toBe('critical');
    expect(plan.slack).toBeGreaterThan(0);
  });

  it('spends the cooldown on the heal, not the nuke', () => {
    const plan = planInterrupt([caster(1, 'shadow_bolt'), caster(2, 'spirit_mending')], READY);
    expect(plan?.targetId).toBe(2);
  });

  it('leaves filler casts alone by default and takes them when told to', () => {
    const filler = [caster(1, 'twitch', { castTotal: 0.5 })];
    expect(planInterrupt(filler, READY)).toBeNull();
    expect(planInterrupt(filler, { ...READY, minThreat: 'minor' })?.targetId).toBe(1);
  });

  it('never wastes the cooldown on a boss cast it cannot stop', () => {
    const plan = planInterrupt(
      [caster(1, 'thunzharr_stormcall'), caster(2, 'nythraxis_deathless_rage')],
      READY,
    );
    expect(plan).toBeNull();
  });

  it('skips the cast that will be over before it arrives and takes the one it can reach', () => {
    const state: InterruptState = { ready: true, range: 5, closeSpeed: 7 };
    // The heal is 40 units away with 0.5s left: unreachable, and kicking at it
    // would burn the cooldown the reachable bolt needs.
    const plan = planInterrupt(
      [
        caster(1, 'spirit_mending', { distance: 40, castRemaining: 0.5 }),
        caster(2, 'shadow_bolt', { distance: 5, castRemaining: 1.5 }),
      ],
      state,
    );
    expect(plan?.targetId).toBe(2);
  });

  it('returns nothing when every worthwhile cast finishes first', () => {
    const plan = planInterrupt(
      [
        caster(1, 'spirit_mending', { castRemaining: 0.05 }),
        caster(2, 'shadow_bolt', {
          distance: 40,
          castRemaining: 0.4,
        }),
      ],
      READY,
    );
    expect(plan).toBeNull();
  });

  it('takes the cast landing soonest when two are equally dangerous', () => {
    const plan = planInterrupt(
      [
        caster(1, 'spirit_mending', { castRemaining: 2.5 }),
        caster(2, 'raise_dead', { castRemaining: 1.2 }),
      ],
      READY,
    );
    expect(plan?.targetId).toBe(2);
  });

  it('breaks a full tie by distance, then by id', () => {
    const byDistance = planInterrupt(
      [caster(1, 'spirit_mending', { distance: 6 }), caster(2, 'spirit_mending', { distance: 3 })],
      READY,
    );
    expect(byDistance?.targetId).toBe(2);
    const byId = planInterrupt([caster(7, 'spirit_mending'), caster(3, 'spirit_mending')], READY);
    expect(byId?.targetId).toBe(3);
  });

  it('is order independent, so the sim cannot fork on scan order', () => {
    const casts = [
      caster(5, 'shadow_bolt', { castRemaining: 1.4 }),
      caster(2, 'spirit_mending', { castRemaining: 2 }),
      caster(9, 'raise_dead', { castRemaining: 2 }),
      caster(1, 'thunzharr_stormcall'),
    ];
    const forward = planInterrupt(casts, READY);
    const reversed = planInterrupt([...casts].reverse(), READY);
    expect(forward).toEqual(reversed);
    expect(forward).not.toBeNull();
  });

  it('accepts a caller supplied ranking', () => {
    // An encounter that wants its own ordering passes a classifier instead of
    // editing the shared table.
    const plan = planInterrupt(
      [caster(1, 'shadow_bolt'), caster(2, 'spirit_mending')],
      READY,
      (c) => (c.abilityId === 'shadow_bolt' ? 'critical' : 'minor'),
    );
    expect(plan?.targetId).toBe(1);
  });

  it('ignores an entity whose cast has already finished', () => {
    expect(planInterrupt([caster(1, 'spirit_mending', { castRemaining: 0 })], READY)).toBeNull();
  });
});
