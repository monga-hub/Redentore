import * as THREE from 'three';
import { loadModel } from '../core/models.ts';

// Hand-painted plants and garden props generated with Meshy AI (ATTRIBUTION.md), packed into
// one GLB: one node per asset, feet on y = 0, centred in plan, 1 m tall, base colour only
// (olive and fruit tree with their trunks lengthened at packing, so the crown clears the player's head).
// Props (props.ts) instances them like its own shapes. The level is built synchronously, so
// each batch starts on a box of the asset's footprint and takes the real mesh once the file
// has loaded; the headless checks (no document) keep the boxes as stand-ins.

/** Footprint per metre of height, [w, d], as packed. */
export const MODELS = {
  olive: [0.83, 0.57],
  fruitTree: [0.62, 0.53],
  cypress: [0.27, 0.29],
  bush: [1.14, 1.01],
  lavender: [1.48, 1.41],
  cabbage: [1.35, 1.1],
  lettuce: [1.78, 1.74],
  leek: [0.35, 0.29],
  artichoke: [0.44, 0.42],
  tomato: [0.59, 0.5],
  vine: [1.79, 1.62],
  pot: [0.73, 0.74],
  beehive: [0.55, 0.56],
} satisfies Record<string, [number, number]>;
export type Model = keyof typeof MODELS;

// Light through the leaves, as materials.ts LEAF_GLOW: a shaded side never goes black at night.
const GLOW = 0.06;
// Paint over a texture that reads wrong under the cold moonlight: the olive's is near grey
// (saturation 0.15), so it went ash-grey at night; warm and green it like the old crowns.
const PAINT: Partial<Record<Model, number>> = { olive: 0xc4e6a0 };

const boxes = new Map<Model, THREE.BufferGeometry>(), names = new Map<THREE.BufferGeometry, Model>();
/** Stand-in for `name` until the pack is in: its bounding box. */
export function proxy(name: Model): THREE.BufferGeometry {
  let g = boxes.get(name);
  if (!g) {
    const [w, d] = MODELS[name];
    boxes.set(name, (g = new THREE.BoxGeometry(w, 1, d).translate(0, 0.5, 0)));
    names.set(g, name);
  }
  return g;
}

/** The model a stand-in box belongs to, if it is one. */
export function modelOf(geo: THREE.BufferGeometry): Model | undefined {
  return names.get(geo);
}

let pack: Promise<Map<string, THREE.Mesh>> | undefined;
function load(): Promise<Map<string, THREE.Mesh>> {
  return (pack ??= loadModel('orto.glb').then((gltf) => {
    const out = new Map<string, THREE.Mesh>();
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      // Meshy exports read as metal (glTF default metallic 1) and unlit: make them painted matte.
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.metalness = 0;
      mat.roughness = 1;
      mat.color.set(PAINT[o.name as Model] ?? 0xffffff);
      mat.emissiveMap = mat.map;
      mat.emissive.copy(mat.color).multiplyScalar(GLOW);
      out.set(o.name, m);
    });
    return out;
  }));
}

/** Swaps an instanced batch of `name` from its stand-in box to the real mesh when loaded. */
export function dress(im: THREE.InstancedMesh, name: Model): void {
  if (typeof document === 'undefined') return;
  im.visible = false;
  load().then((meshes) => {
    const src = meshes.get(name)!, m = new THREE.Matrix4();
    im.geometry = src.geometry;
    im.material = src.material;
    // Meshopt quantises positions to [-1, 1] and leaves the way back on the node: carry it per instance.
    for (let i = 0; i < im.count; i++) im.setMatrixAt(i, im.getMatrixAt(i, m).multiply(src.matrixWorld));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.computeBoundingBox();
    im.visible = true;
  });
}
