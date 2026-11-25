/**
 * Deterministic verlet physics for the 3D lanyard prototype (CP7 T2).
 *
 * A chain of particles hangs from a pinned anchor and carries a rigid card
 * quad at its end: the strap clip links to the card's two top corners, so the
 * card pivots around the clip like a real lanyard. Positions integrate at a
 * fixed 120 Hz substep with verlet (position + previous position), tension
 * -only distance constraints along the strap, and equality constraints inside
 * the card quad. Dragging follows the pointer with a critically damped
 * exponential chase whose speed is deliberately capped below the pendulum's
 * over-the-top wrap threshold, so the implied velocity that carries into the
 * free simulation at release produces natural momentum without inversion.
 * Settling is continuous: once the residual swing is slow and near the rest
 * pose, each frame eases the whole state exponentially toward the exact rest
 * pose, and the frame loop pins the exact rest state only once the remaining
 * displacement and velocity are visually negligible.
 * There is no randomness and no wall-clock input, so
 * the same input sequence always produces the same trajectory.
 */

export const LANYARD3D_SEGMENT_COUNT = 14;
export const LANYARD3D_SUBSTEP_SECONDS = 1 / 480;
export const LANYARD3D_CONSTRAINT_ITERATIONS = 12;
export const LANYARD3D_MAX_SUBSTEPS = 16;
/** Longest wall-clock delta one frame may contribute to the solver. */
export const LANYARD3D_MAX_FRAME_DELTA_SECONDS = 0.25;
/** One frame may consume at most this much simulated time (one budget). */
export const LANYARD3D_FRAME_BUDGET_SECONDS = LANYARD3D_MAX_SUBSTEPS * LANYARD3D_SUBSTEP_SECONDS;

export interface Lanyard3dAccumulatorAdvance {
  /** Residual sub-quantum time carried into the next frame (>= 0). */
  accumulator: number;
  /** Whole-substep simulated time for the caller to step this frame. */
  consumedSeconds: number;
}

/**
 * Fixed-step frame-loop accumulator. Clamps the incoming delta to one frame
 * and drops any backlog beyond one frame budget, so a stalled frame may run
 * at most one budget of substeps now and a sustained low frame rate can
 * never fast-forward the simulation later. Without the backlog clamp a
 * 0.25 s stall drained at 2x real time for ~13 frames, and a steady 20 fps
 * grew the accumulator by ~16.7 ms per frame without bound.
 */
