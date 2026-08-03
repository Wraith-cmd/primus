# PRIMUS roadmap

The single place to look. Updated as decisions land; every entry names where the
evidence for it lives.

## Done

- **Phase 0** map, baseline, running
- **Phase 1** web3 stripped, Steam and auto-updater removed, renamed to PRIMUS
- **Phase 2** offline persistence, save on blur / hide / Escape-Escape, shift
  mode (Shift+M mutes and caps to 30fps), Offline as the default world
- **Phase 3** Guardian Druid: Mangle, Thrash, Ironfur, Frenzied Regeneration,
  bear threat 1.3 to 4.0. Mutation-tested, not just covered
- **Phase 4 (core)** companion AI: heal triage, ground avoidance, interrupts,
  role kits, and a four-companion party recruited with `/hire` at dungeon
  entrances
- **Combat feel** GCD spell queueing. A press during the global cooldown used to
  be silently discarded, which is most presses in real play

## Decided

- **Legion-era** Guardian kit, not WotLK
- **Hard fork.** Take upstream as a snapshot, never merge again
- **Run mode uses a PRESET max-level character**, not the leveled one, and needs
  its own save slot (`PRIMUS_PHASE_4_5.md`)
- **Dungeon entrances only** for recruiting companions (run mode is the one
  exception: `companionsAnywhere` lifts the door gate, since walking back to a
  portal to re-hire is friction with no design value on a testing surface)
- **Run mode auto-hires a FIXED party: tank, healer, dps, dps.** Questioned
  during the 2026-08-02 playtest ("I'm a tank and it still gave me a tank"), so
  writing down that this is the feature as built, not a regression:
  `run_mode.ts` `hireParty` loops `DEFAULT_COMPANION_ROLES` passing an EXPLICIT
  role, which deliberately bypasses the `suggestNextRole` fill-around-the-owner
  logic that plain `/hire` uses, and the run-mode copy promises exactly that
  ("Your party: tank, healer, damage, damage"). Consequence a tank owner feels:
  a five-man with two tanks and one healer. **Open question for the owner:**
  should run mode fill around the owner's role like `/hire` does, which would
  mean rewording the mode description? Do not "fix" this without that answer.
- **No Blizzard asset files, soundtrack audio, or extracted content.** Mechanics
  and aesthetic direction are fair game and are where the feel actually lives.
  A Spotify subscription licenses personal streaming, not embedding in software
