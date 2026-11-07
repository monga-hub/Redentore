import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { NATIVE_CHARACTERS, NATIVE_STARTERS, nativeCharacter, nativeAppearance, freeCharacter } from '../src/player/native-character.ts';
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
  for (const item of outfitChoices(hero, chapter, 'comune')) assert.equal(nativeCharacter(hero, { abito: item.id }), NATIVE_CHARACTERS[NATIVE_STARTERS[hero]]);
  assert.equal(nativeCharacter(hero, { torso: 'tunica-peste' }), NATIVE_CHARACTERS[NATIVE_STARTERS[hero]]);
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
  if (entry.finishes) {
    const scene = actor.root.children[0];
    const contract = hero !== 'bortolo'
      ? [['noncomune', .25, .88, .7], ['raro', .5, .62, 1], ['epico', .72, .42, 1.2]] as const
      : [['noncomune', .2, .9, .7], ['raro', .48, .64, 1], ['epico', .72, .44, 1.2]] as const;
    for (const [rarity, metalness, roughness, relief] of contract) {
      actor.wear({ abito: outfitChoices(hero, chapter, rarity)[0].id });
      const material = skin.material as THREE.MeshStandardMaterial;
      assert.equal(actor.root.children[0], scene, 'Finishes retain the accepted complete geometry');
      assert.equal(material.metalness, metalness); assert.equal(material.roughness, roughness);
      // GLTFLoader flips normalScale.y on meshes shipped without tangents; the finish only scales its magnitude.
      assert.deepEqual(material.normalScale.toArray().map(Math.abs), [relief, relief]);
      assert.equal(material.onBeforeCompile, THREE.Material.prototype.onBeforeCompile, 'Source colors and original relief need no engraving or recolor shader');
    }
  }
  const rest = skin.geometry.attributes.aTierRest, boot = skin.geometry.attributes.aBoot;
  let maxY = 0, boots = 0; for (let i = 0; i < rest.count; i++) { maxY = Math.max(maxY, rest.getY(i)); boots += boot.getX(i); }
  assert.ok(maxY > 1.7 && maxY < 2, 'Finish regions normalize own height to metres');
  assert.ok(boots > 0 && boots / boot.count < .35);
  // The selector holds the native idle: arms hang relaxed, hands well under the shoulders and near the body (not the bind T/A pose).
  actor.root.updateWorldMatrix(true, true);
  const at = (name: string) => actor.root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
  for (const side of ['Left', 'Right']) {
    const shoulder = at(`${side}Arm`), hand = at(`${side}Hand`), drop = shoulder.y - hand.y, out = Math.hypot(hand.x - shoulder.x, hand.z - shoulder.z);
    assert.ok(drop > .4 && out < .2, `${hero}-${chapter} ${side} arm hangs relaxed (drop ${drop.toFixed(2)}, out ${out.toFixed(2)})`);
  }
  actor.animate(.1, 4.2, true, 4.2); actor.play('slash1', .2); actor.animate(.2, 0, true);
  const nativeBinds = skin.skeleton.boneInverses.map(m => m.elements);
  const legacy = await parse(HEROES[hero].file);
  const legacySkin = legacy.scene.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh;
  assert.notDeepEqual(nativeBinds, legacySkin.skeleton.boneInverses.map(m => m.elements), 'Accepted chapter owns its new rig');
  freeCharacter(legacy.scene);
  actor.wear({ abito: outfitChoices(hero, chapter, 'comune')[0].id }); await wait(NATIVE_CHARACTERS[NATIVE_STARTERS[hero]]!.file);
  actor.wear({ abito: outfitChoices(hero, chapter, 'raro')[2].id }); await wait(entry.file);
  actor.dispose(); freeCharacter(actor.root);
}
console.log('native chapters: all three stat builds/finishes, unfinished fallback, exact shipped hashes/skin/clips, relaxed native idle pose, normalized finish regions and white/native swaps');

for (const hero of HERO_IDS) {
  const chapters = ([1, 2, 3] as const).filter(chapter => NATIVE_CHARACTERS[`${hero}-${chapter}`]);
  const actor = new UndeadModel(hero, true, parse), root = actor.root;
  const state = actor as unknown as { visualKey: string; playing?: { layer: { upper: THREE.AnimationAction } } };
  for (const chapter of [...chapters, ...[...chapters].reverse()]) {
    const entry = NATIVE_CHARACTERS[`${hero}-${chapter}`]!;
    const time = state.playing?.layer.upper.time;
    actor.wear({ abito: outfitChoices(hero, chapter, 'epico')[1].id });
    for (let i = 0; state.visualKey !== entry.file; i++) { assert.ok(i < 400); await new Promise(r => setTimeout(r, 5)); }
    assert.equal(actor.root, root, 'Native chapter swap preserves the game actor root');
    assert.equal(root.children.length, 1, 'Only the complete current representation remains');
    if (time !== undefined) assert.ok(Math.abs(state.playing!.layer.upper.time - time) < .00001, 'Native-to-native chapter swap preserves the in-flight strike');
    actor.play('slash1', .2); actor.animate(.1, 0, true);
  }
  actor.dispose(); freeCharacter(actor.root);
}
console.log('native chapter transitions: all available chapters in both directions preserve actor identity, one owned body and live strike timing');
