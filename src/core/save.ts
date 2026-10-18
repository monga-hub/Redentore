// Saved games: the state worth keeping as plain JSON (player, quest flags, who is dead, play
// time, the map explored so far, level, XP and level-up picks, the bag, what the hero wears), three localStorage slots, and the handoff that carries a loaded game across a reload.
// Loading and "Nuova partita" reload the page so every system boots clean (no stray bolts,
// cooldowns, damage over time or half-swung gates), then `deserialize` lays the saved state
// over the fresh world. No three.js and no DOM beyond Storage, so `npm run check` drives it in Node.
import { killAll } from '../enemies/caster.ts';
import { CARD, levelOf } from '../player/levels.ts';
import type { Quest } from '../quest/progress.ts';
import type { Bag, BagState } from '../loot/bag.ts';
import type { Equipment, GearState } from '../loot/gear.ts';

const VERSION = 1;
const SLOT_KEY = (i: number) => `redentore.save.${i}`;
const PENDING = 'redentore.pending'; // sessionStorage: the state to apply on the next boot
export const SLOTS = 3;
const GONE = 1e3; // s a loaded corpse has lain: past the sink, so it is hidden from the start

export interface GameState {
  v: number;
  player: { x: number; y: number; z: number; yaw: number; hp: number; mana: number; charge: number };
  // gates: ids of the open ones. accepted/out: Fra' Zuane's quest taken, back out on the fondamenta after
  // the boss; absent in saves from before him, which load with the quest already taken. blessed/blessLeft:
  // Fra' Bortolo's blessing taken and the s of it left; absent in saves from before him: not taken.
  quest: { key: boolean; gates: string[]; bossDead: boolean; accepted?: boolean; out?: boolean; blessed?: boolean; blessLeft?: number };
  dead: number[]; // indices into Game.mobs
  time: number; // s played
  fog?: string; // Discovery.encode(); absent in saves from before the fog of war, which load fully fogged
  // Level-up cards in the order picked, XP and the level it makes (lv is for readers: XP decides). Absent in
  // saves from before the levels: they load at level 1 with the starting kit, and as XP is the worth of the
  // dead, the level-ups their kills earned are offered one after another right after the load.
  build?: { xp: number; lv: number; picks: string[] };
  bag?: BagState; // gold and items picked up; absent in saves from before the loot, which load with an empty bag
  gear?: GearState; // slot -> item id worn; absent in saves from before the equipment, which load in the starter set
}

/** The live objects a save reads and writes. `mobs` must list every enemy in a fixed order (friars, then priests). */
export interface Game {
  player: { pos: { x: number; y: number; z: number }; facing: number };
  stats: { hp: number; mana: number; readonly hpMax: number; readonly manaMax: number };
  kit: { charge: number };
  /** `apply` lays the picks on the kit and stats (raising hpMax), so a load runs it before restoring hp. */
  levels: { xp: number; picks: string[]; apply(): void };
  quest: Quest;
  mobs: { state: string; hp: number; t: number }[];
  time: number;
  fog: { encode(): string; decode(s: string): boolean };
  bag: Bag;
  gear: Equipment;
}

export function serialize(g: Game): GameState {
  const { x, y, z } = g.player.pos;
  return {
    v: VERSION,
    player: { x, y, z, yaw: g.player.facing, hp: g.stats.hp, mana: g.stats.mana, charge: g.kit.charge },
    quest: { key: g.quest.key, gates: g.quest.gates.filter((q) => q.open).map((q) => q.id), bossDead: g.quest.bossDead, accepted: g.quest.accepted, out: g.quest.out, blessed: g.quest.blessed, blessLeft: g.quest.blessLeft },
    dead: g.mobs.flatMap((m, i) => (m.state === 'dead' ? [i] : [])),
    time: g.time,
    fog: g.fog.encode(),
    build: { xp: g.levels.xp, lv: levelOf(g.levels.xp).lv, picks: [...g.levels.picks] },
    bag: g.bag.encode(),
    gear: g.gear.encode(),
  };
}

