import { useEffect, useRef, useState } from 'react';
import type { PublicProject } from '../../../scripts/content/schema';
import { useMotionPreferences } from '../motion/MotionPreferences';
import {
  loadCarouselRuntime,
  type CarouselHandle,
  type CarouselRuntime,
} from '../motion/carouselRuntime';

type Screenshot = PublicProject['screenshots'][number];
type RuntimeState = 'idle' | 'ready' | 'unavailable';

/** Dev-only navigation hook for E2E dimension tests; dead-code-eliminated in builds. */
function setDebugHook(handle: CarouselHandle | null): void {
  if (import.meta.env.DEV) {
    (window as unknown as { __carouselDebugGoto?: CarouselHandle['goto'] }).__carouselDebugGoto = (
      index,
      delta,
    ) => handle?.goto(index, delta);
  }
}

export function ProjectMedia({ screenshots, label }: { screenshots: Screenshot[]; label: string }) {
  const [failed, setFailed] = useState<string[]>([]);
  const [runtime, setRuntime] = useState<RuntimeState>('idle');
  const { motionAllowed } = useMotionPreferences();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const runtimeModuleRef = useRef<CarouselRuntime | null>(null);
  const handleRef = useRef<CarouselHandle | null>(null);
  const autoplayAllowedRef = useRef(false);

  useEffect(() => {
    autoplayAllowedRef.current = motionAllowed;
    // A preferences flip mid-run must halt the chain immediately (and its
    // release restart it fresh). The handle may not exist yet while the
    // runtime chunk is still loading; the attach effect picks up the ref's
    // current value anyway.
    handleRef.current?.notifyGate();
  }, [motionAllowed]);

  const available = screenshots.filter((image) => !failed.includes(image.assetPath));
  const first = available[0];
  const last = available[available.length - 1];
  const multiple = available.length > 1;
  const carouselOn = runtime === 'ready' && multiple;
  const availablePaths = available.map((image) => image.assetPath).join('\n');

  useEffect(() => {
    if (!multiple) return;
    let alive = true;
    loadCarouselRuntime()
      .then((runtimeModule) => {
        if (!alive) return;
        runtimeModuleRef.current = runtimeModule;
        setRuntime('ready');
      })
      .catch(() => {
        if (alive) setRuntime('unavailable');
      });
    return () => {
      alive = false;
    };
  }, [multiple]);

  useEffect(() => {
    if (!carouselOn) return;
    const runtimeModule = runtimeModuleRef.current;
    const root = rootRef.current;
    if (!runtimeModule || !root) return;
    const handle = runtimeModule.activateCarousel(root, {
      count: available.length,
      isAutoplayAllowed: () => autoplayAllowedRef.current,
      // Manual navigation only: the live region names the new slide in
      // 1-based human numbering. Autoplay advances silently.
      announceManual: (index, count, alt) => {
        const status = root.querySelector('[data-carousel-status]');
        if (status) status.textContent = `Slide ${index + 1} of ${count}: ${alt}`;
      },
      // Every position change — manual or silent autoplay — mirrors the
      // active screenshot's description into the visible caption.
      showCaption: (alt) => {
        const caption = root.querySelector('[data-carousel-caption]');
        if (caption) caption.textContent = alt;
      },
    });
    handleRef.current = handle;
    setDebugHook(handle);
    return () => {
      handle.teardown();
      handleRef.current = null;
    };
  }, [carouselOn, available.length, availablePaths]);

  if (!first) return <p className="project-media-empty">Screenshots pending</p>;

  const markFailed = (assetPath: string) => {
    setFailed((paths) => (paths.includes(assetPath) ? paths : [...paths, assetPath]));
  };
  const failRef = (assetPath: string) => (element: HTMLImageElement | null) => {
    if (element?.complete && element.naturalWidth === 0) markFailed(assetPath);
  };
  const image = (shot: Screenshot) => (
    <img
      src={`/media/${shot.assetPath}`}
      alt={shot.alt}
      width={shot.width}
      height={shot.height}
      loading="lazy"
      decoding="async"
      ref={failRef(shot.assetPath)}
      onError={() => markFailed(shot.assetPath)}
    />
  );

  // Pre-runtime (and no-JS, and degraded-runtime) state: exactly one honest
  // screenshot, no track, no dots, no live region — nothing inaccessible.
  if (!carouselOn) {
    return (
      <div className="project-media" role="group" aria-label={label}>
        <figure className="project-media-figure">
          {image(first)}
          {first.caption && <figcaption>{first.caption}</figcaption>}
        </figure>
      </div>
    );
  }

  // Stable viewport: the figure keeps the widest slide's aspect ratio, so
  // slides letterbox with contain instead of cropping or shifting the box.
  const widest = available.reduce((best, shot) =>
    shot.width / shot.height > best.width / best.height ? shot : best,
  );
  return (
    <div
      ref={rootRef}
      className="project-media"
      role="group"
      aria-label={label}
      data-carousel-count={available.length}
    >
      <figure
        className="project-media-figure"
        style={{ aspectRatio: `${widest.width} / ${widest.height}` }}
        tabIndex={0}
      >
        <div className="project-media-track" data-carousel-track="">
          {carouselOn && last && (
            /* Seamless wrap support, start side: a visual copy of the last
               slide that the controller animates onto during the
               first→last wrap, then silently swaps for the real last slide.
               Permanently outside the accessibility tree, so it never holds
               focus or AT attention. */
            <div
              className="project-media-slide"
              data-carousel-slide=""
              data-carousel-clone="true"
              aria-hidden="true"
            >
              <img
                src={`/media/${last.assetPath}`}
                alt=""
                width={last.width}
                height={last.height}
                loading="lazy"
                decoding="async"
              />
            </div>
          )}
          {available.map((shot, position) => (
            <div
              key={shot.assetPath}
              className="project-media-slide"
              data-carousel-slide=""
              role="group"
              aria-roledescription="slide"
              aria-label={`${position + 1} of ${available.length}`}
              aria-hidden={position !== 0 ? 'true' : undefined}
            >
              {image(shot)}
              {shot.caption && <figcaption>{shot.caption}</figcaption>}
            </div>
          ))}
          {available.length > 1 && (
            /* Seamless wrap support, end side: a visual copy of slide 1 the
               controller animates onto during the last→first wrap, then
               silently swaps for the real slide 1. Permanently outside the
               accessibility tree, so it never holds focus or AT attention. */
            <div
              className="project-media-slide"
              data-carousel-slide=""
              data-carousel-clone="true"
              aria-hidden="true"
            >
              <img
                src={`/media/${first.assetPath}`}
                alt=""
                width={first.width}
                height={first.height}
                loading="lazy"
                decoding="async"
              />
            </div>
          )}
        </div>
      </figure>
      <div className="project-media-dots">
        {available.map((shot, position) => (
          <button
            key={shot.assetPath}
            type="button"
            data-carousel-dot={position}
            aria-label={`Go to slide ${position + 1}: ${shot.alt}`}
          />
        ))}
      </div>
      <p className="project-media-caption" data-carousel-caption="">
        {first.alt}
      </p>
      <p className="project-media-status" aria-live="polite" data-carousel-status="" />
    </div>
  );
}
