import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useMotionPreferences } from './MotionPreferences';
import { registerMotionAnimationControl } from './animationControls';
import {
  ASCENT_SPEED_PX_PER_MS,
  advanceAscent,
  createMeteorClock,
  meteorEnvelope,
  meteorGeometry,
  meteorHeadAlpha,
  meteorHeadTravel,
  meteorProgress,
  meteorStreakShare,
  meteorTrailLengthPx,
  updateMeteorClock,
  wrapPageY,
  type MeteorClock,
} from './starfieldSky';

interface ScreenPoint {
  x: number;
  y: number;
}

interface Star {
  x: number;
  y: number;
  radius: number;
  /** Brighter, larger tier with a soft halo (~15% of stars, per the reference). */
  luster: boolean;
  clusterId: number;
  phase: number;
  pulseSpeed: number;
  driftSpeed: number;
  driftRadius: number;
  _screen?: ScreenPoint;
}

const MOBILE_QUERY = '(max-width: 767px)';
const FINE_POINTER_QUERY = '(pointer: fine)';
// Vsync timestamps are quantized (16.6ms instead of 16.7ms on a 60Hz display),
// so an exact `>= frameInterval` test drops whole frames. A small tolerance keeps
// the idle cap stable without drawing faster than the intended ceiling.
const FRAME_TOLERANCE_MS = 4;

function subscribeMobile(onChange: () => void) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const readMobile = () => window.matchMedia(MOBILE_QUERY).matches;
const readServerMobile = () => false;

