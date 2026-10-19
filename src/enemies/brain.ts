// Undead friar AI, WoW-mob style: hoe a bed in the orto until the player comes near, pull the
// whole group, chase and swing the hoe (melee only), evade home at full health if dragged too
// far. Pure math on the collision World, no three.js, so `npm run check` drives it in Node
// (scripts/check-enemies.ts). friars.ts puts models on top.
import { PLAYER, type World } from '../core/physics.ts';
import { clear, control, pace, tick, type Control } from './control.ts';

export const FRIAR = {
  hp: 120,
  xp: 10, // experience for killing one (player/levels.ts)
  aggro: 9, // m: the player this close (and roughly level) pulls the group
  leash: 24, // m from home before the friar gives up and evades
  blind: 6, // s chasing a player it can't see (a wall between) before it gives up and evades
  speed: 3.6, // chase m/s, under the player's 6 so they can be kited
  walk: 5, // evade m/s (immune meanwhile, like a WoW evade)
  reach: 1.5, // starts a swing inside this
  hit: 2.2, // the swing lands if the player is still this close at impact
  windup: 0.62, // s from swing start to impact (the chop clip is timed onto it, SWING in friars.ts)
  swing: 1.15, // s the swing roots the friar
  cooldown: 2.2, // s between swings
  damage: 70, // against the player's 1280 hp: a group of three standing round you kills in ~13 s
  radius: 0.4,
};
const TURN = 8; // 1/s

export type State = 'hoe' | 'chase' | 'swing' | 'evade' | 'dead';

export interface Friar {
  x: number; y: number; z: number;
  yaw: number; // 0 faces -Z, like the player
  hp: number;
  state: State;
  t: number; // s in the current state
  cd: number; // swing cooldown left
  struck: boolean; // this swing already resolved
  home: { x: number; z: number; yaw: number };
  mates: Friar[]; // the hoeing group, pulled together
  cc: Control; // slows, roots, stuns laid by the hero's spells (control.ts)
  blind?: number; // s chasing without line of sight
  again?: boolean; // risen again (`rise`): worth less, drops less
  riseAt?: number; // s into its death it rises again (`rise`)
}

export interface Target { x: number; y: number; z: number }

/** What the shared movement helpers below need; friars and priests (caster.ts) both fit. */
export interface Mob extends Target { yaw: number; state: string }

/**
 * Hoeing spots on the earth walks between the raised beds of the orti (see zones/orto.ts
 * `beds`: blocks x -35..-22 and -17.5..-9.5, a 1.2 m walk at x -28.5 and between the bed rows),
 * each friar facing the bed it works. Off the paved paths, so nobody stands in the way.
 * Groups of 2-3; each spot is [x, z, yaw].
 */
const W = Math.PI / 2;
export const GROUPS: [number, number, number][][] = [
  [[-28.5, -136, W], [-28.5, -129.5, -W], [-33, -132, 0]],
  [[-28.5, -119, W], [-28.5, -116, -W]],
  [[-15.5, -132, 0], [-11.5, -132, Math.PI]],
  [[-28.5, -101.5, W], [-28.5, -96, -W], [-32, -99, Math.PI]],
  [[-15, -104.3, 0], [-12, -104.3, Math.PI], [-13.5, -93.7, 0]],
];
/**
 * More working groups, on the walks left free and along the blocks' outer edges (x -35.5 by the
 * pergola, x -21.75 by the paved path, z -138.6 and -88.5 at the orti's ends). Kept apart from
 * GROUPS so saved games keep their indices (main.ts lists these after every priest).
 */
export const MORE: [number, number, number][][] = [
  [[-25, -132, 0], [-21.75, -135, W], [-24, -138.6, Math.PI]],
  [[-35.5, -129, -W], [-35.5, -135.5, -W]],
  [[-15, -138.6, Math.PI], [-11.5, -138.6, Math.PI]],
  [[-35.5, -119, -W], [-35.5, -115.5, -W], [-21.75, -117.5, W]],
  [[-33, -104.3, 0], [-25, -104.3, Math.PI], [-21.75, -101.5, W]],
  [[-33, -93.7, 0], [-25, -93.7, 0], [-30, -88.5, 0]],
  [[-15.5, -99, 0], [-11.5, -99, Math.PI], [-10.5, -93.7, 0]],
];

export function spawnGroups(world: World, groups = [...GROUPS, ...MORE]): Friar[][] {
  return groups.map((g) => {
    const mates: Friar[] = [];
    for (const [x, z, yaw] of g) {
      mates.push({ x, y: feet(world, x, z), z, yaw, hp: FRIAR.hp, state: 'hoe', t: 0, cd: 0, struck: false, home: { x, z, yaw }, mates, cc: control() });
    }
    return mates;
  });
}

/** Standing height at (x,z), stepping up onto low beds and kerbs. */
export const feet = (world: World, x: number, z: number) => world.groundAt(x, z, world.standHeight(x, z));

function enter(f: Friar, s: State): void {
  f.state = s;
  f.t = 0;
  f.struck = false;
}

/** Aggro: the friar and every hoeing mate turn on the player. */
export function pull(f: Friar): void {
  for (const m of f.mates) if (m.state === 'hoe') enter(m, 'chase');
}

export function face(f: Mob, yaw: number, dt: number): void {
  const d = Math.atan2(Math.sin(yaw - f.yaw), Math.cos(yaw - f.yaw));
  f.yaw += d * Math.min(1, TURN * dt);
}

