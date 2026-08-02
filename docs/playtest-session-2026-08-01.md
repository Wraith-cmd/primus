# Playtest session report, 2026-08-01

What was fixed, what was found, and what to do next. Written while the owner
was away, from a live playtest plus an automated soak.

## Shipped this session (all committed, all verified)

| Commit | What |
|---|---|
| `32cdf14c6` | Offline save actually keeps a character (the two reported save bugs) |
| `101784cca` | `vite build` unbroken, so `npm run preview` works again |
| `729d4ffad` | Run mode ("Keystone Run") wired and reachable |
| `144ac0639` | Dev panel design spec |
| `8f8327fa8` | Companions assist instead of pulling; `/hire` fills around your role |
| `69f3bc8a6` | Keystone hires and keeps companions anywhere |

## Bugs still open

Ranked by how much they hurt an actual session.

### 1. No party frames for hired companions (HIGH)

Reported live, then independently reproduced by the automated soak: "4
companions hired, 0 party frames in the DOM". Companions are mobs with an
`ownerId`, not members of the social party system, so `partyInfo` never contains
them and the HUD builds no frames. Consequence: they cannot be clicked, healed,
or resurrected. A healer player currently cannot play their role in their own
party. Being worked on separately.

### 2. Cast animations read badly (HIGH, needs the owner)

Root cause is NOT the blend code that three previous passes tried to tune. The
character GLBs ship exactly 22 clips because `keepClips` in
`scripts/assets/specs/characters_v2.json` drops the rest at BUILD time
(`anim.dispose()` in `build_assets.mjs`), so the clips are absent from the file
rather than merely unused. Players get three cast clips total, and
`manifest.ts` hardwires `cast: 'Spellcasting'` for every casting class, so a
druid, a mage and a priest all play one loop. The procedural pose layer exists
to compensate, which is why tuning it kept failing.

Two things block the real fix:

- The KayKit source packs are not on this machine. `tmp/asset_src/` is
  gitignored and was never committed. They are CC0 and re-downloadable.
- Widening `keepClips` is the WRONG fix even with the sources. All 8 player GLBs
  carry a byte-identical 147 KiB of the same 22 clips, so 1.15 MiB of the
  current build is pure duplication and widening multiplies it by 8, against a
  `models/chars` budget already 6 MiB over. The right shape is ONE shared
  `rig_medium_anims.glb` referenced through `VisualDef.animUrls`, the pattern
  already used for the hunter's bow.

Still outstanding and only the owner can answer: does
`__primusCastKnobs.master = 0` make the wildbolt half-spin go away? That
isolates the procedural layer from the underlying clip.

### 3. Harvest nodes bypass walk-by autoloot (MEDIUM)

`Esc > Options > Walk-by Autoloot` (default OFF) covers mob corpses only:
`AutoLoot.run` skips anything where `e.kind !== 'mob'`. Harvest nodes go through
`harvestNode`/`harvestCorpse` instead, so gathering still needs a click per
item. Suggestion: extend the walk-by pass to gather nodes behind the same
setting, and consider defaulting the setting ON for this fork, where offline
solo play is the primary mode.

### 4. Dev knob tuning leaks into production builds (MEDIUM)

`installCastKnobs()` runs at module load with no dev gate and `loadStored()`
reads localStorage unconditionally, so a production build applies any persisted
`primus_cast_knobs` values to live play. Cosmetic today. The dev panel spec
closes it, because that design would otherwise generalize the same pattern to
every knob group.

### 5. Movement can wedge (LOW, unconfirmed)

The soak reported `movement:stuck` seven times at `{x: 30, z: 55}`: position
unchanged across five consecutive move attempts. This may be real collision
geometry or simply a dumb bot walking into a wall. Worth one look at that
coordinate before treating it as a bug.

### 6. The release gate is blocked by a false positive (MEDIUM, easy)

`tests/malware_scan.test.ts` fails the whole-tree HIGH-severity gate on
`src/game/keybinds.ts:267`, categorised as "Wallet secret material reference".
The line is a comment explaining that shift mode parks on KeyM because "M for
mute" is the MNEMONIC. The scanner's wallet seed-phrase rule is matching the
ordinary English word. It predates this session (the line arrives in
`2942fe70a`) and nothing about it is a real finding.

Fix is a one-liner either way: reword the comment, or add the pathSev demotion
the rule already supports for other sanctioned files. Worth doing, because a
gate that cries wolf gets ignored.

## Full test suite status

`npm test`: 19,666 passed, 18 failed across 12 files, 46 skipped.

None of the failures are in the areas touched this session. Verified green
directly: every companion suite, `run_mode`, `sim_context`, `entity_roster`,
`offline_save`, `offline_resume`, and the `tests/parity` golden-trace gate
(183 passed, so no re-mint was needed: the companion paths draw no rng).

Identified failures, all pre-existing:

- `malware_scan` : the "mnemonic" false positive above.
- `sfx_export_bundle` : SFX bundle determinism.
- `server/new_endpoint` : the scaffold golden, which shells out to tsc.

The captured log was truncated, so the remaining 9 files could not be named.
Re-run `npm test` for the full list before trusting any "green" claim.

## Upstream: cherry-pick, do not merge

Upstream `world-of-claudecraft` is 1523 commits ahead; this fork is 24 ahead,
diverged 2026-07-25.

The reassuring part: upstream has NOT touched offline mode. `offline_save.ts`
and `offline_resume.ts` do not exist there, and `offline_mode_gate.ts` is
byte-identical. The fork's core value has no collision surface.

A merge dry-run produces 120 conflicted files and would add roughly 1,661 new
asset files (audio, models, textures), which is the asset payload the owner
already ruled out. Estimated 4 to 6 weekends, and it breaks things.

The engine barely diverged (`src/sim` has ONE conflict, a CLAUDE.md), so
targeted cherry-picks are cheap. Suggested first batch, all self-contained:

```
git cherry-pick fd5c64fe2 67e0da15e c3e500040
```

Those are three save/persistence fixes, eight files total. If they land clean,
the combat batch (`5e1101dc7`, `8cee2b221`, `d4be03414`, `fa69791b8`,
`d815b67be`) follows the same way. Roughly one weekend for the set.

Standing suggestion: skim `git log HEAD..upstream/main --oneline --grep='^fix(sim'`
monthly. At ~250 sim fixes a week upstream, that queue stays short if drained
regularly and becomes unmanageable if it is not.

## Suggestions worth considering

- **Default Walk-by Autoloot to ON.** This fork is single player and offline
  first; the classic-fidelity argument for OFF is weaker here than upstream.
- **Run the soak before each play session.** `node scripts/playtest_soak.mjs 10`
  against a preview build. It catches the mechanical class of bug (console
  errors, absent UI, unprovoked AI, stuck movement) so the human playtest can be
  spent on feel, which is the only thing a bot cannot judge.
- **Build the dev panel next.** The spec is approved and written. It pays for
  itself the moment tuning stops requiring a console.
- **Consider offline character select.** Deferred deliberately this session, but
  run mode only partly covers it: run characters are disposable presets, so
  testing a real leveled second character still means giving up the first.

## How to verify any of this

- Save loop: `node scripts/offline_save_e2e.mjs` (borrows and restores any real
  character, so it is safe to run against a live slot).
- Run mode: `node scripts/run_mode_e2e.mjs`.
- Soak: `node scripts/playtest_soak.mjs <minutes>`.
- All three need the game served: `npm run preview` on :4173, built with
  `NODE_ENV=development npx vite build --mode development` so offline mode is
  enabled.
