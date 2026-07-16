import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mainTs = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8').replace(
  /\r\n/g,
  '\n',
);
const frameStart = mainTs.indexOf('  function frame(now: number): void {');
const frameEnd = mainTs.indexOf('  const controller = {', frameStart);
const frameLoop = mainTs.slice(frameStart, frameEnd);

describe('main-loop frame pacing contract', () => {
  it('gates before elapsed time, input, simulation, and rendering advance', () => {
    expect(frameStart).toBeGreaterThan(-1);
    expect(frameEnd).toBeGreaterThan(frameStart);
    expect(frameLoop).toMatch(
      /const pacing = framePacer\.step\(now\);\s*if \(!pacing\.shouldRun\) return;\s*const frameWorkStartMs = performance\.now\(\);\s*let frameDt = \(now - last\) \/ 1000;\s*last = now;/,
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
        /perf\.time\('hud',[\s\S]*?perf\.tick\(now\);\s*previousFrameWorkMs = performance\.now\(\) - frameWorkStartMs;/g,
      ),
    ).toHaveLength(2);
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
  });
});
