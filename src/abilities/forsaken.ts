import * as THREE from 'three';
import { playSfx } from '../audio/engine.ts';
import type { PlayerController } from '../player/controller.ts';
import type { World } from '../core/physics.ts';
import { GUARD_CUT, VEIL_CUT, type PlayerStats } from '../player/stats.ts';
import { PILLAR_CAST, SCHOOL, startOf, tuneOf, type Prim, type School, type Tune } from '../player/levels.ts';
import type { Mob } from '../ui/target.ts';
import { AbilitySystem, loadBar, type Ability } from './system.ts';
import { D, T, Vfx, type Decal, type DecalStyle, type RibbonStyle, type Style } from './vfx.ts';
import { Grimoire, type BaseBolt, type Bolt, type SpellEvent } from './grimoire.ts';
import type { Sound } from '../audio/engine.ts';

// The Forsaken kit: thirty-three abilities and a potion, five a school (the primary attack apart), three of them specials
// that unlock when the charge bar fills (system.ts): bone, plague and shadow, fire, frost and lightning, holy (the rules of
// all but the first few in grimoire.ts). Names are our own; flavour after the undead racials, Diablo's necromancers and
// WoW's warlocks, mages, shamans and paladins.
// Each school has its base attack, the big button of a hero of that school (levels.ts BASE_ATTACK): Caduta d'ossa's club,
// and bolts thrown as fast for the others, Stiletto di ghiaccio first.
// The run starts with Caduta d'ossa, Nube di peste, Preghiera di suffragio (the long-cast heal) and the potion; level-ups (player/levels.ts) unlock
// the rest and change the numbers, which every ability reads live from `tune` (tooltips too).
// Each one has its own clip on the Reietto (player/undead.ts) and layered effects (vfx.ts); a
// blow's effects land with the clip's blow, `BLOW` s after the press, while the damage stays
// instant as before.

const VIOLET = 0xa45cff, SHADOW = 0x1a0f24, PLAGUE = 0x7dff3a, BILE = 0x1f2e0c, WISP = 0x8dffe0;
const GOLD = 0xffc85a, GHOST = 0x9fc4ff, GRAVE = 0x58ff9a, BONE = 0xefe6d2, DUST = 0x4a4038, ABYSS = 0x0b0710;

/** Damage, ranges, times and cooldowns the level-up cards change: the picks so far (main.ts lays them on). */
export const tune: Tune = tuneOf([]);
export const PLAGUE_RANGE = 20; // m: reach for a foe
const PLAGUE_RADIUS = 2.2, PLAGUE_REACH = 6; // m: cloud size (looks; the live one is tune.plagueR), throw with none
const PLAGUE_POOLS = 6; // clouds at once; past that the oldest gives way
const FUSION_CLOUD = 4; // s a cloud sown by a fusion lasts
const WISP_MOVING = 0.6, WISP_REACH = 10, WISP_ORBIT = 0.7; // m/s: the wisp only scorches while it drifts; m: it goes for foes this near, circling them this close
const STRIKE_RANGE = 30, STRIKE_ARC = 0.5; // no target: nearest foe within ~120° in front
const NOVA_RADIUS = 6; // m, the looks' shock wave
const BLOW = 0.1; // s from the press to the clip's blow (swings, slams)
const COMBO = 1.1; // s: a swing this soon after the last one carries the combo on
const GLOB = 0.28; // s the plague glob flies (cosmetic: the cloud is there at the press)
/** Preghiera di suffragio: a long prayer for a big heal, so it is cast out of reach, or paid for in pushback. */
export const MEND = { cast: 3, heal: 0.35, mana: 120 }; // no cooldown: mana is the only limit

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// --- looks, made once ------------------------------------------------------------------------

const shard: Style = { life: [0.45, 0.8], size: [0.12, 0.22], color: BONE, hdr: 1.5, tex: T.shard, spin: [6, 14], drag: 1.5, grav: 11, fadeIn: 0.02 };
const boneSpark: Style = { life: [0.18, 0.32], size: 0.05, color: BONE, color2: VIOLET, hdr: 4, tex: T.spark, stretch: 0.045, drag: 4 };
const violetSpark: Style = { life: [0.25, 0.5], size: 0.06, color: 0xd0a0ff, color2: VIOLET, hdr: 4, tex: T.spark, stretch: 0.05, drag: 3 };
const violetGlow: Style = { life: [0.35, 0.6], size: [0.35, 0.6], grow: 1.8, color: VIOLET, color2: 0x2a0a50, hdr: 2, drag: 2 };
const graveDust: Style = { life: [0.9, 1.4], size: [0.6, 1], grow: 2.2, color: DUST, alpha: 0.55, tex: T.smoke, erode: true, dark: true, drag: 3, spin: [0.3, 1], grav: -0.4 };
const shadowSmoke: Style = { life: [0.8, 1.3], size: [0.7, 1.1], grow: 2, color: SHADOW, alpha: 0.85, tex: T.smoke2, erode: true, dark: true, drag: 3, spin: [0.4, 1.2] };
const flareViolet: Style = { life: 0.22, size: 1.4, grow: 0.6, color: 0xe6c8ff, color2: VIOLET, hdr: 3, tex: T.star, fadeIn: 0.04 };
const flareWhite: Style = { life: 0.2, size: 1.6, grow: 0.5, color: 0xffffff, color2: BONE, hdr: 3, tex: T.star, fadeIn: 0.04 };
const swingTrail: RibbonStyle = { color: 0xfff6e8, color2: VIOLET, hdr: 1.8, alpha: 0.7, width: 0, life: 0.14 };

const crackDark: DecalStyle = { life: 4, size: 3.2, tile: D.cracks, color: ABYSS, alpha: 0.9, fadeOut: 0.4, dark: true };
const crackGlow: DecalStyle = { life: 0.9, size: 3.2, tile: D.cracks, color: VIOLET, color2: 0x2a0a50, hdr: 2.6, fadeOut: 0.7 };
const shockBone: DecalStyle = { life: 0.45, size: 1, grow: 4, tile: D.shock, color: BONE, color2: VIOLET, hdr: 1.6, fadeOut: 0.6 };
const glowPool: DecalStyle = { life: 0.5, size: 3, grow: 1.4, tile: D.disc, color: VIOLET, hdr: 0.8, alpha: 0.5, fadeOut: 0.8 };
const crackDarkBig: DecalStyle = { ...crackDark, size: 5 }, crackGlowBig: DecalStyle = { ...crackGlow, size: 5 }, glowPoolBig: DecalStyle = { ...glowPool, size: 5 };

// plague
const glob: Style = { life: 0.12, size: 0.45, color: 0xc8ff8a, color2: PLAGUE, hdr: 3, tex: T.glow };
const drip: Style = { life: [0.3, 0.5], size: [0.05, 0.09], color: PLAGUE, hdr: 2.2, tex: T.drop, grav: 9 };
const droplet: Style = { life: [0.5, 0.8], size: [0.07, 0.14], color: 0xb4ff70, color2: PLAGUE, hdr: 1.8, tex: T.drop, grav: 10, drag: 0.6 };
const bubble: Style = { life: [0.6, 1.2], size: [0.08, 0.18], grow: 1.6, color: PLAGUE, hdr: 1.8, tex: T.ring, grav: -0.6, alpha: 0.9 };
const mote: Style = { life: [1.4, 2.2], size: [0.06, 0.12], color: 0xc8ff8a, color2: PLAGUE, hdr: 2.4, tex: T.ember, drag: 0.4, grav: -0.3 };
const toxic: Style = { life: [2.2, 3], size: [1.3, 2], grow: 1.5, color: BILE, alpha: 0.5, tex: T.smoke, erode: true, dark: true, spin: [0.1, 0.4] };
const toxicGlow: Style = { life: [2, 2.6], size: [1.1, 1.7], grow: 1.4, color: PLAGUE, hdr: 0.55, alpha: 0.55, tex: T.smoke2, erode: true, spin: [0.1, 0.4] };
const skull: Style = { life: [1.6, 2.2], size: [0.35, 0.5], grow: 1.3, color: PLAGUE, hdr: 1, alpha: 0.5, tex: T.skull, grav: -0.35, fadeIn: 0.35 };
const splash: DecalStyle = { life: 1.6, size: 2.6, grow: 1.4, tile: D.splash, color: PLAGUE, hdr: 0.9, alpha: 0.8, fadeOut: 0.7 };
const shockPlague: DecalStyle = { life: 0.4, size: 1, grow: 5, tile: D.shock, color: PLAGUE, hdr: 1.6, fadeOut: 0.6 };
const pool: DecalStyle = { life: 0, size: PLAGUE_RADIUS * 2.3, tile: D.pool, color: PLAGUE, hdr: 0.75 };
const globTrail: RibbonStyle = { color: 0xd8ff9a, color2: BILE, hdr: 2, width: 0.32, life: 0.22 };

// wisp
const wispMote: Style = { life: [0.4, 0.7], size: [0.05, 0.09], color: 0xd8fff4, color2: WISP, hdr: 3, tex: T.spark, stretch: 0.03 };
const wispFlame: Style = { life: [0.35, 0.6], size: [0.18, 0.3], grow: 0.4, color: 0xe0fff8, color2: 0x2a8a7a, hdr: 2.6, tex: T.flame, upright: true, grav: -1.2, fadeIn: 0.2 };
const wispEmber: Style = { life: [0.5, 0.9], size: [0.05, 0.08], color: WISP, hdr: 2.6, tex: T.ember, drag: 1.5, grav: 0.6 };
const flareWisp: Style = { life: 0.25, size: 1.6, grow: 0.5, color: 0xe8fff8, color2: WISP, hdr: 3, tex: T.star, fadeIn: 0.04 };
const wispRunes: DecalStyle = { life: 0, size: 3.2, tile: D.runes, color: WISP, hdr: 1.6 };
const wispSwirl: DecalStyle = { life: 0, size: 2.4, tile: D.swirl, color: WISP, hdr: 1 };
const shockWisp: DecalStyle = { life: 0.5, size: 1, grow: 4, tile: D.shock, color: WISP, hdr: 1.8, fadeOut: 0.6 };
const wispTrail: RibbonStyle = { color: 0xe0fff8, color2: 0x1a6a5a, hdr: 2, alpha: 0.7, width: 0.28, life: 0.5 };

// veil, step
const ghostWisp: Style = { life: [0.9, 1.3], size: [0.35, 0.6], grow: 1.6, color: GHOST, hdr: 0.9, alpha: 0.7, tex: T.wisp, erode: true, grav: -0.8, spin: [0.2, 0.8] };
const ghostSpark: Style = { life: [0.4, 0.7], size: 0.07, color: 0xe0ecff, color2: GHOST, hdr: 3, tex: T.spark, stretch: 0.04, drag: 1 };
const flareGhost: Style = { life: 0.25, size: 1.6, grow: 0.5, color: 0xeef4ff, color2: GHOST, hdr: 2.6, tex: T.star, fadeIn: 0.04 };
const shockGhost: DecalStyle = { life: 0.55, size: 1, grow: 4.5, tile: D.shock, color: GHOST, hdr: 1.6, fadeOut: 0.6 };
const ghostFloor: DecalStyle = { life: 0, size: 2.2, tile: D.disc, color: GHOST, hdr: 0.6 };
const scorch: DecalStyle = { life: 3, size: 2.2, tile: D.scorch, color: ABYSS, alpha: 0.75, fadeOut: 0.5, dark: true };
const stepSmoke: Style = { ...shadowSmoke, life: [0.6, 0.9], size: [0.4, 0.6], alpha: 0.7 };
const stepTrail: RibbonStyle = { color: 0xc89aff, color2: SHADOW, hdr: 1.4, alpha: 0.6, width: 0.55, life: 0.4 };

// strike, nova, ward, potion
const groundTrail: RibbonStyle = { color: 0xd0a8ff, color2: 0x2a0a50, hdr: 2.4, width: 0.5, life: 0.4 };
const shockBig: DecalStyle = { life: 0.55, size: 2, grow: NOVA_RADIUS, tile: D.shock, color: 0xe0c8ff, color2: VIOLET, hdr: 1.6, fadeOut: 0.6 };
const shockDust: DecalStyle = { life: 0.9, size: 2, grow: NOVA_RADIUS * 1.1, tile: D.shock, color: DUST, alpha: 0.6, fadeOut: 0.6, dark: true };
const novaShard: Style = { life: [0.5, 0.7], size: [0.12, 0.2], color: BONE, hdr: 1.6, tex: T.shard, spin: [8, 16], drag: 1.2, grav: 6, fadeIn: 0.02 };
const goldMote: Style = { life: [0.8, 1.2], size: [0.05, 0.09], color: 0xfff0c0, color2: GOLD, hdr: 3, tex: T.spark, stretch: 0.03 };
const goldRune: Style = { life: [1.2, 1.6], size: [0.22, 0.3], color: GOLD, hdr: 2, tex: T.rune, grav: -0.9, fadeIn: 0.3 };
const flareGold: Style = { life: 0.3, size: 1.8, grow: 0.5, color: 0xfff4d0, color2: GOLD, hdr: 3, tex: T.star, fadeIn: 0.04 };
const shockGold: DecalStyle = { life: 0.6, size: 1, grow: 5, tile: D.shock, color: GOLD, hdr: 1.8, fadeOut: 0.6 };
const sigil: DecalStyle = { life: 0, size: 3, tile: D.sigil, color: GOLD, hdr: 1.6 };
const heal: Style = { life: [0.8, 1.1], size: [0.09, 0.13], color: 0xc8ffd8, color2: GRAVE, hdr: 3, tex: T.spark, stretch: 0.05 };
const healStar: Style = { life: [0.6, 0.9], size: [0.25, 0.4], color: 0xe8fff0, color2: GRAVE, hdr: 2.2, tex: T.star, grav: -1, spin: [1, 3] };
const healGlow: Style = { life: [0.7, 1], size: [0.5, 0.8], grow: 1.6, color: GRAVE, hdr: 0.8, alpha: 0.6, tex: T.wisp, erode: true, grav: -1.5 };
const healRing: DecalStyle = { life: 0.7, size: 0.8, grow: 3, tile: D.shock, color: GRAVE, hdr: 1.4, fadeOut: 0.6 };
const healRunes: DecalStyle = { life: 1.4, size: 2.4, tile: D.runes, color: GRAVE, hdr: 1.2, spin: 1.5, fadeIn: 0.15, fadeOut: 0.5 };

// fire: Rogo dell'eretico, the ceri's flame
const FIRE = 0xff4a06, EMBERC = 0xff9a28, CINDER = 0x5a0800;
const pyreCore: Style = { life: 0.1, size: 0.55, color: 0xffd070, color2: FIRE, hdr: 3, tex: T.glow };
const pyreFlame: Style = { life: [0.25, 0.45], size: [0.25, 0.45], grow: 0.3, color: 0xffa030, color2: CINDER, hdr: 2.4, tex: T.flame, upright: true, grav: -2, fadeIn: 0.1 };
const pyreEmber: Style = { life: [0.6, 1.1], size: [0.04, 0.08], color: EMBERC, color2: FIRE, hdr: 3.2, tex: T.ember, drag: 1.2, grav: -0.6 };
const pyreSpark: Style = { life: [0.3, 0.6], size: 0.06, color: 0xffb040, color2: FIRE, hdr: 3, tex: T.spark, stretch: 0.05, drag: 2.5, grav: 4 };
const pyreSmoke: Style = { life: [1.2, 1.8], size: [0.8, 1.3], grow: 2.2, color: 0x241510, alpha: 0.6, tex: T.smoke, erode: true, dark: true, drag: 2, grav: -0.8, spin: [0.2, 0.6] };
const flareFire: Style = { life: 0.28, size: 2.2, grow: 0.6, color: 0xffa030, color2: FIRE, hdr: 1.6, tex: T.star, fadeIn: 0.04 };
const fireTrail: RibbonStyle = { color: 0xffb040, color2: CINDER, hdr: 2.2, width: 0.85, life: 0.35 };
const fireShock: DecalStyle = { life: 0.45, size: 1, grow: 5, tile: D.shock, color: 0xffa030, color2: FIRE, hdr: 1.5, fadeOut: 0.6 };
const firePool: DecalStyle = { life: 4, size: 4.4, tile: D.scorch, color: 0xff6a10, hdr: 0.5, alpha: 0.5, fadeIn: 0.15, fadeOut: 0.3 };
const fireScar: DecalStyle = { life: 7, size: 4, tile: D.scorch, color: 0x0a0503, alpha: 0.85, fadeOut: 0.4, dark: true };
const burnFlame: Style = { ...pyreFlame, size: [0.2, 0.34], life: [0.3, 0.5] };
const pyreBall: Style = { ...pyreFlame, color: 0xff8a20, hdr: 1.7, size: [0.35, 0.6], life: [0.18, 0.32], upright: false, spin: [1, 3], grav: 0 };

