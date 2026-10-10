// Undead priest AI, WoW caster-mob style: stand in prayer in a cloister until the player comes
// into sight, pull the group, then cast shadow bolts from range on a cooldown, backpedalling
// when the player closes in, never leaving their cloister; evade home at full health if the
// player gets away. Pure math on the collision World like brain.ts (friars), whose movement
// helpers it shares; priests.ts puts models and spell effects on top.
import type { World } from '../core/physics.ts';
import { face, feet, walk, type Target } from './brain.ts';

export const PRIEST = {
  hp: 50, // casters are squishy: five bone slashes
  aggro: 12, // m, and in line of sight
  leash: 26, // m between the player and the priest's spot before it gives up and evades
  blind: 6, // s without line of sight while pulled before evading
  range: 17, // m: casts from inside this
  keep: 6, // m: closer than this the priest backpedals...
  backoff: 2, // ...for at most this long between two casts, then casts point-blank
  speed: 3.2, // approach m/s
  back: 2.4, // backpedal m/s, well under the player's 6
  walk: 5, // evade m/s (immune meanwhile)
  cast: 1.6, // s cast time; breaking line of sight meanwhile interrupts it
  cooldown: 2.4, // s after a cast before the next one starts
  bolt: 13, // m/s, homing like a WoW shadow bolt
  life: 4, // s before a bolt that never reached the player fizzles out
  damage: 30, // magic, per bolt: a group of three ~22 dps against the player's 1280 hp
  radius: 0.4,
  respawn: 60,
  margin: 0.8, // m kept from the cloister's walls
};
const LOS_EVERY = 0.25; // s: tracing a ray through the cloister costs ~0.2 ms
const CHEST = 1.1; // m above the feet: where bolts leave the staff and strike the player

export type CasterState = 'pray' | 'chase' | 'cast' | 'evade' | 'dead';

export interface Bounds { x0: number; x1: number; z0: number; z1: number }

export interface Priest {
  x: number; y: number; z: number;
  yaw: number; // 0 faces -Z
  hp: number;
  state: CasterState;
  t: number; // s in the current state
  cd: number; // cast cooldown left
  backoff: number; // backpedal budget left until the next cast
  blind: number; // s pulled without line of sight
  los: { ok: boolean; t: number }; // line of sight to the player, re-traced every LOS_EVERY s
  move: -1 | 0 | 1; // backpedalling, standing, walking forward (for the animation)
  home: { x: number; z: number; yaw: number };
  bounds: Bounds; // the cloister: never leaves it
  mates: Priest[];
}

export interface Bolt {
  x: number; y: number; z: number;
  t: number;
  hit: boolean; // struck the player (set by fly, for the impact effect)
}

/** The cloisters, by area label: the arcaded courts of the convent zone. */
export const isCloister = (label: string) => /^Chiostr/.test(label);

/** Groups of three a cloister holds: one for a small court, two for a large one, three for the largest. */
export function groupsFor(area: number, largest: number): number {
  return area >= largest ? 3 : area >= 300 ? 2 : 1;
}

/**
 * Spots for `n` groups of three in the cloister `b`: the court is cut into `n` slices along
 * its long side and each group stands in a triangle around its slice's centre, every spot
 * nudged outwards on a spiral until it is clear of walls, columns, wells and trees.
 * Each spot is [x, z, yaw], facing the slice centre as if in prayer around it.
 */
