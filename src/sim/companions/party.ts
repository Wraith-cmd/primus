// The dungeon companion party: four AI allies so one player can run a five-man.
//
// `role_kit.ts` already answers "what does a tank/healer/dps want out of this
// fight?", `heal_triage.ts` answers "who needs a heal?", and `reactions.ts`
// wires the dodge and the interrupt to the live world. This module is the SYSTEM
// that owns the party itself: recruiting it at a dungeon door, scaling each
// companion to the owner at summon time, running each one's kit every tick, and
// tearing the whole thing down when the owner leaves.
//
// Recruiting is gated to DUNGEON ENTRANCES by product decision, and the gate is
// `canRecruit` in role_kit.ts, not a second copy of the rule here. Companions are
// ordinary sim entities: `createMob` + `addEntity`, owned by the recruiter, on the
// same roster as a hunter pet. Nothing here is behind `ALLOW_DEV_COMMANDS`, and
// nothing here goes through the `/dev` spawn path.
//
// STATE STAYS ON `Sim`. The party table (`companionParties`, keyed by owner pid)
// and the reflex timers (`companionCooldowns`, keyed by companion entity id) are
// `Sim` fields reached here as live `SimContext` views; this module holds only
// FUNCTIONS.
//
// Determinism. The per-companion brain runs inside the mob loop in
// entity-iteration order (the delve companion's position exactly), so its only
// rng draws are the ones `mobSwing` already makes for any attacker. The
// `updateCompanionParties` lifecycle phase draws ZERO rng: it is timers,
// position tests, and roster bookkeeping, which is why it can be APPENDED to the
// end-of-tick block without shifting the global draw order.
//
// `src/sim`-pure: no DOM/Three/render/ui/game/net imports, no Math.random,
// no Date.now (enforced by tests/architecture.test.ts).

import { DUNGEON_X_THRESHOLD, DUNGEONS, dungeonAt, MOBS } from '../data';
import { createMob } from '../entity';
import type { SimContext } from '../sim_context';
import { addThreat } from '../threat';
import { DT, dist2d, type Entity, PET_TELEPORT_DISTANCE, steadyAngleTo, type Vec3 } from '../types';
import { type HealCandidate, planHeal } from './heal_triage';
import {
  companionAvoidGround,
  companionCooldownsFor,
  pruneCompanionCooldowns,
  tryCompanionInterrupt,
} from './reactions';
import {
  type CompanionRole,
  canRecruit,
  companionTemplateFor,
  type EnemyView,
  type EngagementContext,
  isPartyEngagement,
  kitFor,
  MAX_COMPANIONS,
  type RecruitRefusal,
  resolveTarget,
  suggestNextRole,
} from './role_kit';

/** How close to a dungeon's overworld door counts as "at the entrance". Wide
 *  enough to hire without pixel-hunting the portal, tight enough that it is
 *  unmistakably the door and not the road outside it. */
export const COMPANION_ENTRANCE_RADIUS = 15;
/** How far a companion trails the owner before it walks back to heel. */
export const COMPANION_FOLLOW_DISTANCE = 5;
/** Beyond this from the owner a companion drops whatever it was doing and heels.
 *  Without a leash a companion left at a dungeon door happily picks a fight with
 *  the local wildlife while its owner is inside the instance, and never comes
 *  back. Matches the kit engage range: the party fights around the owner. */
export const COMPANION_LEASH_DISTANCE = 40;
/** Seconds between tank taunts. A taunt every tick would pin every mob forever;
 *  this is the classic-style cooldown that makes threat a thing the tank keeps
 *  rather than a thing it re-asserts for free. */
export const COMPANION_TAUNT_COOLDOWN = 8;
/** How often the healer re-checks when nobody needs help (the delve companion's
 *  triage poll, reused so both healers feel the same). */
export const COMPANION_TRIAGE_POLL_SECONDS = 0.5;

