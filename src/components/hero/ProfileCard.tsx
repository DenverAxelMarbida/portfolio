import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Profile } from '../../../scripts/content/schema';
import { useMotionPreferences } from '../motion/MotionPreferences';
import { registerMotionAnimationControl } from '../motion/animationControls';
import {
  LANYARD_CONFIG,
  createLanyardConfig,
  deriveLanyardAnchorGeometry,
  isLanyardSettled,
  lanyardCardTransform,
  lanyardDropState,
  lanyardFrameInterval,
  lanyardReleaseState,
  lanyardReleaseVelocity,
  lanyardRestState,
  lanyardRopePath,
  stepLanyard,
  LANYARD_RELEASE_SAMPLE_MS,
  type LanyardConfig,
  type LanyardState,
} from '../motion/profileCardMotion';

const MOBILE_QUERY = '(max-width: 767px)';
const WIDE_QUERY = '(min-width: 1024px)';
const FRAME_TOLERANCE_MS = 4;
const MAX_FRAME_DELTA_MS = 100;
const FIXED_STEP_MS = 1000 / 120;
const MAX_STEPS_PER_FRAME = 8;
const MAX_DRAG_STEP_SECONDS = 1 / 30;
const MIN_FLING_SPEED = 60;

type ProfileCardPhase = 'entrance' | 'idle' | 'dragging' | 'settling' | 'static';

interface ProfileCardClock {
  entranceRuns: number;
  started: boolean;
  state: LanyardState;
  config: LanyardConfig;
  /** Strap-root top position relative to the shell top, in px (≤ 0). */
  anchorTopOffset: number;
}

function subscribeMobile(onChange: () => void) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const readMobile = () => window.matchMedia(MOBILE_QUERY).matches;
const readServerMobile = () => false;

/**
 * Whether the side-by-side layout (and therefore a document-rooted strap) is
 * active. Read live at measurement time instead of stored in React state: a
 * stale snapshot could clamp the strap to the shell while the layout is wide
 * (or vice versa) after a hydration re-render.
 */
const readWide = () => window.matchMedia(WIDE_QUERY).matches;

/** Server-rendered strap pose before any layout measurement is available. */
const REST_PATH = lanyardRopePath(lanyardRestState(), LANYARD_CONFIG);