export function cloisterSpots(world: World, b: Bounds, n: number): [number, number, number][][] {
  const long = b.x1 - b.x0 >= b.z1 - b.z0, groups: [number, number, number][][] = [], taken: number[][] = [];
  const free = (x: number, z: number) =>
    x > b.x0 + 3 && x < b.x1 - 3 && z > b.z0 + 3 && z < b.z1 - 3 // out of the arcade walks
    && !world.blocked(x, z, 0, PRIEST.radius + 0.3) && Math.abs(world.groundAt(x, z, 0)) < 0.3
    && taken.every(([tx, tz]) => Math.hypot(tx - x, tz - z) > 1.4);
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    const cx = long ? b.x0 + (b.x1 - b.x0) * f : (b.x0 + b.x1) / 2;
    const cz = long ? (b.z0 + b.z1) / 2 : b.z0 + (b.z1 - b.z0) * f;
    const g: [number, number, number][] = [];
    for (let k = 0; k < 3; k++) {
      const a0 = (k / 3) * Math.PI * 2 + i;
      for (let s = 0; s < 400; s++) {
        const a = a0 + s * 0.7, r = 1.3 + s * 0.05;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (!free(x, z)) continue;
        g.push([x, z, Math.atan2(x - cx, z - cz)]);
        taken.push([x, z]);
        break;
      }
    }
    groups.push(g);
  }
  return groups;
}

/** Every cloister among `areas` with its groups' spots, sized by `groupsFor`. */
export function cloisterPlan(world: World, areas: (Bounds & { label: string })[]): { area: Bounds & { label: string }; groups: [number, number, number][][] }[] {
  const cloisters = areas.filter((a) => isCloister(a.label));
  const size = (a: Bounds) => (a.x1 - a.x0) * (a.z1 - a.z0);
  const largest = Math.max(...cloisters.map(size));
  return cloisters.map((area) => ({ area, groups: cloisterSpots(world, area, groupsFor(size(area), largest)) }));
}

export function spawnPriests(world: World, groups: [number, number, number][][], bounds: Bounds[]): Priest[][] {
  return groups.map((g, i) => {
    const mates: Priest[] = [];
    for (const [x, z, yaw] of g) {
      mates.push({ x, y: feet(world, x, z), z, yaw, hp: PRIEST.hp, state: 'pray', t: 0, cd: 0, backoff: PRIEST.backoff, blind: 0, los: { ok: false, t: 0 }, move: 0, home: { x, z, yaw }, bounds: bounds[i], mates });
    }
    return mates;
  });
}

function enter(f: Priest, s: CasterState): void {
  f.state = s;
  f.t = 0;
  f.move = 0;
}

/** Aggro: the priest and every praying mate turn on the player. */
export function pull(f: Priest): void {
  for (const m of f.mates) if (m.state === 'pray') { enter(m, 'chase'); m.cd = Math.random() * 0.8; } // don't open in unison
}

/** Line of sight at chest height: no wall or column between the two points (0.5 m samples). */
export function sees(world: World, a: Target, b: Target): boolean {
  const dx = b.x - a.x, dz = b.z - a.z, n = Math.ceil(Math.hypot(dx, dz) / 0.5);
  for (let i = 1; i < n; i++) if (world.blocked(a.x + (dx * i) / n, a.z + (dz * i) / n, a.y + 0.6, 0.05)) return false;
  return true;
}

/** `sees` from the priest to the player, cached for LOS_EVERY s. */
function look(f: Priest, p: Target, world: World, dt: number): boolean {
  if ((f.los.t -= dt) <= 0) { f.los.ok = sees(world, f, p); f.los.t = LOS_EVERY; }
  return f.los.ok;
}

/** Walk towards (x,z) without leaving the cloister. */
function go(f: Priest, x: number, z: number, speed: number, stop: number, world: World, dt: number): void {
  const b = f.bounds, m = PRIEST.margin;
  walk(f, Math.min(Math.max(x, b.x0 + m), b.x1 - m), Math.min(Math.max(z, b.z0 + m), b.z1 - m), speed, stop, world, dt);
}

