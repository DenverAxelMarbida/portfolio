/**
 * CP7 T4 scroll-depth policy, kept pure and deterministic like the rest of
 * the motion policy modules (starfieldSky, constellationGeometry, revealPolicy).
 * The component loops and scroll listeners feed these helpers the live scroll
 * position or element rect; the helpers never read state themselves.
 *
 * Layers travel slower than the native content scroll:
 *   page starfield 0.5x, hero constellation 0.7x, section content 1x.
 *
 * Every offset is additive to the existing 1x projection, so switching the
 * offset off (reduced motion, pause) restores the exact native layout.
 */

/** Starfield layer: stars travel at 0.5x the native scroll speed. */
export const STARFIELD_DEPTH_FACTOR = 0.5;

/** Constellation layer: the figure travels at 0.7x the native scroll speed. */
export const CONSTELLATION_DEPTH_FACTOR = 0.7;

/**
 * Heading micro-depth: default rise distance and starting opacity.
 * The opacity start doubles as the heading's static below-fold state, which
 * axe samples for color contrast. Against the page background it composites
 * to 4.93:1 — clearing the 4.5:1 threshold the 20px semibold h3s are judged
 * at (0.3 would composite to 2.44:1, 0.4 to 3.67:1 — both failures).
 */
export const HEADING_DEFAULT_RANGE_PX = 40;
export const HEADING_DEFAULT_OPACITY_START = 0.5;

/**
 * Additive offset for the page starfield projection. The canvas paints
 * page-anchored stars at `pageY - scrollY`; adding `factor * scrollY` makes
 * them travel at (1 - factor)x the content speed. Stars span the whole page,
 * so no cap is needed.
 */
export function starfieldDepthOffset(scrollY: number): number {
  return scrollY * STARFIELD_DEPTH_FACTOR;
}

/**
 * Additive offset for the hero constellation canvas, which itself scrolls with
 * the page at native speed: painting its nodes lower by the *complement* of
 * the target factor (1 - 0.7 = 0.3) makes the figure travel at 0.7x. The
 * offset is capped at the canvas height so the figure stays inside its
 * overflow-hidden canvas instead of sliding out of view while the hero is
 * still on screen; past the cap the figure travels natively with the panel.
 */
export function constellationDepthOffset(scrollY: number, capPx: number): number {
  const clampedScroll = Math.min(Math.max(scrollY, 0), Math.max(0, capPx));
  return clampedScroll * (1 - CONSTELLATION_DEPTH_FACTOR);
}

/**
 * One-shot settle latch for the heading micro-depth ramp: the ramp plays only
 * while the heading first enters the viewport (top below the viewport top).
 * Once the heading's top reaches the viewport top the ramp is settled for
 * good — scrolling back up must never re-engage the downward offset, which
 * would visually sink the heading toward the content below it and make the
 * heading-to-content spacing drift with the scroll direction (CP7 T4 final
 * refinement, the owner's up/down spacing defect). A degenerate viewport
 * (height 0) counts as settled, matching `headingEntryProgress`.
 */
export function headingRampSettles(top: number, viewportHeight: number): boolean {
  return viewportHeight <= 0 || top <= 0;
}

/**
 * Entry progress of a heading within its first viewport: 0 when the heading
 * top sits at the viewport bottom edge (just entering) and 1 when the heading
 * top reaches the viewport top. Headings below the fold and already scrolled
 * past clamp to the ends, so the ramp only ever runs during entry.
 */
export function headingEntryProgress(top: number, viewportHeight: number): number {
  if (viewportHeight <= 0) return 1;
  const progress = (viewportHeight - top) / viewportHeight;
  return Math.min(1, Math.max(0, progress));
}

export interface HeadingDepth {
  /** Downward offset in px at layout time; 0 once the heading has entered. */
  y: number;
  /** Opacity ramp from `opacityStart` at entry to 1 when settled. */
  opacity: number;
}

/**
 * Linear micro-depth ramp for a section heading: it emerges slightly below
 * its layout position and faded, and settles at the exact natural state.
 * Progress outside [0, 1] clamps, so scrolled-past headings stay settled.
 */
export function headingDepthRamp(
  progress: number,
  rangePx: number,
  opacityStart: number,
): HeadingDepth {
  const clamped = Math.min(1, Math.max(0, progress));
  return {
    y: (1 - clamped) * rangePx,
    opacity: opacityStart + (1 - opacityStart) * clamped,
  };
}