// frost: Dardo di brina, Acquasantiera gelata, Stiletto di ghiaccio
const ICE = 0x9fe8ff, DEEP = 0x2a6aff, RIME = 0xe8fbff;
const frostCore: Style = { life: 0.08, size: 0.42, color: 0xffffff, color2: ICE, hdr: 3, tex: T.glow };
const snow: Style = { life: [0.6, 1.1], size: [0.06, 0.12], color: RIME, color2: ICE, hdr: 1.6, tex: T.flake, spin: [1, 4], drag: 1.5, grav: 0.8 };
const frostMote: Style = { life: [0.4, 0.8], size: 0.05, color: 0xffffff, color2: ICE, hdr: 3.5, tex: T.spark, stretch: 0.03, drag: 2 };
const iceShard: Style = { life: [0.5, 0.9], size: [0.14, 0.26], color: RIME, color2: ICE, hdr: 2, tex: T.shard, spin: [6, 14], drag: 1.2, grav: 10, fadeIn: 0.02 };
const frostMist: Style = { life: [1, 1.6], size: [0.7, 1.1], grow: 2, color: 0x6fa8d8, hdr: 0.5, alpha: 0.45, tex: T.smoke2, erode: true, drag: 2.5, spin: [0.1, 0.4] };
const flareIce: Style = { life: 0.25, size: 1.6, grow: 0.5, color: 0xd8f4ff, color2: ICE, hdr: 2, tex: T.star, fadeIn: 0.04 };
const frostTrail: RibbonStyle = { color: 0xe8fbff, color2: DEEP, hdr: 2.2, width: 0.32, life: 0.35 };
const lanceTrail: RibbonStyle = { color: 0xffffff, color2: ICE, hdr: 2.6, width: 0.14, life: 0.18 };
const frostRing: DecalStyle = { life: 0.6, size: 1, grow: 4, tile: D.shock, color: ICE, color2: DEEP, hdr: 1.1, fadeOut: 0.6 };
const frostFloor: DecalStyle = { life: 3.5, size: 3, tile: D.frost, color: ICE, hdr: 0.7, alpha: 0.7, fadeIn: 0.1, fadeOut: 0.5 };
const fontFloor: DecalStyle = { ...frostFloor, life: 4.5, size: 10, alpha: 0.6 };
const fontRing: DecalStyle = { life: 0.7, size: 2, grow: 5.2, tile: D.shock, color: ICE, color2: DEEP, hdr: 1.1, fadeOut: 0.6 };
const iceCase: DecalStyle = { life: 0, size: 2, tile: D.frost, color: ICE, hdr: 0.9 };

// lightning: Catena di saette, Rintocco del campanile
const STORM = 0x8ab4ff, VOLT = 0xdfe8ff;
const boltCore: RibbonStyle = { color: 0xeef2ff, color2: STORM, hdr: 2.4, width: 0.09, life: 0.2 };
const boltGlow: RibbonStyle = { color: STORM, color2: 0x3a2aff, hdr: 0.8, alpha: 0.3, width: 0.4, life: 0.28 };
const crackle: Style = { life: [0.08, 0.16], size: [0.25, 0.45], color: 0xdfe8ff, color2: STORM, hdr: 1.8, tex: T.crack, fadeIn: 0.05 };
const voltSpark: Style = { life: [0.2, 0.45], size: 0.05, color: 0xffffff, color2: STORM, hdr: 4, tex: T.spark, stretch: 0.04, drag: 3 };
const flareVolt: Style = { life: 0.16, size: 1.2, grow: 0.5, color: 0xdfe8ff, color2: STORM, hdr: 2.2, tex: T.star, fadeIn: 0.04 };
const tollShock: DecalStyle = { life: 0.55, size: 1, grow: 7, tile: D.shock, color: VOLT, color2: STORM, hdr: 2, fadeOut: 0.6 };
const tollScar: DecalStyle = { life: 5, size: 3.6, tile: D.cracks, color: ABYSS, alpha: 0.9, fadeOut: 0.4, dark: true };
const tollGlow: DecalStyle = { life: 0.9, size: 3.6, tile: D.cracks, color: STORM, color2: 0x2a1a80, hdr: 2.4, fadeOut: 0.7 };
const tollMark: DecalStyle = { life: 0, size: 4, tile: D.glyph, color: STORM, hdr: 0.8 };
const stunStar: Style = { life: 0.22, size: 0.16, color: 0xfff2a0, color2: 0xffc040, hdr: 3, tex: T.star, fadeIn: 0.1 };

// the rest of the five a school: poison, the drain, the furnace and the candles, the storm and the orb, rods and shield, holy light
const venomTrail: RibbonStyle = { color: 0xd8ff9a, color2: BILE, hdr: 2, width: 0.18, life: 0.25 };
const drainTrail: RibbonStyle = { color: 0xd0a0ff, color2: GRAVE, hdr: 2.2, alpha: 0.8, width: 0.22, life: 0.5 };
const spreadTrail: RibbonStyle = { color: 0xc8ff8a, color2: BILE, hdr: 1.8, alpha: 0.8, width: 0.14, life: 0.6 };
const goldTrail: RibbonStyle = { color: 0xfff4d0, color2: GOLD, hdr: 2.4, width: 0.3, life: 0.3 };
const feverMote: Style = { life: [1, 1.6], size: [0.05, 0.1], color: 0xe0ff90, color2: 0x8a3aff, hdr: 2.2, tex: T.ember, drag: 0.6, grav: -0.5 };
const feverPool: DecalStyle = { life: 1.4, size: 2, grow: 1.6, tile: D.splash, color: 0x6acc20, color2: 0x5a2acc, hdr: 0.5, alpha: 0.6, fadeOut: 0.7 };
const ceroFlame: Style = { life: [0.3, 0.5], size: [0.16, 0.26], grow: 0.3, color: 0xfff0a0, color2: FIRE, hdr: 2.6, tex: T.flame, upright: true, grav: -1.5, fadeIn: 0.1 };
const pillarMark: DecalStyle = { life: 0, size: 4, tile: D.runes, color: FIRE, hdr: 1 };
const rodGlow: Style = { life: 0.12, size: 0.14, color: 0xdfe8ff, color2: STORM, hdr: 2.4, tex: T.glow };
const rodMark: DecalStyle = { life: 0, size: 2, tile: D.glyph, color: STORM, hdr: 0.9 };
const orbCore: Style = { life: 0.12, size: 0.9, color: 0xffffff, color2: ICE, hdr: 1.6, tex: T.glow };
const sparkOrb: Style = { life: 0.08, size: 0.45, color: 0xdfe8ff, color2: STORM, hdr: 2.2, tex: T.star };
const stormFloor: DecalStyle = { life: 0, size: 8, tile: D.frost, color: ICE, hdr: 0.6 };
const hallowFloor: DecalStyle = { life: 0, size: 8, tile: D.ring, color: GOLD, hdr: 1.6 };
const holyMote: Style = { life: [0.9, 1.4], size: [0.05, 0.09], color: 0xfff4d0, color2: GOLD, hdr: 3, tex: T.spark, stretch: 0.03, grav: -1.2 };

// the new blows
const dustRing: DecalStyle = { life: 0.7, size: 1, grow: 5, tile: D.shock, color: DUST, alpha: 0.7, fadeOut: 0.6, dark: true };
const whirlTrail: RibbonStyle = { color: 0xfff6e8, color2: VIOLET, hdr: 1.6, alpha: 0.55, width: 0, life: 0.22 };
const rushDust: Style = { ...graveDust, life: [0.5, 0.8], size: [0.4, 0.7] };
const graceTrail: RibbonStyle = { color: 0xffe0d0, color2: 0xc0202a, hdr: 2, alpha: 0.8, width: 0, life: 0.2 };
const bloodSpark: Style = { life: [0.25, 0.45], size: 0.07, color: 0xffd0c0, color2: 0xc0202a, hdr: 3, tex: T.spark, stretch: 0.05, drag: 3, grav: 6 };

interface Cloud { x: number; y: number; z: number; t: number; life: number; pool: Decal }
interface Glob { ax: number; ay: number; az: number; bx: number; by: number; bz: number; t: number; trail: number; cloud: Cloud }
interface Later { t: number; f: () => void }

interface Flight { core: THREE.Sprite; halo: THREE.Sprite; trail: number }
const BOLT_LOOK = { pyre: [0xffb040, FIRE, 0.6, 2.2], frost: [0xc8eeff, DEEP, 0.32, 1.3], lance: [0xffffff, ICE, 0.18, 0.6], venom: [0xc8ff8a, PLAGUE, 0.28, 1.1],
  judge: [0xfff4d0, GOLD, 0.42, 1.9], hammer: [0xffe080, GOLD, 0.45, 1.6],
  thorn: [0xd8ff9a, PLAGUE, 0.16, 0.6], umbra: [0xe6c8ff, VIOLET, 0.2, 0.7], ember: [0xffd070, FIRE, 0.2, 0.7], spark: [0xffffff, STORM, 0.18, 0.7], smite: [0xfff4d0, GOLD, 0.2, 0.7] } as const; // core, halo, core size, halo size
const thinTrail = (t: RibbonStyle): RibbonStyle => ({ ...t, width: 0.12, life: 0.16 }); // the base attacks: small and quick
const BOLT_TRAIL = { pyre: fireTrail, frost: frostTrail, lance: lanceTrail, venom: venomTrail, judge: goldTrail, hammer: goldTrail,
  thorn: thinTrail(venomTrail), umbra: thinTrail(drainTrail), ember: thinTrail(fireTrail), spark: thinTrail(frostTrail), smite: thinTrail(goldTrail) } as const;
const BOLT_MOTE = { frost: [snow, 40], lance: [frostMote, 25], venom: [drip, 40], judge: [holyMote, 40], hammer: [goldMote, 30],
  thorn: [drip, 20], umbra: [violetSpark, 20], ember: [pyreEmber, 25], spark: [voltSpark, 25], smite: [holyMote, 20] } as const; // shed in flight (the fireball has its own)
/** Where a base bolt lands or bursts on a wall: sparks, its colour's flash, a sound. */
const BASE_HIT: Record<Exclude<BaseBolt, 'lance'>, [Style, number, Sound]> = {
  thorn: [droplet, PLAGUE, 'plague_hit'], umbra: [violetSpark, VIOLET, 'bolt_hit'], ember: [pyreSpark, FIRE, 'fire_hit'], spark: [voltSpark, STORM, 'zap'], smite: [goldMote, GOLD, 'strike_hit'],
};
const CASES = 6, MARKS = 3;

/** How tall a foe stands (status looks sit on it): friars and priests, sacerdoti, the hornets, the boss. */
function tall(m: Mob): number {
  const r = 'kind' in m ? (m as unknown as { kind: { radius: number } }).kind.radius : 0.4;
  return r >= 1 ? 4.6 : r >= 0.8 ? 2.2 : r >= 0.5 ? 2.5 : r < 0.38 ? 1.1 : 1.8;
}

export class Forsaken {
  readonly vfx = new Vfx();
  /** The rules of fire, frost, lightning and the new blows (grimoire.ts); this class draws them. */
  readonly magic: Grimoire;
  private flights = new Map<Bolt, Flight>();
  private spare: THREE.Sprite[] = [];
  private cases: Decal[]; // rime under the frozen
  private marks: Decal[]; // Rintocco's bell glyphs, filling until the bolt falls
  private pyreMarks: Decal[]; // Colonna di fiamme's, the same
  private rodMarks: Decal[];
  private hallowFloors: Decal[];
  private stormFloor: Decal; // Bufera di bora
  private whirl = -1; // the club's trail while whirling
  readonly system: AbilitySystem<Forsaken>;
  readonly player: PlayerController;
  readonly stats: PlayerStats;
  wisp = 0;
  /** The wisp's place; it stays put while unsummoned. */
  readonly wispAt = new THREE.Vector3();
  private clouds: Cloud[] = [];
  private pools: Decal[];
  private globs: Glob[] = [];
  private later: Later[] = [];
  private hidden = 0; // Passo d'ombra: model hidden for a blink
  private time = 0;
  private wispVel = new THREE.Vector3();
  private wispTrail = -1;
  private wispCore: THREE.Sprite;
  private wispHalo: THREE.Sprite;
  private ghost = false;
  private priming = 0; // frames left priming the see-through hero (prime)
  private combo = 0;
  private comboT = 9;
  private swing = -1; // weapon-trail slot while a swing is drawn
  private swingT = 0;
  private columnT = -1;
  private sowT = 0; // s to the next cloud the wisp (Fuoco pestilente) or the third swing (Ossa appestate) may sow
  private fallSow = 0;
  private immune = false;
  private runes: Decal; // Fuoco fatuo's casting circle
  private swirl: Decal;
  private sigil: Decal; // Patto della tomba
  private veilFloor: Decal;
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  /** The combo step of the last swing: 2 is the overhead smash. */
  get comboStep(): number {
    return this.combo;
  }
  /** Damage dealer, wired to the enemies by main.ts: hurts every enemy for which `inside` holds. */
  hurt?: (inside: (x: number, z: number, mob: Mob) => boolean, n: number) => void;
  /** Wired by main.ts: the selected target, and every enemy. */
  aimed?: () => Mob | undefined;
  foes?: () => Iterable<Mob>;

  /** `schools`: the hero's (player/heroes.ts), his base attack on the big button. */
  constructor(player: PlayerController, stats: PlayerStats, schools?: readonly School[]) {
    this.player = player;
    this.stats = stats;
    const start = startOf(schools), { bar, off } = loadBar([start[0], ...BAR.slice(1)], undefined, ABILITIES.map((a) => a.id));
    this.system = new AbilitySystem(ABILITIES, bar, this, start, off);
    this.magic = new Grimoire(this, tune);
    this.system.pool = stats;
    const v = this.vfx;
    this.pools = Array.from({ length: PLAGUE_POOLS }, () => v.hold(pool));
    this.runes = v.hold(wispRunes);
    this.swirl = v.hold(wispSwirl);
    this.sigil = v.hold(sigil);
    this.veilFloor = v.hold(ghostFloor);
    this.cases = Array.from({ length: CASES }, () => v.hold(iceCase));
    this.marks = Array.from({ length: MARKS }, () => v.hold(tollMark));
    this.pyreMarks = Array.from({ length: MARKS }, () => v.hold(pillarMark));
    this.rodMarks = Array.from({ length: 2 }, () => v.hold(rodMark));
    this.hallowFloors = Array.from({ length: 2 }, () => v.hold(hallowFloor));
    this.stormFloor = v.hold(stormFloor);
    this.wispCore = v.sprite(T.star, 0xeafffa, 2.2, 0.45);
    this.wispHalo = v.sprite(T.glow, WISP, 0.7, 1);
    this.wispCore.visible = this.wispHalo.visible = false;
    v.root.add(this.wispCore, this.wispHalo);
  }

  /** Run `f` in `t` s (a blow landing with its clip). */
  at(t: number, f: () => void): void {
    this.later.push({ t, f });
  }

