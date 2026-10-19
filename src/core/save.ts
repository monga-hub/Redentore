// Saved games: the state worth keeping as plain JSON (player, quest flags, who is dead, play
// time, the map explored so far, level, XP and level-up picks, the bag, what the hero wears), three localStorage slots, the handoff that carries a loaded game across a reload,
// and the autosave: the run in progress, kept whenever no fight is on, that a cold boot resumes. iOS reloads a tab
// it kills for memory (and a home-screen app relaunches from the start), which used to throw the whole run away.
// Loading and "Nuova partita" reload the page so every system boots clean (no stray bolts,
// cooldowns, damage over time or half-swung gates), then `deserialize` lays the saved state
// over the fresh world. No three.js and no DOM beyond Storage, so `npm run check` drives it in Node.
import { killAll } from '../enemies/caster.ts';
import { CARD, levelOf } from '../player/levels.ts';
import { BOONS, QUESTS, type Quest, type QuestId } from '../quest/progress.ts';
import type { Bag, BagState } from '../loot/bag.ts';
import type { Equipment, GearState } from '../loot/gear.ts';

const VERSION = 1;
/** Flags on Quest saved as they are: the second quest's, and Fra' Zuane's corona found and given back. */
const LEVEL2 = ['reported', 'accepted2', 'arrived', 'key2', 'boss2Dead', 'reported2', 'blessed2', 'relic', 'relicBack'] as const;
const SLOT_KEY = (i: number) => `redentore.save.${i}`;
const PENDING = 'redentore.pending'; // sessionStorage: the state to apply on the next boot
const AUTO = 'redentore.auto'; // localStorage: the run in progress, resumed by a boot with nothing pending
export const SLOTS = 3;
const GONE = 1e3; // s a loaded corpse has lain: past the sink, so it is hidden from the start

export interface GameState {
  v: number;
  player: { x: number; y: number; z: number; yaw: number; hp: number; mana: number; charge: number };
  // gates: ids of the open ones. accepted/out: Fra' Zuane's quest taken, back out on the fondamenta after
  // the boss; absent in saves from before him, which load with the quest already taken. blessed/blessLeft:
  // Fra' Bortolo's blessing taken and the s of it left; absent in saves from before him: not taken.
  // Level 2 (all absent in older saves: false): reported (first quest handed in), accepted2 (La dote delle Zitelle taken),
  // arrived (reached the Zitelle), key2 (the Maestra's key), boss2Dead, reported2, blessed2 (Fra' Bortolo's second infusion);
  // relic, relicBack: Fra' Zuane's corona picked up and given back (absent: false).
  // found: Fra' Bortolo found as Fra' Zuane asked; done: the quests done (quest/progress.ts QUESTS), whose XP is in build.xp.
  // Both absent in saves from before the quest rewards: found if he blessed the hero, done rebuilt from the flags.
  // Fra' Bortolo's Le teste dei frati (absent in older saves: not taken): asked, the heads in hand, the rite's boon ('' until then).
  quest: { key: boolean; gates: string[]; bossDead: boolean; accepted?: boolean; out?: boolean; blessed?: boolean; blessLeft?: number; found?: boolean; done?: string[]; asked?: boolean; heads?: number; boon?: string }
    & Partial<Record<typeof LEVEL2[number], boolean>>;
  dead: number[]; // indices into Game.mobs
  again?: number[]; // indices of the friars risen again (enemies/brain.ts rise); absent in older saves: none
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
  mobs: { state: string; hp: number; t: number; again?: boolean }[];
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
    quest: { key: g.quest.key, gates: g.quest.gates.filter((q) => q.open).map((q) => q.id), bossDead: g.quest.bossDead, accepted: g.quest.accepted, out: g.quest.out, blessed: g.quest.blessed, blessLeft: g.quest.blessLeft,
      found: g.quest.found, done: [...g.quest.done], asked: g.quest.asked, heads: g.quest.heads, boon: g.quest.boon, ...Object.fromEntries(LEVEL2.map((k) => [k, g.quest[k]])) },
    dead: g.mobs.flatMap((m, i) => (m.state === 'dead' ? [i] : [])),
    again: g.mobs.flatMap((m, i) => (m.again ? [i] : [])),
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
  g.quest.boon = BOONS.some((b) => b.id === s.quest.boon) ? s.quest.boon! : ''; // before the clamp too: the rite's boon may raise it
  g.levels.apply(); // before the clamp: a saved 1472 hp needs the raised max
  g.stats.hp = Math.min(Math.max(p.hp, 1), g.stats.hpMax); // never wake up dead
  g.stats.mana = Math.min(Math.max(p.mana, 0), g.stats.manaMax);
  g.kit.charge = p.charge;
  g.quest.accepted = s.quest.accepted ?? true;
  g.quest.out = s.quest.out ?? false;
  g.quest.blessed = s.quest.blessed ?? false;
  g.quest.blessLeft = Math.max(0, s.quest.blessLeft ?? 0);
  g.quest.asked = s.quest.asked ?? false;
  g.quest.heads = Math.max(0, Math.floor(s.quest.heads ?? 0));
  if (s.quest.key) g.quest.takeKey();
  for (const q of g.quest.gates) if (s.quest.gates.includes(q.id)) g.quest.open(q);
  if (s.quest.bossDead) g.quest.win();
  for (const k of LEVEL2) g.quest[k] = s.quest[k] ?? false;
  if (s.quest.boss2Dead) { g.quest.boss2Dead = false; g.quest.win2(); }
  g.quest.found = s.quest.found ?? g.quest.blessed;
  g.quest.done = s.quest.done ? s.quest.done.filter((id): id is QuestId => id in QUESTS) // one from another build is dropped
    : ([['chiave', g.quest.key], ['bortolo', g.quest.found], ['reverendissimo', g.quest.reported], ['zitelle', g.quest.reported2], ['relic', g.quest.relicBack]] as const).flatMap(([id, d]) => (d ? [id] : []));
  const dead = s.dead.map((i) => g.mobs[i]).filter((m) => m);
  killAll(dead);
  for (const m of dead) m.t = GONE;
  for (const i of s.again ?? []) if (g.mobs[i]) g.mobs[i].again = true;
  g.time = s.time;
  if (s.fog) g.fog.decode(s.fog); // a grid from another build's level is dropped: fogged, not garbled
  if (s.bag) g.bag.decode(s.bag);
}