/** Mob templates the companions wear. The two authored FRIENDLY companion
 *  templates are reused deliberately: they are the only non-hostile, loot-free,
 *  aggro-radius-zero humanoids in the content tables, and content records are
 *  owned elsewhere. The template supplies base stats and appearance only; every
 *  behavioural difference between the roles comes from `ROLE_KITS`. */
export const COMPANION_TEMPLATE_BY_ROLE: Readonly<Record<CompanionRole, string>> = {
  tank: 'edda_reedhand',
  healer: 'acolyte_tessa',
  dps: 'edda_reedhand',
};

/** Where each companion is placed relative to the owner at summon, in fill
 *  order. A fixed ladder, not a random scatter, so a recruit is reproducible. */
const COMPANION_SPAWN_OFFSETS: readonly { x: number; z: number }[] = [
  { x: 1.6, z: 0.8 },
  { x: -1.6, z: 0.8 },
  { x: 1.6, z: -0.8 },
  { x: -1.6, z: -0.8 },
];

export interface CompanionMember {
  entityId: number;
  role: CompanionRole;
  /** The level the companion was summoned at (the owner's level at that moment).
   *  Kept on the record so a readout does not have to resolve the entity. */
  level: number;
}

export interface CompanionParty {
  ownerId: number;
  /** The dungeon this party was hired at. */
  dungeonId: string;
  /** True once the owner has actually zoned into an instance. Before that the
   *  party is still standing at the door, and wandering away disbands it; after
   *  it, walking back out disbands it. */
  entered: boolean;
  members: CompanionMember[];
}

/** Which dungeon's overworld entrance `pos` is standing at, or null.
 *
 *  Only the OUTSIDE door counts: inside an instance the party is already formed,
 *  and the whole point of the gate is that a posse cannot be raised in the open
 *  world or mid-pull. Rooms reached only through an internal door
 *  (`overworldDoor: false`) are not entrances. Pure: reads content tables and a
 *  position, nothing else. */
export function dungeonEntranceIdAt(pos: Vec3): string | null {
  if (pos.x > DUNGEON_X_THRESHOLD) return null;
  let bestId: string | null = null;
  let bestDistance = COMPANION_ENTRANCE_RADIUS;
  // Sorted so the answer never depends on content table insertion order.
  for (const id of Object.keys(DUNGEONS).sort()) {
    const def = DUNGEONS[id];
    if (def.overworldDoor === false) continue;
    const dx = pos.x - def.doorPos.x;
    const dz = pos.z - def.doorPos.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = id;
    }
  }
  return bestId;
}

export function companionPartyFor(ctx: SimContext, pid: number): CompanionParty | null {
  return ctx.companionParties.get(pid) ?? null;
}

/** The roles currently hired, in recruit order. */
export function companionRolesFor(ctx: SimContext, pid: number): CompanionRole[] {
  return (ctx.companionParties.get(pid)?.members ?? []).map((m) => m.role);
}

/** True when this mob is a live member of somebody's companion party. Membership,
 *  not template: the party reuses the delve companion templates, so a template
 *  test would confuse the two brains. */
export function isDungeonCompanionMob(ctx: SimContext, mob: Entity): boolean {
  if (mob.ownerId === null) return false;
  const party = ctx.companionParties.get(mob.ownerId);
  if (!party) return false;
  for (const m of party.members) {
    if (m.entityId === mob.id) return true;
  }
  return false;
}

function refusalText(refusal: RecruitRefusal): string {
  switch (refusal) {
    case 'notAtDungeonEntrance':
      return 'You can only hire companions at a dungeon entrance.';
    case 'inCombat':
      return 'You cannot hire companions in combat.';
    case 'partyFull':
      return 'Your party is already full.';
  }
}

/** Hire one companion.
 *
 *  Refuses (and says why) away from a dungeon door, in combat, or once four are
 *  already hired: the gate itself is `canRecruit` in role_kit.ts, so this path
 *  and any future one agree by construction. `role` defaults to whatever the
 *  standard tank/healer/dps/dps template is still missing.
 *
 *  The companion is SCALED TO THE OWNER'S LEVEL at summon time: it is a peer for
 *  this run, not a permanent pet that levels alongside you. Returns true when one
 *  was hired. Draws no rng. */
