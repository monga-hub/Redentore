// The rules of the fire, frost and lightning spells and the new blows, without their looks: bolts that home
// on their mark, burning floors, the burning on a foe, the chain of lightning, the bell tower's thunderbolt
// falling a beat after the call, the leap and the charge carrying the hero, the crowd control they lay
// (enemies/control.ts); and the rest of the five a school: poison stacking on a foe and spreading, the fever,
// the drain, fire pillars, candles and the furnace, the blizzard and the rolling orb, the lightning shield,
// rods and the squall's knockback, the judgment, the consecrated ground and the hammer. The game's Forsaken kit
// (forsaken.ts) draws every one of them from `bolts`, `fires`, `tolls`, `pillars`, `orbs`, `rods`, `hallows`,
// `dash` and the `events` they leave; scripts/balance.ts plays the same rules with no looks at all.
// No three.js here.
import type { World } from '../core/physics.ts';
import { FRIAR } from '../enemies/brain.ts';
import { chill, chilled, expose, frozen, root, stun, type Control } from '../enemies/control.ts';
import type { Tune } from '../player/levels.ts';
import type { Mob } from '../ui/target.ts';

interface P { x: number; y: number; z: number }
/** The base attacks that fly are bolts too (lance and the five after it: levels.ts BASE_ATTACK). */
export type BaseBolt = 'lance' | 'thorn' | 'umbra' | 'ember' | 'spark' | 'smite';
export type BoltKind = 'pyre' | 'frost' | 'venom' | 'judge' | 'hammer' | BaseBolt;
export interface Bolt { kind: BoltKind; x: number; y: number; z: number; to: Mob; speed: number; t: number; dmg: number }
export const BASE_BOLTS: readonly BoltKind[] = ['lance', 'thorn', 'umbra', 'ember', 'spark', 'smite'];
export interface Fire { x: number; y: number; z: number; r: number; t: number; life: number; dps: number }
export interface Toll { x: number; y: number; z: number; t: number }
export interface Zone { x: number; y: number; z: number; r: number; t: number; life: number }
export interface Orb { x: number; y: number; z: number; dx: number; dz: number; left: number; tick: number }
export interface Rod { x: number; y: number; z: number; t: number; tick: number }
export interface Dash { kind: 'leap' | 'charge'; pts: P[]; len: number; t: number; total: number; to?: Mob }
/** Something the looks should show where it happened (`pts`: the chain's path, hand first). */
export type SpellEvent =
  | { type: 'pyre' | 'frost' | 'lance' | 'shatter' | 'thaw' | 'font' | 'toll' | 'leap' | 'charge' | 'grace' | 'fizzle' | 'wall'
      | 'venom' | 'judge' | 'hammer' | 'miasma' | 'fever' | 'pillar' | 'cero' | 'furnace' | 'blizzard' | 'orb' | 'squall' | 'hallow' | 'caligo' | 'base'; x: number; y: number; z: number; big?: boolean; kind?: BoltKind; r?: number; dir?: number }
  | Path<'chain' | 'zap' | 'drain' | 'spread'>;
type Path<T> = T extends string ? { type: T; pts: P[] } : never; // one member each, so a `type` check narrows

export const RANGE = 30; // m: bolts, the chain and the thunderbolt reach this far
const ARC = 0.5; // no target: the nearest foe within ~120° in front
const CHEST = 1.2; // m above the feet where bolts strike
const SPEED: Record<BoltKind, number> = { pyre: 14, frost: 20, lance: 34, venom: 22, judge: 30, hammer: 26, thorn: 30, umbra: 30, ember: 30, spark: 40, smite: 34 };
const SPLASH = 0.5; // the fireball's share on its neighbours
const BURN = { t: 4, dps: 8 }; // the fireball sets its mark burning
const FIRE = { life: 4, dps: 12 }; // and the floor under it
const CHILL_T = 6;
const FONT_R = 5;
const SHATTER = { mul: 1.6, dmg: 30, r: 3 };
const LANCE_FROZEN = 3, LANCE_SPLIT = 0.5, LANCE_R = 3;
const BASE_SPLIT = { k: 0.5, r: 2.5 }; // a base attack's splash upgrade
const CALIGO = { arc: Math.cos(0.8), slow: 5, k: 0.4, freeze: 2 };
const HOP = 8; // m a saetta jumps
const HOP_FALL = 0.75; // each jump keeps this much of the damage
const STORM = 1.5; // Miasma elettrico on the clouded
const TOLL_DELAY = 0.6; // s from the call to the bolt
export const LEAP = { range: 12, time: 0.55, stop: 1.2, stun: 1, over: 1.3 }; // over: m of wall, hive or bench a leap clears
export const CHARGE = { min: 4, max: 20, speed: 24, stop: 1.3 };
const WHIRL_R = 3, WHIRL_CHILL = 0.6, WHIRL_FROZEN = 2;
export const GRACE = { range: 3, arc: Math.cos(1.1) };
const VENOM_T = 8; // s a dose of poison lasts (a new dose refreshes them all)
const UNTORE_MIN = 2; // doses Unguento dell'untore passes on at least
const FEVER_T = 12;
const DRAIN_RANGE = 25;
const PILLAR_DELAY = 0.5;
const CERO = { t: 4, r: 4, chain: 2 };
const FURNACE = { arc: Math.cos(0.8), stun: 2 };
const BLIZZARD_CHILL = 0.5;
const ORB = { range: 15, r: 3.5, tick: 0.5, burst: 40, chill: 0.6 };
const SHIELD = { t: 20, r: 3, every: 1 };
const ROD = { r: 9, top: 2.6, max: 2 };
const SQUALL_PUSH = 5; // m, × the foe's resist
const HALLOW = { t: 8, heal: 0.01, max: 2 };
const HAMMER_DMG = 30;
const HOLY_FIRE = 1.5; // Giudizio ardente on the burning

