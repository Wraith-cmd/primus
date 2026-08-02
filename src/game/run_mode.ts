// Run mode: the second door into the same game.
//
// One call stands up a whole playable session: a preset character at the level
// cap wearing a coherent kit, standing at a dungeon entrance, with a tank, a
// healer and two dps already hired behind it. The owner's use case is a twenty
// minute run on a break; the immediate use case is a PLAYTEST HARNESS, because
// dungeons, the companion party and the top-end ability kits are otherwise only
// reachable by leveling a character from 1 first.
//
// This module builds the WORLD. It deliberately does not know about the renderer,
// the HUD, or the loading screen: it returns the `Sim` plus the handful of facts
// the caller needs, and `main.ts` hands that to the same `startGame` the offline
// flow uses. That is what keeps the mode out of `main.ts` beyond one wiring
// function.
//
// It is not a cheat path. Every step goes through an ordinary game surface:
// `addPlayer`, `setPlayerLevel`, `applyTalents`, `equipItem`, `recruitCompanion`.
// `ALLOW_DEV_COMMANDS` is irrelevant to all of it and no `/dev` command is
// involved; `src/sim/dev_kit.ts` is reused as the pure gear-selection LEAF it is,
// not as the command that happens to call it.
//
// THE SAVE SLOT. The offline save is a single localStorage slot and it holds the
// owner's real, leveled character. Run mode writes to a NAMESPACED slot
// (`OfflineSaveMode` 'run', see offline_save.ts) and reads only that one, so a
// break-mode session cannot reach the leveled character even if the class and
// the name happen to match.

import { type CompanionRole, DEFAULT_COMPANION_ROLES } from '../sim/companions/role_kit';
import { DUNGEONS } from '../sim/data';
import { applyDevKit } from '../sim/dev_kit';
import {
  buildRunPreset,
  RUN_PRESET_LEVEL,
  runModeDungeonIds,
  runModeSpawnPos,
  runPresetSpec,
} from '../sim/run_preset';
import { Sim } from '../sim/sim';
import type { PlayerClass } from '../sim/types';
import { loadOffline, type OfflineSaveMode, saveOffline } from './offline_save';

/** The save-slot namespace run mode owns. Never the bare offline slot. */
export const RUN_SAVE_MODE: OfflineSaveMode = 'run';

/** The preset character's name. Fixed, because the character is fixed: there is
 *  nothing to name in a mode whose whole point is that the build is decided for
 *  you. Passes the same character-name rule the offline flow enforces. */
export const RUN_CHARACTER_NAME = 'Runner';

/** The dungeon a run opens on when the caller names none. The first, shallowest
 *  one: the shortest path from "click" to "fighting something". */
export const RUN_DEFAULT_DUNGEON_ID = 'hollow_crypt';

/** How often the run character is written back, in ms. Matches the offline
 *  autosave cadence; the backstop for a crash that fires no event. */
const RUN_AUTOSAVE_MS = 30_000;

export interface RunModeOptions {
  playerClass: PlayerClass;
  /** Which dungeon door to spawn at. Defaults to `RUN_DEFAULT_DUNGEON_ID`; an
   *  unknown or door-less id falls back to it rather than stranding the player
   *  in the open world with no party. */
  dungeonId?: string;
  /** Overrides the class's preset spec. The picker does not offer this yet. */
  spec?: string;
  /** The world seed. Same fixed seed the offline flow uses, passed in so this
   *  module owns no global. */
  seed: number;
  /** Cosmetic skin index. */
  skin?: number;
  /** Where the run character persists. Null (private browsing, or a Node test)
   *  simply means the run is not saved; it never blocks the session. */
  storage?: Storage | null;
  /** Resume a previously saved RUN character of the same class instead of
   *  rebuilding the preset. Default true, so a reload mid-run does not throw the
   *  session away. Pass false to force the pristine preset, which is what a
   *  balance playtest wants. */
  resume?: boolean;
  /** Injected clock, so the module stays deterministic under test. */
  now?: () => number;
}

