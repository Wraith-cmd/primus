import { shouldTriggerWaterImpact, waterContactFrameMode } from './characters/anim_state';

export interface WaterContactState {
  waterContactSeen: boolean;
  waterContactActive: boolean;
  waterContactX: number;
  waterContactZ: number;
  waterContactAccum: number;
}

export interface WaterContactFrame {
  editorCamera: boolean;
  visible: boolean;
  x: number;
  y: number;
  z: number;
  waterLevel: number;
  bodyHeight: number;
  facing: number;
  speed: number;
  velocityX: number;
  velocityZ: number;
  dt: number;
  sitting: boolean;
  dead: boolean;
  airborne: boolean;
  swimming: boolean;
  wasAirborne: boolean;
  wasSwimming: boolean;
}

export interface WaterContactSurface {
  simulationEnabled: boolean;
  addSplash(x: number, z: number, radius: number, strength?: number): void;
  enterContact(
    x: number,
    z: number,
    radius: number,
    halfLength: number,
    axisX: number,
    axisZ: number,
    strength?: number,
  ): void;
  moveContact(
    oldX: number,
    oldZ: number,
    x: number,
    z: number,
    radius: number,
    halfLength: number,
    axisX: number,
    axisZ: number,
    strength?: number,
  ): void;
  releaseContact(
    x: number,
    z: number,
    radius: number,
    halfLength: number,
    axisX: number,
    axisZ: number,
    strength?: number,
  ): void;
}

export interface WaterContactEffects {
  characterWaterSplash(
    x: number,
    y: number,
    z: number,
    dirX: number,
    dirZ: number,
    radius?: number,
    strength?: number,
  ): void;
  waterWake(x: number, y: number, z: number, dt: number): void;
}

export type WaterContactAction = 'none' | 'splash' | 'enter' | 'move' | 'release';

export interface WaterContactPlan {
  action: WaterContactAction;
  fromX: number;
  fromZ: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  halfLength: number;
  axisX: number;
  axisZ: number;
  strength: number;
  directionX: number;
  directionZ: number;
  characterSplash: boolean;
  wakeDt: number;
}

export function createWaterContactFrame(): WaterContactFrame {
  return {
    editorCamera: false,
    visible: false,
    x: 0,
    y: 0,
    z: 0,
    waterLevel: -Infinity,
    bodyHeight: 0,
    facing: 0,
    speed: 0,
    velocityX: 0,
    velocityZ: 0,
    dt: 0,
    sitting: false,
    dead: false,
    airborne: false,
    swimming: false,
    wasAirborne: false,
    wasSwimming: false,
  };
}

export function createWaterContactPlan(): WaterContactPlan {
  return {
    action: 'none',
    fromX: 0,
    fromZ: 0,
    x: 0,
    y: 0,
    z: 0,
    radius: 0,
    halfLength: 0,
    axisX: 0,
    axisZ: 0,
    strength: 0,
    directionX: 0,
    directionZ: 0,
    characterSplash: false,
    wakeDt: 0,
  };
}

function resetPlan(plan: WaterContactPlan): void {
  plan.action = 'none';
  plan.characterSplash = false;
  plan.wakeDt = 0;
}

function resetContact(state: WaterContactState, frame: WaterContactFrame, seen: boolean): void {
  state.waterContactSeen = seen;
  state.waterContactActive = false;
  state.waterContactX = frame.x;
  state.waterContactZ = frame.z;
  state.waterContactAccum = 0;
}

function setShape(
  plan: WaterContactPlan,
  frame: WaterContactFrame,
  radius: number,
  halfLength: number,
): void {
  plan.radius = radius;
  plan.halfLength = halfLength;
  plan.axisX = Math.sin(frame.facing);
  plan.axisZ = Math.cos(frame.facing);
}

