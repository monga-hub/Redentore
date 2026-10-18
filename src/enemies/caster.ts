// Undead priest AI, WoW caster-mob style: stand in prayer in a cloister until the player comes
// into sight, pull the group, then cast shadow bolts from range on a cooldown, backpedalling
// when the player closes in, never leaving their cloister; evade home at full health if the
// player gets away. The church's sacerdoti and the Reverendissimo are the same brain with a
// bigger `CasterKind`: they also swing their staff in melee, and the boss channels a shadow
// nova around itself. Pure math on the collision World like brain.ts (friars), whose movement
// helpers it shares; priests.ts puts models and spell effects on top.
import type { World } from '../core/physics.ts';
import { face, feet, walk, type Target } from './brain.ts';
import { clear, control, pace, tick, type Control } from './control.ts';

export interface CasterKind {
  hp: number; xp: number; aggro: number; leash: number; blind: number; range: number; keep: number; backoff: number;
  speed: number; back: number; walk: number; cast: number; cooldown: number; bolt: number; life: number;
  damage: number; radius: number; margin: number;
  /** Staff swing when the player is in reach (sacerdoti, boss): rooted for `swing` s, lands at `windup` if still within `hit`. */
  melee?: { reach: number; hit: number; windup: number; swing: number; cooldown: number; damage: number };
  /** Every `every` s of fighting with the player within `radius`, channel `cast` s, then hit everything within `radius`. */
  nova?: { every: number; cast: number; radius: number; damage: number };
  /** Boss only: phases below each `at` share of health. */
  phases?: Phases;
  /** Share of crowd control that sticks (control.ts): durations and slows ×; default 1. */
  resist?: number;
  /**
   * Lace lines (level 2): every `every` s of fighting, `n` lines `length` m long and `width` m wide laid through
   * the player's feet from the caster (the first straight at them, the others `spread` rad either side), cutting
   * `cast` s later for `damage` on whoever stands in one.
   */
  lines?: { every: number; cast: number; length: number; width: number; damage: number; n: number; spread: number };
  /** The Governatrice's veil: while any ward she has called lives, she takes `cut` less damage. */
  veil?: { cut: number };
  /**
   * The fuso: from phase `phase` on, every `every` s, she spins for `time` s with two crossed lines `length` m
   * long either side and `width` wide turning round her at `speed` rad/s, `dps` to whoever they sweep.
   */
  spin?: { phase: number; every: number; time: number; speed: number; length: number; width: number; dps: number };
}

/**
 * The boss's fight in three acts. Below `at[0]` of its health it brands the floor every `marks.every` s:
 * `marks.n` circles, one under the player and the rest scattered round them, that erupt `marks.cast` s
 * later. Below `at[1]` it rages: every cooldown runs `haste` times as fast. `berserk` s into a fight
 * everything it deals is multiplied by `rage`, a wall for a build that can't bring it down in time.
 */
export interface Phases {
  at: number[];
  marks?: { every: number; n: number; cast: number; radius: number; spread: number; damage: number };
  haste: number;
  berserk: number;
  rage: number;
}

/** A branded circle on the floor at the player's feet height `y`: erupts when `t` runs out (the boss's marks). */
export interface Mark { x: number; y: number; z: number; t: number }
/** A lace line on the floor from (x, z) along the unit (dx, dz), `len` long: cuts when `t` runs out. */
export interface Line { x: number; y: number; z: number; dx: number; dz: number; len: number; t: number }

export const PRIEST: CasterKind = {
  hp: 90, // casters are squishy: nine bone slashes
  xp: 10, // experience for killing one (player/levels.ts); every kind below sets its own
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
  cooldown: 2.2, // s after a cast before the next one starts
  bolt: 13, // m/s, homing like a WoW shadow bolt
  life: 4, // s before a bolt that never reached the player fizzles out
  damage: 55, // magic, per bolt: a group of three ~43 dps against the player's 1280 hp, so they are run down, not traded with
  radius: 0.4,
  margin: 0.8, // m kept from the cloister's walls
};

/**
 * Sacerdote: a tall white-and-violet high priest leading two priests. Stands its ground, hits hard
 * with the mace and every so often calls down a shadow ring round itself to step out of: an elite to
 * open with a cooldown or two, kill its priests first or fight in the ring at a price.
 */
