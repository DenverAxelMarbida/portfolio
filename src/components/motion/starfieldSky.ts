/**
 * Infinite-ascent and shooting-star policy for the page starfield, kept pure
 * and deterministic so the component loop only feeds it elapsed time and
 * explicit random rolls.
 *
 * Every helper is elapsed-time-based: a hidden tab or paused page accrues no
 * animation time, so resume never produces catch-up jumps.
 *
 * CP4.5-B visual reconciliation: the measured reference shows dozens of stars
 * per viewport, quick twinkle (~1–2.5s periods), and prominent comet-profile
 * meteors every few seconds; the owner additionally approved a clearly
 * perceptible continuous ascent that the reference video itself lacks.
 */

/**
 * Moderately fast, continuously perceptible rise: 30 px/s. At the 30fps idle
 * cap this is ~1 px per frame — above the point-stimulus motion threshold,
 * unlike the earlier imperceptible 6 px/s.
 */
export const ASCENT_SPEED_PX_PER_MS = 0.05;

/** Shooting-star spacing window (CP4.5-B approved 3–7s). */
export const METEOR_MIN_GAP_MS = 3000;
export const METEOR_MAX_GAP_MS = 7000;

/** An individual meteor never outlives 1300ms; flights start at 900ms. */
export const METEOR_MAX_LIFETIME_MS = 1300;
const METEOR_MIN_LIFETIME_MS = 900;

/**
 * Near-white comet head ceiling; the tail fades to 0 along the gradient, so
 * the streak never reads as a flat bright line. No flash effects.
 */
export const METEOR_HEAD_ALPHA = 0.95;

/**
 * Trail length is viewport-relative (reference: 0.3–0.5 of viewport height)
 * and clamped to a fixed device-independent range.
 */
const METEOR_TRAIL_FRACTION_MIN = 0.32;
const METEOR_TRAIL_FRACTION_RANGE = 0.18;
export const METEOR_MIN_TRAIL_PX = 240;
export const METEOR_MAX_TRAIL_PX = 560;

const MIN_ANGLE_DEG = 18;
const MAX_ANGLE_DEG = 38;

/**
 * Share of meteors descending toward the lower right — the reference's
 * consistent `\` heading — with the remainder mirrored for variety. The
 * mirror threshold uses its own exact constant instead of `1 - share` to
 * avoid the 0.15000000000000002 float artifact at the boundary.
 */
export const METEOR_RIGHT_DESCENT_SHARE = 0.85;
const METEOR_MIRROR_ROLL_THRESHOLD = 0.15;

/** Meteor brightness envelope segments over the flight progress. */
const METEOR_RISE_FRACTION = 0.1;
/**
 * CP4.5-C cinematic meteors: the whole comet translates along its heading for
 * the entire flight instead of landing at 0.55 and burning off in place.
 * Travel distance is 2.75× the trail length, i.e. the head's average speed is
 * 2.75/1.82 ≈ +51% over the CP4.5-B baseline — inside the approved 40–60%
 * band — and the streak keeps moving through the fade so it can exit the
 * right edge naturally.
 */
export const METEOR_TRAVEL_LENGTH_FACTOR = 2.75;
/** The streak grows from zero to full length over this share of the life. */
export const METEOR_GROW_FRACTION = 0.25;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Maps a [0,1) roll onto the approved gap window. */
export function meteorGapMs(roll: number): number {
  return Math.round(METEOR_MIN_GAP_MS + clamp01(roll) * (METEOR_MAX_GAP_MS - METEOR_MIN_GAP_MS));
}

/** Maps a [0,1) roll onto a bounded, never-overshooting lifetime. */
export function meteorLifetimeMs(roll: number): number {
  const range = METEOR_MAX_LIFETIME_MS - METEOR_MIN_LIFETIME_MS;
  return Math.round(METEOR_MIN_LIFETIME_MS + clamp01(roll) * range);
}

/** Viewport-relative trail length with the approved absolute bounds. */
export function meteorTrailLengthPx(viewportHeightPx: number, roll: number): number {
  const height = Math.max(1, viewportHeightPx);
  const relative =
    height * (METEOR_TRAIL_FRACTION_MIN + clamp01(roll) * METEOR_TRAIL_FRACTION_RANGE);
  return Math.min(METEOR_MAX_TRAIL_PX, Math.max(METEOR_MIN_TRAIL_PX, relative));
}

/**
 * Advances the ascent offset by strictly consumed elapsed time. Zero or
 * negative deltas (resumed frames after a frozen loop) leave the offset
 * untouched, so a hidden or paused page never jumps on return.
 */
export function advanceAscent(
  offset: number,
  deltaMs: number,
  speed: number,
  pageHeight: number,
): number {
  if (!(deltaMs > 0) || pageHeight <= 0) return offset;
  return (offset + deltaMs * speed) % pageHeight;
}

/** Wraps a page coordinate into [0, pageHeight) so ascent recycles stars. */
export function wrapPageY(value: number, pageHeight: number): number {
  if (pageHeight <= 0) return value;
  return ((value % pageHeight) + pageHeight) % pageHeight;
}

