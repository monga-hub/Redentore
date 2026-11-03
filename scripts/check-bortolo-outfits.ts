import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GEAR } from '../src/loot/gear.ts';
import { CLOTH_SLOTS, heroOutfitKey } from '../src/player/hero-outfit-key.ts';
import { copyFist } from '../src/player/hero-outfit-fist.ts';
import { CLOTHING_ICONS, CLOTHING_COLS, CLOTHING_ROWS } from '../src/ui/clothingIconAtlas.ts';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register((parser) => ({ name: 'outfit-test-without-images', beforeRoot() {
  parser.json.materials = parser.json.materials?.map(() => ({}));
  return null;
} }));
async function read(file: string) {
  const bytes = fs.readFileSync(file);
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
const original = await read('public/models/bortolo.glb');
let body!: THREE.SkinnedMesh;
original.scene.traverse((o) => { if (o instanceof THREE.SkinnedMesh) body ??= o; });
assert(body);
const bodyTriangles = body.geometry.index!.count / 3;
body.geometry.setAttribute('aFist', new THREE.BufferAttribute(new Float32Array(body.geometry.attributes.position.count * 3).fill(.01), 3));
const clothing = GEAR.filter((g) => (CLOTH_SLOTS as readonly string[]).includes(g.slot ?? ''));
assert.deepEqual([...CLOTHING_ICONS].sort(), clothing.map((g) => g.id).sort());
assert.equal(new Set(CLOTHING_ICONS).size, clothing.length);
assert(CLOTHING_COLS * CLOTHING_ROWS >= clothing.length);
for (const item of GEAR) {
  assert.equal(heroOutfitKey('risorto', item.id), undefined);
  const key = heroOutfitKey('bortolo', item.id);
  if (item.rarity === 'comune' || !clothing.includes(item)) assert.equal(key, undefined);
  else assert.deepEqual(key, { world: item.l3 ? 3 : item.l2 ? 2 : 1, finish: item.rarity === 'noncomune' ? 'green' : item.rarity === 'raro' ? 'blue' : 'epic' });
}
assert.equal(heroOutfitKey('bortolo', 'unknown'), undefined);
assert.deepEqual(heroOutfitKey('bortolo', 'converso-piedi'), { world: 3, finish: 'green' });
assert.deepEqual(heroOutfitKey('bortolo', 'fanale-piedi'), { world: 3, finish: 'blue' });
assert.deepEqual(heroOutfitKey('bortolo', 'zoccoli-voga'), { world: 2, finish: 'epic' });

for (const world of [1, 2, 3]) {
  const dir = `public/models/hero-outfits/bortolo/${world}`;
  const gltf = await read(`${dir}/master.glb`);
  const cover = JSON.parse(fs.readFileSync(`${dir}/cover.json`, 'utf8')) as { slots: number[][]; seams: number[][] };
  assert.equal(cover.slots.length, 6);
  const hidden = cover.slots.flat();
  assert.equal(new Set(hidden).size, hidden.length, 'A body triangle has one clothing owner');
  assert(hidden.every((t) => Number.isInteger(t) && t >= 0 && t < bodyTriangles));
  assert(Array.isArray(cover.seams));
  const totals: Record<string, number> = {};
  for (const slot of CLOTH_SLOTS) {
    const part = gltf.scene.getObjectByName(slot) as THREE.Mesh;
    assert(part?.isMesh && !(part instanceof THREE.SkinnedMesh), `${slot} must use the existing hero skeleton`);
    const g = part.geometry, p = g.attributes.position, w = g.attributes.skinWeight, j = g.attributes.skinIndex;
    assert(g.index?.count && g.attributes.uv && g.attributes.normal && w && j, `Complete ${slot} geometry`);
    assert.equal(g.index!.count % 3, 0);
    totals[slot] = g.index!.count / 3;
    for (let i = 0; i < p.count; i++) {
      assert([p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite));
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        const bone = j.getComponent(i, k), weight = w.getComponent(i, k);
        assert(Number.isInteger(bone) && bone >= 0 && bone < body.skeleton.bones.length);
        assert(Number.isFinite(weight) && weight >= 0);
        sum += weight;
      }
      assert(Math.abs(sum - 1) < 1e-5, 'Normalized weights');
    }
    if (slot === 'mani') assert.equal(copyFist(body.geometry, g), p.count, 'Every glove vertex keeps the original fist deformation');
    if (slot === 'gambe') assert.equal(copyFist(body.geometry, g), p.count, 'Flexible legs retain original bind vertices and animation weights');
  }
  const finishes = { base: new Set<string>(), normal: new Set<string>(), orm: new Set<string>() };
  for (const finish of ['green', 'blue', 'epic']) for (const kind of ['base', 'normal', 'orm']) {
    const bytes = fs.readFileSync(`${dir}/${finish}-${kind}.webp`);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert(bytes.length > 1000);
    finishes[kind as keyof typeof finishes].add(createHash('sha256').update(bytes).digest('hex'));
  }
  for (const [kind, hashes] of Object.entries(finishes)) assert.equal(hashes.size, 3, `Three distinct ${kind} finishes: color, detail and surface quality progress together`);
  console.log(`Bortolo world${world}: six pieces, three finishes, exact original glove/leg animation`, totals);
}
assert(fs.statSync('public/models/hero-outfits/bortolo/icons.webp').size > 1000);
console.log('Bortolo: item origins/rarities, coverage, three masters, nine looks and original-hand grip passed');