export function recruitCompanion(
  ctx: SimContext,
  role?: CompanionRole | null,
  pid?: number,
): boolean {
  const r = ctx.resolve(pid);
  if (!r || r.e.dead) return false;
  const ownerId = r.meta.entityId;
  const existing = ctx.companionParties.get(ownerId) ?? null;
  const dungeonId = dungeonEntranceIdAt(r.e.pos);
  const currentRoles = existing?.members.map((m) => m.role) ?? [];
  // Run mode lifts the door requirement: it is a testing surface, and walking
  // back to a portal to re-hire is friction with no design value there.
  const anywhere = ctx.companionsAnywhere;
  const decision = canRecruit({
    atDungeonEntrance: dungeonId !== null || anywhere,
    inCombat: r.e.inCombat,
    currentRoles,
  });
  if (decision.refusal !== null) {
    ctx.error(ownerId, refusalText(decision.refusal));
    return false;
  }
  // Outside run mode, canRecruit only allows the call through when it saw an
  // entrance, so this is narrowing rather than an assumption. With the door gate
  // lifted there may be no entrance underfoot, and the party then keeps whatever
  // dungeon it was already bound to; `homeDungeonId` is a readout only, so an
  // empty binding is inert rather than dangerous.
  if (dungeonId === null && !anywhere) return false;
  const boundDungeonId = dungeonId ?? existing?.dungeonId ?? '';
  // The owner is the fifth member, so the group is filled AROUND their role: a
  // tank who typed /hire used to get a second tank. The role comes from the
  // resolved talent spec, which is null until points are spent, and that falls
  // back to the standard group.
  const ownerRole = ctx.playerMods(r.meta).role;
  const picked = role ?? suggestNextRole(currentRoles, companionTemplateFor(ownerRole)) ?? 'dps';
  const template = MOBS[COMPANION_TEMPLATE_BY_ROLE[picked]];
  if (!template) return false;
  const party: CompanionParty = existing ?? {
    ownerId,
    dungeonId: boundDungeonId,
    entered: false,
    members: [],
  };
  // Walking to a different door with a half-built party rebinds it to that door
  // rather than leaving the run keyed to a dungeon nobody is standing at. With
  // no door underfoot (run mode) the existing binding is kept.
  party.dungeonId = boundDungeonId;
  const level = Math.max(1, r.e.level);
  const offset = COMPANION_SPAWN_OFFSETS[party.members.length % COMPANION_SPAWN_OFFSETS.length];
  const mob = createMob(
    ctx.nextId++,
    template,
    level,
    ctx.groundPos(r.e.pos.x + offset.x, r.e.pos.z + offset.z),
  );
  mob.ownerId = ownerId;
  mob.hostile = false;
  mob.aiState = 'idle';
  // The healer polls triage almost immediately after it lands, so a companion
  // hired onto a hurt owner tops them off instead of waiting out a full interval.
  mob.wanderTimer = COMPANION_TRIAGE_POLL_SECONDS;
  ctx.addEntity(mob);
  party.members.push({ entityId: mob.id, role: picked, level });
  ctx.companionParties.set(ownerId, party);
  ctx.notice(ownerId, `${mob.name} joins your party as ${picked}.`);
  return true;
}

/** Send the whole party home. Idempotent: safe on a player with no party, which
 *  is what the logout/leave teardown path relies on. */
export function disbandCompanionParty(ctx: SimContext, pid: number): void {
  const party = ctx.companionParties.get(pid);
  if (!party) return;
  for (const m of party.members) {
    ctx.companionCooldowns.delete(m.entityId);
    if (ctx.entities.has(m.entityId)) ctx.dropEntity(m.entityId);
  }
  ctx.companionParties.delete(pid);
  ctx.notice(pid, 'Your companions depart.');
}