/** What the grimoire needs from whoever casts: the hero, the damage dealer, the foes, the plague clouds. */
export interface Host {
  player: { pos: P; facing: number; world: World };
  hurt?: (inside: (x: number, z: number, mob: Mob) => boolean, n: number) => void;
  aimed?: () => Mob | undefined;
  foes?: () => Iterable<Mob>;
  /** A plague cloud covers (x, z) (Miasma elettrico, Miasma velenoso). */
  clouded?: (x: number, z: number) => boolean;
  /** The hero's health: the drain and the consecrated ground heal it. */
  stats?: { hpMax: number; heal(n: number): number; restoreMana?(n: number): void };
}

const alive = (m: Mob) => m.state !== 'dead' && m.state !== 'evade';
const flat = (a: P, b: P) => Math.hypot(a.x - b.x, a.z - b.z);
/** A foe's full health (Colpo di grazia reads how hurt it is). */
export const maxHp = (m: Mob) => ('kind' in m ? (m as unknown as { kind: { hp: number } }).kind.hp : FRIAR.hp);
const cc = (m: Mob): Control | undefined => m.cc;

export class Grimoire {
  bolts: Bolt[] = [];
  fires: Fire[] = [];
  tolls: Toll[] = [];
  dash?: Dash;
  pillars: Toll[] = []; // Colonna di fiamme, waiting to fall
  orbs: Orb[] = [];
  rods: Rod[] = [];
  hallows: Zone[] = [];
  /** Bufera di bora's spot while it is channelled. */
  blizzardAt?: P;
  /** Scudo di saette: charges left, s left, s to the next zap. */
  sparks = 0;
  sparkT = 0;
  private sparkCd = 0;
  /** Poison doses on each foe and s left; Cero funebre's candles (`child`: lit by another's burst, it won't spread). */
  readonly poisons = new Map<Mob, { n: number; t: number }>();
  readonly candles = new Map<Mob, { t: number; child: boolean }>();
  private seepT = 1;
  /** Since the looks last read them (forsaken.ts drains it every frame; the balance bench clears it). */
  events: SpellEvent[] = [];
  private burns = new Map<Mob, number>();
  private host: Host;
  private tune: Tune;

  constructor(host: Host, tune: Tune) {
    this.host = host;
    this.tune = tune;
  }

  /**
   * The selected target if alive, within `range` and in sight, else the nearest living foe in front and in
   * sight; none when the selected one is hidden behind a wall (WoW: "not in line of sight", see `why`).
   */
  target(range = RANGE): Mob | undefined {
    const p = this.host.player.pos, f = this.host.player.facing, fx = -Math.sin(f), fz = -Math.cos(f), w = this.host.player.world;
    const t = this.host.aimed?.();
    if (t && alive(t) && flat(t, p) <= range) return w.sees(p, t) ? t : undefined;
    let best: Mob | undefined, bd = range;
    for (const m of this.host.foes?.() ?? []) {
      const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
      if (alive(m) && d < bd && (d < 1 || (dx * fx + dz * fz) / d > ARC) && w.sees(p, m)) { bd = d; best = m; }
    }
    return best;
  }

  /** Why a targeted spell can't go now (no target, or the selected one out of sight), or undefined. */
  why(range = RANGE): string | undefined {
    if (this.target(range)) return undefined;
    const t = this.host.aimed?.(), p = this.host.player.pos;
    return t && alive(t) && flat(t, p) <= range ? 'Bersaglio non in vista.' : 'Nessun bersaglio.';
  }

  private hit(m: Mob, n: number): void {
    if (n > 0) this.host.hurt?.((_x, _z, o) => o === m, n);
  }
  /** Every living foe within `r` of `c` (feet) with no wall between them: blasts stop at walls. */
  private near(c: P, r: number): Mob[] {
    const out: Mob[] = [], w = this.host.player.world;
    for (const m of this.host.foes?.() ?? []) if (alive(m) && Math.hypot(m.x - c.x, m.z - c.z) < r && w.sees(c, m)) out.push(m);
    return out;
  }

