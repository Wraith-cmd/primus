// The run-mode preset character: a fixed level-cap build, one per class.
//
// Run mode is the fork's second door (see PRIMUS_PHASE_4_5.md, "Run mode: the
// second entry point"): pick a class, land at a dungeon entrance at the level
// cap with a coherent kit and a party, and walk in. The owner's decision is that
// this is a PRESET character, never his leveled one, so the whole build has to be
// derivable from the content tables with no save, no loot history, and no
// progression state behind it.
//
// This module answers exactly one question: "what does that preset character
// look like?" It builds a description, it never applies one. Applying it is the
// host's job (src/game/run_mode.ts), which keeps this file a pure leaf a Vitest
// can drive in plain Node.
//
// REUSE, not reinvention. The gear pass is `buildDevKit` (src/sim/dev_kit.ts): a
// deterministic argmax over ITEMS that already respects `requiredClass`, armor
// weight, dual-wield and shield rules, and the fresh-20 tier. That module is a
// PURE LEAF, not a dev command: nothing here is gated on `ALLOW_DEV_COMMANDS` and
// nothing here goes through the `/dev` chat surface.
//
// Deterministic: an argmax over static tables plus fixed table lookups. No rng,
// no clock, so the same class always yields a byte-identical preset and two
// playtests differ by what the tester did, never by what they were handed.
//
// `src/sim`-pure leaf: no DOM/Three/render/ui/game/net imports, no SimContext.

import { devKitRole } from './content/dev_kit_roles';
import { rowTreeFor, type TalentAllocation, type TalentRowLevel } from './content/talents';
import { CLASSES, DUNGEONS, ITEMS } from './data';
import { buildDevKit, DEV_KIT_LEVEL, roleItemScore } from './dev_kit';
import { canEquipItem, canEquipItemInSlot } from './equipment_rules';
import { itemFromRaid } from './item_level';
import { meetsLevelRequirement } from './item_level_req';
import type { EquipSlot, ItemDef, PlayerClass } from './types';
import { MAX_LEVEL } from './types';

/** The level a run-mode character enters at. The cap, by definition: the mode
 *  exists so a dungeon can be tested without leveling to it first. */
export const RUN_PRESET_LEVEL = MAX_LEVEL;

/** The specialization each class enters run mode in.
 *
 *  One pick per class, chosen so the preset is a coherent fifth member of a
 *  party that already brings a tank, a healer and two dps: mostly damage, plus
 *  the druid on feral because the bear tank is the build the phase doc names as
 *  the thing worth playtesting. Ids are exactly as declared in
 *  content/talents.ts, pinned by tests/run_preset.test.ts. */
export const RUN_PRESET_SPECS: Readonly<Record<PlayerClass, string>> = Object.freeze({
  warrior: 'arms',
  paladin: 'retribution',
  hunter: 'marksmanship',
  rogue: 'combat',
  priest: 'shadow',
  shaman: 'enhancement',
  mage: 'frost',
  warlock: 'destruction',
  druid: 'feral',
});

/** How far in front of the door the preset character stands, in world units.
 *  The same offset `addPlayer` uses when it ejects a character saved inside an
 *  instance, so run mode lands where every other arrival at that door lands:
 *  comfortably inside the companion recruit radius, not on top of the portal. */
export const RUN_SPAWN_DOOR_OFFSET_Z = 4;

/** Consumables the preset carries in. Not a balance statement: a run is twenty
 *  minutes long and there is no vendor trip in it, so the character arrives with
 *  the potions and food a player would have bought first. */
export const RUN_PRESET_POTION_COUNT = 5;
const RUN_HEALTH_POTION = 'healing_potion';
const RUN_MANA_POTION = 'mana_potion';
const RUN_FOOD = 'trail_hardtack';
const RUN_DRINK = 'meltwater_flask';

export interface RunPresetConsumable {
  itemId: string;
  count: number;
}

export interface RunPreset {
  cls: PlayerClass;
  spec: string;
  level: number;
  /** The whole talent allocation, ready for `Sim.applyTalents`. */
  talents: TalentAllocation;
  /** The whole paperdoll: slot to item id, weapons already resolved into hands. */
  equip: Partial<Record<EquipSlot, string>>;
  /** Just the neck and rings, in the order they must be equipped (a ring resolves
   *  into the first FREE finger, so the second one only lands correctly after the
   *  first). Kept separate because `applyDevKit` owns the rest and does not know
   *  about this pass. */
  jewelry: Partial<Record<EquipSlot, string>>;
  bagId: string | null;
  bagSockets: number;
  consumables: RunPresetConsumable[];
}

