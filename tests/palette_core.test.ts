// The greyscale test, as CI.
//
// `docs/design/wow-fidelity-research.md` (section 2, Recommendation 6) asks for
// exactly this: render the palette, collapse it to value, and assert the spread.
// It is worth doing precisely because it is unusual: it turns an art-direction
// principle ("if it fails in greyscale, saturation cannot rescue it") into a
// pinned assertion, so a future re-tune cannot quietly flatten a family and leave
// the world reading as mush at gameplay distance.

import { describe, expect, it } from 'vitest';
import {
  MIN_VALUE_SPREAD,
  PALETTE,
  type PaletteFamily,
  paletteHex,
  paletteValueSpread,
  relativeLuminance,
} from '../src/render/palette_core';

const FAMILIES = Object.keys(PALETTE) as PaletteFamily[];

describe('world palette', () => {
  it('is a small, hand-holdable table', () => {
    // Palette DISCIPLINE is the point: a table nobody can hold in their head is
    // the inline-literal problem again with extra steps. Growing this is an art
    // decision, so it reddens deliberately.
    expect(FAMILIES).toHaveLength(12);
  });

  it('carries three value stops per family, as #rrggbb', () => {
    for (const family of FAMILIES) {
      for (const tier of ['light', 'mid', 'dark'] as const) {
        expect(paletteHex(family, tier), `${family}.${tier}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  // THE GATE. Every ramp must survive having its colour stripped.
  it('every family clears the value-spread floor under greyscale', () => {
    const thin = FAMILIES.filter((f) => paletteValueSpread(f) < MIN_VALUE_SPREAD).map(
      (f) => `${f}: ${paletteValueSpread(f).toFixed(3)}`,
    );
    expect(
      thin,
      `families whose light and dark stops converge under greyscale (floor ${MIN_VALUE_SPREAD}):\n  ${thin.join('\n  ')}`,
    ).toEqual([]);
  });

  it('orders every ramp light > mid > dark by luminance', () => {
    // A ramp that is not monotonic in value is not a ramp: a generator reaching
    // for `dark` to bake a contact shadow would lighten the surface instead.
    for (const family of FAMILIES) {
      const { light, mid, dark } = PALETTE[family];
      expect(relativeLuminance(light), `${family} light vs mid`).toBeGreaterThan(
        relativeLuminance(mid),
      );
      expect(relativeLuminance(mid), `${family} mid vs dark`).toBeGreaterThan(
        relativeLuminance(dark),
      );
    }
  });

  it('keeps the BASE-surface mid stops distinguishable under greyscale', () => {
    // Two large flat surfaces sharing a luminance vanish into each other once
    // colour is stripped: the "road disappears into the wall" failure.
    //
    // BE HONEST ABOUT THIS SCOPING: it is load-bearing for greenness, not merely
    // tidy. Over all 12 families two gaps fall under the floor (arcane/clay at
    // 0.0147 and ember/earth at 0.0046), so an unscoped check FAILS on the
    // shipped palette. An earlier version of this comment claimed the scoping was
    // "not a convenience to make this pass", which was false.
    //
    // It is still the right scope, for a reason that predates the assertion:
    // `palette_core.ts` already declares `ember` emissive-only and never a base
    // surface, and `arcane` reserved for spell effects. Neither ever covers a
    // wall-sized area adjoining another of them, so a separation floor between
    // them constrains the accents to protect against something that cannot
    // happen. `brass` is DELIBERATELY included despite being trim: every gap
    // still clears with it in (tightest 0.0176), so excluding it would drop
    // coverage for free.
    const BASE: PaletteFamily[] = [
      'stone',
      'bark',
      'foliage',
      'earth',
      'thatch',
      'clay',
      'water',
      'iron',
      'bone',
      'brass',
    ];
    const sorted = BASE.map((f) => ({ f, l: relativeLuminance(PALETTE[f].mid) })).sort(
      (a, b) => a.l - b.l,
    );
    const collisions: string[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].l - sorted[i - 1].l;
      if (gap < 0.015) collisions.push(`${sorted[i - 1].f} vs ${sorted[i].f} (${gap.toFixed(4)})`);
    }
    expect(
      collisions,
      `mid stops that collapse together in greyscale:\n  ${collisions.join('\n  ')}`,
    ).toEqual([]);
  });

  it('computes luminance against known anchors', () => {
    // Proves the helper is the real WCAG curve rather than a naive average, so
    // the assertions above mean what they claim.
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    // Green carries the most luminance weight, blue the least: a naive mean
    // would rate these equal and silently weaken every check in this file.
    expect(relativeLuminance('#00ff00')).toBeGreaterThan(relativeLuminance('#ff0000'));
    expect(relativeLuminance('#ff0000')).toBeGreaterThan(relativeLuminance('#0000ff'));
  });
});
