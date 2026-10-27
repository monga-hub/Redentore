// Headless balance harness (`npm run balance`; not in `npm run check`, it plays whole runs).
// The real level, collision, mob brains, ability table (costs, cooldowns, the GCD, charge), mana,
// potion, XP curve and level-up offers, played by a bot: it walks the quest route on a grid path
// (Fra' Zuane, the apiary, the key on the pontile, Fra' Bortolo in the serra, the grate, the choir door, the boss), fights
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
//   node scripts/balance.ts boss2 plague 11 [runs] the Governatrice alone (GEAR default typical2: level 1's typical loot and level 2's; typical, buy2, side2 with Mastro Iseppo's epics, epic)
//   node scripts/balance.ts elite2 [runs]          the Gastaldo and the Maestra with their packs, every build at 9, 10, 11
//   node scripts/balance.ts route3 melee [runs]    one build on the route, on through level 2 into level 3 (Fra' Zuane, the Punta, the gondola, San Giorgio, the Bibliotecario, the Abate)
//   node scripts/balance.ts boss3 plague 17 [runs] the Abate alone in the Cenacolo (GEAR default typical3: levels 1 and 2's typical loot and level 3's; buy3 with Fra' Bortolo's level-3 epics; PREPS=faro,calice: the side quests' weakenings on him)
//   node scripts/balance.ts commissario [runs]     the Commissario delle Arti alone in the cipressi, his granatieri at his half, every build at 16, 17, 18, dodging and not, one life (GEAR default typical3)
//   node scripts/balance.ts campanaro [runs]       the Campanaro di San Giorgio alone in the bell chamber, 44 m up, likewise
//   node scripts/balance.ts drago [builds] [runs]   Carpaccio's dragon alone at the Teatro Verde (main.ts's ?drago=1), its drowned at 40% and 20%, builds (melee,arcane; default every one) at 18 and 19, dodging and not, one life (GEAR default typical3)
//   node scripts/balance.ts incoronazione [runs]   the Cardinale's procession from the altar to the Bacino, its three waves of monaci on him, the bot at his side, every build at 16, 17, 18, three tries (he falls: back to the altar)
//   node scripts/balance.ts pack3 arcane [runs]    a San Giorgio pack (two monaci and an amanuense, or two marinai and a monaco) pulled at once, the build at 15, 16, 17, one life
//   node scripts/balance.ts elite [runs]           the minibosses alone (a garden's sacerdote and priests, the giant bee and workers), every build at 6, 7, 8, one life (GEAR as above)
//   HANDS=0.5 node scripts/balance.ts ...          the bot lands half its damage: a stand-in for a human's rotation
//   TOMES=plague,holy node scripts/balance.ts ...  the hero starts with those schools' tomes read (every ability of theirs; the cards offer the rest)
//   HERO=bortolo node scripts/balance.ts ...       another hero (player/heroes.ts): his school's base attack, his kit learned from the start, the offers leaning to his schools (default the Risorto)
//   SCHOOLS=fire,holy KIT=pyre,pillar node ...     a hero not in HEROES yet: those schools (the base attack of the first) and that kit, over HERO's
//   node scripts/balance.ts pack arcane [runs]     four friars rush the hero from 16 m on the orto's open path, the build at levels 1, 4, 6, dodging and not, one life (DEALT=1: casts a run)
import * as THREE from 'three';
import { buildLevel } from '../src/level/index.ts';
import { PLAYER } from '../src/core/physics.ts';
import { CHURCH_FLOOR, SPAWN } from '../src/level/plan.ts';
import { APPRODO, BERTHS, CHEST, CHOIR_DOOR, NPC, Quest, SPEZIALE } from '../src/quest/progress.ts';
import { ABATE, ABATE_AT, BIBLIOTECARIO, CAMPANARO, COMMISSARIO, MARINAIO, NOSTROMO, PACKS as PACKS3, due, lull, prepare, rouse, spawnLevel3, type Level3 } from '../src/enemies/sangiorgio.ts';
import { GASTALDO, GONDOLIERE, GOVERNATRICE, GOV_AT, MAESTRA, PACKS, VELO, ZITELLA, spawnLevel2, type Level2 } from '../src/enemies/zitelle.ts';
import { GROUNDED, inPour, onLine, veiled } from '../src/enemies/caster.ts';
import { ZF } from '../src/level/zones/zitelle.ts';
import { FRIAR, separate, spawnGroups, think as friarThink, hurt as friarHurt, type Friar } from '../src/enemies/brain.ts';
import { APE, APETTA, APIARY, BOSS_AT, GARDENS, REVERENDISSIMO, SACERDOTE, fly, hurt as casterHurt, spawnApiary, spawnCasters, think as casterThink, wipe, type Bolt, type Priest } from '../src/enemies/caster.ts';
import { PlayerStats } from '../src/player/stats.ts';
import { ABILITIES, BAR, MEND, plagueSpot, tune, wispFoe, type Forsaken } from '../src/abilities/forsaken.ts';
import { Grimoire } from '../src/abilities/grimoire.ts';
import { frozen } from '../src/enemies/control.ts';
import { AbilitySystem } from '../src/abilities/system.ts';
import { TOMES, levelOf, offer, startOf, tomeOf, tuneOf } from '../src/player/levels.ts';
import { Bag, ITEM, roll, type Tier } from '../src/loot/bag.ts';
import { CARDINALE, GIVERS, MUTE, SIDE, SIDE_BY, STRUMENTI, TELA, giverOf } from '../src/quest/squero.ts';
import { ESCORT } from '../src/quest/escort.ts';
import type { Target } from '../src/enemies/brain.ts';
import { BELFRY, CAMPANILE } from '../src/level/zones/sangiorgio.ts';
import { DRAGO, DRAGO_SPOTS, spawnDrago, waves } from '../src/enemies/drago.ts';
import { HEROES, heroOf } from '../src/player/heroes.ts';
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
  arcane: ['pyre', 'veil', 'frost', 'ward', 'font', 'caligo', 'fx_shatter', 'pyre_fast', 'regen', 'mana', 'frost_fast', 'pyre_big', 'font_long', 'lance_split', 'caligo_freeze', 'dmg', 'hp', 'armor',
    'frost_deep', 'font_cd', 'lance_dmg', 'lance_third', 'caligo_big', 'lance_mana', 'potion_big', 'cdr', 'veil_heal', 'nova', 'leech', 'fury', 'ward_long', 'potion_cd'],
  storm: ['chain', 'veil', 'toll', 'ward', 'leap', 'whirl', 'grace', 'fx_storm', 'charge', 'chain_fast', 'toll_long', 'whirl_dmg', 'grace_mul', 'leap_big', 'dmg', 'hp', 'armor', 'regen',
    'mana', 'chain_long', 'toll_big', 'leap_cd', 'whirl_long', 'grace_cd', 'charge_stun', 'potion_big', 'leech', 'fury', 'ward_long', 'fall_dmg'],
  // five a school: a poisoner with the drain, a paladin, and a mage-shaman of the new fire, frost and lightning
  venom: ['spit', 'fever', 'untore', 'miasma', 'drain', 'veil', 'spit_twin', 'fx_venomcloud', 'miasma_more', 'untore_far', 'fever_deep', 'drain_deep', 'plague_dps', 'regen', 'mana',
    'plague_size', 'dmg', 'hp', 'armor', 'cdr', 'ward', 'potion_big', 'nova', 'leech', 'fury', 'ward_long', 'potion_cd'],
  holy: ['judge', 'hallow', 'hammer', 'bubble', 'veil', 'judge_dmg', 'hallow_big', 'hammer_cd', 'bubble_cd', 'ward', 'dmg', 'hp', 'armor', 'regen', 'mana', 'fall_dmg', 'fall_third',
    'cdr', 'leech', 'potion_big', 'strike', 'fury', 'ward_long', 'potion_cd'],
  tempest: ['pillar', 'cero', 'blizzard', 'orb', 'shield', 'furnace', 'rod', 'squall', 'veil', 'ward', 'pillar_big', 'cero_chain', 'blizzard_big', 'orb_slow', 'shield_more', 'furnace_hot',
    'rod_long', 'squall_big', 'regen', 'mana', 'dmg', 'hp', 'armor', 'cdr', 'fx_storm', 'potion_big', 'leech', 'fury', 'ward_long'],
};

