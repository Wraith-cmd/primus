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
 *  the sim's business (`migrateCharacterTalentsV2`), not this module's.
 *
 *  NOT bumped by the `mode` discriminator below: `mode` is optional and absent
 *  means `'offline'`, so every save written before run mode existed still parses.
 *  A bump would have rejected them all and deleted the owner's leveled character
 *  on the next load, which is the exact failure the discriminator exists to
 *  prevent. */
export const OFFLINE_SAVE_VERSION = 1;
export const OFFLINE_SAVE_KEY = 'primus.offline.character';

/** Which game mode a save belongs to.
 *
 *  There is one Storage and there are two modes that both persist a character.
 *  `'offline'` is the owner's real, leveled character; `'run'` is a run-mode
 *  preset that is rebuilt from the content tables every time and is therefore
 *  disposable. They must never be able to reach each other's bytes, so the mode
 *  is BOTH part of the storage key (`offlineSaveKey`) and a field inside the
 *  envelope that `parseOfflineSave` re-checks. Either mechanism alone would be
 *  enough; both together mean a mistake has to be made twice. */
export type OfflineSaveMode = 'offline' | 'run';

/** The default, and the mode an envelope with no `mode` field is read as. */
export const DEFAULT_OFFLINE_SAVE_MODE: OfflineSaveMode = 'offline';

/** The storage key for a mode. `'offline'` keeps the original bare key so the
 *  owner's existing character is found exactly where it was written; every other
 *  mode is suffixed, so no new mode can ever be added ON TOP of it. */
export function offlineSaveKey(mode: OfflineSaveMode = DEFAULT_OFFLINE_SAVE_MODE): string {
  return mode === DEFAULT_OFFLINE_SAVE_MODE ? OFFLINE_SAVE_KEY : `${OFFLINE_SAVE_KEY}.${mode}`;
}

export interface OfflineSave {
  version: number;
  /** Absent in every save written before run mode existed, which is read as
   *  `'offline'`. */
  mode?: OfflineSaveMode;
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
  /** Defaults to `'offline'`, so an existing caller keeps writing exactly the
   *  envelope it wrote before. */
  mode?: OfflineSaveMode;
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
    mode: input.mode ?? DEFAULT_OFFLINE_SAVE_MODE,
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
    mode: save.mode === 'run' ? 'run' : DEFAULT_OFFLINE_SAVE_MODE,
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
  const mode = input.mode ?? DEFAULT_OFFLINE_SAVE_MODE;
  try {
    storage.setItem(offlineSaveKey(mode), JSON.stringify(buildOfflineSave(input)));
    return true;
  } catch {
    return false;
  }
}

/** Read the save for one mode.
 *
 *  An envelope whose stored `mode` is not the one being asked for is refused
 *  rather than returned. That can only happen if a key was written by the wrong
 *  caller, and in that case "start a fresh character" is the safe answer and
 *  handing a run-mode preset back as somebody's leveled character is not. */
export function loadOffline(
  storage: Storage,
  mode: OfflineSaveMode = DEFAULT_OFFLINE_SAVE_MODE,
): OfflineSave | null {
  try {
    const save = parseOfflineSave(storage.getItem(offlineSaveKey(mode)));
    if (!save) return null;
    return (save.mode ?? DEFAULT_OFFLINE_SAVE_MODE) === mode ? save : null;
  } catch {
    return null;
  }
}

export function clearOffline(
  storage: Storage,
  mode: OfflineSaveMode = DEFAULT_OFFLINE_SAVE_MODE,
): void {
  try {
    storage.removeItem(offlineSaveKey(mode));
  } catch {
    // A storage that refuses removal is the same non-event as one that refuses
    // writes: the next load either finds a stale save or nothing at all, and both
    // are survivable.
  }
}