export function waterContactPlanInto(
  state: WaterContactState,
  frame: WaterContactFrame,
  simulationEnabled: boolean,
  plan: WaterContactPlan,
): WaterContactPlan {
  resetPlan(plan);
  const contactMode = waterContactFrameMode(
    frame.editorCamera,
    frame.visible,
    state.waterContactSeen,
  );
  if (contactMode === 'forget') {
    resetContact(state, frame, false);
    return plan;
  }

  const contactRadius = Math.min(1.25, Math.max(0.34, frame.bodyHeight * 0.16));
  const waterDepth = frame.waterLevel - frame.y;
  const touchesWater =
    !frame.dead &&
    !frame.sitting &&
    Number.isFinite(frame.waterLevel) &&
    waterDepth >= -0.035 &&
    frame.y + frame.bodyHeight * 0.82 > frame.waterLevel;
  if (contactMode === 'seed') {
    state.waterContactSeen = true;
    state.waterContactActive = touchesWater;
    state.waterContactX = frame.x;
    state.waterContactZ = frame.z;
    state.waterContactAccum = 0;
    return plan;
  }

  if (!touchesWater) {
    if (state.waterContactActive) {
      plan.action = 'release';
      plan.x = state.waterContactX;
      plan.z = state.waterContactZ;
      setShape(
        plan,
        frame,
        contactRadius,
        frame.wasSwimming
          ? Math.min(1.05, Math.max(contactRadius * 0.9, frame.bodyHeight * 0.3))
          : contactRadius * 0.22,
      );
      plan.strength = 0.68;
    }
    resetContact(state, frame, true);
    return plan;
  }

  const contactImmersion = Number.isFinite(waterDepth)
    ? Math.min(1, Math.max(0, (waterDepth + 0.04) / (contactRadius * 0.85)))
    : 0;
  const contactHalfLength = frame.swimming
    ? Math.min(1.05, Math.max(contactRadius * 0.9, frame.bodyHeight * 0.3))
    : contactRadius * 0.22;
  setShape(plan, frame, contactRadius, contactHalfLength);
  plan.x = frame.x;
  plan.y = frame.waterLevel;
  plan.z = frame.z;

  const waterImpact = shouldTriggerWaterImpact(
    state.waterContactActive,
    frame.wasAirborne,
    frame.airborne,
    frame.wasSwimming,
    frame.swimming,
  );
  if (waterImpact) {
    plan.action = 'enter';
    plan.strength = Math.min(1.65, 0.82 + frame.speed * 0.08 + contactImmersion * 0.25);
    const entryDistance = Math.hypot(frame.velocityX, frame.velocityZ);
    plan.directionX = entryDistance > 0.001 ? frame.velocityX / entryDistance : plan.axisX;
    plan.directionZ = entryDistance > 0.001 ? frame.velocityZ / entryDistance : plan.axisZ;
    plan.characterSplash = true;
    state.waterContactActive = true;
    state.waterContactX = frame.x;
    state.waterContactZ = frame.z;
    state.waterContactAccum = 0;
    return plan;
  }

  if (!simulationEnabled) {
    plan.wakeDt = Math.max(0, frame.dt) * (frame.speed > 0.05 ? 3 : frame.swimming ? 1 : 0);
  }
  const waterDx = frame.x - state.waterContactX;
  const waterDz = frame.z - state.waterContactZ;
  const waterDistanceSq = waterDx * waterDx + waterDz * waterDz;
  const teleportLimit = contactRadius * 8;
  state.waterContactAccum += frame.dt;
  if (waterDistanceSq > teleportLimit * teleportLimit) {
    plan.action = 'splash';
    plan.strength = 0.7;
    state.waterContactX = frame.x;
    state.waterContactZ = frame.z;
    state.waterContactAccum = 0;
  } else if (waterDistanceSq > 0.0016 && state.waterContactAccum >= 1 / 24) {
    plan.action = 'move';
    plan.fromX = state.waterContactX;
    plan.fromZ = state.waterContactZ;
    const contactSpeed = Math.sqrt(waterDistanceSq) / Math.max(state.waterContactAccum, 0.001);
    plan.strength = Math.min(
      1.6,
      Math.max(0.28, (0.34 + contactSpeed * 0.095) * (0.45 + contactImmersion * 0.75)),
    );
    state.waterContactX = frame.x;
    state.waterContactZ = frame.z;
    state.waterContactAccum = 0;
  }
  return plan;
}

export function applyWaterContactPlan(
  plan: WaterContactPlan,
  surface: WaterContactSurface,
  effects: WaterContactEffects,
): void {
  if (plan.action === 'splash') {
    surface.addSplash(plan.x, plan.z, plan.radius, plan.strength);
  } else if (plan.action === 'enter') {
    surface.enterContact(
      plan.x,
      plan.z,
      plan.radius,
      plan.halfLength,
      plan.axisX,
      plan.axisZ,
      plan.strength,
    );
  } else if (plan.action === 'move') {
    surface.moveContact(
      plan.fromX,
      plan.fromZ,
      plan.x,
      plan.z,
      plan.radius,
      plan.halfLength,
      plan.axisX,
      plan.axisZ,
      plan.strength,
    );
  } else if (plan.action === 'release') {
    surface.releaseContact(
      plan.x,
      plan.z,
      plan.radius,
      plan.halfLength,
      plan.axisX,
      plan.axisZ,
      plan.strength,
    );
  }

  if (plan.characterSplash) {
    effects.characterWaterSplash(
      plan.x,
      plan.y,
      plan.z,
      plan.directionX,
      plan.directionZ,
      plan.radius * 1.45,
      plan.strength,
    );
  }
  if (plan.wakeDt > 0) effects.waterWake(plan.x, plan.y, plan.z, plan.wakeDt);
}

export function updateWaterContact(
  state: WaterContactState,
  frame: WaterContactFrame,
  surface: WaterContactSurface,
  effects: WaterContactEffects,
  plan: WaterContactPlan,
): void {
  waterContactPlanInto(state, frame, surface.simulationEnabled, plan);
  applyWaterContactPlan(plan, surface, effects);
}
