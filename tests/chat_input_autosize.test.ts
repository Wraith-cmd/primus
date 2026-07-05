import { describe, expect, it } from 'vitest';
import {
  type AutosizeTextarea,
  autosizeChatInput,
  chatInputSize,
} from '../src/ui/chat_input_autosize';

const LIMITS = { minHeight: 32, maxHeight: 110 };

describe('chatInputSize', () => {
  it('keeps the floor for an empty / single-line input', () => {
    expect(chatInputSize(28, LIMITS)).toEqual({ height: 32, overflowY: 'hidden' });
    expect(chatInputSize(32, LIMITS)).toEqual({ height: 32, overflowY: 'hidden' });
  });

  it('grows with content while it fits under the cap', () => {
    expect(chatInputSize(60, LIMITS)).toEqual({ height: 60, overflowY: 'hidden' });
    expect(chatInputSize(110, LIMITS)).toEqual({ height: 110, overflowY: 'hidden' });
  });

  it('caps height and shows a scrollbar once content overflows', () => {
    expect(chatInputSize(140, LIMITS)).toEqual({ height: 110, overflowY: 'auto' });
  });

  it('rounds fractional measurements', () => {
    expect(chatInputSize(60.6, LIMITS).height).toBe(61);
  });

  it('does not show a scrollbar when a fractional height rounds down to the cap', () => {
    expect(chatInputSize(110.4, LIMITS)).toEqual({ height: 110, overflowY: 'hidden' });
    // ...but a fraction that rounds up past the cap does.
    expect(chatInputSize(110.6, LIMITS)).toEqual({ height: 110, overflowY: 'auto' });
  });

  it('falls back to the floor for a non-finite measurement', () => {
    expect(chatInputSize(Number.NaN, LIMITS)).toEqual({ height: 32, overflowY: 'hidden' });
  });
});

// A hand-rolled textarea fake (tests/CLAUDE.md: no jsdom). Its scrollHeight
// derives from the CURRENT value only, modelling engines whose measurement
// ignores the placeholder: 24px per wrapped line of up to 20 chars, one line
// minimum, so an empty value measures a single line even when the placeholder
// would wrap.
const LINE_H = 24;
const LINE_CHARS = 20;
function fakeTextarea(value: string, placeholder: string): AutosizeTextarea {
  const el = {
    value,
    placeholder,
    style: { height: '', overflowY: '' },
    get scrollHeight(): number {
      return Math.max(1, Math.ceil(el.value.length / LINE_CHARS)) * LINE_H;
    },
  };
  return el;
}

describe('autosizeChatInput', () => {
  it('keeps a single-line box when both value and placeholder are short', () => {
    const el = fakeTextarea('', 'Say hi');
    expect(autosizeChatInput(el, LIMITS)).toEqual({ height: 32, overflowY: 'hidden' });
    expect(el.style.height).toBe('32px');
    expect(el.style.overflowY).toBe('hidden');
  });

  it('sizes an empty box to fit a wrapping placeholder instead of clipping it', () => {
    // Two wrapped lines (48px) > the single-line floor: the box must grow so
    // the placeholder hint is fully visible (issue #1232, clipped hint).
    const el = fakeTextarea('', 'x'.repeat(LINE_CHARS * 2));
    expect(autosizeChatInput(el, LIMITS)).toEqual({ height: 48, overflowY: 'hidden' });
    expect(el.style.height).toBe('48px');
  });

  it('restores the empty value after measuring the placeholder', () => {
    const el = fakeTextarea('', 'x'.repeat(LINE_CHARS * 2));
    autosizeChatInput(el, LIMITS);
    expect(el.value).toBe('');
  });

  it('measures the typed value, not the placeholder, once there is content', () => {
    const el = fakeTextarea('hello', 'x'.repeat(LINE_CHARS * 4));
    expect(autosizeChatInput(el, LIMITS)).toEqual({ height: 32, overflowY: 'hidden' });
    expect(el.value).toBe('hello');
  });

  it('grows with multi-line typed text and scrolls past the cap', () => {
    const grown = fakeTextarea('x'.repeat(LINE_CHARS * 3), 'hint');
    expect(autosizeChatInput(grown, LIMITS)).toEqual({ height: 72, overflowY: 'hidden' });
    const capped = fakeTextarea('x'.repeat(LINE_CHARS * 6), 'hint');
    expect(autosizeChatInput(capped, LIMITS)).toEqual({ height: 110, overflowY: 'auto' });
    expect(capped.style.overflowY).toBe('auto');
  });

  it('never sizes below the floor for a clamped placeholder either', () => {
    const el = fakeTextarea('', 'x'.repeat(LINE_CHARS * 10));
    expect(autosizeChatInput(el, LIMITS)).toEqual({ height: 110, overflowY: 'auto' });
    expect(el.value).toBe('');
  });
});
