import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  advanceLanyard3dAccumulator,
  createLanyard3dConfig,
  lanyard3dCardFrame,
  lanyard3dRopePoints,
  stepLanyard3d,
  type Lanyard3dConfig,
  type Lanyard3dState,
  type Vec3,
} from './lanyard3dPhysics';
import { deriveLanyardAnchorGeometry, type LanyardAnchorMode } from './profileCardMotion';
import { clampConstellationDpr } from './constellationGeometry';
import { CARD_THICKNESS_RATIO, createCardMaterials, disposeCardMaterials } from './cardMaterials';
import { createCardGeometry } from './cardGeometry';
import { cardHitRect, createLanyard3dCamera } from './lanyard3dProjection';

/**
 * Measured layout geometry for the 3D lanyard, in CSS pixels. The physics
 * world is scaled so the card is exactly 1 world unit tall; every quantity
 * converts through `worldPerPx`.
 */
export interface Lanyard3dGeometry {
  /** Anchor row inside the canvas (>= 0): headroom above the strap root. */
  anchorRowPx: number;
  /** Strap-root document offset relative to the shell top, in px (<= 0). */
  anchorTopOffsetPx: number;
  /** Canvas size in CSS pixels. */
  canvasWidth: number;
  canvasHeight: number;
  cardWidthPx: number;
  cardHeightPx: number;
  /** World units per CSS pixel (1 / cardHeightPx). */
  worldPerPx: number;
  config: Lanyard3dConfig;
}

/** Frame-loop state shared between the host bridge and the R3F scene. */
export interface Lanyard3dRuntime {
  geometry: Lanyard3dGeometry;
  state: Lanyard3dState;
  dragging: boolean;
  target: Vec3 | null;
  /** Pause bridge: frozen frameloop, no stepping. */
  paused: boolean;
  /** Per-frame host callback: projected card rect + physics pose. */
  onFrame:
    | ((
        cardRect: { left: number; top: number; width: number; height: number },
        pose: string,
      ) => void)
    | null;
}

/** Headroom above the anchor: a card dragged straight up reaches 0.3·strap. */
const TOP_PAD_STRAP = 0.3;
/** Margin fractions around the card at rest, in card-height units. */
const CARD_PAD_X = 0.55;
const CARD_PAD_Y = 0.6;

/**
 * Measures the rendered layout and derives the 3D geometry. Mirrors the DOM
 * lanyard's measurement (`deriveLanyardAnchorGeometry` + offsetTop chain) so
 * the 3D strap root sits exactly where the SVG strap root would.
 */
export function measureLanyard3dGeometry(
  shell: HTMLElement,
  card: HTMLElement,
  anchorMode: LanyardAnchorMode,
): Lanyard3dGeometry | null {
  const documentTop = (element: HTMLElement): number => {
    let top = 0;
    let node: HTMLElement | null = element;
    while (node) {
      top += node.offsetTop;
      node = node.offsetParent as HTMLElement | null;
    }
    return top;
  };
  const cardHeightPx = card.offsetHeight;
  const cardWidthPx = card.offsetWidth;
  if (cardHeightPx < 40 || cardWidthPx < 40) return null;

  const shellTop = documentTop(shell);
  const cardTop = documentTop(card);
  const anchor = deriveLanyardAnchorGeometry(anchorMode, shellTop, cardTop);
  const strapPx = Math.max(60, anchor.restLength);
  const topPadPx = TOP_PAD_STRAP * strapPx + CARD_PAD_Y * cardHeightPx;
  const canvasWidth = Math.ceil(
    cardWidthPx + 2 * (TOP_PAD_STRAP * strapPx + CARD_PAD_X * cardWidthPx),
  );
  // The card hangs strapPx below the anchor row and extends its full height
  // from there; the canvas must cover the card itself plus the bottom swing
  // pad, or the card's lower edge (photo bottom + meta) gets clipped.
  const canvasHeight = Math.ceil(strapPx + topPadPx + cardHeightPx + CARD_PAD_Y * cardHeightPx);
  const worldPerPx = 1 / cardHeightPx;
  const strapWorld = strapPx * worldPerPx;
  const config = createLanyard3dConfig(strapWorld, cardWidthPx * worldPerPx, 1);
  return {
    anchorRowPx: topPadPx,
    anchorTopOffsetPx: anchor.anchorTopOffset,
    canvasWidth,
    canvasHeight,
    cardWidthPx,
    cardHeightPx,
    worldPerPx,
    config,
  };
}

/** Maps a canvas-local CSS pixel position to the world z=0 plane. */
export function canvasPxToWorld(geometry: Lanyard3dGeometry, x: number, y: number): Vec3 {
  return {
    x: (x - geometry.canvasWidth / 2) * geometry.worldPerPx,
    y: (geometry.anchorRowPx - y) * geometry.worldPerPx,
    z: 0,
  };
}

