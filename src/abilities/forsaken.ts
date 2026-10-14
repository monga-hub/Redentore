import * as THREE from 'three';
import { playSfx } from '../audio/engine.ts';
import type { PlayerController } from '../player/controller.ts';
import { VEIL_CUT, type PlayerStats } from '../player/stats.ts';
import { START, tuneOf, type Tune } from '../player/levels.ts';
import type { Mob } from '../ui/target.ts';
import { AbilitySystem, loadBar, type Ability } from './system.ts';
import { D, T, Vfx, type Decal, type DecalStyle, type RibbonStyle, type Style } from './vfx.ts';

// The Forsaken kit: six abilities and a potion, plus three specials that unlock when the charge
// bar fills (system.ts). Names are our own; flavour after the undead racials and shadow/plague classes.
// The run starts with Caduta d'ossa, Nube di peste and the potion; level-ups (player/levels.ts) unlock
// the rest and change the numbers, which every ability reads live from `tune` (tooltips too).
// Each one has its own clip on the Reietto (player/undead.ts) and layered effects (vfx.ts); a
// blow's effects land with the clip's blow, `BLOW` s after the press, while the damage stays
// instant as before.

const VIOLET = 0xa45cff, SHADOW = 0x1a0f24, PLAGUE = 0x7dff3a, BILE = 0x1f2e0c, WISP = 0x8dffe0;
const GOLD = 0xffc85a, GHOST = 0x9fc4ff, GRAVE = 0x58ff9a, BONE = 0xefe6d2, DUST = 0x4a4038, ABYSS = 0x0b0710;

/** Damage, ranges, times and cooldowns the level-up cards change: the picks so far (main.ts lays them on). */
export const tune: Tune = tuneOf([]);
const PLAGUE_RADIUS = 2.2, PLAGUE_RANGE = 20, PLAGUE_REACH = 6; // m: cloud size (looks; the live one is tune.plagueR), reach for a foe, throw with none
const PLAGUE_POOLS = 6; // clouds at once; past that the oldest gives way
const FUSION_CLOUD = 4; // s a cloud sown by a fusion lasts
const WISP_MOVING = 0.6, WISP_REACH = 10, WISP_ORBIT = 0.7; // m/s: the wisp only scorches while it drifts; m: it goes for foes this near, circling them this close
const STRIKE_RANGE = 30, STRIKE_ARC = 0.5; // no target: nearest foe within ~120° in front
const NOVA_RADIUS = 6; // m, the looks' shock wave
const BLOW = 0.1; // s from the press to the clip's blow (swings, slams)
const COMBO = 1.1; // s: a swing this soon after the last one carries the combo on
const GLOB = 0.28; // s the plague glob flies (cosmetic: the cloud is there at the press)

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

interface Cloud { x: number; y: number; z: number; t: number; life: number; pool: Decal }
interface Glob { ax: number; ay: number; az: number; bx: number; by: number; bz: number; t: number; trail: number; cloud: Cloud }
interface Later { t: number; f: () => void }

export class Forsaken {
  readonly vfx = new Vfx();
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

