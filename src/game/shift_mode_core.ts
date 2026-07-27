// Shift mode: the pure half of the one-switch "battery + discretion" mode.
//
// Two decisions live here, both host-agnostic so a Vitest drives them directly:
//   1. the LIVE audio mix, DERIVED from the player's stored volumes plus the
//      shift-mode flag (never a saved/restored snapshot, see resolveAudioMix), and
//   2. the render-loop frame pacing while the cap is engaged.
//
// No DOM, no audio singletons, no clock: the caller passes the frame timestamp in
// and applies the resolved mix. Registered in tests/architecture.test.ts
// UI_PURE_CORES (a game leaf that imports nothing, like ui_effects_profile.ts).

/** Frames per second the render loop is held to while shift mode is on. Low
 *  enough to visibly cut GPU/CPU draw on a handheld, high enough that mouselook
 *  and combat still read as smooth. */
export const SHIFT_MODE_FPS_CAP = 30;

/** Minimum milliseconds between rendered frames while the cap is engaged. */
export const SHIFT_MODE_FRAME_INTERVAL_MS = 1000 / SHIFT_MODE_FPS_CAP;

/** The "no cap" interval: every frame the host offers is rendered. */
export const UNCAPPED_FRAME_INTERVAL_MS = 0;

/** Slack allowed before the interval is considered met. A display running at a
 *  hair under its nominal rate (59.94 Hz, or any rAF jitter) otherwise misses the
 *  33.3 ms deadline by a fraction and drops the whole next frame, halving the cap
 *  to 20 fps instead of holding 30. One millisecond absorbs that jitter without
 *  ever letting two frames through inside one interval. */
export const FRAME_PACE_TOLERANCE_MS = 1;

/** The three audio buses shift mode silences, as 0..1 volumes. */
export interface AudioVolumes {
  sfx: number;
  music: number;
  voice: number;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/**
 * The LIVE audio mix to push at the audio subsystems, given the player's STORED
 * volumes and whether shift mode is on.
 *
 * This is a derivation, deliberately not a save/restore: shift mode never writes
 * the stored settings, so turning it back off simply re-derives from whatever the
 * player has stored. A bus the player muted by hand (stored 0) therefore stays
 * muted when shift mode is turned off, and a slider moved WHILE shift mode is on
 * is honoured the moment it is turned off, with no stale snapshot to clobber it.
 */
export function resolveAudioMix(stored: AudioVolumes, shiftModeOn: boolean): AudioVolumes {
  if (shiftModeOn) return { sfx: 0, music: 0, voice: 0 };
  return {
    sfx: clamp01(stored.sfx),
    music: clamp01(stored.music),
    voice: clamp01(stored.voice),
  };
}

/** The frame interval the render loop should pace to for a shift-mode flag. */
export function shiftModeFrameIntervalMs(shiftModeOn: boolean): number {
  return shiftModeOn ? SHIFT_MODE_FRAME_INTERVAL_MS : UNCAPPED_FRAME_INTERVAL_MS;
}

/**
 * Whether the frame at `nowMs` should be rendered, given when the last frame
 * rendered and the pacing interval. An interval of 0 (uncapped), a first frame
 * (`lastRenderMs` null), a non-finite timestamp, or a clock that stepped
 * backwards all render: the gate may throttle the loop, never stall it.
 */
export function shouldRenderFrame(
  nowMs: number,
  lastRenderMs: number | null,
  intervalMs: number,
): boolean {
  if (!(intervalMs > 0)) return true;
  if (lastRenderMs === null || !Number.isFinite(lastRenderMs)) return true;
  if (!Number.isFinite(nowMs)) return true;
  const elapsed = nowMs - lastRenderMs;
  if (elapsed < 0) return true;
  return elapsed >= intervalMs - FRAME_PACE_TOLERANCE_MS;
}

/**
 * The render loop's pacing state: which frames pass while the cap is engaged.
 * Deterministic (the host passes its own frame timestamp in), so the whole
 * cap-on / cap-off behaviour is unit-testable without a browser.
 */
export class ShiftModeFramePacer {
  private lastRenderMs: number | null = null;
  private intervalMs = UNCAPPED_FRAME_INTERVAL_MS;

  /** Engage or release the cap. Releasing forgets the last frame time so the
   *  very next frame renders instead of waiting out a stale interval. */
  setCapped(on: boolean): void {
    this.intervalMs = shiftModeFrameIntervalMs(on);
    if (!on) this.lastRenderMs = null;
  }

  get capped(): boolean {
    return this.intervalMs > 0;
  }

  /** True when this frame should run; records the timestamp when it does. */
  allow(nowMs: number): boolean {
    if (!shouldRenderFrame(nowMs, this.lastRenderMs, this.intervalMs)) return false;
    this.lastRenderMs = this.intervalMs > 0 ? nowMs : null;
    return true;
  }
}