export function advanceLanyard3dAccumulator(
  accumulator: number,
  rawDelta: number,
): Lanyard3dAccumulatorAdvance {
  const delta = Math.min(Math.max(rawDelta, 0), LANYARD3D_MAX_FRAME_DELTA_SECONDS);
  const next = Math.min(Math.max(accumulator, 0) + delta, LANYARD3D_FRAME_BUDGET_SECONDS);
  // Quantize to whole substeps; the +1e-9 absorbs float noise so a frame
  // that supplies exactly N substeps consumes exactly N.
  const substeps = Math.min(
    LANYARD3D_MAX_SUBSTEPS,
    Math.max(0, Math.floor(next / LANYARD3D_SUBSTEP_SECONDS + 1e-9)),
  );
  const consumedSeconds = substeps * LANYARD3D_SUBSTEP_SECONDS;
  return { accumulator: Math.max(0, next - consumedSeconds), consumedSeconds };
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Lanyard3dParticle {
  position: Vec3;
  previous: Vec3;
}

export interface Lanyard3dConfig {
  strapLength: number;
  segmentRestLength: number;
  cardWidth: number;
  cardHeight: number;
  gravity: number;
  damping: number;
  ropeIterations: number;
  maxSpeed: number;
  dragFollowRate: number;
  maxDragSpeed: number;
  maxDragRadius: number;
  restSpeed: number;
  restDistance: number;
  restTiltDeg: number;
  /** Exponential settle-to-rest rate (1/s) once the pose is nearly settled. */
  settleBlendRate: number;
  /** Exact-rest handoff: center offset from rest (visually negligible). */
  restSnapDistance: number;
  /** Exact-rest handoff: particle speed (visually negligible). */
  restSnapSpeed: number;
}

export function createLanyard3dConfig(
  strapLength: number,
  cardWidth: number,
  cardHeight: number,
  referenceStrapLength = 0.55,
): Lanyard3dConfig {
  // The tuning constants were derived at the reference strap length. Speed-
  // and distance-like quantities scale with the strap so the swing dynamics
  // (ω² = g/L), the settle thresholds, and the visual feel stay identical
  // across measured layouts; the reference value reproduces the shipped
  // tuning exactly.
  const scale = strapLength / referenceStrapLength;
  return {
    strapLength,
    segmentRestLength: strapLength / LANYARD3D_SEGMENT_COUNT,
    cardWidth,
    cardHeight,
    gravity: 12 * scale,
    damping: 3.2,
    ropeIterations: LANYARD3D_CONSTRAINT_ITERATIONS,
    maxSpeed: 25 * scale,
    dragFollowRate: 18,
    // Deliberate cap on how fast dragging may move the clip, in world units
    // per second. The pendulum wraps over the anchor once its release speed
    // exceeds sqrt(g · (strapLength + cardHeight / 2)) ≈ 3.3·scale, so the
    // cap sits at ~2/3 of that threshold: a fast flick still carries natural
    // momentum into the release, but no gesture can wind the assembly up
    // into an over-the-top orbit. Speed-like, so it scales with the layout
    // like the other constants.
    maxDragSpeed: 2.2 * scale,
    maxDragRadius: strapLength * 1.3,
    restSpeed: 0.08 * scale,
    // Card-center offset tolerance from the exact rest pose. The verlet
    // chain's static sag under load is a bounded solver residual (decays with
    // substep refinement; unreachable by iteration count). The detector
    // tolerates it and the caller snaps to the exact rest pose, as the 2D
    // solver does. The residual does NOT shrink with the strap: it is driven
    // by the fixed-size card hanging off the clip, measured 0.011–0.021
    // across supported layouts (grows with card width and strap length),
    // while the scale-proportional term shrinks below it on short straps —
    // which left mobile permanently outside the gate (the entrance never
    // settled). The floor covers the worst measured sag with margin; layouts
    // at scale ≥ 1.5 (the desktop reference, 1.63) keep the original
    // proportional value exactly.
    restDistance: Math.max(0.015 * scale, 0.0225),
    restTiltDeg: 1.5,
    // Continuous settle (CP7 refinement): once the pose is slow and near rest
    // (restSpeed/restDistance above), each frame eases the whole state toward
    // the exact rest pose by `settleBlendRate` — an exponential approach that
    // reads as the natural damped tail instead of the previous one-frame
    // teleport (a measured 8.5 px jump while the card still glided at
    // ~20 px/s). Speed-like, so it scales with the layout.
    settleBlendRate: 5,
    // The exact-rest handoff threshold: sub-pixel displacement (0.002 card
    // heights ≈ 1 px on a 388 px card) and a visually-negligible residual
    // speed. Only once the blended pose is indistinguishable from rest does
    // the frame loop pin the exact rest state.
    restSnapDistance: 0.002 * scale,
    restSnapSpeed: 0.03 * scale,
  };
}

export interface Lanyard3dState {
  /** Rope particles; index 0 is the pinned anchor, the last is the strap clip. */
  rope: Lanyard3dParticle[];
  /** Card corners: [topLeft, topRight, bottomRight, bottomLeft]. */
  corners: [Lanyard3dParticle, Lanyard3dParticle, Lanyard3dParticle, Lanyard3dParticle];
  /** Swivel spring and one-shot showcase, advanced only by simulation time. */
  swivel?: {
    angle: number;
    velocity: number;
    elapsed: number;
    showcase: boolean;
    offset: number;
  };
}

export interface Lanyard3dStepOptions {
  dtSeconds: number;
  config: Lanyard3dConfig;
  dragging?: boolean;
  target?: Vec3 | null;
}

function particle(position: Vec3): Lanyard3dParticle {
  // `+ 0` normalizes -0 so snapshot equality sees plain zeros.
  return {
    position: {
      x: position.x + 0,
      y: position.y + 0,
      z: position.z + 0,
    },
    previous: {
      x: position.x + 0,
      y: position.y + 0,
      z: position.z + 0,
    },
  };
}

function copyParticle(particle: Lanyard3dParticle): Lanyard3dParticle {
  return { position: { ...particle.position }, previous: { ...particle.previous } };
}

function copyState(state: Lanyard3dState): Lanyard3dState {
  return {
    ...(state.swivel ? { swivel: { ...state.swivel } } : {}),
    rope: state.rope.map(copyParticle),
    corners: [
      copyParticle(state.corners[0]),
      copyParticle(state.corners[1]),
      copyParticle(state.corners[2]),
      copyParticle(state.corners[3]),
    ],
  };
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function createLanyard3dRestState(config: Lanyard3dConfig): Lanyard3dState {
  const rope: Lanyard3dParticle[] = [];
  for (let i = 0; i <= LANYARD3D_SEGMENT_COUNT; i += 1) {
    rope.push(particle({ x: 0, y: -config.segmentRestLength * i, z: 0 }));
  }
  const top = -config.strapLength;
  return {
    rope,
    corners: [
      particle({ x: -config.cardWidth / 2, y: top, z: 0 }),
      particle({ x: config.cardWidth / 2, y: top, z: 0 }),
      particle({ x: config.cardWidth / 2, y: top - config.cardHeight, z: 0 }),
      particle({ x: -config.cardWidth / 2, y: top - config.cardHeight, z: 0 }),
    ],
  };
}

/** Reference entrance: slack suspension and a strongly foreshortened badge. */
/** Card-top depth at spawn, fraction of strap length below the anchor. */
export const LANYARD3D_DROP_Y_RATIO = 0.65;
/** Clip horizontal offset at spawn, fraction of strap length (measured as
 *  0.18 world at the desktop reference strap of 347/388 ≈ 0.894 world). */
export const LANYARD3D_DROP_X_RATIO = 0.29;
export const LANYARD3D_DROP_YAW_DEG = 52;
export const LANYARD3D_DROP_PITCH_DEG = -50;

export function createLanyard3dDropState(config: Lanyard3dConfig): Lanyard3dState {
  const n = LANYARD3D_SEGMENT_COUNT;
  const x0 = LANYARD3D_DROP_X_RATIO * config.strapLength;
  const y0 = -LANYARD3D_DROP_Y_RATIO * config.strapLength;
  const dy = y0 / n;
  const rest = config.segmentRestLength;
  // Longest horizontal step allowed without stretching a segment: each step
  // combines this with dy, so sqrt(maxDx² + dy²) = rest exactly.
  const maxDx = Math.sqrt(Math.max(rest * rest - dy * dy, 0));
  // Slack shape: one full sine period over the chain so the clip lands exactly
  // at x₀ (shape(n) = 0) while the anchor stays exactly at the origin
  // (shape(0) = 0) — the solver pins rope[0] every step, so any offset there
  // would teleport on frame 1 and yank the chain (an artificial impulse).
  const shape = (i: number) => Math.sin((2 * Math.PI * i) / n);
  let peak = 0;
  for (let i = 0; i < n; i += 1) peak = Math.max(peak, Math.abs(shape(i + 1) - shape(i)));
  // Linear ramp carries the net anchor→clip offset; the sine adds the slack on
  // top, with amplitude scaled so no segment starts stretched.
  const ramp = x0 / n;
  const amp = peak > 0 ? Math.max(0, maxDx - Math.abs(ramp)) / peak : 0;
  const rope: Lanyard3dParticle[] = [];
  for (let i = 0; i <= n; i += 1) {
    rope.push(particle({ x: ramp * i + amp * shape(i), y: dy * i, z: 0 }));
  }
  const clip = rope[n]!.position;
  // The card hangs straight below the clip in its spawned yaw/pitch frame.
  // Orthonormal by construction: `down` is `up` rotated about `right`, so
  // right·down = 0 exactly — a non-orthogonal spawn would deform the diagonals
  // and the first constraint pass would snap the card (an artificial impulse).
  const yaw = (LANYARD3D_DROP_YAW_DEG * Math.PI) / 180;
  const pitch = (LANYARD3D_DROP_PITCH_DEG * Math.PI) / 180;
  const roll = (12 * Math.PI) / 180;
  const rolled = (v: Vec3): Vec3 => ({
    x: v.x * Math.cos(roll) - v.y * Math.sin(roll),
    y: v.x * Math.sin(roll) + v.y * Math.cos(roll),
    z: v.z,
  });
  const right = rolled({ x: Math.cos(yaw), y: 0, z: Math.sin(yaw) });
  const down = rolled({
    x: -Math.sin(yaw) * Math.sin(pitch),
    y: -Math.cos(pitch),
    z: Math.cos(yaw) * Math.sin(pitch),
  });
  const halfWidth = config.cardWidth / 2;
  const offset = (base: Vec3, axis: Vec3, scale: number): Vec3 => ({
    x: base.x + axis.x * scale,
    y: base.y + axis.y * scale,
    z: base.z + axis.z * scale,
  });
  const topLeft = offset(clip, right, -halfWidth);
  const topRight = offset(clip, right, halfWidth);
  return {
    rope,
    swivel: {
      angle: Math.atan2(right.z, right.x),
      velocity: 0,
      elapsed: 0,
      showcase: true,
      offset: 0,
    },
    corners: [
      particle(topLeft),
      particle(topRight),
      particle(offset(topRight, down, config.cardHeight)),
      particle(offset(topLeft, down, config.cardHeight)),
    ],
  };
}

function stepSwivel(state: Lanyard3dState, dragging: boolean): void {
  const swivel = state.swivel;
  if (!swivel) return;
  const dt = LANYARD3D_SUBSTEP_SECONDS;
  if (dragging && swivel.showcase) {
    // Keep the current orientation when grabbed, then let the spring unwind.
    swivel.angle += swivel.offset;
    swivel.offset = 0;
    swivel.showcase = false;
  }
  swivel.elapsed += dt;
  swivel.velocity += (-64 * swivel.angle - 3.4 * swivel.velocity) * dt;
  swivel.angle += swivel.velocity * dt;
  const ease = (t: number) => {
    const x = Math.min(1, Math.max(0, t));
    return x * x * x * (10 + x * (-15 + 6 * x));
  };
  swivel.offset = swivel.showcase
    ? Math.PI * (ease((swivel.elapsed - 2.4) / 0.18) - ease((swivel.elapsed - 3.4) / 0.18))
    : 0;
  const right = lanyard3dCardFrame(state).right;
  const delta = swivel.angle + swivel.offset - Math.atan2(right.z, right.x);
  const cos = Math.cos(delta);
  const sin = Math.sin(delta);
  const clip = state.rope[LANYARD3D_SEGMENT_COUNT]!;
  // Rotate both Verlet histories about the swivel. This adds torsion without
  // manufacturing linear release velocity or moving the attachment point.
  for (const corner of state.corners) {
    for (const key of ['position', 'previous'] as const) {
      const pivot = clip[key];
      const x = corner[key].x - pivot.x;
      const z = corner[key].z - pivot.z;
      corner[key].x = pivot.x + cos * x - sin * z;
      corner[key].z = pivot.z + sin * x + cos * z;
    }
  }
  if (
    (!swivel.showcase || swivel.elapsed > 3.8) &&
    Math.abs(swivel.angle) < 0.002 &&
    Math.abs(swivel.velocity) < 0.015
  )
    delete state.swivel;
}

/** Keeps a drag target inside the sector the strap and camera can serve. */
export function clampLanyard3dTarget(target: Vec3, config: Lanyard3dConfig): Vec3 {
  if (![target.x, target.y, target.z].every(Number.isFinite)) {
    return { x: 0, y: -config.strapLength, z: 0 };
  }
  const radius = Math.hypot(target.x, target.y, target.z);
  if (radius < 1e-6) return { x: 0, y: -config.strapLength, z: 0 };
  const clamped = Math.min(config.maxDragRadius, Math.max(config.strapLength * 0.3, radius));
  const scale = clamped / radius;
  return { x: target.x * scale, y: target.y * scale, z: target.z * scale };
}

/** Equality constraint: both endpoints share the correction. */
function constrainDistance(a: Lanyard3dParticle, b: Lanyard3dParticle, rest: number): void {
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const dz = b.position.z - a.position.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-12) return;
  const correction = ((dist - rest) / dist) * 0.5;
  a.position.x += dx * correction;
  a.position.y += dy * correction;
  a.position.z += dz * correction;
  b.position.x -= dx * correction;
  b.position.y -= dy * correction;
  b.position.z -= dz * correction;
}

/** Tension-only constraint: a strap resists stretch but folds freely. Both
 * endpoints share the correction, so teleported momentum stays negligible. */
function constrainTension(
  a: Lanyard3dParticle,
  b: Lanyard3dParticle,
  rest: number,
  pinned = false,
): void {
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const dz = b.position.z - a.position.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist <= rest || dist < 1e-12) return;
  const correction = ((dist - rest) / dist) * (pinned ? 1 : 0.5);
  if (!pinned) {
    a.position.x += dx * correction;
    a.position.y += dy * correction;
    a.position.z += dz * correction;
  }
  b.position.x -= dx * correction;
  b.position.y -= dy * correction;
  b.position.z -= dz * correction;
}

