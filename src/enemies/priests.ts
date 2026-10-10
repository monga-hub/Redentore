import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { World } from '../core/physics.ts';
import type { Vfx } from '../abilities/vfx.ts';
import type { PlayerStats } from '../player/stats.ts';
import type { Area } from '../level/builder.ts';
import { separate, type Target } from './brain.ts';
import { PRIEST, cloisterPlan, fly, hurt, spawnPriests, think, type Bolt, type CasterState, type Priest } from './caster.ts';
import { barMat, ownMaterials } from './friars.ts';

// Preti non-morti: the same KayKit "Skeleton Mage" (CC0, see ATTRIBUTION.md) as the friars,
// re-dressed darker so they read apart at a glance — a tall pointed hood, a gold-edged stole,
// the robe dyed near-black violet, violet eyes and a staff with a shadow crystal. They pray
// in the cloisters in threes and throw homing shadow bolts; the AI lives in caster.ts.

const URL = `${import.meta.env.BASE_URL}models/skeleton_mage.glb`;
const HEIGHT = 1.85; // m, hood tip
const CLIPS: Record<CasterState, string> = { pray: 'Idle', chase: 'Idle_Combat', cast: 'Spellcasting', evade: 'Running_B', dead: 'Death_A' };
const STEP: Record<-1 | 1, string> = { [-1]: 'Walking_Backwards', 1: 'Walking_A' };
const SHOOT = 'Spellcast_Shoot', RISE = 'Skeletons_Awaken_Standing';
const FADE = 0.2;
const BAR_W = 0.07;
const SINK = { after: 6, time: 2.5, depth: 1.4 };
const FAR = 40; // m: praying priests farther than this skip their animation (they barely move)

const CLOTH = 0x1d1424, TRIM = 0xb48a3c, EYES = 0xb05cff;
const SHADOW = 0x8a3cff, CORE = 0xa45cff, SMOKE = 0x1a0b26;

interface Template {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
}

/** One priest's model, animation and nameplate bar. */
class View {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current?: THREE.AnimationAction;
  private clip = '';
  private state?: CasterState;
  private once = false; // a one-shot (bolt release, rising from the dead) is playing
  private mats: THREE.MeshStandardMaterial[];
  private flash = 0;
  private tip: THREE.Object3D;
  private bar = new THREE.Group();
  private fill: THREE.Sprite;
  private sparks = 0;

  constructor(t: Template) {
    const model = cloneSkinned(t.scene) as THREE.Group;
    this.mats = ownMaterials(model);
    this.tip = model.getObjectByName('staffTip')!;
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const c of [...Object.values(CLIPS), ...Object.values(STEP), SHOOT, RISE]) {
      const clip = THREE.AnimationClip.findByName(t.clips, c);
      if (clip) this.actions.set(c, this.mixer.clipAction(clip));
    }

    const bg = new THREE.Sprite(barMat(0x140c08));
    bg.scale.set(0.075, 0.011, 1);
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

  /** World position of the staff's crystal (bolts leave from here). */
  tipAt(v = new THREE.Vector3()): THREE.Vector3 {
    return this.tip.getWorldPosition(v);
  }

  /** Sync with the brain; `far`: the player is too far for anyone to see this priest animate. */
  update(f: Priest, dt: number, vfx: Vfx, far: boolean): void {
    const from = this.state;
    if (f.state !== from) {
      this.state = f.state;
      if (from === 'dead') this.play(RISE, true); // respawn: claw up before praying
      else if (from === 'cast' && f.state === 'chase' && f.cd > 1) this.play(SHOOT, true); // released, not interrupted
      else this.once = false;
    }
    if (this.once && !this.current!.isRunning()) this.once = false;
    if (!this.once) this.play(f.state === 'chase' && f.move ? STEP[f.move] : CLIPS[f.state]);

    // Casting: the crystal swells and shadow motes spiral into it.
    const p = f.state === 'cast' ? Math.min(f.t / PRIEST.cast, 1) : 0;
    this.tip.scale.setScalar(1 + p * 1.2);
    if (p > 0) {
      this.sparks += dt * (25 + p * 60);
      const c = this.tipAt();
      for (; this.sparks >= 1; this.sparks--) {
        const a = Math.random() * Math.PI * 2, r = 0.35 + Math.random() * 0.3, y = (Math.random() - 0.3) * 0.5;
        vfx.puff({ x: c.x + Math.cos(a) * r, y: c.y + y, z: c.z + Math.sin(a) * r, vx: -Math.cos(a) * r * 2 - Math.sin(a), vy: -y * 2, vz: -Math.sin(a) * r * 2 + Math.cos(a), life: 0.4, size: 0.07, color: SHADOW, hdr: 2.4, drag: 1 });
      }
    }

    if (!far || f.state !== 'pray') this.mixer.update(dt);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4);
    for (const m of this.mats) m.emissive.setRGB(0.9 * this.flash, 0.15 * this.flash, 0.1 * this.flash);

