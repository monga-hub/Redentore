// Headless balance harness (`npm run balance`; not in `npm run check`, it plays whole runs).
// The real level, collision, mob brains, ability table (costs, cooldowns, the GCD, charge), mana,
// potion, XP curve and level-up offers, played by a bot: it walks the quest route on a grid path
// (Fra' Zuane, the apiary, the key on the pontile, the grate, the choir door, the boss), fights
// whatever it pulls with one build's picks, and dies and wakes at the checkpoint like the game.
// Only the looks are gone; the plague clouds and the wisp, which live in the Forsaken class with its
// three.js, are re-done here in a few lines. The bot is fair but plain: it faces and hits the nearest
// foe, keeps its cooldowns rolling, prays (the heal) under 55% and between pulls, drinks under 45% health, and if it dodges it runs straight out of
// every telegraphed area (novas, the swarm, the boss's marks) with no finesse, like a phone player.
// Gear: on the route every kill rolls its loot (loot/bag.ts); the bot wears a piece if it is worth more
// budget points than what it wears and sells the rest (and every flavour item) to Fra' Bortolo, so the
// gold it ends with is what a player could spend on epics. The boss and the elites alone take a GEAR:
// start (the hemp set), typical (the loot of a typical route's kills, best in slot), buy (typical, then
// epics bought with that route's gold), epic (every purple piece).
//
// Every run is seeded (the bot's picks and dodges, and Math.random for the mobs), so a run replays exactly.
//
//   node scripts/balance.ts [runs]                 every build on the route (3 runs each; arcane and storm take fire/frost and lightning/new blows first), then the boss alone at levels 1, 6, 8, 9 in typical gear, at 8 and 9 in the starter set, at 9 with epics bought and in all of them
//   node scripts/balance.ts bosses [runs]          only the boss part of the above
//   node scripts/balance.ts route melee [runs]     one build on the route (NODODGE=1: the bot that dodges nothing)
//   node scripts/balance.ts boss plague 9 [runs]   the boss alone, a build at a level, dodging and not (DEALT=1: picks, damage dealt and taken; PICKS=a,b,..: those picks; GEAR=start|typical|buy|epic, default typical)
//   node scripts/balance.ts route2 melee [runs]    one build on the route, on into level 2 (Fra' Zuane, the fondamenta, the Zitelle, the Governatrice)
//   node scripts/balance.ts boss2 plague 11 [runs] the Governatrice alone (GEAR default typical2: level 1's typical loot and level 2's; typical, buy2, epic)
//   node scripts/balance.ts elite2 [runs]          the Gastaldo and the Maestra with their packs, every build at 9, 10, 11
//   node scripts/balance.ts elite [runs]           the minibosses alone (a garden's sacerdote and priests, the giant bee and workers), every build at 6, 7, 8, one life (GEAR as above)
//   HANDS=0.5 node scripts/balance.ts ...          the bot lands half its damage: a stand-in for a human's rotation
import * as THREE from 'three';
import { buildLevel } from '../src/level/index.ts';
import { PLAYER } from '../src/core/physics.ts';
import { CHURCH_FLOOR, SPAWN } from '../src/level/plan.ts';
import { CHEST, CHOIR_DOOR, NPC, Quest } from '../src/quest/progress.ts';
import { GASTALDO, GONDOLIERE, GOVERNATRICE, GOV_AT, MAESTRA, PACKS, VELO, ZITELLA, spawnLevel2, type Level2 } from '../src/enemies/zitelle.ts';
import { onLine, veiled } from '../src/enemies/caster.ts';
import { ZF } from '../src/level/zones/zitelle.ts';
import { FRIAR, separate, spawnGroups, think as friarThink, hurt as friarHurt, type Friar } from '../src/enemies/brain.ts';
import { APE, APETTA, APIARY, BOSS_AT, GARDENS, REVERENDISSIMO, SACERDOTE, fly, hurt as casterHurt, spawnApiary, spawnCasters, think as casterThink, wipe, type Bolt, type Priest } from '../src/enemies/caster.ts';
import { PlayerStats } from '../src/player/stats.ts';
import { ABILITIES, BAR, MEND, plagueSpot, tune, wispFoe, type Forsaken } from '../src/abilities/forsaken.ts';
import { Grimoire } from '../src/abilities/grimoire.ts';
import { frozen } from '../src/enemies/control.ts';
import { AbilitySystem } from '../src/abilities/system.ts';
import { START, levelOf, offer, tuneOf } from '../src/player/levels.ts';
import { Bag, ITEM, roll, type Tier } from '../src/loot/bag.ts';
import { Equipment, shop, buyPrice, crit, effects, sellPrice, totals, worth, type GearState } from '../src/loot/gear.ts';

const DT = 1 / 30;
/** HANDS=0.6: the bot lands that share of its damage, a stand-in for a human's slower, sloppier rotation. */
const HANDS = Number(process.env.HANDS ?? 1);
type World = ReturnType<typeof buildLevel>['world'];
type Mob = Friar | Priest;
const isCaster = (m: Mob): m is Priest => 'kind' in m;
const FIGHTING = new Set(['chase', 'swing', 'cast', 'nova']);

// --- builds: card preferences, best first (anything unlisted comes last) ---
export const BUILDS: Record<string, string[]> = {
  melee: ['fall_third', 'fall_dmg', 'step', 'veil', 'ward', 'strike', 'fall_reach', 'dmg', 'hp', 'armor', 'leech', 'fall_mana', 'potion_big', 'ward_long', 'fury',
    'strike_dmg', 'potion_cd', 'veil_long', 'veil_heal', 'step_dmg', 'step_cd', 'fury_start', 'speed', 'nova', 'cdr', 'regen', 'mana', 'wisp'],
  plague: ['plague_dps', 'wisp', 'plague_size', 'plague_cd', 'nova', 'wisp_still', 'fx_wispplague', 'plague_long', 'wisp_dps', 'regen', 'mana', 'cdr', 'veil',
    'nova_big', 'dmg', 'fury', 'fx_fallplague', 'hp', 'armor', 'wisp_fast', 'potion_big', 'fury_start', 'veil_heal', 'ward', 'step', 'fx_stepplague'],
  mixed: ['fall_dmg', 'plague_dps', 'veil', 'wisp', 'ward', 'dmg', 'hp', 'fall_third', 'plague_size', 'armor', 'wisp_still', 'leech', 'ward_long', 'potion_big',
    'fury', 'plague_cd', 'fx_fallplague', 'veil_heal', 'fall_reach', 'potion_cd', 'strike', 'nova', 'step', 'regen'],
  // the new schools: a fire-and-frost caster, and a brawler of lightning and heavy blows
  arcane: ['pyre', 'veil', 'frost', 'ward', 'font', 'lance', 'fx_shatter', 'pyre_fast', 'regen', 'mana', 'frost_fast', 'pyre_big', 'font_long', 'lance_split', 'dmg', 'hp', 'armor',
    'frost_deep', 'font_cd', 'lance_dmg', 'potion_big', 'cdr', 'veil_heal', 'nova', 'leech', 'fury', 'ward_long', 'potion_cd'],
  storm: ['chain', 'veil', 'toll', 'ward', 'leap', 'whirl', 'grace', 'fx_storm', 'charge', 'chain_fast', 'toll_long', 'whirl_dmg', 'grace_mul', 'leap_big', 'dmg', 'hp', 'armor', 'regen',
    'mana', 'chain_long', 'toll_big', 'leap_cd', 'whirl_long', 'grace_cd', 'charge_stun', 'potion_big', 'leech', 'fury', 'ward_long', 'fall_dmg'],
};

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
Math.random = rnd; // the mobs' jitter and the boss's marks too: a seed replays a run

/** The picks a build makes up to `lv` (offers replayed with the seeded rnd). */
function picksTo(build: string, lv: number): string[] {
  const picks: string[] = [];
  while (picks.length < lv - 1) picks.push(choose(build, picks));
  return picks;
}
function choose(build: string, picks: string[]): string {
  const pref = BUILDS[build] ?? [], rank = (id: string) => (pref.includes(id) ? pref.indexOf(id) : 999);
  const cards = offer(picks, rnd);
  return cards.reduce((a, b) => (rank(b.id) < rank(a.id) ? b : a)).id;
}

