import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as THREE from 'three';
import {
  canvasPxToWorld,
  drawCardTexture,
  LanyardSceneApp,
  measureLanyard3dGeometry,
  readSceneColors,
  type Lanyard3dRuntime,
} from './components/motion/LanyardScene';
import {
  createLanyard3dDropState,
  createLanyard3dRestState,
  isLanyard3dSettled,
  type Vec3,
} from './components/motion/lanyard3dPhysics';

/** Matches ProfileCard's wide-layout query: strap roots at the document top. */
const WIDE_QUERY = '(min-width: 1024px)';

export interface Lanyard3dBridge {
  /** Freeze rendering (Pause animations). A later settle() snaps to rest. */
  pause(): void;
  /** Resume after pause(). */
  resume(): void;
  /** Snap to the exact rest pose and paint it once (hidden/offscreen). */
  settle(): void;
  /** Unmount the canvas and release every resource. */
  dispose(): void;
}

export interface MountLanyard3dOptions {
  shell: HTMLElement;
  card: HTMLElement;
}

/**
 * Mounts the 3D lanyard prototype inside `host` (the
 * `.profile-card-lanyard3d` element) and returns a control bridge, or null
 * when the rendered layout cannot be measured cleanly (the caller then falls
 * back to the DOM lanyard).
 *
 * The host keeps `pointer-events: none`; an invisible card-sized hit proxy
 * tracks the projected card rect each frame and carries the drag gestures, so
 * page scrolling over the strap region keeps working.
 */
