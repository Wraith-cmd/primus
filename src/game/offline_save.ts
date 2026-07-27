// Offline character persistence.
//
// Upstream's offline mode was explicitly disposable ("Nothing is saved"): every
// Play Offline built a fresh Sim and threw the character away on unload. This
// fork makes offline the primary mode, so the character has to survive a reload,
// an alt-tab, and a browser restart.
//
// The sim already carries both halves of the round trip: `serializeCharacter`
// produces a `CharacterState` and `addPlayer(cls, name, { state })` restores one,
// migrations included. This module is only the storage envelope around them.
//
// Host-agnostic on purpose: the Storage is injected rather than reached for, so a
// Vitest drives it in plain Node with a fake. It never imports the DOM.

import type { CharacterState } from '../sim/sim';
import type { PlayerClass } from '../sim/types';

/** Bumped only when the ENVELOPE shape changes. Character content migrations are
 *  the sim's business (`migrateCharacterTalentsV2`), not this module's. */
export const OFFLINE_SAVE_VERSION = 1;
export const OFFLINE_SAVE_KEY = 'primus.offline.character';

export interface OfflineSave {
  version: number;
  /** Wall-clock ms at write time. Display only: never fed back into the sim,
   *  which takes its clock from the tick counter. */
  savedAt: number;
  playerClass: PlayerClass;
  playerName: string;
  skin: number;
  seed: number;
  state: CharacterState;
}

export interface OfflineSaveInput {
  playerClass: PlayerClass;
  playerName: string;
  skin: number;
  seed: number;
  state: CharacterState;
  /** Injected so the caller owns the clock; keeps this module deterministic. */
  savedAt: number;
}

/** Build the envelope. Split from `saveOffline` so a caller can serialize without
 *  a Storage in hand (and so the shape is unit-testable on its own). */
export function buildOfflineSave(input: OfflineSaveInput): OfflineSave {
  return {
    version: OFFLINE_SAVE_VERSION,
    savedAt: input.savedAt,
    playerClass: input.playerClass,
    playerName: input.playerName,
    skin: input.skin,
    seed: input.seed,
    state: input.state,
  };
}

/** Parse a stored envelope. Returns null for every failure mode rather than
 *  throwing: a corrupt or stale save must degrade to "start a fresh character",
 *  never to a crash on the loading screen. */
export function parseOfflineSave(raw: string | null): OfflineSave | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const save = parsed as Partial<OfflineSave>;
  if (save.version !== OFFLINE_SAVE_VERSION) return null;
  if (typeof save.playerClass !== 'string' || typeof save.playerName !== 'string') return null;
  if (!save.state || typeof save.state !== 'object') return null;
  return {
    version: save.version,
    savedAt: typeof save.savedAt === 'number' ? save.savedAt : 0,
    playerClass: save.playerClass as PlayerClass,
    playerName: save.playerName,
    skin: typeof save.skin === 'number' ? save.skin : 0,
    seed: typeof save.seed === 'number' ? save.seed : 0,
    state: save.state as CharacterState,
  };
}

/** Write the save. Returns false when the write is refused (private browsing,
 *  quota) so a caller can warn once instead of assuming it stuck. */
export function saveOffline(storage: Storage, input: OfflineSaveInput): boolean {
  try {
    storage.setItem(OFFLINE_SAVE_KEY, JSON.stringify(buildOfflineSave(input)));
    return true;
  } catch {
    return false;
  }
}

export function loadOffline(storage: Storage): OfflineSave | null {
  try {
    return parseOfflineSave(storage.getItem(OFFLINE_SAVE_KEY));
  } catch {
    return null;
  }
}

export function clearOffline(storage: Storage): void {
  try {
    storage.removeItem(OFFLINE_SAVE_KEY);
  } catch {
    // A storage that refuses removal is the same non-event as one that refuses
    // writes: the next load either finds a stale save or nothing at all, and both
    // are survivable.
  }
}