export const SACERDOTE: CasterKind = {
  ...PRIEST,
  hp: 760, // ~12 s of a level-6 rotation
  xp: 40,
  aggro: 13, leash: 40, blind: 10,
  range: 18, keep: 0, // never backpedals: walks into melee
  speed: 3.4, cast: 1.8, cooldown: 3.2, damage: 60,
  radius: 0.55,
  melee: { reach: 2, hit: 2.8, windup: 0.7, swing: 1.3, cooldown: 2.2, damage: 85 },
  nova: { every: 11, cast: 1.8, radius: 4, damage: 170 },
  resist: 0.7, // an elite shakes off control sooner
};

/**
 * Il Reverendissimo: the boss under the dome. Huge and slow, hits hard, a nova to run out of and,
 * as it weakens, branded floor and rage (`phases`). Tuned with scripts/balance.ts: a level 8-9 build
 * that dodges, in the gear the route drops, brings it down in about 3 minutes (in the starter set it
 * mostly can't, with epics bought a little sooner); one that eats the novas and the marks dies, and so
 * does the starting kit, which can't beat the berserk.
 */
export const REVERENDISSIMO: CasterKind = {
  ...PRIEST,
  hp: 11000,
  xp: 0, // his fall ends the run
  aggro: 15, leash: 60, blind: 15,
  range: 22, keep: 0,
  speed: 3, walk: 6, cast: 2.2, cooldown: 4, bolt: 11, life: 5, damage: 90,
  radius: 1.1,
  margin: 1.6, // m kept from BOSS_BOUNDS' edges: its 1.1 m bulk clears pews, columns and the pilasters at |x| 6.58
  // reach + radius stops it ~2 m from the player, inside the bone slash's 2.6 m
  melee: { reach: 1.5, hit: 4.5, windup: 0.8, swing: 1.6, cooldown: 3.4, damage: 85 }, // the crozier's sweep: taken, not dodged
  nova: { every: 13, cast: 2.6, radius: 6, damage: 420 },
  phases: {
    at: [0.6, 0.3],
    marks: { every: 9, n: 3, cast: 1.8, radius: 2.2, spread: 3.5, damage: 280 },
    haste: 1.25,
    berserk: 240, rage: 3,
  },
  resist: 0.35, // stuns and roots last a third as long, slows bite a third as deep, with diminishing returns on top
};
/**
 * L'ape gigante: a giant hornet guarding the apiary, an elite between a sacerdote and the boss.
 * The caster brain without bolts (`range` 0: it never casts, so it never loses sight either):
 * a stinger dive in melee and, every `nova.every` s of fighting, a poison swarm round itself to
 * run out of. It flies, but its brain walks the ground like everyone else (bees.ts lifts the body).
 * Against the player's 1280 hp: ~30 dps from the stinger if the swarm is dodged, and a swarm eaten
 * costs a sixth of it; about 25 s to kill at level 5.
 */
export const APE: CasterKind = {
  ...PRIEST,
  hp: 1200,
  xp: 80,
  aggro: 6, leash: 30, blind: Infinity, // off the paved paths' reach: the player steps into the frutteto to pull it
  range: 0, keep: 0,
  speed: 4.4, walk: 6,
  radius: 0.9, margin: 1,
  melee: { reach: 1.3, hit: 3.4, windup: 0.6, swing: 1.3, cooldown: 2.4, damage: 56 }, // a lunging dive: too long to step out of
  nova: { every: 9, cast: 2, radius: 4.5, damage: 200 },
  resist: 0.6,
};
/** Worker bees round the hives, pulled with the giant: quick, frail, small stings. */
export const APETTA: CasterKind = {
  ...APE,
  hp: 60,
  xp: 5,
  aggro: 5,
  speed: 5.2, walk: 7,
  radius: 0.35, margin: 0.5,
  melee: { reach: 0.7, hit: 1.6, windup: 0.35, swing: 0.8, cooldown: 1.8, damage: 18 },
  nova: undefined,
  resist: 1,
};
/** The apiary (zones/orto.ts, hives at z -130): the giant and her workers on the hives' north side, away from the paved paths. */
export const APIARY = { x: 0.5, z: -132.6 };
/** Where the bees may fly: the whole orto, the frutteto and the uliveto, so a player on the paths can't hit them from outside. */
export const APIARY_BOUNDS = { x0: -36, x1: 18.5, z0: -150.5, z1: -87 };
export function spawnApiary(world: World): { all: Priest[]; queen: Priest } {
  const all = spawnPriests(world, [[[APIARY.x, APIARY.z, Math.PI], [-0.4, -131.2, Math.PI], [2.3, -131.4, Math.PI], [3.4, -132.5, Math.PI]]], [APIARY_BOUNDS], [[APE, APETTA, APETTA, APETTA]])[0];
  return { all, queen: all[0] };
}