// --- walking: the flood fill of check-walkable.ts, then breadth-first fields towards each goal ---
const STEP = 0.5, X0 = -62, X1 = 302, Z0 = -197, Z1 = 22;
const nx = Math.round((X1 - X0) / STEP), nz = Math.round((Z1 - Z0) / STEP);
const toI = (x: number) => Math.round((x - X0) / STEP), toJ = (z: number) => Math.round((z - Z0) / STEP);
const inGrid = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < nz;
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function flood(world: World): Float32Array {
  const feet = new Float32Array(nx * nz).fill(NaN), queue: number[] = [];
  const s = toJ(SPAWN.z) * nx + toI(SPAWN.x);
  feet[s] = world.groundAt(SPAWN.x, SPAWN.z, 0);
  queue.push(s);
  while (queue.length) {
    const c = queue.pop()!, i = c % nx, j = (c - i) / nx, f = feet[c];
    for (const [di, dj] of N8.slice(0, 4)) {
      const ni = i + di, nj = j + dj, n = nj * nx + ni;
      if (!inGrid(ni, nj) || !Number.isNaN(feet[n])) continue;
      const x = X0 + ni * STEP, z = Z0 + nj * STEP, g = world.groundAt(x, z, f);
      if (g === -Infinity || g < -1 || world.blocked(x, z, g, PLAYER.radius)) continue;
      feet[n] = g;
      queue.push(n);
    }
  }
  return feet;
}

class Paths {
  private world: World;
  private feet: Float32Array;
  private fields = new Map<string, Int32Array>();
  constructor(world: World) { this.world = world; this.feet = flood(world); }
  reset(): void { this.feet = flood(this.world); this.fields.clear(); }
  /** Nearest walkable cell to (x, z). */
  cell(x: number, z: number, y?: number): number {
    const i0 = toI(x), j0 = toJ(z);
    for (let r = 0; r < 12; r++) for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - r; j <= j0 + r; j++) {
      const f = inGrid(i, j) ? this.feet[j * nx + i] : NaN;
      if (!Number.isNaN(f) && (y === undefined || Math.abs(f - y) < 1.2)) return j * nx + i; // not the floor above or below
    }
    return y === undefined ? -1 : this.cell(x, z);
  }
  /** Distances (in cells) to the walkable cells within `r` m of (x, z). */
  field(x: number, z: number, r: number): Int32Array {
    const key = `${toI(x)},${toJ(z)},${r}`;
    let d = this.fields.get(key);
    if (d) return d;
    d = new Int32Array(nx * nz).fill(-1);
    const q: number[] = [];
    for (let i = toI(x - r); i <= toI(x + r); i++) for (let j = toJ(z - r); j <= toJ(z + r); j++) {
      const c = j * nx + i;
      if (inGrid(i, j) && !Number.isNaN(this.feet[c]) && Math.hypot(X0 + i * STEP - x, Z0 + j * STEP - z) <= r) { d[c] = 0; q.push(c); }
    }
    if (!q.length) { const c = this.cell(x, z); if (c >= 0) { d[c] = 0; q.push(c); } }
    for (let h = 0; h < q.length; h++) {
      const c = q[h], i = c % nx, j = (c - i) / nx;
      for (const [di, dj] of N8) {
        const ni = i + di, nj = j + dj, n = nj * nx + ni;
        if (!inGrid(ni, nj) || d[n] >= 0 || Number.isNaN(this.feet[n])) continue;
        if (di && dj && (Number.isNaN(this.feet[j * nx + ni]) || Number.isNaN(this.feet[nj * nx + i]))) continue; // no corner cutting
        if (this.feet[c] - this.feet[n] > PLAYER.step + 0.05) continue; // n -> c must be a step up at most
        d[n] = d[c] + 1;
        q.push(n);
      }
    }
    if (this.fields.size > 24) this.fields.clear();
    this.fields.set(key, d);
    return d;
  }
  /** A point a few cells along the shortest walk from (x, z) towards the field's goal, or undefined if lost. */
  next(d: Int32Array, x: number, y: number, z: number, ahead = 3): { x: number; z: number } | undefined {
    let c = this.cell(x, z, y);
    if (c < 0 || d[c] < 0) return undefined;
    for (let k = 0; k < ahead && d[c] > 0; k++) {
      const i = c % nx, j = (c - i) / nx;
      let best = c;
      for (const [di, dj] of N8) {
        const n = (j + dj) * nx + i + di;
        if (inGrid(i + di, j + dj) && d[n] >= 0 && d[n] < d[best] && this.feet[n] - this.feet[c] <= PLAYER.step + 0.05) best = n;
      }
      if (best === c) break;
      c = best;
    }
    const i = c % nx;
    return { x: X0 + i * STEP, z: Z0 + ((c - i) / nx) * STEP };
  }
}

/**
 * The dodging bot's way out: away from every telegraphed area the feet `p` stand in (a nova or the
 * swarm being channelled, the boss's marks) and every melee swing it sees winding up, REACT s late,
 * or undefined when nothing threatens. Whether a swing can be dodged at all is the mob's numbers' call.
 */
const REACT = 0.3, DODGE = 0.6;
const swings = new Map<Mob, { t: number; go: boolean }>();
function dangers(casters: Priest[], friars: Friar[], p: { x: number; z: number }): { x: number; z: number } | undefined {
  let x = 0, z = 0;
  const seen = (m: Mob) => { // a swing is dodged DODGE of the time: nobody reads every one in a crowd
    const s = swings.get(m);
    if (!s || m.t < s.t) swings.set(m, { t: m.t, go: rnd() < DODGE });
    else s.t = m.t;
    return swings.get(m)!.go;
  };
  const away = (cx: number, cz: number, r: number, side?: { x: number; z: number }) => {
    const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
    if (d >= r) return;
    if (d < 0.3 && side) { x += -(side.z - p.z); z += side.x - p.x; return; } // dead centre: sidestep
    x += dx / Math.max(d, 0.1); z += dz / Math.max(d, 0.1);
  };
  for (const c of casters) {
    if (c.state === 'dead' || c.state === 'pray') continue;
    const L = c.kind.lines;
    if (L) for (const l of c.lines) if (l.t < L.cast - REACT && onLine(l, L.width + 0.8, p)) { // a lace line: step off it sideways
      const side = (p.x - l.x) * l.dz - (p.z - l.z) * l.dx >= 0 ? 1 : -1;
      x += l.dz * side; z += -l.dx * side;
    }
    const S = c.kind.spin;
    if (S && c.state === 'spin' && c.t > REACT && Math.hypot(p.x - c.x, p.z - c.z) < S.length + 1) { // the fuso: run round with the threads, in a gap
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.max(Math.hypot(dx, dz), 0.1);
      x += (dz / d) * 1.2 + (dx / d) * (d < 4 ? 0.6 : d > 6 ? -0.4 : 0); z += (-dx / d) * 1.2 + (dz / d) * (d < 4 ? 0.6 : d > 6 ? -0.4 : 0);
    }
    if (c.state === 'nova' && c.kind.nova) away(c.x, c.z, c.kind.nova.radius + 0.8);
    for (const k of c.marks) away(k.x, k.z, c.kind.phases!.marks!.radius + 0.6, c);
    const m = c.kind.melee; // a swing seen coming (REACT s in): step out of it, if there is time
    if (c.state === 'swing' && m && c.t > REACT && c.t < m.windup && seen(c)) away(c.x, c.z, m.hit + c.kind.radius + 0.3);
  }
  for (const f of friars) if (f.state === 'swing' && f.t > REACT && f.t < FRIAR.windup && seen(f)) away(f.x, f.z, FRIAR.hit + 0.3);
  return x || z ? { x, z } : undefined;
}

// A stand-in for whatever the ability table touches on the Forsaken kit that is only looks.
const NOOP: any = new Proxy(function () {}, { get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : NOOP), apply: () => NOOP });

/** `mana`: spent; `dry`: fight s with too little mana to pray (the heal); in 'viaggio', `time` is s stood waiting for health or mana. */
interface Zone { time: number; hp: number; potions: number; deaths: number; kills: number; lv: number; mana: number; dry: number }

