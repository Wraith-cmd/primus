# Dev Panel: a self-updating in-game developer HUD

Status: approved design, not yet implemented.
Date: 2026-08-01.

## Problem

Tuning and testing PRIMUS currently means one of three things: typing `/dev`
chat commands from memory, editing `window.__primusCastKnobs` in the browser
console, or rebuilding. There is no clickable surface, and nothing tells the
owner what is even tunable.

The deeper problem is drift. Any panel built as a hand written list of controls
falls out of date the moment a feature lands without someone remembering to add
its row. The requirement is therefore not "a panel" but "a panel that cannot go
stale": adding a feature must put it on the panel by construction, not by
discipline.

Today the two candidate sources both resist this:

- `src/sim/dev_commands.ts` `handleDevChat` is a chain of regular expression
  matchers, not a table. Nothing can enumerate the commands, so a panel over it
  would have to duplicate the list by hand.
- `src/render/characters/cast_knobs.ts` is a good pattern (a live struct plus
  persistence plus a console facade) but it is a one off. Nothing else can reuse
  it and nothing knows it exists.

## Goals

1. A clickable, in game dev panel covering four surfaces: tuning knobs, dev
   commands, content pickers, and a live state inspector.
2. New knob groups and new dev commands appear on the panel with no edit to the
   panel itself.
3. That guarantee is enforced by a test, so forgetting is impossible rather than
   merely discouraged.
4. Zero cost and zero presence in production builds.

## Non goals (v1)

Deliberately excluded to keep the first version finishable:

- Online or multiplayer support. The panel is offline and dev only.
- Localization. See "English only" below.
- A mobile or touch layout.
- Arbitrary code evaluation. Commands are typed and declared, never `eval`.
- Command history or macros.

## Architecture

A new subsystem directory with an `index.ts` barrel and its own `CLAUDE.md`,
following the repo rule for multi file subsystems.

| File | Role |
|---|---|
| `src/ui/dev_panel/registry.ts` | The `DevRegistry`: registered knob groups plus the resolved command table. Pure data and lookups. |
| `src/ui/dev_panel/dev_panel_view.ts` | The PURE core. Takes the registry plus a live state snapshot, returns a render plan. No DOM, no three.js, no i18n. Node tested, registered in `UI_PURE_CORES`. |
| `src/ui/dev_panel/dev_panel_painter.ts` | The thin painter. Turns a render plan into DOM and reports control edits back. Owns no decisions. |
| `src/ui/dev_panel/dev_panel.ts` | The controller: keybind, open and close, gating, localStorage persistence, dispatching edits. |
| `src/sim/dev_command_registry.ts` | The declarative `DevCommandDef[]` table that replaces the regex chain. |

This is the pure core plus thin consumer split the repo mandates, with
`src/ui/unit_portrait.ts` and `unit_portrait_painter.ts` as the reference pair.
The view core holds every decision worth testing; the painter is deliberately
dumb so that a Vitest never needs a browser.

### Data flow

```
content tables (MOBS, ITEMS, DUNGEONS)  ---+
knob groups (registerKnobGroup)         ---+--> DevRegistry --> dev_panel_view
dev command table (DEV_COMMANDS)        ---+                        |
live world (IWorld, read only)          ------------------------->  |
                                                                    v
                                                             render plan
                                                                    |
                                                                    v
                                                          dev_panel_painter (DOM)
                                                                    |
                                                     edit events    v
                                            knob writes / command dispatch
```

Edits flow one way back out: a slider write mutates the live knob struct (the
renderer already samples it every frame), and a command press dispatches through
the same code path the chat verb uses. The panel never reaches into `Sim`
directly; it goes through `IWorld` and the command table.

## The four surfaces, and how each stays current

### 1. Tuning knobs

Generalize the existing cast knob pattern into a shared registration:

```ts
registerKnobGroup({
  id: 'cast',
  label: 'Spell cast pose',
  defaults: CAST_LAYER_DEFAULTS,
  meta: { torsoTwist: { min: -1, max: 1, step: 0.01 }, ... },
});
```

`cast_knobs.ts` becomes the first CONSUMER of this rather than a special case,
which is the proof the abstraction is real. The panel derives one slider per
numeric field, with range and step from `meta` and a sensible default range when
`meta` omits a field.

Auto update property: registering a group is the only step. The panel enumerates
the registry, so a new group appears with no panel edit.

### 2. Dev commands

`handleDevChat` becomes a thin dispatcher over a declarative table. Each record
carries an id, the verbs it answers to, a typed argument schema, and a handler:

```ts
{
  id: 'level',
  verbs: ['dev level', 'devlevel'],
  args: [{ name: 'level', kind: 'int', min: 1, max: MAX_LEVEL }],
  run: (ctx, pid, [level]) => { ... },
}
```

Chat behavior is preserved exactly: the same strings parse to the same actions.
This is a refactor, not a redesign, and it is the riskiest part of the work
because it touches a path that currently works. It is therefore done test first,
with the existing `tests/dev_commands.test.ts` extended to pin every verb before
the shape changes.

Auto update property: the panel renders a form from the argument schema, so a
new command record yields a new labelled control with no panel edit.

### 3. Content pickers

An argument of kind `contentRef` names a content domain:

```ts
{ name: 'mob', kind: 'contentRef', domain: 'mob' }
```

The panel resolves the option list at render time from the merged sim tables
(`MOBS`, `ITEMS`, `DUNGEONS`). Those tables are already the single source of
truth, so this surface auto updates today with no new machinery: adding a mob
makes it spawnable from the panel on the next build.

### 4. Live state inspector

