import { describe, expect, it } from 'vitest';
import {
  EMERGENCY_FRAC,
  HEAL_INTERVAL_BY_URGENCY,
  type HealCandidate,
  planHeal,
  TOP_OFF_FRAC,
  URGENT_FRAC,
  urgencyFor,
} from '../src/sim/companions/heal_triage';

const RANGE = 22;
const ally = (id: number, hpFrac: number, extra: Partial<HealCandidate> = {}): HealCandidate => ({
  id,
  hpFrac,
  distance: 5,
  ...extra,
});

describe('heal urgency bands', () => {
  it('classifies by how close to death the ally is', () => {
    expect(urgencyFor(0.1)).toBe('emergency');
    expect(urgencyFor(EMERGENCY_FRAC - 0.001)).toBe('emergency');
    expect(urgencyFor(EMERGENCY_FRAC)).toBe('urgent');
    expect(urgencyFor(URGENT_FRAC - 0.001)).toBe('urgent');
    expect(urgencyFor(URGENT_FRAC)).toBe('topOff');
    expect(urgencyFor(TOP_OFF_FRAC - 0.001)).toBe('topOff');
    expect(urgencyFor(TOP_OFF_FRAC)).toBe('none');
    expect(urgencyFor(1)).toBe('none');
  });

  it('lets an emergency fire immediately, unlike the old fixed interval', () => {
    expect(HEAL_INTERVAL_BY_URGENCY.emergency).toBe(0);
    expect(HEAL_INTERVAL_BY_URGENCY.urgent).toBeLessThan(HEAL_INTERVAL_BY_URGENCY.topOff);
  });
});

describe('heal triage', () => {
  it('does nothing when the party is topped up', () => {
    const plan = planHeal([ally(1, 1), ally(2, 0.99)], RANGE);
    expect(plan.targetId).toBeNull();
    expect(plan.urgency).toBe('none');
    expect(plan.healFrac).toBe(0);
  });

  it('heals the lowest ally', () => {
    const plan = planHeal([ally(1, 0.8), ally(2, 0.4), ally(3, 0.65)], RANGE);
    expect(plan.targetId).toBe(2);
    expect(plan.urgency).toBe('urgent');
  });

  it('commits a bigger heal the more urgent it is', () => {
    const topOff = planHeal([ally(1, 0.85)], RANGE);
    const urgent = planHeal([ally(1, 0.5)], RANGE);
    const emergency = planHeal([ally(1, 0.15)], RANGE);
    expect(topOff.healFrac).toBeLessThan(urgent.healFrac);
    expect(urgent.healFrac).toBeLessThan(emergency.healFrac);
  });

  it('answers a spike on the tank instead of waiting out an interval', () => {
    // The exact case the fixed-interval healer could not handle.
    const plan = planHeal([ally(1, 0.95), ally(2, 0.12, { isTank: true })], RANGE);
    expect(plan.targetId).toBe(2);
    expect(plan.urgency).toBe('emergency');
    expect(plan.nextIntervalSeconds).toBe(0);
  });

  it('ignores allies out of heal range', () => {
    const plan = planHeal([ally(1, 0.1, { distance: RANGE + 1 }), ally(2, 0.7)], RANGE);
    expect(plan.targetId).toBe(2);
  });

  it('returns no heal when the only hurt ally is out of range', () => {
    expect(planHeal([ally(1, 0.1, { distance: 999 })], RANGE).targetId).toBeNull();
  });

  it('breaks a health tie toward the tank', () => {
    const plan = planHeal([ally(1, 0.5), ally(2, 0.5, { isTank: true })], RANGE);
    expect(plan.targetId).toBe(2);
  });

  it('is order independent, so the sim cannot fork on iteration order', () => {
    const party = [ally(3, 0.5), ally(1, 0.5, { isTank: true }), ally(2, 0.5)];
    const forward = planHeal(party, RANGE);
    const reversed = planHeal([...party].reverse(), RANGE);
    expect(forward).toEqual(reversed);
  });

  it('breaks a full tie by id so repeated ticks stay stable', () => {
    const plan = planHeal([ally(7, 0.5), ally(2, 0.5), ally(5, 0.5)], RANGE);
    expect(plan.targetId).toBe(2);
  });

  it('handles an empty party', () => {
    expect(planHeal([], RANGE).targetId).toBeNull();
  });
});