/** The dungeons run mode offers, in the order the picker shows them.
 *
 *  Derived, never hand-listed. Two conditions, and both are load bearing:
 *   - an OVERWORLD door, because that door is the only place `canRecruit` lets
 *     the party be assembled, so a door-less interior would produce a party-less
 *     run;
 *   - at least one authored spawn, because a run target with no trash in it is
 *     not something a playtest can learn anything from. This is what excludes
 *     `nythraxis_crypt` (named as a run target in PRIMUS_PHASE_4_5.md): its def
 *     carries only the attunement relics, the fight is through the sealed door in
 *     the raid arena behind it.
 *
 *  Sorted by the content table's own `index` so the picker matches progression
 *  order and never wobbles with table insertion order. */
export function runModeDungeonIds(): string[] {
  return Object.values(DUNGEONS)
    .filter((def) => def.overworldDoor !== false && (def.spawns?.length ?? 0) > 0)
    .sort((a, b) => (a.index !== b.index ? a.index - b.index : a.id < b.id ? -1 : 1))
    .map((def) => def.id);
}

/** Where a run-mode character stands when it enters, or null for a dungeon with
 *  no overworld door (which run mode never offers). */
export function runModeSpawnPos(dungeonId: string): { x: number; z: number } | null {
  const def = DUNGEONS[dungeonId];
  if (!def || def.overworldDoor === false) return null;
  return { x: def.doorPos.x, z: def.doorPos.z - RUN_SPAWN_DOOR_OFFSET_Z };
}

/** The preset's talent allocation: the spec, plus a pick in every choice row the
 *  cap unlocks.
 *
 *  Each row takes its FIRST authored option. That is a deliberate placeholder
 *  rather than a recommendation: it is stable, it is a valid allocation
 *  `validateAllocation` accepts, and it means the preset never arrives with
 *  unspent rows. Tuning the picks is a later pass, and it is a one-line change
 *  per row when it happens. */
export function runPresetTalents(cls: PlayerClass, spec: string): TalentAllocation {
  const rows: Partial<Record<TalentRowLevel, string>> = {};
  for (const row of rowTreeFor(cls) ?? []) {
    if (row.level > RUN_PRESET_LEVEL) continue;
    rows[row.level] = row.options[0].id;
  }
  return { spec, rows };
}

/** The consumables the preset carries. Mana users also get mana potions and a
 *  drink; a rage or energy class would only be carrying dead weight. */
export function runPresetConsumables(cls: PlayerClass): RunPresetConsumable[] {
  const out: RunPresetConsumable[] = [
    { itemId: RUN_HEALTH_POTION, count: RUN_PRESET_POTION_COUNT },
    { itemId: RUN_FOOD, count: RUN_PRESET_POTION_COUNT },
  ];
  if (CLASSES[cls]?.resourceType === 'mana') {
    out.push({ itemId: RUN_MANA_POTION, count: RUN_PRESET_POTION_COUNT });
    out.push({ itemId: RUN_DRINK, count: RUN_PRESET_POTION_COUNT });
  }
  return out;
}

// -------------------------------------------------------------------------
// Jewelry, the one place run mode's tier differs from the dev kit's
// -------------------------------------------------------------------------
//
// `buildDevKit` caps its pool below epic on purpose: it dresses a FRESH twenty
// for a balance test, and a fresh twenty is not wearing epics. Run mode dresses a
// character that is at the cap and going straight into a dungeon, so that cap is
// the wrong one here in exactly one place: EVERY neck and ring in this game is
// authored epic, so inheriting it leaves the preset with a bare neck and two
// bare fingers. A capped character with three empty slots is not a character the
// owner can evaluate a dungeon with.
//
// So the jewelry pass is additive and narrow: same scorer, same class and level
// legality, same "nothing above the dungeon tier" exclusions, quality cap lifted
// for these three slots only. `buildDevKit` itself is untouched, because it is
// shared with the /dev kit command and its tier is deliberate there.