/** One run: the kit, the stats, every mob, the bot. */
class Run {
  readonly level = buildLevel(); // its own: the quest's gates are boxes in its world
  readonly world = this.level.world;
  readonly stats = new PlayerStats();
  readonly gear = new Equipment();
  readonly bag = new Bag(); // only its gold: pieces are worn or sold on the spot
  worn = effects(this.gear.totals);
  looting = false; // the route: kills drop loot
  private looted = new Set<Mob>();
  tierKills: Partial<Record<Tier, number>> = {};
  readonly quest = new Quest(this.world);
  readonly paths = new Paths(this.world);
  readonly friars = spawnGroups(this.world).flat();
  readonly casters: Priest[];
  readonly boss: Priest;
  readonly bees: Priest[];
  readonly l2: Level2; // the second level's casters
  readonly mobs: Mob[];
  private free = new Set<Mob>(); // killed by a victory: worth nothing
  bolts: Bolt[] = [];
  picks: string[] = [];
  time = 0;
  zones = new Map<string, Zone>();
  log: string[] = [];
  // the kit's ability context
  player = { pos: { x: SPAWN.x, y: 0, z: SPAWN.z }, facing: 0, world: this.world, model: NOOP, mesh: NOOP, blink: (d: number) => this.blink(d) };
  vfx = NOOP;
  system: AbilitySystem<Forsaken>;
  magic: Grimoire = new Grimoire(this, tune);
  wisp = 0;
  wispAt = new THREE.Vector3();
  private wispVel = new THREE.Vector3();
  private clouds: { x: number; y: number; z: number; t: number }[] = [];
  private combo = 0;
  private comboT = 9;
  private fallSow = 0;
  private sowT = 0;
  private later: { t: number; f: () => void }[] = [];
  private immune = false;
  private spent = 0;
  target?: Mob;
  src = '';
  dealt = new Map<string, number>(); // on the boss, by source
  casts = new Map<string, number>(); // abilities started, by id
  taken = new Map<string, number>(); // from the boss, by attack (before the hp floor)
  hurt = (inside: (x: number, z: number, m: Mob) => boolean, n: number) => {
    n = crit(n * tune.dmg * HANDS * this.worn.dmg, this.worn.crit, rnd);
    for (const m of this.mobs) if (m.state !== 'dead' && inside(m.x, m.z, m)) {
      if ((m === this.boss || m === this.l2.boss) && FIGHTING.has(m.state)) this.dealt.set(this.src, (this.dealt.get(this.src) ?? 0) + Math.min(n, m.hp));
      if (isCaster(m)) casterHurt(m, n); else friarHurt(m, n);
    }
  };
  aimed = () => this.target;
  foes = () => this.mobs;
  get comboStep(): number { return this.combo; }

  readonly build: string;
  readonly dodge: boolean;
  private worth = new Map<Mob, number>();

  constructor(build: string, dodge: boolean) {
    this.build = build;
    this.dodge = dodge;
    Object.assign(tune, tuneOf([]));
    const c = spawnCasters(this.world, this.level.areas), a = spawnApiary(this.world);
    this.l2 = spawnLevel2(this.world);
    this.casters = [...c.all, ...a.all, ...this.l2.all];
    this.boss = c.boss;
    this.bees = a.all;
    this.mobs = [...this.friars, ...this.casters];
    for (const m of this.mobs) this.worth.set(m, isCaster(m) ? m.kind.xp : FRIAR.xp);
    this.system = new AbilitySystem<Forsaken>(ABILITIES, BAR, this as unknown as Forsaken, START);
    const s = this.stats; // counts what is spent
    this.system.pool = { get mana() { return s.mana; }, spendMana: (n) => s.spendMana(n) && ((this.spent += n), true) };
    this.player.pos.y = this.world.groundAt(SPAWN.x, SPAWN.z, 0);
    this.apply(); // the starter set
  }

  tierOf(m: Mob): Tier {
    if (!isCaster(m)) return 'friar';
    const k = m.kind;
    return k === REVERENDISSIMO || k === GOVERNATRICE ? 'boss' : k === SACERDOTE || k === APE || k === GASTALDO || k === MAESTRA ? 'elite' : k === APETTA ? 'worker' : k === GONDOLIERE ? 'friar' : 'priest';
  }
  levelOf(m: Mob): 1 | 2 { return isCaster(m) && this.l2.all.includes(m) ? 2 : 1; }
  /** A kill's loot: gold banked, a better piece worn (the old one sold), everything else sold. */
  loot(tier: Tier, level: 1 | 2 = 1): void {
    this.tierKills[tier] = (this.tierKills[tier] ?? 0) + 1;
    const d = roll(tier, rnd, level);
    this.bag.gold += d.gold.reduce((a, b) => a + b, 0);
    for (const id of d.items) this.take(id);
  }
  take(id: string): void {
    const it = ITEM.get(id)!, cur = it.slot && ITEM.get(this.gear.worn[it.slot] ?? '');
    if (it.slot && (!cur || worth(it) > worth(cur))) {
      this.gear.worn[it.slot] = id;
      if (cur) this.bag.gold += sellPrice(cur);
      this.apply();
    } else this.bag.gold += sellPrice(it);
  }
  /** Spend the gold on epics, the biggest gain per coin first, while any is affordable. */
  shop(): number {
    let bought = 0;
    for (;;) {
      const gain = (it: ReturnType<typeof shop>[number]) => worth(it) - worth(ITEM.get(this.gear.worn[it.slot!] ?? '') ?? it) * (this.gear.worn[it.slot!] ? 1 : 0);
      const best = shop(this.quest.accepted2).filter((it) => buyPrice(it) <= this.bag.gold && gain(it) > 0).sort((a, b) => gain(b) / buyPrice(b) - gain(a) / buyPrice(a))[0];
      if (!best) return bought;
      this.bag.gold -= buyPrice(best);
      this.take(best.id);
      bought++;
    }
  }
  /** GEAR: what the boss and the elites alone are fought in. */
  dress(kind: string): void {
    if (kind === 'epic') { for (const it of shop(false)) this.gear.worn[it.slot!] = it.id; this.apply(); return; }
    if (kind === 'start') return;
    for (const [tier, n] of Object.entries(TYPICAL)) for (let i = 0; i < n; i++) this.loot(tier as Tier);
    if (kind === 'typical2' || kind === 'buy2') for (const [tier, n] of Object.entries(TYPICAL2)) for (let i = 0; i < n; i++) this.loot(tier as Tier, 2);
    if (kind === 'buy' || kind === 'buy2') this.shop();
  }

  // --- what the ability table calls ---
  swingCombo(): void { this.combo = this.comboT < 1.1 ? (this.combo + 1) % 3 : 0; this.comboT = 0; }
  plague(at?: { x: number; y: number; z: number }, life = tune.plagueLife): void {
    const p = at ?? plagueSpot(this.player.pos, this.player.facing, this.target, this.mobs, this.world);
    if (this.clouds.length >= 6) this.clouds.shift();
    this.clouds.push({ x: p.x, y: this.world.groundAt(p.x, p.z, p.y + 1.5) > -Infinity ? this.world.groundAt(p.x, p.z, p.y + 1.5) : p.y, z: p.z, t: life });
  }
  sowFall(): void {
    if (this.fallSow > 0) return;
    this.fallSow = 3;
    const p = this.player.pos, f = this.player.facing;
    this.plague({ x: p.x - Math.sin(f) * 1.5, y: p.y, z: p.z - Math.cos(f) * 1.5 }, 4);
  }
  at(t: number, f: () => void): void { this.later.push({ t, f }); }
  impale(): void {}
  nova(): void {}
  front(): { x: number; y: number; z: number } { const p = this.player.pos; return { x: p.x, y: p.y + 1.35, z: p.z }; }
  clouded(x: number, z: number): boolean { return this.clouds.some((c) => Math.hypot(x - c.x, z - c.z) < tune.plagueR); }
  faceMark(): void {}
  gather(): void {}
  whirling(): void {}
  swingTrail(): void {}
  blinkHide(): void {}
  beam(): void {}
  healBurst(): void {}
  summonWisp(): void { const p = this.player.pos; this.wispAt.set(p.x, p.y + 2.2, p.z); this.wisp = 60; }
  strikeTarget(): Mob | undefined {
    if (this.target && this.target.state !== 'dead') return this.target;
    return this.nearest(this.mobs.filter((m) => m.state !== 'dead' && this.world.sees(this.player.pos, m)), 30);
  }
  private blink(dist: number): number {
    const p = this.player.pos, dx = -Math.sin(this.player.facing), dz = -Math.cos(this.player.facing);
    let d = 0;
    while (d + 0.2 <= dist && !this.world.blocked(p.x + dx * (d + 0.2), p.z + dz * (d + 0.2), p.y)) d += 0.2;
    p.x += dx * d; p.z += dz * d;
    const g = this.world.groundAt(p.x, p.z, p.y);
    if (g > -Infinity) p.y = g;
    return d;
  }

