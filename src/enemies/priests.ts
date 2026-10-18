import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { World } from '../core/physics.ts';
import { D, T, type Decal, type DecalStyle, type RibbonStyle, type Style, type Vfx } from '../abilities/vfx.ts';
import type { PlayerStats } from '../player/stats.ts';
import type { Area } from '../level/builder.ts';
import { separate, type Target } from './brain.ts';
import { PRIEST, REVERENDISSIMO, SACERDOTE, SPIN_DRAW, fly, hurt, killAll, spawnCasters, think, wipe, type Bolt, type CasterKind, type CasterState, type Line, type Mark, type Priest } from './caster.ts';
import { CODEGA, GASTALDO, GONDOLIERE, GOVERNATRICE, MAESTRA, VELO, ZITELLA } from './zitelle.ts';
import { Overlay, Shadows, arm, loadModel, stand } from '../core/models.ts';
import { barMat, flash, ownMaterials } from './friars.ts';
import { still } from './control.ts';

// The casters, one body per kind, each generated, rigged and animated with Meshy AI (see
// ATTRIBUTION.md), with a Meshy-made staff in the right fist. Preti non-morti: hooded skeletons
// in black cassocks and crimson sashes, in threes in the cloisters, throwing homing shadow bolts.
// Sacerdoti (each leading two priests: two in the church, one in each lagoon garden, the cappella and the frantoio): armoured
// battle priests in violet and gold with a winged mace. Il Reverendissimo: a giant lich
// archbishop in white, violet and gold under a rayed mitre, with a crozier. The AI lives in
// caster.ts. Spells are drawn with the shared effects (abilities/vfx.ts): bolts with a hot core,
// a halo, a trail and a spiral of motes; the crystal charging; the boss's and the sacerdoti's
// novas telegraphed on the floor as a sigil filling up to its edge, then going off in a ring of
// shadow flame; the boss's marks as crimson brands that fill the same way and erupt.

const FADE = 0.2;
const BAR_W = 0.07;
const SINK = { after: 6, time: 2.5, depth: 1.4 };
const FAR = 40; // m: praying priests farther than this skip their animation (they barely move)
const BIG = 25; // damage that makes a heavy flinch

const SHADOW = 0x8a3cff, SMOKE = 0x1a0b26;

/**
 * How one kind of caster looks. `body`: GLB under models/ with its clips; `prop`: the staff held
 * in the right fist, `staff` m long, gripped `grip` of the way up (its crystal tip throws the
 * bolts). `clips` per AI state, `step` moving forward (1) and back (-1), `pace` the m/s those
 * clips (and the run, for evades) cover at rate 1 on a 1.8 m body (negative: played in
 * reverse), each picked for a rate near 1 at the kind's speed. `shoots`: releases played in
 * turn as a bolt leaves, from `from` s into the clip (the thrust ~0.1 s in at `rate`); `swings`:
 * melee clips in turn, their `from` and the s where the blow lands, timed onto the kind's windup;
 * `deaths`: one picked at random. `bolt`: its core and glow colours and size.
 */
