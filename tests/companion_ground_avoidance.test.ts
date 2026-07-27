import { describe, expect, it } from 'vitest';
import {
  AVOID_MARGIN,
  dangerAt,
  type GroundHazard,
  isInDanger,
  planGroundAvoidance,
} from '../src/sim/companions/ground_avoidance';

const fire = (id: number, x: number, z: number, radius: number): GroundHazard => ({
  id,
  x,
  z,
  radius,
  hostile: true,
});

const rune = (id: number, x: number, z: number, radius: number): GroundHazard => ({
  id,
  x,
  z,
  radius,
  hostile: false,
});

const at = (x: number, z: number) => ({ x, z });

describe('ground danger', () => {
  it('counts only hostile zones, and only within the safety margin', () => {
    const hazards = [fire(1, 0, 0, 5), rune(2, 0, 0, 30)];
    expect(dangerAt(0, 0, hazards)).toBe(1);
    expect(dangerAt(0, 5 + AVOID_MARGIN + 0.01, hazards)).toBe(0);
    // Inside the raw radius but outside is not the question: the margin is part
    // of "in danger", because a pulse edge is not a place to stand.
    expect(dangerAt(0, 5.5, hazards)).toBe(1);
  });

  it('reports overlapping puddles as more dangerous than one', () => {
    expect(dangerAt(0, 0, [fire(1, 0, 0, 5), fire(2, 1, 0, 5)])).toBe(2);
  });

  it('is false with no hazards at all', () => {
    expect(isInDanger(at(3, 4), [])).toBe(false);
  });
});

describe('ground avoidance', () => {
  it('does not move when nothing hostile covers the companion', () => {
    expect(planGroundAvoidance(at(20, 20), [fire(1, 0, 0, 5)])).toBeNull();
  });

  it('does not move for a friendly zone', () => {
    // Rune of Power style ally buff: standing in it is the point.
    expect(planGroundAvoidance(at(0, 0), [rune(1, 0, 0, 8)])).toBeNull();
  });

  it('steps out of a puddle it is standing in', () => {
    const hazards = [fire(1, 0, 0, 5)];
    const move = planGroundAvoidance(at(2, 0), hazards);
    expect(move).not.toBeNull();
    if (!move) return;
    expect(move.safe).toBe(true);
    expect(dangerAt(move.x, move.z, hazards)).toBe(0);
  });

  it('takes the shortest way out rather than fleeing to infinity', () => {
    const hazards = [fire(1, 0, 0, 5)];
    // Standing 4 out along +x: the rim plus margin is 6.5 out, so the exit is a
    // 2.5 unit sidestep in the same direction, not a sprint.
    const move = planGroundAvoidance(at(4, 0), hazards);
    expect(move).not.toBeNull();
    if (!move) return;
    expect(move.x).toBeCloseTo(5 + AVOID_MARGIN, 6);
    expect(move.z).toBeCloseTo(0, 6);
    expect(move.distance).toBeCloseTo(1 + AVOID_MARGIN, 6);
  });

  it('clears every hazard when two puddles overlap', () => {
    const hazards = [fire(1, 0, 0, 6), fire(2, 7, 0, 6)];
    const move = planGroundAvoidance(at(3.5, 0), hazards);
    expect(move).not.toBeNull();
    if (!move) return;
    expect(move.safe).toBe(true);
    expect(dangerAt(move.x, move.z, hazards)).toBe(0);
  });

  it('prefers an exit that keeps the current target in range', () => {
    const hazards = [fire(1, 0, 0, 5)];
    // Dead centre, so every exit costs the same walk: the anchor is what decides.
    const anchor = { x: 0, z: 12, range: 8 };
    const move = planGroundAvoidance(at(0, 0), hazards, anchor);
    expect(move).not.toBeNull();
    if (!move) return;
    expect(move.keepsAnchor).toBe(true);
    expect(move.z).toBeGreaterThan(0); // it left toward the target, not away
    const toAnchor = Math.hypot(move.x - anchor.x, move.z - anchor.z);
    expect(toAnchor).toBeLessThanOrEqual(anchor.range);
  });

  it('still leaves the fire when no exit can hold range', () => {
    const hazards = [fire(1, 0, 0, 5)];
    // A target far outside any reachable exit: dodging wins over holding range.
    const move = planGroundAvoidance(at(1, 0), hazards, { x: 60, z: 0, range: 5 });
    expect(move).not.toBeNull();
    if (!move) return;
    expect(move.safe).toBe(true);
    expect(move.keepsAnchor).toBe(false);
  });

  it('stays put when nothing better is reachable within one step', () => {
    // A room-sized zone: no exit inside the step budget, so the caller keeps
    // doing whatever it was doing instead of starting a hopeless run.
    expect(planGroundAvoidance(at(0, 0), [fire(1, 0, 0, 40)], null, { maxStep: 5 })).toBeNull();
  });

  it('takes a partial improvement when it cannot get fully clear', () => {
    // A small puddle inside a huge one. Leaving the room is out of reach, but
    // stepping off the small puddle halves the damage taken, which is what a
    // player does.
    const hazards = [fire(1, 0, 0, 3), fire(2, 0, 0, 20)];
    const move = planGroundAvoidance(at(0.5, 0), hazards, null, { maxStep: 10 });
    expect(move).not.toBeNull();
    if (!move) return;
    expect(move.safe).toBe(false);
    expect(dangerAt(move.x, move.z, hazards)).toBe(1);
  });

  it('prefers a friendly zone when two exits are otherwise identical', () => {
    const hazards = [fire(1, 0, 0, 5), rune(2, 0, 20, 14)];
    const move = planGroundAvoidance(at(0, 0), hazards);
    expect(move).not.toBeNull();
    if (!move) return;
    expect(move.safe).toBe(true);
    expect(move.z).toBeGreaterThan(0); // stepped out on the buffed side
  });

  it('is order independent, so the sim cannot fork on hazard iteration order', () => {
    const hazards = [fire(3, 0, 0, 6), fire(1, 7, 1, 5), rune(2, -6, -6, 4), fire(9, -3, 4, 4)];
    const anchor = { x: 10, z: 10, range: 12 };
    const forward = planGroundAvoidance(at(1, 1), hazards, anchor);
    const reversed = planGroundAvoidance(at(1, 1), [...hazards].reverse(), anchor);
    expect(forward).toEqual(reversed);
    expect(forward).not.toBeNull();
  });

  it('returns the same answer for the same state on every tick', () => {
    const hazards = [fire(1, 2, 2, 7), fire(2, -4, 1, 5)];
    const first = planGroundAvoidance(at(0, 0), hazards, { x: 5, z: 5, range: 10 });
    const second = planGroundAvoidance(at(0, 0), hazards, { x: 5, z: 5, range: 10 });
    expect(first).toEqual(second);
  });

  it('handles an empty hazard list', () => {
    expect(planGroundAvoidance(at(0, 0), [])).toBeNull();
  });
});
