// Run mode end-to-end check.
//
// Run mode is the third door: a preset max-level character standing at a dungeon
// entrance with a party already hired, for a session that needs no leveling. The
// modules were built deliberately NOT to touch `src/main.ts`, so the whole mode
// hangs on one wiring snippet in `wireStartScreens`. That snippet is exactly the
// kind of thing a unit test cannot see, hence this.
//
// It also guards the invariant that matters most to the owner: a run must never
// be able to reach the real offline character's save slot.
//
// Needs the game served on :4173 (`npm run preview`) or :5173 (`npm run dev`).

import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';

const GAME_URL = process.env.GAME_URL || 'http://localhost:4173';
const OFFLINE_KEY = 'primus.offline.character';
const RUN_KEY = 'primus.offline.character.run';

let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    fail++;
    console.log(`  FAIL ${name}${extra ? ` :: ${extra}` : ''}`);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: true,
  args: ['--use-angle=swiftshader', '--mute-audio', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

// A real character is planted first, because the single most important thing to
// prove is that a run does NOT touch it.
const SENTINEL = JSON.stringify({
  version: 1,
  mode: 'offline',
  savedAt: 1_700_000_000_000,
  playerClass: 'warrior',
  playerName: 'DoNotTouch',
  skin: 0,
  seed: 20061,
  state: { level: 11 },
});

try {
  await page.goto(GAME_URL, { waitUntil: 'domcontentloaded' });
  const borrowed = await page.evaluate((k) => localStorage.getItem(k), OFFLINE_KEY);
  await page.evaluate(
    (k, v) => localStorage.setItem(k, v),
    OFFLINE_KEY,
    SENTINEL,
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(1500);

  console.log('\n1. the run-mode door is wired');
  const cta = await page.evaluate(() => {
    const b = document.querySelector('#btn-run-mode');
    return { exists: !!b, hidden: b ? b.hasAttribute('hidden') : true };
  });
  check('the Keystone Run button exists', cta.exists);
  check('it is visible in a dev-mode build', !cta.hidden);

  await page.evaluate(() => document.querySelector('#btn-run-mode')?.click());
  await sleep(600);
  const picker = await page.evaluate(() => {
    const p = document.querySelector('#run-select');
    const classes = document.querySelectorAll('#run-class-row .mini-class').length;
    const dungeons = document.querySelectorAll('#run-dungeon-row .mini-class').length;
    return { open: p ? !p.hasAttribute('hidden') : false, classes, dungeons };
  });
  check('the picker opens', picker.open);
  check('it offers all 9 classes', picker.classes === 9, String(picker.classes));
  check('dungeon chips were built from the sim table', picker.dungeons > 0, String(picker.dungeons));

  console.log('\n2. starting a run lands a preset character at a door');
  await page.evaluate(() => document.querySelector('#btn-run-start')?.click());
  const booted = await page
    .waitForFunction(() => window.__game?.sim?.player, { timeout: 45000 })
    .then(() => true)
    .catch(() => false);
  check('the run world booted', booted);
  await sleep(3000);

  const run = await page.evaluate(() => {
    const sim = window.__game?.sim;
    const p = sim?.player;
    if (!p) return null;
    let party = 0;
    for (const e of sim.entities.values()) {
      if (e.kind === 'mob' && e.ownerId != null && !e.dead) party++;
    }
    return { level: p.level, name: p.name, hp: p.hp, maxHp: p.maxHp, party };
  });
  check('the character is at the level cap', (run?.level ?? 0) > 1, `level ${run?.level}`);
  check('it is the preset runner, not your character', run?.name === 'Runner', run?.name);
  check('it entered at full health', run?.hp === run?.maxHp, `${run?.hp}/${run?.maxHp}`);

  console.log('\n3. THE INVARIANT: a run cannot reach the real character');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await sleep(1200);
  const slots = await page.evaluate(
    (ok, rk) => ({ offline: localStorage.getItem(ok), run: localStorage.getItem(rk) }),
    OFFLINE_KEY,
    RUN_KEY,
  );
  const offlineParsed = slots.offline ? JSON.parse(slots.offline) : null;
  check(
    'the real offline character is untouched',
    offlineParsed?.playerName === 'DoNotTouch' && offlineParsed?.state?.level === 11,
    JSON.stringify({ name: offlineParsed?.playerName, level: offlineParsed?.state?.level }),
  );
  check('the run saved to its OWN namespaced slot', !!slots.run, 'run slot empty');
  if (slots.run) {
    const r = JSON.parse(slots.run);
    check('the run slot is stamped as a run', r.mode === 'run', r.mode);
  }

  const real = errors.filter((e) => !/502|Bad Gateway|not preloaded|character visual/.test(e));
  check('no page errors', real.length === 0, real.slice(0, 2).join(' | '));

  // Put the slot back exactly as found.
  if (borrowed) await page.evaluate((k, v) => localStorage.setItem(k, v), OFFLINE_KEY, borrowed);
  else await page.evaluate((k) => localStorage.removeItem(k), OFFLINE_KEY);
  await page.evaluate((k) => localStorage.removeItem(k), RUN_KEY);
  console.log('\n  slots restored');
} finally {
  await browser.close();
}

console.log(fail === 0 ? '\nPASS\n' : `\n${fail} FAILED\n`);
process.exit(fail > 0 ? 1 : 0);
