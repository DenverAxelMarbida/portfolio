import { beforeEach, expect, test, vi } from 'vitest';
import {
  getRegisteredMotionControlCount,
  pauseMotionAnimations,
  registerMotionAnimationControl,
} from '../../src/components/motion/animationControls';

beforeEach(() => {
  pauseMotionAnimations();
});

test('pause stops then settles every registered control exactly once', () => {
  const calls: string[] = [];
  registerMotionAnimationControl({
    stop: () => calls.push('stop:first'),
    settle: () => calls.push('settle:first'),
  });
  registerMotionAnimationControl({
    stop: () => calls.push('stop:second'),
    settle: () => calls.push('settle:second'),
  });

  expect(getRegisteredMotionControlCount()).toBe(2);
  pauseMotionAnimations();

  expect(calls).toEqual(['stop:first', 'settle:first', 'stop:second', 'settle:second']);
  expect(getRegisteredMotionControlCount()).toBe(0);

  pauseMotionAnimations();
  expect(calls).toHaveLength(4);
});

test('never reads controls.finished after stop', () => {
  const stop = vi.fn();
  const settle = vi.fn();
  const control = {
    stop,
    settle,
    get finished() {
      throw new Error('finished must not be read after stop');
    },
  };

  registerMotionAnimationControl(control);
  expect(() => pauseMotionAnimations()).not.toThrow();
  expect(stop).toHaveBeenCalledTimes(1);
  expect(settle).toHaveBeenCalledTimes(1);
});

test('a failing stop still settles the control and pauses the rest', () => {
  const settle = vi.fn();
  const secondStop = vi.fn();
  registerMotionAnimationControl({
    stop: () => {
      throw new Error('stop failed');
    },
    settle,
  });
  registerMotionAnimationControl({ stop: secondStop });

  expect(() => pauseMotionAnimations()).not.toThrow();
  expect(settle).toHaveBeenCalledTimes(1);
  expect(secondStop).toHaveBeenCalledTimes(1);
});

test('unregistering removes a control before pause', () => {
  const stop = vi.fn();
  const unregister = registerMotionAnimationControl({ stop });

  expect(getRegisteredMotionControlCount()).toBe(1);
  unregister();
  pauseMotionAnimations();

  expect(stop).not.toHaveBeenCalled();
  expect(getRegisteredMotionControlCount()).toBe(0);
});
