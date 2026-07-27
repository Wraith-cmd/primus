'use strict';

// Pure, Node-testable resolution of the desktop shell's runtime configuration:
// the web origins it talks to and where crash minidumps may be submitted. Lives
// beside shell_guards.cjs for the same reason: electron/main.cjs runs outside tsc
// and vitest, so every decision worth pinning is made here where
// tests/electron_desktop_config.test.ts can exercise it directly. No electron
// imports; callers pass everything in.
//
// The values are stamped into the PACKAGED package.json by scripts/electron-build.mjs
// (electron-builder extraMetadata writes a `wocDesktop` object), because a shipped
// app has no build-time env.

// The backend this build talks to unless a stamp or (unpackaged) env says
// otherwise. Also electron/main.cjs's fallback when a stamped origin is garbage.
const PRODUCTION_API_ORIGIN = 'https://worldofclaudecraft.com';

// The crash-minidump submit URL, if the maintainer provisioned one at build
// time (stamped like the distribution). WOC_CRASH_SUBMIT_URL is a DEV-ONLY
// override, ignored on packaged builds for the same reason as the channel:
// minidumps carry process memory, so a local env var must not be able to
// redirect where an installed app uploads them. Only https: is accepted;
// empty string means "keep dumps local only".
function resolveCrashSubmitUrl({ packagedMetadata, env, isPackaged } = {}) {
  const candidates =
    isPackaged === true
      ? [packagedMetadata?.wocDesktop?.crashSubmitUrl]
      : [env?.WOC_CRASH_SUBMIT_URL, packagedMetadata?.wocDesktop?.crashSubmitUrl];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate === '') continue;
    let parsed;
    try {
      parsed = new URL(candidate);
    } catch {
      continue;
    }
    if (parsed.protocol === 'https:') return candidate;
  }
  return '';
}

// The web origins the shell trusts: the API origin (REST + WebSocket; it feeds
// the app:// CSP connect-src) and the origin openDesktopLogin() sends the
// player's browser to for credential entry. Both are stamped at build time by
// scripts/electron-build.mjs (apiOrigin also feeds the Vite client build, so
// the packaged main process always agrees with the baked bundle; loginOrigin
// is main-process-only), because a packaged build honoring VITE_DESKTOP_* from
// runtime env would let a local env var widen the CSP or redirect the login
// page: the same escape hatch resolveCrashSubmitUrl closes. Env applies to
// unpackaged checkouts only. Values are picked, not
// sanitized; the caller (electron/main.cjs) still derives/normalizes them
// before use, so a garbage stamp degrades to the production origin there.
function resolveDesktopOrigins({ packagedMetadata, env, isPackaged } = {}) {
  const stamped = packagedMetadata?.wocDesktop ?? {};
  const pick = (envValue, stampedValue) => {
    if (isPackaged !== true && typeof envValue === 'string' && envValue !== '') return envValue;
    if (typeof stampedValue === 'string' && stampedValue !== '') return stampedValue;
    return '';
  };
  const apiOrigin = pick(env?.VITE_DESKTOP_API_ORIGIN, stamped.apiOrigin) || PRODUCTION_API_ORIGIN;
  const loginOrigin = pick(env?.VITE_DESKTOP_LOGIN_ORIGIN, stamped.loginOrigin) || apiOrigin;
  return { apiOrigin, loginOrigin };
}

// Wallet handoff is available in every build of this shell. Kept as a pure,
// tested predicate (rather than inlined into the IPC handler) so the capability
// stays one decision the shell answers the renderer with.
function walletConnectionSupported() {
  return true;
}

// One-call summary used by electron/main.cjs at startup.
function resolveDesktopConfig({ packagedMetadata, env, isPackaged } = {}) {
  return {
    crashSubmitUrl: resolveCrashSubmitUrl({ packagedMetadata, env, isPackaged }),
    ...resolveDesktopOrigins({ packagedMetadata, env, isPackaged }),
  };
}

module.exports = {
  PRODUCTION_API_ORIGIN,
  resolveCrashSubmitUrl,
  resolveDesktopOrigins,
  walletConnectionSupported,
  resolveDesktopConfig,
};