/** Walk towards (x,z), stopping `stop` m short. Returns the distance left. */
export function walk(f: Mob, x: number, z: number, speed: number, stop: number, world: World, dt: number, r = FRIAR.radius): number {
  const dx = x - f.x, dz = z - f.z, d = Math.hypot(dx, dz);
  if (d > 1e-3) face(f, Math.atan2(-dx, -dz), dt);
  const s = Math.min(speed * dt, d - stop);
  if (s > 0) {
    f.x += (dx / d) * s;
    f.z += (dz / d) * s;
    // A body wider than the player overhangs the steps ahead while its feet are read at its
    // centre: let it push past what its rim reaches on a stair (½ slope). The boss (1.1 m) on the presbytery steps.
    world.resolve(f, f.y + (r - PLAYER.radius) * 0.5, r);
  }
  const g = world.groundAt(f.x, f.z, f.y);
  if (g > -Infinity) f.y = g; // beds and kerbs are within step height; no jumping
  return Math.hypot(x - f.x, z - f.z);
}

/** Advance one friar by `dt`. Returns the damage it lands on the player this frame. */
export function think(f: Friar, p: Target, world: World, dt: number): number {
  tick(f.cc, dt);
  if (f.state === 'evade' || f.state === 'dead') clear(f.cc);
  else if (f.cc.stun > 0) { // stunned: the swing is lost, nothing else moves
    if (f.state === 'swing') enter(f, 'chase');
    return 0;
  }
  f.t += dt;
  f.cd = Math.max(0, f.cd - dt);
  const dist = Math.hypot(p.x - f.x, p.z - f.z), level = Math.abs(p.y - f.y) < 2.5;
  const fromHome = Math.hypot(f.home.x - f.x, f.home.z - f.z);

  switch (f.state) {
    case 'hoe':
      face(f, f.home.yaw, dt);
      if (dist < FRIAR.aggro && level && world.sees(f, p)) pull(f); // not through a wall
      return 0;
    case 'chase':
      f.blind = dist < FRIAR.aggro * 1.5 && level && world.sees(f, p) ? 0 : (f.blind ?? 0) + dt; // pinned behind a wall: it gives up
      if (fromHome > FRIAR.leash || dist > FRIAR.leash || f.blind > FRIAR.blind) { f.blind = 0; enter(f, 'evade'); return 0; }
      if (dist <= FRIAR.reach && f.cd === 0 && level) { enter(f, 'swing'); f.cd = FRIAR.cooldown; return 0; }
      walk(f, p.x, p.z, FRIAR.speed * pace(f.cc), FRIAR.reach * 0.7, world, dt);
      return 0;
    case 'swing':
      face(f, Math.atan2(f.x - p.x, f.z - p.z), dt * 0.5); // tracks a little, can be sidestepped
      if (f.t >= FRIAR.swing) enter(f, 'chase');
      if (f.struck || f.t < FRIAR.windup) return 0;
      f.struck = true;
      return dist <= FRIAR.hit && level ? FRIAR.damage : 0;
    case 'evade':
      f.hp = FRIAR.hp;
      if (walk(f, f.home.x, f.home.z, FRIAR.walk, 0, world, dt) < 0.05) enter(f, 'hoe');
      return 0;
    case 'dead': // until the vow raises it again (`rise`), or for good once the Reverendissimo is dead
      return 0;
  }
}

/**
 * The vow raises the orto's dead while the Reverendissimo stands (Friars.rising): a friar gets up at its own spot
 * `after` s from its fall, once the hero is `away` m off it (out of sight there, and never on top of them). Each one
 * rises in its own place, so a group never outnumbers its first count; a risen friar is worth `xp` of one and drops
 * a worker's loot (main.ts, loot/drops.ts), so the orto feeds Fra' Bortolo's heads, not the levels.
 */
export const RISE = { after: [60, 120], away: 25, xp: 0.25 } as const;
export function rise(f: Friar, p: Target, world: World, rnd: () => number = Math.random): boolean {
  if (f.state !== 'dead') return false;
  f.riseAt ??= f.t + RISE.after[0] + rnd() * (RISE.after[1] - RISE.after[0]); // a loaded corpse (t past the sink) too: after, from now
  if (f.t < f.riseAt || Math.hypot(p.x - f.home.x, p.z - f.home.z) < RISE.away) return false;
  Object.assign(f, { x: f.home.x, z: f.home.z, yaw: f.home.yaw, y: feet(world, f.home.x, f.home.z), hp: FRIAR.hp, cd: 0, blind: 0, again: true, riseAt: undefined });
  enter(f, 'hoe');
  return true;
}

/** Damage a friar. Returns true if this killed it. Evading and dead friars ignore it. */
export function hurt(f: Friar, n: number): boolean {
  if (f.state === 'dead' || f.state === 'evade' || n <= 0) return false;
  f.hp -= n;
  if (f.hp > 0) { pull(f); return false; }
  f.hp = 0;
  enter(f, 'dead');
  return true;
}

/** Keep the living mobs of one kind from stacking on one another (pairwise, a few dozen at most). */
export function separate(friars: Mob[], world: World): void {
  const min = FRIAR.radius * 2;
  for (let i = 0; i < friars.length; i++) {
    const a = friars[i];
    if (a.state === 'dead') continue;
    for (let j = i + 1; j < friars.length; j++) {
      const b = friars[j];
      if (b.state === 'dead') continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d >= min || d < 1e-6) continue;
      const k = (min - d) / d / 2;
      a.x -= dx * k; a.z -= dz * k;
      b.x += dx * k; b.z += dz * k;
      world.resolve(a, a.y, FRIAR.radius);
      world.resolve(b, b.y, FRIAR.radius);
    }
  }
}
