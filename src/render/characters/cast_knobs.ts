// The LIVE knob object for the procedural spell-cast pose layer: the impure
// half of cast_layer_core.ts (this file owns window + localStorage, so it is
// deliberately NOT a registered pure core and must never be renamed to *_core).
//
// The whole point is the feedback loop. The renderer reads `castLayerKnobs()`
// every frame, so anything typed into the browser console lands on the very
// next frame: no rebuild, no reload.
//
//   __primusCastKnobs.torsoLean = 0.6   // applies immediately, persists
//   __primusCastKnobs.dump()            // print the current set as code
//   __primusCastKnobs.reset()           // back to the shipped defaults
//
// Everything here is guarded on `typeof window === 'undefined'`, so the sim,
// the headless env, and Vitest's plain-Node environment pay nothing and see no
// side effects. localStorage reads/writes are try/catch'd (private mode,
// corrupt JSON, quota) and fall back to the defaults.
import { CAST_KNOB_KEYS, CAST_LAYER_DEFAULTS, type CastLayerKnobs } from './cast_layer_core';

const STORAGE_KEY = 'primus_cast_knobs';
const GLOBAL_NAME = '__primusCastKnobs';

/** The one live struct the renderer samples. A PLAIN data object on purpose:
 *  per-frame reads stay property loads, and the console-facing facade below is
 *  what carries the accessors. */
const live: CastLayerKnobs = { ...CAST_LAYER_DEFAULTS };

/** The live, mutable knobs. Read this every frame; never cache the values. */
export function castLayerKnobs(): CastLayerKnobs {
  return live;
}

/** Overwrite the live knobs from a partial payload, ignoring junk keys and
 *  non-finite values. Shared by the localStorage load and the facade setters. */
function applyPartial(source: Record<string, unknown>): void {
  for (const key of CAST_KNOB_KEYS) {
    const v = source[key];
    if (typeof v === 'number' && Number.isFinite(v)) live[key] = v;
  }
}

function loadStored(): void {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') applyPartial(parsed as Record<string, unknown>);
  } catch {
    // private mode, corrupt payload, or no storage at all: keep the defaults
  }
}

function save(): void {
  try {
    const payload: Record<string, number> = {};
    for (const key of CAST_KNOB_KEYS) payload[key] = live[key];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // storage is a nicety here; a failed write must never break a frame
  }
}

function clearStored(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // same as save(): best effort
  }
}

/** Round for display so a dumped block is readable, without lying about the
 *  value (4 decimals is finer than any angle the eye resolves here). */
function display(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}

/** The copy-pasteable code block `dump()` prints: paste it over the defaults
 *  block in cast_layer_core.ts to promote a tuning session to the new ship set. */
export function dumpText(k: CastLayerKnobs): string {
  const lines = CAST_KNOB_KEYS.map((key) => `  ${key}: ${display(k[key])},`);
  return `// __primusCastKnobs, ${new Date().toISOString()}\nconst CAST_LAYER_TUNED = {\n${lines.join('\n')}\n};`;
}

/** The console-facing object: live accessors over `live`, plus reset/dump. */
type CastKnobsFacade = CastLayerKnobs & {
  reset: () => void;
  dump: () => string;
};

declare global {
  interface Window {
    __primusCastKnobs?: CastKnobsFacade;
  }
}

/**
 * Publish `window.__primusCastKnobs` and restore any persisted tuning. Safe to
 * call repeatedly and a no-op wherever `window` is absent. Called once at
 * module load below, so simply importing this module from the renderer arms
 * the whole loop. Idempotence keys off the published global rather than a
 * module flag, so a dev-server hot reload re-publishes onto the fresh window.
 */
export function installCastKnobs(): void {
  if (typeof window === 'undefined' || window.__primusCastKnobs) return;
  loadStored();

  const facade = {
    reset(): void {
      Object.assign(live, CAST_LAYER_DEFAULTS);
      clearStored();
      console.info('[cast knobs] reset to defaults');
    },
    dump(): string {
      const text = dumpText(live);
      console.info(text);
      return text;
    },
  } as CastKnobsFacade;

  for (const key of CAST_KNOB_KEYS) {
    Object.defineProperty(facade, key, {
      enumerable: true,
      configurable: true,
      get: () => live[key],
      set: (v: unknown) => {
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          console.warn(`[cast knobs] ${key} needs a finite number, got ${String(v)}`);
          return;
        }
        live[key] = v;
        save();
      },
    });
  }

  window.__primusCastKnobs = facade;
  console.info(
    `[cast knobs] window.${GLOBAL_NAME} is live: set a field (e.g. ${GLOBAL_NAME}.armMain = -0.9) to see it next frame, .dump() to print, .reset() to restore.`,
  );
}

installCastKnobs();
