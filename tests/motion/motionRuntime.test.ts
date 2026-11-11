import { expect, test } from 'vitest';
import { loadMotionRuntime, motionRuntimeLoaded } from '../../src/components/motion/motionRuntime';

test('loads the motion runtime once through a deferred import', async () => {
  expect(motionRuntimeLoaded()).toBe(false);

  const first = loadMotionRuntime();
  const second = loadMotionRuntime();

  expect(second).toBe(first);
  expect(motionRuntimeLoaded()).toBe(true);

  const runtime = await first;
  expect(typeof runtime.animate).toBe('function');
});
