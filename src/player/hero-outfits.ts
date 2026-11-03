import * as THREE from 'three';
import { loadModel } from '../core/models.ts';
import { PHONE } from '../core/device.ts';
import type { GearState } from '../loot/gear.ts';
import type { Hero } from './heroes.ts';
import { CLOTH_SLOTS, heroOutfitKey, type Finish } from './hero-outfit-key.ts';
import { finishWholeMaterial, wholeMaterialKey } from './whole-outfit-material.ts';
import { wholeOutfitKey, type OutfitSelection } from './whole-outfit-key.ts';
import { copyFist } from './hero-outfit-fist.ts';

interface Master { geometries: THREE.BufferGeometry[]; cover: number[][]; seams: number[][]; materials: Map<string, THREE.MeshStandardMaterial> }

/** Each slot owns a fitted piece, all sharing the hero's original skeleton and animations. */
export class HeroOutfits {
  private readonly hero: Hero;
  private readonly body: THREE.SkinnedMesh;
  private readonly original: THREE.BufferAttribute;
  private masters = new Map<number, Master>();
  private parts: THREE.SkinnedMesh[] = [];
  private shells: THREE.SkinnedMesh[] = [];
  private wanted: GearState = {};
  private selection?: OutfitSelection;
  private version = 0;
  private busy = false;
  private disposed = false;
  private readonly onApply: (whole: boolean) => void;
  private readonly configureMaterial: (material: THREE.MeshStandardMaterial) => void;

  constructor(hero: Hero, body: THREE.SkinnedMesh, configureMaterial: (material: THREE.MeshStandardMaterial) => void = () => {}, onApply: (whole: boolean) => void = () => {}) {
    this.hero = hero;
    this.body = body;
    this.original = body.geometry.index!.clone();
    this.configureMaterial = configureMaterial;
    this.onApply = onApply;
  }

  wear(worn: GearState, selection?: OutfitSelection): void {
    if (this.disposed) return;
    this.wanted = { ...worn };
    this.selection = selection;
    this.version++;
    if (!this.busy) void this.refresh();
  }

  showAura(material: THREE.ShaderMaterial, visible: boolean): void {
    if (this.disposed) return;
    if (visible && !this.shells.length) this.shells = this.parts.map((part) => {
      const shell = part.clone();
      shell.material = material;
      shell.castShadow = false;
      shell.userData.aura = true;
      shell.renderOrder = 2;
      part.parent!.add(shell);
      return shell;
    });
    for (const shell of this.shells) shell.visible = visible;
  }

