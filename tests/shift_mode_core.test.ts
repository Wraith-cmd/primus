import { describe, expect, it } from 'vitest';
import {
  FRAME_PACE_TOLERANCE_MS,
  resolveAudioMix,
  SHIFT_MODE_FPS_CAP,
  SHIFT_MODE_FRAME_INTERVAL_MS,
  ShiftModeFramePacer,
  shiftModeFrameIntervalMs,
  shouldRenderFrame,
  UNCAPPED_FRAME_INTERVAL_MS,
} from '../src/game/shift_mode_core';

// A stored mix with every bus audible, the out-of-the-box state.
const LOUD = { sfx: 0.8, music: 0.8, voice: 0.9 };

describe('shift_mode_core: the cap constants', () => {
  it('names the cap instead of scattering a magic frame rate', () => {
    expect(SHIFT_MODE_FPS_CAP).toBe(30);
    expect(SHIFT_MODE_FRAME_INTERVAL_MS).toBeCloseTo(1000 / 30, 10);
    expect(UNCAPPED_FRAME_INTERVAL_MS).toBe(0);
  });

  it('maps the flag to an interval: capped on, uncapped off', () => {
    expect(shiftModeFrameIntervalMs(true)).toBe(SHIFT_MODE_FRAME_INTERVAL_MS);
    expect(shiftModeFrameIntervalMs(false)).toBe(UNCAPPED_FRAME_INTERVAL_MS);
  });
});

describe('shift_mode_core: resolveAudioMix', () => {
  it('silences every bus while shift mode is on', () => {
    expect(resolveAudioMix(LOUD, true)).toEqual({ sfx: 0, music: 0, voice: 0 });
  });

  it('passes the stored volumes straight through while shift mode is off', () => {
    expect(resolveAudioMix(LOUD, false)).toEqual(LOUD);
  });

  // The manual-mute contract: this is a DERIVATION, not a save/restore, so there
  // is no snapshot that could re-raise a bus the player muted by hand.
  it('leaves a hand-muted bus muted when shift mode is turned off', () => {
    const handMuted = { sfx: 0.8, music: 0, voice: 0.9 };
    expect(resolveAudioMix(handMuted, true)).toEqual({ sfx: 0, music: 0, voice: 0 });
    expect(resolveAudioMix(handMuted, false)).toEqual(handMuted);
  });

  // Every bus hand-muted before shift mode ever engaged: turning shift mode on
  // and back off must be a no-op, never an unmute.
  it('round-trips a fully hand-muted mix through on/off unchanged', () => {
    const silent = { sfx: 0, music: 0, voice: 0 };
    expect(resolveAudioMix(silent, true)).toEqual(silent);
    expect(resolveAudioMix(silent, false)).toEqual(silent);
  });

  // A slider moved WHILE shift mode is on is stored immediately; the derivation
  // keeps it silent now and honours the NEW value the moment shift mode drops.
  it('honours a volume changed while shift mode was on, with no stale snapshot', () => {
    const changedDuring = { sfx: 0.25, music: 0.5, voice: 0.1 };
    expect(resolveAudioMix(changedDuring, true)).toEqual({ sfx: 0, music: 0, voice: 0 });
    expect(resolveAudioMix(changedDuring, false)).toEqual(changedDuring);
  });

  it('clamps out-of-range and non-finite stored values', () => {
    expect(resolveAudioMix({ sfx: 1.7, music: -0.4, voice: Number.NaN }, false)).toEqual({
      sfx: 1,
      music: 0,
      voice: 0,
    });
  });

  it('is deterministic: same input, same output', () => {
    expect(resolveAudioMix(LOUD, true)).toEqual(resolveAudioMix(LOUD, true));
    expect(resolveAudioMix(LOUD, false)).toEqual(resolveAudioMix(LOUD, false));
  });
});

