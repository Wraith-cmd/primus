// The shared world palette: one paint set for every generated surface.
//
// WHY THIS EXISTS. `textures.ts` generates every texture procedurally and already
// implements most of the hand-painted look: it bakes contact shading into the
// diffuse (roughly 25 gradient calls placing shadow under eaves, splash dirt at
// wall bases, per-blade gradients on grass), which is the technical core of the
// style and the reason it survives at low resolution. What it does NOT have is
// palette discipline: 38 distinct hex literals are inlined per generator, chosen
// independently, so surfaces read as unrelated things that happen to share a
// scene rather than as a world painted by one hand.
// See `docs/design/wow-fidelity-research.md`, section 2, Recommendation 6.
//
// THE RULES THIS TABLE ENCODES.
//  - Value before color. The professional check is the greyscale test: convert to
//    greyscale and confirm the image still reads. Every family below carries a
//    light/mid/dark ramp chosen for VALUE separation first, hue second. A family
//    whose spread is thin reads as mush at gameplay distance no matter how
//    saturated it is, which is why `paletteValueSpread` exists and is asserted.
//  - Few hues, reused. Twelve families, deliberately. A new surface picks the
//    closest existing family; it does not add a thirteenth.
//  - Accents are scarce on purpose. `brass` marks interactive or valuable things,
//    `ember` is emissive only and never a base surface, `arcane` is reserved for
//    magic so it never competes with brass. Spending them widely spends their
//    meaning.
//
// SCOPE. This module is DATA plus two pure helpers. It is deliberately additive:
// landing it changes no pixel until a generator swaps an inline literal for a
// lookup, which is the reviewable step-by-step half of Recommendation 6.
//
// Values are derived from the hexes already shipping in `textures.ts`, with
// saturation pushed and value widened. They are original colors chosen to sit in
// the same tradition as the genre, never sampled from another game's assets.
//
// Pure: no DOM, no Three, no imports, deterministic. A Vitest imports it directly.

/** The three value stops every family carries. Named by VALUE, not by role, so a
 *  generator asks for the value it needs rather than guessing at a semantic. */
export type PaletteTier = 'light' | 'mid' | 'dark';

/** A hue family: one material concept across three values. */
export interface PaletteRamp {
  /** Light stop: highlight, sun-facing planes, the top of a bevel. */
  readonly light: string;
  /** Mid stop: the surface's base colour, the one a flat plane gets. */
  readonly mid: string;
  /** Dark stop: baked contact shadow, cavity, the underside of an eave. */
  readonly dark: string;
}

export type PaletteFamily =
  | 'stone'
  | 'bark'
  | 'foliage'
  | 'earth'
  | 'thatch'
  | 'clay'
  | 'water'
  | 'brass'
  | 'iron'
  | 'bone'
  | 'ember'
  | 'arcane';

/**
 * The world palette. Twelve families, three stops each.
 *
 * Adding a family is a deliberate art-direction decision, not a convenience: the
 * whole value of this table is that it is small enough to hold in your head and
 * reused everywhere. Prefer re-tuning an existing ramp over adding a new one.
 */
export const PALETTE: Readonly<Record<PaletteFamily, PaletteRamp>> = {
  // Walls, flagging, dungeon block. The most common surface in the game, so its
  // mid value effectively sets the world's baseline exposure: moving it moves
  // how bright everything else feels.
  stone: { light: '#b9b3a6', mid: '#979184', dark: '#3a3733' },
  // Trunks, beams, palisade. Warm and dark enough to read AGAINST foliage
  // without matching it, which is the pairing that fails most often.
  bark: { light: '#c79a5e', mid: '#7d5424', dark: '#2a1b0c' },
  // Canopy, bush, grass tuft. Deliberately desaturated at the light end so a
  // sunlit leaf never fights an ember, a health bar, or a loot beam.
  foliage: { light: '#a3c46e', mid: '#587f3a', dark: '#16220f' },
  // Path, tilled ground, cave floor. Sits between stone and bark and must not
  // collapse into either; that collapse is what makes a road vanish into a wall.
  earth: { light: '#d0b489', mid: '#a88154', dark: '#2b2015' },
  // Roofing straw, rope, sackcloth. The lightest family, doing the work of a
  // highlight across a whole village roofline.
  thatch: { light: '#e2cfa4', mid: '#bc9e6f', dark: '#6b5738' },
  // Roof tile, brick, pottery. The one warm red in the world, so it reads as
  // built human space from across a valley.
  clay: { light: '#e8946c', mid: '#a65037', dark: '#3d1710' },
  // River, marsh, sky reflection. The only family that should read as recessive
  // rather than solid, hence cool and light throughout.
  water: { light: '#a9cfec', mid: '#649ee1', dark: '#26445f' },
  // Lamp, hinge, coin, trim. The accent metal. Scarcity is the point: it signals
  // interactive or valuable, and it stops signalling if it is everywhere.
  brass: { light: '#d9b96a', mid: '#9c7f42', dark: '#4e3d1c' },
  // Blade, buckle, portcullis, chain. Near neutral with a COLD bias, which is
  // what separates it from brass at a glance instead of on inspection.
  iron: { light: '#b2b8bf', mid: '#777f88', dark: '#1c1f22' },
  // Skeleton, parchment, banner field. The near white of the world, kept off
  // pure white so it still takes paint and shadow.
  bone: { light: '#ece0c4', mid: '#bfae8c', dark: '#6d6250' },
  // Fire, forge glow, torchlight, spell heat. EMISSIVE ONLY: never a base
  // surface. If a wall is this colour, something has gone wrong.
  ember: { light: '#ffb54a', mid: '#e0642a', dark: '#7a2411' },
  // Spell effect, rune, enchantment. The one cool accent, reserved for magic so
  // it never competes with brass for the player's attention.
  arcane: { light: '#b39ce6', mid: '#6f4fbd', dark: '#312163' },
};

/** Look up one stop. The call generators make instead of inlining a literal. */
export function paletteHex(family: PaletteFamily, tier: PaletteTier): string {
  return PALETTE[family][tier];
}

/**
 * WCAG relative luminance of a `#rrggbb` string, 0 (black) to 1 (white).
 *
 * This is the greyscale test expressed as a number: it is the same luminance a
 * greyscale conversion collapses to, so two colours with equal luminance are
 * indistinguishable once colour is stripped, however different their hues.
 */
export function relativeLuminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((raw) => {
    const s = raw / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Light-to-dark luminance distance for a family: how much it survives greyscale. */
export function paletteValueSpread(family: PaletteFamily): number {
  const ramp = PALETTE[family];
  return relativeLuminance(ramp.light) - relativeLuminance(ramp.dark);
}

/**
 * The floor every family's value spread must clear.
 *
 * Not a taste judgement: below roughly this distance the light and dark stops
 * converge under greyscale, the ramp stops describing form, and the surface
 * flattens at gameplay camera distance. Pinned by `tests/palette_core.test.ts`
 * so a future re-tune cannot quietly flatten a family.
 */
export const MIN_VALUE_SPREAD = 0.3;
