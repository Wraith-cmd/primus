import { describe, expect, it } from 'vitest';
import { FramePacer, pacedFrameRateFor } from '../src/game/frame_pacer';

function stepAtRate(
  pacer: FramePacer,
  sourceFps: number,
  callbacks: number,
  startMs = 0,
): { nowMs: number; rendered: number; maxConsecutiveSkips: number } {
  let nowMs = startMs;
  let rendered = 0;
  let consecutiveSkips = 0;
  let maxConsecutiveSkips = 0;
  const intervalMs = 1000 / sourceFps;
  for (let i = 0; i < callbacks; i++) {
    nowMs += intervalMs;
    if (pacer.step(nowMs).shouldRun) {
      rendered++;
      consecutiveSkips = 0;
    } else {
      consecutiveSkips++;
      maxConsecutiveSkips = Math.max(maxConsecutiveSkips, consecutiveSkips);
    }
  }
  return { nowMs, rendered, maxConsecutiveSkips };
}

function stepWithMissedVsyncWork(
  pacer: FramePacer,
  panelFps: number,
  callbacks: number,
  startMs: number,
): { nowMs: number; rendered: number; elapsedMs: number } {
  let nowMs = startMs;
  let rendered = 0;
  let previousFrameRan = false;
  const panelIntervalMs = 1000 / panelFps;

  for (let i = 0; i < callbacks; i++) {
    nowMs += panelIntervalMs * (previousFrameRan ? 2 : 1);
    const decision = pacer.step(nowMs);
    previousFrameRan = decision.shouldRun;
    if (decision.shouldRun) rendered++;
  }

  return { nowMs, rendered, elapsedMs: nowMs - startMs };
}

