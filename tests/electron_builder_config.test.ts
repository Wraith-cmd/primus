import { describe, expect, it } from 'vitest';
import {
  azureSignOptionsFromEnv,
  desktopBuilderConfig,
  keyVaultSignConfigFromEnv,
} from '../scripts/electron-builder-config.mjs';

// A miniature of package.json's "build" block: just the keys the derivation
// touches, plus ones it must pass through untouched.
const base = {
  appId: 'com.worldofclaudecraft.desktop',
  files: ['dist/**', 'electron/**', '!node_modules/**'],
  directories: { buildResources: 'build', output: 'release' },
  mac: { hardenedRuntime: true, target: [{ target: 'dmg', arch: ['universal'] }] },
  win: { target: [{ target: 'nsis', arch: ['x64', 'arm64'] }] },
  linux: { target: [{ target: 'AppImage', arch: ['x64', 'arm64'] }] },
};

describe('desktopBuilderConfig', () => {
  it('stamps the baked origins into extraMetadata and passes the base through', () => {
    const config = desktopBuilderConfig({
      base,
      apiOrigin: 'https://api.example.com',
      loginOrigin: 'https://login.example.com',
    });
    expect(config.extraMetadata.wocDesktop).toEqual({
      apiOrigin: 'https://api.example.com',
      loginOrigin: 'https://login.example.com',
    });
    expect(config.appId).toBe(base.appId);
    expect(config.mac.hardenedRuntime).toBe(true);
  });

  it('omits every stamp key that was not resolved', () => {
    const bare = desktopBuilderConfig({ base });
    expect(bare.extraMetadata.wocDesktop).toEqual({});
  });

  it('never mutates the base config object', () => {
    const before = JSON.stringify(base);
    desktopBuilderConfig({ base, apiOrigin: 'https://api.example.com' });
    desktopBuilderConfig({ base, mode: 'pack' });
    expect(JSON.stringify(base)).toBe(before);
  });

  it('carries the crash submit URL only when one is set', () => {
    const withUrl = desktopBuilderConfig({
      base,
      crashSubmitUrl: 'https://crash.example.com/minidump',
    });
    expect(withUrl.extraMetadata.wocDesktop.crashSubmitUrl).toBe(
      'https://crash.example.com/minidump',
    );
    const without = desktopBuilderConfig({ base });
    expect('crashSubmitUrl' in without.extraMetadata.wocDesktop).toBe(false);
  });

  it('pack mode strips the arch matrix down to host-arch target names', () => {
    const config = desktopBuilderConfig({ base, mode: 'pack' });
    expect(config.mac.target).toEqual(['dmg']);
    expect(config.win.target).toEqual(['nsis']);
    expect(config.linux.target).toEqual(['AppImage']);
  });

  it('injects azureSignOptions only when provided', () => {
    const azureSign = {
      publisherName: 'CN=Example Corp',
      endpoint: 'https://eus.codesigning.azure.net',
      codeSigningAccountName: 'example-account',
      certificateProfileName: 'example-profile',
    };
    const config = desktopBuilderConfig({ base, azureSign });
    expect(config.win.azureSignOptions).toEqual(azureSign);
    const plain = desktopBuilderConfig({ base });
    expect(plain.win.azureSignOptions).toBeUndefined();
  });

  it('injects the Key Vault sign hook only when provided, and Trusted Signing wins', () => {
    const keyVaultSign = {
      sign: './scripts/electron-win-sign.mjs',
      signingHashAlgorithms: ['sha256'],
    };
    const config = desktopBuilderConfig({ base, keyVaultSign });
    expect(config.win.signtoolOptions).toEqual(keyVaultSign);
    expect(config.win.azureSignOptions).toBeUndefined();
    const azureSign = {
      publisherName: 'CN=Example Corp',
      endpoint: 'https://eus.codesigning.azure.net',
      codeSigningAccountName: 'example-account',
      certificateProfileName: 'example-profile',
    };
    const both = desktopBuilderConfig({ base, azureSign, keyVaultSign });
    expect(both.win.azureSignOptions).toEqual(azureSign);
    expect(both.win.signtoolOptions).toBeUndefined();
    const plain = desktopBuilderConfig({ base });
    expect(plain.win.signtoolOptions).toBeUndefined();
  });
});

describe('azureSignOptionsFromEnv', () => {
  const full = {
    WIN_SIGN_PUBLISHER_NAME: 'CN=Example Corp',
    WIN_SIGN_ENDPOINT: 'https://eus.codesigning.azure.net',
    WIN_SIGN_ACCOUNT_NAME: 'example-account',
    WIN_SIGN_PROFILE_NAME: 'example-profile',
  };

  it('returns the four options only when every env var is set and non-empty', () => {
    expect(azureSignOptionsFromEnv(full)).toEqual({
      publisherName: 'CN=Example Corp',
      endpoint: 'https://eus.codesigning.azure.net',
      codeSigningAccountName: 'example-account',
      certificateProfileName: 'example-profile',
    });
  });

  it('returns null on any missing or empty variable (unsigned local builds)', () => {
    expect(azureSignOptionsFromEnv({})).toBeNull();
    expect(azureSignOptionsFromEnv()).toBeNull();
    expect(azureSignOptionsFromEnv({ ...full, WIN_SIGN_ENDPOINT: '' })).toBeNull();
    const { WIN_SIGN_PROFILE_NAME, ...partial } = full;
    expect(azureSignOptionsFromEnv(partial)).toBeNull();
  });
});

describe('keyVaultSignConfigFromEnv', () => {
  const full = {
    AZURE_KEY_VAULT_URL: 'https://example.vault.azure.net',
    AZURE_TENANT_ID: 'tenant-id',
    AZURE_CLIENT_ID: 'client-id',
    AZURE_CLIENT_SECRET: 'client-secret',
    AZURE_KEY_VAULT_CERTIFICATE: 'woc-code-signing',
  };

  it('returns the sign-hook signtoolOptions only when every env var is set and non-empty', () => {
    expect(keyVaultSignConfigFromEnv(full)).toEqual({
      sign: './scripts/electron-win-sign.mjs',
      signingHashAlgorithms: ['sha256'],
    });
  });

  it('returns null on any missing or empty variable (unsigned local builds)', () => {
    expect(keyVaultSignConfigFromEnv({})).toBeNull();
    expect(keyVaultSignConfigFromEnv()).toBeNull();
    expect(keyVaultSignConfigFromEnv({ ...full, AZURE_CLIENT_SECRET: '' })).toBeNull();
    const { AZURE_KEY_VAULT_CERTIFICATE, ...partial } = full;
    expect(keyVaultSignConfigFromEnv(partial)).toBeNull();
  });
});
