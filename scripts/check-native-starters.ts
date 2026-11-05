import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { HERO_IDS } from '../src/player/heroes.ts';
import { Equipment, STARTER, outfitChoices, type GearState } from '../src/loot/gear.ts';
import { NATIVE_CHARACTERS, NATIVE_STARTERS, nativeCharacter, nativeAppearance, freeCharacter } from '../src/player/native-character.ts';
import { UndeadModel } from '../src/player/undead.ts';
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(parser => ({ name: 'without-images', beforeRoot() { parser.json.materials = parser.json.materials?.map(() => ({})); return null; } }));
const parse = (file: string) => { const b = fs.readFileSync('public/models/' + file); return loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), ''); };
for (const hero of HERO_IDS) {
  const expected = NATIVE_CHARACTERS[NATIVE_STARTERS[hero]]!, requests: string[] = [];
  const actor = new UndeadModel(hero, true, file => { requests.push(file); return parse(file); });
  const state = actor as unknown as { visualKey: string; playing?: { t: number; layer: { upper: THREE.AnimationAction } } };
  const settle = async (file: string) => { for (let i = 0; state.visualKey !== file; i++) { assert.ok(i < 400); await new Promise(r => setTimeout(r, 5)); } };
  await settle(expected.file);
  assert.deepEqual(requests, [expected.file], 'No initial legacy request or flash');
  const gear = new Equipment(hero);
  for (const saved of [{}, { ...STARTER }, { torso: 'tunica-peste' }, gear.encode()] as GearState[]) {
    // The visual selection must not mutate actual decoded old/no-outfit/white gear or its statistics.
    gear.decode(saved); const before = gear.encode(), totals = gear.totals;
    const visualGear = { ...gear.worn }; delete visualGear.arma; // Actual weapon loading/socket is exercised in the browser.
    actor.wear(visualGear); await settle(expected.file);
    assert.equal(nativeCharacter(hero, gear.worn), expected); assert.equal(nativeAppearance(hero, gear.worn), 'starter');
    assert.deepEqual(gear.encode(), before); assert.deepEqual(gear.totals, totals);
    actor.root.traverse(o => {
      if (!(o instanceof THREE.SkinnedMesh) || o.userData.aura) return;
      const m = o.material as THREE.MeshStandardMaterial;
      assert.equal(m.metalness, 0); assert.equal(m.roughness, 1); assert.equal(m.emissive.getHex(), 0); assert.equal(m.emissiveMap, null);
      assert.equal(m.onBeforeCompile, THREE.Material.prototype.onBeforeCompile);
    });
  }
  actor.animate(.2, 4.2, true, 4.2); actor.play('slash1', .2); actor.animate(.07, 0, true);
  const time = state.playing!.layer.upper.time, elapsed = state.playing!.t;
  for (const chapter of [1, 2, 3] as const) {
    const entry = NATIVE_CHARACTERS[`${hero}-${chapter}`]; if (!entry) continue;
    for (const rarity of ['noncomune', 'raro', 'epico'] as const) {
      actor.wear({ abito: outfitChoices(hero, chapter, rarity)[0].id }); await settle(entry.file);
      assert.equal(actor.root.children.length, 1); assert.equal(state.playing!.layer.upper.time, time); assert.equal(state.playing!.t, elapsed);
      actor.wear({}); await settle(expected.file);
      assert.equal(actor.root.children.length, 1); assert.equal(state.playing!.layer.upper.time, time);
    }
  }
  actor.dispose(); freeCharacter(actor.root);
}
console.log('native starters: all five initial/no-outfit/old/white saves, unchanged equipment/stats, matte nonemissive finish, no initial legacy load, white-set-white and chapter action-preserving atomic swaps');
// Fosca fallback needs no browser canvas; Risorto texture painting is verified with real images in browser.
// A real native download failure may use the retained source; successful defaults never request it.
const errors: unknown[][] = [], originalError = console.error;
console.error = (...args: unknown[]) => { errors.push(args); originalError(...args); };
try {
  const requested: string[] = [];
  const actor = new UndeadModel('fosca', true, file => {
    requested.push(file);
    return file.startsWith('native-characters/') ? Promise.reject(new Error('expected offline native asset')) : parse(file);
  });
  const state = actor as unknown as { visualKey: string };
  for (let i = 0; state.visualKey !== 'fosca.glb'; i++) { assert.ok(i < 400); await new Promise(r => setTimeout(r, 5)); }
  assert.deepEqual(requested, ['native-characters/fosca-3.glb', 'fosca.glb']);
  assert.equal(errors.length, 1); assert.equal(actor.root.children.length, 1);
  actor.animate(.1, 4.2, true, 4.2); actor.play('slash1', .2); actor.animate(.1, 0, true);
  actor.dispose(); freeCharacter(actor.root);
} finally { console.error = originalError; }
console.log('native load failure: retained source fallback only after rejected native request, one complete actor and working animation');
