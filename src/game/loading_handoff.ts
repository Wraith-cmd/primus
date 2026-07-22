export const LOADING_HANDOFF_WATCHDOG_MS = 5_000;
export const LOADING_HANDOFF_COMPLETION_WATCHDOG_MS = 5_000;

export interface LoadingHandoffOptions<TimeoutHandle> {
  requestAnimationFrame: (callback: () => void) => void;
  setTimeout: (callback: () => void, delayMs: number) => TimeoutHandle;
  clearTimeout: (handle: TimeoutHandle) => void;
  timeoutMs?: number;
  completionTimeoutMs?: number;
}

export interface LoadingHandoff {
  markFirstRenderedFrame(): void;
  start(onHandoff: () => void, onWatchdog?: () => void): void;
}

export function createLoadingHandoff<TimeoutHandle>(
  options: LoadingHandoffOptions<TimeoutHandle>,
): LoadingHandoff {
  let firstFrameRendered = false;
  let started = false;
  let handoffQueued = false;
  let onHandoff: (() => void) | null = null;
  let onWatchdog: (() => void) | null = null;
  let watchdogHandle: TimeoutHandle | undefined;

  const clearWatchdog = (): void => {
    if (watchdogHandle === undefined) return;
    options.clearTimeout(watchdogHandle);
    watchdogHandle = undefined;
  };

  const completeHandoff = (): void => {
    if (!started || !onHandoff) return;
    handoffQueued = true;
    clearWatchdog();
    const callback = onHandoff;
    onHandoff = null;
    onWatchdog = null;
    callback();
  };

  const fireWatchdog = (): void => {
    watchdogHandle = undefined;
    if (!started || !onHandoff) return;
    if (!onWatchdog) {
      completeHandoff();
      return;
    }
    const callback = onWatchdog;
    onWatchdog = null;
    watchdogHandle = options.setTimeout(
      completeHandoff,
      options.completionTimeoutMs ?? LOADING_HANDOFF_COMPLETION_WATCHDOG_MS,
    );
    callback();
  };

  const queueHandoff = (): void => {
    if (!started || handoffQueued || !onHandoff) return;
    handoffQueued = true;
    options.requestAnimationFrame(completeHandoff);
  };

  return {
    markFirstRenderedFrame(): void {
      if (handoffQueued) return;
      firstFrameRendered = true;
      queueHandoff();
    },
    start(callback: () => void, watchdogCallback?: () => void): void {
      if (started) return;
      started = true;
      onHandoff = callback;
      onWatchdog = watchdogCallback ?? null;
      watchdogHandle = options.setTimeout(
        fireWatchdog,
        options.timeoutMs ?? LOADING_HANDOFF_WATCHDOG_MS,
      );
      if (firstFrameRendered) queueHandoff();
    },
  };
}
