import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildOfflineSave,
  clearOffline,
  loadOffline,
  OFFLINE_SAVE_KEY,
  OFFLINE_SAVE_VERSION,
  type OfflineSaveInput,
  parseOfflineSave,
  saveOffline,
} from '../src/game/offline_save';
import type { CharacterState } from '../src/sim/sim';
import { Sim } from '../src/sim/sim';

// Minimal in-memory Storage: the module only uses three methods, and the two
// failure modes below need a store that can refuse a write.
function fakeStorage(opts: { refuseWrites?: boolean } = {}): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => {
      if (opts.refuseWrites) throw new DOMException('QuotaExceededError');
      map.set(k, v);
    },
  } as Storage;
}

const INPUT: OfflineSaveInput = {
  playerClass: 'druid',
  playerName: 'Bruin',
  skin: 2,
  seed: 1234,
  savedAt: 1_700_000_000_000,
  state: { level: 7 } as unknown as CharacterState,
};

describe('offline save envelope', () => {
  it('round-trips through storage', () => {
    const storage = fakeStorage();
    expect(saveOffline(storage, INPUT)).toBe(true);
    const loaded = loadOffline(storage);
    expect(loaded?.playerClass).toBe('druid');
    expect(loaded?.playerName).toBe('Bruin');
    expect(loaded?.skin).toBe(2);
    expect(loaded?.seed).toBe(1234);
    expect(loaded?.savedAt).toBe(1_700_000_000_000);
    expect(loaded?.version).toBe(OFFLINE_SAVE_VERSION);
  });

  it('stamps the current envelope version', () => {
    expect(buildOfflineSave(INPUT).version).toBe(OFFLINE_SAVE_VERSION);
  });

  it('reports a refused write instead of pretending it stuck', () => {
    expect(saveOffline(fakeStorage({ refuseWrites: true }), INPUT)).toBe(false);
  });

  it('reads an empty store as no save, not as an error', () => {
    expect(loadOffline(fakeStorage())).toBeNull();
  });

  it('rejects corrupt, non-object, and truncated payloads', () => {
    expect(parseOfflineSave(null)).toBeNull();
    expect(parseOfflineSave('')).toBeNull();
    expect(parseOfflineSave('{ not json')).toBeNull();
    expect(parseOfflineSave('"a string"')).toBeNull();
    expect(parseOfflineSave('42')).toBeNull();
    expect(parseOfflineSave(JSON.stringify({ version: OFFLINE_SAVE_VERSION }))).toBeNull();
  });

  it('rejects a save written by a different envelope version', () => {
    const stale = JSON.stringify({ ...buildOfflineSave(INPUT), version: OFFLINE_SAVE_VERSION + 1 });
    expect(parseOfflineSave(stale)).toBeNull();
  });

  it('clears the slot', () => {
    const storage = fakeStorage();
    saveOffline(storage, INPUT);
    expect(storage.getItem(OFFLINE_SAVE_KEY)).not.toBeNull();
    clearOffline(storage);
    expect(loadOffline(storage)).toBeNull();
  });
});

describe('offline save against a real Sim', () => {
  let sim: Sim;

  beforeEach(() => {
    sim = new Sim({ seed: 42, playerClass: 'druid', playerName: 'Bruin', autoEquip: true });
  });

  it('persists a real serialized character and restores it into a fresh Sim', () => {
    // Advance the character so the save carries something worth keeping.
    sim.setPlayerLevel(8);
    for (let i = 0; i < 20; i++) sim.tick();

    const state = sim.serializeCharacter(sim.playerId);
    expect(state).not.toBeNull();

    const storage = fakeStorage();
    expect(
      saveOffline(storage, {
        playerClass: 'druid',
        playerName: 'Bruin',
        skin: 0,
        seed: 42,
        savedAt: 1,
        state: state as CharacterState,
      }),
    ).toBe(true);

    const loaded = loadOffline(storage);
    expect(loaded).not.toBeNull();

    // The restore path the client will use: a player-less Sim plus addPlayer.
    const fresh = new Sim({ seed: 42, playerClass: 'druid', playerName: 'Bruin', noPlayer: true });
    const pid = fresh.addPlayer(loaded!.playerClass, loaded!.playerName, { state: loaded!.state });
    const restored = fresh.entities.get(pid);

    expect(restored).toBeDefined();
    expect(restored?.level).toBe(8);
    expect(restored?.name).toBe('Bruin');
  });

  it('survives a JSON round trip without losing the character level', () => {
    sim.setPlayerLevel(12);
    const state = sim.serializeCharacter(sim.playerId) as CharacterState;
    const reparsed = parseOfflineSave(
      JSON.stringify(
        buildOfflineSave({
          playerClass: 'druid',
          playerName: 'Bruin',
          skin: 0,
          seed: 42,
          savedAt: 1,
          state,
        }),
      ),
    );
    expect(reparsed?.state.level).toBe(12);
  });
});