  /** A bolt from `from` (the casting hand) at the target; no target: it fizzles in the hand. `third`: a base attack's third blow. */
  shoot(kind: BoltKind, from: P, third = false): void {
    const to = this.target();
    if (!to) { this.events.push({ type: 'fizzle', ...from }); return; }
    const t = this.tune, b = t.prim[kind];
    const dmg = b ? b.dmg * (third ? b.third : 1) : { pyre: t.pyreDmg, frost: t.frostDmg, venom: t.spitDmg, judge: t.judgeDmg, hammer: HAMMER_DMG }[kind as 'pyre'];
    this.bolts.push({ kind, x: from.x, y: from.y, z: from.z, to, speed: SPEED[kind], t: 0, dmg });
  }

  /** A bolt reaches its mark. */
  private land(b: Bolt): void {
    const m = b.to, t = this.tune, c = cc(m), at = { x: m.x, y: m.y, z: m.z };
    if (b.kind === 'pyre') {
      let dmg = b.dmg;
      if (t.fxShatter && c && chilled(c)) { // Frantumazione: the ice bursts under the fire
        dmg *= SHATTER.mul;
        c.slow = c.root = 0;
        for (const o of this.near(m, SHATTER.r)) if (o !== m) this.hit(o, SHATTER.dmg);
        this.events.push({ type: 'thaw', ...at });
      }
      this.hit(m, dmg);
      for (const o of this.near(m, t.pyreR)) if (o !== m) this.hit(o, b.dmg * SPLASH);
      this.ignite(m);
      this.floor(at, t.pyreR * 0.8);
      this.events.push({ type: 'pyre', ...at, big: true });
    } else if (b.kind === 'venom') {
      this.hit(m, b.dmg);
      this.envenom(m, t.spitStacks);
      this.events.push({ type: 'venom', ...at });
    } else if (b.kind === 'judge') {
      const burning = this.burns.has(m);
      this.hit(m, t.fxHolyFire && burning ? b.dmg * HOLY_FIRE : b.dmg);
      if (t.fxHolyFire) this.ignite(m);
      this.events.push({ type: 'judge', ...at, big: t.fxHolyFire && burning });
    } else if (b.kind === 'hammer') {
      this.hit(m, b.dmg);
      if (c) stun(c, t.hammerStun);
      this.events.push({ type: 'hammer', ...at, big: true });
    } else if (b.kind === 'frost') {
      this.hit(m, b.dmg);
      if (c) chill(c, CHILL_T, t.frostSlow);
      this.events.push({ type: 'frost', ...at });
    } else if (b.kind === 'lance') {
      const shatter = !!c && frozen(c), u = t.prim.lance;
      this.hit(m, shatter ? b.dmg * LANCE_FROZEN : b.dmg);
      if (shatter && u.split) for (const o of this.near(m, LANCE_R)) if (o !== m) this.hit(o, b.dmg * LANCE_FROZEN * LANCE_SPLIT);
      if (u.mana) this.host.stats?.restoreMana?.(u.mana);
      this.events.push({ type: shatter ? 'shatter' : 'lance', ...at, big: shatter });
    } else { // the other base attacks: the hit, the splash, mana back
      const u = t.prim[b.kind];
      this.hit(m, b.dmg);
      if (u.split) for (const o of this.near(m, BASE_SPLIT.r)) if (o !== m) this.hit(o, b.dmg * BASE_SPLIT.k);
      if (u.mana) this.host.stats?.restoreMana?.(u.mana);
      this.events.push({ type: 'base', ...at, kind: b.kind, big: u.split });
    }
  }

  /** `m` burns for BURN.t s (the look on its control too). */
  private ignite(m: Mob): void {
    this.burns.set(m, BURN.t);
    if (m.cc) m.cc.burn = BURN.t;
  }
  /** The floor at `at` burns for FIRE.life s; four at most, the oldest gives way. */
  private floor(at: P, r: number): void {
    this.fires.push({ x: at.x, y: at.y, z: at.z, r, t: FIRE.life, life: FIRE.life, dps: FIRE.dps });
    if (this.fires.length > 4) this.fires.shift();
  }
  /** The target's feet, or 8 m ahead short of a wall: where Rintocco, Colonna di fiamme and Bufera di bora come down. */
  private mark(): P {
    const p = this.host.player.pos, f = this.host.player.facing, m = this.target();
    if (m) return { x: m.x, y: m.y, z: m.z };
    const k = Math.max(0, this.host.player.world.ray(p.x, p.y + 1.2, p.z, p.x - Math.sin(f) * 8, p.y + 1.2, p.z - Math.cos(f) * 8) - 0.06);
    return { x: p.x - Math.sin(f) * 8 * k, y: p.y, z: p.z - Math.cos(f) * 8 * k };
  }

  // --- poison: Sputo di bile, Unguento dell'untore, Fiato della fossa, Febbre di palude ---

