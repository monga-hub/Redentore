import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { World } from '../core/physics.ts';
import type { Vfx } from '../abilities/vfx.ts';
import type { PlayerStats } from '../player/stats.ts';
import { FRIAR, hurt, separate, spawnGroups, think, type Friar, type State, type Target } from './brain.ts';
import { killAll, wipe } from './caster.ts';

// Frati non-morti: KayKit "Skeleton Mage" (CC0, see ATTRIBUTION.md) re-dressed as a friar —
// the wizard hat swapped for a procedural cowl, the robe dyed habit-brown, eyes turned
// grave-green and a hoe in the right hand. One GLB load, a skinned clone per friar sharing
// geometry; the AI lives in brain.ts.

const URL = `${import.meta.env.BASE_URL}models/skeleton_mage.glb`;
const HEIGHT = 1.75; // m, cowl tip
const CHOP = '2H_Melee_Attack_Chop';
const SWING_RATE = 1.4; // swing: clip played this much faster than authored
const HOE_RATE = 0.7; // idle hoeing: slow and heavy
const IMPACT = FRIAR.windup * SWING_RATE; // s into the chop clip where the hoe bites
const CLIPS: Record<State, string> = { hoe: CHOP, chase: 'Walking_D_Skeletons', swing: CHOP, evade: 'Running_B', dead: 'Death_A' };
const FADE = 0.2;
const BAR_W = 0.07;
const SINK = { after: 6, time: 2.5, depth: 1.4 }; // corpse sinks into the soil, then hides

const CLOTH = 0x6e4c33, EYES = 0x7dff3a, DIRT = 0x3d2b1c, BLOOD = 0x8dff6a;

interface Template {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
}

/** One friar's model, animation and nameplate bar. */
class View {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current?: THREE.AnimationAction;
  private state?: State;
  private mats: THREE.MeshStandardMaterial[] = [];
  private flash = 0;
  private blade!: THREE.Object3D;
  private bar = new THREE.Group();
  private fill: THREE.Sprite;
  private lastClip = 0;

  constructor(t: Template) {
    const model = cloneSkinned(t.scene) as THREE.Group;
    this.mats = ownMaterials(model);
    this.blade = model.getObjectByName('hoeBlade')!;
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const c of new Set(Object.values(CLIPS))) {
      const clip = THREE.AnimationClip.findByName(t.clips, c);
      if (clip) this.actions.set(c, this.mixer.clipAction(clip));
    }

    const bg = new THREE.Sprite(barMat(0x140c08));
    bg.scale.set(0.075, 0.011, 1); // fraction of the view height: nameplate-sized at any distance
    this.fill = new THREE.Sprite(barMat(0xc8241c));
    this.fill.scale.set(BAR_W, 0.006, 1);
    this.fill.renderOrder = 1;
    this.bar.add(bg, this.fill);
    this.bar.position.y = HEIGHT + 0.35;
    this.root.add(this.bar);
  }

  hit(): void {
    this.flash = 1;
  }

  /** Sync with the brain. `vfx` gets dirt puffs on every hoe stroke. */
  update(f: Friar, dt: number, vfx: Vfx): void {
    if (f.state !== this.state) this.enter(f.state, this.state);
    const a = this.current!;

    // Hoe strokes throw up a clod of earth where the blade bites.
    if (f.state === 'hoe' && a.getClip().name === CHOP) {
      if (this.lastClip < IMPACT && a.time >= IMPACT) {
        const p = this.blade.getWorldPosition(new THREE.Vector3());
        vfx.burst(p.x, Math.max(p.y, f.y + 0.1), p.z, 10, 0.15, { life: 0.7, size: 0.09, color: DIRT, alpha: 0.9, normal: true, grav: 9, vy: 2.2, drag: 1 }, 1.1);
      }
      this.lastClip = a.time;
    }

    this.mixer.update(dt);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4);
    for (const m of this.mats) m.emissive.setRGB(0.9 * this.flash, 0.15 * this.flash, 0.1 * this.flash);

    let sink = 0;
    if (f.state === 'dead') sink = THREE.MathUtils.clamp((f.t - SINK.after) / SINK.time, 0, 1);
    this.root.visible = sink < 1;
    this.root.position.set(f.x, f.y - sink * SINK.depth, f.z);
    this.root.rotation.y = f.yaw;

    const r = f.hp / FRIAR.hp;
    this.bar.visible = f.state !== 'dead' && (f.state !== 'hoe' || r < 1);
    this.fill.scale.x = BAR_W * Math.max(r, 1e-3);
    this.fill.center.x = 0.5 / Math.max(r, 1e-3); // keep the bar's left edge put as it drains
  }

  private enter(s: State, from?: State): void {
    const next = this.actions.get(CLIPS[s])!;
    next.reset();
    next.setLoop(s === 'swing' || s === 'dead' ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = true;
    next.timeScale = s === 'swing' ? SWING_RATE : s === 'hoe' ? HOE_RATE : s === 'chase' ? FRIAR.speed / 2.2 : 1;
    if (s === 'hoe' && !from) next.time = Math.random() * next.getClip().duration; // groups don't hoe in lockstep
    next.play();
    if (this.current && this.current !== next) next.crossFadeFrom(this.current, FADE, false);
    this.current = next;
    this.state = s;
    this.lastClip = next.time;
  }
}

