import type { Aura } from '../types';

// Persistent group buffs that are ONE per target regardless of caster: a second
// same-class caster REPLACES the existing aura instead of stacking a duplicate (no
// double Arcane Intellect, no two Sureflight Auras, etc.). Every party group buff
// belongs here. The buffTarget party buffs use the ability id as the aura id, while
// the aoeAllyAttackPower buffs apply as `${abilityId}_ap`. Exported so
// tests/group_buff_self_stacking.test.ts can enforce the rule: every aoeAlly
// group buff is either Bloodlust-style exhaustion-gated (the 'sated' debuff)
// or listed here; a new group buff with neither guard fails that test loudly.
export const SOURCE_INDEPENDENT_GROUP_BUFF_AURA_IDS: ReadonlySet<string> = new Set([
  'arcane_intellect',
  // Wildfang Rally (v0.27.1): two hunters must not double the +45 AP / +5%
  // haste; both halves dedupe across sources like every other group buff.
  'aspect_of_the_wild',
  'aspect_of_the_wild_ap',
  'battle_shout',
  'blessing_of_might',
  'devotion_aura',
  'mark_of_the_wild',
  'power_word_fortitude',
  'rallying_cry_dr',
  'rallying_cry_hp',
  'rune_of_power',
  'sanguine_aura',
  'trueshot_aura_ap', // Sureflight Aura (hunter aoeAllyAttackPower)
  'temporal_hourglass',
]);

// ---------------------------------------------------------------------------
// Independent-duration stacking (Ironpelt / Legion Ironfur)
// ---------------------------------------------------------------------------
// The classic stacking model above is REPLACEMENT: one aura per (id, sourceId),
// re-applying refreshes it, and a `stacks` counter rides that single aura (the
// Sunder Armor shape). That model cannot express "each application keeps its own
// timer", because there is only one `remaining` to decay.
//
// So an independent-duration stack is N SEPARATE auras that differ only by a
// slot suffix on the id: `ironfur#0`, `ironfur#1`, ... Each carries its own
// `remaining`, and every stat pass that SUMS an aura kind (recalcPlayerStats
// folds `buff_armor_pct` additively) sees the live total for free. Because the
// ids differ, `auraReplacementConflicts` leaves the siblings alone; because a
// refresh reuses an exact slot id, it still replaces cleanly.
export const INDEPENDENT_STACK_SEPARATOR = '#';

export function independentStackAuraId(baseId: string, slot: number): string {
  return `${baseId}${INDEPENDENT_STACK_SEPARATOR}${slot}`;
}

/** How many independent-duration stacks of `baseId` are live on `auras`. */
export function countIndependentStacks(auras: readonly Aura[], baseId: string): number {
  const prefix = `${baseId}${INDEPENDENT_STACK_SEPARATOR}`;
  let n = 0;
  for (const a of auras) if (a.id.startsWith(prefix)) n++;
  return n;
}

/** The aura id a fresh application of `baseId` should take.
 *
 *  Picks the LOWEST free slot below `maxStacks`. At the cap it returns the slot
 *  with the least time left (ties broken by the lower slot index), so applying
 *  over a full stack refreshes the one about to fall off rather than clipping a
 *  fresh one. Fully deterministic: no rng, no iteration-order dependence. */
export function allocateIndependentStackAuraId(
  auras: readonly Aura[],
  baseId: string,
  maxStacks: number,
): string {
  const cap = Math.max(1, Math.floor(maxStacks));
  const live = new Map<number, number>(); // slot -> remaining
  const prefix = `${baseId}${INDEPENDENT_STACK_SEPARATOR}`;
  for (const a of auras) {
    if (!a.id.startsWith(prefix)) continue;
    const slot = Number(a.id.slice(prefix.length));
    if (!Number.isInteger(slot) || slot < 0 || slot >= cap) continue;
    live.set(slot, Math.min(live.get(slot) ?? Infinity, a.remaining));
  }
  for (let slot = 0; slot < cap; slot++) {
    if (!live.has(slot)) return independentStackAuraId(baseId, slot);
  }
  let oldest = 0;
  let oldestRemaining = live.get(0) ?? 0;
  for (let slot = 1; slot < cap; slot++) {
    const remaining = live.get(slot) ?? 0;
    if (remaining < oldestRemaining) {
      oldest = slot;
      oldestRemaining = remaining;
    }
  }
  return independentStackAuraId(baseId, oldest);
}

export function auraReplacementConflicts(auras: readonly Aura[], aura: Aura): number[] {
  const replaceAcrossSources = SOURCE_INDEPENDENT_GROUP_BUFF_AURA_IDS.has(aura.id);
  const out: number[] = [];
  for (let i = auras.length - 1; i >= 0; i--) {
    const existing = auras[i];
    if (existing.id !== aura.id) continue;
    if (replaceAcrossSources || existing.sourceId === aura.sourceId) out.push(i);
  }
  return out;
}
