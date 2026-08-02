// The automated playtest soak.
//
// The owner can only report bugs as fast as he can type them, and a lot of what
// goes wrong in a session is mechanical: a console error, a companion doing
// something it was never told to do, a UI element that is simply absent. This
// drives a real run-mode session for a while and reports that class of problem,
// so the human playtest can be spent on the things only a human can judge (does
// the animation read, does the fight feel good).
//
// Be honest about the boundary: this CANNOT see that something looks bad. It
// sees errors, absences, and state that contradicts a stated rule.
//
// Usage:  node scripts/playtest_soak.mjs [minutes]
// Needs the game on :4173 (`npm run preview`) or :5173 (`npm run dev`).

import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';

const GAME_URL = process.env.GAME_URL || 'http://localhost:4173';
const MINUTES = Number(process.argv[2] ?? 5);
const DEADLINE = Date.now() + MINUTES * 60_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Findings are deduped by key so a bug firing every frame reports once, with a
// count. A wall of identical lines is how a real signal gets buried.
const findings = new Map();
function report(key, severity, detail) {
  const prev = findings.get(key);
  if (prev) {
    prev.count++;
    return;
  }
  findings.set(key, { key, severity, detail, count: 1 });
}

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: true,
  args: ['--use-angle=swiftshader', '--mute-audio', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

page.on('pageerror', (e) => report(`pageerror:${String(e).slice(0, 90)}`, 'high', String(e)));
page.on('console', (m) => {
  if (m.type() !== 'error' && m.type() !== 'warning') return;
  const text = m.text();
  // Known environment noise: no game server behind /api, and asset gaps that
  // are already tracked separately.
  if (/502|Bad Gateway|project stats|not preloaded|character visual/.test(text)) return;
  report(`console:${text.slice(0, 90)}`, m.type() === 'error' ? 'high' : 'low', text);
});

try {
  console.log(`soaking ${MINUTES} min against ${GAME_URL}`);
  await page.goto(GAME_URL, { waitUntil: 'domcontentloaded' });
  const borrowed = await page.evaluate(() => localStorage.getItem('primus.offline.character'));
  await sleep(2000);

  // Run mode: the fastest route to a capped character with a live party, which
  // is where the interesting behaviour is.
  await page.evaluate(() => document.querySelector('#btn-run-mode')?.click());
  await sleep(800);
  await page.evaluate(() => document.querySelector('#btn-run-start')?.click());
  const booted = await page
    .waitForFunction(() => window.__game?.sim?.player, { timeout: 60000 })
    .then(() => true)
    .catch(() => false);
  if (!booted) {
    report('boot:run-mode-never-booted', 'high', 'the run world never produced a player');
    throw new Error('run mode did not boot');
  }
  await sleep(3000);
  await page.keyboard.press('Escape').catch(() => {});

  let ticks = 0;
  let lastPos = null;
  let stuckFor = 0;

  while (Date.now() < DEADLINE) {
    ticks++;
    // Drive some actual play: move, turn, target, and use the action bar.
    const key = ['KeyW', 'KeyA', 'KeyD', 'KeyS'][ticks % 4];
    await page.keyboard.down(key);
    await sleep(700);
    await page.keyboard.up(key);
    await page.keyboard.press('Tab').catch(() => {});
    await sleep(200);
    for (const slot of ['Digit1', 'Digit2', 'Digit3']) {
      await page.keyboard.press(slot).catch(() => {});
      await sleep(350);
    }

    const probe = await page.evaluate(() => {
      const g = window.__game;
      const sim = g?.sim;
      const p = sim?.player;
      if (!p) return { alive: false };
      const companions = [];
      let hostilesEngagedByUs = 0;
      for (const e of sim.entities.values()) {
        if (e.kind !== 'mob') continue;
        if (e.ownerId != null) {
          companions.push({
            id: e.id,
            dead: !!e.dead,
            hp: e.hp,
            maxHp: e.maxHp,
            target: e.aggroTargetId ?? null,
          });
        } else if (!e.dead && e.aggroTargetId != null) {
          hostilesEngagedByUs++;
        }
      }
      // Is any companion attacking something the owner is not targeting and is
      // not attacking us? That is the auto-pull signature.
      let unprovoked = 0;
      for (const c of companions) {
        if (c.target == null || c.dead) continue;
        const foe = sim.entities.get(c.target);
        if (!foe || foe.dead) continue;
        const foeFightsUs =
          foe.aggroTargetId === p.id || companions.some((k) => k.id === foe.aggroTargetId);
        if (!foeFightsUs && p.targetId !== foe.id) unprovoked++;
      }
      const frames = document.querySelectorAll(
        '#party-frames .party-frame, .party-frame, [data-party-frame]',
      ).length;
      return {
        alive: true,
        level: p.level,
        hp: p.hp,
        maxHp: p.maxHp,
        dead: !!p.dead,
        pos: { x: Math.round(p.pos.x), z: Math.round(p.pos.z) },
        companions: companions.length,
        companionsDead: companions.filter((c) => c.dead).length,
        unprovoked,
        partyFrames: frames,
        hostilesEngagedByUs,
      };
    });

    if (!probe.alive) {
      report('state:player-vanished', 'high', 'sim.player became unavailable mid-session');
      break;
    }

    // --- the checks -------------------------------------------------------
    if (!Number.isFinite(probe.hp) || !Number.isFinite(probe.maxHp)) {
      report('stats:non-finite-hp', 'high', JSON.stringify(probe));
    }
    if (probe.hp > probe.maxHp) {
      report('stats:hp-over-max', 'medium', `${probe.hp}/${probe.maxHp}`);
    }
    if (probe.companions > 0 && probe.partyFrames === 0) {
      report(
        'ui:no-party-frames-for-companions',
        'high',
        `${probe.companions} companions hired, 0 party frames in the DOM: they cannot be clicked, healed or resurrected`,
      );
    }
    if (probe.unprovoked > 0) {
      report(
        'ai:companions-pull-unprovoked',
        'high',
        `${probe.unprovoked} companion(s) attacking a mob that is neither fighting the party nor the owner's target`,
      );
    }
    if (probe.companionsDead > 0) {
      report(
        'ai:companion-died',
        'medium',
        `${probe.companionsDead} of ${probe.companions} companions dead; check whether any resurrect path exists`,
      );
    }
    if (lastPos && probe.pos.x === lastPos.x && probe.pos.z === lastPos.z && !probe.dead) {
      stuckFor++;
      if (stuckFor === 5) {
        report('movement:stuck', 'medium', `position unchanged across 5 move attempts at ${JSON.stringify(probe.pos)}`);
      }
    } else {
      stuckFor = 0;
    }
    lastPos = probe.pos;

    if (ticks % 10 === 0) {
      const left = Math.max(0, Math.round((DEADLINE - Date.now()) / 1000));
      console.log(
        `  [${left}s left] lvl ${probe.level} hp ${probe.hp}/${probe.maxHp} companions ${probe.companions} (${probe.companionsDead} dead) frames ${probe.partyFrames} findings ${findings.size}`,
      );
    }
  }

  if (borrowed) {
    await page.evaluate((raw) => localStorage.setItem('primus.offline.character', raw), borrowed);
  }
  await page.evaluate(() => localStorage.removeItem('primus.offline.character.run'));
} catch (e) {
  report(`harness:${String(e).slice(0, 80)}`, 'low', `the soak itself failed: ${String(e)}`);
} finally {
  await browser.close();
}

const order = { high: 0, medium: 1, low: 2 };
const sorted = [...findings.values()].sort((a, b) => order[a.severity] - order[b.severity]);
console.log(`\n=== ${sorted.length} distinct finding(s) ===\n`);
for (const f of sorted) {
  console.log(`[${f.severity}] ${f.key}${f.count > 1 ? ` (x${f.count})` : ''}`);
  console.log(`    ${f.detail}\n`);
}
if (!sorted.length) console.log('nothing mechanical surfaced. Visual and feel bugs need a human.');
