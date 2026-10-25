// Equipment, classic WoW style (see data/redentore-equip-vendor-w6/DESIGN.md): nine slots, items
// whose stats come from a budget (quality × slot weight) spent on the two or three stats each
// leans on, armor on the six armor slots, a white starter set worn from the start. The stats act
// on the kit: armor cuts damage taken (with diminishing returns), Vigore/Intelletto raise health
// and mana, Spirito the mana regen, Potenza every ability's damage, Critico the chance of a 150%
// blow, Celerità cast times and the GCD (main.ts and scripts/balance.ts lay them on). Prices:
// buy by quality × slot, sell a quarter of it, flavour junk by rarity. Fra' Bortolo sells level 1's
// purple pieces, Mastro Iseppo level 2's (SHOP). No three.js and no DOM, so `npm run check` drives it in Node.
import type { Bag, Icon, Item, Rarity } from './bag.ts';

export type Slot = 'testa' | 'spalle' | 'torso' | 'mani' | 'gambe' | 'piedi' | 'arma' | 'amuleto' | 'anello';
/** Paper-doll order; `w` scales the stat budget and the price, `armor` the armor. */
export const SLOTS: readonly { id: Slot; name: string; w: number; armor: number; icon: Icon }[] = [
  { id: 'testa', name: 'Testa', w: 1, armor: 0.8, icon: 'helm' },
  { id: 'amuleto', name: 'Collo', w: 0.55, armor: 0, icon: 'amulet' },
  { id: 'spalle', name: 'Spalle', w: 0.75, armor: 0.7, icon: 'shoulders' },
  { id: 'torso', name: 'Torso', w: 1, armor: 1.2, icon: 'chest' },
  { id: 'mani', name: 'Mani', w: 0.75, armor: 0.6, icon: 'gloves' },
  { id: 'gambe', name: 'Gambe', w: 1, armor: 1, icon: 'legs' },
  { id: 'piedi', name: 'Piedi', w: 0.75, armor: 0.7, icon: 'boots' },
  { id: 'anello', name: 'Dito', w: 0.55, armor: 0, icon: 'ring' },
  { id: 'arma', name: 'Arma', w: 1.3, armor: 0, icon: 'club' },
];
export const SLOT = new Map(SLOTS.map((s) => [s.id, s]));

export type Stat = 'vigore' | 'intelletto' | 'spirito' | 'potenza' | 'critico' | 'celerita';
export type Stats = Partial<Record<Stat | 'armatura', number>>;
/** `cost`: budget points per point of it; `green`: a WoW "Equipaggiato:" line rather than a white stat. */
export const STAT: Record<Stat, { name: string; cost: number; green?: string }> = {
  vigore: { name: 'Vigore', cost: 1.5 },
  intelletto: { name: 'Intelletto', cost: 1.5 },
  spirito: { name: 'Spirito', cost: 1.2 },
  potenza: { name: 'Potenza', cost: 2.5, green: 'aumenta del #% i danni di tutte le tue abilità.' },
  critico: { name: 'Critico', cost: 3, green: 'aumenta del #% la probabilità di infliggere un colpo critico.' },
  celerita: { name: 'Celerità', cost: 2.5, green: 'riduce del #% i tempi di lancio e il tempo di recupero globale.' },
};
export const HP_PER = 10, MANA_PER = 10, REGEN_PER = 0.1; // per point of Vigore, Intelletto, Spirito
export const ARMOR_K = 700; // armor / (armor + K) of every blow is turned aside
export const CRIT_BASE = 5, CRIT_MUL = 1.5; // % chance with no gear, × a critical blow deals

