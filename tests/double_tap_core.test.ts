import { describe, expect, it } from 'vitest';
import { DOUBLE_TAP_MS, newDoubleTap, registerTap } from '../src/game/double_tap_core';

describe('double tap detection', () => {
  it('does not fire on a single tap', () => {
    expect(registerTap(newDoubleTap(), 1000)).toBe(false);
  });

  it('fires on a second tap inside the window', () => {
    const s = newDoubleTap();
    expect(registerTap(s, 1000)).toBe(false);
    expect(registerTap(s, 1000 + DOUBLE_TAP_MS - 1)).toBe(true);
  });

  it('fires on a tap exactly at the window edge', () => {
    const s = newDoubleTap();
    registerTap(s, 1000);
    expect(registerTap(s, 1000 + DOUBLE_TAP_MS)).toBe(true);
  });

  it('does not fire when the second tap is too late', () => {
    const s = newDoubleTap();
    registerTap(s, 1000);
    expect(registerTap(s, 1000 + DOUBLE_TAP_MS + 1)).toBe(false);
  });

  it('treats a late second tap as the start of a fresh pair', () => {
    const s = newDoubleTap();
    registerTap(s, 1000);
    expect(registerTap(s, 5000)).toBe(false); // too late, becomes tap one
    expect(registerTap(s, 5100)).toBe(true); // completes with the new first tap
  });

  it('fires once for three fast taps, not twice', () => {
    const s = newDoubleTap();
    const fired = [registerTap(s, 0), registerTap(s, 100), registerTap(s, 200)];
    expect(fired).toEqual([false, true, false]);
  });

  it('fires twice for four fast taps', () => {
    const s = newDoubleTap();
    const fired = [
      registerTap(s, 0),
      registerTap(s, 100),
      registerTap(s, 200),
      registerTap(s, 300),
    ];
    expect(fired).toEqual([false, true, false, true]);
  });

  it('honours a caller-supplied window', () => {
    const s = newDoubleTap();
    registerTap(s, 0, 50);
    expect(registerTap(s, 60, 50)).toBe(false);
  });
});
