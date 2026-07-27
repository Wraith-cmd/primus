// Double-tap detection for a single key.
//
// Offline play needs a deliberate "save right now" gesture that cannot be
// confused with the ordinary Escape that closes a window. Two Escapes inside a
// short window is that gesture: the first still does its normal job, and the
// second is what commits.
//
// Pure and clock-injected so a Vitest drives it directly with no timers and no
// DOM. The caller owns `now`, which also keeps it honest about the sim's rule
// that time comes from the caller, never from a wall clock reached for inline.

/** How close together two taps must land to count as one gesture. Long enough to
 *  be comfortable on a handheld, short enough that two unrelated Escapes seconds
 *  apart never trip it. */
export const DOUBLE_TAP_MS = 500;

export interface DoubleTapState {
  /** Timestamp of the last tap, or null when no tap is pending. */
  lastTapAt: number | null;
}

export function newDoubleTap(): DoubleTapState {
  return { lastTapAt: null };
}

/** Register a tap. Returns true when this tap completes a double tap.
 *
 *  A completed gesture RESETS the state, so three taps in quick succession fire
 *  once, not twice: the third starts a fresh pair rather than re-triggering off
 *  the second. That keeps a panicky Escape mash from firing a save per keypress. */
export function registerTap(state: DoubleTapState, now: number, windowMs = DOUBLE_TAP_MS): boolean {
  const previous = state.lastTapAt;
  if (previous !== null && now - previous <= windowMs) {
    state.lastTapAt = null;
    return true;
  }
  state.lastTapAt = now;
  return false;
}
