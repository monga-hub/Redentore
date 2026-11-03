import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { BufferAttribute, type Mesh, type SkinnedMesh } from 'three';
import { copyFist } from '../src/player/hero-outfit-fist.ts';
import { GEAR } from '../src/loot/gear.ts';
import { CLOTH_SLOTS, heroOutfitKey } from '../src/player/hero-outfit-key.ts';

const root = new URL('../public/models/', import.meta.url);
const read = (name: string) => readFileSync(new URL(name, root));
const glbJSON = (bytes: Buffer) => JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
const original = glbJSON(read('zanetto.glb'));
const originalMesh = original.meshes[original.nodes.find((n: { skin?: number }) => n.skin !== undefined).mesh];
const originalTriangles = original.accessors[originalMesh.primitives[0].indices].count / 3;
const bones = original.skins[0].joints.length;
assert.equal(bones, 24, 'Outfits must retain the original 24-bone rig');
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register((parser) => ({ name: 'test-without-images', beforeRoot() {
  parser.json.materials = parser.json.materials?.map(() => ({}));
  return null;
} }));
const originalBytes = read('zanetto.glb');
const originalScene = await loader.parseAsync(originalBytes.buffer.slice(originalBytes.byteOffset, originalBytes.byteOffset + originalBytes.byteLength) as ArrayBuffer, '');
const originalBody = originalScene.scene.getObjectByProperty('isSkinnedMesh', true) as SkinnedMesh;
originalBody.geometry.setAttribute('aFist', new BufferAttribute(new Float32Array(originalBody.geometry.attributes.position.count * 3).fill(.123), 3));
for (const world of [1, 2, 3]) {
  const dir = `hero-outfits/zanetto/${world}/`;
  const bytes = read(`${dir}master.glb`);
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const gltf = await loader.parseAsync(data, '');
  assert.deepEqual(gltf.scene.children.map((o) => o.name), [...CLOTH_SLOTS]);
  assert.equal(gltf.animations.length, 0, 'An outfit must not replace original animations');
  for (const child of gltf.scene.children) {
    const mesh = child as Mesh, g = mesh.geometry;
    assert.ok(g.index && g.index.count > 60, `${world}/${child.name} needs a real piece`);
    for (const name of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) {
      assert.ok(g.attributes[name], `${world}/${child.name} missing ${name}`);
      assert.ok(Array.from(g.attributes[name].array).every(Number.isFinite));
    }
    const joints = g.attributes.skinIndex, weights = g.attributes.skinWeight;
    for (let i = 0; i < weights.count; i++) {
      let sum = 0;
      for (let j = 0; j < 4; j++) {
        assert.ok(joints.getComponent(i, j) >= 0 && joints.getComponent(i, j) < bones);
        assert.ok(weights.getComponent(i, j) >= 0);
        sum += weights.getComponent(i, j);
      }
      assert.ok(Math.abs(sum - 1) < .001, `${world}/${child.name}: unnormalized skin weights`);
    }
    if (child.name === 'mani') assert.equal(copyFist(originalBody.geometry, g), g.attributes.position.count, `${world}: every glove vertex must retain original hand topology and fist motion`);
    for (const index of g.index!.array) assert.ok(index < g.attributes.position.count);
    g.dispose();
  }
  const cover = JSON.parse(read(`${dir}cover.json`).toString()) as { slots: number[][]; seams: number[][] };
  assert.equal(cover.slots.length, 6);
  for (const indices of cover.slots) {
    assert.equal(new Set(indices).size, indices.length);
    assert.ok(indices.every((i) => Number.isInteger(i) && i >= 0 && i < originalTriangles));
  }
  assert.ok(cover.slots.flat().length < originalTriangles, 'The original exposed face must remain');
  for (const finish of ['green', 'blue', 'epic']) for (const map of ['base', 'normal', 'orm']) {
    const image = read(`${dir}${finish}-${map}.webp`);
    assert.equal(image.subarray(0, 4).toString(), 'RIFF');
    assert.equal(image.subarray(8, 12).toString(), 'WEBP');
    assert.ok(image.length > 1000);
  }
}
for (const item of GEAR) {
  const key = heroOutfitKey('zanetto', item.id);
  const clothing = (CLOTH_SLOTS as readonly string[]).includes(item.slot!);
  if (!clothing || item.rarity === 'comune') assert.equal(key, undefined);
  else assert.deepEqual(key, { world: item.l3 ? 3 : item.l2 ? 2 : 1, finish: item.rarity === 'noncomune' ? 'green' : item.rarity === 'raro' ? 'blue' : 'epic' });
  assert.equal(heroOutfitKey('risorto', item.id), undefined, 'Risorto must remain unchanged');
}
const mixed = { torso: 'saio-voto', mani: 'puntoaria-mani', spalle: 'scriptorium-spalle', piedi: 'zoccoli-voga' };
assert.deepEqual(Object.values(mixed).map((id) => heroOutfitKey('zanetto', id)?.world), [1, 2, 3, 2]);
assert.equal(heroOutfitKey('zanetto', 'missing-item'), undefined);
assert.ok(read('hero-outfits/zanetto/icons.webp').length > 10000);
console.log('Zanetto: three six-slot masters, nine finishes, original rig, independent item worlds and coverage pass.');