function solveConstraints(state: Lanyard3dState, config: Lanyard3dConfig): void {
  const rest = config.segmentRestLength;
  const clip = state.rope[LANYARD3D_SEGMENT_COUNT]!;
  const halfWidth = config.cardWidth / 2;
  const diagonal = Math.hypot(config.cardWidth, config.cardHeight);
  const iterations = config.ropeIterations * (state.swivel?.showcase ? 2 : 1);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    // Alternating sweep directions: a single direction diffuses corrections
    // slowly down the loaded chain (the residual sag is a fixed point of the
    // one-directional pass); sweeping back immediately after re-uses each
    // pass's settled endpoints and roughly halves the iteration count needed.
    if (iteration % 2 === 0) {
      for (let i = 1; i <= LANYARD3D_SEGMENT_COUNT; i += 1) {
        constrainTension(state.rope[i - 1]!, state.rope[i]!, rest, i === 1);
      }
    } else {
      for (let i = LANYARD3D_SEGMENT_COUNT; i >= 1; i -= 1) {
        constrainTension(state.rope[i - 1]!, state.rope[i]!, rest, i === 1);
      }
    }
    constrainDistance(clip, state.corners[0], halfWidth);
    constrainDistance(clip, state.corners[1], halfWidth);
    const c = state.corners;
    constrainDistance(c[0], c[1], config.cardWidth);
    constrainDistance(c[1], c[2], config.cardHeight);
    constrainDistance(c[2], c[3], config.cardWidth);
    constrainDistance(c[3], c[0], config.cardHeight);
    constrainDistance(c[0], c[2], diagonal);
    constrainDistance(c[1], c[3], diagonal);
    // Two half-width distance constraints converge poorly at a straight edge.
    // Pin the actual attachment midpoint, sharing its load with the chain.
    for (const axis of ['x', 'y', 'z'] as const) {
      const gap = clip.position[axis] - (c[0].position[axis] + c[1].position[axis]) / 2;
      clip.position[axis] -= gap * (2 / 3);
      c[0].position[axis] += gap / 3;
      c[1].position[axis] += gap / 3;
    }
  }
  // The anchor is pinned: constraints never move it.
  state.rope[0]!.position = { x: 0, y: 0, z: 0 };
  state.rope[0]!.previous = { x: 0, y: 0, z: 0 };
}

