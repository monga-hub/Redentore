import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { arm, loadModel, stand } from '../core/models.ts';
import type { World } from '../core/physics.ts';
import type { Vfx } from '../abilities/vfx.ts';
import type { PlayerStats } from '../player/stats.ts';
import { FRIAR, hurt, separate, spawnGroups, think, type Friar, type State, type Target } from './brain.ts';
import { killAll, wipe } from './caster.ts';

// Frati non-morti: a gaunt Forsaken monk in a torn brown habit, generated, rigged and animated
// with Meshy AI (see ATTRIBUTION.md), a hoe in the right fist; it works the soil
// while idle. A skinned clone per friar sharing geometry; the AI lives in brain.ts.

const HEIGHT = 1.75; // m
const HOE = { length: 1.5, grip: 0.35 }; // m long, held this far up the handle
// swing: the overhead chop entered past its stance (`from`, s into the clip) and sped up so its
// blow (`hit`) lands at FRIAR.windup
const SWING = { from: 0.2, hit: 1.1 };
const HOE_RATE = 1; // idle hoeing
const IMPACT = 1.6; // s into the hoeing clip where the blade bites
const RUN = 5.5 * HEIGHT / 1.8; // m/s the run covers at rate 1 (a planted foot's speed, on a 1.8 m body): a slowed run chases, evades
const CLIPS: Record<State, string> = { hoe: 'Hoe', chase: 'Running', swing: 'Attack', evade: 'Running', dead: 'Dead' };
const FADE = 0.2;
const BAR_W = 0.07;
const SINK = { after: 6, time: 2.5, depth: 1.4 }; // corpse sinks into the soil, then hides

const DIRT = 0x3d2b1c, BLOOD = 0x8dff6a;

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
    if (f.state === 'hoe') {
      if (this.lastClip < IMPACT && a.time >= IMPACT) {
        const p = this.blade.getWorldPosition(new THREE.Vector3());
        vfx.burst(p.x, Math.max(p.y, f.y + 0.1), p.z, 10, 0.15, { life: 0.7, size: 0.09, color: DIRT, alpha: 0.9, normal: true, grav: 9, vy: 2.2, drag: 1 }, 1.1);
      }
      this.lastClip = a.time;
    }

    this.mixer.update(dt);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4);
    flash(this.mats, this.flash);

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
    next.timeScale = s === 'swing' ? (SWING.hit - SWING.from) / FRIAR.windup : s === 'hoe' ? HOE_RATE : s === 'chase' ? FRIAR.speed / RUN : s === 'evade' ? FRIAR.walk / RUN : 1;
    if (s === 'swing') next.time = SWING.from;
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
    if (m.userData.shared) return; // glows: shared, never flashed
    if (!own.has(m)) {
      const c = m.clone();
      c.userData.glow = m.emissive.r; // the GLB's own self-glow, kept under the flash
      own.set(m, c);
    }
    o.material = own.get(m)!;
  });
  return [...own.values()];
}

/** Hit flash: `k` 0..1 of red-hot over each material's own glow. */
export function flash(mats: THREE.MeshStandardMaterial[], k: number): void {
  for (const m of mats) { const g = m.userData.glow as number; m.emissive.setRGB(g + 0.9 * k, g + 0.15 * k, g + 0.1 * k); }
}

export function barMat(color: number): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({ color, fog: false, toneMapped: false, sizeAttenuation: false });
}

/** Stand the friar up and give it its hoe; every friar is a clone of this. */
function dress(scene: THREE.Group): void {
  stand(scene, HEIGHT);
  arm(scene, hoe(), HOE.length, HOE.grip).name = 'hoeBlade';
}

/**
 * The hoe, upright, 1 unit long: an ash handle, an iron blade at the top set at a right angle.
 * ponytail: built here, as three Meshy attempts never gave a blade across the handle.
 */
function hoe(): THREE.Group {
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5534, roughness: 0.85 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x5e5a55, roughness: 0.55, metalness: 0.3 }); // no environment map: a real metal would render black
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 1, 6), wood);
  handle.position.y = 0.5;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.15), iron);
  blade.position.set(0, 0.97, 0.07); // out from the handle, angled down like a hoe's
  blade.rotation.x = 0.35;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 6), iron);
  collar.position.y = 0.97;
  const g = new THREE.Group();
  g.add(handle, blade, collar);
  return g;
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
    loadModel('frate.glb').then((gltf) => {
      dress(gltf.scene);
      const t = { scene: gltf.scene, clips: gltf.animations };
      this.views = this.all.map(() => new View(t));
      for (const v of this.views) this.root.add(v.root);
    }, (e) => console.error('friar model failed to load', e));
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
