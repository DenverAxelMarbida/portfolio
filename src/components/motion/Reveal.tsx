import { useEffect, useRef, type AnimationEvent, type ReactNode } from 'react';
import { registerMotionAnimationControl, type MotionAnimationControl } from './animationControls';
import { useMotionPreferences } from './MotionPreferences';
import {
  REVEAL_ROOT_MARGIN,
  REVEAL_STAGGER_MS,
  assignRevealBatchSlots,
  coordinateBatchBase,
  ensureScrollTempoTracking,
  recentScrollJumpDelta,
  revealDecisionFromEntry,
  sectionVisibleInViewport,
} from './revealPolicy';

/**
 * One observer batch, buffered across the wrapper instances that delivered
 * intersecting entries in the same rendering frame. Each Reveal wrapper owns
 * its own IntersectionObserver, so a fast scroll that brings the heading and
 * both grid rows in together delivers several separate callbacks; buffering
 * until the next animation frame lets the whole frame's arrivals be sorted
 * by DOM position and given consecutive stagger slots — heading first, then
 * each row left-to-right, ~140ms apart (CP7 T4 final stagger polish).
 */
interface RevealArrival {
  target: HTMLElement;
}

let batchedArrivals: RevealArrival[] = [];
let batchScheduled = false;
/**
 * CP7 T4 final visual-parity refinement: absolute time the ongoing cascade's
 * next stagger slot begins (null when no cascade is active). Adjacent
 * observer batches join the cascade within the bounded coordination window
 * instead of each restarting at slot 0 — the measured root cause of
 * near-simultaneous starts. Reset only by the cap logic, never accumulated
 * page-wide: a batch arriving later than the window starts fresh.
 */
let cascadeNextFreeStart: number | null = null;

