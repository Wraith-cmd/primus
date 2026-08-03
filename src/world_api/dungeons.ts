import type { DungeonDifficulty } from '../sim/types';
import type { WorldInteractionOutcome } from './interaction';

// One raid's lockout as projected to the HUD: the dungeon id plus the time left
// until it unlocks. The seam only ever surfaces still-locked raids.
export interface RaidLockout {
  id: string;
  msRemaining: number;
}

/** One hired companion as the HUD needs it. A companion is a MOB with an `ownerId`,
 * never a member of the social party system, so `partyInfo` never carries one: this
 * projection is the ONLY seam a companion unit frame can read, which is why it carries
 * the full unit-frame field set (identity, level, liveness, position for the
 * out-of-range cue) and not just the roster record. */
export interface CompanionPartyMemberInfo {
  entityId: number;
  role: 'tank' | 'healer' | 'dps';
  level: number;
  hp: number;
  maxHp: number;
  /** 1 when this companion is a corpse, matching PartyMemberInfo.dead's encoding. */
  dead: number;
  x: number;
  z: number;
}

/** The solo player's hired dungeon companions (`/hire`), up to four. */
export interface CompanionPartyInfo {
  dungeonId: string;
  /** True once the owner has actually zoned into the instance. */
  entered: boolean;
  members: CompanionPartyMemberInfo[];
}

export interface IWorldDungeons {
  // The hired companion party, or null when none is standing with the player. Drives
  // the companion party frames; without it a hired companion cannot be clicked or
  // healed. NOT resurrected: a dead companion is reaped from the roster on the tick
  // it dies, so there is never a corpse to select.
  companionParty: CompanionPartyInfo | null;
  enterDungeon(dungeonId: string): WorldInteractionOutcome;
  leaveDungeon(): WorldInteractionOutcome;
  // Still-locked raids for the local player (unlock countdown in ms), driving the
  // minimap raid-lockout badge + panel. Empty when nothing is locked.
  raidLockouts(): RaidLockout[];
  dungeonDifficulty(): DungeonDifficulty;
  setDungeonDifficulty(difficulty: DungeonDifficulty): void;
  // Buy one Heroic Quartermaster offer (src/sim/content/heroic_vendor.ts),
  // paying its Heroic Marks price from the buyer's bags. Server-validated.
  buyHeroicVendorItem(itemId: string): void;
}
