import * as THREE from 'three';
import { CARD_THICKNESS_RATIO } from './cardMaterials';

/** Rounded corners and a narrow bevel catch light without a glossy coating. */
export function createCardGeometry(width: number, height: number): THREE.ExtrudeGeometry {
  const bevel = height * 0.002;
  const radius = height * 0.03;
  const x = width / 2 - bevel;
  const y = height / 2 - bevel;
  const shape = new THREE.Shape();
  shape.moveTo(-x + radius, -y);
  shape.lineTo(x - radius, -y);
  shape.quadraticCurveTo(x, -y, x, -y + radius);
  shape.lineTo(x, y - radius);
  shape.quadraticCurveTo(x, y, x - radius, y);
  shape.lineTo(-x + radius, y);
  shape.quadraticCurveTo(-x, y, -x, y - radius);
  shape.lineTo(-x, -y + radius);
  shape.quadraticCurveTo(-x, -y, -x + radius, -y);
  const depth = height * CARD_THICKNESS_RATIO - 2 * bevel;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 6,
    steps: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  geometry.clearGroups();
  let start = 0;
  let material = -1;
  for (let i = 0; i < positions.count; i += 3) {
    const nz = normals.getZ(i);
    const next = nz > 0.99 ? 4 : nz < -0.99 ? 5 : 0;
    if (next !== material) {
      if (i > start) geometry.addGroup(start, i - start, material);
      start = i;
      material = next;
    }
    for (let j = i; j < i + 3; j++) {
      uv.setXY(j, positions.getX(j) / width + 0.5, positions.getY(j) / height + 0.5);
    }
  }
  geometry.addGroup(start, positions.count - start, material);
  uv.needsUpdate = true;
  return geometry;
}
