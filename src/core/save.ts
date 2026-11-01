// Saved games: the state worth keeping as plain JSON (the hero chosen, player, quest flags, who is dead, play
// time, the map explored so far, level, XP and level-up picks, the bag, what the hero wears), one run per hero in
// localStorage, kept whenever no fight is on (the autosave). The squad screen (ui/select.ts) shows them all; the hero
// picked resumes his own run or starts afresh, and switching heroes reloads the page so every system boots clean (no
// stray bolts, cooldowns, damage over time or half-swung gates), then `deserialize` lays the saved state over the fresh
// world. iOS reloads a tab it kills for memory, which used to throw the whole run away: the run is kept on the phone. No three.js and no DOM beyond Storage, so `npm run check` drives it in Node.
import { killAll } from '../enemies/caster.ts';
import { BASE_ATTACK, CARD, levelOf } from '../player/levels.ts';
import { BOONS, QUESTS, type Quest, type QuestId } from '../quest/progress.ts';
import type { SideState } from '../quest/squero.ts';
import type { Bag, BagState } from '../loot/bag.ts';
import type { Equipment, GearState } from '../loot/gear.ts';
import { HEROES, heroOf, type Hero } from '../player/heroes.ts';

const VERSION = 1;
/** Flags on Quest saved as they are: the second quest's, Fra' Zuane's corona found and given back, the third quest's. */
const LEVEL2 = ['reported', 'accepted2', 'arrived', 'key2', 'boss2Dead', 'reported2', 'blessed2', 'relic', 'relicBack',
  'accepted3', 'landed', 'key3', 'boss3Dead', 'reported3', 'blessed3'] as const;
const GONE = 1e3; // s a loaded corpse has lain: past the sink, so it is hidden from the start
/** x past which nothing is walkable since level 2 moved to -X (level/plan.ts): the fondamenta's +X end. */
const OLD_EAST = 60;
/** Stiletto di ghiaccio left the Gelo's five to become its base attack, Caligo gelato in its place: what an older save
 *  learnt or picked of it is the fog, and its two upgrades the fog's for a hero with no claim to the stiletto. */
const STILETTO: Record<string, string> = { lance: 'caligo', lance_dmg: 'caligo_big', lance_split: 'caligo_freeze' };

export interface GameState {
  v: number;
  hero?: string; // player/heroes.ts; absent in saves from before the choice: the Risorto, who then started with Nube di peste
  player: { x: number; y: number; z: number; yaw: number; hp: number; mana: number; charge: number };
  // gates: ids of the open ones. accepted/out: Fra' Zuane's quest taken, back out on the fondamenta after
  // the boss; absent in saves from before him, which load with the quest already taken. blessed/blessLeft:
  // Fra' Bortolo's blessing taken and the s of it left; absent in saves from before him: not taken.
  // Level 2 (all absent in older saves: false): reported (first quest handed in), accepted2 (La dote delle Zitelle taken),
  // arrived (reached the Zitelle), key2 (the Maestra's key), boss2Dead, reported2, blessed2 (Fra' Bortolo's second infusion);
  // relic, relicBack: Fra' Zuane's corona picked up and given back (absent: false).
  // Level 3 (absent: false): accepted3 (Le nozze di San Giorgio taken), landed (set down on San Giorgio), key3 (the
  // Bibliotecario's key), boss3Dead, reported3, blessed3 (Fra' Bortolo's third infusion).
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
  // learned: abilities taught by the merchants' tomes (player/levels.ts TOMES); absent in older saves: none.
  // main: the base attack the book put on the big button (player/levels.ts BASE_ATTACK); absent: the hero's own.
  build?: { xp: number; lv: number; picks: string[]; learned?: string[]; main?: string };
  bag?: BagState; // gold and items picked up; absent in saves from before the loot, which load with an empty bag
  gear?: GearState; // slot -> item id worn; absent in saves from before the equipment, which load in the starter set
  side?: SideState; // the side quests taken, handed in, their kill counts and steps; absent in saves from before Mastro Iseppo: none (steps absent: the first)
}