  update(dt: number, pressed: (code: string) => boolean): void {
    this.time += dt;
    this.comboT += dt;
    this.fallSow -= dt;
    this.system.update(dt, pressed);
    const p = this.player.pos, v = this.vfx;

    for (let i = this.later.length - 1; i >= 0; i--) {
      const l = this.later[i];
      if ((l.t -= dt) > 0) continue;
      this.later.splice(i, 1);
      l.f();
    }

    if (this.hidden > 0 && (this.hidden -= dt) <= 0) this.player.mesh.visible = true;

    const m = this.magic;
    m.update(dt);
    this.player.carried = m.dash?.kind ?? '';
    this.player.model.channel(m.dash?.kind === 'charge', 'rush');
    if (m.dash?.kind === 'charge') for (let n = v.count(30, dt); n > 0; n--) v.spawn(rushDust, p.x + rnd(-0.3, 0.3), p.y + 0.15, p.z + rnd(-0.3, 0.3), 0, 0.4, 0);
    for (const e of m.events) this.spell(e);
    m.events.length = 0;
    this.drawSpells(dt);
    this.statuses(dt);

    // The club's arc, drawn while a swing is on.
    if (this.swing >= 0) {
      if (this.player.model.edges(this.a, this.b)) v.ribbons.push(this.swing, this.a.x, this.a.y, this.a.z, this.b.x, this.b.y, this.b.z);
      if ((this.swingT -= dt) <= 0) { v.ribbons.end(this.swing); this.swing = -1; }
    }

    const veiled = this.stats.veil > 0;
    const ghost = veiled || this.priming-- > 0;
    if (ghost !== this.ghost) this.setGhost((this.ghost = ghost));
    const vf = this.veilFloor;
    vf.on = veiled;
    if (veiled) {
      for (let n = v.count(9, dt); n > 0; n--) v.spawn(ghostWisp, p.x + rnd(-0.35, 0.35), p.y + rnd(0.2, 1.4), p.z + rnd(-0.35, 0.35), 0, 0.4, 0);
      for (let n = v.count(14, dt); n > 0; n--) { // a thin shroud circling the body
        const a = this.time * 5 + rnd(0, Math.PI * 2);
        v.spawn(ghostSpark, p.x + Math.cos(a) * 0.7, p.y + rnd(0.2, 1.6), p.z + Math.sin(a) * 0.7, -Math.sin(a) * 1.6, 0.3, Math.cos(a) * 1.6);
      }
      vf.x = p.x; vf.y = p.y + 0.04; vf.z = p.z;
      vf.alpha = 0.5 * Math.min(1, this.stats.veil * 2) * (0.8 + 0.2 * Math.sin(this.time * 4));
      if (tune.veilHeal) this.stats.heal(this.stats.hpMax * tune.veilHeal * dt);
    }
    const aura = this.player.model.aura;
    if (veiled) aura.set(GHOST, 0.9 * Math.min(1, this.stats.veil * 2));

    const s = this.sigil, immune = this.stats.immune > 0; // Patto della tomba: a gold sigil and a rising glow while immune
    if (this.immune && !immune && tune.wardHeal) { // Patto eterno: the pact ends in a heal
      const h = this.stats.heal(this.stats.hpMax * tune.wardHeal);
      if (h > 0) this.system.notices.push({ kind: 'heal', text: `+${Math.round(h)}` });
    }
    this.immune = immune;
    s.on = immune;
    if (immune) {
      const fade = Math.min(1, this.stats.immune * 1.5);
      s.x = p.x; s.y = p.y + 0.05; s.z = p.z;
      s.rot += dt * 1.2;
      s.alpha = fade * (0.75 + 0.25 * Math.sin(this.time * 6));
      s.size = 3 + Math.sin(this.time * 3) * 0.1;
      aura.set(GOLD, fade);
      for (let n = v.count(30, dt); n > 0; n--) {
        const a = rnd(0, Math.PI * 2), d = rnd(0.6, 1.4);
        v.spawn(goldMote, p.x + Math.cos(a) * d, p.y + 0.1, p.z + Math.sin(a) * d, 0, rnd(1.5, 3), 0);
      }
      for (let n = v.count(3, dt); n > 0; n--) {
        const a = rnd(0, Math.PI * 2);
        v.spawn(goldRune, p.x + Math.cos(a) * 1.1, p.y + rnd(0.3, 1), p.z + Math.sin(a) * 1.1, -Math.sin(a) * 0.6, 0, Math.cos(a) * 0.6);
      }
    }

    this.updateGlobs(dt);
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.t -= dt;
      const R = tune.plagueR;
      this.hurt?.((x, z, m) => Math.hypot(x - c.x, z - c.z) < R && this.player.world.sees(c, m), tune.plagueDps * dt); // the miasma stops at walls
      const age = c.life - c.t, r = R * Math.min(1, Math.max(0, age - GLOB) * 2.5); // swells in once the glob has landed
      const pl = c.pool;
      pl.on = age > GLOB;
      pl.alpha = Math.min(1, (age - GLOB) * 3) * Math.min(1, c.t / 1.2) * (0.6 + 0.08 * Math.sin(this.time * 3 + i));
      pl.size = (0.4 + 0.6 * r / R) * R * 2.3;
      pl.rot += dt * 0.15;
      if (r > 0 && c.t > 0.6) {
        for (let n = v.count(26, dt); n > 0; n--) { const q = this.spot(c, r); v.spawn(mote, q.x, q.y + rnd(0, 0.5), q.z, 0, rnd(0.2, 0.6), 0); }
        for (let n = v.count(9, dt); n > 0; n--) { const q = this.spot(c, r * 0.85); v.spawn(bubble, q.x, q.y + 0.05, q.z); }
        for (let n = v.count(7, dt); n > 0; n--) { const q = this.spot(c, r); v.spawn(toxic, q.x, q.y + rnd(0.2, 0.9), q.z, rnd(-0.2, 0.2), 0.15, rnd(-0.2, 0.2)); }
        for (let n = v.count(5, dt); n > 0; n--) { const q = this.spot(c, r * 0.7); v.spawn(toxicGlow, q.x, q.y + rnd(0.3, 1), q.z, 0, 0.1, 0); }
        for (let n = v.count(0.7, dt); n > 0; n--) { const q = this.spot(c, r * 0.6); v.spawn(skull, q.x, q.y + 0.6, q.z); }
      }
      if (c.t <= 0) { pl.on = false; this.clouds.splice(i, 1); }
    }

    this.updateWisp(dt);

    if (this.columnT >= 0) {
      const t = (this.columnT += dt) / 1.1, c = v.column;
      c.material.opacity = (1 - t) * (1 - t);
      c.scale.set(1 - t * 0.7, 1 + t * 0.3, 1 - t * 0.7);
      if (t >= 1) { this.columnT = -1; c.visible = false; }
    }

    // Fuoco fatuo's circle, while the cast bar runs.
    const casting = this.system.casting?.ability.id === 'wisp' ? this.system.casting : null;
    this.runes.on = this.swirl.on = !!casting;
    if (casting) {
      const k = Math.min(1, casting.t / casting.total);
      for (const d of [this.runes, this.swirl]) { d.x = p.x; d.y = p.y + 0.04; d.z = p.z; }
      this.runes.size = 3.2 * (0.6 + 0.4 * k); this.runes.rot += dt * 0.8; this.runes.alpha = Math.min(1, k * 3) * 0.9;
      this.swirl.size = 2.6 * (1.1 - 0.3 * k); this.swirl.rot -= dt * 2.4; this.swirl.alpha = 0.5 * k;
    }