const BUDGET: Partial<Record<Rarity, number>> = { comune: 4, noncomune: 9, raro: 15, epico: 24, leggendario: 30 };
const ARMOR: Partial<Record<Rarity, number>> = { comune: 8, noncomune: 14, raro: 20, epico: 28 };
const ILVL: Partial<Record<Rarity, number>> = { comune: 5, noncomune: 10, raro: 15, epico: 20, leggendario: 22 };
const BUY: Partial<Record<Rarity, number>> = { comune: 8, noncomune: 40, raro: 120, epico: 480, leggendario: 1200 };
/** Level 2's pieces (the Giudecca and the Zitelle): a bigger budget and more armor at each quality, a higher item level, dearer. */
const L2 = { budget: 1.4, armor: 1.3, ilvl: 12, buy: 1.6 };
const JUNK: Record<Rarity, number> = { comune: 3, noncomune: 8, raro: 20, epico: 50, leggendario: 150 }; // flavour items' sell price
const SHARES = [[1], [0.6, 0.4], [0.5, 0.3, 0.2]];

// id, name, slot, quality, the stats it leans on (best first), flavour line
const DEFS: [string, string, Slot, Rarity, string, string?][] = [
  ['canapa-testa', 'Cappuccio di canapa', 'testa', 'comune', 'vigore intelletto'],
  ['canapa-spalle', 'Mantelletta di canapa', 'spalle', 'comune', 'vigore intelletto'],
  ['canapa-torso', 'Saio di canapa', 'torso', 'comune', 'vigore intelletto'],
  ['canapa-mani', 'Bende di canapa', 'mani', 'comune', 'vigore intelletto'],
  ['canapa-gambe', 'Brache di canapa', 'gambe', 'comune', 'vigore intelletto'],
  ['canapa-piedi', 'Sandali di canapa', 'piedi', 'comune', 'vigore intelletto'],
  ['clava-osso', 'Clava d’osso', 'arma', 'comune', 'potenza'],
  ['remo-gelato', 'Remo gelato', 'arma', 'comune', 'potenza', 'Non si è più scongelato, e nemmeno chi lo voga.'], // Bortolo's (player/heroes.ts)
  ['stiletto-osso', 'Stiletto d’osso', 'arma', 'comune', 'potenza', 'Limato da un femore del lazzaretto: punge ancora di febbre.'], // Suor Fosca's (player/heroes.ts)
  ['canna-vetraio', 'Canna da vetraio', 'arma', 'comune', 'potenza', 'La goccia di vetro in cima non si è più raffreddata.'], // Fra' Tizian's (player/heroes.ts)
  ['martello-campana', 'Martello da campana', 'arma', 'comune', 'potenza', 'Batteva le ore dei morti. Ora a ogni colpo risponde il tuono.'], // Zanetto's (player/heroes.ts)

  ['becchino-testa', 'Cappuccio del becchino', 'testa', 'noncomune', 'vigore potenza'],
  ['penitente-testa', 'Zucchetto del penitente', 'testa', 'noncomune', 'intelletto spirito'],
  ['orto-spalle', 'Spallacci di cuoio dell’orto', 'spalle', 'noncomune', 'vigore critico'],
  ['cappellano-spalle', 'Mozzetta del cappellano', 'spalle', 'noncomune', 'intelletto celerita'],
  ['flagellante-torso', 'Tonaca del flagellante', 'torso', 'noncomune', 'vigore potenza'],
  ['chierico-torso', 'Cotta del chierico', 'torso', 'noncomune', 'intelletto spirito'],
  ['sterratore-mani', 'Guanti da sterratore', 'mani', 'noncomune', 'vigore critico'],
  ['copista-mani', 'Mezziguanti del copista', 'mani', 'noncomune', 'intelletto celerita'],
  ['zappatore-gambe', 'Brache dello zappatore', 'gambe', 'noncomune', 'vigore potenza'],
  ['sacrestano-gambe', 'Calze del sacrestano', 'gambe', 'noncomune', 'intelletto spirito'],
  ['portinaio-piedi', 'Zoccoli del portinaio', 'piedi', 'noncomune', 'vigore spirito'],
  ['confessore-piedi', 'Pianelle del confessore', 'piedi', 'noncomune', 'intelletto celerita'],
  ['campanaro-arma', 'Mazza del campanaro', 'arma', 'noncomune', 'potenza critico'],
  ['pellegrino-arma', 'Bordone del pellegrino', 'arma', 'noncomune', 'potenza intelletto'],
  ['scapolare', 'Scapolare di lana', 'amuleto', 'noncomune', 'vigore spirito'],
  ['medaglione', 'Medaglione di Sant’Antonio', 'amuleto', 'noncomune', 'intelletto critico'],
  ['anello-ferro', 'Anello di ferro del voto', 'anello', 'noncomune', 'vigore potenza'],
  ['fede-ottone', 'Fede d’ottone', 'anello', 'noncomune', 'intelletto spirito'],

  ['battuti-testa', 'Cappuccio dei Battuti', 'testa', 'raro', 'vigore potenza critico'],
  ['pievano-testa', 'Berretta del pievano', 'testa', 'raro', 'intelletto celerita spirito'],
  ['scuola-spalle', 'Spallacci della Scuola Grande', 'spalle', 'raro', 'vigore potenza'],
  ['rocco-spalle', 'Stola di San Rocco', 'spalle', 'raro', 'intelletto critico'],
  ['gonfaloniere-torso', 'Usbergo del gonfaloniere', 'torso', 'raro', 'vigore critico potenza'],
  ['piviale-torso', 'Piviale del Redentore', 'torso', 'raro', 'intelletto celerita spirito'],
  ['fossore-mani', 'Manopole del fossore', 'mani', 'raro', 'potenza critico'],
  ['cerusico-mani', 'Guanti del cerusico', 'mani', 'raro', 'intelletto celerita'],
  ['arsenale-gambe', 'Gambali dell’Arsenale', 'gambe', 'raro', 'vigore potenza'],
  ['cappuccino-gambe', 'Sottana del cappuccino', 'gambe', 'raro', 'intelletto spirito celerita'],
  ['barcaiolo-piedi', 'Stivali del barcaiolo', 'piedi', 'raro', 'vigore critico'],
  ['calzari-piedi', 'Calzari del pellegrino', 'piedi', 'raro', 'intelletto celerita'],
  ['ferrata-arma', 'Mazza ferrata dell’Arsenale', 'arma', 'raro', 'potenza critico vigore'],
  ['turibolo-arma', 'Turibolo di Murano', 'arma', 'raro', 'potenza celerita intelletto'],
  ['corallo', 'Rosario di corallo', 'amuleto', 'raro', 'vigore critico'],
  ['ampolla-marco', 'Ampolla di San Marco', 'amuleto', 'raro', 'intelletto celerita'],
  ['sigillo-doge', 'Sigillo del Doge', 'anello', 'raro', 'potenza critico'],
  ['anello-vescovo', 'Anello del vescovo', 'anello', 'raro', 'intelletto spirito'],

  ['mitria', 'Mitria del Reverendissimo', 'testa', 'epico', 'intelletto potenza critico', 'Pesa come quattrocento anni di conti in sospeso.'],
  ['mantella-peste', 'Mantella della peste nera', 'spalle', 'epico', 'vigore potenza celerita', 'Cucita coi teli dei carri dei morti, 1576.'],
  ['saio-voto', 'Saio del secondo voto', 'torso', 'epico', 'vigore potenza critico', 'Ogni nodo del cordone è un’anima promessa.'],
  ['guanti-palladio', 'Guanti del capomastro di Palladio', 'mani', 'epico', 'potenza celerita critico', 'Hanno posato la prima pietra. Vorrebbero togliere l’ultima.'],
  ['cosciali-lazzaretto', 'Cosciali del Lazzaretto Vecchio', 'gambe', 'epico', 'vigore intelletto potenza', 'Chi li indossava è tornato. Da solo.'],
  ['zoccoli-redentore', 'Zoccoli della notte del Redentore', 'piedi', 'epico', 'vigore celerita', 'Hanno attraversato il ponte di barche prima dell’alba.'],
  ['pastorale', 'Pastorale del Reverendissimo', 'arma', 'epico', 'potenza critico celerita', 'Il riccio d’argento è graffiato: contava anche le fosse.'],
  ['ruta-oro', 'Ruta d’oro di Fra’ Bortolo', 'amuleto', 'epico', 'spirito intelletto potenza', 'Un rametto d’erba della grazia, chiuso nell’oro.'],
  ['anello-1576', 'Anello del voto del 1576', 'anello', 'epico', 'critico potenza vigore', 'Dentro la fascia: «Liberaci, e ti alzeremo un tempio».'],
  // Fra' Zuane's thanks for his corona (quest/view.ts): no table rolls a legendary piece.
  ['medaglia-portinaio', 'Medaglia del portinaio', 'amuleto', 'leggendario', 'vigore spirito', 'San Francesco, consumato da quattro secoli di Ave Maria. Ti guarda le spalle, dove Fra’ Zuane non arriva.'],
];

