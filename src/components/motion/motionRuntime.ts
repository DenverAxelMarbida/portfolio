import type { animate } from 'motion/react';

export interface MotionRuntime {
  animate: typeof animate;
}

let runtimePromise: Promise<MotionRuntime> | null = null;

/**
 * Loads the imperative animation runtime only when policy allows motion. The
 * dynamic import keeps it in a deferred chunk instead of initial JavaScript.
 */
export function loadMotionRuntime(): Promise<MotionRuntime> {
  if (!runtimePromise) {
    runtimePromise = import('./motionClient')
      .then((module) => ({ animate: module.animate }))
      .catch((error: unknown) => {
        runtimePromise = null;
        throw error;
      });
  }
  return runtimePromise;
}

export function motionRuntimeLoaded(): boolean {
  return runtimePromise !== null;
}
