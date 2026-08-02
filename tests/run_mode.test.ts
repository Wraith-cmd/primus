import { describe, expect, it } from 'vitest';
import {
  loadOffline,
  OFFLINE_SAVE_KEY,
  offlineSaveKey,
  saveOffline,
} from '../src/game/offline_save';
import {
  RUN_CHARACTER_NAME,
  RUN_SAVE_MODE,
  saveRunCharacter,
  startRunMode,
} from '../src/game/run_mode';
import { dungeonEntranceIdAt } from '../src/sim/companions/party';
import { DEFAULT_COMPANION_ROLES } from '../src/sim/companions/role_kit';
import { talentsFor, validateAllocation } from '../src/sim/content/talents';
import { DUNGEONS, ITEMS } from '../src/sim/data';
import { canEquipItem, canEquipItemInSlot } from '../src/sim/equipment_rules';
import { meetsLevelRequirement } from '../src/sim/item_level_req';
import {
  buildRunPreset,
  RUN_PRESET_GEAR_LEVEL,
  RUN_PRESET_LEVEL,
  RUN_PRESET_SPECS,
  runModeDungeonIds,
  runModeSpawnPos,
} from '../src/sim/run_preset';
import type { CharacterState } from '../src/sim/sim';
import { ALL_CLASSES, type EquipSlot, MAX_LEVEL } from '../src/sim/types';

const SEED = 20260801;

// Minimal in-memory Storage: run mode only ever calls three methods on it.
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

describe('run mode preset', () => {
  it('dresses a valid capped character for every class', () => {
    for (const cls of ALL_CLASSES) {
      const preset = buildRunPreset(cls);
      expect(preset, cls).not.toBeNull();
      if (!preset) continue;
      expect(preset.level, cls).toBe(MAX_LEVEL);
      expect(preset.level, cls).toBe(RUN_PRESET_LEVEL);
      // The gear pool is chosen for this level; a cap raise that left the pool
      // behind would hand out under-tier gear silently.
      expect(RUN_PRESET_GEAR_LEVEL, cls).toBe(RUN_PRESET_LEVEL);
    }
  });

  it('picks only gear the class can actually wear, in the slot it lands in', () => {
    for (const cls of ALL_CLASSES) {
      const preset = buildRunPreset(cls);
      if (!preset) throw new Error(`no preset for ${cls}`);
      const slots = Object.keys(preset.equip) as EquipSlot[];
      // A capped character with an empty paperdoll is not a character the owner
      // can evaluate a dungeon with. Both hands plus armour plus jewelry.
      expect(slots.length, cls).toBeGreaterThanOrEqual(10);
      for (const slot of slots) {
        const itemId = preset.equip[slot];
        if (!itemId) throw new Error(`${cls}: empty ${slot}`);
        const item = ITEMS[itemId];
        expect(item, `${cls} ${slot} ${itemId}`).toBeTruthy();
        expect(canEquipItem(cls, item), `${cls} can equip ${itemId}`).toBe(true);
        expect(
          canEquipItemInSlot(cls, item, slot, preset.spec),
          `${cls} ${itemId} in ${slot}`,
        ).toBe(true);
        expect(
          meetsLevelRequirement(RUN_PRESET_LEVEL, item),
          `${cls} ${itemId} level requirement`,
        ).toBe(true);
        if (item.requiredClass) expect(item.requiredClass, `${cls} ${itemId}`).toContain(cls);
      }
      // The two rings must be different items, or one finger is wasted.
      if (preset.equip.ring1 && preset.equip.ring2) {
        expect(preset.equip.ring1, cls).not.toBe(preset.equip.ring2);
      }
      for (const consumable of preset.consumables) {
        expect(ITEMS[consumable.itemId], `${cls} ${consumable.itemId}`).toBeTruthy();
        expect(consumable.count, cls).toBeGreaterThan(0);
      }
    }
  });

  it('allocates a spec and every choice row the cap unlocks', () => {
    for (const cls of ALL_CLASSES) {
      const preset = buildRunPreset(cls);
      if (!preset) throw new Error(`no preset for ${cls}`);
      expect(preset.spec, cls).toBe(RUN_PRESET_SPECS[cls]);
      const tree = talentsFor(cls);
      expect(
        tree?.specs.map((s) => s.id),
        cls,
      ).toContain(preset.spec);
      const check = validateAllocation(cls, preset.talents, RUN_PRESET_LEVEL);
      expect(check.ok, `${cls}: ${check.reason ?? ''}`).toBe(true);
      // Six rows unlock by the cap; none of them may be left unspent.
      expect(Object.keys(preset.talents.rows).length, cls).toBe(6);
    }
  });
});