  /** The kit's frame: Forsaken.update without the looks. */
  private kit(dt: number): void {
    this.comboT += dt;
    this.fallSow -= dt;
    this.src = 'spells'; // casts finishing, channel ticks, blows landing late, bolts, burning, thunderbolts, landings
    this.system.update(dt, () => false);
    for (let i = this.later.length - 1; i >= 0; i--) if ((this.later[i].t -= dt) <= 0) this.later.splice(i, 1)[0].f();
    this.magic.update(dt);
    this.magic.events.length = 0;
    if (this.stats.veil > 0 && tune.veilHeal) this.stats.heal(this.stats.hpMax * tune.veilHeal * dt);
    const immune = this.stats.immune > 0;
    if (this.immune && !immune && tune.wardHeal) this.stats.heal(this.stats.hpMax * tune.wardHeal);
    this.immune = immune;
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      if ((c.t -= dt) <= 0) { this.clouds.splice(i, 1); continue; }
      this.src = 'plague';
      this.hurt((x, z, m) => Math.hypot(x - c.x, z - c.z) < tune.plagueR && this.world.sees(c, m), tune.plagueDps * dt);
    }
    if (this.wisp > 0) {
      const p = this.player.pos, f = this.player.facing, w = this.wispAt, foe = wispFoe(p, this.target, this.mobs, this.world);
      const a = this.time * 2.4, bob = Math.sin(this.time * 2.3) * 0.15;
      const tx = foe ? foe.x + Math.cos(a) * 0.7 : p.x + Math.cos(f) * 0.8 + Math.sin(f) * 0.5;
      const tz = foe ? foe.z + Math.sin(a) * 0.7 : p.z - Math.sin(f) * 0.8 + Math.cos(f) * 0.5;
      const ty = (foe ? foe.y + 1.4 : p.y + 2.1) + bob;
      this.wispVel.set(tx - w.x, ty - w.y, tz - w.z).multiplyScalar(4);
      w.addScaledVector(this.wispVel, Math.min(dt, 0.1));
      if (tune.fxWisp && (this.sowT -= dt) <= 0) { this.sowT = 6; this.plague({ x: w.x, y: p.y, z: w.z }, 6); }
      this.src = 'wisp';
      if (this.wispVel.length() > 0.6) this.hurt((x, z) => Math.hypot(x - w.x, z - w.z) < tune.wispR, tune.wispDps * dt);
      this.wisp -= dt;
    }
  }

  get xp(): number { return [...this.worth].reduce((s, [m, xp]) => s + (m.state === 'dead' && !this.free.has(m) ? xp : 0), 0) + this.quest.bonusXp; }
  /** The Reverendissimo is dead: as in the game, everyone of level 1 falls with him, for nothing; out of the portone. */
  victory1(): void {
    this.quest.win();
    this.quest.out = true;
    for (const m of [...this.friars, ...this.casters]) if (!this.l2.all.includes(m as Priest) && m.state !== 'dead') { this.free.add(m); m.state = 'dead'; m.hp = 0; }
  }
  levelUp(): void {
    const lv = levelOf(this.xp).lv;
    while (this.picks.length < lv - 1) {
      const id = choose(this.build, this.picks);
      this.picks.push(id);
      this.apply();
      if (id === 'linfa') { this.stats.heal(this.stats.hpMax * 0.3); this.stats.restoreMana(this.stats.manaMax * 0.3); }
    }
  }
  apply(): void {
    Object.assign(tune, tuneOf(this.picks));
    this.worn = effects(this.gear.totals);
    this.stats.grow(tune.hp, tune.mana, this.worn.hp, this.worn.mana);
    this.stats.armor = tune.armor * (1 - this.worn.cut);
    this.stats.regen = tune.regen + this.worn.regen;
    this.system.castMul = 1 / this.worn.haste;
    this.system.chargeMul = tune.fury;
    this.system.chargeAfter = tune.furyStart;
    for (const id of tune.owned) this.system.unlock(id);
  }
  get lv(): number { return this.picks.length + 1; }

  nearest(ms: Mob[], max = Infinity): Mob | undefined {
    const p = this.player.pos;
    let best: Mob | undefined, bd = max;
    for (const m of ms) { const d = Math.hypot(m.x - p.x, m.z - p.z); if (d < bd) { bd = d; best = m; } }
    return best;
  }
  zoneOf(m: Mob): string {
    if (!isCaster(m)) return 'orto';
    if (m.kind === APE || m.kind === APETTA) return 'apiario';
    if (m.kind === REVERENDISSIMO) return 'boss';
    if (m.kind === GOVERNATRICE || m.kind === VELO) return 'boss2';
    if (m.kind === MAESTRA || m.mates.some((x) => x.kind === MAESTRA)) return 'maestra';
    if (m.kind === GASTALDO || m.mates.some((x) => x.kind === GASTALDO)) return 'gastaldo';
    if (this.l2.all.includes(m)) return m.kind === ZITELLA ? 'ospizio' : 'fond.2';
    const a = this.level.areaAt(m.home.x, m.home.z);
    return /^Chiostr/.test(a?.label ?? '') ? 'chiostri' : a?.zone === 'chiesa' ? 'chiesa' : 'laguna';
  }
  zone(name: string): Zone {
    let z = this.zones.get(name);
    if (!z) this.zones.set(name, (z = { time: 0, hp: 0, potions: 0, deaths: 0, kills: 0, lv: 0, mana: 0, dry: 0 }));
    return z;
  }

  /** Move the feet towards (dx, dz) at run speed, sliding on walls. Returns m moved. */
  private walk(dx: number, dz: number, dt: number): number {
    const p = this.player.pos, l = Math.hypot(dx, dz);
    if (l < 1e-6) return 0;
    const x = p.x, z = p.z, s = 6 * tune.speed * dt;
    p.x += (dx / l) * s; p.z += (dz / l) * s;
    this.world.resolve(p, p.y);
    const g = this.world.groundAt(p.x, p.z, p.y);
    if (g > -Infinity) p.y = g;
    if (!this.target || !FIGHTING.has(this.target.state)) this.player.facing = Math.atan2(-dx, -dz);
    return Math.hypot(p.x - x, p.z - z);
  }
  /** Run along (dx, dz), or the nearest heading round it that a wall or pew doesn't stop (a player steers). */
  private flee(dx: number, dz: number, dt: number): void {
    const p = this.player.pos, a0 = Math.atan2(dz, dx);
    for (const da of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2.2, -2.2]) {
      const a = a0 + da, q = { x: p.x + Math.cos(a) * 0.5, z: p.z + Math.sin(a) * 0.5 };
      this.world.resolve(q, p.y);
      if (Math.hypot(q.x - p.x, q.z - p.z) > 0.4 && Math.abs(this.world.groundAt(q.x, q.z, p.y) - p.y) < PLAYER.step) { this.walk(Math.cos(a), Math.sin(a), dt); return; }
    }
    this.walk(dx, dz, dt);
  }
  private stuck = 0;
  /** Head for (x, z): straight while that works, along the grid path when walls are in the way. */
  private go(x: number, z: number, r: number, dt: number): void {
    const p = this.player.pos;
    if (this.stuck <= 0) {
      const moved = this.walk(x - p.x, z - p.z, dt);
      if (moved < 6 * dt * 0.4) this.stuck = 1.5;
      return;
    }
    this.stuck -= dt;
    const n = this.paths.next(this.paths.field(x, z, r), p.x, p.y, p.z);
    if (n) this.walk(n.x - p.x, n.z - p.z, dt);
  }
  private slow = 0;
  private best = { d: Infinity, t: 0, f: undefined as Int32Array | undefined };
  private wander = { t: 0, x: 0, z: 0 };
  private travel(x: number, z: number, r: number, dt: number): void {
    const p = this.player.pos, f = this.paths.field(x, z, r), c = this.paths.cell(p.x, p.z, p.y), d = c >= 0 ? f[c] : -1;
    // No nearer to the goal for 3 s: wedged on a stair side or a corner, so wander off a moment.
    if (this.best.f !== f || (d >= 0 && d < this.best.d)) this.best = { d: d >= 0 ? d : Infinity, t: this.time, f };
    else if (this.time - this.best.t > 3) { const a = rnd() * Math.PI * 2; this.wander = { t: 0.7, x: Math.cos(a), z: Math.sin(a) }; this.best = { d: Infinity, t: this.time, f }; }
    if ((this.wander.t -= dt) > 0) { this.walk(this.wander.x, this.wander.z, dt); return; }
    const n = this.paths.next(f, p.x, p.y, p.z, this.slow > 0 ? 1 : 3);
    this.slow -= dt;
    const moved = n ? this.walk(n.x - p.x, n.z - p.z, dt) : this.walk(x - p.x, z - p.z, dt);
    if (moved < 6 * dt * 0.4) this.slow = 1; // a corner clipped: cell by cell for a while
  }

  private cast(id: string): boolean {
    const i = this.system.slots.findIndex((a) => a?.id === id);
    this.src = id;
    const ok = i >= 0 && this.system.owns(id) && this.system.tryCast(i);
    if (ok) this.casts.set(id, (this.casts.get(id) ?? 0) + 1);
    return ok;
  }
  private ready(id: string): boolean {
    const a = ABILITIES.find((b) => b.id === id)!;
    return this.system.owns(id) && this.system.cooldown(a) === 0 && this.system.affordable(a) && this.system.charged(a);
  }

  /** One frame of the bot and the this.world. `goal`: where the route goes next while nobody fights. */
  step(goal: { x: number; z: number; r: number; boss?: boolean }): void {
    const dt = DT, p = this.player.pos, s = this.stats;
    this.time += dt;
    const engaged = this.mobs.filter((m) => FIGHTING.has(m.state));
    if (engaged.length) this.best.t = this.time; // fighting is not being stuck
    if (!this.target || !FIGHTING.has(this.target.state)) this.target = this.nearest(engaged);
    if (this.target && isCaster(this.target) && veiled(this.target)) this.target = this.nearest(this.target.wards!.filter((w) => FIGHTING.has(w.state))) ?? this.target; // her veil: the girls first
    const t = this.target;
    const hp0 = s.hp;

    // Defensive cooldowns first: they are off the GCD or worth it.
    const low = s.hp / s.hpMax;
    if (low < 0.45 || (!engaged.length && low < 0.7)) { if (this.ready('potion') && this.cast('potion')) this.zone(t ? this.zoneOf(t) : 'viaggio').potions++; }
    if (engaged.length && low < 0.4 && this.ready('ward')) this.cast('ward');
    if (engaged.length && low < 0.6 && s.veil <= 0 && this.ready('veil')) this.cast('veil');

    if (this.magic.dashing) { this.tickWorld(dt, hp0, t); return; } // carried by a leap or a charge
    const danger = this.dodge ? dangers(this.casters, this.friars, p) : undefined;
    if (danger) {
      if (this.system.casting) this.system.cancel();
      this.flee(danger.x, danger.z, dt);
      if (t) this.player.facing = Math.atan2(-(t.x - p.x), -(t.z - p.z));
      if (t && Math.hypot(t.x - p.x, t.z - p.z) < tune.fallRange) this.cast('fall');
    } else if (t) {
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      this.player.facing = Math.atan2(-(t.x - p.x), -(t.z - p.z));
      const big = isCaster(t) && (t.kind === REVERENDISSIMO || t.kind === APE || t.kind === GOVERNATRICE || t.kind === MAESTRA || t.kind === GASTALDO);
      if (!this.system.casting) {
        // the heal: a long cast, pushed back by every hit taken, so only worth it below 55%
        if (low < 0.55 && this.ready('mend')) { if (this.cast('mend') || this.system.casting) { this.tickWorld(dt, hp0, t); return; } }
        if (this.wisp <= 0 && this.ready('wisp') && d > 3) { if (this.cast('wisp') || this.system.casting) { this.tickWorld(dt, hp0, t); return; } }
        if (this.ready('plague') && d < 20) this.cast('plague');
        if (this.ready('strike') && d < 30) this.cast('strike');
        // fire, frost, lightning and the new blows: long casts only standing, the stiletto on the frozen
        const around = (r: number) => engaged.filter((m) => Math.hypot(m.x - p.x, m.z - p.z) < r).length;
        const cool = s.mana > s.manaMax * 0.35; // keeps a reserve for the frost nova and the stiletto
        if (this.ready('font') && (around(4.5) >= 2 || (big && d < 4.5))) this.cast('font');
        if (this.ready('lance') && t.cc && frozen(t.cc) && d < 30) this.cast('lance');
        if (this.ready('toll') && d < 25 && (around(8) >= 2 || big)) this.cast('toll');
        if (this.ready('charge') && d > 5 && d < 18) this.cast('charge');
        if (!this.magic.dashing && this.ready('leap') && d > 4 && d < 11) this.cast('leap');
        if (this.ready('whirl') && (around(3) >= 2 || (big && d < 3))) this.cast('whirl');
        if (this.ready('grace') && d < 2.8 && t.hp < (isCaster(t) ? t.kind.hp : FRIAR.hp) * 0.6) this.cast('grace');
        if (this.ready('chain') && d < 28 && (cool || around(10) >= 2)) { if (this.cast('chain') || this.system.casting) { this.tickWorld(dt, hp0, t); return; } }
        if (this.ready('pyre') && d < 28 && cool) { if (this.cast('pyre') || this.system.casting) { this.tickWorld(dt, hp0, t); return; } }
        if (this.ready('frost') && d < 28 && d > tune.fallRange && cool) { if (this.cast('frost') || this.system.casting) { this.tickWorld(dt, hp0, t); return; } }
        const near = engaged.filter((m) => Math.hypot(m.x - p.x, m.z - p.z) < tune.novaR).length;
        if (this.ready('nova') && (near >= 2 || (big && d < tune.novaR))) this.cast('nova');
        const wait = this.dodge && isCaster(t) && t.state === 'nova'; // don't walk back into a ring still filling
        if (!wait && this.ready('step') && d > 6 && d < 9) this.cast('step');
        if (!wait && d > tune.fallRange - 0.5) this.go(t.x, t.z, 1.5, dt);
        if (d < tune.fallRange) this.cast('fall');
      }
    } else if (low < 0.85 && !this.system.casting && this.ready('mend')) { // between pulls the prayer heals up
      this.cast('mend');
    } else if (this.system.casting?.ability.id === 'mend') { // stand still for it
    } else if (!(this.dodge && ((low < 0.7 && !this.ready('potion')) || (goal.boss && s.mana < s.manaMax * 0.6)))) { // a careful player waits for the potion before the next pull, for mana before the boss
      this.travel(goal.x, goal.z, goal.r, dt);
    } else this.zone('viaggio').time += dt;
    this.tickWorld(dt, hp0, t);
  }

  private tickWorld(dt: number, hp0: number, t?: Mob): void {
    const p = this.player.pos, s = this.stats;
    this.kit(dt);
    s.update(dt);
    let dmg = 0;
    for (const f of this.friars) dmg += friarThink(f, p, this.world, dt);
    separate(this.friars, this.world);
    for (const c of this.casters) {
      const was = c.state, d = casterThink(c, p, this.world, dt, this.bolts);
      if ((c === this.boss || c === this.l2.boss) && d > 0) { const k = was === 'swing' ? 'melee' : was === 'nova' && c.state !== 'nova' ? 'nova' : 'marks'; this.taken.set(k, (this.taken.get(k) ?? 0) + d * this.stats.armor * (this.stats.veil > 0 ? 0.5 : 1) * (this.stats.immune > 0 ? 0 : 1)); }
      dmg += d;
    }
    separate(this.casters, this.world);
    dmg += fly(this.bolts, p, dt, [], this.world);
    if (dmg > 0 && s.takeDamage(dmg) > 0) this.system.pushback(); // the game's onHurt
    if (this.looting) for (const m of this.mobs) if (m.state === 'dead' && !this.looted.has(m) && !this.free.has(m)) { this.looted.add(m); this.loot(this.tierOf(m), this.levelOf(m)); }
    if (!this.quest.key2 && this.l2.maestra.state === 'dead') this.quest.takeKey2();
    this.zone(t ? this.zoneOf(t) : 'viaggio').mana += this.spent;
    this.spent = 0;
    if (t) {
      const z = this.zone(this.zoneOf(t));
      z.time += dt;
      if (s.mana < MEND.mana) z.dry += dt;
      z.hp += Math.max(0, hp0 - s.hp);
      z.lv = this.lv;
    }
    this.levelUp();
    if (s.dead) this.die(t);
  }

  deaths = 0;
  private die(t?: Mob): void {
    this.deaths++;
    this.zone(t ? this.zoneOf(t) : 'viaggio').deaths++;
    wipe(this.friars);
    wipe(this.casters);
    this.bolts.length = 0;
    this.system.cancel();
    this.magic.reset();
    this.target = undefined;
    // lie there FALLEN s while the world plays on, then wake at the checkpoint
    for (let k = 0; k < 2.6 / DT; k++) {
      for (const f of this.friars) friarThink(f, this.player.pos, this.world, DT);
      for (const c of this.casters) casterThink(c, this.player.pos, this.world, DT, this.bolts);
      this.bolts.length = 0;
      this.time += DT;
    }
    const at = this.quest.checkpoint();
    Object.assign(this.player.pos, { x: at.x, y: this.world.standHeight(at.x, at.z), z: at.z });
    this.stats.revive();
  }
}

