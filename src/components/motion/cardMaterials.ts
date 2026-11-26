import * as THREE from 'three';

/**
 * Physical card thickness as a fraction of card height. 0.025 → ≈9.7 px on
 * the 388 px hero card: enough for the side faces to read during yaw without
 * making the card look like a slab. Shared by the scene and the material
 * tests so geometry and surfaces can never drift apart.
 */
export const CARD_THICKNESS_RATIO = 0.025;

/**
 * Gray Shine finish: the badge reads as satin graphite metal rather than
 * flat black. The side walls carry metalness 0.5 so the three fixed scene
 * lights produce a specular sweep across them as the card yaws/pitches —
 * this is the visible "edge highlight responds to rotation" effect. Roughness
 * 0.72 keeps it satin: broad soft highlights, no gloss or chrome.
 */
const SIDE_COLOR = '#23262b';
/** Reverse: graphite satin matching the walls, still neutral and unbranded. */
const BACK_COLOR = '#171a1e';

/**
 * Side slots 0..3, textured front 4, neutral reverse 5. The rounded extrusion
 * uses slot 0 for its walls/bevels. Alpha testing keeps the front's cutout in
 * the opaque depth-tested path.
 */
export function createCardMaterials(texture: THREE.Texture | null): THREE.Material[] {
  const side = new THREE.MeshStandardMaterial({
    color: SIDE_COLOR,
    roughness: 0.72,
    metalness: 0.5,
  });
  const front = new THREE.MeshStandardMaterial({
    map: texture ?? null,
    roughness: 0.8,
    // Dielectric on purpose: metalness would tint and darken the photo.
    metalness: 0,
    alphaTest: 0.5,
  });
  const back = new THREE.MeshStandardMaterial({
    color: BACK_COLOR,
    roughness: 0.7,
    metalness: 0.45,
  });
  return [side, side, side, side, front, back];
}

/** Disposes each unique material in a `createCardMaterials` set once. */
export function disposeCardMaterials(materials: THREE.Material[]): void {
  for (const material of new Set(materials)) material.dispose();
}
