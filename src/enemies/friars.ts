import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Overlay, Shadows, arm, loadModel, stand } from '../core/models.ts';
import type { World } from '../core/physics.ts';
import { D, T, type DecalStyle, type RibbonStyle, type Style, type Vfx } from '../abilities/vfx.ts';
import type { PlayerStats } from '../player/stats.ts';
import { playSfx } from '../audio/engine.ts';
import { FRIAR, hurt, separate, spawnGroups, think, type Friar, type State, type Target } from './brain.ts';
import { killAll, wipe } from './caster.ts';

// Frati non-morti: a gaunt Forsaken monk in a torn brown habit, generated, rigged and animated
// with Meshy AI (see ATTRIBUTION.md), a hoe in the right fist; it works the soil
// while idle. A skinned clone per friar sharing geometry; the AI lives in brain.ts.

const HEIGHT = 1.75; // m
const HOE = { length: 1.5, grip: 0.35 }; // m long, held this far up the handle
// Swings, picked in turn: each entered past its stance (`from`, s into the clip) and sped up so
// its blow (`hit`) lands at FRIAR.windup: the overhead chop, a hammering two-handed blow, a slash.
const SWINGS = [{ clip: 'Attack', from: 0.2, hit: 1.1 }, { clip: 'Attack_Hammer', from: 0.6, hit: 1.5 }, { clip: 'Attack_Slash', from: 0.3, hit: 0.52 }];
const DEATHS = ['Dead', 'Dead_Knock', 'Dead_Shot'];
// Layered on the upper body: a flinch per hit (a heavier one for big blows), a war cry on aggro (s into the clip).
const FLINCH = { light: { clip: 'Hit_Light', from: 0.1, stop: 0.75 }, heavy: { clip: 'Hit_Heavy', from: 0.4, stop: 1.3 }, cry: { clip: 'Scream', from: 0.55, stop: 1.8 } };
const BIG = 25; // damage that makes a heavy flinch
const HOE_RATE = 1; // idle hoeing
const IMPACT = 1.6; // s into the hoeing clip where the blade bites
const RUN = 5.5 * HEIGHT / 1.8; // m/s the run covers at rate 1 (a planted foot's speed, on a 1.8 m body): a slowed run chases, evades
const CLIPS: Record<State, string> = { hoe: 'Hoe', chase: 'Running', swing: 'Attack', evade: 'Running', dead: 'Dead' }; // swing, dead: see SWINGS, DEATHS
const FADE = 0.2;
const BAR_W = 0.07;
const SINK = { after: 6, time: 2.5, depth: 1.4 }; // corpse sinks into the soil, then hides
const FAR = 40; // m: hoeing friars farther than this skip their animation, like the priests (priests.ts)

