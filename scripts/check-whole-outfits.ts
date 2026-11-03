import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { OUTFIT_APPEARANCES, wholeOutfitKey } from '../src/player/whole-outfit-key.ts';
import { wholeMaterialKey, finishWholeMaterial } from '../src/player/whole-outfit-material.ts';
import type { Hero } from '../src/player/heroes.ts';
import { CLOTH_SLOTS } from '../src/player/hero-outfit-key.ts';

for (const [hero, builds] of Object.entries(OUTFIT_APPEARANCES) as [Hero, readonly string[]][]) {
  const sources = new Set<number>();
  for (const build of builds) for (const chapter of [1, 2, 3] as const) for (const rarity of ['comune', 'noncomune', 'raro', 'epico'] as const) {
    const selection = { build, chapter, rarity, legacy: false };
    const key = wholeOutfitKey(hero, selection)!;
    assert.ok(key); sources.add(key.world);
    assert.equal(wholeOutfitKey(hero, { ...selection, legacy: true }), undefined);
    assert.equal(wholeOutfitKey(hero, { ...selection, build: 'other-hero-build' }), undefined);
    assert.notEqual(wholeMaterialKey(key.finish, selection), wholeMaterialKey(key.finish, { ...selection, legacy: true }));
    const material = new THREE.MeshStandardMaterial();
    finishWholeMaterial(material, selection);
    const shader = { fragmentShader: '#include <color_fragment>\n#include <roughnessmap_fragment>', vertexShader: '', uniforms: {} };
    material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    assert.ok(shader.fragmentShader.includes('outfitCloth'));
    assert.ok(!shader.fragmentShader.includes('- 0,'), 'GLSL arithmetic uses float constants');
  }
  assert.equal(sources.size, 3, `${hero}: three distinct complete source appearances`);
}
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
for (const world of [1, 2, 3]) {
  const dir = `public/models/hero-outfits/risorto/${world}`;
  const bytes = fs.readFileSync(`${dir}/master.glb`);
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const cover = JSON.parse(fs.readFileSync(`${dir}/cover.json`, 'utf8'));
  const hidden = cover.slots.flat();
  assert.equal(hidden.length, new Set(hidden).size);
  assert.equal(hidden.length, 22791, 'Whole original body covered, without missing or repeated triangles');
  for (const slot of CLOTH_SLOTS) {
    const mesh = gltf.scene.getObjectByName(slot) as THREE.Mesh;
    assert.ok(mesh?.geometry.index?.count);
    const g = mesh.geometry, p = g.getAttribute('position'), j = g.getAttribute('skinIndex'), w = g.getAttribute('skinWeight');
    for (let i = 0; i < p.count; i++) {
      assert.ok([p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite));
      let sum = 0;
      for (let k = 0; k < 4; k++) { assert.ok(j.getComponent(i, k) >= 0 && j.getComponent(i, k) < 24); sum += w.getComponent(i, k); }
      assert.ok(Math.abs(sum - 1) < .001);
    }
  }
  for (const kind of ['base', 'normal', 'orm']) assert.ok(fs.statSync(`${dir}/outfit-${kind}.webp`).size > 0);
}
assert.ok(fs.statSync('public/models/hero-outfits/whole-icons.webp').size > 0);
console.log('whole outfits: 15 build identities, all chapters/rarities, legacy fallback, palette shader and original-rig Risorto assets valid');

// Whole gear must keep the previous complete set through slow, stale and failed loads.
const { HeroOutfits } = await import('../src/player/hero-outfits.ts');
const g = new THREE.BufferGeometry().setIndex([0, 1, 2]);
g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
const body = new THREE.SkinnedMesh(g), parent = new THREE.Group();
body.bind(new THREE.Skeleton([new THREE.Bone()])); parent.add(body);
const renderer = new HeroOutfits('tizian', body);
const internal = renderer as unknown as {
  busy: boolean; parts: THREE.SkinnedMesh[]; masters: Map<number, unknown>;
  master(world: number): Promise<unknown>; material(master: unknown, world: number): Promise<THREE.MeshStandardMaterial>;
};
const settle = async () => { for (let n = 0; internal.busy; n++) { assert.ok(n < 1000); await new Promise(r => setTimeout(r, 1)); } };
let release!: () => void, waiting = false, fail = false;
const gate = new Promise<void>(resolve => { release = resolve; });
internal.master = async (world) => {
  if (world === 2) { waiting = true; await gate; }
  if (fail) throw new Error('controlled missing source');
  const master = { geometries: Array.from({ length: 6 }, () => g.clone()), cover: Array.from({ length: 6 }, () => []), seams: [], materials: new Map() };
  internal.masters.set(world, master); return master;
};
internal.material = async () => new THREE.MeshStandardMaterial();
const select = (build: string) => ({ build, chapter: 1 as const, rarity: 'raro' as const, legacy: false });
renderer.wear({}, select('tizian-maestro-fornace')); await settle();
assert.equal(internal.parts.length, 6);
const originalParts = [...internal.parts], originalDrawCount = body.geometry.drawRange.count;
renderer.wear({}, select('tizian-frate-vetro'));
for (let n = 0; !waiting; n++) { assert.ok(n < 100); await new Promise(r => setTimeout(r, 1)); }
assert.deepEqual(internal.parts, originalParts, 'Slow load leaves all original attachments in place');
assert.equal(body.geometry.drawRange.count, originalDrawCount);
renderer.wear({}, select('tizian-penitente-braci')); release(); await settle();
assert.equal(internal.parts.length, 6);
assert.ok(internal.parts.every(p => !originalParts.includes(p)), 'Latest full selection wins');
const complete = [...internal.parts]; fail = true;
const oldError = console.error; console.error = () => {};
try { renderer.wear({}, select('tizian-maestro-fornace')); await settle(); } finally { console.error = oldError; }
assert.deepEqual(internal.parts, complete, 'Failure keeps the previous complete appearance');
renderer.dispose();
assert.equal(internal.parts.length, 0);
console.log('whole outfits: slow/stale/failing loads retain complete attachments and latest selection wins');
