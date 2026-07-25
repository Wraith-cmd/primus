import { describe, expect, it, vi } from 'vitest';
import {
  createWaterContactFrame,
  createWaterContactPlan,
  updateWaterContact,
  type WaterContactEffects,
  type WaterContactState,
  type WaterContactSurface,
} from '../src/render/water_contact_core';

const makeState = (): WaterContactState => ({
  waterContactSeen: false,
  waterContactActive: false,
  waterContactX: 0,
  waterContactZ: 0,
  waterContactAccum: 0,
});

const makeSurface = (simulationEnabled = true) =>
  ({
    simulationEnabled,
    addSplash: vi.fn(),
    enterContact: vi.fn(),
    moveContact: vi.fn(),
    releaseContact: vi.fn(),
  }) satisfies WaterContactSurface;

const makeEffects = () =>
  ({
    characterWaterSplash: vi.fn(),
    waterWake: vi.fn(),
  }) satisfies WaterContactEffects;

function makeHarness(simulationEnabled = true) {
  const state = makeState();
  const frame = createWaterContactFrame();
  const plan = createWaterContactPlan();
  const surface = makeSurface(simulationEnabled);
  const effects = makeEffects();
  Object.assign(frame, {
    visible: true,
    x: 0,
    y: 0,
    z: 0,
    waterLevel: 0.6,
    bodyHeight: 2,
    facing: Math.PI / 2,
    dt: 1 / 60,
    speed: 0,
  });
  const step = () => updateWaterContact(state, frame, surface, effects, plan);
  return { state, frame, plan, surface, effects, step };
}

describe('water contact orchestration', () => {
  it('seeds visible contacts silently, then dispatches physical enter and release edges', () => {
    const h = makeHarness();
    h.step();
    expect(h.state.waterContactSeen).toBe(true);
    expect(h.state.waterContactActive).toBe(true);
    expect(h.surface.enterContact).not.toHaveBeenCalled();

    h.frame.wasAirborne = true;
    h.frame.airborne = false;
    h.step();
    expect(h.surface.enterContact).toHaveBeenCalledTimes(1);
    expect(h.effects.characterWaterSplash).toHaveBeenCalledTimes(1);

    h.frame.wasAirborne = false;
    h.frame.waterLevel = -Infinity;
    h.step();
    expect(h.surface.releaseContact).toHaveBeenCalledTimes(1);
    expect(h.state.waterContactActive).toBe(false);
  });

  it('holds movement until the 24 Hz cadence and then advances the contact anchor', () => {
    const h = makeHarness();
    h.frame.speed = 2;
    h.step();

    h.frame.x = 0.06;
    h.step();
    h.frame.x = 0.08;
    h.step();
    expect(h.surface.moveContact).not.toHaveBeenCalled();

    h.frame.x = 0.1;
    h.step();
    expect(h.surface.moveContact).toHaveBeenCalledTimes(1);
    expect(h.surface.moveContact).toHaveBeenCalledWith(
      0,
      0,
      0.1,
      0,
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
    expect(h.state.waterContactX).toBe(0.1);
    expect(h.state.waterContactAccum).toBe(0);
  });

  it('re-seats a teleported contact at eight radii instead of drawing a long wake', () => {
    const h = makeHarness();
    h.step();
    const contactRadius = 0.34;
    h.frame.x = contactRadius * 8 + 0.01;
    h.frame.speed = 4;
    h.step();

    expect(h.surface.addSplash).toHaveBeenCalledWith(h.frame.x, 0, contactRadius, 0.7);
    expect(h.surface.moveContact).not.toHaveBeenCalled();
    expect(h.state.waterContactX).toBe(h.frame.x);
  });

  it('emits a lightweight continuous wake only when the height field is unavailable', () => {
    const h = makeHarness(false);
    h.frame.speed = 2;
    h.step();
    h.frame.x = 0.01;
    h.step();
    expect(h.effects.waterWake).toHaveBeenCalledWith(0.01, 0.6, 0, 3 / 60);

    h.surface.simulationEnabled = true;
    h.frame.x = 0.02;
    h.step();
    expect(h.effects.waterWake).toHaveBeenCalledTimes(1);
  });

  it('shapes the swimming contact as a long volume along the facing axis', () => {
    const h = makeHarness();
    h.step(); // seeded wading
    h.frame.swimming = true;
    h.step();
    expect(h.surface.enterContact).toHaveBeenCalledTimes(1);
    const [x, z, radius, halfLength, axisX, axisZ] = h.surface.enterContact.mock.calls[0];
    expect(x).toBe(0);
    expect(z).toBe(0);
    expect(radius).toBeCloseTo(0.34, 10); // clamped floor, bodyHeight * 0.16 is below it
    expect(halfLength).toBeCloseTo(0.6, 10); // bodyHeight * 0.3, far longer than the wading disc
    expect(axisX).toBeCloseTo(1, 10); // facing PI/2 points down +X
    expect(axisZ).toBeCloseTo(0, 10);
  });

  it('never disturbs the surface while dead or sitting, and releases a live contact', () => {
    const h = makeHarness();
    h.step();
    expect(h.state.waterContactActive).toBe(true);
    h.frame.dead = true;
    h.step();
    expect(h.surface.releaseContact).toHaveBeenCalledTimes(1);
    expect(h.state.waterContactActive).toBe(false);
    h.step();
    expect(h.surface.releaseContact).toHaveBeenCalledTimes(1); // not re-released
    expect(h.surface.enterContact).not.toHaveBeenCalled();

    const sitter = makeHarness();
    sitter.frame.sitting = true;
    sitter.step();
    sitter.step();
    expect(sitter.state.waterContactActive).toBe(false);
    expect(sitter.surface.enterContact).not.toHaveBeenCalled();
    expect(sitter.surface.addSplash).not.toHaveBeenCalled();
  });

  it('re-seats on re-entry, so an anchor left on shore cannot drag a wake back', () => {
    const h = makeHarness();
    h.step();
    h.frame.waterLevel = -Infinity; // walks out onto land
    h.step();
    expect(h.state.waterContactActive).toBe(false);
    // The renderer skips this entity entirely while it is outside every lake
    // footprint, so its anchor sits where the exit left it. Walking far away
    // and wading back in must read as a fresh entry, never one enormous move.
    h.frame.x = 400;
    h.frame.z = 400;
    h.frame.waterLevel = 0.6;
    h.step();
    expect(h.surface.enterContact).toHaveBeenCalledTimes(1);
    expect(h.surface.moveContact).not.toHaveBeenCalled();
    expect(h.state.waterContactX).toBe(400);
    expect(h.state.waterContactZ).toBe(400);
  });

  it('forgets culled contacts without a phantom release and seeds them again on return', () => {
    const h = makeHarness();
    h.step();
    h.frame.visible = false;
    h.step();
    expect(h.state.waterContactSeen).toBe(false);
    expect(h.state.waterContactActive).toBe(false);
    expect(h.surface.releaseContact).not.toHaveBeenCalled();

    h.frame.visible = true;
    h.step();
    expect(h.state.waterContactSeen).toBe(true);
    expect(h.state.waterContactActive).toBe(true);
    expect(h.surface.enterContact).not.toHaveBeenCalled();
  });
});