    const idle = v.idle; // the wisp owns the light while it lives; flashes override it briefly
    idle.on = this.wisp > 0;
    idle.x = this.wispAt.x; idle.y = this.wispAt.y; idle.z = this.wispAt.z;
    idle.color = WISP; idle.power = 9 + Math.sin(this.time * 11) * 1.2;
    v.update(dt);
  }

  /** A random point on the floor within `r` of the cloud's centre (scratch vector). */
  private spot(c: Cloud, r: number): THREE.Vector3 {
    const a = rnd(0, Math.PI * 2), d = Math.sqrt(Math.random()) * r;
    return this.a.set(c.x + Math.cos(a) * d, c.y, c.z + Math.sin(a) * d);
  }

  private updateWisp(dt: number): void {
    const v = this.vfx, w = this.wispAt;
    this.wispCore.visible = this.wispHalo.visible = this.wisp > 0;
    if (this.wisp <= 0) return;
    // Hovers off the right shoulder, lagging behind like something alive; in a fight it flies at the
    // target (else the nearest foe fighting) and circles it, scorching.
    const p = this.player.pos, f = this.player.facing, foe = wispFoe(p, this.aimed?.(), this.foes?.() ?? [], this.player.world);
    const a = this.time * 2.4, bob = Math.sin(this.time * 2.3) * 0.15;
    const tx = foe ? foe.x + Math.cos(a) * WISP_ORBIT : p.x + Math.cos(f) * 0.8 + Math.sin(f) * 0.5;
    const tz = foe ? foe.z + Math.sin(a) * WISP_ORBIT : p.z - Math.sin(f) * 0.8 + Math.cos(f) * 0.5;
    const ty = (foe ? foe.y + 1.4 : p.y + 2.1) + bob;
    this.wispVel.set(tx - w.x, ty - w.y, tz - w.z).multiplyScalar(4);
    w.addScaledVector(this.wispVel, Math.min(dt, 0.1));
    const flick = 1 + Math.sin(this.time * 23) * 0.08 + Math.sin(this.time * 37) * 0.06;
    this.wispCore.position.copy(w);
    this.wispCore.scale.setScalar(0.45 * flick);
    this.wispCore.material.rotation += dt * 1.5;
    this.wispHalo.position.copy(w);
    this.wispHalo.scale.setScalar(1.1 * flick);
    v.ribbons.push(this.wispTrail, w.x, w.y, w.z);
    for (let n = v.count(22, dt); n > 0; n--) v.spawn(wispFlame, w.x + rnd(-0.08, 0.08), w.y + rnd(-0.05, 0.1), w.z + rnd(-0.08, 0.08), rnd(-0.1, 0.1), 0.3, rnd(-0.1, 0.1));
    for (let n = v.count(10, dt); n > 0; n--) v.spawn(wispMote, w.x, w.y, w.z, rnd(-0.6, 0.6), rnd(-0.2, 0.8), rnd(-0.6, 0.6));
    if (tune.fxWisp && (this.sowT -= dt) <= 0) { // Fuoco pestilente: a cloud dropped under it every 6 s
      this.sowT = 6;
      const g = this.player.world.groundAt(w.x, w.z, w.y);
      this.plague({ x: w.x, y: g > -Infinity ? g : this.player.pos.y, z: w.z }, FUSION_CLOUD + 2, w);
    }
    if (this.wispVel.length() > WISP_MOVING) {
      // On the move it sheds a scorching trail: everything it brushes past burns.
      this.hurt?.((x, z) => Math.hypot(x - w.x, z - w.z) < tune.wispR, tune.wispDps * dt);
      for (let n = v.count(40, dt); n > 0; n--) {
        const a = rnd(0, Math.PI * 2), d = rnd(0.2, tune.wispR * 0.6);
        v.spawn(wispEmber, w.x + Math.cos(a) * d, w.y + rnd(-0.6, 0.2), w.z + Math.sin(a) * d, 0, -0.2, 0);
      }
    }
    if ((this.wisp -= dt) <= 0) {
      v.ribbons.end(this.wispTrail);
      this.wispTrail = -1;
      v.spawn(flareWisp, w.x, w.y, w.z);
      v.burst(wispMote, w.x, w.y, w.z, 30, 0.2, 2.5);
      v.pulse(w.x, w.y, w.z, WISP, 30);
    }
  }

  private updateGlobs(dt: number): void {
    const v = this.vfx;
    for (let i = this.globs.length - 1; i >= 0; i--) {
      const g = this.globs[i], t = Math.min(1, (g.t += dt) / GLOB);
      const x = g.ax + (g.bx - g.ax) * t, z = g.az + (g.bz - g.az) * t;
      const y = g.ay + (g.by - g.ay) * t + Math.sin(t * Math.PI) * 1.6; // a lob
      v.spawn(glob, x, y, z);
      v.ribbons.push(g.trail, x, y, z);
      for (let n = v.count(40, dt); n > 0; n--) v.spawn(drip, x, y, z, rnd(-0.5, 0.5), 0, rnd(-0.5, 0.5));
      if (t < 1) continue;
      v.ribbons.end(g.trail);
      this.globs.splice(i, 1);
      const c = g.cloud; // splat
      v.decal(splash, c.x, c.y + 0.03, c.z);
      v.decal(shockPlague, c.x, c.y + 0.05, c.z);
      v.burst(droplet, c.x, c.y + 0.3, c.z, 30, 0.4, 4, 3);
      v.burst(toxic, c.x, c.y + 0.5, c.z, 4, 0.6, 1.2);
      v.pulse(c.x, c.y + 1, c.z, PLAGUE, 14);
      playSfx('plague_hit', c);
      playSfx('plague_cloud', c);
    }
  }

  /** Turbine d'ossa: the club's trail while it whirls; `stop` closes it. */
  whirling(stop = false): void {
    if (stop) { this.vfx.ribbons.end(this.whirl); this.whirl = -1; return; }
    if (this.whirl < 0) this.whirl = this.vfx.ribbons.begin(whirlTrail, true);
    if (this.player.model.edges(this.a, this.b)) this.vfx.ribbons.push(this.whirl, this.a.x, this.a.y, this.a.z, this.b.x, this.b.y, this.b.z);
  }

  /** The potion's and the prayer's heal: two strands winding up the body, a flare and runes; `k` scales it. */
  healBurst(k: number): void {
    const p = this.player.pos, v = this.vfx;
    for (let i = 0; i < 64 * k; i++) {
      const t = i / (64 * k), a = t * Math.PI * 6 + (i % 2) * Math.PI, r = (0.75 - t * 0.35) * k;
      v.spawn(heal, p.x + Math.cos(a) * r, p.y + t * 2, p.z + Math.sin(a) * r, -Math.sin(a) * 1.4, 1.4, Math.cos(a) * 1.4);
    }
    v.burst(healStar, p.x, p.y + 1, p.z, 8 * k, 0.6, 0.6);
    v.burst(healGlow, p.x, p.y + 0.6, p.z, 5 * k, 0.4, 0.4);
    v.decal(healRing, p.x, p.y + 0.05, p.z);
    v.decal(healRunes, p.x, p.y + 0.04, p.z);
    v.pulse(p.x, p.y + 1, p.z, GRAVE, 18 * k);
  }

  /** A swing's club trail in `style`, drawn for `t` s. */
  swingTrail(style: RibbonStyle, t: number): void {
    if (this.swing >= 0) this.vfx.ribbons.end(this.swing);
    this.swing = this.vfx.ribbons.begin(style, true);
    this.swingT = t;
  }

  /** Plague covers (x, z): Miasma elettrico. */
  clouded(x: number, z: number): boolean {
    return this.clouds.some((c) => Math.hypot(x - c.x, z - c.z) < tune.plagueR);
  }

  /** Where a bolt leaves: between the hands, held out in front. */
  front(): { x: number; y: number; z: number } {
    const p = this.player.pos, f = this.player.facing;
    return { x: p.x - Math.sin(f) * 0.6, y: p.y + 1.35, z: p.z - Math.cos(f) * 0.6 };
  }

  /** Turn toward the spell's mark while casting at it. */
  faceMark(dt: number): void {
    const t = this.magic.target(), p = this.player.pos;
    if (!t) return;
    const want = Math.atan2(-(t.x - p.x), -(t.z - p.z)), d = Math.atan2(Math.sin(want - this.player.facing), Math.cos(want - this.player.facing));
    this.player.facing += d * Math.min(1, dt * 10);
  }

  /** A cast gathering between the hands: `style` motes drawn in from round the body. */
  gather(style: Style, core: Style, prog: number, dt: number): void {
    const c = this.front(), v = this.vfx;
    for (let n = v.count(30 + prog * 70, dt); n > 0; n--) {
      const a = rnd(0, Math.PI * 2), r = rnd(0.6, 1.3), y = c.y + rnd(-0.6, 0.6);
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      v.spawn(style, x, y, z, (c.x - x) * 2.6, (c.y - y) * 2.6, (c.z - z) * 2.6);
    }
    if (prog > 0.05 && Math.random() < dt * 14) v.spawn({ ...core, size: (core.size as number) * (0.3 + 0.5 * prog) }, c.x, c.y, c.z);
  }

  /** A jagged stroke of lightning from a to b, `w` wide. */
  lightning(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, w = 1): void {
    const v = this.vfx, n = 10, dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, j = Math.min(0.7, Math.hypot(dx, dy, dz) * 0.07) * w;
    const core = v.ribbons.begin(boltCore), glow = v.ribbons.begin(boltGlow);
    for (let i = 0; i <= n; i++) {
      const t = i / n, o = i === 0 || i === n ? 0 : 1, x = a.x + dx * t + rnd(-j, j) * o, y = a.y + dy * t + rnd(-j, j) * o, z = a.z + dz * t + rnd(-j, j) * o;
      v.ribbons.push(core, x, y, z);
      v.ribbons.push(glow, x, y, z);
      if (o && Math.random() < 0.5) v.spawn(crackle, x, y, z);
    }
    v.ribbons.end(core);
    v.ribbons.end(glow);
  }

  /** What a spell left this frame (grimoire.ts events), drawn and heard where it happened. */
  private spell(e: SpellEvent): void {
    const v = this.vfx;
    if (e.type === 'zap' || e.type === 'drain' || e.type === 'spread') {
      const [a, ...rest] = e.pts;
      if (e.type === 'zap') { const b = rest[0]; this.lightning(a, b, 0.8); v.burst(voltSpark, b.x, b.y, b.z, 10, 0.2, 4); v.pulse(b.x, b.y, b.z, STORM, 18); playSfx('zap', b, { gain: -4 }); return; }
      if (e.type === 'drain') { // the soul torn out of the foe, drawn into the hands
        const b = rest[0], r = v.ribbons.begin(drainTrail);
        for (let i = 0; i <= 8; i++) { const t = i / 8, w = Math.sin(t * Math.PI) * 0.4; v.ribbons.push(r, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t + w, a.z + (b.z - a.z) * t); }
        v.ribbons.end(r);
        v.burst(violetSpark, a.x, a.y, a.z, 8, 0.2, 2);
        v.burst(heal, b.x, b.y, b.z, 6, 0.2, 1.2);
        return;
      }
      for (const b of rest) { // the untore's poison running to every foe near
        const r = v.ribbons.begin(spreadTrail);
        for (let i = 0; i <= 6; i++) { const t = i / 6; v.ribbons.push(r, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t + Math.sin(t * Math.PI) * 0.8, a.z + (b.z - a.z) * t); }
        v.ribbons.end(r);
        v.burst(droplet, b.x, b.y, b.z, 10, 0.2, 2.5, 1);
      }
      v.burst(droplet, a.x, a.y, a.z, 20, 0.3, 3, 2);
      v.decal(splash, a.x, a.y - CHEST_Y + 0.03, a.z);
      v.pulse(a.x, a.y, a.z, PLAGUE, 22);
      playSfx('plague_hit', a);
      return;
    }
    if (e.type === 'chain') {
      for (let i = 1; i < e.pts.length; i++) {
        const a = e.pts[i - 1], b = e.pts[i];
        this.lightning(a, b, i === 1 ? 1.2 : 1);
        if (i === 1) v.spawn(flareVolt, b.x, b.y, b.z);
        v.burst(voltSpark, b.x, b.y, b.z, 12, 0.2, 5);
      }
      const b = e.pts[1];
      if (b) { v.pulse(b.x, b.y, b.z, STORM, 28); playSfx('zap', b); }
      v.shake(0.12);
      return;
    }
    const { x, y, z } = e, g = y + 0.04;
    switch (e.type) {
      case 'pyre':
        v.spawn(flareFire, x, y + 1.2, z);
        v.burst(pyreSpark, x, y + 1.2, z, 46, 0.3, 7, 2);
        v.burst(pyreFlame, x, y + 0.9, z, 26, tune.pyreR * 0.4, 2.5, 2);
        v.burst(pyreEmber, x, y + 1, z, 34, 0.5, 3, 2);
        v.burst(pyreSmoke, x, y + 1.2, z, 7, 0.6, 1.2);
        v.decal(fireShock, x, g + 0.02, z);
        v.decal({ ...firePool, size: tune.pyreR * 1.8 }, x, g + 0.03, z);
        v.decal(fireScar, x, g, z);
        v.pulse(x, y + 1.2, z, FIRE, 38);
        v.shake(0.35);
        playSfx('fire_hit', { x, y: y + 1, z });
        break;
      case 'frost':
        v.spawn({ ...flareIce, size: 1.2 }, x, y + 1.2, z);
        v.burst(iceShard, x, y + 1.2, z, 14, 0.2, 4, 2);
        v.burst(snow, x, y + 1.2, z, 22, 0.4, 2.5);
        v.burst(frostMist, x, y + 0.8, z, 3, 0.4, 0.6);
        v.decal(frostRing, x, g + 0.02, z);
        v.decal(frostFloor, x, g, z);
        v.pulse(x, y + 1.2, z, ICE, 25);
        playSfx('frost_hit', { x, y: y + 1, z });
        break;
      case 'lance':
        v.burst(frostMote, x, y + 1.2, z, 14, 0.15, 4);
        v.burst(iceShard, x, y + 1.2, z, 6, 0.15, 3, 1);
        playSfx('frost_hit', { x, y: y + 1, z }, { gain: -5 });
        break;
      case 'base': { // a base bolt lands
        const [spark, color, sound] = BASE_HIT[e.kind as Exclude<BaseBolt, 'lance'>];
        v.burst(spark, x, y + 1.2, z, e.big ? 20 : 12, e.big ? 0.4 : 0.15, 4, 1);
        v.pulse(x, y + 1.2, z, color, e.big ? 18 : 10);
        playSfx(sound, { x, y: y + 1, z }, { gain: -9 });
        break;
      }
      case 'caligo': { // the fog rolls out ahead, rime on the floor under it
        const r = e.r ?? 8, f = e.dir ?? 0;
        for (let i = 0; i < 70; i++) {
          const a = f + rnd(-0.75, 0.75), sp = rnd(r * 0.6, r * 1.3), dx = -Math.sin(a), dz = -Math.cos(a);
          v.spawn(i % 3 ? frostMist : snow, x + dx * 0.8, y + 1.2, z + dz * 0.8, dx * sp, rnd(-0.3, 0.5), dz * sp);
        }
        for (let d = 2; d < r; d += 2.2) v.decal({ ...frostFloor, size: d * 0.9 }, x - Math.sin(f) * d, g, z - Math.cos(f) * d);
        v.pulse(x - Math.sin(f) * 2, y + 1.2, z - Math.cos(f) * 2, ICE, 35);
        break;
      }
      case 'shatter':
        v.spawn(flareIce, x, y + 1.2, z);
        v.burst(iceShard, x, y + 1, z, 42, 0.5, 6, 3);
        v.burst(snow, x, y + 1, z, 30, 0.6, 3);
        v.burst(frostMist, x, y + 0.8, z, 5, 0.5, 1);
        v.decal(frostRing, x, g + 0.02, z);
        v.pulse(x, y + 1.2, z, ICE, 45);
        v.shake(0.22);
        playSfx('ice_shatter', { x, y: y + 1, z });
        break;
      case 'thaw':
        v.spawn(flareIce, x, y + 1.2, z);
        v.burst(iceShard, x, y + 1, z, 30, 0.5, 6, 3);
        v.burst(frostMist, x, y + 1, z, 8, 0.6, 1.5);
        playSfx('ice_shatter', { x, y: y + 1, z });
        break;
      case 'font':
        v.decal(fontRing, x, g + 0.03, z);
        v.decal({ ...fontFloor, life: tune.fontRoot + 0.5 }, x, g + 0.01, z);
        v.decal(dustRing, x, g, z);
        v.ring(iceShard, x, y + 0.3, z, 44, 0.6, 9, 2.5);
        v.ring(snow, x, y + 0.4, z, 34, 0.5, 6, 1);
        v.ring(frostMist, x, y + 0.3, z, 16, 0.8, 4, 0.2);
        v.spawn({ ...flareIce, size: 1 }, x, y + 1, z);
        v.pulse(x, y + 1, z, ICE, 28);
        v.shake(0.3);
        playSfx('frost_nova', { x, y: y + 1, z });
        break;
      case 'toll': {
        const top = { x: x + rnd(-1, 1), y: y + 18, z: z + rnd(-1, 1) }, foot = { x, y: y + 0.1, z };
        this.lightning(top, foot, 1.6);
        this.lightning({ x: (top.x + x) / 2 + rnd(-2, 2), y: y + 9, z: (top.z + z) / 2 + rnd(-2, 2) }, { x: x + rnd(-2, 2), y: y + 0.1, z: z + rnd(-2, 2) }, 1.2);
        v.decal(tollShock, x, g + 0.03, z);
        v.decal(tollScar, x, g, z);
        v.decal(tollGlow, x, g + 0.01, z);
        v.burst(voltSpark, x, y + 0.5, z, 60, 0.4, 9, 3);
        v.ring(graveDust, x, y + 0.2, z, 12, 0.6, 3, 0.4);
        v.spawn({ ...flareVolt, size: 2.2 }, x, y + 1, z);
        this.beam(x, y, z, STORM, 1.6);
        v.pulse(x, y + 2, z, STORM, 70);
        v.shake(0.5);
        playSfx('thunder', { x, y: y + 1, z });
        break;
      }
      case 'leap':
        this.player.model.play('slam', 0.05);
        v.decal({ ...dustRing, grow: tune.leapR * 1.8 }, x, g, z);
        v.decal({ ...shockBone, grow: tune.leapR * 1.5 }, x, g + 0.02, z);
        v.decal(crackDark, x, g, z);
        v.decal(crackGlow, x, g + 0.01, z);
        v.burst(shard, x, y + 0.3, z, 18, 0.4, 5, 4);
        v.ring(graveDust, x, y + 0.2, z, 14, 0.6, 4, 0.4);
        v.spawn(flareWhite, x, y + 0.5, z);
        v.pulse(x, y + 1, z, VIOLET, 40);
        v.shake(0.45);
        playSfx('leap_land', { x, y, z });
        break;
      case 'charge':
        this.player.model.play('slash3', 0.08);
        if (e.big) { v.spawn(flareWhite, x, y + 1.2, z); v.burst(shard, x, y + 1, z, 14, 0.3, 4, 2); v.shake(0.3); }
        v.decal(dustRing, this.player.pos.x, this.player.pos.y + 0.04, this.player.pos.z);
        playSfx('charge_hit', { x, y: y + 1, z });
        break;
      case 'grace':
        if (e.big) {
          v.burst(bloodSpark, x, y + 1, z, 30, 0.4, 5, 1);
          v.decal(crackGlow, x, g + 0.01, z);
          v.spawn(flareWhite, x, y + 1, z);
          v.shake(0.3);
        }
        v.decal(shockBone, x, g + 0.02, z);
        playSfx('execute', { x, y: y + 1, z });
        break;
      case 'fizzle':
        v.burst(pyreSmoke, x, y, z, 3, 0.2, 0.5);
        break;
      case 'venom':
        v.burst(droplet, x, y + 1.2, z, 16, 0.2, 2.5, 1);
        v.burst(bubble, x, y + 1, z, 5, 0.3, 0.6);
        v.decal({ ...splash, size: 1.4 }, x, g + 0.02, z);
        v.pulse(x, y + 1.2, z, PLAGUE, 14);
        playSfx('plague_hit', { x, y: y + 1, z }, { gain: -6 });
        break;
      case 'miasma':
        v.decal({ ...shockPlague, grow: (e.r ?? 7) * 1.9 }, x, g + 0.03, z);
        v.decal({ ...splash, size: 3.5 }, x, g + 0.02, z);
        v.ring(toxic, x, y + 0.5, z, 16, 0.8, (e.r ?? 7) * 1.1, 0.3);
        v.ring(droplet, x, y + 0.6, z, 40, 0.5, 8, 2.5);
        v.ring(skull, x, y + 0.8, z, 6, 1, 3, 0.4);
        v.pulse(x, y + 1, z, PLAGUE, 40);
        v.shake(0.3);
        playSfx('plague_cloud', { x, y: y + 1, z }, { gain: -4 });
        playSfx('nova', { x, y: y + 0.5, z }, { gain: -8 });
        break;
      case 'fever':
        v.decal({ ...feverPool, size: (e.r ?? 4) * 1.4 }, x, g + 0.02, z);
        v.burst(feverMote, x, y + 1, z, 40, e.r ?? 4, 1.2, 1);
        v.pulse(x, y + 1, z, 0x9aff40, 20);
        playSfx('plague_cast', { x, y: y + 1, z }, { gain: -4 });
        break;
      case 'pillar': {
        const r = e.r ?? 3.5;
        v.burst(pyreFlame, x, y + 0.5, z, 60, r * 0.6, 3, 7);
        v.burst(pyreSpark, x, y + 1, z, 50, r * 0.5, 8, 6);
        v.burst(pyreEmber, x, y + 2, z, 40, r * 0.5, 3, 5);
        v.burst(pyreSmoke, x, y + 3, z, 8, 1, 1.5, 1);
        v.spawn({ ...flareFire, size: 3 }, x, y + 2, z);
        v.decal({ ...fireShock, grow: r * 1.8 }, x, g + 0.02, z);
        v.decal({ ...firePool, size: r * 1.8 }, x, g + 0.03, z);
        v.decal(fireScar, x, g, z);
        this.beam(x, y, z, FIRE, 1.4);
        v.pulse(x, y + 2, z, FIRE, 60);
        v.shake(0.4);
        playSfx('fire_hit', { x, y: y + 1, z });
        break;
      }
      case 'cero':
        v.spawn({ ...flareFire, size: 2.6 }, x, y + 1.2, z);
        v.burst(pyreSpark, x, y + 1.2, z, 50, 0.3, 8, 2);
        v.burst(pyreFlame, x, y + 1, z, 30, 1.5, 3, 2);
        v.burst(goldMote, x, y + 1.4, z, 20, 0.3, 3, 1);
        v.decal({ ...fireShock, grow: (e.r ?? 4) * 1.8 }, x, g + 0.02, z);
        v.decal(fireScar, x, g, z);
        v.pulse(x, y + 1.2, z, FIRE, 45);
        v.shake(0.3);
        playSfx('fire_hit', { x, y: y + 1, z }, { gain: -3 });
        break;
      case 'furnace': { // the breath fans out ahead
        const r = e.r ?? 8, f = e.dir ?? 0;
        for (let i = 0; i < 90; i++) {
          const a = f + rnd(-0.75, 0.75), sp = rnd(r * 0.8, r * 1.6), dx = -Math.sin(a), dz = -Math.cos(a);
          v.spawn(i % 3 ? pyreBall : pyreFlame, x + dx * 0.8, y + 1.2, z + dz * 0.8, dx * sp, rnd(-0.3, 0.8), dz * sp);
        }
        for (let d = 2; d < r; d += 2.2) v.decal({ ...scorch, size: d * 0.9 }, x - Math.sin(f) * d, g, z - Math.cos(f) * d);
        v.burst(pyreSmoke, x - Math.sin(f) * 2, y + 1.4, z - Math.cos(f) * 2, 6, 1, 1.5);
        v.pulse(x - Math.sin(f) * 2, y + 1.2, z - Math.cos(f) * 2, FIRE, 50);
        v.shake(0.25);
        playSfx('fire_cast', { x, y: y + 1, z });
        playSfx('fire_hit', { x: x - Math.sin(f) * 3, y: y + 1, z: z - Math.cos(f) * 3 }, { gain: -4 });
        break;
      }
      case 'blizzard': { // a gust: ice falling all over the storm
        const r = e.r ?? 4;
        for (let i = 0; i < 18; i++) {
          const a = rnd(0, Math.PI * 2), d = Math.sqrt(Math.random()) * r;
          v.spawn(iceShard, x + Math.cos(a) * d, y + rnd(5, 8), z + Math.sin(a) * d, rnd(-1, 1), -14, rnd(-1, 1));
        }
        v.decal({ ...frostRing, grow: r * 1.5 }, x, g + 0.02, z);
        playSfx('frost_hit', { x, y: y + 1, z }, { gain: -8 });
        break;
      }
      case 'orb':
        v.spawn(flareIce, x, y + 1, z);
        v.burst(iceShard, x, y + 1, z, 40, 0.5, 7, 3);
        v.burst(snow, x, y + 1, z, 40, 1, 3);
        v.burst(frostMist, x, y + 0.8, z, 6, 0.6, 1);
        v.decal({ ...frostRing, grow: (e.r ?? 3.5) * 1.6 }, x, g + 0.02, z);
        v.decal(frostFloor, x, g, z);
        v.pulse(x, y + 1, z, ICE, 40);
        v.shake(0.2);
        playSfx('ice_shatter', { x, y: y + 1, z });
        break;
      case 'squall':
        v.decal({ ...tollShock, grow: (e.r ?? 6) * 2 }, x, g + 0.03, z);
        v.decal({ ...dustRing, grow: (e.r ?? 6) * 1.6 }, x, g, z);
        v.ring(voltSpark, x, y + 1, z, 60, 0.6, 14, 1);
        v.ring(graveDust, x, y + 0.3, z, 16, 0.8, 7, 0.4);
        for (let i = 0; i < 4; i++) { const a = rnd(0, Math.PI * 2); this.lightning({ x, y: y + 1.2, z }, { x: x + Math.cos(a) * (e.r ?? 6), y: y + 0.2, z: z + Math.sin(a) * (e.r ?? 6) }, 1); }
        v.spawn({ ...flareVolt, size: 2.6 }, x, y + 1, z);
        v.pulse(x, y + 1.5, z, STORM, 60);
        v.shake(0.5);
        playSfx('thunder', { x, y: y + 1, z });
        break;
      case 'judge':
        v.spawn(flareGold, x, y + 1.2, z);
        v.burst(goldMote, x, y + 1.2, z, 40, 0.3, 4, 1);
        v.ring(goldRune, x, y + 0.4, z, 6, 0.6, 1, 0.6);
        v.decal(shockGold, x, g + 0.02, z);
        if (e.big) v.burst(pyreFlame, x, y + 1, z, 24, 0.6, 2.5, 2); // Giudizio ardente
        this.beam(x, y, z, GOLD, 1.2);
        v.pulse(x, y + 1.2, z, GOLD, 40);
        v.shake(0.2);
        playSfx('strike_hit', { x, y: y + 1, z });
        break;
      case 'hammer':
        v.spawn({ ...flareGold, size: 2.2 }, x, y + 1.4, z);
        v.burst(goldMote, x, y + 1.4, z, 30, 0.2, 5, 1);
        v.burst(boneSpark, x, y + 1.4, z, 20, 0.2, 5);
        v.pulse(x, y + 1.4, z, GOLD, 35);
        v.shake(0.3);
        playSfx('charge_hit', { x, y: y + 1, z });
        playSfx('toll_bell', { x, y: y + 1, z }, { gain: -12 });
        break;
      case 'hallow':
        v.decal({ ...shockGold, grow: (e.r ?? 4) * 1.6 }, x, g + 0.03, z);
        v.ring(goldRune, x, y + 0.3, z, 12, e.r ?? 4, 0.5, 0.6);
        v.burst(holyMote, x, y + 0.3, z, 40, e.r ?? 4, 0.5, 1);
        v.pulse(x, y + 1, z, GOLD, 30);
        playSfx('ward', { x, y: y + 1, z }, { gain: -6 });
        break;
      case 'wall': // a bolt bursts on a wall it ran into
        if (e.kind === 'pyre') {
          v.spawn({ ...flareFire, size: 1.6 }, x, y, z);
          v.burst(pyreSpark, x, y, z, 30, 0.2, 5, 1);
          v.burst(pyreFlame, x, y, z, 14, 0.3, 1.5, 1);
          v.burst(pyreSmoke, x, y, z, 5, 0.3, 0.8);
          v.pulse(x, y, z, FIRE, 28);
          v.shake(0.12);
          playSfx('fire_hit', { x, y, z }, { gain: -6 });
        } else if (e.kind === 'venom') {
          v.burst(droplet, x, y, z, 14, 0.15, 3, 1);
          v.pulse(x, y, z, PLAGUE, 12);
          playSfx('plague_hit', { x, y, z }, { gain: -8 });
        } else if (e.kind && e.kind in BASE_HIT) {
          const [spark, color] = BASE_HIT[e.kind as Exclude<BaseBolt, 'lance'>];
          v.burst(spark, x, y, z, 10, 0.15, 3);
          v.pulse(x, y, z, color, 10);
        } else if (e.kind === 'judge' || e.kind === 'hammer') {
          v.spawn({ ...flareGold, size: 1.2 }, x, y, z);
          v.burst(goldMote, x, y, z, 20, 0.15, 4);
          v.pulse(x, y, z, GOLD, 18);
          playSfx('charge_hit', { x, y, z }, { gain: -6 });
        } else {
          v.spawn({ ...flareIce, size: 1 }, x, y, z);
          v.burst(iceShard, x, y, z, e.kind === 'frost' ? 16 : 8, 0.15, 4, 1);
          v.burst(frostMote, x, y, z, 12, 0.1, 3);
          v.burst(frostMist, x, y, z, 2, 0.2, 0.5);
          v.pulse(x, y, z, ICE, 16);
          playSfx('frost_hit', { x, y, z }, { gain: -4 });
        }
        break;
    }
  }

  /** Bolts in flight, burning floors, Rintocco's marks. */
  private drawSpells(dt: number): void {
    const v = this.vfx, m = this.magic;
    for (const [b, f] of this.flights) if (!m.bolts.includes(b)) { // landed or fizzled
      v.ribbons.end(f.trail);
      f.core.visible = f.halo.visible = false;
      this.spare.push(f.core, f.halo);
      this.flights.delete(b);
    }
    for (const b of m.bolts) {
      const [core, halo, cs, hs] = BOLT_LOOK[b.kind];
      let f = this.flights.get(b);
      if (!f) {
        f = { core: this.bolt(core, b.kind === 'pyre' ? 1.6 : 2.2), halo: this.bolt(halo, b.kind === 'pyre' ? 1.2 : 1.8), trail: v.ribbons.begin(BOLT_TRAIL[b.kind]) };
        this.flights.set(b, f);
      }
      const pulse = 1 + Math.sin(b.t * 30) * 0.1;
      f.core.position.set(b.x, b.y, b.z); f.core.scale.setScalar(cs * pulse);
      f.halo.position.set(b.x, b.y, b.z); f.halo.scale.setScalar(hs * pulse);
      v.ribbons.push(f.trail, b.x, b.y, b.z);
      if (b.kind === 'pyre') {
        for (let n = v.count(220, dt); n > 0; n--) v.spawn(pyreBall, b.x + rnd(-0.25, 0.25), b.y + rnd(-0.2, 0.25), b.z + rnd(-0.25, 0.25), rnd(-0.4, 0.4), 0.6, rnd(-0.4, 0.4));
        for (let n = v.count(30, dt); n > 0; n--) v.spawn(pyreEmber, b.x, b.y, b.z, rnd(-1, 1), rnd(-0.5, 1), rnd(-1, 1));
        for (let n = v.count(14, dt); n > 0; n--) v.spawn(pyreSmoke, b.x, b.y, b.z, 0, 0.5, 0);
        v.pulse(b.x, b.y, b.z, FIRE, 12);
      } else {
        const [mote, rate] = BOLT_MOTE[b.kind];
        for (let n = v.count(rate, dt); n > 0; n--) v.spawn(mote, b.x + rnd(-0.1, 0.1), b.y + rnd(-0.1, 0.1), b.z + rnd(-0.1, 0.1), rnd(-0.5, 0.5), rnd(-0.5, 0.5), rnd(-0.5, 0.5));
      }
    }
    this.pyreMarks.forEach((d, i) => { // Colonna di fiamme's runes, kindling until it falls
      const t = m.pillars[i];
      d.on = !!t;
      if (!t) return;
      const k = 1 - Math.max(0, t.t) / 0.5;
      d.x = t.x; d.y = t.y + 0.06; d.z = t.z;
      d.size = tune.pillarR * 2 * (0.8 + 0.2 * k); d.alpha = 0.5 + 0.5 * k; d.rot += dt * (1 + k * 4);
      for (let n = v.count(40 + k * 120, dt); n > 0; n--) { const a = rnd(0, Math.PI * 2), r = tune.pillarR * rnd(0, 1); v.spawn(pyreEmber, t.x + Math.cos(a) * r, t.y + 0.1, t.z + Math.sin(a) * r, 0, rnd(1, 4), 0); }
    });
    for (const o of m.orbs) { // Globo di brina rolling: a cold core shedding snow and shards
      for (let n = v.count(25, dt); n > 0; n--) v.spawn(orbCore, o.x, o.y + 1, o.z);
      for (let n = v.count(60, dt); n > 0; n--) v.spawn(snow, o.x + rnd(-0.4, 0.4), o.y + 1 + rnd(-0.4, 0.4), o.z + rnd(-0.4, 0.4), rnd(-2, 2), rnd(-1, 1), rnd(-2, 2));
      for (let n = v.count(12, dt); n > 0; n--) { const a = rnd(0, Math.PI * 2); v.spawn(iceShard, o.x, o.y + 1, o.z, Math.cos(a) * 6, rnd(0, 2), Math.sin(a) * 6); }
      v.pulse(o.x, o.y + 1, o.z, ICE, 14);
    }
    this.rodMarks.forEach((d, i) => { // Parafulmine: an iron pole of light, crackling at the tip
      const r = m.rods[i];
      d.on = !!r;
      if (!r) return;
      d.x = r.x; d.y = r.y + 0.05; d.z = r.z; d.rot += dt * 2; d.alpha = Math.min(1, r.t) * 0.8;
      for (let n = v.count(90, dt); n > 0; n--) v.spawn(rodGlow, r.x, r.y + rnd(0, 2.6), r.z);
      if (Math.random() < dt * 8) v.spawn(crackle, r.x + rnd(-0.2, 0.2), r.y + 2.6 + rnd(0, 0.3), r.z + rnd(-0.2, 0.2));
    });
    this.hallowFloors.forEach((d, i) => { // Terra consacrata
      const z = m.hallows[i];
      d.on = !!z;
      if (!z) return;
      d.x = z.x; d.y = z.y + 0.05; d.z = z.z; d.size = z.r * 2; d.rot += dt * 0.4;
      d.alpha = Math.min(1, z.t, (z.life - z.t) * 4) * (0.75 + 0.25 * Math.sin(this.time * 4));
      for (let n = v.count(14 * z.r, dt); n > 0; n--) { const a = rnd(0, Math.PI * 2), r = Math.sqrt(Math.random()) * z.r; v.spawn(holyMote, z.x + Math.cos(a) * r, z.y + 0.1, z.z + Math.sin(a) * r, 0, rnd(0.5, 1.5), 0); }
    });
    const sf = this.stormFloor, at = m.blizzardAt; // Bufera di bora while it blows
    sf.on = !!at;
    if (at) {
      sf.x = at.x; sf.y = at.y + 0.04; sf.z = at.z; sf.size = tune.blizzardR * 2.2; sf.rot += dt * 0.6; sf.alpha = 0.7;
      for (let n = v.count(70 * tune.blizzardR, dt); n > 0; n--) { const a = rnd(0, Math.PI * 2), r = Math.sqrt(Math.random()) * tune.blizzardR; v.spawn(snow, at.x + Math.cos(a) * r, at.y + rnd(3, 6), at.z + Math.sin(a) * r, 3, -3, 1); }
      for (let n = v.count(4, dt); n > 0; n--) v.spawn(frostMist, at.x + rnd(-2, 2), at.y + rnd(0.3, 1.5), at.z + rnd(-2, 2), 1.5, 0, 0.5);
    }
    if (m.sparks > 0) { // Scudo di saette: the charges circling the hero
      const p = this.player.pos;
      for (let k = 0; k < m.sparks; k++) {
        const a = this.time * 4 + (k * Math.PI * 2) / m.sparks, x = p.x + Math.cos(a) * 0.9, z = p.z + Math.sin(a) * 0.9, y = p.y + 1.1 + Math.sin(a * 2) * 0.2;
        for (let n = v.count(30, dt); n > 0; n--) v.spawn(sparkOrb, x, y, z);
        if (Math.random() < dt * 6) v.spawn(crackle, x, y, z);
      }
    }
    for (const f of m.fires) { // the floor burns on, dying down at the end
      const k = Math.min(1, f.t / 1.2), area = f.r * f.r;
      for (let n = v.count(26 * area * k, dt); n > 0; n--) {
        const a = rnd(0, Math.PI * 2), d = Math.sqrt(Math.random()) * f.r;
        v.spawn(pyreFlame, f.x + Math.cos(a) * d, f.y + 0.1, f.z + Math.sin(a) * d, 0, 0.6, 0);
      }
      for (let n = v.count(8 * area * k, dt); n > 0; n--) v.spawn(pyreEmber, f.x + rnd(-f.r, f.r) * 0.7, f.y + 0.2, f.z + rnd(-f.r, f.r) * 0.7, 0, rnd(0.5, 1.5), 0);
    }
    this.marks.forEach((d, i) => {
      const t = m.tolls[i];
      d.on = !!t;
      if (!t) return;
      const p = 1 - Math.max(0, t.t) / 0.6;
      d.x = t.x; d.y = t.y + 0.06; d.z = t.z;
      d.size = tune.tollR * 2 * (0.7 + 0.3 * p);
      d.alpha = 0.4 + 0.6 * p;
      d.rot += dt * (1 + p * 5);
      for (let n = v.count(30 + p * 80, dt); n > 0; n--) {
        const a = rnd(0, Math.PI * 2), r = tune.tollR * rnd(0.85, 1);
        v.spawn(voltSpark, t.x + Math.cos(a) * r, t.y + 0.1, t.z + Math.sin(a) * r, 0, rnd(2, 5), 0);
      }
    });
  }

  private bolt(color: number, hdr: number): THREE.Sprite {
    const s = this.spare.pop() ?? this.vfx.sprite(T.glow, 0xffffff, 1, 1);
    s.material.color.setHex(color).multiplyScalar(hdr);
    s.visible = true;
    if (!s.parent) this.vfx.root.add(s);
    return s;
  }

  /** Burning, chilled, frozen and stunned foes show it: flames, falling rime, ice under the feet, stars round the head. */
  private statuses(dt: number): void {
    const v = this.vfx;
    let ci = 0;
    for (const m of this.foes?.() ?? []) {
      const c = m.cc;
      if (!c || m.state === 'dead') continue;
      const h = tall(m), r = h * 0.17;
      if (c.burn > 0) for (let n = v.count(26, dt); n > 0; n--) v.spawn(burnFlame, m.x + rnd(-r, r), m.y + rnd(0.2, h * 0.75), m.z + rnd(-r, r), 0, 0.8, 0);
      if (c.slow > 0 || c.root > 0) for (let n = v.count(c.root > 0 ? 14 : 7, dt); n > 0; n--) v.spawn(snow, m.x + rnd(-r, r) * 1.5, m.y + rnd(0.3, h), m.z + rnd(-r, r) * 1.5, 0, -0.3, 0);
      if (c.root > 0 && ci < CASES) {
        const d = this.cases[ci++];
        d.on = true; d.x = m.x; d.y = m.y + 0.05; d.z = m.z;
        d.size = h * 1.1; d.alpha = Math.min(1, c.root * 2) * 0.9;
        for (let n = v.count(10, dt); n > 0; n--) v.spawn(frostMote, m.x + rnd(-r, r), m.y + rnd(0, h), m.z + rnd(-r, r));
      }
      if (c.poison > 0) for (let n = v.count(12, dt); n > 0; n--) v.spawn(drip, m.x + rnd(-r, r), m.y + rnd(0.4, h * 0.8), m.z + rnd(-r, r), 0, 0, 0);
      if (c.vuln > 0) for (let n = v.count(6, dt); n > 0; n--) v.spawn(feverMote, m.x + rnd(-r, r) * 1.3, m.y + rnd(0.2, h), m.z + rnd(-r, r) * 1.3, 0, 0.3, 0);
      if (this.magic.candles.has(m)) for (let n = v.count(20, dt); n > 0; n--) v.spawn(ceroFlame, m.x + rnd(-0.08, 0.08), m.y + h + 0.25, m.z + rnd(-0.08, 0.08), 0, 0.4, 0); // Cero funebre burning over the head
      if (c.stun > 0) for (let k = 0; k < 3; k++) {
        const a = this.time * 7 + (k * Math.PI * 2) / 3, sr = 0.3 + h * 0.06;
        v.spawn(stunStar, m.x + Math.cos(a) * sr, m.y + h + 0.15 + Math.sin(a * 2) * 0.05, m.z + Math.sin(a) * sr);
      }
    }
    for (; ci < CASES; ci++) this.cases[ci].on = false;
  }

  // --- helpers the ability table uses ---

  /** The next step of the base attack's combo (0, 1, 2: the third blow), carried on by a press within COMBO s of the last. */
  nextCombo(): number {
    this.combo = this.comboT < COMBO ? (this.combo + 1) % 3 : 0;
    this.comboT = 0;
    return this.combo;
  }

  /** Caduta d'ossa's swing: the next step of the combo, its arc and its blow. */
  swingCombo(): void {
    const step = this.nextCombo();
    const f = this.player.facing, fx = -Math.sin(f), fz = -Math.cos(f), v = this.vfx;
    this.player.model.play(step === 0 ? 'slash1' : step === 1 ? 'slash2' : 'slash3', BLOW);
    this.player.model.fight();
    if (this.swing >= 0) v.ribbons.end(this.swing);
    this.swing = v.ribbons.begin(swingTrail, true);
    this.swingT = BLOW + 0.16;
    playSfx('swing', chest(this), { variant: step });
    this.at(BLOW, () => {
      const q = this.player.pos, x = q.x + fx * 1.5, z = q.z + fz * 1.5;
      if (step < 2) { // shards flung along the sweep: right to left, then back
        const dir = step === 0 ? 1 : -1;
        for (let s = -1; s <= 1; s += 0.25) {
          const g = f - s * dir * 1.1, dx = -Math.sin(g), dz = -Math.cos(g), r = rnd(1.2, tune.fallRange - 0.2);
          v.spawn(boneSpark, q.x + dx * r, q.y + 1 + s * 0.2, q.z + dz * r, dx * 4 - Math.cos(g) * dir * 3, rnd(-0.5, 0.5), dz * 4 + Math.sin(g) * dir * 3);
        }
        v.burst(shard, x, q.y + 1, z, 4, 0.3, 3, 1.5);
        v.burst(graveDust, x, q.y + 0.6, z, 2, 0.3, 0.6);
        return;
      }
      // the overhead smash: the club bites the floor
      const y = q.y + 0.04;
      v.decal(crackDark, x, y, z);
      v.decal(crackGlow, x, y + 0.01, z);
      v.decal(shockBone, x, y + 0.02, z);
      v.ring(graveDust, x, q.y + 0.2, z, 8, 0.4, 2.2, 0.4);
      v.burst(shard, x, q.y + 0.2, z, 12, 0.3, 4, 4);
      v.spawn(flareWhite, x, q.y + 0.5, z);
      v.pulse(x, q.y + 0.8, z, VIOLET, 35);
      v.shake(0.3);
      playSfx('hit_big', { x, y: q.y + 0.3, z });
    });
  }

  /**
   * A plague cloud, thrown from the hand onto the target (Nube di peste), or at `at` lobbed from `from`
   * for `life` s (the fusions). With every pool in use, the oldest cloud gives its pool up.
   */
  plague(at?: { x: number; y: number; z: number }, life = tune.plagueLife, from?: { x: number; y: number; z: number }): void {
    const { x, y, z } = at ?? plagueSpot(this.player.pos, this.player.facing, this.aimed?.(), this.foes?.() ?? [], this.player.world);
    const g = at ? y : this.player.world.groundAt(x, z, y + 1.5);
    if (this.clouds.length >= this.pools.length) {
      const old = this.clouds.shift()!;
      old.pool.on = false;
      const gi = this.globs.findIndex((q) => q.cloud === old);
      if (gi >= 0) { this.vfx.ribbons.end(this.globs[gi].trail); this.globs.splice(gi, 1); }
    }
    const cloud: Cloud = { x, y: g > -Infinity ? g : y, z, t: life, life, pool: this.pools.find((d) => !this.clouds.some((c) => c.pool === d))! }; // settles on stairs and ledges
    this.clouds.push(cloud);
    const h = from ?? this.player.model.hand(this.a);
    this.globs.push({ ax: h.x, ay: h.y, az: h.z, bx: cloud.x, by: cloud.y + 0.3, bz: cloud.z, t: 0, trail: this.vfx.ribbons.begin(globTrail), cloud });
  }

  /** Ossa appestate: the third swing sows a short cloud where the club bites, at most every 3 s. */
  sowFall(): void {
    if (this.fallSow > 0) return;
    this.fallSow = 3;
    const p = this.player.pos, f = this.player.facing;
    this.plague({ x: p.x - Math.sin(f) * 1.5, y: p.y, z: p.z - Math.cos(f) * 1.5 }, FUSION_CLOUD, chest(this));
  }

  /** Sentenza del sepolcro lands on `m`: a bone spear bursts out of the floor through it. */
  impale(m: Mob): void {
    const v = this.vfx, x = m.x, y = m.y + 0.03, z = m.z;
    v.spike(x, m.y - 0.3, z, 3.2, 0.12, rnd(0, 6.3), 0, 1.3);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + rnd(-0.3, 0.3), r = rnd(0.7, 1.2);
      v.spike(x + Math.cos(a) * r, m.y - 0.1, z + Math.sin(a) * r, rnd(0.9, 1.6), 0.55, a, rnd(0.02, 0.1), 1.1);
    }
    v.decal(crackDark, x, y, z);
    v.decal(crackGlow, x, y + 0.01, z);
    v.decal(shockBone, x, y + 0.02, z);
    v.decal(glowPool, x, y + 0.03, z);
    v.ring(graveDust, x, m.y + 0.2, z, 10, 0.6, 2.6, 0.5);
    v.burst(shard, x, m.y + 0.6, z, 18, 0.4, 5, 5);
    v.burst(violetSpark, x, m.y + 1.2, z, 24, 0.3, 6);
    v.spawn(flareViolet, x, m.y + 1.4, z);
    this.beam(x, m.y, z, VIOLET, 1.3);
    v.pulse(x, m.y + 1.2, z, VIOLET, 35);
    v.shake(0.4);
    playSfx('strike_hit', { x, y: m.y + 1, z });
  }

  /** A column of light going up from (x,y,z) and fading. */
  beam(x: number, y: number, z: number, color: number, hdr: number): void {
    const c = this.vfx.column;
    c.material.color.setHex(color).multiplyScalar(hdr);
    c.position.set(x, y, z);
    c.scale.setScalar(1);
    c.visible = true;
    this.columnT = 0;
  }

  /** Lamento della cripta's slam: a shock wave and two rings of bone spikes bursting outwards. */
  nova(): void {
    const v = this.vfx, p = this.player.pos, y = p.y + 0.04;
    v.decal(shockBig, p.x, y + 0.02, p.z);
    v.decal(shockDust, p.x, y + 0.01, p.z);
    v.decal(crackDarkBig, p.x, y, p.z);
    v.decal(crackGlowBig, p.x, y + 0.01, p.z);
    v.decal(glowPoolBig, p.x, y + 0.03, p.z);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + rnd(-0.15, 0.15);
      v.spike(p.x + Math.cos(a) * 2.2, p.y - 0.1, p.z + Math.sin(a) * 2.2, rnd(0.9, 1.3), 0.6, a, 0.04, 0.8);
    }
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2 + rnd(-0.1, 0.1), r = tune.novaR * rnd(0.72, 0.82);
      v.spike(p.x + Math.cos(a) * r, p.y - 0.1, p.z + Math.sin(a) * r, rnd(1.1, 1.7), 0.5, a, 0.13, 0.85);
    }
    v.ring(novaShard, p.x, p.y + 0.5, p.z, 40, 0.5, 11, 2);
    v.ring(violetSpark, p.x, p.y + 0.3, p.z, 40, 0.6, 12, 0.5);
    v.ring(graveDust, p.x, p.y + 0.2, p.z, 18, 0.8, 6, 0.3);
    v.burst(violetGlow, p.x, p.y + 0.9, p.z, 20, 0.6, 2, 1.5);
    v.spawn(flareViolet, p.x, p.y + 0.6, p.z);
    v.pulse(p.x, p.y + 1, p.z, VIOLET, 40);
    v.shake(0.6);
    playSfx('nova', { x: p.x, y: p.y + 0.5, z: p.z });
  }

  /** A level-up card taken: a column of gold and motes rising round the hero. */
  ascend(): void {
    const p = this.player.pos, v = this.vfx, y = p.y + 0.05;
    v.decal(shockGold, p.x, y, p.z);
    v.decal(healRunes, p.x, y - 0.01, p.z);
    v.burst(goldMote, p.x, p.y + 1, p.z, 60, 0.7, 3, 2);
    v.ring(goldRune, p.x, p.y + 0.4, p.z, 10, 1, 0.8, 0.5);
    v.spawn(flareGold, p.x, p.y + 1.2, p.z);
    this.beam(p.x, y, p.z, GOLD, 1);
    v.pulse(p.x, p.y + 1, p.z, GOLD, 30);
  }

  /** Draw every effect, the aura and the see-through hero once at nothing (see Vfx.prime). */
  prime(): void {
    this.vfx.prime();
    this.player.model.priming = 2;
    this.priming = 2;
  }

  blinkHide(): void {
    this.hidden = 0.12;
    this.player.mesh.visible = false;
  }

  setGhost(on: boolean): void {
    this.player.mesh.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o.userData.aura) return;
      for (const m of [o.material].flat() as THREE.Material[]) {
        m.transparent = on;
        m.opacity = on ? 0.32 : 1;
        m.depthWrite = !on;
      }
      o.castShadow = !on;
    });
  }

  /** Colpo singolo's mark: the selected target, else the nearest foe in front. */
  strikeTarget(): Mob | undefined {
    const p = this.player.pos, f = this.player.facing, fx = -Math.sin(f), fz = -Math.cos(f);
    const t = this.aimed?.();
    if (t && t.state !== 'dead') return t;
    let best: Mob | undefined, bestD = STRIKE_RANGE;
    for (const m of this.foes?.() ?? []) {
      const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
      if (m.state !== 'dead' && d < bestD && (d < 1 || (dx * fx + dz * fz) / d > STRIKE_ARC) && this.player.world.sees(p, m)) { bestD = d; best = m; }
    }
    return best;
  }

  /** Fuoco fatuo appears in the raised hands. */
  summonWisp(): void {
    const p = this.player.pos, f = this.player.facing, w = this.wispAt, v = this.vfx;
    w.set(p.x - Math.sin(f) * 0.3, p.y + 2.2, p.z - Math.cos(f) * 0.3);
    this.wisp = 60;
    if (this.wispTrail < 0) this.wispTrail = v.ribbons.begin(wispTrail);
    v.spawn(flareWisp, w.x, w.y, w.z);
    v.burst(wispMote, w.x, w.y, w.z, 40, 0.1, 3.5);
    v.decal(shockWisp, p.x, p.y + 0.05, p.z);
    v.pulse(w.x, w.y, w.z, WISP, 22);
    playSfx('wisp_summon', w);
  }
}