// -------------------------------------------------------------------------
// The lifecycle phase: appended to the end-of-tick block. Draws ZERO rng.
// -------------------------------------------------------------------------

/** Keep every party's roster honest and disband the ones whose run is over.
 *
 *  The disband rule is the product rule read literally: before the owner has
 *  zoned in, the party lives only while they stand at a dungeon entrance; once
 *  they have zoned in, it lives only while they are inside an instance. Stepping
 *  back out of the portal therefore ends the run, and so does walking away from
 *  the door before ever entering. */
export function updateCompanionParties(ctx: SimContext): void {
  for (const pid of [...ctx.companionParties.keys()]) {
    const party = ctx.companionParties.get(pid);
    if (!party) continue;
    const owner = ctx.entities.get(pid);
    if (owner?.kind !== 'player') {
      disbandCompanionParty(ctx, pid);
      continue;
    }
    // A companion that died or was dropped leaves the roster; its corpse decays
    // like any other mob's.
    party.members = party.members.filter((m) => {
      const e = ctx.entities.get(m.entityId);
      if (e && !e.dead) return true;
      ctx.companionCooldowns.delete(m.entityId);
      if (e?.dead) ctx.dropEntity(m.entityId);
      return false;
    });
    const insideInstance = dungeonAt(owner.pos.x) !== null;
    if (insideInstance) {
      party.entered = true;
      continue;
    }
    // Run mode keeps its party wherever the owner goes. Lifting only the HIRE
    // gate would be worse than lifting neither: the party would be hired away
    // from a door and then disbanded on the very next tick by this rule.
    if (ctx.companionsAnywhere) continue;
    if (party.entered || dungeonEntranceIdAt(owner.pos) === null) {
      disbandCompanionParty(ctx, pid);
    }
  }
  pruneCompanionCooldowns(ctx);
}

// -------------------------------------------------------------------------
// The per-companion brain. Runs inside the mob loop, in entity order.
// -------------------------------------------------------------------------

function memberFor(party: CompanionParty, id: number): CompanionMember | null {
  for (const m of party.members) {
    if (m.entityId === id) return m;
  }
  return null;
}

function tankEntityId(party: CompanionParty): number | null {
  for (const m of party.members) {
    if (m.role === 'tank') return m.entityId;
  }
  return null;
}

function healerIdsOf(party: CompanionParty): number[] {
  const out: number[] = [];
  for (const m of party.members) {
    if (m.role === 'healer') out.push(m.entityId);
  }
  return out;
}

/** Flatten every hostile the companion could act on onto the role resolver's
 *  view. Iterates the roster in entity order and never draws rng. */
function enemyViews(
  ctx: SimContext,
  self: Entity,
  party: CompanionParty,
  range: number,
  engagement: EngagementContext,
): EnemyView[] {
  const tankId = tankEntityId(party);
  const out: EnemyView[] = [];
  for (const e of ctx.entities.values()) {
    if (e.kind !== 'mob' || e.dead || e.ownerId !== null) continue;
    if (!ctx.isHostileTo(self, e)) continue;
    const distance = dist2d(self.pos, e.pos);
    if (distance > range) continue;
    // Assist, never pull: a hostile in range is not by itself a reason to swing
    // at it. See `isPartyEngagement` for the rule.
    if (!isPartyEngagement({ id: e.id, attackingId: e.aggroTargetId ?? null }, engagement)) {
      continue;
    }
    out.push({
      id: e.id,
      distance,
      hpFrac: e.hp / Math.max(1, e.maxHp),
      attackingId: e.aggroTargetId,
      heldByTank: tankId !== null && e.aggroTargetId === tankId,
    });
  }
  return out;
}

/** Everyone the healer may top up: the owner plus the living companions. The
 *  companion tank (or, with no tank hired, the owner) carries the tank flag, so
 *  triage breaks health ties toward whoever is holding the pull. */