  /** Doses of poison on `m`. */
  venom(m: Mob): number {
    return this.poisons.get(m)?.n ?? 0;
  }
  /** `n` more doses on `m` (up to tune.venomMax), all of them refreshed. */
  envenom(m: Mob, n: number): void {
    const k = Math.min(this.tune.venomMax, this.venom(m) + n);
    if (k <= 0) return;
    this.poisons.set(m, { n: k, t: VENOM_T });
    if (m.cc) m.cc.poison = VENOM_T;
  }
  /** Unguento dell'untore: the target is hurt and its poison (UNTORE_MIN doses at least) passes to every foe near it. */
  untore(from: P): void {
    const m = this.target(), t = this.tune;
    if (!m) { this.events.push({ type: 'fizzle', ...from }); return; }
    const n = Math.max(UNTORE_MIN, this.venom(m)), pts: P[] = [{ x: m.x, y: m.y + CHEST, z: m.z }];
    this.hit(m, t.untoreDmg);
    this.envenom(m, n - this.venom(m));
    for (const o of this.near(m, t.untoreR)) if (o !== m) { this.envenom(o, n - this.venom(o)); pts.push({ x: o.x, y: o.y + CHEST, z: o.z }); }
    this.events.push({ type: 'spread', pts });
  }
  /** Fiato della fossa: a ring of miasma from the hero. */
  miasma(): void {
    const p = this.host.player.pos, t = this.tune;
    for (const m of this.near(p, t.miasmaR)) { this.hit(m, t.miasmaDmg); this.envenom(m, t.miasmaStacks); }
    this.events.push({ type: 'miasma', ...p, r: t.miasmaR });
  }
  /** Febbre di palude: the target and those round it take more from every hit for FEVER_T s. */
  fever(): void {
    const m = this.target(), t = this.tune;
    if (!m) return;
    for (const o of new Set([m, ...this.near(m, t.feverR)])) if (o.cc) expose(o.cc, FEVER_T, t.feverK);
    this.events.push({ type: 'fever', x: m.x, y: m.y, z: m.z, r: t.feverR });
  }

  // --- shadow: Risucchio d'anima ---

  /** One tick of the drain from `from` (the hands): the target hurt, the hero healed; false with no target in reach and sight. */
  drain(from: P): boolean {
    const m = this.target(DRAIN_RANGE), t = this.tune, s = this.host.stats;
    if (!m) return false;
    this.hit(m, t.drainDmg);
    s?.heal(s.hpMax * t.drainHeal);
    this.events.push({ type: 'drain', pts: [{ x: m.x, y: m.y + CHEST, z: m.z }, { ...from }] });
    return true;
  }

  // --- fire: Colonna di fiamme, Cero funebre, Fornace di Murano ---

  /** Colonna di fiamme: marked under the target, it falls PILLAR_DELAY s later. */
  pillar(): void {
    this.pillars.push({ ...this.mark(), t: PILLAR_DELAY });
  }
  private blaze(k: Toll): void {
    const t = this.tune;
    for (const m of this.near(k, t.pillarR)) { this.hit(m, t.pillarDmg); this.ignite(m); }
    this.floor(k, t.pillarR * 0.8);
    this.events.push({ type: 'pillar', x: k.x, y: k.y, z: k.z, r: t.pillarR, big: true });
  }
  /** Cero funebre: a candle lit in the target, burning CERO.t s before it bursts. */
  cero(from: P): void {
    const m = this.target();
    if (!m) { this.events.push({ type: 'fizzle', ...from }); return; }
    this.candles.set(m, { t: CERO.t, child: false });
  }
  private burst(m: Mob, child: boolean): void {
    const t = this.tune;
    let lit = 0;
    for (const o of this.near(m, CERO.r)) {
      this.hit(o, t.ceroDmg);
      if (t.ceroChain && !child && o !== m && lit < CERO.chain && !this.candles.has(o)) { this.candles.set(o, { t: CERO.t, child: true }); lit++; }
    }
    this.events.push({ type: 'cero', x: m.x, y: m.y, z: m.z, r: CERO.r, big: true });
  }
  /** Fornace di Murano: the furnace's breath in a cone ahead, burning and stunning. */
  furnace(): void {
    const h = this.host.player, p = h.pos, fx = -Math.sin(h.facing), fz = -Math.cos(h.facing), t = this.tune;
    for (const m of this.near(p, t.furnaceRange)) {
      const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
      if (d > 0.8 && (dx * fx + dz * fz) / d < FURNACE.arc) continue;
      this.hit(m, t.furnaceDmg);
      this.ignite(m);
      if (m.cc) stun(m.cc, FURNACE.stun);
    }
    this.events.push({ type: 'furnace', ...p, r: t.furnaceRange, dir: h.facing });
  }

