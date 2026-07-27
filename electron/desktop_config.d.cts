// Hand-written declarations for electron/desktop_config.cjs so the Vitest suite
// (tests/electron_desktop_config.test.ts) type-checks its imports. Keep in sync
// with the .cjs exports (same convention as shell_guards.d.cts).

export const PRODUCTION_API_ORIGIN: string;

export interface DesktopConfigInput {
  packagedMetadata?: {
    wocDesktop?: {
      crashSubmitUrl?: unknown;
      apiOrigin?: unknown;
      loginOrigin?: unknown;
    };
  } | null;
  env?: Record<string, string | undefined>;
  isPackaged?: boolean;
}

export interface DesktopConfig {
  crashSubmitUrl: string;
  apiOrigin: string;
  loginOrigin: string;
}

export function resolveCrashSubmitUrl(input?: DesktopConfigInput): string;
export function resolveDesktopOrigins(input?: DesktopConfigInput): {
  apiOrigin: string;
  loginOrigin: string;
};
export function walletConnectionSupported(): boolean;
export function resolveDesktopConfig(input?: DesktopConfigInput): DesktopConfig;