/** The foe Fuoco fatuo goes for: the target if it is fighting within WISP_REACH of `p`, else the nearest one fighting. */
export function wispFoe(p: { x: number; y: number; z: number }, aimed: Mob | undefined, foes: Iterable<Mob>, world?: World): Mob | undefined {
  const fighting = (m: Mob) => m.state !== 'dead' && m.state !== 'pray' && m.state !== 'hoe' && m.state !== 'evade' && Math.hypot(m.x - p.x, m.z - p.z) < WISP_REACH && (!world || world.sees(p, m));
  if (aimed && fighting(aimed)) return aimed;
  let best: Mob | undefined, bd = Infinity;
  for (const m of foes) { const d = Math.hypot(m.x - p.x, m.z - p.z); if (fighting(m) && d < bd) { bd = d; best = m; } }
  return best;
}

/**
 * Where Nube di peste lands: on the selected target if it is alive and within reach, else on the
 * nearest living foe within reach, else on the ground ahead, far enough that the caster stays out of it.
 * With `world`, only foes in sight count and the lob ahead falls short of a wall.
 */
export function plagueSpot(p: { x: number; y: number; z: number }, facing: number, aimed: Mob | undefined, foes: Iterable<Mob>, world?: World): { x: number; y: number; z: number } {
  const near = (m: Mob) => m.state !== 'dead' && Math.hypot(m.x - p.x, m.z - p.z) <= PLAGUE_RANGE && (!world || world.sees(p, m));
  let best = aimed && near(aimed) ? aimed : undefined;
  if (!best) {
    let bestD = Infinity;
    for (const m of foes) {
      const d = Math.hypot(m.x - p.x, m.z - p.z);
      if (near(m) && d < bestD) { bestD = d; best = m; }
    }
  }
  if (best) return { x: best.x, y: best.y, z: best.z };
  const ax = p.x - Math.sin(facing) * PLAGUE_REACH, az = p.z - Math.cos(facing) * PLAGUE_REACH;
  const k = world ? Math.max(0, world.ray(p.x, p.y + 1.2, p.z, ax, p.y + 1.2, az) - 0.1) : 1;
  return { x: p.x + (ax - p.x) * k, y: p.y, z: p.z + (az - p.z) * k };
}

