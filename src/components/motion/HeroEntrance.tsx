import { useEffect, useRef, type AnimationEvent, type ReactNode } from 'react';
import { registerMotionAnimationControl, type MotionAnimationControl } from './animationControls';
import { useMotionPreferences } from './MotionPreferences';

/**
 * One hero entrance per document. The flag is module-scoped like the portrait
 * card's entrance clock: it survives client-side navigation and React
 * remounts, so already-entered content never replays.
 */
let heroEntranceEntered = false;
/** True only when an entrance animation actually started in this document. */
let heroEntranceAnimated = false;

/**
 * Hero copy entrance controller. The copy is readable statically as
 * `data-hero-entrance="pending"`; motion adds a one-time 8–12px staggered
 * rise after hydration. Every exit path — pause, reduced motion, hidden tab,
 * natural completion, navigation — lands on a readable final state instead
 * of leaving content displaced or transparent.
 */
export function HeroEntrance({
  className = 'hero-copy',
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const { hydrated, reduced, paused, motionAllowed } = useMotionPreferences();
  const groupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    if (heroEntranceEntered) {
      // Remount in the same document: preserve this document's decision. A
      // document that skipped an entrance keeps its skip across preference
      // flips — a later Resume must not bury already-readable copy in motion.
      const animated = heroEntranceAnimated;
      group.dataset.heroEntrance = animated ? 'played' : 'skipped';
      group.dataset.heroEntranceRuns = animated ? '1' : '0';
      return;
    }

    if (!motionAllowed) {
      // Hydration is only transient; a hydrated reduced or paused preference
      // is a decisive skip the user must not see override later.
      if (hydrated && (reduced || paused)) {
        heroEntranceEntered = true;
        group.dataset.heroEntrance = 'skipped';
        group.dataset.heroEntranceRuns = '0';
      }
      return;
    }

    if (document.visibilityState === 'hidden') {
      // Never animate into a hidden tab: keep the readable copy as-is.
      // The entrance is consumed either way, so it can never surface later.
      heroEntranceEntered = true;
      heroEntranceAnimated = true;
      group.dataset.heroEntrance = 'played';
      group.dataset.heroEntranceRuns = '1';
      return;
    }

    heroEntranceEntered = true;
    heroEntranceAnimated = true;
    group.dataset.heroEntrance = 'playing';
    group.dataset.heroEntranceRuns = '1';

    const settle: MotionAnimationControl = {
      stop: () => {
        if (group.dataset.heroEntrance === 'playing') group.dataset.heroEntrance = 'settled';
      },
      settle: () => {
        if (group.dataset.heroEntrance === 'playing') group.dataset.heroEntrance = 'settled';
      },
    };
    const unregister = registerMotionAnimationControl(settle);

    // A policy flip through pauseMotionAnimations() or a hidden tab both end
    // with this settle; completion leaves the control for cleanup.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') settle.stop();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      unregister();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [hydrated, reduced, paused, motionAllowed]);

  const onAnimationEnd = (event: AnimationEvent<HTMLElement>) => {
    if (event.animationName !== 'hero-entrance-rise') return;
    // Complete only when the last staggered item lands, so earlier items
    // finish their full rise.
    const item = event.target as HTMLElement;
    const group = groupRef.current;
    if (item.dataset.heroEntranceItem === '2' && group?.dataset.heroEntrance === 'playing') {
      group.dataset.heroEntrance = 'played';
    }
  };

  return (
    <div
      ref={groupRef}
      className={className}
      data-hero-entrance="pending"
      data-hero-entrance-runs="0"
      onAnimationEnd={onAnimationEnd}
    >
      {children}
    </div>
  );
}
