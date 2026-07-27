import { describe, expect, it } from 'vitest';
import {
  resolveCrashSubmitUrl,
  resolveDesktopConfig,
  resolveDesktopOrigins,
  walletConnectionSupported,
} from '../electron/desktop_config.cjs';

describe('walletConnectionSupported', () => {
  it('is available in every build of this shell', () => {
    expect(walletConnectionSupported()).toBe(true);
  });
});

describe('resolveCrashSubmitUrl', () => {
  it('accepts only https URLs, from env first then the stamp (unpackaged)', () => {
    expect(
      resolveCrashSubmitUrl({
        packagedMetadata: { wocDesktop: { crashSubmitUrl: 'https://crash.example.com/minidump' } },
      }),
    ).toBe('https://crash.example.com/minidump');
    expect(
      resolveCrashSubmitUrl({
        packagedMetadata: { wocDesktop: { crashSubmitUrl: 'https://stamped.example.com' } },
        env: { WOC_CRASH_SUBMIT_URL: 'https://env.example.com' },
        isPackaged: false,
      }),
    ).toBe('https://env.example.com');
  });

  it('a PACKAGED build ignores the env URL: minidump uploads cannot be redirected locally', () => {
    expect(
      resolveCrashSubmitUrl({
        packagedMetadata: { wocDesktop: { crashSubmitUrl: 'https://stamped.example.com' } },
        env: { WOC_CRASH_SUBMIT_URL: 'https://evil.example.com' },
        isPackaged: true,
      }),
    ).toBe('https://stamped.example.com');
    expect(
      resolveCrashSubmitUrl({
        env: { WOC_CRASH_SUBMIT_URL: 'https://evil.example.com' },
        isPackaged: true,
      }),
    ).toBe('');
  });

  it('rejects http, malformed, and missing values with the local-only empty string', () => {
    expect(
      resolveCrashSubmitUrl({
        packagedMetadata: { wocDesktop: { crashSubmitUrl: 'http://crash.example.com' } },
      }),
    ).toBe('');
    expect(resolveCrashSubmitUrl({ env: { WOC_CRASH_SUBMIT_URL: 'not a url' } })).toBe('');
    expect(resolveCrashSubmitUrl({})).toBe('');
    expect(resolveCrashSubmitUrl()).toBe('');
  });

  it('falls through an invalid env value to a valid stamp', () => {
    expect(
      resolveCrashSubmitUrl({
        packagedMetadata: { wocDesktop: { crashSubmitUrl: 'https://stamped.example.com' } },
        env: { WOC_CRASH_SUBMIT_URL: 'ftp://nope' },
      }),
    ).toBe('https://stamped.example.com');
  });
});

describe('resolveDesktopOrigins (the packaged-build VITE_DESKTOP_* hatch closure)', () => {
  const originStamp = {
    wocDesktop: {
      apiOrigin: 'https://stamped.example.com',
      loginOrigin: 'https://login.example.com',
    },
  };

  it('a PACKAGED build reads only the stamp: runtime env cannot widen the CSP or move login', () => {
    expect(
      resolveDesktopOrigins({
        packagedMetadata: originStamp,
        env: {
          VITE_DESKTOP_API_ORIGIN: 'https://evil.example.com',
          VITE_DESKTOP_LOGIN_ORIGIN: 'https://evil-login.example.com',
        },
        isPackaged: true,
      }),
    ).toEqual({
      apiOrigin: 'https://stamped.example.com',
      loginOrigin: 'https://login.example.com',
    });
  });

  it('an unpackaged checkout honors env first (local-server smoke builds)', () => {
    expect(
      resolveDesktopOrigins({
        packagedMetadata: originStamp,
        env: { VITE_DESKTOP_API_ORIGIN: 'http://localhost:8787' },
        isPackaged: false,
      }),
    ).toEqual({ apiOrigin: 'http://localhost:8787', loginOrigin: 'https://login.example.com' });
  });

  it('falls back to the production origin, and login falls back to the api origin', () => {
    expect(resolveDesktopOrigins({})).toEqual({
      apiOrigin: 'https://worldofclaudecraft.com',
      loginOrigin: 'https://worldofclaudecraft.com',
    });
    expect(resolveDesktopOrigins()).toEqual({
      apiOrigin: 'https://worldofclaudecraft.com',
      loginOrigin: 'https://worldofclaudecraft.com',
    });
    expect(
      resolveDesktopOrigins({
        packagedMetadata: { wocDesktop: { apiOrigin: 'https://api.example.com' } },
        isPackaged: true,
      }),
    ).toEqual({ apiOrigin: 'https://api.example.com', loginOrigin: 'https://api.example.com' });
  });
});

const defaultOrigins = {
  apiOrigin: 'https://worldofclaudecraft.com',
  loginOrigin: 'https://worldofclaudecraft.com',
};

describe('resolveDesktopConfig', () => {
  it('summarizes a packaged build', () => {
    expect(resolveDesktopConfig({ packagedMetadata: {}, isPackaged: true })).toEqual({
      crashSubmitUrl: '',
      ...defaultOrigins,
    });
  });

  it('summarizes a bare dev checkout', () => {
    expect(resolveDesktopConfig({ isPackaged: false })).toEqual({
      crashSubmitUrl: '',
      ...defaultOrigins,
    });
  });

  it('carries the stamped origins and crash URL through', () => {
    expect(
      resolveDesktopConfig({
        packagedMetadata: {
          wocDesktop: {
            apiOrigin: 'https://dev.worldofclaudecraft.com',
            crashSubmitUrl: 'https://crash.example.com/minidump',
          },
        },
        isPackaged: true,
      }),
    ).toEqual({
      crashSubmitUrl: 'https://crash.example.com/minidump',
      apiOrigin: 'https://dev.worldofclaudecraft.com',
      loginOrigin: 'https://dev.worldofclaudecraft.com',
    });
  });
});
