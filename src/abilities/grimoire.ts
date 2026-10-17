// The rules of the fire, frost and lightning spells and the new blows, without their looks: bolts that home
// on their mark, burning floors, the burning on a foe, the chain of lightning, the bell tower's thunderbolt
// falling a beat after the call, the leap and the charge carrying the hero, the crowd control they lay
// (enemies/control.ts). The game's Forsaken kit (forsaken.ts) draws every one of them from `bolts`, `fires`,
// `tolls`, `dash` and the `events` they leave; scripts/balance.ts plays the same rules with no looks at all.
// No three.js here.
import type { World } from '../core/physics.ts';
import { FRIAR } from '../enemies/brain.ts';
import { chill, chilled, frozen, root, stun, type Control } from '../enemies/control.ts';
import type { Tune } from '../player/levels.ts';
import type { Mob } from '../ui/target.ts';

interface P { x: number; y: number; z: number }
export type BoltKind = 'pyre' | 'frost' | 'lance';
export interface Bolt { kind: BoltKind; x: number; y: number; z: number; to: Mob; speed: number; t: number; dmg: number }
export interface Fire { x: number; y: number; z: number; r: number; t: number; life: number; dps: number }
export interface Toll { x: number; y: number; z: number; t: number }
export interface Dash { kind: 'leap' | 'charge'; pts: P[]; len: number; t: number; total: number; to?: Mob }
/** Something the looks should show where it happened (`pts`: the chain's path, hand first). */
export type SpellEvent =
  | { type: 'pyre' | 'frost' | 'lance' | 'shatter' | 'thaw' | 'font' | 'toll' | 'leap' | 'charge' | 'grace' | 'fizzle' | 'wall'; x: number; y: number; z: number; big?: boolean; kind?: BoltKind }
  | { type: 'chain'; pts: P[] };

export const RANGE = 30; // m: bolts, the chain and the thunderbolt reach this far
const ARC = 0.5; // no target: the nearest foe within ~120° in front
const CHEST = 1.2; // m above the feet where bolts strike
const SPEED: Record<BoltKind, number> = { pyre: 14, frost: 20, lance: 34 };
const SPLASH = 0.5; // the fireball's share on its neighbours
const BURN = { t: 4, dps: 8 }; // the fireball sets its mark burning
const FIRE = { life: 4, dps: 12 }; // and the floor under it
const CHILL_T = 6;
const FONT_R = 5;
const SHATTER = { mul: 1.6, dmg: 30, r: 3 };
const LANCE_FROZEN = 3, LANCE_SPLIT = 0.5, LANCE_R = 3;
const HOP = 8; // m a saetta jumps
const HOP_FALL = 0.75; // each jump keeps this much of the damage
const STORM = 1.5; // Miasma elettrico on the clouded
const TOLL_DELAY = 0.6; // s from the call to the bolt
const LEAP = { range: 12, time: 0.55, stop: 1.2, stun: 1, over: 1.3 }; // over: m of wall, hive or bench a leap clears
const CHARGE = { min: 4, max: 20, speed: 24, stop: 1.3 };
const WHIRL_R = 3, WHIRL_CHILL = 0.6, WHIRL_FROZEN = 2;
const GRACE = { range: 3, arc: Math.cos(1.1) };

/** What the grimoire needs from whoever casts: the hero, the damage dealer, the foes, the plague clouds. */
export interface Host {
  player: { pos: P; facing: number; world: World };
  hurt?: (inside: (x: number, z: number, mob: Mob) => boolean, n: number) => void;
  aimed?: () => Mob | undefined;
  foes?: () => Iterable<Mob>;
  /** A plague cloud covers (x, z) (Miasma elettrico). */
  clouded?: (x: number, z: number) => boolean;
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

  /** A bolt from `from` (the casting hand) at the target; no target: it fizzles in the hand. */
  shoot(kind: BoltKind, from: P): void {
    const to = this.target();
    if (!to) { this.events.push({ type: 'fizzle', ...from }); return; }
    const t = this.tune, dmg = kind === 'pyre' ? t.pyreDmg : kind === 'frost' ? t.frostDmg : t.lanceDmg;
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
      this.burns.set(m, BURN.t);
      if (c) c.burn = BURN.t;
      this.fires.push({ ...at, r: t.pyreR * 0.8, t: FIRE.life, life: FIRE.life, dps: FIRE.dps });
      if (this.fires.length > 4) this.fires.shift();
      this.events.push({ type: 'pyre', ...at, big: true });
    } else if (b.kind === 'frost') {
      this.hit(m, b.dmg);
      if (c) chill(c, CHILL_T, t.frostSlow);
      this.events.push({ type: 'frost', ...at });
    } else {
      const shatter = !!c && frozen(c);
      this.hit(m, shatter ? b.dmg * LANCE_FROZEN : b.dmg);
      if (shatter && t.lanceSplit) for (const o of this.near(m, LANCE_R)) if (o !== m) this.hit(o, b.dmg * LANCE_FROZEN * LANCE_SPLIT);
      this.events.push({ type: shatter ? 'shatter' : 'lance', ...at, big: shatter });
    }
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
    const p = this.host.player.pos, f = this.host.player.facing, m = this.target();
    const k = m ? 1 : Math.max(0, this.host.player.world.ray(p.x, p.y + 1.2, p.z, p.x - Math.sin(f) * 8, p.y + 1.2, p.z - Math.cos(f) * 8) - 0.06); // no foe: 8 m ahead, short of a wall
    const at = m ? { x: m.x, y: m.y, z: m.z } : { x: p.x - Math.sin(f) * 8 * k, y: p.y, z: p.z - Math.cos(f) * 8 * k };
    this.tolls.push({ ...at, t: TOLL_DELAY });
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
    this.bolts.length = this.fires.length = this.tolls.length = 0;
    this.burns.clear();
    this.dash = undefined;
  }
}