    let sink = 0;
    if (f.state === 'dead') sink = THREE.MathUtils.clamp((f.t - SINK.after) / SINK.time, 0, 1);
    this.root.visible = sink < 1;
    this.root.position.set(f.x, f.y - sink * SINK.depth, f.z);
    this.root.rotation.y = f.yaw;

    const r = f.hp / PRIEST.hp;
    this.bar.visible = f.state !== 'dead' && (f.state !== 'pray' || r < 1);
    this.fill.scale.x = BAR_W * Math.max(r, 1e-3);
    this.fill.center.x = 0.5 / Math.max(r, 1e-3);
  }

  private play(name: string, once = false): void {
    if (name === this.clip && !once) return;
    const next = this.actions.get(name)!;
    next.reset();
    next.setLoop(once || name === CLIPS.dead ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = true;
    next.timeScale = name === STEP[1] ? PRIEST.speed / 2 : name === SHOOT ? 1.4 : 1;
    if (name === CLIPS.pray && !this.clip) next.time = Math.random() * next.getClip().duration; // not in lockstep
    next.play();
    if (this.current && this.current !== next) next.crossFadeFrom(this.current, FADE, false);
    this.current = next;
    this.clip = name;
    this.once = once;
  }
}

/** Re-dress the mage once as a priest; every priest is a clone of this. */
function dress(scene: THREE.Group): void {
  scene.rotation.y = Math.PI; // the model faces +Z, the game's yaw 0 faces -Z
  const hat = scene.getObjectByName('Skeleton_Mage_Hat')!;
  const head = hat.parent!;
  hat.removeFromParent();
  scene.updateMatrixWorld(true);

  const skull = new THREE.Box3().setFromObject(scene.getObjectByName('Skeleton_Mage_Skull')!);
  const size = skull.getSize(new THREE.Vector3()), c = skull.getCenter(new THREE.Vector3());
  const cloth = new THREE.MeshStandardMaterial({ color: CLOTH, roughness: 0.9, side: THREE.DoubleSide });
  const gold = new THREE.MeshStandardMaterial({ color: TRIM, roughness: 0.45, metalness: 0.8 });
  // Hood: a deep cowl with the face cut out (the face looks along -Z here, see friars.ts)
  // drawn up into a tall point that leans back: a silhouette no friar has.
  const r = Math.max(size.x, size.z) * 0.7;
  const hood = new THREE.Group();
  const cowl = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12, Math.PI * 1.5 + 0.5, Math.PI * 2 - 1, 0, Math.PI * 0.78), cloth);
  cowl.scale.set(1, (size.y / size.x) * 1.12, 1.12);
  cowl.position.set(c.x, c.y + size.y * 0.06, c.z + size.z * 0.12);
  const point = new THREE.Mesh(new THREE.ConeGeometry(r * 0.8, r * 2.2, 14, 1, true), cloth);
  point.position.set(c.x, c.y + size.y * 0.62, c.z + r * 0.35);
  point.rotation.x = 0.35;
  const hem = new THREE.Mesh(new THREE.TorusGeometry(r * 0.78, r * 0.06, 6, 24, Math.PI * 2 - 1.1), gold); // gold edge round the face
  hem.position.set(c.x, c.y + size.y * 0.06, c.z - r * 0.55);
  hem.rotation.z = Math.PI / 2 + 0.55;
  hood.add(cowl, point, hem);
  head.attach(hood);
  // Shoulder cape and a stole: two gold-edged bands hanging down the chest.
  const chest = scene.getObjectByName('chest')!;
  const capeH = size.y * 0.5;
  const cape = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 1.2, capeH, 16, 1, true), cloth);
  cape.position.set(c.x, skull.min.y - capeH * 0.3, c.z + size.z * 0.08);
  chest.attach(cape);
  for (const s of [-1, 1]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.16, size.y * 1.1, size.z * 0.03), gold);
    band.position.set(c.x + s * size.x * 0.2, skull.min.y - size.y * 0.75, c.z - r * 0.95);
    chest.attach(band);
  }
  scene.updateMatrixWorld(true);
  const top = new THREE.Box3().setFromObject(scene).max.y; // hood tip, before the staff rises above it

  // Staff in the right fist: dark wood, gold
  // prongs cradling a violet shadow crystal that swells while a spell is cast.
  const hand = scene.getObjectByName('handslotr')!;
  const L = size.y * 3.2; // ~1.6 m
  const wood = new THREE.MeshStandardMaterial({ color: 0x2b1d17, roughness: 0.8 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(SHADOW).multiplyScalar(2.5) });
  glow.userData.shared = true; // a hit flash leaves the crystal alone
  const staff = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.016, L * 0.02, L, 6), wood);
  shaft.position.y = L * 0.2;
  const crown = new THREE.Mesh(new THREE.TorusGeometry(L * 0.045, L * 0.008, 5, 10, Math.PI * 1.4), gold);
  crown.position.y = L * 0.74;
  crown.rotation.z = -Math.PI * 0.2;
  const tip = new THREE.Mesh(new THREE.OctahedronGeometry(L * 0.035), glow);
  tip.position.y = L * 0.76;
  tip.scale.y = 1.5;
  tip.name = 'staffTip';
  staff.add(shaft, crown, tip);
  staff.position.copy(hand.getWorldPosition(new THREE.Vector3()));
  hand.attach(staff);
  staff.rotation.set(0, 0, Math.PI / 2); // upright along the slot's -X, which points up while idle and casting

  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = o.material !== glow;
    o.frustumCulled = false; // skinned: bind-pose bounds don't follow the animation
    const m = o.material as THREE.MeshStandardMaterial;
    if (m.name === 'Glow') { m.color.setHex(EYES); m.emissive.setHex(EYES); }
    if (m.name === 'skeleton') dye(m);
  });

  scene.scale.setScalar(HEIGHT / top);
}

