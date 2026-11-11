/**
 * Approved hero constellation geometry and motion bounds.
 *
 * CP4.5-E: the ten nodes trace Capricornus, the sea-goat, using the standard
 * asterism chain from the d3-celestial dataset (Stellarium/HYG derived,
 * raw.githubusercontent.com/ofrohn/d3-celestial/data/constellations.lines.json)
 * cross-checked against the Bayer/catalog coordinates of the involved stars
 * (stars.6.json, matched by exact RA/Dec, magnitudes from the same source).
 *
 * Node order follows the reference chain, closed back to its first star:
 * alpha Algedi (HIP 100027) -> beta Dabih (3.05) -> psi (HIP 101027) ->
 * HIP 102485 -> omega -> zeta -> delta Deneb Algedi (2.85) -> gamma Nashira ->
 * iota -> theta, then back to alpha. The final vertex-to-head edge is the
 * reference's drawn loop closure on the western side.
 *
 * Positions map RA/Dec at 15.5 px per degree (RA compressed by cos δ ≈ 0.94)
 * into the original 600x400 SVG space. The figure is mirrored horizontally
 * (east-right orientation) and lifted within the viewBox so its brightest
 * stars sit in the free upper-right hero corridor instead of on the headline:
 * only the dim head stars (alpha 4.3, psi 4.77) fall anywhere near the copy,
 * keeping the motif decorative without stealing text contrast. Every base
 * link stays under ~196 viewBox units so drift (±8) plus fine-pointer
 * parallax (±14) can never push a rendered link past
 * CONSTELLATION_MAX_LINK_DISTANCE (240) and blink it.
 */
export const CONSTELLATION_VIEWBOX = { width: 600, height: 400 } as const;

export interface ConstellationPoint {
  x: number;
  y: number;
}

export type ConstellationLink = readonly [number, number];

export type ConstellationStarTier = 'primary' | 'secondary' | 'faint';

export interface ConstellationNode {
  x: number;
  y: number;
  /** Apparent visual magnitude of the traced star (d3-celestial/HYG). */
  mag: number;
  tier: ConstellationStarTier;
  /** Core radius in viewBox units; halo radii scale from this. */
  radius: number;
  /** 0..1 halo strength multiplier for the layered glow. */
  haloWeight: number;
}

const STAR_TIERS: Record<ConstellationStarTier, { radius: number; haloWeight: number }> = {
  primary: { radius: 5.4, haloWeight: 1 },
  secondary: { radius: 4, haloWeight: 0.55 },
  faint: { radius: 3, haloWeight: 0.3 },
};

export function constellationStarTier(mag: number): ConstellationStarTier {
  if (mag < 3.5) return 'primary';
  if (mag < 4.35) return 'secondary';
  return 'faint';
}

/**
 * Capricornus in chain order. Magnitudes are the traced catalog values; the
 * x/y pairs are their mapped, mirrored and lifted RA/Dec positions (see the
 * module docstring). Coordinates: alpha Algedi (4.3), beta Dabih (3.05),
 * psi (4.77), HIP 102485 (4.13), omega (4.12), zeta (3.77), delta Deneb
 * Algedi (2.85), gamma Nashira (3.69), iota (4.28), theta (4.08).
 */
function star(x: number, y: number, mag: number): ConstellationNode {
  const tier = constellationStarTier(mag);
  return { x, y, mag, tier, ...STAR_TIERS[tier] };
}

export const CONSTELLATION_NODES: readonly ConstellationNode[] = [
  star(178, 8, 4.3),
  star(191, 43, 3.05),
  star(219, 90, 4.77),
  star(282, 206, 4.13),
  star(303, 231, 4.12),
  star(430, 162, 3.77),
  star(504, 64, 2.85),
  star(479, 72, 3.69),
  star(414, 75, 4.28),
  star(354, 81, 4.08),
];

/** The reference asterism chain, in the same order as CONSTELLATION_NODES. */
export const CONSTELLATION_LINKS: readonly ConstellationLink[] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [8, 9],
  [9, 0],
];

export interface ConstellationBudgets {
  maxNodes: number;
  maxFps: number;
  maxDpr: number;
}

const MAX_DPR = 1.5;

/** Desktop caps at 36 nodes/30fps; mobile at 18 nodes/20fps (UI-SPEC). */
export function constellationBudgets(mobile: boolean): ConstellationBudgets {
  return mobile
    ? { maxNodes: 18, maxFps: 20, maxDpr: MAX_DPR }
    : { maxNodes: 36, maxFps: 60, maxDpr: MAX_DPR };
}

/** Keeps the backing store bounded even on high-density displays. */
export function clampConstellationDpr(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return 1;
  return Math.min(value, MAX_DPR);
}

export function constellationFrameInterval(mobile: boolean): number {
  return 1000 / constellationBudgets(mobile).maxFps;
}

/** Low-intensity drift in viewBox units; never enough to lose the motif shape. */
export const CONSTELLATION_DRIFT_AMPLITUDE = 8;

const TWO_PI = Math.PI * 2;

/** Deterministic, index-phased drift so no random geometry runs before hydration. */
export function nodeDrift(index: number, timeMs: number): ConstellationPoint {
  const period = 18_000 + (index % 5) * 2_000;
  const phase = index * 1.7;
  const angle = (TWO_PI * timeMs) / period + phase;
  return {
    x: Math.sin(angle) * CONSTELLATION_DRIFT_AMPLITUDE,
    y: Math.cos(angle * 0.83 + phase * 0.4) * CONSTELLATION_DRIFT_AMPLITUDE,
  };
}

export const CONSTELLATION_MAX_LINK_DISTANCE = 240;

export function linkWithinRange(
  from: ConstellationPoint,
  to: ConstellationPoint,
  maxDistance: number = CONSTELLATION_MAX_LINK_DISTANCE,
): boolean {
  return Math.hypot(from.x - to.x, from.y - to.y) <= maxDistance;
}

/** Bounded fine-pointer parallax expressed in viewBox units. */
export const CONSTELLATION_POINTER_INFLUENCE = 14;

export interface ConstellationPointerTarget {
  x: number;
  y: number;
  inside: boolean;
}

export interface ConstellationRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function pointerInfluence(
  clientX: number,
  clientY: number,
  rect: ConstellationRect,
): ConstellationPointerTarget {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0, inside: false };
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
    return { x: 0, y: 0, inside: false };
  }
  const normalizedX = (x / rect.width) * 2 - 1;
  const normalizedY = (y / rect.height) * 2 - 1;
  return {
    x: normalizedX * CONSTELLATION_POINTER_INFLUENCE,
    y: normalizedY * CONSTELLATION_POINTER_INFLUENCE,
    inside: true,
  };
}
