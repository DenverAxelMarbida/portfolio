import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import {
  createLanyard3dCamera,
  projectWorldToCanvasPx,
  cardHitRect,
} from '../../src/components/motion/lanyard3dProjection';
import {
  createLanyard3dConfig,
  createLanyard3dDropState,
  createLanyard3dRestState,
  lanyard3dCardFrame,
  type Vec3,
} from '../../src/components/motion/lanyard3dPhysics';
import { CARD_THICKNESS_RATIO } from '../../src/components/motion/cardMaterials';

/**
 * Drag hit-rect projection (review finding 3). The card rect must be the
 * perspective projection of the card's volumetric slab, not a z=0 planar
 * approximation: at entrance poses a visible corner sits up to ~30 px
 * outside the padded planar rect, so drags near that corner missed.
 *
 * The planar fixture mirrors a real 1280 desktop measurement (cardH 388,
 * strap 347, top pad 0.3·strap + 0.6·cardH).
 */
const GEOMETRY = {
  canvasWidth: 881,
  canvasHeight: 1305,
  anchorRowPx: 337,
  worldPerPx: 1 / 388,
};

const CONFIG = createLanyard3dConfig(347 / 388, 320 / 388, 1);
const HALF_DEPTH = (CONFIG.cardHeight * CARD_THICKNESS_RATIO) / 2;
const PAD = 8;

/** Independent oracle: stock THREE projection of one world point. */
function oraclePx(camera: THREE.PerspectiveCamera, p: Vec3): { x: number; y: number } {
  const v = new THREE.Vector3(p.x, p.y, p.z).project(camera);
  return {
    x: (v.x * 0.5 + 0.5) * GEOMETRY.canvasWidth,
    y: (-v.y * 0.5 + 0.5) * GEOMETRY.canvasHeight,
  };
}

/** The z=0 planar mapping the scene used before the fix. */
function planarPx(p: Vec3): { x: number; y: number } {
  return {
    x: GEOMETRY.canvasWidth / 2 + p.x / GEOMETRY.worldPerPx,
    y: GEOMETRY.anchorRowPx - p.y / GEOMETRY.worldPerPx,
  };
}

function slabPoints(corners: readonly Vec3[], normal: Vec3, halfDepth: number): Vec3[] {
  const points: Vec3[] = [];
  for (const c of corners) {
    points.push(c);
    points.push({
      x: c.x + normal.x * halfDepth,
      y: c.y + normal.y * halfDepth,
      z: c.z + normal.z * halfDepth,
    });
    points.push({
      x: c.x - normal.x * halfDepth,
      y: c.y - normal.y * halfDepth,
      z: c.z - normal.z * halfDepth,
    });
  }
  return points;
}

function expectContains(
  rect: { left: number; top: number; width: number; height: number },
  points: readonly Vec3[],
  camera: THREE.PerspectiveCamera,
): void {
  for (const p of points) {
    const q = oraclePx(camera, p);
    expect(q.x).toBeGreaterThanOrEqual(rect.left - 1e-6);
    expect(q.x).toBeLessThanOrEqual(rect.left + rect.width + 1e-6);
    expect(q.y).toBeGreaterThanOrEqual(rect.top - 1e-6);
    expect(q.y).toBeLessThanOrEqual(rect.top + rect.height + 1e-6);
  }
}

describe('createLanyard3dCamera', () => {
  test('maps the z=0 plane 1:1 onto canvas CSS pixels', () => {
    const camera = createLanyard3dCamera(GEOMETRY);
    for (const p of [
      { x: 0, y: 0, z: 0 },
      { x: -0.5, y: -1.2, z: 0 },
      { x: 0.41, y: -2, z: 0 },
      { x: -1.2, y: 0.5, z: 0 },
    ]) {
      const projected = projectWorldToCanvasPx(GEOMETRY, camera, p);
      const planar = planarPx(p);
      expect(projected.x).toBeCloseTo(planar.x, 3);
      expect(projected.y).toBeCloseTo(planar.y, 3);
    }
  });
});