/**
 * s: an evade that hasn't reached home by now is pinned on a well, bench or tree in its
 * straight-line path (mobs don't pathfind) and warps home, WoW-style. The longest honest walk home,
 * across the chiostro grande at `walk`, takes ~8 s.
 */
const EVADE_MAX = 10;
const LOS_EVERY = 0.25;
/** s into the fuso before its threads cut: drawn, they can be read and left. */
export const SPIN_DRAW = 0.8; // s: tracing a ray through the cloister costs ~0.2 ms
const CHEST = 1.1; // m above the feet: where bolts leave the staff and strike the player

export type CasterState = 'pray' | 'chase' | 'cast' | 'swing' | 'nova' | 'spin' | 'evade' | 'dead';

export interface Bounds { x0: number; x1: number; z0: number; z1: number }

export interface Priest {
  kind: CasterKind;
  x: number; y: number; z: number;
  yaw: number; // 0 faces -Z
  hp: number;
  state: CasterState;
  t: number; // s in the current state
  cd: number; // cast cooldown left
  melee: number; // swing cooldown left
  nova: number; // s until the next nova
  struck: boolean; // this swing or nova already resolved
  phase: number; // the boss's act: 0, then 1 and 2 past `phases.at` (kept until it evades)
  fight: number; // s fighting since the pull (the boss's berserk)
  brand: number; // s until the next marks
  marks: Mark[]; // branded circles waiting to erupt
  lines: Line[]; // lace lines waiting to cut (level 2)
  lineCd: number; // s until the next lines
  spinCd: number; // s until the next fuso
  spinA: number; // the fuso's angle, rad
  wards?: Priest[]; // the Governatrice's: the zitelle she calls, two at each new phase, who keep her veil up
  backoff: number; // backpedal budget left until the next cast
  blind: number; // s pulled without line of sight
  los: { ok: boolean; t: number }; // line of sight to the player, re-traced every LOS_EVERY s
  move: -1 | 0 | 1; // backpedalling, standing, walking forward (for the animation)
  home: { x: number; z: number; yaw: number };
  bounds: Bounds; // the cloister's court (or garden, church floor): never leaves it
  mates: Priest[];
  cc: Control; // slows, roots, stuns laid by the hero's spells (control.ts)
}

export interface Bolt {
  x: number; y: number; z: number;
  dmg: number; speed: number; life: number; // from the caster's kind
  t: number;
  hit: boolean; // struck the player (set by fly, for the impact effect)
  wall?: boolean; // burst on a wall in its way instead (set by fly)
}

/** The cloisters, by area label: the arcaded courts of the convent zone. */
export const isCloister = (label: string) => /^Chiostr/.test(label);

/**
 * m from a cloister's outer walls to its court: the arcade walks (2.5-3 m deep, builder.ts arcade)
 * end at a muretto, a parapet the casters can't step over, open only at the doors.
 */
const WALK = 3;
/** The open court of the cloister `b`, inside the muretto. */
const court = (b: Bounds): Bounds => ({ x0: b.x0 + WALK, x1: b.x1 - WALK, z0: b.z0 + WALK, z1: b.z1 - WALK });

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
  const c = court(b);
  const free = (x: number, z: number) =>
    x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 // out of the arcade walks
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

/**
 * Every cloister among `areas` with its groups' spots, sized by `groupsFor`, and the court its
 * priests keep to. Not the whole area: chasing a player into the arcade walks used to lead them
 * through a door gap in the muretto, and the straight walk home then pinned them against it for good.
 */
