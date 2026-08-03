# Session handoff, 2026-08-02

Written so a CLOUD session (claude.ai/code) can pick this up cold. The assistant's
own memory does NOT travel: it lives outside the repo, so anything that matters is
written down here or in `ROADMAP.md`.

**Branch: `main`.** `ROADMAP.md` stays the source of truth for what is next; this
file is only the state of THIS session.

## Read this first: the trunk was wrong, and it caused real damage

Until 2026-08-02, `origin/main` was still `23819a304`, a July snapshot of UPSTREAM's
main. None of the PRIMUS work had ever been merged into it, so `main` carried no
`ROADMAP.md` and no handoff. Every fresh session, cloud agent, and PR defaulted to
that branch and landed in a repo where PRIMUS did not exist.

That is not hypothetical: a cloud session did exactly this, spent its run on
upstream-flavored IP-refactor and Frontier docs, and produced work on a base 34
commits behind. It was not malfunctioning; it was shown the wrong repo.

`main` has since been fast-forwarded to the PRIMUS work and both cloud branches are
merged into it. **Branch new work off `main`.** If you find yourself on a base with
no `ROADMAP.md` at the repo root, stop: you are on the wrong branch.

`feature/cast-animations-and-phase1` is fully merged and retired; its name had long
since stopped describing its contents (save fixes, run mode, companions, class kits,
party frames, and NOT cast animations, which are still blocked).

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

**The delve arm is still to fold in.** Parallel work solving the DELVE companion
frame (singular, `IWorld.companionState`) was preserved as commit `336da757a` on the
local branch `worktree-agent-a2f879c459aa2103c` before its worktree was retired. It
is UNVERIFIED and built on the old base: read it as a reference for what the delve
arm needs, do not merge it as-is. `companionFrameRows` already takes a list and a
role union covering the delve `scout`, so folding it in should be small.

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
3. **Companions read as attacking everything.** REPRODUCED AND DIAGNOSED later
   the same day (`a3ad80494`, `tests/companion_run_mode_aggro.test.ts`). Not a
   defect: the assist gate holds, and through a real tick a wandering hostile
   aggros a COMPANION on proximity, the companions retaliate correctly, and the
   owner is dragged into a fight they never started. Cause is WHERE run mode
   hires (`companionsAnywhere` puts the party in the open world). The remaining
   question is a design one and is in `ROADMAP.md`.

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

## The pre-existing red (now fixed)

FIXED the same day (`a155200f8`): the 7 `mode.run*` keys were filled across the
five non-Latin locales and `tests/i18n_completeness.test.ts` is green. Left here
as the record of why an always-on gate must not be allowed to sit red: while it
was, it could not catch a NEW leak, which is exactly how the Flurry one hid.

## End-of-session state, 2026-08-02

The build is GREEN: `npm run gate` passes all 11 steps (19,733 unit + 65 browser
tests, plus 22 DB integration tests once `npm run db:up` is running, which the
gate now loads `TEST_DATABASE_URL` for). Everything is committed and pushed to
`main`.

**Verified by robot playtest, not just by unit test:** `scripts/playtest_soak.mjs`
against the dev server reports 4 companions and 4 party frames with zero
findings, so the companion-frames fix works in a real DOM, and companions do not
pull unprovoked.

**Seven reviewers audited the day's diff at the end of the session.** Their real
findings are all either fixed or recorded in `ROADMAP.md` "Known broken". Three
are worth knowing before you touch anything:

1. The dev Command Center bricks on non-English production builds (from the
   merged cloud commit). Highest severity open item.
2. The Eastbrook polish evidence was RE-STAMPED, not re-captured. A real
   re-capture is owed.
3. `ClientWorld.companionParty` is dead wire; online `/hire` gets no frames.

**Tooling installed this session** (none of it in the repo, so a fresh machine
needs it again): Docker + Postgres on :5433, Blender, Playwright chromium,
coreutils (`gtimeout`), cloudflared. `.env` is gitignored and holds only local
dev values; recreate it from `.env.example` if absent, and the gate will tell you
which mode it is in.