// --- the route ---
interface Goal { name: string; x: number; z: number; r: number; y?: number; boss?: boolean; done?: (r: Run) => void; until?: (r: Run) => boolean }
const GRATE = { x: -7.5, z: -86 };
function route(apiary: boolean): Goal[] {
  return [
    { name: 'npc', x: NPC.x, z: NPC.z, r: 2.2, done: (r) => { r.quest.accepted = true; } },
    ...(apiary ? [{ name: 'apiario', x: APIARY.x, z: APIARY.z + 3, r: 2, until: (r: Run) => r.bees.every((b) => b.state === 'dead') }] : []),
    { name: 'chiave', x: CHEST.x, z: CHEST.z, r: 2.2, done: (r) => r.quest.takeKey() },
    { name: 'grata', x: GRATE.x, z: GRATE.z, r: 2.2, done: (r) => { r.quest.open(r.quest.gates.find((g) => g.id === 'grata-nord')!); r.paths.reset(); } },
    { name: 'coro', x: CHOIR_DOOR.x, z: CHOIR_DOOR.z, y: CHURCH_FLOOR + 0.6, r: 1.6, done: (r) => { r.quest.open(r.quest.gates.find((g) => g.id === 'coro')!); r.paths.reset(); } },
    { name: 'boss', x: BOSS_AT.x, z: BOSS_AT.z, r: 3, boss: true, until: (r) => r.boss.state === 'dead' },
  ];
}