/** The live objects a save reads and writes. `mobs` must list every enemy in a fixed order (friars, then priests). */
export interface Game {
  hero: Hero;
  player: { pos: { x: number; y: number; z: number }; facing: number };
  stats: { hp: number; mana: number; readonly hpMax: number; readonly manaMax: number };
  kit: { charge: number };
  /** `apply` lays the picks on the kit and stats (raising hpMax), so a load runs it before restoring hp. */
  levels: { xp: number; picks: string[]; learned: string[]; main: string; apply(): void };
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
    hero: g.hero,
    player: { x, y, z, yaw: g.player.facing, hp: g.stats.hp, mana: g.stats.mana, charge: g.kit.charge },
    quest: { key: g.quest.key, gates: g.quest.gates.filter((q) => q.open).map((q) => q.id), bossDead: g.quest.bossDead, accepted: g.quest.accepted, out: g.quest.out, blessed: g.quest.blessed, blessLeft: g.quest.blessLeft,
      found: g.quest.found, done: [...g.quest.done], asked: g.quest.asked, heads: g.quest.heads, boon: g.quest.boon, ...Object.fromEntries(LEVEL2.map((k) => [k, g.quest[k]])) },
    dead: g.mobs.flatMap((m, i) => (m.state === 'dead' ? [i] : [])),
    again: g.mobs.flatMap((m, i) => (m.again ? [i] : [])),
    time: g.time,
    fog: g.fog.encode(),
    build: { xp: g.levels.xp, lv: levelOf(g.levels.xp).lv, picks: [...g.levels.picks], learned: [...g.levels.learned], main: g.levels.main },
    bag: g.bag.encode(),
    gear: g.gear.encode(),
    side: g.quest.side.encode(),
  };
}

/** Lay `s` over a freshly booted game. */
export function deserialize(g: Game, s: GameState): void {
  const p = s.player;
  Object.assign(g.player.pos, { x: p.x, y: p.y, z: p.z });
  g.player.facing = p.yaw;
  g.levels.xp = s.build?.xp ?? 0;
  g.hero = heroOf(s.hero);
  const stiletto = HEROES[g.hero].school.some((k) => BASE_ATTACK[k] === 'lance'), was = (id: string) => (id === 'lance' || !stiletto ? STILETTO[id] ?? id : id);
  g.levels.picks = (s.build?.picks ?? []).map(was).filter((id) => CARD.has(id)); // a card from another build is dropped
  g.levels.learned = (s.build?.learned ?? []).map(was).filter((id) => CARD.get(id)?.kind === 'ability');
  g.levels.main = typeof s.build?.main === 'string' ? s.build.main : '';
  if (s.hero === undefined && !g.levels.learned.includes('plague')) g.levels.learned.push('plague'); // the Risorto's old start
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
  if (s.quest.boss3Dead) { g.quest.boss3Dead = false; g.quest.win3(); }
  if (p.x > OLD_EAST) { // a save from when level 2 lay at +X: its hero stood out there, now open ground; woken at the checkpoint
    const c = g.quest.checkpoint();
    Object.assign(g.player.pos, { x: c.x, y: 0, z: c.z });
    g.player.facing = c.yaw;
  }
  g.quest.found = s.quest.found ?? g.quest.blessed;
  g.quest.done = s.quest.done ? s.quest.done.filter((id): id is QuestId => id in QUESTS) // one from another build is dropped
    : ([['chiave', g.quest.key], ['bortolo', g.quest.found], ['reverendissimo', g.quest.reported], ['zitelle', g.quest.reported2], ['relic', g.quest.relicBack], ['sangiorgio', g.quest.reported3]] as const).flatMap(([id, d]) => (d ? [id] : []));
  const dead = s.dead.map((i) => g.mobs[i]).filter((m) => m);
  killAll(dead);
  for (const m of dead) m.t = GONE;
  for (const i of s.again ?? []) if (g.mobs[i]) g.mobs[i].again = true;
  g.time = s.time;
  if (s.fog) g.fog.decode(s.fog); // a grid from another build's level is dropped: fogged, not garbled
  if (s.bag) g.bag.decode(s.bag);
  if (s.side) g.quest.side.decode(s.side);
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
  return !!o && o.v === VERSION && (o.hero === undefined || typeof o.hero === 'string') && !!o.player && ['x', 'y', 'z', 'yaw', 'hp', 'mana', 'charge'].every((k) => num(o.player[k as keyof GameState['player']]))
    && !!o.quest && typeof o.quest.key === 'boolean' && typeof o.quest.bossDead === 'boolean' && Array.isArray(o.quest.gates)
    && ['accepted', 'out', 'blessed', ...LEVEL2].every((k) => [undefined, true, false].includes(o.quest[k as 'accepted' | 'out' | 'blessed'] as boolean | undefined))
    && (o.quest.blessLeft === undefined || num(o.quest.blessLeft))
    && [undefined, true, false].includes(o.quest.found) && (o.quest.done === undefined || (Array.isArray(o.quest.done) && o.quest.done.every((x) => typeof x === 'string')))
    && [undefined, true, false].includes(o.quest.asked) && (o.quest.heads === undefined || num(o.quest.heads)) && (o.quest.boon === undefined || typeof o.quest.boon === 'string')
    && Array.isArray(o.dead) && o.dead.every(Number.isInteger) && (o.again === undefined || (Array.isArray(o.again) && o.again.every(Number.isInteger))) && num(o.time) && (o.fog === undefined || typeof o.fog === 'string')
    && (o.build === undefined || (!!o.build && num(o.build.xp) && num(o.build.lv) && Array.isArray(o.build.picks) && o.build.picks.every((x) => typeof x === 'string')
      && (o.build.learned === undefined || (Array.isArray(o.build.learned) && o.build.learned.every((x) => typeof x === 'string')))))
    && (o.bag === undefined || (!!o.bag && num(o.bag.gold) && Array.isArray(o.bag.items) && o.bag.items.every((x) => Array.isArray(x) && typeof x[0] === 'string' && num(x[1]))))
    && (o.gear === undefined || (!!o.gear && typeof o.gear === 'object' && Object.values(o.gear).every((x) => typeof x === 'string')))
    && (o.side === undefined || (!!o.side && [o.side.taken, o.side.done].every((a) => Array.isArray(a) && a.every((x) => typeof x === 'string'))
      && [o.side.kills, o.side.steps].every((r) => r === undefined || (!!r && typeof r === 'object' && Object.values(r).every(num)))));
}