describe('run mode dungeons', () => {
  it('offers only dungeons with a real overworld entrance and trash to fight', () => {
    const offered = runModeDungeonIds();
    expect(offered.length).toBeGreaterThan(0);
    for (const id of offered) {
      const def = DUNGEONS[id];
      expect(def, id).toBeTruthy();
      expect(def.overworldDoor, id).not.toBe(false);
      expect((def.spawns ?? []).length, id).toBeGreaterThan(0);
    }
    // The raid antechamber has a door but no trash, so it is not a run target.
    expect(offered).not.toContain('nythraxis_boss_arena');
    expect(offered).not.toContain('nythraxis_crypt');
  });

  it('spawns inside the companion recruit radius of every dungeon it offers', () => {
    for (const id of runModeDungeonIds()) {
      const pos = runModeSpawnPos(id);
      expect(pos, id).not.toBeNull();
      if (!pos) continue;
      // dungeonEntranceIdAt is the gate canRecruit reads. If it does not name
      // this dungeon, the party cannot be hired here.
      expect(dungeonEntranceIdAt({ x: pos.x, y: 0, z: pos.z }), id).toBe(id);
    }
  });

  it('refuses a spawn point for a dungeon with no overworld door', () => {
    expect(runModeSpawnPos('nythraxis_boss_arena')).toBeNull();
    expect(runModeSpawnPos('not_a_dungeon')).toBeNull();
  });
});

describe('startRunMode', () => {
  it('lands every class at the cap, at the door, with a full party', () => {
    for (const cls of ALL_CLASSES) {
      const session = startRunMode({ playerClass: cls, seed: SEED, storage: null });
      const player = session.sim.player;
      expect(player.level, cls).toBe(MAX_LEVEL);
      expect(player.hp, cls).toBe(player.maxHp);
      expect(session.resumed, cls).toBe(false);
      // Standing at the door the run was asked for, close enough to hire.
      expect(dungeonEntranceIdAt(player.pos), cls).toBe(session.dungeonId);
      // Tank, healer, dps, dps: the whole point of the harness.
      expect(session.companionRoles, cls).toEqual([...DEFAULT_COMPANION_ROLES]);
      const party = session.sim.companionPartyFor(session.sim.playerId);
      expect(party?.dungeonId, cls).toBe(session.dungeonId);
      expect(
        party?.members.every((m) => m.level === MAX_LEVEL),
        cls,
      ).toBe(true);
      // A capped kit means capped abilities too.
      expect(session.sim.known.length, cls).toBeGreaterThan(10);
      // Keybinds scope away from the offline character's.
      expect(session.keybindScope, cls).toBe(`run:${cls}`);
    }
  });

  it('honours the requested dungeon and falls back rather than stranding the run', () => {
    for (const id of runModeDungeonIds()) {
      const session = startRunMode({ playerClass: 'warrior', dungeonId: id, seed: SEED });
      expect(session.dungeonId).toBe(id);
      expect(dungeonEntranceIdAt(session.sim.player.pos)).toBe(id);
      expect(session.companionRoles).toHaveLength(4);
    }
    const bogus = startRunMode({ playerClass: 'warrior', dungeonId: 'nowhere', seed: SEED });
    expect(runModeDungeonIds()).toContain(bogus.dungeonId);
    expect(dungeonEntranceIdAt(bogus.sim.player.pos)).toBe(bogus.dungeonId);
  });

  it('keeps the party alive across ticks at the door', () => {
    const session = startRunMode({ playerClass: 'druid', seed: SEED });
    for (let i = 0; i < 40; i++) session.sim.tick();
    expect(session.sim.companionPartyFor(session.sim.playerId)?.members).toHaveLength(4);
  });
});

