import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HeroOutfits } from '../src/player/hero-outfits.ts';
import { HERO_OUTFIT_HEROES } from '../src/player/hero-outfit-key.ts';

// Closing a selection/sheet while textures load must release the late material too.
const geometry = new THREE.BufferGeometry().setIndex([0, 1, 2]);
const body = new THREE.SkinnedMesh(geometry);
const outfit = new HeroOutfits(HERO_OUTFIT_HEROES[0], body);
const internal = outfit as unknown as {
  busy: boolean; masters: Map<number, unknown>;
  master(world: number): Promise<unknown>;
  material(master: unknown): Promise<THREE.MeshStandardMaterial>;
};
let release!: () => void, entered = false, disposed = 0, textureDisposed = 0;
const gate = new Promise<void>((resolve) => { release = resolve; });
const texture = new THREE.Texture();
texture.addEventListener('dispose', () => textureDisposed++);
const material = new THREE.MeshStandardMaterial({ map: texture });
material.addEventListener('dispose', () => disposed++);
const master = { geometries: [new THREE.BufferGeometry()], materials: new Map() };
internal.master = async (world) => { internal.masters.set(world, master); return master; };
internal.material = async () => { entered = true; await gate; master.materials.set('epic', material); return material; };
const until = async (condition: () => boolean) => {
  for (let i = 0; !condition(); i++) {
    assert.ok(i < 100, 'Outfit refresh settled');
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
};
outfit.wear({ mani: 'guanti-palladio' });
await until(() => entered);
outfit.dispose();
release();
await until(() => !internal.busy);
assert.equal(internal.masters.size, 0);
assert.equal(disposed, 1, 'Late material released exactly once');
assert.equal(textureDisposed, 1, 'Late texture released exactly once');
outfit.dispose();
assert.equal(disposed, 1, 'Repeated disposal is harmless');
console.log('hero outfit: disposal during material loading releases the late texture and material');