/** Distance from (x,z) to the segment a-b. */
const segDist = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};

const num = (n: number) => n.toLocaleString('it', { maximumFractionDigits: 2 });
const dmg = (n: number) => num(Math.round(n * tune.dmg * 10) / 10); // what a blow deals, Ossa più dure included
const chest = (k: Forsaken) => ({ x: k.player.pos.x, y: k.player.pos.y + 1, z: k.player.pos.z });
const CHEST_Y = 1.2; // grimoire.ts: m above the feet where its chest-high points sit
/** Targeted at a foe, but falls ahead with none: only a hidden target stops it (Rintocco, the pillar, the blizzard). */
const inSight = (k: Forsaken) => (k.magic.why() === 'Bersaglio non in vista.' ? 'Bersaglio non in vista.' : undefined);

/** A base attack that flies (levels.ts BASE_ATTACK): off the GCD like Caduta d'ossa, a throw every 0.3 s for nothing, and
 *  every third throw of a run is the combo's third blow. `say`: what it does, from its numbers. */
function baseBolt(id: BaseBolt, name: string, sfx: Sound, say: (u: Prim) => string): Ability<Forsaken> {
  return {
    id, name, icon: id, cooldown: 0.3, offGcd: true, swing: true, main: true, charge: 3,
    get desc() {
      const u = tune.prim[id];
      return `Istantaneo. ${say(u)}` + (u.third > 1 ? ` Un colpo ogni tre ne infligge ${dmg(u.dmg * u.third)}.` : '') + (u.split && id !== 'lance' ? ' Il colpo schizza: metà dei danni a chi gli sta entro 2,5 m.' : '')
        + (u.mana ? ` Ogni colpo che va a segno ti ridà ${u.mana} mana.` : '');
    },
    check: (k) => k.magic.why(),
    fire(k) {
      const third = k.nextCombo() === 2;
      k.player.model.play('throw', BLOW);
      k.player.model.fight();
      playSfx(sfx, chest(k), { gain: third ? -2 : -7 });
      k.at(BLOW, () => k.magic.shoot(id, k.player.model.hand(new THREE.Vector3()), third));
    },
  };
}

