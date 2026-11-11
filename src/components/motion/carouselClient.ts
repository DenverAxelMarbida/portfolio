import { attachAutoplay, type AutoplayHandle } from './carouselAutoplay';
import { nextIndex, shouldSuppressClick, swipeDecision } from './carouselPolicy';

export interface CarouselConfig {
  /** Slides the markup currently declares; the controller tracks changes by remount. */
  count: number;
  /** Live motion-preferences gate (hydrated, not reduced, not globally paused). */
  isAutoplayAllowed: () => boolean;
  /** Manual navigation announcement hook; autoplay never announces. */
  announceManual: (index: number, count: number, alt: string) => void;
  /**
   * Visible caption hook: mirrors the active slide's description on every
   * position change, including silent autoplay advances.
   */
  showCaption: (alt: string) => void;
}

export interface CarouselHandle {
  goto(index: number, delta?: 1 | -1): void;
  /** Re-evaluates autoplay gates (motion-preference flips mid-run halt/restart). */
  notifyGate(): void;
  teardown(): void;
}

/**
 * Attaches the imperative carousel controller to one ProjectMedia root. The
 * controller owns `data-carousel-active`, the track transform, per-slide
 * `aria-hidden`, the current dot, pointer drag/swipe and (from later tasks)
 * autoplay and the wrap clone; React never re-renders for navigation.
 * Teardown is complete, so the handle survives attach/detach cycles such as
 * hash-navigation remounts.
 */