describe('mobile frame pacer', () => {
  it('selects the highest panel divisor at or below the frame-rate ceiling', () => {
    expect(pacedFrameRateFor(60, 60)).toBeCloseTo(60);
    expect(pacedFrameRateFor(90, 60)).toBeCloseTo(45);
    expect(pacedFrameRateFor(120, 60)).toBeCloseTo(60);
    expect(pacedFrameRateFor(144, 60)).toBeCloseTo(48);
    expect(pacedFrameRateFor(165, 60)).toBeCloseTo(55);
  });

  it('renders every callback when pacing is disabled', () => {
    const pacer = new FramePacer({ enabled: false, maxFps: 60 });
    const result = stepAtRate(pacer, 120, 240);

    expect(result.rendered).toBe(240);
    expect(pacer.snapshot().intentionallyPaced).toBe(false);
  });

  it('follows live interface-mode changes and recalibrates on each transition', () => {
    const pacer = new FramePacer({ enabled: false, maxFps: 60 });
    const desktop = stepAtRate(pacer, 120, 30);

    pacer.setEnabled(true);
    const touchWarmup = stepAtRate(pacer, 120, 30, desktop.nowMs);
    const touch = stepAtRate(pacer, 120, 120, touchWarmup.nowMs);
    expect(touch.rendered).toBeGreaterThanOrEqual(59);
    expect(touch.rendered).toBeLessThanOrEqual(61);
    expect(pacer.snapshot().intentionallyPaced).toBe(true);

    pacer.setEnabled(false);
    const desktopAgain = stepAtRate(pacer, 120, 30, touch.nowMs);
    expect(desktopAgain.rendered).toBe(30);
    expect(pacer.snapshot().intentionallyPaced).toBe(false);
    expect(pacer.snapshot().estimatedRefreshFps).toBeCloseTo(120, 0);
  });

  it('decimates 120 Hz callbacks to a stable 60 fps cadence', () => {
    const pacer = new FramePacer({ enabled: true, maxFps: 60 });
    const warmup = stepAtRate(pacer, 120, 30);
    const steady = stepAtRate(pacer, 120, 240, warmup.nowMs);
    const snapshot = pacer.snapshot();

    expect(steady.rendered).toBeGreaterThanOrEqual(119);
    expect(steady.rendered).toBeLessThanOrEqual(121);
    expect(snapshot.estimatedRefreshFps).toBeCloseTo(120, 0);
    expect(snapshot.targetFps).toBeCloseTo(60, 0);
    expect(snapshot.intentionallyPaced).toBe(true);
  });

  it('uses 45 fps on a 90 Hz panel instead of a juddering 60 fps pattern', () => {
    const pacer = new FramePacer({ enabled: true, maxFps: 60 });
    const warmup = stepAtRate(pacer, 90, 30);
    const steady = stepAtRate(pacer, 90, 180, warmup.nowMs);
    const snapshot = pacer.snapshot();

    expect(steady.rendered).toBeGreaterThanOrEqual(89);
    expect(steady.rendered).toBeLessThanOrEqual(91);
    expect(snapshot.estimatedRefreshFps).toBeCloseTo(90, 0);
    expect(snapshot.targetFps).toBeCloseTo(45, 0);
  });

  it('keeps a 60 Hz source at 60 fps without unnecessary decimation', () => {
    const pacer = new FramePacer({ enabled: true, maxFps: 60 });
    const result = stepAtRate(pacer, 60, 120);
    const snapshot = pacer.snapshot();

    expect(result.rendered).toBe(120);
    expect(snapshot.estimatedRefreshFps).toBeCloseTo(60, 0);
    expect(snapshot.targetFps).toBeCloseTo(60, 0);
    expect(snapshot.intentionallyPaced).toBe(false);
  });

  it('does not decimate an existing 30 fps browser or low-power cap', () => {
    const pacer = new FramePacer({ enabled: true, maxFps: 60 });
    const result = stepAtRate(pacer, 30, 120);
    const snapshot = pacer.snapshot();

    expect(result.rendered).toBe(120);
    expect(snapshot.estimatedRefreshFps).toBeCloseTo(30, 0);
    expect(snapshot.targetFps).toBeCloseTo(30, 0);
    expect(snapshot.intentionallyPaced).toBe(false);
  });

  it('carries timing remainder instead of drifting under callback jitter', () => {
    const pacer = new FramePacer({ enabled: true, maxFps: 60 });
    const jitterMs = [7.7, 8.8, 8.1, 8.6, 8.2, 8.5];
    let nowMs = 0;
    let rendered = 0;

    for (let i = 0; i < 36; i++) {
      nowMs += jitterMs[i % jitterMs.length];
      pacer.step(nowMs);
    }
    const measuredMs = 5000;
    const endMs = nowMs + measuredMs;
    let i = 0;
    while (nowMs < endMs) {
      nowMs += jitterMs[i++ % jitterMs.length];
      if (pacer.step(nowMs).shouldRun) rendered++;
    }

    expect(rendered).toBeGreaterThanOrEqual(298);
    expect(rendered).toBeLessThanOrEqual(302);
  });

  it('preserves loading-screen panel calibration when frame work misses source callbacks', () => {
    const pacer = new FramePacer({ enabled: true, maxFps: 60 });
    let nowMs = 0;
    for (let i = 0; i < 9; i++) {
      nowMs += 1000 / 144;
      pacer.observe(nowMs);
    }

    const workloadLimited = stepWithMissedVsyncWork(pacer, 144, 600, nowMs);
    const snapshot = pacer.snapshot();
    const effectiveFps = (workloadLimited.rendered * 1000) / workloadLimited.elapsedMs;

    expect(effectiveFps).toBeGreaterThanOrEqual(47);
    expect(effectiveFps).toBeLessThanOrEqual(49);
    expect(snapshot.estimatedRefreshFps).toBeCloseTo(144, 0);
    expect(snapshot.targetFps).toBeCloseTo(48, 0);
    expect(snapshot.intentionallyPaced).toBe(true);
  });

  it('recalibrates upward when the browser callback rate increases', () => {
    const pacer = new FramePacer({ enabled: true, maxFps: 60 });
    const slow = stepAtRate(pacer, 60, 90);

    const transition = stepAtRate(pacer, 120, 60, slow.nowMs);
    const steady = stepAtRate(pacer, 120, 120, transition.nowMs);
    const snapshot = pacer.snapshot();

    expect(steady.rendered).toBeGreaterThanOrEqual(59);
    expect(steady.rendered).toBeLessThanOrEqual(61);
    expect(snapshot.estimatedRefreshFps).toBeCloseTo(120, 0);
    expect(snapshot.targetFps).toBeCloseTo(60, 0);
  });

  it('revalidates a trusted high refresh rate after a sustained panel drop', () => {
    const pacer = new FramePacer({ enabled: true, maxFps: 60 });
    let nowMs = 0;
    for (let i = 0; i < 9; i++) {
      nowMs += 1000 / 144;
      pacer.observe(nowMs);
    }

    const transition = stepAtRate(pacer, 60, 120, nowMs);
    const steady = stepAtRate(pacer, 60, 60, transition.nowMs);
    const snapshot = pacer.snapshot();

    expect(steady.rendered).toBe(60);
    expect(transition.maxConsecutiveSkips).toBeLessThanOrEqual(1);
    expect(snapshot.estimatedRefreshFps).toBeCloseTo(60, 0);
    expect(snapshot.targetFps).toBeCloseTo(60, 0);
    expect(snapshot.intentionallyPaced).toBe(false);
  });

  it('revalidates upward when faster gameplay callbacks are workload-limited', () => {
    const pacer = new FramePacer({ enabled: true, maxFps: 60 });
    let nowMs = 0;
    for (let i = 0; i < 9; i++) {
      nowMs += 1000 / 60;
      pacer.observe(nowMs);
    }

    const workloadLimited = stepWithMissedVsyncWork(pacer, 90, 400, nowMs);
    const snapshot = pacer.snapshot();
    const effectiveFps = (workloadLimited.rendered * 1000) / workloadLimited.elapsedMs;

    expect(effectiveFps).toBeGreaterThanOrEqual(44);
    expect(effectiveFps).toBeLessThanOrEqual(46);
    expect(snapshot.estimatedRefreshFps).toBeCloseTo(90, 0);
    expect(snapshot.targetFps).toBeCloseTo(45, 0);
    expect(snapshot.intentionallyPaced).toBe(true);
  });

  it('recalibrates after the browser callback rate changes', () => {
    const pacer = new FramePacer({ enabled: true, maxFps: 60 });
    const fast = stepAtRate(pacer, 120, 90);

    const transition = stepAtRate(pacer, 60, 60, fast.nowMs);
    const steady = stepAtRate(pacer, 60, 60, transition.nowMs);
    const snapshot = pacer.snapshot();

    expect(steady.rendered).toBe(60);
    expect(snapshot.estimatedRefreshFps).toBeCloseTo(60, 0);
    expect(snapshot.targetFps).toBeCloseTo(60, 0);
    expect(snapshot.intentionallyPaced).toBe(false);
  });

  it('renders immediately and preserves trusted calibration after a suspended-tab gap', () => {
    const pacer = new FramePacer({ enabled: true, maxFps: 60 });
    const warmup = stepAtRate(pacer, 120, 30);

    const resumed = pacer.step(warmup.nowMs + 1000);

    expect(resumed.shouldRun).toBe(true);
    expect(resumed.intentionallyPaced).toBe(true);
    expect(resumed.estimatedRefreshFps).toBeCloseTo(120, 0);
  });
});
