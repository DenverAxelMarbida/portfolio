/**
 * Animation controls are registered by optional motion enhancements. Pausing
 * stops them and then settles their presentation explicitly; `finished` is
 * deliberately never observed because stop() leaves that promise pending.
 */
export interface MotionAnimationControl {
  stop: () => void;
  settle?: () => void;
}

const controls = new Set<MotionAnimationControl>();

export function registerMotionAnimationControl(control: MotionAnimationControl): () => void {
  controls.add(control);
  return () => {
    controls.delete(control);
  };
}

export function getRegisteredMotionControlCount(): number {
  return controls.size;
}

export function pauseMotionAnimations(): void {
  const active = [...controls];
  controls.clear();
  for (const control of active) {
    try {
      control.stop();
    } catch {
      // One broken control must not prevent the rest from stopping.
    }
    try {
      control.settle?.();
    } catch {
      // Settling is best effort; optional motion never blocks the page.
    }
  }
}