// Level 2: off the dead of the fondamenta and the Pia Casa (loot/bag.ts roll at level 2).
const DEFS2: typeof DEFS = [
  ['paglietta', 'Paglietta del gondoliere', 'testa', 'noncomune', 'vigore critico'],
  ['codega-spalle', 'Mantelletta della codega', 'spalle', 'noncomune', 'intelletto spirito'],
  ['righe-torso', 'Maglia a righe dell’annegato', 'torso', 'noncomune', 'vigore potenza'],
  ['merlettaia-mani', 'Mezzemani della merlettaia', 'mani', 'noncomune', 'intelletto celerita'],
  ['squerariol-gambe', 'Braghe dello squerariol', 'gambe', 'noncomune', 'vigore spirito'],
  ['traghetto-piedi', 'Scarpe del traghetto', 'piedi', 'noncomune', 'vigore celerita'],
  ['remo-spezzato', 'Remo spezzato', 'arma', 'noncomune', 'potenza critico'],
  ['tombolo', 'Tombolo d’osso', 'amuleto', 'noncomune', 'intelletto spirito'],
  ['anello-dote', 'Anello della dote', 'anello', 'noncomune', 'vigore potenza'],

  ['zendale', 'Zendale della Pia Casa', 'testa', 'raro', 'intelletto celerita spirito'],
  ['gastaldo-spalle', 'Spallacci del gastaldo', 'spalle', 'raro', 'vigore potenza critico'],
  ['velada', 'Velada del traghetto', 'torso', 'raro', 'vigore critico'],
  ['puntoaria-mani', 'Guanti del punto in aria', 'mani', 'raro', 'potenza celerita'],
  ['zitelle-gambe', 'Calze delle Zitelle', 'gambe', 'raro', 'intelletto spirito'],
  ['squero-piedi', 'Stivali dello squero', 'piedi', 'raro', 'vigore potenza'],
  ['fuso-ferrato', 'Fuso ferrato', 'arma', 'raro', 'potenza celerita intelletto'],
  ['medaglia-presentazione', 'Medaglia della Presentazione', 'amuleto', 'raro', 'vigore critico'],
  ['ditale', 'Ditale d’argento', 'anello', 'raro', 'potenza critico'],

  ['velo-governatrice', 'Velo della Governatrice', 'testa', 'epico', 'intelletto potenza critico', 'Ogni punto è un nome. Alcuni li riconosci.'],
  ['collare-puntoaria', 'Collare di punto in aria', 'spalle', 'epico', 'vigore celerita potenza', 'Lo cucirono cento mani che non avevano dote.'],
  ['busto-broccato', 'Busto di broccato della Pia Casa', 'torso', 'epico', 'vigore potenza critico', 'Oro di Rialto, debiti di San Marco.'],
  ['guanti-maestra', 'Guanti della Maestra del merletto', 'mani', 'epico', 'potenza celerita critico', 'Le dita non hanno mai smesso di contare i punti.'],
  ['cosciali-gastaldo', 'Cosciali del Gastaldo', 'gambe', 'epico', 'vigore intelletto potenza', 'Remava per i vivi, poi per i morti, allo stesso prezzo.'],
  ['zoccoli-voga', 'Zoccoli dell’ultima voga', 'piedi', 'epico', 'vigore celerita', 'Hanno toccato il fondo del canale della Giudecca. Due volte.'],
  ['scettro-governatrice', 'Scettro della Governatrice', 'arma', 'epico', 'potenza critico celerita', 'Il fuso d’oro gira ancora, se lo guardi troppo a lungo.'],
  ['rosario-spolette', 'Rosario di spolette', 'amuleto', 'epico', 'spirito intelletto potenza', 'Spolette d’osso al posto dei grani: dodici per ogni zitella.'],
  ['fede-senza-dote', 'Fede senza dote', 'anello', 'epico', 'critico potenza vigore', 'Nessuno l’ha mai portata all’altare.'],
];

