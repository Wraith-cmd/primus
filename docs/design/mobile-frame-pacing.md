# Mobile Frame Pacing

The game client enforces a mobile frame-rate ceiling through `FramePacer` in
`src/game/frame_pacer.ts`. `src/main.ts` is a thin consumer: it schedules every browser
animation callback, asks the pacer whether the game frame should run, and returns before
input, simulation, rendering, and HUD work on paced-out callbacks.

## Policy

The automatic policy applies only in the Capacitor native runtime (`NATIVE_APP`). Interface
Mode controls input and layout, not hardware policy, so choosing Touch on a desktop or
2-in-1 display does not enable pacing. The Electron desktop shell is also excluded. The
ceiling is the fixed `MOBILE_FRAME_RATE_CEILING_FPS` policy in `frame_pacer.ts`. It is
deliberately independent of graphics-tier budgets so a future low-tier render target cannot
quietly reduce gameplay responsiveness. A sweep from 30 Hz through 480 Hz pins every paced
target above the 30 fps fairness floor.

The pacer estimates the browser animation-callback rate, then selects the highest whole
panel divisor that does not exceed the configured ceiling. Fresh pacing engages at 1.45
times the ceiling, clear of normal 90 Hz calibration noise while leaving 72 Hz to 75 Hz
panels untouched. Once engaged, it remains active down to 1.40 times the ceiling. This
hysteresis prevents adaptive-refresh noise from repeatedly crossing a 2x divisor boundary.
Important outcomes are:

| Browser callback rate | Game target |
| --- | --- |
| 30 Hz | 30 fps, no additional decimation |
| 60 Hz | 60 fps |
| 72 Hz | 72 fps, no additional decimation |
| 75 Hz | 75 fps, no additional decimation |
| 89.9 Hz | 44.95 fps |
| 90 Hz | 45 fps |
| 120 Hz | 60 fps |
| 144 Hz | 48 fps |
| 165 Hz | 55 fps |
| 240 Hz | 60 fps |

This avoids both halving mid-refresh panels and the uneven callback pattern produced by
attempting 60 fps on a 90 Hz source.
The decision core carries sub-frame timing remainder so callback jitter does not produce
long-term cadence drift. A suspended-tab-sized gap clears timing remainder, preserves
the trusted panel rate, and renders the first resumed callback immediately. Later resumed
callbacks keep using the trusted cadence while fresh samples revalidate the panel, avoiding
an eight-frame full-rate burst after an ordinary hitch or garbage-collection pause.

Before the game loop starts in the native runtime, the loading screen stays up for a short
run of lightweight animation callbacks. That trusted sample prevents expensive startup frames
from making a 90 Hz or 144 Hz panel look like a slower display after missed vsyncs. The
trusted rate is retained across native page suspension. A
sustained callback rate that is incompatible with the active panel divisor triggers a
short lightweight resample. Probe callbacks are interleaved with game frames so an
adaptive-refresh transition cannot freeze the whole loop while moving up or down.
If a clean probe shows that slow callbacks came from missed panel refreshes, the pacer
keeps the trusted panel rate. If the browser later applies a real cap at that same
callback rate, a sustained run of completed frames with measured work below the trusted
panel interval promotes the cap as the new source rate. Interrupted or expensive samples
reset that evidence so workload pressure cannot be mistaken for a panel change.
The loading handoff waits for a completed gameplay frame and one following paint callback.
Its five-second watchdog is armed before native refresh calibration begins. The normal path
keeps the paint boundary. If animation callbacks stop, the first watchdog hides the loading
overlay, then arms a second bounded watchdog. A completed frame can still win during that
grace period; otherwise the second watchdog completes startup exactly once so input, telemetry,
icon prewarming, the camera prompt, and the debug game handle cannot remain uninitialized.

The frame-loop gate runs before `last` is advanced. Skipped callbacks therefore do not
sample input or advance the fixed-step accumulator. The next executed frame receives the
complete elapsed delta, and the existing 20 Hz simulation accumulator remains the sole
owner of simulation catch-up.

## Render budget contract

`Renderer.sync()` receives the pacing fields through a typed `framePacing` options member,
instead of positional booleans and numeric fillers, and passes `intentionallyPaced` to
`RenderBudgetGovernor`. The governor preserves callback cadence for external-cap
diagnostics, but uses the previously completed game frame's measured main-thread work
as frame pressure while pacing is intentional. The pacer's target also scales drop,
urgent, and recovery thresholds from the 60 fps baseline to the executed-frame budget.
This includes input, simulation, rendering, and HUD work, so pacing cannot conceal a
genuine overrun or leave quality stuck below what the paced cadence can sustain.

This distinction prevents both known failure modes:

- An intentional 30 fps cadence is not classified as an external frame cap.
- An intentional 40 fps cadence is not classified as GPU slowness.

Real render, submit, draw, grass, and stall pressure still degrade quality normally. An
unpaced browser or operating-system cap can still be recognized through the existing
external-cap path.

## Verification

`tests/frame_pacer.test.ts` pins divisor selection and exact callback spacing from noisy
90 Hz through 360 Hz, the 30 fps policy floor through 480 Hz, engagement hysteresis,
low-power 30 fps behavior, remainder carry under jitter, static enabled and disabled modes,
suspend/resume pacing and recalibration, and the ambiguous boundary between missed panel
refreshes and a real browser callback cap.

`tests/loading_handoff.test.ts` executes the loading handoff with injected animation and
watchdog schedulers, including a gameplay-frame throw and animation callbacks that never
resume.

`tests/render_budget_pacing.test.ts` pins the governor handoff at intentional 30 fps,
40 fps, and 45 fps, including recovery under 18 ms of sustained work, while verifying that
expensive renderer or non-render main-thread work still triggers degradation.

This policy currently covers the main game loop only. Preview render loops, native
thermal signals, background quiescing, and proactive quality shedding are separate
follow-up work under the mobile thermal program.