export function activateCarousel(root: HTMLElement, config: CarouselConfig): CarouselHandle {
  const track = root.querySelector<HTMLElement>('[data-carousel-track]');
  const figure = root.querySelector<HTMLElement>('.project-media-figure');
  const slideNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-carousel-slide]'));
  const slides = slideNodes.filter((slide) => slide.getAttribute('data-carousel-clone') !== 'true');
  const dots = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-carousel-dot]'));
  if (!track || slides.length !== config.count) {
    throw new Error(
      `Carousel markup mismatch: expected ${config.count} slides and a track in the media root`,
    );
  }
  if (config.count > 1 && dots.length !== config.count) {
    throw new Error(`Carousel markup mismatch: expected ${config.count} dots in the media root`);
  }

  let index = 0;
  let tornDown = false;

  // Seamless wrap state. `wrapPhase` spans the clone-landing animation; it
  // covers the forward (last→first, end clone) and backward (first→last,
  // start clone) directions alike. `wrapCleanup` releases the phase's
  // transitionend listener and fallback timer, and `wrapTarget` is the real
  // slide the phase lands on. Every interaction finishes the wrap instantly
  // before proceeding.
  let wrapPhase = false;
  let wrapTarget = 0;
  let wrapCleanup: (() => void) | null = null;

  // With a start clone before slide 1, every real slide rests one slot deeper
  // into the track: slide i sits at -(i+1)·100%. Markup without a start clone
  // keeps the historic offset of zero.
  const cloneOffset = slideNodes[0]?.getAttribute('data-carousel-clone') === 'true' ? 1 : 0;

  // Pointer gesture state. `dragging` means the intent threshold was crossed:
  // the track follows the pointer 1:1 and autoplay must hold.
  let activePointerId: number | null = null;
  let dragging = false;
  let dragStartX = 0;
  let draggedPx = 0;
  let dragWidthPx = 0;
  let lastMoveX = 0;
  let lastMoveTime = 0;
  let velocityPxPerS = 0;
  let clickCaptureArmed = false;

  function slideAlt(position: number): string {
    return slides[position]?.querySelector('img')?.getAttribute('alt') ?? '';
  }

  function applyAria(active: number): void {
    slides.forEach((slide, position) => {
      if (position === active) slide.removeAttribute('aria-hidden');
      else slide.setAttribute('aria-hidden', 'true');
    });
    dots.forEach((dot, position) => {
      if (position === active) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  }

  function render(next: number): void {
    index = next;
    root.setAttribute('data-carousel-active', String(index));
    track!.style.transform = `translateX(-${(next + cloneOffset) * 100}%)`;
    applyAria(index);
    config.showCaption(slideAlt(next));
  }

  /** Repositions without any transition, then restores it. */
  function coveredReposition(next: number): void {
    track!.style.transition = 'none';
    render(next);
    // Commit the transitionless position before restoring the transition,
    // otherwise the jump itself would animate.
    void track!.offsetWidth;
    track!.style.transition = '';
  }

  function silentReposition(target: number): void {
    wrapPhase = false;
    coveredReposition(target);
  }

  /**
   * Finishes an in-flight wrap synchronously: releases the clone-phase
   * listeners and lands on the wrap target immediately. Called before every
   * interaction so a mid-animation gesture always starts from the real slide.
   */
  function finishWrapInstantly(): void {
    if (!wrapPhase) return;
    wrapCleanup?.();
    wrapCleanup = null;
    silentReposition(wrapTarget);
  }

  /**
   * The seamless wraps in both directions. Forward (delta 1): aria, dots and
   * the active marker move to slide 1, the physical track animates onto the
   * end clone, and once the animation has painted its landing frame the track
   * silently repositions to the real slide 1. Backward (delta -1): the same
   * scheme mirrored — the track animates onto the start clone (which carries
   * the last slide's look) with the marker `-1`, then lands on the real last
   * slide.
   */
  function beginWrap(delta: 1 | -1): void {
    const destination = delta === 1 ? 0 : config.count - 1;
    index = destination;
    applyAria(destination);
    wrapPhase = true;
    wrapTarget = destination;
    config.showCaption(slideAlt(destination));
    root.setAttribute('data-carousel-active', delta === 1 ? String(config.count) : String(-1));
    track!.style.transform =
      delta === 1 ? `translateX(-${(config.count + cloneOffset) * 100}%)` : 'translateX(0%)';

    const finish = () => {
      if (tornDown) return;
      wrapCleanup?.();
      wrapCleanup = null;
      // One painted landing frame on the clone first: rAF now runs before the
      // next paint, so the second requestAnimationFrame fires after the clone
      // has been visible with no running transition.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (wrapPhase) silentReposition(wrapTarget);
        });
      });
    };
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.propertyName !== 'transform') return;
      finish();
    };
    track!.addEventListener('transitionend', onTransitionEnd);
    // The CSS transition may be absent (motion guards land in a later task)
    // or never end: the fallback completes the wrap regardless.
    const rawDuration = getComputedStyle(track!).transitionDuration.split(',')[0]?.trim();
    const durationValue = Number.parseFloat(rawDuration ?? '0');
    const durationMs = Number.isFinite(durationValue)
      ? rawDuration?.endsWith('ms')
        ? durationValue
        : durationValue * 1000
      : 0;
    const fallback = window.setTimeout(finish, durationMs + 140);
    wrapCleanup = () => {
      window.clearTimeout(fallback);
      track!.removeEventListener('transitionend', onTransitionEnd);
    };
  }

  function goto(target: number, delta?: 1 | -1): void {
    if (tornDown || config.count < 2) return;
    finishWrapInstantly();
    const next = delta
      ? nextIndex(target, config.count, delta)
      : Math.min(Math.max(target, 0), config.count - 1);
    if (delta && next < target) {
      // Forward wrap: announce the destination, then animate onto the end
      // clone and land on slide 1.
      config.announceManual(0, config.count, slideAlt(0));
      beginWrap(1);
      autoplay?.restartCountdown();
      return;
    }
    if (delta && next > target) {
      // Backward wrap: announce the destination, then animate onto the start
      // clone and land on the last slide.
      config.announceManual(config.count - 1, config.count, slideAlt(config.count - 1));
      beginWrap(-1);
      autoplay?.restartCountdown();
      return;
    }
    if (Math.abs(next - index) > 1) {
      // Multi-slide jumps never transit the intermediate slides.
      coveredReposition(next);
    } else {
      render(next);
    }
    // Public navigation is manual and announces; and every manual move
    // restarts the autoplay countdown from zero.
    config.announceManual(next, config.count, slideAlt(next));
    autoplay?.restartCountdown();
  }

  /**
   * Autoplay's silent advance: never announces, and the wrap from the last
   * slide animates forward onto the end clone before landing on slide 1.
   */
  function advanceSilently(): void {
    if (tornDown || config.count < 2 || wrapPhase) return;
    const next = nextIndex(index, config.count, 1);
    if (next < index) beginWrap(1);
    else render(next);
  }

  const autoplay: AutoplayHandle | null =
    config.count > 1
      ? attachAutoplay({
          root,
          isAllowed: config.isAutoplayAllowed,
          advance: advanceSilently,
        })
      : null;

  function disarmClickCapture(): void {
    if (!clickCaptureArmed) return;
    clickCaptureArmed = false;
    root.removeEventListener('click', onRootClickCapture, true);
  }

  const onRootClickCapture = (event: MouseEvent) => {
    if (!clickCaptureArmed) return;
    // The release ended a real drag: swallow the synthetic click so a gesture
    // can never click through to anything under the pointer.
    disarmClickCapture();
    event.preventDefault();
    event.stopPropagation();
  };

  function releasePointer(): void {
    activePointerId = null;
  }

  function endDrag(): void {
    dragging = false;
    track!.style.transition = '';
    // The drag gate releases with the gesture: the countdown restarts fresh
    // whether the release commits, snaps back or is cancelled.
    autoplay?.setDragging(false);
  }

  function snapBack(): void {
    render(index);
  }

  function cancelDrag(): void {
    if (tornDown || activePointerId === null) return;
    releasePointer();
    if (!dragging) return;
    endDrag();
    disarmClickCapture();
    snapBack();
  }

  const onPointerDown = (event: PointerEvent) => {
    if (tornDown || config.count < 2 || activePointerId !== null) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // A gesture always starts from slide 1: an in-flight wrap lands first.
    finishWrapInstantly();
    activePointerId = event.pointerId;
    dragStartX = event.clientX;
    draggedPx = 0;
    lastMoveX = event.clientX;
    lastMoveTime = event.timeStamp;
    velocityPxPerS = 0;
    dragWidthPx = figure?.getBoundingClientRect().width ?? track.getBoundingClientRect().width;
    // Capture from the start so releases outside the figure behave like
    // in-figure releases. Failures fall back to bubbled events.
    try {
      track.setPointerCapture(event.pointerId);
    } catch {
      /* Capture is a behavior upgrade, not a requirement. */
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (tornDown || activePointerId !== event.pointerId) return;
    const dt = event.timeStamp - lastMoveTime;
    if (dt > 0) {
      const instant = ((event.clientX - lastMoveX) / dt) * 1000;
      velocityPxPerS = velocityPxPerS === 0 ? instant : velocityPxPerS * 0.8 + instant * 0.2;
      lastMoveX = event.clientX;
      lastMoveTime = event.timeStamp;
    }
    const dx = event.clientX - dragStartX;
    if (!dragging && shouldSuppressClick(dx)) {
      dragging = true;
      track.style.transition = 'none';
      clickCaptureArmed = true;
      root.addEventListener('click', onRootClickCapture, true);
      // The intent threshold was crossed: autoplay holds while the pointer
      // owns the gesture.
      autoplay?.setDragging(true);
    }
    if (!dragging) return;
    draggedPx = dx;
    track.style.transform = `translateX(calc(${-(index + cloneOffset) * 100}% + ${dx}px))`;
  };

  const onPointerUp = (event: PointerEvent) => {
    if (tornDown || activePointerId !== event.pointerId) return;
    releasePointer();
    if (!dragging) return;
    endDrag();
    // The synthetic click, if any, is dispatched synchronously after this
    // event; arm a fallback cleanup so a missed click cannot leave the
    // suppression stuck on for the next real interaction.
    setTimeout(disarmClickCapture, 0);
    const decision = swipeDecision(draggedPx, dragWidthPx, velocityPxPerS);
    // The decision is the content-shift direction: dragging left (negative dx)
    // reveals the next slide, dragging right reveals the previous one. Drags
    // past either edge wrap seamlessly through the matching clone instead of
    // clamping (owner-approved 2026-11-11).
    const target = index - decision;
    if (decision !== 0) {
      if (target >= 0 && target <= config.count - 1) goto(target);
      else goto(index, target < 0 ? -1 : 1);
    } else {
      snapBack();
    }
  };

  const onPointerCancel = () => {
    cancelDrag();
  };

  const onLostPointerCapture = () => {
    // After a normal release the pointer is already cleared, so this only
    // fires meaningfully when capture was lost mid-drag.
    cancelDrag();
  };

  const onDragStart = (event: DragEvent) => {
    if (tornDown) return;
    event.preventDefault();
  };

  const onRootClick = (event: MouseEvent) => {
    if (tornDown) return;
    const target = event.target instanceof Element ? event.target : null;
    const dot = target?.closest('[data-carousel-dot]');
    if (!dot) return;
    // Dots are manual controls, not card links: never navigate, never leak
    // the event to any ancestor gesture handling.
    event.preventDefault();
    event.stopPropagation();
    const position = Number(dot.getAttribute('data-carousel-dot'));
    if (Number.isInteger(position)) goto(position);
  };

  const onRootKeyDown = (event: KeyboardEvent) => {
    if (tornDown) return;
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        goto(index, 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        goto(index, -1);
        break;
      case 'Home':
        event.preventDefault();
        goto(0);
        break;
      case 'End':
        event.preventDefault();
        goto(config.count - 1);
        break;
    }
  };

  track.addEventListener('pointerdown', onPointerDown);
  track.addEventListener('pointermove', onPointerMove);
  track.addEventListener('pointerup', onPointerUp);
  track.addEventListener('pointercancel', onPointerCancel);
  track.addEventListener('lostpointercapture', onLostPointerCapture);
  root.addEventListener('click', onRootClick);
  root.addEventListener('keydown', onRootKeyDown);
  root.addEventListener('dragstart', onDragStart);

  root.dataset.carouselFit = 'contain';
  render(0);

  return {
    goto,
    notifyGate() {
      autoplay?.notifyGate();
    },
    teardown() {
      if (tornDown) return;
      tornDown = true;
      finishWrapInstantly();
      wrapPhase = false;
      wrapCleanup?.();
      wrapCleanup = null;
      cancelDrag();
      disarmClickCapture();
      autoplay?.teardown();
      track.removeEventListener('pointerdown', onPointerDown);
      track.removeEventListener('pointermove', onPointerMove);
      track.removeEventListener('pointerup', onPointerUp);
      track.removeEventListener('pointercancel', onPointerCancel);
      track.removeEventListener('lostpointercapture', onLostPointerCapture);
      root.removeEventListener('click', onRootClick);
      root.removeEventListener('keydown', onRootKeyDown);
      root.removeEventListener('dragstart', onDragStart);
    },
  };
}