/** HERO=bortolo: whose kit the bot plays (a new game's `learned`). */
const HERO = HEROES[heroOf(process.env.HERO)];
/** TOMES=plague,holy: the abilities those schools' tomes teach, owned from the start, past the hero's kit. */
const SCHOOLS = (process.env.SCHOOLS?.split(',') as typeof HERO.school | undefined) ?? HERO.school, START = startOf(SCHOOLS), MAIN = START[0]; // his base attack: Caduta d'ossa's club, or a bolt
const KIT = process.env.KIT?.split(',').filter(Boolean) ?? HERO.kit;
const LEARNED = [...KIT, ...(process.env.TOMES ?? '').split(',').filter(Boolean).flatMap((s) => tomeOf(TOMES.find((t) => t.school === s)!, [...START, ...KIT]).teaches.map((c) => c.id))];
/** m the bot strikes from with its base attack. */
const reach = () => (MAIN === 'fall' ? tune.fallRange : 25);

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
Math.random = rnd; // the mobs' jitter and the boss's marks too: a seed replays a run

/** The picks a build makes up to `lv` (offers replayed with the seeded rnd). */
function picksTo(build: string, lv: number): string[] {
  const picks: string[] = [];
  while (picks.length < lv - 1) picks.push(choose(build, picks));
  return picks;
}
/** Past a build's own list, what any player would rather take: with 33 abilities in the offers, often neither card is the build's. */
const GENERIC = ['veil', 'ward', 'pyre', 'strike', 'drain', 'cero', 'judge', 'hallow', 'spit', 'pillar', 'chain', 'grace', 'toll', 'frost', 'leap', 'whirl', 'furnace',
  'miasma', 'fever', 'blizzard', 'wisp', 'font', 'caligo', 'step', 'charge', 'nova', 'rod', 'orb', 'shield', 'squall', 'hammer', 'bubble', 'untore',
  'dmg', 'hp', 'armor', 'leech', 'potion_big', 'regen', 'mana', 'cdr', 'fury', 'speed'];
function choose(build: string, picks: string[]): string {
  const pref = BUILDS[build] ?? [], rank = (id: string) => (pref.includes(id) ? pref.indexOf(id) : GENERIC.includes(id) ? 500 + GENERIC.indexOf(id) : 999);
  const cards = offer(picks, rnd, LEARNED, SCHOOLS);
  return cards.reduce((a, b) => (rank(b.id) < rank(a.id) ? b : a)).id;
}