interface SceneProps {
  runtime: Lanyard3dRuntime;
  texture: THREE.CanvasTexture | null;
  strapColor: string;
  clipColor: string;
  ringColor: string;
}

/**
 * The card + strap renderer and fixed-step physics driver. The strap tube is
 * rebuilt along the rope polyline each frame (few hundred vertices); all
 * other meshes update through their transforms only.
 */
function Scene({ runtime, texture, strapColor, clipColor, ringColor }: SceneProps) {
  const cardRef = useRef<THREE.Mesh>(null);
  const strapRef = useRef<THREE.Mesh>(null);
  const clipRef = useRef<THREE.Group>(null);
  const accumulatorRef = useRef(0);
  const basis = useMemo(() => new THREE.Matrix4(), []);
  const rightVector = useMemo(() => new THREE.Vector3(), []);
  const upVector = useMemo(() => new THREE.Vector3(), []);
  const normalVector = useMemo(() => new THREE.Vector3(), []);
  // The instance camera installed by LanyardSceneApp's `camera` prop; the
  // same one the hit rect must project through.
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const g = runtime.geometry;

  // The rounded solid shares its face assignments with the material factory.
  const cardMaterials = useMemo(() => createCardMaterials(texture), [texture]);
  const cardGeometry = useMemo(
    () => createCardGeometry(g.config.cardWidth, g.config.cardHeight),
    [g.config.cardWidth, g.config.cardHeight],
  );
  useEffect(() => () => cardGeometry.dispose(), [cardGeometry]);

  useEffect(
    () => () => {
      disposeCardMaterials(cardMaterials);
    },
    [cardMaterials],
  );

  useEffect(() => {
    const strap = strapRef.current;
    return () => strap?.geometry.dispose();
  }, []);

  /* eslint-disable react-hooks/immutability -- `runtime` is the deliberately
   * shared mutable bridge object between host and scene (Lanyard3dRuntime);
   * writing runtime.state inside the frame callback is the design, not render
   * mutation. */
  useFrame((_, rawDelta) => {
    // Fixed-step accumulator: the solver consumes whole 1/480 s substeps and
    // any backlog beyond one frame budget is dropped inside the accumulator,
    // so a stalled frame can never fast-forward the simulation.
    if (runtime.paused) {
      accumulatorRef.current = 0;
    } else {
      const advanced = advanceLanyard3dAccumulator(accumulatorRef.current, rawDelta);
      accumulatorRef.current = advanced.accumulator;
      if (advanced.consumedSeconds > 0) {
        runtime.state = stepLanyard3d(runtime.state, {
          dtSeconds: advanced.consumedSeconds,
          config: g.config,
          dragging: runtime.dragging,
          target: runtime.target,
        });
      }
    }

    // Card transform from the physics frame (right/up axes span the card).
    const frame = lanyard3dCardFrame(runtime.state);
    rightVector.set(frame.right.x, frame.right.y, frame.right.z);
    upVector.set(frame.up.x, frame.up.y, frame.up.z);
    normalVector.crossVectors(rightVector, upVector);
    basis.makeBasis(rightVector, upVector, normalVector);
    basis.setPosition(frame.center.x, frame.center.y, frame.center.z);
    const card = cardRef.current;
    if (card) {
      card.matrixAutoUpdate = false;
      card.matrix.copy(basis);
    }

    // Strap tube along the rope polyline.
    const strap = strapRef.current;
    if (strap) {
      const points = lanyard3dRopePoints(runtime.state).map(
        (point) => new THREE.Vector3(point.x, point.y, point.z),
      );
      const curve = new THREE.CatmullRomCurve3(points);
      const radius = 3 * g.worldPerPx;
      const next = new THREE.TubeGeometry(curve, 48, radius, 6, false);
      const previous = strap.geometry;
      strap.geometry = next;
      previous.dispose();
    }

    const clip = clipRef.current;
    if (clip) {
      const end = runtime.state.rope[runtime.state.rope.length - 1];
      if (end) {
        clip.matrixAutoUpdate = false;
        clip.matrix.copy(basis);
        clip.matrix.setPosition(end.position.x, end.position.y, end.position.z);
      }
    }

    // Host bookkeeping: perspective-projected card rect for the drag hit
    // proxy and the test-exposed pose attribute. The rect is the padded
    // footprint of the volumetric slab through the real camera — a z=0
    // planar bbox misses the magnified near corners by up to ~30 px at
    // entrance poses, which dropped drags near those corners.
    const corners: Vec3[] = [];
    for (const corner of runtime.state.corners) corners.push(corner.position);
    const rect = cardHitRect(
      g,
      camera,
      corners,
      normalVector,
      (g.config.cardHeight * CARD_THICKNESS_RATIO) / 2,
      8,
    );
    const tiltDeg = Math.acos(Math.min(1, Math.abs(frame.up.y))) * (180 / Math.PI);
    // Card orientation for the test-exposed pose: yaw about world Y, pitch of
    // the face normal off the horizontal plane, roll in-plane — the same
    // decomposition the physics telemetry suite asserts (X/Y/Z rotation
    // evidence for CP7 Refinement B). Existing parsers read parts [0..2] and
    // tolerate extras.
    const yawDeg = Math.atan2(normalVector.x, normalVector.z) * (180 / Math.PI);
    const pitchDeg =
      Math.atan2(normalVector.y, Math.hypot(normalVector.x, normalVector.z)) * (180 / Math.PI);
    const rollDeg = Math.atan2(rightVector.y, rightVector.x) * (180 / Math.PI);
    runtime.onFrame?.(
      rect,
      `${frame.center.x.toFixed(4)},${frame.center.y.toFixed(4)},${tiltDeg.toFixed(2)},${yawDeg.toFixed(2)},${pitchDeg.toFixed(2)},${rollDeg.toFixed(2)}`,
    );
  });
  /* eslint-enable react-hooks/immutability */

  return (
    <group>
      <ambientLight intensity={0.85} />
      <directionalLight position={[1, 1, 2]} intensity={0.55} />
      <directionalLight position={[-1, 0.5, 1]} intensity={0.2} />
      <directionalLight position={[-1, 1, -2]} intensity={0.8} />
      {/* Strap root ring */}
      <mesh position={[0, 0, 0]}>
        <ringGeometry args={[4 * g.worldPerPx, 8 * g.worldPerPx, 24]} />
        <meshStandardMaterial color={ringColor} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      {/* Strap */}
      <mesh ref={strapRef}>
        <meshStandardMaterial color={strapColor} roughness={0.55} side={THREE.DoubleSide} />
      </mesh>
      {/* Strap clip */}
      <group ref={clipRef}>
        <mesh position={[0, 12 * g.worldPerPx, 0]}>
          <boxGeometry args={[10 * g.worldPerPx, 10 * g.worldPerPx, 5 * g.worldPerPx]} />
          <meshStandardMaterial color="#151515" roughness={0.8} />
        </mesh>
        <mesh scale={[0.65, 1, 1]}>
          <torusGeometry args={[8 * g.worldPerPx, 1.8 * g.worldPerPx, 8, 24]} />
          <meshStandardMaterial color={clipColor} roughness={0.65} metalness={0.2} />
        </mesh>
        <mesh position={[0, -6 * g.worldPerPx, 0]}>
          <boxGeometry args={[15 * g.worldPerPx, 4 * g.worldPerPx, 12 * g.worldPerPx]} />
          <meshStandardMaterial color="#282828" roughness={0.75} />
        </mesh>
      </group>
      {/* Identity card — volumetric slab (textured front / matte back / sides) */}
      <mesh ref={cardRef} material={cardMaterials} geometry={cardGeometry} />
    </group>
  );
}

