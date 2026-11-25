import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import {
  CARD_THICKNESS_RATIO,
  createCardMaterials,
  disposeCardMaterials,
} from '../../src/components/motion/cardMaterials';

/**
 * CP7 Refinement B surface contract: the card is a volumetric slab with six
 * distinct faces — four side walls, the textured front, and the matte
 * near-black reverse exposed by the showcase turn.
 */
describe('card materials (B: thickness / front / back / sides)', () => {
  test('six materials in boxGeometry face order: +x, −x, +y, −y (sides), +z (front), −z (back)', () => {
    const texture = new THREE.Texture();
    const materials = createCardMaterials(texture);
    expect(materials).toHaveLength(6);

    // Sides: dark plastic walls, one per lateral face.
    for (const side of materials.slice(0, 4)) {
      expect(side).toBeInstanceOf(THREE.MeshStandardMaterial);
      const standard = side as THREE.MeshStandardMaterial;
      expect(standard.color.getHexString()).toBe('101010');
      expect(standard.roughness).toBeGreaterThanOrEqual(0.65);
      expect(standard.metalness).toBe(0);
    }

    // Front: the exact card render — photo texture with alpha-tested corners.
    const front = materials[4] as THREE.MeshStandardMaterial;
    expect(front.map).toBe(texture);
    expect(front.alphaTest).toBeCloseTo(0.5, 5);
    expect(front.roughness).toBeCloseTo(0.8, 5);

    // Reverse: matte near-black, no texture, no branding channel.
    const back = materials[5] as THREE.MeshStandardMaterial;
    expect(back.color.getHexString()).toBe('080808');
    expect(back.map).toBeNull();
    expect(back.roughness).toBeGreaterThanOrEqual(0.65);
    expect(back.metalness).toBe(0);
    // Lighting response is checked separately by the browser surface fixture.
    expect(back.roughness).toBeLessThan(0.9);

    // All three surface families are visually distinct.
    const side = materials[0] as THREE.MeshStandardMaterial;
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