export const ABILITIES: Ability<Forsaken>[] = [
  {
    id: 'step', name: "Passo d'ombra", icon: 'step', mana: 40, charge: 10,
    get cooldown() { return tune.stepCd * tune.cdr; },
    get desc() { return `Ti dissolvi nell'ombra e riappari fino a 8 m più avanti, infliggendo ${dmg(tune.stepDmg)} danni a chi attraversi. I muri ti fermano.${tune.fxStep ? ' Dove sparisci resta una nube di peste.' : ''}`; },
    fire(k) {
      const a = chest(k), v = k.vfx;
      if (tune.fxStep) k.plague({ x: a.x, y: k.player.pos.y, z: a.z }, FUSION_CLOUD, a); // Ombra appestata
      playSfx('blink');
      v.burst(shadowSmoke, a.x, a.y, a.z, 12, 0.5, 1.4);
      v.burst(violetSpark, a.x, a.y, a.z, 26, 0.4, 5);
      v.decal(scorch, a.x, k.player.pos.y + 0.03, a.z);
      v.spawn(flareViolet, a.x, a.y, a.z);
      const d = k.player.blink(8), b = chest(k);
      k.hurt?.((x, z) => segDist(x, z, a.x, a.z, b.x, b.z) < 1.2, tune.stepDmg);
      const trail = v.ribbons.begin(stepTrail);
      for (let s = 0; s <= d + 1e-3; s += Math.max(d / 10, 0.1)) {
        const t = s / Math.max(d, 1e-3), x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        v.ribbons.push(trail, x, a.y + 0.1, z);
        v.spawn(stepSmoke, x + rnd(-0.2, 0.2), a.y + rnd(-0.4, 0.4), z + rnd(-0.2, 0.2), 0, 0.3, 0);
        v.spawn(violetSpark, x, a.y + rnd(-0.5, 0.5), z, rnd(-1, 1), rnd(0, 2), rnd(-1, 1));
      }
      v.ribbons.end(trail);
      v.burst(shadowSmoke, b.x, b.y, b.z, 10, 0.5, 1.1);
      v.burst(violetSpark, b.x, b.y, b.z, 20, 0.3, 4);
      v.decal(crackGlow, b.x, k.player.pos.y + 0.04, b.z);
      v.pulse(b.x, b.y + 0.5, b.z, VIOLET, 40);
      k.blinkHide();
      k.player.model.play('roll', 0.15);
    },
  },
  {
    id: 'plague', name: 'Nube di peste', icon: 'plague', mana: 25, charge: 10,
    get cooldown() { return tune.plagueCd * tune.cdr; },
    get desc() { return `Getta sul bersaglio (o sul nemico più vicino entro ${PLAGUE_RANGE} m, altrimenti davanti a te) una nube pestilenziale larga ${num(tune.plagueR)} m che ristagna per ${tune.plagueLife} s e corrode i nemici che vi restano dentro (${dmg(tune.plagueDps)} danni al secondo).`; },
    fire(k) {
      k.player.model.play('throw', 0.12);
      playSfx('plague_cast', chest(k));
      k.player.model.fight();
      k.plague();
      const h = k.player.model.hand(new THREE.Vector3());
      k.vfx.burst(droplet, h.x, h.y, h.z, 10, 0.1, 2.5);
    },
  },
  {
    id: 'wisp', name: 'Fuoco fatuo', icon: 'wisp', mana: 80, charge: 10,
    get cooldown() { return 30 * tune.cdr; },
    get cast() { return tune.wispCast || undefined; },
    get desc() { return `Evoca un fuoco fatuo che per 60 s ti segue e rischiara il buio, e in battaglia si avventa sul bersaglio (o sul nemico più vicino) girandogli attorno. Mentre vola brucia chi sfiora (${dmg(tune.wispDps)} danni al secondo entro ${num(tune.wispR)} m).${tune.fxWisp ? ' Ogni 6 s lascia cadere una nube di peste.' : ''}`; },
    during(k, prog, dt) {
      k.player.model.channel(true); // arms raised over the cast bar
      const p = k.player.pos, v = k.vfx, hy = p.y + 2.1;
      for (let n = v.count(40 + prog * 60, dt); n > 0; n--) { // motes spiralling up into the raised hands
        const a = rnd(0, Math.PI * 2), r = rnd(0.9, 1.5), y = p.y + rnd(0.1, 1.2);
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        v.spawn(wispMote, x, y, z, (p.x - x) * 1.6 - Math.sin(a) * 1.5, (hy - y) * 1.6, (p.z - z) * 1.6 + Math.cos(a) * 1.5);
      }
      for (let n = v.count(12 * prog, dt); n > 0; n--) v.spawn(wispFlame, p.x + rnd(-0.15, 0.15), hy + rnd(-0.1, 0.1), p.z + rnd(-0.15, 0.15), 0, 0.5, 0);
    },
    fire(k) {
      k.summonWisp();
    },
    end(k) {
      k.player.model.channel(false);
    },
    active: (k) => k.wisp > 0,
  },
  {
    id: 'veil', name: 'Velo spettrale', icon: 'veil', mana: 50, charge: 10,
    get cooldown() { return 30 * tune.cdr; },
    get desc() { return `Per ${tune.veilTime} s diventi un'ombra sfuggente: i colpi ti attraversano e subisci il ${VEIL_CUT * 100}% di danni in meno.${tune.veilHeal ? ` Intanto recuperi il ${tune.veilHeal * 100}% della salute al secondo.` : ''}`; },
    fire(k) {
      k.stats.veil = tune.veilTime;
      playSfx('veil', chest(k));
      k.player.model.play('spread', 0.2);
      const a = chest(k), v = k.vfx;
      for (let i = 0; i < 40; i++) { // the shroud gathers in
        const t = rnd(0, Math.PI * 2), u = rnd(-0.6, 1), r = 1.8;
        const dx = Math.cos(t) * Math.sqrt(1 - u * u), dz = Math.sin(t) * Math.sqrt(1 - u * u);
        v.spawn(ghostSpark, a.x + dx * r, a.y + u * r * 0.7, a.z + dz * r, -dx * 5, -u * 3, -dz * 5);
      }
      v.burst(ghostWisp, a.x, a.y, a.z, 10, 0.5, 1.2);
      v.decal(shockGhost, a.x, k.player.pos.y + 0.05, a.z);
      v.spawn(flareGhost, a.x, a.y + 0.2, a.z);
      v.pulse(a.x, a.y, a.z, GHOST, 30);
    },
    active: (k) => k.stats.veil > 0,
  },
  {
    // The main attack: off the GCD so the 0.3 s cooldown is the real swing rate, WoW auto-attack style.
    id: 'fall', name: "Caduta d'ossa", icon: 'fall', cooldown: 0.3, offGcd: true, swing: true, main: true, charge: 3,
    get desc() {
      return `Un fendente di schegge d'ossa davanti a te: ${dmg(tune.fallDmg)} danni a tutti i nemici entro ${num(tune.fallRange)} m.`
        + (tune.fallThird > 1 ? ` Il terzo colpo della combo ne infligge ${dmg(tune.fallDmg * tune.fallThird)}.` : '')
        + (tune.fallMana ? ` Ogni fendente che colpisce ti ridà ${tune.fallMana} mana.` : '')
        + (tune.fxFall ? ' Il terzo colpo semina una nube di peste (al massimo ogni 3 s).' : '');
    },
    fire(k) {
      const p = k.player.pos, f = k.player.facing, fx = -Math.sin(f), fz = -Math.cos(f);
      k.swingCombo();
      const third = k.comboStep === 2;
      let hit = 0;
      k.hurt?.((x, z, mob) => {
        const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
        const ok = d < tune.fallRange && (d < 0.6 || (dx * fx + dz * fz) / d > tune.fallArc) && k.player.world.sees(p, mob); // not through a wall
        if (ok) hit++;
        return ok;
      }, third ? tune.fallDmg * tune.fallThird : tune.fallDmg);
      if (hit && tune.fallMana) k.stats.restoreMana(tune.fallMana);
      if (third && tune.fxFall) k.sowFall();
    },
  },
  // --- fire, frost, lightning (rules in grimoire.ts) ---
  {
    id: 'pyre', name: "Rogo dell'eretico", icon: 'pyre', mana: 45, charge: 12,
    get cooldown() { return 4 * tune.cdr; },
    get cast() { return tune.pyreCast; },
    get desc() { return `Raccogli tra le mani il fuoco dei ceri votivi e lo scagli sul bersaglio (o sul nemico più vicino davanti a te): ${dmg(tune.pyreDmg)} danni, metà a chi gli sta entro ${num(tune.pyreR)} m; il bersaglio brucia per 4 s e il pavimento arde per 4 s. Muoverti interrompe il lancio.${tune.fxShatter ? ' Su un nemico rallentato o congelato: +60% e il ghiaccio esplode in schegge.' : ''}`; },
    check: (k) => k.magic.why(),
    during(k, prog, dt) {
      k.player.model.channel(true, 'gather');
      k.faceMark(dt);
      k.gather(pyreEmber, pyreCore, prog, dt);
      const c = k.front();
      for (let n = k.vfx.count(30 + 120 * prog, dt); n > 0; n--) { const r = 0.08 + 0.25 * prog; k.vfx.spawn(pyreBall, c.x + rnd(-r, r), c.y + rnd(-r, r), c.z + rnd(-r, r), 0, 0.3, 0); }
      k.vfx.pulse(c.x, c.y, c.z, FIRE, 2 + prog * 5);
    },
    fire(k) {
      k.player.model.play('push', BLOW);
      k.player.model.fight();
      playSfx('fire_cast', chest(k));
      k.at(BLOW, () => k.magic.shoot('pyre', k.front()));
    },
    end(k) { k.player.model.channel(false, 'gather'); },
  },
  {
    id: 'frost', name: 'Dardo di brina', icon: 'frost', mana: 22, cooldown: 0, charge: 8,
    get cast() { return tune.frostCast; },
    get desc() { return `Un dardo dell'acqua gelata della laguna sul bersaglio: ${dmg(tune.frostDmg)} danni, e per 6 s lui e chi gli sta entro 3 m camminano del ${Math.round((1 - tune.frostSlow) * 100)}% più lenti. Muoverti interrompe il lancio.`; },
    check: (k) => k.magic.why(),
    during(k, prog, dt) {
      k.player.model.channel(true, 'gather');
      k.faceMark(dt);
      k.gather(frostMote, frostCore, prog, dt);
    },
    fire(k) {
      k.player.model.play('push', BLOW);
      k.player.model.fight();
      playSfx('frost_cast', chest(k));
      k.at(BLOW, () => k.magic.shoot('frost', k.front()));
    },
    end(k) { k.player.model.channel(false, 'gather'); },
  },
  {
    id: 'font', name: 'Acquasantiera gelata', icon: 'font', mana: 40, charge: 10,
    get cooldown() { return tune.fontCd * tune.cdr; },
    get desc() { return `L'acqua santa ghiaccia di colpo attorno a te: ${dmg(tune.fontDmg)} danni a chi è entro 5 m, che resta congelato sul posto per ${tune.fontRoot} s (meno sui più forti, e sempre meno se li congeli di nuovo).`; },
    fire(k) {
      k.player.model.play('spread', 0.15);
      k.player.model.fight();
      k.at(0.15, () => k.magic.font());
    },
  },
  baseBolt('lance', 'Stiletto di ghiaccio', 'frost_cast', (u) => `Uno stiletto di ghiaccio sul bersaglio: ${dmg(u.dmg)} danni, ${dmg(u.dmg * 3)} se è congelato, e per 2 s cammina del 25% più lento.${u.split ? ' Chi è congelato va in frantumi: metà dei danni a chi gli sta entro 3 m.' : ''}`),
  baseBolt('thorn', 'Spina di peste', 'bolt_cast', (u) => `Una spina marcia del lazzaretto sul bersaglio: ${dmg(u.dmg)} danni.`),
  baseBolt('umbra', "Strale d'ombra", 'bolt_cast', (u) => `Uno strale d'ombra sul bersaglio: ${dmg(u.dmg)} danni.`),
  baseBolt('ember', 'Tizzone', 'fire_cast', (u) => `Un tizzone dei ceri votivi sul bersaglio: ${dmg(u.dmg)} danni, e le braci schizzano ${u.split ? 'per metà su chi gli sta entro 2,5 m' : 'per un terzo su chi gli sta entro 2 m'}.`),
  baseBolt('spark', 'Folgore', 'zap', (u) => `Una folgore dalla punta delle dita sul bersaglio: ${dmg(u.dmg)} danni.`),
  baseBolt('smite', 'Castigo', 'bolt_cast', (u) => `Un raggio di luce del Redentore sul bersaglio: ${dmg(u.dmg)} danni.`),
  {
    id: 'caligo', name: 'Caligo gelato', icon: 'caligo', mana: 30, charge: 10,
    get cooldown() { return 6 * tune.cdr; },
    get desc() { return `Il caligo, la nebbia gelata della laguna, ti esce di bocca davanti a te fino a ${num(tune.caligoRange)} m: ${dmg(tune.caligoDmg)} danni, e chi colpisce cammina del 60% più lento per 5 s.${tune.caligoFreeze ? ' Chi era già rallentato resta congelato sul posto 2 s.' : ''}`; },
    fire(k) {
      k.player.model.play('push', 0.12);
      k.player.model.fight();
      playSfx('frost_nova', chest(k), { gain: -4 });
      k.at(0.12, () => k.magic.caligo());
    },
  },
  {
    id: 'chain', name: 'Catena di saette', icon: 'chain', mana: 35, charge: 12,
    get cooldown() { return 5 * tune.cdr; },
    get cast() { return tune.chainCast; },
    get desc() { return `Una saetta sul bersaglio: ${dmg(tune.chainDmg)} danni, poi salta di nemico in nemico (entro 8 m) per altre ${tune.chainHops} volte, un quarto più debole a ogni salto.${tune.fxStorm ? ' Chi sta in una nube di peste prende +50% e attira la catena (fino a 3 salti in più).' : ''} Muoverti interrompe il lancio.`; },
    check: (k) => k.magic.why(),
    during(k, prog, dt) {
      k.player.model.channel(true, 'gather');
      k.faceMark(dt);
      k.gather(voltSpark, { ...frostCore, color2: STORM }, prog, dt);
      const c = k.front();
      if (Math.random() < dt * (6 + prog * 20)) k.vfx.spawn(crackle, c.x + rnd(-0.3, 0.3), c.y + rnd(-0.3, 0.3), c.z + rnd(-0.3, 0.3));
    },
    fire(k) {
      k.player.model.play('push', BLOW);
      k.player.model.fight();
      k.at(BLOW, () => k.magic.chain(k.front()));
    },
    end(k) { k.player.model.channel(false, 'gather'); },
  },
  {
    id: 'toll', name: 'Rintocco del campanile', icon: 'toll', mana: 45, charge: 12,
    get cooldown() { return 18 * tune.cdr; },
    check: inSight, // no target: it falls ahead
    get desc() { return `Chiami il fulmine dal campanile: un segno si accende sotto il bersaglio (o 8 m davanti a te) e dopo un rintocco il fulmine cade, ${dmg(tune.tollDmg)} danni entro ${num(tune.tollR)} m e storditi per ${num(tune.tollStun)} s (meno sui più forti).`; },
    fire(k) {
      k.player.model.play('raise', 0.2);
      k.player.model.fight();
      playSfx('toll_bell', chest(k));
      k.at(0.2, () => k.magic.toll());
    },
  },
  // --- the new blows ---
  {
    id: 'leap', name: 'Balzo del sepolcro', icon: 'leap', mana: 30, charge: 10,
    get cooldown() { return tune.leapCd * tune.cdr; },
    get desc() { return `Un balzo fino a 12 m sul nemico (senza nemico, davanti a te): all'atterraggio ${dmg(tune.leapDmg)} danni entro ${num(tune.leapR)} m e un attimo di stordimento. I muri ti fermano.`; },
    check: (k) => (k.magic.dashing ? "Un'altra azione è in corso." : k.magic.reach('leap')),
    fire(k) {
      k.player.model.play('leap', 0.3);
      k.player.model.fight();
      playSfx('blink', chest(k), { gain: -4 });
      k.magic.go('leap');
    },
  },
  {
    id: 'whirl', name: "Turbine d'ossa", icon: 'whirl', mana: 35, charge: 10, mobile: true,
    get cooldown() { return 10 * tune.cdr; },
    get channel() { return { duration: tune.whirlTime, tick: 0.5 }; },
    get desc() { return `Per ${num(tune.whirlTime)} s giri su te stesso con la clava, anche correndo: ${dmg(tune.whirlDmg)} danni ogni mezzo secondo a chi è entro 3 m, e la clava che gira para il ${GUARD_CUT * 100}% dei colpi che subisci.${tune.fxFrostWhirl ? ' Gela chi colpisce (40% più lento) e fa il doppio a chi è congelato.' : ''}`; },
    during(k) {
      k.stats.guard = 0.1; // the whirling club parries
      k.player.model.channel(true, 'spin');
      k.player.model.fight();
      k.whirling();
    },
    fire(k) {
      k.magic.whirl();
      const p = k.player.pos;
      k.vfx.ring(tune.fxFrostWhirl ? snow : boneSpark, p.x, p.y + 1, p.z, 18, 1.6, 4, 0.5);
      k.vfx.decal(dustRing, p.x, p.y + 0.04, p.z);
      playSfx('whirl', chest(k));
    },
    end(k) { k.player.model.channel(false, 'spin'); k.whirling(true); },
  },
  {
    id: 'grace', name: 'Colpo di grazia', icon: 'grace', mana: 20, charge: 10,
    get cooldown() { return tune.graceCd * tune.cdr; },
    get desc() { return `Un fendente a due mani davanti a te: ${dmg(tune.graceDmg)} danni, che crescono con le ferite di ciascun nemico, fino a ${dmg(tune.graceDmg * (1 + tune.graceMul))} su chi è quasi morto.`; },
    fire(k) {
      k.player.model.play('execute', 0.15);
      k.player.model.fight();
      k.swingTrail(graceTrail, 0.3);
      playSfx('swing', chest(k), { variant: 2 });
      k.at(0.15, () => k.magic.grace());
    },
  },
  {
    id: 'charge', name: 'Carica del dannato', icon: 'charge', charge: 25,
    get cooldown() { return tune.chargeCd * tune.cdr; },
    get desc() { return `Ti scagli a testa bassa sul nemico tra 4 e 20 m: ${dmg(tune.chargeDmg)} danni e stordito per ${num(tune.chargeStun)} s (meno sui più forti). Riempie la barra della furia.`; },
    check: (k) => (k.magic.dashing ? "Un'altra azione è in corso." : k.magic.reach('charge')),
    fire(k) {
      k.player.model.fight();
      playSfx('blink', chest(k));
      k.magic.go('charge');
    },
  },
  // --- five a school: poison, the drain, fire, frost, lightning, holy (rules in grimoire.ts) ---
  {
    id: 'spit', name: 'Sputo di bile', icon: 'spit', mana: 18, cooldown: 0, charge: 6,
    get desc() { return `Istantaneo. Sputi sul bersaglio un grumo di bile: ${dmg(tune.spitDmg)} danni e ${tune.spitStacks === 1 ? 'una dose' : `${tune.spitStacks} dosi`} di veleno. Ogni dose fa ${dmg(tune.venomDps)} danni al secondo per 8 s, fino a ${tune.venomMax} dosi; una nuova le rinfresca tutte.`; },
    check: (k) => k.magic.why(),
    fire(k) {
      k.player.model.play('throw', BLOW);
      k.player.model.fight();
      playSfx('plague_cast', chest(k), { gain: -6 });
      k.at(BLOW, () => k.magic.shoot('venom', k.player.model.hand(new THREE.Vector3())));
    },
  },
  {
    id: 'untore', name: "Unguento dell'untore", icon: 'untore', mana: 30, charge: 10,
    get cooldown() { return 10 * tune.cdr; },
    get desc() { return `Come gli untori della peste del 1630: ungi il bersaglio, ${dmg(tune.untoreDmg)} danni, e il suo veleno (almeno 2 dosi) passa a ogni nemico che gli sta entro ${tune.untoreR} m.`; },
    check: (k) => k.magic.why(),
    fire(k) {
      k.player.model.play('throw', BLOW);
      k.player.model.fight();
      playSfx('plague_cast', chest(k));
      k.at(BLOW, () => k.magic.untore(k.front()));
    },
  },
  {
    id: 'miasma', name: 'Fiato della fossa', icon: 'miasma', mana: 45, charge: 12,
    get cooldown() { return tune.miasmaCd * tune.cdr; },
    get desc() { return `Esala il miasma delle fosse comuni: un anello di peste esplode da te, ${dmg(tune.miasmaDmg)} danni e ${tune.miasmaStacks} dosi di veleno a chi è entro ${tune.miasmaR} m.`; },
    fire(k) {
      k.player.model.play('slam', BLOW);
      k.player.model.fight();
      k.at(BLOW, () => k.magic.miasma());
    },
  },
  {
    id: 'fever', name: 'Febbre di palude', icon: 'fever', mana: 30, charge: 10,
    get cooldown() { return 15 * tune.cdr; },
    get desc() { return `La febbre delle barene: il bersaglio e chi gli sta entro ${tune.feverR} m prendono il ${Math.round(tune.feverK * 100)}% di danni in più da ogni colpo per 12 s (la metà sui più forti).`; },
    check: (k) => k.magic.why(),
    fire(k) {
      k.player.model.play('push', BLOW);
      k.player.model.fight();
      k.at(BLOW, () => k.magic.fever());
    },
  },
  {
    id: 'drain', name: "Risucchio d'anima", icon: 'drain', mana: 40, charge: 12,
    get cooldown() { return 8 * tune.cdr; },
    channel: { duration: 3, tick: 0.5 },
    get desc() { return `Canalizzato per 3 s: strappi l'anima al bersaglio (entro 25 m), ${dmg(tune.drainDmg)} danni ogni mezzo secondo, e ognuno ti cura del ${Math.round(tune.drainHeal * 100)}% della salute. Muoverti lo interrompe.`; },
    check: (k) => k.magic.why(25),
    during(k, _p, dt) {
      k.player.model.channel(true, 'gather');
      k.faceMark(dt);
    },
    fire(k) { k.magic.drain(k.front()); },
    end(k) { k.player.model.channel(false, 'gather'); },
  },
  {
    id: 'pillar', name: 'Colonna di fiamme', icon: 'pillar', mana: 50, cast: PILLAR_CAST, charge: 12,
    get cooldown() { return 10 * tune.cdr; },
    get desc() { return `Lancio di ${num(PILLAR_CAST)} s. Una colonna di fuoco sale dal pavimento sotto il bersaglio (o 8 m davanti a te): ${dmg(tune.pillarDmg)} danni entro ${num(tune.pillarR)} m, chi c'è brucia per 4 s e il pavimento arde. Muoverti interrompe il lancio.`; },
    check: inSight,
    during(k, prog, dt) {
      k.player.model.channel(true, 'gather');
      k.faceMark(dt);
      k.gather(pyreEmber, pyreCore, prog, dt);
    },
    fire(k) {
      k.player.model.play('raise', 0.2);
      k.player.model.fight();
      playSfx('fire_cast', chest(k));
      k.at(0.2, () => k.magic.pillar());
    },
    end(k) { k.player.model.channel(false, 'gather'); },
  },
  {
    id: 'cero', name: 'Cero funebre', icon: 'cero', mana: 30, charge: 8,
    get cooldown() { return 3 * tune.cdr; },
    get desc() { return `Istantaneo. Accendi un cero funebre nel bersaglio: brucia per 4 s (${dmg(tune.ceroDps)} danni al secondo), poi scoppia, ${dmg(tune.ceroDmg)} danni a chi è entro 4 m; se muore prima, scoppia subito.${tune.ceroChain ? ' Lo scoppio accende un cero in due dei nemici che colpisce.' : ''}`; },
    check: (k) => k.magic.why(),
    fire(k) {
      k.player.model.play('throw', BLOW);
      k.player.model.fight();
      playSfx('fire_cast', chest(k), { gain: -6 });
      k.at(BLOW, () => k.magic.cero(k.front()));
    },
  },
  {
    id: 'furnace', name: 'Fornace di Murano', icon: 'furnace', mana: 45, charge: 12,
    get cooldown() { return 14 * tune.cdr; },
    get desc() { return `Il soffio di una fornace dei vetrai davanti a te, fino a ${tune.furnaceRange} m: ${dmg(tune.furnaceDmg)} danni, e chi colpisce brucia ed è stordito per 2 s (meno sui più forti).`; },
    fire(k) {
      k.player.model.play('push', 0.12);
      k.player.model.fight();
      k.at(0.12, () => k.magic.furnace());
    },
  },
  {
    id: 'blizzard', name: 'Bufera di bora', icon: 'blizzard', mana: 55, charge: 12,
    get cooldown() { return 12 * tune.cdr; },
    channel: { duration: 4, tick: 0.5 },
    get desc() { return `Canalizzato per 4 s: la bora gelida soffia sul bersaglio (o 8 m davanti a te), ${dmg(tune.blizzardDmg)} danni ogni mezzo secondo a chi è entro ${num(tune.blizzardR)} m, rallentati del 50%. Muoverti la interrompe.`; },
    check: inSight,
    during(k) {
      if (!k.magic.blizzardAt) k.magic.blizzardStart();
      k.player.model.channel(true);
    },
    fire(k) { k.magic.blizzard(); },
    end(k) { k.player.model.channel(false); k.magic.blizzardAt = undefined; },
  },
  {
    id: 'orb', name: 'Globo di brina', icon: 'orb', mana: 50, charge: 12,
    get cooldown() { return 16 * tune.cdr; },
    get desc() { return `Scagli verso il bersaglio (o davanti a te) un globo di ghiaccio che rotola per 15 m a ${num(tune.orbSpeed)} m/s: ${dmg(tune.orbDmg)} danni ogni mezzo secondo a chi passa entro 3,5 m, rallentati del 40%; alla fine (o contro un muro) scoppia, ${dmg(40)} danni.`; },
    fire(k) {
      k.player.model.play('push', BLOW);
      k.player.model.fight();
      playSfx('frost_cast', chest(k));
      k.at(BLOW, () => k.magic.orb());
    },
  },
  {
    id: 'shield', name: 'Scudo di saette', icon: 'shield', mana: 40, charge: 10,
    get cooldown() { return 20 * tune.cdr; },
    get desc() { return `Per 20 s ${tune.shieldOrbs} saette ti girano attorno: ognuna fulmina il primo nemico che ti arriva entro 3 m, ${dmg(tune.shieldDmg)} danni (una al secondo al massimo).`; },
    fire(k) {
      k.magic.shield();
      k.player.model.play('spread', 0.2);
      const a = chest(k);
      k.vfx.burst(voltSpark, a.x, a.y, a.z, 30, 0.6, 4);
      k.vfx.pulse(a.x, a.y, a.z, STORM, 25);
      playSfx('zap', a);
    },
    active: (k) => k.magic.sparks > 0,
  },
  {
    id: 'rod', name: 'Parafulmine', icon: 'rod', mana: 45, charge: 12,
    get cooldown() { return 18 * tune.cdr; },
    get desc() { return `Pianti un parafulmine ai tuoi piedi: per ${tune.rodTime} s, ogni ${num(tune.rodEvery)} s fulmina il nemico più vicino entro 9 m che vede, ${dmg(tune.rodDmg)} danni.`; },
    fire(k) {
      k.player.model.play('slam', 0.15);
      k.player.model.fight();
      playSfx('toll_bell', chest(k), { gain: -10 });
      k.at(0.15, () => { k.magic.rod(); const p = k.player.pos; k.vfx.decal(tollShock, p.x, p.y + 0.05, p.z); k.vfx.burst(voltSpark, p.x, p.y + 1.5, p.z, 30, 0.3, 5, 2); });
    },
  },
  {
    id: 'squall', name: 'Burrasca', icon: 'squall', mana: 40, charge: 12,
    get cooldown() { return 15 * tune.cdr; },
    get desc() { return `Un colpo di tuono come una burrasca in laguna: ${dmg(tune.squallDmg)} danni a chi è entro ${tune.squallR} m, sbalzati via di 5 m (i più forti molto meno). I muri li fermano.`; },
    fire(k) {
      k.player.model.play('slam', BLOW);
      k.player.model.fight();
      k.at(BLOW, () => k.magic.squall());
    },
  },
  {
    id: 'judge', name: 'Giudizio del Redentore', icon: 'judge', mana: 25, charge: 10,
    get cooldown() { return tune.judgeCd * tune.cdr; },
    get desc() { return `Istantaneo. Il Redentore giudica anche i suoi: un martello di luce sul bersaglio, ${dmg(tune.judgeDmg)} danni.${tune.fxHolyFire ? ` Lo incendia (brucia 4 s), e su chi già brucia fa ${dmg(tune.judgeDmg * 1.5)}.` : ''}`; },
    check: (k) => k.magic.why(),
    fire(k) {
      k.player.model.play('push', BLOW);
      k.player.model.fight();
      playSfx('strike_cast', chest(k), { gain: -4 });
      k.at(BLOW, () => k.magic.shoot('judge', k.front()));
    },
  },
  {
    id: 'hallow', name: 'Terra consacrata', icon: 'hallow', mana: 40, charge: 10,
    get cooldown() { return 12 * tune.cdr; },
    get desc() { return `Consacri la terra attorno a te per 8 s: ${dmg(tune.hallowDps)} danni al secondo ai nemici entro ${num(tune.hallowR)} m, e finché ci stai sopra recuperi l'1% della salute al secondo.`; },
    fire(k) {
      k.player.model.play('slam', BLOW);
      k.player.model.fight();
      k.at(BLOW, () => k.magic.hallow());
    },
  },
  {
    id: 'hammer', name: 'Martello della penitenza', icon: 'hammer', mana: 30, charge: 10,
    get cooldown() { return tune.hammerCd * tune.cdr; },
    get desc() { return `Istantaneo. Scagli un martello d'oro sul bersaglio: ${dmg(30)} danni e stordito per ${tune.hammerStun} s (un terzo sui boss, e sempre meno se lo stordisci di nuovo).`; },
    check: (k) => k.magic.why(),
    fire(k) {
      k.player.model.play('throw', BLOW);
      k.player.model.fight();
      playSfx('swing', chest(k), { variant: 2 });
      k.at(BLOW, () => k.magic.shoot('hammer', k.player.model.hand(new THREE.Vector3())));
    },
  },
  {
    id: 'bubble', name: 'Aureola del redento', icon: 'bubble', mana: 60, offGcd: true,
    get cooldown() { return tune.bubbleCd * tune.cdr; },
    get desc() { return `Fuori dal tempo di recupero globale. Un'aureola d'oro ti avvolge: per 5 s nessun colpo può ferirti.`; },
    fire(k) {
      k.stats.immune = Math.max(k.stats.immune, 5);
      playSfx('ward', chest(k));
      k.player.model.play('scream', 0.25);
      const a = chest(k), v = k.vfx, y = k.player.pos.y + 0.05;
      v.decal(shockGold, a.x, y, a.z);
      v.ring(goldRune, a.x, a.y + 0.6, a.z, 12, 0.9, 0.8, 0.3);
      v.spawn(flareGold, a.x, a.y + 0.9, a.z);
      k.beam(a.x, y, a.z, GOLD, 1);
      v.pulse(a.x, a.y, a.z, GOLD, 30);
      k.system.notices.push({ kind: 'info', text: 'Immune a ogni danno' });
    },
    active: (k) => k.stats.immune > 0,
  },
  // Specials: locked until the charge bar around Caduta d'ossa is full; using one empties it.
  {
    id: 'strike', name: 'Sentenza del sepolcro', icon: 'strike', cooldown: 0, special: true,
    get desc() { return `Speciale (barra della furia piena). Una lancia d'ossa e ombra trafigge il bersaglio per ${dmg(tune.strikeDmg)} danni; senza bersaglio, il nemico più vicino davanti a te (entro ${STRIKE_RANGE} m).`; },
    check(k) {
      const m = k.strikeTarget(), p = k.player.pos;
      if (!m) return 'Nessun bersaglio.';
      if (!k.player.world.sees(p, m)) return 'Bersaglio non in vista.';
      if (Math.hypot(m.x - p.x, m.z - p.z) > STRIKE_RANGE) return 'Bersaglio fuori portata.';
    },
    fire(k) {
      const m = k.strikeTarget()!, p = k.player.pos, v = k.vfx;
      k.player.model.play('judgment', BLOW);
      playSfx('strike_cast', chest(k));
      k.player.model.fight();
      k.hurt?.((_x, _z, mob) => mob === m, tune.strikeDmg);
      // The smash runs along the floor to the mark, then the spear bursts out under it.
      const trail = v.ribbons.begin(groundTrail), d = Math.hypot(m.x - p.x, m.z - p.z);
      for (let s = 0; s <= 1.0001; s += 0.1) v.ribbons.push(trail, p.x + (m.x - p.x) * s, p.y + 0.15 + (m.y - p.y) * s, p.z + (m.z - p.z) * s);
      v.ribbons.end(trail);
      for (let s = 0; s < d; s += 0.8) v.spawn(violetSpark, p.x + (m.x - p.x) * s / d, p.y + 0.2, p.z + (m.z - p.z) * s / d, 0, rnd(1, 3), 0);
      k.at(BLOW, () => k.impale(m));
    },
  },
  {
    id: 'nova', name: 'Lamento della cripta', icon: 'nova', cooldown: 0, special: true,
    get desc() { return `Speciale (barra della furia piena). Un'onda di schegge d'ossa esplode da te: ${dmg(tune.novaDmg)} danni a tutti i nemici entro ${tune.novaR} m.`; },
    fire(k) {
      const p = k.player.pos;
      k.player.model.play('slam', BLOW);
      k.player.model.fight();
      k.hurt?.((x, z, mob) => Math.hypot(x - p.x, z - p.z) < tune.novaR && k.player.world.sees(p, mob), tune.novaDmg);
      k.at(BLOW, () => k.nova());
    },
  },
  {
    id: 'ward', name: 'Patto della tomba', icon: 'ward', cooldown: 0, special: true, offGcd: true,
    get desc() { return `Speciale (barra della furia piena), fuori dal tempo di recupero globale. Per ${tune.wardTime} s nessun colpo può ferirti.${tune.wardHeal ? ` Alla fine recuperi il ${tune.wardHeal * 100}% della salute.` : ''}`; },
    fire(k) {
      k.stats.immune = tune.wardTime;
      playSfx('ward', chest(k));
      k.player.model.play('scream', 0.25);
      const a = chest(k), v = k.vfx, y = k.player.pos.y + 0.05;
      v.decal(shockGold, a.x, y, a.z);
      v.burst(goldMote, a.x, a.y, a.z, 50, 0.6, 3, 1.5);
      v.spawn(flareGold, a.x, a.y + 0.3, a.z);
      k.beam(a.x, y, a.z, GOLD, 0.8);
      v.pulse(a.x, a.y, a.z, GOLD, 25);
      v.shake(0.15);
      k.system.notices.push({ kind: 'info', text: 'Immune a ogni danno' });
    },
    active: (k) => k.stats.immune > 0,
  },
  {
    id: 'mend', name: 'Preghiera di suffragio', icon: 'mend', mana: MEND.mana, charge: 5, cast: MEND.cast,
    cooldown: 0,
    get desc() { return `Reciti a mani alzate il suffragio dei morti e le anime del purgatorio ti ricuciono la carne: recuperi il ${MEND.heal * 100}% della salute. Lancio lungo: muoverti lo interrompe, e ogni colpo che subisci lo fa arretrare.`; },
    check: (k) => (k.stats.hp >= k.stats.hpMax ? 'Sei già in piena salute.' : undefined),
    during(k, prog, dt) {
      k.player.model.channel(true); // arms raised over the cast bar, as for the wisp
      const p = k.player.pos, v = k.vfx;
      for (let n = v.count(20 + prog * 50, dt); n > 0; n--) { // grave-light rising round the body into the hands
        const a = rnd(0, Math.PI * 2), r = rnd(0.5, 1.1);
        v.spawn(heal, p.x + Math.cos(a) * r, p.y + rnd(0, 0.4), p.z + Math.sin(a) * r, -Math.sin(a) * 0.8, rnd(1.2, 2.2), Math.cos(a) * 0.8);
      }
      for (let n = v.count(3 + 6 * prog, dt); n > 0; n--) v.spawn(healGlow, p.x + rnd(-0.3, 0.3), p.y + 2 + rnd(-0.1, 0.1), p.z + rnd(-0.3, 0.3), 0, 0.4, 0);
      if (Math.random() < dt * 2.5) v.decal(healRunes, p.x, p.y + 0.03, p.z);
    },
    fire(k) {
      const h = k.stats.heal(k.stats.hpMax * MEND.heal);
      playSfx('potion', chest(k));
      playSfx('ward', chest(k), { gain: -10 });
      k.healBurst(1.4);
      k.player.model.play('spread', 0.2);
      k.system.notices.push({ kind: 'heal', text: `+${Math.round(h)}` });
    },
    end(k) { k.player.model.channel(false); },
  },
  {
    id: 'potion', name: 'Fiala di linfa tombale', icon: 'potion', offGcd: true,
    get cooldown() { return tune.potionCd * tune.cdr; },
    get desc() { return `Fuori dal tempo di recupero globale. Ripristina il ${Math.round(tune.potion * 100)}% della salute e il ${Math.round(tune.potion * 100)}% del mana.`; },
    fire(k) {
      const s = k.stats, h = s.heal(s.hpMax * tune.potion);
      playSfx('potion', chest(k));
      s.restoreMana(s.manaMax * tune.potion);
      k.healBurst(1);
      k.system.notices.push({ kind: 'heal', text: `+${Math.round(h)}` });
    },
  },
];

for (const a of ABILITIES) a.school = SCHOOL[a.id]; // each school its own global cooldown

/** The starting bar: the primary attack fixed on the big button (slot 0), the potion fixed on its own (slot 9), the starting
 *  kit on the next slots, which on touch run from the bottom-left of the thumb arc up (ui/actionBar.ts RING). Every unlock
 *  takes the next free slot; the ability book (ui/book.ts) rearranges slots 1-8. */
export const BAR: (string | null)[] = ['fall', 'mend', null, null, null, null, null, null, null, 'potion'];
/** A new game's bar: the hero's base attack (levels.ts BASE_ATTACK) and his own kit (player/heroes.ts) ahead of the heal. */
export const barOf = (kit: readonly string[], main = 'fall'): (string | null)[] => [main, ...kit, 'mend', ...Array<null>(7 - kit.length).fill(null), 'potion'];
