// Offline resume decisions: who owns the single save slot, and what the entry
// screen is allowed to do with it.
//
// The storage envelope lives in `offline_save.ts`; this module is the policy on
// top of it. It exists because the first cut of offline persistence made the
// entry screen the only thing standing between a player and permanent data loss:
// the slot is keyed by class plus name, the screen always opened with an empty
// name field and the class reset to warrior, and any mismatch silently rolled a
// fresh level 1 character that then overwrote the saved one at the very next
// autosave. From the player's side that reads as "nothing ever saved".
//
// So the rules here are:
//   1. Identity comparison is forgiving about the things a player cannot see
//      (case, surrounding whitespace) and strict about the rest.
//   2. Starting a DIFFERENT character while a save exists is a `replace` plan,
//      never an implicit overwrite. The caller has to ask first.
//   3. A save that cannot be written is reportable, so the caller can say so
//      instead of leaving the player guessing.
//
// Pure and DOM-free on purpose, so a Vitest drives every branch in plain Node.

import type { PlayerClass } from '../sim/types';
import type { OfflineSave } from './offline_save';

/** What a stored save looks like to the entry screen. */
export interface OfflineSaveSummary {
  playerClass: PlayerClass;
  playerName: string;
  level: number;
  savedAt: number;
}

export type OfflineEntryPlan =
  /** Nothing stored, or the stored character is the one being asked for. */
  | { action: 'fresh' }
  | { action: 'resume'; save: OfflineSave }
  /** A different character owns the slot; entering here would destroy it. */
  | { action: 'replace'; saved: OfflineSaveSummary };

/** The comparison key for a character name. Offline names are already restricted
 *  to `[A-Za-z' -]` by the caller's sanitizer, so folding case and trimming is
 *  the whole normalization: "roland" and "Roland " are the same character, and a
 *  player who retypes their name with a different shift key resumes instead of
 *  silently starting over. */
export function normalizeOfflineName(name: string): string {
  // Plain `toLowerCase`, not the locale-aware variant: offline names are ASCII
  // by construction, and a locale-sensitive fold would make the same save
  // resume or not depending on the browser's locale (the Turkish dotless i).
  return name.trim().toLowerCase();
}

/** Does this stored save belong to the given class plus name? */
export function offlineSaveMatches(
  save: Pick<OfflineSave, 'playerClass' | 'playerName'> | null,
  playerClass: PlayerClass,
  playerName: string,
): boolean {
  if (!save) return false;
  return (
    save.playerClass === playerClass &&
    normalizeOfflineName(save.playerName) === normalizeOfflineName(playerName)
  );
}

export function offlineSaveSummary(save: OfflineSave): OfflineSaveSummary {
  const level = save.state?.level;
  return {
    playerClass: save.playerClass,
    playerName: save.playerName,
    level: typeof level === 'number' && Number.isFinite(level) ? level : 1,
    savedAt: save.savedAt,
  };
}

/** Decide what pressing "Enter World" with this class plus name should do. */
export function resolveOfflineEntry(
  save: OfflineSave | null,
  playerClass: PlayerClass,
  playerName: string,
): OfflineEntryPlan {
  if (!save) return { action: 'fresh' };
  if (offlineSaveMatches(save, playerClass, playerName)) return { action: 'resume', save };
  return { action: 'replace', saved: offlineSaveSummary(save) };
}

/** May this session commit a save over what is currently in the slot?
 *
 *  The slot is single-occupancy, so a session that did NOT load the stored
 *  character must not quietly evict it. `consented` is the player's explicit
 *  "yes, replace it" from the entry screen; without it the write is refused and
 *  the caller warns, which is strictly better than destroying a character. */
export function canCommitOfflineSave(
  stored: Pick<OfflineSave, 'playerClass' | 'playerName'> | null,
  playerClass: PlayerClass,
  playerName: string,
  consented: boolean,
): boolean {
  if (!stored) return true;
  if (offlineSaveMatches(stored, playerClass, playerName)) return true;
  return consented;
}

export type OfflineSaveNotice = 'saved' | 'blocked' | 'failed' | null;

export interface OfflineSaveOutcome {
  /** The storage write succeeded. */
  ok: boolean;
  /** The write never ran because another character owns the slot. */
  blocked?: boolean;
  /** The player asked for this save (Escape-Escape), rather than an autosave. */
  explicit: boolean;
  /** A success line has already been shown once this session. */
  announced: boolean;
}

/** What (if anything) to tell the player after a save attempt.
 *
 *  Failures always speak up: an invisible failed save is the whole bug. Success
 *  speaks up on the first autosave of the session (so the player learns their
 *  character is safe) and on every deliberate save, but not on the 30 second
 *  heartbeat after that, which would be noise. */
export function offlineSaveNotice(outcome: OfflineSaveOutcome): OfflineSaveNotice {
  if (outcome.blocked) return 'blocked';
  if (!outcome.ok) return 'failed';
  if (outcome.explicit || !outcome.announced) return 'saved';
  return null;
}