/** The mage's reds turn a near-black violet cassock (shader dye, the robe shares the bone atlas). */
function dye(m: THREE.MeshStandardMaterial): void {
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
	float redness = smoothstep(0.06, 0.2, diffuseColor.r - max(diffuseColor.g, diffuseColor.b));
	vec3 cassock = vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))) * vec3(0.42, 0.3, 0.55);
	diffuseColor.rgb = mix(diffuseColor.rgb, cassock, redness);`);
  };
  m.customProgramCacheKey = () => 'priest-cassock';
}

/** Every priest in the cloisters: brains, models, shadow bolts, combat glue. */
export class Priests {
  readonly root = new THREE.Group();
  readonly all: Priest[];
  private views: View[] = [];
  private bolts: Bolt[] = [];
  private spent: Bolt[] = [];
  private orbs: THREE.Mesh[] = []; // one glowing core per bolt in flight, pooled
  private orbGeo = new THREE.SphereGeometry(0.1, 12, 8);
  private orbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(CORE).multiplyScalar(1.6), fog: false });
  private world: World;
  private vfx: Vfx;
  private stats: PlayerStats;
  private v = new THREE.Vector3();

  constructor(world: World, vfx: Vfx, stats: PlayerStats, areas: Area[]) {
    this.world = world;
    this.vfx = vfx;
    this.stats = stats;
    const plan = cloisterPlan(world, areas);
    this.all = spawnPriests(world, plan.flatMap((c) => c.groups), plan.flatMap((c) => c.groups.map(() => c.area))).flat();
    new GLTFLoader().load(URL, (gltf) => {
      dress(gltf.scene);
      const t = { scene: gltf.scene, clips: gltf.animations };
      this.views = this.all.map(() => new View(t));
      for (const v of this.views) this.root.add(v.root);
    }, undefined, (e) => console.error('priest model failed to load', e));
  }

  /** AI, spells and animation. `player`: feet position. Bolts that land hit the player's stats. */
  update(dt: number, player: Target): void {
    if (!this.views.length) return;
    this.all.forEach((f, i) => {
      const n = this.bolts.length;
      think(f, player, this.world, dt, this.bolts);
      if (this.bolts.length === n) return;
      // A new bolt leaves from the caster's crystal, with a flare.
      const b = this.bolts[n];
      this.views[i].tipAt(this.v);
      b.x = this.v.x; b.y = this.v.y; b.z = this.v.z;
      this.vfx.burst(b.x, b.y, b.z, 14, 0.15, { life: 0.4, size: 0.1, color: SHADOW, hdr: 3, drag: 4 }, 2);
    });
    separate(this.all, this.world);
    const dmg = fly(this.bolts, player, dt, this.spent);
    for (const b of this.spent) {
      if (!b.hit) { this.vfx.burst(b.x, b.y, b.z, 10, 0.2, { life: 0.5, size: 0.1, color: SHADOW, hdr: 2, drag: 3 }, 0.8); continue; }
      this.vfx.burst(b.x, b.y, b.z, 26, 0.3, { life: 0.6, size: 0.12, color: SHADOW, hdr: 3, drag: 3 }, 2.4);
      this.vfx.burst(b.x, b.y, b.z, 10, 0.3, { life: 0.9, size: 0.3, color: SMOKE, alpha: 0.7, normal: true, grow: 2, drag: 2, vy: 0.4 }, 0.6);
      this.vfx.pulse(b.x, b.y, b.z, SHADOW, 25);
    }
    this.drawBolts(dt);
    this.all.forEach((f, i) => this.views[i].update(f, dt, this.vfx, f.state === 'pray' && Math.hypot(f.x - player.x, f.z - player.z) > FAR));
    if (dmg > 0) this.stats.takeDamage(dmg);
  }

  private drawBolts(dt: number): void {
    while (this.orbs.length < this.bolts.length) {
      const o = new THREE.Mesh(this.orbGeo, this.orbMat);
      this.orbs.push(o);
      this.root.add(o);
    }
    this.orbs.forEach((o, i) => {
      const b = this.bolts[i];
      o.visible = !!b;
      if (!b) return;
      o.position.set(b.x, b.y, b.z);
      o.scale.setScalar(1 + Math.sin(b.t * 30) * 0.15);
      // Trail: bright motes and a wisp of dark smoke streaming behind.
      for (let n = 0; n < 2; n++) this.vfx.puff({ x: b.x + (Math.random() - 0.5) * 0.15, y: b.y + (Math.random() - 0.5) * 0.15, z: b.z + (Math.random() - 0.5) * 0.15, life: 0.35, size: 0.14, color: SHADOW, hdr: 2.6, grow: 0.3 });
      if (Math.random() < dt * 30) this.vfx.puff({ x: b.x, y: b.y, z: b.z, vy: 0.3, life: 0.6, size: 0.18, color: SMOKE, alpha: 0.6, normal: true, grow: 2 });
    });
  }

  /** Damage every priest for which `inside(x, z)` holds (abilities). */
  hurtWhere(inside: (x: number, z: number) => boolean, n: number): void {
    this.all.forEach((f, i) => {
      if (f.state === 'dead' || !inside(f.x, f.z)) return;
      const killed = hurt(f, n);
      if (n >= 1 || killed) this.views[i]?.hit();
      if (killed) this.vfx.burst(f.x, f.y + 1, f.z, 30, 0.4, { life: 1.2, size: 0.12, color: SHADOW, hdr: 2, drag: 1.5, vy: 0.8 }, 1.4);
    });
  }
}
