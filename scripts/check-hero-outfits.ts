import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GEAR } from '../src/loot/gear.ts';
import { HERO_IDS } from '../src/player/heroes.ts';
import { CLOTH_SLOTS, hasHeroOutfits, heroOutfitKey } from '../src/player/hero-outfit-key.ts';
import { CLOTHING_ICONS, CLOTHING_COLS, CLOTHING_ROWS } from '../src/ui/clothingIconAtlas.ts';

const clothing = GEAR.filter((i) => (CLOTH_SLOTS as readonly string[]).includes(i.slot ?? ''));
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
assert.deepEqual([...CLOTHING_ICONS].sort(), clothing.map((i) => i.id).sort());
assert.equal(new Set(CLOTHING_ICONS).size, clothing.length);
assert.ok(CLOTHING_COLS * CLOTHING_ROWS >= clothing.length);
for (const hero of HERO_IDS) {
  for (const item of GEAR) {
    const key = heroOutfitKey(hero, item.id);
    if (!hasHeroOutfits(hero) || item.rarity === 'comune' || !(CLOTH_SLOTS as readonly string[]).includes(item.slot ?? '')) {
      assert.equal(key, undefined);
      continue;
    }
    assert.equal(key?.world, item.l3 ? 3 : item.l2 ? 2 : 1);
    assert.equal(key?.finish, item.rarity === 'noncomune' ? 'green' : item.rarity === 'raro' ? 'blue' : 'epic');
  }
  assert.equal(heroOutfitKey(hero, 'missing-item'), undefined);
  if (!hasHeroOutfits(hero)) continue;
  for (const world of [1, 2, 3]) {
    const dir = `public/models/hero-outfits/${hero}/${world}`;
    for (const file of ['master.glb', 'cover.json', ...['green', 'blue', 'epic'].flatMap((f) => ['base', 'normal', 'orm'].map((m) => `${f}-${m}.webp`))]) {
      assert.ok(fs.statSync(`${dir}/${file}`).size > 0, `${hero}/${world}/${file}`);
    }
    const cover = JSON.parse(fs.readFileSync(`${dir}/cover.json`, 'utf8')) as { slots: number[][]; seams: number[][] };
    assert.equal(cover.slots.length, 6);
    const all = cover.slots.flat();
    assert.equal(new Set(all).size, all.length, 'Each body triangle belongs to exactly one slot');
    for (const slot of cover.slots) assert.ok(slot.every((i) => Number.isInteger(i) && i >= 0));
    for (const [triangle, ...slots] of cover.seams) {
      assert.ok(all.includes(triangle));
      assert.ok(slots.length > 1 && slots.every((s) => s >= 0 && s < 6));
    }
    const bytes = fs.readFileSync(`${dir}/master.glb`);
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    for (const slot of CLOTH_SLOTS) {
      const mesh = gltf.scene.getObjectByName(slot) as THREE.Mesh;
      assert.ok(mesh?.isMesh, `${dir}: missing ${slot}`);
      const joins = new Map<string, Map<number, number>>();
      const g = mesh.geometry, p = g.getAttribute('position'), w = g.getAttribute('skinWeight'), j = g.getAttribute('skinIndex');
      assert.ok(g.index?.count && g.getAttribute('uv') && g.getAttribute('normal'));
      for (let i = 0; i < p.count; i++) {
        const weights = new Map<number, number>();
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          const bone = j.getComponent(i, k), weight = w.getComponent(i, k);
          assert.ok(Number.isInteger(bone) && bone >= 0 && bone < 24);
          assert.ok(Number.isFinite(weight) && weight >= 0);
          sum += weight;
          weights.set(bone, (weights.get(bone) ?? 0) + weight);
        }
        assert.ok(Math.abs(sum - 1) < .001, 'Normalized skin weights');
        const key = [p.getX(i), p.getY(i), p.getZ(i)].map((v) => {
          assert.ok(Number.isFinite(v)); return Math.round(v * 100000);
        }).join(',');
        // UV seams and modular cuts must stay joined when the existing skeleton moves.
        const prior = joins.get(key);
        if (prior) for (const bone of new Set([...prior.keys(), ...weights.keys()])) {
          assert.ok(Math.abs((prior.get(bone) ?? 0) - (weights.get(bone) ?? 0)) < .001, `${dir}: split skin weights at ${key}`);
        }
        else joins.set(key, weights);
      }
      g.dispose();
    }
  }
  assert.ok(fs.statSync(`public/models/hero-outfits/${hero}/icons.webp`).size > 0);
}
// Regression: Fosca's world-one epic torso must resolve independently of her other slots.
assert.deepEqual(heroOutfitKey('fosca', 'saio-voto'), { world: 1, finish: 'epic' });
assert.deepEqual(heroOutfitKey('fosca', 'busto-broccato'), { world: 2, finish: 'epic' });
assert.deepEqual(heroOutfitKey('fosca', 'cocolla-cana'), { world: 3, finish: 'epic' });
console.log('hero outfits: item origins/rarities, six-slot coverage, three masters/nine finishes per enabled hero, clothing icons ok');
