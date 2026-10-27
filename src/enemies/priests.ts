import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { World } from '../core/physics.ts';
import { D, T, type Decal, type DecalStyle, type RibbonStyle, type Style, type Vfx } from '../abilities/vfx.ts';
import type { PlayerStats } from '../player/stats.ts';
import type { Area } from '../level/builder.ts';
import { separate, type Target } from './brain.ts';
import { PRIEST, REVERENDISSIMO, SACERDOTE, SPIN_DRAW, fly, hurt, killAll, rise, spawnCasters, think, wipe, type Bolt, type CasterKind, type CasterState, type Line, type Mark, type Priest, type Ring } from './caster.ts';
import { ABATE, AMANUENSE, BIBLIOTECARIO, CAMPANARO, COMMISSARIO, GRANATIERE, MARINAIO, MONACO, NOSTROMO } from './sangiorgio.ts';
import { playSfx } from '../audio/engine.ts';
import { CODEGA, GASTALDO, GONDOLIERE, GOVERNATRICE, MAESTRA, VELO, ZITELLA } from './zitelle.ts';
import { Overlay, Shadows, arm, loadModel, stand } from '../core/models.ts';
import { flash, ownMaterials } from './friars.ts';
import { still } from './control.ts';
import { DRAGO } from './drago.ts';
import { Serpent } from './serpent.ts';

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
  clips: Record<Exclude<CasterState, 'pour' | 'dive'>, string> & { pour?: string }; step: Record<-1 | 1, string>; pace: { 1: number; [-1]: number; run: number };
  shoots: { clip: string; from: number; rate: number }[]; swings: { clip: string; from: number; hit: number }[]; deaths: string[];
  bolt: { core: number; glow: number; size: number };
  /** A ghost's self-glow (rgb 0..1) over its own colours, which it tints that hue by the 4th (0..1, 0.5 if left out): the zitelle. */
  ghost?: [number, number, number, number?];
  /** Its marks' colour if not the Reverendissimo's crimson brands: the Bibliotecario's ink. */
  ink?: boolean;
  /** Vestments that catch the light: self-glow, metalness, roughness over the GLB's own (the Abate's gold and white). */
  sheen?: [number, number, number];
  /** Its `pour` is a blade's cut, steel and ice blue, not the Calice's wine: the Commissario's Squarcio. */
  steel?: boolean;
  /** Cast in bronze, this colour: the body's paint gone for the metal, a faint warmth kept through the hit flash (the Campanaro). */
  bronze?: number;
  /** Carpaccio's dragon: `body` is its head alone, on enemies/serpent.ts's procedural body; its telegraphs in sea and venom. */
  serpent?: boolean;
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
    body: 'prete.glb', prop: 'bastone.glb', height: 1.95, staff: 1.5, grip: 0.4,
    clips: { pray: 'Pray', chase: 'Idle', cast: CAST, swing: RELEASE.clip, nova: CAST, spin: CAST, evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Running' }, pace: { 1: RUN, [-1]: -WALK, run: RUN }, shoots: [RELEASE, THROW], swings: [{ clip: RELEASE.clip, from: 0.6, hit: 0.9 }], deaths: DEATHS, // no melee: never used
    bolt: { core: 0xf0dcff, glow: SHADOW, size: 1 },
  }],
  [SACERDOTE, {
    body: 'sacerdote.glb', prop: 'mazza.glb', height: 2.8, staff: 2.1, grip: 0.3,
    clips: { pray: 'Pray', chase: 'Idle', cast: CAST, swing: 'Attack', nova: CAST, spin: CAST, evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Walking' }, pace: { 1: WALK, [-1]: -WALK, run: RUN }, shoots: [RELEASE, THROW], swings: SWINGS, deaths: DEATHS, // never backpedals
    bolt: { core: 0xfff0c8, glow: 0xb050ff, size: 1.2 },
  }],
  [REVERENDISSIMO, {
    body: 'reverendissimo.glb', prop: 'pastorale.glb', height: 5.6, staff: 5, grip: 0.45,
    clips: { pray: 'Pray', chase: 'Idle', cast: CAST, swing: 'Attack', nova: 'Charged_Ground_Slam', spin: CAST, evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Walking' }, pace: { 1: WALK, [-1]: -WALK, run: RUN }, shoots: [RELEASE, THROW], swings: SWINGS, deaths: ['dying_backwards'],
    bolt: { core: 0xffd8ff, glow: 0x9a20ff, size: 1.7 },
  }],
  // Level 2 (enemies/zitelle.ts): the same clip names, packed from each body's Meshy animations.
  ...([[GONDOLIERE, 'gondoliere.glb', 'remo.glb', 1.95, 2.6, 0.6], [GASTALDO, 'gastaldo.glb', 'ferro.glb', 2.9, 3.3, 0.35]] as const).map(([kind, body, prop, height, staff, grip]): [CasterKind, Look] => [kind, {
    body, prop, height, staff, grip,
    clips: { pray: 'Pray', chase: 'Idle', cast: 'Idle', swing: 'Attack', nova: kind === GASTALDO ? 'Charged_Ground_Slam' : 'Attack_Hammer', spin: 'Idle', evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Running' }, pace: { 1: RUN, [-1]: -WALK, run: RUN }, shoots: [], swings: [SWINGS[0], SWINGS[1], { clip: 'Attack_Back', from: 0.3, hit: 0.75 }], deaths: ['dying_backwards', 'Dead_Knock'],
    bolt: { core: 0xffffff, glow: 0x60d0c0, size: 1 }, // never casts
  }]),
  [CODEGA, {
    body: 'codega.glb', prop: 'lanterna.glb', height: 2, staff: 2, grip: 0.15,
    clips: { pray: 'Pray', chase: 'Idle', cast: CAST, swing: RELEASE.clip, nova: CAST, spin: CAST, evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Running' }, pace: { 1: RUN, [-1]: -WALK, run: RUN }, shoots: [RELEASE, { clip: 'Cast_Throw', from: 0.5, rate: 1.2 }], swings: [{ clip: RELEASE.clip, from: 0.6, hit: 0.9 }], deaths: ['dying_backwards', 'Dead_Knock'],
    bolt: { core: 0xf4ffc8, glow: 0x8aff3a, size: 1 }, // a will-o'-wisp out of the lantern
  }],
  ...([[ZITELLA, 'zitella.glb', 1.7], [VELO, 'velo.glb', 1.95]] as const).map(([kind, body, height]): [CasterKind, Look] => [kind, {
    body, prop: 'rocca.glb', height, staff: 1.3, grip: 0.35, // the Velo: a crowned bride, the hall's warden
    clips: { pray: 'Pray', chase: 'Idle', cast: CAST, swing: RELEASE.clip, nova: CAST, spin: CAST, evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Running' }, pace: { 1: RUN, [-1]: -WALK, run: RUN }, shoots: [RELEASE, { clip: 'Cast_Throw', from: 0.5, rate: 1.2 }], swings: [{ clip: RELEASE.clip, from: 0.6, hit: 0.9 }], deaths: ['dying_backwards', 'Dead_Knock'],
    bolt: { core: 0xffffff, glow: 0x9fd8ff, size: 0.9 }, // a skein of thread
    ghost: kind === VELO ? [0.55, 0.32, 0.05, 0.25] : [0.06, 0.16, 0.34, 0.6], // pale lace: tinted ice blue; the Velo's gold kept, glowing amber
  }]),
  [MAESTRA, {
    body: 'maestra.glb', prop: 'forbici.glb', height: 2.7, staff: 1.6, grip: 0.82,
    clips: { pray: 'Pray', chase: 'Idle', cast: CAST, swing: 'Attack', nova: 'Charged_Ground_Slam', spin: CAST, evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Walking' }, pace: { 1: WALK, [-1]: -WALK, run: RUN }, shoots: [RELEASE, { clip: 'Cast_Throw', from: 0.5, rate: 1.2 }], swings: [SWINGS[0], SWINGS[1], { clip: 'Attack_Back', from: 0.3, hit: 0.75 }], deaths: ['dying_backwards', 'Dead_Knock'],
    bolt: { core: 0xfff0fa, glow: 0xd890ff, size: 1.2 },
    ghost: [0.22, 0.16, 0.3],
  }],
  [GOVERNATRICE, {
    body: 'governatrice.glb', prop: 'scettro.glb', height: 5.4, staff: 4.2, grip: 0.42,
    clips: { pray: 'Pray', chase: 'Idle', cast: CAST, swing: 'Attack', nova: 'Charged_Ground_Slam', spin: 'Spin', evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Walking' }, pace: { 1: WALK, [-1]: -WALK, run: RUN }, shoots: [RELEASE, { clip: 'Cast_Throw', from: 0.5, rate: 1.2 }], swings: [SWINGS[0], SWINGS[1], { clip: 'Attack_Back', from: 0.3, hit: 0.75 }], deaths: ['dying_backwards'],
    bolt: { core: 0xfff4d0, glow: 0xffb030, size: 1.6 },
  }],
  // Level 3 (enemies/sangiorgio.ts).
  ...([[MONACO, 'monaco.glb', 'croce.glb', 1.9, 2.1, 0.45], [MARINAIO, 'marinaio.glb', 'mezzomarinaio.glb', 1.85, 2.6, 0.5], [NOSTROMO, 'nostromo.glb', 'ancora.glb', 3, 2.1, 0.85], [GRANATIERE, 'marinaio.glb', 'mezzomarinaio.glb', 1.95, 2.6, 0.5]] as const).map(([kind, body, prop, height, staff, grip]): [CasterKind, Look] => [kind, {
    body, prop, height, staff, grip,
    clips: { pray: 'Pray', chase: 'Idle', cast: 'Idle', swing: 'Attack', nova: 'Charged_Ground_Slam', spin: 'Idle', evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: kind === NOSTROMO ? 'Walking' : 'Running' }, pace: { 1: kind === NOSTROMO ? WALK : RUN, [-1]: -WALK, run: RUN }, shoots: [], swings: [SWINGS[0], SWINGS[1], { clip: 'Attack_Back', from: 0.3, hit: 0.75 }], deaths: ['dying_backwards', 'Dead_Knock'],
    bolt: { core: 0xffffff, glow: 0x60d0c0, size: 1 }, // never casts
    ...(kind === GRANATIERE ? { ghost: [0.04, 0.1, 0.32, 0.7] as [number, number, number, number] } : {}), // the Commissario's grenadiers: the drowned, in the Republic's blue
  }]),
  [AMANUENSE, {
    body: 'amanuense.glb', prop: 'penna.glb', height: 1.8, staff: 0.9, grip: 0.3,
    clips: { pray: 'Pray', chase: 'Idle', cast: CAST, swing: RELEASE.clip, nova: CAST, spin: CAST, evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Running' }, pace: { 1: RUN, [-1]: -WALK, run: RUN }, shoots: [RELEASE, { clip: 'Cast_Throw', from: 0.5, rate: 1.2 }], swings: [{ clip: RELEASE.clip, from: 0.6, hit: 0.9 }], deaths: ['dying_backwards', 'Dead_Knock'],
    bolt: { core: 0xd8e4ff, glow: 0x2a46c8, size: 1 }, // a flick of ink
  }],
  [BIBLIOTECARIO, {
    body: 'bibliotecario.glb', prop: 'chiave.glb', height: 2.8, staff: 1.5, grip: 0.25,
    clips: { pray: 'Pray', chase: 'Idle', cast: CAST, swing: 'Attack', nova: 'Charged_Ground_Slam', spin: CAST, evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Walking' }, pace: { 1: WALK, [-1]: -WALK, run: RUN }, shoots: [RELEASE, { clip: 'Cast_Throw', from: 0.5, rate: 1.2 }], swings: [SWINGS[0], SWINGS[1], { clip: 'Attack_Back', from: 0.3, hit: 0.75 }], deaths: ['dying_backwards', 'Dead_Knock'],
    bolt: { core: 0xe0e8ff, glow: 0x3050e0, size: 1.3 },
    ink: true,
  }],
  [COMMISSARIO, {
    body: 'commissario.glb', prop: 'sciabola.glb', height: 2.7, staff: 1.25, grip: 0.12,
    clips: { pray: 'Pray', chase: 'Idle', cast: CAST, swing: 'Attack', nova: 'Attack_Hammer', spin: CAST, pour: 'Attack_Back', evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Running' }, pace: { 1: RUN, [-1]: -WALK, run: RUN }, shoots: [RELEASE], swings: [SWINGS[0], SWINGS[1], { clip: 'Attack_Back', from: 0.3, hit: 0.75 }], deaths: ['dying_backwards', 'Dead_Knock'],
    bolt: { core: 0xeefaff, glow: 0x3ec8ff, size: 1.2 }, // a pistol's shot, gone cold
    steel: true,
  }],
  [CAMPANARO, { // a monk gone to bronze, the bell hammer (a hero's Mazza del campanaro) in his fist
    body: 'monaco.glb', prop: 'campanaro.glb', height: 2.8, staff: 1.4, grip: 0.12,
    clips: { pray: 'Pray', chase: 'Idle', cast: 'Scream', swing: 'Attack', nova: 'Attack_Hammer', spin: 'Idle', evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Walking' }, pace: { 1: WALK, [-1]: -WALK, run: RUN }, shoots: [], swings: [SWINGS[0], SWINGS[1], { clip: 'Attack_Back', from: 0.3, hit: 0.75 }], deaths: ['dying_backwards', 'Dead_Knock'],
    bolt: { core: 0xffffff, glow: 0xd8a040, size: 1 }, // never casts
    bronze: 0xc58035,
  }],
  [ABATE, {
    body: 'abate.glb', prop: 'baculo.glb', height: 5.4, staff: 4.9, grip: 0.45,
    clips: { pray: 'Pray', chase: 'Idle', cast: CAST, swing: 'Attack', nova: 'Charged_Ground_Slam', spin: CAST, pour: 'mage_soell_cast_3', evade: 'Running', dead: 'dying_backwards' },
    step: { [-1]: 'Walking', 1: 'Walking' }, pace: { 1: WALK, [-1]: -WALK, run: RUN }, shoots: [RELEASE, { clip: 'Cast_Throw', from: 0.5, rate: 1.2 }], swings: [SWINGS[0], SWINGS[1], { clip: 'Attack_Back', from: 0.3, hit: 0.75 }], deaths: ['dying_backwards'],
    bolt: { core: 0xfff0f4, glow: 0xc0204a, size: 1.6 }, // wine
    sheen: [0.55, 0.15, 0.55],
  }],
  [DRAGO, { // enemies/drago.ts: its brain's states play on serpent.ts's body, not on clips
    body: 'drago.glb', prop: '', height: 8, staff: 0, grip: 0,
    clips: { pray: '', chase: '', cast: '', swing: '', nova: '', spin: '', evade: '', dead: '' },
    step: { [-1]: '', 1: '' }, pace: { 1: 1, [-1]: 1, run: 1 }, shoots: [], swings: [], deaths: [''],
    bolt: { core: 0xeaffd8, glow: 0x5ce03a, size: 1.5 }, // a gob of venom
    serpent: true,
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
// The Bibliotecario's ink blots: the same brands in ink blue, a splash of ink for the eruption.
const INK = 0x3a5cff;
const inkFlame: Style = { ...novaFlame, color: 0x9ab0ff, color2: 0x050a30 };
const inkBlast: Style = { ...novaBlast, color: 0xd8e0ff, color2: INK };
// Carpaccio's dragon: its Coda's ring in sea foam, its breath's wedge in venom.
const SEA = 0x9ad8c8, VENOM = 0x6ee050;
const foamFlame: Style = { life: [0.5, 0.8], size: [0.35, 0.6], grow: 0.8, color: 0xe0fff8, color2: 0x2a6a70, hdr: 1.2, tex: T.smoke, erode: true, grav: -2, fadeIn: 0.2 };
const venomMist: Style = { life: [0.6, 1], size: [0.6, 1], grow: 1.5, color: 0x8cff6a, color2: 0x0a2a08, hdr: 1.2, alpha: 0.6, tex: T.smoke, erode: true, drag: 2, grav: -0.3 };
// The Abate's: the Calice's wedge of wine, the bells' bronze rings, the tide's water and its islands of light. The Commissario's
// Squarcio: the same wedge, cut thin, in steel and ice.
const STEEL = 0x7fd8ff;
const steelSpark: Style = { life: [0.3, 0.6], size: [0.05, 0.1], color: 0xffffff, color2: STEEL, hdr: 4, tex: T.spark, stretch: 0.06, drag: 2, grav: 4 };
const WINE = 0xc0204a, BRONZE = 0xffc060, ISLE = 0xfff0b0;
const wineTele: DecalStyle = { life: 0, size: 2, tile: D.disc, color: WINE, hdr: 1.4 };
const wineSplash: Style = { life: [0.5, 0.9], size: [0.12, 0.24], color: 0xff6a90, color2: 0x40000c, hdr: 2, tex: T.ember, drag: 1.2, grav: 7 };
const wineMist: Style = { life: [0.6, 1], size: [0.6, 1], grow: 1.5, color: WINE, color2: 0x200006, hdr: 1.2, alpha: 0.6, tex: T.smoke, erode: true, drag: 2, grav: -0.3 };
const tollRing: DecalStyle = { life: 0, size: 2, tile: D.ring, color: BRONZE, hdr: 2.4 };
const tollSpark: Style = { life: [0.3, 0.5], size: [0.05, 0.09], color: 0xfff0c0, color2: BRONZE, hdr: 4, tex: T.spark, drag: 2, grav: 2 };
const isleDisc: DecalStyle = { life: 0, size: 4, tile: D.disc, color: ISLE, hdr: 1.3 };
const isleRing: DecalStyle = { life: 0, size: 4, tile: D.ring, color: ISLE, hdr: 2.2 };
const POUR_DECALS = 72, RAYS = 7;
// The finale: each new act a toll and a gold wave off the Abate, his fall a column of light and the bells' last strokes.
const holyRise: Style = { life: [1.2, 2], size: [0.08, 0.16], color: 0xfff6d8, color2: BRONZE, hdr: 4, tex: T.spark, stretch: 0.05, drag: 0.4, grav: -4 };
const holyWave: DecalStyle = { life: 1.2, size: 2, grow: 14, tile: D.ring, color: BRONZE, hdr: 2.6, fadeOut: 0.8 };
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

/** A caster's body as Priests drives it: a rigged Meshy body (View) or the dragon's (serpent.ts). */
interface Body { readonly root: THREE.Object3D; hit(n: number, f: Priest): void; tipAt(v?: THREE.Vector3): THREE.Vector3; update(f: Priest, dt: number, vfx: Vfx, d: number): void }

/** One priest's model and animation (its nameplate is ui/plates.ts's). */
class View implements Body {
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
      this.play(step ? L.step[step] : f.state === 'dead' ? this.deadClip : (L.clips[f.state as keyof Look['clips']] ?? L.clips.cast), false, rate);
    }

    // Casting: the crystal swells and glows, shadow motes spiral into it (a nova draws them in too).
    const p = f.state === 'cast' ? Math.min(f.t / f.kind.cast, 1) : f.state === 'nova' ? Math.min(f.t / f.kind.nova!.cast, 1) : f.state === 'pour' ? Math.min(f.t / f.kind.pour!.cast, 1) : 0;
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

    this.overlay.update(dt, f.state === 'swing' || f.state === 'cast' || f.state === 'nova' || f.state === 'pour' || f.state === 'dead');
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
  const sh = look.sheen;
  if (sh) scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.material === glow || o.parent?.name === 'held') return;
    const m = o.material as THREE.MeshStandardMaterial;
    m.emissive.setScalar(sh[0]);
    m.metalness = sh[1];
    m.roughness = sh[2];
  });
  const g = look.ghost;
  if (g) scene.traverse((o) => { // a ghost: its colours tinted, a glow from within (friars.ts flash keeps it)
    if (!(o instanceof THREE.Mesh) || o.material === glow || o.parent?.name === 'held') return;
    const m = o.material as THREE.MeshStandardMaterial;
    const t = g[3] ?? 0.5, k = t / Math.max(g[0], g[1], g[2]);
    m.color.setRGB(1 - t + g[0] * k, 1 - t + g[1] * k, 1 - t + g[2] * k); // the maps tinted toward the glow's hue
    m.emissive.setRGB(g[0], g[1], g[2]);
    m.userData.ghost = g;
    m.transparent = true;
    m.opacity = 0.88;
  });
  const br = look.bronze;
  if (br) scene.traverse((o) => { // the monk's dark robe would swallow any tint: the bronze replaces it
    if (!(o instanceof THREE.Mesh) || o.material === glow || o.parent?.name === 'held') return;
    const m = o.material as THREE.MeshStandardMaterial;
    m.map = m.emissiveMap = null;
    m.color.setHex(br);
    m.metalness = 0.45;
    m.roughness = 0.42;
    m.emissive.setRGB(0.1, 0.06, 0.015);
    m.userData.ghost = [0.1, 0.06, 0.015];
    m.needsUpdate = true;
  });
}

/** A bolt in flight: its trail and two pooled sprites. */
interface Flight { trail: number; look: Look; core: THREE.Sprite; halo: THREE.Sprite; spin: number }

/** Every priest in the cloisters, the gardens, the lagoon buildings and the church, the sacerdoti and the boss: brains, models, shadow bolts, combat glue. */
export class Priests {
  readonly root = new THREE.Group();
  readonly all: Priest[];
  readonly boss: Priest; // il Reverendissimo
  private views: Body[] = [];
  private bolts: Bolt[] = [];
  readonly spent: Bolt[] = []; // bolts that landed or fizzled this frame (the director's impact sounds)
  private flights = new Map<Bolt, Flight>();
  private sprites: THREE.Sprite[] = []; // free core/halo sprites, pooled
  private teles: [Decal, Decal][] = []; // nova telegraphs (ring, sigil) on the floor, lent to whoever channels one
  private laces: Decal[] = []; // lace lines and the fuso's threads
  private laid = new Set<Line>(); // lines seen last frame: the ones gone with their time run out cut
  private brands: [Decal, Decal][] = []; // the marks (ring, runes): the Reverendissimo's, the Bibliotecario's
  private branded = new Map<Mark, Priest>(); // marks seen last frame and whose: the ones gone with their time run out erupted
  private wine: Decal[] = []; // the Calice's wedge (and the Squarcio's)
  private bells: Decal[] = []; // the Rintocchi's rings
  private isles: [Decal, Decal][] = []; // Acqua alta's islands
  private water?: THREE.Mesh; // and its flood
  private act = -1; // the Abate's act last frame (-1 before the first: a loaded game's fallen Abate stays quiet), and whether his fall has been shown
  private fallen = false;
  private world: World;
  private vfx: Vfx;
  private stats: PlayerStats;
  private v = new THREE.Vector3();

  /** `cast`: who this set is (level 2's, enemies/zitelle.ts); level 1's by default. `lazy`: its models wait for `load`. */
  constructor(world: World, vfx: Vfx, stats: PlayerStats, areas: Area[], cast?: { all: Priest[]; boss: Priest }, lazy = false) {
    this.world = world;
    this.vfx = vfx;
    this.stats = stats;
    const casters = cast ?? spawnCasters(world, areas);
    this.boss = casters.boss;
    this.all = casters.all;
    if (this.all.some((f) => f.kind.lines)) for (let i = 0; i < LACE_DECALS; i++) this.laces.push(vfx.hold(laceTele));
    for (let i = 0; i < 3; i++) this.teles.push([vfx.hold(tele), vfx.hold(teleSigil)]); // ponytail: three rings at once, a fourth nova goes unmarked
    const marks = Math.max(0, ...this.all.map((f) => f.kind.phases?.marks?.n ?? 0));
    for (let i = 0; i < marks * 2; i++) this.brands.push([vfx.hold(brandRing), vfx.hold(brandRunes)]);
    if (this.all.some((f) => f.kind.pour)) for (let i = 0; i < POUR_DECALS; i++) this.wine.push(vfx.hold(wineTele));
    const abate = this.all.find((f) => f.kind.toll || f.kind.tide);
    if (abate) {
      const K = abate.kind, b = abate.bounds;
      if (K.toll) for (let i = 0; i < K.toll.n * 2; i++) this.bells.push(vfx.hold(tollRing));
      if (K.tide) {
        for (let i = 0; i < K.tide.n; i++) this.isles.push([vfx.hold(isleDisc), vfx.hold(isleRing)]);
        // The flood over the whole hall: its floor less the boss's margins, and the margins again.
        this.water = new THREE.Mesh(new THREE.PlaneGeometry(b.x1 - b.x0 + 7, b.z1 - b.z0 + 5.5).rotateX(-Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: 0x163c4a, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0, depthWrite: false }));
        this.water.position.set((b.x0 + b.x1) / 2, abate.y, (b.z0 + b.z1) / 2);
        this.water.visible = false;
        this.root.add(this.water);
      }
    }
    if (!lazy) this.load();
  }

  private loading = false;
  /** Fetch the bodies and stand everyone up, once (level 2's set waits for its quest: `lazy`). Until then nobody thinks. */
  load(): void {
    if (this.loading) return;
    this.loading = true;
    const vfx = this.vfx;
    const looks = [...LOOKS].filter(([k]) => this.all.some((f) => f.kind === k)); // only the bodies this set needs
    Promise.all(looks.flatMap(([, l]) => [loadModel(l.body, l.serpent ? 1024 : 512), l.serpent ? undefined : loadModel(l.prop)])).then((gltfs) => { // two kinds on one body each get their own copy
      const templates = new Map<CasterKind, Template>();
      looks.forEach(([kind, look], i) => {
        const body = gltfs[i * 2]!, prop = gltfs[i * 2 + 1];
        if (prop) dress(body.scene, prop.scene, look);
        templates.set(kind, { scene: body.scene, clips: body.animations, look, glow: vfx.sprite(T.glow, look.bolt.glow, 2.4, 1).material });
      });
      this.views = this.all.map((f) => (LOOKS.get(f.kind)!.serpent ? new Serpent(templates.get(f.kind)!.scene, vfx, f.kind.dive!.spots) : new View(templates.get(f.kind)!)));
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
  /** Which of the dead get up again (caster.ts `rise`): main.ts, level 2's drowned until the Governatrice falls. */
  rising: (f: Priest) => boolean = () => false;

  /** Who goes for someone other than the hero, and whom (main.ts: the Cardinale's procession's monaci, on him); their blows go to `strike`. */
  aim: (f: Priest) => Target | undefined = () => undefined;
  strike: (n: number) => void = () => {};

  update(dt: number, player: Target): void {
    if (!this.views.length) return;
    for (const f of this.all) if (f.state === 'dead' && this.rising(f)) rise(f, player, this.world);
    let dmg = 0;
    const v = this.vfx;
    this.all.forEach((f, i) => {
      const n = this.bolts.length, was = f.state;
      const at = this.aim(f), hit = think(f, at ?? player, this.world, dt, this.bolts);
      if (!at) dmg += hit;
      else if (hit > 0) this.strike(hit);
      if (was === 'nova' && f.state !== 'nova') this.nova(f, hit > 0);
      if (was === 'pour' && f.state !== 'pour') this.poured(f, hit > 0);
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
    for (const [m, f] of this.branded) if (m.t <= 0 && !f.marks.includes(m)) this.erupt(m, f, Math.hypot(player.x - m.x, player.z - m.z) < f.kind.phases!.marks!.radius);
    this.branded.clear();
    for (const f of this.all) for (const m of f.marks) this.branded.set(m, f);
    this.drawBolts(dt);
    this.drawTelegraphs(dt);
    this.drawLace(dt, player);
    this.drawAbate(dt);
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
      const [t, s] = this.teles[k++], n = f.kind.nova, p = Math.min(f.t / n.cast, 1), r = n.radius, sea = LOOKS.get(f.kind)!.serpent;
      t.on = s.on = true;
      t.color.setHex(sea ? SEA : SHADOW).multiplyScalar(tele.hdr!);
      s.color.setHex(sea ? SEA : SHADOW).multiplyScalar(teleSigil.hdr!);
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
        v.spawn(sea ? foamFlame : novaFlame, f.x + Math.cos(a) * e, f.y + 0.1, f.z + Math.sin(a) * e, 0, 0.6 + p, 0);
      }
    }
    for (; k < this.teles.length; k++) this.teles[k][0].on = this.teles[k][1].on = false;

    const marks = [...this.branded];
    this.brands.forEach(([ring, runes], i) => {
      const [m, f] = marks[i] ?? [];
      ring.on = runes.on = !!m;
      if (!m || !f) return;
      const M = f.kind.phases!.marks!, ink = LOOKS.get(f.kind)!.ink, p = 1 - Math.max(m.t, 0) / M.cast;
      ring.color.setHex(ink ? INK : BRAND).multiplyScalar(brandRing.hdr!);
      runes.color.setHex(ink ? INK : BRAND).multiplyScalar(brandRunes.hdr!);
      ring.size = M.radius * 2;
      runes.size = M.radius * 1.7;
      ring.x = runes.x = m.x; ring.y = runes.y = m.y + 0.07; ring.z = runes.z = m.z;
      ring.fill = 0.1 + 0.9 * p;
      ring.alpha = 0.6 + 0.4 * p;
      runes.alpha = Math.min(1, p * 4) * 0.85;
      runes.rot += dt * (1 + p * 4);
      for (let j = v.count(25 + p * 70, dt); j > 0; j--) {
        const a = Math.random() * Math.PI * 2, e = M.radius * (0.95 + Math.random() * 0.08);
        v.spawn(ink ? inkFlame : brandFlame, m.x + Math.cos(a) * e, m.y + 0.1, m.z + Math.sin(a) * e, 0, 0.5 + p * 1.5, 0);
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

  /** A mark erupts: a column of crimson flame (or ink) out of the brand, a shock wave to its edge. */
  private erupt(m: Mark, f: Priest, hit: boolean): void {
    const v = this.vfx, r = f.kind.phases!.marks!.radius, [wave, cracks, scar] = blastOf(r), ink = LOOKS.get(f.kind)!.ink;
    const blast = ink ? inkBlast : brandBlast, flame = ink ? inkFlame : brandFlame;
    v.decal(wave, m.x, m.y + 0.07, m.z);
    v.decal(cracks, m.x, m.y + 0.05, m.z);
    v.decal(scar, m.x, m.y + 0.06, m.z);
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2, d = Math.random() * r * 0.8;
      v.spawn(blast, m.x + Math.cos(a) * d, m.y + 0.2, m.z + Math.sin(a) * d, Math.cos(a) * 1.5, 6 + Math.random() * 4, Math.sin(a) * 1.5);
    }
    v.burst(flame, m.x, m.y + 0.4, m.z, 24, r * 0.7, 1.5, 3);
    v.ring(novaSmoke, m.x, m.y + 0.3, m.z, 8, 0.6, r, 0.4);
    v.pulse(m.x, m.y + 1, m.z, ink ? INK : BRAND, hit ? 45 : 30);
    v.shake(hit ? 0.45 : 0.15);
  }

  /**
   * The Abate's: the Calice's wedge of wine filling out from him while he pours (or the Commissario's Squarcio, steel); the
   * bells' bronze rings racing over the floor (a toll as each leaves); the islands of light, then the water rising round them.
   */
  private drawAbate(dt: number): void {
    if (!this.wine.length && !this.bells.length && !this.isles.length) return;
    const v = this.vfx, f = this.all.find((c) => c.kind.toll || c.kind.tide), K = f?.kind;
    if (f) {
      if (this.act < 0) this.fallen = f.state === 'dead';
      else if (f.phase > this.act || (f.state === 'dead' && !this.fallen)) this.finale(f);
      this.act = f.phase;
    }
    let k = 0;
    const pourer = this.all.find((c) => c.state === 'pour');
    if (pourer) {
      const f = pourer, C = f.kind.pour!, p = Math.min(f.t / C.cast, 1), steel = LOOKS.get(f.kind)!.steel, sea = LOOKS.get(f.kind)!.serpent;
      for (let r = 0; r < RAYS; r++) {
        const a = f.pourA + (r / (RAYS - 1) - 0.5) * C.angle * 0.92, dx = Math.sin(a), dz = Math.cos(a);
        for (let d = 1.2; d < C.length * p + 0.6 && d < C.length && k < this.wine.length; d += Math.max(1, (d * C.angle) / (RAYS - 1)) * 0.8) {
          const c = this.wine[k++];
          c.on = true;
          c.x = f.x + dx * d; c.y = f.y + 0.06; c.z = f.z + dz * d;
          c.size = Math.max(steel ? 0.9 : 1.3, (d * C.angle) / (RAYS - 1) * 1.3);
          c.alpha = 0.3 + 0.6 * p;
          c.color.setHex(steel ? STEEL : sea ? VENOM : WINE).multiplyScalar(wineTele.hdr!);
        }
      }
      if (Math.random() < dt * 20) { const a = f.pourA + (Math.random() - 0.5) * C.angle, d = Math.random() * C.length * p; v.spawn(steel ? steelSpark : sea ? venomMist : wineMist, f.x + Math.sin(a) * d, f.y + 0.2, f.z + Math.cos(a) * d, 0, 0.4, 0); }
    }
    for (; k < this.wine.length; k++) this.wine[k].on = false;
    if (!K) return;
    const ringer = this.all.find((c) => c.kind.toll && c.rings.length) ?? f, B = ringer.kind.toll; // the Abate's bells, or the Campanaro's up the campanile
    this.bells.forEach((c, i) => {
      const r: Ring | undefined = ringer.rings[i];
      c.on = !!B && !!r && r.t >= 0;
      if (!c.on) return;
      const R = r.t * B!.speed;
      if (r.t < dt * 1.5) playSfx('toll_bell', { x: r.x, y: r.y + 3, z: r.z }); // a ring just left: its stroke of the bell
      c.x = r.x; c.y = r.y + 0.08; c.z = r.z;
      c.size = Math.max(0.5, R * 2);
      c.alpha = 1 - (R / B!.reach) ** 2;
      if (Math.random() < dt * 40) { const a = Math.random() * Math.PI * 2; v.spawn(tollSpark, r.x + Math.cos(a) * R, r.y + 0.2, r.z + Math.sin(a) * R, 0, 1.2, 0); }
    });
    const W = K.tide, t = f.tide;
    this.isles.forEach(([disc, ring], i) => {
      const s = t?.isles[i];
      disc.on = ring.on = !!s;
      if (!s || !W) return;
      const p = Math.min(1, t!.t / W.warn);
      disc.x = ring.x = s.x; disc.y = ring.y = f.y + 0.2; disc.z = ring.z = s.z;
      disc.size = ring.size = W.r * 2;
      disc.alpha = 0.25 + 0.35 * p;
      ring.alpha = 0.5 + 0.5 * p;
      ring.rot += dt * 0.5;
    });
    if (this.water && W) {
      const p = t ? Math.min(1, t.t / W.warn) : 0, end = t ? THREE.MathUtils.clamp((W.warn + W.time - t.t) / 0.8, 0, 1) : 0;
      this.water.visible = !!t;
      (this.water.material as THREE.MeshStandardMaterial).opacity = 0.75 * p * end;
      this.water.position.y = f.y - 0.1 + 0.25 * p * end;
    }
  }

  /** The Abate's new act (a toll, a gold wave racing out, a shake) or his fall (a column of light to the beams, the bells' last three strokes). */
  private finale(f: Priest): void {
    const v = this.vfx, dead = f.state === 'dead', y = f.y + 0.05;
    v.decal(holyWave, f.x, y, f.z);
    v.ring(holyRise, f.x, f.y + 0.3, f.z, dead ? 60 : 30, 1.5, 6, 2);
    v.burst(holyRise, f.x, f.y + 1, f.z, dead ? 140 : 40, dead ? 1.2 : 0.8, dead ? 3 : 2, dead ? 9 : 4);
    v.pulse(f.x, f.y + 3, f.z, dead ? 0xfff0c0 : BRONZE, dead ? 120 : 60);
    v.shake(dead ? 0.9 : 0.45);
    for (let i = 0; i < (dead ? 3 : 1); i++) playSfx('toll_bell', { x: f.x, y: f.y + 5, z: f.z }, { delay: i * 1.6, rate: dead ? 0.8 : 1, gain: 1.3 });
    if (dead) this.fallen = true;
  }

  /** The Calice is poured: wine splashing out along the wedge, a red mist, a shake if it caught the hero. The Squarcio: sparks down the cut. */
  private poured(f: Priest, hit: boolean): void {
    const C = f.kind.pour!, v = this.vfx;
    if (LOOKS.get(f.kind)!.serpent) return; // the dragon's breath lets go in serpent.ts
    if (LOOKS.get(f.kind)!.steel) {
      for (let i = 0; i < 50; i++) {
        const d = 1 + Math.random() * (C.length - 1), a = f.pourA + (Math.random() - 0.5) * C.angle * 0.5;
        v.spawn(steelSpark, f.x + Math.sin(a) * d, f.y + 0.3, f.z + Math.cos(a) * d, (Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3);
      }
      v.pulse(f.x, f.y + 2, f.z, STEEL, hit ? 50 : 30);
      v.shake(hit ? 0.5 : 0.15);
      playSfx('heavy_swing', { x: f.x, y: f.y + 1.5, z: f.z });
      return;
    }
    for (let i = 0; i < 40; i++) {
      const a = f.pourA + (Math.random() - 0.5) * C.angle, d = 1 + Math.random() * (C.length - 1);
      v.spawn(wineSplash, f.x + Math.sin(a) * d, f.y + 0.2, f.z + Math.cos(a) * d, Math.sin(a) * 2, 3 + Math.random() * 3, Math.cos(a) * 2);
    }
    v.burst(wineMist, f.x + Math.sin(f.pourA) * C.length / 2, f.y + 0.3, f.z + Math.cos(f.pourA) * C.length / 2, 12, C.length / 3, 0.6);
    v.pulse(f.x, f.y + 2, f.z, WINE, hit ? 50 : 30);
    v.shake(hit ? 0.5 : 0.15);
  }

  /** A nova goes off: a shock wave racing out to its radius, a ring of shadow flame, scorched cracks. */
  private nova(f: Priest, hit: boolean): void {
    if (LOOKS.get(f.kind)!.serpent) return; // the Coda comes down in serpent.ts
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
