// Hand-written declarations for scripts/electron-builder-config.mjs so the
// Vitest suite type-checks its imports (same convention as the electron/*.d.cts
// files). Keep in sync with the .mjs exports.

export interface AzureSignOptions {
  publisherName: string;
  endpoint: string;
  codeSigningAccountName: string;
  certificateProfileName: string;
}

export function azureSignOptionsFromEnv(
  env?: Record<string, string | undefined>,
): AzureSignOptions | null;

export interface KeyVaultSignConfig {
  sign: string;
  signingHashAlgorithms: string[];
}

export function keyVaultSignConfigFromEnv(
  env?: Record<string, string | undefined>,
): KeyVaultSignConfig | null;

export interface DesktopBuilderConfig {
  extraMetadata: {
    wocDesktop: {
      apiOrigin?: string;
      loginOrigin?: string;
      crashSubmitUrl?: string;
    };
  };
  directories: { output?: string; [key: string]: unknown };
  mac: { [key: string]: unknown };
  win: {
    azureSignOptions?: AzureSignOptions;
    signtoolOptions?: KeyVaultSignConfig & { [key: string]: unknown };
    [key: string]: unknown;
  };
  linux: { [key: string]: unknown };
  files?: string[];
  asarUnpack?: string[];
  [key: string]: unknown;
}

export function desktopBuilderConfig(input: {
  base: Record<string, unknown>;
  mode?: 'pack' | 'build';
  apiOrigin?: string;
  loginOrigin?: string;
  crashSubmitUrl?: string;
  azureSign?: AzureSignOptions | null;
  keyVaultSign?: KeyVaultSignConfig | null;
}): DesktopBuilderConfig;
