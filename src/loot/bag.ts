// Loot, Diablo style: what the dead drop and the bag it goes into. Gold by the enemy's tier (the
// boss showers it), now and then a flavour item: relics, rosaries, candles, bone trinkets, each
// with an id, a rarity and a line of lore, no stats yet. The bag keeps gold and stacks by item
// id, ready for a vendor or equipment later. No three.js and no DOM, so `npm run check` drives it in Node.

export type Rarity = 'comune' | 'noncomune' | 'raro' | 'epico' | 'leggendario';
export const RARITY: Record<Rarity, { name: string; color: string }> = {
  comune: { name: 'Comune', color: '#e8e2d0' },
  noncomune: { name: 'Non comune', color: '#3fd84a' },
  raro: { name: 'Raro', color: '#4a8cff' },
  epico: { name: 'Epico', color: '#b65cff' },
  leggendario: { name: 'Leggendario', color: '#ff8a1a' },
};

/** `icon` keys the glyph (ui/bag.ts) and the shape on the ground (loot/drops.ts). */
export type Icon = 'rosary' | 'candle' | 'bone' | 'relic' | 'medal' | 'vial' | 'skull' | 'nail';
export interface Item { id: string; name: string; rarity: Rarity; icon: Icon; lore: string }

export const ITEMS: readonly Item[] = [
  { id: 'rosario-bosso', name: 'Rosario di bosso', rarity: 'comune', icon: 'rosary', lore: 'Grani consumati da mille Ave Maria sussurrate nella peste.' },
  { id: 'mozzicone', name: 'Mozzicone di candela', rarity: 'comune', icon: 'candle', lore: 'Sego annerito. Ha illuminato l’ultima notte di qualcuno.' },
  { id: 'falange', name: 'Falange incisa', rarity: 'comune', icon: 'bone', lore: 'Un dito d’osso con un nome graffiato sopra, ormai illeggibile.' },
  { id: 'medaglia-rocco', name: 'Medaglietta di San Rocco', rarity: 'noncomune', icon: 'medal', lore: 'Il santo della peste mostra la piaga. Non è bastato.' },
  { id: 'candela-votiva', name: 'Candela votiva del Redentore', rarity: 'noncomune', icon: 'candle', lore: 'Accesa la terza domenica di luglio, non si è mai spenta del tutto.' },
  { id: 'olio-santo', name: 'Ampolla d’olio santo', rarity: 'noncomune', icon: 'vial', lore: 'L’olio dell’estrema unzione, rappreso e tiepido al tatto.' },
  { id: 'rosario-ambra', name: 'Rosario d’ambra', rarity: 'raro', icon: 'rosary', lore: 'Dentro ogni grano dorme un insetto più vecchio di Venezia.' },
  { id: 'dente-santo', name: 'Dente di santo in teca', rarity: 'raro', icon: 'relic', lore: 'Un cartiglio dice «Beato Felice». Il dente dice altro.' },
  { id: 'teschio-cera', name: 'Teschio di cera', rarity: 'raro', icon: 'skull', lore: 'Ex voto modellato sul volto di un frate. Suda d’estate.' },
  { id: 'reliquiario', name: 'Reliquiario d’argento', rarity: 'epico', icon: 'relic', lore: 'Sbalzato a Rialto nel 1577. Qualcosa, dentro, bussa.' },
  { id: 'ossa-voto', name: 'Ossa del secondo voto', rarity: 'epico', icon: 'bone', lore: 'Legate con lo spago rosso del Reverendissimo, una per ogni anima promessa.' },
  { id: 'chiodo', name: 'Chiodo del Redentore', rarity: 'leggendario', icon: 'nail', lore: 'Il Reverendissimo lo stringeva in pugno. È ancora caldo.' },
];
export const ITEM = new Map(ITEMS.map((i) => [i.id, i]));

