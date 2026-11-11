import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useMotionPreferences } from './MotionPreferences';
import { registerMotionAnimationControl } from './animationControls';
import {
  CONSTELLATION_LINKS,
  CONSTELLATION_MAX_LINK_DISTANCE,
  CONSTELLATION_NODES,
  CONSTELLATION_VIEWBOX,
  clampConstellationDpr,
  constellationBudgets,
  nodeDrift,
  pointerInfluence,
} from './constellationGeometry';

const MOBILE_QUERY = '(max-width: 767px)';
const FINE_POINTER_QUERY = '(pointer: fine)';
// Vsync timestamps are quantized (16.6ms instead of 16.7ms on a 60Hz display),
// so an exact `>= frameInterval` test drops whole frames. A small tolerance keeps
// the desktop 60 FPS ceiling from collapsing into an irregular 30 FPS cadence.
const FRAME_TOLERANCE_MS = 4;

function subscribeMobile(onChange: () => void) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const readMobile = () => window.matchMedia(MOBILE_QUERY).matches;
const readServerMobile = () => false;

export function ConstellationBackground() {
  const { hydrated, motionAllowed } = useMotionPreferences();
  const mobile = useSyncExternalStore(subscribeMobile, readMobile, readServerMobile);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!hydrated || !motionAllowed) {
      container.dataset.constellationMode = 'static';
      container.dataset.constellationPointer = 'off';
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas || typeof window.requestAnimationFrame !== 'function') {
      container.dataset.constellationMode = 'static';
      return;
    }

    let ctxValue: CanvasRenderingContext2D | null;
    try {
      ctxValue = canvas.getContext('2d');
    } catch {
      ctxValue = null;
    }
    if (!ctxValue) {
      container.dataset.constellationMode = 'static';
      container.dataset.constellationPointer = 'off';
      return;
    }
    const ctx = ctxValue;
    const finePointer = window.matchMedia(FINE_POINTER_QUERY).matches;
    container.dataset.constellationPointer = finePointer ? 'on' : 'off';

    const budgets = constellationBudgets(mobile);
    const frameInterval = 1000 / budgets.maxFps;

    let rafId = 0;
    let lastDraw = 0;
    let elapsed = 0;
    let disposed = false;
    let width = 0;
    let height = 0;
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let inView = true;
    let documentVisible = document.visibilityState !== 'hidden';
    let pointerTargetX = 0;
    let pointerTargetY = 0;
    let pointerX = 0;
    let pointerY = 0;
    let pointerActive = false;
    const rect = { left: 0, top: 0, width: 0, height: 0 };
    const screenX = new Array<number>(CONSTELLATION_NODES.length).fill(0);
    const screenY = new Array<number>(CONSTELLATION_NODES.length).fill(0);

    const canRun = () => !disposed && documentVisible && inView;

    function measure() {
      const bounds = container!.getBoundingClientRect();
      rect.left = bounds.left;
      rect.top = bounds.top;
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      rect.width = width;
      rect.height = height;
      const dpr = clampConstellationDpr(window.devicePixelRatio);
      const backingWidth = Math.round(width * dpr);
      const backingHeight = Math.round(height * dpr);
      if (canvas!.width !== backingWidth) canvas!.width = backingWidth;
      if (canvas!.height !== backingHeight) canvas!.height = backingHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scale = Math.min(width / CONSTELLATION_VIEWBOX.width, height / CONSTELLATION_VIEWBOX.height);
      offsetX = (width - CONSTELLATION_VIEWBOX.width * scale) / 2;
      offsetY = (height - CONSTELLATION_VIEWBOX.height * scale) / 2;
    }

    function drawFrame() {
      ctx.clearRect(0, 0, width, height);

      const pointerShiftX = pointerX;
      const pointerShiftY = pointerY;

      for (let index = 0; index < CONSTELLATION_NODES.length; index += 1) {
        const node = CONSTELLATION_NODES[index] as { x: number; y: number };
        const drift = nodeDrift(index, elapsed);
        screenX[index] = offsetX + (node.x + drift.x + pointerShiftX) * scale;
        screenY[index] = offsetY + (node.y + drift.y + pointerShiftY) * scale;
      }

      // The asterism path is built once, then layered: a soft, low-opacity
      // luminous underlay under a thin crisp core. Layered low-alpha strokes
      // read as celestial glow without a heavy network-graph look, and the
      // cost stays at three cheap strokes over one reused path.
      const path = new Path2D();
      for (let index = 0; index < CONSTELLATION_LINKS.length; index += 1) {
        const link = CONSTELLATION_LINKS[index] as readonly [number, number];
        const from = link[0];
        const to = link[1];
        const dx = (screenX[from] as number) - (screenX[to] as number);
        const dy = (screenY[from] as number) - (screenY[to] as number);
        if (Math.hypot(dx, dy) > CONSTELLATION_MAX_LINK_DISTANCE * scale) continue;
        path.moveTo(screenX[from] as number, screenY[from] as number);
        path.lineTo(screenX[to] as number, screenY[to] as number);
      }
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(138, 144, 154, 0.13)';
      ctx.lineWidth = Math.max(3, 3.4 * scale);
      ctx.stroke(path);
      ctx.strokeStyle = 'rgba(148, 154, 164, 0.19)';
      ctx.lineWidth = Math.max(1.6, 2 * scale);
      ctx.stroke(path);
      ctx.strokeStyle = 'rgba(176, 182, 192, 0.5)';
      ctx.lineWidth = Math.max(0.8, scale);
      ctx.stroke(path);

      // Concentric halo rings give each star a restrained layered glow;
      // per-node radius and haloWeight come from the traced magnitudes, so
      // prominent stars read brighter without any blur filters.
      for (let index = 0; index < screenX.length; index += 1) {
        const node = CONSTELLATION_NODES[index] as { radius: number; haloWeight: number };
        const radius = Math.max(2, node.radius * scale);
        const brightness = 0.5 + 0.5 * Math.sin(elapsed * 0.00035 + index * 0.85);
        const halo = node.haloWeight * (0.8 + 0.2 * brightness);
        const x = screenX[index] as number;
        const y = screenY[index] as number;
        ctx.fillStyle = `rgba(184, 192, 202, ${(0.1 * halo).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, radius * 2.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(188, 196, 206, ${(0.18 * halo).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, radius * 1.55, 0, Math.PI * 2);
        ctx.fill();
        const coreAlpha = (0.35 + 0.6 * node.haloWeight) * (0.85 + 0.3 * brightness);
        ctx.fillStyle = `rgba(200, 208, 218, ${Math.min(1, coreAlpha).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function stopLoop() {
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      lastDraw = 0;
    }

    function schedule() {
      if (rafId !== 0 || !canRun()) return;
      rafId = window.requestAnimationFrame(tick);
    }

    function tick(now: number) {
      rafId = 0;
      if (!canRun()) return;
      if (lastDraw === 0 || now - lastDraw >= frameInterval - FRAME_TOLERANCE_MS) {
        const delta = lastDraw === 0 ? 0 : now - lastDraw;
        elapsed += delta;
        lastDraw = now;

        const targetX = pointerActive ? pointerTargetX : 0;
        const targetY = pointerActive ? pointerTargetY : 0;
        pointerX += (targetX - pointerX) * 0.12;
        pointerY += (targetY - pointerY) * 0.12;

        drawFrame();
      }
      schedule();
    }

    function sync() {
      if (!canRun()) {
        stopLoop();
        pointerActive = false;
        return;
      }
      schedule();
    }

    function onPointerMove(event: PointerEvent) {
      if (!finePointer || !canRun()) return;
      const target = pointerInfluence(event.clientX, event.clientY, rect);
      pointerTargetX = target.x;
      pointerTargetY = target.y;
      pointerActive = target.inside;
    }

    function onVisibilityChange() {
      documentVisible = document.visibilityState !== 'hidden';
      if (!documentVisible) pointerActive = false;
      sync();
    }

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries)
            if (entry.target === container) inView = entry.isIntersecting;
          sync();
        },
        { rootMargin: '80px 0px' },
      );
      observer.observe(container);
    }

    function redrawAfterResize() {
      if (disposed || !canRun()) return;
      measure();
      drawFrame();
      sync();
    }

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(redrawAfterResize);
      resizeObserver.observe(container);
    } else {
      window.addEventListener('resize', redrawAfterResize, { passive: true });
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    if (finePointer) window.addEventListener('pointermove', onPointerMove, { passive: true });

    if (!canRun()) {
      container.dataset.constellationMode = 'static';
      return;
    }

    measure();
    drawFrame();
    container.dataset.constellationMode = 'canvas';
    schedule();

    const unregister = registerMotionAnimationControl({ stop: stopLoop });

    return () => {
      disposed = true;
      stopLoop();
      unregister();
      observer?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', redrawAfterResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pointermove', onPointerMove);
      container.dataset.constellationMode = 'static';
    };
  }, [hydrated, motionAllowed, mobile]);

  return (
    <div
      ref={containerRef}
      className="hero-motif"
      aria-hidden="true"
      data-constellation-mode="static"
    >
      <svg
        className="hero-motif-fallback"
        viewBox={`0 0 ${CONSTELLATION_VIEWBOX.width} ${CONSTELLATION_VIEWBOX.height}`}
        preserveAspectRatio="xMidYMid meet"
        focusable="false"
      >
        <g className="hero-motif-lines">
          {CONSTELLATION_LINKS.map(([from, to]) => {
            const start = CONSTELLATION_NODES[from];
            const end = CONSTELLATION_NODES[to];
            const key = `${from}-${to}`;
            return (
              <g key={key}>
                <line
                  className="hero-motif-line-glow"
                  x1={start?.x ?? 0}
                  y1={start?.y ?? 0}
                  x2={end?.x ?? 0}
                  y2={end?.y ?? 0}
                />
                <line x1={start?.x ?? 0} y1={start?.y ?? 0} x2={end?.x ?? 0} y2={end?.y ?? 0} />
              </g>
            );
          })}
        </g>
        {CONSTELLATION_NODES.map((node, index) => (
          <g key={`star-${index}`}>
            <circle
              className="hero-motif-star-halo"
              cx={node.x}
              cy={node.y}
              r={(node.radius * 2.6).toFixed(2)}
            />
            <circle cx={node.x} cy={node.y} r={node.radius} />
          </g>
        ))}
      </svg>
      <canvas ref={canvasRef} className="hero-motif-canvas" />
    </div>
  );
}