export function cloisterPlan(world: World, areas: (Bounds & { label: string })[]): { area: Bounds & { label: string }; court: Bounds; groups: [number, number, number][][] }[] {
  const cloisters = areas.filter((a) => isCloister(a.label));
  const size = (a: Bounds) => (a.x1 - a.x0) * (a.z1 - a.z0);
  const largest = Math.max(...cloisters.map(size));
  return cloisters.map((area) => ({ area, court: court(area), groups: cloisterSpots(world, area, groupsFor(size(area), largest)) }));
}

/** The gardens past the orti, by the lagoon (zones/nord.ts): one sacerdote and two priests in each. */
export const GARDENS = ['Giardino dei pitosfori', 'Giardino del pozzo', 'Prato nord-est'];
export function gardenPlan<A extends Bounds & { label: string }>(world: World, areas: A[]): { area: A; group: [number, number, number][] }[] {
  return GARDENS.map((label) => {
    const area = areas.find((a) => a.label === label)!;
    return { area, group: cloisterSpots(world, area, 1)[0] };
  });
}

/**
 * Guards of the buildings by the lagoon (zones/nord.ts): priests on the pontile by the key's
 * chest, in the sale espositive and the caffè, round the altar of the cappella with a sacerdote,
 * in the laboratori and by the frantoio's press with a sacerdote. Each keeps to its room (the
 * pontile), off the line between its doors, facing `at` (the room's middle, the altar, the press). [x, z, sacerdote?]
 */
export const LAGOON: { label: string; at: [number, number]; group: [number, number, boolean?][] }[] = [
  { label: 'Pontile', at: [-35, -190], group: [[-37.2, -191.5], [-37.2, -188.5]] },
  { label: 'Sale espositive (antiche officine)', at: [-34.5, -156], group: [[-37.5, -159], [-37.5, -153], [-31.5, -159]] },
  { label: 'Caffè', at: [-26, -156], group: [[-28.3, -158.8], [-23.7, -158.8]] },
  { label: 'Cappella di meditazione', at: [-45, -156], group: [[-42.5, -156, true], [-45, -153], [-45, -159]] },
  { label: 'Laboratori', at: [-2, -156], group: [[-6, -158.5], [-6, -153.5], [2.5, -158.5]] },
  { label: 'Frantoio e sala di smielatura', at: [11, -156], group: [[14.5, -156, true], [16.5, -158.5], [16.5, -153.5]] },
];
export function lagoonPlan<A extends Bounds & { label: string }>(areas: A[]): { area: A; group: [number, number, number][]; kinds: CasterKind[] }[] {
  return LAGOON.map(({ label, at: [cx, cz], group }) => ({
    area: areas.find((a) => a.label === label)!,
    group: group.map(([x, z]) => [x, z, Math.atan2(x - cx, z - cz)]),
    kinds: group.map(([, , sac]) => (sac ? SACERDOTE : PRIEST)),
  }));
}

/** Groups of casters; `kinds[i][k]` (default PRIEST) is the k-th member of group i. */
export function spawnPriests(world: World, groups: [number, number, number][][], bounds: Bounds[], kinds: CasterKind[][] = []): Priest[][] {
  return groups.map((g, i) => {
    const mates: Priest[] = [];
    g.forEach(([x, z, yaw], k) => {
      const kind = kinds[i]?.[k] ?? PRIEST;
      mates.push({ kind, x, y: feet(world, x, z), z, yaw, hp: kind.hp, state: 'pray', t: 0, cd: 0, melee: 0, nova: kind.nova?.every ?? 0, struck: false,
        phase: 0, fight: 0, brand: kind.phases?.marks?.every ?? 0, marks: [], lines: [], lineCd: kind.lines ? kind.lines.every * 0.5 : 0, spinCd: 0, spinA: 0, backoff: kind.backoff, blind: 0, los: { ok: false, t: 0 }, move: 0, home: { x, z, yaw }, bounds: bounds[i], mates, cc: control(kind.resist) });
    });
    return mates;
  });
}

/**
 * The church: a sacerdote and two priests at the head of the nave and another trio behind the
 * high altar, the Reverendissimo alone under the dome.
 */
