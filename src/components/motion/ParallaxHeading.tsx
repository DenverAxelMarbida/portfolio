import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { useMotionPreferences } from './MotionPreferences';
import {
  HEADING_DEFAULT_OPACITY_START,
  HEADING_DEFAULT_RANGE_PX,
  headingDepthRamp,
  headingEntryProgress,
  headingRampSettles,
} from './parallaxDepth';

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

/**
 * Per-document settle latch for the entry ramp, keyed by heading element so
 * it survives preference flips and effect re-runs (a pause/resume or viewport
 * change mid-page must not replay the ramp on a heading the visitor already
 * scrolled past — the same once-per-document rule the reveal waves use).
 */
const settledHeadings = new WeakSet<HTMLHeadingElement>();

interface ParallaxHeadingProps extends HTMLAttributes<HTMLElement> {
  /** Semantic heading level; all h1–h6 map to HTMLHeadingElement refs. */
  as?: HeadingTag;
  children: ReactNode;
  /** Rise distance in px; the heading sits this far below its layout position while entering. */
  translateRange?: number;
  /** Opacity when the heading first enters the viewport. */
  opacityStart?: number;
}

/**
 * CP7 T4 heading micro-depth: the heading emerges slightly below its layout
 * position and faded as it enters the viewport, and settles at the exact
 * natural state once its top reaches the viewport top. The scroll-driven
 * `translate3d`/`opacity` live on a dedicated inner layer element, not on the
 * heading itself — the reveal cascade animates the heading's own
 * opacity/transform (`section-reveal-rise`), so a shared property would fight
 * the animation. The two effects compose without interfering.
 *
 * Native scroll is untouched (passive listener, no hijack); reduced motion,
 * pause and pre-hydration render the plain static heading.
 */
export function ParallaxHeading({
  as: Tag = 'h2',
  children,
  translateRange = HEADING_DEFAULT_RANGE_PX,
  opacityStart = HEADING_DEFAULT_OPACITY_START,
  ...rest
}: ParallaxHeadingProps) {
  const { motionAllowed } = useMotionPreferences();
  const enabled = motionAllowed;
  const tagRef = useRef<HTMLHeadingElement | null>(null);
  const layerRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const tag = tagRef.current;
    const layer = layerRef.current;
    if (!tag || !layer) return;

    if (!enabled) {
      // Reduced motion / pause pin the offset to 0: clearing the inline
      // properties restores the exact natural layout in one step.
      layer.style.transform = '';
      layer.style.opacity = '';
      layer.style.willChange = '';
      return;
    }

    // One-shot entry ramp (CP7 T4 final refinement): the latch is per
    // document (WeakSet on the heading), so preference flips and effect
    // re-runs never replay a ramp the visitor already completed, and a
    // settled heading never re-applies the downward offset when scrolling
    // back up. A heading already at or past the entry line needs no listener
    // at all — the exact natural state is final.
    let settled =
      settledHeadings.has(tag) ||
      headingRampSettles(tag.getBoundingClientRect().top, window.innerHeight);
    if (settled) {
      settledHeadings.add(tag);
      layer.style.transform = '';
      layer.style.opacity = '';
      layer.style.willChange = '';
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      // Measured on the heading itself: the layer's transform never affects
      // layout, so the rect stays valid while the layer is displaced.
      const top = tag.getBoundingClientRect().top;
      if (settled || settledHeadings.has(tag) || headingRampSettles(top, window.innerHeight)) {
        settled = true;
        settledHeadings.add(tag);
        layer.style.transform = '';
        layer.style.opacity = '';
        layer.style.willChange = '';
        return;
      }
      const progress = headingEntryProgress(top, window.innerHeight);
      const { y, opacity } = headingDepthRamp(progress, translateRange, opacityStart);
      layer.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
      layer.style.opacity = opacity.toFixed(3);
    };
    // One measurement per frame: the scroll listener only schedules.
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };
    const onScroll = () => schedule();

    layer.style.willChange = 'transform, opacity';
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [enabled, translateRange, opacityStart]);

  return (
    <Tag ref={tagRef} {...rest}>
      {/* display:block stays unconditional (SSR included) so the pre/post
          hydration layout is identical; block display also lets the transform
          apply, which non-replaced inline elements ignore. */}
      <span ref={layerRef} style={{ display: 'block' }}>
        {children}
      </span>
    </Tag>
  );
}
