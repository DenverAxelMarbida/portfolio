/**
 * Lightweight rope-and-pendulum physics for the hanging ID card.
 *
 * The card is a point mass attached to a fixed anchor by an elastic strap. In
 * free mode gravity and the radial strap spring drive it; while dragging, the
 * pointer sets the attachment target directly so the card stays responsive and
 * keeps its velocity for the release. Every write is derived from bounded
 * state so the component only paints a clamped transform.
 */
export const LANYARD_MAX_ANGLE_DEG = 48;
export const LANYARD_MAX_TILT_DEG = 14;
export const LANYARD_DROP_ANGLE_DEG = 13;
export const LANYARD_DROP_RADIUS_RATIO = 0.42;
export const LANYARD_DROP_VELOCITY = 30;
/**
 * How long since the last pointer sample release momentum stays valid. The
 * smoothed pointer velocity only describes movement inside this window;
 * anything older is a stationary hold, not a moving release, so releasing is
 * a real drag end with no stored fling speed.
 */
export const LANYARD_RELEASE_SAMPLE_MS = 120;

const DEG = Math.PI / 180;
const MAX_STEP_SECONDS = 1 / 30;
const TILT_FOLLOW = 0.3;
const TILT_VELOCITY = 0.0026;
const TILT_EASE = 14;

/** Fallback strap length before the layout is measured (matches --profile-lanyard-length). */
export const LANYARD_REST_LENGTH = 150;

export interface LanyardConfig {
  /** Resting distance from the anchor to the card attachment. */
  restLength: number;
  /** Shortest allowed distance, so the card cannot be pushed through the anchor. */
  minLength: number;
  /** Longest allowed distance, a small elastic stretch. */
  maxLength: number;
  /** Strap length at which the spring is relaxed (resting length minus weight sag). */
  springLength: number;
  maxAngleDeg: number;
  maxTiltDeg: number;
  gravity: number;
  ropeStiffness: number;
  ropeDamping: number;
  airDamping: number;
  maxSpeed: number;
  restSpeed: number;
  restDistance: number;
  restTiltDeg: number;
}

/** Create a config object from a rest length, preserving proportional constraints. */
export function createLanyardConfig(restLength: number): LanyardConfig {
  return {
    restLength,
    minLength: restLength * 0.42,
    maxLength: restLength * 1.16,
    springLength: restLength - 2400 / 900,
    maxAngleDeg: LANYARD_MAX_ANGLE_DEG,
    maxTiltDeg: LANYARD_MAX_TILT_DEG,
    gravity: 2400,
    ropeStiffness: 900,
    ropeDamping: 5.5,
    airDamping: 1.5,
    maxSpeed: 4400,
    restSpeed: 3,
    restDistance: 0.6,
    restTiltDeg: 0.4,
  };
}

/** Default config using the fallback rest length. */
export const LANYARD_CONFIG = createLanyardConfig(LANYARD_REST_LENGTH);

export interface LanyardState {
  /** Attachment offset right of the anchor, in px. */
  x: number;
  /** Attachment offset below the anchor, in px. */
  y: number;
  vx: number;
  vy: number;
  /** Card rotation in degrees, positive clockwise. */
  tilt: number;
}

