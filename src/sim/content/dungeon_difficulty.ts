import type { DungeonDifficulty } from '../types';

// The participation token awarded directly to every eligible player when a
// heroic final boss dies (see awardHeroicMarks in ../instances/dungeons.ts).
// The item record lives in ./items.ts.
export const HEROIC_MARK_ITEM_ID = 'heroic_mark';

export interface HeroicDungeonTuning {
  id: string;
  difficulty: Extract<DungeonDifficulty, 'heroic'>;
  level: number;
  healthMultiplier: number;
  damageMultiplier: number;
  // Boss-SUMMONED add waves (MobTemplate.summonAdds, spawned through
  // spawnBossAdds) use this damage multiplier instead of the dungeon-wide one:
  // an add pack lands ON TOP of the boss's own swings and mechanics, so each
  // add is tuned to roughly HALF the trash calibration. Trash spawned from the
  // dungeon spawn list (including the guards flanking a boss) stays on
  // damageMultiplier.
  addDamageMultiplier: number;
  armorMultiplier: number;
  // The dungeon's last boss: killing it in a heroic instance awards Heroic
  // Marks for every eligible participant.
  finalBossId: string;
  // Marks awarded directly to each eligible participant at kill time.
  marksPerParticipant: number;
}

// Tuning model: every heroic mob is pinned to LEVEL 22 (two above the level-20
// player cap) and the four five-mans are damage-EQUALIZED, so a heroic feels
// the same whichever one you run. The calibration target is an average elite
// TRASH swing landing ~225 post-mitigation on the reference GEARED shaman
// (full heroic mail: 2142 armor, 1493 hp, 48.55% DR vs a level-22 attacker),
// i.e. ~15% of max hp per hit, with final bosses ~17-18%. Solving each dungeon
// for that target INVERTS the multiplier ladder, because the harder dungeons
// already carry bigger base weapon damage: hollow_crypt needs the largest
// multiplier, gravewyrm_sanctum the smallest. Gear-band reference points at
// these constants: full-heroic mail lands ~225 trash / ~250-265 boss per hit;
// endgame blues tank (~1150 hp, ~31% DR at L22) ~26% trash / ~30% boss; blues
// cloth (~640 hp, ~17% DR) ~57% per trash hit, so heroics stay gear-gated by
// design. (The original calibration targeted ~20% per trash hit; the whole
// ladder was cut 25% after live heroics proved overtuned.) Boss-summoned add
// waves swing at addDamageMultiplier, about half the trash target, because
// they stack on the boss's own output. Mechanic damage lands RAW (no armor
// step; see aoePulse/stomp in ../mob/locomotion.ts) and scales with the same
// per-dungeon multiplier via mechanicDamageMult; support heals scale with
// mechanicHealMult (= healthMultiplier); both wired in
// ../instances/difficulty.ts.
//
// Rounding note: the 25% cut and the ~half add values are calibration-rounded
// to tidy multipliers (drowned_temple 5.7 to 4.3 is a 24.6% cut, hollow_crypt
// 5.1 to 2.55 is exactly half); the round numbers are intentional, do not
// "fix" one back to the exact fraction.
// NORMAL-difficulty retunes. Normal spawns default to the raw base templates;
// a dungeon appears here only when its normal mode needs its own calibration.
// Unlike the heroic table this one is PER MOB, because the floor-style targets
// below need different factors for trash, non-elite adds (no 1.5x elite swing
// multiplier), and bosses. The per-mob factor also drives mechanicDamageMult,
// so a boss's aoePulse/stomp scale with its own melee (../instances/difficulty.ts).
export interface NormalDungeonTuning {
  id: string;
  difficulty: Extract<DungeonDifficulty, 'normal'>;
  healthMultiplier: number;
  damageMultiplierByMob: Record<string, number>;
}

