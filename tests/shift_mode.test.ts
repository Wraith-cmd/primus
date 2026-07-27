import { beforeEach, describe, expect, it } from 'vitest';
import { ShiftMode } from '../src/game/shift_mode';
import { SHIFT_MODE_FRAME_INTERVAL_MS } from '../src/game/shift_mode_core';

// A stand-in for the audio/sfx/music/voice singletons main.ts injects: it only
// records what was pushed, so the controller's contract is asserted without
// WebAudio. `stored` stands in for the live Settings store.
function rig(stored = { sfx: 0.8, music: 0.8, voice: 0.9 }) {
  const pushed: { sfx: number[]; music: number[]; voice: number[] } = {
    sfx: [],
    music: [],
    voice: [],
  };
  const mode = new ShiftMode({
    storedVolumes: () => ({ ...stored }),
    sinks: {
      setSfxVolume: (v) => pushed.sfx.push(v),
      setMusicVolume: (v) => pushed.music.push(v),
      setVoiceVolume: (v) => pushed.voice.push(v),
    },
  });
  const last = () => ({
    sfx: pushed.sfx[pushed.sfx.length - 1],
    music: pushed.music[pushed.music.length - 1],
    voice: pushed.voice[pushed.voice.length - 1],
  });
  return { mode, pushed, last, stored };
}

describe('ShiftMode: audio', () => {
  it('starts off, with no push until something applies', () => {
    const { mode, pushed } = rig();
    expect(mode.enabled).toBe(false);
    expect(mode.frameCapped).toBe(false);
    expect(pushed.sfx).toEqual([]);
  });

  it('silences all three buses when enabled', () => {
    const { mode, last } = rig();
    mode.setEnabled(true);
    expect(mode.enabled).toBe(true);
    expect(last()).toEqual({ sfx: 0, music: 0, voice: 0 });
  });

  it('restores the stored volumes when disabled', () => {
    const { mode, last } = rig();
    mode.setEnabled(true);
    mode.setEnabled(false);
    expect(last()).toEqual({ sfx: 0.8, music: 0.8, voice: 0.9 });
  });

  // The manual-mute contract, end to end: the player had already muted music by
  // hand. Shift mode must not resurrect it on the way out.
  it('does not clobber a mute the player set manually', () => {
    const { mode, last } = rig({ sfx: 0.8, music: 0, voice: 0.9 });
    mode.setEnabled(true);
    expect(last()).toEqual({ sfx: 0, music: 0, voice: 0 });
    mode.setEnabled(false);
    expect(last()).toEqual({ sfx: 0.8, music: 0, voice: 0.9 });
  });

  // A volume slider moved WHILE shift mode is on: Settings stores it (the rig's
  // `stored` object), applyAudio re-pushes, and the game must stay silent.
  it('keeps the game silent when a volume changes while shift mode is on', () => {
    const { mode, last, stored } = rig();
    mode.setEnabled(true);
    stored.music = 0.35;
    mode.applyAudio();
    expect(last()).toEqual({ sfx: 0, music: 0, voice: 0 });
    // ...and the new value, not the pre-shift-mode one, is what comes back.
    mode.setEnabled(false);
    expect(last()).toEqual({ sfx: 0.8, music: 0.35, voice: 0.9 });
  });

  it('honours a bus muted by hand while shift mode was on', () => {
    const { mode, last, stored } = rig();
    mode.setEnabled(true);
    stored.sfx = 0;
    mode.applyAudio();
    mode.setEnabled(false);
    expect(last()).toEqual({ sfx: 0, music: 0.8, voice: 0.9 });
  });

  it('re-pushes on a redundant enable without changing the mix', () => {
    const { mode, last, pushed } = rig();
    mode.setEnabled(true);
    const pushes = pushed.sfx.length;
    mode.setEnabled(true);
    expect(mode.enabled).toBe(true);
    expect(pushed.sfx.length).toBe(pushes + 1);
    expect(last()).toEqual({ sfx: 0, music: 0, voice: 0 });
  });
});

describe('ShiftMode: frame cap', () => {
  let rigged: ReturnType<typeof rig>;

  beforeEach(() => {
    rigged = rig();
  });

  it('lets every frame through while off', () => {
    const { mode } = rigged;
    for (let i = 0; i < 8; i++) expect(mode.allowFrame(i)).toBe(true);
  });

  it('paces the loop once enabled', () => {
    const { mode } = rigged;
    mode.setEnabled(true);
    expect(mode.frameCapped).toBe(true);
    expect(mode.allowFrame(0)).toBe(true);
    expect(mode.allowFrame(16.7)).toBe(false);
    expect(mode.allowFrame(SHIFT_MODE_FRAME_INTERVAL_MS + 1)).toBe(true);
  });

  it('uncaps the loop again when disabled', () => {
    const { mode } = rigged;
    mode.setEnabled(true);
    mode.allowFrame(0);
    expect(mode.allowFrame(1)).toBe(false);
    mode.setEnabled(false);
    expect(mode.frameCapped).toBe(false);
    expect(mode.allowFrame(2)).toBe(true);
    expect(mode.allowFrame(3)).toBe(true);
  });
});