// --- walking: the flood fill of check-walkable.ts, then breadth-first fields towards each goal ---
const STEP = 0.5;
/** The grid's region: the Redentore to the Punta (levels 1, 2 and level 3's fondamenta), or San Giorgio once the gondola has crossed. */
const MAINLAND = { x0: -420, x1: 62, z0: -197, z1: 22, seed: SPAWN as { x: number; z: number } };
const ISLAND = { x0: -602, x1: -425, z0: -42, z1: 152, seed: APPRODO as { x: number; z: number } };
/** The campanile's bell chamber, seeded up top where its stair lands (`y`: the floor to start the fill on). */
const BELLS = { x0: -580, x1: -568, z0: 110, z1: 122, seed: { ...CAMPANILE.top, y: BELFRY.y } as { x: number; z: number } };
let X0 = 0, Z0 = 0, nx = 0, nz = 0, SEED = MAINLAND.seed;
function region(r: typeof MAINLAND): void { X0 = r.x0; Z0 = r.z0; nx = Math.round((r.x1 - r.x0) / STEP); nz = Math.round((r.z1 - r.z0) / STEP); SEED = r.seed; }
region(MAINLAND);
const toI = (x: number) => Math.round((x - X0) / STEP), toJ = (z: number) => Math.round((z - Z0) / STEP);
const inGrid = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < nz;
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function flood(world: World): Float32Array {
  const feet = new Float32Array(nx * nz).fill(NaN), queue: number[] = [];
  const s = toJ(SEED.z) * nx + toI(SEED.x);
  feet[s] = world.groundAt(SEED.x, SEED.z, (SEED as { y?: number }).y ?? 0);
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
    const V = c.kind.dive; // the Immersione: off the spot it comes up at, once its ring fills
    if (V && c.state === 'dive' && V.under - c.t < V.warn - REACT) away(V.spots[c.diveTo][0], V.spots[c.diveTo][1], V.radius + 0.8);
    if (c.state === 'pour' && c.t > REACT && inPour(c, p)) { // the Calice: across the wedge, the short way out
      const ax = Math.sin(c.pourA), az = Math.cos(c.pourA), side = (p.x - c.x) * az - (p.z - c.z) * ax >= 0 ? 1 : -1;
      x += az * side * 2; z += -ax * side * 2;
    }
    const W = c.kind.tide, T = c.tide;
    if (W && T && T.t > REACT && !T.isles.some((i) => Math.hypot(p.x - i.x, p.z - i.z) <= W.r - 0.4)) { // acqua alta: to the nearest island of light, whatever else
      const i = T.isles.reduce((a, b) => (Math.hypot(p.x - a.x, p.z - a.z) < Math.hypot(p.x - b.x, p.z - b.z) ? a : b));
      return { x: i.x - p.x, z: i.z - p.z };
    }
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
  readonly l3: Level3; // the third's
  readonly mobs: Mob[];
  free = new Set<Mob>(); // killed by a victory: worth nothing
  bolts: Bolt[] = [];
  picks: string[] = [];
  time = 0;
  zones = new Map<string, Zone>();
  log: string[] = [];
  // the kit's ability context
  player = { pos: { x: SPAWN.x, y: 0, z: SPAWN.z }, facing: 0, world: this.world, model: this.body(), mesh: NOOP, blink: (d: number) => this.blink(d) };
  /** No model, but a hand chest-high on the hero: the bolts thrown from it (Stiletto and the base attacks, Sputo, Martello). */
  private body(): any { return new Proxy(NOOP, { get: (_t, k) => (k === 'hand' ? (v: THREE.Vector3) => v.set(this.player.pos.x, this.player.pos.y + 1.2, this.player.pos.z) : NOOP) }); }
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
      if ((m === this.boss || m === this.l2.boss || m === this.l3.boss || (isCaster(m) && m.kind === DRAGO)) && FIGHTING.has(m.state)) this.dealt.set(this.src, (this.dealt.get(this.src) ?? 0) + Math.min(n, m.hp));
      if (isCaster(m)) casterHurt(m, n); else friarHurt(m, n);
    }
  };
  aimed = () => this.target;
  foes = () => this.mobs;
  /** Who goes for someone other than the hero, and whom (the Cardinale's procession, as main.ts aims it); their blows go to `struck`. */
  aim: (c: Priest) => Target | undefined = () => undefined;
  struck: (n: number) => void = () => {};
  get comboStep(): number { return this.combo; }

  readonly build: string;
  readonly dodge: boolean;
  private worth = new Map<Mob, number>();

  constructor(build: string, dodge: boolean) {
    this.build = build;
    this.dodge = dodge;
    Object.assign(tune, tuneOf([], LEARNED, SCHOOLS));
    const c = spawnCasters(this.world, this.level.areas), a = spawnApiary(this.world);
    this.l2 = spawnLevel2(this.world);
    this.l3 = spawnLevel3(this.world);
    this.casters = [...c.all, ...a.all, ...this.l2.all, ...this.l3.all];
    this.boss = c.boss;
    this.bees = a.all;
    this.mobs = [...this.friars, ...this.casters];
    for (const m of this.mobs) this.worth.set(m, isCaster(m) ? m.kind.xp : FRIAR.xp);
    for (const h of this.l3.hidden) for (const m of h.members) this.free.add(m); // asleep: dead, worth nothing until woken
    this.quest.side.bag = this.bag;
    this.system = new AbilitySystem<Forsaken>(ABILITIES, [MAIN, ...BAR.slice(1)], this as unknown as Forsaken, START);
    const s = this.stats; // counts what is spent
    this.system.pool = { get mana() { return s.mana; }, spendMana: (n) => s.spendMana(n) && ((this.spent += n), true) };
    this.player.pos.y = this.world.groundAt(SPAWN.x, SPAWN.z, 0);
    this.apply(); // the starter set
  }

  tierOf(m: Mob): Tier {
    if (!isCaster(m)) return 'friar';
    const k = m.kind;
    return k === REVERENDISSIMO || k === GOVERNATRICE || k === ABATE ? 'boss' : k === SACERDOTE || k === APE || k === GASTALDO || k === MAESTRA || k === BIBLIOTECARIO || k === NOSTROMO || k === COMMISSARIO || k === CAMPANARO ? 'elite' : k === APETTA ? 'worker' : k === GONDOLIERE ? 'friar' : 'priest';
  }
  levelOf(m: Mob): 1 | 2 | 3 { return isCaster(m) && this.l3.all.includes(m) ? 3 : isCaster(m) && this.l2.all.includes(m) ? 2 : 1; }
  /** A kill's loot: gold banked, a better piece worn (the old one sold), everything else sold. */
  loot(tier: Tier, level: 1 | 2 | 3 = 1): void {
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
      const best = shop(this.quest.accepted3).filter((it) => buyPrice(it) <= this.bag.gold && gain(it) > 0).sort((a, b) => gain(b) / buyPrice(b) - gain(a) / buyPrice(a))[0];
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
    if (kind === 'typical2' || kind === 'buy2' || kind === 'side2' || kind === 'typical3' || kind === 'buy3') for (const [tier, n] of Object.entries(TYPICAL2)) for (let i = 0; i < n; i++) this.loot(tier as Tier, 2);
    if (kind === 'side2') for (const q of SIDE) if (giverOf(q) === 'iseppo') this.take(q.reward!); // and Mastro Iseppo's seven epics, his quests all handed in
    if (kind === 'typical3' || kind === 'buy3') for (const [tier, n] of Object.entries(TYPICAL3)) for (let i = 0; i < n; i++) this.loot(tier as Tier, 3);
    if (kind === 'buy3') this.quest.accepted3 = true; // Fra' Bortolo's level-3 epics on sale
    if (kind === 'buy' || kind === 'buy2' || kind === 'buy3') this.shop();
  }

  // --- what the ability table calls ---
  nextCombo(): number { this.combo = this.comboT < 1.1 ? (this.combo + 1) % 3 : 0; this.comboT = 0; return this.combo; }
  swingCombo(): void { this.nextCombo(); }
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
    for (const m of [...this.friars, ...this.casters]) if (!this.l2.all.includes(m as Priest) && !this.l3.all.includes(m as Priest) && m.state !== 'dead') { this.free.add(m); m.state = 'dead'; m.hp = 0; }
  }
  /** The Governatrice is dead: her Zitelle fall with her, for nothing, as in the game. */
  victory2(): void {
    this.quest.win2();
    for (const m of this.l2.all) if (m.state !== 'dead') { this.free.add(m); m.state = 'dead'; m.hp = 0; }
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
    Object.assign(tune, tuneOf(this.picks, LEARNED, SCHOOLS));
    this.worn = effects(this.gear.totals);
    this.stats.grow(tune.hp, tune.mana, this.worn.hp, this.worn.mana);
    this.stats.armor = tune.armor * (1 - this.worn.cut);
    this.stats.regen = tune.regen + this.worn.regen;
    this.system.castMul = 1 / this.worn.haste;
    this.system.chargeMul = tune.fury;
    this.system.chargeAfter = tune.furyStart;
    this.system.unlock(...tune.owned);
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
    if (m.kind === ABATE) return 'boss3';
    if (m.kind === BIBLIOTECARIO || m.mates.some((x) => x.kind === BIBLIOTECARIO)) return 'biblio';
    if (this.l3.hidden.some((h) => h.pack.hidden!.quest === 'tela' && h.members.includes(m))) return 'commiss.';
    if (m.kind === CAMPANARO) return 'campan.';
    if (m.kind === DRAGO || (m.kind === MARINAIO && !this.l3.all.includes(m))) return 'drago'; // its drowned: no pack of the level's
    if (this.l3.all.includes(m)) return m.home.x > -425 ? 'fond.3' : 'isola';
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
    if (engaged.length && low < 0.3 && this.stats.immune <= 0 && this.ready('bubble')) this.cast('bubble');
    if (engaged.length && low < 0.6 && s.veil <= 0 && this.ready('veil')) this.cast('veil');

    if (this.magic.dashing) { this.tickWorld(dt, hp0, t); return; } // carried by a leap or a charge
    const danger = this.dodge ? dangers(this.casters, this.friars, p) : undefined;
    if (danger) {
      if (this.system.casting) this.system.cancel();
      this.flee(danger.x, danger.z, dt);
      if (t) this.player.facing = Math.atan2(-(t.x - p.x), -(t.z - p.z));
      if (t && Math.hypot(t.x - p.x, t.z - p.z) < reach()) this.cast(MAIN);
    } else if (t) {
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      this.player.facing = Math.atan2(-(t.x - p.x), -(t.z - p.z));
      const big = isCaster(t) && (t.kind === REVERENDISSIMO || t.kind === APE || t.kind === GOVERNATRICE || t.kind === MAESTRA || t.kind === GASTALDO || t.kind === ABATE || t.kind === BIBLIOTECARIO || t.kind === NOSTROMO || t.kind === COMMISSARIO || t.kind === CAMPANARO || t.kind === DRAGO);
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
        // the five a school: instants first, then the channels and the casts
        const nearT = (r: number) => engaged.filter((m) => Math.hypot(m.x - t.x, m.z - t.z) < r).length;
        if (this.ready('shield') && this.magic.sparks === 0 && d < 8) this.cast('shield');
        if (this.ready('hallow') && (around(tune.hallowR) >= 2 || (big && d < 3.5))) this.cast('hallow');
        if (this.ready('rod') && d < 7) this.cast('rod');
        if (this.ready('squall') && (around(tune.squallR - 1) >= 3 || (low < 0.6 && around(4) >= 2))) this.cast('squall');
        if (this.ready('caligo') && d < tune.caligoRange - 1 && (around(tune.caligoRange) >= 2 || big)) this.cast('caligo');
        if (this.ready('furnace') && d < tune.furnaceRange - 1 && (around(tune.furnaceRange) >= 2 || big)) this.cast('furnace');
        if (this.ready('miasma') && (around(tune.miasmaR - 1) >= 2 || (big && d < tune.miasmaR - 1))) this.cast('miasma');
        if (this.ready('fever') && d < 28 && (big || nearT(tune.feverR) >= 3)) this.cast('fever');
        if (this.ready('untore') && d < 28 && this.magic.venom(t) >= 2 && nearT(tune.untoreR) >= 2) this.cast('untore');
        if (this.ready('hammer') && d < 28 && (big || t.state === 'cast')) this.cast('hammer');
        if (this.ready('judge') && d < 28) this.cast('judge');
        if (this.ready('cero') && d < 28 && !this.magic.candles.has(t)) this.cast('cero');
        if (this.ready('orb') && d < 14) this.cast('orb');
        if (this.ready('spit') && d < 28 && (this.magic.venom(t) < tune.venomMax || cool)) this.cast('spit');
        if (this.ready('drain') && d < 24 && (low < 0.8 || cool)) { if (this.cast('drain') || this.system.casting) { this.tickWorld(dt, hp0, t); return; } }
        if (this.ready('blizzard') && d < 25 && (big ? d > 5 : nearT(tune.blizzardR) >= 2)) { if (this.cast('blizzard') || this.system.casting) { this.tickWorld(dt, hp0, t); return; } } // a channel: not in a big one's reach
        if (this.ready('pillar') && d < 28 && (cool || nearT(tune.pillarR) >= 2)) { if (this.cast('pillar') || this.system.casting) { this.tickWorld(dt, hp0, t); return; } }
        if (this.ready('chain') && d < 28 && (cool || around(10) >= 2)) { if (this.cast('chain') || this.system.casting) { this.tickWorld(dt, hp0, t); return; } }
        if (this.ready('pyre') && d < 28 && cool) { if (this.cast('pyre') || this.system.casting) { this.tickWorld(dt, hp0, t); return; } }
        if (this.ready('frost') && d < 28 && d > tune.fallRange && cool) { if (this.cast('frost') || this.system.casting) { this.tickWorld(dt, hp0, t); return; } }
        const near = engaged.filter((m) => Math.hypot(m.x - p.x, m.z - p.z) < tune.novaR).length;
        if (this.ready('nova') && (near >= 2 || (big && d < tune.novaR))) this.cast('nova');
        const wait = this.dodge && isCaster(t) && t.state === 'nova'; // don't walk back into a ring still filling
        if (!wait && this.ready('step') && d > 6 && d < 9) this.cast('step');
        if (!wait && (d > reach() - 0.5 || (MAIN !== 'fall' && !this.world.sees(p, t)))) this.go(t.x, t.z, 1.5, dt);
        if (d < reach()) this.cast(MAIN);
      }
    } else if (low < 0.85 && !this.system.casting && this.ready('mend')) { // between pulls the prayer heals up
      this.cast('mend');
    } else if (this.system.casting?.ability.id === 'mend') { // stand still for it
    } else if (!(this.dodge && ((low < 0.7 && !this.ready('potion')) || (goal.boss && s.mana < s.manaMax * 0.6)))) { // a careful player waits for the potion before the next pull, for mana before the boss
      this.travel(goal.x, goal.z, goal.r, dt);
    } else this.zone('viaggio').time += dt;
    this.tickWorld(dt, hp0, t);
  }

  private air = 0; // s left of a jump (the Rintocchi): the feet off the floor
  /** The dodging bot jumps a bell's ring about to reach it (a player sees them racing in), not more often than the game's jump allows. */
  private hop(dt: number): void {
    const p = this.player.pos;
    if ((this.air -= dt) > -0.15 || !this.dodge) return;
    for (const c of this.casters) {
      const B = c.kind.toll;
      if (!B || c.state === 'dead') continue;
      for (const r of c.rings) {
        const R = r.t * B.speed, gap = Math.hypot(p.x - r.x, p.z - r.z) - R;
        if (r.t >= 0 && !r.hit && gap > 0 && gap < B.speed * 0.2 + B.width / 2) { this.air = 0.6; return; }
      }
    }
  }
  private tickWorld(dt: number, hp0: number, t?: Mob): void {
    const p = this.player.pos, s = this.stats;
    this.kit(dt);
    s.update(dt);
    this.hop(dt);
    const lift = this.air > 0 ? GROUNDED + 0.3 : 0;
    let dmg = 0;
    for (const f of this.friars) dmg += friarThink(f, p, this.world, dt);
    separate(this.friars, this.world);
    p.y += lift;
    for (const c of this.casters) {
      const at = this.aim(c);
      if (at) { this.struck(casterThink(c, at, this.world, dt, this.bolts)); continue; }
      const was = c.state, d = casterThink(c, p, this.world, dt, this.bolts);
      if ((c === this.boss || c === this.l2.boss || c === this.l3.boss || c === this.l3.commissario || c.kind === DRAGO) && d > 0) { const k = was === 'dive' ? 'dive' : was === 'swing' ? 'melee' : was === 'nova' && c.state !== 'nova' ? 'nova' : was === 'pour' && c.state !== 'pour' ? 'calice' : c.tide && c.tide.t >= c.kind.tide!.warn ? 'acqua' : c.rings.length ? 'campane' : 'marks'; this.taken.set(k, (this.taken.get(k) ?? 0) + d * this.stats.armor * (this.stats.veil > 0 ? 0.5 : 1) * (this.stats.immune > 0 ? 0 : 1)); }
      dmg += d;
    }
    p.y -= lift;
    separate(this.casters, this.world);
    dmg += fly(this.bolts, p, dt, [], this.world);
    if (dmg > 0 && s.takeDamage(dmg) > 0) this.system.pushback(); // the game's onHurt
    if (this.looting) for (const m of this.mobs) if (m.state === 'dead' && !this.looted.has(m) && !this.free.has(m)) { this.looted.add(m); this.loot(this.tierOf(m), this.levelOf(m)); }
    if (!this.quest.key2 && this.l2.maestra.state === 'dead') this.quest.takeKey2();
    if (!this.quest.key3 && this.l3.bibliotecario.state === 'dead') this.quest.takeKey3();
    this.sleepers();
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

  /** Level 3's hidden packs as main.ts wakes them: the Commissario at rest once La tela tagliata is taken, his granatieri on the hero at his half and back under when he is at rest again. */
  readonly woken = new Set<Level3['hidden'][number]>();
  private sleepers(): void {
    for (const h of this.l3.hidden) {
      if (!this.woken.has(h) && due(h, this.l3, (q, step) => this.quest.side.reached(q, step), this.quest.boss3Dead)) {
        rouse(h.members, this.world, !h.pack.hidden!.rest);
        this.woken.add(h);
        for (const m of h.members) this.free.delete(m);
      } else if (h.pack.hidden!.under && this.woken.has(h) && this.l3.commissario.state === 'pray') {
        for (const m of h.members) if (m.state !== 'dead') this.free.add(m); // gone back under: no kill
        lull(h.members);
        this.woken.delete(h);
      }
    }
    if (this.l3.commissario.state === 'dead' && this.quest.side.tokens().some((t) => t.from === 'commissario')) this.quest.side.bag!.add(TELA); // the canvas off his body
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
      for (const c of this.casters) { const at = this.aim(c), d = casterThink(c, at ?? this.player.pos, this.world, DT, this.bolts); if (at) this.struck(d); }
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
    { name: 'serra', x: SPEZIALE.x, z: SPEZIALE.z - 1.2, r: 1.2, done: (r) => { r.quest.meet(); } }, // Fra' Bortolo, as Fra' Zuane asks
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
const BACK = { x: -240, z: -33 };
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

/**
 * Level 3: report to Fra' Zuane and take Le nozze di San Giorgio, east past the Tre Oci through the fondamenta's packs and
 * the Punta's to Mastro Iseppo's gondola; across (the grid switches to the island); the piazzale, the cloisters, the
 * Scalone and the Biblioteca, the Bibliotecario and his key; the Veronese's chain (I musici di Cana from him in the
 * antirefettorio on the way through the allori, the viola by the Bibliotecario, then the Presbiterio's, the Coro's and the
 * Teatro Verde's instruments, each past its pack; La tela tagliata, the Commissario in the cipressi); the Cenacolo's door
 * from the antirefettorio; the Abate.
 */
const ON_THE_WAY3 = ['Fondamenta San Giovanni', 'Punta della Giudecca'], ISLAND_WAY = [3, 10, 8, 9, 11, 12]; // PACKS3: the piazzale's south pack, the cipressi, the allori, the Scalone, the Biblioteca
const CENACOLO_DOOR = { x: -530, z: 37 }, COMMISSARIO_AT = { x: -483, z: 54 };
/** At the Veronese: hand in what is ready, then take `next` (his next quest) if named. */
function veronese(next?: 'musici' | 'tela'): Goal {
  const at = GIVERS.veronese.at;
  return { name: `veronese${next ? `:${next}` : ''}`, x: at.x - 1.2, z: at.z, r: 1, done: (r) => {
    let t = r.quest.side.talk('veronese');
    if (t.paid) { r.bag.remove(t.paid.reward!); r.take(t.paid.reward!); t = r.quest.side.talk('veronese'); }
    if (next) t.accept?.();
    if (next && !r.quest.side.active(next)) throw new Error(`the Veronese does not give ${next}: ${t.talk.pages[0]}`);
  } };
}
function route3(r: Run): Goal[] {
  const pack = (i: number): Goal => {
    const p = PACKS3[i], ms = r.l3.all.filter((m) => p.members.some(([k, x, z]) => m.kind === k && m.home.x === x && m.home.z === z));
    return { name: p.label, x: p.at[0], z: p.at[1], r: 2.5, until: () => ms.every((m) => m.state === 'dead') };
  };
  return [
    { name: 'zuane', x: NPC.x, z: NPC.z, r: 2.2, done: (r) => { r.quest.report2(); r.quest.accept3(); r.paths.reset(); } },
    ...PACKS3.flatMap((p, i) => (ON_THE_WAY3.includes(p.label) ? [pack(i)] : [])),
    { name: 'gondola', x: BERTHS.punta.x, z: BERTHS.punta.z, r: 1.5, done: (r) => { // the crossing, ~11 s afloat
      r.time += 11;
      Object.assign(r.player.pos, { x: APPRODO.x, y: r.world.standHeight(APPRODO.x, APPRODO.z), z: APPRODO.z });
      r.quest.landed = true;
      region(ISLAND);
      r.paths.reset();
    } },
    ...ISLAND_WAY.slice(0, 3).map(pack),
    veronese('musici'),
    ...ISLAND_WAY.slice(3).map(pack),
    ...STRUMENTI.map((f): Goal => ({ name: f.item, x: f.at.x + 1, z: f.at.z, y: f.at.y, r: 1, done: (r) => { r.quest.side.prompt(r.player.pos)?.act?.(); } })),
    veronese('tela'),
    { name: 'commissario', x: COMMISSARIO_AT.x, z: COMMISSARIO_AT.z, r: 2.5, until: (r) => r.bag.count(TELA) > 0 && !r.target }, // asleep he lies dead: the canvas off his body is the kill
    veronese(),
    { name: 'cenacolo', x: CENACOLO_DOOR.x, z: CENACOLO_DOOR.z, r: 1.6, done: (r) => {
      if (!r.quest.canvas) throw new Error(`the Cenacolo reached without the canvas: ${r.quest.side.taken} taken, ${r.quest.side.done} done`);
      r.quest.open(r.quest.gate('cenacolo'));
      r.paths.reset();
    } },
    { name: 'boss3', x: ABATE_AT.x, z: ABATE_AT.z, r: 3, boss: true, until: (r) => r.l3.boss.state === 'dead' },
  ];
}

const LIMIT = 45 * 60; // s of play before a run is called off
/** Kills by tier on a typical route up to the choir door (the mean of `npm run balance`'s runs): the loot of GEAR=typical. */
const TYPICAL: Record<string, number> = { friar: 32, priest: 32, elite: 3, worker: 3 };
/** Level 2's kills on the way to the Governatrice (ON_THE_WAY; GEAR=typical2: level 1's typical, then these). */
const TYPICAL2: Record<string, number> = { friar: 11, priest: 15, elite: 2 };
/** Level 3's on the way to the Abate (route3's mean; GEAR=typical3: levels 1 and 2's typical, then these). */
const TYPICAL3: Record<string, number> = { priest: 29, elite: 1 };

type Leg = { won: boolean; time: number; deaths: number; lv0: number; lv: number; xp: number; boss: number; kills: Partial<Record<Tier, number>>; gold?: number; gear?: GearState };
export interface RouteResult { build: string; dodge: boolean; won: boolean; time: number; deaths: number; lv: number; xp: number; zones: Map<string, Zone>; picks: string[]; boss: number; gold: number; gear: GearState; kills: Partial<Record<Tier, number>>; l2?: Leg; l3?: Leg }

export function playRoute(build: string, dodge: boolean, s = 1, apiary = true, level2 = false, level3 = false): RouteResult {
  swings.clear();
  region(MAINLAND);
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
  if (!level3 || !out.l2.won) return out;
  // Level 3 from there: the Zitelle fall with the Governatrice, Fra' Zuane pays and sends the hero on.
  r.victory2();
  r.shop(); // what the gold buys at Fra' Bortolo's on the way (level 3's epics, once the quest is taken: after Fra' Zuane)
  const t3 = r.time, d3 = r.deaths, lv3 = r.lv, k3 = { ...r.tierKills };
  let boss3 = 0, gold3 = 0, gear3: GearState = {};
  for (const g of route3(r)) {
    const reached = () => Math.hypot(r.player.pos.x - g.x, r.player.pos.z - g.z) < g.r + 0.6 && (g.y === undefined || Math.abs(r.player.pos.y - g.y) < 1);
    while (r.time < t3 + LIMIT && !(g.until ? g.until(r) : reached() && !r.target)) {
      if (g.name === 'boss3' && FIGHTING.has(r.l3.boss.state)) boss3 += DT;
      r.step(g);
    }
    if (r.time >= t3 + LIMIT) break;
    g.done?.(r);
    if (g.name === 'zuane') r.shop(); // Fra' Bortolo's level-3 epics, on the way out
    if (g.name === 'cenacolo') { gold3 = r.bag.gold; gear3 = r.gear.encode(); }
  }
  region(MAINLAND);
  const kills3 = Object.fromEntries(Object.entries(r.tierKills).map(([k, v]) => [k, v - (k3[k as Tier] ?? 0)]));
  out.l3 = { won: r.l3.boss.state === 'dead', time: r.time - t3, deaths: r.deaths - d3, lv0: lv3, lv: r.lv, xp: r.xp, boss: boss3, kills: kills3, gold: gold3, gear: gear3 };
  out.picks = r.picks;
  out.zones = r.zones;
  return out;
}

export interface BossResult { build: string; lv: number; gear: string; picks: string[]; dodge: boolean; won: boolean; tries: { time: number; left: number; potions: number }[]; dry: number; dealt: Map<string, number>; taken: Map<string, number>; casts: Map<string, number> }

/** The boss alone: the church cleared, the choir door open, a build at level `lv`, five tries at most. */
export function playBoss(build: string, lv: number, dodge: boolean, s = 1, gear = process.env.GEAR ?? 'typical', second = false, third = false): BossResult {
  swings.clear();
  region(third ? ISLAND : MAINLAND);
  const r = new Run(build, dodge);
  seed = s * 7919; // after the level is built: its first build draws on Math.random more than the next ones
  r.dress(gear);
  r.picks = process.env.PICKS ? process.env.PICKS.split(',') : lv > 1 ? picksTo(build, lv) : []; // PICKS=a,b,c: a fixed build
  r.apply();
  r.stats.revive();
  r.quest.accepted = true;
  r.quest.takeKey();
  for (const g of r.quest.gates) if (g.needs === 'key') r.quest.open(g);
  const boss = third ? r.l3.boss : second ? r.l2.boss : r.boss, zone = third ? 'boss3' : second ? 'boss2' : 'boss';
  if (second || third) { r.quest.win(); r.quest.out = true; r.quest.report(); r.quest.accept2(); r.quest.takeKey2(); r.quest.open(r.quest.gate('coro-zitelle')); }
  if (third) { r.quest.win2(); r.quest.report2(); r.quest.accept3(); r.quest.landed = true; r.quest.takeKey3(); r.quest.open(r.quest.gate('cenacolo')); }
  if (third) prepare((process.env.PREPS ?? '').split(',').filter(Boolean)); // PREPS=faro,calice: the side quests' weakenings on the Abate (enemies/sangiorgio.ts PREPS)
  r.paths.reset();
  for (const m of r.mobs) if (m !== boss && !(second && (m as Priest).kind === VELO)) { m.state = 'dead'; m.hp = 0; }
  r.levelUp = () => {}; // the level is fixed
  const at = r.quest.checkpoint();
  Object.assign(r.player.pos, { x: at.x, y: r.world.standHeight(at.x, at.z), z: at.z });
  const goal = { ...(third ? ABATE_AT : second ? GOV_AT : BOSS_AT), r: 3, boss: true }, tries: BossResult['tries'] = [];
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
  region(MAINLAND);
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

/** The Commissario delle Arti alone, at rest in the cipressi once La tela tagliata is taken; his granatieri come at his half. One life, everything else dead. */
export function playCommissario(build: string, lv: number, dodge: boolean, s = 1): EliteResult {
  swings.clear();
  region(ISLAND);
  const r = new Run(build, dodge);
  seed = s * 7919;
  r.dress(process.env.GEAR ?? 'typical3');
  r.picks = picksTo(build, lv);
  r.apply();
  r.stats.revive();
  r.quest.accepted = r.quest.accepted3 = r.quest.landed = true;
  r.quest.takeKey3();
  r.quest.side.done.push('musici');
  r.quest.side.taken.push('tela');
  for (const m of r.mobs) if (!r.l3.hidden.some((h) => h.members.includes(m as Priest))) { m.state = 'dead'; m.hp = 0; }
  r.levelUp = () => {};
  r.paths.reset();
  const at = { x: COMMISSARIO_AT.x, z: COMMISSARIO_AT.z + 14 }; // from the cipressi's south walk
  Object.assign(r.player.pos, { x: at.x, y: r.world.standHeight(at.x, at.z), z: at.z });
  const c = r.l3.commissario, goal = { ...COMMISSARIO_AT, r: 2 }, group = () => r.l3.hidden.filter((h) => h.pack.hidden!.quest === 'tela').flatMap((h) => h.members);
  let t0 = -1, pots = 0, lost = 0;
  r.step(goal); // the first frame wakes him, at rest
  while (r.time < 15 * 60 && !r.deaths && c.state !== 'dead') {
    if (t0 < 0 && FIGHTING.has(c.state)) t0 = r.time;
    const z = r.zone('commiss.'), p0 = z.potions, h0 = r.stats.hp;
    r.step(goal);
    if (t0 >= 0) lost += Math.max(0, h0 - r.stats.hp) / r.stats.hpMax;
    pots += z.potions - p0;
  }
  while (r.time < 15 * 60 && !r.deaths && group().some((m) => m.state !== 'dead')) r.step(goal); // the granatieri left standing
  region(MAINLAND);
  return { build, lv, elite: 'commiss.', dodge, won: !r.deaths && c.state === 'dead', time: t0 >= 0 ? r.time - t0 : 0, potions: pots, lost };
}

/** The Campanaro alone in the bell chamber: the hero up the stair, the three clappers out, so he comes up at once. One life, everything else dead. */
export function playCampanaro(build: string, lv: number, dodge: boolean, s = 1): EliteResult {
  swings.clear();
  region(BELLS);
  const r = new Run(build, dodge);
  seed = s * 7919;
  r.dress(process.env.GEAR ?? 'typical3');
  r.picks = picksTo(build, lv);
  r.apply();
  r.stats.revive();
  r.quest.accepted = r.quest.accepted3 = r.quest.landed = true;
  r.quest.side.done.push('acqua');
  r.quest.side.taken.push('rintocchi');
  r.quest.side.steps.rintocchi = MUTE;
  for (const m of r.mobs) if (!r.l3.hidden.some((h) => h.members.includes(m as Priest))) { m.state = 'dead'; m.hp = 0; }
  r.levelUp = () => {};
  r.paths.reset();
  const at = CAMPANILE.top;
  Object.assign(r.player.pos, { x: at.x, y: r.world.standHeight(at.x, at.z), z: at.z });
  const c = r.l3.campanaro, goal = { x: at.x, z: at.z, r: 1.5 };
  let t0 = -1, pots = 0, lost = 0;
  r.step(goal); // the first frame wakes him, on the hero
  while (r.time < 15 * 60 && !r.deaths && c.state !== 'dead') {
    if (t0 < 0 && FIGHTING.has(c.state)) t0 = r.time;
    const z = r.zone('campan.'), p0 = z.potions, h0 = r.stats.hp;
    r.step(goal);
    if (t0 >= 0) lost += Math.max(0, h0 - r.stats.hp) / r.stats.hpMax;
    pots += z.potions - p0;
  }
  region(MAINLAND);
  return { build, lv, elite: 'campan.', dodge, won: !r.deaths && c.state === 'dead', time: t0 >= 0 ? r.time - t0 : 0, potions: pots, lost };
}

/** Carpaccio's dragon alone (the `?drago=1` sandbox): the hero on the Teatro Verde's tiers, its drowned sailors at its acts as main.ts calls them. One life, everything else dead. */
export function playDrago(build: string, lv: number, dodge: boolean, s = 1): EliteResult {
  swings.clear();
  region(ISLAND);
  const r = new Run(build, dodge);
  seed = s * 7919;
  r.dress(process.env.GEAR ?? 'typical3');
  r.picks = picksTo(build, lv);
  r.apply();
  r.stats.revive();
  r.quest.accepted = r.quest.accepted3 = r.quest.landed = true;
  for (const m of r.mobs) { m.state = 'dead'; m.hp = 0; }
  const d = spawnDrago(r.world);
  r.casters.push(...d.all);
  r.mobs.push(...d.all);
  r.levelUp = () => {};
  r.paths.reset();
  Object.assign(r.player.pos, { x: -574, y: r.world.standHeight(-574, -12), z: -12 });
  const c = d.boss, goal = { x: DRAGO_SPOTS[0][0], z: DRAGO_SPOTS[0][1] + 4, r: 2 };
  let t0 = -1, pots = 0, lost = 0;
  while (r.time < 15 * 60 && !r.deaths && c.state !== 'dead') {
    if (t0 < 0 && FIGHTING.has(c.state)) t0 = r.time;
    const z = r.zone('drago'), p0 = z.potions, h0 = r.stats.hp;
    r.step(goal);
    waves(d, r.world);
    if (t0 >= 0) lost += Math.max(0, h0 - r.stats.hp) / r.stats.hpMax;
    pots += z.potions - p0;
  }
  if (process.env.DEALT) console.log(`  ${build} ${lv} ${dodge ? 'dodge' : 'no dodge'}: ${c.state}, ${Math.round(c.hp)} hp left at ${Math.round(r.time - t0)} s; dealt: ${[...r.dealt].map(([k, v]) => `${k} ${Math.round(v)}`).join(', ')}; taken: ${[...r.taken].map(([k, v]) => `${k} ${Math.round(v)}`).join(', ')}`);
  region(MAINLAND);
  return { build, lv, elite: 'drago', dodge, won: !r.deaths && c.state === 'dead', time: t0 >= 0 ? r.time - t0 : 0, potions: pots, lost };
}

export interface EscortResult { build: string; lv: number; dodge: boolean; won: boolean; tries: number; time: number; low: number; deaths: number }

/**
 * L'incoronazione: the Cardinale walked from the high altar to the Bacino, the bot at his side (it fights whatever is up, else
 * follows him), its three waves of monaci woken at his stops and aimed at him as main.ts does. He falls: the waves back under,
 * he back to the altar, another try (three at most). Everything else on the island dead.
 */
export function playIncoronazione(build: string, lv: number, dodge: boolean, s = 1): EscortResult {
  swings.clear();
  region(ISLAND);
  const r = new Run(build, dodge), q = r.quest, side = q.side, inc = SIDE_BY.get('incoronazione')!, e = side.escort;
  seed = s * 7919;
  r.dress(process.env.GEAR ?? 'typical3');
  r.picks = picksTo(build, lv);
  r.apply();
  r.stats.revive();
  q.accepted = q.accepted3 = q.landed = true;
  side.done.push('schede', 'tiara');
  side.taken.push('incoronazione');
  const waves = r.l3.hidden.filter((h) => h.pack.hidden!.quest === 'incoronazione'), walkers = new Set<Mob>(waves.flatMap((h) => h.members));
  for (const m of r.mobs) if (!walkers.has(m)) { m.state = 'dead'; m.hp = 0; }
  r.aim = (c) => (walkers.has(c) ? e.pose : undefined);
  r.struck = (n) => { e.hurt(n); };
  r.levelUp = () => {};
  r.paths.reset();
  Object.assign(r.player.pos, { x: CARDINALE.x + 1.6, y: CARDINALE.y, z: CARDINALE.z });
  let tries = 1, low = 1;
  const counted = new Set<Mob>(walkers); // asleep: dead, not a kill
  while (r.time < 15 * 60 && !side.ready(inc) && tries <= 3) {
    side.march(DT, r.player.pos);
    side.update();
    r.step({ x: e.pose.x + 1.5, z: e.pose.z + 1.5, r: 1.5 }); // a step ahead and aside of him
    for (const m of walkers) { // its kills, as main.ts counts them
      if (m.state !== 'dead') counted.delete(m);
      else if (!counted.has(m)) { counted.add(m); side.killed('monaco', 'incoronazione'); }
    }
    low = Math.min(low, e.hp / ESCORT.hp);
    if (e.hp > 0) continue;
    for (const h of waves) { for (const m of h.members) r.free.add(m); lull(h.members); r.woken.delete(h); }
    side.fall();
    tries++;
  }
  region(MAINLAND);
  return { build, lv, dodge, won: side.ready(inc), tries: Math.min(tries, 3), time: r.time, low, deaths: r.deaths };
}

/** The procession: per build, level and bot, runs won (in three tries), first-try wins, the run's length, the Cardinale's lowest health, the hero's deaths. */
export function escortTable(rs: EscortResult[]): string {
  const out = [`${'build'.padEnd(8)}${pad('level', 6)} ${'bot'.padEnd(9)}${pad('wins', 6)}${pad('1st try', 8)}${pad('run s', 7)}${pad('his low', 8)}${pad('deaths', 7)}`];
  const key = (r: EscortResult) => `${r.build}|${r.lv}|${r.dodge}`;
  for (const k of [...new Set(rs.map(key))]) {
    const g = rs.filter((r) => key(r) === k), r0 = g[0], won = g.filter((r) => r.won);
    out.push(`${r0.build.padEnd(8)}${pad(r0.lv, 6)} ${(r0.dodge ? 'dodge' : 'no dodge').padEnd(9)}${pad(`${won.length}/${g.length}`, 6)}${pad(`${won.filter((r) => r.tries === 1).length}/${g.length}`, 8)}` +
      `${pad(won.length ? mean(won.map((r) => r.time)).toFixed(0) : '-', 7)}${pad(`${Math.round(mean(g.map((r) => r.low)) * 100)}%`, 8)}${pad(f1(mean(g.map((r) => r.deaths))), 7)}`);
  }
  out.push(`procession: ${rs.filter((r) => r.won).length}/${rs.length} won, ${rs.filter((r) => r.won && r.tries === 1).length} at the first try`);
  return out.join('\n');
}

export interface PackResult { build: string; lv: number; dodge: boolean; won: boolean; time: number; potions: number; lost: number; contact: number; kills: number; casts: Map<string, number> }

/** A caster's nightmare: four friars of one pull, set 16 m up the orto's open path and charging, the hero standing his ground at level `lv`, one life. */
export function playPack(build: string, lv: number, dodge: boolean, s = 1): PackResult {
  swings.clear();
  const r = new Run(build, dodge);
  seed = s * 7919;
  r.dress(process.env.GEAR ?? 'typical');
  r.picks = lv > 1 ? picksTo(build, lv) : [];
  r.apply();
  r.stats.revive();
  r.levelUp = () => {};
  const at = { x: -19.5, z: -96 }, pack = r.friars.slice(0, 4);
  for (const m of r.mobs) if (!pack.includes(m as Friar)) { m.state = 'dead'; m.hp = 0; }
  pack.forEach((f, i) => {
    const x = at.x + (i % 2 ? 0.7 : -0.7) + (rnd() - 0.5) * 0.4, z = at.z - 16 - Math.floor(i / 2) * 1.2 - rnd();
    Object.assign(f, { x, z, y: r.world.standHeight(x, z), state: 'chase', t: 0, mates: pack, home: { x, z, yaw: 0 } });
  });
  Object.assign(r.player.pos, { x: at.x, y: r.world.standHeight(at.x, at.z), z: at.z });
  const goal = { ...at, r: 1 };
  let lost = 0, contact = -1, kills = 0, pots = 0;
  while (r.time < 120 && !r.deaths && pack.some((m) => m.state !== 'dead')) {
    const h0 = r.stats.hp, z = r.zone('orto'), p0 = z.potions;
    r.step(goal);
    lost += Math.max(0, h0 - r.stats.hp) / r.stats.hpMax;
    pots += z.potions - p0;
    if (contact < 0 && pack.some((m) => m.state !== 'dead' && Math.hypot(m.x - r.player.pos.x, m.z - r.player.pos.z) < FRIAR.reach + 0.3)) { contact = r.time; kills = pack.filter((m) => m.state === 'dead').length; }
  }
  return { build, lv, dodge, won: !r.deaths && pack.every((m) => m.state === 'dead'), time: r.time, potions: pots, lost, contact, kills, casts: r.casts };
}

/**
 * San Giorgio's packs, where casters must cope: a pack pulled whole (PACKS3: the Fondamenta San Giovanni's, two marinai
 * running in and a monaco, or the Punta's, a monaco and two amanuensi casting from the back), the hero standing 14 m off
 * at level `lv` in GEAR (default typical3), one life.
 */
export function playPack3(build: string, lv: number, dodge: boolean, s = 1): PackResult {
  swings.clear();
  region(MAINLAND);
  const r = new Run(build, dodge);
  seed = s * 7919;
  r.dress(process.env.GEAR ?? 'typical3');
  r.picks = lv > 1 ? picksTo(build, lv) : [];
  r.apply();
  r.stats.revive();
  r.levelUp = () => {};
  r.quest.accepted3 = true;
  for (const g of r.quest.gates) if (g.needs === 'quest3') r.quest.open(g);
  r.paths.reset();
  const P = PACKS3[s % 2 ? 0 : 2], pack = r.l3.all.filter((m) => P.members.some(([k, x, z]) => m.kind === k && m.home.x === x && m.home.z === z));
  for (const m of r.mobs) if (!pack.includes(m as Priest)) { m.state = 'dead'; m.hp = 0; }
  const at = { x: P.at[0] + 14, z: P.at[1] };
  Object.assign(r.player.pos, { x: at.x, y: r.world.standHeight(at.x, at.z), z: at.z });
  for (const m of pack) { m.state = 'chase'; m.t = 0; }
  const goal = { ...at, r: 1 };
  let lost = 0, contact = -1, kills = 0, pots = 0;
  while (r.time < 150 && !r.deaths && pack.some((m) => m.state !== 'dead')) {
    const h0 = r.stats.hp, z = r.zone('fond.3'), p0 = z.potions;
    r.step(goal);
    lost += Math.max(0, h0 - r.stats.hp) / r.stats.hpMax;
    pots += z.potions - p0;
    if (contact < 0 && pack.some((m) => m.state !== 'dead' && m.kind.melee && Math.hypot(m.x - r.player.pos.x, m.z - r.player.pos.z) < m.kind.melee.reach + m.kind.radius + 0.3)) { contact = r.time; kills = pack.filter((m) => m.state === 'dead').length; }
  }
  return { build, lv, dodge, won: !r.deaths && pack.every((m) => m.state === 'dead'), time: r.time, potions: pots, lost, contact, kills, casts: r.casts };
}

// --- reports ---
const ZONES = ['orto', 'apiario', 'laguna', 'chiostri', 'chiesa', 'boss', 'fond.2', 'gastaldo', 'ospizio', 'maestra', 'boss2', 'fond.3', 'isola', 'biblio', 'commiss.', 'boss3', 'viaggio'];
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
    if (r.l3) out.push(`    level 3: ${r.l3.won ? 'Abate down' : 'NOT FINISHED'} in ${(r.l3.time / 60).toFixed(1)} min, ${r.l3.deaths} deaths, level ${r.l3.lv0} -> ${r.l3.lv} (${r.l3.xp} XP), boss fight ${r.l3.boss.toFixed(0)} s; kills ${Object.entries(r.l3.kills).map(([k, v]) => `${k} ${v}`).join(' ')}\n      at the Abate: ${r.l3.gold} gold, ${gearLine(r.l3.gear!)}`);
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

/** The pack: per level, wins (one life), s to clear it, hp lost, potions, s to the first friar in reach and friars dead by then. */
export function packTable(rs: PackResult[]): string {
  const out = [`${'build'.padEnd(8)}${pad('level', 6)} ${'bot'.padEnd(9)}${pad('wins', 7)}${pad('clear s', 9)}${pad('hp lost', 9)}${pad('pots', 6)}${pad('contact s', 11)}${pad('dead then', 11)}`];
  const key = (r: PackResult) => `${r.lv}|${r.dodge}`;
  for (const k of [...new Set(rs.map(key))]) {
    const g = rs.filter((r) => key(r) === k), lv = g[0].lv, won = g.filter((r) => r.won), met = g.filter((r) => r.contact >= 0);
    out.push(`${g[0].build.padEnd(8)}${pad(lv, 6)} ${(g[0].dodge ? 'dodge' : 'no dodge').padEnd(9)}${pad(`${won.length}/${g.length}`, 7)}${pad(won.length ? f1(mean(won.map((r) => r.time))) : '-', 9)}${pad(`${Math.round(mean(g.map((r) => r.lost)) * 100)}%`, 9)}` +
      `${pad(f1(mean(g.map((r) => r.potions))), 6)}${pad(met.length ? f1(mean(met.map((r) => r.contact))) : '-', 11)}${pad(met.length ? f1(mean(met.map((r) => r.kills))) : '-', 11)}`);
    if (process.env.DEALT) out.push(`    casts a run: ${[...new Set(g.flatMap((r) => [...r.casts.keys()]))].map((id) => `${id} ${f1(mean(g.map((r) => r.casts.get(id) ?? 0)))}`).join(', ')}`);
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
  out.push(`elites, dodging: ${rs.filter((r) => r.dodge && r.won).length}/${rs.filter((r) => r.dodge).length} won`);
  return out.join('\n');
}

if (process.argv[1]?.endsWith('balance.ts')) {
  const [mode, build, n, seeds] = process.argv.slice(2);
  const runs = (k: number, f: (s: number) => void) => { for (let s = 1; s <= k; s++) f(s); };
  const t0 = performance.now();
  if (mode === 'boss' || mode === 'boss2' || mode === 'boss3') {
    const rs: BossResult[] = [], two = mode === 'boss2', three = mode === 'boss3';
    for (const d of [true, false]) runs(Number(seeds ?? 3), (s) => rs.push(playBoss(build ?? 'mixed', Number(n ?? (three ? 17 : two ? 11 : 9)), d, s, process.env.GEAR ?? (three ? 'typical3' : two ? 'typical2' : 'typical'), two, three)));
    console.log(bossTable(rs));
  } else if (mode === 'commissario') {
    const rs: EliteResult[] = [];
    for (const d of [true, false]) for (const b of Object.keys(BUILDS)) for (const lv of [16, 17, 18]) runs(Number(build ?? 3), (s) => rs.push(playCommissario(b, lv, d, s)));
    console.log(eliteTable(rs));
  } else if (mode === 'campanaro') {
    const rs: EliteResult[] = [];
    for (const d of [true, false]) for (const b of Object.keys(BUILDS)) for (const lv of [16, 17, 18]) runs(Number(build ?? 3), (s) => rs.push(playCampanaro(b, lv, d, s)));
    console.log(eliteTable(rs));
  } else if (mode === 'drago') {
    const rs: EliteResult[] = [];
    for (const d of [true, false]) for (const b of build ? build.split(',') : Object.keys(BUILDS)) for (const lv of [18, 19]) runs(Number(n ?? 3), (s) => rs.push(playDrago(b, lv, d, s)));
    console.log(eliteTable(rs));
  } else if (mode === 'incoronazione') {
    const rs: EscortResult[] = [];
    for (const d of [true, false]) for (const b of Object.keys(BUILDS)) for (const lv of [16, 17, 18]) runs(Number(build ?? 3), (s) => rs.push(playIncoronazione(b, lv, d, s)));
    console.log(escortTable(rs));
  } else if (mode === 'pack3') {
    const rs: PackResult[] = [];
    for (const d of [true, false]) for (const lv of [15, 16, 17]) runs(Number(n ?? 6), (s) => rs.push(playPack3(build ?? 'arcane', lv, d, s)));
    console.log(packTable(rs));
  } else if (mode === 'route3') {
    const rs: RouteResult[] = [];
    runs(Number(n ?? 3), (s) => rs.push(playRoute(build ?? 'mixed', !process.env.NODODGE, s, true, true, true)));
    console.log(routeTable(rs));
  } else if (mode === 'pack') {
    const rs: PackResult[] = [];
    for (const d of [true, false]) for (const lv of [1, 4, 6]) runs(Number(n ?? 8), (s) => rs.push(playPack(build ?? 'arcane', lv, d, s)));
    console.log(packTable(rs));
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