/** The stats a budget of `points` buys, split over `focus` (best first). */
function spend(points: number, focus: Stat[]): Stats {
  const out: Stats = {};
  focus.forEach((k, i) => { out[k] = Math.max(1, Math.round((points * SHARES[focus.length - 1][i]) / STAT[k].cost)); });
  return out;
}

const make = (lvl: 1 | 2) => ([id, name, slot, rarity, focus, lore]: typeof DEFS[number]): Item => {
  const k = lvl === 2 ? L2 : { budget: 1, armor: 1, ilvl: 0 };
  const s = SLOT.get(slot)!, stats = spend(BUDGET[rarity]! * k.budget * s.w, focus.split(' ') as Stat[]);
  if (s.armor) stats.armatura = Math.round(ARMOR[rarity]! * k.armor * s.armor);
  return { id, name, rarity, icon: s.icon, lore: lore ?? '', slot, stats, ilvl: ILVL[rarity]! + k.ilvl, ...(lvl === 2 ? { l2: true as const } : {}) };
};
export const GEAR: readonly Item[] = [...DEFS.map(make(1)), ...DEFS2.map(make(2))];
const BY_ID = new Map(GEAR.map((g) => [g.id, g]));
/** Every purple piece on sale: level 1's from Fra' Bortolo, level 2's (`shop` with level2) from Mastro Iseppo. */
export const SHOP = GEAR.filter((g) => g.rarity === 'epico');
export const shop = (level2: boolean) => SHOP.filter((g) => level2 || !g.l2);
/** Mastro Iseppo's goods in the squero: level 2's purple pieces (Fra' Bortolo keeps level 1's). `shop` is both together. */
export const SHOP2 = SHOP.filter((g) => g.l2);
/** Worn on a new game (and by saves from before the equipment): the hemp set and the bone club (not the other heroes' own weapons). */
export const STARTER: Partial<Record<Slot, string>> = Object.fromEntries(GEAR.filter((g) => g.rarity === 'comune' && !['remo-gelato', 'stiletto-osso', 'canna-vetraio', 'martello-campana'].includes(g.id)).map((g) => [g.slot, g.id]));
/** A new game's set: the hemp and the hero's own weapon (player/heroes.ts). */
export const starter = (weapon: string): GearState => ({ ...STARTER, arma: weapon });