export const CHURCH = { x0: -12.5, x1: 12.5, z0: -60, z1: 0 };
export const BOSS_AT = { x: 0, z: -37 }; // crossing centre (zones/chiesa.ts CX)
/**
 * The boss's floor: the crossing and the top of the presbytery steps, between the pews
 * (z -26.7, level/dressing.ts) and the baldacchino's columns and candelabra (z -47.9,
 * zones/chiesaInterno.ts), nave faces at x ±7.5. It walks in straight lines, and chasing a
 * player into the pews, a side chapel or round the high altar used to wedge its 1.1 m bulk on a
 * pew end or between two columns, out of sight, until it evaded at full health mid-fight.
 * From the edge of its floor it still sees, and bolts, most of the church.
 */
export const BOSS_BOUNDS = { x0: -7, x1: 7, z0: -47.5, z1: -27 };
export function spawnChurch(world: World): { all: Priest[]; boss: Priest } {
  const S = Math.PI; // facing +Z, down the nave towards the door
  const groups: [number, number, number][][] = [
    [[0, -6, S], [-2.6, -7.5, S], [2.6, -7.5, S]], // head of the nave
    [[0, -52.2, S], [-4.3, -52, S], [4.3, -52, S]], // behind the high altar (z -50.5..-49.3), between baldachin and colonnade
    [[BOSS_AT.x, BOSS_AT.z, S]],
  ];
  const kinds = [[SACERDOTE], [SACERDOTE], [REVERENDISSIMO]];
  const all = spawnPriests(world, groups, [CHURCH, CHURCH, BOSS_BOUNDS], kinds).flat();
  return { all, boss: all[all.length - 1] };
}

/** Every caster on the map, in the order saved games index them: cloisters, gardens, the church (boss last), the lagoon. */
export function spawnCasters(world: World, areas: (Bounds & { label: string })[]): { all: Priest[]; boss: Priest } {
  const plan = cloisterPlan(world, areas), gardens = gardenPlan(world, areas), church = spawnChurch(world), lagoon = lagoonPlan(areas);
  return {
    boss: church.boss,
    all: [
      ...spawnPriests(world, plan.flatMap((c) => c.groups), plan.flatMap((c) => c.groups.map(() => c.court))).flat(),
      ...spawnPriests(world, gardens.map((g) => g.group), gardens.map((g) => g.area), gardens.map(() => [SACERDOTE])).flat(),
      ...church.all,
      ...spawnPriests(world, lagoon.map((g) => g.group), lagoon.map((g) => g.area), lagoon.map((g) => g.kinds)).flat(), // last: saved games keep their indices
    ],
  };
}

/** Everyone drops dead at once (the boss's fall). */
export function killAll(fs: { state: string; hp: number; t: number }[]): void {
  for (const f of fs) {
    if (f.state === 'dead') continue;
    f.hp = 0;
    f.state = 'dead';
    f.t = 0;
  }
}

/**
 * The player died: every mob still fighting gives up and evades home at full health (a wipe),
 * instead of chasing towards the respawn. Friars and casters alike; the praying/hoeing and the dead stay put.
 */
export function wipe(fs: { state: string; t: number }[]): void {
  for (const f of fs) {
    if (f.state === 'dead' || f.state === 'pray' || f.state === 'hoe' || f.state === 'evade') continue;
    f.state = 'evade';
    f.t = 0;
  }
}

function enter(f: Priest, s: CasterState): void {
  f.state = s;
  f.t = 0;
  f.move = 0;
  f.struck = false;
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
  const b = f.bounds, m = f.kind.margin;
  walk(f, Math.min(Math.max(x, b.x0 + m), b.x1 - m), Math.min(Math.max(z, b.z0 + m), b.z1 - m), speed, stop, world, dt, f.kind.radius);
}

/**
 * Advance one priest by `dt`; a finished cast pushes its bolt onto `bolts`. Returns the melee
 * (swing or nova) damage it lands on the player this frame.
 */