/**
 * Level 2: report to Fra' Zuane and take La dote delle Zitelle, then east along the fondamenta through the packs a
 * player meets on the way (the campo, the squero's Gastaldo and the sagrato among them; the campiello, the far
 * sagrato, the refettorio, the dormitorio, the infermeria and the orto left), into the ospizio, the Maestra and her
 * key, the court, the back door, the Governatrice.
 */
const ON_THE_WAY = [0, 2, 3, 4, 5, 6, 9, 10, 11, 12];
const BACK = { x: 240, z: -33 };
function route2(r: Run): Goal[] {
  const pack = (i: number): Goal => {
    const p = PACKS[i], ms = r.l2.all.filter((m) => p.members.some(([k, x, z]) => m.kind === k && m.home.x === x && m.home.z === z));
    return { name: p.label, x: p.at[0], z: p.at[1], r: 2.5, until: () => ms.every((m) => m.state === 'dead') };
  };
  return [
    { name: 'zuane', x: NPC.x, z: NPC.z, r: 2.2, done: (r) => { r.quest.report(); r.quest.accept2(); r.paths.reset(); } },
    ...ON_THE_WAY.map(pack),
    { name: 'porta', x: BACK.x, z: BACK.z, r: 1.6, done: (r) => { r.quest.open(r.quest.gate('coro-zitelle')); r.paths.reset(); } },
    { name: 'boss2', x: GOV_AT.x, z: GOV_AT.z, y: ZF, r: 3, boss: true, until: (r) => r.l2.boss.state === 'dead' },
  ];
}

const LIMIT = 45 * 60; // s of play before a run is called off
/** Kills by tier on a typical route up to the choir door (the mean of `npm run balance`'s runs): the loot of GEAR=typical. */
const TYPICAL: Record<string, number> = { friar: 32, priest: 32, elite: 3, worker: 3 };
/** Level 2's kills on the way to the Governatrice (ON_THE_WAY; GEAR=typical2: level 1's typical, then these). */
const TYPICAL2: Record<string, number> = { friar: 11, priest: 15, elite: 2 };

export interface RouteResult { build: string; dodge: boolean; won: boolean; time: number; deaths: number; lv: number; xp: number; zones: Map<string, Zone>; picks: string[]; boss: number; gold: number; gear: GearState; kills: Partial<Record<Tier, number>>; l2?: { won: boolean; time: number; deaths: number; lv0: number; lv: number; xp: number; boss: number; kills: Partial<Record<Tier, number>> } }

export function playRoute(build: string, dodge: boolean, s = 1, apiary = true, level2 = false): RouteResult {
  swings.clear();
  const r = new Run(build, dodge);
  seed = s * 7919; // after the level is built: its first build draws on Math.random more than the next ones
  r.looting = true;
  let bossT = 0, gold = 0, gear: GearState = {}, kills = {};
  for (const g of route(apiary)) {
    const reached = () => Math.hypot(r.player.pos.x - g.x, r.player.pos.z - g.z) < g.r + 0.6 && (g.y === undefined || Math.abs(r.player.pos.y - g.y) < 1);
    while (r.time < LIMIT && !(g.until ? g.until(r) : reached() && !r.target)) {
      if (g.name === 'boss' && FIGHTING.has(r.boss.state)) bossT += DT;
      r.step(g);
    }
    if (r.time >= LIMIT) break;
    g.done?.(r);
    if (g.name === 'coro') { gold = r.bag.gold; gear = r.gear.encode(); kills = { ...r.tierKills }; } // what the hero has walking in on the boss
  }
  const out: RouteResult = { build, dodge, won: r.boss.state === 'dead', time: r.time, deaths: r.deaths, lv: r.lv, xp: r.xp, zones: r.zones, picks: r.picks, boss: bossT, gold, gear, kills };
  if (!level2 || !out.won) return out;
  // Level 2 from where level 1 left the hero: its level, its gear, its gold unspent.
  r.victory1();
  const t0 = r.time, d0 = r.deaths, lv0 = r.lv, k0 = { ...r.tierKills };
  let boss2 = 0;
  for (const g of route2(r)) {
    const reached = () => Math.hypot(r.player.pos.x - g.x, r.player.pos.z - g.z) < g.r + 0.6 && (g.y === undefined || Math.abs(r.player.pos.y - g.y) < 1);
    while (r.time < t0 + LIMIT && !(g.until ? g.until(r) : reached() && !r.target)) {
      if (g.name === 'boss2' && FIGHTING.has(r.l2.boss.state)) boss2 += DT;
      r.step(g);
    }
    if (r.time >= t0 + LIMIT) break;
    g.done?.(r);
  }
  const kills2 = Object.fromEntries(Object.entries(r.tierKills).map(([k, v]) => [k, v - (k0[k as Tier] ?? 0)]));
  if (process.env.DBG) for (const m of r.l2.all) if (m.state !== "dead" && Math.abs(m.x - r.player.pos.x) < 40) console.log(m.kind.hp, m.state, "y", m.y, r.player.pos.y, m.x.toFixed(1), m.z.toFixed(1), m.hp.toFixed(0), "player", r.player.pos.x.toFixed(1), r.player.pos.z.toFixed(1));
  out.l2 = { won: r.l2.boss.state === 'dead', time: r.time - t0, deaths: r.deaths - d0, lv0, lv: r.lv, xp: r.xp, boss: boss2, kills: kills2 };
  out.picks = r.picks;
  out.zones = r.zones;
  return out;
}

