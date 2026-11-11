/**
 * Pure interaction policy for the CP5-S.1 screenshot carousel. Timing,
 * thresholds and wrap math live here so unit tests pin owner-approved values
 * without a browser; the deferred controller (`carouselClient.ts`) consumes
 * these exports and adds no constants of its own.
 */

/** Autoplay gap between slide advances, owner-approved 2026-11-11. */
export const AUTOPLAY_GAP_MS = 3800;

/**
 * Extra initial delay per same-page carousel attach order (0, 1, 2, …), so
 * simultaneously mounted homepage carousels do not advance in lockstep. The
 * recurring interval is unchanged: only the very first countdown of each
 * chain is shifted (owner-approved 2026-11-11).
 */
export const AUTOPLAY_STAGGER_MS = 350;

/** Pointer travel (px) beyond which a gesture is a drag, not a click. */
export const DRAG_INTENT_PX = 10;

/** Fraction of the media box width a drag must cover before it commits. */
export const DRAG_COMMIT_WIDTH_FRACTION = 0.25;

/** Release velocity (px/s) that commits a swipe regardless of drag distance. */
export const DRAG_COMMIT_VELOCITY_PX_S = 500;

/** Wrapping index step: `nextIndex(last, count, 1)` is 0, `nextIndex(0, count, -1)` is last. */
export function nextIndex(index: number, count: number, delta: 1 | -1): number {
  return (((index + delta) % count) + count) % count;
}

/**
 * Decides what a pointer release means. Commits when the drag crossed the
 * width fraction OR the release velocity alone is a flick; direction follows
 * the drag direction, never the velocity sign on its own.
 */
export function swipeDecision(dxPx: number, boxWidth: number, velocityPxPerS: number): 1 | -1 | 0 {
  const distanceCommitted = Math.abs(dxPx) >= DRAG_COMMIT_WIDTH_FRACTION * boxWidth;
  const velocityCommitted = Math.abs(velocityPxPerS) >= DRAG_COMMIT_VELOCITY_PX_S;
  if (!distanceCommitted && !velocityCommitted) return 0;
  return dxPx > 0 ? 1 : -1;
}

/** True when the pointer moved far enough that a click was really a drag. */
export function shouldSuppressClick(draggedPx: number): boolean {
  return Math.abs(draggedPx) >= DRAG_INTENT_PX;
}
