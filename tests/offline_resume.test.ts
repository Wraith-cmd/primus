// Regression suite for the offline save slot POLICY.
//
// The envelope round trip (tests/offline_save.test.ts) was green the whole time
// the feature was broken in real play, because it only ever proved that a save
// injected under the exact stored identity could be read back. What actually
// happened to players was the opposite: the entry screen opened blank on warrior,
// resuming required retyping an exact case-sensitive name from memory, and any
// slip rolled a fresh level 1 character that overwrote the saved one at the next
// autosave. These cases pin both halves of that fix.

import { describe, expect, it } from 'vitest';
import {
  canCommitOfflineSave,
  normalizeOfflineName,
  offlineSaveMatches,
  offlineSaveNotice,
  offlineSaveSummary,
  resolveOfflineEntry,
} from '../src/game/offline_resume';
import {
  buildOfflineSave,
  type OfflineSave,
  type OfflineSaveInput,
} from '../src/game/offline_save';
import type { CharacterState } from '../src/sim/sim';

const saveOf = (over: Partial<OfflineSaveInput> = {}): OfflineSave =>
  buildOfflineSave({
    playerClass: 'warrior',
    playerName: 'Roland',
    skin: 0,
    seed: 20061,
    savedAt: 1_700_000_000_000,
    state: { level: 11 } as unknown as CharacterState,
    ...over,
  });

describe('offline name normalization', () => {
  it('folds the differences a player cannot see', () => {
    expect(normalizeOfflineName('Roland')).toBe('roland');
    expect(normalizeOfflineName('  Roland  ')).toBe('roland');
    expect(normalizeOfflineName('ROLAND')).toBe('roland');
  });

  it('keeps the differences a player CAN see', () => {
    expect(normalizeOfflineName('Roland')).not.toBe(normalizeOfflineName('Rolando'));
    expect(normalizeOfflineName("O'Ryan")).not.toBe(normalizeOfflineName('ORyan'));
  });
});

describe('offline save identity', () => {
  it('matches the same character however it was capitalized', () => {
    expect(offlineSaveMatches(saveOf(), 'warrior', 'Roland')).toBe(true);
    expect(offlineSaveMatches(saveOf(), 'warrior', 'roland')).toBe(true);
    expect(offlineSaveMatches(saveOf(), 'warrior', ' Roland ')).toBe(true);
  });

  it('does not match a different name or a different class', () => {
    expect(offlineSaveMatches(saveOf(), 'warrior', 'Rolando')).toBe(false);
    expect(offlineSaveMatches(saveOf(), 'mage', 'Roland')).toBe(false);
  });

  it('treats an empty slot as no match', () => {
    expect(offlineSaveMatches(null, 'warrior', 'Roland')).toBe(false);
  });
});

describe('resolveOfflineEntry', () => {
  it('starts fresh when the slot is empty', () => {
    expect(resolveOfflineEntry(null, 'warrior', 'Roland')).toEqual({ action: 'fresh' });
  });

  it('resumes on a case slip instead of starting over on top of the save', () => {
    // THE BUG: `restored.playerName === name` was an exact compare, so typing
    // "roland" rolled a new level 1 warrior and the saved level 11 one was gone
    // at the next autosave.
    const plan = resolveOfflineEntry(saveOf(), 'warrior', 'roland');
    expect(plan.action).toBe('resume');
    expect(plan.action === 'resume' && plan.save.state.level).toBe(11);
  });

  it('flags a genuinely different character as a replace, never an implicit overwrite', () => {
    const plan = resolveOfflineEntry(saveOf(), 'mage', 'Nyla');
    expect(plan.action).toBe('replace');
    expect(plan.action === 'replace' && plan.saved).toEqual({
      playerClass: 'warrior',
      playerName: 'Roland',
      level: 11,
      savedAt: 1_700_000_000_000,
    });
  });

  it('summarizes a save with a missing level as level 1 rather than NaN', () => {
    const summary = offlineSaveSummary(saveOf({ state: {} as unknown as CharacterState }));
    expect(summary.level).toBe(1);
  });
});

describe('canCommitOfflineSave', () => {
  it('lets a session write into an empty slot', () => {
    expect(canCommitOfflineSave(null, 'warrior', 'Roland', false)).toBe(true);
  });

  it('lets a session overwrite its own character', () => {
    expect(canCommitOfflineSave(saveOf(), 'warrior', 'Roland', false)).toBe(true);
    expect(canCommitOfflineSave(saveOf(), 'warrior', 'roland', false)).toBe(true);
  });

  it("refuses to evict someone else's character without consent", () => {
    // The destructive half of the reported bug: a mismatched session used to
    // autosave straight over the stored character.
    expect(canCommitOfflineSave(saveOf(), 'mage', 'Nyla', false)).toBe(false);
  });

  it('allows the eviction once the player has confirmed it', () => {
    expect(canCommitOfflineSave(saveOf(), 'mage', 'Nyla', true)).toBe(true);
  });
});

describe('offlineSaveNotice', () => {
  it('confirms the first save of a session so the player knows it works', () => {
    expect(offlineSaveNotice({ ok: true, explicit: false, announced: false })).toBe('saved');
  });

  it('goes quiet on the periodic autosaves after that', () => {
    expect(offlineSaveNotice({ ok: true, explicit: false, announced: true })).toBeNull();
  });

  it('always confirms a save the player asked for', () => {
    expect(offlineSaveNotice({ ok: true, explicit: true, announced: true })).toBe('saved');
  });

  it('never hides a failure, which is the whole point', () => {
    expect(offlineSaveNotice({ ok: false, explicit: false, announced: true })).toBe('failed');
    expect(offlineSaveNotice({ ok: false, blocked: true, explicit: false, announced: true })).toBe(
      'blocked',
    );
  });
});