  constructor(player: PlayerController, stats: PlayerStats) {
    this.player = player;
    this.stats = stats;
    this.system = new AbilitySystem(ABILITIES, loadBar(BAR), this, START);
    this.system.pool = stats;
    const v = this.vfx;
    this.pools = Array.from({ length: PLAGUE_POOLS }, () => v.hold(pool));
    this.runes = v.hold(wispRunes);
    this.swirl = v.hold(wispSwirl);
    this.sigil = v.hold(sigil);
    this.veilFloor = v.hold(ghostFloor);
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
      this.hurt?.((x, z) => Math.hypot(x - c.x, z - c.z) < R, tune.plagueDps * dt);
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
    const p = this.player.pos, f = this.player.facing, foe = wispFoe(p, this.aimed?.(), this.foes?.() ?? []);
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

  // --- helpers the ability table uses ---

  /** Caduta d'ossa's swing: the next step of the combo, its arc and its blow. */
  swingCombo(): void {
    const step = this.comboT < COMBO ? (this.combo + 1) % 3 : 0;
    this.combo = step;
    this.comboT = 0;
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
    const { x, y, z } = at ?? plagueSpot(this.player.pos, this.player.facing, this.aimed?.(), this.foes?.() ?? []);
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
      if (m.state !== 'dead' && d < bestD && (d < 1 || (dx * fx + dz * fz) / d > STRIKE_ARC)) { bestD = d; best = m; }
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
export function wispFoe(p: { x: number; z: number }, aimed: Mob | undefined, foes: Iterable<Mob>): Mob | undefined {
  const fighting = (m: Mob) => m.state !== 'dead' && m.state !== 'pray' && m.state !== 'hoe' && m.state !== 'evade' && Math.hypot(m.x - p.x, m.z - p.z) < WISP_REACH;
  if (aimed && fighting(aimed)) return aimed;
  let best: Mob | undefined, bd = Infinity;
  for (const m of foes) { const d = Math.hypot(m.x - p.x, m.z - p.z); if (fighting(m) && d < bd) { bd = d; best = m; } }
  return best;
}

/**
 * Where Nube di peste lands: on the selected target if it is alive and within reach, else on the
 * nearest living foe within reach, else on the ground ahead, far enough that the caster stays out of it.
 */
export function plagueSpot(p: { x: number; y: number; z: number }, facing: number, aimed: Mob | undefined, foes: Iterable<Mob>): { x: number; y: number; z: number } {
  const near = (m: Mob) => m.state !== 'dead' && Math.hypot(m.x - p.x, m.z - p.z) <= PLAGUE_RANGE;
  let best = aimed && near(aimed) ? aimed : undefined;
  if (!best) {
    let bestD = Infinity;
    for (const m of foes) {
      const d = Math.hypot(m.x - p.x, m.z - p.z);
      if (near(m) && d < bestD) { bestD = d; best = m; }
    }
  }
  if (best) return { x: best.x, y: best.y, z: best.z };
  return { x: p.x - Math.sin(facing) * PLAGUE_REACH, y: p.y, z: p.z - Math.cos(facing) * PLAGUE_REACH };
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
    id: 'fall', name: "Caduta d'ossa", icon: 'fall', cooldown: 0.3, offGcd: true, charge: 3,
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
      k.hurt?.((x, z) => {
        const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
        const ok = d < tune.fallRange && (d < 0.6 || (dx * fx + dz * fz) / d > tune.fallArc);
        if (ok) hit++;
        return ok;
      }, third ? tune.fallDmg * tune.fallThird : tune.fallDmg);
      if (hit && tune.fallMana) k.stats.restoreMana(tune.fallMana);
      if (third && tune.fxFall) k.sowFall();
    },
  },
  // Specials: locked until the charge bar around Caduta d'ossa is full; using one empties it.
  {
    id: 'strike', name: 'Sentenza del sepolcro', icon: 'strike', cooldown: 0, special: true,
    get desc() { return `Speciale (barra della furia piena). Una lancia d'ossa e ombra trafigge il bersaglio per ${dmg(tune.strikeDmg)} danni; senza bersaglio, il nemico più vicino davanti a te (entro ${STRIKE_RANGE} m).`; },
    check(k) {
      const m = k.strikeTarget(), p = k.player.pos;
      if (!m) return 'Nessun bersaglio.';
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
      k.hurt?.((x, z) => Math.hypot(x - p.x, z - p.z) < tune.novaR, tune.novaDmg);
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
    id: 'potion', name: 'Fiala di linfa tombale', icon: 'potion', offGcd: true,
    get cooldown() { return tune.potionCd * tune.cdr; },
    get desc() { return `Fuori dal tempo di recupero globale. Ripristina il ${tune.potion * 100}% della salute e il ${tune.potion * 100}% del mana.`; },
    fire(k) {
      const s = k.stats, h = s.heal(s.hpMax * tune.potion);
      playSfx('potion', chest(k));
      s.restoreMana(s.manaMax * tune.potion);
      const p = k.player.pos, v = k.vfx;
      for (let i = 0; i < 64; i++) { // two strands winding up the body
        const t = i / 64, a = t * Math.PI * 6 + (i % 2) * Math.PI, r = 0.75 - t * 0.35;
        v.spawn(heal, p.x + Math.cos(a) * r, p.y + t * 2, p.z + Math.sin(a) * r, -Math.sin(a) * 1.4, 1.4, Math.cos(a) * 1.4);
      }
      v.burst(healStar, p.x, p.y + 1, p.z, 8, 0.6, 0.6);
      v.burst(healGlow, p.x, p.y + 0.6, p.z, 5, 0.4, 0.4);
      v.decal(healRing, p.x, p.y + 0.05, p.z);
      v.decal(healRunes, p.x, p.y + 0.04, p.z);
      v.pulse(p.x, p.y + 1, p.z, GRAVE, 18);
      k.system.notices.push({ kind: 'heal', text: `+${Math.round(h)}` });
    },
  },
];

/** Slot order on the bar; 0 - = stay free for later items. */
export const BAR: (string | null)[] = ['fall', 'plague', 'wisp', 'strike', 'nova', 'veil', 'step', 'ward', 'potion', null, null, null];
