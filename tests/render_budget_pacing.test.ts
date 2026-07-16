import { describe, expect, it } from 'vitest';
import { GFX_BUDGETS } from '../src/render/gfx';
import { RenderBudgetGovernor, type RenderBudgetSample } from '../src/render/render_budget';

function sample(overrides: Partial<RenderBudgetSample> = {}): RenderBudgetSample {
  return {
    dt: 1 / 30,
    frameMs: 33.4,
    totalMs: 8.3,
    submitMs: 4.6,
    calls: 232,
    triangles: 882_236,
    grassVisibleTufts: 2_922,
    grassVisibleChunks: 8,
    activeViews: 25,
    createdViews: 0,
    minRenderScale: 0.65,
    maxRenderScale: 1,
    intentionalFramePacing: true,
    workMs: 8.3,
    ...overrides,
  };
}

function lowGovernor(): RenderBudgetGovernor {
  const governor = new RenderBudgetGovernor({
    tier: 'low',
    budget: GFX_BUDGETS.low,
    enabled: true,
  });
  governor.reset(1, 0.65, 1);
  governor.update(sample({ dt: 0.6, intentionalFramePacing: false, frameMs: 16 }));
  return governor;
}

describe('render budget governor with intentional frame pacing', () => {
  it('treats intentional 30 fps pacing as cheap work instead of an external cap', () => {
    const governor = lowGovernor();

    let state = governor.state();
    for (let i = 0; i < 120; i++) state = governor.update(sample());

    expect(state.externalFrameCap).toBe(false);
    expect(state.mode).toBe('stable');
    expect(state.reason).toBe('stable');
    expect(state.pressure).toBeLessThan(1);
    expect(state.levels).toEqual({ grass: 0.9, foliage: 0.9, vfx: 1, lighting: 1, resolution: 1 });
  });

  it('does not degrade intentional 40 fps pacing as GPU slowness', () => {
    const governor = lowGovernor();

    let state = governor.state();
    for (let i = 0; i < 120; i++) {
      state = governor.update(
        sample({
          dt: 1 / 40,
          frameMs: 25,
          totalMs: 9,
          submitMs: 4,
          calls: 200,
          triangles: 700_000,
          grassVisibleTufts: 2_000,
        }),
      );
    }

    expect(state.externalFrameCap).toBe(false);
    expect(state.mode).toBe('stable');
    expect(state.pressure).toBeLessThan(1);
  });

  it('still degrades expensive render work while pacing is intentional', () => {
    const governor = lowGovernor();

    const state = governor.update(
      sample({
        totalMs: 38,
        workMs: 38,
        submitMs: 24,
        calls: 500,
        triangles: 1_400_000,
        grassVisibleTufts: 3_000,
      }),
    );

    expect(state.externalFrameCap).toBe(false);
    expect(state.mode).toBe('degrading');
    expect(state.levels.foliage).toBeLessThan(0.9);
  });

  it('still degrades expensive non-render frame work while pacing is intentional', () => {
    const governor = lowGovernor();

    const state = governor.update(
      sample({
        frameMs: 33.4,
        workMs: 38,
        totalMs: 8,
        submitMs: 4,
        calls: 200,
        triangles: 700_000,
        grassVisibleTufts: 2_000,
      }),
    );

    expect(state.externalFrameCap).toBe(false);
    expect(state.mode).toBe('degrading');
    expect(state.reason).toBe('frame');
  });

  it('recovers degraded quality under cheap intentional pacing', () => {
    const governor = lowGovernor();
    let state = governor.update(
      sample({
        frameMs: 80,
        workMs: 80,
        totalMs: 80,
        submitMs: 55,
        calls: 600,
        triangles: 1_500_000,
        grassVisibleTufts: 4_000,
      }),
    );
    const degraded = { ...state.levels };
    let sawRecovery = false;

    for (let i = 0; i < 300; i++) {
      state = governor.update(
        sample({
          dt: 1 / 30,
          frameMs: 33.4,
          workMs: 8.3,
          totalMs: 8.3,
          submitMs: 4.6,
          calls: 200,
          triangles: 700_000,
          grassVisibleTufts: 2_000,
        }),
      );
      if (state.mode === 'recovering') sawRecovery = true;
    }

    const recovered = Object.keys(state.levels).some(
      (key) =>
        state.levels[key as keyof typeof state.levels] > degraded[key as keyof typeof degraded],
    );
    expect(sawRecovery).toBe(true);
    expect(state.externalFrameCap).toBe(false);
    expect(recovered).toBe(true);
  });
});
