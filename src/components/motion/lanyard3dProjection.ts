import * as THREE from 'three';
import type { Vec3 } from './lanyard3dPhysics';

/**
 * Perspective projection for the 3D lanyard's drag hit proxy.
 *
 * The proxy rect must be the perspective projection of the card's
 * volumetric slab, not a z=0 planar approximation: during the entrance a
 * visible corner sits up to ~30 px outside the padded planar rect (the card
 * spans ±half-width in z when yawed), so drags near that corner missed the
 * proxy entirely.
 */

/** Structural subset of the measured layout the projection needs. */
export interface LanyardProjectionGeometry {
  /** Canvas size in CSS pixels. */
  canvasWidth: number;
  canvasHeight: number;
  /** Anchor row inside the canvas (>= 0): headroom above the strap root. */
  anchorRowPx: number;
  /** World units per CSS pixel. */
  worldPerPx: number;
}

export const LANYARD3D_CAMERA_FOV_DEG = 30;

export interface LanyardHitRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The scene camera: the visible z=0 plane maps 1:1 onto the canvas CSS
 * pixels, so the planar projection and the perspective camera agree exactly
 * at z=0 and diverge only for the card's depth.
 *
 * Must be a real THREE.PerspectiveCamera instance, not an options object:
 * R3F v9 applies options-object cameras with camera.lookAt(0,0,0) on
 * creation (tilting the view toward the world origin) and never re-applies
 * the options afterwards. An instance camera is adopted as-is.
 */
export function createLanyard3dCamera(
  geometry: LanyardProjectionGeometry,
): THREE.PerspectiveCamera {
  const visibleHeight = geometry.canvasHeight * geometry.worldPerPx;
  const distance = visibleHeight / 2 / Math.tan((LANYARD3D_CAMERA_FOV_DEG * Math.PI) / 180 / 2);
  const camera = new THREE.PerspectiveCamera(
    LANYARD3D_CAMERA_FOV_DEG,
    geometry.canvasWidth / geometry.canvasHeight,
    0.05,
    distance * 4,
  );
  camera.position.set(
    0,
    (geometry.anchorRowPx - geometry.canvasHeight / 2) * geometry.worldPerPx,
    distance,
  );
  camera.updateMatrixWorld(true);
  return camera;
}

/** Projects a world point through the scene camera to canvas CSS pixels. */
export function projectWorldToCanvasPx(
  geometry: LanyardProjectionGeometry,
  camera: THREE.PerspectiveCamera,
  point: Vec3,
): { x: number; y: number } {
  const projected = new THREE.Vector3(point.x, point.y, point.z).project(camera);
  return {
    x: (projected.x * 0.5 + 0.5) * geometry.canvasWidth,
    y: (-projected.y * 0.5 + 0.5) * geometry.canvasHeight,
  };
}

/**
 * The card's projected footprint plus `pad` CSS pixels: the bounding box of
 * all eight slab points (four face corners plus/minus the face normal times
 * the half-depth), projected through the camera. Using the slab keeps the
 * rect correct for the volumetric body, whose near face magnifies beyond the
 * face-corner bbox at entrance poses.
 */
export function cardHitRect(
  geometry: LanyardProjectionGeometry,
  camera: THREE.PerspectiveCamera,
  corners: readonly Vec3[],
  normal: Vec3,
  halfDepth: number,
  pad: number,
): LanyardHitRect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const consider = (point: Vec3): void => {
    const projected = projectWorldToCanvasPx(geometry, camera, point);
    minX = Math.min(minX, projected.x);
    minY = Math.min(minY, projected.y);
    maxX = Math.max(maxX, projected.x);
    maxY = Math.max(maxY, projected.y);
  };
  for (const corner of corners) {
    consider(corner);
    consider({
      x: corner.x + normal.x * halfDepth,
      y: corner.y + normal.y * halfDepth,
      z: corner.z + normal.z * halfDepth,
    });
    consider({
      x: corner.x - normal.x * halfDepth,
      y: corner.y - normal.y * halfDepth,
      z: corner.z - normal.z * halfDepth,
    });
  }
  return {
    left: minX - pad,
    top: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}
