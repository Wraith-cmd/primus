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

  // The suite above proves the ENVELOPE. It stayed green while offline saving was
  // broken in real play, because it never built a Sim the way `startOffline`
  // builds one, and never drove the full play -> save -> reload -> resume loop.
  // These cases do, against the real config the client passes.
  describe('the startOffline loop, end to end', () => {
    const CFG = {
      seed: 20061, // main.ts WORLD_SEED
      playerClass: 'warrior' as const,
      playerName: 'Roland',
      valeCupShowcase: true, // the client sets this; a fresh Sim must still serialize
    };

    it('serializes a Sim built exactly the way the client builds it', () => {
      const live = new Sim({ ...CFG });
      // A null here is the silent-no-op failure mode: `wireOfflinePersistence`
      // returns early and nothing is ever written.
      expect(live.serializeCharacter(live.playerId)).not.toBeNull();
    });

    it('round-trips through storage and resumes with playerId pointing at the restored character', () => {
      const storage = fakeStorage();

      // Session one: play, then autosave the way the blur/interval handler does.
      const live = new Sim({ ...CFG });
      live.setPlayerLevel(11);
      live.player.pos.x = 40;
      live.player.pos.z = 60;
      for (let i = 0; i < 20; i++) live.tick();
      const state = live.serializeCharacter(live.playerId);
      expect(state).not.toBeNull();
      expect(
        saveOffline(storage, {
          playerClass: CFG.playerClass,
          playerName: CFG.playerName,
          skin: 3,
          seed: CFG.seed,
          savedAt: 1,
          state: state as CharacterState,
        }),
      ).toBe(true);

      // Session two: the reload. `noPlayer` plus `addPlayer`, as startOffline does.
      const loaded = loadOffline(storage);
      expect(loaded).not.toBeNull();
      const resumed = new Sim({ ...CFG, noPlayer: true });
      const pid = resumed.addPlayer(loaded!.playerClass, loaded!.playerName, {
        state: loaded!.state,
      });

      // The load-bearing wiring assertion: `playerId` is only assigned inside
      // addPlayer, so if the constructor path were the only one that set it,
      // every downstream call (setPlayerSkin, the HUD, the next save) would be
      // pointed at nothing.
      expect(resumed.playerId).toBe(pid);
      expect(resumed.entities.get(resumed.playerId)).toBeDefined();
      expect(resumed.player.level).toBe(11);
      expect(Math.round(resumed.player.pos.x)).toBe(40);
      expect(Math.round(resumed.player.pos.z)).toBe(60);

      // And the resumed session can save again, so progress survives a SECOND
      // reload rather than only the first.
      resumed.setPlayerSkin(resumed.playerId, loaded!.skin);
      const again = resumed.serializeCharacter(resumed.playerId);
      expect(again).not.toBeNull();
      expect(again?.level).toBe(11);
      expect(again?.skin).toBe(3);
      expect(
        saveOffline(storage, {
          playerClass: CFG.playerClass,
          playerName: CFG.playerName,
          skin: loaded!.skin,
          seed: CFG.seed,
          savedAt: 2,
          state: again as CharacterState,
        }),
      ).toBe(true);
      expect(loadOffline(storage)?.state.level).toBe(11);
    });

    it('produces a save that actually survives JSON.stringify from the live Sim', () => {
      // saveOffline swallows a stringify throw and returns false, which is
      // exactly how a save can fail with nothing on screen to show for it.
      const live = new Sim({ ...CFG });
      for (let i = 0; i < 20; i++) live.tick();
      const state = live.serializeCharacter(live.playerId) as CharacterState;
      expect(() =>
        JSON.stringify(
          buildOfflineSave({
            playerClass: CFG.playerClass,
            playerName: CFG.playerName,
            skin: 0,
            seed: CFG.seed,
            savedAt: 1,
            state,
          }),
        ),
      ).not.toThrow();
    });
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