/** Who drops what: `gold` [min, max] per pile, `piles` of it, `items` rolls at `chance` each, rarities weighted. */
export type Tier = 'worker' | 'friar' | 'priest' | 'elite' | 'boss';
interface Table { gold: [number, number]; piles: number; items: number; chance: number; weights: Partial<Record<Rarity, number>> }
export const TABLES: Record<Tier, Table> = {
  worker: { gold: [1, 3], piles: 1, items: 1, chance: 0.06, weights: { comune: 8, noncomune: 2 } },
  friar: { gold: [2, 6], piles: 1, items: 1, chance: 0.14, weights: { comune: 7, noncomune: 3, raro: 0.6 } },
  priest: { gold: [4, 10], piles: 1, items: 1, chance: 0.22, weights: { comune: 5, noncomune: 4, raro: 1.2, epico: 0.15 } },
  elite: { gold: [20, 40], piles: 2, items: 2, chance: 0.7, weights: { noncomune: 4, raro: 4, epico: 1 } },
  boss: { gold: [45, 70], piles: 8, items: 3, chance: 1, weights: { raro: 3, epico: 2 } },
};
export const BOSS_PRIZE = 'chiodo'; // the Reverendissimo's fall always yields the nail

export interface Drop { gold: number[]; items: string[] }

/** What one death drops: the gold piles and the item ids. `rnd` in [0, 1). */
export function roll(tier: Tier, rnd: () => number = Math.random): Drop {
  const t = TABLES[tier], [lo, hi] = t.gold;
  const gold = Array.from({ length: t.piles }, () => lo + Math.floor(rnd() * (hi - lo + 1)));
  const items: string[] = tier === 'boss' ? [BOSS_PRIZE] : [];
  for (let i = 0; i < t.items; i++) {
    if (rnd() >= t.chance) continue;
    const r = pick(t.weights, rnd), pool = ITEMS.filter((x) => x.rarity === r && x.id !== BOSS_PRIZE);
    items.push(pool[Math.floor(rnd() * pool.length)].id);
  }
  return { gold, items };
}

function pick(w: Partial<Record<Rarity, number>>, rnd: () => number): Rarity {
  const e = Object.entries(w) as [Rarity, number][];
  let r = rnd() * e.reduce((s, [, v]) => s + v, 0);
  for (const [k, v] of e) if ((r -= v) < 0) return k;
  return e[e.length - 1][0];
}

export interface Stack { id: string; n: number }
/** Saved form: gold and [id, count] per slot, in slot order. */
export interface BagState { gold: number; items: [string, number][] }

export class Bag {
  static readonly SLOTS = 30;
  static readonly STACK = 20; // a slot holds this many of one item
  gold = 0;
  readonly items: Stack[] = [];

  /** Put `n` of `id` in, topping up stacks first; false (and nothing added) when it does not all fit. */
  add(id: string, n = 1): boolean {
    if (!ITEM.has(id) || n < 1) return false;
    const room = this.items.reduce((s, x) => s + (x.id === id ? Bag.STACK - x.n : 0), 0) + (Bag.SLOTS - this.items.length) * Bag.STACK;
    if (room < n) return false;
    for (const x of this.items) if (x.id === id && x.n < Bag.STACK) { const k = Math.min(n, Bag.STACK - x.n); x.n += k; n -= k; }
    while (n > 0) { const k = Math.min(n, Bag.STACK); this.items.push({ id, n: k }); n -= k; }
    return true;
  }

  /** Take `n` of `id` out (a vendor, later); false when there are fewer. */
  remove(id: string, n = 1): boolean {
    if (this.count(id) < n) return false;
    for (let i = this.items.length - 1; i >= 0 && n > 0; i--) {
      const x = this.items[i];
      if (x.id !== id) continue;
      const k = Math.min(n, x.n);
      x.n -= k;
      n -= k;
      if (!x.n) this.items.splice(i, 1);
    }
    return true;
  }

  count(id: string): number {
    return this.items.reduce((s, x) => s + (x.id === id ? x.n : 0), 0);
  }

  encode(): BagState {
    return { gold: this.gold, items: this.items.map((x) => [x.id, x.n]) };
  }

  /** Lay a saved bag over this one; ids from another build are dropped. */
  decode(s: BagState): void {
    this.gold = Math.max(0, Math.floor(s.gold));
    this.items.length = 0;
    for (const [id, n] of s.items) if (ITEM.has(id) && n >= 1) this.add(id, Math.min(Math.floor(n), Bag.STACK));
  }
}
