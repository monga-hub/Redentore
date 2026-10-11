import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { World } from '../core/physics.ts';
import type { Vfx } from '../abilities/vfx.ts';
import type { PlayerStats } from '../player/stats.ts';
import type { Area } from '../level/builder.ts';
import { separate, type Target } from './brain.ts';
import { PRIEST, REVERENDISSIMO, SACERDOTE, cloisterPlan, fly, gardenPlan, hurt, killAll, spawnChurch, spawnPriests, think, wipe, type Bolt, type CasterKind, type CasterState, type Priest } from './caster.ts';
import { arm, loadModel, stand } from '../core/models.ts';
import { barMat, flash, ownMaterials } from './friars.ts';

// The casters, one body per kind, each generated, rigged and animated with Meshy AI (see
// ATTRIBUTION.md), with a Meshy-made staff in the right fist. Preti non-morti: hooded skeletons
// in black cassocks and crimson sashes, in threes in the cloisters, throwing homing shadow bolts.
// Sacerdoti (each leading two priests: two in the church, one in each lagoon garden): armoured
// battle priests in violet and gold with a winged mace. Il Reverendissimo: a giant lich
// archbishop in white, violet and gold under a rayed mitre, with a crozier. The AI lives in
// caster.ts.

const FADE = 0.2;
const BAR_W = 0.07;
const SINK = { after: 6, time: 2.5, depth: 1.4 };
const FAR = 40; // m: praying priests farther than this skip their animation (they barely move)

const SHADOW = 0x8a3cff, CORE = 0xa45cff, SMOKE = 0x1a0b26;

/**
 * How one kind of caster looks. `body`: GLB under models/ with its clips; `prop`: the staff held
 * in the right fist, `staff` m long, gripped `grip` of the way up (its crystal tip throws the
 * bolts). `clips` per AI state, `step` moving forward (1) and back (-1), `pace` the m/s those
 * clips (and the run, for evades) cover at rate 1 on a 1.8 m body (negative: played in
 * reverse), each picked for a rate near 1 at the kind's speed. `shoot`: the release played as a bolt leaves,
 * from `from` s into its clip (the thrust ~0.1 s in at `rate`); `swing`: a melee clip's `from` and
 * the s where its blow lands, timed onto the kind's windup.
 */
