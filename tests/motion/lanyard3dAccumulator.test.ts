import { describe, expect, test } from 'vitest';
import {
  LANYARD3D_MAX_FRAME_DELTA_SECONDS,
  LANYARD3D_MAX_SUBSTEPS,
  LANYARD3D_SUBSTEP_SECONDS,
  advanceLanyard3dAccumulator,
} from '../../src/components/motion/lanyard3dPhysics';

/**
 * Fixed-step frame-loop accumulator (review finding 2). The scene consumes
 * whole 1/480 s substeps; any backlog beyond one frame budget must be
 * dropped, so a stalled frame — or a sustained sub-30 fps rate — can never
 * fast-forward the simulation on later frames.
 */
const SUBSTEP = LANYARD3D_SUBSTEP_SECONDS;
const BUDGET = LANYARD3D_MAX_SUBSTEPS * SUBSTEP;
const FRAME = 1 / 60;

describe('advanceLanyard3dAccumulator', () => {
  test('a stalled frame runs at most one budget and leaves no backlog', () => {
    expect(LANYARD3D_MAX_FRAME_DELTA_SECONDS).toBe(0.25);
    const stalled = advanceLanyard3dAccumulator(0, 0.25);
    expect(stalled.consumedSeconds).toBeCloseTo(BUDGET, 9);
    expect(stalled.accumulator).toBeLessThan(SUBSTEP);
    // The frame after the stall must consume a normal frame's worth, not
    // the 2x catch-up the unclamped backlog used to produce.
    const next = advanceLanyard3dAccumulator(stalled.accumulator, FRAME);
    expect(next.consumedSeconds).toBeLessThanOrEqual(FRAME + SUBSTEP);
    expect(next.accumulator).toBeLessThan(SUBSTEP);
  });

  test('never consumes more simulation time than the frames supplied', () => {
    const deltas = [0.25, 0.5, 0.016, 0.09, 0.033, 0.001, 0.25, 0.0166, 0.04];
    let accumulator = 0;
    let consumedTotal = 0;
    let supplied = 0;
    for (const delta of deltas) {
      const advanced = advanceLanyard3dAccumulator(accumulator, delta);
      accumulator = advanced.accumulator;
      expect(accumulator).toBeGreaterThanOrEqual(0);
      expect(accumulator).toBeLessThanOrEqual(BUDGET + 1e-12);
      consumedTotal += advanced.consumedSeconds;
      supplied += Math.min(Math.max(delta, 0), LANYARD3D_MAX_FRAME_DELTA_SECONDS);
    }
    expect(consumedTotal).toBeGreaterThan(0);
    expect(consumedTotal).toBeLessThanOrEqual(supplied + 1e-9);
  });

  test('a sustained 20 fps rate stays bounded and never fast-forwards', () => {
    const frames = 600; // 30 s at 20 fps
    const delta = 0.05;
    let accumulator = 0;
    let consumedTotal = 0;
    for (let i = 0; i < frames; i += 1) {
      const advanced = advanceLanyard3dAccumulator(accumulator, delta);
      accumulator = advanced.accumulator;
      // The backlog used to grow by ~16.7 ms per frame here (unbounded),
      // then drain later at 2x real time.
      expect(accumulator).toBeLessThanOrEqual(BUDGET + 1e-12);
      expect(advanced.consumedSeconds).toBeLessThanOrEqual(BUDGET + 1e-12);
      consumedTotal += advanced.consumedSeconds;
    }
    // The simulation may lag real time; it may never run ahead of it.
    expect(consumedTotal).toBeLessThanOrEqual(frames * delta + 1e-9);
    // Bounded must not mean frozen: steady 20 fps still advances the sim.
    expect(consumedTotal).toBeGreaterThan(frames * delta * 0.5);
  });

  test('a steady 60 fps frame consumes its own delta', () => {
    const first = advanceLanyard3dAccumulator(0, FRAME);
    expect(first.consumedSeconds).toBeCloseTo(FRAME, 9);
    expect(first.accumulator).toBeLessThan(SUBSTEP);
    const second = advanceLanyard3dAccumulator(first.accumulator, FRAME);
    expect(second.consumedSeconds).toBeCloseTo(FRAME, 9);
    expect(second.accumulator).toBeLessThan(SUBSTEP);
  });

  test('zero, negative, and sub-quantum deltas do not step the solver', () => {
    expect(advanceLanyard3dAccumulator(0, 0)).toEqual({
      accumulator: 0,
      consumedSeconds: 0,
    });
    const negative = advanceLanyard3dAccumulator(0, -1);
    expect(negative.consumedSeconds).toBe(0);
    expect(negative.accumulator).toBe(0);
    // Sub-quantum time accumulates instead of stepping.
    const tiny = advanceLanyard3dAccumulator(0, SUBSTEP / 2);
    expect(tiny.consumedSeconds).toBe(0);
    expect(tiny.accumulator).toBeCloseTo(SUBSTEP / 2, 12);
    const twice = advanceLanyard3dAccumulator(tiny.accumulator, SUBSTEP / 2);
    expect(twice.consumedSeconds).toBeCloseTo(SUBSTEP, 12);
    expect(twice.accumulator).toBeLessThan(SUBSTEP);
  });
});