export interface BossResult { build: string; lv: number; gear: string; picks: string[]; dodge: boolean; won: boolean; tries: { time: number; left: number; potions: number }[]; dry: number; dealt: Map<string, number>; taken: Map<string, number>; casts: Map<string, number> }

/** The boss alone: the church cleared, the choir door open, a build at level `lv`, five tries at most. */
export function playBoss(build: string, lv: number, dodge: boolean, s = 1, gear = process.env.GEAR ?? 'typical', second = false): BossResult {
  swings.clear();
  const r = new Run(build, dodge);
  seed = s * 7919; // after the level is built: its first build draws on Math.random more than the next ones
  r.dress(gear);
  r.picks = process.env.PICKS ? process.env.PICKS.split(',') : lv > 1 ? picksTo(build, lv) : []; // PICKS=a,b,c: a fixed build
  r.apply();
  r.stats.revive();
  r.quest.accepted = true;
  r.quest.takeKey();
  for (const g of r.quest.gates) if (g.needs === 'key') r.quest.open(g);
  const boss = second ? r.l2.boss : r.boss, zone = second ? 'boss2' : 'boss';
  if (second) { r.quest.win(); r.quest.out = true; r.quest.report(); r.quest.accept2(); r.quest.takeKey2(); r.quest.open(r.quest.gate('coro-zitelle')); }
  r.paths.reset();
  for (const m of r.mobs) if (m !== boss && !(second && (m as Priest).kind === VELO)) { m.state = 'dead'; m.hp = 0; }
  r.levelUp = () => {}; // the level is fixed
  const at = r.quest.checkpoint();
  Object.assign(r.player.pos, { x: at.x, y: r.world.standHeight(at.x, at.z), z: at.z });
  const goal = second ? { x: GOV_AT.x, z: GOV_AT.z, r: 3, boss: true } : { x: BOSS_AT.x, z: BOSS_AT.z, r: 3, boss: true }, tries: BossResult['tries'] = [];
  let t0 = -1, pots = 0, deaths = 0;
  while (r.time < LIMIT && boss.state !== 'dead' && tries.length < 5) {
    const was = r.stats.dead, z = r.zone(zone), p0 = z.potions;
    if (FIGHTING.has(boss.state) && t0 < 0) t0 = r.time;
    r.step(goal);
    pots += z.potions - p0;
    if (r.deaths > deaths || (was && !r.stats.dead)) {
      deaths = r.deaths;
      tries.push({ time: t0 >= 0 ? r.time - t0 : 0, left: boss.kind.hp, potions: pots });
      t0 = -1; pots = 0;
    }
    if ((boss.state as string) === 'dead') tries.push({ time: r.time - t0, left: 0, potions: pots });
  }
  return { build, lv, gear, picks: r.picks, dodge, won: boss.state === 'dead', tries, dry: r.zone(zone).dry / Math.max(r.zone(zone).time, 1e-9), dealt: r.dealt, taken: r.taken, casts: r.casts };
}

export interface EliteResult { build: string; lv: number; elite: string; dodge: boolean; won: boolean; time: number; potions: number; lost: number }

/**
 * A miniboss alone, one life: a garden's sacerdote and its two priests (the garden by the seed) or the
 * giant bee and her workers, a build at level `lv`, everything else on the map dead. Won if the
 * group falls before the hero does.
 */
export function playElite(build: string, lv: number, elite: 'sacerdote' | 'ape' | 'maestra' | 'gastaldo', dodge: boolean, s = 1): EliteResult {
  swings.clear();
  const r = new Run(build, dodge);
  seed = s * 7919;
  r.dress(process.env.GEAR ?? 'typical');
  r.picks = lv > 1 ? picksTo(build, lv) : [];
  r.apply();
  r.stats.revive();
  r.quest.accepted = true;
  r.quest.takeKey();
  for (const g of r.quest.gates) if (g.needs === 'key') r.quest.open(g);
  r.paths.reset();
  const garden = GARDENS[s % GARDENS.length];
  if (elite === 'maestra' || elite === 'gastaldo') { r.quest.win(); r.quest.out = true; r.quest.report(); r.quest.accept2(); r.paths.reset(); }
  const group = elite === 'ape' ? r.bees : elite === 'maestra' ? r.l2.maestra.mates : elite === 'gastaldo' ? r.l2.gastaldo.mates : r.casters.find((c) => c.kind === SACERDOTE && r.level.areaAt(c.home.x, c.home.z)?.label === garden)!.mates;
  for (const m of r.mobs) if (!group.includes(m as Priest)) { m.state = 'dead'; m.hp = 0; }
  r.levelUp = () => {};
  const g0 = group[0], goal = { x: g0.home.x, z: g0.home.z, r: 2 };
  let t0 = -1, pots = 0, lost = 0;
  while (r.time < 15 * 60 && !r.deaths && group.some((m) => m.state !== 'dead')) {
    if (t0 < 0 && group.some((m) => FIGHTING.has(m.state))) t0 = r.time;
    const z = r.zone(elite === 'ape' ? 'apiario' : elite === 'sacerdote' ? 'laguna' : elite), p0 = z.potions;
    const h0 = r.stats.hp;
    r.step(goal);
    if (t0 >= 0) lost += Math.max(0, h0 - r.stats.hp) / r.stats.hpMax;
    pots += z.potions - p0;
  }
  return { build, lv, elite, dodge, won: !r.deaths && group.every((m) => m.state === 'dead'), time: t0 >= 0 ? r.time - t0 : 0, potions: pots, lost };
}

// --- reports ---
const ZONES = ['orto', 'apiario', 'laguna', 'chiostri', 'chiesa', 'boss', 'fond.2', 'gastaldo', 'ospizio', 'maestra', 'boss2', 'viaggio'];
const pad = (s: string | number, n: number) => String(s).padStart(n);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
const f1 = (x: number) => (Math.round(x * 10) / 10).toString();

