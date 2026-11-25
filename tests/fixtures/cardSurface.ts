import * as THREE from 'three';
import { createCardMaterials } from '../../src/components/motion/cardMaterials';
import { createCardGeometry } from '../../src/components/motion/cardGeometry';

// Uses the production geometry and materials to inspect edge/back lighting.
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(400, 480);
renderer.setClearColor(0, 0);
renderer.toneMapping = THREE.NoToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.6, -0.6, 0.1, 10);
camera.position.z = 3;
scene.add(new THREE.AmbientLight(0xffffff, 0.85));
for (const [x, y, z, intensity] of [
  [1, 1, 2, 0.55],
  [-1, 0.5, 1, 0.2],
  [-1, 1, -2, 0.8],
]) {
  const light = new THREE.DirectionalLight(0xffffff, intensity);
  light.position.set(x!, y!, z!);
  scene.add(light);
}
const materials = createCardMaterials(null);
const card = new THREE.Mesh(createCardGeometry(320 / 388, 1), materials);
scene.add(card);

declare global {
  interface Window {
    renderCardSurface: (yaw: number) => {
      png: string;
      width: number;
      center: number[];
      groups: number[];
    };
  }
}

window.renderCardSurface = (yaw) => {
  card.rotation.y = yaw;
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const pixels = new Uint8Array(400 * 480 * 4);
  gl.readPixels(0, 0, 400, 480, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let width = 0;
  for (let x = 0; x < 400; x++) {
    if (pixels[(240 * 400 + x) * 4 + 3]! > 200) width++;
  }
  const center = [...pixels.slice((240 * 400 + 200) * 4, (240 * 400 + 200) * 4 + 3)];
  return {
    png: renderer.domElement.toDataURL(),
    width,
    center,
    groups: card.geometry.groups.map((group) => group.materialIndex ?? -1),
  };
};