function healCandidates(
  ctx: SimContext,
  self: Entity,
  owner: Entity,
  party: CompanionParty,
): HealCandidate[] {
  const tankId = tankEntityId(party);
  const out: HealCandidate[] = [];
  if (!owner.dead) {
    out.push({
      id: owner.id,
      hpFrac: owner.hp / Math.max(1, owner.maxHp),
      distance: dist2d(self.pos, owner.pos),
      isTank: tankId === null,
    });
  }
  for (const m of party.members) {
    if (m.entityId === self.id) continue;
    const ally = ctx.entities.get(m.entityId);
    if (!ally || ally.dead) continue;
    out.push({
      id: ally.id,
      hpFrac: ally.hp / Math.max(1, ally.maxHp),
      distance: dist2d(self.pos, ally.pos),
      isTank: m.role === 'tank',
    });
  }
  return out;
}

// A direct hp mutation plus a heal/spellfx emit, exactly like the delve
// companion's heal: no aura, no rng, and the same wire shape the HUD already
// renders for companion healing.
function castCompanionHeal(ctx: SimContext, self: Entity, target: Entity, frac: number): void {
  const healed = Math.min(target.maxHp - target.hp, Math.round(target.maxHp * frac));
  if (healed <= 0) return;
  target.hp += healed;
  ctx.emit({ type: 'heal', targetId: target.id, amount: healed });
  ctx.emit({
    type: 'spellfx',
    sourceId: self.id,
    targetId: target.id,
    school: 'holy',
    fx: 'tick',
  });
}

function followOwner(ctx: SimContext, self: Entity, owner: Entity): void {
  const d = dist2d(self.pos, owner.pos);
  if (d > PET_TELEPORT_DISTANCE) {
    // The owner zoned (a dungeon door teleport moves them hundreds of yards in
    // one tick); the party goes with them rather than being left at the door.
    self.pos = { ...owner.pos };
    self.prevPos = { ...self.pos };
    ctx.rebucket(self);
    return;
  }
  if (d > COMPANION_FOLLOW_DISTANCE && !ctx.isRooted(self)) {
    ctx.moveToward(self, owner.pos, self.moveSpeed * ctx.moveSpeedMult(self));
  }
}

/** One companion's tick.
 *
 *  Phase order inside the tick is deliberate and mirrors the delve companion:
 *  validate, pick a target from the KIT, get out of the fire BEFORE moving to
 *  melee, interrupt, then act on the role, then heal, then heel. */
