import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { wholeOutfitKey, OUTFIT_APPEARANCES } from '../src/player/whole-outfit-key.ts';
import { finishFoscaTierMaterial } from '../src/player/tier-outfit-material.ts';
import { HeroOutfits } from '../src/player/hero-outfits.ts';
import { copyFist } from '../src/player/hero-outfit-fist.ts';
import type { Finish } from '../src/player/hero-outfit-key.ts';

for (const build of OUTFIT_APPEARANCES.fosca) {
  for (const [rarity, finish] of [['noncomune', 'green'], ['raro', 'blue'], ['epico', 'epic']] as const) {
    assert.deepEqual(wholeOutfitKey('fosca', { build, chapter: 3, rarity, legacy: false }), { world: 3, finish, tier: true });
  }
  assert.equal(wholeOutfitKey('fosca', { build, chapter: 3, rarity: 'leggendario', legacy: false })?.tier, undefined, 'Unrelated legendary appearance retains its old source');
}
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(parser => ({ name: 'without-images', beforeRoot() { parser.json.materials = parser.json.materials?.map(() => ({})); return null; } }));
const parse = async (path: string) => { const b = fs.readFileSync(path); return loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), ''); };
const pilot = await parse('public/models/tier-outfits/fosca/3/master.glb');
assert.ok(fs.statSync('public/models/tier-outfits/fosca/3/master.glb').size < 5 * 1024 ** 2);
const garment = pilot.scene.getObjectByName('garment') as THREE.Mesh, hands = pilot.scene.getObjectByName('hands') as THREE.Mesh;
assert.equal(garment.geometry.index!.count / 3 + hands.geometry.index!.count / 3, 30198);
for (const mesh of [garment, hands]) {
  const g = mesh.geometry, p = g.getAttribute('position'), j = g.getAttribute('skinIndex'), w = g.getAttribute('skinWeight');
  assert.ok(g.hasAttribute('uv') && g.hasAttribute('normal'));
  for (let i = 0; i < p.count; i++) {
    assert.ok([p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite));
    let sum = 0;
    for (let k = 0; k < 4; k++) { assert.ok(j.getComponent(i, k) >= 0 && j.getComponent(i, k) < 24); sum += w.getComponent(i, k); }
    assert.ok(Math.abs(sum - 1) < 1e-5);
  }
}
const original = await parse('public/models/fosca.glb');
let body!: THREE.SkinnedMesh; original.scene.traverse(o => { if (o instanceof THREE.SkinnedMesh) body ??= o; });
body.geometry.setAttribute('aFist', new THREE.Float32BufferAttribute(new Float32Array(body.geometry.getAttribute('position').count * 3).fill(.1), 3));
assert.ok(copyFist(body.geometry, hands.geometry) >= 1400, 'Original hand vertices preserve bind positions and weights for the original fist deformation');
assert.ok(garment.geometry.hasAttribute('_boot'));
assert.ok(garment.geometry.hasAttribute('_rest'), 'Tailored decoration coordinates are attached to the shared skinned garment');
const shaders = new Set<string>();
for (const finish of ['green', 'blue', 'epic'] as Finish[]) {
  const m = new THREE.MeshStandardMaterial();
  finishFoscaTierMaterial(m, finish);
  const shader = { vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>\nx * uGlow;', uniforms: {} };
  m.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  assert.ok(shader.vertexShader.includes('vTierBoot = aBoot'));
  assert.ok(shader.fragmentShader.includes('tierBase'));
  shaders.add(shader.fragmentShader);
}
assert.equal(shaders.size, 3, 'Three material treatments share the same geometry');

// Exercise the real async swap/disposal owner with two whole meshes and owned/borrowed textures.
const g = new THREE.BufferGeometry().setIndex([0, 1, 2]);
g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
const borrowed = new THREE.Texture(), owned = new THREE.Texture();
const testBody = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ map: borrowed })), parent = new THREE.Group();
testBody.bind(new THREE.Skeleton([new THREE.Bone()])); parent.add(testBody);
let ownedFreed = 0, borrowedFreed = 0;
owned.addEventListener('dispose', () => ownedFreed++); borrowed.addEventListener('dispose', () => borrowedFreed++);
const renderer = new HeroOutfits('fosca', testBody);
const state = renderer as unknown as { busy: boolean; parts: THREE.SkinnedMesh[]; masters: Map<string, unknown>; master(world: number, tier: boolean): Promise<unknown> };
const master = { geometries: [g.clone(), g.clone()], cover: [[0], []], seams: [], materials: new Map(), tier: new THREE.MeshStandardMaterial({ map: owned }) };
let release!: () => void;
const gate = new Promise<void>(r => { release = r; });
state.master = async (_world, tier) => { assert.ok(tier); await gate; state.masters.set('tier:3', master); return master; };
const select = (rarity: 'noncomune' | 'raro' | 'epico' | 'comune') => ({ build: OUTFIT_APPEARANCES.fosca[0], chapter: 3 as const, rarity, legacy: false });
const settle = async () => { for (let i = 0; state.busy; i++) { assert.ok(i < 1000); await new Promise(r => setTimeout(r, 1)); } };
renderer.wear({}, select('noncomune'));
assert.equal(state.parts.length, 0); assert.notEqual(testBody.geometry.drawRange.count, 0, 'Loading retains the original clothed body');
renderer.wear({}, select('epico')); release(); await settle();
assert.deepEqual(state.parts.map(p => p.name), ['outfit-whole', 'outfit-hands']);
assert.equal(testBody.geometry.drawRange.count, 0, 'Both parts replace the original coverage in one swap');
assert.ok(state.parts.every(p => p.skeleton === testBody.skeleton));
renderer.wear({}, select('raro')); await settle();
assert.equal(ownedFreed, 0, 'Variant changes retain their shared source maps');
assert.equal(borrowedFreed, 0, 'Original hand maps belong to the body');
renderer.wear({ testa: 'mitria' }, select('comune')); await settle();
assert.equal(state.parts.length, 0); assert.equal(testBody.geometry.drawRange.count, 3, 'Canonical white ignores retained old armor records without changing the save');
assert.equal(ownedFreed, 1); assert.equal(borrowedFreed, 0);
renderer.dispose(); assert.equal(ownedFreed, 1); assert.equal(borrowedFreed, 0);
console.log('tier pilot: chapter mapping, legendary fallback, asset/weights/fist, material variants, atomic stale swap, white restore and texture ownership valid');