/** Advance one priest by `dt`; a finished cast pushes its bolt onto `bolts`. */
export function think(f: Priest, p: Target, world: World, dt: number, bolts: Bolt[]): void {
  f.t += dt;
  f.cd = Math.max(0, f.cd - dt);
  const dist = Math.hypot(p.x - f.x, p.z - f.z), level = Math.abs(p.y - f.y) < 2.5;
  const toPlayer = Math.atan2(f.x - p.x, f.z - p.z);

  switch (f.state) {
    case 'pray':
      face(f, f.home.yaw, dt);
      if (dist < PRIEST.aggro && level && look(f, p, world, dt)) pull(f);
      return;
    case 'chase': {
      const seen = level && dist <= PRIEST.range && look(f, p, world, dt);
      f.blind = seen ? 0 : f.blind + dt;
      if (Math.hypot(p.x - f.home.x, p.z - f.home.z) > PRIEST.leash || f.blind > PRIEST.blind) { enter(f, 'evade'); return; }
      f.move = 0;
      if (dist < PRIEST.keep && f.backoff > 0) {
        // Backpedal straight away from the player, still facing them.
        f.backoff -= dt;
        const x = f.x, z = f.z;
        go(f, f.x + ((f.x - p.x) / Math.max(dist, 0.1)) * 2, f.z + ((f.z - p.z) / Math.max(dist, 0.1)) * 2, PRIEST.back, 0, world, dt);
        if (Math.hypot(f.x - x, f.z - z) > PRIEST.back * dt * 0.3) f.move = -1;
        else f.backoff = 0; // cornered against the cloister's edge: stand and cast
        f.yaw = toPlayer;
      } else if (!seen) {
        go(f, p.x, p.z, PRIEST.speed, 0, world, dt);
        f.move = 1;
      } else if (f.cd === 0) enter(f, 'cast');
      else face(f, toPlayer, dt);
      return;
    }
    case 'cast':
      face(f, toPlayer, dt);
      if (!level || !look(f, p, world, dt)) { enter(f, 'chase'); f.cd = 0.5; return; } // interrupted
      if (f.t < PRIEST.cast) return;
      bolts.push({ x: f.x - Math.sin(f.yaw) * 0.5, y: f.y + CHEST + 0.4, z: f.z - Math.cos(f.yaw) * 0.5, t: 0, hit: false });
      f.cd = PRIEST.cooldown;
      f.backoff = PRIEST.backoff;
      enter(f, 'chase');
      return;
    case 'evade':
      f.hp = PRIEST.hp;
      walk(f, f.home.x, f.home.z, PRIEST.walk, 0, world, dt);
      f.move = 1;
      if (Math.hypot(f.home.x - f.x, f.home.z - f.z) < 0.05) enter(f, 'pray');
      return;
    case 'dead':
      if (f.t >= PRIEST.respawn) {
        f.x = f.home.x; f.z = f.home.z; f.yaw = f.home.yaw;
        f.y = feet(world, f.x, f.z);
        f.hp = PRIEST.hp;
        enter(f, 'pray');
      }
      return;
  }
}

/**
 * Fly every bolt one step towards the player's chest. Returns the magic damage landed this
 * frame. Spent bolts (hit or fizzled) are removed; a bolt that struck has `hit` set first so
 * the caller can draw the impact (see priests.ts) — read it before the next call.
 */
export function fly(bolts: Bolt[], p: Target, dt: number, spent: Bolt[] = []): number {
  let dmg = 0;
  spent.length = 0;
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.t += dt;
    const dx = p.x - b.x, dy = p.y + CHEST - b.y, dz = p.z - b.z, d = Math.hypot(dx, dy, dz);
    const s = PRIEST.bolt * dt;
    if (d <= Math.max(s, 0.4)) { b.hit = true; dmg += PRIEST.damage; }
    else if (b.t < PRIEST.life) { b.x += (dx / d) * s; b.y += (dy / d) * s; b.z += (dz / d) * s; continue; }
    spent.push(b);
    bolts.splice(i, 1);
  }
  return dmg;
}

/** Damage a priest. Returns true if this killed it. Evading and dead priests ignore it. */
export function hurt(f: Priest, n: number): boolean {
  if (f.state === 'dead' || f.state === 'evade' || n <= 0) return false;
  f.hp -= n;
  if (f.hp > 0) { pull(f); return false; }
  f.hp = 0;
  enter(f, 'dead');
  return true;
}
