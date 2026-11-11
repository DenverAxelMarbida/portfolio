import { describe, expect, test } from 'vitest';
import {
  LANYARD_CONFIG,
  LANYARD_DROP_ANGLE_DEG,
  LANYARD_DROP_VELOCITY,
  LANYARD_MAX_ANGLE_DEG,
  LANYARD_MAX_TILT_DEG,
  LANYARD_RELEASE_SAMPLE_MS,
  LANYARD_REST_LENGTH,
  clampLanyardPosition,
  createLanyardConfig,
  deriveLanyardAnchorGeometry,
  isLanyardSettled,
  lanyardCardTransform,
  lanyardDropState,
  lanyardFrameInterval,
  lanyardMotionState,
  lanyardRestState,
  lanyardRopePath,
  lanyardReleaseState,
  lanyardReleaseVelocity,
  stepLanyard,
  type LanyardOptions,
  type LanyardState,
} from '../../src/components/motion/profileCardMotion';

const DT = 1 / 120;

interface Simulation {
  state: LanyardState;
  frames: number;
  maxY: number;
  maxAbsX: number;
  maxSpeed: number;
  maxAbsTilt: number;
}

function simulate(
  state: LanyardState,
  seconds: number,
  options: Omit<LanyardOptions, 'dtSeconds'> = {},
): Simulation {
  const frames = Math.ceil(seconds / DT);
  let current = state;
  let maxY = state.y;
  let maxAbsX = Math.abs(state.x);
  let maxSpeed = Math.hypot(state.vx, state.vy);
  let maxAbsTilt = Math.abs(state.tilt);
  for (let frame = 0; frame < frames; frame += 1) {
    current = stepLanyard(current, { ...options, dtSeconds: DT });
    maxY = Math.max(maxY, current.y);
    maxAbsX = Math.max(maxAbsX, Math.abs(current.x));
    maxSpeed = Math.max(maxSpeed, Math.hypot(current.vx, current.vy));
    maxAbsTilt = Math.max(maxAbsTilt, Math.abs(current.tilt));
  }
  return { state: current, frames, maxY, maxAbsX, maxSpeed, maxAbsTilt };
}