  /** Caligo gelato: the frozen lagoon fog in a cone ahead, slowing; Caligo di gennaio freezes who was slowed already. */
  caligo(): void {
    const h = this.host.player, p = h.pos, fx = -Math.sin(h.facing), fz = -Math.cos(h.facing), t = this.tune;
    for (const m of this.near(p, t.caligoRange)) {
      const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
      if (d > 0.8 && (dx * fx + dz * fz) / d < CALIGO.arc) continue;
      this.hit(m, t.caligoDmg);
      if (!m.cc) continue;
      if (t.caligoFreeze && chilled(m.cc)) root(m.cc, CALIGO.freeze);
      chill(m.cc, CALIGO.slow, CALIGO.k);
    }
    this.events.push({ type: 'caligo', ...p, r: t.caligoRange, dir: h.facing });
  }

  // --- frost: Bufera di bora, Globo di brina ---

  /** Bufera di bora: where it blows, chosen as the channel starts. */
  blizzardStart(): void {
    this.blizzardAt = this.mark();
  }
  /** One gust: hurt and chill everyone in the storm. */
  blizzard(): void {
    const at = this.blizzardAt, t = this.tune;
    if (!at) return;
    for (const m of this.near(at, t.blizzardR)) { this.hit(m, t.blizzardDmg); if (m.cc) chill(m.cc, 2, BLIZZARD_CHILL); }
    this.events.push({ type: 'blizzard', ...at, r: t.blizzardR });
  }
  /** Globo di brina: rolls from the hero towards the target (or ahead) ORB.range m, stopping at a wall. */
  orb(): void {
    const h = this.host.player, p = h.pos, m = this.target();
    let dx = -Math.sin(h.facing), dz = -Math.cos(h.facing);
    if (m) { const d = Math.max(flat(m, p), 1e-3); dx = (m.x - p.x) / d; dz = (m.z - p.z) / d; }
    this.orbs.push({ x: p.x + dx * 0.8, y: p.y, z: p.z + dz * 0.8, dx, dz, left: ORB.range, tick: 0 });
  }
  private shatterOrb(o: Orb): void {
    for (const m of this.near(o, ORB.r)) { this.hit(m, ORB.burst); if (m.cc) chill(m.cc, 3, ORB.chill); }
    this.events.push({ type: 'orb', x: o.x, y: o.y, z: o.z, r: ORB.r, big: true });
  }

  // --- lightning: Scudo di saette, Parafulmine, Burrasca ---

  /** Scudo di saette: charges round the hero for SHIELD.t s. */
  shield(): void {
    this.sparks = this.tune.shieldOrbs;
    this.sparkT = SHIELD.t;
    this.sparkCd = 0;
  }
  /** A bolt of `n` from `from` at `m` (the shield, the rods): +50% on the clouded with Miasma elettrico. */
  private zap(from: P, m: Mob, n: number): void {
    this.hit(m, this.tune.fxStorm && this.host.clouded?.(m.x, m.z) ? n * STORM : n);
    this.events.push({ type: 'zap', pts: [from, { x: m.x, y: m.y + CHEST, z: m.z }] });
  }
  private nearest(c: P, r: number): Mob | undefined {
    let best: Mob | undefined, bd = r;
    for (const m of this.near(c, r)) { const d = flat(m, c); if (d < bd) { bd = d; best = m; } }
    return best;
  }
  /** Parafulmine at the hero's feet; ROD.max at once, the oldest gives way. */
  rod(): void {
    const p = this.host.player.pos;
    this.rods.push({ x: p.x, y: p.y, z: p.z, t: this.tune.rodTime, tick: 0.3 });
    if (this.rods.length > ROD.max) this.rods.shift();
  }
  /** Burrasca: a thunderclap round the hero, every foe thrown back (by its resist: the bosses barely budge). */
  squall(): void {
    const p = this.host.player.pos, t = this.tune, w = this.host.player.world;
    for (const m of this.near(p, t.squallR)) {
      this.hit(m, t.squallDmg);
      const d = Math.max(flat(m, p), 1e-3), dx = (m.x - p.x) / d, dz = (m.z - p.z) / d;
      for (let s = 0; s < SQUALL_PUSH * (m.cc?.resist ?? 1); s += 0.25) { // step by step: a wall, a ledge or the water stops it
        const x = m.x + dx * 0.25, z = m.z + dz * 0.25, g = w.groundAt(x, z, m.y + 0.6);
        if (g === -Infinity || Math.abs(g - m.y) > 0.6 || w.blocked(x, z, g)) break;
        m.x = x; m.z = z; m.y = g;
      }
    }
    this.events.push({ type: 'squall', ...p, r: t.squallR, big: true });
  }

  // --- holy: Terra consacrata (Giudizio and the hammer are bolts) ---

  /** Terra consacrata under the hero; HALLOW.max at once. */
  hallow(): void {
    const p = this.host.player.pos;
    this.hallows.push({ x: p.x, y: p.y, z: p.z, r: this.tune.hallowR, t: HALLOW.t, life: HALLOW.t });
    if (this.hallows.length > HALLOW.max) this.hallows.shift();
    this.events.push({ type: 'hallow', ...p, r: this.tune.hallowR });
  }