/** Lay `s` over a freshly booted game. */
export function deserialize(g: Game, s: GameState): void {
  const p = s.player;
  Object.assign(g.player.pos, { x: p.x, y: p.y, z: p.z });
  g.player.facing = p.yaw;
  g.levels.xp = s.build?.xp ?? 0;
  g.levels.picks = (s.build?.picks ?? []).filter((id) => CARD.has(id)); // a card from another build is dropped
  if (s.gear) g.gear.decode(s.gear); // before the clamp too: Vigore raises the max
  g.levels.apply(); // before the clamp: a saved 1472 hp needs the raised max
  g.stats.hp = Math.min(Math.max(p.hp, 1), g.stats.hpMax); // never wake up dead
  g.stats.mana = Math.min(Math.max(p.mana, 0), g.stats.manaMax);
  g.kit.charge = p.charge;
  g.quest.accepted = s.quest.accepted ?? true;
  g.quest.out = s.quest.out ?? false;
  g.quest.blessed = s.quest.blessed ?? false;
  g.quest.blessLeft = Math.max(0, s.quest.blessLeft ?? 0);
  if (s.quest.key) g.quest.takeKey();
  for (const q of g.quest.gates) if (s.quest.gates.includes(q.id)) g.quest.open(q);
  if (s.quest.bossDead) g.quest.win();
  const dead = s.dead.map((i) => g.mobs[i]).filter((m) => m);
  killAll(dead);
  for (const m of dead) m.t = GONE;
  g.time = s.time;
  if (s.fog) g.fog.decode(s.fog); // a grid from another build's level is dropped: fogged, not garbled
  if (s.bag) g.bag.decode(s.bag);
}

/** Shape check for anything read back from storage: a hand-edited or older save is refused, not half-applied. */
export function valid(s: unknown): s is GameState {
  const o = s as GameState;
  const num = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  return !!o && o.v === VERSION && !!o.player && ['x', 'y', 'z', 'yaw', 'hp', 'mana', 'charge'].every((k) => num(o.player[k as keyof GameState['player']]))
    && !!o.quest && typeof o.quest.key === 'boolean' && typeof o.quest.bossDead === 'boolean' && Array.isArray(o.quest.gates)
    && ['accepted', 'out', 'blessed'].every((k) => [undefined, true, false].includes(o.quest[k as 'accepted' | 'out' | 'blessed']))
    && (o.quest.blessLeft === undefined || num(o.quest.blessLeft))
    && Array.isArray(o.dead) && o.dead.every(Number.isInteger) && num(o.time) && (o.fog === undefined || typeof o.fog === 'string')
    && (o.build === undefined || (!!o.build && num(o.build.xp) && num(o.build.lv) && Array.isArray(o.build.picks) && o.build.picks.every((x) => typeof x === 'string')))
    && (o.bag === undefined || (!!o.bag && num(o.bag.gold) && Array.isArray(o.bag.items) && o.bag.items.every((x) => Array.isArray(x) && typeof x[0] === 'string' && num(x[1]))))
    && (o.gear === undefined || (!!o.gear && typeof o.gear === 'object' && Object.values(o.gear).every((x) => typeof x === 'string')));
}

export interface Slot { label: string; savedAt: number; state: GameState }

function read(store: Storage, key: string): unknown {
  try { return JSON.parse(store.getItem(key) ?? 'null'); } catch { return null; }
}

/** The three slots; undefined = empty (or unreadable). */
export function slots(store: Storage = localStorage): (Slot | undefined)[] {
  return Array.from({ length: SLOTS }, (_, i) => {
    const s = read(store, SLOT_KEY(i)) as Slot | null;
    return s && typeof s.label === 'string' && typeof s.savedAt === 'number' && valid(s.state) ? s : undefined;
  });
}

/** False when storage is full or blocked (private mode). */
export function save(i: number, slot: Slot, store: Storage = localStorage): boolean {
  try { store.setItem(SLOT_KEY(i), JSON.stringify(slot)); return true; } catch { return false; }
}

/** Queue `s` for the next boot (see `takePending`). */
export function setPending(s: GameState, store: Storage = sessionStorage): boolean {
  try { store.setItem(PENDING, JSON.stringify(s)); return true; } catch { return false; }
}

/** The state queued by the last load, once: it is cleared so a later refresh starts afresh. */
export function takePending(store: Storage = sessionStorage): GameState | undefined {
  const s = read(store, PENDING);
  try { store.removeItem(PENDING); } catch { /* blocked storage: nothing was queued either */ }
  return valid(s) ? s : undefined;
}