const DIRT = 0x3d2b1c, BLOOD = 0x8dff6a;
const clod: Style = { life: [0.5, 0.8], size: [0.07, 0.12], color: DIRT, alpha: 0.95, dark: true, tex: T.ember, grav: 9, drag: 1, spin: [2, 6] };
const dust: Style = { life: [0.8, 1.2], size: [0.3, 0.5], grow: 2, color: 0x6a5642, alpha: 0.4, tex: T.smoke, erode: true, dark: true, drag: 2 };
const ichor: Style = { life: [0.6, 1.1], size: [0.06, 0.12], color: BLOOD, hdr: 2, tex: T.drop, grav: 8, drag: 1 };
const soul: Style = { life: [1.4, 1.8], size: 0.5, grow: 1.5, color: 0xb8ffb0, hdr: 1.2, alpha: 0.6, tex: T.skull, grav: -1.2, fadeIn: 0.25 };
const soulWisp: Style = { life: [1, 1.5], size: [0.4, 0.6], grow: 1.8, color: BLOOD, hdr: 0.7, alpha: 0.5, tex: T.wisp, erode: true, grav: -1 };
const gash: DecalStyle = { life: 2.5, size: 0.9, tile: D.scorch, color: 0x1a120a, alpha: 0.7, fadeOut: 0.5, dark: true };
const hoeTrail: RibbonStyle = { color: 0xd8cfc0, color2: 0x4a3a26, hdr: 1.2, alpha: 0.55, width: 0, life: 0.12 };

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
  private overlay: Overlay;
  private shadows: Shadows;
  private swings = 0; // which of SWINGS comes next
  private trail = -1; // the hoe's swing trail
  private flinched = 0; // s since the last flinch
  private held: THREE.Object3D;
  private v = new THREE.Vector3();
  private w = new THREE.Vector3();

  constructor(t: Template) {
    const model = cloneSkinned(t.scene) as THREE.Group;
    this.mats = ownMaterials(model);
    this.blade = model.getObjectByName('hoeBlade')!;
    this.held = model.getObjectByName('held')!;
    this.root.add(model);
    this.shadows = new Shadows(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const c of new Set([...Object.values(CLIPS), ...SWINGS.map((w) => w.clip), ...DEATHS])) {
      const clip = THREE.AnimationClip.findByName(t.clips, c);
      if (clip) this.actions.set(c, this.mixer.clipAction(clip));
    }
    this.swings = Math.floor(Math.random() * SWINGS.length);
    this.overlay = new Overlay(this.mixer, t.clips, Object.values(FLINCH).map((f) => f.clip));

    const bg = new THREE.Sprite(barMat(0x140c08));
    bg.scale.set(0.075, 0.011, 1); // fraction of the view height: nameplate-sized at any distance
    this.fill = new THREE.Sprite(barMat(0xc8241c));
    this.fill.scale.set(BAR_W, 0.006, 1);
    this.fill.renderOrder = 1;
    this.bar.add(bg, this.fill);
    this.bar.position.y = HEIGHT + 0.35;
    this.root.add(this.bar);
  }

  /** Struck for `n`: the red flash, and a flinch unless it is mid-swing. */
  hit(n: number, f: Friar): void {
    this.flash = 1;
    if (f.state === 'chase' && this.flinched > 0.35) {
      const k = n >= BIG ? FLINCH.heavy : FLINCH.light;
      this.overlay.play(k.clip, k.from, k.stop, 1.4);
      this.flinched = 0;
    }
  }

  /** Sync with the brain. `vfx` gets dirt puffs on every hoe stroke and the hoe's swing trails. `d`: m from the hero. */
  update(f: Friar, dt: number, vfx: Vfx, d: number): void {
    const was = this.state;
    if (f.state !== this.state) this.enter(f.state, this.state);
    if (was === 'hoe' && f.state === 'chase') this.overlay.play(FLINCH.cry.clip, FLINCH.cry.from, FLINCH.cry.stop, 1.4); // pulled: a war cry as it sets off
    const a = this.current!;
    this.flinched += dt;

    // Hoe strokes throw up a clod of earth where the blade bites.
    if (f.state === 'hoe') {
      if (this.lastClip < IMPACT && a.time >= IMPACT) {
        const p = this.blade.getWorldPosition(this.v);
        vfx.burst(clod, p.x, Math.max(p.y, f.y + 0.1), p.z, 8, 0.15, 1.1, 2.2);
        vfx.spawn(dust, p.x, f.y + 0.15, p.z);
        playSfx('hoe', p);
      }
      this.lastClip = a.time;
    }

    // The swing's arc, from just before the blow to just after; a blow on the floor gouges it.
    const live = f.state === 'swing' && f.t > FRIAR.windup - 0.3 && f.t < FRIAR.windup + 0.12;
    if (live && this.trail < 0) this.trail = vfx.ribbons.begin(hoeTrail, true);
    if (this.trail >= 0) {
      this.blade.getWorldPosition(this.w);
      this.held.getWorldPosition(this.v).lerp(this.w, 0.5);
      vfx.ribbons.push(this.trail, this.v.x, this.v.y, this.v.z, this.w.x, this.w.y, this.w.z);
      if (!live) {
        vfx.ribbons.end(this.trail);
        this.trail = -1;
        if (this.w.y < f.y + 0.5) { vfx.decal(gash, this.w.x, f.y + 0.03, this.w.z); vfx.burst(clod, this.w.x, f.y + 0.1, this.w.z, 10, 0.2, 1.5, 2.5); }
      }
    }

    this.overlay.update(dt, f.state === 'swing' || f.state === 'dead');
    if (d < FAR || f.state !== 'hoe') this.mixer.update(dt);
    this.shadows.update(d);
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
    const sw = SWINGS[this.swings % SWINGS.length];
    if (s === 'swing') this.swings++;
    const clip = s === 'swing' ? sw.clip : s === 'dead' ? DEATHS[Math.floor(Math.random() * DEATHS.length)] : CLIPS[s];
    const next = this.actions.get(clip) ?? this.actions.get(CLIPS[s])!;
    next.reset();
    next.setLoop(s === 'swing' || s === 'dead' ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = true;
    next.timeScale = s === 'swing' ? (sw.hit - sw.from) / FRIAR.windup : s === 'hoe' ? HOE_RATE : s === 'chase' ? FRIAR.speed / RUN : s === 'evade' ? FRIAR.walk / RUN : 1;
    if (s === 'swing') next.time = sw.from;
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
 * One mesh coloured per vertex (one draw call per friar, not three).
 * ponytail: built here, as three Meshy attempts never gave a blade across the handle.
 */
function hoe(): THREE.Group {
  const part = (geo: THREE.BufferGeometry, color: number, m: THREE.Matrix4) => {
    const g = geo.applyMatrix4(m).toNonIndexed(), c = new THREE.Color(color), n = g.attributes.position.count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => c.toArray()[i % 3]), 3));
    return g;
  };
  const at = (x: number, y: number, z: number, rx = 0) => new THREE.Matrix4().makeRotationX(rx).setPosition(x, y, z);
  const geo = mergeGeometries([
    part(new THREE.CylinderGeometry(0.018, 0.022, 1, 6), 0x7a5534, at(0, 0.5, 0)), // ash handle
    part(new THREE.BoxGeometry(0.16, 0.012, 0.15), 0x5e5a55, at(0, 0.97, 0.07, 0.35)), // blade, out from the handle, angled down like a hoe's
    part(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 6), 0x5e5a55, at(0, 0.97, 0)), // iron collar
  ]);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15 }))); // no environment map: a real metal would render black
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
    this.all.forEach((f, i) => this.views[i].update(f, dt, this.vfx, Math.hypot(f.x - player.x, f.z - player.z)));
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
      if (n >= 1 || killed) { // damage-over-time ticks don't strobe
        this.views[i]?.hit(n, f);
        this.vfx.impact(f.x, f.y + HEIGHT * 0.6, f.z, n >= BIG);
      }
      if (killed) {
        this.vfx.burst(ichor, f.x, f.y + 1, f.z, 24, 0.4, 2.5, 1.5);
        this.vfx.spawn(soul, f.x, f.y + 1.4, f.z);
        this.vfx.burst(soulWisp, f.x, f.y + 1, f.z, 5, 0.3, 0.5);
      }
    });
  }
}
