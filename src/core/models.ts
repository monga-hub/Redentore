import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Loading and posing the Meshy characters (see ATTRIBUTION.md): meshopt/WebP GLBs, biped rigs
// facing +Z, props held in the right fist.

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

/** A GLB under public/models/ (Vite's base). */
export function loadModel(file: string): Promise<GLTF> {
  return loader.loadAsync(`${import.meta.env.BASE_URL}models/${file}`);
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
    o.frustumCulled = false; // skinned: bind-pose bounds don't follow the animation
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