function read(store: Storage, key: string): unknown {
  try { return JSON.parse(store.getItem(key) ?? 'null'); } catch { return null; }
}

/** Each hero's own run: his world, quests, bag, gear and level, kept apart so playing one never touches another's. */
const RUN = (hero: string) => `redentore.hero.${hero}`;

/** Keep `s` as its hero's run (main.ts, out of combat only, so a resume never lands mid-fight). False when storage is full or blocked. */
export function autosave(s: GameState, store: Storage = localStorage): boolean {
  try { store.setItem(RUN(heroOf(s.hero)), JSON.stringify(s)); return true; } catch { return false; }
}

/** `hero`'s run, if any (undefined: he starts a new game); junk is refused. */
export function resume(hero: Hero, store: Storage = localStorage): GameState | undefined {
  const s = read(store, RUN(hero));
  return valid(s) ? s : undefined;
}

/** The squad screen's "Ricomincia", confirmed: `hero`'s run gone, every other hero's untouched. */
export function forget(hero: Hero, store: Storage = localStorage): void {
  try { store.removeItem(RUN(hero)); } catch { /* blocked storage: nothing was kept either */ }
}

/** The level a run has reached (1-3): the quest it has taken. */
export const chapter = (s: GameState) => (s.quest.accepted3 ? 3 : s.quest.accepted2 ? 2 : 1);

/** Most advanced first: more XP, then more time played. */
const ahead = (a: GameState, b: GameState) => (b.build?.xp ?? 0) - (a.build?.xp ?? 0) || b.time - a.time;

const MIGRATED = 'redentore.roster.v1';
const OLD = ['redentore.auto', 'redentore.save.0', 'redentore.save.1', 'redentore.save.2'];
/** The old saves, as they were, kept once the migration has moved them. */
export const BACKUP = 'redentore.backup';

/**
 * Once: the old shared saves (the autosave, three slots) go to their heroes (absent: the Risorto), the most advanced
 * one each, unless he has a run already. All of them stay in BACKUP as they were; the old bar goes to the autosave's hero.
 */
export function migrate(store: Storage = localStorage): void {
  try {
    if (store.getItem(MIGRATED)) return;
    const raw = OLD.map((k) => store.getItem(k));
    const parse = (r: string | null) => { try { return JSON.parse(r ?? 'null'); } catch { return null; } };
    const auto = parse(raw[0]), states = [auto, ...raw.slice(1).map((r) => parse(r)?.state)].filter(valid);
    const best = new Map<Hero, GameState>();
    for (const s of states.sort(ahead)) if (!best.has(heroOf(s.hero))) best.set(heroOf(s.hero), s);
    for (const [hero, s] of best) if (!resume(hero, store)) autosave(s, store);
    if (raw.some((r) => r !== null)) store.setItem(BACKUP, JSON.stringify(Object.fromEntries(OLD.map((k, i) => [k, raw[i]]))));
    const bar = store.getItem('redentore.bar'), mine = valid(auto) ? `redentore.bar.${heroOf(auto.hero)}` : '';
    if (bar && mine && !store.getItem(mine)) store.setItem(mine, bar);
    for (const k of OLD) store.removeItem(k);
    store.setItem(MIGRATED, '1');
  } catch { /* blocked or full storage: the old keys stay, tried again next boot */ }
}
