import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { NATIVE_CHARACTERS, nativeCharacter, nativeAppearance, freeCharacter } from '../src/player/native-character.ts';
import { HERO_IDS, HEROES } from '../src/player/heroes.ts';
import { outfitChoices } from '../src/loot/gear.ts';
import { UndeadModel } from '../src/player/undead.ts';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(parser => ({ name: 'without-images', beforeRoot() { parser.json.materials = parser.json.materials?.map(() => ({})); return null; } }));
const parse = (file: string) => { const b = fs.readFileSync('public/models/' + file); return loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), ''); };
for (const hero of HERO_IDS) for (const chapter of [1, 2, 3] as const) {
  const entry = NATIVE_CHARACTERS[`${hero}-${chapter}`];
  for (const [rarity, finish] of [['noncomune', 'green'], ['raro', 'blue'], ['epico', 'epic']] as const) {
    const builds = outfitChoices(hero, chapter, rarity); assert.equal(builds.length, 3);
    for (const item of builds) {
      assert.equal(nativeCharacter(hero, { abito: item.id }), entry, `${item.id} resolves its own chapter`);
      assert.equal(nativeAppearance(hero, { abito: item.id }), entry ? finish : undefined);
    }
  }
  for (const item of outfitChoices(hero, chapter, 'comune')) assert.equal(nativeCharacter(hero, { abito: item.id }), undefined);
  assert.equal(nativeCharacter(hero, { torso: 'tunica-peste' }), undefined);
  if (!entry) continue;
  const meta = JSON.parse(fs.readFileSync('public/models/' + entry.file.replace('.glb', '.json'), 'utf8'));
  assert.equal(createHash('sha256').update(fs.readFileSync('public/models/' + entry.file)).digest('hex'), meta.sha256);
  assert.equal(entry.walk, meta.paceMetresPerSecond.walk); assert.equal(entry.run, meta.paceMetresPerSecond.run);
  const gltf = await parse(entry.file); let triangles = 0;
  gltf.scene.traverse(o => {
    if (!(o instanceof THREE.SkinnedMesh)) return;
    triangles += o.geometry.index!.count / 3;
    assert.deepEqual(o.skeleton.bones.map(b => b.name), meta.nativeBones);
    const p = o.geometry.attributes.position, j = o.geometry.attributes.skinIndex, w = o.geometry.attributes.skinWeight;
    for (let i = 0; i < p.count; i++) {
      assert.ok([p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite)); let sum = 0;
      for (let k = 0; k < 4; k++) { assert.ok(j.getComponent(i, k) < o.skeleton.bones.length); sum += w.getComponent(i, k); }
      assert.ok(Math.abs(sum - 1) < 1e-5);
    }
  });
  assert.equal(triangles, meta.triangles);
  for (const name of Object.keys(meta.mapping)) {
    const clip = THREE.AnimationClip.findByName(gltf.animations, name); assert.ok(clip, name);
    for (const track of clip.tracks) {
      assert.ok(gltf.scene.getObjectByName(THREE.PropertyBinding.parseTrackName(track.name).nodeName));
      assert.ok(Array.from(track.values).every(Number.isFinite));
      for (let i = 1; i < track.times.length; i++) assert.ok(track.times[i] > track.times[i - 1]);
    }
  }
  freeCharacter(gltf.scene);
  const actor = new UndeadModel(hero, true, parse), internal = actor as unknown as { visualKey: string; requestedKey: string };
  const wait = async (file: string) => { for (let i = 0; internal.visualKey !== file; i++) { assert.ok(i < 400, `${hero} swap settles`); await new Promise(r => setTimeout(r, 5)); } };
  actor.wear({ abito: outfitChoices(hero, chapter, 'epico')[0].id }); await wait(entry.file);
  actor.present();
  let skin!: THREE.SkinnedMesh; actor.root.traverse(o => { if (o instanceof THREE.SkinnedMesh && !o.userData.aura) skin ??= o; });
  if (hero === 'tizian' && chapter === 1) {
    const scene = actor.root.children[0];
    for (const [rarity, metalness, roughness, relief] of [['noncomune', .25, .88, .7], ['raro', .5, .62, 1], ['epico', .72, .42, 1.2]] as const) {
      actor.wear({ abito: outfitChoices(hero, chapter, rarity)[0].id });
      const material = skin.material as THREE.MeshStandardMaterial;
      assert.equal(actor.root.children[0], scene, 'Finishes retain the accepted complete geometry');
      assert.equal(material.metalness, metalness); assert.equal(material.roughness, roughness);
      assert.deepEqual(material.normalScale.toArray(), [relief, relief]);
      assert.equal(material.onBeforeCompile, THREE.Material.prototype.onBeforeCompile, 'Source colors and original relief need no engraving or recolor shader');
    }
  }
  const rest = skin.geometry.attributes.aTierRest, boot = skin.geometry.attributes.aBoot;
  let maxY = 0, boots = 0; for (let i = 0; i < rest.count; i++) { maxY = Math.max(maxY, rest.getY(i)); boots += boot.getX(i); }
  assert.ok(maxY > 1.7 && maxY < 2, 'Finish regions normalize own height to metres');
  assert.ok(boots > 0 && boots / boot.count < .35);
  for (let i = 0; i < skin.geometry.attributes.position.count; i += 31) {
    const p = new THREE.Vector3().fromBufferAttribute(skin.geometry.attributes.position, i).applyMatrix4(skin.bindMatrix).applyMatrix4(actor.root.children[0].matrixWorld);
    const v = skin.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(skin.matrixWorld);
    assert.ok(p.distanceTo(v) < .00001, 'Native selector preserves its own inverse-bind pose');
  }
  actor.animate(.1, 4.2, true, 4.2); actor.play('slash1', .2); actor.animate(.2, 0, true);
  actor.wear({ abito: outfitChoices(hero, chapter, 'comune')[0].id }); await wait(HEROES[hero].file);
  actor.wear({ abito: outfitChoices(hero, chapter, 'raro')[2].id }); await wait(entry.file);
  actor.dispose(); freeCharacter(actor.root);
}
console.log('native chapters: all three stat builds/finishes, unfinished fallback, exact shipped hashes/skin/clips, native neutral pose, normalized finish regions and white/native swaps');
