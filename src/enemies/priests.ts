import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { World } from '../core/physics.ts';
import type { Vfx } from '../abilities/vfx.ts';
import type { PlayerStats } from '../player/stats.ts';
import type { Area } from '../level/builder.ts';
import { separate, type Target } from './brain.ts';
import { PRIEST, REVERENDISSIMO, SACERDOTE, cloisterPlan, fly, gardenPlan, hurt, killAll, spawnChurch, spawnPriests, think, wipe, type Bolt, type CasterKind, type CasterState, type Priest } from './caster.ts';
import { barMat, boneBox, ownMaterials } from './friars.ts';

// The casters, one body per kind (all CC0, see ATTRIBUTION.md). Preti non-morti: Quaternius'
// "Ghost Skull", a skull-faced wraith that floats in the cloisters in threes, a staff with a
// shadow crystal in its claw, throwing homing shadow bolts. Sacerdoti (each leading two priests:
// two in the church, one in each lagoon garden): KayKit's armoured "Skeleton Warrior", its
// helmet traded for a violet hood, cape and gold-edged stole, its reds bleached white. Il
// Reverendissimo: Quaternius' winged "Demon", a giant in cardinal red with a gold-banded mitre,
// the crystal on its own trident. The AI lives in caster.ts.

const MODELS = `${import.meta.env.BASE_URL}models/`;
const FADE = 0.2;
const BAR_W = 0.07;
const SINK = { after: 6, time: 2.5, depth: 1.4 };
const FAR = 40; // m: praying priests farther than this skip their animation (they barely move)

const TRIM = 0xb48a3c;
const SHADOW = 0x8a3cff, CORE = 0xa45cff, SMOKE = 0x1a0b26;

/** The warrior's reds (and warm bones) turn a cassock colour: `tint` times their luminance (cloth and bones share one atlas). */
const cassock = (tint: string) => `
	float redness = smoothstep(0.06, 0.2, diffuseColor.r - max(diffuseColor.g, diffuseColor.b));
	vec3 cassock = min(vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))) * ${tint}, vec3(0.92));
	diffuseColor.rgb = mix(diffuseColor.rgb, cassock, redness);`;

/**
 * How one kind of caster is dressed. `body`: GLB under models/ (with its clips); `clips`, `step`
 * (walking back/forward) and `shoot` (bolt release): its clip names. `head`: bones whose
 * vertices size the hood or mitre (the first carries them); `hand`: the bone gripping the staff,
 * `grip` the staff's tilt once gripped; `weapon`: a skinned mesh of its own whose far end holds
 * the crystal instead. `cloth`: hood, cape and stole (if any); `eyes`: materials made to glow
 * `glow`, or `sockets`: where two glowing eyes sit in the head's box (fractions of it, from its
 * centre); `dye`: GLSL recolouring its atlas; `paint`: flat colours by material name.
 */
interface Look {
  body: string; height: number;
  clips: Record<CasterState, string>; step: Record<-1 | 1, string>; shoot: string;
  head: string[]; hand: string; grip?: THREE.Euler; weapon?: string; sockets?: [number, number, number];
  cloth?: number; mitre?: boolean; eyes: string[]; glow: number; dye?: string; paint?: Record<string, number>;
}
const LOOKS = new Map<CasterKind, Look>([
  [PRIEST, {
    body: 'ghost_skull.glb', height: 1.85,
    clips: { pray: 'Flying_Idle', chase: 'Flying_Idle', cast: 'Flying_Idle', swing: 'Punch', nova: 'Punch', evade: 'Fast_Flying', dead: 'Death' },
    step: { [-1]: 'Fast_Flying', 1: 'Fast_Flying' }, shoot: 'Punch',
    head: ['Head'], hand: 'Middle1R', eyes: [], sockets: [0.2, -0.1, -0.4], glow: 0xb05cff,
  }],
  [SACERDOTE, {
    body: 'skeleton_warrior.glb', height: 2.5,
    clips: { pray: 'Idle', chase: 'Idle_Combat', cast: 'Spellcasting', swing: '2H_Melee_Attack_Chop', nova: 'Spellcasting', evade: 'Running_B', dead: 'Death_A' },
    step: { [-1]: 'Walking_Backwards', 1: 'Walking_A' }, shoot: 'Spellcast_Shoot',
    head: ['head'], hand: 'handslotr', grip: new THREE.Euler(0, 0, Math.PI / 2), // upright along the slot's -X, which points up while idle and casting
    cloth: 0x4a1f78, eyes: ['Glow'], glow: 0xd27bff, dye: cassock('vec3(1.9, 1.85, 1.8)'),
  }],
  [REVERENDISSIMO, {
    body: 'demon.glb', height: 4.6,
    clips: { pray: 'Idle', chase: 'Idle', cast: 'Wave', swing: 'Weapon', nova: 'Duck', evade: 'Run', dead: 'Death' },
    step: { [-1]: 'Walk', 1: 'Walk' }, shoot: 'Punch',
    head: ['Head'], hand: 'Middle1L', weapon: 'Trident', mitre: true, eyes: ['Eye_White'], glow: 0xff5ce1,
    paint: { Demon_Main: 0xb3142a }, // cardinal red, bright enough to read at night
  }],
]);