function stepSubstep(
  state: Lanyard3dState,
  config: Lanyard3dConfig,
  dragging: boolean,
  target: Vec3 | null,
): Lanyard3dState {
  const next = copyState(state);
  const damp = Math.exp(-config.damping * LANYARD3D_SUBSTEP_SECONDS);
  // Match the reference's ~0.8s pendulum period across different strap/card
  // ratios. Direct manipulation keeps its established release tuning.
  const gravity =
    next.swivel?.showcase && !dragging
      ? 64 * (config.strapLength + config.cardHeight / 2)
      : config.gravity;
  const gravityStep = gravity * LANYARD3D_SUBSTEP_SECONDS * LANYARD3D_SUBSTEP_SECONDS;
  const maxDisplacement = config.maxSpeed * LANYARD3D_SUBSTEP_SECONDS;

  const integrate = (particle: Lanyard3dParticle): void => {
    let vx = (particle.position.x - particle.previous.x) * damp;
    let vy = (particle.position.y - particle.previous.y) * damp;
    let vz = (particle.position.z - particle.previous.z) * damp;
    const speed = Math.hypot(vx, vy, vz);
    if (speed > maxDisplacement) {
      const scale = maxDisplacement / speed;
      vx *= scale;
      vy *= scale;
      vz *= scale;
    }
    particle.previous = { ...particle.position };
    particle.position = {
      x: particle.position.x + vx,
      y: particle.position.y + vy - gravityStep,
      z: particle.position.z + vz,
    };
  };

  for (let i = 1; i <= LANYARD3D_SEGMENT_COUNT; i += 1) integrate(next.rope[i]!);
  next.corners.forEach(integrate);

  if (dragging && target) {
    const clampedTarget = clampLanyard3dTarget(target, config);
    const clip = next.rope[LANYARD3D_SEGMENT_COUNT]!;
    // Critically damped exponential follow (dragFollowRate): every substep
    // the clip covers a fixed fraction of its remaining distance to the
    // pointer target, so the follow speed decays smoothly as the pointer
    // nears and the drag never snaps. The per-substep displacement is
    // additionally capped at maxDragSpeed, so no gesture can move the clip
    // faster than a pendulum can follow, and the implied velocity that
    // carries into the free simulation at release stays below the
    // over-the-top wrap threshold. (The previous rate-limited teleport
    // moved the clip at up to maxSpeed — ~7× the wrap threshold — and its
    // unbounded sustained momentum produced the inverted, launched card
    // recorded in the owner evidence video.)
    const dx = clampedTarget.x - clip.position.x;
    const dy = clampedTarget.y - clip.position.y;
    const dz = clampedTarget.z - clip.position.z;
    const dist = Math.hypot(dx, dy, dz);
    let implied = { x: 0, y: 0, z: 0 };
    if (dist > 1e-12) {
      const step = Math.min(
        dist * (1 - Math.exp(-config.dragFollowRate * LANYARD3D_SUBSTEP_SECONDS)),
        config.maxDragSpeed * LANYARD3D_SUBSTEP_SECONDS,
      );
      implied = {
        x: (dx / dist) * step,
        y: (dy / dist) * step,
        z: (dz / dist) * step,
      };
      clip.position = {
        x: clip.position.x + implied.x,
        y: clip.position.y + implied.y,
        z: clip.position.z + implied.z,
      };
    }
    clip.previous = {
      x: clip.position.x - implied.x,
      y: clip.position.y - implied.y,
      z: clip.position.z - implied.z,
    };
  }

  // Plain verlet: implied velocity comes from the position delta, so the
  // gentle shared corrections in the solver only contribute their own (tiny)
  // momentum.
  solveConstraints(next, config);
  stepSwivel(next, dragging);

  // The anchor is pinned: constraints never move it.
  next.rope[0]!.position = { x: 0, y: 0, z: 0 };
  next.rope[0]!.previous = { x: 0, y: 0, z: 0 };

  return next;
}

