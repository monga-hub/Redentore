import * as THREE from 'three';
import { arm, loadModel } from '../core/models.ts';
import { outfitSelection, type GearState } from '../loot/gear.ts';
import { HEROES, type Hero } from './heroes.ts';
import { WEAPONS } from './outfit.ts';
import { finishFoscaTierMaterial } from './tier-outfit-material.ts';
import type { Finish } from './hero-outfit-key.ts';

export const NATIVE_FOSCA = 'native-characters/fosca-3.glb';
// Register a chapter only after its complete native asset has passed the visual and gameplay gates.
export const NATIVE_CHARACTERS: Partial<Record<`${Hero}-${1 | 2 | 3}`, { file: string; walk: number; run: number }>> = {
  'fosca-3': { file: NATIVE_FOSCA, walk: 1.44, run: 4.54 },
};
export function nativeCharacter(hero: Hero, worn: GearState) {
  const s = outfitSelection(hero, worn);
  if (s.legacy || !['noncomune', 'raro', 'epico'].includes(s.rarity)) return;
  return NATIVE_CHARACTERS[`${hero}-${s.chapter}`];
}
export function nativeAppearance(hero: Hero, worn: GearState): Finish | undefined {
  const s = outfitSelection(hero, worn);
  if (!nativeCharacter(hero, worn)) return;
  return s.rarity === 'noncomune' ? 'green' : s.rarity === 'raro' ? 'blue' : s.rarity === 'epico' ? 'epic' : undefined;
}

/** Frees one owned representation, including late/stale downloads. Shared aura material stays owned by the actor. */
export function freeCharacter(root: THREE.Object3D, borrowed?: THREE.Material): void {
  root.removeFromParent();
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture | THREE.Skeleton>();
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh) || o.parent?.userData.twin === o) return;
    resources.add(o.geometry);
    if (o instanceof THREE.SkinnedMesh) resources.add(o.skeleton);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m === borrowed) continue;
      resources.add(m);
      for (const t of Object.values(m)) if (t instanceof THREE.Texture) resources.add(t);
    }
  });
  for (const r of resources) {
    r.dispose();
    if (r instanceof THREE.Texture && typeof ImageBitmap !== 'undefined' && r.image instanceof ImageBitmap) r.image.close();
  }
}

/** Own native mesh/skin remain intact; finishes and a measured prop socket are the only presentation changes. */
export class NativeOutfit {
  onWeapon: (top?: THREE.Object3D) => void = () => {};
  private weapon?: THREE.Object3D;
  private weaponId?: string;
  private version = 0;
  private disposed = false;
  private finish?: Finish;
  private originals = new Map<THREE.Mesh, THREE.MeshStandardMaterial>();
  private gripPosition = new THREE.Vector3();
  private gripRotation = new THREE.Quaternion();
  private root: THREE.Group;
  private hero: Hero;
  constructor(root: THREE.Group, hero: Hero = 'fosca') {
    this.root = root; this.hero = hero;
    root.traverse(o => {
      if (o instanceof THREE.SkinnedMesh) {
        this.originals.set(o, o.material as THREE.MeshStandardMaterial);
        const p = o.geometry.attributes.position;
        const rest = new Float32Array(p.count * 3), boot = new Float32Array(p.count);
        // Meshy's skin bind frame stores metres; its mesh node sits under a centimetre Armature.
        const v = new THREE.Vector3();
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i).applyMatrix4(o.bindMatrix).applyMatrix4(root.matrixWorld);
          v.x = -v.x; v.z = -v.z;
          v.multiplyScalar(1.85 / HEROES[hero].height);
          v.toArray(rest, i * 3); boot[i] = v.y < .34 ? 1 : 0;
        }
        o.geometry.setAttribute('aTierRest', new THREE.BufferAttribute(rest, 3));
        o.geometry.setAttribute('aBoot', new THREE.BufferAttribute(boot, 1));
        const hand = o.skeleton.bones.findIndex(b => b.name === 'RightHand');
        if (hand < 0) return;
        const into = o.skeleton.boneInverses[hand].clone().multiply(o.bindMatrix);
        const j = o.geometry.attributes.skinIndex, w = o.geometry.attributes.skinWeight, samples: THREE.Vector3[] = [];
        for (let i = 0; i < p.count; i++) {
          let weight = 0;
          for (let k = 0; k < 4; k++) if (j.getComponent(i, k) === hand) weight += w.getComponent(i, k);
          if (weight > .8) samples.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(into));
        }
        if (!samples.length) return;
        const quantile = (axis: 'x' | 'y' | 'z', k: number) => {
          const values = samples.map(p => p[axis]).sort((a, b) => a - b); return values[Math.floor((values.length - 1) * k)];
        };
        this.gripPosition.set(quantile('x', .5), quantile('y', .6), quantile('z', .5));
        let xx = 0, xz = 0, zz = 0;
        for (const p of samples) {
          const dx = p.x - this.gripPosition.x, dz = p.z - this.gripPosition.z;
          xx += dx * dx; xz += dx * dz; zz += dz * dz;
        }
        // Across this palm, measured from its own skin rather than assuming an old hand's bone roll.
        const angle = .5 * Math.atan2(2 * xz, xx - zz), across = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        const forward = new THREE.Vector3(0, 0, 1).transformDirection(o.skeleton.boneInverses[hand]);
        if (across.dot(forward) < 0) across.negate();
        const fingers = new THREE.Vector3(0, 1, 0), normal = fingers.clone().cross(across).normalize();
        this.gripRotation.setFromRotationMatrix(new THREE.Matrix4().makeBasis(fingers, across, normal));
      }
    });
  }
  async wear(worn: GearState): Promise<void> {
    const finish = nativeAppearance(this.hero, worn);
    if (finish && finish !== this.finish) {
      this.finish = finish;
      for (const [mesh, original] of this.originals) {
        if (mesh.material !== original) (mesh.material as THREE.Material).dispose();
        const material = original.clone();
        material.side = THREE.DoubleSide;
        material.emissive.setRGB(.12, .12, .12); material.emissiveMap = material.map;
        finishFoscaTierMaterial(material, finish, this.hero !== 'fosca' || outfitSelection(this.hero, worn).chapter !== 3);
        mesh.material = material;
      }
    }
    if (this.weaponId === worn.arma) return;
    this.weaponId = worn.arma;
    const request = ++this.version, w = worn.arma && WEAPONS[worn.arma];
    if (!w) { if (this.weapon) freeCharacter(this.weapon); this.weapon = undefined; this.onWeapon(); return; }
    const gltf = await loadModel(w.file);
    if (this.disposed || request !== this.version) { freeCharacter(gltf.scene); return; }
    if (w.flip) gltf.scene.rotation.z = Math.PI;
    const top = arm(this.root, gltf.scene, w.length, w.grip, w.lean);
    const held = top.parent!;
    held.position.copy(this.gripPosition);
    held.quaternion.copy(this.gripRotation);
    if (this.weapon) freeCharacter(this.weapon);
    this.weapon = held; this.onWeapon(top);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.version++;
    for (const original of this.originals.values()) original.dispose();
  }
  update(_dt: number): void {}
  clear(_dt: number, _ease: number): void {}
  showAura(_material: THREE.ShaderMaterial, _visible: boolean): void {}
}