function pathNumbers(path: string): number[] {
  return (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

describe('geometry', () => {
  test('uses a visibly long strap and a downward resting position', () => {
    expect(LANYARD_REST_LENGTH).toBeGreaterThanOrEqual(120);
    expect(LANYARD_REST_LENGTH).toBeLessThanOrEqual(220);
    const rest = lanyardRestState(LANYARD_CONFIG);
    expect(rest).toEqual({ x: 0, y: LANYARD_REST_LENGTH, vx: 0, vy: 0, tilt: 0 });
  });

  test('clamps drag targets inside the cone and rope length bounds', () => {
    const farRight = clampLanyardPosition(10_000, 50, LANYARD_CONFIG);
    expect(Math.atan2(farRight.x, farRight.y) * (180 / Math.PI)).toBeCloseTo(
      LANYARD_MAX_ANGLE_DEG,
      6,
    );
    expect(Math.hypot(farRight.x, farRight.y)).toBeLessThanOrEqual(LANYARD_CONFIG.maxLength + 1e-6);

    const tooClose = clampLanyardPosition(0, 1, LANYARD_CONFIG);
    expect(tooClose.y).toBeCloseTo(LANYARD_CONFIG.minLength, 6);
    expect(tooClose.x).toBeCloseTo(0, 6);

    const tooFar = clampLanyardPosition(0, 10_000, LANYARD_CONFIG);
    expect(tooFar.y).toBeCloseTo(LANYARD_CONFIG.maxLength, 6);

    const aboveAnchor = clampLanyardPosition(0, -400, LANYARD_CONFIG);
    expect(Math.atan2(aboveAnchor.x, aboveAnchor.y) * (180 / Math.PI)).toBeCloseTo(
      LANYARD_MAX_ANGLE_DEG,
      6,
    );
  });

  test('keeps the strap root fixed at the anchor and attached to the card', () => {
    const cases: LanyardState[] = [
      lanyardRestState(LANYARD_CONFIG),
      { x: 40, y: 120, vx: 0, vy: 0, tilt: 6 },
      { x: -90, y: 160, vx: 0, vy: 0, tilt: -8 },
    ];
    for (const state of cases) {
      const path = lanyardRopePath(state, LANYARD_CONFIG);
      const [startX, startY, controlX, controlY, endX, endY] = pathNumbers(path);
      expect(startX).toBeCloseTo(0, 2);
      expect(startY).toBeCloseTo(0, 2);
      expect(endX).toBeCloseTo(state.x, 2);
      expect(endY).toBeCloseTo(state.y, 2);
      expect(controlX).toBeDefined();
      expect(controlY).toBeDefined();
    }
  });

  test('bows the strap when slack and keeps it straight when taut', () => {
    const slack = pathNumbers(lanyardRopePath({ x: 0, y: 70, vx: 0, vy: 0, tilt: 0 }));
    const [, , controlX] = slack;
    expect(Math.abs(controlX as number)).toBeGreaterThan(1);

    const taut = pathNumbers(lanyardRopePath({ x: 80, y: 160, vx: 0, vy: 0, tilt: 0 }));
    const [, , tautControlX, tautControlY, tautEndX, tautEndY] = taut;
    expect(tautControlX).toBeCloseTo((tautEndX as number) / 2, 2);
    expect(tautControlY).toBeCloseTo((tautEndY as number) / 2, 2);
  });

  test('writes a bounded card transform relative to the resting strap length', () => {
    expect(lanyardCardTransform(lanyardRestState(LANYARD_CONFIG), LANYARD_CONFIG)).toBe(
      'translate3d(0.000px, 0.000px, 0) rotate(0.000deg)',
    );
    const moved = lanyardCardTransform(
      { x: 12.5, y: 180, vx: 0, vy: 0, tilt: 4.25 },
      LANYARD_CONFIG,
    );
    expect(moved).toBe('translate3d(12.500px, 30.000px, 0) rotate(4.250deg)');
  });
});

describe('drop entrance', () => {
  test('starts above rest and falls, overshoots, then settles without jitter', () => {
    const start = lanyardDropState(LANYARD_CONFIG);
    expect(start.y).toBeLessThan(LANYARD_REST_LENGTH);
    expect(start.vx).toBeGreaterThan(0);
    expect(start.vx).toBeLessThanOrEqual(100);
    expect(start.vy).toBe(0);

    const drop = simulate(start, 8);
    expect(drop.maxY).toBeGreaterThan(LANYARD_REST_LENGTH + 2);
    expect(drop.maxY).toBeLessThanOrEqual(LANYARD_CONFIG.maxLength + 1e-6);
    expect(drop.maxAbsTilt).toBeLessThanOrEqual(LANYARD_MAX_TILT_DEG + 1e-6);
    expect(Math.abs(drop.state.x)).toBeLessThan(0.6);
    expect(Math.abs(drop.state.y - LANYARD_REST_LENGTH)).toBeLessThan(0.6);
    expect(Math.hypot(drop.state.vx, drop.state.vy)).toBeLessThan(3);
    expect(isLanyardSettled(drop.state, LANYARD_CONFIG)).toBe(true);

    const tail = simulate(drop.state, 2);
    expect(tail.maxY - drop.state.y).toBeLessThan(0.05);
    expect(tail.maxAbsX).toBeLessThan(0.05);
  });

  test('stays inside the cone and bounded velocity for the whole drop', () => {
    const drop = simulate(lanyardDropState(LANYARD_CONFIG), 4);
    expect(drop.maxAbsX).toBeLessThanOrEqual(
      LANYARD_CONFIG.maxLength * Math.sin((LANYARD_MAX_ANGLE_DEG * Math.PI) / 180) + 0.001,
    );
    expect(drop.maxSpeed).toBeLessThanOrEqual(LANYARD_CONFIG.maxSpeed + 1e-6);
    expect(Number.isFinite(drop.state.x)).toBe(true);
    expect(Number.isFinite(drop.state.y)).toBe(true);
  });

  test('clamps absurd delta times instead of exploding', () => {
    const jump = stepLanyard(lanyardDropState(LANYARD_CONFIG), { dtSeconds: 20 });
    expect(Number.isFinite(jump.x)).toBe(true);
    expect(Number.isFinite(jump.y)).toBe(true);
    expect(Math.hypot(jump.vx, jump.vy)).toBeLessThanOrEqual(LANYARD_CONFIG.maxSpeed + 1e-6);
    expect(Math.hypot(jump.x, jump.y)).toBeLessThanOrEqual(LANYARD_CONFIG.maxLength + 1e-6);
  });
});

describe('drag and release', () => {
  test('follows a drag target directly and holds it against gravity', () => {
    let state = lanyardRestState(LANYARD_CONFIG);
    const target = { x: 60, y: 130 };
    const drag = simulate(state, 0.3, { dragging: true, target });
    state = drag.state;
    expect(state.x).toBeCloseTo(target.x, 0);
    expect(state.y).toBeCloseTo(target.y, 0);
    expect(Math.abs(state.tilt)).toBeLessThanOrEqual(LANYARD_MAX_TILT_DEG + 1e-6);

    const held = simulate(state, 1, { dragging: true, target });
    expect(held.state.x).toBeCloseTo(target.x, 0);
    expect(held.state.y).toBeCloseTo(target.y, 0);
  });

  test('clamps the dragged card to the same safe bounds as the geometry', () => {
    const target = { x: 9_000, y: 20 };
    const drag = simulate(lanyardRestState(LANYARD_CONFIG), 0.5, { dragging: true, target });
    const clamped = clampLanyardPosition(target.x, target.y, LANYARD_CONFIG);
    expect(drag.state.x).toBeCloseTo(clamped.x, 1);
    expect(drag.state.y).toBeCloseTo(clamped.y, 1);
    expect(Math.abs(drag.state.tilt)).toBeLessThanOrEqual(LANYARD_MAX_TILT_DEG + 1e-6);
  });

  test('carries release momentum and damps back to rest', () => {
    let state = lanyardRestState(LANYARD_CONFIG);
    const start = { x: 0, y: LANYARD_REST_LENGTH };
    for (let frame = 0; frame < 12; frame += 1) {
      const target = { x: (frame + 1) * 6, y: start.y - 40 };
      state = stepLanyard(state, { dtSeconds: DT, dragging: true, target });
    }
    expect(state.vx).toBeGreaterThan(0);

    const released = simulate(state, 8, { dragging: false });
    // The swing must continue away from the release point before returning.
    expect(released.maxAbsX).toBeGreaterThan(Math.abs(state.x));
    expect(released.maxAbsX).toBeLessThanOrEqual(
      LANYARD_CONFIG.maxLength * Math.sin((LANYARD_MAX_ANGLE_DEG * Math.PI) / 180) + 0.001,
    );
    expect(Math.abs(released.state.x)).toBeLessThan(0.6);
    expect(Math.abs(released.state.tilt)).toBeLessThan(0.6);
    expect(isLanyardSettled(released.state, LANYARD_CONFIG)).toBe(true);
  });

  test('a card at rest is an equilibrium', () => {
    const rested = stepLanyard(lanyardRestState(LANYARD_CONFIG), { dtSeconds: 1 / 30 });
    expect(rested.x).toBeCloseTo(0, 6);
    expect(rested.y).toBeCloseTo(LANYARD_REST_LENGTH, 6);
    expect(Math.hypot(rested.vx, rested.vy)).toBeLessThan(0.01);
  });

  test('injects measured pointer velocity at release without teleporting the card', () => {
    const held: LanyardState = { x: 40, y: 150, vx: 0, vy: 0, tilt: 3 };
    const released = lanyardReleaseState(held, 500, -200);
    expect(released.x).toBe(40);
    expect(released.y).toBe(150);
    expect(released.tilt).toBe(3);
    expect(released.vx).toBeCloseTo(500, 6);
    expect(released.vy).toBeCloseTo(-200, 6);

    const wild = lanyardReleaseState(held, 90_000, 90_000);
    expect(Math.hypot(wild.vx, wild.vy)).toBeCloseTo(LANYARD_CONFIG.maxSpeed, 6);
  });
});

describe('release momentum policy', () => {
  const movingVelocity = { vx: 480, vy: -180 };

  test('a moving release keeps the measured pointer velocity in full', () => {
    expect(lanyardReleaseVelocity(movingVelocity, 0)).toEqual(movingVelocity);
    expect(lanyardReleaseVelocity(movingVelocity, 5)).toEqual(movingVelocity);
    expect(lanyardReleaseVelocity(movingVelocity, LANYARD_RELEASE_SAMPLE_MS)).toEqual(
      movingVelocity,
    );
  });

  test('a stationary hold leaves no stale momentum at release', () => {
    expect(lanyardReleaseVelocity(movingVelocity, LANYARD_RELEASE_SAMPLE_MS + 1)).toEqual({
      vx: 0,
      vy: 0,
    });
    expect(lanyardReleaseVelocity(movingVelocity, 500)).toEqual({ vx: 0, vy: 0 });
    expect(lanyardReleaseVelocity(movingVelocity, 60_000)).toEqual({ vx: 0, vy: 0 });
  });

  test('invalid velocity or unknown staleness never launches the card', () => {
    expect(lanyardReleaseVelocity({ vx: Number.NaN, vy: 100 }, 0)).toEqual({ vx: 0, vy: 0 });
    expect(lanyardReleaseVelocity({ vx: 100, vy: Number.NaN }, 0)).toEqual({ vx: 0, vy: 0 });
    expect(lanyardReleaseVelocity(movingVelocity, Number.NaN)).toEqual({ vx: 0, vy: 0 });
    // A hold measured before the pointer clock moved is treated as fresh.
    expect(lanyardReleaseVelocity(movingVelocity, -3)).toEqual(movingVelocity);
  });
});

describe('measured anchor geometry', () => {
  test('anchors the strap at the top of the document on wide layouts', () => {
    const geometry = deriveLanyardAnchorGeometry('document', 212, 362);
    expect(geometry.mode).toBe('document');
    // The strap root is lifted from the shell top to the document top…
    expect(geometry.anchorTopOffset).toBe(-212);
    // …and the rope length is the full distance from the document top to the
    // card attachment, so the card keeps its rendered resting position.
    expect(geometry.restLength).toBeCloseTo(362, 6);
    expect(geometry.restLength).toBeGreaterThan(geometry.anchorTopOffset);
  });

  test('keeps the strap shell-local on stacked layouts', () => {
    const geometry = deriveLanyardAnchorGeometry('shell', 412, 562);
    expect(geometry.mode).toBe('shell');
    expect(geometry.anchorTopOffset).toBe(0);
    expect(geometry.restLength).toBeCloseTo(150, 6);
  });

  test('falls back to the shell-local default strap for unreadable geometry', () => {
    const fallback = { mode: 'shell', anchorTopOffset: 0, restLength: LANYARD_REST_LENGTH };
    expect(deriveLanyardAnchorGeometry('document', Number.NaN, 300)).toEqual(fallback);
    expect(deriveLanyardAnchorGeometry('document', 100, Number.POSITIVE_INFINITY)).toEqual(
      fallback,
    );
    expect(deriveLanyardAnchorGeometry('document', 200, -320)).toEqual(fallback);
    expect(deriveLanyardAnchorGeometry('shell', Number.NaN, Number.NaN)).toEqual({
      mode: 'shell',
      anchorTopOffset: 0,
      restLength: LANYARD_REST_LENGTH,
    });
  });
});

describe('measured strap lengths', () => {
  test('scales the safe cone and elastic bounds with the measured rest length', () => {
    const long = createLanyardConfig(320);
    expect(long.restLength).toBe(320);
    expect(long.minLength).toBeCloseTo(320 * 0.42, 6);
    expect(long.maxLength).toBeCloseTo(320 * 1.16, 6);
    expect(long.springLength).toBeCloseTo(320 - long.gravity / long.ropeStiffness, 6);
    expect(long.maxAngleDeg).toBe(LANYARD_CONFIG.maxAngleDeg);
    expect(long.maxTiltDeg).toBe(LANYARD_CONFIG.maxTiltDeg);
    expect(long.gravity).toBe(LANYARD_CONFIG.gravity);
    expect(long.ropeStiffness).toBe(LANYARD_CONFIG.ropeStiffness);
  });

  test('scales the drop entrance along the measured strap', () => {
    const long = createLanyardConfig(320);
    const start = lanyardDropState(long);
    expect(start.y).toBeCloseTo(Math.cos((LANYARD_DROP_ANGLE_DEG * Math.PI) / 180) * 320 * 0.42, 6);
    expect(start.x).toBeCloseTo(Math.sin((LANYARD_DROP_ANGLE_DEG * Math.PI) / 180) * 320 * 0.42, 6);
    expect(start.y).toBeLessThan(long.restLength);
    expect(start.vy).toBe(0);
    expect(start.vx).toBe(LANYARD_DROP_VELOCITY);
  });

  test('writes the rest rope path for the measured rest length', () => {
    const path = lanyardRopePath(
      lanyardRestState(createLanyardConfig(320)),
      createLanyardConfig(320),
    );
    expect(path).toBe('M 0 0 Q 0.00 160.00 0.00 320.00');
  });

  test('a rest position at a measured length is its own equilibrium', () => {
    const long = createLanyardConfig(320);
    const rested = stepLanyard(lanyardRestState(long), { dtSeconds: 1 / 30, config: long });
    expect(rested.x).toBeCloseTo(0, 6);
    expect(rested.y).toBeCloseTo(320, 6);
    expect(Math.hypot(rested.vx, rested.vy)).toBeLessThan(0.01);
  });

  test('keeps drag movement inside the measured cone bounds', () => {
    const long = createLanyardConfig(320);
    const farRight = clampLanyardPosition(10_000, 40, long);
    expect(Math.atan2(farRight.x, farRight.y) * (180 / Math.PI)).toBeCloseTo(
      LANYARD_MAX_ANGLE_DEG,
      6,
    );
    expect(Math.hypot(farRight.x, farRight.y)).toBeLessThanOrEqual(long.maxLength + 1e-6);
  });

  test('drops, overshoots and settles along a long measured strap', () => {
    const long = createLanyardConfig(320);
    const drop = simulate(lanyardDropState(long), 12, { config: long });
    expect(drop.maxY).toBeGreaterThan(long.restLength + 2);
    expect(drop.maxY).toBeLessThanOrEqual(long.maxLength + 1e-6);
    expect(drop.maxAbsTilt).toBeLessThanOrEqual(long.maxTiltDeg + 1e-6);
    expect(Math.abs(drop.state.x)).toBeLessThan(0.6);
    expect(Math.abs(drop.state.y - long.restLength)).toBeLessThan(0.6);
    expect(Math.hypot(drop.state.vx, drop.state.vy)).toBeLessThan(3);
    expect(isLanyardSettled(drop.state, long)).toBe(true);

    const tail = simulate(drop.state, 2, { config: long });
    expect(tail.maxY - drop.state.y).toBeLessThan(0.05);
    expect(tail.maxAbsX).toBeLessThan(0.05);
  });

  test('transforms the card relative to the measured rest length', () => {
    const long = createLanyardConfig(320);
    expect(lanyardCardTransform(lanyardRestState(long), long)).toBe(
      'translate3d(0.000px, 0.000px, 0) rotate(0.000deg)',
    );
    const moved = lanyardCardTransform({ x: 8, y: 350, vx: 0, vy: 0, tilt: -3 }, long);
    expect(moved).toBe('translate3d(8.000px, 30.000px, 0) rotate(-3.000deg)');
  });
});

describe('policy and pacing', () => {
  test('runs only with motion policy, visibility and viewport agreement', () => {
    expect(
      lanyardMotionState({
        motionAllowed: true,
        documentVisible: true,
        inView: true,
      }),
    ).toEqual({ run: true, dragEnabled: true });

    for (const input of [
      { motionAllowed: false, documentVisible: true, inView: true },
      { motionAllowed: true, documentVisible: false, inView: true },
      { motionAllowed: true, documentVisible: true, inView: false },
    ]) {
      expect(lanyardMotionState(input)).toEqual({ run: false, dragEnabled: false });
    }
  });

  test('paces mobile frames lower than desktop frames', () => {
    expect(lanyardFrameInterval(false)).toBeCloseTo(1000 / 60, 5);
    expect(lanyardFrameInterval(true)).toBeCloseTo(1000 / 30, 5);
    expect(lanyardFrameInterval(true)).toBeGreaterThan(lanyardFrameInterval(false));
  });
});
