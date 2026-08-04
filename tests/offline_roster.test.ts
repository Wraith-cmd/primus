// The offline character ROSTER: several saved characters instead of one slot.
//
// The destructive half of the old single-slot bug is already fixed (a different
// character triggers a `replace` plan and the write is refused without consent,
// see offline_resume.ts). What remained is the reason that protection had to
// exist at all: there was exactly ONE offline slot, so keeping a tank and a
// caster meant destroying one to play the other.
//
// These drive the storage layer directly, in plain Node, so every branch is
// covered without a browser.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearOffline,
  deleteOfflineCharacter,
  listOfflineCharacters,
  loadOfflineCharacter,
  OFFLINE_SAVE_KEY,
  OFFLINE_SAVE_VERSION,
  type OfflineSaveInput,
  saveOffline,
} from '../src/game/offline_save';
import type { CharacterState } from '../src/sim/sim';

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

const stateAt = (level: number) => ({ level }) as unknown as CharacterState;

function input(over: Partial<OfflineSaveInput> = {}): OfflineSaveInput {
  return {
    playerClass: 'druid',
    playerName: 'Bruin',
    skin: 0,
    seed: 1,
    savedAt: 1000,
    state: stateAt(12),
    ...over,
  };
}

describe('offline character roster', () => {
  let storage: Storage;
  beforeEach(() => {
    storage = fakeStorage();
  });

  it('keeps two characters of DIFFERENT classes at the same time', () => {
    // The whole point: a bear for tanking work and a caster for spell work,
    // both persisted, neither destroying the other.
    expect(saveOffline(storage, input({ playerClass: 'druid', playerName: 'Bruin' }))).toBe(true);
    expect(saveOffline(storage, input({ playerClass: 'mage', playerName: 'Ember' }))).toBe(true);

    const roster = listOfflineCharacters(storage);
    expect(roster).toHaveLength(2);
    expect(roster.map((r) => r.playerName).sort()).toEqual(['Bruin', 'Ember']);
  });

  it('keeps two characters of the SAME class with different names', () => {
    saveOffline(storage, input({ playerClass: 'druid', playerName: 'Bruin' }));
    saveOffline(storage, input({ playerClass: 'druid', playerName: 'Thornback' }));
    expect(listOfflineCharacters(storage)).toHaveLength(2);
  });

  it('overwrites the SAME character rather than duplicating it', () => {
    saveOffline(storage, input({ playerName: 'Bruin', state: stateAt(12) }));
    saveOffline(storage, input({ playerName: 'Bruin', state: stateAt(19) }));
    const roster = listOfflineCharacters(storage);
    expect(roster).toHaveLength(1);
    expect(roster[0].level).toBe(19);
  });

  // The identity fold that offline_resume already uses for matching: a player
  // who retypes their name with a different shift key must resume, not fork a
  // second character that then looks like data loss.
  it('treats a case or whitespace variant as the same character', () => {
    saveOffline(storage, input({ playerName: 'Bruin' }));
    saveOffline(storage, input({ playerName: '  bruin ' }));
    expect(listOfflineCharacters(storage)).toHaveLength(1);
  });

  it('loads a specific character back by class and name', () => {
    saveOffline(storage, input({ playerClass: 'druid', playerName: 'Bruin', state: stateAt(12) }));
    saveOffline(storage, input({ playerClass: 'mage', playerName: 'Ember', state: stateAt(7) }));

    const bear = loadOfflineCharacter(storage, 'druid', 'Bruin');
    expect(bear?.playerName).toBe('Bruin');
    expect((bear?.state as { level: number }).level).toBe(12);

    const caster = loadOfflineCharacter(storage, 'mage', 'Ember');
    expect((caster?.state as { level: number }).level).toBe(7);

    // A class that was never saved is a miss, not somebody else's character.
    expect(loadOfflineCharacter(storage, 'warrior', 'Bruin')).toBeNull();
  });

  it('deletes one character without touching the others', () => {
    saveOffline(storage, input({ playerClass: 'druid', playerName: 'Bruin' }));
    saveOffline(storage, input({ playerClass: 'mage', playerName: 'Ember' }));
    deleteOfflineCharacter(storage, 'druid', 'Bruin');

    const roster = listOfflineCharacters(storage);
    expect(roster).toHaveLength(1);
    expect(roster[0].playerName).toBe('Ember');
  });

  it('sorts the roster most recently played first', () => {
    saveOffline(storage, input({ playerName: 'Old', savedAt: 1000 }));
    saveOffline(storage, input({ playerName: 'Newest', savedAt: 9000 }));
    saveOffline(storage, input({ playerName: 'Middle', savedAt: 5000 }));
    expect(listOfflineCharacters(storage).map((r) => r.playerName)).toEqual([
      'Newest',
      'Middle',
      'Old',
    ]);
  });

  // MIGRATION, and this is the one that must never regress: the owner has a real
  // leveled character under the original bare key. It has to appear in the roster
  // and be loadable, and the legacy bytes must survive until its own key exists.
  it('adopts a legacy single-slot save into the roster', () => {
    storage.setItem(
      OFFLINE_SAVE_KEY,
      JSON.stringify({
        version: OFFLINE_SAVE_VERSION,
        savedAt: 4242,
        playerClass: 'druid',
        playerName: 'Legacy',
        skin: 2,
        seed: 77,
        state: stateAt(23),
      }),
    );

    const roster = listOfflineCharacters(storage);
    expect(roster).toHaveLength(1);
    expect(roster[0].playerName).toBe('Legacy');
    expect(roster[0].level).toBe(23);

    const loaded = loadOfflineCharacter(storage, 'druid', 'Legacy');
    expect(loaded?.seed).toBe(77);
    expect(loaded?.skin).toBe(2);
  });

  it('does not double-count a legacy save once it has its own key', () => {
    saveOffline(storage, input({ playerClass: 'druid', playerName: 'Bruin', savedAt: 2000 }));
    // A legacy blob for the SAME identity, as if written before the roster existed.
    storage.setItem(
      OFFLINE_SAVE_KEY,
      JSON.stringify({
        version: OFFLINE_SAVE_VERSION,
        savedAt: 1000,
        playerClass: 'druid',
        playerName: 'Bruin',
        skin: 0,
        seed: 1,
        state: stateAt(9),
      }),
    );
    const roster = listOfflineCharacters(storage);
    expect(roster).toHaveLength(1);
    // The per-character key is authoritative: it is the newer write.
    expect(roster[0].level).toBe(12);
  });

  it('never lets a run-mode save appear in the offline roster', () => {
    saveOffline(storage, input({ mode: 'run', playerClass: 'warrior', playerName: 'Preset' }));
    saveOffline(storage, input({ playerClass: 'druid', playerName: 'Bruin' }));
    const roster = listOfflineCharacters(storage);
    expect(roster).toHaveLength(1);
    expect(roster[0].playerName).toBe('Bruin');
  });

  it('survives a storage holding unrelated and corrupt keys', () => {
    storage.setItem('unrelated', 'x');
    storage.setItem(`${OFFLINE_SAVE_KEY}.char.druid.broken`, '{not json');
    saveOffline(storage, input({ playerName: 'Bruin' }));
    expect(listOfflineCharacters(storage)).toHaveLength(1);
  });

  it('clearOffline still empties the legacy slot without harming the roster', () => {
    storage.setItem(
      OFFLINE_SAVE_KEY,
      JSON.stringify({
        version: OFFLINE_SAVE_VERSION,
        savedAt: 1,
        playerClass: 'mage',
        playerName: 'Old',
        skin: 0,
        seed: 1,
        state: stateAt(3),
      }),
    );
    saveOffline(storage, input({ playerClass: 'druid', playerName: 'Bruin' }));
    clearOffline(storage);
    expect(listOfflineCharacters(storage).map((r) => r.playerName)).toEqual(['Bruin']);
  });
});
