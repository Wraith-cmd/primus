// One-call composition of the desktop-shell niceties the game client provides
// when running inside the Electron wrapper: relaying uncaught renderer errors
// to the shell log and pushing t()-localized strings for main-process dialogs.
// src/main.ts calls this once (gated on DESKTOP_APP); every piece degrades to a
// no-op when the bridge or a bridge method is absent (older installed shell,
// plain browser).

import { desktopBridge } from '../runtime';
import { initDesktopErrorRelay } from './desktop_error_relay';
import { initDesktopShellStrings } from './desktop_shell_strings';

export function initDesktopShellIntegration(): void {
  const bridge = desktopBridge();
  if (!bridge) return;
  // Error relay first: its listeners should exist before anything else runs.
  initDesktopErrorRelay(bridge);
  initDesktopShellStrings(bridge);
}