A read only readout of the running sim: player stats, active auras, cast state,
target, nearby entity counts, and frame timing. It reads `IWorld` only, never a
concrete world, per the seam rule.

Honest limitation, called out because it is the weakest of the four: the
inspector enumerates entity and player meta fields reflectively so that new
fields surface without an edit, but a genuinely NEW subsystem with its own state
shape still needs a row. This surface is "mostly automatic", not "fully
automatic", and the design does not pretend otherwise.

## The enforcement guard

`tests/dev_panel_registry.test.ts` is what upgrades the auto update property
from a convention to a guarantee. It performs two sweeps:

1. **Knob sweep.** Scan source for knob struct modules (a `*_DEFAULTS` object
   paired with a knob key list, the existing `cast_layer_core.ts` shape) and
   fail if any is not registered in the registry.
2. **Command sweep.** Parse the dev chat surface for reachable `/dev` verbs and
   fail if any verb is missing from `DEV_COMMANDS`.

This mirrors guards the repo already relies on: the `UI_PURE_CORES` and
`RENDER_PURE_CORES` completeness sweeps in `tests/architecture.test.ts`, and the
`IWORLD_MEMBERS` pin in `tests/world_api_parity.test.ts`. The cost is a small
amount of friction when adding a knob or command, which is the intended trade.

## Production safety

The panel must be incapable of reaching a production build, and so must anything
it tunes. Four independent layers, plus one existing hole this work closes.

**Layer 1: the code does not ship.** The controller is reached through a dynamic
`import()` behind `import.meta.env.DEV`, so the bundler drops the panel, the
painter, and the view core from production entries entirely. This is stronger
than shipping an inert module: code that is absent cannot be triggered by a
stale script, a console call, or a future refactor that forgets the check.

**Layer 2: the toggle is never wired.** Even in a build that somehow contained
the module, the keybind registration is inside the same DEV branch, mirroring
how `#btn-offline` is left unwired rather than merely hidden in production.

**Layer 3: the sim refuses the commands.** Command execution still routes
through the sim's own `ctx.devCommands` flag, which is false in production and
which run mode sets to false deliberately. The panel cannot become a second,
ungated route into the cheat surface.

**Layer 4: the server is unchanged.** `ALLOW_DEV_COMMANDS` stays off in
production, per the standing root invariant. Nothing here touches the server.

### The existing hole, and the fix

Auditing this turned up a real leak that predates the panel.
`installCastKnobs()` is called at module load with NO dev gate, and `loadStored()`
reads `localStorage` unconditionally. A production build therefore applies any
persisted `primus_cast_knobs` values to live play. Today the blast radius is
small (cosmetic pose offsets, and only for someone who set them), but this design
generalizes exactly that pattern to every knob group, which would turn a minor
leak into a broad one.

The fix, landing in the same work:

- Knob persistence LOAD is gated on `import.meta.env.DEV`. A production build
  always uses the shipped defaults and ignores stored values entirely.
- Knob persistence SAVE is gated the same way, so a production session cannot
  even write a value that a later dev session would silently inherit.
- The shipped defaults stay the single source of truth for what a player sees.
  Tuning is promoted to production by editing the defaults in source through
  `dump()`, never by a value resident in a browser.

A guard test asserts both directions: that the panel module is unreachable from
a production entry, and that knob loading is dev gated.

## English only, no i18n

Every string the panel renders stays English and no `t()` key is added.

This is the explicit repo carve out for dev channel text, the same rule the perf
overlay, `perf_doctor.ts`, and `perf_reporter.ts` already rely on: a
`?perf` gated dev diagnostic is not player facing copy. Applying it here avoids
adding catalog keys across 21 locales and keeps the release tier i18n gate out
of the loop for a tool that never ships to a player.

If the panel ever becomes player visible, that decision reverses and every
string becomes a catalog key in the same change.

## Keybind

Backtick (`Backquote`) toggles the panel, wired as an edge action through
`BIND_ACTIONS` in `src/game/keybinds.ts` so it is rebindable like any other
action. `Escape` is the only reserved code in this codebase, so backtick is
free, and it is the conventional console key.

## Testing

- `dev_panel_view.test.ts`: the pure core. Render plan shape, knob range
  derivation, command form derivation, empty and malformed registry handling.
- `dev_command_registry.test.ts`: every verb parses to the same action it did
  before the refactor. Written BEFORE the refactor lands.
- `dev_panel_registry.test.ts`: the enforcement guard described above.
- `scripts/dev_panel_e2e.mjs`: one browser pass that opens the panel, moves a
  knob slider, and asserts the live struct changed without a reload, then runs a
  command and asserts its effect in the sim. The lesson from the offline save
  outage applies here: a green unit test proves the unit, not the feature.

## Risks

- **The `dev_commands.ts` refactor.** It touches a working chat path. Mitigated
  by pinning every verb with tests first, and by keeping the change a pure
  restructuring with no behavior change.
- **Scope.** Four surfaces plus a registry plus a guard is more than one
  session. The registry and the command table refactor are the first slice and
  deliver no visible UI on their own, which is worth stating up front so the
  first session does not look like it produced nothing.
- **Reflective inspection** can surface noisy internal fields. Mitigated by an
  explicit deny list for known noise rather than an allow list, so new fields
  still default to visible.

## Build order

1. `registerKnobGroup` plus the registry, with `cast_knobs.ts` converted to be
   its first consumer. Proves the abstraction against a real case.
2. The dev command table and the `handleDevChat` dispatcher refactor, test
   first.
3. The enforcement guard.
4. The pure view core.
5. The painter, the controller, and the keybind.
6. The browser end to end pass.