export function PageStarfieldBackground() {
  const { hydrated, motionAllowed } = useMotionPreferences();
  const mobile = useSyncExternalStore(subscribeMobile, readMobile, readServerMobile);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Hoisted function declarations below (drawFrame, paintSkyTelemetry)
    // cannot rely on the narrowing above, so the checked reference is
    // captured as its own constant.
    const canvasHost = container;

    if (!hydrated || !motionAllowed) {
      container.dataset.pageStarfieldMode = 'static';
      container.dataset.pageStarfieldPointer = 'off';
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas || typeof window.requestAnimationFrame !== 'function') {
      container.dataset.pageStarfieldMode = 'static';
      return;
    }

    let ctxValue: CanvasRenderingContext2D | null;
    try {
      ctxValue = canvas.getContext('2d');
    } catch {
      ctxValue = null;
    }
    if (!ctxValue) {
      container.dataset.pageStarfieldMode = 'static';
      container.dataset.pageStarfieldPointer = 'off';
      return;
    }
    const ctx = ctxValue;
    const finePointer = window.matchMedia(FINE_POINTER_QUERY).matches;
    container.dataset.pageStarfieldPointer = finePointer ? 'on' : 'off';

    const maxFps = mobile ? 20 : 30;
    const frameInterval = 1000 / maxFps;

    let stars: Star[] = [];
    let rafId = 0;
    let lastDraw = 0;
    // Infinite ascent and the meteor clock both run on consumed elapsed time,
    // so a paused or hidden loop never accrues animation time.
    let ascentY = 0;
    let meteors: MeteorClock = createMeteorClock(0, 0);
    let meteorCount = 0;
    let lastAscentAttr = '-1';
    let lastMeteorCountAttr = '-1';
    let lastMeteorActiveAttr = '-1';
    let lastScrollY = -1;
    let elapsed = 0;
    let disposed = false;
    let width = 0;
    let height = 0;
    let pageHeight = 0;
    let documentVisible = document.visibilityState !== 'hidden';
    let pointerActive = false;
    let pointerX = 0;
    let pointerTargetX = 0;
    let pointerY = 0;
    let pointerTargetY = 0;
    const inViewport = true;
    let pageDpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const canRun = () => !disposed && documentVisible && inViewport;

    function seeded(index: number, salt: number): number {
      const value = Math.sin((index + 1) * 97.7 + salt * 131.1) * 43758.5453123;
      return value - Math.floor(value);
    }

    function rebuild() {
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
      pageHeight = Math.max(height, document.documentElement.scrollHeight || height);
      pageDpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const backingWidth = Math.round(width * pageDpr);
      const backingHeight = Math.round(height * pageDpr);
      if (canvas!.width !== backingWidth) canvas!.width = backingWidth;
      if (canvas!.height !== backingHeight) canvas!.height = backingHeight;
      ctx.setTransform(pageDpr, 0, 0, pageDpr, 0, 0);

      // CP4.5-B approved density: roughly 60–90 stars visible per desktop
      // viewport (~1 per 16000 px² of page area), lighter on mobile. Star
      // positions stay page-anchored so scroll projection and culling are
      // unchanged.
      const minCount = mobile ? 40 : 60;
      const maxCount = mobile ? 180 : 520;
      const perStarArea = mobile ? 9000 : 16000;
      const count = Math.round(
        Math.min(maxCount, Math.max(minCount, (width * pageHeight) / perStarArea)),
      );
      const clusterCount = mobile ? 7 : 12;
      const result: Star[] = [];

      let starIndex = 0;
      for (let cluster = 0; cluster < clusterCount; cluster += 1) {
        const clusterX = seeded(cluster, 17);
        const clusterPage = seeded(cluster, 31) * pageHeight;
        const members = 2 + Math.floor(seeded(cluster, 43) * 3);
        for (let member = 0; member < members; member += 1) {
          // ~15% of stars form a brighter, larger luster tier with a soft
          // halo, echoing the reference's few bigger dot glows.
          const luster = seeded(starIndex, 83) < 0.15;
          result.push({
            x: clusterX * width + seeded(starIndex, 7) * 32 - 16,
            y: clusterPage + seeded(starIndex, 9) * 32 - 16,
            radius: luster ? 1.2 + seeded(starIndex, 11) * 1.0 : 0.7 + seeded(starIndex, 11) * 1.0,
            luster,
            clusterId: cluster,
            phase: seeded(starIndex, 13) * Math.PI * 2,
            // Twinkle periods of ~1–2.5s (2π / pulseSpeed), matching the
            // reference's quick flicker.
            pulseSpeed: 0.0025 + seeded(starIndex, 19) * 0.0055,
            driftSpeed: 0.00012 + seeded(starIndex, 23) * 0.00016,
            driftRadius: 10 + seeded(starIndex, 29) * 14,
          });
          starIndex += 1;
        }
      }

      const remainder = Math.max(0, count - result.length);
      for (let index = 0; index < remainder; index += 1) {
        const luster = seeded(starIndex, 84) < 0.15;
        result.push({
          x: seeded(starIndex, 47) * width,
          y: seeded(starIndex, 51) * pageHeight,
          radius: luster ? 1.2 + seeded(starIndex, 53) * 1.0 : 0.7 + seeded(starIndex, 53) * 1.0,
          luster,
          clusterId: -1,
          phase: seeded(starIndex, 59) * Math.PI * 2,
          pulseSpeed: 0.0025 + seeded(starIndex, 61) * 0.0055,
          driftSpeed: 0.0001 + seeded(starIndex, 67) * 0.00014,
          driftRadius: 7 + seeded(starIndex, 71) * 11,
        });
        starIndex += 1;
      }

      stars = result;
      lastScrollY = window.scrollY || 0;
      drawFrame(lastScrollY);
    }

    function drawFrame(scrollY: number) {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#b8c0ca';
      ctx.strokeStyle = 'rgba(113, 119, 128, 0.18)';
      ctx.lineWidth = 0.8;

      const clusters = new Map<number, Star[]>();
      for (const star of stars) {
        // The ascent offset wraps inside the page span, so a star leaving the
        // page top recycles from the page bottom without any visible
        // discontinuity.
        const pageY = wrapPageY(star.y - ascentY, pageHeight);
        const screenY = pageY - scrollY;
        if (screenY < -24 || screenY > height + 24) continue;
        const starScreenX =
          star.x +
          Math.sin(elapsed * star.driftSpeed + star.phase) * star.driftRadius +
          pointerX * 0.35;
        const starScreenY =
          screenY +
          Math.cos(elapsed * star.driftSpeed + star.phase * 0.7) * (star.driftRadius * 0.35) +
          pointerY * 0.2;
        if (star.clusterId < 0) {
          const alpha =
            0.42 + 0.28 * (0.5 + 0.5 * Math.sin(elapsed * star.pulseSpeed + star.phase));
          ctx.fillStyle = star.luster ? '#c9d1dc' : '#b8c0ca';
          if (star.luster) {
            // Soft halo behind the brighter luster core — a cheap layered
            // draw, no shadowBlur.
            ctx.globalAlpha = alpha * 0.22;
            ctx.beginPath();
            ctx.arc(starScreenX, starScreenY, star.radius * 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(starScreenX, starScreenY, star.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          const group = clusters.get(star.clusterId);
          if (group) group.push(star);
          else clusters.set(star.clusterId, [star]);
          star._screen = { x: starScreenX, y: starScreenY };
        }
      }

      for (const group of clusters.values()) {
        if (group.length < 2) continue;
        // CP4.5-D visible glow: the path is built once and stroked in three
        // cheap layered passes — a wide soft halo, a mid bloom, and a crisp
        // core. The stroke owns a full-alpha color; each pass dims through
        // globalAlpha only, so the halo is actually perceptible (CP4.5-C's
        // stacked rgba(…,0.18) style rendered the glow near-invisible).
        ctx.strokeStyle = '#c9d1dc';
        ctx.beginPath();
        let first = true;
        for (let index = 0; index < group.length - 1; index += 1) {
          const a = group[index]!;
          const b = group[index + 1]!;
          if (!a._screen || !b._screen) {
            continue;
          }
          if (first) {
            ctx.moveTo(a?._screen?.x ?? 0, a?._screen?.y ?? 0);
            first = false;
          }
          ctx.lineTo(b?._screen?.x ?? 0, b?._screen?.y ?? 0);
        }
        ctx.globalAlpha = 0.1;
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.globalAlpha = 0.18;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 0.9;
        ctx.stroke();
        ctx.globalAlpha = 1;

        for (const star of group) {
          if (!star._screen) continue;
          const alpha =
            0.52 + 0.32 * (0.5 + 0.5 * Math.sin(elapsed * star.pulseSpeed + star.phase));
          ctx.fillStyle = star.luster ? '#c9d1dc' : '#b8c0ca';
          // CP4.5-D soft two-ring halo around every cluster star, layered
          // under the core; same cheap concentric-arc approach as before,
          // with a visible mid ring instead of one barely-there wash.
          ctx.globalAlpha = alpha * 0.14;
          ctx.beginPath();
          ctx.arc(star._screen.x, star._screen.y, (star.radius + 0.4) * 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = alpha * 0.3;
          ctx.beginPath();
          ctx.arc(star._screen.x, star._screen.y, (star.radius + 0.4) * 2.4, 0, Math.PI * 2);
          ctx.fill();
          if (star.luster) {
            ctx.globalAlpha = alpha * 0.3;
            ctx.beginPath();
            ctx.arc(star._screen.x, star._screen.y, star.radius * 2.6, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(star._screen.x, star._screen.y, star.radius + 0.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      drawMeteor();
      paintSkyTelemetry(canvasHost);
    }

    function drawMeteor() {
      const meteor = meteors.active;
      if (!meteor) return;
      const progress = meteorProgress(meteor, elapsed);
      const envelope = meteorEnvelope(progress);
      if (envelope <= 0) return;

      const { startX, startY, endX, endY } = meteor.geometry;
      // CP4.5-C cinematic flight: the whole comet translates continuously
      // along its heading (travel can exceed 1, so it passes through the
      // original trail end and exits the edge), while the visible streak
      // grows in over the first quarter of the life and trails the head.
      const travel = meteorHeadTravel(progress);
      const dirX = endX - startX;
      const dirY = endY - startY;
      const headX = startX + dirX * travel;
      const headY = startY + dirY * travel;
      // The tail never precedes the origin before the head has cleared it.
      const tailFactor = Math.min(meteorStreakShare(progress), travel);
      const tailX = headX - dirX * tailFactor;
      const tailY = headY - dirY * tailFactor;

      // Near-white head fading smoothly to a transparent tail along the
      // streak itself.
      const gradient = ctx.createLinearGradient(tailX, tailY, headX, headY);
      gradient.addColorStop(0, 'rgba(184, 192, 202, 0)');
      gradient.addColorStop(0.55, `rgba(196, 203, 213, ${(0.35 * envelope).toFixed(3)})`);
      gradient.addColorStop(1, `rgba(225, 230, 238, ${(0.92 * envelope).toFixed(3)})`);

      // Lightweight layered-stroke glow: three passes over one shared path
      // instead of an expensive shadowBlur. Thicknesses are ~30% under the
      // CP4.5-B values for a finer cinematic streak.
      ctx.strokeStyle = gradient;
      ctx.lineCap = 'round';
      const layers: Array<[number, number]> = [
        [3.4, 0.18],
        [1.7, 0.45],
        [0.7, 1],
      ];
      for (const [layerWidth, layerAlpha] of layers) {
        ctx.lineWidth = layerWidth;
        ctx.globalAlpha = layerAlpha;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(headX, headY);
        ctx.stroke();
      }

      const headAlpha = meteorHeadAlpha(progress);
      if (headAlpha > 0) {
        ctx.globalAlpha = headAlpha;
        ctx.fillStyle = '#e6ebf2';
        ctx.beginPath();
        ctx.arc(headX, headY, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.lineCap = 'butt';
    }

    function stepSky() {
      const hadActive = meteors.active !== null;
      meteors = updateMeteorClock(meteors, elapsed, {
        gapRoll: Math.random(),
        lifetimeRoll: Math.random(),
        geometry: meteorGeometry({
          // CP4.5-C: spawns biased along the upper band so the +travel streak
          // glides toward and through the right edge instead of landing mid-
          // canvas; generous right margin of start gives room to exit.
          startX: width * (0.25 + Math.random() * 0.7),
          startY: height * (0.03 + Math.random() * 0.52),
          directionRoll: Math.random(),
          angleRoll: Math.random(),
          trailLengthPx: meteorTrailLengthPx(height, Math.random()),
        }),
      });
      if (meteors.active && !hadActive) meteorCount += 1;
    }

    function paintSkyTelemetry(target: HTMLDivElement) {
      const ascentAttr = String(Math.round(ascentY));
      if (ascentAttr !== lastAscentAttr) {
        lastAscentAttr = ascentAttr;
        target.dataset.pageStarfieldAscent = ascentAttr;
      }
      const countAttr = String(meteorCount);
      if (countAttr !== lastMeteorCountAttr) {
        lastMeteorCountAttr = countAttr;
        target.dataset.pageStarfieldMeteors = countAttr;
      }
      const activeAttr =
        meteors.active && meteorProgress(meteors.active, elapsed) !== null ? '1' : '0';
      if (activeAttr !== lastMeteorActiveAttr) {
        lastMeteorActiveAttr = activeAttr;
        target.dataset.pageStarfieldMeteor = activeAttr;
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

      const scrollY = window.scrollY || 0;
      const scrollChanged = scrollY !== lastScrollY;
      // Stars sit at fixed page positions, so their viewport projection must
      // follow scroll changes on every vsync. Idle twinkle stays throttled.
      if (scrollChanged || lastDraw === 0 || now - lastDraw >= frameInterval - FRAME_TOLERANCE_MS) {
        const delta = lastDraw === 0 ? 0 : now - lastDraw;
        elapsed += delta;
        // The ascent consumes exactly the loop's own elapsed interval: a
        // resumed frame after a frozen loop has delta 0 (see stopLoop), so a
        // hidden or paused page neither accrues time nor jumps on return.
        ascentY = advanceAscent(ascentY, delta, ASCENT_SPEED_PX_PER_MS, pageHeight);
        stepSky();
        lastDraw = now;
        lastScrollY = scrollY;

        const targetX = pointerActive ? pointerTargetX : 0;
        const targetY = pointerActive ? pointerTargetY : 0;
        pointerX += (targetX - pointerX) * 0.1;
        pointerY += (targetY - pointerY) * 0.1;

        drawFrame(scrollY);
      }
      schedule();
    }

    function onPointerMove(event: PointerEvent) {
      if (!finePointer || !canRun()) return;
      pointerTargetX = (event.clientX / Math.max(1, width) - 0.5) * 2 * 14;
      pointerTargetY = (event.clientY / Math.max(1, height) - 0.5) * 2 * 9;
      pointerActive = true;
    }

    function onVisibilityChange() {
      documentVisible = document.visibilityState !== 'hidden';
      if (!documentVisible) pointerActive = false;
      if (canRun()) schedule();
      else stopLoop();
    }

    function onResize() {
      if (disposed) return;
      rebuild();
      if (canRun()) schedule();
    }

    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
    if (observer) observer.observe(document.documentElement);

    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (finePointer) window.addEventListener('pointermove', onPointerMove, { passive: true });

    rebuild();
    container.dataset.pageStarfieldMode = 'canvas';
    schedule();

    const unregister = registerMotionAnimationControl({ stop: stopLoop });

    return () => {
      disposed = true;
      stopLoop();
      unregister();
      if (observer) observer.disconnect();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pointermove', onPointerMove);
      container.dataset.pageStarfieldMode = 'static';
    };
  }, [hydrated, motionAllowed, mobile]);

  return (
    <div
      ref={containerRef}
      className="page-starfield"
      aria-hidden="true"
      data-page-starfield-mode="static"
    >
      <canvas ref={canvasRef} className="page-starfield-canvas" />
    </div>
  );
}
