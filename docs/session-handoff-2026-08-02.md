# Session handoff, 2026-08-02

Written so a CLOUD session (claude.ai/code) can pick this up cold. The assistant's
own memory does NOT travel: it lives outside the repo, so anything that matters is
written down here or in `ROADMAP.md`.

Branch: `feature/cast-animations-and-phase1`, pushed to `origin`
(`github.com/Wraith-cmd/primus`, public). `ROADMAP.md` stays the source of truth for
what is next; this file is only the state of THIS session.

## What landed

| Commit | What |
|---|---|
| `9f5693283` | The recovered class-kit completion (mage, priest, shaman, paladin, hunter) |
| `3a5af3217` | Party frames for hired companions |

Both verified before landing: the affected suites, `tests/parity` unshifted, `tsc`
clean. The class-kit work was recovered from an interrupted agent session and had
never been verified; it is now.

## A stray file that was NOT what it looked like

`public/models/sfx-studio-security-53919.glb` was **a symlink to `package.json`**,
not a model, sitting in a directory deployed verbatim to the live site. Untracked,
unreferenced, created during the previous session. Deleted with the owner's
approval. It was the only symlink in the tree outside `node_modules`. If anything
similar reappears under `public/`, treat it as a finding, not a stray download.

## Companion party frames: what the fix actually was

The bug report said companions were "absent from `partyInfo`". True, but one layer
short: `companionParty` was not on `IWorld` AT ALL, and `companionPartyWire` carried
only `{entityId, role, level}` with no health or position, so nothing could paint a
frame even with access.

The shape now:

- `src/world_api/dungeons.ts`: `CompanionPartyInfo` / `CompanionPartyMemberInfo`,
  plus the `companionParty` member. Both worlds implement it; the pins in
  `tests/world_api_parity.test.ts` are updated.
- `src/sim/companions/party.ts`: `companionPartyWire` resolves live unit-frame
  state from the entity and DROPS a member whose entity has left the roster, so a
  stale row never outlives the companion.
- `src/ui/companion_frame_view.ts`: the pure core, mapping companions onto the
  existing `PartyFrameMember` shape so they become real rows with no new painter,
  markup, or CSS. It takes a LIST and a role union wide enough for the delve
  companion's `scout`, so that case folds in without a rewrite.

**There is parallel work in a git worktree** at
`.claude/worktrees/agent-a2f879c459aa2103c` that solves the DELVE companion frame
(singular, `IWorld.companionState`) on an unrelated base branch. It is unverified
and now largely subsumed: the owner chose to build fresh and generalize. Folding
the delve case onto `companionFrameRows` is the remaining piece.

Online mirrors `companionParty` from a `cparty` snapshot field, but **no realm
sends it yet**. Offline (the primary mode for this fork) has the frames; online is
unchanged rather than regressed. Wiring the server side is a separate change.

## Playtest findings, 2026-08-02

Three reported live. Triage matters more than the list:

1. **All companions shared one name.** FIXED in `3a5af3217` (the party wears two mob
   templates, so the role now disambiguates the rows).
2. **Auto-hire on run entry, and a tank owner got a tank.** NOT bugs. This is the
   feature as built, and the reasoning plus the open design question are recorded
   under Decided in `ROADMAP.md`. Do not change it without the owner's answer.
3. **Companions read as attacking everything.** The only real open defect, and NOT
   yet reproduced. See Known broken in `ROADMAP.md` for the cleared suspects and
   the leading hypothesis. Reproduce with a headless Vitest against the real Sim
   before touching behavior.

## Remote playtesting

The owner wants to play from work. Two facts a cloud session cannot discover:

- **Offline mode is disabled in production builds.** `isOfflineModeAvailable`
  (`src/game/offline_mode_gate.ts`) returns `import.meta.env.DEV`, so ANY
  `vite build` output ships with no offline entry point, and Keystone Run rides the
  offline Sim. A static deploy (Cloudflare Pages, Vercel, GitHub Pages) therefore
  does NOT work as-is. The same applies to `npm run build && npm run preview`.
- **The working setup is a Cloudflare quick tunnel** over `npm run dev` (where
  `DEV` is true): `cloudflared tunnel --url http://localhost:5173`. `vite.config.ts`
  carries `server.allowedHosts: ['.trycloudflare.com']` for this; it is dev-server
  only and `vite build` never reads it.

Making a deployed build able to opt into offline mode would need the gate to take a
build-time flag. That puts an unauthenticated mode on a public URL, so it is the
owner's decision and has NOT been made.

## Pre-existing red, do not attribute it to this work

`tests/i18n_completeness.test.ts` fails on 35 `mode.run*` rows: the run-mode feature
(`729d4ffad`, previous session) shipped wordy English keys without their five
non-Latin fills, which the M16 rule requires. It was already red at
`9f5693283~1`. Fixing it is 7 keys times 5 locales.
