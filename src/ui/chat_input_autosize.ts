// Autosize logic for the auto-growing chat input. The chat bar is a textarea
// anchored by its BOTTOM edge (see #chat-input in index.html), so growing its
// height extends the box upward, away from the chat log beneath it.
// `chatInputSize` is the pure clamp geometry; `autosizeChatInput` is the whole
// measure-and-apply routine over a structural textarea slice, so the DOM
// consumer (src/main.ts) stays a one-line call. Kept free of DOM imports so a
// Vitest unit test can pin the behavior with a hand-rolled fake.

export interface ChatInputSizeLimits {
  /** Minimum rendered height (a single line). */
  minHeight: number;
  /** Maximum rendered height before the textarea scrolls internally. */
  maxHeight: number;
}

export interface ChatInputSize {
  /** Pixel height to apply to the textarea. */
  height: number;
  /**
   * 'hidden' while the content fits within maxHeight (no scrollbar, clean
   * upward growth); 'auto' once it is capped so the overflow stays reachable.
   */
  overflowY: 'hidden' | 'auto';
}

// Clamp a measured content height to [minHeight, maxHeight]. When the content
// exceeds the cap we surface a scrollbar instead of growing without bound.
export function chatInputSize(scrollHeight: number, limits: ChatInputSizeLimits): ChatInputSize {
  const min = Math.max(0, limits.minHeight);
  const max = Math.max(min, limits.maxHeight);
  const natural = Math.round(Number.isFinite(scrollHeight) ? scrollHeight : min);
  const height = Math.min(max, Math.max(min, natural));
  // Compare the rounded measurement so a fractional scrollHeight that rounds
  // down to exactly `max` does not spuriously surface a scrollbar.
  return { height, overflowY: natural > max ? 'auto' : 'hidden' };
}

// The structural slice of an HTMLTextAreaElement the autosize routine touches,
// so a Vitest can drive it with a hand-rolled fake and the module stays
// DOM-import-free.
export interface AutosizeTextarea {
  value: string;
  placeholder: string;
  readonly scrollHeight: number;
  style: { height: string; overflowY: string };
}

// Size the chat textarea to whatever it is DISPLAYING: the typed value, or the
// placeholder hint while empty. Engines disagree on whether a textarea's
// scrollHeight accounts for the placeholder (Chromium inflates it, others
// ignore it and would clip a wrapping hint), so while the box is empty we
// briefly swap the placeholder in as the value, measure, and restore. The
// swap fires no input events and an empty textarea has no caret state to lose.
export function autosizeChatInput(
  el: AutosizeTextarea,
  limits: ChatInputSizeLimits,
): ChatInputSize {
  const measurePlaceholder = el.value === '';
  if (measurePlaceholder) el.value = el.placeholder;
  // Collapse first so a previously grown box does not floor the measurement.
  el.style.height = 'auto';
  const size = chatInputSize(el.scrollHeight, limits);
  if (measurePlaceholder) el.value = '';
  el.style.height = `${size.height}px`;
  el.style.overflowY = size.overflowY;
  return size;
}
