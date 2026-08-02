# Phase 4.5: Keystone Dungeons

A run-based, soloable endgame. One dungeon, one keystone, four AI companions, a
timer, and a difficulty dial that goes as high as you can hold it.

This sits between Phase 4 (companions) and Phase 5 (the look). It is the payoff
phase: the thing you actually play on a slow weekend once the bear tanks and the
companions hold a group together.

## Why this is tractable

M+ is usually described as a big system. In this codebase most of it already
exists, because delves already shipped the hard parts.

| Ingredient | Where it already lives |
|---|---|
| Instanced dungeons, lockouts, instance slots | `src/sim/instances/dungeons.ts`, `DUNGEON_DEFS` |
| Per-dungeon difficulty scaling | `content/dungeon_difficulty.ts`, `instances/difficulty.ts` |
| An affix system with themed rolls | `content/delves/affixes.ts`, applied in `delves/runs.ts` |
| Role queue and group forming | `social/dungeon_finder.ts` |
| An in-sim AI companion | `delves/companion.ts` (Tessa) |
| Difficulty-scaled loot and a currency vendor | `heroic_loot.ts`, `heroic_variants.ts`, `instances/heroic_vendor.ts` |
| Progression and titles | `deeds.ts`, Renown |

What Phase 4.5 adds on top is genuinely small: a keystone item, a run timer, a
scaling curve keyed to a level number, and an affix rotation that reuses the
delve affix machinery against dungeons instead of delves.

The four dungeons available as run targets today: **Hollow Crypt**, **Sunken
Bastion**, **Gravewyrm Sanctum**, and **Nythraxis Crypt**.

## The load-bearing risk, stated up front

The timer is not what makes M+ good. Two things do:

1. Encounters with mechanics worth executing.
2. A party that feels like players rather than four bodies eating floor damage.

The second is the whole difficulty of this phase, and it is not solved by
Phase 4 merely existing. Tessa today is 195 lines: she follows, she melees, and
she heals a percentage of max HP on a fixed interval. She does not move out of
anything, does not interrupt, does not target-swap, and does not react to a
mechanic. Four of those in a timed run is babysitting, not tanking.

**So the sequencing matters: companion quality gates this phase.** A great
keystone system with bad companions is unplayable solo. Good companions make even
plain Heroic runs fun. Build the party first.

## Design

### The keystone

A keystone is an item that names a dungeon and carries a level.

- Obtained from the first completed Heroic run of a week; upgraded by completing
  a run inside the timer, depleted by finishing over it.
- One active keystone at a time, stored on `PlayerMeta`, not in bags: it is
  progression state, not loot. It must survive `serializeCharacter` so it
  persists offline (Phase 2 made that possible).
- Slotting a keystone at the dungeon entrance starts a keystone run instead of a
  normal or heroic one.

Level semantics, kept deliberately simple:

- **+2 to +4**: no affix. Learn the route.
- **+5 and up**: one affix, rolled from the pool for that dungeon's theme.
- **+10 and up**: two affixes.
- Every level scales health and damage (see below).

### Scaling

Reuse the existing tuning shape rather than inventing one.
`HeroicDungeonTuning` already carries `healthMultiplier`, `damageMultiplier`,
`addDamageMultiplier`, and per-mob overrides. A keystone level is a multiplier
applied on top of the heroic baseline:

```
keystoneMult(level) = KEYSTONE_STEP ^ (level - 2)
```

Start at `KEYSTONE_STEP = 1.08` for both health and damage, so +10 is roughly
2x heroic and +20 is roughly 4.3x. Tune from playtests, not from theory.

Two rules that keep this honest:

- **Damage scales with health.** If only health scales you get a slog; if only
  damage scales you get one-shots. Both, together, keep the shape of a fight.
- **The per-mob override maps stay authoritative.** They exist because dungeon
  wide multipliers overshoot on specific mobs. The keystone multiplier composes
  with them; it never replaces them.

### Affixes

`DELVE_AFFIXES` already defines affixes as `{ id, name, themes, blessing }` and
`delves/runs.ts` applies them by id. Two changes:

1. Generalize the theme vocabulary so dungeons can roll from the same pool.
   Hollow Crypt is `crypt`, Sunken Bastion is `sewer`/`ruin`, Gravewyrm Sanctum
   is `vault`. Those themes already exist.
2. Add a small number of dungeon-flavoured affixes that matter in a group fight
   rather than a solo delve. Candidates, all expressible with existing sim
   primitives:
   - **Bolstering**: a non-elite death buffs nearby survivors. Pressures pull
     size and cleave.
   - **Sanguine**: a mob death leaves a healing pool. Pressures where you tank.
   - **Raging**: elites enrage below 30 percent. Pressures cooldown timing.
   - **Tyrannical / Fortified**: bosses or trash take the larger multiplier.
     Cheap, since it is just which multiplier applies.

Do **not** add affixes that require new mechanics to be authored per dungeon.
The whole point is reuse.

### The timer

Per-dungeon par time in `DUNGEON_DEFS`, plus:

- A HUD element showing elapsed against par, and a completion result.
- Finishing under par upgrades the keystone by one level (two if well under).
- Finishing over par depletes it by one. Never below +2.
- The timer is display and reward state only. **It must not touch sim
  determinism**: it reads the tick counter, it never gates a sim branch on wall
  clock.

### Loot

Reuse `heroic_variants.ts`. Keystone loot is the heroic variant table with an
item-level bump keyed to keystone level, plus a guaranteed end-of-run reward
scaling with the level cleared. Add a keystone currency to the existing marks
vendor rather than building a new vendor.

