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
   - The MERGE IS IMPLEMENTED and configured (`characters_v2.json` `addClipsFrom`
     names six `Rig_Medium_*.glb` libraries; `build_assets.mjs` runs
     `mergeDocuments` and re-points every merged channel onto the character's
     bones). Only the SOURCE FILES are missing, which is a different and much
     smaller claim than the earlier "there is nothing to merge".
   - `tmp/asset_src/kaykit/` now EXISTS: the CC0 GitHub packs (Adventures 1.0,
     Skeletons 1.0) were cloned 2026-08-02. Still absent and still the blocker:
     the `KayKit Character Animations` pack (the `Rig_Medium_*` libraries),
     plus `KayKit Adventurers 2.0` (Druid, Ranger) and `Paladin`. Those three
     are itch.io downloads; see `tmp/asset_src/kaykit/DROP_PACKS_HERE.txt`.
   - Widening `keepClips` is the WRONG fix even with the sources. All 8 player
     GLBs carry byte-identical clip data (verified: 22 clips each, identical
     hash over names, sampler arrays and channel targets). Corrected numbers,
     the first version of this entry understated it by about half: 306.6 KiB of
     meshopt-compressed animation per GLB, so roughly 2.1 MiB of the shipped
     build is pure duplication, against a `models/chars` group already about
     6 MiB over budget. The right shape is
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
4b. **Dungeon SHAPE: multi-boss and branching paths** (unestimated, likely 6+).
   Raised by the owner 2026-08-02 playing Keystone: "super short, one boss,
   simple mechanics". Distinct from item 4, which is boss DEPTH; this is dungeon
   STRUCTURE, and it was not on the roadmap at all.
   - **Multi-boss is mostly already supported.** Corrected 2026-08-02 after an
     audit caught the first version of this bullet being wrong on every number:
     **13** records carry `boss: true` (not 6), and the named mid-bosses are
     `sexton_marrow`, `knight_commander_olen`, `korgath_the_bound` and
     `grand_necromancer_velkhar` (CC- and snare-immune, flagged by comment
     rather than by `boss: true`). Morthen and Vael the Mistcaller are NOT
     mid-bosses: both are `finalBossId` in
     `src/sim/content/dungeon_difficulty.ts`, as are Ysolei, Korzul and
     Nythraxis. So every dungeon does already have a final boss plus, in four
     cases, a named mid-boss. Adding another is a declarative record in
     `src/sim/content/` plus spawn entries. This is the cheap half.
   - **Branching paths are the real work.** Corrected: the `interior` union is
     `'crypt' | 'sanctum' | 'temple' | 'nythraxis'` and it is declared in
     `src/sim/types.ts`, NOT in `dungeon_layout.ts`, which exports six named
     layouts (`CRYPT_LAYOUT`, `SANCTUM_LAYOUT`, `NYTHRAXIS_LAYOUT`,
     `TEMPLE_LAYOUT`, `ARENA_LAYOUT`, `DROWNED_COURT_LAYOUT`). So "every dungeon
     shares two layouts" was false. What IS true and is the actual problem: each
     layout is plain numbers describing one corridor (`DUNGEON_WALL_X`,
     `DUNGEON_END_WALL_HW`), so having six of them buys variety of dressing, not
     of SHAPE. A branch means authoring a genuinely new topology, and that file
     is the SINGLE source for both render geometry and `colliders.ts`, so it must
     also stay pathfinding-sane for companions.
   - **No authoring tool today.** `src/editor/` is an OVERWORLD editor (terrain,
     props, spawns via `MapDoc`); it does not author dungeon interiors. Upstream
     `feature/dungeon-layout-editor` does have one ("dock the dungeon panel",
     "dungeon overlays"), but it sits in a 1309-file / 295k-insertion branch that
     also merged Rifts, Scorching Wastes and a newer editor, so harvesting it
     fights the hard-fork rule. Decide deliberately: hand-author layouts, or
     invest in extending the existing editor.
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

