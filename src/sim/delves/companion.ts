// I2c delve companion AI: Acolyte Tessa's per-tick brain, MOVED VERBATIM from
// Sim.updateDelveCompanion behind the SimContext seam (move + import, not a rewrite).
//
// She runs INSIDE the shared updateMob mob-AI pass, in entity-iteration order,
// dispatched BEFORE the hunter/warlock pet branch (the mob-AI coordinator calls
// `ctx.updateDelveCompanion(mob)` for an owned, non-stunned companion mob). Her
// rng-drawing callees (mobSwing -> dealDamage crit/hit rolls) therefore fire at the
// global stream position set by where she sits in `entities.values()` order, so the
// statement + branch + draw order here is load-bearing and preserved exactly.
//
// Two reflexes were added on top of the moved body, both via the shared
// `companions/reactions.ts` wiring so she and the dungeon-party companions behave
// the same: ground-hazard avoidance BEFORE combat movement, and an interrupt
// whenever the policy names a target. Both draw ZERO rng, so her position in the
// global draw order is unchanged; what changes is where she stands and whether a
// channel completes, which is exactly the point.
//
// Lifecycle (spawn/despawn/identity) and the vendor upgrade/read-API stay on Sim;
// this slice is the per-tick brain only. `mobSwing`/`moveToward` are shared entry
// points consumed via the seam (still defined on Sim); `maybeCompanionBark` stays on
// Sim (foreign quest/delve callers). The heal is a DIRECT hp mutation + heal/spellfx
// emit (no aura). `src/sim`-pure: no DOM/Three/Math.random.

import { type HealCandidate, planHeal } from '../companions/heal_triage';
import { companionAvoidGround, tryCompanionInterrupt } from '../companions/reactions';
import * as deedsMod from '../deeds';
import type { SimContext } from '../sim_context';
import {
  DELVE_COMPANION_MAX_RANK,
  DT,
  dist2d,
  type Entity,
  emptyMoveInput,
  MELEE_RANGE,
  PET_TELEPORT_DISTANCE,
  steadyAngleTo,
} from '../types';

const DELVE_COMPANION_HEAL_RANGE = 22;
const DELVE_COMPANION_FOLLOW = 4;
// Heal size is a PERCENT of the target's max HP so output stays relevant as player
// health grows (the old flat `8 + rank*4` decayed to noise by level 9). The percent
// now comes from the triage plan's urgency band; rank multiplies it.
// Rank multiplies the triage plan instead of replacing it, so an upgraded
// companion heals harder at every urgency band. Ratios mirror the old flat
// per-rank table (0.06 / 0.08 / 0.10) so rank progression feels unchanged.
const COMPANION_RANK_HEAL_MULT = [0, 1, 1.33, 1.67];
// How often triage re-checks when nobody needs healing. Short enough that a
// sudden spike is seen almost at once, long enough that an idle companion is
// not re-scanning the party every tick.
const COMPANION_TRIAGE_POLL_SECONDS = 0.5;

