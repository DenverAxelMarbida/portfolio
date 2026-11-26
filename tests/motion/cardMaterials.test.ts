import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import {
  CARD_THICKNESS_RATIO,
  createCardMaterials,
  disposeCardMaterials,
} from '../../src/components/motion/cardMaterials';

/**
 * CP7 ID Gray Shine surface contract: the badge is a satin graphite/silver
 * metal — graphite side walls with enough metalness (≥ 0.3) for specular
 * light to travel across them during yaw, a matching graphite reverse, and a
 * dielectric front so the photo texture keeps its full diffuse albedo.
 * Roughness stays ≥ 0.65 everywhere: satin, never gloss or chrome.
 */
describe('card materials (Gray Shine: graphite satin metal)', () => {
  test('six materials in boxGeometry face order: +x, −x, +y, −y (sides), +z (front), −z (back)', () => {
    const texture = new THREE.Texture();
    const materials = createCardMaterials(texture);
    expect(materials).toHaveLength(6);

    // Sides: graphite metal walls, one shared instance per lateral face.
    const side = materials[0] as THREE.MeshStandardMaterial;
    expect(side).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(side.color.getHexString()).toBe('23262b');
    expect(side.metalness).toBeCloseTo(0.5, 5);
    expect(side.metalness).toBeGreaterThanOrEqual(0.3);
    expect(side.roughness).toBeGreaterThanOrEqual(0.65);
    expect(side.roughness).toBeLessThan(0.9);
    for (const wall of materials.slice(1, 4)) expect(wall).toBe(side);

    // Front: the exact card render — photo texture with alpha-tested corners,
    // dielectric (metalness 0) so the portrait and text never go dark.
    const front = materials[4] as THREE.MeshStandardMaterial;
    expect(front.map).toBe(texture);
    expect(front.alphaTest).toBeCloseTo(0.5, 5);
    expect(front.roughness).toBeCloseTo(0.8, 5);
    expect(front.metalness).toBe(0);

    // Reverse: graphite satin — matching finish, no texture, no branding.
    const back = materials[5] as THREE.MeshStandardMaterial;
    expect(back.color.getHexString()).toBe('171a1e');
    expect(back.map).toBeNull();
    expect(back.metalness).toBeCloseTo(0.45, 5);
    expect(back.roughness).toBeGreaterThanOrEqual(0.65);
    expect(back.roughness).toBeLessThan(0.9);

    // All three surface families are visually distinct.
    expect(side.color.getHexString()).not.toBe(front.color.getHexString());
    expect(side.color.getHexString()).not.toBe(back.color.getHexString());
    expect(front.map).not.toBe(back.map);
  });

  test('front without a texture still renders opaque (alphaTest on an untextured face)', () => {
    const materials = createCardMaterials(null);
    const front = materials[4] as THREE.MeshStandardMaterial;
    expect(front.map).toBeNull();
    expect(front.alphaTest).toBeCloseTo(0.5, 5);
  });

  test('thickness ratio yields visible side walls on the hero card', () => {
    // 0.025 × 388 px ≈ 9.7 px of physical edge — the side strip the frame
    // observations measure as W·cos(yaw) + t·sin(yaw).
    expect(CARD_THICKNESS_RATIO).toBeCloseTo(0.025, 5);
    expect(CARD_THICKNESS_RATIO * 388).toBeGreaterThan(8);
    // Still card-thin: below 5% of the card height.
    expect(CARD_THICKNESS_RATIO).toBeLessThan(0.05);
  });

  test('disposeCardMaterials disposes each unique material exactly once', () => {
    const materials = createCardMaterials(new THREE.Texture());
    const counts = new Map<THREE.Material, number>();
    for (const material of new Set(materials)) {
      const original = material.dispose.bind(material);
      counts.set(material, 0);
      material.dispose = () => {
        counts.set(material, counts.get(material)! + 1);
        original();
      };
    }
    // The four sides share one instance — disposing must not run 4× on it.
    disposeCardMaterials(materials);
    for (const [material, count] of counts) {
      expect(count, `material ${material.uuid}`).toBe(1);
    }
  });
});