- **The dev Command Center bricks on a non-English PRODUCTION build (HIGH).**
  Found 2026-08-02 reviewing `ebb02d52e`, the cloud-session commit merged into
  main that day. It added 9 English-only `devCommand.*` keys, which land as
  `pending` in all 19 non-en locales, and `t()` HARD-FAILS on a pending key when
  `isReleaseBuild()`. So on a hosted dev realm with `ALLOW_DEV_COMMANDS=1`
  serving a `vite build`, a non-English tester opens `/dev gui`, clicks
  Scenarios or Progress, and `render()` throws mid-template: the markup is never
  assigned, the tab looks dead, and because `this.category` already mutated
  EVERY later render throws too. The window is bricked until reload.
  Invisible at PR tier by construction, and the next `release/**` branch will
  hard-fail on it. Fix: supply the 9 locale fills, or exempt `devCommand.*` from
  the pending hard-fail in `t()` rather than only from the M16 leak guard.
- **Windfury makes Rockbiter R3 dead content (balance, owner's call).** After the
  2026-08-02 kit change windfury R1 is +16 for 30 mana at level 16; rockbiter R3
  is +14 for 45 at the same level. Strictly better and cheaper, so rockbiter R3
  is obsolete the moment it is trainable. All four imbues feed the same flat
  `imbueBonus`, so there is no compensating niche. The old +12 preserved a real
  cheap-versus-strong tradeoff. `tests/class_kit_completion.test.ts` pins only
  "stronger than rockbiter R3", so the pin cannot catch this.

- **The Eastbrook polish evidence is RE-STAMPED, not re-captured.** Found by an
  adversarial review 2026-08-02, and the honest version of a mistake I made the
  same day. `src/render/renderer.ts` is one of the 22 provenance inputs
  PRECISELY SO a renderer change invalidates the captured polish screenshots and
  forces a re-capture. The three cast-animation commits (`fb343a270`,
  `c54d0db18`, `b72448352`) moved it, the seal fired correctly, and the response
  was to rewrite the seal fields inside the evidence JSONs so the suites went
  green. **No screenshot was retaken.** The committed evidence therefore attests
  to a renderer it was not captured against.
  - The shipped ASSETS are fine: no `.glb` or `.png` changed, and re-running the
    mailbox export reproduces a byte-identical GLB.
  - The gate was ALREADY red before that day's work, because renderer.ts changed
    earlier. It papered over a pre-existing red rather than causing one.
  - My first explanation (package-lock drift from the web3 strip) was WRONG and
    is disproven by `git log 0153c0260..HEAD -- package-lock.json`, which returns
    nothing.
  - **What is owed:** a real re-capture of the polish evidence against the
    current renderer, then a genuine re-mint. Until then treat those screenshots
    as approximately-right, not as evidence.
  - **Attempted 2026-08-03 and BACKED OUT, read this before trying again.** The
    pipeline itself works: `capture_ingame.mjs` drove the live client and
    produced 23 records against the current renderer. The trap is the output
    path. `OUT_DIR` does NOT control where the metadata lands: the run wrote
    `docs/screenshots/eastbrook-vale-rebuild/metadata/after-desktop-ultra-town.json`,
    which is the **rebuild-v1** evidence, and overwrote it with **polish-v2**
    content (15 records became 23, and a `townContractId` appeared where the
    rebuild file has none). Reverted with `git checkout --`; all 18 Eastbrook
    suites green afterwards. Before retrying, READ the output-path logic in
    `capture_ingame.mjs` and establish which invocation targets
    `polish/metadata/` rather than `metadata/`. Do not guess at the flags: the
    two contracts share a directory tree and clobbering one with the other is
    silent.

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

## Working agreements

- One phase per session block; the owner playtests between phases
- Never set `ALLOW_DEV_COMMANDS` in a shared world. `npm run dev` enables the
  `/dev` set locally by design, which is the supported way to test at level
- Prefer `npx vitest run tests/<file>` while iterating. The full suite is about
  20,000 tests and saturates every core
- To playtest RUN MODE or anything offline, use `npm run dev` (:5173). Corrected
  2026-08-02: the old advice here was `npm run build && npm run preview`, which
  CANNOT WORK for those. `isOfflineModeAvailable` returns `import.meta.env.DEV`,
  so a production build ships no offline entry point and run mode rides the
  offline Sim. `scripts/playtest_soak.mjs` defaulted to the preview port for the
  same reason and reported the game as broken. Preview is still right for testing
  a production build itself (online mode, the marketing shell)
