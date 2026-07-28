import { afterEach, describe, expect, it, vi } from 'vitest';
import { castLayerKnobs, dumpText, installCastKnobs } from '../src/render/characters/cast_knobs';
import { CAST_KNOB_KEYS, CAST_LAYER_DEFAULTS } from '../src/render/characters/cast_layer_core';

// The live console knobs. Importing the module already ran its module-load
// install once in this plain-Node env (no `window`), which is exactly the
// no-op-when-headless guarantee the first case pins. The rest drive the real
// install against a minimal fake window, the same single-global stubbing
// convention the keybinds/snapshot suites use.

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.assign(castLayerKnobs(), CAST_LAYER_DEFAULTS);
});

describe('cast knobs without a window', () => {
  it('costs nothing headless: defaults only, no globals touched, no throw', () => {
    expect(typeof globalThis.window).toBe('undefined');
    expect(() => installCastKnobs()).not.toThrow();
    for (const key of CAST_KNOB_KEYS) {
      expect(castLayerKnobs()[key]).toBe(CAST_LAYER_DEFAULTS[key]);
    }
  });

  it('returns the ONE live struct, so a console edit lands on the next frame', () => {
    expect(castLayerKnobs()).toBe(castLayerKnobs());
  });
});

describe('cast knobs dump', () => {
  it('prints every knob as a copy-pasteable block', () => {
    const text = dumpText({ ...CAST_LAYER_DEFAULTS, armMain: -0.912345 });
    for (const key of CAST_KNOB_KEYS) expect(text).toContain(`${key}: `);
    // rounded for readability, not truncated to a lie
    expect(text).toContain('armMain: -0.9123,');
    expect(text.trimEnd().endsWith('};')).toBe(true);
  });
});

describe('cast knobs installed on a window', () => {
  function install(seed: Record<string, string> = {}) {
    const storage = fakeStorage(seed);
    const win: Record<string, unknown> = { localStorage: storage };
    vi.stubGlobal('window', win);
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    installCastKnobs();
    return { storage, win, info };
  }

  it('publishes one facade and logs exactly one startup line', () => {
    const { win, info } = install();
    const facade = win.__primusCastKnobs as Record<string, unknown>;
    expect(facade).toBeTruthy();
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0][0])).toContain('__primusCastKnobs');
  });

  it('writes a console edit straight into the live struct and persists it', () => {
    const { storage, win } = install();
    const facade = win.__primusCastKnobs as { armMain: number };
    facade.armMain = -0.9;
    expect(castLayerKnobs().armMain).toBe(-0.9);
    expect(facade.armMain).toBe(-0.9);
    const saved = JSON.parse(storage.map.get('primus_cast_knobs') as string);
    expect(saved.armMain).toBe(-0.9);
  });

  it('rejects a non-numeric edit instead of poisoning the pose', () => {
    const { win } = install();
    const facade = win.__primusCastKnobs as Record<string, unknown>;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    facade.armMain = 'wide' as unknown as number;
    facade.torsoLean = Number.NaN as unknown as number;
    expect(castLayerKnobs().armMain).toBe(CAST_LAYER_DEFAULTS.armMain);
    expect(castLayerKnobs().torsoLean).toBe(CAST_LAYER_DEFAULTS.torsoLean);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('restores persisted tuning at startup and ignores junk in the payload', () => {
    const { win } = install({
      primus_cast_knobs: JSON.stringify({ armMain: -1.1, nonsense: 5, headTilt: 'x' }),
    });
    expect(castLayerKnobs().armMain).toBe(-1.1);
    expect(castLayerKnobs().headTilt).toBe(CAST_LAYER_DEFAULTS.headTilt);
    expect((win.__primusCastKnobs as { armMain: number }).armMain).toBe(-1.1);
  });

  it('reset() restores the defaults and clears storage', () => {
    const { storage, win } = install({ primus_cast_knobs: JSON.stringify({ armMain: -1.1 }) });
    const facade = win.__primusCastKnobs as { reset: () => void; dump: () => string };
    facade.reset();
    expect(castLayerKnobs().armMain).toBe(CAST_LAYER_DEFAULTS.armMain);
    expect(storage.map.has('primus_cast_knobs')).toBe(false);
  });

  it('dump() returns the block it prints', () => {
    const { win } = install();
    const facade = win.__primusCastKnobs as { armMain: number; dump: () => string };
    facade.armMain = -0.5;
    expect(facade.dump()).toContain('armMain: -0.5,');
  });

  it('survives a storage that throws (private mode)', () => {
    const hostile = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    vi.stubGlobal('window', { localStorage: hostile } as Record<string, unknown>);
    vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(() => installCastKnobs()).not.toThrow();
    const facade = (globalThis.window as unknown as Record<string, { armMain: number }>)
      .__primusCastKnobs;
    expect(() => {
      facade.armMain = -0.7;
    }).not.toThrow();
    expect(castLayerKnobs().armMain).toBe(-0.7);
  });
});
