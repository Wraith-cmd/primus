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
    const payload = JSON.stringify(buildOfflineSave(input));
    // The mode slot first: for `'offline'` this is the legacy bare key, which now
    // means "most recently played" and is what every pre-roster reader still
    // resolves. Writing it FIRST means a quota failure on the second write leaves
    // the character saved exactly where the old code would have put it, which is
    // the failure mode that loses nothing.
    storage.setItem(offlineSaveKey(mode), payload);
    // Then the per-character key, so several offline characters coexist. Run mode
    // is deliberately excluded: it is one disposable preset slot by design and
    // must never appear in the owner's roster.
    if (mode === DEFAULT_OFFLINE_SAVE_MODE) {
      storage.setItem(offlineCharacterKey(input.playerClass, input.playerName), payload);
    }
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

// ---------------------------------------------------------------------------
// The character ROSTER (several offline characters, not one slot)
// ---------------------------------------------------------------------------
//
// The original design had exactly ONE offline slot, so keeping a tank and a
// caster meant destroying one to play the other. `offline_resume.ts` made that
// non-destructive (a different character needs explicit consent before it can
// evict the stored one), but non-destructive is not the same as possible.
//
// The layout is ADDITIVE on purpose, because the slot being migrated holds a real
// leveled character:
//   - `primus.offline.character`                       the legacy slot, still
//     written on every save, so it now means "most recently played" and every
//     existing reader (`loadOffline`) keeps working byte-for-byte as before.
//   - `primus.offline.character.char.<class>.<name>`   one key per character.
//   - `primus.offline.character.run`                   run mode, untouched.
//
// Nothing DELETES the legacy key as part of adopting it. A legacy save with no
// per-character twin is surfaced in the roster by reading it, so the worst case
// of a half-finished migration is a duplicate listing, never a lost character.

/** The per-character key prefix, nested under the legacy key so one namespace
 *  owns every offline artifact and a future mode cannot collide with it. */
const CHARACTER_KEY_PREFIX = `${OFFLINE_SAVE_KEY}.char.`;

/** Fold a name to its identity form. MUST match `normalizeOfflineName` in
 *  `offline_resume.ts`: if the two disagree, a player resumes a character the
 *  roster lists under a different key, which reads as duplicate characters. */
function identityName(name: string): string {
  return name.trim().toLowerCase();
}

/** The storage key for one character. Class is part of the key because the
 *  resume policy treats class plus name as the identity: two druids named
 *  differently are different characters, and so are a druid and a mage who share
 *  a name. */
export function offlineCharacterKey(playerClass: string, playerName: string): string {
  return `${CHARACTER_KEY_PREFIX}${playerClass}.${identityName(playerName)}`;
}

/** One row of the character-select roster. */
export interface OfflineCharacterEntry {
  playerClass: PlayerClass;
  playerName: string;
  level: number;
  savedAt: number;
  skin: number;
}

function entryOf(save: OfflineSave): OfflineCharacterEntry {
  const level = (save.state as { level?: unknown } | null)?.level;
  return {
    playerClass: save.playerClass,
    playerName: save.playerName,
    level: typeof level === 'number' && Number.isFinite(level) ? level : 1,
    savedAt: save.savedAt,
    skin: save.skin,
  };
}

/** Every saved offline character, most recently played first.
 *
 *  Reads the per-character keys, then ADOPTS the legacy slot if it holds a
 *  character with no key of its own (the owner's pre-roster save). A corrupt or
 *  foreign-mode entry is skipped rather than thrown on: a character select that
 *  crashes is worse than one that is missing a row. */
export function listOfflineCharacters(storage: Storage): OfflineCharacterEntry[] {
  const byIdentity = new Map<string, OfflineSave>();
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || !key.startsWith(CHARACTER_KEY_PREFIX)) continue;
      const save = parseOfflineSave(storage.getItem(key));
      // Only offline-mode envelopes: a run-mode preset must never show up as one
      // of the owner's characters.
      if (!save || (save.mode ?? DEFAULT_OFFLINE_SAVE_MODE) !== DEFAULT_OFFLINE_SAVE_MODE) continue;
      byIdentity.set(offlineCharacterKey(save.playerClass, save.playerName), save);
    }
    const legacy = parseOfflineSave(storage.getItem(OFFLINE_SAVE_KEY));
    if (legacy && (legacy.mode ?? DEFAULT_OFFLINE_SAVE_MODE) === DEFAULT_OFFLINE_SAVE_MODE) {
      const key = offlineCharacterKey(legacy.playerClass, legacy.playerName);
      // The per-character key wins: it is written on every save, so when both
      // exist the dedicated one is at least as fresh.
      if (!byIdentity.has(key)) byIdentity.set(key, legacy);
    }
  } catch {
    return [];
  }
  return [...byIdentity.values()].map(entryOf).sort((a, b) => b.savedAt - a.savedAt);
}

/** Load one character by identity, falling back to the legacy slot when it holds
 *  exactly that character and has not been re-saved since the roster landed. */
export function loadOfflineCharacter(
  storage: Storage,
  playerClass: PlayerClass,
  playerName: string,
): OfflineSave | null {
  try {
    const direct = parseOfflineSave(storage.getItem(offlineCharacterKey(playerClass, playerName)));
    if (direct && (direct.mode ?? DEFAULT_OFFLINE_SAVE_MODE) === DEFAULT_OFFLINE_SAVE_MODE) {
      return direct;
    }
    const legacy = parseOfflineSave(storage.getItem(OFFLINE_SAVE_KEY));
    if (
      legacy &&
      (legacy.mode ?? DEFAULT_OFFLINE_SAVE_MODE) === DEFAULT_OFFLINE_SAVE_MODE &&
      legacy.playerClass === playerClass &&
      identityName(legacy.playerName) === identityName(playerName)
    ) {
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

/** Remove one character from the roster.
 *
 *  Also clears the legacy slot when it holds the SAME character, otherwise a
 *  deleted character would reappear on the next listing (the adoption path above
 *  would find it again). Never touches another character's key. */
export function deleteOfflineCharacter(
  storage: Storage,
  playerClass: PlayerClass,
  playerName: string,
): void {
  try {
    storage.removeItem(offlineCharacterKey(playerClass, playerName));
    const legacy = parseOfflineSave(storage.getItem(OFFLINE_SAVE_KEY));
    if (
      legacy &&
      legacy.playerClass === playerClass &&
      identityName(legacy.playerName) === identityName(playerName)
    ) {
      storage.removeItem(OFFLINE_SAVE_KEY);
    }
  } catch {
    // Same non-event as a refused write: the next listing shows a stale row.
  }
}
