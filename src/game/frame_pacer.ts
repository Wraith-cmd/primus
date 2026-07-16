export interface FramePacerOptions {
  enabled: boolean;
  maxFps: number;
}

export interface FramePacerSnapshot {
  estimatedRefreshFps: number;
  targetFps: number;
  intentionallyPaced: boolean;
}

export interface FramePacerDecision extends FramePacerSnapshot {
  shouldRun: boolean;
}

const REFRESH_SAMPLE_COUNT = 30;
const REFRESH_CALIBRATION_SAMPLES = 8;
export const FRAME_PACER_CALIBRATION_CALLBACKS = REFRESH_CALIBRATION_SAMPLES + 1;
const MIN_REFRESH_INTERVAL_MS = 4;
const MAX_REFRESH_INTERVAL_MS = 50;
const SUSPEND_GAP_MS = 250;
const FRAME_RATE_TOLERANCE = 1.03;
const EARLY_FRAME_TOLERANCE_MS = 0.5;
const REFRESH_CHANGE_TOLERANCE = 0.12;
const TARGET_DIVISOR_TOLERANCE = 0.08;
const REFRESH_CHANGE_CONFIRMATION_SAMPLES = 6;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function pacedFrameRateFor(refreshFps: number, maxFps: number): number {
  if (!Number.isFinite(maxFps) || maxFps <= 0) return 0;
  if (!Number.isFinite(refreshFps) || refreshFps <= 0) return maxFps;
  if (refreshFps <= maxFps * FRAME_RATE_TOLERANCE) return refreshFps;
  const divisor = Math.max(1, Math.ceil(refreshFps / (maxFps * FRAME_RATE_TOLERANCE)));
  return refreshFps / divisor;
}
function callbackRateMatchesTarget(refreshFps: number, targetFps: number): boolean {
  if (refreshFps <= 0 || targetFps <= 0) return false;
  const ratio = refreshFps / targetFps;
  const divisor = Math.round(ratio);
  return divisor >= 1 && Math.abs(ratio - divisor) <= TARGET_DIVISOR_TOLERANCE;
}

export class FramePacer {
  private enabled: boolean;
  private readonly maxFps: number;
  private lastCallbackMs: number | null = null;
  private remainderMs = 0;
  private calibrationGate = false;
  private collectCalibrationSample = false;
  private trustedRefreshFps = 0;
  private refreshMismatchSamples = 0;
  private refreshIntervalsMs: number[] = [];
  private estimatedRefreshFps = 0;
  private targetFps: number;
  private intentionallyPaced = false;

  constructor(options: FramePacerOptions) {
    this.enabled = options.enabled;
    this.maxFps = Number.isFinite(options.maxFps) && options.maxFps > 0 ? options.maxFps : 60;
    this.targetFps = this.maxFps;
  }

  snapshot(): FramePacerSnapshot {
    return {
      estimatedRefreshFps: this.estimatedRefreshFps,
      targetFps: this.targetFps,
      intentionallyPaced: this.intentionallyPaced,
    };
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.remainderMs = 0;
    if (enabled && this.trustedRefreshFps === 0) {
      this.beginCalibration();
    } else {
      this.calibrationGate = false;
      this.collectCalibrationSample = false;
    }
    this.updateRefreshEstimate();
  }

  observe(nowMs: number): void {
    const callbackIntervalMs = this.captureCallbackInterval(nowMs);
    if (callbackIntervalMs === null || !this.recordRefreshInterval(callbackIntervalMs)) return;
    if (this.refreshIntervalsMs.length < REFRESH_CALIBRATION_SAMPLES) return;
    this.trustedRefreshFps = this.measuredRefreshFps();
    this.updateRefreshEstimate();
  }

