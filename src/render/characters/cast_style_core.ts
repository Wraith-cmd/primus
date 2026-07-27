// Which spellcast gesture an ability plays.
//
// Before this split every cast in the game shared one clip (KayKit
// `Spellcasting`), so a heal, a bolt and a buff were visually identical. The
// rigs already ship two more gestures (`Spellcast_Shoot`, `Spellcast_Raise`)
// that were only wired to emotes; this core decides which one a cast earns.
//
// Read from the ability's own payload rather than a hand-maintained id list, so
// new content picks up a gesture without a second edit here. Offensive wins over
// beneficial for hybrids (a drain that damages and heals still reads as a
// thrust), and anything unclassified keeps the original shared pose.
//
// Pure leaf core (no three.js, no DOM): a Vitest imports it directly, and the
// renderer is a thin consumer that hands the result to AnimState.

import { ABILITIES } from '../../sim/data';
import type { CastStyle } from './anim_state';

// Payloads that read as "arms lifted": heals, shields, and the buffs a caster
// places on a target or themselves.
const RAISE_EFFECTS = new Set(['heal', 'hot', 'aoeHeal', 'absorb', 'buffTarget', 'selfBuff']);

// Payloads that read as "thrust forward": bolts, damage over time, and the
// debuffs that ride them.
const SHOOT_EFFECTS = new Set(['directDamage', 'dot', 'applyDebuff']);

/** Gesture family for an in-progress cast. Physical abilities keep the shared
 *  pose: their animation comes from the weapon swing path, not the cast pose. */
export function castStyleForAbility(abilityId: string | null | undefined): CastStyle {
  if (!abilityId) return 'channel';
  const ability = ABILITIES[abilityId];
  if (!ability || ability.school === 'physical') return 'channel';
  const effects = ability.effects ?? [];
  if (effects.some((effect) => SHOOT_EFFECTS.has(effect.type))) return 'shoot';
  if (effects.some((effect) => RAISE_EFFECTS.has(effect.type))) return 'raise';
  return 'channel';
}
