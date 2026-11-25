import * as THREE from 'three';

/**
 * Physical card thickness as a fraction of card height. 0.025 → ≈9.7 px on
 * the 388 px hero card: enough for the side faces to read during yaw without
 * making the card look like a slab. Shared by the scene and the material
 * tests so geometry and surfaces can never drift apart.
 */
export const CARD_THICKNESS_RATIO = 0.025;

/** Side faces (4): visible only while the card yaws/pitches off-axis. */
const SIDE_COLOR = '#101010';
/** Reverse face: matte near-black, no branding (owner: neutral reverse). */
const BACK_COLOR = '#080808';

/**
 * Side slots 0..3, textured front 4, neutral reverse 5. The rounded extrusion
 * uses slot 0 for its walls/bevels. Alpha testing keeps the front's cutout in
 * the opaque depth-tested path.
 */
export function createCardMaterials(texture: THREE.Texture | null): THREE.Material[] {
  const side = new THREE.MeshStandardMaterial({
    color: SIDE_COLOR,
    roughness: 0.72,
    metalness: 0,
  });
  const front = new THREE.MeshStandardMaterial({
    map: texture ?? null,
    roughness: 0.8,
    alphaTest: 0.5,
  });
  const back = new THREE.MeshStandardMaterial({
    color: BACK_COLOR,
    roughness: 0.7,
    metalness: 0,
  });
  return [side, side, side, side, front, back];
}

/** Disposes each unique material in a `createCardMaterials` set once. */
export function disposeCardMaterials(materials: THREE.Material[]): void {
  for (const material of new Set(materials)) material.dispose();
}
