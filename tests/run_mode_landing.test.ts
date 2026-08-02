// @vitest-environment jsdom
//
// The picker is wired against the REAL index.html markup, read off disk, so a
// renamed id or a dropped chip row fails here rather than at boot on the landing
// page.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RUN_DEFAULT_CLASS, wireRunModeLanding } from '../src/game/run_mode_landing';
import { runModeDungeonIds } from '../src/sim/run_preset';
import type { PlayerClass } from '../src/sim/types';

const INDEX_HTML = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

// Lift just the two fragments run mode owns out of the shipped page. Parsing the
// whole document under jsdom would drag in the module script and every asset;
// these two nodes are the entire contract.
function mountRunModeMarkup(): void {
  const doc = new DOMParser().parseFromString(INDEX_HTML, 'text/html');
  const trigger = doc.getElementById('btn-run-mode');
  const panel = doc.getElementById('run-select');
  if (!trigger || !panel) throw new Error('index.html is missing the run mode markup');
  document.body.replaceChildren(
    document.importNode(trigger, true),
    document.importNode(panel, true),
  );
}

describe('run mode landing picker', () => {
  beforeEach(() => {
    mountRunModeMarkup();
  });

  it('opens closed, and opens on the CTA', () => {
    const started = vi.fn();
    const landing = wireRunModeLanding({ onStart: started });
    expect(landing).not.toBeNull();
    const panel = document.getElementById('run-select');
    expect(panel?.hasAttribute('hidden')).toBe(true);
    document.getElementById('btn-run-mode')?.dispatchEvent(new Event('click'));
    expect(panel?.hasAttribute('hidden')).toBe(false);
    expect(started).not.toHaveBeenCalled();
    landing?.dispose();
  });

  it('builds a dungeon chip for every dungeon run mode offers', () => {
    const landing = wireRunModeLanding({ onStart: vi.fn() });
    const chips = [...document.querySelectorAll<HTMLElement>('#run-dungeon-row .mini-class')];
    expect(chips.map((c) => c.dataset.dungeon)).toEqual(runModeDungeonIds());
    for (const chip of chips) expect(chip.textContent?.trim()).not.toBe('');
    landing?.dispose();
  });

  it('starts with the default class and the first dungeon already chosen', () => {
    const started = vi.fn();
    const landing = wireRunModeLanding({ onStart: started });
    document.getElementById('btn-run-mode')?.dispatchEvent(new Event('click'));
    document.getElementById('btn-run-start')?.dispatchEvent(new Event('click'));
    expect(started).toHaveBeenCalledWith(RUN_DEFAULT_CLASS, runModeDungeonIds()[0]);
    // Committing closes the picker; the caller owns the loading screen from here.
    expect(document.getElementById('run-select')?.hasAttribute('hidden')).toBe(true);
    landing?.dispose();
  });

  it('commits the class and dungeon the player actually picked', () => {
    const started = vi.fn();
    const landing = wireRunModeLanding({ onStart: started });
    const wanted: PlayerClass = 'druid';
    const dungeonId = runModeDungeonIds()[runModeDungeonIds().length - 1];
    const classChip = document.querySelector<HTMLElement>(
      `#run-class-row .mini-class[data-class="${wanted}"]`,
    );
    const dungeonChip = document.querySelector<HTMLElement>(
      `#run-dungeon-row .mini-class[data-dungeon="${dungeonId}"]`,
    );
    classChip?.dispatchEvent(new Event('click', { bubbles: true }));
    dungeonChip?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(classChip?.getAttribute('aria-pressed')).toBe('true');
    // Exactly one chip per row stays selected.
    expect(document.querySelectorAll('#run-class-row .mini-class.sel')).toHaveLength(1);
    expect(document.querySelectorAll('#run-dungeon-row .mini-class.sel')).toHaveLength(1);
    document.getElementById('btn-run-start')?.dispatchEvent(new Event('click'));
    expect(started).toHaveBeenCalledWith(wanted, dungeonId);
    landing?.dispose();
  });

  it('closes on Back and on Escape without starting anything', () => {
    const started = vi.fn();
    const landing = wireRunModeLanding({ onStart: started });
    const panel = document.getElementById('run-select');
    document.getElementById('btn-run-mode')?.dispatchEvent(new Event('click'));
    document.getElementById('btn-run-back')?.dispatchEvent(new Event('click'));
    expect(panel?.hasAttribute('hidden')).toBe(true);

    landing?.open();
    panel?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(panel?.hasAttribute('hidden')).toBe(true);
    expect(started).not.toHaveBeenCalled();
    landing?.dispose();
  });

  it('skips wiring entirely when the markup is absent (play.html)', () => {
    document.body.replaceChildren();
    expect(wireRunModeLanding({ onStart: vi.fn() })).toBeNull();
  });

  it('stops responding after dispose', () => {
    const started = vi.fn();
    const landing = wireRunModeLanding({ onStart: started });
    landing?.dispose();
    document.getElementById('btn-run-start')?.dispatchEvent(new Event('click'));
    expect(started).not.toHaveBeenCalled();
  });
});