export function updateDungeonCompanion(ctx: SimContext, self: Entity): void {
  const owner = self.ownerId !== null ? ctx.entities.get(self.ownerId) : null;
  if (owner?.kind !== 'player') {
    ctx.dropEntity(self.id);
    return;
  }
  const party = ctx.companionParties.get(owner.id);
  const member = party ? memberFor(party, self.id) : null;
  if (!party || !member) {
    ctx.dropEntity(self.id);
    return;
  }
  const kit = kitFor(member.role);
  self.swingTimer = (self.swingTimer ?? 0) - DT;

  // Leashed: too far from the owner to be part of this fight. Heel first, and in
  // particular do not stand at the door skirmishing with the local wildlife while
  // the owner is inside the instance. This is also the arm that carries the party
  // through a dungeon door, since the zoning teleport puts the owner hundreds of
  // yards away in a single tick.
  if (dist2d(self.pos, owner.pos) > COMPANION_LEASH_DISTANCE) {
    self.inCombat = false;
    self.swingTimer = Math.max(0, self.swingTimer);
    followOwner(ctx, self, owner);
    return;
  }

  const ownerTargetEntity = owner.targetId !== null ? ctx.entities.get(owner.targetId) : null;
  const ownerTargetId =
    ownerTargetEntity && !ownerTargetEntity.dead && ctx.isHostileTo(self, ownerTargetEntity)
      ? ownerTargetEntity.id
      : null;
  const enemies = enemyViews(ctx, self, party, kit.maxRange, {
    ownerId: owner.id,
    companionIds: party.members.map((m) => m.entityId),
    ownerTargetId,
    ownerInCombat: owner.inCombat,
  });
  const targetId = resolveTarget(kit, enemies, {
    ownerTargetId,
    healerIds: healerIdsOf(party),
  });
  const target = targetId !== null ? (ctx.entities.get(targetId) ?? null) : null;

  // Ground avoidance runs BEFORE combat movement: a companion that walks through
  // a fire puddle to reach melee range dies in the puddle. The anchor keeps the
  // dodge inside the range it needs to keep doing its job.
  const dodged = companionAvoidGround(
    ctx,
    self,
    target ? { x: target.pos.x, z: target.pos.z, range: kit.preferredRange } : null,
  );

  // Every role kicks. The policy decides whether it is worth the cooldown.
  tryCompanionInterrupt(ctx, self);

  if (target && !target.dead) {
    self.inCombat = true;
    // The tank taunts what it is not already holding: that is the whole job, and
    // it is what keeps the healer and the dps alive behind it.
    if (kit.taunts && target.aggroTargetId !== self.id) {
      const cd = companionCooldownsFor(ctx, self.id);
      if (cd.tauntReadyAt <= ctx.time) {
        cd.tauntReadyAt = ctx.time + COMPANION_TAUNT_COOLDOWN;
        ctx.applyTaunt(self, target);
      }
    }
    const distance = dist2d(self.pos, target.pos);
    if (distance > kit.preferredRange) {
      if (!dodged && !ctx.isRooted(self)) {
        ctx.moveToward(self, target.pos, self.moveSpeed * ctx.moveSpeedMult(self));
      }
    } else {
      self.facing = steadyAngleTo(self.pos, target.pos, self.facing);
      if (self.swingTimer <= 0) {
        ctx.mobSwing(self, target);
        self.swingTimer = self.weapon.speed * ctx.swingIntervalMult(self);
        // The kit's threat posture, made real: a `build` role pays a stance-style
        // premium on top of the threat its damage already generated, so the tank
        // outruns the dps instead of merely swinging first.
        if (kit.threatPosture === 'build' && kit.threatMultiplier > 1) {
          const swing = (self.weapon.min + self.weapon.max) / 2;
          addThreat(target, self.id, swing * (kit.threatMultiplier - 1));
        }
      }
    }
  } else {
    self.inCombat = false;
    self.swingTimer = Math.max(0, self.swingTimer);
  }

  if (kit.heals) {
    self.wanderTimer = (self.wanderTimer ?? 0) - DT;
    if (self.wanderTimer <= 0) {
      const plan = planHeal(healCandidates(ctx, self, owner, party), kit.maxRange);
      const healTarget = plan.targetId !== null ? ctx.entities.get(plan.targetId) : null;
      if (healTarget && !healTarget.dead) {
        castCompanionHeal(ctx, self, healTarget, plan.healFrac);
        self.wanderTimer = plan.nextIntervalSeconds;
      } else {
        self.wanderTimer = COMPANION_TRIAGE_POLL_SECONDS;
      }
    }
  }

  // Nothing to fight (or a dodge already spent the move): fall in behind the
  // owner. A melee role holding a target keeps working it instead.
  if (target && !target.dead) return;
  if (dodged) return;
  followOwner(ctx, self, owner);
}

/** Read-only projection of the party for a foreign caller (tests, a readout, or
 *  a future HUD facet). Boundary-cloned so nothing outside this module can hold a
 *  live reference into `Sim` state. */
export function companionPartyWire(
  ctx: SimContext,
  pid: number,
): { dungeonId: string; entered: boolean; members: CompanionMember[] } | null {
  const party = ctx.companionParties.get(pid);
  if (!party) return null;
  return {
    dungeonId: party.dungeonId,
    entered: party.entered,
    members: party.members.map((m) => ({ ...m })),
  };
}

/** How many more companions the owner may hire. */
export function companionSlotsFree(ctx: SimContext, pid: number): number {
  return Math.max(0, MAX_COMPANIONS - (ctx.companionParties.get(pid)?.members.length ?? 0));
}
