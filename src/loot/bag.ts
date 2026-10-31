// Loot, Diablo style: what the dead drop and the bag it goes into. Gold by the enemy's tier (the
// boss showers it), now and then a flavour item (relics, rosaries, candles, bone trinkets, each
// with an id, a rarity and a line of lore: vendor junk) and, on its own roll, a piece of gear
// (loot/gear.ts). The bag keeps gold and stacks by item id; gear doesn't stack. No three.js and no
// DOM, so `npm run check` drives it in Node.
import { GEAR, type Slot, type Stats } from './gear.ts';

export type Rarity = 'comune' | 'noncomune' | 'raro' | 'epico' | 'leggendario';
export const RARITY: Record<Rarity, { name: string; color: string }> = {
  comune: { name: 'Comune', color: '#e8e2d0' },
  noncomune: { name: 'Non comune', color: '#3fd84a' },
  raro: { name: 'Raro', color: '#4a8cff' },
  epico: { name: 'Epico', color: '#b65cff' },
  leggendario: { name: 'Leggendario', color: '#ff8a1a' },
};

/** `icon` keys the glyph (ui/bag.ts) and the shape on the ground (loot/drops.ts). */
export type Icon = 'rosary' | 'candle' | 'bone' | 'relic' | 'medal' | 'vial' | 'skull' | 'nail'
  | 'helm' | 'shoulders' | 'chest' | 'gloves' | 'legs' | 'boots' | 'club' | 'amulet' | 'ring';