export function stepLanyard3d(
  state: Lanyard3dState,
  options: Lanyard3dStepOptions,
): Lanyard3dState {
  const { config } = options;
  const dt = Math.min(
    Math.max(options.dtSeconds, 0),
    LANYARD3D_MAX_SUBSTEPS * LANYARD3D_SUBSTEP_SECONDS,
  );
  if (dt === 0) return state;
  // Settle short-circuit on the incoming state. The verlet rest pose is not a
  // force equilibrium (gravity is uncompensated there), so stepping an
  // already-settled state re-energizes a perpetual micro-bounce; the 2D
  // solver avoids this because its pre-loaded spring balances gravity at
  // rest. Once the handoff gate passes, the pose is indistinguishable from
  // rest, so pinning the exact rest pose keeps rest a true fixed point of
  // the frame loop without a visible step.
  if (!options.dragging && isLanyard3dSettled(state, config)) {
    return createLanyard3dRestState(config);
  }
  // Continuous settle (CP7 refinement): once the residual swing is slow and
  // near rest, stop integrating — the near-equilibrium limit cycle would
  // otherwise keep pumping energy back in and stall above the handoff gate —
  // and ease the whole state exponentially toward the exact rest pose
  // instead. The visible result is the natural damped tail (the teleport of
  // the previous design is gone); idle is entered only once the pose is
  // visually negligible (the handoff gate above).
  if (!options.dragging && isLanyard3dSettleCandidate(state, config)) {
    const blended = blendTowardRest(state, config, 1 - Math.exp(-config.settleBlendRate * dt));
    // A blended pose can already satisfy the handoff gate without being the
    // exact rest pose; pin the exact pose there so "settled" and "rest" stay
    // the same state (the step is sub-pixel by the gate's own definition).
    return isLanyard3dSettled(blended, config) ? createLanyard3dRestState(config) : blended;
  }
  const substeps = Math.min(
    LANYARD3D_MAX_SUBSTEPS,
    Math.max(1, Math.round(dt / LANYARD3D_SUBSTEP_SECONDS)),
  );
  let current = state;
  for (let s = 0; s < substeps; s += 1) {
    current = stepSubstep(current, config, options.dragging === true, options.target ?? null);
  }
  if (!options.dragging && isLanyard3dSettled(current, config)) {
    return createLanyard3dRestState(config);
  }
  return current;
}

