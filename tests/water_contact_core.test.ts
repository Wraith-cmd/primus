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