/** Gold Fra' Bortolo asks for it. */
export const buyPrice = (it: Item) => (it.slot ? Math.round(BUY[it.rarity]! * SLOT.get(it.slot)!.w * (it.l2 ? L2.buy : 1)) : JUNK[it.rarity] * 4);
/** Gold he gives for one: a quarter of his price. */
export const sellPrice = (it: Item) => Math.floor(buyPrice(it) / 4);
/** Share of a blow armor turns aside. */
export const armorCut = (armor: number) => armor / (armor + ARMOR_K);
/** Budget points an item's stats are worth (the balance bot's "better"). */
export const worth = (it: Item) => Object.entries(it.stats ?? {}).reduce((s, [k, v]) => s + v * (k === 'armatura' ? 0.15 : STAT[k as Stat].cost), 0);

/** Stats summed over worn ids. */
export function totals(ids: Iterable<string | undefined>): Required<Stats> {
  const t: Required<Stats> = { armatura: 0, vigore: 0, intelletto: 0, spirito: 0, potenza: 0, critico: 0, celerita: 0 };
  for (const id of ids) for (const [k, v] of Object.entries(BY_ID.get(id ?? '')?.stats ?? {})) t[k as Stat] += v;
  return t;
}

/** Damage after the crit roll: a blow (n ≥ 1) crits at `chance` %, a damage-over-time tick gets the average. */
export function crit(n: number, chance: number, rnd: () => number = Math.random): number {
  const c = Math.min(chance, 100) / 100;
  return n < 1 ? n * (1 + c * (CRIT_MUL - 1)) : rnd() < c ? n * CRIT_MUL : n;
}