- **Naming discipline RELAXED 2026-08-02 (owner's call).** The de-IP rename is
  no longer a worklist to hunt down. Concretely:
  - New content keeps the established convention (internal id may be the WoW
    name, display name is original: `wrath` -> "Wildbolt", `bear_form` ->
    "Bruin Form"). It is cheap at authoring time and the codebase is already
    consistent.
  - Existing coined names are NOT reverted, and the `tests/ip_scrub.test.ts`
    gates STAY. They prevent drift back, which costs nothing now that the work
    is done; unwinding them would mean touching content, the i18n catalog, 18
    locale overlays, the wiki seed, and the guide for no benefit.
  - Residual-scrub items are dropped as a priority. `ip-refactor/` is history,
    not a backlog.
  - The wiki-seed FRESHNESS gate is unrelated to IP and stays regardless: it
    caught a six-week-stale generated artifact, which was a build bug
- **Browser first**, Electron shell kept for handheld and long sessions

## Next, in value order

Effort in weekend sessions. Order reflects value per unit of effort, not
narrative order.

1. **Run mode harness** (3 to 5). Preset capped character, real kit, party
   pre-hired, at a dungeon entrance. Doubles as the playtest harness: without it
   the owner cannot evaluate dungeons, companions, or high-level abilities at
   all. Unblocks everything below it.
2. **Restore the animation clips** (1 to 2 ONCE UNBLOCKED; see below).
   `keepClips` in `scripts/assets/specs/characters_v2.json` drops all but 22
   clips at BUILD time (`anim.dispose()` in `scripts/assets/build_assets.mjs`),
   so the casting problem is a build filter, not an art ceiling.
   **Corrected 2026-08-02, this entry was wrong in two ways:**
   - It said the build "already merges" the 133 to 161 clips. It does not:
     `tmp/asset_src/` DOES NOT EXIST on this machine (gitignored, never
     committed). There is nothing to merge, so the effort estimate assumed a
     starting point that is not there. Download the CC0 KayKit packs from
     kaylousberg.itch.io FIRST; that is the actual blocker.
   - Widening `keepClips` is the WRONG fix even with the sources. All 8 player
     GLBs carry a byte-identical 147 KiB of the same 22 clips, so 1.15 MiB of
     the build is duplication and widening multiplies it by 8, against a
     `models/chars` group already about 6 MiB over budget. The right shape is
     ONE shared `rig_medium_anims.glb` referenced through `VisualDef.animUrls`,
     the pattern the hunter's bow (`bow_anims.glb`) already uses.
   See `docs/design/wow-fidelity-research.md`.
3. **The rest of combat feel** (about 4). Screen shake on damage DEALT (today it
   is gated to the Fiesta minigame, so ordinary combat has no impact response),
   hit-stop (absent entirely), FOV punch wired to combat, queue highlight for
   spells (the CSS and painter already exist for the melee queue).
4. **Boss mechanics** (3 to 5). A keystone multiplier applied to a boss with one
   telegraph just scales one telegraph. Author 3 to 5 real mechanics per boss
   BEFORE the timer. Doubles as the acceptance test for companion AI.
5. **Companion depth** (5 to 9). The cores exist and are wired; what remains is
   making four of them feel like a party under pressure.
6. **Keystones** (6 to 10). `PRIMUS_PHASE_4_5.md`. Timer, scaling, affix
   rotation reusing the delve affix system, plus run mode's second door.
7. **Class depth**. Mage has 8 base abilities against warrior's 39. Audit
   against `docs/design/spell-ranks.md` rather than inventing content.
8. **Art direction** (5 to 9, interleavable). Palette per zone, HUD chrome,
   typography, per-zone ambience.
9. **Music**. Procedural WebAudio plus the built-in `music_editor.html`. Tune
   the generator toward restraint and space, or source CC0 orchestral. Never
   Blizzard tracks.
10. **More quests**. Last on purpose: 96 already exist, and quests are
    consume-once, the worst value-per-session ratio available.
11. **Friends server** (Phase 6, optional). Compose on Bumblebee plus Tailscale.

## Open, waiting on the owner

- Does the `/hire` party feel like a party, or like four bots? Shapes all of
  keystones
- The cast layer: `__primusCastKnobs.master = 0` against `1`, and a `dump()` of
  anything worth keeping
- ROG Ally check through the Electron shell. Needs the hardware

## Known broken

- ~~**Two denied-name surfaces still ship.**~~ BOTH FIXED AND GATED 2026-08-02.
  Kept here rather than deleted because the SHAPE recurs: in each case the code
  was correct and the GUARD was missing, so the fix was a gate, not logic.
  1. The `guide.abilityHook.brain_freeze` prose named the renamed `fc_flurry`
     (Flurry -> Winterlash) in ENGLISH, and five overlays carried it through.
     Two scanner gaps let it hide: a single-word denylist entry only matches a
     whole field value (so a name inside a sentence is invisible), and guide
     prose was never prose-scanned at all. Both now covered in
     `tests/ip_scrub.test.ts`.
  2. `mediawiki/seed/pages.xml` was a COMMITTED GENERATED artifact last built
     2026-06-16, so it kept seeding pre-rename page titles onto a wiki that
     ships. Fixed by `npm run wiki:seed` (never hand-edit it). It had no
     freshness gate while `wiki:content` did, which is exactly why one rotted
     and the other did not; it now has both a de-IP and a staleness gate. The
     de-IP gate reports 106 denylisted titles against the pre-fix file, against
     the 6 a hand-written grep found: gate with the armed denylist, never by eye.
  Remaining residuals, if any, are tracked in `ip-refactor/RESIDUAL-WORKLIST.md`.
- **Companions read as attacking everything in Keystone Run. DIAGNOSED, and it
  is not a defect.** Reproduced 2026-08-02 in `tests/companion_run_mode_aggro.test.ts`.
  The assist gate is intact: driven directly, companions leave an unengaged
  bystander alone, and do not spread from a fight they are legitimately in.
  Through a REAL tick the cause shows itself inverted: a wandering hostile
  nobody engaged aggros a COMPANION on proximity (`aggroTargetId` lands on the
  tank, not the owner), the companions retaliate correctly, and the owner is
  dragged into a fight they never started. Indistinguishable, from the player's
  seat, from the companions having pulled.
  The real cause is WHERE run mode hires: `companionsAnywhere` puts the party in
  the OPEN WORLD rather than at a door or inside the instance, so it is standing
  in mob aggro range from the moment it spawns.
  **Open design question for the owner, do not "fix" without an answer:** should
  run mode hold the party until the owner zones in (`CompanionParty.entered`
  already tracks exactly that), spawn it inside the instance, or leave it and
  accept the open-world skirmish as flavor?
- **Offline is SINGLE SLOT and switching characters destroys the old one.**
  There is no offline character select: online has one, offline has a single
  create screen. The save resumes only when class AND name match, so starting a
  mage when a druid is saved fails the resume, rolls a fresh level 1, and then
  the autosave OVERWRITES the druid. Silently. He wants several tester
  characters (a bear for tanking and companion work, a caster for spell and
  animation work), so this blocks his actual workflow. Fix before he levels
  anything he would miss: key the slot by class plus name (or add a real offline
  character select), and never write over a save whose identity does not match.
- Offline save reported not persisting in real play. Under investigation. It was
  verified by INJECTING a save rather than by playing, reloading and checking,
  which is exactly the test that would have caught it
- Ability DESCRIPTION i18n does not resolve through the overlay key path
  (`entities.abilities.<id>.description` is absent from the generated bundle,
  including for existing abilities). Blocks the M16 guard on all new content
- 2 `deploy_watchdog` failures: macOS ships no GNU `timeout`. Environmental
- `malware_scan` false positive on the word "mnemonic" in `keybinds.ts`

## Working agreements

- One phase per session block; the owner playtests between phases
- Never set `ALLOW_DEV_COMMANDS` in a shared world. `npm run dev` enables the
  `/dev` set locally by design, which is the supported way to test at level
- Prefer `npx vitest run tests/<file>` while iterating. The full suite is about
  20,000 tests and saturates every core
- To playtest without hot reload interference: `npm run build && npm run preview`
