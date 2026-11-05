import assert from 'node:assert/strict';
import * as THREE from 'three';
import { UndeadModel } from '../src/player/undead.ts';
import { nativeAppearance, NATIVE_FOSCA, freeCharacter } from '../src/player/native-character.ts';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GearState } from '../src/loot/gear.ts';
const worn = (rarity: string): GearState => ({ abito: `abito-fosca-untora-3-${rarity}` });
assert.equal(nativeAppearance('fosca', worn('epico')), 'epic');
assert.equal(nativeAppearance('fosca', worn('raro')), 'blue');
assert.equal(nativeAppearance('fosca', worn('noncomune')), 'green');
for (const r of ['comune', 'leggendario']) assert.equal(nativeAppearance('fosca', worn(r)), undefined);
assert.equal(nativeAppearance('bortolo', worn('epico')), undefined);
assert.equal(nativeAppearance('fosca', { abito: 'abito-fosca-untora-2-epico' }), undefined);
const names = ['Idle_Breathe','Idle_Combat','Idle','Walking','Run_Charge','Jump_Run','Right_Hand_Sword_Slash','Slash_Back','Smash','Judgment','Cast_Throw','Cast_Spread','Ground_Slam','Scream','Roll','Cast_Push','Cast_Raise','Execute','Leap','Victory','Hit_Light','Hit_Heavy','Cast_Channel','Cast_Gather','Spin','Rush','Death'];
function fixture() {
  const scene = new THREE.Group(), hips = new THREE.Bone(); hips.name = 'Hips';
  for (const n of ['Head', 'LeftArm', 'RightArm', 'LeftHand', 'RightHand', 'RightForeArm']) { const b = new THREE.Bone(); b.name = n; hips.add(b); }
  const geo = new THREE.BoxGeometry(.4, 1.85, .2).translate(0, .925, 0), n = geo.attributes.position.count;
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
  const weights = new Float32Array(n * 4); for (let i = 0; i < n; i++) weights[i * 4] = 1;
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial()); mesh.add(hips);mesh.bind(new THREE.Skeleton([hips, ...hips.children as THREE.Bone[]]));scene.add(mesh);
  const animations = names.map(name => new THREE.AnimationClip(name, 4, [new THREE.QuaternionKeyframeTrack('Head.quaternion', [0, 4], [0,0,0,1, .1,0,0,.995])]));
  return { scene, animations } as GLTF;
}
const jobs: { file: string; resolve: (g: GLTF) => void }[] = [];
const load = (file: string) => new Promise<GLTF>(resolve => jobs.push({file,resolve}));
const model = new UndeadModel('fosca', true, load);
model.wear(worn('epico')); assert.deepEqual(jobs.map(j => j.file), ['fosca.glb', NATIVE_FOSCA]);
model.wear(worn('raro'));assert.equal(jobs.length, 2, 'Rarity uses the same native geometry request');
const native = fixture();jobs[1].resolve(native);await new Promise(r => setTimeout(r, 0));
assert.equal(model.root.children[0], native.scene);
model.animate(.1, 0, true);model.animate(.1, 4.2, true, 4.2);assert.ok(model.gait >= 0);
model.play('slash1', .2);model.animate(.2, 4.2, true, 4.2);model.play('throw', .2);model.channel(true);model.animate(.2, 0, true);model.die();model.animate(.3, 0, true);model.revive();model.animate(.1, 0, true);
model.wear(worn('comune'));assert.equal(model.root.children[0], native.scene, 'White waits atomically for the complete replacement');
model.wear(worn('epico'));assert.equal(jobs.length, 3, 'Returning to the visible native cancels white without downloading it twice');
const stale = fixture();let freed = 0;(stale.scene.children[0] as THREE.Mesh).geometry.addEventListener('dispose', () => freed++);
jobs[2].resolve(stale);await new Promise(r => setTimeout(r, 0));assert.equal(freed, 1, 'Stale white result released');
model.wear(worn('comune'));
const late = fixture();let lateFreed = 0;(late.scene.children[0] as THREE.Mesh).geometry.addEventListener('dispose', () => lateFreed++);
model.dispose();jobs[3].resolve(late);await new Promise(r => setTimeout(r, 0));assert.equal(lateFreed, 1, 'Disposed actor rejects late native result');
freeCharacter(model.root);jobs[0].resolve(fixture());await new Promise(r => setTimeout(r, 0));
console.log('native character: pilot key boundaries, one native asset across rarities, complete atomic swap, locomotion/actions/death, stale loads and disposal');

