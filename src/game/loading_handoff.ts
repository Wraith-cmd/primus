export const LOADING_HANDOFF_WATCHDOG_MS = 5_000;

export interface LoadingHandoffOptions<TimeoutHandle> {
  requestAnimationFrame: (callback: () => void) => void;
  setTimeout: (callback: () => void, delayMs: number) => TimeoutHandle;
  clearTimeout: (handle: TimeoutHandle) => void;
  timeoutMs?: number;
}

export interface LoadingHandoff {
  markFirstRenderedFrame(): void;
  start(onHandoff: () => void): void;
}

export function createLoadingHandoff<TimeoutHandle>(
  options: LoadingHandoffOptions<TimeoutHandle>,
): LoadingHandoff {
  let firstFrameRendered = false;
  let started = false;
  let handoffQueued = false;
  let onHandoff: (() => void) | null = null;
  let watchdogHandle: TimeoutHandle | undefined;

  const clearWatchdog = (): void => {
    if (watchdogHandle === undefined) return;
    options.clearTimeout(watchdogHandle);
    watchdogHandle = undefined;
  };

  const queueHandoff = (): void => {
    if (!started || handoffQueued || !onHandoff) return;
    handoffQueued = true;
    clearWatchdog();
    options.requestAnimationFrame(() => {
      const callback = onHandoff;
      onHandoff = null;
      callback?.();
    });
  };

  return {
    markFirstRenderedFrame(): void {
      if (handoffQueued) return;
      firstFrameRendered = true;
      queueHandoff();
    },
    start(callback: () => void): void {
      if (started) return;
      started = true;
      onHandoff = callback;
      watchdogHandle = options.setTimeout(
        queueHandoff,
        options.timeoutMs ?? LOADING_HANDOFF_WATCHDOG_MS,
      );
      if (handoffQueued) clearWatchdog();
      if (firstFrameRendered) queueHandoff();
    },
  };
}
