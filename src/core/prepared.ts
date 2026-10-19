// A hero ready for level 2, built in: what a player usually has when Fra' Zuane offers La dote delle Zitelle.
// The Reverendissimo is handed in, Fra' Bortolo found and his heads' rite done, the corona given back (its medal in the
// bag), level 12 (~1025 XP to the boss with the key's and Bortolo's quests, then the hand-in, the heads and the corona:
// 1525), every slot in level 1's purple, a frost and bone kit on the bar. Standing by Fra' Zuane on the fondamenta.
// The menu offers it as "Nuova partita: dal livello 2"; `migration` and `install` put it once in place of every old save.
// Plain data over a fresh game's serialize: no three.js, so `npm run check` drives it in Node.
import { levelOf } from '../player/levels.ts';
import { RELIC_PRIZE } from '../loot/bag.ts';
import { Discovery } from './discovery.ts';
import { autosave, resume, save, slots, wipe, type GameState } from './save.ts';
import { saveBar, type Layout } from '../abilities/system.ts';

export const XP = 1525;
/** Level-up cards for levels 2..12, as `offer` deals them: an ability on the even levels to 10, an upgrade or passive between. */
export const PICKS = ['step', 'hp', 'frost', 'plague_dps', 'nova', 'fall_third', 'lance', 'fx_fallplague', 'font', 'dmg', 'hp'];
/** Level 1's purple set, one piece a slot. */
export const GEAR = { testa: 'mitria', amuleto: 'ruta-oro', spalle: 'mantella-peste', torso: 'saio-voto', mani: 'guanti-palladio', gambe: 'cosciali-lazzaretto', piedi: 'zoccoli-redentore', anello: 'anello-1576', arma: 'pastorale' };
/** The bar: the club on 1, the potion on R, the rest in the touch fan's order. */
export const BAR: Layout = { bar: ['fall', 'frost', 'lance', 'plague', 'font', 'step', 'nova', 'mend', null, 'potion'], off: [] };
const UNSEEN = new Set(['giudecca', 'zitelle']); // level 2's zones: not walked yet

/**
 * The prepared hero laid over `fresh` (serialize of a just-booted game): `fallen` is how many of its mobs are level 1's
 * (they come first, and the Reverendissimo's fall took them all); `areas` the level's, whose level-1 ones are seen.
 */
export function prepared(fresh: GameState, fallen: number, areas: readonly { zone: string; x0: number; x1: number; z0: number; z1: number }[]): GameState {
  const fog = new Discovery(areas);
  for (const a of areas) {
    if (UNSEEN.has(a.zone)) continue;
    for (let x = a.x0; x <= a.x1 + 8; x += 8) for (let z = a.z0; z <= a.z1 + 8; z += 8) fog.reveal(Math.min(x, a.x1), Math.min(z, a.z1));
  }
  return {
    ...fresh,
    player: { x: 1.5, y: 0, z: 15, yaw: Math.atan2(3 - 1.5, 12.5 - 15), hp: 1e6, mana: 1e6, charge: 0 }, // full, facing Fra' Zuane
    quest: {
      ...fresh.quest, key: true, gates: ['grata-nord', 'grata-ovest', 'coro', 'portone'], bossDead: true, accepted: true, out: true,
      blessed: true, blessLeft: 0, found: true, done: ['chiave', 'bortolo', 'teste', 'relic', 'reverendissimo'], asked: true, heads: 0, boon: 'vigore',
      reported: true, relic: true, relicBack: true,
    },
    dead: Array.from({ length: fallen }, (_, i) => i),
    again: [],
    time: 2 * 3600,
    fog: fog.encode(),
    build: { xp: XP, lv: levelOf(XP).lv, picks: [...PICKS] },
    bag: { gold: 650, items: [[RELIC_PRIZE, 1]] },
    gear: { ...GEAR },
    side: { taken: [], done: [], kills: {} },
  };
}

/** Raise when a new prepared save must replace the captain's saves again. */
const MIGRATION = 'redentore.prepared.v1';

/**
 * Once per MIGRATION: true on the first boot since when there are saves to replace, so the old ones go and the prepared
 * hero comes in (`install`); a first launch with nothing saved keeps its fresh game. main.ts asks before the kit reads the bar.
 */
export function migration(store: Storage = localStorage): boolean {
  try {
    if (store.getItem(MIGRATION)) return false;
    store.setItem(MIGRATION, '1');
    return slots(store).some(Boolean) || !!resume(store);
  } catch { return false; } // blocked storage: nothing to replace either
}

/** Every slot and the autosave gone, the prepared hero in slot 1 and the autosave (so this boot resumes it), its bar laid out. */
export function install(s: GameState, store: Storage = localStorage): void {
  wipe(store);
  save(0, { label: 'Pronto per il livello 2', savedAt: Date.now(), state: s }, store);
  autosave(s, store);
  saveBar(BAR, store);
}