/** One build's runs on the route: each run in a line, then the zones averaged over the runs. */
export function routeTable(rs: RouteResult[]): string {
  const r0 = rs[0], out = [`\n${r0.build}${r0.dodge ? '' : ' (no dodge)'}, ${rs.length} runs`];
  for (const r of rs) {
    out.push(`  ${r.won ? 'boss down' : 'NOT FINISHED'} in ${(r.time / 60).toFixed(1)} min, ${r.deaths} deaths, level ${r.lv} (${r.xp} XP), boss fight ${r.boss.toFixed(0)} s; picks ${r.picks.join(' ')}`);
    out.push(`    at the boss: ${r.gold} gold, ${gearLine(r.gear)}; kills ${Object.entries(r.kills).map(([k, v]) => `${k} ${v}`).join(' ')}`);
    if (r.l2) out.push(`    level 2: ${r.l2.won ? 'Governatrice down' : 'NOT FINISHED'} in ${(r.l2.time / 60).toFixed(1)} min, ${r.l2.deaths} deaths, level ${r.l2.lv0} -> ${r.l2.lv} (${r.l2.xp} XP), boss fight ${r.l2.boss.toFixed(0)} s; kills ${Object.entries(r.l2.kills).map(([k, v]) => `${k} ${v}`).join(' ')}`);
  }
  out.push(`  ${'zone'.padEnd(9)}${pad('fight s', 8)}${pad('hp lost', 8)}${pad('potions', 8)}${pad('deaths', 7)}${pad('level', 6)}${pad('mana', 7)}${pad('dry %', 7)}`);
  for (const k of ZONES) {
    const zs = rs.map((r) => r.zones.get(k)).filter((z) => z) as Zone[];
    if (!zs.length) continue;
    const m = (f: (z: Zone) => number) => mean(rs.map((r) => (r.zones.get(k) ? f(r.zones.get(k)!) : 0)));
    out.push(`  ${k.padEnd(9)}${pad(m((z) => z.time).toFixed(0), 8)}${pad(Math.round(m((z) => z.hp)), 8)}${pad(f1(m((z) => z.potions)), 8)}${pad(f1(m((z) => z.deaths)), 7)}${pad(k === 'viaggio' ? '' : f1(mean(zs.map((z) => z.lv))), 6)}${pad(Math.round(m((z) => z.mana)), 7)}${pad(k === 'viaggio' ? '' : Math.round((100 * m((z) => z.dry)) / Math.max(m((z) => z.time), 1e-9)), 7)}`);
  }
  return out.join('\n');
}
/** What a set is: pieces by quality and the stats it adds. */
function gearLine(g: GearState): string {
  const its = Object.values(g).map((id) => ITEM.get(id!)!), n = (r: string) => its.filter((i) => i.rarity === r).length, e = effects(totals(Object.values(g)));
  return `${n('epico')} epic ${n('raro')} rare ${n('noncomune')} green ${n('comune')} white: +${e.hp} hp +${e.mana} mana, ${Math.round(e.cut * 100)}% armor, +${Math.round((e.dmg - 1) * 100)}% dmg, ${e.crit}% crit, +${Math.round((e.haste - 1) * 100)}% haste`;
}
/** The boss alone: per build, level and gear, wins, tries to the first kill, the kill time and potions. */
export function bossTable(rs: BossResult[]): string {
  const out = [`${'build'.padEnd(8)}${pad('level', 6)} ${'gear'.padEnd(8)}${'bot'.padEnd(9)}${pad('wins', 6)}${pad('tries', 7)}${pad('kill s', 8)}${pad('pots', 6)}${pad('dry %', 7)}  died at (s)`];
  const key = (r: BossResult) => `${r.build}|${r.lv}|${r.gear}|${r.dodge}`;
  for (const k of [...new Set(rs.map(key))]) {
    const g = rs.filter((r) => key(r) === k), won = g.filter((r) => r.won), r0 = g[0];
    const kills = won.map((r) => r.tries[r.tries.length - 1]);
    out.push(`${r0.build.padEnd(8)}${pad(r0.lv, 6)} ${r0.gear.padEnd(8)}${(r0.dodge ? 'dodge' : 'no dodge').padEnd(9)}${pad(`${won.length}/${g.length}`, 6)}${pad(won.length ? f1(mean(won.map((r) => r.tries.length))) : '-', 7)}` +
      `${pad(won.length ? mean(kills.map((t) => t.time)).toFixed(0) : '-', 8)}${pad(won.length ? f1(mean(kills.map((t) => t.potions))) : '-', 6)}${pad(Math.round(100 * mean(g.map((r) => r.dry))), 7)}  ` +
      g.flatMap((r) => r.tries.filter((t) => t.left).map((t) => t.time.toFixed(0))).join(' '));
    if (process.env.DEALT) for (const r of g) out.push(`    ${r.picks.join(' ')}\n    dealt: ${[...r.dealt].map(([d, v]) => `${d} ${Math.round(v)}`).join(', ')}; taken: ${[...r.taken].map(([d, v]) => `${d} ${Math.round(v)}`).join(', ')}\n    casts: ${[...r.casts].map(([d, v]) => `${d} ${v}`).join(', ')}`);
  }
  return out.join('\n');
}

/** Minibosses alone: per elite, build and level, wins (one life each), the fight's length and potions. */
export function eliteTable(rs: EliteResult[]): string {
  const out = [`${'elite'.padEnd(10)}${'build'.padEnd(8)}${pad('level', 6)} ${'bot'.padEnd(9)}${pad('wins', 7)}${pad('fight s', 8)}${pad('pots', 6)}${pad('hp lost', 9)}`];
  const key = (r: EliteResult) => `${r.elite}|${r.build}|${r.lv}|${r.dodge}`;
  for (const k of [...new Set(rs.map(key))]) {
    const g = rs.filter((r) => key(r) === k), r0 = g[0], won = g.filter((r) => r.won);
    out.push(`${r0.elite.padEnd(10)}${r0.build.padEnd(8)}${pad(r0.lv, 6)} ${(r0.dodge ? 'dodge' : 'no dodge').padEnd(9)}${pad(`${won.length}/${g.length}`, 7)}` +
      `${pad(won.length ? mean(won.map((r) => r.time)).toFixed(0) : '-', 8)}${pad(won.length ? f1(mean(won.map((r) => r.potions))) : '-', 6)}${pad(`${Math.round(mean(g.map((r) => r.lost)) * 100)}%`, 9)}`);
  }
  out.push(`elites at 6-8, dodging: ${rs.filter((r) => r.dodge && r.won).length}/${rs.filter((r) => r.dodge).length} won`);
  return out.join('\n');
}

if (process.argv[1]?.endsWith('balance.ts')) {
  const [mode, build, n, seeds] = process.argv.slice(2);
  const runs = (k: number, f: (s: number) => void) => { for (let s = 1; s <= k; s++) f(s); };
  const t0 = performance.now();
  if (mode === 'boss' || mode === 'boss2') {
    const rs: BossResult[] = [], two = mode === 'boss2';
    for (const d of [true, false]) runs(Number(seeds ?? 3), (s) => rs.push(playBoss(build ?? 'mixed', Number(n ?? (two ? 11 : 9)), d, s, process.env.GEAR ?? (two ? 'typical2' : 'typical'), two)));
    console.log(bossTable(rs));
  } else if (mode === 'elite2') {
    const rs: EliteResult[] = [];
    for (const e of ['gastaldo', 'maestra'] as const) for (const d of [true, false]) for (const b of Object.keys(BUILDS)) for (const lv of [9, 10, 11]) runs(Number(build ?? 3), (s) => rs.push(playElite(b, lv, e, d, s)));
    console.log(eliteTable(rs));
  } else if (mode === 'route2') {
    const rs: RouteResult[] = [];
    runs(Number(n ?? 3), (s) => rs.push(playRoute(build ?? 'mixed', !process.env.NODODGE, s, true, true)));
    console.log(routeTable(rs));
  } else if (mode === 'elite') {
    const rs: EliteResult[] = [];
    for (const e of ['sacerdote', 'ape'] as const) for (const d of [true, false]) for (const b of Object.keys(BUILDS)) for (const lv of [6, 7, 8]) runs(Number(build ?? 4), (s) => rs.push(playElite(b, lv, e, d, s)));
    console.log(eliteTable(rs));
  } else if (mode === 'route') {
    const rs: RouteResult[] = [];
    runs(Number(n ?? 3), (s) => rs.push(playRoute(build ?? 'mixed', !process.env.NODODGE, s)));
    console.log(routeTable(rs));
  } else {
    const k = Number(mode === 'bosses' ? build ?? 3 : mode ?? 3);
    if (mode !== 'bosses') for (const [b, d] of [...Object.keys(BUILDS).map((b) => [b, true] as const), ['mixed', false] as const]) {
      const rs: RouteResult[] = [];
      runs(k, (s) => rs.push(playRoute(b, d, s, true, true))); // on into level 2
      console.log(routeTable(rs));
    }
    const boss: BossResult[] = [];
    for (const b of Object.keys(BUILDS)) {
      for (const lv of [1, 6, 8, 9]) runs(k, (s) => boss.push(playBoss(b, lv, true, s)));
      for (const lv of [8, 9]) runs(k, (s) => boss.push(playBoss(b, lv, true, s, 'start')));
      runs(k, (s) => boss.push(playBoss(b, 9, true, s, 'buy')));
      runs(k, (s) => boss.push(playBoss(b, 9, true, s, 'epic')));
    }
    for (const lv of [9]) runs(k, (s) => boss.push(playBoss('mixed', lv, false, s)));
    console.log('\nboss alone (choir door checkpoint, church cleared; five tries at most)\n' + bossTable(boss));
    const gov: BossResult[] = [];
    for (const b of Object.keys(BUILDS)) {
      for (const lv of [10, 11, 12]) runs(k, (s) => gov.push(playBoss(b, lv, true, s, 'typical2', true)));
      runs(k, (s) => gov.push(playBoss(b, 11, true, s, 'typical', true))); // level 1's gear only
      runs(k, (s) => gov.push(playBoss(b, 11, true, s, 'buy2', true)));
    }
    runs(k, (s) => gov.push(playBoss('mixed', 11, false, s, 'typical2', true)));
    console.log('\nthe Governatrice alone (andito checkpoint, the Zitelle cleared but her wards; five tries at most)\n' + bossTable(gov));
  }
  console.log(`\n(${((performance.now() - t0) / 1000).toFixed(0)} s)`);
}