export interface LanyardOptions {
  dtSeconds: number;
  config?: LanyardConfig;
  dragging?: boolean;
  target?: { x: number; y: number } | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampSpeed(vx: number, vy: number, maxSpeed: number): { vx: number; vy: number } {
  const speed = Math.hypot(vx, vy);
  if (!Number.isFinite(speed) || speed <= maxSpeed) return { vx, vy };
  const scale = maxSpeed / speed;
  return { vx: vx * scale, vy: vy * scale };
}

export function lanyardRestState(config: LanyardConfig = LANYARD_CONFIG): LanyardState {
  return { x: 0, y: config.restLength, vx: 0, vy: 0, tilt: 0 };
}

/** The card starts higher up with a slack strap, then falls into the swing. */
export function lanyardDropState(config: LanyardConfig = LANYARD_CONFIG): LanyardState {
  const angle = LANYARD_DROP_ANGLE_DEG * DEG;
  const radius = config.restLength * LANYARD_DROP_RADIUS_RATIO;
  return {
    x: Math.sin(angle) * radius,
    y: Math.cos(angle) * radius,
    vx: LANYARD_DROP_VELOCITY,
    vy: 0,
    tilt: LANYARD_DROP_ANGLE_DEG * TILT_FOLLOW,
  };
}

export interface LanyardPoint {
  x: number;
  y: number;
}

/** Screen-space velocity in px per second. */
export interface LanyardVelocity {
  vx: number;
  vy: number;
}

/** Where the strap root is drawn from for a given layout width. */
export type LanyardAnchorMode = 'document' | 'shell';

export interface LanyardAnchorGeometry {
  mode: LanyardAnchorMode;
  /** Strap-root top position relative to the shell top, in px (≤ 0). */
  anchorTopOffset: number;
  /** Resting distance from the strap root to the card attachment, in px. */
  restLength: number;
}

/**
 * Derives the full-page strap geometry from rendered document coordinates.
 * Wide layouts root the strap at the very top of the document so it slides
 * in behind the page header; stacked layouts keep the shell-local strap so it
 * never crosses the copy that sits above the card. Positions that cannot be
 * measured cleanly fall back to the shell-local default strap.
 */
export function deriveLanyardAnchorGeometry(
  mode: LanyardAnchorMode,
  shellDocumentTop: number,
  cardDocumentTop: number,
): LanyardAnchorGeometry {
  if (mode === 'shell') {
    if (
      Number.isFinite(shellDocumentTop) &&
      Number.isFinite(cardDocumentTop) &&
      cardDocumentTop > shellDocumentTop
    ) {
      return { mode, anchorTopOffset: 0, restLength: cardDocumentTop - shellDocumentTop };
    }
    return { mode: 'shell', anchorTopOffset: 0, restLength: LANYARD_REST_LENGTH };
  }

  const valid =
    Number.isFinite(shellDocumentTop) &&
    Number.isFinite(cardDocumentTop) &&
    cardDocumentTop > shellDocumentTop;
  if (!valid) {
    return { mode: 'shell', anchorTopOffset: 0, restLength: LANYARD_REST_LENGTH };
  }

  const anchorTopOffset = -shellDocumentTop;
  // The root sits at the document top: shell top + (-shell top) = 0, so the
  // rope length is the whole distance from the document top to the card.
  return {
    mode,
    anchorTopOffset,
    restLength: cardDocumentTop - shellDocumentTop - anchorTopOffset,
  };
}

/**
 * Projects any point onto the allowed sector: a cone around the downward
 * vertical and a short stretch range. Used for pointer targets and for every
 * physics step, so no caller can push the card outside the safe area.
 */
export function clampLanyardPosition(
  x: number,
  y: number,
  config: LanyardConfig = LANYARD_CONFIG,
): LanyardPoint {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { x: 0, y: config.minLength };
  }
  const radius = Math.hypot(x, y);
  if (radius < 1e-6) return { x: 0, y: config.minLength };

  const maxAngle = config.maxAngleDeg * DEG;
  const angle = clamp(Math.atan2(x, y), -maxAngle, maxAngle);
  const clampedRadius = clamp(radius, config.minLength, config.maxLength);
  return {
    x: Math.sin(angle) * clampedRadius,
    y: Math.cos(angle) * clampedRadius,
  };
}

function tiltTarget(x: number, y: number, vx: number, config: LanyardConfig): number {
  const ropeAngle = Math.atan2(x, y) / DEG;
  return clamp(ropeAngle * TILT_FOLLOW + vx * TILT_VELOCITY, -config.maxTiltDeg, config.maxTiltDeg);
}

function stepTilt(tilt: number, target: number, dt: number): number {
  const factor = 1 - Math.exp(-dt * TILT_EASE);
  return clamp(tilt + (target - tilt) * factor, -LANYARD_MAX_TILT_DEG, LANYARD_MAX_TILT_DEG);
}

export function isLanyardSettled(
  state: LanyardState,
  config: LanyardConfig = LANYARD_CONFIG,
): boolean {
  return (
    Math.hypot(state.vx, state.vy) < config.restSpeed &&
    Math.hypot(state.x, state.y - config.restLength) < config.restDistance &&
    Math.abs(state.tilt) < config.restTiltDeg
  );
}

/**
 * Hands the measured pointer velocity to the free simulation at release. The
 * position is untouched so the card never jumps; only the speed is clamped.
 */
export function lanyardReleaseState(
  state: LanyardState,
  vx: number,
  vy: number,
  config: LanyardConfig = LANYARD_CONFIG,
): LanyardState {
  const velocity = clampSpeed(
    Number.isFinite(vx) ? vx : 0,
    Number.isFinite(vy) ? vy : 0,
    config.maxSpeed,
  );
  return { ...state, vx: velocity.vx, vy: velocity.vy };
}

/**
 * Release momentum policy: momentum exists only while the last pointer sample
 * is fresh. A moving release returns the smoothed pointer velocity as measured;
 * once the pointer has been stationary longer than the sampling window, the
 * stale gesture speed no longer describes the motion and must not launch the
 * card when the drag ends.
 */