function cardCenter(state: Lanyard3dState): Vec3 {
  const c = state.corners;
  return {
    x: (c[0].position.x + c[1].position.x + c[2].position.x + c[3].position.x) / 4,
    y: (c[0].position.y + c[1].position.y + c[2].position.y + c[3].position.y) / 4,
    z: (c[0].position.z + c[1].position.z + c[2].position.z + c[3].position.z) / 4,
  };
}

function speedOf(particle: Lanyard3dParticle): number {
  return distance(particle.position, particle.previous) / LANYARD3D_SUBSTEP_SECONDS;
}

function cardTiltDeg(state: Lanyard3dState): number {
  const c = state.corners;
  const topMid = {
    x: (c[0].position.x + c[1].position.x) / 2,
    y: (c[0].position.y + c[1].position.y) / 2,
    z: (c[0].position.z + c[1].position.z) / 2,
  };
  const bottomMid = {
    x: (c[2].position.x + c[3].position.x) / 2,
    y: (c[2].position.y + c[3].position.y) / 2,
    z: (c[2].position.z + c[3].position.z) / 2,
  };
  const ux = topMid.x - bottomMid.x;
  const uy = topMid.y - bottomMid.y;
  const uz = topMid.z - bottomMid.z;
  const length = Math.hypot(ux, uy, uz);
  if (length < 1e-9) return 90;
  const cos = Math.abs(uy) / length;
  return (Math.acos(Math.min(1, cos)) * 180) / Math.PI;
}