/** Gear has a `slot`, its `stats` and an item level; flavour items only a lore line. */
/** `l2`: from level 2 (the Giudecca and the Zitelle): only its dead drop it. `quest`: no table rolls it and Fra' Bortolo won't buy it (the friars' heads aren't even bagged: loot/drops.ts collect). */
export interface Item { id: string; name: string; rarity: Rarity; icon: Icon; lore: string; slot?: Slot; stats?: Stats; ilvl?: number; l2?: true; l3?: true; quest?: true; unique?: true; pages?: readonly string[] }
/** The level an item drops in (`l2`, `l3`). */
export const levelOfItem = (x: Item): 1 | 2 | 3 => (x.l3 ? 3 : x.l2 ? 2 : 1);
/** Quest items' colour, on the ground and in the tracker. */
export const QUEST_COLOR = '#ffd84a';

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
  // Level 2.
  { id: 'spoletta', name: 'Spoletta d’osso', rarity: 'comune', icon: 'bone', lore: 'Ci si avvolgeva il filo. Ora ci si avvolge qualcos’altro.', l2: true },
  { id: 'ferro-gondola', name: 'Ferro di prua', rarity: 'noncomune', icon: 'nail', lore: 'Sei denti per i sestieri, uno per la Giudecca. Arrugginito.', l2: true },
  { id: 'lume-codega', name: 'Lume della codega', rarity: 'noncomune', icon: 'candle', lore: 'Faceva luce a chi tornava a casa di notte. Non a tutti.', l2: true },
  { id: 'merletto', name: 'Ritaglio di punto in aria', rarity: 'raro', icon: 'relic', lore: 'Un palmo di merletto bianco. Ogni nodo è stretto attorno a un nome.', l2: true },
  { id: 'dote', name: 'Borsa della dote', rarity: 'epico', icon: 'relic', lore: 'Monete di cent’anni diversi, e nessuna sposa.', l2: true },
  { id: 'filo-oro', name: 'Filo d’oro del velo', rarity: 'leggendario', icon: 'rosary', lore: 'Il primo e l’ultimo punto del velo. Tira, se hai coraggio.', l2: true },
  // Fra' Zuane's keepsake (quest/progress.ts rollRelic): off any of the dead, once a run.
  { id: 'corona-zuane', name: 'Corona del portinaio', rarity: 'leggendario', icon: 'rosary', lore: 'Grani d’ulivo e una medaglietta consumata dal pollice. Fra’ Zuane la perse nell’orto: riportagliela, sulla fondamenta.', quest: true },
  // Fra' Bortolo's heads (quest/progress.ts HEADS): off the friars while he wants them.
  { id: 'testa-frate', name: 'Testa di frate', rarity: 'comune', icon: 'skull', lore: 'Per il rito della ruta di Fra’ Bortolo. Sorride ancora, sotto il cappuccio.', quest: true },
  // Mastro Iseppo's quests (quest/squero.ts): off the drowned, the elites, found in the Zitelle and the Redentore.
  { id: 'ferro-iseppo', name: 'Ferro di Mastro Iseppo', rarity: 'noncomune', icon: 'nail', lore: 'Sei denti e una I incisa sotto il collo. Mastro Iseppo li rivuole, allo squero.', quest: true, l2: true },
  { id: 'testa-gastaldo', name: 'Testa del Gastaldo', rarity: 'raro', icon: 'skull', lore: 'Ha ancora il cappello. Mastro Iseppo la vuole appesa al suo tezon.', quest: true, l2: true },
  { id: 'forbici-maestra', name: 'Forbici della Maestra', rarity: 'raro', icon: 'nail', lore: 'Fini come un ago. Tirano verso le Zitelle, come un filo. Per Mastro Iseppo, allo squero.', quest: true, l2: true },
  { id: 'ditale-marieta', name: 'Ditale di Marieta', rarity: 'raro', icon: 'medal', lore: 'Argento consumato fino al buco. Mastro Iseppo lo regalò a sua figlia.', quest: true, l2: true },
  { id: 'ex-voto', name: 'Gondolina di pero', rarity: 'raro', icon: 'relic', lore: 'L’ex voto dello squero, 1577: una gondola lunga un palmo, il ferro d’argento a prua. Per Mastro Iseppo.', quest: true, l2: true },
  { id: 'lettera-marieta', name: 'Lettera di Marieta', rarity: 'epico', icon: 'relic', lore: 'Ceralacca delle Zitelle, e sopra: «Al proto Iseppo, squero de la Zuecca». Mai spedita.', quest: true, l2: true },
  // Level 3.
  { id: 'gettone-traghetto', name: 'Gettone del traghetto', rarity: 'comune', icon: 'medal', lore: 'Un soldo forato per passare l’acqua. Nessuno l’ha mai speso.', l3: true },
  { id: 'calamaio', name: 'Calamaio dello scriptorium', rarity: 'noncomune', icon: 'vial', lore: 'Inchiostro di seppia e di qualcos’altro. Non si secca.', l3: true },
  { id: 'registro', name: 'Pagina del registro dei morti', rarity: 'raro', icon: 'relic', lore: 'Nomi della Giudecca in tre grafie diverse. L’ultimo è a metà.', l3: true },
  { id: 'calice-cana', name: 'Calice di Cana', rarity: 'epico', icon: 'vial', lore: 'Ci si versava il vino delle nozze. Ora sa di sale.', l3: true },
  // San Giorgio's side quests (quest/squero.ts): the Fanalista's oil off the drowned, the Nostromo's snuffer.
  { id: 'ampolla-faro', name: 'Ampolla d’olio dei fanali', rarity: 'noncomune', icon: 'vial', lore: 'Olio di lino per i fari della darsena. I marinai la portavano alla cintura, per il Fanalista.', quest: true, l3: true },
  { id: 'spegnimoccolo', name: 'Spegnimoccolo del Nostromo', rarity: 'raro', icon: 'candle', lore: 'Un cono di ferro su un’asta: spegneva i fari ogni notte. Per il Fanalista, alla darsena.', quest: true, l3: true },
  // Padre Archivista's: the well's water for the lavabi, and his flasks (a reward: no table rolls them).
  { id: 'acqua-allori', name: 'Brocca d’acqua degli Allori', rarity: 'noncomune', icon: 'vial', lore: 'Acqua del pozzo del chiostro, di nuovo acqua. Per i lavabi dell’Antirefettorio, una per lavabo.', quest: true, l3: true },
  { id: 'ampolle-benedetto', name: 'Ampolle di San Benedetto', rarity: 'epico', icon: 'vial', lore: 'Tre ampolle dell’ultima acqua buona di Padre Archivista. Il vino del Calice di Cana ci si stempera.', l3: true, unique: true },
  // The Veronese's: the four musicians' instruments out of the Nozze, and the canvas itself off the Commissario delle Arti.
  { id: 'viola-gamba', name: 'Viola da gamba del Veronese', rarity: 'raro', icon: 'relic', lore: 'Bianca, come la suona il pittore in primo piano nelle Nozze. Le corde vibrano da sole.', quest: true, l3: true },
  { id: 'violino-tintoretto', name: 'Violino del Tintoretto', rarity: 'raro', icon: 'relic', lore: 'Il Tintoretto lo suona nelle Nozze, accanto al Veronese. Odora di trementina.', quest: true, l3: true },
  { id: 'violone-tiziano', name: 'Violone di Tiziano', rarity: 'raro', icon: 'relic', lore: 'Il vecchio Tiziano, in rosso, al violone. Pesa quanto un uomo, e non si lamenta.', quest: true, l3: true },
  { id: 'flauto-bassano', name: 'Flauto del Bassano', rarity: 'raro', icon: 'relic', lore: 'Jacopo Bassano al flauto, dietro i suonatori. Ha ancora il fiato dentro.', quest: true, l3: true },
  { id: 'tela-arrotolata', name: 'Tela arrotolata delle Nozze di Cana', rarity: 'epico', icon: 'relic', lore: 'Sessantasei metri quadri di tela, tagliati dalla cornice l’11 settembre 1797 e arrotolati col colore all’infuori. Per il Veronese.', quest: true, l3: true },
  // The Cardinale's: the conclave's voting slips, still copied by the amanuensi.
  { id: 'scheda-conclave', name: 'Scheda del conclave', rarity: 'noncomune', icon: 'relic', lore: 'Eligo in Summum Pontificem... Il nome è sempre lo stesso, ricopiato da due secoli. Per il Cardinale, davanti all’altar maggiore.', quest: true, l3: true },
  // His tiara's: the jewels the Venetian ladies sewed on the papier-mâché in 1800.
  { id: 'smeraldo-dama', name: 'Smeraldo delle dame', rarity: 'raro', icon: 'ring', lore: 'Era a un anello, poi su una tiara di cartapesta, poi su uno scrittoio della Biblioteca. Per il Cardinale.', quest: true, l3: true },
  { id: 'perla-dama', name: 'Perla delle dame', rarity: 'raro', icon: 'ring', lore: 'Una perla di Murano... no, vera. È rotolata fino al palco del Teatro Verde. Per il Cardinale.', quest: true, l3: true },
  { id: 'spilla-dama', name: 'Spilla di rubini delle dame', rarity: 'raro', icon: 'amulet', lore: 'Il Bibliotecario la portava sopra la chiave, come un ordine cavalleresco. Per il Cardinale.', quest: true, l3: true },
  // Il libro di sabbia's, the secret one: the page off an amanuense, and the book found in the Borges labyrinth.
  { id: 'pagina-sabbia', name: 'Una pagina senza numero', rarity: 'epico', icon: 'relic', lore: 'Né recto né verso: una riga sola, a inchiostro di seppia. «Al centro del giardino dei sentieri che si biforcano».', quest: true, l3: true },
  { id: 'libro-sabbia', name: 'Libro senza titolo', rarity: 'epico', icon: 'relic', lore: 'Sul dorso, a matita: «VI, a sinistra di chi entra». Le pagine non si contano: fra due ce n’è sempre un’altra.', quest: true, l3: true },
  // Il drago di Carpaccio's: San Giorgio's lance, broken in three when it came down off the canvas with the dragon.
  { id: 'lancia-punta', name: 'Punta della lancia di San Giorgio', rarity: 'epico', icon: 'nail', lore: 'Ferro dorato a foglia d’ulivo, ancora sporco di verde. Il Nostromo ci accendeva la pipa. Per la statua di San Giorgio.', quest: true, l3: true },
  { id: 'lancia-asta', name: 'Asta della lancia di San Giorgio', rarity: 'epico', icon: 'relic', lore: 'Frassino dipinto a spire bianche e rosse, come nella tela del Carpaccio. Il Bibliotecario la usava per le scansie alte. Per la statua di San Giorgio.', quest: true, l3: true },
  { id: 'lancia-calcio', name: 'Calcio della lancia di San Giorgio', rarity: 'epico', icon: 'medal', lore: 'Un pomo d’ottone con la croce rossa. Nell’inventario del Commissario è il numero 1797. Per la statua di San Giorgio.', quest: true, l3: true },
  ...GEAR,
];
export const ITEM = new Map(ITEMS.map((i) => [i.id, i]));