  /** Acquasantiera gelata: everyone round the hero is hurt and frozen in place. */
  font(): void {
    const p = this.host.player.pos, t = this.tune;
    for (const m of this.near(p, FONT_R)) { this.hit(m, t.fontDmg); if (m.cc) root(m.cc, t.fontRoot); }
    this.events.push({ type: 'font', ...p });
  }

  /** Catena di saette from `from`: the target, then the nearest not yet struck within HOP m, each jump weaker. */
  chain(from: P): void {
    const first = this.target();
    if (!first) { this.events.push({ type: 'fizzle', ...from }); return; }
    const t = this.tune, struck = new Set<Mob>(), pts: P[] = [{ ...from }];
    const storm = (m: Mob) => !!t.fxStorm && !!this.host.clouded?.(m.x, m.z);
    let m: Mob | undefined = first, dmg = t.chainDmg, extra = t.fxStorm ? 3 : 0, hops = t.chainHops;
    while (m) {
      struck.add(m);
      pts.push({ x: m.x, y: m.y + CHEST, z: m.z });
      this.hit(m, storm(m) ? dmg * STORM : dmg);
      const at: Mob = m;
      let next: Mob | undefined, bd = HOP;
      for (const o of this.near(at, HOP)) {
        const d = flat(o, at);
        if (!struck.has(o) && (d < bd || (storm(o) && !(next && storm(next))))) { bd = d; next = o; }
      }
      if (!next) break;
      if (hops > 0) hops--;
      else if (extra > 0 && storm(next)) extra--; // Miasma elettrico: the clouded draw the bolt on
      else break;
      dmg *= HOP_FALL;
      m = next;
    }
    this.events.push({ type: 'chain', pts });
  }

  /** Rintocco del campanile: a mark on the target's floor (or 8 m ahead), struck TOLL_DELAY s later. */
  toll(): void {
    this.tolls.push({ ...this.mark(), t: TOLL_DELAY });
  }

  private strike(k: Toll): void {
    const t = this.tune;
    for (const m of this.near(k, t.tollR)) {
      this.hit(m, t.fxStorm && this.host.clouded?.(m.x, m.z) ? t.tollDmg * STORM : t.tollDmg);
      if (m.cc) stun(m.cc, t.tollStun);
    }
    this.events.push({ type: 'toll', x: k.x, y: k.y, z: k.z, big: true });
  }

  /** Why a leap or a charge can't go now (no foe in reach), or undefined. */
  reach(kind: 'leap' | 'charge'): string | undefined {
    const t = this.host.aimed?.(), p = this.host.player.pos;
    if (kind === 'leap') return t && alive(t) && flat(t, p) <= LEAP.range && !this.host.player.world.sees(p, t) ? 'Bersaglio non in vista.' : undefined; // a leap without a foe goes ahead
    const m = this.target(CHARGE.max);
    if (!m) return this.why(CHARGE.max);
    if (flat(m, p) < CHARGE.min) return 'Troppo vicino.';
  }

  /** Carry the hero to the foe (or LEAP.range ahead), stopping short of it and of the first wall. */
  go(kind: 'leap' | 'charge'): void {
    const h = this.host.player, p = h.pos, m = this.target(kind === 'leap' ? LEAP.range : CHARGE.max);
    let dx = -Math.sin(h.facing), dz = -Math.cos(h.facing), want = LEAP.range * 0.6;
    if (m) {
      const d = flat(m, p);
      dx = (m.x - p.x) / Math.max(d, 1e-3); dz = (m.z - p.z) / Math.max(d, 1e-3);
      want = Math.max(0, d - (kind === 'leap' ? LEAP.stop : CHARGE.stop));
      h.facing = Math.atan2(-dx, -dz);
    }
    // The way, every 0.2 m: a charge slides along what stands in it (a hive, a bench, a wall's corner) and
    // stops when it can't get on; a leap clears anything lower than LEAP.over and needs only a free landing.
    const w = h.world, leap = kind === 'leap', q = { x: p.x, z: p.z }, pts: P[] = [{ x: p.x, y: p.y, z: p.z }];
    let d = 0, y = p.y;
    const ex = p.x + dx * want, ez = p.z + dz * want; // where it means to end
    while (d + 0.2 <= want + 1.5 && Math.hypot(ex - q.x, ez - q.z) > 0.15) {
      const x0 = q.x, z0 = q.z, a0 = Math.atan2(ez - q.z, ex - q.x), lift = leap ? LEAP.over : 0;
      const turn = [0, 0.5, -0.5, 1, -1, 1.57, -1.57].find((t) => !w.blocked(x0 + Math.cos(a0 + t) * 0.2, z0 + Math.sin(a0 + t) * 0.2, y + lift)); // round a hive or a bench
      if (turn === undefined || (leap && turn !== 0)) break;
      q.x = x0 + Math.cos(a0 + turn) * 0.2; q.z = z0 + Math.sin(a0 + turn) * 0.2;
      const g = w.groundAt(q.x, q.z, y + (leap ? LEAP.over : 0.6));
      if (g === -Infinity || Math.abs(g - y) > (leap ? LEAP.over : 1.5)) { q.x = x0; q.z = z0; break; }
      y = g;
      d += 0.2;
      pts.push({ x: q.x, y, z: q.z });
    }
    while (leap && pts.length > 1 && w.blocked(pts[pts.length - 1].x, pts[pts.length - 1].z, pts[pts.length - 1].y)) pts.pop(); // land clear
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    const total = leap ? LEAP.time : Math.max(0.15, len / CHARGE.speed);
    this.dash = { kind, pts, len, t: 0, total, to: m };
  }

