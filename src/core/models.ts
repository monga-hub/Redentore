import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { PHONE } from './device.ts';

// Loading and posing the Meshy characters (see ATTRIBUTION.md): meshopt/WebP GLBs, biped rigs
// facing +Z, props held in the right fist.

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

/** A GLB under public/models/ (Vite's base); on a phone its textures at half size. */
export async function loadModel(file: string): Promise<GLTF> {
  const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${file}`);
  if (PHONE) await halve(gltf.scene);
  return gltf;
}

const MAX_PHONE = 512;
/**
 * Every texture of `root` wider than `MAX_PHONE` px scaled down by half, the decoded original freed:
 * a quarter of the memory, on the GPU and off it. The Meshy bodies' 1024 px maps came to ~64 MB of
 * the GPU budget a phone has, for detail its screen can't show at a character's size.
 */
async function halve(root: THREE.Object3D): Promise<void> {
  const maps = new Set<THREE.Texture>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m) for (const x of Array.isArray(m) ? m : [m]) for (const v of Object.values(x)) if (v instanceof THREE.Texture) maps.add(v);
  });
  await Promise.all([...maps].map(async (t) => {
    const img = t.image as ImageBitmap | HTMLImageElement | undefined;
    if (!img || img.width <= MAX_PHONE) return;
    try {
      t.image = await createImageBitmap(img, { resizeWidth: img.width / 2, resizeHeight: img.height / 2, resizeQuality: 'high' });
      if (img instanceof ImageBitmap) img.close();
      t.needsUpdate = true;
    } catch { /* keep the full size */ }
  }));
}

/** Stand a Meshy body `height` m tall on y = 0, facing the game's yaw 0 (-Z; the models face +Z). */
export function stand(scene: THREE.Group, height: number): void {
  scene.rotation.y = Math.PI;
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene); // bind pose
  const k = height / (box.max.y - box.min.y);
  scene.scale.setScalar(k);
  scene.position.y = -box.min.y * k;
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = true;
    if (!(o instanceof THREE.SkinnedMesh)) return;
    // Culled (from the view and from the shadow map) on generous bounds of the posed body, kept by
    // every clone: swings, casts and falls reach past the pose they are taken in.
    o.skeleton.update();
    o.computeBoundingSphere();
    o.boundingSphere!.radius *= 1.6;
  });
}

/**
 * Put `prop` (a Meshy prop, upright in its file) in the stood body's right fist, `length` m long
 * and held `grip` of the way up, its length along the hand bone's +Z: across the fist, so it
 * stands up in the idle and prayer poses and points ahead in a cast. Returns its top end, where
 * the hoe's blade or a staff's crystal is.
 * `tilt` (radians) leans it from across the fist toward the fingers, as a one-handed weapon hangs.
 */
export function arm(scene: THREE.Group, prop: THREE.Group, length: number, grip: number, tilt = 0): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(prop), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const k = length / size.y;
  prop.scale.setScalar(k);
  prop.position.set(-c.x * k, -(box.min.y + grip * size.y) * k, -c.z * k); // the grip at the origin
  prop.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
  const held = new THREE.Group(), top = new THREE.Object3D();
  held.name = 'held';
  top.position.y = (1 - grip) * length;
  held.add(prop, top);
  const hand = scene.getObjectByName('RightHand')!, fore = scene.getObjectByName('RightForeArm')!;
  const wrist = hand.getWorldPosition(new THREE.Vector3()), elbow = fore.getWorldPosition(new THREE.Vector3());
  held.position.copy(wrist).addScaledVector(wrist.clone().sub(elbow).normalize(), 0.08 * length); // in the palm, past the wrist
  hand.attach(held);
  held.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt)));
  return top;
}

// Bones above the hips: what a layered one-shot moves while the legs keep their own clip.
export const UPPER = /^(Spine|neck|Head|head|Left(Shoulder|Arm|ForeArm|Hand)|Right(Shoulder|Arm|ForeArm|Hand))/;
/** Weight that gives an action share `k` of a track the base clip (total weight 1) also drives. */
export const over = (k: number) => k / (1 - Math.min(k, 0.99));

/**
 * Upper-body one-shots over a body's base clip (flinches, a war cry): the legs keep running or
 * standing as they were. One plays at a time; `play` from `from` s into the clip to `stop`.
 */
export class Overlay {
  private acts = new Map<string, THREE.AnimationAction>();
  private cur?: { a: THREE.AnimationAction; t: number; end: number; out: number };

  constructor(mixer: THREE.AnimationMixer, clips: THREE.AnimationClip[], names: string[]) {
    for (const n of names) {
      const c = THREE.AnimationClip.findByName(clips, n);
      if (!c) continue;
      const a = mixer.clipAction(new THREE.AnimationClip(`${n}_upper`, c.duration, c.tracks.filter((t) => UPPER.test(t.name))));
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      this.acts.set(n, a);
    }
  }

  has(name: string): boolean {
    return this.acts.has(name);
  }

  get busy(): boolean {
    return !!this.cur;
  }

  play(name: string, from: number, stop: number, rate = 1): void {
    const a = this.acts.get(name);
    if (!a) return;
    this.cur?.a.stop();
    a.reset().setEffectiveWeight(0).play();
    a.time = from;
    a.timeScale = rate;
    this.cur = { a, t: 0, end: (stop - from) / rate, out: Math.min(0.25, (stop - from) / rate / 3) };
  }

  /** Before the mixer's update. `cut`: drop it now (the body went into an attack or died). */
  update(dt: number, cut = false): void {
    const c = this.cur;
    if (!c) return;
    const t = (c.t += dt);
    if (cut || t >= c.end) { c.a.stop(); this.cur = undefined; return; }
    c.a.setEffectiveWeight(over(Math.max(0, Math.min(1, t / 0.06, (c.end - t) / c.out))));
  }
}

/** m: a mob farther than this from the hero casts no shadow. The moon's shadow box spans ±45 m, but a far body's shadow isn't worth its draw calls. */
export const SHADOW_FAR = 30;

/** A body's shadow casters, switched on and off together by distance (see SHADOW_FAR). */
export class Shadows {
  private meshes: THREE.Object3D[] = [];
  private on = true;

  constructor(root: THREE.Object3D) {
    root.traverse((o) => { if (o.castShadow) this.meshes.push(o); });
  }

  /** `d`: m from the hero. */
  update(d: number): void {
    const on = d < SHADOW_FAR;
    if (on === this.on) return;
    this.on = on;
    for (const m of this.meshes) m.castShadow = on;
  }
}