/**
 * Who drops what: `gold` [min, max] per pile, `piles` of it, `items` flavour rolls at `chance` each, rarities
 * weighted; `gear` the same for equipment, its first roll at `chance[0]`, the next at `chance[1]`.
 */
export type Tier = 'worker' | 'friar' | 'priest' | 'elite' | 'boss';
type Weights = Partial<Record<Rarity, number>>;
interface Table { gold: [number, number]; piles: number; items: number; chance: number; weights: Weights; gear: { rolls: number; chance: [number, number]; weights: Weights } }
export const TABLES: Record<Tier, Table> = {
  worker: { gold: [1, 3], piles: 1, items: 1, chance: 0.06, weights: { comune: 8, noncomune: 2 }, gear: { rolls: 1, chance: [0.04, 0], weights: { comune: 6, noncomune: 3 } } },
  friar: { gold: [2, 6], piles: 1, items: 1, chance: 0.14, weights: { comune: 7, noncomune: 3, raro: 0.6 }, gear: { rolls: 1, chance: [0.12, 0], weights: { comune: 5, noncomune: 4, raro: 0.6 } } },
  priest: { gold: [4, 10], piles: 1, items: 1, chance: 0.22, weights: { comune: 5, noncomune: 4, raro: 1.2, epico: 0.15 }, gear: { rolls: 1, chance: [0.16, 0], weights: { comune: 2, noncomune: 5, raro: 2, epico: 0.15 } } },
  elite: { gold: [20, 40], piles: 2, items: 2, chance: 0.7, weights: { noncomune: 4, raro: 4, epico: 1 }, gear: { rolls: 2, chance: [1, 0.5], weights: { noncomune: 2, raro: 5, epico: 1.5 } } },
  boss: { gold: [45, 70], piles: 8, items: 3, chance: 1, weights: { raro: 3, epico: 2 }, gear: { rolls: 2, chance: [1, 1], weights: { raro: 1, epico: 3 } } },
};
export const BOSS_PRIZE = 'chiodo'; // the Reverendissimo's fall always yields the nail
export const BOSS2_PRIZE = 'filo-oro'; // the Governatrice's, the golden thread
export const BOSS3_PRIZE = 'anello-sensa'; // the Abate's, the ring of the Sensa (gear: loot/gear.ts)
export const RELIC = 'corona-zuane'; // Fra' Zuane's lost rosary
export const RELIC_PRIZE = 'medaglia-portinaio'; // what he gives for it (loot/gear.ts)
/** Level 2's dead are richer: gold × this. */
const GOLD2 = 1.6, GOLD3 = 2.2;