/* Layout effects pre-position the drop before the first paint on the client. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function ProfileCard({ profile }: { profile: Profile }) {
  const [failed, setFailed] = useState(false);
  const { hydrated, motionAllowed } = useMotionPreferences();
  const mobile = useSyncExternalStore(subscribeMobile, readMobile, readServerMobile);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const lanyardRef = useRef<HTMLDivElement | null>(null);
  const strapRef = useRef<SVGPathElement | null>(null);
  const stitchRef = useRef<SVGPathElement | null>(null);
  const clockRef = useRef<ProfileCardClock>({
    entranceRuns: 0,
    started: false,
    state: lanyardRestState(),
    // Fallback until the rendered layout is measured in the layout effect.
    config: LANYARD_CONFIG,
    anchorTopOffset: 0,
  });
  const image = profile.image;

  useIsomorphicLayoutEffect(() => {
    const shellElement = shellRef.current;
    const cardElement = cardRef.current;
    if (!shellElement || !cardElement) return;
    // Aliases give the nested handlers a guaranteed non-null type without assertions.
    const shell: HTMLDivElement = shellElement;
    const card: HTMLDivElement = cardElement;

    const strap = strapRef.current;
    const stitch = stitchRef.current;
    const lanyard = lanyardRef.current;
    const clock = clockRef.current;
    // Shared with the static path's geometry watcher; TDZ-safe for callbacks.
    let dragging = false;

    /**
     * Document-space top of an element, ignoring its own transform (the card
     * is translated during the swing), by walking the offsetParent chain.
     */
    function documentTop(el: HTMLElement): number {
      let top = 0;
      let node: HTMLElement | null = el;
      while (node) {
        top += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
      }
      return top;
    }

    /** Re-derives strap geometry from the rendered document layout. */
    function applyGeometry() {
      // The card's offset position is used instead of getBoundingClientRect():
      // the bounding rect includes the card's own transform, so measuring it
      // mid-swing would flag the card as "above the shell" and fall back to
      // the shell-local strap, switching the rope lengths mid-drop.
      const geometry = deriveLanyardAnchorGeometry(
        readWide() ? 'document' : 'shell',
        documentTop(shell),
        documentTop(card),
      );
      clock.config = createLanyardConfig(geometry.restLength);
      clock.anchorTopOffset = geometry.anchorTopOffset;
      if (lanyard) lanyard.style.top = `${geometry.anchorTopOffset}px`;
      shell.dataset.profileAnchor = geometry.mode;
      return geometry;
    }

    /** Re-derives after a layout change without interrupting an active gesture. */
    function remeasure() {
      const previousRestLength = clock.config.restLength;
      applyGeometry();
      if (clock.config.restLength === previousRestLength) return;
      if (!dragging && isLanyardSettled(clock.state, createLanyardConfig(previousRestLength))) {
        clock.state = lanyardRestState(clock.config);
        paintRest();
      }
    }

    let geometryObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver === 'function') {
      geometryObserver = new ResizeObserver(remeasure);
      geometryObserver.observe(shell);
      geometryObserver.observe(document.documentElement);
    }

    // Measure synchronously before the first pose: an entrance drop that starts
    // with the fallback lengths and is re-simulated mid-flight with the real
    // ones would never settle. The observer only handles later layout changes.
    applyGeometry();

    function paintStrap(state: LanyardState) {
      const path = lanyardRopePath(state, clock.config);
      strap?.setAttribute('d', path);
      stitch?.setAttribute('d', path);
    }

    function paint(state: LanyardState) {
      paintStrap(state);
      card.style.transform = lanyardCardTransform(state, clock.config);
    }

    function paintRest() {
      paintStrap(lanyardRestState(clock.config));
      card.style.transform = '';
    }

    if (!hydrated || !motionAllowed) {
      paintRest();
      shell.dataset.profileMotion = 'static';
      shell.dataset.profilePhase = 'static';
      shell.dataset.profileDrag = 'idle';
      return () => {
        geometryObserver?.disconnect();
      };
    }

    const firstEntrance = !clock.started;
    if (firstEntrance) {
      clock.started = true;
      clock.entranceRuns += 1;
      clock.state = lanyardDropState(clock.config);
    } else {
      clock.state = lanyardRestState(clock.config);
    }
    shell.dataset.profileEntranceRuns = String(clock.entranceRuns);
    shell.dataset.profileMotion = 'active';
    shell.dataset.profileDrag = 'idle';

    let phase: ProfileCardPhase = firstEntrance ? 'entrance' : 'idle';
    shell.dataset.profilePhase = phase;

    const frameInterval = lanyardFrameInterval(mobile);
    let rafId = 0;
    let lastFrame = 0;
    let lastPaint = 0;
    let accumulatorMs = 0;
    let disposed = false;
    let documentVisible = document.visibilityState !== 'hidden';
    let inView = true;
    let pointerId = -1;
    let pointerKnown = false;
    let anchor = { x: 0, y: 0 };
    let grab = { x: 0, y: 0 };
    let pointerTarget = { x: 0, y: 0 };
    let pointerVelocity = { vx: 0, vy: 0 };
    let lastPointer = { x: 0, y: 0, time: 0 };

    const canRun = () => !disposed && documentVisible && inView;

    function setPhase(next: ProfileCardPhase) {
      if (phase === next) return;
      phase = next;
      shell.dataset.profilePhase = next;
    }

    function stopLoop() {
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      lastFrame = 0;
      lastPaint = 0;
      accumulatorMs = 0;
    }

    function detachDragListeners() {
      card.removeEventListener('pointermove', onPointerMove);
      card.removeEventListener('pointerup', onPointerUp);
      card.removeEventListener('pointercancel', onPointerCancel);
      card.removeEventListener('lostpointercapture', onPointerCancel);
    }

    function releasePointerCapture() {
      if (pointerId === -1) return;
      const id = pointerId;
      pointerId = -1;
      if (card.hasPointerCapture(id)) card.releasePointerCapture(id);
    }

    function endDrag(fling = false) {
      detachDragListeners();
      releasePointerCapture();
      const wasDragging = dragging;
      dragging = false;
      pointerKnown = false;
      shell.dataset.profileDrag = 'idle';
      if (!wasDragging) return;

      const releaseVelocity = fling ? measuredReleaseVelocity() : { vx: 0, vy: 0 };

      const useMeasured = Math.hypot(releaseVelocity.vx, releaseVelocity.vy) > MIN_FLING_SPEED;

      const finalVx = useMeasured ? releaseVelocity.vx : clock.state.vx;
      const finalVy = useMeasured ? releaseVelocity.vy : clock.state.vy;

      pointerVelocity = { vx: 0, vy: 0 };
      lastPointer = { x: 0, y: 0, time: 0 };

      clock.state = lanyardReleaseState(clock.state, finalVx, finalVy, clock.config);

      if (isLanyardSettled(clock.state, clock.config)) {
        clock.state = lanyardRestState(clock.config);
        paintRest();
        setPhase('idle');
        stopLoop();
      } else {
        setPhase('settling');
        lastFrame = 0;
        schedule();
      }
    }

    /** Immediate, stable resting presentation for pause, hidden tabs and offscreen. */
    function settle() {
      stopLoop();
      detachDragListeners();
      releasePointerCapture();
      dragging = false;
      pointerKnown = false;
      clock.state = lanyardRestState(clock.config);
      paintRest();
      shell.dataset.profileMotion = 'static';
      shell.dataset.profileDrag = 'idle';
      setPhase('static');
    }

    function paintIfDue(now: number, state: LanyardState) {
      if (lastPaint === 0 || now - lastPaint >= frameInterval - FRAME_TOLERANCE_MS) {
        lastPaint = now;
        paint(state);
      }
    }

    function finishAtRest() {
      clock.state = lanyardRestState(clock.config);
      paintRest();
      setPhase('idle');
      stopLoop();
    }

    function tick(now: number) {
      rafId = 0;
      const canRunNow = canRun();
      if (!canRunNow) return;

      const deltaMs =
        lastFrame === 0 ? frameInterval : Math.min(now - lastFrame, MAX_FRAME_DELTA_MS);
      lastFrame = now;

      if (dragging) {
        // One step per frame keeps the pointer velocity intact for the release.
        clock.state = stepLanyard(clock.state, {
          dtSeconds: Math.min(deltaMs / 1_000, MAX_DRAG_STEP_SECONDS),
          dragging: true,
          target: pointerKnown ? pointerTarget : null,
          config: clock.config,
        });
        paintIfDue(now, clock.state);
        schedule();
        return;
      }

      accumulatorMs += deltaMs;
      let state = clock.state;
      let steps = 0;
      while (accumulatorMs >= FIXED_STEP_MS && steps < MAX_STEPS_PER_FRAME) {
        state = stepLanyard(state, { dtSeconds: FIXED_STEP_MS / 1_000, config: clock.config });
        accumulatorMs -= FIXED_STEP_MS;
        steps += 1;
      }
      if (steps === 0) {
        schedule();
        return;
      }

      clock.state = state;
      paintIfDue(now, state);

      if (isLanyardSettled(state, clock.config)) {
        finishAtRest();
        return;
      }

      if (phase === 'entrance') setPhase('entrance');
      else if (phase !== 'settling') setPhase('settling');
      schedule();
    }

    function schedule() {
      if (rafId !== 0 || !canRun()) return;
      rafId = window.requestAnimationFrame(tick);
    }

    /**
     * Release momentum: the smoothed pointer velocity is only valid inside the
     * sampling window (LANYARD_RELEASE_SAMPLE_MS, the same freshness rule the
     * move handler applies). A stationary hold therefore ends with no stored
     * fling speed, while a release right after a fast gesture keeps it.
     */
    function measuredReleaseVelocity(): { vx: number; vy: number } {
      if (lastPointer.time === 0) return { vx: 0, vy: 0 };
      const holdMs = performance.now() - lastPointer.time;
      const velocity = lanyardReleaseVelocity(pointerVelocity, holdMs);
      if (Math.hypot(velocity.vx, velocity.vy) < MIN_FLING_SPEED) return { vx: 0, vy: 0 };
      return velocity;
    }

    function onPointerMove(event: PointerEvent) {
      if (!dragging || event.pointerId !== pointerId) return;
      const now = event.timeStamp;
      if (lastPointer.time > 0) {
        const elapsed = now - lastPointer.time;
        if (elapsed > 0 && elapsed < LANYARD_RELEASE_SAMPLE_MS) {
          const instantX = ((event.clientX - lastPointer.x) / elapsed) * 1_000;
          const instantY = ((event.clientY - lastPointer.y) / elapsed) * 1_000;
          pointerVelocity = {
            vx: pointerVelocity.vx * 0.6 + instantX * 0.4,
            vy: pointerVelocity.vy * 0.6 + instantY * 0.4,
          };
        }
      }
      lastPointer = { x: event.clientX, y: event.clientY, time: now };
      pointerTarget = {
        x: event.clientX - anchor.x - grab.x,
        y: event.clientY - anchor.y - grab.y,
      };
      pointerKnown = true;
    }

    function onPointerUp(event: PointerEvent) {
      if (event.pointerId !== pointerId) return;
      endDrag(true);
    }

    function onPointerCancel(event: PointerEvent) {
      if (event.pointerId !== pointerId) return;
      endDrag(false);
    }

    function onPointerDown(event: PointerEvent) {
      if (!canRun() || dragging) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();

      const rect = shell.getBoundingClientRect();
      anchor = { x: rect.left + rect.width / 2, y: rect.top + clock.anchorTopOffset };
      grab = {
        x: event.clientX - (anchor.x + clock.state.x),
        y: event.clientY - (anchor.y + clock.state.y),
      };
      pointerTarget = { x: clock.state.x, y: clock.state.y };
      pointerKnown = false;
      pointerVelocity = { vx: 0, vy: 0 };
      lastPointer = { x: event.clientX, y: event.clientY, time: 0 };
      dragging = true;
      pointerId = event.pointerId;
      setPhase('dragging');
      shell.dataset.profileDrag = 'dragging';
      try {
        card.setPointerCapture(event.pointerId);
      } catch {
        // Capture is an enhancement; window-level cancellation still cleans up.
      }
      card.addEventListener('pointermove', onPointerMove);
      card.addEventListener('pointerup', onPointerUp);
      card.addEventListener('pointercancel', onPointerCancel);
      card.addEventListener('lostpointercapture', onPointerCancel);
      lastFrame = 0;
      lastPaint = 0;
      accumulatorMs = 0;
      schedule();
    }

    function cancelPointer() {
      if (dragging) endDrag(false);
    }

    function onVisibilityChange() {
      documentVisible = document.visibilityState !== 'hidden';
      sync();
    }

    function sync() {
      if (!canRun()) {
        settle();
        return;
      }
      shell.dataset.profileMotion = 'active';
      if (phase === 'static') {
        if (isLanyardSettled(clock.state, clock.config)) {
          paintRest();
          setPhase('idle');
        } else {
          setPhase('settling');
          schedule();
        }
      } else if (!dragging && !isLanyardSettled(clock.state, clock.config)) {
        schedule();
      }
    }

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) if (entry.target === shell) inView = entry.isIntersecting;
          sync();
        },
        { rootMargin: '80px 0px' },
      );
      observer.observe(shell);
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', cancelPointer);
    card.addEventListener('pointerdown', onPointerDown, { passive: false });

    const unregister = registerMotionAnimationControl({ stop: stopLoop, settle });

    if (firstEntrance) paint(clock.state);
    else paintRest();

    if (!isLanyardSettled(clock.state)) schedule();

    return () => {
      disposed = true;
      stopLoop();
      unregister();
      observer?.disconnect();
      geometryObserver?.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', cancelPointer);
      card.removeEventListener('pointerdown', onPointerDown);
      detachDragListeners();
      releasePointerCapture();
      dragging = false;
    };
  }, [hydrated, motionAllowed, mobile]);

  return (
    <div
      className="profile-card-shell"
      ref={shellRef}
      data-profile-motion="static"
      data-profile-phase="static"
      data-profile-drag="idle"
    >
      <div className="profile-card-lanyard" ref={lanyardRef} aria-hidden="true">
        <svg className="profile-card-lanyard-svg" focusable="false">
          <path ref={strapRef} className="profile-card-strap" d={REST_PATH} />
          <path ref={stitchRef} className="profile-card-stitch" d={REST_PATH} />
        </svg>
        <span className="profile-card-ring" />
      </div>
      <div className="profile-card" ref={cardRef}>
        <span className="profile-card-clip" aria-hidden="true" />
        <div className="profile-card-photo">
          {image && !failed ? (
            <img
              src={`/media/${image.assetPath}`}
              alt={image.alt}
              width={image.width}
              height={image.height}
              draggable={false}
              ref={(element) => {
                if (element?.complete && element.naturalWidth === 0) setFailed(true);
              }}
              onError={() => setFailed(true)}
            />
          ) : (
            <p className="profile-card-fallback">Portrait unavailable</p>
          )}
        </div>
        <div className="profile-card-meta">
          <p className="profile-card-name">{profile.name}</p>
          <p className="profile-card-title">{profile.title}</p>
        </div>
      </div>
    </div>
  );
}
