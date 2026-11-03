import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CLOTH_SLOTS, heroOutfitKey } from '../src/player/hero-outfit-key.ts';
import { GEAR } from '../src/loot/gear.ts';
import { CLOTHING_ICONS } from '../src/ui/clothingIconAtlas.ts';

const root = fileURLToPath(new URL('../public/models/hero-outfits/tizian/', import.meta.url));
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const feet: string[] = [];
let bytes = 0;
for (const world of [1, 2, 3]) {
  const glb = readFileSync(`${root}${world}/master.glb`);
  bytes += glb.length;
  assert.equal(glb.toString('ascii', 0, 4), 'glTF');
  const jsonSize = glb.readUInt32LE(12);
  const document = JSON.parse(glb.toString('utf8', 20, 20 + jsonSize));
  const binary = glb.subarray(28 + jsonSize);
  const read = (id: number): number[] => {
    const a = document.accessors[id], view = document.bufferViews[a.bufferView];
    const count = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type];
    const width = a.componentType === 5126 || a.componentType === 5125 ? 4 : a.componentType === 5123 ? 2 : 1;
    const result: number[] = [];
    for (let i = 0; i < a.count; i++) for (let k = 0; k < count; k++) {
      const at = (view.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (view.byteStride ?? count * width) + k * width;
      result.push(a.componentType === 5126 ? binary.readFloatLE(at) : width === 4 ? binary.readUInt32LE(at) : width === 2 ? binary.readUInt16LE(at) : binary.readUInt8(at));
    }
    return result;
  };
  assert.deepEqual(document.nodes.map((n: { name: string }) => n.name), [...CLOTH_SLOTS]);
  for (const node of document.nodes) {
    const p = document.meshes[node.mesh].primitives[0], positions = read(p.attributes.POSITION), joints = read(p.attributes.JOINTS_0), weights = read(p.attributes.WEIGHTS_0);
    assert(positions.length > 0 && positions.every(Number.isFinite), `${world}/${node.name}: finite visible geometry`);
    assert(read(p.indices).every((i) => i >= 0 && i < positions.length / 3));
    assert(joints.every((i) => Number.isInteger(i) && i >= 0 && i < 24), 'Original 24-bone order');
    assert(read(p.attributes.TEXCOORD_0).every(Number.isFinite));
    assert.equal(weights.length, positions.length / 3 * 4);
    for (let i = 0; i < weights.length; i += 4) assert(Math.abs(weights.slice(i, i + 4).reduce((a, b) => a + b, 0) - 1) < 1e-5, 'Normalized skin weights');
    if (node.name === 'piedi') feet.push(hash(Buffer.from(Float32Array.from(positions).buffer)));
  }
  const cover = JSON.parse(readFileSync(`${root}${world}/cover.json`, 'utf8'));
  const seen = new Set<number>();
  assert.equal(cover.slots.length, 6);
  for (const slot of cover.slots) for (const triangle of slot) {
    assert(Number.isInteger(triangle) && triangle >= 0);
    assert(!seen.has(triangle), 'Independent slots cannot claim the same original triangle');
    seen.add(triangle);
  }
  const finishes: string[] = [];
  for (const finish of ['green', 'blue', 'epic']) for (const map of ['base', 'normal', 'orm']) {
    const path = `${root}${world}/${finish}-${map}.webp`, image = readFileSync(path);
    assert.equal(image.toString('ascii', 8, 12), 'WEBP');
    bytes += statSync(path).size;
    if (map === 'base') finishes.push(hash(image));
  }
  assert.equal(new Set(finishes).size, 3, `World ${world} has three actual material finishes`);
}
assert.equal(new Set(feet).size, 3, 'All three worlds have distinct shoe geometry; world3 cannot reuse world2');
for (const item of GEAR) {
  const expected = item.slot && (CLOTH_SLOTS as readonly string[]).includes(item.slot) && item.rarity !== 'comune';
  const key = heroOutfitKey('tizian', item.id);
  assert.equal(!!key, !!expected);
  if (key) {
    assert((CLOTHING_ICONS as readonly string[]).includes(item.id), `${item.id}: painted icon mapping`);
    assert.equal(key.world, item.l3 ? 3 : item.l2 ? 2 : 1);
    assert.equal(key.finish, item.rarity === 'noncomune' ? 'green' : item.rarity === 'raro' ? 'blue' : 'epic');
  }
  assert.equal(heroOutfitKey('risorto', item.id), undefined);
}
assert.equal(heroOutfitKey('tizian', 'unknown-item'), undefined);
assert.equal(heroOutfitKey('tizian', 'fanale-piedi')?.world, 3);
assert.equal(heroOutfitKey('tizian', 'converso-piedi')?.world, 3);
assert.equal(heroOutfitKey('tizian', 'zoccoli-voga')?.world, 2);
const icons = readFileSync(`${root}icons.webp`);
assert.equal(icons.toString('ascii', 8, 12), 'WEBP');
assert(icons.length > 50_000, 'Painted atlas must be shipped, not an empty placeholder');
bytes += icons.length;
console.log(`Tizian: 3 masters, 9 finishes, independent coverage, original bone order, distinct source3 shoes; ${(bytes / 1024 / 1024).toFixed(2)} MiB.`);