/** Reuses the 2D detector's semantics: slow, near the rest pose, and upright.
 * This is the *settle candidate* gate: it tolerates the pinned-chain solver's
 * bounded static sag (see restDistance) and marks the moment the residual
 * motion is small enough to hand over to the continuous settle blend. */
function isLanyard3dSettleCandidate(state: Lanyard3dState, config: Lanyard3dConfig): boolean {
  if (state.swivel) return false;
  for (let i = 1; i <= LANYARD3D_SEGMENT_COUNT; i += 1) {
    if (speedOf(state.rope[i]!) >= config.restSpeed) return false;
  }
  for (const corner of state.corners) {
    if (speedOf(corner) >= config.restSpeed) return false;
  }
  const restCenter = {
    x: 0,
    y: -config.strapLength - config.cardHeight / 2,
    z: 0,
  };
  if (distance(cardCenter(state), restCenter) >= config.restDistance) return false;
  return cardTiltDeg(state) < config.restTiltDeg;
}

/** The exact-rest handoff gate: displacement and velocity are individually
 * visually negligible (sub-pixel offset, near-zero drift), so pinning the
 * exact rest pose here is an invisible step, never a visible snap. The
 * continuous settle blend drives the state across this threshold. */
export function isLanyard3dSettled(state: Lanyard3dState, config: Lanyard3dConfig): boolean {
  if (state.swivel) return false;
  for (let i = 1; i <= LANYARD3D_SEGMENT_COUNT; i += 1) {
    if (speedOf(state.rope[i]!) >= config.restSnapSpeed) return false;
  }
  for (const corner of state.corners) {
    if (speedOf(corner) >= config.restSnapSpeed) return false;
  }
  const restCenter = {
    x: 0,
    y: -config.strapLength - config.cardHeight / 2,
    z: 0,
  };
  if (distance(cardCenter(state), restCenter) >= config.restSnapDistance) return false;
  const rest = createLanyard3dRestState(config);
  if (
    state.corners.some(
      (corner, i) =>
        distance(corner.position, rest.corners[i]!.position) >= config.restSnapDistance,
    )
  )
    return false;
  return cardTiltDeg(state) < config.restTiltDeg;
}

