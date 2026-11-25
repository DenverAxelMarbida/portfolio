import { describe, expect, test } from 'vitest';
import {
  LANYARD3D_CONSTRAINT_ITERATIONS,
  LANYARD3D_SEGMENT_COUNT,
  LANYARD3D_SUBSTEP_SECONDS,
  clampLanyard3dTarget,
  createLanyard3dConfig,
  createLanyard3dDropState,
  createLanyard3dRestState,
  isLanyard3dSettled,
  lanyard3dCardFrame,
  stepLanyard3d,
  type Lanyard3dConfig,
  type Lanyard3dState,
  type Lanyard3dStepOptions,
  type Vec3,
} from '../../src/components/motion/lanyard3dPhysics';

const CONFIG = createLanyard3dConfig(0.55, 0.34, 0.44);

const FREE_OPTIONS = { dtSeconds: 1 / 60, config: CONFIG };

/** Runs `seconds` of simulated time in 60 Hz caller frames. */
function run(
  state: Lanyard3dState,
  seconds: number,
  options: Lanyard3dStepOptions = FREE_OPTIONS,
): Lanyard3dState {
  let current = state;
  const frames = Math.round(seconds * 60);
  for (let frame = 0; frame < frames; frame += 1) current = stepLanyard3d(current, options);
  return current;
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function cardCenter(state: Lanyard3dState): Vec3 {
  const sum = state.corners.reduce(
    (acc, corner) => ({
      x: acc.x + corner.position.x,
      y: acc.y + corner.position.y,
      z: acc.z + corner.position.z,
    }),
    { x: 0, y: 0, z: 0 },
  );
  return { x: sum.x / 4, y: sum.y / 4, z: sum.z / 4 };
}

/** Largest relative deviation across the six rigid card constraints. */
function maxCardDeformation(state: Lanyard3dState, config: Lanyard3dConfig): number {
  const c = state.corners.map((corner) => corner.position);
  const edges = [
    distance(c[0]!, c[1]!) / config.cardWidth,
    distance(c[1]!, c[2]!) / config.cardHeight,
    distance(c[2]!, c[3]!) / config.cardWidth,
    distance(c[3]!, c[0]!) / config.cardHeight,
  ];
  const diagonal = Math.hypot(config.cardWidth, config.cardHeight);
  const diagonals = [distance(c[0]!, c[2]!) / diagonal, distance(c[1]!, c[3]!) / diagonal];
  return Math.max(...[...edges, ...diagonals].map((ratio) => Math.abs(ratio - 1)));
}

/** Largest relative stretch across the rope segments and the two clip links. */
function maxRopeStretch(state: Lanyard3dState, config: Lanyard3dConfig): number {
  let worst = 0;
  for (let i = 1; i < state.rope.length; i += 1) {
    const stretch =
      distance(state.rope[i]!.position, state.rope[i - 1]!.position) / config.segmentRestLength - 1;
    worst = Math.max(worst, stretch);
  }
  const clip = state.rope[state.rope.length - 1]!.position;
  const halfWidth = config.cardWidth / 2;
  for (const corner of [state.corners[0], state.corners[1]]) {
    worst = Math.max(worst, distance(clip, corner.position) / halfWidth - 1);
  }
  return worst;
}

/** Speed of the fastest particle, in units per second. */
function maxParticleSpeed(state: Lanyard3dState): number {
  let worst = 0;
  for (const particle of [...state.rope.slice(1), ...state.corners]) {
    const speed = distance(particle.position, particle.previous) / LANYARD3D_SUBSTEP_SECONDS;
    worst = Math.max(worst, speed);
  }
  return worst;
}

function kineticEnergy(state: Lanyard3dState): number {
  let energy = 0;
  for (const particle of [...state.rope.slice(1), ...state.corners]) {
    const dx = particle.position.x - particle.previous.x;
    const dy = particle.position.y - particle.previous.y;
    const dz = particle.position.z - particle.previous.z;
    energy += dx * dx + dy * dy + dz * dz;
  }
  return energy;
}

describe('lanyard3d initial states', () => {
  test('the rest state hangs straight down and satisfies every constraint exactly', () => {
    const state = createLanyard3dRestState(CONFIG);
    expect(state.rope).toHaveLength(LANYARD3D_SEGMENT_COUNT + 1);
    expect(state.rope[0]!.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(maxRopeStretch(state, CONFIG)).toBeCloseTo(0, 12);
    expect(maxCardDeformation(state, CONFIG)).toBeCloseTo(0, 12);
    expect(isLanyard3dSettled(state, CONFIG)).toBe(true);
  });

  test('the drop state spawns above rest with a slack rope and zero velocity', () => {
    const state = createLanyard3dDropState(CONFIG);
    // Rigid card in its spawned yaw/pitch frame: no deformation, no stretch.
    expect(maxCardDeformation(state, CONFIG)).toBeCloseTo(0, 9);
    expect(maxRopeStretch(state, CONFIG)).toBeLessThan(1e-9); // slack, never stretched
    expect(maxParticleSpeed(state)).toBe(0);
    const clip = state.rope[LANYARD3D_SEGMENT_COUNT]!.position;
    expect(clip.x).toBeGreaterThan(0); // offset toward +x, matching the 2D drop
    expect(clip.y).toBeLessThan(0); // still below the anchor
    // The reference opens with a raised clip and a foreshortened card.
    const restCenter = cardCenter(createLanyard3dRestState(CONFIG));
    const startCenter = cardCenter(state);
    expect(startCenter.y - restCenter.y).toBeGreaterThan(0.25);
    expect(startCenter.y - restCenter.y).toBeLessThan(0.4);
    // The anchor starts at the origin (the solver pins it; an offset anchor
    // would teleport on frame 1 and yank the chain).
    expect(state.rope[0]!.position).toEqual({ x: 0, y: 0, z: 0 });
    // No segment begins stretched: each horizontal step is bounded so
    // sqrt(dx² + dy²) ≤ rest length.
    for (let i = 1; i <= LANYARD3D_SEGMENT_COUNT; i += 1) {
      const a = state.rope[i - 1]!.position;
      const b = state.rope[i]!.position;
      expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)).toBeLessThanOrEqual(
        CONFIG.segmentRestLength + 1e-9,
      );
    }
  });
});