export interface MeteorGeometry {
  /** Tail root (the trailing, upper end of the streak). */
  startX: number;
  startY: number;
  /** Head landing point (the leading, brighter end). */
  endX: number;
  endY: number;
}

export interface Meteor {
  geometry: MeteorGeometry;
  spawnAt: number;
  lifetime: number;
}

/** A meteor that never overlaps: the next spawn is always strictly later. */
export interface MeteorClock {
  active: Meteor | null;
  nextSpawnAt: number;
}

export interface MeteorSpawnInput {
  gapRoll: number;
  lifetimeRoll: number;
  geometry: MeteorGeometry;
}

export function createMeteorClock(startElapsedMs: number, gapRoll: number): MeteorClock {
  return { active: null, nextSpawnAt: startElapsedMs + meteorGapMs(gapRoll) };
}

/**
 * Pure clock tick. The caller passes geometry rolls only when it wants the
 * due slot filled; a null input leaves the scheduled spawn in place for a
 * later frame. While a meteor is alive, every other request is refused, so
 * two meteors can never overlap.
 */
export function updateMeteorClock(
  clock: MeteorClock,
  nowElapsedMs: number,
  input: MeteorSpawnInput | null,
): MeteorClock {
  if (clock.active && nowElapsedMs < clock.active.spawnAt + clock.active.lifetime) {
    return clock;
  }

  const active =
    clock.active && nowElapsedMs >= clock.active.spawnAt + clock.active.lifetime
      ? null
      : clock.active;
  if (active) return { ...clock, active };

  if (nowElapsedMs < clock.nextSpawnAt || !input) return { ...clock, active: null };

  const lifetime = meteorLifetimeMs(input.lifetimeRoll);
  return {
    active: { geometry: input.geometry, spawnAt: nowElapsedMs, lifetime },
    nextSpawnAt: nowElapsedMs + lifetime + meteorGapMs(input.gapRoll),
  };
}

/** 0..1 inside the flight window (inclusive of the final frame), null outside. */
export function meteorProgress(meteor: Meteor, nowElapsedMs: number): number | null {
  const since = nowElapsedMs - meteor.spawnAt;
  if (since < 0 || since > meteor.lifetime) return null;
  return clamp01(since / meteor.lifetime);
}

/**
 * Overall brightness envelope at flight progress p: a quick soft rise, full
 * burn while the comet translates, then a progressive fade over the final 40%
 * of the life that ends dark on the final frame. The exponent keeps the fade
 * mostly linear so motion stays readable while it dims. Outside the window
 * the envelope is 0.
 */
export function meteorEnvelope(progress: number | null): number {
  if (progress === null) return 0;
  const rise = clamp01(progress / METEOR_RISE_FRACTION);
  const fadeProgress = clamp01((progress - 0.6) / 0.4);
  return rise * (1 - Math.pow(fadeProgress, 1.1));
}

/**
 * How far the head has travelled along its heading at progress p: the whole
 * comet translates continuously, reaching METEOR_TRAVEL_LENGTH_FACTOR trail
 * lengths by p=1 so the streak passes through and exits the viewport edge
 * instead of stopping to burn off.
 */
export function meteorHeadTravel(progress: number | null): number {
  if (progress === null) return 0;
  return METEOR_TRAVEL_LENGTH_FACTOR * clamp01(progress);
}

/**
 * Visible streak length as a share of the full trail at progress p: the tail
 * grows in over METEOR_GROW_FRACTION of the life so the comet builds up
 * length early, then holds full length while it travels and fades.
 */
export function meteorStreakShare(progress: number | null): number {
  if (progress === null) return 0;
  return clamp01(progress / METEOR_GROW_FRACTION);
}

/** Peak (head) brightness for the comet gradient; tail alpha is handled by geometry. */
export function meteorHeadAlpha(progress: number | null): number {
  return METEOR_HEAD_ALPHA * meteorEnvelope(progress);
}

/**
 * Builds a grazing descent trail. `rotationRoll < 1 - share` mirrors the
 * heading to the lower left; otherwise the streak falls toward the lower
 * right like the reference. Length comes from the viewport helper above.
 */
export function meteorGeometry(input: {
  startX: number;
  startY: number;
  directionRoll: number;
  angleRoll: number;
  trailLengthPx: number;
}): MeteorGeometry {
  const direction = input.directionRoll < METEOR_MIRROR_ROLL_THRESHOLD ? -1 : 1;
  const angleRad =
    ((MIN_ANGLE_DEG + (MAX_ANGLE_DEG - MIN_ANGLE_DEG) * clamp01(input.angleRoll)) * Math.PI) / 180;
  const trail = Math.max(1, input.trailLengthPx);
  return {
    startX: input.startX,
    startY: input.startY,
    endX: input.startX + direction * Math.cos(angleRad) * trail,
    endY: input.startY + Math.sin(angleRad) * trail,
  };
}