export function updateDelveCompanion(ctx: SimContext, companion: Entity): void {
  const owner = companion.ownerId !== null ? ctx.entities.get(companion.ownerId) : null;
  if (owner?.kind !== 'player') {
    ctx.dropEntity(companion.id);
    return;
  }
  const run = ctx.delveRunForPlayer(owner.id);
  if (!run?.companion || run.companion.entityId !== companion.id) {
    ctx.dropEntity(companion.id);
    return;
  }
  // Rank 3 boon (the board's "revives a fallen ally once per run"): the owner,
  // or a dead party member in heal range, comes back at half health, mirroring
  // the in-delve respawn refill. Checked before the dead-owner despawn so a
  // solo owner's death can be caught. No rng draws; deterministic pick order
  // (owner first, then party-member order).
  const companionRank =
    ctx.players.get(owner.id)?.companionUpgrades[run.companion.companionId] ?? 1;
  if (companionRank >= DELVE_COMPANION_MAX_RANK && !run.companionReviveUsed) {
    let fallen: Entity | null = owner.dead ? owner : null;
    if (!fallen && run.partyKey) {
      for (const pid of ctx.partyMembersForKey(run.partyKey)) {
        const ally = ctx.entities.get(pid);
        if (ally?.dead && dist2d(companion.pos, ally.pos) <= DELVE_COMPANION_HEAL_RANGE) {
          fallen = ally;
          break;
        }
      }
    }
    if (fallen) {
      // Lives on the run (not the re-minted companion state) so leaving and
      // re-entering mid-run cannot recharge the boon.
      run.companionReviveUsed = true;
      fallen.dead = false;
      // Clear any movement intent held at death so the revived ally does not walk
      // off on its own with no key held (issue 1651, companion-revive path). fallen
      // is always a player (owner or a partyMembersForKey ally), so it has a meta.
      const fallenMeta = ctx.players.get(fallen.id);
      if (fallenMeta) Object.assign(fallenMeta.moveInput, emptyMoveInput());
      fallen.hp = Math.max(1, Math.round(fallen.maxHp * 0.5));
      if (fallen.resourceType === 'mana')
        fallen.resource = Math.max(fallen.resource, Math.round(fallen.maxResource * 0.5));
      ctx.emit({ type: 'heal', targetId: fallen.id, amount: fallen.hp });
      ctx.emit({
        type: 'spellfx',
        sourceId: companion.id,
        targetId: fallen.id,
        school: 'holy',
        fx: 'tick',
      });
      ctx.maybeCompanionBark(run, owner.id, 'ally_revive');
      // The rank 3 boon actually saved someone.
      deedsMod.onCompanionReviveForDeeds(ctx, owner.id);
    }
  }
  if (owner.dead) {
    ctx.despawnDelveCompanion(run);
    return;
  }
  if (owner.inCombat) ctx.maybeCompanionBark(run, owner.id, 'combat_start');
  if (owner.hp / Math.max(1, owner.maxHp) < 0.3) ctx.maybeCompanionBark(run, owner.id, 'low_hp');

  companion.swingTimer = (companion.swingTimer ?? 0) - DT;
  let combatTarget: Entity | null = null;
  if (owner.targetId !== null) {
    const t = ctx.entities.get(owner.targetId);
    if (t && !t.dead && ctx.isHostileTo(companion, t)) combatTarget = t;
  }
  if (!combatTarget) {
    let best: Entity | null = null;
    let bestD = 40;
    for (const m of ctx.entities.values()) {
      if (m.kind !== 'mob' || m.dead || !ctx.isHostileTo(companion, m)) continue;
      const engagingOwner = m.aggroTargetId === owner.id;
      const ownerOffense =
        owner.targetId === m.id && (owner.autoAttack || owner.inCombat || m.threat.has(owner.id));
      if (!engagingOwner && !ownerOffense) continue;
      const d = dist2d(companion.pos, m.pos);
      if (d < bestD) {
        best = m;
        bestD = d;
      }
    }
    combatTarget = best;
  }
  // Ground-hazard avoidance runs BEFORE any combat movement (companions/
  // ground_avoidance.ts). Standing in a fire puddle to stay in melee is the loudest
  // "this is a bot" tell there is, so the dodge wins over closing the gap, and the
  // anchor keeps the chosen spot inside melee reach of the target where it can. The
  // core returns null whenever nothing hostile covers her, so a hazard-free tick is
  // byte-identical to the pre-existing movement.
  const reach = MELEE_RANGE * 0.9;
  const dodged = companionAvoidGround(
    ctx,
    companion,
    combatTarget ? { x: combatTarget.pos.x, z: combatTarget.pos.z, range: reach } : null,
  );
  // Kicking the healer add's channel is the other thing a player does and she did
  // not (companions/interrupt_policy.ts). The policy holds the cooldown unless the
  // cast is both dangerous and still running when the kick would land, so this is
  // a no-op on a tick with nothing worth stopping. Draws no rng.
  tryCompanionInterrupt(ctx, companion);
  if (combatTarget) {
    companion.inCombat = true;
    const cd = dist2d(companion.pos, combatTarget.pos);
    if (cd > reach) {
      companion.swingTimer = Math.max(0, (companion.swingTimer ?? 0) - DT);
      if (!dodged && !ctx.isRooted(companion)) {
        ctx.moveToward(
          companion,
          combatTarget.pos,
          companion.moveSpeed * ctx.moveSpeedMult(companion),
        );
      }
    } else {
      companion.facing = steadyAngleTo(companion.pos, combatTarget.pos, companion.facing);
      companion.swingTimer = (companion.swingTimer ?? 0) - DT;
      if (companion.swingTimer <= 0) {
        ctx.mobSwing(companion, combatTarget);
        companion.swingTimer = companion.weapon.speed * ctx.swingIntervalMult(companion);
      }
    }
  } else {
    companion.inCombat = false;
    companion.swingTimer = Math.max(0, (companion.swingTimer ?? 0) - DT);
  }

  // Healing is triage-driven, not interval-driven: the plan's urgency sets both
  // the heal size and how soon the next one may fire, so a spike on the tank is
  // answered immediately instead of waiting out a fixed cooldown. When nobody
  // needs help the companion re-checks on a short poll rather than committing to
  // a long sleep it cannot wake from.
  companion.wanderTimer = (companion.wanderTimer ?? 0) - DT;
  if (companion.wanderTimer <= 0) {
    const rank = ctx.players.get(owner.id)?.companionUpgrades[run.companion.companionId] ?? 1;
    const candidates: HealCandidate[] = [];
    if (!owner.dead) {
      candidates.push({
        id: owner.id,
        hpFrac: owner.hp / Math.max(1, owner.maxHp),
        distance: dist2d(companion.pos, owner.pos),
        isTank: true, // the owner holds the pull in a solo delve
      });
    }
    if (run.partyKey) {
      for (const pid of ctx.partyMembersForKey(run.partyKey)) {
        if (pid === owner.id) continue;
        const ally = ctx.entities.get(pid);
        if (!ally || ally.dead) continue;
        candidates.push({
          id: ally.id,
          hpFrac: ally.hp / Math.max(1, ally.maxHp),
          distance: dist2d(companion.pos, ally.pos),
        });
      }
    }
    const plan = planHeal(candidates, DELVE_COMPANION_HEAL_RANGE);
    const target = plan.targetId !== null ? ctx.entities.get(plan.targetId) : null;
    if (target && !target.dead) {
      // Rank scales the whole plan rather than replacing it, so an upgraded
      // companion heals harder at every urgency instead of flattening the bands.
      const rankMult = COMPANION_RANK_HEAL_MULT[Math.min(rank, DELVE_COMPANION_MAX_RANK)] ?? 1;
      const healed = Math.min(
        target.maxHp - target.hp,
        Math.round(target.maxHp * plan.healFrac * rankMult),
      );
      if (healed > 0) {
        target.hp += healed;
        ctx.emit({ type: 'heal', targetId: target.id, amount: healed });
        ctx.emit({
          type: 'spellfx',
          sourceId: companion.id,
          targetId: target.id,
          school: 'holy',
          fx: 'tick',
        });
      }
      companion.wanderTimer = plan.nextIntervalSeconds;
    } else {
      companion.wanderTimer = COMPANION_TRIAGE_POLL_SECONDS;
    }
  }
  if (combatTarget) return;
  // A dodge already spent this tick's movement; walking back to heel now would
  // undo it and put her straight back in the puddle.
  if (dodged) return;
  const d = dist2d(companion.pos, owner.pos);
  if (d > PET_TELEPORT_DISTANCE) {
    companion.pos = { ...owner.pos };
    companion.prevPos = { ...companion.pos };
    ctx.rebucket(companion);
  } else if (d > DELVE_COMPANION_FOLLOW && !ctx.isRooted(companion)) {
    ctx.moveToward(companion, owner.pos, companion.moveSpeed * ctx.moveSpeedMult(companion));
  }
}