export function lanyardReleaseVelocity(velocity: LanyardVelocity, holdMs: number): LanyardVelocity {
  const vx = velocity.vx;
  const vy = velocity.vy;
  if (!Number.isFinite(vx) || !Number.isFinite(vy)) return { vx: 0, vy: 0 };
  const hold = Number.isFinite(holdMs) ? Math.max(0, holdMs) : Number.POSITIVE_INFINITY;
  if (hold > LANYARD_RELEASE_SAMPLE_MS) return { vx: 0, vy: 0 };
  return { vx, vy };
}

export function stepLanyard(state: LanyardState, options: LanyardOptions): LanyardState {
  const config = options.config ?? LANYARD_CONFIG;
  const dt = clamp(options.dtSeconds, 0, MAX_STEP_SECONDS);
  if (dt === 0) return state;

  if (options.dragging && options.target) {
    const target = clampLanyardPosition(options.target.x, options.target.y, config);
    let dx = target.x - state.x;
    let dy = target.y - state.y;
    const distance = Math.hypot(dx, dy);
    const maxStep = config.maxSpeed * dt;
    if (distance > maxStep) {
      const scale = maxStep / distance;
      dx *= scale;
      dy *= scale;
    }
    const x = state.x + dx;
    const y = state.y + dy;
    const velocity = clampSpeed(dx / dt, dy / dt, config.maxSpeed);
    return {
      x,
      y,
      vx: velocity.vx,
      vy: velocity.vy,
      tilt: stepTilt(state.tilt, tiltTarget(x, y, velocity.vx, config), dt),
    };
  }

  let x = state.x;
  let y = state.y;
  const vx = state.vx;
  const vy = state.vy;

  let radius = Math.hypot(x, y);
  if (radius < 1e-6) {
    x = 0;
    y = config.minLength;
    radius = config.minLength;
  }

  const ux = x / radius;
  const uy = y / radius;
  let ax = 0;
  let ay = config.gravity;

  if (radius > config.springLength) {
    const stretch = radius - config.springLength;
    const radialVelocity = vx * ux + vy * uy;
    const pull = -(config.ropeStiffness * stretch + config.ropeDamping * radialVelocity);
    ax += pull * ux;
    ay += pull * uy;
  }

  ax -= config.airDamping * vx;
  ay -= config.airDamping * vy;

  const integrated = clampSpeed(vx + ax * dt, vy + ay * dt, config.maxSpeed);
  const clamped = clampLanyardPosition(x + integrated.vx * dt, y + integrated.vy * dt, config);

  const projected = clampSpeed((clamped.x - x) / dt, (clamped.y - y) / dt, config.maxSpeed);
  const next: LanyardState = {
    x: clamped.x,
    y: clamped.y,
    vx: projected.vx,
    vy: projected.vy,
    tilt: stepTilt(state.tilt, tiltTarget(clamped.x, clamped.y, projected.vx, config), dt),
  };

  if (isLanyardSettled(next, config)) {
    return { x: 0, y: config.restLength, vx: 0, vy: 0, tilt: 0 };
  }
  return next;
}

/**
 * Strap path from the fixed anchor at (0, 0) to the card attachment. A slack
 * strap bows sideways; a taut strap is a straight line.
 */
export function lanyardRopePath(
  state: LanyardState,
  config: LanyardConfig = LANYARD_CONFIG,
): string {
  const radius = Math.hypot(state.x, state.y);
  const slack = Math.max(0, config.springLength - radius);
  let controlX = state.x / 2;
  let controlY = state.y / 2;
  if (slack > 0 && radius > 1e-6) {
    const bow = slack * 0.55;
    controlX += (-state.y / radius) * bow;
    controlY += (state.x / radius) * bow;
  }
  return `M 0 0 Q ${controlX.toFixed(2)} ${controlY.toFixed(2)} ${state.x.toFixed(2)} ${state.y.toFixed(2)}`;
}

export function lanyardCardTransform(
  state: LanyardState,
  config: LanyardConfig = LANYARD_CONFIG,
): string {
  return `translate3d(${state.x.toFixed(3)}px, ${(state.y - config.restLength).toFixed(3)}px, 0) rotate(${state.tilt.toFixed(3)}deg)`;
}

export interface LanyardMotionInput {
  motionAllowed: boolean;
  documentVisible: boolean;
  inView: boolean;
}

export interface LanyardMotionState {
  run: boolean;
  dragEnabled: boolean;
}

export function lanyardMotionState({
  motionAllowed,
  documentVisible,
  inView,
}: LanyardMotionInput): LanyardMotionState {
  const run = motionAllowed && documentVisible && inView;
  return { run, dragEnabled: run };
}

/** Desktop runs at the display cadence; mobile is capped to save battery. */
export function lanyardFrameInterval(mobile: boolean): number {
  return mobile ? 1000 / 30 : 1000 / 60;
}
