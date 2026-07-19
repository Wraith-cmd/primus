import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mainTs = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8').replace(
  /\r\n/g,
  '\n',
);
const rendererTs = readFileSync(
  new URL('../src/render/renderer.ts', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');
const frameStart = mainTs.indexOf('  function frame(now: number): void {');
const frameEnd = mainTs.indexOf('  const controller = {', frameStart);
const frameLoop = mainTs.slice(frameStart, frameEnd);

describe('main-loop frame pacing contract', () => {
  it('gates before elapsed time, input, simulation, and rendering advance', () => {
    expect(frameStart).toBeGreaterThan(-1);
    expect(frameEnd).toBeGreaterThan(frameStart);
    expect(frameLoop).toMatch(
      /const pacing = framePacer\.step\(now, previousFrameWorkMs\);\s*if \(!pacing\.shouldRun\) return;\s*const frameWorkStartMs = performance\.now\(\);\s*let frameDt = \(now - last\) \/ 1000;\s*last = now;/,
    );
    expect(frameLoop.indexOf('if (!pacing.shouldRun) return;')).toBeLessThan(
      frameLoop.indexOf("perf.trace('input.updateTouchLook'"),
    );
    expect(frameLoop.indexOf('if (!pacing.shouldRun) return;')).toBeLessThan(
      frameLoop.indexOf('offlineSim.tick()'),
    );
  });

  it('forwards pacing and previous full-frame work through both render paths', () => {
    expect(frameLoop.match(/pacing\.intentionallyPaced,\s*previousFrameWorkMs,/g)).toHaveLength(2);
    expect(
      frameLoop.match(
        /perf\.time\('hud',[\s\S]*?perf\.tick\(now\);\s*previousFrameWorkMs = performance\.now\(\) - frameWorkStartMs;\s*loadingHandoff\.markFirstRenderedFrame\(\);/g,
      ),
    ).toHaveLength(2);
  });

  it('forwards pacing and full-frame work through Renderer into the governor', () => {
    const syncStart = rendererTs.indexOf('  sync(\n');
    const syncEnd = rendererTs.indexOf('    this.viewportPollTimer += dt;', syncStart);
    const syncBlock = rendererTs.slice(syncStart, syncEnd);
    const adaptiveStart = rendererTs.indexOf('  private updateAdaptiveResolution(');
    const adaptiveEnd = rendererTs.indexOf('  private runtimeViewCreateBudget(', adaptiveStart);
    const adaptiveBlock = rendererTs.slice(adaptiveStart, adaptiveEnd);

    expect(syncStart).toBeGreaterThan(-1);
    expect(syncEnd).toBeGreaterThan(syncStart);
    expect(adaptiveStart).toBeGreaterThan(-1);
    expect(adaptiveEnd).toBeGreaterThan(adaptiveStart);
    expect(syncBlock).toContain(
      'this.updateAdaptiveResolution(dt, intentionalFramePacing, previousFrameWorkMs);',
    );
    expect(adaptiveBlock).toMatch(
      /this\.renderBudgetGovernor\.update\(\{[\s\S]*?intentionalFramePacing,[\s\S]*?workMs: previousFrameWorkMs > 0 \? previousFrameWorkMs : previousTotalMs,/,
    );
  });

  it('collects trusted mobile panel samples under the loading screen', () => {
    const calibrationStart = mainTs.indexOf(
      "if (document.body.classList.contains('mobile-touch')) {",
      mainTs.indexOf('await renderer.prewarmInitialScene()'),
    );
    const loopStart = mainTs.indexOf('requestAnimationFrame(frame);', calibrationStart);
    const calibrationBlock = mainTs.slice(calibrationStart, loopStart);

    expect(calibrationStart).toBeGreaterThan(-1);
    expect(loopStart).toBeGreaterThan(calibrationStart);
    expect(calibrationBlock).toContain('FRAME_PACER_CALIBRATION_CALLBACKS');
    expect(calibrationBlock).toContain('framePacer.observe(timestamp);');
    expect(calibrationBlock).toMatch(
      /for \(let i = 0; i < FRAME_PACER_CALIBRATION_CALLBACKS; i\+\+\) \{[\s\S]*?await new Promise<void>[\s\S]*?framePacer\.observe\(timestamp\);[\s\S]*?if \(framePacer\.snapshot\(\)\.estimatedRefreshFps > 0\) break;/,
    );
  });

  it('wires completed gameplay frames through the tested loading handoff', () => {
    const launchStart = mainTs.indexOf('  last = performance.now();', frameEnd);
    const launchEnd = mainTs.indexOf('  fadeOutHomepageMusic();', launchStart);
    const launchBlock = mainTs.slice(launchStart, launchEnd);

    expect(launchStart).toBeGreaterThan(frameEnd);
    expect(launchEnd).toBeGreaterThan(launchStart);
    expect(frameLoop.match(/loadingHandoff\.markFirstRenderedFrame\(\);/g)).toHaveLength(2);
    expect(launchBlock).toMatch(
      /requestAnimationFrame\(frame\);\s*\/\/ Cut to the game only after an accepted frame has completed and reached paint\.\s*loadingHandoff\.start\(\(\) => \{\s*hideLoadingScreen\(\);/,
    );
  });
});
