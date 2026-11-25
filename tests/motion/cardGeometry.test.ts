import { expect, test } from 'vitest';
import { createCardGeometry } from '../../src/components/motion/cardGeometry';

test('rounded solid badge retains its dimensions, face mapping, and bevel normals', () => {
  const geometry = createCardGeometry(0.8, 1);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  expect(box.max.z - box.min.z).toBeCloseTo(0.025, 5);
  expect(box.max.x - box.min.x).toBeCloseTo(0.8, 3);
  expect(box.max.y - box.min.y).toBeCloseTo(1, 3);
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const surfaces = new Set(geometry.groups.map((g) => g.materialIndex));
  expect(surfaces).toEqual(new Set([0, 4, 5]));
  let bevels = 0;
  for (let i = 0; i < position.count; i++) {
    expect(Math.abs(position.getX(i)) > 0.398 && Math.abs(position.getY(i)) > 0.498).toBe(false);
    if (Math.abs(normal.getZ(i)) > 0.99) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(i)).toBeLessThanOrEqual(1);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getY(i)).toBeLessThanOrEqual(1);
    } else if (Math.abs(normal.getZ(i)) > 0.05) bevels++;
  }
  expect(bevels).toBeGreaterThan(0);
  geometry.dispose();
});
