// Experience levels and the choose-a-card upgrades, Vampire Survivors style but on a finite budget:
// nobody respawns, so XP is the worth of the mobs lying dead (main.ts derives it every frame) and the
// curve is tuned to it. Full clear before the boss: 1145 XP, level 11; the quest route with the apiary
// ~870 (scripts/balance.ts), level 9: the boss is tuned for 8-9.
// Each level offers two cards. Even levels up to 10 offer two new abilities (the specials from level 6);
// the others a modifier of an owned ability (or a fusion) against a stat passive. The run starts with
// Caduta d'ossa and Nube di peste, the potion stays as an item. Everything an upgrade changes is a field
// of `Tune`, replayed from the picks (`tuneOf`), so a save only needs the pick list.
// No DOM and no three.js: `npm run check` drives it in Node (scripts/check-levels.ts).

export const MAX_LEVEL = 15; // out of reach today (L11 is everything), safe if mobs are added
/** XP from level `lv` to `lv + 1`. */
export const need = (lv: number) => 20 * lv;

/** Level reached with `xp`, XP gathered into it and XP the next one needs (0 at the cap). */
export function levelOf(xp: number): { lv: number; into: number; next: number } {
  let lv = 1;
  while (lv < MAX_LEVEL && xp >= need(lv)) xp -= need(lv++);
  return { lv, into: lv < MAX_LEVEL ? xp : 0, next: lv < MAX_LEVEL ? need(lv) : 0 };
}

/** Everything an upgrade can change; forsaken.ts, stats.ts and main.ts read it live. */
export interface Tune {
  owned: string[]; // ability ids on the bar
  dmg: number; hp: number; mana: number; armor: number; regen: number; speed: number; cdr: number; leech: number;
  fury: number; furyStart: number; // charge gain ×, and where the bar restarts after a special
  fallDmg: number; fallRange: number; fallArc: number; fallThird: number; fallMana: number;
  plagueDps: number; plagueR: number; plagueCd: number; plagueLife: number;
  wispDps: number; wispR: number; wispCast: number;
  veilTime: number; veilHeal: number;
  stepDmg: number; stepCd: number;
  strikeDmg: number; novaR: number; novaDmg: number; wardTime: number; wardHeal: number;
  potion: number; potionCd: number;
  fxWisp: boolean; fxStep: boolean; fxFall: boolean; // fusions: the wisp, the blink, the third swing sow plague clouds
}

export const START = ['fall', 'plague', 'potion'];
export const SPECIALS = ['strike', 'nova', 'ward'];
const BASE: Tune = {
  owned: START,
  dmg: 1, hp: 1, mana: 1, armor: 1, regen: 2, speed: 1, cdr: 1, leech: 0, fury: 1, furyStart: 0,
  fallDmg: 10, fallRange: 2.6, fallArc: Math.cos(1.1), fallThird: 1, fallMana: 0,
  plagueDps: 12, plagueR: 2.2, plagueCd: 5, plagueLife: 8,
  wispDps: 15, wispR: 1.6, wispCast: 1.5,
  veilTime: 5, veilHeal: 0,
  stepDmg: 25, stepCd: 12,
  strikeDmg: 50, novaR: 6, novaDmg: 20, wardTime: 5, wardHeal: 0,
  potion: 0.3, potionCd: 30,
  fxWisp: false, fxStep: false, fxFall: false,
};

export type CardKind = 'ability' | 'mod' | 'passive' | 'fusion' | 'filler';
export interface Card {
  id: string; kind: CardKind; name: string; icon: string; text: string; max: number;
  /** The owned ability a mod belongs to; for an ability card, the one it unlocks (= id). */
  of?: string;
  tier?: 'A' | 'B'; // ability cards: B are the specials, offered from level 6
  /** Extra condition on the picks so far (fusions, charge cards). */
  needs?: (count: (id: string) => number, owns: (a: string) => boolean) => boolean;
  apply?: (t: Tune) => void;
}

