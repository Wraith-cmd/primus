import { describe, expect, it } from 'vitest';
import { castStyleForAbility } from '../src/render/characters/cast_style_core';
import { ABILITIES } from '../src/sim/data';

describe('cast gesture selection', () => {
  it('thrusts for offensive spells', () => {
    // Wildbolt (druid nature bolt) and Moonfire are direct-damage casts.
    expect(castStyleForAbility('wrath')).toBe('shoot');
    expect(castStyleForAbility('moonfire')).toBe('shoot');
  });

  it('raises for heals, hots and buffs', () => {
    expect(castStyleForAbility('healing_touch')).toBe('raise');
    expect(castStyleForAbility('rejuvenation')).toBe('raise');
    expect(castStyleForAbility('mark_of_the_wild')).toBe('raise');
  });

  it('leaves physical abilities on the shared pose (they animate as weapon swings)', () => {
    expect(castStyleForAbility('maul')).toBe('channel');
    expect(castStyleForAbility('bear_form')).toBe('channel');
  });

  it('falls back to the shared pose for no cast and for unknown ids', () => {
    expect(castStyleForAbility(null)).toBe('channel');
    expect(castStyleForAbility(undefined)).toBe('channel');
    expect(castStyleForAbility('not_a_real_ability')).toBe('channel');
  });

  it('prefers the offensive gesture when an ability both damages and helps', () => {
    // Hybrids read better as a thrust than as a lifted-arms heal. Assert the
    // rule directly rather than pinning a content id that may be retuned.
    const hybrid = Object.keys(ABILITIES).find((id) => {
      const ability = ABILITIES[id];
      if (ability.school === 'physical') return false;
      const kinds = new Set((ability.effects ?? []).map((effect) => effect.type));
      return (
        (kinds.has('directDamage') || kinds.has('dot')) && (kinds.has('heal') || kinds.has('hot'))
      );
    });
    if (hybrid) expect(castStyleForAbility(hybrid)).toBe('shoot');
  });

  it('classifies every non-physical player cast without throwing', () => {
    for (const id of Object.keys(ABILITIES)) {
      expect(['channel', 'shoot', 'raise']).toContain(castStyleForAbility(id));
    }
  });
});