export function think(f: Priest, p: Target, world: World, dt: number, bolts: Bolt[]): number {
  const P = f.kind.phases;
  if (!P) return act(f, p, world, dt, bolts, 1, 1) + cut(f, p, dt);
  if (f.state === 'dead') { f.marks.length = 0; f.lines.length = 0; return 0; }
  const fighting = f.state === 'chase' || f.state === 'cast' || f.state === 'swing' || f.state === 'nova' || f.state === 'spin';
  if (fighting) {
    f.fight += dt;
    while (f.phase < P.at.length && f.hp <= f.kind.hp * P.at[f.phase]) {
      f.phase++;
      call(f); // the Governatrice calls two more of her girls
    }
  }
  const haste = f.phase >= P.at.length ? P.haste : 1, rage = f.fight >= P.berserk ? P.rage : 1;
  const level = Math.abs(p.y - f.y) < 2.5;
  return (act(f, p, world, dt, bolts, haste, rage) + (P.marks ? brand(f, P, p, level, dt * haste, fighting) : 0) + cut(f, p, dt * haste)) * rage;
}

/** The wards not yet called, two by two: pulled onto the player. */
function call(f: Priest): void {
  const asleep = (f.wards ?? []).filter((w) => w.state === 'pray');
  for (const w of asleep.slice(0, 2)) { enter(w, 'chase'); w.cd = 0.5 + Math.random(); }
}

/** Her veil holds while a ward she has called is still standing. */
export function veiled(f: Priest): boolean {
  return !!f.kind.veil && !!f.wards?.some((w) => w.state !== 'dead' && w.state !== 'pray' && w.state !== 'evade');
}

/** On a line from (l.x, l.z) along (l.dx, l.dz), `len` long, within half of `w` of it. */
export function onLine(l: { x: number; z: number; dx: number; dz: number; len: number }, w: number, p: { x: number; z: number }): boolean {
  const vx = p.x - l.x, vz = p.z - l.z, s = vx * l.dx + vz * l.dz;
  return s >= -w / 2 && s <= l.len + w / 2 && Math.abs(vx * l.dz - vz * l.dx) <= w / 2;
}

/** Lace lines: cut the due ones (their damage on the player), lay new ones on schedule. */
function cut(f: Priest, p: Target, dt: number): number {
  const L = f.kind.lines;
  if (!L) return 0;
  if (f.state === 'dead' || f.state === 'evade' || f.state === 'pray') { f.lines.length = 0; f.lineCd = L.every * 0.5; return 0; }
  let dmg = 0;
  const level = Math.abs(p.y - f.y) < 2.5;
  for (let i = f.lines.length - 1; i >= 0; i--) {
    const l = f.lines[i];
    if ((l.t -= dt) > 0) continue;
    f.lines.splice(i, 1);
    if (level && onLine(l, L.width, p)) dmg += L.damage;
  }
  if (f.state !== 'nova' && f.state !== 'spin' && f.cc.stun <= 0 && (f.lineCd -= dt) <= 0) {
    f.lineCd = L.every;
    // From behind the caster through the player and on: a step to the side clears a line, a step back does not.
    const a0 = Math.atan2(p.x - f.x, p.z - f.z);
    for (let i = 0; i < L.n; i++) {
      const a = a0 + (i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * L.spread), dx = Math.sin(a), dz = Math.cos(a);
      f.lines.push({ x: f.x - dx * 2, y: p.y, z: f.z - dz * 2, dx, dz, len: L.length, t: L.cast });
    }
  }
  return dmg;
}

/** The boss's marks: erupt the due ones (returns their damage on the player), brand new ones on schedule. */
function brand(f: Priest, P: Phases, p: Target, level: boolean, dt: number, fighting: boolean): number {
  let dmg = 0;
  for (let i = f.marks.length - 1; i >= 0; i--) {
    const m = f.marks[i];
    if ((m.t -= dt) > 0) continue;
    f.marks.splice(i, 1);
    if (level && Math.hypot(p.x - m.x, p.z - m.z) < P.marks!.radius) dmg += P.marks!.damage;
  }
  if (f.phase >= 1 && fighting && f.state !== 'nova' && (f.brand -= dt) <= 0) {
    // One under the player, the rest round them on a line: a step aside clears them all.
    const M = P.marks!;
    f.brand = M.every;
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < M.n; i++) {
      const a = a0 + Math.PI * (i % 2), r = Math.ceil(i / 2) * M.spread;
      f.marks.push({ x: p.x + Math.cos(a) * r, y: p.y, z: p.z + Math.sin(a) * r, t: M.cast });
    }
  }
  return dmg;
}