const special = (_c: (id: string) => number, owns: (a: string) => boolean) => SPECIALS.some(owns);
const ability = (id: string, name: string, tier: 'A' | 'B', text: string): Card => ({ id, kind: 'ability', name, icon: id, text, max: 1, of: id, tier });
const mod = (of: string, id: string, name: string, text: string, max: number, apply: (t: Tune) => void): Card =>
  ({ id, kind: 'mod', name, icon: of, text, max, of, apply });
const passive = (id: string, name: string, text: string, max: number, apply: (t: Tune) => void, needs?: Card['needs']): Card =>
  ({ id, kind: 'passive', name, icon: id, text, max, apply, needs });

export const CARDS: Card[] = [
  ability('step', "Passo d'ombra", 'A', 'Scatto di 8 m nell’ombra: 25 danni a chi attraversi. 40 mana, recupero 12 s.'),
  ability('veil', 'Velo spettrale', 'A', 'Per 5 s subisci il 50% di danni in meno. 50 mana, recupero 30 s.'),
  ability('wisp', 'Fuoco fatuo', 'A', 'Per 60 s un fuoco fatuo si avventa su chi combatti e brucia chi sfiora: 15 danni al secondo.'),
  ability('strike', 'Sentenza del sepolcro', 'B', 'Speciale: con la barra della furia piena, una lancia d’ossa da 50 danni.'),
  ability('nova', 'Lamento della cripta', 'B', 'Speciale: con la barra della furia piena, 20 danni a tutti entro 6 m.'),
  ability('ward', 'Patto della tomba', 'B', 'Speciale: con la barra della furia piena, 5 s di immunità a ogni danno.'),

  passive('dmg', 'Ossa più dure', '+8% a tutti i danni che infliggi.', 3, (t) => { t.dmg += 0.08; }),
  passive('hp', 'Carne di tomba', '+15% di salute massima (+192), e la recuperi subito.', 3, (t) => { t.hp += 0.15; }),
  passive('armor', 'Pelle di lapide', '−8% ai danni che subisci.', 2, (t) => { t.armor -= 0.08; }),
  passive('mana', "Pozzo d'anime", '+20% di mana massimo (+80).', 2, (t) => { t.mana += 0.2; }),
  passive('regen', 'Linfa nera', 'Rigenerazione del mana +1 al secondo (base 2).', 2, (t) => { t.regen += 1; }),
  passive('speed', 'Passo del morto', '+8% alla velocità di corsa.', 2, (t) => { t.speed += 0.08; }),
  passive('cdr', 'Gelo della cripta', '−10% ai tempi di recupero (non a Caduta d’ossa).', 2, (t) => { t.cdr -= 0.1; }),
  passive('leech', "Sete d'anime", 'Ogni nemico che uccidi ti cura del 3% della salute massima.', 2, (t) => { t.leech += 0.03; }),
  passive('fury', 'Furia del sepolcro', '+30% alla carica della barra della furia.', 2, (t) => { t.fury += 0.3; }, special),

  mod('fall', 'fall_dmg', 'Schegge affilate', "Caduta d'ossa: +4 danni per colpo (base 10).", 2, (t) => { t.fallDmg += 4; }),
  mod('fall', 'fall_reach', 'Braccio della fossa', "Caduta d'ossa: portata da 2,6 a 3,4 m, arco da 125° a 160°.", 1, (t) => { t.fallRange = 3.4; t.fallArc = Math.cos(1.4); }),
  mod('fall', 'fall_third', 'Colpo del becchino', "Caduta d'ossa: il terzo colpo della combo infligge ×2,5 danni.", 1, (t) => { t.fallThird = 2.5; }),
  mod('fall', 'fall_mana', 'Ossa avide', "Caduta d'ossa: ogni fendente che colpisce ti ridà 4 mana.", 1, (t) => { t.fallMana = 4; }),
  mod('plague', 'plague_dps', 'Peste virulenta', 'Nube di peste: +4 danni al secondo (base 12).', 2, (t) => { t.plagueDps += 4; }),
  mod('plague', 'plague_size', 'Miasma esteso', 'Nube di peste: raggio +25% (base 2,2 m).', 2, (t) => { t.plagueR += 0.55; }),
  mod('plague', 'plague_cd', 'Contagio', 'Nube di peste: recupero da 5 a 3,5 s.', 1, (t) => { t.plagueCd = 3.5; }),
  mod('plague', 'plague_long', 'Ristagno', 'Nube di peste: dura 12 s invece di 8.', 1, (t) => { t.plagueLife = 12; }),
  mod('wisp', 'wisp_dps', 'Fiamma vorace', 'Fuoco fatuo: da 15 a 23 danni al secondo.', 1, (t) => { t.wispDps = 23; }),
  mod('wisp', 'wisp_still', 'Fuoco inquieto', 'Fuoco fatuo: brucia entro 2,4 m invece di 1,6.', 1, (t) => { t.wispR = 2.4; }),
  mod('wisp', 'wisp_fast', 'Evocazione rapida', 'Fuoco fatuo: si evoca all’istante (era 1,5 s).', 1, (t) => { t.wispCast = 0; }),
  mod('veil', 'veil_long', 'Velo più lungo', 'Velo spettrale: dura 8 s invece di 5.', 1, (t) => { t.veilTime = 8; }),
  mod('veil', 'veil_heal', 'Velo rigenerante', 'Velo spettrale: mentre dura ti cura del 3% della salute al secondo.', 1, (t) => { t.veilHeal = 0.03; }),
  mod('step', 'step_dmg', 'Passo lacerante', "Passo d'ombra: da 25 a 60 danni.", 1, (t) => { t.stepDmg = 60; }),
  mod('step', 'step_cd', 'Doppio passo', "Passo d'ombra: recupero da 12 a 7 s.", 1, (t) => { t.stepCd = 7; }),
  mod('strike', 'strike_dmg', 'Condanna', 'Sentenza del sepolcro: da 50 a 90 danni.', 1, (t) => { t.strikeDmg = 90; }),
  mod('nova', 'nova_big', 'Lamento profondo', 'Lamento della cripta: raggio da 6 a 8 m, danni da 20 a 35.', 1, (t) => { t.novaR = 8; t.novaDmg = 35; }),
  mod('ward', 'ward_long', 'Patto eterno', 'Patto della tomba: 7 s invece di 5, e alla fine ti cura del 15%.', 1, (t) => { t.wardTime = 7; t.wardHeal = 0.15; }),
  mod('potion', 'potion_big', 'Fiala capiente', 'Fiala di linfa tombale: ripristina il 45% invece del 30%.', 1, (t) => { t.potion = 0.45; }),
  mod('potion', 'potion_cd', 'Fiala rapida', 'Fiala di linfa tombale: recupero da 30 a 20 s.', 1, (t) => { t.potionCd = 20; }),
  { id: 'fury_start', kind: 'mod', name: 'Rancore', icon: 'fury', max: 1, text: 'Dopo una speciale la barra della furia riparte da 30 invece che da 0.',
    needs: special, apply: (t) => { t.furyStart = 30; } },

  { id: 'fx_wispplague', kind: 'fusion', name: 'Fuoco pestilente', icon: 'wisp', max: 1, text: 'Fusione. Il fuoco fatuo lascia cadere una nube di peste sotto di sé ogni 6 s.',
    needs: (_c, owns) => owns('wisp') && owns('plague'), apply: (t) => { t.fxWisp = true; } },
  { id: 'fx_stepplague', kind: 'fusion', name: 'Ombra appestata', icon: 'step', max: 1, text: "Fusione. Passo d'ombra lascia una nube di peste dove sparisci.",
    needs: (_c, owns) => owns('step') && owns('plague'), apply: (t) => { t.fxStep = true; } },
  { id: 'fx_fallplague', kind: 'fusion', name: 'Ossa appestate', icon: 'fall', max: 1, text: "Fusione. Il terzo colpo di Caduta d'ossa semina una nube di peste (al massimo ogni 3 s).",
    needs: (c, owns) => owns('fall') && c('plague_dps') >= 1, apply: (t) => { t.fxFall = true; } },

  { id: 'linfa', kind: 'filler', name: 'Linfa tombale', icon: 'potion', max: Infinity, text: 'Hai già tutto: recuperi il 30% della salute e del mana.' },
];
export const CARD = new Map(CARDS.map((c) => [c.id, c]));