  /** Where a dash is `u` (0..1) of the way along its path. */
  private along(k: Dash, u: number, out: P): P {
    let left = u * k.len;
    for (let i = 1; i < k.pts.length; i++) {
      const a = k.pts[i - 1], b = k.pts[i], l = Math.hypot(b.x - a.x, b.z - a.z);
      if (left <= l || i === k.pts.length - 1) {
        const f = l > 0 ? Math.min(1, left / l) : 1;
        out.x = a.x + (b.x - a.x) * f; out.y = a.y + (b.y - a.y) * f; out.z = a.z + (b.z - a.z) * f;
        return out;
      }
      left -= l;
    }
    out.x = k.pts[0].x; out.y = k.pts[0].y; out.z = k.pts[0].z;
    return out;
  }

  get dashing(): boolean {
    return !!this.dash;
  }

  private arrive(k: Dash): void {
    const t = this.tune, p = this.host.player.pos;
    if (k.kind === 'leap') {
      for (const m of this.near(p, t.leapR)) { this.hit(m, t.leapDmg); if (m.cc) stun(m.cc, LEAP.stun); }
      this.events.push({ type: 'leap', ...p, big: true });
    } else {
      const m = k.to && alive(k.to) && flat(k.to, p) < CHARGE.stop + 1.5 ? k.to : undefined;
      if (m) { this.hit(m, t.chargeDmg); if (m.cc) stun(m.cc, t.chargeStun); }
      this.events.push({ type: 'charge', x: m?.x ?? p.x, y: (m?.y ?? p.y), z: m?.z ?? p.z, big: !!m });
    }
  }

  /** Turbine d'ossa, one tick: everyone within WHIRL_R (Turbine di brina chills them, the frozen take double). */
  whirl(): void {
    const p = this.host.player.pos, t = this.tune;
    for (const m of this.near(p, WHIRL_R)) {
      const c = m.cc;
      this.hit(m, t.fxFrostWhirl && c && frozen(c) ? t.whirlDmg * WHIRL_FROZEN : t.whirlDmg);
      if (t.fxFrostWhirl && c) chill(c, 2, WHIRL_CHILL);
    }
  }

  /** Colpo di grazia: a two-handed cleave in front, harder the more each foe is already hurt. */
  grace(): void {
    const h = this.host.player, p = h.pos, fx = -Math.sin(h.facing), fz = -Math.cos(h.facing), t = this.tune;
    let any = false;
    for (const m of this.near(p, GRACE.range)) {
      const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
      if (d > 0.6 && (dx * fx + dz * fz) / d < GRACE.arc) continue;
      const missing = 1 - Math.max(0, m.hp) / maxHp(m);
      this.hit(m, t.graceDmg * (1 + t.graceMul * missing));
      any = true;
    }
    this.events.push({ type: 'grace', x: p.x + fx * 1.6, y: p.y, z: p.z + fz * 1.6, big: any });
  }