interface Template {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
  look: Look;
}

/** One priest's model, animation and nameplate bar. */
class View {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current?: THREE.AnimationAction;
  private clip = '';
  private state?: CasterState;
  private once = false; // a one-shot (bolt release, staff swing) is playing
  private mats: THREE.MeshStandardMaterial[];
  private flash = 0;
  private tip: THREE.Object3D;
  private bar = new THREE.Group();
  private fill: THREE.Sprite;
  private sparks = 0;
  private look: Look;

  constructor(t: Template) {
    this.look = t.look;
    const model = cloneSkinned(t.scene) as THREE.Group;
    this.mats = ownMaterials(model);
    this.tip = model.getObjectByName('staffTip')!;
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const c of [...Object.values(t.look.clips), ...Object.values(t.look.step), t.look.shoot]) {
      const clip = THREE.AnimationClip.findByName(t.clips, c);
      if (clip) this.actions.set(c, this.mixer.clipAction(clip));
    }

    const bg = new THREE.Sprite(barMat(0x140c08));
    bg.scale.set(0.075, 0.011, 1);
    this.fill = new THREE.Sprite(barMat(0xc8241c));
    this.fill.scale.set(BAR_W, 0.006, 1);
    this.fill.renderOrder = 1;
    this.bar.add(bg, this.fill);
    this.bar.position.y = t.look.height + 0.35;
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
    const from = this.state, L = this.look;
    if (f.state !== from) {
      this.state = f.state;
      if (from === 'cast' && f.state === 'chase' && f.cd > 1) this.play(L.shoot, true); // released, not interrupted
      else if (f.state === 'swing') this.play(L.clips.swing, true, this.actions.get(L.clips.swing)!.getClip().duration / f.kind.melee!.swing);
      else this.once = false;
    }
    if (this.once && !this.current!.isRunning()) this.once = false;
    if (!this.once) this.play(f.state === 'chase' && f.move ? L.step[f.move] : L.clips[f.state], false, f.state === 'chase' && f.move === 1 ? f.kind.speed / 2 : 1);

    // Casting: the crystal swells and shadow motes spiral into it (a nova draws them in too).
    const p = f.state === 'cast' ? Math.min(f.t / f.kind.cast, 1) : f.state === 'nova' ? Math.min(f.t / f.kind.nova!.cast, 1) : 0;
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
    this.root.position.set(f.x, f.y - sink * SINK.depth * (L.height / 1.85), f.z);
    this.root.rotation.y = f.yaw;

    const r = f.hp / f.kind.hp;
    this.bar.visible = f.state !== 'dead' && (f.state !== 'pray' || r < 1);
    this.fill.scale.x = BAR_W * Math.max(r, 1e-3);
    this.fill.center.x = 0.5 / Math.max(r, 1e-3);
  }

  private play(name: string, once = false, rate = 1): void {
    if (name === this.clip && !once) return;
    const next = this.actions.get(name)!;
    next.reset();
    next.setLoop(once || name === this.look.clips.dead ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = true;
    next.timeScale = once && name === this.look.shoot ? 1.4 : rate;
    if (name === this.look.clips.pray && !this.clip) next.time = Math.random() * next.getClip().duration; // not in lockstep
    next.play();
    if (this.current && this.current !== next) next.crossFadeFrom(this.current, FADE, false);
    this.current = next;
    this.clip = name;
    this.once = once;
  }
}