  private async master(world: number): Promise<Master> {
    const cached = this.masters.get(world);
    if (cached) return cached;
    const dir = `hero-outfits/${this.hero}/${world}/`;
    const [gltf, response] = await Promise.all([loadModel(`${dir}master.glb`), fetch(`${import.meta.env.BASE_URL}models/${dir}cover.json`)]);
    if (!response.ok) throw new Error(`Outfit coverage HTTP ${response.status}`);
    gltf.scene.updateMatrixWorld(true);
    const coverage = await response.json() as { slots: number[][]; seams: number[][] };
    if (!Array.isArray(coverage.slots) || coverage.slots.length !== CLOTH_SLOTS.length || !Array.isArray(coverage.seams)) throw new Error('Invalid outfit coverage');
    const geometries = CLOTH_SLOTS.map((slot) => {
      const mesh = gltf.scene.getObjectByName(slot) as THREE.Mesh;
      if (!mesh?.isMesh || !mesh.geometry.index || !['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].every((a) => mesh.geometry.hasAttribute(a))) throw new Error(`Invalid outfit slot ${slot}`);
      const g = mesh.geometry;
      g.applyMatrix4(mesh.matrixWorld);
      if (slot === 'mani' || this.hero === 'risorto') copyFist(this.body.geometry, g);
      else g.setAttribute('aFist', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3), 3));
      for (const a of ['aHat', 'aBeak']) g.setAttribute(a, new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3), 3));
      for (const material of [mesh.material].flat()) material.dispose();
      return g;
    });
    const master = { geometries, cover: coverage.slots, seams: coverage.seams, materials: new Map<string, THREE.MeshStandardMaterial>() };
    this.masters.set(world, master);
    return master;
  }

  private async material(master: Master, world: number, finish: Finish, selection?: OutfitSelection): Promise<THREE.MeshStandardMaterial> {
    const cacheKey = wholeMaterialKey(finish, selection);
    const cached = master.materials.get(cacheKey);
    if (cached) return cached;
    const loader = new THREE.TextureLoader();
    const dir = `${import.meta.env.BASE_URL}models/hero-outfits/${this.hero}/${world}/${this.hero === 'risorto' ? 'outfit' : finish}`;
    const maps: THREE.Texture[] = [];
    try {
      for (const kind of ['base', 'normal', 'orm']) {
        const map: THREE.Texture = await loader.loadAsync(`${dir}-${kind}.webp`);
        map.flipY = false;
        if (PHONE) {
          try {
            const image = map.image as HTMLImageElement;
            const scale = Math.min(1, 512 / Math.max(image.width, image.height));
            map.image = await createImageBitmap(image, { resizeWidth: Math.round(image.width * scale), resizeHeight: Math.round(image.height * scale), resizeQuality: 'high' });
            map.needsUpdate = true;
          } catch { /* Keep the original on browsers without image resizing support. */ }
        }
        maps.push(map);
      }
    } catch (e) { for (const map of maps) map.dispose(); throw e; }
    maps[0].colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshStandardMaterial({ map: maps[0], normalMap: maps[1], roughnessMap: maps[2], metalnessMap: maps[2], metalness: .5, roughness: 1, emissiveMap: maps[0], emissive: new THREE.Color(.18, .18, .18), side: THREE.DoubleSide });
    material.normalScale.set(1, -1);
    this.configureMaterial(material);
    if (selection && !selection.legacy) finishWholeMaterial(material, selection);
    master.materials.set(cacheKey, material);
    return material;
  }

  private async refresh(): Promise<void> {
    this.busy = true;
    let attempted = this.version;
    try {
      for (;;) {
        const version = this.version;
        attempted = version;
        const selection = this.selection;
        const whole = wholeOutfitKey(this.hero, selection);
        const keys = CLOTH_SLOTS.map((s) => whole ?? heroOutfitKey(this.hero, this.wanted[s]));
        const ready: { slot: number; master: Master; material: THREE.MeshStandardMaterial }[] = [];
        for (let slot = 0; slot < keys.length; slot++) {
          const key = keys[slot];
          if (!key) continue;
          const master = await this.master(key.world);
          ready.push({ slot, master, material: await this.material(master, key.world, key.finish, whole ? selection : undefined) });
        }
        if (this.disposed) break;
        if (version !== this.version) continue;
        this.onApply(!!whole);
        for (const part of this.parts) part.removeFromParent();
        for (const shell of this.shells) shell.removeFromParent();
        this.shells = [];
        this.parts = [];
        const hidden = new Set<number>();
        for (const { slot, master, material } of ready) {
          const part = new THREE.SkinnedMesh(master.geometries[slot], material), body = this.body;
          part.bind(body.skeleton, body.bindMatrix);
          part.position.copy(body.position); part.quaternion.copy(body.quaternion); part.scale.copy(body.scale);
          part.boundingSphere = body.boundingSphere?.clone() ?? null;
          part.castShadow = body.castShadow;
          part.userData.xray = true;
          part.name = `outfit-${CLOTH_SLOTS[slot]}`;
          body.parent!.add(part);
          this.parts.push(part);
          for (const triangle of master.cover[slot]) hidden.add(triangle);
        }
        // The original underlayer bridges differently shaped sleeves/waistlines in mixed-world kits.
        for (const { master } of ready) for (const [triangle, ...slots] of master.seams) {
          const world = keys[slots[0]]?.world;
          if (!world || slots.some((slot) => keys[slot]?.world !== world)) hidden.delete(triangle);
        }
        const visible: number[] = [];
        for (let i = 0; i < this.original.count; i += 3) if (!hidden.has(i / 3)) visible.push(this.original.getX(i), this.original.getX(i + 1), this.original.getX(i + 2));
        const index = this.body.geometry.index!;
        index.array.set(visible);
        index.needsUpdate = true;
        this.body.geometry.setDrawRange(0, visible.length);
        // Keep only currently worn worlds and finishes; changing gear must not accumulate GPU textures.
        for (const [world, master] of this.masters) {
          const finishes = new Set(keys.filter((k) => k?.world === world).map((k) => wholeMaterialKey(k!.finish, whole ? selection : undefined)));
          for (const [finish, material] of master.materials) if (!finishes.has(finish)) {
            for (const t of new Set([material.map, material.normalMap, material.roughnessMap])) if (t) {
              if (typeof ImageBitmap !== 'undefined' && t.image instanceof ImageBitmap) t.image.close();
              t.dispose();
            }
            material.dispose(); master.materials.delete(finish);
          }
          if (!finishes.size) { for (const g of master.geometries) g.dispose(); this.masters.delete(world); }
        }
        break;
      }
    } catch (e) { console.error('hero outfit failed to load; keeping previous equipment', e); }
    finally {
      this.busy = false;
      if (this.disposed) this.dispose();
      else if (attempted !== this.version) void this.refresh();
    }
  }

  /** Cancel pending outfits as well as the currently attached pieces. The body belongs to the caller. */
  dispose(): void {
    this.disposed = true;
    for (const part of [...this.parts, ...this.shells]) part.removeFromParent();
    this.parts = []; this.shells = [];
    // A pending material still belongs to its master; refresh's finally releases it when the load settles.
    if (this.busy) return;
    for (const master of this.masters.values()) {
      for (const geometry of master.geometries) geometry.dispose();
      for (const material of master.materials.values()) {
        for (const texture of new Set([material.map, material.normalMap, material.roughnessMap])) if (texture) {
          if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) texture.image.close();
          texture.dispose();
        }
        material.dispose();
      }
    }
    this.masters.clear();
  }
}