  update(dt: number): void {
    const p = this.host.player.pos;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i], m = b.to;
      b.t += dt;
      const dx = m.x - b.x, dy = m.y + CHEST - b.y, dz = m.z - b.z, d = Math.hypot(dx, dy, dz), s = b.speed * dt;
      if (d <= Math.max(s, 0.4)) { this.bolts.splice(i, 1); if (alive(m)) this.land(b); else this.events.push({ type: 'fizzle', x: b.x, y: b.y, z: b.z }); continue; }
      if (b.t > 4) { this.bolts.splice(i, 1); this.events.push({ type: 'fizzle', x: b.x, y: b.y, z: b.z }); continue; }
      const nx = b.x + (dx / d) * s, ny = b.y + (dy / d) * s, nz = b.z + (dz / d) * s;
      const wall = this.host.player.world.ray(b.x, b.y, b.z, nx, ny, nz);
      if (wall < 1) { // it bursts on the wall: no curving round it, no passing through
        b.x += (nx - b.x) * wall; b.y += (ny - b.y) * wall; b.z += (nz - b.z) * wall;
        this.bolts.splice(i, 1);
        this.events.push({ type: 'wall', x: b.x, y: b.y, z: b.z, kind: b.kind, big: b.kind === 'pyre' });
        continue;
      }
      b.x = nx; b.y = ny; b.z = nz;
    }
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      this.host.hurt?.((x, z, m) => Math.hypot(x - f.x, z - f.z) < f.r && this.host.player.world.sees(f, m), f.dps * dt);
      if ((f.t -= dt) <= 0) this.fires.splice(i, 1);
    }
    for (const [m, t] of this.burns) {
      if (!alive(m) || t <= dt) { this.burns.delete(m); if (m.cc) m.cc.burn = 0; continue; }
      this.burns.set(m, t - dt);
      this.hit(m, BURN.dps * dt);
    }
    for (let i = this.tolls.length - 1; i >= 0; i--) if ((this.tolls[i].t -= dt) <= 0) this.strike(this.tolls.splice(i, 1)[0]);
    for (let i = this.pillars.length - 1; i >= 0; i--) if ((this.pillars[i].t -= dt) <= 0) this.blaze(this.pillars.splice(i, 1)[0]);
    const t = this.tune, w = this.host.player.world;
    for (const [m, v] of this.poisons) {
      if (!alive(m) || v.t <= dt) { this.poisons.delete(m); if (m.cc) m.cc.poison = 0; continue; }
      v.t -= dt;
      this.hit(m, v.n * t.venomDps * dt);
    }
    if (t.fxVenomCloud && (this.seepT -= dt) <= 0) { // Miasma velenoso: a dose a second in the clouds
      this.seepT = 1;
      for (const m of this.host.foes?.() ?? []) if (alive(m) && this.host.clouded?.(m.x, m.z)) this.envenom(m, 1);
    }
    for (const [m, c] of this.candles) {
      if (alive(m)) this.hit(m, t.ceroDps * Math.min(dt, c.t));
      if ((c.t -= dt) <= 0 || !alive(m)) { this.candles.delete(m); this.burst(m, c.child); }
    }
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i], s = Math.min(t.orbSpeed * dt, o.left), nx = o.x + o.dx * s, nz = o.z + o.dz * s;
      const g = w.groundAt(nx, nz, o.y + 0.8);
      if (w.ray(o.x, o.y + 1, o.z, nx, o.y + 1, nz) < 1 || g === -Infinity || Math.abs(g - o.y) > 0.8) { this.orbs.splice(i, 1); this.shatterOrb(o); continue; }
      o.x = nx; o.z = nz; o.y = g; o.left -= s;
      if ((o.tick -= dt) <= 0) {
        o.tick += ORB.tick;
        for (const m of this.near(o, ORB.r)) { this.hit(m, t.orbDmg); if (m.cc) chill(m.cc, 2, ORB.chill); }
      }
      if (o.left <= 0) { this.orbs.splice(i, 1); this.shatterOrb(o); }
    }
    if (this.sparks > 0) {
      this.sparkCd -= dt;
      if ((this.sparkT -= dt) <= 0) this.sparks = 0;
      else if (this.sparkCd <= 0) {
        const m = this.nearest(p, SHIELD.r);
        if (m) { this.zap({ x: p.x, y: p.y + CHEST, z: p.z }, m, t.shieldDmg); this.sparks--; this.sparkCd = SHIELD.every; }
      }
    }
    for (let i = this.rods.length - 1; i >= 0; i--) {
      const r = this.rods[i];
      if ((r.tick -= dt) <= 0) {
        r.tick += t.rodEvery;
        const m = this.nearest(r, ROD.r);
        if (m) this.zap({ x: r.x, y: r.y + ROD.top, z: r.z }, m, t.rodDmg);
      }
      if ((r.t -= dt) <= 0) this.rods.splice(i, 1);
    }
    for (let i = this.hallows.length - 1; i >= 0; i--) {
      const z = this.hallows[i];
      this.host.hurt?.((x, zz, m) => Math.hypot(x - z.x, zz - z.z) < z.r && w.sees(z, m), t.hallowDps * dt);
      const s = this.host.stats;
      if (s && Math.hypot(p.x - z.x, p.z - z.z) < z.r && Math.abs(p.y - z.y) < 1.5) s.heal(s.hpMax * HALLOW.heal * dt);
      if ((z.t -= dt) <= 0) this.hallows.splice(i, 1);
    }
    const k = this.dash;
    if (k) {
      const u = Math.min(1, (k.t += dt) / k.total);
      this.along(k, u, p);
      if (k.kind === 'leap') p.y += Math.sin(u * Math.PI) * 2.2;
      if (u >= 1) { this.dash = undefined; this.arrive(k); }
    }
  }

  /** The hero fell: whatever was flying or burning is gone. */
  reset(): void {
    this.bolts.length = this.fires.length = this.tolls.length = this.pillars.length = this.orbs.length = this.rods.length = this.hallows.length = 0;
    this.burns.clear();
    this.poisons.clear();
    this.candles.clear();
    this.sparks = 0;
    this.blizzardAt = undefined;
    this.dash = undefined;
  }
}
