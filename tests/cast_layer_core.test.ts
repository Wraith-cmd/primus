import { describe, expect, it } from 'vitest';
import {
  CAST_KNOB_KEYS,
  CAST_LAYER_DEFAULTS,
  type CastLayerKnobs,
  type CastLayerStyle,
  type CastPoseOffsets,
  castEnvelope,
  castLayerOffsets,
  castLayerOffsetsInto,
  castLayerProgress,
  castLayerStyleFor,
  castPunch,
  emptyCastPoseOffsets,
  releaseImpulse,
} from '../src/render/characters/cast_layer_core';
import { type Entity, FISHING_CAST_ID, GATHER_CAST_ID } from '../src/sim/types';

// The pure cast-pose layer: numbers in, additive radians out. Everything here
// runs in plain Node with no WebGL context and no rig, which is the point of
// splitting the curve math out of visual.ts.

const K = CAST_LAYER_DEFAULTS;

function knobs(over: Partial<CastLayerKnobs> = {}): CastLayerKnobs {
  return { ...CAST_LAYER_DEFAULTS, ...over };
}

/** Sample a channel of the offsets across [0, 1] at a fixed resolution. */
function sample(
  channel: keyof CastPoseOffsets,
  style: CastLayerStyle,
  k: CastLayerKnobs,
  steps = 200,
): number[] {
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) out.push(castLayerOffsets(i / steps, style, k)[channel]);
  return out;
}

// castLayerStyleFor/castLayerProgress read only the cast fields, so a minimal
// partial entity is enough (same fixture shape as tests/cast_bar.test.ts).
function caster(over: Partial<Entity> = {}): Entity {
  return {
    kind: 'player',
    dead: false,
    castingAbility: 'fireball',
    castRemaining: 2,
    castTotal: 2,
    channeling: false,
    ...over,
  } as Entity;
}