export interface Drop { gold: number[]; items: string[] }

/** What one death drops: the gold piles and the item ids. `rnd` in [0, 1). `level` 2, 3: that level's gear and junk, more gold. */
export function roll(tier: Tier, rnd: () => number = Math.random, level: 1 | 2 | 3 = 1): Drop {
  const t = TABLES[tier], [lo, hi] = t.gold, k = level === 3 ? GOLD3 : level === 2 ? GOLD2 : 1, mine = (x: Item) => levelOfItem(x) === level;
  const gold = Array.from({ length: t.piles }, () => Math.round((lo + Math.floor(rnd() * (hi - lo + 1))) * k));
  const prize = level === 3 ? BOSS3_PRIZE : level === 2 ? BOSS2_PRIZE : BOSS_PRIZE;
  const items: string[] = tier === 'boss' ? [prize] : [];
  for (let i = 0; i < t.items; i++) {
    if (rnd() >= t.chance) continue;
    const r = pick(t.weights, rnd), pool = ITEMS.filter((x) => x.rarity === r && !x.slot && x.id !== prize && x.id !== BOSS_PRIZE && x.id !== BOSS2_PRIZE && !x.quest && !x.unique && (mine(x) || (level > 1 && levelOfItem(x) === 1 && r === 'comune')));
    if (pool.length) items.push(pool[Math.floor(rnd() * pool.length)].id);
  }
  const g = t.gear;
  for (let i = 0; i < g.rolls; i++) {
    if (rnd() >= g.chance[Math.min(i, 1)]) continue;
    const r = pick(g.weights, rnd), pool = GEAR.filter((x) => x.rarity === r && mine(x) && x.id !== BOSS3_PRIZE && !x.unique);
    if (pool.length) items.push(pool[Math.floor(rnd() * pool.length)].id);
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
  static readonly STACK = 20; // a slot holds this many of one flavour item; gear one
  static cap = (id: string) => (ITEM.get(id)?.slot ? 1 : Bag.STACK);
  gold = 0;
  readonly items: Stack[] = [];

  /** Put `n` of `id` in, topping up stacks first; false (and nothing added) when it does not all fit. */
  add(id: string, n = 1): boolean {
    if (!ITEM.has(id) || n < 1) return false;
    const cap = Bag.cap(id);
    const room = this.items.reduce((s, x) => s + (x.id === id ? cap - x.n : 0), 0) + (Bag.SLOTS - this.items.length) * cap;
    if (room < n) return false;
    for (const x of this.items) if (x.id === id && x.n < cap) { const k = Math.min(n, cap - x.n); x.n += k; n -= k; }
    while (n > 0) { const k = Math.min(n, cap); this.items.push({ id, n: k }); n -= k; }
    return true;
  }

  /** Take `n` of `id` out; false when there are fewer. */
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
    for (const [id, n] of s.items) if (ITEM.has(id) && n >= 1) this.add(id, Math.min(Math.floor(n), Bag.cap(id)));
  }
}