interface Look {
  body: string; prop: string; height: number; staff: number; grip: number;
  clips: Record<CasterState, string>; step: Record<-1 | 1, string>; pace: { 1: number; [-1]: number; run: number };
  shoot: { clip: string; from: number; rate: number }; swing: { from: number; hit: number };
}
const Y = new THREE.Vector3(0, 1, 0), Q = new THREE.Quaternion(), UP = new THREE.Quaternion();
const CAST = 'mage_soell_cast', RELEASE = { clip: 'mage_soell_cast_3', from: 0.75, rate: 1.4 };
// m/s at rate 1 on a 1.8 m body: a planted foot's speed in the Meshy biped clips. Backpedalling
// plays the walk in reverse (Meshy's own walk backward covers only 0.4 m/s).
const WALK = 1.55, RUN = 5.5;
const LOOKS = new Map<CasterKind, Look>([
  [PRIEST, {
    body: 'prete.glb', prop: 'bastone.glb', height: 1.85, staff: 1.2, grip: 0.4,
    clips: { pray: 'Pray', chase: 'Idle', cast: CAST, swing: RELEASE.clip, nova: CAST, evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Running' }, pace: { 1: RUN, [-1]: -WALK, run: RUN }, shoot: RELEASE, swing: { from: 0.6, hit: 0.9 }, // no melee: never used
  }],
  [SACERDOTE, {
    body: 'sacerdote.glb', prop: 'mazza.glb', height: 2.5, staff: 1.7, grip: 0.4,
    clips: { pray: 'Pray', chase: 'Idle', cast: CAST, swing: 'Attack', nova: CAST, evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Walking' }, pace: { 1: WALK, [-1]: -WALK, run: RUN }, shoot: RELEASE, swing: { from: 0.2, hit: 1.1 }, // never backpedals
  }],
  [REVERENDISSIMO, {
    body: 'reverendissimo.glb', prop: 'pastorale.glb', height: 4.6, staff: 4.2, grip: 0.45,
    clips: { pray: 'Pray', chase: 'Idle', cast: CAST, swing: 'Attack', nova: 'Charged_Ground_Slam', evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Walking' }, pace: { 1: WALK, [-1]: -WALK, run: RUN }, shoot: RELEASE, swing: { from: 0.2, hit: 1.1 },
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
  private held: THREE.Object3D; // the staff, gripped in the fist
  private grip: THREE.Quaternion; // its hold in the fist
  private upright = 1; // 0..1, eased: stood upright (prayer, casts, walking) or moved with the fist (melee, falling dead)

  constructor(t: Template) {
    this.look = t.look;
    const model = cloneSkinned(t.scene) as THREE.Group;
    this.mats = ownMaterials(model);
    this.tip = model.getObjectByName('staffTip')!;
    this.held = model.getObjectByName('held')!;
    this.grip = this.held.quaternion.clone();
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const c of [...Object.values(t.look.clips), ...Object.values(t.look.step), t.look.shoot.clip]) {
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
      if (from === 'cast' && f.state === 'chase' && f.cd > 1) this.play(L.shoot.clip, true, L.shoot.rate, L.shoot.from); // released, not interrupted
      else if (f.state === 'swing') this.play(L.clips.swing, true, (L.swing.hit - L.swing.from) / f.kind.melee!.windup, L.swing.from);
      else this.once = false;
    }
    if (this.once && !this.current!.isRunning()) this.once = false;
    if (!this.once) {
      const step = f.state === 'chase' && f.move ? f.move : 0;
      const k = 1.8 / L.height; // paces are for a 1.8 m body: a giant's stride covers more ground
      const rate = f.state === 'evade' ? f.kind.walk * k / L.pace.run : step ? (step === 1 ? f.kind.speed : f.kind.back) * k / L.pace[step] : 1;
      this.play(step ? L.step[step] : L.clips[f.state], false, rate);
    }

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
    flash(this.mats, this.flash);

    let sink = 0;
    if (f.state === 'dead') sink = THREE.MathUtils.clamp((f.t - SINK.after) / SINK.time, 0, 1);
    this.root.visible = sink < 1;
    this.root.position.set(f.x, f.y - sink * SINK.depth * (L.height / 1.85), f.z);
    this.root.rotation.y = f.yaw;
    this.upright += ((f.state === 'swing' || f.state === 'dead' ? 0 : 1) - this.upright) * Math.min(1, dt / 0.15);
    this.stand(f.yaw);

    const r = f.hp / f.kind.hp;
    this.bar.visible = f.state !== 'dead' && (f.state !== 'pray' || r < 1);
    this.fill.scale.x = BAR_W * Math.max(r, 1e-3);
    this.fill.center.x = 0.5 / Math.max(r, 1e-3);
  }

  /** Hold the staff upright in the fist (`upright` of the way from the fist's own grip), facing `yaw`. */
  private stand(yaw: number): void {
    const fist = this.held.parent!;
    fist.updateWorldMatrix(true, false);
    UP.setFromAxisAngle(Y, yaw).premultiply(fist.getWorldQuaternion(Q).invert()); // world upright, in the fist's frame
    this.held.quaternion.slerpQuaternions(this.grip, UP, this.upright);
  }

  private play(name: string, once = false, rate = 1, from = 0): void {
    if (name === this.clip && !once) return;
    const next = this.actions.get(name)!;
    next.reset();
    next.setLoop(once || name === this.look.clips.dead ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = true;
    next.timeScale = rate;
    next.time = name === this.look.clips.pray && !this.clip ? Math.random() * next.getClip().duration : from; // praying: not in lockstep
    next.play();
    if (this.current && this.current !== next) next.crossFadeFrom(this.current, FADE, false);
    this.current = next;
    this.clip = name;
    this.once = once;
  }
}

/** Stand one kind of caster up and arm it; every caster of that kind is a clone of this. */
function dress(scene: THREE.Group, prop: THREE.Group, look: Look): void {
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(SHADOW).multiplyScalar(2.5) });
  glow.userData.shared = true; // a hit flash leaves the crystal alone
  const tip = new THREE.Mesh(new THREE.OctahedronGeometry(look.staff * 0.03), glow); // the crystal's glow, swelling while a spell is cast
  tip.scale.y = 1.5;
  tip.name = 'staffTip';
  stand(scene, look.height);
  arm(scene, prop, look.staff, look.grip).add(tip);
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
    const looks = [...LOOKS];
    Promise.all(looks.flatMap(([, l]) => [loadModel(l.body), loadModel(l.prop)])).then((gltfs) => {
      const templates = new Map<CasterKind, Template>();
      looks.forEach(([kind, look], i) => {
        const body = gltfs[i * 2], prop = gltfs[i * 2 + 1];
        dress(body.scene, prop.scene, look);
        templates.set(kind, { scene: body.scene, clips: body.animations, look });
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