describe('cast layer curve shape', () => {
  it('starts at zero and ends back at zero (no pose left behind)', () => {
    for (const style of ['hardcast', 'channel'] as const) {
      expect(castEnvelope(0, style, K)).toBe(0);
      expect(castEnvelope(1, style, K)).toBeCloseTo(0, 6);
      const start = castLayerOffsets(0, style, K);
      for (const key of Object.keys(start) as (keyof CastPoseOffsets)[]) {
        // toBeCloseTo, not toBe: a knob times a zero envelope can land on -0
        expect(start[key]).toBeCloseTo(0, 12);
      }
    }
  });

  it('builds over the windup instead of ramping linearly', () => {
    // strictly increasing to the windup peak
    let prev = -1;
    for (let p = 0; p <= K.windupEnd; p += K.windupEnd / 20) {
      const v = castEnvelope(p, 'hardcast', K);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
    expect(castEnvelope(K.windupEnd, 'hardcast', K)).toBeCloseTo(1, 6);
    // eased, not linear: the first tenth of the windup has barely moved, and
    // the midpoint sits ahead of a straight line through the same endpoints.
    expect(castEnvelope(K.windupEnd * 0.1, 'hardcast', K)).toBeLessThan(0.05);
    expect(castEnvelope(K.windupEnd * 0.5, 'hardcast', K)).toBeCloseTo(0.5, 6);
    expect(castEnvelope(K.windupEnd * 0.75, 'hardcast', K)).toBeGreaterThan(0.75);
  });

  it('keeps coiling through the hold rather than freezing', () => {
    const atPeak = castEnvelope(K.windupEnd, 'hardcast', K);
    const lateHold = castEnvelope(K.releaseStart - 1e-4, 'hardcast', K);
    expect(lateHold).toBeGreaterThan(atPeak);
    expect(lateHold).toBeCloseTo(1 + K.holdCoil, 3);
  });

  it('snaps on release: the envelope collapses far faster than it built', () => {
    const step = 1e-3;
    const rate = (p: number): number =>
      Math.abs(castEnvelope(p + step, 'hardcast', K) - castEnvelope(p, 'hardcast', K)) / step;
    const holdRate = rate((K.windupEnd + K.releaseStart) / 2);
    const buildRate = rate(K.windupEnd / 2);
    const releaseRate = rate(K.releaseStart + 1e-3);
    expect(releaseRate).toBeGreaterThan(buildRate * 3);
    expect(releaseRate).toBeGreaterThan(holdRate * 20);
  });

  it('swings through neutral on release (the overshoot that reads as a snap)', () => {
    const arms = sample('armMain', 'hardcast', knobs(), 400);
    const minArm = Math.min(...arms);
    const maxArm = Math.max(...arms);
    // the raise is negative on this rig, the swing-through positive
    expect(minArm).toBeLessThan(K.armMain * 0.9);
    expect(maxArm).toBeGreaterThan(0);
    // and the swing-through happens after the release begins
    const overshootAt = arms.findIndex((v) => v > 0) / 400;
    expect(overshootAt).toBeGreaterThan(K.releaseStart);
    // zero overshoot removes it entirely, without touching the build
    const noSwing = sample('armMain', 'hardcast', knobs({ overshoot: 0 }), 400);
    expect(Math.max(...noSwing)).toBeCloseTo(0, 6);
    expect(Math.min(...noSwing)).toBeCloseTo(minArm, 6);
  });

  it('fires the punch as an impulse inside the release window only', () => {
    expect(castPunch(0, 'hardcast', K)).toBe(0);
    expect(castPunch(K.releaseStart - 1e-6, 'hardcast', K)).toBe(0);
    expect(castPunch(1, 'hardcast', K)).toBe(0);
    const punches = sample('punch', 'hardcast', knobs(), 400);
    const peak = Math.max(...punches);
    expect(peak).toBeGreaterThan(0);
    const peakAt = punches.indexOf(peak) / 400;
    expect(peakAt).toBeGreaterThan(K.releaseStart);
    expect(peakAt).toBeLessThan(1);
    // fast attack, slower decay: the peak sits in the first third of the window
    expect(peakAt).toBeLessThan(K.releaseStart + (1 - K.releaseStart) / 3);
    // and it decays monotonically from the peak to zero
    for (let i = punches.indexOf(peak) + 1; i < punches.length; i++) {
      expect(punches[i]).toBeLessThanOrEqual(punches[i - 1] + 1e-12);
    }
  });

  it('shapes the raw release impulse with zero ends and one peak', () => {
    expect(releaseImpulse(0)).toBe(0);
    expect(releaseImpulse(1)).toBe(0);
    expect(releaseImpulse(-0.5)).toBe(0);
    expect(releaseImpulse(2)).toBe(0);
    expect(releaseImpulse(0.18)).toBeCloseTo(1, 6);
  });
});

describe('cast layer styles', () => {
  it('gives a channel a sustained sway and no punch', () => {
    const punches = sample('punch', 'channel', knobs(), 400);
    expect(Math.max(...punches.map(Math.abs))).toBe(0);
    // no swing-through: a channel just lets go
    const arms = sample('armMain', 'channel', knobs(), 400);
    expect(Math.max(...arms)).toBeCloseTo(0, 6);
    // the hold breathes: the envelope is non-monotonic between windup and release
    const mid: number[] = [];
    for (let i = 0; i <= 60; i++) {
      const p = K.windupEnd + ((K.releaseStart - K.windupEnd) * i) / 60;
      mid.push(castEnvelope(p, 'channel', K));
    }
    const rises = mid.filter((v, i) => i > 0 && v > mid[i - 1]).length;
    const falls = mid.filter((v, i) => i > 0 && v < mid[i - 1]).length;
    expect(rises).toBeGreaterThan(3);
    expect(falls).toBeGreaterThan(3);
    // zeroing the sway knob flattens it back to the plain coil
    const flat = castEnvelope(0.5, 'channel', knobs({ channelSway: 0 }));
    expect(flat).toBeCloseTo(castEnvelope(0.5, 'hardcast', knobs({ channelSway: 0 })), 12);
  });

  it("yields nothing at all for style 'none'", () => {
    for (let i = 0; i <= 20; i++) {
      const o = castLayerOffsets(i / 20, 'none', K);
      for (const key of Object.keys(o) as (keyof CastPoseOffsets)[]) expect(o[key]).toBe(0);
      expect(castEnvelope(i / 20, 'none', K)).toBe(0);
      expect(castPunch(i / 20, 'none', K)).toBe(0);
    }
  });

  it('clamps progress outside 0..1 instead of extrapolating', () => {
    expect(castLayerOffsets(-3, 'hardcast', K).armMain).toBeCloseTo(0, 12);
    expect(castLayerOffsets(9, 'hardcast', K).armMain).toBeCloseTo(0, 6);
  });
});

describe('cast layer knobs', () => {
  it('zeroes exactly one channel when its knob is zeroed', () => {
    const channels: [keyof CastLayerKnobs, keyof CastPoseOffsets][] = [
      ['torsoLean', 'torsoLean'],
      ['torsoTwist', 'torsoTwist'],
      ['armMain', 'armMain'],
      ['armOff', 'armOff'],
      ['headTilt', 'headTilt'],
      ['punch', 'punch'],
    ];
    for (const [knob, channel] of channels) {
      const k = knobs({ [knob]: 0 } as Partial<CastLayerKnobs>);
      const zeroed = sample(channel, 'hardcast', k, 100);
      expect(Math.max(...zeroed.map(Math.abs))).toBe(0);
      // every other channel is untouched
      for (const [, other] of channels) {
        if (other === channel) continue;
        const untouched = sample(other, 'hardcast', k, 100);
        const baseline = sample(other, 'hardcast', knobs(), 100);
        expect(untouched).toEqual(baseline);
      }
    }
  });

  it('scales linearly in each knob', () => {
    const doubled = knobs({ armMain: K.armMain * 2 });
    for (let i = 0; i <= 40; i++) {
      const p = i / 40;
      expect(castLayerOffsets(p, 'hardcast', doubled).armMain).toBeCloseTo(
        castLayerOffsets(p, 'hardcast', K).armMain * 2,
        12,
      );
    }
  });

  it('disables the whole layer at master 0', () => {
    const off = knobs({ master: 0 });
    for (let i = 0; i <= 40; i++) {
      const o = castLayerOffsets(i / 40, 'hardcast', off);
      for (const key of Object.keys(o) as (keyof CastPoseOffsets)[]) expect(o[key]).toBe(0);
    }
    // and halves it at 0.5
    const half = knobs({ master: 0.5 });
    expect(castLayerOffsets(0.5, 'hardcast', half).armMain).toBeCloseTo(
      castLayerOffsets(0.5, 'hardcast', K).armMain / 2,
      12,
    );
  });

  it('retimes the phases from the timing knobs', () => {
    const late = knobs({ windupEnd: 0.6, releaseStart: 0.9 });
    expect(castEnvelope(0.6, 'hardcast', late)).toBeCloseTo(1, 6);
    expect(castPunch(0.85, 'hardcast', late)).toBe(0);
    expect(castPunch(0.93, 'hardcast', late)).toBeGreaterThan(0);
  });

  it('survives nonsense knob values without producing NaN', () => {
    const bad = knobs({
      windupEnd: 0,
      releaseStart: -5,
      holdCoil: -3,
      overshoot: -1,
      channelSwayCycles: Number.NaN,
      master: Number.NaN,
      armMain: Number.NaN,
    });
    for (const style of ['hardcast', 'channel'] as const) {
      for (let i = 0; i <= 40; i++) {
        const o = castLayerOffsets(i / 40, style, bad);
        for (const key of Object.keys(o) as (keyof CastPoseOffsets)[]) {
          expect(Number.isFinite(o[key])).toBe(true);
        }
      }
    }
  });

  it('exposes every knob key exactly once, matching the defaults struct', () => {
    expect([...CAST_KNOB_KEYS].sort()).toEqual(Object.keys(CAST_LAYER_DEFAULTS).sort());
    expect(new Set(CAST_KNOB_KEYS).size).toBe(CAST_KNOB_KEYS.length);
    for (const key of CAST_KNOB_KEYS) expect(Number.isFinite(CAST_LAYER_DEFAULTS[key])).toBe(true);
  });
});

describe('cast layer determinism and allocation', () => {
  it('gives the same outputs for the same inputs, every time', () => {
    const run = (): string => {
      const rows: string[] = [];
      for (const style of ['none', 'hardcast', 'channel'] as const) {
        for (let i = 0; i <= 400; i++) {
          const o = castLayerOffsets(i / 400, style, knobs());
          rows.push(
            `${style}:${o.torsoLean},${o.torsoTwist},${o.armMain},${o.armOff},${o.headTilt},${o.punch}`,
          );
        }
      }
      return rows.join('|');
    };
    expect(run()).toBe(run());
  });

  it('has no time or randomness in its source (guarded, but pinned here too)', () => {
    // the architecture guard scans this file as a registered RENDER_PURE_CORE;
    // this case documents the contract at the unit level.
    const a = castLayerOffsets(0.42, 'hardcast', knobs());
    const b = castLayerOffsets(0.42, 'hardcast', knobs());
    expect(a).toEqual(b);
  });

  it('refills a caller-owned struct in place (no per-frame allocation)', () => {
    const out = emptyCastPoseOffsets();
    const returned = castLayerOffsetsInto(out, 0.5, 'hardcast', knobs());
    expect(returned).toBe(out);
    expect(out.armMain).not.toBe(0);
    // a following 'none' frame must clear it rather than leave the last pose
    castLayerOffsetsInto(out, 0.5, 'none', knobs());
    for (const key of Object.keys(out) as (keyof CastPoseOffsets)[]) expect(out[key]).toBe(0);
  });
});

describe('cast layer entity inputs', () => {
  it('picks hardcast vs channel from the entity', () => {
    expect(castLayerStyleFor(caster())).toBe('hardcast');
    expect(castLayerStyleFor(caster({ channeling: true }))).toBe('channel');
  });

  it('leaves activity casts, corpses, objects and idlers unlayered', () => {
    expect(castLayerStyleFor(caster({ castingAbility: FISHING_CAST_ID }))).toBe('none');
    expect(castLayerStyleFor(caster({ castingAbility: GATHER_CAST_ID }))).toBe('none');
    expect(castLayerStyleFor(caster({ castingAbility: null }))).toBe('none');
    expect(castLayerStyleFor(caster({ dead: true }))).toBe('none');
    expect(castLayerStyleFor(caster({ kind: 'object' }))).toBe('none');
    expect(castLayerStyleFor(caster({ castTotal: 0 }))).toBe('none');
  });

  it('runs progress from 0 at cast start to 1 at completion, divide-safe', () => {
    expect(castLayerProgress(caster({ castRemaining: 2, castTotal: 2 }))).toBeCloseTo(0);
    expect(castLayerProgress(caster({ castRemaining: 0.5, castTotal: 2 }))).toBeCloseTo(0.75);
    expect(castLayerProgress(caster({ castRemaining: 0, castTotal: 2 }))).toBeCloseTo(1);
    expect(castLayerProgress(caster({ castTotal: 0 }))).toBe(0);
    // an overlong remaining (a snapshot arriving early) clamps instead of going negative
    expect(castLayerProgress(caster({ castRemaining: 5, castTotal: 2 }))).toBe(0);
  });
});