/** What gear makes of the hero, for main.ts, the sheet and the balance bot. */
export function effects(t: Required<Stats>): { hp: number; mana: number; regen: number; dmg: number; crit: number; haste: number; cut: number } {
  return { hp: t.vigore * HP_PER, mana: t.intelletto * MANA_PER, regen: t.spirito * REGEN_PER, dmg: 1 + t.potenza / 100, crit: CRIT_BASE + t.critico, haste: 1 + t.celerita / 100, cut: armorCut(t.armatura) };
}

export type GearState = Partial<Record<Slot, string>>;

/** What the hero wears. Every change calls `onChange` (main.ts re-lays the stats). */
export class Equipment {
  worn: GearState = { ...STARTER };
  onChange = () => {};

  get totals(): Required<Stats> {
    return totals(Object.values(this.worn));
  }

  /** Wear the item in bag slot `i`, the piece it replaces going into that bag slot. Returns why not, or ''. */
  wear(bag: Bag, i: number): string {
    const s = bag.items[i], it = s && BY_ID.get(s.id);
    if (!it) return 'Non si può indossare.';
    const old = this.worn[it.slot!];
    this.worn[it.slot!] = it.id;
    if (old) bag.items[i] = { id: old, n: 1 };
    else bag.items.splice(i, 1);
    this.onChange();
    return '';
  }

  /** Take off what is worn on `slot`, into the bag. Returns why not, or ''. */
  takeOff(bag: Bag, slot: Slot): string {
    const id = this.worn[slot];
    if (!id) return '';
    if (!bag.add(id)) return 'La borsa è piena.';
    delete this.worn[slot];
    this.onChange();
    return '';
  }

  encode(): GearState {
    return { ...this.worn };
  }

  /** Lay a saved set over this one; ids from another build, or in the wrong slot, are dropped. */
  decode(s: GearState): void {
    this.worn = {};
    for (const [slot, id] of Object.entries(s)) if (BY_ID.get(id ?? '')?.slot === slot) this.worn[slot as Slot] = id;
    this.onChange();
  }
}

/** Sell the whole stack in bag slot `i` to Fra' Bortolo; what went and for how much, or undefined. */
export function sell(bag: Bag, i: number, item: (id: string) => Item | undefined): { id: string; n: number; gold: number } | undefined {
  const s = bag.items[i], it = s && item(s.id);
  if (!it || it.quest) return undefined;
  bag.items.splice(i, 1);
  const gold = sellPrice(it) * s.n;
  bag.gold += gold;
  return { id: s.id, n: s.n, gold };
}

/** Buy one `it` for `price`. Returns why not, or ''. */
export function buy(bag: Bag, it: Item, price = buyPrice(it)): string {
  if (bag.gold < price) return 'Non hai abbastanza oro.';
  if (!bag.add(it.id)) return 'La borsa è piena.';
  bag.gold -= price;
  return '';
}
