// The run-mode picker on the landing page.
//
// Two decisions and a button: class, dungeon, go. The design target in
// PRIMUS_PHASE_4_5.md is about ten seconds from click to playing, so this is
// deliberately not a character creator: no name, no appearance, no spec, no
// gear, because the whole point of a preset is that none of those are decisions.
//
// It is a SELF-MANAGED overlay. `main.ts` owns an elaborate panel show/hide list
// for the online and offline flows; run mode stays out of it, opening and closing
// `#run-select` itself, so the mode ships without touching that plumbing. The
// caller supplies one callback and nothing else.
//
// DOM only. It knows which dungeons exist (through the sim's pure content
// readers) and what they are called (through `ui/`'s entity i18n, the sanctioned
// game-to-ui edge), and it knows nothing about the `Sim`.

import { runModeDungeonIds } from '../sim/run_preset';
import { ALL_CLASSES, type PlayerClass } from '../sim/types';
import { dungeonDisplayName } from '../ui/entity_i18n';

/** The class the picker opens on. Plate and a big weapon: the least surprising
 *  thing to hand somebody who just wants to see a dungeon. */
export const RUN_DEFAULT_CLASS: PlayerClass = 'warrior';

export interface RunModeLandingHooks {
  /** Commit: the caller enters the world with this class and dungeon. */
  onStart(playerClass: PlayerClass, dungeonId: string): void;
  /** Called just before the picker opens, so the caller can unlock audio on the
   *  gesture that opened it. Optional. */
  onOpen?(): void;
}

export interface RunModeLanding {
  open(): void;
  close(): void;
  /** Detach every listener. Exists so a test (or a future re-render) can tear the
   *  wiring down instead of stacking a second copy of it. */
  dispose(): void;
}

function isPlayerClass(value: string | undefined): value is PlayerClass {
  return !!value && (ALL_CLASSES as readonly string[]).includes(value);
}

function selectOne(row: HTMLElement, chosen: HTMLElement): void {
  for (const chip of row.querySelectorAll<HTMLElement>('.mini-class')) {
    const selected = chip === chosen;
    chip.classList.toggle('sel', selected);
    chip.setAttribute('aria-pressed', selected ? 'true' : 'false');
  }
}

function firstSelected(row: HTMLElement | null): HTMLElement | null {
  return row?.querySelector<HTMLElement>('.mini-class.sel') ?? null;
}

/**
 * Wire the landing page's Keystone Run button and its picker.
 *
 * Every lookup is defensive: `play.html` is online-only and ships none of this
 * markup, and an absent element must skip the wiring rather than throw during
 * boot (a bug class that has shipped from this page before). Returns null when
 * the markup is not present.
 */
export function wireRunModeLanding(hooks: RunModeLandingHooks): RunModeLanding | null {
  const trigger = document.getElementById('btn-run-mode');
  const panel = document.getElementById('run-select');
  const classRow = document.getElementById('run-class-row');
  const dungeonRow = document.getElementById('run-dungeon-row');
  const startBtn = document.getElementById('btn-run-start');
  const backBtn = document.getElementById('btn-run-back');
  if (!trigger || !panel || !classRow || !dungeonRow || !startBtn || !backBtn) return null;

  // The dungeon chips are BUILT from the sim's own table rather than authored in
  // the HTML, so the picker cannot drift out of sync with the dungeons that
  // actually have a door (and therefore a place to hire the party).
  const dungeonIds = runModeDungeonIds();
  dungeonRow.replaceChildren();
  for (const id of dungeonIds) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'mini-class';
    chip.dataset.dungeon = id;
    chip.setAttribute('aria-pressed', 'false');
    // Localized through the entity catalog, the same path every other dungeon
    // name in the client takes.
    chip.textContent = dungeonDisplayName(id);
    dungeonRow.append(chip);
  }

  const defaultClassChip =
    classRow.querySelector<HTMLElement>(`.mini-class[data-class="${RUN_DEFAULT_CLASS}"]`) ??
    classRow.querySelector<HTMLElement>('.mini-class');
  if (defaultClassChip) selectOne(classRow, defaultClassChip);
  const defaultDungeonChip = dungeonRow.querySelector<HTMLElement>('.mini-class');
  if (defaultDungeonChip) selectOne(dungeonRow, defaultDungeonChip);

  const close = (): void => {
    panel.toggleAttribute('hidden', true);
    trigger.focus();
  };
  const open = (): void => {
    hooks.onOpen?.();
    panel.toggleAttribute('hidden', false);
    (firstSelected(classRow) ?? defaultClassChip)?.focus();
  };
  const start = (): void => {
    const cls = firstSelected(classRow)?.dataset.class;
    if (!isPlayerClass(cls)) return;
    const dungeonId = firstSelected(dungeonRow)?.dataset.dungeon;
    if (!dungeonId) return;
    panel.toggleAttribute('hidden', true);
    hooks.onStart(cls, dungeonId);
  };
  const onRowClick = (row: HTMLElement) => (event: Event) => {
    const chip = (event.target as HTMLElement | null)?.closest<HTMLElement>('.mini-class');
    if (chip && row.contains(chip)) selectOne(row, chip);
  };
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !panel.hasAttribute('hidden')) {
      event.preventDefault();
      close();
    }
  };

  const classClick = onRowClick(classRow);
  const dungeonClick = onRowClick(dungeonRow);
  trigger.addEventListener('click', open);
  classRow.addEventListener('click', classClick);
  dungeonRow.addEventListener('click', dungeonClick);
  startBtn.addEventListener('click', start);
  backBtn.addEventListener('click', close);
  panel.addEventListener('keydown', onKeydown);

  return {
    open,
    close,
    dispose: () => {
      trigger.removeEventListener('click', open);
      classRow.removeEventListener('click', classClick);
      dungeonRow.removeEventListener('click', dungeonClick);
      startBtn.removeEventListener('click', start);
      backBtn.removeEventListener('click', close);
      panel.removeEventListener('keydown', onKeydown);
    },
  };
}
