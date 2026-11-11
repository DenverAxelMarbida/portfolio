import { AUTOPLAY_GAP_MS, AUTOPLAY_STAGGER_MS } from './carouselPolicy';

/** What the carousel controller provides to its autoplay loop. */
export interface AutoplayHost {
  root: HTMLElement;
  /** Live motion-preferences gate (hydrated, not reduced, not globally paused). */
  isAllowed: () => boolean;
  /**
   * Performs one silent slide advance, including the seamless wrap. Autoplay
   * never announces; manual navigation stays the only announced source.
   */
  advance: () => void;
}

export interface AutoplayHandle {
  /** External pause input from an in-flight pointer drag. */
  setDragging(dragging: boolean): void;
  /** Restarts the countdown from zero (manual navigation, drag commits). */
  restartCountdown(): void;
  /** Re-evaluates every gate: engages stop the chain, releases start fresh. */
  notifyGate(): void;
  /** Detaches from the visibility coordinator and removes every listener. */
  teardown(): void;
}

interface RegisteredCarousel {
  id: number;
  element: HTMLElement;
  ratio: number;
  /** This carousel's own visibility gate; mirrors the last setVisible call. */
  licensed: boolean;
  handle: {
    setVisible(visible: boolean): void;
    onVisibilityChange(hidden: boolean): void;
  };
}

// One coordinator per document: every registered carousel carries its own
// visibility gate, and the tab-visibility gate is global, so the registry and
// the document listener live at module level and survive every per-carousel
// teardown.
const registry = new Map<number, RegisteredCarousel>();
let observer: IntersectionObserver | null = null;
let visibilityHooked = false;
let visibilityHidden = false;
let nextId = 1;

function ensureObserver(): void {
  if (observer || typeof IntersectionObserver !== 'function') return;
  observer = new IntersectionObserver(
    (entries) => {
      for (const registered of registry.values()) {
        const entry = entries.find((candidate) => candidate.target === registered.element);
        if (entry) registered.ratio = entry.intersectionRatio;
      }
      syncVisibility();
    },
    { threshold: [0, 0.25, 0.5, 0.75, 1] },
  );
}

/**
 * Grants or revokes each carousel's own visibility gate: every carousel with
 * a positive intersection ratio runs its own chain, so all visible homepage
 * cards autoplay independently (owner-approved 2026-11-11). The gate flips
 * only when it actually changes, so routine observer ticks never restart a
 * running countdown.
 */
function syncVisibility(): void {
  for (const registered of registry.values()) {
    const visible = registered.ratio > 0;
    if (visible === registered.licensed) continue;
    registered.licensed = visible;
    registered.handle.setVisible(visible);
  }
}

function ensureVisibilityListener(): void {
  if (visibilityHooked || typeof document === 'undefined') return;
  visibilityHooked = true;
  document.addEventListener('visibilitychange', () => {
    const hidden = document.visibilityState === 'hidden';
    if (hidden === visibilityHidden) return;
    visibilityHidden = hidden;
    for (const registered of registry.values()) registered.handle.onVisibilityChange(hidden);
  });
}

/**
 * Attaches the autoplay loop for one carousel. The chain only runs while the
 * carousel is visible and every gate is open; any gate engagement stops the
 * timer, and every release starts a fresh full countdown.
 *
 * The cursor is deliberately not a gate: a parked pointer must never hold the
 * chain (owner-approved 2026-11-11), so hover, drag releases and mouse clicks
 * all resume on a fresh countdown. Focus pauses only while the focused
 * element actually matches `:focus-visible` — keyboard Tab and programmatic
 * focus hold the pause, mouse clicks never leave one behind.
 */
export function attachAutoplay(host: AutoplayHost): AutoplayHandle {
  ensureObserver();
  ensureVisibilityListener();
  const id = nextId;
  nextId += 1;
  // Registry insertion order doubles as the deterministic attach order for the
  // initial stagger: freshly mounted homepage carousels get 0, 1, 2, … in DOM
  // order, while a lone detail-page carousel always lands on 0 (no stagger).
  const attachOrder = registry.size;
  const state = {
    licensed: false,
    focus: false,
    dragging: false,
    timer: null as number | null,
    /** True until this carousel's very first timer is actually set. */
    firstPending: true,
  };

  const blocked = (): boolean =>
    !state.licensed || state.focus || state.dragging || visibilityHidden || !host.isAllowed();

  function stopTimer(): void {
    if (state.timer === null) return;
    clearTimeout(state.timer);
    state.timer = null;
  }

  function schedule(): void {
    stopTimer();
    if (blocked()) return;
    // Only the very first countdown this carousel actually starts carries the
    // attach-order stagger; every later countdown (including a manual restart
    // during the initial window) is the plain recurring interval.
    const delay = state.firstPending
      ? AUTOPLAY_GAP_MS + attachOrder * AUTOPLAY_STAGGER_MS
      : AUTOPLAY_GAP_MS;
    state.firstPending = false;
    state.timer = window.setTimeout(fire, delay);
  }

  function fire(): void {
    state.timer = null;
    // A blocked fire stops the chain outright; whatever unblocks it schedules
    // a fresh countdown, so autoplay never queues a catch-up burst.
    if (blocked()) return;
    host.advance();
    schedule();
  }

  /** Engagement stops the chain; release restarts it a full countdown later. */
  function onGateChanged(): void {
    if (blocked()) stopTimer();
    else schedule();
  }

  const root = host.root;
  /**
   * True only when something inside the carousel is focused AND matches
   * `:focus-visible`: keyboard Tab and programmatic `.focus()` match, a mouse
   * click does not — so dot clicks can never leave the chain paused.
   */
  const isFocusVisibleInside = (): boolean => {
    const active = document.activeElement;
    return active instanceof Element && root.contains(active) && active.matches(':focus-visible');
  };
  const onFocusIn = () => {
    const focus = isFocusVisibleInside();
    if (state.focus === focus) return;
    state.focus = focus;
    onGateChanged();
  };
  const onFocusOut = (event: FocusEvent) => {
    if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) {
      // Focus moved within the carousel: the focusin handler re-evaluates.
      return;
    }
    if (!state.focus) return;
    state.focus = false;
    onGateChanged();
  };

  root.addEventListener('focusin', onFocusIn);
  root.addEventListener('focusout', onFocusOut);

  const registered: RegisteredCarousel = {
    id,
    element: root,
    ratio: 0,
    licensed: false,
    handle: {
      setVisible(visible: boolean) {
        state.licensed = visible;
        onGateChanged();
      },
      onVisibilityChange(hidden: boolean) {
        if (hidden) stopTimer();
        else onGateChanged();
      },
    },
  };
  registry.set(id, registered);
  observer?.observe(root);
  // The observer reports the first geometry asynchronously; until then the
  // carousel is not visible and the chain stays stopped.
  syncVisibility();

  return {
    setDragging(dragging: boolean) {
      if (state.dragging === dragging) return;
      state.dragging = dragging;
      onGateChanged();
    },
    restartCountdown() {
      // Manual navigation during the initial stagger window resets to the
      // plain recurring interval immediately.
      state.firstPending = false;
      schedule();
    },
    notifyGate() {
      onGateChanged();
    },
    teardown() {
      stopTimer();
      observer?.unobserve(root);
      registry.delete(id);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
    },
  };
}