const JEWELRY_SLOTS: readonly EquipSlot[] = ['neck', 'ring1', 'ring2'];

/** Whether an item belongs in the run-mode jewelry pool for `cls`. */
export function isRunJewelryItem(cls: PlayerClass, item: ItemDef): boolean {
  if (item.kind !== 'armor') return false;
  if (item.slot !== 'neck' && item.slot !== 'ring') return false;
  if (!canEquipItem(cls, item)) return false;
  // Jewelry carries no armor class, so canEquipItem falls through the weight gate
  // without ever reading requiredClass. Ask literally, or a class-locked piece
  // ends up on the wrong character.
  if (item.requiredClass && !item.requiredClass.includes(cls)) return false;
  // The same above-tier exclusions the dev kit applies, minus the quality cap:
  // heroic variants, bespoke heroic pieces, raid drops and PvP gear all sit above
  // what a run-mode character is meant to arrive in.
  if (item.heroicOf !== undefined || item.heroic === true) return false;
  if (
    item.pvpOffenseRating !== undefined ||
    item.pvpDefenseRating !== undefined ||
    item.priceHonor !== undefined
  ) {
    return false;
  }
  if (itemFromRaid(item.id)) return false;
  return meetsLevelRequirement(RUN_PRESET_LEVEL, item);
}

// Deterministic argmax; ties break on id, exactly as the dev kit's does, so the
// same class always gets the same jewelry.
function bestJewelry(
  candidates: readonly ItemDef[],
  score: (item: ItemDef) => number,
): ItemDef | null {
  let best: ItemDef | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const item of candidates) {
    const value = score(item);
    if (value > bestScore || (value === bestScore && best !== null && item.id < best.id)) {
      best = item;
      bestScore = value;
    }
  }
  return best;
}

/** Fill neck and both rings for a class-and-spec pair. Two DIFFERENT rings: the
 *  per-slot pass would otherwise put the same id on both hands. */
export function runPresetJewelry(
  cls: PlayerClass,
  spec: string,
): Partial<Record<EquipSlot, string>> {
  const role = devKitRole(cls, spec);
  if (!role) return {};
  const score = (item: ItemDef): number => roleItemScore(role, item);
  const pool = Object.values(ITEMS).filter((item) => isRunJewelryItem(cls, item));
  const out: Partial<Record<EquipSlot, string>> = {};
  const taken = new Set<string>();
  for (const slot of JEWELRY_SLOTS) {
    const best = bestJewelry(
      pool.filter((item) => !taken.has(item.id) && canEquipItemInSlot(cls, item, slot, spec)),
      score,
    );
    if (!best) continue;
    out[slot] = best.id;
    taken.add(best.id);
  }
  return out;
}

/** The preset spec for a class. Exposed so a caller can name the build without
 *  building the whole kit. */
export function runPresetSpec(cls: PlayerClass): string {
  return RUN_PRESET_SPECS[cls];
}

/** Build the whole preset for one class.
 *
 *  `spec` overrides the default pick (the picker does not offer that yet; the
 *  parameter exists so a playtest can ask for the tank build of a class whose
 *  default is dps without a second entry point). Returns null only when the
 *  class-and-spec pair has no gear role declared, which the pinned test proves
 *  cannot happen for the defaults. */
export function buildRunPreset(cls: PlayerClass, spec?: string): RunPreset | null {
  const picked = spec ?? runPresetSpec(cls);
  const kit = buildDevKit(cls, picked);
  if (!kit) return null;
  const jewelry = runPresetJewelry(cls, picked);
  return {
    cls,
    spec: picked,
    // The gear pool is chosen for DEV_KIT_LEVEL; the character enters at the cap,
    // and the two are the same number. Asserted by tests/run_preset.test.ts so a
    // future cap raise cannot silently hand out under-tier gear.
    level: RUN_PRESET_LEVEL,
    talents: runPresetTalents(cls, picked),
    equip: { ...kit.equip, ...jewelry },
    jewelry,
    bagId: kit.bagId,
    bagSockets: kit.bagSockets,
    consumables: runPresetConsumables(cls),
  };
}

/** The gear tier the preset dresses for. Re-exported so a test can pin it against
 *  the entry level without reaching into the kit module. */
export { DEV_KIT_LEVEL as RUN_PRESET_GEAR_LEVEL };