export interface RunModeSession {
  sim: Sim;
  playerClass: PlayerClass;
  spec: string;
  level: number;
  dungeonId: string;
  /** English source name; the caller localizes it (`dungeonDisplayName`). */
  dungeonName: string;
  /** Where the character is standing. */
  spawn: { x: number; z: number };
  /** The roles actually hired, in recruit order. Four on any healthy run. */
  companionRoles: CompanionRole[];
  /** Keybind scope for `startGame`. Namespaced away from `offline:` so a run
   *  never rebinds the owner's leveled character's keys. */
  keybindScope: string;
  /** True when a stored run character was restored instead of rebuilt. */
  resumed: boolean;
}

/** Resolve the requested dungeon to one that actually has an overworld door.
 *  The door is also the companion recruit gate, so a bad id must not silently
 *  produce a party-less run. */
function resolveDungeonId(requested: string | undefined): string {
  const offered = runModeDungeonIds();
  if (requested && offered.includes(requested)) return requested;
  if (offered.includes(RUN_DEFAULT_DUNGEON_ID)) return RUN_DEFAULT_DUNGEON_ID;
  return offered[0] ?? RUN_DEFAULT_DUNGEON_ID;
}

/** Put the character on the dungeon's doorstep.
 *
 *  `dungeonEntranceIdAt` (companions/party.ts) is what decides whether the party
 *  can be hired, and it measures from `DungeonDef.doorPos`, so the spawn is
 *  expressed as an offset from that same position rather than a second copy of
 *  the coordinates. */
function placeAtDungeonDoor(sim: Sim, dungeonId: string): { x: number; z: number } {
  const target = runModeSpawnPos(dungeonId);
  const player = sim.player;
  if (!target) return { x: player.pos.x, z: player.pos.z };
  player.pos = sim.groundPos(target.x, target.z);
  player.prevPos = { ...player.pos };
  sim.rebucket(player);
  return { x: player.pos.x, z: player.pos.z };
}

/** Dress, spec and level the preset character. Gear goes on LAST so it is
 *  recalculated against the capped level rather than a level-1 stat line. */
function applyPreset(sim: Sim, cls: PlayerClass, spec: string | undefined): string {
  const preset = buildRunPreset(cls, spec);
  const pickedSpec = preset?.spec ?? spec ?? runPresetSpec(cls);
  sim.setPlayerLevel(RUN_PRESET_LEVEL, sim.playerId);
  if (!preset) return pickedSpec;
  // The whole allocation in one commit: `applyTalents` re-validates it against
  // the class tree and the level, so an allocation the tree would refuse is
  // refused here too instead of half-applied.
  sim.applyTalents(preset.talents, sim.playerId);
  // Bags first, then both hands cleared, then every piece: the ordering rule
  // documented on `applyDevKit`, reused rather than re-derived.
  applyDevKit(sim, cls, pickedSpec, sim.playerId);
  // Then the jewelry pass, which `applyDevKit` does not know about. Neck before
  // rings, and the two rings in order, because `resolveEquipSlot` puts a ring on
  // the first FREE finger.
  for (const itemId of Object.values(preset.jewelry)) {
    sim.addItem(itemId, 1, sim.playerId, { silent: true });
    sim.equipItem(itemId, sim.playerId);
  }
  for (const consumable of preset.consumables) {
    sim.addItem(consumable.itemId, consumable.count, sim.playerId, { silent: true });
  }
  // Gear and talents both moved the stat line; enter the run topped off rather
  // than at whatever fraction of the new maximum the old pools happened to be.
  const player = sim.player;
  player.hp = player.maxHp;
  player.resource = player.resourceType === 'rage' ? 0 : player.maxResource;
  return pickedSpec;
}

/** Hire the standard five-man: tank, healer, dps, dps.
 *
 *  `recruitCompanion` enforces the dungeon-entrance gate itself (`canRecruit` in
 *  companions/role_kit.ts), so this asks for the roles in the template's fill
 *  order and lets the sim refuse if the character is somehow not at a door. The
 *  refusals are not swallowed silently: the roles actually hired come back on the
 *  session, so a caller (or a test) can see a short party. */
function hireParty(sim: Sim): CompanionRole[] {
  for (const role of DEFAULT_COMPANION_ROLES) {
    sim.recruitCompanion(role, sim.playerId);
  }
  return (sim.companionPartyFor(sim.playerId)?.members ?? []).map((m) => m.role);
}