const counter = (picks: readonly string[]) => {
  const n = new Map<string, number>();
  for (const p of picks) n.set(p, (n.get(p) ?? 0) + 1);
  return (id: string) => n.get(id) ?? 0;
};

/** The stats and ability numbers the picks add up to (unknown ids and stacks past `max` are ignored). */
export function tuneOf(picks: readonly string[]): Tune {
  const t: Tune = { ...BASE, owned: [...START] }, seen = new Map<string, number>();
  for (const id of picks) {
    const c = CARD.get(id), k = (seen.get(id) ?? 0) + 1;
    if (!c || k > c.max) continue;
    seen.set(id, k);
    if (c.kind === 'ability') t.owned.push(id);
    c.apply?.(t);
  }
  if (!SPECIALS.some((s) => t.owned.includes(s))) t.fury = 0; // no special to spend it on: the bar stays empty and hidden
  return t;
}

/** Cards that may still be offered after `picks`: not maxed, their ability owned, their needs met. */
export function eligible(picks: readonly string[]): Card[] {
  const count = counter(picks), owned = tuneOf(picks).owned, owns = (a: string) => owned.includes(a);
  return CARDS.filter((c) => c.kind !== 'filler' && count(c.id) < c.max && (!c.of || c.kind === 'ability' || owns(c.of)) && (!c.needs || c.needs(count, owns)));
}