/** Dress one kind of caster's body; every caster of that kind is a clone of this. */
function dress(scene: THREE.Group, look: Look): void {
  scene.rotation.y = Math.PI; // the models face +Z, the game's yaw 0 faces -Z
  const head = scene.getObjectByName(look.head[0])!;
  const skull = boneBox(scene, look.head);
  const size = skull.getSize(new THREE.Vector3()), c = skull.getCenter(new THREE.Vector3());
  const gold = new THREE.MeshStandardMaterial({ color: TRIM, roughness: 0.5, metalness: 0.3 }); // no environment map: a real metal would render black
  const r = Math.max(size.x, size.z) * 0.7;
  if (look.cloth !== undefined) {
    // Hood: a deep cowl with the face cut out (the face looks along -Z here, see friars.ts)
    // drawn up into a tall point that leans back: a silhouette no friar has.
    const cloth = new THREE.MeshStandardMaterial({ color: look.cloth, roughness: 0.9, side: THREE.DoubleSide });
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
  }
  if (look.mitre) {
    // A bishop's mitre on the crown: a tall white cap, flattened front to back, gold-banded.
    const white = new THREE.MeshStandardMaterial({ color: 0xece6da, roughness: 0.7 });
    const m = r * MITRE.size, base = c.y + size.y * MITRE.at, z = c.z + size.z * MITRE.back;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(m * 0.3, m * 0.6, m * 1.5, 4, 1), white);
    cap.rotation.y = Math.PI / 4;
    cap.scale.set(1, 1, 0.6);
    cap.position.set(c.x, base + m * 0.7, z);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(m * 0.53, m * 0.57, m * 0.2, 4, 1), gold);
    band.rotation.y = Math.PI / 4;
    band.scale.set(1, 1, 0.62);
    band.position.set(c.x, base, z);
    head.attach(cap);
    head.attach(band);
  }
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(SHADOW).multiplyScalar(2.5) });
  glow.userData.shared = true; // a hit flash leaves the crystal and the eyes alone
  if (look.sockets) {
    const [x, y, z] = look.sockets, eye = new THREE.MeshBasicMaterial({ color: new THREE.Color(look.glow).multiplyScalar(2) });
    eye.userData.shared = true;
    for (const s of [-1, 1]) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(size.x * 0.07, 10, 8), eye);
      ball.position.set(c.x + s * x * size.x, c.y + y * size.y, c.z + z * size.z);
      head.attach(ball);
    }
  }
  scene.updateMatrixWorld(true);
  const top = new THREE.Box3().setFromObject(scene).max.y; // hood tip or mitre, before the staff rises above it

  // The crystal, violet, swelling while a spell is cast: on a staff in the fist (dark wood, gold
  // prongs cradling it), or on the head of the body's own weapon.
  const hand = scene.getObjectByName(look.hand)!;
  const L = (top - scene.position.y) * 0.85; // a staff a little shorter than its bearer
  const tip = new THREE.Mesh(new THREE.OctahedronGeometry(L * 0.035), glow);
  tip.scale.y = 1.5;
  tip.name = 'staffTip';
  if (look.weapon) {
    const weapon = scene.getObjectByName(look.weapon) as THREE.SkinnedMesh;
    const far = farEnd(weapon, farEnd(weapon, hand.getWorldPosition(new THREE.Vector3())).at); // the head: the end farthest from the butt, the butt being farthest from the palm
    const mount = new THREE.Object3D(); // takes the bone's scale, so the View can swell the tip freely
    mount.position.copy(far.at);
    far.bone.attach(mount);
    mount.add(tip);
  } else {
    const wood = new THREE.MeshStandardMaterial({ color: 0x2b1d17, roughness: 0.8 });
    const staff = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.016, L * 0.02, L, 6), wood);
    shaft.position.y = L * 0.2;
    const crown = new THREE.Mesh(new THREE.TorusGeometry(L * 0.045, L * 0.008, 5, 10, Math.PI * 1.4), gold);
    crown.position.y = L * 0.74;
    crown.rotation.z = -Math.PI * 0.2;
    tip.position.y = L * 0.76;
    staff.add(shaft, crown, tip);
    staff.position.copy(hand.getWorldPosition(new THREE.Vector3()));
    hand.attach(staff);
    if (look.grip) staff.rotation.copy(look.grip);
  }

  const own = new Map<THREE.Material, THREE.MeshStandardMaterial>(); // the bodies come from the loader: recolour copies
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = !(o.material as THREE.Material).userData.shared;
    o.frustumCulled = false; // skinned: bind-pose bounds don't follow the animation
    const m = o.material as THREE.MeshStandardMaterial;
    if (!(o instanceof THREE.SkinnedMesh)) return; // our own cloth, gold and wood
    if (!own.has(m)) {
      const c = m.clone();
      c.metalness = 0; // no environment map to reflect
      if (look.eyes.includes(m.name)) { c.color.setHex(look.glow); c.emissive.setHex(look.glow); c.userData.shared = true; } // never flashed: keeps its glow
      else if (look.dye && m.map) dye(c, look.dye);
      else if (look.paint?.[m.name] !== undefined) c.color.setHex(look.paint[m.name]);
      own.set(m, c);
    }
    o.material = own.get(m)!;
  });

  scene.scale.setScalar(look.height / top);
}

