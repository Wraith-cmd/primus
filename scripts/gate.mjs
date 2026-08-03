// The full local pre-merge gate: the CI checks from .github/workflows/ci.yml run
// locally. Order: the PR tier's combined step list (CI splits it across the
// parallel pr-gate and pr-checks jobs and fans the test step across a 4-shard
// matrix; this script runs the same list serially with ONE full unsharded
// vitest run by design), with the parallel lint job's changed-files biome pulled forward
// as an early fast-fail; on a release/** branch the steps run release-tier
// (I18N_RELEASE_TIER=1), mirroring the release-gate job. This script exists
// because ad-hoc shell chains get the gate
// wrong in two known ways: piping `npm test` through `tail` masks vitest's exit
// code (a red run can print "PASS"), and an unbounded full run saturates every
// core and flakes the heavy sim suites when other work shares the machine
// (failing files that then pass in isolation). Steps run sequentially with
// inherited stdio and stop at the first failure.
// Keep the step list in sync with .github/workflows/ci.yml (and vice versa).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import { FFMPEG_PATH, FFPROBE_PATH } from './sfx/ffmpeg_paths.mjs';

const workers = Math.max(1, Math.floor(os.cpus().length / 2));
// npm/npx resolve to .cmd files on Windows, which spawnSync only finds via a shell.
const shell = process.platform === 'win32';

// Probe the resolved binaries BY EXECUTION: the ffmpeg-static/ffprobe-static
// packages download their binary via an allowlisted install script, so a
// scripts-skipped install leaves a missing file behind the import, and the PATH
// fallback may not exist either. Failing here is cheaper and clearer than
// failing mid-suite.
const missingAudioTools = [
  ['ffmpeg', FFMPEG_PATH],
  ['ffprobe', FFPROBE_PATH],
].filter(([, toolPath]) => {
  const probe = spawnSync(toolPath, ['-version'], { stdio: 'ignore', shell });
  return probe.error !== undefined || probe.status !== 0;
});
if (missingAudioTools.length > 0) {
  console.error(
    `[gate] missing required SFX audio tooling: ${missingAudioTools.map(([name]) => name).join(', ')}\n` +
      '[gate] the bundled ffmpeg-static/ffprobe-static binaries are absent or broken (a\n' +
      '[gate] scripts-skipped install leaves them missing): reinstall with npm ci, or\n' +
      '[gate] install FFmpeg (including ffprobe) on PATH, then re-run npm run gate',
  );
  process.exit(1);
}

// Load a local .env, if one exists, so the DB-gated suites (*_integration.test.ts,
// which no-op without TEST_DATABASE_URL) actually EXECUTE in a local gate run.
// Without this the gate reports green while 22 tests silently skip, which reads
// identically to "everything passed" and is exactly the blind spot this file's
// header warns about for exit codes.
//
// ALLOWLISTED, and that is the load-bearing part. The first version of this
// loader injected EVERY key in .env into every step, which is a real weakening
// vector: 22 test files do `process.env.DATABASE_URL ??= 'postgres://test/test'`
// and five of them do NOT mock pg, so injecting a developer's real DSN silently
// pointed them at a live database locally while CI kept the stub. Green locally
// and green in CI stopped being the same assertion. Worse, the repo has
// env-controlled behavior switches (ALLOW_DEV_COMMANDS, REQUIRE_WEB_LOGIN,
// NATIVE_ATTESTATION_REQUIRED, ...) that a gitignored file no reviewer sees
// could then flip. Only the one variable this feature is for crosses the line.
//
// Also dependency-free (the repo keeps its dep set tiny) and NON-overriding: a
// value already in the environment wins, so CI is unaffected and an operator can
// override it for one run. .env is gitignored; its absence is the normal case.
// The ONLY keys a local .env may contribute. Adding one is a deliberate decision
// about what a green gate is allowed to depend on, not a convenience.
const DOTENV_ALLOWLIST = new Set(['TEST_DATABASE_URL']);

function loadDotEnv() {
  const picked = [];
  let text;
  try {
    text = readFileSync('.env', 'utf8');
  } catch {
    return picked; // no .env: nothing to do
  }
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    // `export FOO=bar` is common in hand-written .env files and would otherwise
    // define a variable literally named "export FOO" while FOO stayed unset.
    const key = line
      .slice(0, eq)
      .trim()
      .replace(/^export\s+/, '');
    if (!DOTENV_ALLOWLIST.has(key)) continue;
    if (Object.hasOwn(process.env, key)) continue; // ambient wins
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
    picked.push(key);
  }
  return picked;
}

const dotEnvKeys = loadDotEnv();
// Keyed on a NON-EMPTY value, not merely the key being present: `TEST_DATABASE_URL=`
// in .env would otherwise print "will RUN" while the suites skipped, which is the
// exact silent-skip confusion this message exists to remove.
if (dotEnvKeys.includes('TEST_DATABASE_URL') && process.env.TEST_DATABASE_URL) {
  console.log('[gate] .env: TEST_DATABASE_URL set, the DB integration suites will RUN');
} else if (!process.env.TEST_DATABASE_URL) {
  // Say so out loud: a silent skip is indistinguishable from a pass.
  console.log(
    '[gate] no TEST_DATABASE_URL: the DB integration suites will SKIP ' +
      '(start the dev database with `npm run db:up`)',
  );
}

const branch =
  spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8', shell }).stdout?.trim() ?? '';
const releaseTier = branch.startsWith('release/');
const env = releaseTier ? { ...process.env, I18N_RELEASE_TIER: '1' } : process.env;

const I18N_ARTIFACTS = [
  'src/ui/i18n.resolved.generated',
  'src/admin/i18n.resolved.generated',
  'src/ui/i18n.catalog/translation_keys.generated.ts',
];

const steps = [
  ['i18n artifacts', 'npm', ['run', 'i18n:gen']],
  [
    'i18n freshness',
    'git',
    ['diff', '--exit-code', '--', ...I18N_ARTIFACTS],
    'the regenerated i18n artifacts differ from the staged/committed copies: stage them ' +
      `(git add ${I18N_ARTIFACTS.join(' ')}) and re-run`,
  ],
  ['malware scan', 'npm', ['run', 'security:gate']],
  ['biome (changed files)', 'npm', ['run', 'ci:changed']],
  ['sfx check', 'npm', ['run', 'sfx:check']],
  ['vitest (full suite)', 'npm', ['test', '--', `--maxWorkers=${workers}`]],
  ['browser regressions', 'npm', ['run', 'test:browser']],
  ['typecheck', 'npm', ['run', 'check:types']],
  ['env build', 'npm', ['run', 'build:env']],
  ['server build', 'npm', ['run', 'build:server']],
  ['client build', 'npm', ['run', 'build']],
];

if (releaseTier) {
  console.log(`[gate] release branch "${branch}": running release-tier (I18N_RELEASE_TIER=1)`);
}

for (const [name, cmd, args, hint] of steps) {
  console.log(`\n[gate] ${name}: ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { stdio: 'inherit', env, shell });
  if (res.status !== 0) {
    console.error(`\n[gate] FAIL at "${name}" (exit ${res.status ?? 'killed'})`);
    if (hint) console.error(`[gate] hint: ${hint}`);
    process.exit(res.status ?? 1);
  }
}

console.log(
  `\n[gate] PASS: all ${steps.length} steps green (vitest workers capped at ${workers}, half the cores)`,
);