/** One caster's frame: `haste` × on its cooldowns, `rage` × on what it deals (the boss's phases; 1 for everyone else). */
function act(f: Priest, p: Target, world: World, dt: number, bolts: Bolt[], haste: number, rage: number): number {
  const K = f.kind;
  tick(f.cc, dt);
  if (f.state === 'evade' || f.state === 'dead') clear(f.cc);
  else if (f.cc.stun > 0) { // stunned: a cast or a swing is lost, a nova only held (it is never interrupted)
    if (f.state === 'cast') { enter(f, 'chase'); f.cd = 0.5; }
    if (f.state === 'swing') enter(f, 'chase');
    return 0;
  }
  const mv = pace(f.cc);
  f.t += dt;
  f.cd = Math.max(0, f.cd - dt * haste);
  f.melee = Math.max(0, f.melee - dt * haste);
  if (K.nova && (f.state === 'chase' || f.state === 'cast' || f.state === 'swing')) f.nova -= dt * haste;
  if (K.spin && f.phase >= K.spin.phase && f.state !== 'spin') f.spinCd -= dt * haste;
  const dist = Math.hypot(p.x - f.x, p.z - f.z), level = Math.abs(p.y - f.y) < 2.5;
  const toPlayer = Math.atan2(f.x - p.x, f.z - p.z);
  const reach = K.melee ? K.melee.reach + K.radius : 0;

  switch (f.state) {
    case 'pray':
      face(f, f.home.yaw, dt);
      if (dist < K.aggro && level && look(f, p, world, dt)) pull(f);
      return 0;
    case 'chase': {
      const sight = level && look(f, p, world, dt), seen = sight && dist <= K.range;
      f.blind = (K.range ? seen : sight) ? 0 : f.blind + dt; // a melee-only kind (the gondolieri) loses the player only behind a wall
      if (Math.hypot(p.x - f.home.x, p.z - f.home.z) > K.leash || f.blind > K.blind) { enter(f, 'evade'); return 0; }
      f.move = 0;
      if (K.spin && f.phase >= K.spin.phase && f.spinCd <= 0 && dist < K.spin.length + 4 && level) { enter(f, 'spin'); f.spinA = Math.atan2(p.x - f.x, p.z - f.z) + Math.PI / 4; return 0; }
      if (K.nova && f.nova <= 0 && dist < K.nova.radius && level) { enter(f, 'nova'); return 0; }
      if (K.melee && dist <= reach && level) {
        if (f.melee === 0) { enter(f, 'swing'); f.melee = K.melee.cooldown; }
        else face(f, toPlayer, dt);
        return 0;
      }
      if (dist < K.keep && f.backoff > 0) {
        // Backpedal straight away from the player, still facing them.
        f.backoff -= dt;
        const x = f.x, z = f.z;
        go(f, f.x + ((f.x - p.x) / Math.max(dist, 0.1)) * 2, f.z + ((f.z - p.z) / Math.max(dist, 0.1)) * 2, K.back * mv, 0, world, dt);
        if (mv > 0 && Math.hypot(f.x - x, f.z - z) > K.back * mv * dt * 0.3) f.move = -1;
        else f.backoff = 0; // cornered against the cloister's edge: stand and cast
        f.yaw = toPlayer;
      } else if (!seen || (K.melee && f.cd > 0)) {
        go(f, p.x, p.z, K.speed * mv, K.melee ? reach * 0.8 : 0, world, dt); // melee kinds close in between casts
        f.move = mv > 0 ? 1 : 0;
      } else if (f.cd === 0) enter(f, 'cast');
      else face(f, toPlayer, dt);
      return 0;
    }
    case 'cast':
      face(f, toPlayer, dt);
      if (!level || !look(f, p, world, dt)) { enter(f, 'chase'); f.cd = 0.5; return 0; } // interrupted
      if (f.t < K.cast) return 0;
      bolts.push({ x: f.x - Math.sin(f.yaw) * 0.5, y: f.y + CHEST + 0.4, z: f.z - Math.cos(f.yaw) * 0.5, t: 0, hit: false, dmg: K.damage * rage, speed: K.bolt, life: K.life });
      f.cd = K.cooldown;
      f.backoff = K.backoff;
      enter(f, 'chase');
      return 0;
    case 'swing': {
      const m = K.melee!;
      face(f, toPlayer, dt * 0.5); // tracks a little, can be sidestepped
      if (f.t >= m.swing) enter(f, 'chase');
      if (f.struck || f.t < m.windup) return 0;
      f.struck = true;
      return dist <= m.hit + K.radius && level ? m.damage : 0;
    }
    case 'nova': {
      const n = K.nova!;
      if (f.t < n.cast) return 0;
      f.nova = n.every;
      enter(f, 'chase');
      return dist <= n.radius && level && world.sees(f, p) ? n.damage : 0; // a wall shelters from it
    }
    case 'spin': { // the fuso: two crossed lines turning round her; she stands and spins
      const S = K.spin!;
      f.spinA += S.speed * dt * haste;
      if (f.t >= S.time) { enter(f, 'chase'); f.spinCd = S.every; return 0; }
      if (f.t < SPIN_DRAW || !level) return 0; // the threads take a moment to draw taut
      for (let k = 0; k < 4; k++) {
        const a = f.spinA + (k * Math.PI) / 2;
        if (onLine({ x: f.x, z: f.z, dx: Math.sin(a), dz: Math.cos(a), len: S.length }, S.width, p)) return S.dps * dt;
      }
      return 0;
    }
    case 'evade':
      f.hp = K.hp;
      walk(f, f.home.x, f.home.z, K.walk, 0, world, dt, K.radius);
      f.move = 1;
      if (f.t > EVADE_MAX) { f.x = f.home.x; f.z = f.home.z; f.y = feet(world, f.x, f.z); }
      if (Math.hypot(f.home.x - f.x, f.home.z - f.z) < 0.05) { enter(f, 'pray'); f.nova = K.nova?.every ?? 0; }
      f.phase = f.fight = 0; // a fresh fight next time
      f.brand = K.phases?.marks?.every ?? 0;
      f.marks.length = 0;
      f.spinCd = 0;
      for (const w of f.wards ?? []) if (w.state !== 'dead' && w.state !== 'pray') { w.hp = w.kind.hp; enter(w, 'evade'); } // her girls go back to their places
      return 0;
    case 'dead': // for good: nobody respawns
      return 0;
  }
}