describe('lanyard3d free motion', () => {
  test('the anchor stays pinned at the origin through any simulation', () => {
    const final = run(createLanyard3dDropState(CONFIG), 1.5);
    expect(final.rope[0]!.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(final.rope[0]!.previous).toEqual({ x: 0, y: 0, z: 0 });
  });

  test('gravity swings the card and the constraints hold within epsilon', () => {
    let state = createLanyard3dDropState(CONFIG);
    const restCenter = cardCenter(createLanyard3dRestState(CONFIG));
    let peakStretch = 0;
    let peakDeformation = 0;
    let peakBlendDeformation = 0;
    let peakExcursion = 0;
    for (let frame = 0; frame < 120; frame += 1) {
      state = stepLanyard3d(state, FREE_OPTIONS);
      // Physics phase: far enough from rest that the settle blend cannot be
      // active (blend engages inside restDistance of the rest center).
      const nearRest = distance(cardCenter(state), restCenter) < 2 * CONFIG.restDistance;
      const stretch = maxRopeStretch(state, CONFIG);
      const deformation = maxCardDeformation(state, CONFIG);
      if (nearRest) peakBlendDeformation = Math.max(peakBlendDeformation, deformation);
      else {
        peakStretch = Math.max(peakStretch, stretch);
        peakDeformation = Math.max(peakDeformation, deformation);
      }
      const clip = state.rope[LANYARD3D_SEGMENT_COUNT]!.position;
      peakExcursion = Math.max(peakExcursion, Math.abs(clip.x));
    }
    // The card actually fell and swung: the clip traveled sideways well past
    // its rest position during the motion.
    expect(peakExcursion).toBeGreaterThan(0.1);
    // The fast arrest must not stretch the strap or deform the rigid badge.
    expect(peakStretch).toBeLessThan(0.065);
    expect(peakDeformation).toBeLessThan(0.002);
    // The final sub-pixel interpolation cannot visibly collapse the badge.
    expect(peakBlendDeformation).toBeLessThan(0.08);
  });

  test('no particle ever exceeds the velocity clamp and energy does not explode', () => {
    let state = createLanyard3dDropState(CONFIG);
    let peakEnergy = 0;
    let peakSpeed = 0;
    for (let frame = 0; frame < 240; frame += 1) {
      state = stepLanyard3d(state, FREE_OPTIONS);
      peakSpeed = Math.max(peakSpeed, maxParticleSpeed(state));
      peakEnergy = Math.max(peakEnergy, kineticEnergy(state));
    }
    expect(Number.isFinite(peakSpeed)).toBe(true);
    expect(peakSpeed).toBeLessThanOrEqual(CONFIG.maxSpeed + 1e-9);
    expect(peakEnergy).toBeGreaterThan(0); // the system actually moved
    expect(kineticEnergy(state)).toBeLessThan(peakEnergy);
  });

  test('a drop released from rest settles to the hanging pose in bounded time', () => {
    let state = createLanyard3dDropState(CONFIG);
    let settledAtFrame = -1;
    for (let frame = 0; frame < 60 * 6; frame += 1) {
      state = stepLanyard3d(state, FREE_OPTIONS);
      if (isLanyard3dSettled(state, CONFIG)) {
        settledAtFrame = frame;
        break;
      }
    }
    expect(settledAtFrame).toBeGreaterThanOrEqual(0);
    expect(settledAtFrame).toBeGreaterThan(60 * 3.5); // includes the showcase
    expect(settledAtFrame).toBeLessThan(60 * 6);
    expect(state).toEqual(createLanyard3dRestState(CONFIG));
    // It stays settled — rest must be a true fixed point of the frame loop,
    // not a limit cycle: stepping the settled state must return the exact
    // rest pose on every subsequent frame.
    let after = state;
    for (let frame = 0; frame < 60 * 2; frame += 1) {
      after = stepLanyard3d(after, FREE_OPTIONS);
      expect(after).toEqual(createLanyard3dRestState(CONFIG));
    }
  });
});

/** Card-frame angles (degrees) from the render frame: yaw about Y, pitch
 *  about the horizontal, roll in-plane — the X/Y/Z rotation evidence. */
function frameAnglesDeg(state: Lanyard3dState): { yaw: number; pitch: number; roll: number } {
  const f = lanyard3dCardFrame(state);
  const n = {
    x: f.right.y * f.up.z - f.right.z * f.up.y,
    y: f.right.z * f.up.x - f.right.x * f.up.z,
    z: f.right.x * f.up.y - f.right.y * f.up.x,
  };
  const rad = 180 / Math.PI;
  return {
    yaw: Math.atan2(n.x, n.z) * rad,
    pitch: Math.atan2(n.y, Math.hypot(n.x, n.z)) * rad,
    roll: Math.atan2(f.right.y, f.right.x) * rad,
  };
}

describe('lanyard3d gravity drop (CP7 Refinement B)', () => {
  // Real desktop geometry at 1280px: strap 347px, card 320x388px → world.
  const DESKTOP = createLanyard3dConfig(347 / 388, 320 / 388, 1);
  const PX = 388; // world units → px (card height is 1 world unit = 388 px)
  const OPTS = { dtSeconds: 1 / 60, config: DESKTOP };

  /** Simulates the entrance, collecting per-frame telemetry. */
  function simulate(frames = 60 * 6) {
    let state = createLanyard3dDropState(DESKTOP);
    const restCenter = cardCenter(createLanyard3dRestState(DESKTOP));
    const start = cardCenter(state);
    let minY = start.y; // lowest point (max downward travel)
    let peakVy = 0;
    let prevVy = 0;
    let maxFrameAccel = 0;
    let maxStepPx = 0; // largest per-frame center displacement (teleport guard)
    let settleFrame = -1;
    let maxRoll = 0;
    let maxPitch = 0;
    let maxYaw = 0;
    let maxCx = 0;
    let prev = start;
    for (let frame = 0; frame < frames; frame += 1) {
      state = stepLanyard3d(state, OPTS);
      const c = cardCenter(state);
      const step = distance(c, prev) * PX;
      maxStepPx = Math.max(maxStepPx, step);
      const vy = ((c.y - prev.y) * PX) / (1 / 60); // px/s
      maxFrameAccel = Math.max(maxFrameAccel, Math.abs(vy - prevVy) / (1 / 60));
      prevVy = vy;
      minY = Math.min(minY, c.y);
      peakVy = Math.min(peakVy, vy); // most negative (downward) px/s
      maxCx = Math.max(maxCx, Math.abs(c.x - restCenter.x) * PX);
      const a = frameAnglesDeg(state);
      maxRoll = Math.max(maxRoll, Math.abs(a.roll));
      maxPitch = Math.max(maxPitch, Math.abs(a.pitch));
      maxYaw = Math.max(maxYaw, Math.abs(a.yaw));
      if (settleFrame === -1 && isLanyard3dSettled(state, DESKTOP)) settleFrame = frame;
      prev = c;
    }
    return {
      dropPx: (start.y - restCenter.y) * PX,
      overshootPx: (restCenter.y - minY) * PX,
      peakVyPx: peakVy,
      maxFrameAccelPx: maxFrameAccel,
      maxStepPx,
      settleMs: settleFrame * (1000 / 60),
      maxRoll,
      maxPitch,
      maxYaw,
      maxCxPx: maxCx,
      final: state,
    };
  }

  test('the entrance is a measured vertical drop that the strap arrests', () => {
    const m = simulate();
    // Genuine gravity drop: far above the 97 px lateral-swing baseline, and
    // the fall starts visually above the rest pose (partially off-hero).
    expect(m.dropPx).toBeGreaterThan(200);
    expect(m.dropPx).toBeLessThan(320); // stays a hero-scale entrance
    // Gravity accelerates the fall to a real speed (≥ 1000 px/s) before the
    // taut strap catches it.
    expect(m.peakVyPx).toBeLessThan(-1000);
    // Restrained overshoot: the arrest carries the card only ~18 px past rest
    // (≈4.5% of the 388 px card), then damping pulls it back.
    expect(m.overshootPx).toBeGreaterThan(0);
    expect(m.overshootPx).toBeLessThan(25);
    // No teleport or rigid-body reset anywhere in the entrance: the largest
    // single-frame center step stays far below the 245 px average fall frame.
    expect(m.maxStepPx).toBeLessThan(40);
    // A faster reference drop permits greater acceleration but still spreads
    // the arrest across frames instead of removing all speed in one frame.
    expect(m.maxFrameAccelPx).toBeLessThan(Math.abs(m.peakVyPx) * 60 * 0.9);
  });

  test('the entrance starts turned and the showcase crosses both side views continuously', () => {
    const spawn = frameAnglesDeg(createLanyard3dDropState(DESKTOP));
    expect(Math.abs(spawn.yaw)).toBeGreaterThan(35);
    expect(Math.abs(spawn.yaw)).toBeLessThan(70);
    expect(Math.abs(spawn.pitch)).toBeGreaterThan(40);
    expect(Math.abs(spawn.roll)).toBeGreaterThan(8);

    let state = createLanyard3dDropState(DESKTOP);
    let prevYaw = spawn.yaw;
    let maxAbsYaw = Math.abs(spawn.yaw);
    let maxStepDeg = 0;
    for (let frame = 0; frame < 60 * 6; frame += 1) {
      state = stepLanyard3d(state, OPTS);
      const yaw = frameAnglesDeg(state).yaw;
      // Shortest angular distance, so a wrap cannot masquerade as continuity.
      const step = Math.abs(((yaw - prevYaw + 540) % 360) - 180);
      maxStepDeg = Math.max(maxStepDeg, step);
      maxAbsYaw = Math.max(maxAbsYaw, Math.abs(yaw));
      prevYaw = yaw;
    }
    expect(maxAbsYaw).toBeGreaterThan(170);
    expect(maxStepDeg).toBeLessThan(36);
    expect(state).toEqual(createLanyard3dRestState(DESKTOP));
  });

  test('the card shows visible X/Y/Z rotation and a restrained pendulum', () => {
    const m = simulate();
    expect(m.maxYaw).toBeGreaterThan(170);
    // Pitch and roll oscillate under tension — all three axes move.
    expect(m.maxPitch).toBeGreaterThan(5);
    expect(m.maxRoll).toBeGreaterThan(6);
    // The foreshortened spawn extends toward the right, as in the reference.
    expect(m.maxCxPx).toBeGreaterThan(25);
    expect(m.maxCxPx).toBeLessThan(260);
    expect(m.settleMs).toBeGreaterThan(3500);
    expect(m.settleMs).toBeLessThan(6000);
    expect(m.final).toEqual(createLanyard3dRestState(DESKTOP));
  });

  test('the mobile shell config produces the same entrance shape', () => {
    // Mobile shell mode: strap 120px → the ratio-based init must scale, not
    // break (all entrance offsets are fractions of the strap length).
    const MOBILE = createLanyard3dConfig(120 / 388, 320 / 388, 1);
    let state = createLanyard3dDropState(MOBILE);
    const restCenter = cardCenter(createLanyard3dRestState(MOBILE));
    const start = cardCenter(state);
    expect(start.y - restCenter.y).toBeGreaterThan(0.3);
    expect(start.y - restCenter.y).toBeLessThan(0.45);
    expect(state.rope[0]!.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(maxRopeStretch(state, MOBILE)).toBeLessThan(1e-9);
    let settleFrame = -1;
    for (let frame = 0; frame < 60 * 6; frame += 1) {
      state = stepLanyard3d(state, { dtSeconds: 1 / 60, config: MOBILE });
      if (settleFrame === -1 && isLanyard3dSettled(state, MOBILE)) settleFrame = frame;
    }
    expect(settleFrame).toBeGreaterThanOrEqual(0);
    expect(state).toEqual(createLanyard3dRestState(MOBILE));
  });
});

describe('lanyard3d dragging', () => {
  test('dragging displaces the card toward the target and the rope follows without detaching', () => {
    const target = { x: 0.42, y: -0.28, z: 0.18 };
    let state = createLanyard3dRestState(CONFIG);
    const dragOptions = { dtSeconds: 1 / 60, config: CONFIG, dragging: true, target };
    state = run(state, 0.75, dragOptions);

    const center = cardCenter(state);
    const restCenter = cardCenter(createLanyard3dRestState(CONFIG));
    expect(distance(center, restCenter)).toBeGreaterThan(0.15);
    expect(maxRopeStretch(state, CONFIG)).toBeLessThan(0.06);
    expect(maxCardDeformation(state, CONFIG)).toBeLessThan(0.002);

    // The rope chain still reaches from the pinned anchor to the clip.
    const clip = state.rope[LANYARD3D_SEGMENT_COUNT]!.position;
    expect(distance({ x: 0, y: 0, z: 0 }, clip)).toBeLessThanOrEqual(
      CONFIG.strapLength * 1.3 + 1e-6,
    );
  });

  test('the drag target is clamped to the safe radius around the anchor', () => {
    const wild = { x: 0, y: -50, z: 0 };
    let state = createLanyard3dRestState(CONFIG);
    state = run(state, 0.5, { dtSeconds: 1 / 60, config: CONFIG, dragging: true, target: wild });
    const clip = state.rope[LANYARD3D_SEGMENT_COUNT]!.position;
    expect(Math.hypot(clip.x, clip.y, clip.z)).toBeLessThanOrEqual(CONFIG.strapLength * 1.3 + 1e-6);
  });

  test('release carries momentum and then settles back to rest', () => {
    const target = { x: 0.45, y: -0.3, z: 0 };
    let state = run(createLanyard3dRestState(CONFIG), 0.6, {
      dtSeconds: 1 / 60,
      config: CONFIG,
      dragging: true,
      target,
    });
    const speedAtRelease = maxParticleSpeed(state);
    expect(speedAtRelease).toBeGreaterThan(0.2);

    let settled = false;
    for (let frame = 0; frame < 60 * 4; frame += 1) {
      state = stepLanyard3d(state, FREE_OPTIONS);
      if (isLanyard3dSettled(state, CONFIG)) {
        settled = true;
        break;
      }
    }
    expect(settled, 'released card settles in bounded time').toBe(true);
    expect(state).toEqual(createLanyard3dRestState(CONFIG));
  });
});

describe('lanyard3d release stability (CP7 correction)', () => {
  /** Violent sustained orbit drag, like the owner evidence video: the clip
   * target circles the anchor at maxDragRadius at ~18 rad/s (~2 revolutions
   * in 0.7s of simulated time). */
  function violentOrbitDrag(config: Lanyard3dConfig, seconds: number): Lanyard3dState {
    let state = createLanyard3dRestState(config);
    const radius = config.maxDragRadius;
    const frames = Math.round(seconds * 60);
    for (let frame = 0; frame < frames; frame += 1) {
      const angle = (frame / 60) * 18 - Math.PI / 2;
      state = stepLanyard3d(state, {
        dtSeconds: 1 / 60,
        config,
        dragging: true,
        target: clampLanyard3dTarget(
          { x: radius * Math.cos(angle), y: radius * Math.sin(angle), z: 0 },
          config,
        ),
      });
    }
    return state;
  }

  /** Runs `seconds` of free time, returning the observed extremes. */
  function freeFlight(config: Lanyard3dConfig, state: Lanyard3dState, seconds: number) {
    let current = state;
    let maxTilt = cardTiltDeg(current);
    let maxCenterY = -Infinity;
    let settledAtFrame = -1;
    for (let frame = 0; frame < Math.round(seconds * 60); frame += 1) {
      current = stepLanyard3d(current, { dtSeconds: 1 / 60, config });
      maxTilt = Math.max(maxTilt, cardTiltDeg(current));
      maxCenterY = Math.max(maxCenterY, cardCenter(current).y);
      if (settledAtFrame === -1 && isLanyard3dSettled(current, config)) settledAtFrame = frame;
    }
    return { current, maxTilt, maxCenterY, settledAtFrame };
  }

  function cardTiltDeg(state: Lanyard3dState): number {
    const c = state.corners;
    const ux = (c[0].position.x + c[1].position.x) / 2 - (c[2].position.x + c[3].position.x) / 2;
    const uy = (c[0].position.y + c[1].position.y) / 2 - (c[2].position.y + c[3].position.y) / 2;
    const length = Math.hypot(ux, uy);
    return length < 1e-9 ? 90 : (Math.acos(Math.min(1, Math.abs(uy) / length)) * 180) / Math.PI;
  }

  test('a violent flick releases into a swing that never wraps over the anchor', () => {
    const dragged = violentOrbitDrag(CONFIG, 0.7);
    const { maxTilt, maxCenterY, settledAtFrame } = freeFlight(CONFIG, dragged, 6);
    // The pre-fix solver wrapped the card sideways-to-inverted (measured 86.8°
    // peak tilt) with the card center launching above the anchor. Natural
    // momentum keeps a strong swing — well past 30° — but must stay on the
    // lower half of the arc, far from the ~90° sideways/inverted wrap.
    expect(maxTilt).toBeLessThan(55);
    expect(maxCenterY).toBeLessThan(0);
    expect(settledAtFrame).toBeGreaterThanOrEqual(0);
    expect(settledAtFrame).toBeLessThan(60 * 4);
    expect(dragged.corners.every((corner) => Number.isFinite(corner.position.x))).toBe(true);
  });

  test('a sustained violent orbit drag cannot accumulate wrap momentum', () => {
    // Two full seconds of continuous circling: the pre-fix solver kept
    // winding the assembly up (constraint-correction momentum is unbounded)
    // and still wrapped after release with the card center above the anchor.
    const dragged = violentOrbitDrag(CONFIG, 2.0);
    const { maxTilt, maxCenterY, settledAtFrame } = freeFlight(CONFIG, dragged, 6);
    expect(maxTilt).toBeLessThan(45);
    expect(maxCenterY).toBeLessThan(0);
    expect(settledAtFrame).toBeGreaterThanOrEqual(0);
    expect(settledAtFrame).toBeLessThan(60 * 4);
    expect(maxRopeStretch(dragged, CONFIG)).toBeLessThan(0.06);
    expect(maxCardDeformation(dragged, CONFIG)).toBeLessThan(0.002);
  });

  test('the drag follow never moves the clip faster than maxDragSpeed', () => {
    let state = createLanyard3dRestState(CONFIG);
    let peakClipSpeed = 0;
    for (let frame = 0; frame < 120; frame += 1) {
      const angle = (frame / 60) * 18 - Math.PI / 2;
      state = stepLanyard3d(state, {
        dtSeconds: 1 / 60,
        config: CONFIG,
        dragging: true,
        target: clampLanyard3dTarget(
          {
            x: CONFIG.maxDragRadius * Math.cos(angle),
            y: CONFIG.maxDragRadius * Math.sin(angle),
            z: 0,
          },
          CONFIG,
        ),
      });
      const clip = state.rope[LANYARD3D_SEGMENT_COUNT]!;
      const speed = distance(clip.position, clip.previous) / LANYARD3D_SUBSTEP_SECONDS;
      peakClipSpeed = Math.max(peakClipSpeed, speed);
    }
    expect(peakClipSpeed).toBeLessThanOrEqual(CONFIG.maxDragSpeed + 1e-9);
    // The drag cap must sit below the over-the-top wrap threshold
    // sqrt(g · (strapLength + cardHeight / 2)) so a released flick cannot
    // invert the card.
    const wrapThreshold = Math.sqrt(CONFIG.gravity * (CONFIG.strapLength + CONFIG.cardHeight / 2));
    expect(CONFIG.maxDragSpeed).toBeLessThan(wrapThreshold);
  });

  test('the drag follow converges on a held target (responsive, no lag deadlock)', () => {
    // Target within the rope's reach (the clip cannot sit beyond the strap
    // length, so unreachable targets would never converge by physics).
    const target = { x: 0.25, y: -0.45, z: 0.05 };
    const state = run(createLanyard3dRestState(CONFIG), 1.0, {
      dtSeconds: 1 / 60,
      config: CONFIG,
      dragging: true,
      target,
    });
    const clip = state.rope[LANYARD3D_SEGMENT_COUNT]!.position;
    // After one second the exponential follow has covered the initial
    // distance many times over; the clip must sit at the clamped target.
    const settled = clampLanyard3dTarget(target, CONFIG);
    expect(distance(clip, settled)).toBeLessThan(0.02 * CONFIG.strapLength);
  });

  test('release momentum stays natural: a hard flick swings, it does not teleport', () => {
    const dragged = violentOrbitDrag(CONFIG, 0.7);
    const speedAtRelease = maxParticleSpeed(dragged);
    // Real momentum (the pre-fix teleport carried up to the full 36 world/s
    // cap) but bounded by the deliberate drag cap plus bounded constraint
    // corrections — far below the pre-fix release energy.
    expect(speedAtRelease).toBeGreaterThan(CONFIG.maxDragSpeed * 0.25);
    expect(speedAtRelease).toBeLessThan(CONFIG.maxSpeed);
  });

  test('frame-time variation does not destabilize the release', () => {
    // The same violent gesture delivered in 30 Hz caller frames (the largest
    // dt the solver accepts) must release just as stably as 60 Hz frames.
    for (const dt of [1 / 60, 1 / 30]) {
      let state = createLanyard3dRestState(CONFIG);
      const frames = Math.round(0.7 / dt);
      for (let frame = 0; frame < frames; frame += 1) {
        const angle = frame * dt * 18 - Math.PI / 2;
        state = stepLanyard3d(state, {
          dtSeconds: dt,
          config: CONFIG,
          dragging: true,
          target: clampLanyard3dTarget(
            {
              x: CONFIG.maxDragRadius * Math.cos(angle),
              y: CONFIG.maxDragRadius * Math.sin(angle),
              z: 0,
            },
            CONFIG,
          ),
        });
      }
      let current = state;
      let maxTilt = 0;
      let settled = false;
      for (let frame = 0; frame < 60 * 6; frame += 1) {
        current = stepLanyard3d(current, { dtSeconds: dt, config: CONFIG });
        maxTilt = Math.max(maxTilt, cardTiltDeg(current));
        if (isLanyard3dSettled(current, CONFIG)) {
          settled = true;
          break;
        }
      }
      expect(maxTilt, `release stays unwrapped at ${dt}s frames`).toBeLessThan(55);
      expect(settled, `release settles at ${dt}s frames`).toBe(true);
      expect(Number.isFinite(cardCenter(current).x)).toBe(true);
    }
  });
});

describe('lanyard3d settle continuity (CP7 refinement)', () => {
  /** A moderate drag held briefly, then released: enough displacement to
   * swing, not enough to wrap. Returns the per-frame card-center distances to
   * the exact rest center, from release until the solver reports settled. */
  function releaseCenterDistances(): { deltas: number[]; settledFrame: number } {
    const rest = createLanyard3dRestState(CONFIG);
    const restCenter = cardCenter(rest);
    let state = run(rest, 0.5, {
      dtSeconds: 1 / 60,
      config: CONFIG,
      dragging: true,
      target: { x: 0.3, y: -0.35, z: 0 },
    });
    const deltas: number[] = [];
    let settledFrame = -1;
    for (let frame = 0; frame < 60 * 5; frame += 1) {
      const before = distance(cardCenter(state), restCenter);
      state = stepLanyard3d(state, FREE_OPTIONS);
      const after = distance(cardCenter(state), restCenter);
      deltas.push(after - before);
      if (settledFrame === -1 && isLanyard3dSettled(state, CONFIG)) {
        settledFrame = frame;
        break;
      }
    }
    return { deltas, settledFrame };
  }

  test('settling is continuous: the pose never teleports toward rest', () => {
    // Only frames inside the settle window count: before the candidate gate
    // fires, the largest frame drop is natural swing decay, not settling.
    // The pre-refinement detector replaced the state with the exact rest pose
    // the moment the center entered the restDistance sphere — a measured
    // ~0.022-unit jump while the card still glided at ~0.05 u/s — and that
    // jump always happened inside this window. The continuous blend eases
    // across it, so the largest in-window drop stays an order of magnitude
    // smaller.
    const rest = createLanyard3dRestState(CONFIG);
    const restCenter = cardCenter(rest);
    let state = run(rest, 0.5, {
      dtSeconds: 1 / 60,
      config: CONFIG,
      dragging: true,
      target: { x: 0.3, y: -0.35, z: 0 },
    });
    const deltas: number[] = [];
    for (let frame = 0; frame < 60 * 5; frame += 1) {
      const inWindow =
        distance(cardCenter(state), restCenter) < 0.02 && maxParticleSpeed(state) < 0.1;
      const before = cardCenter(state);
      state = stepLanyard3d(state, FREE_OPTIONS);
      if (inWindow)
        deltas.push(distance(cardCenter(state), restCenter) - distance(before, restCenter));
      if (isLanyard3dSettled(state, CONFIG)) break;
    }
    expect(deltas.length).toBeGreaterThan(0);
    const largestDrop = Math.min(...deltas);
    expect(largestDrop).toBeGreaterThan(-0.004);
  });

  test('the exact-rest handoff happens only when visually negligible', () => {
    // Owner criterion: enter idle only when displacement and velocity are
    // visually negligible. The state one frame before the solver hands over
    // to the exact rest pose must already sit within the sub-pixel snap
    // distance and move slower than the snap speed — the pre-refinement
    // detector handed over from a state 0.015 units away moving at ~0.05 u/s.
    const rest = createLanyard3dRestState(CONFIG);
    const restCenter = cardCenter(rest);
    let state = run(rest, 0.5, {
      dtSeconds: 1 / 60,
      config: CONFIG,
      dragging: true,
      target: { x: 0.3, y: -0.35, z: 0 },
    });
    let previous = state;
    let checked = false;
    for (let frame = 0; frame < 60 * 5; frame += 1) {
      previous = state;
      state = stepLanyard3d(state, FREE_OPTIONS);
      if (isLanyard3dSettled(state, CONFIG)) {
        checked = true;
        break;
      }
    }
    expect(checked, 'released card settles in bounded time').toBe(true);
    expect(state).toEqual(rest);
    expect(distance(cardCenter(previous), restCenter)).toBeLessThan(0.004);
    expect(maxParticleSpeed(previous)).toBeLessThan(0.04);
  });

  test('continuous settling still reaches the exact rest pose in bounded time', () => {
    const { settledFrame } = releaseCenterDistances();
    // Natural decay reaches the candidate window at ~1.7s; the settle blend
    // then converges within a fraction of a second. The bound leaves load
    // headroom but rejects runaway convergence.
    expect(settledFrame).toBeGreaterThanOrEqual(0);
    expect(settledFrame).toBeLessThan(60 * 3.5);
  });
});

describe('lanyard3d determinism', () => {
  test('identical input sequences produce identical trajectories', () => {
    const build = () => {
      let state = createLanyard3dDropState(CONFIG);
      for (let frame = 0; frame < 40; frame += 1) state = stepLanyard3d(state, FREE_OPTIONS);
      for (let frame = 0; frame < 30; frame += 1) {
        state = stepLanyard3d(state, {
          dtSeconds: 1 / 60,
          config: CONFIG,
          dragging: true,
          target: { x: 0.3, y: -0.25, z: 0.1 },
        });
      }
      for (let frame = 0; frame < 50; frame += 1) state = stepLanyard3d(state, FREE_OPTIONS);
      return state;
    };
    expect(build()).toEqual(build());
  });

  test('fixed substeps make the result independent of caller frame rate', () => {
    const at60 = run(createLanyard3dDropState(CONFIG), 1);
    let at120: Lanyard3dState = createLanyard3dDropState(CONFIG);
    for (let frame = 0; frame < 120; frame += 1) {
      at120 = stepLanyard3d(at120, { dtSeconds: 1 / 120, config: CONFIG });
    }
    expect(at120).toEqual(at60);
  });
});

describe('lanyard3d card frame', () => {
  test('the rest frame is axis-aligned with the card below the anchor', () => {
    const state = createLanyard3dRestState(CONFIG);
    const frame = lanyard3dCardFrame(state);
    expect(frame.right).toEqual({ x: 1, y: 0, z: 0 });
    expect(frame.up.y).toBeGreaterThan(0.999);
    expect(frame.center.y).toBeLessThan(-CONFIG.strapLength);
  });
});

describe('lanyard3d constants', () => {
  test('solver profile matches the shipped, documented tuning', () => {
    expect(LANYARD3D_SEGMENT_COUNT).toBe(14);
    // Plan shipped 1/120; raised to 1/480 so the per-substep gravity kick
    // g·h² (the source of the static sag/stretch residuals) shrinks 16× and
    // the plan's original settle gate stays reachable. Deviation recorded in
    // 01-04-EXECUTION.md.
    expect(LANYARD3D_SUBSTEP_SECONDS).toBeCloseTo(1 / 480, 12);
    expect(LANYARD3D_CONSTRAINT_ITERATIONS).toBeGreaterThanOrEqual(3);
    expect(LANYARD3D_CONSTRAINT_ITERATIONS).toBeLessThanOrEqual(12);
  });
});