// Economy retune (v0.29): soloable normal Sanctum runs were printing up to 6
// gold per clear. Calibration target: every mob's health DOUBLES, and the
// minimum non-crit swing lands at least 300 (trash) / 600 (bosses) on the
// maximum-mitigation reference warrior: level-20 prot in the max-armor kit
// (full heroic plate + shield, prot mastery), 2861 armor, in Defensive Stance
// (takes 10% less), i.e. only ~37-38% of a raw swing gets through. Solving the
// floor per mob at its minimum spawn level gives the ladder below; the
// non-elite raised_bonewalker needs roughly double the trash factor because it
// lacks the 1.5x elite swing multiplier. Pinned by
// tests/gravewyrm_normal_tuning.test.ts, which also pins the heroic transform
// so this retune cannot leak into heroic (heroic multiplies the same base
// templates and is deliberately untouched).
export const NORMAL_DUNGEON_TUNING: Record<string, NormalDungeonTuning> = {
  gravewyrm_sanctum: {
    id: 'gravewyrm_sanctum',
    difficulty: 'normal',
    healthMultiplier: 2.0,
    damageMultiplierByMob: {
      sanctum_boneguard: 11.5,
      sanctum_drakonid: 11,
      raised_bonewalker: 23,
      korgath_the_bound: 19.5,
      grand_necromancer_velkhar: 20.5,
      korzul_the_gravewyrm: 19,
    },
  },
};

export const HEROIC_DUNGEON_TUNING: Record<string, HeroicDungeonTuning> = {
  hollow_crypt: {
    id: 'hollow_crypt',
    difficulty: 'heroic',
    level: 22,
    healthMultiplier: 1.9,
    damageMultiplier: 5.1,
    addDamageMultiplier: 2.55,
    armorMultiplier: 1.3,
    finalBossId: 'morthen',
    marksPerParticipant: 1,
  },
  sunken_bastion: {
    id: 'sunken_bastion',
    difficulty: 'heroic',
    level: 22,
    healthMultiplier: 2.0,
    damageMultiplier: 4.65,
    addDamageMultiplier: 2.3,
    armorMultiplier: 1.3,
    finalBossId: 'vael_the_mistcaller',
    marksPerParticipant: 1,
  },
  drowned_temple: {
    id: 'drowned_temple',
    difficulty: 'heroic',
    level: 22,
    healthMultiplier: 2.6,
    damageMultiplier: 4.3,
    addDamageMultiplier: 2.15,
    armorMultiplier: 1.25,
    finalBossId: 'ysolei',
    marksPerParticipant: 1,
  },
  gravewyrm_sanctum: {
    id: 'gravewyrm_sanctum',
    difficulty: 'heroic',
    level: 22,
    healthMultiplier: 2.0,
    damageMultiplier: 4.05,
    addDamageMultiplier: 2.0,
    armorMultiplier: 1.2,
    finalBossId: 'korzul_the_gravewyrm',
    marksPerParticipant: 1,
  },
  // The 10-player raid arena. Normal Nythraxis already swings ~3.7x harder
  // than Korzul, so the raid's heroic multiplier is small in RELATIVE terms
  // while landing the hardest absolute hits in the game: at the level-22
  // heroic pin (matching the 5-mans) the boss chews a geared tank for ~54%
  // of max hp per 2.6s swing (a raid brings two or three healers), and add
  // waves hit cloth for ~57%. The percentage
  // mechanics scale on heroic in the encounter script (Soul Rend 1.5x,
  // Deathless Rage lethal on a failed wardstone channel; see
  // encounters/nythraxis.ts). The attunement dungeon nythraxis_crypt is
  // story content and deliberately has NO heroic record. The daily raid
  // lockout is difficulty-scoped (the :heroic key beside the plain dungeon
  // id): one normal AND one heroic Nythraxis kill per day.
  nythraxis_boss_arena: {
    id: 'nythraxis_boss_arena',
    difficulty: 'heroic',
    level: 22,
    healthMultiplier: 1.6,
    damageMultiplier: 2.0,
    // The raid's add waves spawn through the encounter script
    // (encounters/nythraxis.ts), never spawnBossAdds, so this field is inert
    // there; it mirrors damageMultiplier to state that nothing is softened.
    addDamageMultiplier: 2.0,
    armorMultiplier: 1.2,
    finalBossId: 'nythraxis_scourge_of_thornpeak',
    marksPerParticipant: 3,
  },
};