describe('shift_mode_core: shouldRenderFrame', () => {
  it('renders every frame when uncapped', () => {
    expect(shouldRenderFrame(0.1, 0, UNCAPPED_FRAME_INTERVAL_MS)).toBe(true);
    expect(shouldRenderFrame(1, 0, -5)).toBe(true);
  });

  it('renders the first frame, before any frame time is known', () => {
    expect(shouldRenderFrame(0, null, SHIFT_MODE_FRAME_INTERVAL_MS)).toBe(true);
  });

  it('skips a frame inside the interval and runs one past it', () => {
    expect(shouldRenderFrame(16.7, 0, SHIFT_MODE_FRAME_INTERVAL_MS)).toBe(false);
    expect(shouldRenderFrame(33.4, 0, SHIFT_MODE_FRAME_INTERVAL_MS)).toBe(true);
  });

  // The 59.94 Hz / rAF-jitter case: two display frames land a hair under the
  // 33.33 ms deadline. Without the tolerance the loop drops to 20 fps.
  it('accepts a frame that misses the deadline by less than the tolerance', () => {
    const nearMiss = SHIFT_MODE_FRAME_INTERVAL_MS - FRAME_PACE_TOLERANCE_MS / 2;
    expect(shouldRenderFrame(nearMiss, 0, SHIFT_MODE_FRAME_INTERVAL_MS)).toBe(true);
    const realMiss = SHIFT_MODE_FRAME_INTERVAL_MS - FRAME_PACE_TOLERANCE_MS * 2;
    expect(shouldRenderFrame(realMiss, 0, SHIFT_MODE_FRAME_INTERVAL_MS)).toBe(false);
  });

  it('never stalls the loop on a backwards or non-finite clock', () => {
    expect(shouldRenderFrame(10, 5000, SHIFT_MODE_FRAME_INTERVAL_MS)).toBe(true);
    expect(shouldRenderFrame(Number.NaN, 0, SHIFT_MODE_FRAME_INTERVAL_MS)).toBe(true);
    expect(shouldRenderFrame(10, Number.NaN, SHIFT_MODE_FRAME_INTERVAL_MS)).toBe(true);
  });
});

describe('shift_mode_core: ShiftModeFramePacer', () => {
  it('passes every frame while uncapped', () => {
    const pacer = new ShiftModeFramePacer();
    expect(pacer.capped).toBe(false);
    for (let i = 0; i < 10; i++) expect(pacer.allow(i * 16.7)).toBe(true);
  });

  // A 60 Hz display driving a 30 fps cap: exactly every other frame runs.
  it('halves a 60 Hz frame stream to the 30 fps cap', () => {
    const pacer = new ShiftModeFramePacer();
    pacer.setCapped(true);
    expect(pacer.capped).toBe(true);
    const ran: number[] = [];
    for (let i = 0; i < 12; i++) {
      const now = (i * 1000) / 60;
      if (pacer.allow(now)) ran.push(i);
    }
    expect(ran).toEqual([0, 2, 4, 6, 8, 10]);
  });

  // A 144 Hz handheld: the cap still holds the loop at or under 30 fps.
  it('holds a 144 Hz frame stream at or below the cap', () => {
    const pacer = new ShiftModeFramePacer();
    pacer.setCapped(true);
    let ran = 0;
    const frames = 144;
    for (let i = 0; i < frames; i++) {
      if (pacer.allow((i * 1000) / 144)) ran++;
    }
    expect(ran).toBeLessThanOrEqual(SHIFT_MODE_FPS_CAP + 1);
    expect(ran).toBeGreaterThan(SHIFT_MODE_FPS_CAP / 2);
  });

  it('releases the cap immediately: the very next frame runs', () => {
    const pacer = new ShiftModeFramePacer();
    pacer.setCapped(true);
    expect(pacer.allow(0)).toBe(true);
    expect(pacer.allow(5)).toBe(false);
    pacer.setCapped(false);
    // No stale interval is waited out; the loop is uncapped from this frame on.
    expect(pacer.capped).toBe(false);
    expect(pacer.allow(6)).toBe(true);
    expect(pacer.allow(7)).toBe(true);
  });

  it('re-engaging the cap starts pacing again from the next frame', () => {
    const pacer = new ShiftModeFramePacer();
    pacer.setCapped(true);
    expect(pacer.allow(1000)).toBe(true);
    pacer.setCapped(false);
    expect(pacer.allow(1001)).toBe(true);
    pacer.setCapped(true);
    expect(pacer.allow(1002)).toBe(true); // first frame after re-engaging
    expect(pacer.allow(1010)).toBe(false);
    expect(pacer.allow(1040)).toBe(true);
  });
});