describe('cardHitRect', () => {
  test('at rest it equals the planar card rect plus the pad', () => {
    const camera = createLanyard3dCamera(GEOMETRY);
    const rest = createLanyard3dRestState(CONFIG);
    const corners = rest.corners.map((c) => c.position);
    const rect = cardHitRect(GEOMETRY, camera, corners, { x: 0, y: 0, z: 1 }, 0, PAD);

    const projected = corners.map(planarPx);
    const minX = Math.min(...projected.map((p) => p.x));
    const maxX = Math.max(...projected.map((p) => p.x));
    const minY = Math.min(...projected.map((p) => p.y));
    const maxY = Math.max(...projected.map((p) => p.y));
    expect(rect.left).toBeCloseTo(minX - PAD, 3);
    expect(rect.top).toBeCloseTo(minY - PAD, 3);
    expect(rect.width).toBeCloseTo(maxX - minX + PAD * 2, 3);
    expect(rect.height).toBeCloseTo(maxY - minY + PAD * 2, 3);
  });

  test('contains the projected slab of an edge-on card; the planar rect does not', () => {
    const camera = createLanyard3dCamera(GEOMETRY);
    // Card yawed 90°: its width spans depth, so the near corners project
    // well outside any z=0 approximation of the same pose.
    const center: Vec3 = { x: 0, y: -1.4, z: 0 };
    const right: Vec3 = { x: 0, y: 0, z: 1 };
    const up: Vec3 = { x: 0, y: 1, z: 0 };
    const normal: Vec3 = { x: -1, y: 0, z: 0 };
    const halfW = CONFIG.cardWidth / 2;
    const halfH = CONFIG.cardHeight / 2;
    const corners: Vec3[] = [];
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        corners.push({
          x: center.x + right.x * halfW * sx + up.x * halfH * sy,
          y: center.y + right.y * halfW * sx + up.y * halfH * sy,
          z: center.z + right.z * halfW * sx + up.z * halfH * sy,
        });
      }
    }
    const points = slabPoints(corners, normal, HALF_DEPTH);

    const rect = cardHitRect(GEOMETRY, camera, corners, normal, HALF_DEPTH, PAD);
    expectContains(rect, points, camera);

    // Documents the defect: the padded z=0 rect of this pose misses the
    // magnified near corners by more than the pad, which is exactly the
    // ~30 px entrance-frame drag gap the review measured.
    const planar = corners.map(planarPx);
    const pMinX = Math.min(...planar.map((p) => p.x));
    const pMaxX = Math.max(...planar.map((p) => p.x));
    const pMinY = Math.min(...planar.map((p) => p.y));
    const pMaxY = Math.max(...planar.map((p) => p.y));
    const outsideBy = (q: { x: number; y: number }): number =>
      Math.max(pMinX - PAD - q.x, q.x - (pMaxX + PAD), pMinY - PAD - q.y, q.y - (pMaxY + PAD));
    const worst = Math.max(...points.map((p) => outsideBy(oraclePx(camera, p))));
    expect(worst).toBeGreaterThan(PAD);
  });

  test('contains the projected slab of the reference entrance pose', () => {
    const camera = createLanyard3dCamera(GEOMETRY);
    const state = createLanyard3dDropState(CONFIG);
    const frame = lanyard3dCardFrame(state);
    const cross: Vec3 = {
      x: frame.right.y * frame.up.z - frame.right.z * frame.up.y,
      y: frame.right.z * frame.up.x - frame.right.x * frame.up.z,
      z: frame.right.x * frame.up.y - frame.right.y * frame.up.x,
    };
    const length = Math.hypot(cross.x, cross.y, cross.z);
    const normal: Vec3 = { x: cross.x / length, y: cross.y / length, z: cross.z / length };
    const corners = state.corners.map((c) => c.position);
    const points = slabPoints(corners, normal, HALF_DEPTH);

    const rect = cardHitRect(GEOMETRY, camera, corners, normal, HALF_DEPTH, PAD);
    expectContains(rect, points, camera);
  });
});