/**
 * The quest XP counted into a save's build.xp, which the game takes off to find the worth of its dead. A save from
 * before the quest rewards counted only Fra' Zuane's two reports and his corona, at their old 150, 300 and 160: its other quests are paid on load.
 */
export function questXpIn(s: GameState): number {
  if (s.quest.done) return s.quest.done.reduce((n, id) => n + (id in QUESTS ? QUESTS[id as QuestId].xp : 0), 0);
  return (s.quest.reported ? 150 : 0) + (s.quest.reported2 ? 300 : 0) + (s.quest.relicBack ? 160 : 0);
}

/** Shape check for anything read back from storage: a hand-edited or older save is refused, not half-applied. */
export function valid(s: unknown): s is GameState {
  const o = s as GameState;
  const num = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  return !!o && o.v === VERSION && !!o.player && ['x', 'y', 'z', 'yaw', 'hp', 'mana', 'charge'].every((k) => num(o.player[k as keyof GameState['player']]))
    && !!o.quest && typeof o.quest.key === 'boolean' && typeof o.quest.bossDead === 'boolean' && Array.isArray(o.quest.gates)
    && ['accepted', 'out', 'blessed', ...LEVEL2].every((k) => [undefined, true, false].includes(o.quest[k as 'accepted' | 'out' | 'blessed'] as boolean | undefined))
    && (o.quest.blessLeft === undefined || num(o.quest.blessLeft))
    && [undefined, true, false].includes(o.quest.found) && (o.quest.done === undefined || (Array.isArray(o.quest.done) && o.quest.done.every((x) => typeof x === 'string')))
    && [undefined, true, false].includes(o.quest.asked) && (o.quest.heads === undefined || num(o.quest.heads)) && (o.quest.boon === undefined || typeof o.quest.boon === 'string')
    && Array.isArray(o.dead) && o.dead.every(Number.isInteger) && (o.again === undefined || (Array.isArray(o.again) && o.again.every(Number.isInteger))) && num(o.time) && (o.fog === undefined || typeof o.fog === 'string')
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

/** Keep `s` as the run in progress (main.ts, out of combat only, so a resume never lands mid-fight). False when storage is full or blocked. */
export function autosave(s: GameState, store: Storage = localStorage): boolean {
  try { store.setItem(AUTO, JSON.stringify(s)); return true; } catch { return false; }
}

/** The run in progress, if any: it stays until overwritten or cleared, so every cold boot resumes it. */
export function resume(store: Storage = localStorage): GameState | undefined {
  const s = read(store, AUTO);
  return valid(s) ? s : undefined;
}

/** "Nuova partita": the next boot starts afresh. */
export function clearAutosave(store: Storage = localStorage): void {
  try { store.removeItem(AUTO); } catch { /* blocked storage: nothing was kept either */ }
}