/** The boss's mitre: its size against the head's, where its band sits up the head's box and how far back (fractions of the box). */
const MITRE = { size: 0.85, at: 0.3, back: 0.12 };

/** The vertex of skinned `mesh` farthest from `from` (world, as posed), and the bone it rides on. */
function farEnd(mesh: THREE.SkinnedMesh, from: THREE.Vector3): { at: THREE.Vector3; bone: THREE.Bone } {
  const idx = mesh.geometry.attributes.skinIndex, w = mesh.geometry.attributes.skinWeight, v = new THREE.Vector3();
  const at = new THREE.Vector3();
  let best = -1, bone = mesh.skeleton.bones[0];
  for (let i = 0; i < idx.count; i++) {
    mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld); // skinned: posed
    const d = v.distanceToSquared(from);
    if (d <= best) continue;
    best = d;
    at.copy(v);
    let k = 0;
    for (let j = 1; j < 4; j++) if (w.getComponent(i, j) > w.getComponent(i, k)) k = j;
    bone = mesh.skeleton.bones[idx.getComponent(i, k)];
  }
  return { at, bone };
}

/** Recolour a body's atlas in the shader (`glsl` from a Look). */
function dye(m: THREE.MeshStandardMaterial, glsl: string): void {
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>${glsl}`);
  };
  m.customProgramCacheKey = () => `cassock-${glsl}`;
}

/** Every priest in the cloisters, the gardens and the church, the sacerdoti and the boss: brains, models, shadow bolts, combat glue. */
export class Priests {
  readonly root = new THREE.Group();
  readonly all: Priest[];
  readonly boss: Priest; // il Reverendissimo
  private ring: THREE.Mesh; // the boss's nova telegraph on the floor
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
    const gardens = gardenPlan(world, areas);
    const church = spawnChurch(world);
    this.boss = church.boss;
    this.all = [
      ...spawnPriests(world, plan.flatMap((c) => c.groups), plan.flatMap((c) => c.groups.map(() => c.court))).flat(),
      ...spawnPriests(world, gardens.map((g) => g.group), gardens.map((g) => g.area), gardens.map(() => [SACERDOTE])).flat(),
      ...church.all,
    ];
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(SHADOW).multiplyScalar(2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    );
    this.ring.visible = false;
    const loader = new GLTFLoader(), looks = [...LOOKS];
    Promise.all(looks.map(([, l]) => loader.loadAsync(MODELS + l.body))).then((gltfs) => {
      const templates = new Map<CasterKind, Template>();
      looks.forEach(([kind, look], i) => {
        dress(gltfs[i].scene, look);
        templates.set(kind, { scene: gltfs[i].scene, clips: gltfs[i].animations, look });
      });
      this.views = this.all.map((f) => new View(templates.get(f.kind)!));
      for (const v of this.views) this.root.add(v.root);
      this.root.add(this.ring); // after the models: main.ts reads an empty root as "not loaded yet"
    }, (e) => console.error('priest model failed to load', e));
  }

  /** The boss has fallen: every caster drops dead for good. */
  killAll(): void {
    killAll(this.all);
  }

  /** The player died: whoever was fighting, the boss too, evades home at full health; bolts in flight fizzle. */
  wipe(): void {
    wipe(this.all);
    this.bolts.length = 0;
  }

  /** AI, spells and animation. `player`: feet position. Bolts that land hit the player's stats. */
  update(dt: number, player: Target): void {
    if (!this.views.length) return;
    let dmg = 0;
    this.all.forEach((f, i) => {
      const n = this.bolts.length, was = f.state;
      const hit = think(f, player, this.world, dt, this.bolts);
      dmg += hit;
      if (was === 'nova' && f.state !== 'nova') this.nova(f, hit > 0);
      if (this.bolts.length === n) return;
      // A new bolt leaves from the caster's crystal, with a flare.
      const b = this.bolts[n];
      this.views[i].tipAt(this.v);
      b.x = this.v.x; b.y = this.v.y; b.z = this.v.z;
      this.vfx.burst(b.x, b.y, b.z, 14, 0.15, { life: 0.4, size: 0.1, color: SHADOW, hdr: 3, drag: 4 }, 2);
    });
    separate(this.all, this.world);
    dmg += fly(this.bolts, player, dt, this.spent);
    for (const b of this.spent) {
      if (!b.hit) { this.vfx.burst(b.x, b.y, b.z, 10, 0.2, { life: 0.5, size: 0.1, color: SHADOW, hdr: 2, drag: 3 }, 0.8); continue; }
      this.vfx.burst(b.x, b.y, b.z, 26, 0.3, { life: 0.6, size: 0.12, color: SHADOW, hdr: 3, drag: 3 }, 2.4);
      this.vfx.burst(b.x, b.y, b.z, 10, 0.3, { life: 0.9, size: 0.3, color: SMOKE, alpha: 0.7, normal: true, grow: 2, drag: 2, vy: 0.4 }, 0.6);
      this.vfx.pulse(b.x, b.y, b.z, SHADOW, 25);
    }
    this.drawBolts(dt);
    this.drawRing();
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
      o.scale.setScalar((1 + Math.sin(b.t * 30) * 0.15) * Math.sqrt(b.dmg / PRIEST.damage)); // the boss's are fat
      // Trail: bright motes and a wisp of dark smoke streaming behind.
      for (let n = 0; n < 2; n++) this.vfx.puff({ x: b.x + (Math.random() - 0.5) * 0.15, y: b.y + (Math.random() - 0.5) * 0.15, z: b.z + (Math.random() - 0.5) * 0.15, life: 0.35, size: 0.14, color: SHADOW, hdr: 2.6, grow: 0.3 });
      if (Math.random() < dt * 30) this.vfx.puff({ x: b.x, y: b.y, z: b.z, vy: 0.3, life: 0.6, size: 0.18, color: SMOKE, alpha: 0.6, normal: true, grow: 2 });
    });
  }

  /** The nova's floor ring grows in while the boss channels it. */
  private drawRing(): void {
    const f = this.boss;
    this.ring.visible = f.state === 'nova';
    if (!this.ring.visible) return;
    const p = Math.min(f.t / f.kind.nova!.cast, 1), r = f.kind.nova!.radius;
    this.ring.position.set(f.x, f.y + 0.05, f.z);
    this.ring.scale.setScalar(r * (0.25 + 0.75 * p));
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.65 * p;
  }

  /** The nova goes off: a ring of shadow rushing out to its radius. */
  private nova(f: Priest, hit: boolean): void {
    const r = f.kind.nova!.radius;
    for (let k = 0; k < 90; k++) {
      const a = (k / 90) * Math.PI * 2, s = r * 2.4;
      this.vfx.puff({ x: f.x + Math.cos(a) * 0.8, y: f.y + 0.4, z: f.z + Math.sin(a) * 0.8, vx: Math.cos(a) * s, vy: 0.6, vz: Math.sin(a) * s, life: 0.45, size: 0.35, color: SHADOW, hdr: 3, drag: 1.2 });
    }
    this.vfx.burst(f.x, f.y + 1.5, f.z, 30, 1.5, { life: 1.1, size: 0.6, color: SMOKE, alpha: 0.7, normal: true, grow: 2, drag: 2, vy: 0.8 }, 2);
    this.vfx.pulse(f.x, f.y + 2, f.z, SHADOW, hit ? 60 : 40);
  }

  /** Damage every priest for which `inside(x, z)` holds (abilities). */
  hurtWhere(inside: (x: number, z: number, f: Priest) => boolean, n: number): void {
    this.all.forEach((f, i) => {
      if (f.state === 'dead' || !inside(f.x, f.z, f)) return;
      const killed = hurt(f, n);
      if (n >= 1 || killed) this.views[i]?.hit();
      if (killed) this.vfx.burst(f.x, f.y + 1, f.z, 30, 0.4, { life: 1.2, size: 0.12, color: SHADOW, hdr: 2, drag: 1.5, vy: 0.8 }, 1.4);
    });
  }
}
