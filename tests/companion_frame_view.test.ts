import { describe, expect, it } from 'vitest';
import {
  type CompanionFrameSource,
  companionFrameRows,
  companionFrameSignature,
} from '../src/ui/companion_frame_view';

const at = (x: number, z: number) => ({ x, z });

function companion(over: Partial<CompanionFrameSource> = {}): CompanionFrameSource {
  return {
    entityId: 500,
    role: 'tank',
    level: 60,
    hp: 800,
    maxHp: 1000,
    dead: 0,
    x: 0,
    z: 0,
    ...over,
  };
}

const NAMES = { 500: 'Edda Reedhand', 501: 'Acolyte Tessa', 502: 'Edda Reedhand' };
const nameOf = (c: CompanionFrameSource) => NAMES[c.entityId as keyof typeof NAMES] ?? '?';

describe('companion party frame rows', () => {
  it('builds no rows without companions', () => {
    expect(companionFrameRows([], nameOf, at(0, 0))).toEqual([]);
    expect(companionFrameSignature([], nameOf, at(0, 0))).toBe('');
  });

  // The reported bug: four hired companions produced zero party frames, so a healer
  // could not click, hover, or heal their own party.
  it('builds one row per hired companion, keyed on the entity id', () => {
    const rows = companionFrameRows(
      [
        companion({ entityId: 500, role: 'tank' }),
        companion({ entityId: 501, role: 'healer' }),
        companion({ entityId: 502, role: 'dps' }),
      ],
      nameOf,
      at(0, 0),
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.pid)).toEqual([500, 501, 502]);
    expect(rows.map((r) => r.role)).toEqual(['tank', 'healer', 'dps']);
  });

  it('carries health through so the row can be read and healed', () => {
    const [row] = companionFrameRows([companion({ hp: 250, maxHp: 1000 })], nameOf, at(0, 0));
    expect(row.hp).toBe(250);
    expect(row.mhp).toBe(1000);
  });

  // A fallen ally you cannot see is a fallen ally you cannot resurrect.
  it('still builds a row for a dead companion', () => {
    const [row] = companionFrameRows([companion({ dead: 1, hp: 0 })], nameOf, at(0, 0));
    expect(row.dead).toBe(1);
    expect(row.oor).toBe(false);
  });

  it('flags a distant living companion out of range', () => {
    const [near] = companionFrameRows([companion({ x: 10, z: 0 })], nameOf, at(0, 0));
    const [far] = companionFrameRows([companion({ x: 400, z: 0 })], nameOf, at(0, 0));
    expect(near.oor).toBe(false);
    expect(far.oor).toBe(true);
  });

  // The delve companion's authored `scout` has no party-frame counterpart.
  it('maps the scout role onto the damage slot', () => {
    const [row] = companionFrameRows([companion({ role: 'scout' })], nameOf, at(0, 0));
    expect(row.role).toBe('dps');
  });

  it('spends no player resource, so the power bar stays empty', () => {
    const [row] = companionFrameRows([companion()], nameOf, at(0, 0));
    expect(row.res).toBe(0);
    expect(row.rtype).toBeNull();
  });

  describe('rebuild signature', () => {
    it('is stable for an unchanged party', () => {
      const party = [companion({ entityId: 500 }), companion({ entityId: 501 })];
      expect(companionFrameSignature(party, nameOf, at(0, 0))).toBe(
        companionFrameSignature(party, nameOf, at(0, 0)),
      );
    });

    it('changes when a companion takes damage', () => {
      const before = companionFrameSignature([companion({ hp: 900 })], nameOf, at(0, 0));
      const after = companionFrameSignature([companion({ hp: 400 })], nameOf, at(0, 0));
      expect(after).not.toBe(before);
    });

    it('changes when a companion dies', () => {
      const before = companionFrameSignature([companion()], nameOf, at(0, 0));
      const after = companionFrameSignature([companion({ dead: 1, hp: 0 })], nameOf, at(0, 0));
      expect(after).not.toBe(before);
    });

    it('changes when a companion is hired', () => {
      const before = companionFrameSignature([companion({ entityId: 500 })], nameOf, at(0, 0));
      const after = companionFrameSignature(
        [companion({ entityId: 500 }), companion({ entityId: 501 })],
        nameOf,
        at(0, 0),
      );
      expect(after).not.toBe(before);
    });

    it('changes when a companion walks out of range', () => {
      const near = companionFrameSignature([companion({ x: 10 })], nameOf, at(0, 0));
      const far = companionFrameSignature([companion({ x: 400 })], nameOf, at(0, 0));
      expect(far).not.toBe(near);
    });
  });
});