/** Write the run character to its OWN slot.
 *
 *  The single place run mode touches storage, and it always stamps
 *  `mode: RUN_SAVE_MODE`. That is what keeps a break-mode session out of the
 *  owner's leveled character: `saveOffline` routes the mode to its own key, and
 *  `loadOffline` refuses an envelope stamped with a different one. Returns false
 *  when the write was refused (quota, private browsing) so the caller can warn
 *  once instead of assuming it stuck. Exported so a test can prove where the
 *  bytes land without standing up a browser. */
export function saveRunCharacter(
  sim: Sim,
  playerClass: PlayerClass,
  skin: number,
  seed: number,
  storage: Storage,
  savedAt: number,
): boolean {
  const state = sim.serializeCharacter(sim.playerId);
  if (!state) return false;
  return saveOffline(storage, {
    mode: RUN_SAVE_MODE,
    playerClass,
    playerName: RUN_CHARACTER_NAME,
    skin,
    seed,
    state,
    savedAt,
  });
}

/** Autosave on the edges that plausibly precede losing the tab, plus a slow
 *  interval as the backstop for a crash that fires no event at all. Mirrors the
 *  offline flow's cadence; no-op outside a browser, which is what lets a Vitest
 *  drive `startRunMode` in plain Node. */
function wireRunPersistence(
  sim: Sim,
  playerClass: PlayerClass,
  skin: number,
  seed: number,
  storage: Storage,
  now: () => number,
): void {
  if (typeof window === 'undefined') return;
  let warned = false;
  const save = (): void => {
    if (saveRunCharacter(sim, playerClass, skin, seed, storage, now())) return;
    if (warned) return;
    warned = true;
    console.warn('run mode save refused by storage (quota or private mode)');
  };

  window.addEventListener('blur', save);
  window.addEventListener('pagehide', save);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') save();
    });
  }
  window.setInterval(save, RUN_AUTOSAVE_MS);
}

/**
 * Stand up a run-mode session and return it ready to play.
 *
 * The caller owns everything above this: the loading screen, the audio unlock,
 * and handing `session.sim` to `startGame`. Everything below it (the world, the
 * character, the kit, the party, the save slot) is decided here.
 */
export function startRunMode(opts: RunModeOptions): RunModeSession {
  const { playerClass, seed } = opts;
  const skin = opts.skin ?? 0;
  const storage = opts.storage ?? null;
  const now = opts.now ?? (() => Date.now());
  const dungeonId = resolveDungeonId(opts.dungeonId);

  // Only a RUN save of the same class is a resume candidate. loadOffline refuses
  // an envelope stamped with any other mode, so the owner's leveled character is
  // not merely ignored here, it is unreachable.
  const stored = opts.resume === false || !storage ? null : loadOffline(storage, RUN_SAVE_MODE);
  const resume = stored && stored.playerClass === playerClass ? stored : null;

  const sim = new Sim({
    seed,
    playerClass,
    playerName: RUN_CHARACTER_NAME,
    // Run mode is a legitimate game mode, not a cheat path: the `/dev` surface
    // stays off regardless of build.
    devCommands: false,
    // ...but it IS a testing surface, so the companion party is not chained to a
    // dungeon door here: `/hire` works anywhere and the party is kept wherever
    // the owner goes. Ordinary offline play keeps the door rule.
    companionsAnywhere: true,
    noPlayer: resume !== null,
  });
  if (resume) sim.addPlayer(playerClass, RUN_CHARACTER_NAME, { state: resume.state });
  sim.setPlayerSkin(sim.playerId, resume ? resume.skin : skin);

  // A resumed character keeps the gear it walked out with; a fresh one gets the
  // preset. Both get the door and the party, because neither survives a save.
  const spec = resume
    ? (opts.spec ?? runPresetSpec(playerClass))
    : applyPreset(sim, playerClass, opts.spec);
  const spawn = placeAtDungeonDoor(sim, dungeonId);
  const companionRoles = hireParty(sim);

  if (storage) wireRunPersistence(sim, playerClass, skin, seed, storage, now);

  return {
    sim,
    playerClass,
    spec,
    level: sim.player.level,
    dungeonId,
    dungeonName: DUNGEONS[dungeonId]?.name ?? dungeonId,
    spawn,
    companionRoles,
    keybindScope: `run:${playerClass}`,
    resumed: resume !== null,
  };
}