/** Give a skinned clone its own materials so a hit flash only lights this one; programs stay shared. */
export function ownMaterials(model: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const own = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o.material as THREE.MeshStandardMaterial;
    if (m.name === 'Glow' || m.userData.shared) return; // eyes and glows: shared, never flashed
    if (!own.has(m)) {
      const c = m.clone(); // clone() drops shader hooks: carry the dye over
      c.onBeforeCompile = m.onBeforeCompile;
      c.customProgramCacheKey = m.customProgramCacheKey;
      own.set(m, c);
    }
    o.material = own.get(m)!;
  });
  return [...own.values()];
}

export function barMat(color: number): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({ color, fog: false, toneMapped: false, sizeAttenuation: false });
}

/** Re-dress the mage once; every friar is a clone of this. */
function dress(scene: THREE.Group): void {
  scene.rotation.y = Math.PI; // the model faces +Z, the game's yaw 0 faces -Z
  const hat = scene.getObjectByName('Skeleton_Mage_Hat')!;
  const head = hat.parent!;
  hat.removeFromParent();
  scene.updateMatrixWorld(true);

  const skull = new THREE.Box3().setFromObject(scene.getObjectByName('Skeleton_Mage_Skull')!);
  const size = skull.getSize(new THREE.Vector3()), c = skull.getCenter(new THREE.Vector3());
  const cloth = new THREE.MeshStandardMaterial({ color: CLOTH, roughness: 0.95, side: THREE.DoubleSide });
  const hood = new THREE.Group();
  // Cowl: a sphere with the face cut out, open just below the jaw; the tip trails behind.
  // World space of the template (rotated π): the face looks along -Z here.
  const r = Math.max(size.x, size.z) * 0.68;
  const cowl = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12, Math.PI * 1.5 + 0.6, Math.PI * 2 - 1.2, 0, Math.PI * 0.74), cloth);
  cowl.scale.set(1, size.y / size.x * 1.08, 1.08);
  cowl.position.set(c.x, c.y + size.y * 0.06, c.z + size.z * 0.1);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(r * 0.45, r * 1.1, 10), cloth);
  tip.position.set(c.x, c.y + size.y * 0.32, c.z + r * 0.85);
  tip.rotation.x = 1.05;
  hood.add(cowl, tip);
  head.attach(hood);
  // Mozzetta: the short shoulder cape the cowl hangs from.
  const capeH = size.y * 0.42;
  const cape = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 1.05, capeH, 16, 1, true), cloth);
  cape.position.set(c.x, skull.min.y - capeH * 0.35, c.z + size.z * 0.08);
  scene.getObjectByName('chest')!.attach(cape);
  scene.updateMatrixWorld(true);
  const top = new THREE.Box3().setFromObject(scene).max.y; // cowl tip, before the hoe rises above it

  // Hoe in the right fist: ash handle, iron blade at the top facing forward. In the bind pose
  // the arms are out along ±X and a fist grips along Y.
  const hand = scene.getObjectByName('handslotr')!; // GLTFLoader strips the dot from 'handslot.r'
  const hp = hand.getWorldPosition(new THREE.Vector3());
  const L = size.y * 2.6; // ~1.3 m against a ~0.5 m skull in the scaled model
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.85 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.5, metalness: 0.7 });
  const hoe = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.018, L * 0.022, L, 6), wood);
  handle.position.y = L * 0.2;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(L * 0.16, L * 0.012, L * 0.13), iron);
  blade.position.set(0, L * 0.67, -L * 0.055); // forward of the handle, angled down like a hoe
  blade.rotation.x = -0.35;
  blade.name = 'hoeBlade';
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.03, L * 0.03, L * 0.06, 6), iron);
  collar.position.y = L * 0.68;
  hoe.add(handle, blade, collar);
  hoe.position.copy(hp);
  hand.attach(hoe);

  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = true;
    o.frustumCulled = false; // skinned: bind-pose bounds don't follow the animation
    const m = o.material as THREE.MeshStandardMaterial;
    if (m.name === 'Glow') { m.color.setHex(EYES); m.emissive.setHex(EYES); }
    if (m.name === 'skeleton') dye(m);
  });

  scene.scale.setScalar(HEIGHT / top);
}