  step(nowMs: number): FramePacerDecision {
    if (!Number.isFinite(nowMs)) return this.decision(true);
    const callbackIntervalMs = this.captureCallbackInterval(nowMs);
    if (callbackIntervalMs === null) {
      if (this.calibrationGate) this.collectCalibrationSample = true;
      return this.decision(!this.calibrationGate);
    }
    if (!this.enabled) return this.decision(true);
    if (this.calibrationGate) return this.stepCalibration(callbackIntervalMs);
    if (!this.recordRefreshInterval(callbackIntervalMs)) {
      return this.decision(true);
    }

    if (this.refreshIntervalsMs.length < REFRESH_CALIBRATION_SAMPLES) {
      return this.decision(true);
    }
    const measuredRefreshFps = this.measuredRefreshFps();
    const refreshChanged =
      this.trustedRefreshFps > 0 &&
      Math.abs(measuredRefreshFps / this.trustedRefreshFps - 1) > REFRESH_CHANGE_TOLERANCE;
    const incompatibleRate =
      refreshChanged && !callbackRateMatchesTarget(measuredRefreshFps, this.targetFps);
    this.refreshMismatchSamples = incompatibleRate ? this.refreshMismatchSamples + 1 : 0;
    if (this.refreshMismatchSamples >= REFRESH_CHANGE_CONFIRMATION_SAMPLES) {
      this.beginCalibration(true);
      return this.decision(false);
    }
    this.updateRefreshEstimate(this.trustedRefreshFps || measuredRefreshFps);

    if (!this.intentionallyPaced) {
      this.remainderMs = 0;
      return this.decision(true);
    }

    const targetIntervalMs = 1000 / this.targetFps;
    this.remainderMs += callbackIntervalMs;
    if (this.remainderMs + EARLY_FRAME_TOLERANCE_MS < targetIntervalMs) {
      return this.decision(false);
    }
    this.remainderMs -= targetIntervalMs;
    if (this.remainderMs >= targetIntervalMs) this.remainderMs %= targetIntervalMs;
    return this.decision(true);
  }

  private decision(shouldRun: boolean): FramePacerDecision {
    return { shouldRun, ...this.snapshot() };
  }

  private captureCallbackInterval(nowMs: number): number | null {
    if (!Number.isFinite(nowMs)) return null;
    if (this.lastCallbackMs === null) {
      this.lastCallbackMs = nowMs;
      return null;
    }
    const callbackIntervalMs = nowMs - this.lastCallbackMs;
    this.lastCallbackMs = nowMs;
    if (callbackIntervalMs <= 0 || callbackIntervalMs >= SUSPEND_GAP_MS) {
      this.remainderMs = 0;
      this.calibrationGate = false;
      this.collectCalibrationSample = false;
      return null;
    }
    return callbackIntervalMs;
  }

  private recordRefreshInterval(callbackIntervalMs: number): boolean {
    if (
      callbackIntervalMs < MIN_REFRESH_INTERVAL_MS ||
      callbackIntervalMs > MAX_REFRESH_INTERVAL_MS
    ) {
      return false;
    }
    this.refreshIntervalsMs.push(callbackIntervalMs);
    if (this.refreshIntervalsMs.length > REFRESH_SAMPLE_COUNT) this.refreshIntervalsMs.shift();
    return true;
  }

  private measuredRefreshFps(): number {
    return this.refreshIntervalsMs.length > 0 ? 1000 / median(this.refreshIntervalsMs) : 0;
  }

  private stepCalibration(callbackIntervalMs: number): FramePacerDecision {
    if (!this.collectCalibrationSample) {
      this.collectCalibrationSample = true;
      return this.decision(false);
    }
    this.collectCalibrationSample = false;
    if (!this.recordRefreshInterval(callbackIntervalMs)) {
      this.calibrationGate = false;
      return this.decision(true);
    }
    if (this.refreshIntervalsMs.length < REFRESH_CALIBRATION_SAMPLES) {
      return this.decision(true);
    }
    this.trustedRefreshFps = this.measuredRefreshFps();
    this.calibrationGate = false;
    this.updateRefreshEstimate();
    return this.decision(true);
  }

  private beginCalibration(nextSampleIsClean = false): void {
    this.remainderMs = 0;
    this.refreshIntervalsMs = [];
    this.calibrationGate = true;
    this.collectCalibrationSample = nextSampleIsClean;
    this.refreshMismatchSamples = 0;
  }

  private updateRefreshEstimate(
    refreshFps = this.trustedRefreshFps || this.measuredRefreshFps(),
  ): void {
    this.estimatedRefreshFps = refreshFps;
    this.targetFps = pacedFrameRateFor(this.estimatedRefreshFps, this.maxFps);
    this.intentionallyPaced = this.enabled && this.targetFps < this.estimatedRefreshFps - 0.5;
  }
}
