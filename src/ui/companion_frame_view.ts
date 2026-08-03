// Pure core for companion party frames.
//
// A hired companion is a MOB with an `ownerId`, never a member of the social party
// system, so `IWorld.partyInfo` never contains one and the party frames built no row
// for any of them. That is the reported bug: four companions hired, zero party frames
// in the DOM, so a healer could not click, hover, or heal their own party.
//
// NOT resurrection, despite the obvious analogy: `updateCompanionParties` reaps a
// dead companion in the same tick it dies and `dropEntityFromRoster` deletes the
// entity outright, so no corpse ever survives to be selected. The `dead` field
// below is therefore defensive only, and in practice always 0.
//
// This core maps a companion onto the SAME PartyFrameMember shape the existing party
// frames already paint, so a companion becomes a real party row with no new painter,
// markup, or CSS: clickable (the row targets the companion's entity id), hoverable
// (Clique-style mouseover casting redirects a friendly ability to the hovered row),
// and health-bearing.
//
// It takes a LIST rather than a single companion, and a role union wide enough for
// both sources, because there are two: the four-strong `/hire` dungeon party
// (`IWorld.companionParty`) and the single delve companion (`IWorld.companionState`,
// whose authored `scout` role has no party-frame counterpart). One core serves both.
//
// DOM-free, i18n-free, deterministic: the display NAME is resolved and localized at
// the call site and passed in as a function, exactly like every other pure view core
// here.

import type { PlayerClass } from '../sim/types';
import { PARTY_FRAME_RANGE_YD, type PartyFrameMember } from './party_frames';

/** A companion's role as the two sources author it. `scout` is delve-only. */
export type CompanionFrameRole = 'tank' | 'healer' | 'dps' | 'scout';

/** The unit-frame projection of one companion, shared by both companion sources. */
export interface CompanionFrameSource {
  entityId: number;
  role: CompanionFrameRole;
  level: number;
  hp: number;
  maxHp: number;
  /** 1 when this companion is a corpse, matching PartyMemberInfo.dead's 0/1 encoding. */
  dead: number;
  x: number;
  z: number;
}

/**
 * Crest and class-color identity, derived from the authored ROLE. A companion has no
 * PlayerClass, but the party row paints a class crest and a class color, so the role
 * picks the closest archetype. Presentation only: it never reaches the sim and changes
 * no behavior.
 */
const ROLE_CLASS: Record<CompanionFrameRole, PlayerClass> = {
  healer: 'priest',
  tank: 'warrior',
  scout: 'rogue',
  dps: 'rogue',
};

/** The party-frame role the row sorts by; the delve `scout` folds into damage. */
const ROLE_SORT: Record<CompanionFrameRole, 'tank' | 'healer' | 'dps'> = {
  healer: 'healer',
  tank: 'tank',
  scout: 'dps',
  dps: 'dps',
};

/** Whether a living companion is beyond healing range of the viewer. Dead companions
 *  are never flagged: a corpse in range of nothing is still the thing you walk to. */
function outOfRange(
  companion: CompanionFrameSource,
  viewerPos: { x: number; z: number },
  rangeYd: number,
): boolean {
  if (companion.dead) return false;
  return Math.hypot(companion.x - viewerPos.x, companion.z - viewerPos.z) > rangeYd;
}

/**
 * Build one party-frame row per companion, in hire order.
 *
 * Each row keys on the companion's ENTITY id, which is what the row's click and hover
 * handlers pass back as a target id, so targeting and mouseover-casting resolve to the
 * real entity. `nameOf` returns the already-localized display name (the `/hire` party
 * reuses two mob templates, so three of its four rows would otherwise share a name).
 */
export function companionFrameRows(
  companions: readonly CompanionFrameSource[],
  nameOf: (companion: CompanionFrameSource) => string,
  viewerPos: { x: number; z: number },
  rangeYd = PARTY_FRAME_RANGE_YD,
): PartyFrameMember[] {
  return companions.map((c) => ({
    pid: c.entityId,
    name: nameOf(c),
    cls: ROLE_CLASS[c.role] ?? 'priest',
    role: ROLE_SORT[c.role] ?? 'dps',
    level: c.level,
    hp: c.hp,
    mhp: Math.max(1, c.maxHp),
    // A companion spends no player resource, so the row's power bar stays empty
    // rather than claiming a pool it does not have.
    res: 0,
    mres: 1,
    rtype: null,
    x: c.x,
    z: c.z,
    dead: c.dead ? 1 : 0,
    inCombat: 0,
    group: 1,
    absorb: 0,
    oor: outOfRange(c, viewerPos, rangeYd),
  }));
}

/**
 * The rebuild signature for the companion rows, appended to the party signature so an
 * unchanged set keeps the frames short-circuited. It encodes exactly the fields
 * `companionFrameRows` renders from, including the out-of-range flag computed the same
 * way, so an equal signature means an identical render. Built in a single pass with no
 * intermediate array, matching `partyFrameSignature`.
 */
export function companionFrameSignature(
  companions: readonly CompanionFrameSource[],
  nameOf: (companion: CompanionFrameSource) => string,
  viewerPos: { x: number; z: number },
  rangeYd = PARTY_FRAME_RANGE_YD,
): string {
  let sig = '';
  for (const c of companions) {
    const oor = outOfRange(c, viewerPos, rangeYd);
    sig += `K${c.entityId}:${nameOf(c)}:${c.role}:${c.level}:${c.hp}/${c.maxHp}:${c.dead ? 1 : 0}:${oor ? 1 : 0}|`;
  }
  return sig;
}
