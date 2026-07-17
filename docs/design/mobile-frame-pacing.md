# Mobile Frame Pacing

The game client enforces a mobile frame-rate ceiling through `FramePacer` in
`src/game/frame_pacer.ts`. `src/main.ts` is a thin consumer: it schedules every browser
animation callback, asks the pacer whether the game frame should run, and returns before
input, simulation, rendering, and HUD work on paced-out callbacks.

## Policy

The automatic policy applies while the client has the `mobile-touch` body class. A live
Interface Mode change resets pacing remainder, so switching to Desktop resumes every
animation callback and switching back to Touch reuses the trusted mobile cadence. The
ceiling comes from `GFX.budget.targetFps`, so graphics budgets remain the single source
of the configured maximum.

The pacer estimates the browser animation-callback rate, then selects the highest whole
panel divisor that does not exceed the configured ceiling. Important outcomes are:

| Browser callback rate | Game target |
| --- | --- |
| 30 Hz | 30 fps, no additional decimation |
| 60 Hz | 60 fps |
| 90 Hz | 45 fps |
| 120 Hz | 60 fps |
| 144 Hz | 48 fps |
| 165 Hz | 55 fps |
| 240 Hz | 60 fps |

This avoids the uneven callback pattern produced by attempting 60 fps on a 90 Hz source.
The decision core carries sub-frame timing remainder so callback jitter does not produce
long-term cadence drift. A suspended-tab-sized gap clears timing remainder, preserves
the trusted panel rate, and renders the first resumed callback immediately.

Before the game loop starts on mobile, the loading screen stays up for a short run of
lightweight animation callbacks. That trusted sample prevents expensive startup frames
from making a 90 Hz or 144 Hz panel look like a slower display after missed vsyncs. The
trusted rate is retained across Interface Mode changes and browser suspension. A
sustained callback rate that is incompatible with the active panel divisor triggers a
short lightweight resample. Probe callbacks are interleaved with game frames so an
adaptive-refresh transition cannot freeze the whole loop while moving up or down.
If a clean probe shows that slow callbacks came from missed panel refreshes, the pacer
keeps the trusted panel rate. If the browser later applies a real cap at that same
callback rate, a sustained run of completed frames with measured work below the trusted
panel interval promotes the cap as the new source rate. Interrupted or expensive samples
reset that evidence so workload pressure cannot be mistaken for a panel change.

The frame-loop gate runs before `last` is advanced. Skipped callbacks therefore do not
sample input or advance the fixed-step accumulator. The next executed frame receives the
complete elapsed delta, and the existing 20 Hz simulation accumulator remains the sole
owner of simulation catch-up.

## Render budget contract

`Renderer.sync()` passes the pacer's `intentionallyPaced` signal to
`RenderBudgetGovernor`. The governor preserves callback cadence for external-cap
diagnostics, but uses the previously completed game frame's measured main-thread work
as frame pressure while pacing is intentional. This includes input, simulation,
rendering, and HUD work, so pacing cannot conceal a genuine non-render overrun.

This distinction prevents both known failure modes:

- An intentional 30 fps cadence is not classified as an external frame cap.
- An intentional 40 fps cadence is not classified as GPU slowness.

Real render, submit, draw, grass, and stall pressure still degrade quality normally. An
unpaced browser or operating-system cap can still be recognized through the existing
external-cap path.

## Verification

`tests/frame_pacer.test.ts` pins divisor selection and exact callback spacing from 90 Hz
through 360 Hz, low-power 30 fps behavior, remainder carry under jitter, live
interface-mode changes, disabled desktop behavior, suspend/resume recalibration, and the
ambiguous boundary between missed panel refreshes and a real browser callback cap.

`tests/render_budget_pacing.test.ts` pins the governor handoff at intentional 30 fps and
40 fps and verifies that expensive renderer or non-render main-thread work still
triggers degradation.

This policy currently covers the main game loop only. Preview render loops, native
thermal signals, background quiescing, and proactive quality shedding are separate
follow-up work under the mobile thermal program.