/**
 * Fly every bolt one step towards the player's chest. Returns the magic damage landed this
 * frame. Spent bolts (hit, fizzled or, with `world`, burst on a wall in their way) are removed; a bolt
 * that struck has `hit` set first, one that hit a wall `wall`, so the caller can draw the impact (see
 * priests.ts) — read them before the next call. Homing never takes a bolt round or through a wall.
 */
export function fly(bolts: Bolt[], p: Target, dt: number, spent: Bolt[] = [], world?: World): number {
  let dmg = 0;
  spent.length = 0;
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.t += dt;
    const dx = p.x - b.x, dy = p.y + CHEST - b.y, dz = p.z - b.z, d = Math.hypot(dx, dy, dz);
    const s = b.speed * dt;
    if (d <= Math.max(s, 0.4)) { b.hit = true; dmg += b.dmg; }
    else if (b.t < b.life) {
      const nx = b.x + (dx / d) * s, ny = b.y + (dy / d) * s, nz = b.z + (dz / d) * s;
      const k = world ? world.ray(b.x, b.y, b.z, nx, ny, nz) : 1;
      b.x += (nx - b.x) * k; b.y += (ny - b.y) * k; b.z += (nz - b.z) * k;
      if (k >= 1) continue;
      b.wall = true;
    }
    spent.push(b);
    bolts.splice(i, 1);
  }
  return dmg;
}

/** Damage a priest. Returns true if this killed it. Evading and dead priests ignore it. */
export function hurt(f: Priest, n: number): boolean {
  if (f.state === 'dead' || f.state === 'evade' || n <= 0) return false;
  if (veiled(f)) n *= 1 - f.kind.veil!.cut; // the Governatrice's veil
  f.hp -= n;
  if (f.hp > 0) { pull(f); return false; }
  f.hp = 0;
  enter(f, 'dead');
  return true;
}