describe('the run save slot cannot reach the offline character', () => {
  it('uses a different storage key', () => {
    expect(offlineSaveKey('run')).not.toBe(offlineSaveKey('offline'));
    expect(offlineSaveKey('offline')).toBe(OFFLINE_SAVE_KEY);
    expect(offlineSaveKey()).toBe(OFFLINE_SAVE_KEY);
  });

  it('never writes a byte under the offline key', () => {
    const storage = fakeStorage();
    // The owner's leveled character, already in the slot.
    const owner: CharacterState = { level: 20, xp: 999 } as unknown as CharacterState;
    saveOffline(storage, {
      playerClass: 'druid',
      playerName: RUN_CHARACTER_NAME, // deliberately the same name run mode uses
      skin: 0,
      seed: SEED,
      state: owner,
      savedAt: 1,
    });
    const before = storage.getItem(OFFLINE_SAVE_KEY);

    const session = startRunMode({ playerClass: 'druid', seed: SEED, storage });
    expect(saveRunCharacter(session.sim, 'druid', 0, SEED, storage, 2)).toBe(true);

    expect(storage.getItem(OFFLINE_SAVE_KEY)).toBe(before);
    expect(storage.getItem(offlineSaveKey('run'))).toBeTruthy();
    // And the offline reader still finds exactly what it wrote.
    const reread = loadOffline(storage);
    expect(reread?.state).toEqual(owner);
    expect(reread?.mode).toBe('offline');
  });

  it('refuses to read a run save as an offline one, and the reverse', () => {
    const storage = fakeStorage();
    const state = { level: 20 } as unknown as CharacterState;
    saveOffline(storage, {
      mode: RUN_SAVE_MODE,
      playerClass: 'mage',
      playerName: RUN_CHARACTER_NAME,
      skin: 0,
      seed: SEED,
      state,
      savedAt: 1,
    });
    expect(loadOffline(storage, 'run')).toBeTruthy();
    expect(loadOffline(storage, 'offline')).toBeNull();

    // Cross-contaminated storage: a run envelope parked under the offline key is
    // refused rather than handed back as somebody's leveled character.
    storage.setItem(OFFLINE_SAVE_KEY, storage.getItem(offlineSaveKey('run')) ?? '');
    expect(loadOffline(storage, 'offline')).toBeNull();
  });

  it('reads a save written before run mode existed as an offline save', () => {
    const storage = fakeStorage();
    // Exactly the envelope the shipped writer produced: no mode field at all.
    storage.setItem(
      OFFLINE_SAVE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: 1,
        playerClass: 'warrior',
        playerName: 'Owner',
        skin: 3,
        seed: SEED,
        state: { level: 18 },
      }),
    );
    const loaded = loadOffline(storage);
    expect(loaded?.playerName).toBe('Owner');
    expect(loaded?.mode).toBe('offline');
  });

  it('resumes only a run save of the same class', () => {
    const storage = fakeStorage();
    const first = startRunMode({ playerClass: 'rogue', seed: SEED, storage });
    expect(first.resumed).toBe(false);
    saveRunCharacter(first.sim, 'rogue', 0, SEED, storage, 1);

    expect(startRunMode({ playerClass: 'rogue', seed: SEED, storage }).resumed).toBe(true);
    expect(startRunMode({ playerClass: 'mage', seed: SEED, storage }).resumed).toBe(false);
    expect(startRunMode({ playerClass: 'rogue', seed: SEED, storage, resume: false }).resumed).toBe(
      false,
    );
  });
});