function queueRevealArrival(target: HTMLElement) {
  batchedArrivals.push({ target });
  if (batchScheduled) return;
  batchScheduled = true;
  requestAnimationFrame(() => {
    batchScheduled = false;
    const arrivals = batchedArrivals;
    batchedArrivals = [];
    if (arrivals.length === 0) return;
    arrivals.sort((a, b) => {
      const position = a.target.compareDocumentPosition(b.target);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    const slots = assignRevealBatchSlots(arrivals.length);
    const now = performance.now();
    // Coordinated base (CP7 T4 final visual-parity refinement): the batch
    // continues the ongoing cascade's next free start when it is still in
    // the future and within the bounded coordination window; otherwise it
    // starts fresh at its own arrival. The cap guarantees no wave waits
    // more than the window beyond its own entry, so a much-later entering
    // element is never delayed by earlier ones (no page-wide accumulation).
    const base = coordinateBatchBase(now, cascadeNextFreeStart);
    let started = 0;
    arrivals.forEach((arrival, index) => {
      // A focus-settle may have decided this wave between arrival and this
      // frame; never override a decision.
      if (arrival.target.dataset.reveal !== 'pending') return;
      arrival.target.dataset.reveal = 'playing';
      arrival.target.dataset.revealSlot = String(slots[index]!);
      // Wave `started` of the coordinated cascade begins at
      // base + started*REVEAL_STAGGER_MS; the delay is expressed relative to
      // this flush frame (clamped ≥ 0) so consecutive starts — including
      // batches delivered on adjacent frames — sit REVEAL_STAGGER_MS apart
      // in DOM order (heading → row 1 left-to-right → row 2 …), while a
      // solo fresh batch still starts at 0ms.
      arrival.target.style.setProperty(
        '--reveal-slot-delay',
        `${Math.max(0, base + started * REVEAL_STAGGER_MS - now)}ms`,
      );
      started += 1;
    });
    if (started > 0) {
      cascadeNextFreeStart = base + started * REVEAL_STAGGER_MS;
    }
  });
}

/**
 * One scroll reveal wave, once per document. The wave's content is
 * server-rendered fully readable when motion is unavailable (no JavaScript,
 * reduced motion, global pause): the arming attribute is only ever set under
 * the active motion policy, and its CSS hide is scoped the same way. When
 * motion is allowed and the wave is below the viewport at enhancement time,
 * it is armed — held invisible at its final layout position until its
 * viewport entry — so no content is ever painted in its final state before
 * its reveal begins (CP7 T4 requirement 5). On entry the wave's meaningful
 * content groups (tagged `data-reveal-item` in markup) rise as a staggered
 * cascade — 520ms cubic-bezier(.2, .75, .25, 1), 18px, opacity 0 → 1.00, the
 * owner's approved interactive-simulation reference — and consecutive starts
 * (within a batch and across batches arriving within the bounded coordination
 * window) sit REVEAL_STAGGER_MS apart in DOM order.
 * Every exit path — reduced motion, global pause, hidden tab, deep-jump
 * arrival, focus entering mid-cascade, missing observer, unmount — lands on
 * the readable final state instead of displaced content. A wrapper that is
 * already on screen at enhancement time (deep jump, load) is decided as
 * skipped; wrappers placed further down each trigger on their own arrival.
 */
export function Reveal({
  children,
  className,
}: {
  children: ReactNode;
  /** Optional styling for the wrapper itself (e.g. when the wrapper must
   * also be the layout container of its items, as in the contact row). */
  className?: string;
}) {
  const { hydrated, reduced, paused, motionAllowed } = useMotionPreferences();
  const sectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    // Already decided in this document: a decision survives preference flips
    // and remounts, exactly like the hero entrance clock.
    const state = section.dataset.reveal;
    if (state === 'playing' || state === 'played' || state === 'skipped') return;

    if (!motionAllowed) {
      // Reduced motion is a decisive skip the user must not see overridden by
      // a later Resume. A temporary pause is deliberately NOT decisive
      // (CP7 E-2): pending wrappers stay pending, so a later Resume re-arms
      // the observer and they animate on arrival; consumed waves are never
      // replayed. While paused the observer stays detached, so nothing
      // animates and nothing is decided.
      if (hydrated && reduced) section.dataset.reveal = 'skipped';
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      section.dataset.reveal = 'skipped';
      return;
    }

    const settleIfPlaying = () => {
      if (section.dataset.reveal === 'playing') section.dataset.reveal = 'played';
    };
    const settle: MotionAnimationControl = { stop: settleIfPlaying, settle: settleIfPlaying };
    const unregister = registerMotionAnimationControl(settle);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') settleIfPlaying();
    };
    document.addEventListener('visibilitychange', onVisibility);

    let observer: IntersectionObserver;
    try {
      observer = new IntersectionObserver(onEntries, { rootMargin: REVEAL_ROOT_MARGIN });
    } catch {
      section.dataset.reveal = 'skipped';
      unregister();
      document.removeEventListener('visibilitychange', onVisibility);
      return;
    }

    function onEntries(entries: IntersectionObserverEntry[]) {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const target = entry.target as HTMLElement;
        observer.unobserve(target);
        // Safeguard (CP7 E-1): decide from the observer's own arrival
        // snapshot plus the shared scroll tempo, on the arrival frame itself
        // so the cascade starts while the wave is on screen. A continuous
        // traversal — however fast — plays; a single-event teleport lands
        // statically instead of resetting content the visitor is reading.
        if (
          revealDecisionFromEntry(
            entry.boundingClientRect,
            window.innerHeight,
            recentScrollJumpDelta(),
          ) ===
          'skip'
        ) {
          target.dataset.reveal = 'skipped';
          continue;
        }
        // Same-frame arrivals from every wrapper share one batch: DOM order
        // gives the cascade order and each arrival takes the next stagger
        // slot (left-to-right within a visual row).
        queueRevealArrival(target);
      }
    }

    // Safeguard: classify with real viewport bounds. A section already on
    // screen at enhancement time skips its reveal (readable, never
    // re-animated); a section below the fold is armed — held invisible at
    // its final layout position until its viewport entry (CP7 T4 rework).
    if (sectionVisibleInViewport(section.getBoundingClientRect(), window.innerHeight)) {
      section.dataset.reveal = 'skipped';
      unregister();
      document.removeEventListener('visibilitychange', onVisibility);
      return;
    }
    section.dataset.revealArmed = 'true';

    observer.observe(section);
    // The arrival decision reads the shared scroll tempo; one listener serves
    // every wave on the page.
    ensureScrollTempoTracking();

    return () => {
      observer.disconnect();
      unregister();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [hydrated, reduced, paused, motionAllowed]);

  const onAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    // Complete only on a section-reveal-rise animationend (the animation name
    // gate) whose event target carries the section's final item index — the
    // sole final item's own landing, so earlier groups always finish their
    // full staggered rise before the wrapper is marked played.
    if (event.animationName !== 'section-reveal-rise') return;
    const section = sectionRef.current;
    const item = event.target as HTMLElement;
    if (!section || section.dataset.reveal !== 'playing') return;
    if (item.dataset.revealItem == null) return;
    let finalIndex = -1;
    for (const element of section.querySelectorAll<HTMLElement>('[data-reveal-item]')) {
      finalIndex = Math.max(finalIndex, Number(element.dataset.revealItem ?? '-1'));
    }
    if (Number(item.dataset.revealItem) === finalIndex) {
      section.dataset.reveal = 'played';
    }
  };

  const onFocusCapture = () => {
    // Focus-settle safeguard: keyboard or assistive focus entering the
    // section must never land on invisible content. Mid-cascade that lands
    // on the readable final state; in an armed-but-not-yet-revealed wave
    // (tabbing ahead of the scroll) it settles the wave readable too.
    // Idempotent (only 'playing' and armed 'pending' flip) and the one-shot
    // state machine never replays from 'played' or 'skipped'. Hover never
    // triggers this — only genuine focus does, and focus itself is left
    // untouched.
    const section = sectionRef.current;
    if (!section) return;
    if (section.dataset.reveal === 'playing') {
      section.dataset.reveal = 'played';
    } else if (
      section.dataset.reveal === 'pending' &&
      section.dataset.revealArmed === 'true'
    ) {
      section.dataset.reveal = 'skipped';
    }
  };

  return (
    <div
      ref={sectionRef}
      className={className}
      data-reveal="pending"
      onAnimationEnd={onAnimationEnd}
      onFocusCapture={onFocusCapture}
    >
      {children}
    </div>
  );
}