/** Eases the whole state toward the exact rest pose by `alpha`, blending
 * positions and the velocity-implying previous positions together so the
 * residual velocity decays smoothly (it scales by 1 − alpha) instead of
 * cutting off — the frame-to-frame continuity the teleport lacked. */
function blendTowardRest(
  state: Lanyard3dState,
  config: Lanyard3dConfig,
  alpha: number,
): Lanyard3dState {
  const rest = createLanyard3dRestState(config);
  const mix = (from: Vec3, to: Vec3): Vec3 => ({
    x: from.x + (to.x - from.x) * alpha,
    y: from.y + (to.y - from.y) * alpha,
    z: from.z + (to.z - from.z) * alpha,
  });
  const blendParticle = (particle: Lanyard3dParticle, restParticle: Lanyard3dParticle) => ({
    position: mix(particle.position, restParticle.position),
    // Blending `previous` toward the rest position scales the implied
    // velocity rather than snapping it.
    previous: mix(particle.previous, restParticle.position),
  });
  return {
    rope: state.rope.map((particle, index) => blendParticle(particle, rest.rope[index]!)),
    corners: state.corners.map((corner, index) => blendParticle(corner, rest.corners[index]!)) as [
      Lanyard3dParticle,
      Lanyard3dParticle,
      Lanyard3dParticle,
      Lanyard3dParticle,
    ],
  };
}

/** Rendering frame: card center plus its orthonormal right/up axes. */
export function lanyard3dCardFrame(state: Lanyard3dState): {
  center: Vec3;
  right: Vec3;
  up: Vec3;
} {
  const center = cardCenter(state);
  const c = state.corners;
  const rx = c[1].position.x - c[0].position.x;
  const ry = c[1].position.y - c[0].position.y;
  const rz = c[1].position.z - c[0].position.z;
  const rightLength = Math.hypot(rx, ry, rz);
  const right = { x: rx / rightLength, y: ry / rightLength, z: rz / rightLength };
  const topMid = {
    x: (c[0].position.x + c[1].position.x) / 2,
    y: (c[0].position.y + c[1].position.y) / 2,
    z: (c[0].position.z + c[1].position.z) / 2,
  };
  const bottomMid = {
    x: (c[2].position.x + c[3].position.x) / 2,
    y: (c[2].position.y + c[3].position.y) / 2,
    z: (c[2].position.z + c[3].position.z) / 2,
  };
  const ux = topMid.x - bottomMid.x;
  const uy = topMid.y - bottomMid.y;
  const uz = topMid.z - bottomMid.z;
  const upLength = Math.hypot(ux, uy, uz);
  const up = { x: ux / upLength, y: uy / upLength, z: uz / upLength };
  return { center, right, up };
}

/** Rope polyline for the strap tube, anchor to clip. */
export function lanyard3dRopePoints(state: Lanyard3dState): Vec3[] {
  return state.rope.map((particle) => ({ ...particle.position }));
}
