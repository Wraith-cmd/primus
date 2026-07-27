// The shared-secret header gate for the /internal ops surface. PARITY-FIRST: on a
// reject it writes the LEGACY
// { success, data, error } bodies byte-for-byte (the fail() envelope in
// server/internal.ts), via json() directly, never problem+json: the feature-off
// 404 when the env secret is unset (the endpoint hides entirely,
// anti-enumeration) and the 401 on a mismatched secret. The compare is the same
// length-guarded timingSafeEqual as server/internal.ts secretsMatch, so a
// mismatch reveals nothing about the expected value through timing. The env var
// is read PER REQUEST (matching the legacy branches), so toggling it between
// requests flips the gate without a restart.
//
// The header names and env var names are the single source of truth here; the
// route tables consume these constants, never a string literal.

import { timingSafeEqual } from 'node:crypto';
import { json } from '../../http_util';
import type { Middleware } from '../types';

/** Header + env pair for the deploy gate (POST /internal/restart-countdown). */
export const DEPLOY_SECRET_HEADER = 'x-woc-deploy-secret';
export const DEPLOY_SECRET_ENV = 'RESTART_COUNTDOWN_SECRET';

/** Header + env pair for the Discord bot gate (every /internal/discord/* route). */
export const DISCORD_SECRET_HEADER = 'x-woc-discord-secret';
export const DISCORD_SECRET_ENV = 'DISCORD_BOT_SECRET';

/** The legacy fail() bodies from server/internal.ts, frozen for byte parity. */
const FEATURE_OFF_BODY = { success: false, data: null, error: 'unknown endpoint' } as const;
const NOT_AUTHENTICATED_BODY = { success: false, data: null, error: 'not authenticated' } as const;

/** One (header, env var) secret pair a gate instance enforces. */
export interface InternalSecretGate {
  /** The request header carrying the secret (lowercase, as node exposes it). */
  readonly header: string;
  /** The process.env key holding the expected secret. */
  readonly envVar: string;
}

// Length-guarded constant-time compare, mirroring server/internal.ts
// secretsMatch exactly. The length check short-circuits (timingSafeEqual
// requires equal lengths); the value compare is constant-time.
function secretsMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

/**
 * Build the gate middleware for one (header, env var) pair. Order matches the
 * legacy branches: feature-off 404 when the env secret is empty/unset, 401 on a
 * mismatch, next() on a match. Never logs or echoes the presented secret.
 */
export function requireInternalSecret(gate: InternalSecretGate): Middleware {
  return async (ctx, next) => {
    const expected = process.env[gate.envVar] ?? '';
    if (!expected) {
      json(ctx.res, 404, FEATURE_OFF_BODY);
      return;
    }
    const actual = String(ctx.req.headers[gate.header] ?? '');
    if (!secretsMatch(actual, expected)) {
      json(ctx.res, 401, NOT_AUTHENTICATED_BODY);
      return;
    }
    await next();
  };
}
