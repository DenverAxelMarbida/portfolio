import { describe, expect, test } from 'vitest';
import {
  createLanyard3dConfig,
  createLanyard3dDropState,
  createLanyard3dRestState,
  isLanyard3dSettled,
  lanyard3dCardFrame,
  stepLanyard3d,
} from '../../src/components/motion/lanyard3dPhysics';

describe.each([347 / 388, 120 / 388])('reference motion with strap %s', (strap) => {
  const config = createLanyard3dConfig(strap, 320 / 388, 1);
  const step = { config, dtSeconds: 1 / 60 };

  test('opens foreshortened, crosses front, shows the reverse, and returns continuously', () => {
    let state = createLanyard3dDropState(config);
    const spawn = lanyard3dCardFrame(state);
    expect(spawn.up.y).toBeLessThan(0.7);
    expect(Math.abs(spawn.right.z)).toBeGreaterThan(0.5);
    expect(Math.abs(spawn.right.y)).toBeGreaterThan(0.08);
    // Showcase choreography in 60 Hz frames after spawn, from the swivel
    // window in lanyard3dPhysics (review finding 5): ramp-up 2.40–2.58s =
    // i 144–155, back hold until 3.40s = i 204, ramp-down 3.40–3.58s =
    // i 215. The reverse may only be presented inside that choreography.
    const RAMP_UP = 144;
    const HOLD_START = 156;
    const HOLD_END = 203;
    const RAMP_DOWN_END = 215;
    let previous = spawn;
    let crossedFront = false;
    let yawCrossings = 0;
    let previousRightZ = spawn.right.z;
    let backHold = 0;
    let firstBackShowcase = Infinity;
    let lastBack = -Infinity;
    let edgeUp = 0;
    let edgeDown = 0;
    let minNormalZAfterRamp = 1;
    let maxRotation = 0;
    let caughtAt = Infinity;
    for (let i = 0; i < 420; i++) {
      state = stepLanyard3d(state, step);
      const frame = lanyard3dCardFrame(state);
      if (frame.center.y < -strap - 0.45) caughtAt = Math.min(caughtAt, (i + 1) / 60);
      const normalZ = frame.right.x * frame.up.y - frame.right.y * frame.up.x;
      // Entrance: the damped yaw must cross the front before the showcase
      // ramp starts at 2.4s.
      if (Math.abs(frame.right.z) > 0.02 && previousRightZ !== 0) {
        if (i < RAMP_UP && Math.sign(frame.right.z) !== Math.sign(previousRightZ)) {
          yawCrossings += 1;
        }
      }
      if (i < RAMP_UP && frame.right.z < -0.05) crossedFront = true;
      previousRightZ = frame.right.z;
      // Showcase: back hold confined to the choreography window, edge
      // transits confined to the two ramp windows.
      if (i >= HOLD_START && i <= HOLD_END && normalZ < -0.7) backHold += 1;
      if (i >= RAMP_UP && normalZ < -0.7) {
        firstBackShowcase = Math.min(firstBackShowcase, i);
        lastBack = Math.max(lastBack, i);
      }
      if (i >= RAMP_UP && i <= RAMP_UP + 11 && Math.abs(normalZ) < 0.3) edgeUp += 1;
      if (i > HOLD_END && i <= RAMP_DOWN_END && Math.abs(normalZ) < 0.3) edgeDown += 1;
      // Frontal lock: once the ramp-down completes the reverse is gone for
      // good — the settle may swing but never presents the back again.
      if (i >= RAMP_DOWN_END) minNormalZAfterRamp = Math.min(minNormalZAfterRamp, normalZ);
      const dot = (a: typeof frame.right, b: typeof frame.right) =>
        a.x * b.x + a.y * b.y + a.z * b.z;
      // SO(3) geodesic angle, rather than Euler deltas at a wrap/singularity.
      const normal = (f: typeof frame) => ({
        x: f.right.y * f.up.z - f.right.z * f.up.y,
        y: f.right.z * f.up.x - f.right.x * f.up.z,
        z: f.right.x * f.up.y - f.right.y * f.up.x,
      });
      const trace =
        dot(previous.right, frame.right) +
        dot(previous.up, frame.up) +
        dot(normal(previous), normal(frame));
      maxRotation = Math.max(maxRotation, Math.acos(Math.min(1, Math.max(-1, (trace - 1) / 2))));
      const clip = state.rope.at(-1)!.position;
      const top = state.corners.slice(0, 2).map((c) => c.position);
      expect(
        Math.hypot(
          (top[0]!.x + top[1]!.x) / 2 - clip.x,
          (top[0]!.y + top[1]!.y) / 2 - clip.y,
          (top[0]!.z + top[1]!.z) / 2 - clip.z,
        ),
      ).toBeLessThan(0.015);
      previous = frame;
    }
    expect(crossedFront).toBe(true);
    expect(caughtAt).toBeLessThan(0.4);
    // The reverse may only appear inside the showcase choreography: it is
    // never back-facing before the ramp-up and gone once the ramp-down
    // completes. The hold must present it for (nearly) its full window.
    expect(yawCrossings).toBeGreaterThanOrEqual(1);
    expect(firstBackShowcase).toBeGreaterThanOrEqual(RAMP_UP);
    expect(firstBackShowcase).toBeLessThanOrEqual(HOLD_START);
    expect(lastBack).toBeGreaterThanOrEqual(HOLD_END);
    expect(lastBack).toBeLessThanOrEqual(RAMP_DOWN_END);
    expect(backHold).toBeGreaterThanOrEqual(40);
    expect(edgeUp).toBeGreaterThanOrEqual(1);
    expect(edgeDown).toBeGreaterThanOrEqual(1);
    expect(minNormalZAfterRamp).toBeGreaterThan(0.5);
    expect((maxRotation * 180) / Math.PI).toBeLessThan(36);
    expect(state).toEqual(createLanyard3dRestState(config));
  });

  test('a zero-time pause freezes the showcase and a grab cancels its replay', () => {
    let state = createLanyard3dDropState(config);
    for (let i = 0; i < 165; i++) state = stepLanyard3d(state, step);
    expect(lanyard3dCardFrame(state).right.x).toBeLessThan(-0.7);
    expect(stepLanyard3d(state, { ...step, dtSeconds: 0 })).toBe(state);
    const before = lanyard3dCardFrame(state);
    state = stepLanyard3d(state, { ...step, dragging: true, target: state.rope.at(-1)!.position });
    const after = lanyard3dCardFrame(state);
    expect(Math.hypot(after.right.x - before.right.x, after.right.z - before.right.z)).toBeLessThan(
      0.15,
    );
    for (let i = 0; i < 480; i++) state = stepLanyard3d(state, step);
    expect(isLanyard3dSettled(state, config)).toBe(true);
    expect(state).toEqual(createLanyard3dRestState(config));
  });
});