/**
 * The two cards for the next level-up (the one `picks.length + 2` reaches); one only if nothing else is
 * left. The card passed over goes back into the pool.
 */
export function offer(picks: readonly string[], rnd: () => number = Math.random): Card[] {
  const lv = picks.length + 2, ok = eligible(picks), out: Card[] = [];
  const pick = (from: Card[]) => {
    const left = from.filter((c) => !out.includes(c));
    if (left.length) out.push(left[Math.floor(rnd() * left.length) % left.length]);
  };
  const abilities = ok.filter((c) => c.kind === 'ability' && (c.tier === 'A' || lv >= 6));
  const mods = ok.filter((c) => c.kind === 'mod' || c.kind === 'fusion'), passives = ok.filter((c) => c.kind === 'passive');
  if (lv % 2 === 0 && lv <= 10) {
    if (lv === 6 || lv === 8) pick(abilities.filter((c) => c.tier === 'B')); // the specials surface in time
    pick(abilities);
    pick(abilities);
  } else {
    const fusions = mods.filter((c) => c.kind === 'fusion');
    pick(fusions.length && rnd() < 0.5 ? fusions : mods);
    pick(passives);
  }
  pick(mods); // short: fill from the upgrades, then the heal
  pick(passives);
  pick(mods);
  if (out.length < 2) out.push(CARD.get('linfa')!);
  return out.slice(0, 2);
}

/** Runtime level state: XP (main.ts sets it from the dead), the picks, and the hook that lays them on the kit. */
export class Levels {
  xp = 0;
  picks: string[] = [];
  /** Lay `picks` on the kit, stats and bar (main.ts). */
  apply: () => void = () => {};

  get lv(): number {
    return levelOf(this.xp).lv;
  }

  /** Level-ups earned but not chosen yet. */
  get pending(): number {
    return Math.max(0, this.lv - 1 - this.picks.length);
  }
}