export interface LanyardSceneColors {
  strapColor: string;
  clipColor: string;
  ringColor: string;
}

export interface LanyardSceneAppProps {
  runtime: Lanyard3dRuntime;
  texture: THREE.CanvasTexture | null;
  colors: LanyardSceneColors;
  geometryVersion: number;
  paused: boolean;
}

/** Rendered by the lazy entry inside the host element. */
export function LanyardSceneApp({
  runtime,
  texture,
  colors,
  geometryVersion,
  paused,
}: LanyardSceneAppProps) {
  const { geometry } = runtime;
  const dpr = useMemo(() => clampConstellationDpr(window.devicePixelRatio), []);
  // Camera geometry, derived from the measured layout: the visible z=0 plane
  // must map 1:1 onto the canvas CSS pixels, and the camera must be a real
  // THREE.PerspectiveCamera instance (see createLanyard3dCamera for why an
  // options object breaks the view). R3F swaps the instance when the memo
  // produces a new one on geometryVersion changes (remeasure after image
  // load / resize), and the scene reads it back through useThree.
  const camera = useMemo(
    () => createLanyard3dCamera(geometry),
    // geometryVersion tracks measured-layout changes of the shared runtime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geometryVersion],
  );
  return (
    <div
      style={{
        position: 'absolute',
        top: -geometry.anchorRowPx,
        left: '50%',
        transform: 'translateX(-50%)',
        width: geometry.canvasWidth,
        height: geometry.canvasHeight,
        pointerEvents: 'none',
      }}
    >
      <Canvas
        flat
        dpr={dpr}
        frameloop={paused ? 'demand' : 'always'}
        gl={{ alpha: true, antialias: true }}
        camera={camera}
        style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
      >
        <Scene
          runtime={runtime}
          texture={texture}
          strapColor={colors.strapColor}
          clipColor={colors.clipColor}
          ringColor={colors.ringColor}
        />
      </Canvas>
    </div>
  );
}

