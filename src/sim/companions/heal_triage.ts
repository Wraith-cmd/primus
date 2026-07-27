// Companion healer triage.
//
// The delve companion heals on a fixed interval: every N seconds it tops up
// whoever is lowest, whether or not anyone needed it, and it cannot answer a
// spike that lands between ticks. That reads as a healing turret rather than a
// healer, and it is the single loudest "this is a bot" tell in a group fight.
//
// This core replaces the timer question ("has N seconds elapsed?") with a triage
// question ("does anyone need help, and how badly?"). Urgency then drives BOTH
// how soon the next heal may fire and how large it is, so a companion reacts to
// a tank spike the way a player would instead of waiting out its interval.
//
// Pure leaf: no SimContext, no entities, no rng, no clock. A Vitest drives it
// directly with plain numbers. The owning system module reads real entities and
// hands their shape in.

/** How badly the party needs a heal right now. Ordered least to most severe. */
export type HealUrgency = 'none' | 'topOff' | 'urgent' | 'emergency';

/** Below this fraction of max health an ally is about to die: heal now, big,
 *  ignoring the ordinary pacing interval. */
export const EMERGENCY_FRAC = 0.3;
/** Below this an ally is in real trouble and gets the short interval. */
export const URGENT_FRAC = 0.6;
/** Below this is worth a cast when nothing more pressing is happening. */
export const TOP_OFF_FRAC = 0.92;

/** Seconds between heals at each urgency. Emergency is 0: it fires the moment
 *  triage sees it, which is what makes a spike survivable. */
export const HEAL_INTERVAL_BY_URGENCY: Record<HealUrgency, number> = {
  none: Number.POSITIVE_INFINITY,
  topOff: 4,
  urgent: 1.5,
  emergency: 0,
};

/** Heal size as a fraction of the target's max health, before rank scaling.
 *  An emergency heal is worth more than a top-off: a healer commits its big cast
 *  when it matters, not on a rotation. */
export const HEAL_PCT_BY_URGENCY: Record<HealUrgency, number> = {
  none: 0,
  topOff: 0.05,
  urgent: 0.09,
  emergency: 0.16,
};

export interface HealCandidate {
  id: number;
  /** Current health as a fraction of max, 0..1. A dead ally is not a candidate
   *  and should be filtered by the caller (revival is a separate mechanic). */
  hpFrac: number;
  /** Distance from the healer, in world units. */
  distance: number;
  /** Tanks take sustained, predictable damage and losing one wipes the pull, so
   *  they win ties against a dps at the same health. */
  isTank?: boolean;
}

export interface TriagePlan {
  targetId: number | null;
  urgency: HealUrgency;
  /** Fraction of the target's max health to restore. 0 when nothing to do. */
  healFrac: number;
  /** Seconds to wait before the next heal may fire. */
  nextIntervalSeconds: number;
}

export const NO_HEAL: TriagePlan = {
  targetId: null,
  urgency: 'none',
  healFrac: 0,
  nextIntervalSeconds: HEAL_INTERVAL_BY_URGENCY.none,
};

export function urgencyFor(hpFrac: number): HealUrgency {
  if (hpFrac < EMERGENCY_FRAC) return 'emergency';
  if (hpFrac < URGENT_FRAC) return 'urgent';
  if (hpFrac < TOP_OFF_FRAC) return 'topOff';
  return 'none';
}

/** Pick who to heal and how hard.
 *
 *  Deterministic by construction: candidates are compared on health, then the
 *  tank flag, then id, so the same party in the same state always yields the
 *  same plan regardless of iteration order. That matters because this runs
 *  inside the sim tick and a wobble here would fork the world. */
export function planHeal(candidates: readonly HealCandidate[], range: number): TriagePlan {
  let best: HealCandidate | null = null;
  for (const c of candidates) {
    if (c.distance > range) continue;
    if (c.hpFrac >= TOP_OFF_FRAC) continue;
    if (best === null) {
      best = c;
      continue;
    }
    if (c.hpFrac !== best.hpFrac) {
      if (c.hpFrac < best.hpFrac) best = c;
      continue;
    }
    const cTank = c.isTank === true;
    const bestTank = best.isTank === true;
    if (cTank !== bestTank) {
      if (cTank) best = c;
      continue;
    }
    if (c.id < best.id) best = c;
  }
  if (!best) return NO_HEAL;
  const urgency = urgencyFor(best.hpFrac);
  if (urgency === 'none') return NO_HEAL;
  return {
    targetId: best.id,
    urgency,
    healFrac: HEAL_PCT_BY_URGENCY[urgency],
    nextIntervalSeconds: HEAL_INTERVAL_BY_URGENCY[urgency],
  };
}