export function mountLanyard3d(
  host: HTMLElement,
  options: MountLanyard3dOptions,
): Lanyard3dBridge | null {
  const { shell, card } = options;
  const anchorMode = window.matchMedia(WIDE_QUERY).matches ? 'document' : 'shell';
  const geometry = measureLanyard3dGeometry(shell, card, anchorMode);
  if (!geometry) return null;

  const runtime: Lanyard3dRuntime = {
    geometry,
    state: createLanyard3dDropState(geometry.config),
    dragging: false,
    target: null,
    paused: false,
    onFrame: null,
  };

  let disposed = false;
  let version = 0;
  let texture: THREE.CanvasTexture | null = null;
  let canvasRect: DOMRect | null = null;
  let pausedByControl = false;
  let pausedByEnvironment = false;
  let documentVisible = document.visibilityState !== 'hidden';
  let inView = true;

  // The React root must own a container of its own: React 19 clears
  // pre-existing children of the root container, so the manually managed hit
  // proxy is a sibling, never a child of the same node.
  const canvasHost = document.createElement('div');
  host.appendChild(canvasHost);
  const root: Root = createRoot(canvasHost);
  const colors = readSceneColors(card, shell);

  // Invisible drag proxy inside the card-sized canvas region.
  const hit = document.createElement('div');
  hit.className = 'profile-card-3d-hit';
  host.appendChild(hit);

  function buildTexture(): THREE.CanvasTexture {
    // `flat` tone mapping renders unlit colors as-is; the DOM card's colors
    // are sRGB, so the texture must be flagged accordingly.
    const next = new THREE.CanvasTexture(drawCardTexture(card));
    next.colorSpace = THREE.SRGBColorSpace;
    return next;
  }

  function rebuildTexture() {
    const previous = texture;
    texture = buildTexture();
    render();
    previous?.dispose();
  }

  function render() {
    if (disposed) return;
    root.render(
      createElement(LanyardSceneApp, {
        runtime,
        texture,
        colors,
        geometryVersion: version,
        paused: runtime.paused,
      }),
    );
  }

  // ---- Presentation phases -------------------------------------------------
  // The DOM lanyard drives `data-profile-phase` from its simulation clock; the
  // 3D host derives it from pose stability: a pose string that stops changing
  // while not dragging means the solver reached its exact rest pose.

  type Phase = 'entrance' | 'dragging' | 'settling' | 'idle' | 'static';
  let phase: Phase = 'entrance';
  let lastPose = '';
  let stableFrames = 0;

  function setPhase(next: Phase) {
    if (phase === next) return;
    phase = next;
    shell.dataset.profilePhase = next;
  }

  runtime.onFrame = (rect, pose) => {
    if (disposed) return;
    // The canvas is centered on the host with `top: -anchorRowPx`, so the
    // proxy's host-space position is the canvas-space rect shifted by the
    // constant half-width and anchor-row offsets. Geometry is read through
    // `runtime` on purpose: remeasure() swaps it, and a mount-time closure
    // would misplace the proxy (and gate the settle check) after a resize.
    hit.style.left = `${rect.left - runtime.geometry.canvasWidth / 2}px`;
    hit.style.top = `${rect.top - runtime.geometry.anchorRowPx}px`;
    hit.style.width = `${rect.width}px`;
    hit.style.height = `${rect.height}px`;
    host.dataset.lanyardPose = pose;

    if (!runtime.dragging) {
      if (pose === lastPose) stableFrames += 1;
      else stableFrames = 0;
      if (
        stableFrames > 4 &&
        phase !== 'idle' &&
        isLanyard3dSettled(runtime.state, runtime.geometry.config)
      ) {
        setPhase('idle');
      }
    }
    lastPose = pose;
  };

  // ---- Drag gestures -------------------------------------------------------

  let pointerId = -1;
  let grab: Vec3 = { x: 0, y: 0, z: 0 };

  function pointerWorldPosition(event: PointerEvent): Vec3 | null {
    // The canvas exists by the time the hit proxy is interactable (it is
    // positioned by onFrame, which only runs inside live frames).
    const canvas = host.querySelector('canvas');
    if (!canvas) return null;
    const rect = canvasRect ?? (canvasRect = canvas.getBoundingClientRect());
    return canvasPxToWorld(runtime.geometry, event.clientX - rect.left, event.clientY - rect.top);
  }

  function endDrag() {
    runtime.dragging = false;
    runtime.target = null;
    pointerId = -1;
    shell.dataset.profileDrag = 'idle';
    setPhase('settling');
  }

  function onPointerDown(event: PointerEvent) {
    if (disposed || runtime.dragging) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const pointer = pointerWorldPosition(event);
    if (!pointer) return;
    event.preventDefault();
    // The drag target drives the rope clip, so the grab offset must be
    // measured against the clip, not the card center. The card hangs half a
    // card-height below the clip: measuring the grab against the center
    // inserted a constant half-card downward bias into every drag target —
    // vertical drags had half their intended effect and the card could never
    // approach the pointer ("heavy dragging" in the owner review). Anchoring
    // to the clip makes the assembly follow the pointer delta exactly like
    // the DOM lanyard's attachment-point grab.
    const clip = runtime.state.rope[runtime.state.rope.length - 1];
    if (!clip) return;
    grab = { x: pointer.x - clip.position.x, y: pointer.y - clip.position.y, z: 0 };
    runtime.target = { ...clip.position };
    runtime.dragging = true;
    pointerId = event.pointerId;
    setPhase('dragging');
    shell.dataset.profileDrag = 'dragging';
    try {
      hit.setPointerCapture(event.pointerId);
    } catch {
      // Capture is an enhancement; pointerup on the proxy still cleans up.
    }
  }

  function onPointerMove(event: PointerEvent) {
    if (disposed || !runtime.dragging || event.pointerId !== pointerId) return;
    const pointer = pointerWorldPosition(event);
    if (!pointer) return;
    runtime.target = { x: pointer.x - grab.x, y: pointer.y - grab.y, z: 0 };
  }

  function onPointerUp(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    endDrag();
  }

  function onPointerCancel(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    endDrag();
  }

  hit.addEventListener('pointerdown', onPointerDown, { passive: false });
  hit.addEventListener('pointermove', onPointerMove);
  hit.addEventListener('pointerup', onPointerUp);
  hit.addEventListener('pointercancel', onPointerCancel);

  // ---- Pause, visibility and viewport --------------------------------------

  function syncEnvironment() {
    if (disposed) return;
    const active = documentVisible && inView;
    const wasPaused = pausedByEnvironment;
    pausedByEnvironment = !active;
    if (!active) {
      // Offscreen or hidden: snap to the stable rest pose, then freeze.
      if (runtime.dragging) endDrag();
      runtime.state = createLanyard3dRestState(runtime.geometry.config);
      shell.dataset.profileMotion = 'static';
      setPhase('static');
    } else if (wasPaused) {
      shell.dataset.profileMotion = 'active';
      setPhase('settling');
    }
    applyPause();
  }

  function applyPause() {
    const next = pausedByControl || pausedByEnvironment;
    if (runtime.paused !== next) {
      runtime.paused = next;
      render();
    }
  }

  function onVisibilityChange() {
    documentVisible = document.visibilityState !== 'hidden';
    syncEnvironment();
  }

  let observer: IntersectionObserver | null = null;
  if (typeof IntersectionObserver === 'function') {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.target === shell) inView = entry.isIntersecting;
        syncEnvironment();
      },
      { rootMargin: '80px 0px' },
    );
    observer.observe(shell);
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  // ---- Measured-layout changes ---------------------------------------------

  function remeasure() {
    if (disposed || runtime.dragging) return;
    const nextMode = window.matchMedia(WIDE_QUERY).matches ? 'document' : 'shell';
    const next = measureLanyard3dGeometry(shell, card, nextMode);
    if (!next) return;
    const previous = runtime.geometry;
    if (
      next.canvasWidth === previous.canvasWidth &&
      next.canvasHeight === previous.canvasHeight &&
      next.cardWidthPx === previous.cardWidthPx &&
      next.cardHeightPx === previous.cardHeightPx
    ) {
      return;
    }
    runtime.geometry = next;
    runtime.state = createLanyard3dRestState(next.config);
    canvasRect = null;
    host.style.top = `${next.anchorTopOffsetPx}px`;
    version += 1;
    rebuildTexture();
  }

  let geometryObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver === 'function') {
    geometryObserver = new ResizeObserver(remeasure);
    geometryObserver.observe(shell);
    geometryObserver.observe(document.documentElement);
    geometryObserver.observe(card);
  }

  // ---- Image load redraw ----------------------------------------------------

  const image = card.querySelector('img');
  const onImageLoad = () => {
    if (disposed) return;
    rebuildTexture();
  };
  image?.addEventListener('load', onImageLoad);

  // ---- Bootstrap ------------------------------------------------------------

  host.style.top = `${geometry.anchorTopOffsetPx}px`;
  shell.dataset.profileMotion = 'active';
  shell.dataset.profilePhase = phase;
  shell.dataset.profileDrag = 'idle';
  texture = buildTexture();
  render();

  const bridge: Lanyard3dBridge = {
    pause() {
      if (disposed) return;
      pausedByControl = true;
      applyPause();
    },
    resume() {
      if (disposed) return;
      pausedByControl = false;
      applyPause();
    },
    settle() {
      if (disposed) return;
      if (runtime.dragging) endDrag();
      runtime.state = createLanyard3dRestState(runtime.geometry.config);
      shell.dataset.profileMotion = 'static';
      setPhase('static');
      // With frameloop 'demand' a re-render paints the settled pose once.
      render();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      runtime.onFrame = null;
      runtime.target = null;
      observer?.disconnect();
      geometryObserver?.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      image?.removeEventListener('load', onImageLoad);
      hit.remove();
      texture?.dispose();
      texture = null;
      root.unmount();
      canvasHost.remove();
    },
  };

  return bridge;
}