/** Robe and sleeves share the bone atlas, so dye in the shader: only the mage's reds turn habit brown. */
function dye(m: THREE.MeshStandardMaterial): void {
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
	float redness = smoothstep(0.06, 0.2, diffuseColor.r - max(diffuseColor.g, diffuseColor.b));
	vec3 habit = vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))) * vec3(1.25, 0.88, 0.6);
	diffuseColor.rgb = mix(diffuseColor.rgb, habit, redness);`);
  };
  m.customProgramCacheKey = () => 'friar-habit';
}

/** Every friar in the orto: brains, models, combat glue. */
export class Friars {
  readonly root = new THREE.Group();
  readonly all: Friar[];
  private views: View[] = [];
  private world: World;
  private vfx: Vfx;
  private stats: PlayerStats;

  constructor(world: World, vfx: Vfx, stats: PlayerStats) {
    this.world = world;
    this.vfx = vfx;
    this.stats = stats;
    this.all = spawnGroups(world).flat();
    new GLTFLoader().load(URL, (gltf) => {
      dress(gltf.scene);
      const t = { scene: gltf.scene, clips: gltf.animations };
      this.views = this.all.map(() => new View(t));
      for (const v of this.views) this.root.add(v.root);
    }, undefined, (e) => console.error('friar model failed to load', e));
  }

  /** AI + animation. `player`: feet position. Melee hits go to the player's stats. */
  update(dt: number, player: Target): void {
    if (!this.views.length) return; // wait for the model: no invisible hoes
    let dmg = 0;
    for (const f of this.all) dmg += think(f, player, this.world, dt);
    separate(this.all, this.world);
    this.all.forEach((f, i) => this.views[i].update(f, dt, this.vfx));
    if (dmg > 0) this.stats.takeDamage(dmg);
  }

  /** The boss has fallen: every friar drops dead for good. */
  killAll(): void {
    killAll(this.all);
  }

  /** The player died: whoever was fighting evades home at full health. */
  wipe(): void {
    wipe(this.all);
  }

  /** Damage every friar for which `inside(x, z)` holds (abilities). */
  hurtWhere(inside: (x: number, z: number, f: Friar) => boolean, n: number): void {
    this.all.forEach((f, i) => {
      if (f.state === 'dead' || !inside(f.x, f.z, f)) return;
      const killed = hurt(f, n);
      if (n >= 1 || killed) this.views[i]?.hit(); // damage-over-time ticks don't strobe
      if (killed) this.vfx.burst(f.x, f.y + 1, f.z, 30, 0.4, { life: 1.2, size: 0.12, color: BLOOD, hdr: 2, drag: 1.5, vy: 0.8 }, 1.4);
    });
  }
}