/**
 * Draws the identity card's rendered content (background, border, clip,
 * portrait, name, title) into an offscreen canvas for the 3D card texture.
 */
export function drawCardTexture(card: HTMLElement): HTMLCanvasElement {
  const width = card.offsetWidth;
  const height = card.offsetHeight;
  const dpr = clampConstellationDpr(window.devicePixelRatio);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(width * dpr));
  canvas.height = Math.max(2, Math.round(height * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);

  const cardStyle = window.getComputedStyle(card);
  const radius = Number.parseFloat(cardStyle.borderRadius) || 12;
  // The DOM card paints its design-token surface (--color-card); the texture
  // used to hardcode the page background (#080808), so the 3D badge rendered
  // flat black while the approved DOM card was graphite. Reading the computed
  // colors keeps the canvas card and DOM card identical across token retunes.
  const background = cardStyle.backgroundColor;
  const border = cardStyle.borderColor;

  const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  roundRect(0, 0, width, height, radius);
  ctx.fillStyle = background;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = border;
  ctx.stroke();

  // Clip everything inside the card's rounded silhouette.
  ctx.save();
  roundRect(0, 0, width, height, radius);
  ctx.clip();

  const childRect = (element: HTMLElement) => ({
    left: element.offsetLeft,
    top: element.offsetTop,
    width: element.offsetWidth,
    height: element.offsetHeight,
  });

  // Metal clip at the card's top edge — its own computed surface and control
  // border, matching how the DOM clip differs from the card body.
  const clipElement = card.querySelector<HTMLElement>('.profile-card-clip');
  if (clipElement) {
    const clipStyle = window.getComputedStyle(clipElement);
    const rect = childRect(clipElement);
    roundRect(rect.left, rect.top, rect.width, rect.height, 5);
    ctx.fillStyle = clipStyle.backgroundColor;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = clipStyle.borderColor;
    ctx.stroke();
  }

  // Portrait with the same object-fit: contain behavior as the DOM card.
  const photo = card.querySelector<HTMLElement>('.profile-card-photo');
  const image = card.querySelector<HTMLImageElement>('.profile-card-photo img');
  if (photo) {
    const rect = childRect(photo);
    roundRect(rect.left, rect.top, rect.width, rect.height, 8);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = window.getComputedStyle(photo).backgroundColor;
    ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
    if (image && image.complete && image.naturalWidth > 0) {
      const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      ctx.drawImage(
        image,
        rect.left + (rect.width - drawWidth) / 2,
        rect.top + (rect.height - drawHeight) / 2,
        drawWidth,
        drawHeight,
      );
    }
    ctx.restore();
  }

  // Name and title text at the DOM elements' own positions.
  const drawText = (selector: string, fallbackSize: number, weight: string) => {
    const element = card.querySelector<HTMLElement>(selector);
    if (!element) return;
    const style = window.getComputedStyle(element);
    const size = Number.parseFloat(style.fontSize) || fallbackSize;
    ctx.font = `${style.fontWeight || weight} ${size}px ${style.fontFamily}`;
    ctx.fillStyle = style.color;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(element.textContent ?? '', element.offsetLeft, element.offsetTop + size);
  };
  drawText('.profile-card-name', 16, '600');
  drawText('.profile-card-title', 14, '400');

  ctx.restore();
  return canvas;
}

/** Reads the strap/clip/ring colors from the rendered DOM lanyard. */
export function readSceneColors(card: HTMLElement, shell: HTMLElement): LanyardSceneColors {
  const strapElement = shell.querySelector<SVGPolygonElement>('.profile-card-strap');
  const strapColor = strapElement
    ? window.getComputedStyle(strapElement).stroke
    : 'rgb(148, 148, 148)';
  const clipElement = card.querySelector<HTMLElement>('.profile-card-clip');
  const clipColor = clipElement
    ? window.getComputedStyle(clipElement).borderColor
    : 'rgb(148, 148, 148)';
  const ringElement = shell.querySelector<HTMLElement>('.profile-card-ring');
  const ringColor = ringElement ? window.getComputedStyle(ringElement).borderColor : strapColor;
  return { strapColor, clipColor, ringColor };
}