Respect the shipped-item-id rule: never delete or rename an id, retire instead.

### Deeds

Every conquerable tier authors its Book of Deeds records in the same change, per
`docs/design/deeds.md`. Natural set: clear a +5, +10, +15; clear each dungeon in
time; clear one with no deaths. Cosmetic only, titles and Renown, never power.

## What has to change in the companions

This is the real work, and it belongs to Phase 4, not here. Listing it so the
dependency is explicit.

Today `updateDelveCompanion` gives one healer that follows and heals on an
interval. A keystone party needs four companions across tank, healer, and dps,
each of which must at minimum:

1. **Stay out of ground effects.** The sim already has `groundAoEs` and a
   per-tick pulse. Companions must path away from a pulsing area. Without this,
   every affix that puts something on the floor kills the run.
2. **Interrupt.** Mobs cast; `castingAbility` is on the entity. A dps companion
   with an interrupt on cooldown that uses it on the right cast is the single
   biggest jump in "feels like a player".
3. **Target sensibly.** Focus the tank's target by default, swap to a priority
   add when one spawns. The `crypt_raid.mjs` bot script already encodes
   focus-fire logic worth porting, though it is an external WebSocket client and
   must be reimplemented in-sim behind `SimContext`, not lifted wholesale.
4. **Heal on thresholds, not intervals.** Percentage-of-max on a timer cannot
   respond to a spike. Healer companions need a priority target and a triage
   rule.
5. **Scale to the player.** Companions summoned at the dungeon entrance take the
   player's level and a gear budget derived from it, so a +15 party is not four
   level 10s.

All of this lives in `src/sim/`, behind `SimContext`, following the
`delves/companion.ts` pattern: functions in the module, state on `Sim`. It is
deterministic sim logic and every piece of it needs tests. `ALLOW_DEV_COMMANDS`
stays off; companions are legitimate sim entities, never dev spawns.

## Build order

1. **Companion depth** (Phase 4, prerequisite). Roles, threshold healing,
   interrupts, ground-effect avoidance, level scaling.
2. **Keystone item and run state.** Slotting, the run record on `PlayerMeta`,
   persistence through `serializeCharacter`.
3. **Scaling.** The keystone multiplier composed onto heroic tuning.
4. **Timer and result.** HUD, upgrade and deplete rules.
5. **Affixes.** Generalize the delve pool to dungeon themes; add the group
   affixes.
6. **Loot and deeds.** Item-level bump, currency, deed records.
7. **Tuning pass.** The playtest is the test: clear Hollow Crypt at +5 as a bear
   tank with four companions, then push until it stops being fun and find out
   why.

## Effort

Rough, in your weekend-session currency:

| Step | Sessions |
|---|---|
| Companion depth (Phase 4 proper) | 5 to 9 |
| Keystone item, run state, persistence | 1 to 2 |
| Scaling | 1 |
| Timer and result | 1 to 2 |
| Affixes | 2 to 3 |
| Loot and deeds | 1 to 2 |
| Tuning | open ended, and the fun part |

**Keystones on top of a working party: 6 to 10 sessions.** The party itself is
the larger half, and it was already on the roadmap as Phase 4.

## Explicitly out of scope

- Weekly rotating affix schedules tied to real dates. The sim takes time from
  its tick counter; a real-world calendar is a server concern and this fork is
  offline first.
- Leaderboards and rating. There is no one to compete against.
- New dungeons. Four existing ones at variable difficulty is the whole point of
  a run-based model. Author new content only after the loop is proven fun.
- Anything that requires `ALLOW_DEV_COMMANDS` in normal play.

## Run mode: the second entry point

DECIDED (owner, 2026-08-01): run mode uses a PRESET MAX-LEVEL character, not the
player's leveled one.

The use case is a twenty-minute keystone on a work break. Requiring a leveled
character first would defeat that entirely, and a preset also decouples keystone
tuning from the leveling curve, so the two can be balanced independently.

One game, two doors. Same sim, same classes, same dungeons, same companions.

### What run mode does
- A third option on the landing page beside Online and Offline: "Keystone Run".
- Pick a class. Spawn at cap with a fixed, hand-tuned kit (no gear progression,
  no loot decisions: the run is the content, not the shopping).
- Four companions already hired, keystone already slotted, at the dungeon door.
- Click to playing in about ten seconds. That number is the design target; if it
  drifts much past it, the mode has failed at its one job.
- Result screen on completion: time against par, key level, upgrade or deplete.

### The save-slot wrinkle, do not skip this
`src/game/offline_save.ts` is a SINGLE slot keyed on class plus name. Run mode
must not write to it. Losing a leveled character to a break-mode session would be
the worst bug this fork could ship.

Namespace the slot (a mode discriminator in the key) before run mode writes
anything at all. The envelope already carries a version field, so a mode field is
a natural companion; bump OFFLINE_SAVE_VERSION if the shape changes.

Whether a run-mode character persists between runs is open. Leaning yes, so a
keystone can be carried and upgraded across sessions, which is the whole
progression loop of the mode.

### Later, not now
Once the main game is deep enough to deserve it, let a real max-level character
opt into keystones with its own gear. That is the traditional MMO payoff and it
reuses everything built here. It is deliberately NOT first: the break-mode
payoff is available immediately and costs far less.

### Effort
About 3 to 5 sessions ON TOP of the keystone layer. Most of the work (keystones,
timer, scaling, affixes) is shared between both modes, so this is a cheap second
door onto work already planned rather than a separate feature.