// Exercise the shipped native skin and clips, without browser image decoding.
const fs = await import('node:fs');
const { createHash } = await import('node:crypto');
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(parser => ({ name: 'without-images', beforeRoot() { parser.json.materials = parser.json.materials?.map(() => ({})); return null; } }));
const parse = async (path: string) => { const b = fs.readFileSync(path); return loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), ''); };
const asset = await parse(`public/models/${NATIVE_FOSCA}`), legacy = await parse('public/models/fosca.glb');
const meta = JSON.parse(fs.readFileSync('public/models/native-characters/fosca-3.json', 'utf8'));
assert.equal(createHash('sha256').update(fs.readFileSync(`public/models/${NATIVE_FOSCA}`)).digest('hex'), meta.sha256);
let triangles = 0, nativeBody!: THREE.SkinnedMesh, oldBody!: THREE.SkinnedMesh;
asset.scene.traverse(o => {
  if (!(o instanceof THREE.SkinnedMesh)) return;
  nativeBody = o;triangles += o.geometry.index!.count / 3;
  assert.equal(o.skeleton.bones.length, 24);
  const p = o.geometry.attributes.position, j = o.geometry.attributes.skinIndex, w = o.geometry.attributes.skinWeight;
  for (let i = 0; i < p.count; i++) {
    assert.ok([p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite));
    let sum = 0;
    for (let k = 0; k < 4; k++) { assert.ok(j.getComponent(i, k) < 24); sum += w.getComponent(i, k); }
    assert.ok(Math.abs(sum - 1) < 1e-5);
  }
});
legacy.scene.traverse(o => { if (o instanceof THREE.SkinnedMesh) oldBody ??= o; });
assert.equal(triangles, 28786, 'Complete fresh native mesh, without the published cut garment or original hands');
assert.notDeepEqual(nativeBody.skeleton.boneInverses.map(m => m.elements), oldBody.skeleton.boneInverses.map(m => m.elements));
for (const name of names) {
  const clip = THREE.AnimationClip.findByName(asset.animations, name);assert.ok(clip, name);
  for (const track of clip.tracks) {
    assert.ok(asset.scene.getObjectByName(THREE.PropertyBinding.parseTrackName(track.name).nodeName));
    assert.ok(Array.from(track.values).every(Number.isFinite));
    for (let i = 1; i < track.times.length; i++) assert.ok(track.times[i] > track.times[i - 1]);
  }
}
const root = new THREE.Group(), owned = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()), borrowed = new THREE.MeshBasicMaterial();
const twin = new THREE.Mesh(owned.geometry, borrowed);owned.userData.twin = twin;owned.add(twin);root.add(owned);
let borrowedFreed = 0, ownedFreed = 0;borrowed.addEventListener('dispose', () => borrowedFreed++);owned.geometry.addEventListener('dispose', () => ownedFreed++);
freeCharacter(root);assert.equal(borrowedFreed, 0, 'X-ray material belongs to the shared effect');assert.equal(ownedFreed, 1, 'Body and twin release their shared geometry once');
console.log('native asset: exact hash, complete topology, own inverse binds, finite normalized skin, all 27 semantic clips, borrowed x-ray resource ownership');

const swapping = new UndeadModel('fosca', true, file => parse(`public/models/${file}`));
const internal = swapping as unknown as { visualKey?: string; playing?: { layer: { upper: THREE.AnimationAction }; t: number } };
swapping.wear(worn('epico'));
const settle = async (key: string) => {
  for (let i = 0; internal.visualKey !== key; i++) { assert.ok(i < 200, 'Replacement settles'); await new Promise(r => setTimeout(r, 5)); }
};
await settle(NATIVE_FOSCA);
let taggedBody!: THREE.SkinnedMesh;
swapping.root.traverse(o => { if (o instanceof THREE.SkinnedMesh && !o.userData.aura) taggedBody ??= o; });
const restTag = taggedBody.geometry.attributes.aTierRest, bootTag = taggedBody.geometry.attributes.aBoot;
let restTop = 0, boots = 0;
for (let i = 0; i < restTag.count; i++) { restTop = Math.max(restTop, restTag.getY(i)); boots += bootTag.getX(i); }
assert.ok(restTop > 1.8 && restTop < 1.9, 'Finish coordinates use the native metre bind frame, not the centimetre mesh node scale');
assert.ok(boots > 0 && boots / bootTag.count < .3, 'Boot finish must not repaint the entire new character');
const stageParent = new THREE.Group();stageParent.position.set(3, 1, -2);stageParent.rotation.y = .6;stageParent.add(swapping.root);stageParent.updateMatrixWorld(true);
swapping.present();
let referenceError = 0;
swapping.root.traverse(o => {
  if (!(o instanceof THREE.SkinnedMesh) || o.userData.aura) return;
  const v = new THREE.Vector3(), expected = new THREE.Vector3(), p = o.geometry.attributes.position;
  for (let i = 0; i < p.count; i += 101) {
    // Meshy exports metre positions beneath a centimetre Armature; the skin bind frame supplies the scale.
    expected.fromBufferAttribute(p, i).applyMatrix4(o.bindMatrix).applyMatrix4(swapping.root.children[0].matrixWorld);
    o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld);
    referenceError = Math.max(referenceError, expected.distanceTo(v));
  }
});
assert.ok(referenceError < 1e-5, 'Selector preserves the actual NEW reference anatomy under a transformed Armature parent');
const posed = swapping as unknown as { mixer: THREE.AnimationMixer };
const beforePose = swapping.root.getObjectByName('Head')!.quaternion.clone(), beforeClock = posed.mixer.time;
swapping.present();
assert.equal(posed.mixer.time, beforeClock, 'Repeated selector presentation does not advance the mixer');
assert.ok(beforePose.equals(swapping.root.getObjectByName('Head')!.quaternion), 'Selector pose remains still');
swapping.animate(.1, 4.2, true, 4.2);
assert.ok(posed.mixer.time > beforeClock && swapping.gait >= 0, 'Normal gameplay animation resumes without a paused mixer');
swapping.animate(.3, 0, true);swapping.play('slash1', .2);swapping.animate(.07, 0, true);
const actionTime = internal.playing!.layer.upper.time, elapsed = internal.playing!.t;
assert.ok(actionTime > .38);
swapping.wear(worn('comune'));await settle('fosca.glb');
assert.equal(internal.playing!.layer.upper.time, actionTime, 'Native to white preserves the strike pose before the old mixer resets');
assert.equal(internal.playing!.t, elapsed, 'Equip never restarts the gameplay strike timer');
swapping.wear(worn('epico'));await settle(NATIVE_FOSCA);
assert.equal(internal.playing!.layer.upper.time, actionTime, 'White to native preserves the strike pose');
swapping.dispose();freeCharacter(swapping.root);
console.log('native swap: real legacy/native rigs preserve in-flight action pose and timing in both directions');
