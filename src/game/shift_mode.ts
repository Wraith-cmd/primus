// Shift mode: the thin consumer over shift_mode_core.
//
// One switch (the `shiftMode` setting, its options row, and its rebindable key)
// that silences every audio bus and holds the render loop to SHIFT_MODE_FPS_CAP,
// for playing on a handheld battery or beside other people at work.
//
// It owns no DOM and no audio singleton: main.ts injects the volume sinks and a
// reader for the player's STORED volumes, so this module unit-tests directly
// (the gamepad.ts-over-gamepad_map.ts split). The audio half NEVER writes a
// stored setting; it re-derives the live mix, so a bus the player muted by hand
// is still muted after shift mode is turned back off.

import { type AudioVolumes, resolveAudioMix, ShiftModeFramePacer } from './shift_mode_core';

/** Where the resolved mix is pushed (main.ts wires the audio/sfx/music/voice singletons). */
export interface ShiftModeAudioSinks {
  setSfxVolume(v: number): void;
  setMusicVolume(v: number): void;
  setVoiceVolume(v: number): void;
}

export interface ShiftModeDeps {
  /** The player's stored 0..1 volumes, read LIVE from Settings on every apply. */
  storedVolumes(): AudioVolumes;
  sinks: ShiftModeAudioSinks;
}

export class ShiftMode {
  private on = false;
  private readonly pacer = new ShiftModeFramePacer();

  constructor(private readonly deps: ShiftModeDeps) {}

  get enabled(): boolean {
    return this.on;
  }

  /** True while the render loop is being paced (mirrors `enabled`; exposed for
   *  diagnostics and the pacer's own tests). */
  get frameCapped(): boolean {
    return this.pacer.capped;
  }

  /** Engage or release shift mode and push the resulting audio mix. */
  setEnabled(on: boolean): void {
    this.on = on;
    this.pacer.setCapped(on);
    this.applyAudio();
  }

  /** Re-push the live mix from the current stored volumes. main.ts calls this
   *  whenever a volume setting changes, so moving a slider while shift mode is on
   *  stores the new value without unmuting the game. */
  applyAudio(): void {
    const mix = resolveAudioMix(this.deps.storedVolumes(), this.on);
    this.deps.sinks.setSfxVolume(mix.sfx);
    this.deps.sinks.setMusicVolume(mix.music);
    this.deps.sinks.setVoiceVolume(mix.voice);
  }

  /** The render loop's gate: true when the frame at `nowMs` should run. Always
   *  true while shift mode is off, so the uncapped path costs one comparison. */
  allowFrame(nowMs: number): boolean {
    return this.pacer.allow(nowMs);
  }
}