interface Look {
  body: string; prop: string; height: number; staff: number; grip: number;
  clips: Record<CasterState, string>; step: Record<-1 | 1, string>; pace: { 1: number; [-1]: number; run: number };
  shoots: { clip: string; from: number; rate: number }[]; swings: { clip: string; from: number; hit: number }[]; deaths: string[];
  bolt: { core: number; glow: number; size: number };
  /** A ghost's cold self-glow (rgb 0..1) over its own colours, which it tints: the zitelle. */
  ghost?: [number, number, number];
}
const Y = new THREE.Vector3(0, 1, 0), Q = new THREE.Quaternion(), UP = new THREE.Quaternion();
const CAST = 'mage_soell_cast', RELEASE = { clip: 'mage_soell_cast_3', from: 0.75, rate: 1.4 }, THROW = { clip: 'Cast_Throw', from: 0.66, rate: 1.2 };
const SWINGS = [{ clip: 'Attack', from: 0.2, hit: 1.1 }, { clip: 'Attack_Hammer', from: 0.6, hit: 1.5 }, { clip: 'Attack_Back', from: 0.35, hit: 0.8 }];
const DEATHS = ['dying_backwards', 'Dead_Knock', 'Dead_Shot'];
// Layered on the upper body (s into the clip): a flinch per hit, heavier for big blows; a war cry when pulled.
const FLINCH = { light: { clip: 'Hit_Light', from: 0.1, stop: 0.75 }, heavy: { clip: 'Hit_Heavy', from: 0.4, stop: 1.3 }, cry: { clip: 'Scream', from: 0.55, stop: 1.8 } };
// m/s at rate 1 on a 1.8 m body: a planted foot's speed in the Meshy biped clips. Backpedalling
// plays the walk in reverse (Meshy's own walk backward covers only 0.4 m/s).
const WALK = 1.55, RUN = 5.5;
const LOOKS = new Map<CasterKind, Look>([
  [PRIEST, {
    body: 'prete.glb', prop: 'bastone.glb', height: 1.85, staff: 1.2, grip: 0.4,
    clips: { pray: 'Pray', chase: 'Idle', cast: CAST, swing: RELEASE.clip, nova: CAST, spin: CAST, evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Running' }, pace: { 1: RUN, [-1]: -WALK, run: RUN }, shoots: [RELEASE, THROW], swings: [{ clip: RELEASE.clip, from: 0.6, hit: 0.9 }], deaths: DEATHS, // no melee: never used
    bolt: { core: 0xf0dcff, glow: SHADOW, size: 1 },
  }],
  [SACERDOTE, {
    body: 'sacerdote.glb', prop: 'mazza.glb', height: 2.5, staff: 1.7, grip: 0.4,
    clips: { pray: 'Pray', chase: 'Idle', cast: CAST, swing: 'Attack', nova: CAST, spin: CAST, evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Walking' }, pace: { 1: WALK, [-1]: -WALK, run: RUN }, shoots: [RELEASE, THROW], swings: SWINGS, deaths: DEATHS, // never backpedals
    bolt: { core: 0xfff0c8, glow: 0xb050ff, size: 1.2 },
  }],
  [REVERENDISSIMO, {
    body: 'reverendissimo.glb', prop: 'pastorale.glb', height: 4.6, staff: 4.2, grip: 0.45,
    clips: { pray: 'Pray', chase: 'Idle', cast: CAST, swing: 'Attack', nova: 'Charged_Ground_Slam', spin: CAST, evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Walking' }, pace: { 1: WALK, [-1]: -WALK, run: RUN }, shoots: [RELEASE, THROW], swings: SWINGS, deaths: ['dying_backwards'],
    bolt: { core: 0xffd8ff, glow: 0x9a20ff, size: 1.7 },
  }],
  // Level 2 (enemies/zitelle.ts): the same clip names, packed from each body's Meshy animations.
  ...([[GONDOLIERE, 1.85], [GASTALDO, 2.5]] as const).map(([kind, height]): [CasterKind, Look] => [kind, {
    body: 'gondoliere.glb', prop: 'remo.glb', height, staff: height * 1.35, grip: 0.55,
    clips: { pray: 'Pray', chase: 'Idle', cast: 'Idle', swing: 'Attack', nova: 'Attack_Hammer', spin: 'Idle', evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Running' }, pace: { 1: RUN, [-1]: -WALK, run: RUN }, shoots: [], swings: [SWINGS[0], SWINGS[1], { clip: 'Attack_Back', from: 0.3, hit: 0.75 }], deaths: ['dying_backwards', 'Dead_Knock'],
    bolt: { core: 0xffffff, glow: 0x60d0c0, size: 1 }, // never casts
  }]),
  [CODEGA, {
    body: 'codega.glb', prop: 'lanterna.glb', height: 1.8, staff: 2, grip: 0.4,
    clips: { pray: 'Pray', chase: 'Idle', cast: CAST, swing: RELEASE.clip, nova: CAST, spin: CAST, evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Running' }, pace: { 1: RUN, [-1]: -WALK, run: RUN }, shoots: [RELEASE, { clip: 'Cast_Throw', from: 0.5, rate: 1.2 }], swings: [{ clip: RELEASE.clip, from: 0.6, hit: 0.9 }], deaths: ['dying_backwards', 'Dead_Knock'],
    bolt: { core: 0xf4ffc8, glow: 0x8aff3a, size: 1 }, // a will-o'-wisp out of the lantern
  }],
  ...([ZITELLA, VELO] as const).map((kind): [CasterKind, Look] => [kind, {
    body: 'zitella.glb', prop: 'rocca.glb', height: 1.65, staff: 1.25, grip: 0.35,
    clips: { pray: 'Pray', chase: 'Idle', cast: CAST, swing: RELEASE.clip, nova: CAST, spin: CAST, evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Running' }, pace: { 1: RUN, [-1]: -WALK, run: RUN }, shoots: [RELEASE, { clip: 'Cast_Throw', from: 0.5, rate: 1.2 }], swings: [{ clip: RELEASE.clip, from: 0.6, hit: 0.9 }], deaths: ['dying_backwards', 'Dead_Knock'],
    bolt: { core: 0xffffff, glow: 0x9fd8ff, size: 0.9 }, // a skein of thread
    ghost: [0.32, 0.55, 0.75],
  }]),
  [MAESTRA, {
    body: 'maestra.glb', prop: 'forbici.glb', height: 2.3, staff: 1.4, grip: 0.82,
    clips: { pray: 'Pray', chase: 'Idle', cast: CAST, swing: 'Attack', nova: 'Charged_Ground_Slam', spin: CAST, evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Walking' }, pace: { 1: WALK, [-1]: -WALK, run: RUN }, shoots: [RELEASE, { clip: 'Cast_Throw', from: 0.5, rate: 1.2 }], swings: [SWINGS[0], SWINGS[1], { clip: 'Attack_Back', from: 0.3, hit: 0.75 }], deaths: ['dying_backwards', 'Dead_Knock'],
    bolt: { core: 0xfff0fa, glow: 0xd890ff, size: 1.2 },
    ghost: [0.22, 0.16, 0.3],
  }],
  [GOVERNATRICE, {
    body: 'governatrice.glb', prop: 'scettro.glb', height: 4.3, staff: 3.4, grip: 0.42,
    clips: { pray: 'Pray', chase: 'Idle', cast: CAST, swing: 'Attack', nova: 'Charged_Ground_Slam', spin: 'Spin', evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Walking' }, pace: { 1: WALK, [-1]: -WALK, run: RUN }, shoots: [RELEASE, { clip: 'Cast_Throw', from: 0.5, rate: 1.2 }], swings: [SWINGS[0], SWINGS[1], { clip: 'Attack_Back', from: 0.3, hit: 0.75 }], deaths: ['dying_backwards'],
    bolt: { core: 0xfff4d0, glow: 0xffb030, size: 1.6 },
  }],
]);
/** The lace: lines and the fuso's threads on the floor, white-gold, a square decal per width along each. */
const LACE = 0xfff0d0, LACE_DECALS = 48;
const laceTele: DecalStyle = { life: 0, size: 2, tile: D.disc, color: LACE, hdr: 1.2 };
const laceSpark: Style = { life: [0.4, 0.7], size: [0.05, 0.09], color: 0xffffff, color2: LACE, hdr: 4, tex: T.spark, stretch: 0.04, drag: 2, grav: 3 };
const laceCut: DecalStyle = { life: 0.6, size: 2, grow: 0.3, tile: D.shock, color: LACE, hdr: 2.2, fadeOut: 0.5 };

// effects
const charge: Style = { life: 0.4, size: [0.05, 0.08], color: 0xd8b8ff, color2: SHADOW, hdr: 3, tex: T.spark, stretch: 0.03, drag: 1 };
const flareBolt: Style = { life: 0.18, size: 1.1, grow: 0.5, color: 0xf0dcff, color2: SHADOW, hdr: 3, tex: T.star, fadeIn: 0.05 };
const boltMote: Style = { life: [0.3, 0.45], size: [0.05, 0.09], color: 0xe0c8ff, color2: SHADOW, hdr: 3, tex: T.spark, drag: 2 };
const boltSmoke: Style = { life: [0.5, 0.8], size: [0.25, 0.4], grow: 2, color: SMOKE, alpha: 0.65, tex: T.smoke2, erode: true, dark: true, drag: 2 };
const boltSpark: Style = { life: [0.25, 0.45], size: 0.06, color: 0xe8d0ff, color2: SHADOW, hdr: 4, tex: T.spark, stretch: 0.05, drag: 3 };
const boltPuff: Style = { life: [0.7, 1], size: [0.4, 0.7], grow: 2, color: SMOKE, alpha: 0.8, tex: T.smoke, erode: true, dark: true, drag: 2.5, grav: -0.3 };
const boltShock: DecalStyle = { life: 0.4, size: 0.6, grow: 3.5, tile: D.shock, color: SHADOW, hdr: 1.8, fadeOut: 0.6 };
const novaFlame: Style = { life: [0.5, 0.8], size: [0.35, 0.6], grow: 0.6, color: 0xa868ff, color2: 0x2a0650, hdr: 1.5, tex: T.flame, upright: true, grav: -2.5, fadeIn: 0.2 };
const novaBlast: Style = { life: [0.45, 0.7], size: [0.6, 0.9], grow: 0.5, color: 0xd8b0ff, color2: SHADOW, hdr: 2.6, tex: T.flame, upright: true, grav: -4, fadeIn: 0.1 };
const novaSmoke: Style = { life: [1, 1.5], size: [1, 1.6], grow: 2, color: SMOKE, alpha: 0.7, tex: T.smoke, erode: true, dark: true, drag: 2.5, grav: -0.5 };
const novaWave: DecalStyle = { life: 0.5, size: 2, grow: REVERENDISSIMO.nova!.radius, tile: D.shock, color: 0xe0c8ff, color2: SHADOW, hdr: 2.4, fadeOut: 0.5 };
const novaCracks: DecalStyle = { life: 4, size: 8, tile: D.cracks, color: 0x07040a, alpha: 0.9, fadeOut: 0.4, dark: true };
const novaScar: DecalStyle = { life: 1.4, size: 8, tile: D.cracks, color: SHADOW, hdr: 2.2, fadeOut: 0.8 };
const tele: DecalStyle = { life: 0, size: REVERENDISSIMO.nova!.radius * 2, tile: D.ring, color: SHADOW, hdr: 1.8 };
const teleSigil: DecalStyle = { life: 0, size: 4.5, tile: D.sigil, color: SHADOW, hdr: 1.6 };
/** The shock wave, cracks and scorch of a nova of radius `r` (the boss's 6 m, a sacerdote's smaller ring, a mark). */
const sized = new Map<number, [DecalStyle, DecalStyle, DecalStyle]>();
const blastOf = (r: number) => {
  let b = sized.get(r);
  if (!b) sized.set(r, (b = [{ ...novaWave, grow: r }, { ...novaCracks, size: r * 1.35 }, { ...novaScar, size: r * 1.35 }]));
  return b;
};
// The boss's marks (caster.ts Phases): a crimson brand that fills to its edge, then erupts in a column of flame.
const BRAND = 0xff2f6e, MARK = REVERENDISSIMO.phases!.marks!;
const brandRing: DecalStyle = { life: 0, size: MARK.radius * 2, tile: D.ring, color: BRAND, hdr: 2.2 };
const brandRunes: DecalStyle = { life: 0, size: MARK.radius * 1.7, tile: D.runes, color: BRAND, hdr: 1.3 };
const brandFlame: Style = { ...novaFlame, color: 0xff8ab4, color2: 0x4a0618 };
const brandBlast: Style = { ...novaBlast, color: 0xffd0e0, color2: BRAND };
const darkSoul: Style = { life: [1.6, 2], size: 0.55, grow: 1.5, color: 0xd0a0ff, hdr: 1.2, alpha: 0.6, tex: T.skull, grav: -1.1, fadeIn: 0.25 };
const deathSmoke: Style = { life: [1, 1.5], size: [0.6, 1], grow: 2, color: SMOKE, alpha: 0.75, tex: T.smoke2, erode: true, dark: true, drag: 2, grav: -0.6 };
const swingTrail: RibbonStyle = { color: 0xf0e0ff, color2: SHADOW, hdr: 1.8, alpha: 0.7, width: 0, life: 0.14 };
const boltTrail = (glow: number, size: number): RibbonStyle => ({ color: 0xffffff, color2: glow, hdr: 2.2, alpha: 0.9, width: 0.22 * size, life: 0.32 });

interface Template {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
  look: Look;
  glow: THREE.SpriteMaterial; // the crystal's charging glow, shared by the kind
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
  private overlay: Overlay;
  private shadows: Shadows;
  private glow: THREE.Sprite;
  private shots = Math.floor(Math.random() * 2);
  private swings = Math.floor(Math.random() * 3);
  private deadClip: string;
  private trail = -1;
  private flinched = 9;
  private v = new THREE.Vector3();
  private w = new THREE.Vector3();

  constructor(t: Template) {
    this.look = t.look;
    const model = cloneSkinned(t.scene) as THREE.Group;
    this.mats = ownMaterials(model);
    this.tip = model.getObjectByName('staffTip')!;
    this.held = model.getObjectByName('held')!;
    this.grip = this.held.quaternion.clone();
    this.root.add(model);
    this.shadows = new Shadows(model);
    this.mixer = new THREE.AnimationMixer(model);
    const L = t.look;
    for (const c of new Set([...Object.values(L.clips), ...Object.values(L.step), ...L.shoots.map((s) => s.clip), ...L.swings.map((s) => s.clip), ...L.deaths])) {
      const clip = THREE.AnimationClip.findByName(t.clips, c);
      if (clip) this.actions.set(c, this.mixer.clipAction(clip));
    }
    this.deadClip = L.deaths[Math.floor(Math.random() * L.deaths.length)];
    if (!this.actions.has(this.deadClip)) this.deadClip = L.clips.dead;
    this.overlay = new Overlay(this.mixer, t.clips, Object.values(FLINCH).map((f) => f.clip));
    this.glow = new THREE.Sprite(t.glow);
    this.glow.visible = false;
    this.glow.renderOrder = 3;
    this.tip.add(this.glow);

    const bg = new THREE.Sprite(barMat(0x140c08));
    bg.scale.set(0.075, 0.011, 1);
    this.fill = new THREE.Sprite(barMat(0xc8241c));
    this.fill.scale.set(BAR_W, 0.006, 1);
    this.fill.renderOrder = 1;
    this.bar.add(bg, this.fill);
    this.bar.position.y = t.look.height + 0.35;
    this.root.add(this.bar);
  }

  /** Struck for `n`: the red flash, and a flinch while it is only closing in or standing. */
  hit(n: number, f: Priest): void {
    this.flash = 1;
    if ((f.state === 'chase' || f.state === 'pray') && this.flinched > 0.35) {
      const k = n >= BIG ? FLINCH.heavy : FLINCH.light;
      this.overlay.play(k.clip, k.from, k.stop, f.kind === REVERENDISSIMO ? 1.1 : 1.4);
      this.flinched = 0;
    }
  }

  /** World position of the staff's crystal (bolts leave from here). */
  tipAt(v = new THREE.Vector3()): THREE.Vector3 {
    return this.tip.getWorldPosition(v);
  }

  /** Sync with the brain; `d`: m from the hero (far off, a praying priest skips its animation). */
  update(f: Priest, dt: number, vfx: Vfx, d: number): void {
    const from = this.state, L = this.look;
    this.flinched += dt;
    if (f.state !== from) {
      this.state = f.state;
      if (from === 'cast' && f.state === 'chase' && f.cd > 1) { // released, not interrupted
        const s = L.shoots[this.shots++ % L.shoots.length];
        this.play(s.clip, true, s.rate, s.from);
      } else if (f.state === 'swing') {
        const s = L.swings[this.swings++ % L.swings.length];
        this.play(s.clip, true, (s.hit - s.from) / f.kind.melee!.windup, s.from);
      } else this.once = false;
      if (from === 'pray' && f.state === 'chase') this.overlay.play(FLINCH.cry.clip, FLINCH.cry.from, FLINCH.cry.stop, f.kind === REVERENDISSIMO ? 1 : 1.4); // pulled: a war cry
    }
    if (this.once && !this.current!.isRunning()) this.once = false;
    if (!this.once) {
      const step = f.state === 'chase' && f.move ? f.move : 0;
      const k = 1.8 / L.height; // paces are for a 1.8 m body: a giant's stride covers more ground
      const rate = f.state === 'evade' ? f.kind.walk * k / L.pace.run : step ? (step === 1 ? f.kind.speed : f.kind.back) * k / L.pace[step] : 1;
      this.play(step ? L.step[step] : f.state === 'dead' ? this.deadClip : L.clips[f.state], false, rate);
    }

    // Casting: the crystal swells and glows, shadow motes spiral into it (a nova draws them in too).
    const p = f.state === 'cast' ? Math.min(f.t / f.kind.cast, 1) : f.state === 'nova' ? Math.min(f.t / f.kind.nova!.cast, 1) : 0;
    this.tip.scale.setScalar(1 + p * 1.2);
    this.glow.visible = p > 0;
    if (p > 0) {
      this.glow.scale.setScalar((0.35 + p * 0.6 + Math.sin(f.t * 30) * 0.05) * L.bolt.size);
      this.sparks += dt * (25 + p * 60);
      const c = this.tipAt(this.v);
      for (; this.sparks >= 1; this.sparks--) {
        const a = Math.random() * Math.PI * 2, r = 0.35 + Math.random() * 0.3, y = (Math.random() - 0.3) * 0.5;
        vfx.spawn(charge, c.x + Math.cos(a) * r, c.y + y, c.z + Math.sin(a) * r, -Math.cos(a) * r * 2 - Math.sin(a), -y * 2, -Math.sin(a) * r * 2 + Math.cos(a));
      }
    }

    // The staff's arc in melee, from just before the blow to just after.
    const m = f.kind.melee, live = !!m && f.state === 'swing' && f.t > m.windup - 0.3 && f.t < m.windup + 0.12;
    if (live && this.trail < 0) this.trail = vfx.ribbons.begin(swingTrail, true);
    if (this.trail >= 0) {
      this.tipAt(this.w);
      this.held.getWorldPosition(this.v).lerp(this.w, 0.45);
      vfx.ribbons.push(this.trail, this.v.x, this.v.y, this.v.z, this.w.x, this.w.y, this.w.z);
      if (!live) { vfx.ribbons.end(this.trail); this.trail = -1; }
    }

    this.overlay.update(dt, f.state === 'swing' || f.state === 'cast' || f.state === 'nova' || f.state === 'dead');
    if (d < FAR || f.state !== 'pray') this.mixer.update(dt * still(f.cc));
    this.shadows.update(d);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4);
    flash(this.mats, this.flash, f.cc);

    let sink = 0;
    if (f.state === 'dead') sink = THREE.MathUtils.clamp((f.t - SINK.after) / SINK.time, 0, 1);
    this.root.visible = sink < 1;
    this.root.position.set(f.x, f.y - sink * SINK.depth * (L.height / 1.85), f.z);
    this.root.rotation.y = f.yaw;
    this.upright += ((f.state === 'swing' || f.state === 'dead' ? 0 : 1) - this.upright) * Math.min(1, dt / 0.15);
    this.stand(f.yaw);

    const r = f.hp / f.kind.hp;
    this.bar.visible = f.kind !== REVERENDISSIMO && f.kind !== GOVERNATRICE && f.state !== 'dead' && (f.state !== 'pray' || r < 1); // a boss's bar is the big one up top (quest/view.ts)
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
    const next = this.actions.get(name) ?? this.actions.get(this.look.clips.chase)!;
    next.reset();
    next.setLoop(once || name === this.deadClip ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
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
  const g = look.ghost;
  if (g) scene.traverse((o) => { // a ghost: its colours cooled and dimmed, a cold glow from within (friars.ts flash keeps it)
    if (!(o instanceof THREE.Mesh) || o.material === glow || o.parent?.name === 'held') return;
    const m = o.material as THREE.MeshStandardMaterial;
    m.color.setRGB(0.55, 0.68, 0.85);
    m.emissive.setRGB(...g);
    m.userData.ghost = g;
    m.transparent = true;
    m.opacity = 0.88;
  });
}

/** A bolt in flight: its trail and two pooled sprites. */
interface Flight { trail: number; look: Look; core: THREE.Sprite; halo: THREE.Sprite; spin: number }

/** Every priest in the cloisters, the gardens, the lagoon buildings and the church, the sacerdoti and the boss: brains, models, shadow bolts, combat glue. */
export class Priests {
  readonly root = new THREE.Group();
  readonly all: Priest[];
  readonly boss: Priest; // il Reverendissimo
  private views: View[] = [];
  private bolts: Bolt[] = [];
  readonly spent: Bolt[] = []; // bolts that landed or fizzled this frame (the director's impact sounds)
  private flights = new Map<Bolt, Flight>();
  private sprites: THREE.Sprite[] = []; // free core/halo sprites, pooled
  private teles: [Decal, Decal][] = []; // nova telegraphs (ring, sigil) on the floor, lent to whoever channels one
  private laces: Decal[] = []; // lace lines and the fuso's threads
  private laid = new Set<Line>(); // lines seen last frame: the ones gone with their time run out cut
  private brands: [Decal, Decal][] = []; // the boss's marks (ring, runes)
  private branded = new Set<Mark>(); // marks seen last frame: the ones gone with their time run out erupted
  private world: World;
  private vfx: Vfx;
  private stats: PlayerStats;
  private v = new THREE.Vector3();

  /** `cast`: who this set is (level 2's, enemies/zitelle.ts); level 1's by default. */
  constructor(world: World, vfx: Vfx, stats: PlayerStats, areas: Area[], cast?: { all: Priest[]; boss: Priest }) {
    this.world = world;
    this.vfx = vfx;
    this.stats = stats;
    const casters = cast ?? spawnCasters(world, areas);
    this.boss = casters.boss;
    this.all = casters.all;
    if (this.all.some((f) => f.kind.lines)) for (let i = 0; i < LACE_DECALS; i++) this.laces.push(vfx.hold(laceTele));
    for (let i = 0; i < 3; i++) this.teles.push([vfx.hold(tele), vfx.hold(teleSigil)]); // ponytail: three rings at once, a fourth nova goes unmarked
    if (this.boss.kind.phases?.marks) for (let i = 0; i < MARK.n * 2; i++) this.brands.push([vfx.hold(brandRing), vfx.hold(brandRunes)]);
    const looks = [...LOOKS].filter(([k]) => this.all.some((f) => f.kind === k)); // only the bodies this set needs
    Promise.all(looks.flatMap(([, l]) => [loadModel(l.body), loadModel(l.prop)])).then((gltfs) => { // two kinds on one body each get their own copy
      const templates = new Map<CasterKind, Template>();
      looks.forEach(([kind, look], i) => {
        const body = gltfs[i * 2], prop = gltfs[i * 2 + 1];
        dress(body.scene, prop.scene, look);
        templates.set(kind, { scene: body.scene, clips: body.animations, look, glow: vfx.sprite(T.glow, look.bolt.glow, 2.4, 1).material });
      });
      this.views = this.all.map((f) => new View(templates.get(f.kind)!));
      for (const v of this.views) this.root.add(v.root);
    }, (e) => console.error('priest model failed to load', e));
  }

  /** The boss has fallen: every caster drops dead for good. */
  killAll(): void {
    killAll(this.all);
  }

  /** The player died: whoever was fighting, the boss too, evades home at full health; bolts in flight fizzle. */
  wipe(): void {
    wipe(this.all);
    this.spent.length = 0;
    for (const b of this.bolts) this.land(b, false);
    this.bolts.length = 0;
  }

  /** AI, spells and animation. `player`: feet position. Bolts that land hit the player's stats. */
  update(dt: number, player: Target): void {
    if (!this.views.length) return;
    let dmg = 0;
    const v = this.vfx;
    this.all.forEach((f, i) => {
      const n = this.bolts.length, was = f.state;
      const hit = think(f, player, this.world, dt, this.bolts);
      dmg += hit;
      if (was === 'nova' && f.state !== 'nova') this.nova(f, hit > 0);
      if (this.bolts.length === n) return;
      // A new bolt leaves from the caster's crystal, with a flare.
      const b = this.bolts[n], look = LOOKS.get(f.kind)!;
      this.views[i].tipAt(this.v);
      b.x = this.v.x; b.y = this.v.y; b.z = this.v.z;
      v.spawn(flareBolt, b.x, b.y, b.z);
      v.burst(boltSpark, b.x, b.y, b.z, 10, 0.1, 3);
      this.flights.set(b, { trail: v.ribbons.begin(boltTrail(look.bolt.glow, look.bolt.size)), look, core: this.sprite(look.bolt.core, 3.2), halo: this.sprite(look.bolt.glow, 1.6), spin: Math.random() * 6 });
    });
    separate(this.all, this.world);
    dmg += fly(this.bolts, player, dt, this.spent, this.world); // walls stop them
    for (const b of this.spent) this.land(b, b.hit);
    const boss = this.boss;
    for (const m of this.branded) if (m.t <= 0 && !boss.marks.includes(m)) this.erupt(m, Math.hypot(player.x - m.x, player.z - m.z) < MARK.radius);
    this.branded = new Set(boss.marks);
    this.drawBolts(dt);
    this.drawTelegraphs(dt);
    this.drawLace(dt, player);
    this.all.forEach((f, i) => this.views[i].update(f, dt, this.vfx, Math.hypot(f.x - player.x, f.z - player.z)));
    if (dmg > 0) this.stats.takeDamage(dmg);
  }

  /** A pooled additive sprite coloured `color` × `hdr`. */
  private sprite(color: number, hdr: number): THREE.Sprite {
    const s = this.sprites.pop() ?? this.vfx.sprite(T.glow, 0xffffff, 1, 1);
    s.material.color.setHex(color).multiplyScalar(hdr);
    s.visible = true;
    if (!s.parent) this.root.add(s);
    return s;
  }

  /** A spent bolt: a burst where it struck (or a fizzle), its sprites back to the pool. */
  private land(b: Bolt, hit: boolean): void {
    const f = this.flights.get(b), v = this.vfx;
    if (f) {
      v.ribbons.end(f.trail);
      for (const s of [f.core, f.halo]) { s.visible = false; this.sprites.push(s); }
      this.flights.delete(b);
    }
    const k = f?.look.bolt.size ?? 1;
    if (b.wall) { // burst on the wall it ran into
      v.spawn(flareBolt, b.x, b.y, b.z);
      v.burst(boltSpark, b.x, b.y, b.z, Math.round(16 * k), 0.2, 4);
      v.burst(boltSmoke, b.x, b.y, b.z, 4, 0.2, 0.6);
      v.pulse(b.x, b.y, b.z, f?.look.bolt.glow ?? SHADOW, 15 * k);
      return;
    }
    if (!hit) { v.burst(boltSpark, b.x, b.y, b.z, 8, 0.2, 1.5); v.burst(boltSmoke, b.x, b.y, b.z, 3, 0.2, 0.5); return; }
    v.spawn(flareBolt, b.x, b.y, b.z);
    v.burst(boltSpark, b.x, b.y, b.z, Math.round(22 * k), 0.3, 5);
    v.burst(boltPuff, b.x, b.y, b.z, Math.round(6 * k), 0.3, 1);
    v.decal(boltShock, b.x, b.y - 1.05, b.z);
    v.pulse(b.x, b.y, b.z, f?.look.bolt.glow ?? SHADOW, 25 * k);
    v.shake(0.08 * k);
  }

  private drawBolts(dt: number): void {
    const v = this.vfx;
    for (const b of this.bolts) {
      const f = this.flights.get(b);
      if (!f) continue;
      const k = f.look.bolt.size, pulse = 1 + Math.sin(b.t * 30) * 0.12;
      f.core.position.set(b.x, b.y, b.z);
      f.core.scale.setScalar(0.38 * k * pulse);
      f.halo.position.set(b.x, b.y, b.z);
      f.halo.scale.setScalar(1.1 * k * pulse);
      v.ribbons.push(f.trail, b.x, b.y, b.z);
      // a spiral of motes and a wisp of dark smoke behind
      const a = (f.spin += dt * 18), r = 0.18 * k;
      v.spawn(boltMote, b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, b.z + Math.sin(a * 0.7) * r);
      if (Math.random() < dt * 25) v.spawn(boltSmoke, b.x, b.y, b.z, 0, 0.3, 0);
    }
  }

  /**
   * A nova's sigil fills the floor out to its edge while the caster (the boss, a sacerdote) channels it,
   * shadow flames licking the edge; the boss's marks fill the same way, in crimson.
   */
  private drawTelegraphs(dt: number): void {
    const v = this.vfx;
    let k = 0;
    for (const f of this.all) {
      if (f.state !== 'nova' || !f.kind.nova || k >= this.teles.length) continue;
      const [t, s] = this.teles[k++], n = f.kind.nova, p = Math.min(f.t / n.cast, 1), r = n.radius;
      t.on = s.on = true;
      t.x = s.x = f.x; t.y = s.y = f.y + 0.06; t.z = s.z = f.z;
      t.size = r * 2;
      t.fill = 0.08 + 0.92 * p;
      t.alpha = 0.55 + 0.45 * p;
      t.rot += dt * 0.3;
      s.rot -= dt * (0.6 + p * 2);
      s.alpha = Math.min(1, f.t * 3);
      s.size = (4.5 + p * 1.5) * r / 6;
      for (let i = v.count((40 + p * 120) * r / 6, dt); i > 0; i--) {
        const a = Math.random() * Math.PI * 2, e = r * (0.97 + Math.random() * 0.06);
        v.spawn(novaFlame, f.x + Math.cos(a) * e, f.y + 0.1, f.z + Math.sin(a) * e, 0, 0.6 + p, 0);
      }
    }
    for (; k < this.teles.length; k++) this.teles[k][0].on = this.teles[k][1].on = false;

    const marks = this.boss.marks;
    this.brands.forEach(([ring, runes], i) => {
      const m = marks[i];
      ring.on = runes.on = !!m;
      if (!m) return;
      const p = 1 - Math.max(m.t, 0) / MARK.cast;
      ring.x = runes.x = m.x; ring.y = runes.y = m.y + 0.07; ring.z = runes.z = m.z;
      ring.fill = 0.1 + 0.9 * p;
      ring.alpha = 0.6 + 0.4 * p;
      runes.alpha = Math.min(1, p * 4) * 0.85;
      runes.rot += dt * (1 + p * 4);
      for (let j = v.count(25 + p * 70, dt); j > 0; j--) {
        const a = Math.random() * Math.PI * 2, e = MARK.radius * (0.95 + Math.random() * 0.08);
        v.spawn(brandFlame, m.x + Math.cos(a) * e, m.y + 0.1, m.z + Math.sin(a) * e, 0, 0.5 + p * 1.5, 0);
      }
    });
  }

  /**
   * Lace lines (the Maestra's, the Governatrice's) fill white-gold along their length while they wait, then cut with a
   * spray of thread-sparks; the fuso's four threads turn round the Governatrice, faint while they draw taut.
   */
  private drawLace(dt: number, player: Target): void {
    const v = this.vfx, now = new Set<Line>();
    let k = 0;
    const lay = (x: number, y: number, z: number, dx: number, dz: number, len: number, w: number, alpha: number) => {
      for (let d = w / 2; d < len && k < this.laces.length; d += w * 0.9) {
        const c = this.laces[k++];
        c.on = true;
        c.x = x + dx * d; c.y = y + 0.06; c.z = z + dz * d;
        c.size = w * 1.1;
        c.rot = Math.atan2(dx, dz);
        c.alpha = alpha;
      }
    };
    for (const f of this.all) {
      const L = f.kind.lines;
      if (L) for (const l of f.lines) {
        now.add(l);
        const p = 1 - Math.max(l.t, 0) / L.cast;
        lay(l.x, l.y, l.z, l.dx, l.dz, l.len, L.width, 0.25 + 0.65 * p);
      }
      const S = f.kind.spin;
      if (S && f.state === 'spin') for (let a = 0; a < 4; a++) {
        const r = f.spinA + (a * Math.PI) / 2, dx = Math.sin(r), dz = Math.cos(r), live = f.t >= SPIN_DRAW;
        lay(f.x, f.y, f.z, dx, dz, S.length, S.width, live ? 0.75 : 0.25);
        if (live && Math.random() < dt * 30) { const d = Math.random() * S.length; v.spawn(laceSpark, f.x + dx * d, f.y + 0.3, f.z + dz * d, 0, 1.5, 0); }
      }
    }
    for (; k < this.laces.length; k++) this.laces[k].on = false;
    for (const l of this.laid) if (!now.has(l) && l.t <= 0) { // cut: thread-sparks all along it
      const w = this.all.find((f) => f.kind.lines)?.kind.lines?.width ?? 2;
      for (let d = 0; d < l.len; d += w) {
        v.decal(laceCut, l.x + l.dx * d, l.y + 0.07, l.z + l.dz * d);
        v.burst(laceSpark, l.x + l.dx * d, l.y + 0.3, l.z + l.dz * d, 5, 0.3, 3, 2);
      }
      v.shake(Math.hypot(player.x - l.x, player.z - l.z) < l.len + 3 ? 0.2 : 0.05);
    }
    this.laid = now;
  }

  /** A mark erupts: a column of crimson flame out of the brand, a shock wave to its edge. */
  private erupt(m: Mark, hit: boolean): void {
    const v = this.vfx, r = MARK.radius, [wave, cracks, scar] = blastOf(r);
    v.decal(wave, m.x, m.y + 0.07, m.z);
    v.decal(cracks, m.x, m.y + 0.05, m.z);
    v.decal(scar, m.x, m.y + 0.06, m.z);
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2, d = Math.random() * r * 0.8;
      v.spawn(brandBlast, m.x + Math.cos(a) * d, m.y + 0.2, m.z + Math.sin(a) * d, Math.cos(a) * 1.5, 6 + Math.random() * 4, Math.sin(a) * 1.5);
    }
    v.burst(brandFlame, m.x, m.y + 0.4, m.z, 24, r * 0.7, 1.5, 3);
    v.ring(novaSmoke, m.x, m.y + 0.3, m.z, 8, 0.6, r, 0.4);
    v.pulse(m.x, m.y + 1, m.z, BRAND, hit ? 45 : 30);
    v.shake(hit ? 0.45 : 0.15);
  }

  /** A nova goes off: a shock wave racing out to its radius, a ring of shadow flame, scorched cracks. */
  private nova(f: Priest, hit: boolean): void {
    const r = f.kind.nova!.radius, v = this.vfx, y = f.y + 0.05, k = r / 6, [wave, cracks, scar] = blastOf(r);
    v.decal(wave, f.x, y + 0.02, f.z);
    v.decal(cracks, f.x, y, f.z);
    v.decal(scar, f.x, y + 0.01, f.z);
    for (let i = 0; i < Math.round(72 * k); i++) {
      const a = (i / Math.round(72 * k)) * Math.PI * 2, s = r * 2.6;
      v.spawn(novaBlast, f.x + Math.cos(a) * 0.8, f.y + 0.3, f.z + Math.sin(a) * 0.8, Math.cos(a) * s, 1.5, Math.sin(a) * s);
    }
    for (let i = 0; i < 10; i++) { // columns of flame at the edge
      const a = (i / 10) * Math.PI * 2;
      v.burst(novaFlame, f.x + Math.cos(a) * r, f.y + 0.3, f.z + Math.sin(a) * r, 6, 0.3, 1, 4);
    }
    v.ring(novaSmoke, f.x, f.y + 0.4, f.z, 20, 1, r * 1.2, 0.5);
    v.burst(boltSpark, f.x, f.y + 2 * k, f.z, Math.round(40 * k), 1, 7 * k);
    v.pulse(f.x, f.y + 2, f.z, SHADOW, (hit ? 70 : 50) * k);
    v.shake((hit ? 0.7 : 0.35) * k);
  }

  /** Damage every priest for which `inside(x, z)` holds (abilities). */
  hurtWhere(inside: (x: number, z: number, f: Priest) => boolean, n: number): void {
    this.all.forEach((f, i) => {
      if (f.state === 'dead' || !inside(f.x, f.z, f)) return;
      const killed = hurt(f, n), h = LOOKS.get(f.kind)!.height;
      if (n >= 1 || killed) {
        this.views[i]?.hit(n, f);
        this.vfx.impact(f.x, f.y + h * 0.6, f.z, n >= BIG);
      }
      if (killed) {
        this.vfx.burst(boltSpark, f.x, f.y + h * 0.5, f.z, 30, 0.4, 3);
        this.vfx.burst(deathSmoke, f.x, f.y + h * 0.4, f.z, 8, 0.4, 0.8);
        this.vfx.spawn(darkSoul, f.x, f.y + h * 0.8, f.z);
      }
    });
  }
}
