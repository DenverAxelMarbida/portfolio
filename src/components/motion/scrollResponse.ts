/**
 * CP7 T5 scroll-response policy, kept pure and deterministic like the other
 * motion policy modules (starfieldSky, constellationGeometry, parallaxDepth).
 *
 * T4's depth offsets translate the layers with the scroll position; these
 * helpers additionally convert scroll *velocity* into a bounded response
 * level (0..1) that subtly modulates twinkle brightness and, for the page
 * starfield, the drift swing. The loops feed the helpers explicit frame
 * facts (scroll positions, frame delta); the helpers never read state.
 *
 * Velocity is only ever computed on frames with a positive delta, so a
 * paused or hidden loop — whose resumed frame has delta 0 (see stopLoop) —
 * cannot produce a velocity spike, and the level decays back to zero when
 * scrolling stops. Reduced-motion and paused pages never enter the canvas
 * loop at all, so the modulation stays off there by construction.
 */

/** Full response is reached at ~1.2 px/ms (~1200 px/s) of scrolling. */
export const SCROLL_RESPONSE_REFERENCE_PX_PER_MS = 1.2;

/**
 * Per-frame exponential approach toward the current target level, in the
 * same smoothing style as the pointer shifts (current += (target-current)*f).
 * The same factor drives the rise and the decay-to-zero, so the response
 * never overshoots and settles smoothly after scrolling stops.
 */
export const SCROLL_RESPONSE_SMOOTHING = 0.12;

/**
 * Scroll velocity in px/ms between two drawn frames. A zero or negative
 * delta is a resumed frame after a frozen loop and never counts, exactly
 * like the elapsed-time guards in advanceAscent/nodeDrift consumers.
 */
export function scrollVelocity(currentY: number, previousY: number, deltaMs: number): number {
  if (deltaMs <= 0) return 0;
  return (currentY - previousY) / deltaMs;
}

/** Bounded 0..1 response level from |velocity|, saturating at the reference speed. */
export function scrollResponseLevel(velocityPxPerMs: number): number {
  const magnitude = Math.abs(velocityPxPerMs);
  if (!Number.isFinite(magnitude)) return 0;
  return Math.min(1, magnitude / SCROLL_RESPONSE_REFERENCE_PX_PER_MS);
}

/** Exponential approach: never overshoots the target, decays to 0 when it is 0. */
export function smoothScrollResponse(current: number, target: number): number {
  return current + (target - current) * SCROLL_RESPONSE_SMOOTHING;
}

/** Multiplier `1 + boost * level` applied to a twinkle wave or drift radius. */
export function responseFactor(boost: number, level: number): number {
  return 1 + boost * level;
}

/**
 * Twinkle wave (already in 0..1) lifted by the scroll response, clamped to
 * the idle maximum so a fast scroll brightens stars toward — never past —
 * the brightness the approved idle animation already reaches.
 */
export function boostTwinkleWave(wave: number, boost: number, level: number): number {
  return Math.min(1, Math.max(0, wave) * responseFactor(boost, level));
}

/** Integer 0..100 telemetry string for the response data attributes. */
export function responseTelemetry(level: number): string {
  return String(Math.round(level * 100));
}
