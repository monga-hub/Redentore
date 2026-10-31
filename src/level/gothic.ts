import * as THREE from 'three';
import { loadModel } from '../core/models.ts';
import type { World } from '../core/physics.ts';
import { CHURCH_FLOOR as F } from './plan.ts';

// "Stile Diablo" dressing: gothic clutter generated with Meshy AI (ATTRIBUTION.md), packed in
// gotico.glb (one node per asset, feet on y = 0, 1 m tall): skull heaps and bones in the church
// chapels, the crossing and the cloister corners, candelabra by the chapel altars, coffins,
// a graveyard of tombstones on the lawns of the chiostro grande and the cortile degli ulivi,
// a gibbet cage and fallen columns (the braziers are fx/torches.ts's own Meshy iron).
// Visual only, no colliders (the layout and the walkable map are untouched): kept to corners,
// wall feet, lawns and dead ends. Loaded the first time the Diablo view is switched on.

type Model = 'skulls' | 'bones' | 'candelabrum' | 'coffin' | 'gravestone' | 'column' | 'cage';

/** [model, x, z, floor hint, yaw, height m]: the floor is read from the colliders under the spot. */
type Spot = [Model, number, number, number, number, number];

const L = 11.3; // church chapels: x of the corners against the outer walls
const SPOTS: Spot[] = [];
for (const s of [-1, 1]) {
  // Church: skull heaps in the chapel corners, candelabra flanking the middle altars, a coffin in the last chapels.
  SPOTS.push(['skulls', L * s, -1.3, F, 0.6 * s, 0.75], ['skulls', L * s, -26.7, F, -0.4 * s, 0.7], ['skulls', L * s, -17.6, F, 0.9 * s, 0.55]);
  SPOTS.push(['candelabrum', 11.1 * s, -11.9, F, 0, 1.9], ['candelabrum', 11.1 * s, -16.1, F, 0.4, 1.9]);
  SPOTS.push(['coffin', 10 * s, -23.3, F, Math.PI / 2 + 0.15 * s, 0.62]);
  // Crossing: heaps in the apse corners, bones strewn round the boss's floor.
  SPOTS.push(['skulls', 11.6 * s, -30.3, F, 0.3, 0.8], ['skulls', 11.6 * s, -43.7, F, 2.2, 0.7]);
  SPOTS.push(['candelabrum', 6.2 * s, -44, F, 0, 1.9]);
}
SPOTS.push(
  ['bones', -5.5, -33.5, F, 0.4, 0.22], ['bones', 6, -40.5, F, 2.1, 0.22], ['bones', -7.5, -41.5, F, 4, 0.2], ['bones', 3.2, -31.6, F, 1.2, 0.2], ['bones', 9, -36, F, 5.2, 0.22],
  ['bones', -6.4, -12.3, F, 0.8, 0.2], ['bones', 6.4, -21, F, 3.3, 0.2], ['bones', -0.9, -5.5, F, 2.5, 0.18],
  // Chiostro grande: a graveyard on the lawns, a fallen column, the gibbet in the north-east walk.
  ['gravestone', -11.3, -80.6, 0, 0.2, 1.3], ['gravestone', -7.8, -79.6, 0, -0.18, 1.2], ['gravestone', -4.1, -81, 0, 0.1, 1.35], ['gravestone', -0.6, -79.4, 0, -0.3, 1.15],
  ['gravestone', 7.8, -80.1, 0, 0.25, 1.3], ['gravestone', -11.6, -66.2, 0, -0.2, 1.25], ['gravestone', -7.6, -67.8, 0, 0.15, 1.2], ['gravestone', -3.9, -65.6, 0, -0.1, 1.3],
  ['gravestone', 7.6, -66.6, 0, 0.2, 1.25], ['gravestone', 8.1, -70.8, 0, -0.25, 1.15],
  ['column', -8.2, -71.2, 0, 1.2, 0.8], ['cage', 11.6, -84.5, 0, 0.7, 1.9], ['skulls', -15.8, -84.8, 0, 0.8, 0.7], ['bones', -9, -84.6, 0, 0.3, 0.2],
  // Chiostro mediano and ovest, chiostrino, corridoio: heaps in corners, bones underfoot, a coffin.
  ['skulls', -29.9, -78.9, 0, 0.5, 0.65], ['skulls', -18.2, -57.2, 0, 3.6, 0.65], ['bones', -24, -70.5, 0, 1.7, 0.2],
  ['skulls', -45.8, -78.8, 0, 0.9, 0.7], ['coffin', -42, -66.5, 0, 0.1, 0.62], ['bones', -42, -73.5, 0, 2.4, 0.2],
  ['skulls', -35.8, -52.8, 0, 0.2, 0.6], ['bones', -26, -46, 0, 1.1, 0.2],
  ['bones', -34, -62, 0, 0.6, 0.2], ['bones', -33.6, -77.5, 0, 2.9, 0.2], ['candelabrum', -36.2, -66, 0, 0, 1.85], ['candelabrum', -36.2, -74, 0, 0, 1.85],
  // Cortile degli ulivi: tombstones among the olives.
  ['gravestone', -35.6, -27.2, 0, 0.3, 1.2], ['gravestone', -35.3, -36.1, 0, -0.2, 1.25], ['gravestone', -28, -31.2, 0, 0.15, 1.2], ['gravestone', -27.8, -39.4, 0, -0.3, 1.3],
  // The pontile: bones round the chest, a cage at the end of the riva.
  ['skulls', -37.3, -193.6, 0, 0.4, 0.55], ['bones', -33.2, -190, 0, 1.4, 0.2], ['cage', -44.3, -184.6, 0, 2.6, 1.9],
);

// Light through the dark, as level/models.ts: a shaded side never goes black at night.
const GLOW = 0.08;

export class GothicDressing {
  readonly root = new THREE.Group();
  private loading?: Promise<void>;
  private on = false;

  private readonly world: World;

  constructor(world: World) {
    this.world = world;
    this.root.name = 'gothic';
    this.root.visible = false;
  }

  /** Show or hide; the first show loads the models. */
  show(on: boolean): void {
    this.on = on;
    if (on) this.loading ??= this.load();
    this.root.visible = on && this.root.children.length > 0;
  }

  private async load(): Promise<void> {
    const gltf = await loadModel('gotico.glb').catch((e) => { console.error('gothic props failed to load', e); return undefined; });
    if (!gltf) return;
    gltf.scene.updateMatrixWorld(true);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
    gltf.scene.traverse((o) => {
      const src = o as THREE.Mesh;
      if (!src.isMesh) return;
      const mine = SPOTS.filter((t) => t[0] === src.name);
      if (!mine.length) return;
      const mat = src.material as THREE.MeshStandardMaterial;
      mat.metalness = 0;
      mat.roughness = 1;
      mat.emissiveMap = mat.map;
      mat.emissive.setScalar(GLOW);
      const im = new THREE.InstancedMesh(src.geometry, mat, mine.length);
      mine.forEach(([, x, z, hint, yaw, h], i) => {
        const g = this.world.groundAt(x, z, hint + 0.3);
        m.compose(p.set(x, g > -Infinity ? g : hint, z), q.setFromAxisAngle(up, yaw), s.setScalar(h));
        im.setMatrixAt(i, m.multiply(src.matrixWorld)); // meshopt's dequantisation lives on the node
      });
      im.castShadow = im.receiveShadow = true;
      im.computeBoundingSphere();
      this.root.add(im);
    });
    this.show(this.on);
  }
}
