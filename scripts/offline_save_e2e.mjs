// Offline save/resume end-to-end check.
//
// This exists because the unit suites were green for the entire time offline
// persistence was broken in real play. `tests/offline_save.test.ts` proved the
// storage envelope round-trips, which was never the failing part: what broke was
// the ENTRY SCREEN policy on top of it (an exact, case-sensitive name compare,
// plus an autosave that would overwrite a character it had never loaded). A
// fixture injected under the exact stored identity can never catch either one.
//
// So this drives the real loop in a real browser: play, save, reload, resume,
// and then try to start a different character on top of the save.
//
// Needs `npm run dev` on :5173 (override with GAME_URL=).

import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { dismissEntryOverlays, enterOfflineGame } from './enter_offline_game.mjs';

const GAME_URL = process.env.GAME_URL || 'http://localhost:5173';
const SAVE_KEY = 'primus.offline.character';
const SAVED_LEVEL = 11;

let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${extra ? ` :: ${extra}` : ''}`);
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const readSave = (page) =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return { corrupt: true };
    }
  }, SAVE_KEY);

// The deliberate "save right now" gesture: two Escapes inside the double-tap
// window. Beats waiting out the 30 second autosave heartbeat.
async function saveNow(page) {
  await page.keyboard.press('Escape');
  await sleep(120);
  await page.keyboard.press('Escape');
  await sleep(400);
}

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: true,
  args: ['--use-angle=swiftshader', '--mute-audio', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push(m.text());
});

// This harness runs against the same origin a human plays on, and it needs an
// empty slot to start from. Wiping it outright would delete a real character,
// which is precisely the bug this file exists to prevent, so the slot is taken
// hostage rather than destroyed: snapshotted here and put back in the `finally`
// no matter how the run ends.
let borrowedSave = null;

try {
  // ---------------------------------------------------------------------
  console.log('\n1. fresh character saves');
  await page.goto(GAME_URL, { waitUntil: 'domcontentloaded' });
  borrowedSave = await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
  if (borrowedSave) console.log('  (existing character set aside, restored at exit)');
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  let booted = await enterOfflineGame(page, { charClass: 'warrior', charName: 'Roland' });
  check('world booted for a fresh character', booted);

  await page.evaluate((lv) => {
    const sim = window.__game.sim;
    sim.setPlayerLevel(lv);
  }, SAVED_LEVEL);
  await saveNow(page);

  let save = await readSave(page);
  check('a save was written', !!save && !save.corrupt, JSON.stringify(save));
  check('save holds the right character', save?.playerName === 'Roland', save?.playerName);
  check(`save holds level ${SAVED_LEVEL}`, save?.state?.level === SAVED_LEVEL, save?.state?.level);

  // ---------------------------------------------------------------------
  // THE REPORTED BUG. The entry screen opens with whatever the player types,
  // and an exact compare meant "roland" was a DIFFERENT character: it rolled a
  // fresh level 1 and the next autosave ate the level 11 one. From the player
  // side that reads as "no character has saved at all".
  console.log('\n2. reload and resume through a case slip');
  await page.goto(GAME_URL, { waitUntil: 'domcontentloaded' });
  booted = await enterOfflineGame(page, { charClass: 'warrior', charName: 'roland' });
  check('world booted on resume', booted);

  const resumed = await page.evaluate(() => {
    const p = window.__game?.sim?.player;
    return p ? { level: p.level, name: p.name } : null;
  });
  check(
    `resumed at level ${SAVED_LEVEL}, not a fresh level 1`,
    resumed?.level === SAVED_LEVEL,
    `got level ${resumed?.level}`,
  );
  check(
    'resume adopted the saved spelling of the name',
    resumed?.name === 'Roland',
    `got ${resumed?.name}`,
  );

  await saveNow(page);
  save = await readSave(page);
  check(
    'saving after a resume keeps the character intact',
    save?.playerName === 'Roland' && save?.state?.level === SAVED_LEVEL,
    JSON.stringify({ name: save?.playerName, level: save?.state?.level }),
  );

  // ---------------------------------------------------------------------
  // The destructive half: starting someone else must ASK, not silently evict.
  console.log('\n3. a different character cannot silently evict the save');
  await page.goto(GAME_URL, { waitUntil: 'domcontentloaded' });
  await enterOfflineGame(page, {
    charClass: 'mage',
    charName: 'Nyla',
    gameBootTimeoutMs: 6000,
    settleMs: 0,
  });

  const warned = await page.evaluate(() => {
    const err = document.querySelector('#offline-error');
    return { text: (err?.textContent || '').trim(), booted: !!window.__game?.sim?.player };
  });
  check('the first Enter World warned instead of entering', !warned.booted, warned.text);
  check('the warning names the character at risk', /Roland/.test(warned.text), warned.text);

  save = await readSave(page);
  check(
    'the stored character survived the attempt',
    save?.playerName === 'Roland' && save?.state?.level === SAVED_LEVEL,
    JSON.stringify({ name: save?.playerName, level: save?.state?.level }),
  );

  // ---------------------------------------------------------------------
  // ...and consent still works, so the guard is not a one-way door.
  console.log('\n4. confirming the replace still works');
  await page.evaluate(() => document.querySelector('#btn-start-offline')?.click());
  booted = await page
    .waitForFunction(() => window.__game?.sim?.player, { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  check('second Enter World entered as the new character', booted);

  // Let the world finish coming up before asking for a save: `serializeCharacter`
  // returns null on a half-built player and the save path then (correctly) skips
  // the write, which would read here as a failed replace.
  await sleep(2500);
  await dismissEntryOverlays(page);
  await saveNow(page);
  save = await readSave(page);
  check(
    'the confirmed replace took the slot',
    save?.playerName === 'Nyla' && save?.playerClass === 'mage',
    JSON.stringify({ name: save?.playerName, cls: save?.playerClass }),
  );

  // ---------------------------------------------------------------------
  // Two classes of console noise are this harness's environment rather than the
  // thing under test, so they are reported instead of failing the run:
  //   - /api 502s: offline mode needs no game server, so the landing page's stats
  //     fetch fails unless `npm run server` happens to be up.
  //   - missing character GLBs: a separate asset-preload gap, unrelated to saving.
  const ignorable =
    /502|Bad Gateway|Failed to fetch project stats|character asset not preloaded|character visual unavailable/;
  const realErrors = pageErrors.filter((e) => !ignorable.test(e));
  const noise = pageErrors.length - realErrors.length;
  check('no page errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
  if (noise > 0) console.log(`  note ${noise} unrelated console error(s) ignored (api/assets)`);
} finally {
  // Give the slot back before anything else, including on a thrown failure.
  if (borrowedSave) {
    try {
      await page.evaluate(
        (key, raw) => {
          localStorage.setItem(key, raw);
        },
        SAVE_KEY,
        borrowedSave,
      );
      const back = await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
      console.log(back === borrowedSave ? '\n  character restored' : '\n  RESTORE FAILED');
    } catch (e) {
      // Loud on purpose: a silent failure here is somebody's character.
      console.error(`\n  RESTORE FAILED, saved copy follows:\n${borrowedSave}`, e);
    }
  }
  await browser.close();
}

console.log(fail === 0 ? '\nPASS\n' : `\n${fail} FAILED\n`);
process.exit(fail > 0 ? 1 : 0);
