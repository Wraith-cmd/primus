// Pure construction of the EFFECTIVE electron-builder configuration for the
// desktop build. The static config stays in package.json's "build" block
// (single visible source of truth); this module derives the build-time variant
// from it:
//
//  - stamps `extraMetadata.wocDesktop` into the packaged package.json (the web
//    origins the Vite bundle was baked with + optional crash submit URL), which
//    is how the shipped main process (electron/desktop_config.cjs) knows what it
//    is at runtime, and why a packaged build never honors the VITE_DESKTOP_*
//    runtime env pair.
//  - windows signing: two routes, each injected only when the caller resolved
//    a complete credential set from the environment, so unsigned local builds
//    never trip the signing step. Azure Trusted Signing (WIN_SIGN_*) injects
//    win.azureSignOptions and wins when both are configured; the Azure Key
//    Vault certificate route (AZURE_KEY_VAULT_* + AZURE_TENANT_ID/CLIENT_*)
//    injects the AzureSignTool hook via win.signtoolOptions.
//
// Kept free of child_process/fs so tests/electron_builder_config.test.ts can pin
// the derivation directly.

export function azureSignOptionsFromEnv(env = {}) {
  const options = {
    publisherName: env.WIN_SIGN_PUBLISHER_NAME,
    endpoint: env.WIN_SIGN_ENDPOINT,
    codeSigningAccountName: env.WIN_SIGN_ACCOUNT_NAME,
    certificateProfileName: env.WIN_SIGN_PROFILE_NAME,
  };
  const values = Object.values(options);
  if (values.every((value) => typeof value === 'string' && value !== '')) return options;
  return null;
}

// The other Windows signing route: an Azure KEY VAULT certificate driven by
// the AzureSignTool hook (scripts/electron-win-sign.mjs) via
// win.signtoolOptions, as opposed to the Trusted Signing account/profile
// shape azureSignOptionsFromEnv covers. Returns the signtoolOptions block only
// when the complete credential set is present, so unsigned local builds never
// trip the hook. The hook reads the credentials from env at sign time; only
// the module path and the single-pass sha256 pin land in the derived config
// (which is written to a tmp file, so no secret may ever ride in it).
export function keyVaultSignConfigFromEnv(env = {}) {
  const required = [
    'AZURE_KEY_VAULT_URL',
    'AZURE_TENANT_ID',
    'AZURE_CLIENT_ID',
    'AZURE_CLIENT_SECRET',
    'AZURE_KEY_VAULT_CERTIFICATE',
  ];
  if (!required.every((name) => typeof env[name] === 'string' && env[name] !== '')) return null;
  return {
    sign: './scripts/electron-win-sign.mjs',
    // One signing pass per file: the default ['sha1', 'sha256'] dual-signing
    // would re-invoke the hook for a sha1 pass AzureSignTool cannot append.
    signingHashAlgorithms: ['sha256'],
  };
}

// Collapse [{target, arch}] entries to bare target names so `pack` mode builds
// only the host arch: the full arch matrix (mac universal, win/linux x64+arm64)
// is a RELEASE concern, and a local --dir verification pack should stay fast.
function stripArch(targets) {
  if (!Array.isArray(targets)) return targets;
  return targets.map((entry) =>
    entry && typeof entry === 'object' && 'target' in entry ? entry.target : entry,
  );
}

export function desktopBuilderConfig({
  base,
  mode = 'build',
  apiOrigin = '',
  loginOrigin = '',
  crashSubmitUrl = '',
  azureSign = null,
  keyVaultSign = null,
}) {
  const config = structuredClone(base);
  config.extraMetadata = {
    ...(config.extraMetadata ?? {}),
    wocDesktop: {
      ...(apiOrigin ? { apiOrigin } : {}),
      ...(loginOrigin ? { loginOrigin } : {}),
      ...(crashSubmitUrl ? { crashSubmitUrl } : {}),
    },
  };
  // Windows signing routes, mutually exclusive with Trusted Signing first:
  // both resolvers require a complete env set, so at most one is normally
  // non-null, and if an operator ever configures both, the native Trusted
  // Signing path wins over the custom hook.
  if (azureSign) {
    config.win = { ...(config.win ?? {}), azureSignOptions: azureSign };
  } else if (keyVaultSign) {
    config.win = {
      ...(config.win ?? {}),
      signtoolOptions: { ...(config.win?.signtoolOptions ?? {}), ...keyVaultSign },
    };
  }
  if (mode === 'pack') {
    for (const os of ['mac', 'win', 'linux']) {
      if (config[os]?.target) config[os] = { ...config[os], target: stripArch(config[os].target) };
    }
  }
  return config;
}
