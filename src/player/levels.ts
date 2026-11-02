// Experience levels and the choose-a-card upgrades, Vampire Survivors style but on a finite budget:
// nobody respawns, so XP is the worth of the mobs lying dead (main.ts derives it every frame) and the
// curve is tuned to it. Full clear before the boss: 1145 XP, level 11; the quest route with the apiary
// ~870 (scripts/balance.ts) and ~1020 with the key's and Fra' Bortolo's quest XP, level 10: the boss is tuned for 10-11.
// Level 2 (the Zitelle) brings the route to ~1930 by the Governatrice, level 14; every quest (quest/progress.ts QUESTS)
// pays 950 XP in all, ~16 with the side quests done too. There is no cap: the curve goes on, and the risen dead keep feeding it.
// Each level offers three cards from everything of the hero's two schools not yet learnt and the cards of no school (`LEAN`:
// half his primary school's, a third his secondary's, the rest the passives, fusions and the potion's), whatever was picked
// before. Every school is the same shape (`specialsOf`): three abilities paid in mana and two specials, instant, spent with a full fury bar.
// Even levels up to 10 offer three new abilities (the specials from level 6), past 10 a new ability against a passive and a
// modifier; the others a modifier of an owned ability (or a fusion), a stat passive and another modifier. New abilities,
// fusions and the on/off modifiers are taken once; every other modifier and passive is ranked with no cap, each pick a rank
// adding the same share again (`rank`, `by`), so the progression never runs out. Every run starts with the base attack of the hero's school (`BASE_ATTACK`:
// Caduta d'ossa for the Ossa, Stiletto di ghiaccio for the Gelo...) and Preghiera di suffragio (the heal), the potion stays as
// an item; owning 3 of the 5 abilities of his secondary school teaches him that school's base attack too (`SECOND_AT`),
// which the book can put on the big button instead. The hero's school adds his own (player/heroes.ts kit, laid on as `learned` by a new game). The merchants' tomes (`TOMES`) teach a whole school of his for gold. A save
// from before the two schools keeps only theirs (`ownSchools`). Everything an
// upgrade changes is a field of `Tune`, replayed from the picks and the tomes' abilities (`tuneOf`), so a save only needs both lists.
// No DOM and no three.js: `npm run check` drives it in Node (scripts/check-levels.ts).

/** XP from level `lv` to `lv + 1`. */
export const need = (lv: number) => 20 * lv;

/** Level reached with `xp`, XP gathered into it and XP the next one needs. */
export function levelOf(xp: number): { lv: number; into: number; next: number } {
  let lv = 1;
  while (xp >= need(lv)) xp -= need(lv++);
  return { lv, into: xp, next: need(lv) };
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
  // fire, frost, lightning and the new blows (abilities/grimoire.ts)
  pyreDmg: number; pyreCast: number; pyreR: number;
  frostDmg: number; frostCast: number; frostSlow: number;
  fontDmg: number; fontRoot: number;
  /** The base attacks but Caduta d'ossa (its own fall* above): each one's upgrades apart. */
  prim: Record<string, Prim>;
  caligoDmg: number; caligoRange: number; caligoFreeze: boolean;
  chainDmg: number; chainHops: number; chainCast: number;
  tollDmg: number; tollStun: number; tollR: number;
  leapDmg: number; leapR: number; leapCd: number;
  whirlDmg: number; whirlTime: number;
  graceDmg: number; graceMul: number; graceCd: number;
  chargeDmg: number; chargeStun: number; chargeCd: number;
  fxShatter: boolean; fxStorm: boolean; fxFrostWhirl: boolean; // fusions: fire on frost, lightning through plague, a whirl of frost
  // five abilities a school: poison, the drain, fire, frost, lightning and holy ones (abilities/grimoire.ts)
  spitDmg: number; spitStacks: number; venomDps: number; venomMax: number;
  untoreDmg: number; untoreR: number;
  miasmaDmg: number; miasmaR: number; miasmaStacks: number; miasmaPush: number;
  feverK: number; feverR: number;
  drainDmg: number; drainHeal: number;
  pillarDmg: number; pillarR: number;
  ceroDps: number; ceroDmg: number; ceroChain: boolean;
  furnaceDmg: number; furnaceRange: number;
  blizzardDmg: number; blizzardR: number;
  orbDmg: number; orbSpeed: number;
  shieldDmg: number; shieldOrbs: number;
  rodDmg: number; rodTime: number; rodEvery: number;
  squallDmg: number; squallR: number;
  judgeDmg: number; judgeCd: number;
  hallowDps: number; hallowR: number;
  hammerDmg: number; hammerStun: number;
  bubbleTime: number;
  fxVenomCloud: boolean; fxHolyFire: boolean; // fusions: poison in the plague cloud, the judgment set alight
}

/** A base attack's numbers: damage a hit, the splash (Stiletto: the frozen shatter), the third blow ×, mana back a hit. */
export interface Prim { dmg: number; split: boolean; third: number; mana: number }

/** An ability's school: the second card of an ability level leans towards the schools already owned. */
export type School = 'bone' | 'plague' | 'shadow' | 'fire' | 'frost' | 'storm' | 'holy';
/** Each school's base attack: the big button of a hero of that school (player/heroes.ts `school[0]`), cheap and fast to spam. */
export const BASE_ATTACK: Record<School, string> = { bone: 'fall', frost: 'lance', plague: 'thorn', shadow: 'umbra', fire: 'ember', storm: 'spark', holy: 'smite' };
export const BASES = Object.values(BASE_ATTACK);
/** Damage a hit of a bolt base attack (Caduta d'ossa: fallDmg). */
export const PRIM_DMG = 8;
const prims = (): Record<string, Prim> => Object.fromEntries(BASES.filter((id) => id !== 'fall').map((id) => [id, { dmg: PRIM_DMG, split: false, third: 1, mana: 0 }]));
/** Abilities of the secondary school owned for its base attack to come by itself. */
export const SECOND_AT = 3;
/** The Risorto's: who `tuneOf` and the rest take a hero to be when not told. */
export const RISORTO: [School, School] = ['bone', 'shadow'];

/** The abilities every run starts with: the hero's base attack, the heal, the potion. */
export const startOf = (schools: readonly School[] = RISORTO) => [BASE_ATTACK[schools[0]], 'mend', 'potion'];
export const START = startOf();
const BASE: Tune = {
  owned: START,
  dmg: 1, hp: 1, mana: 1, armor: 1, regen: 3, speed: 1, cdr: 1, leech: 0, fury: 1, furyStart: 0,
  fallDmg: 16, fallRange: 2.6, fallArc: Math.cos(1.1), fallThird: 1, fallMana: 0,
  plagueDps: 12, plagueR: 2.2, plagueCd: 5, plagueLife: 8,
  wispDps: 15, wispR: 1.6, wispCast: 1,
  veilTime: 5, veilHeal: 0,
  stepDmg: 25, stepCd: 12,
  strikeDmg: 120, novaR: 6, novaDmg: 80, wardTime: 5, wardHeal: 0,
  potion: 0.3, potionCd: 30,
  fxWisp: false, fxStep: false, fxFall: false,
  pyreDmg: 140, pyreCast: 1.2, pyreR: 2.5, // casts of a second or so: a caster faces a charging pack too
  frostDmg: 80, frostCast: 1, frostSlow: 0.5,
  fontDmg: 60, fontRoot: 4,
  prim: prims(),
  caligoDmg: 45, caligoRange: 8, caligoFreeze: false,
  chainDmg: 80, chainHops: 4, chainCast: 1, // under the 1.5 s line too: Fulmine is a caster school
  tollDmg: 90, tollStun: 2.5, tollR: 3.2,
  leapDmg: 60, leapR: 3, leapCd: 12,
  whirlDmg: 22, whirlTime: 3,
  graceDmg: 35, graceMul: 2, graceCd: 6,
  chargeDmg: 30, chargeStun: 1.5, chargeCd: 15,
  fxShatter: false, fxStorm: false, fxFrostWhirl: false,
  spitDmg: 18, spitStacks: 1, venomDps: 4, venomMax: 5,
  untoreDmg: 30, untoreR: 6,
  miasmaDmg: 45, miasmaR: 8, miasmaStacks: 3, miasmaPush: 5,
  feverK: 0.3, feverR: 4,
  drainDmg: 16, drainHeal: 0.02,
  pillarDmg: 100, pillarR: 3.5,
  ceroDps: 12, ceroDmg: 60, ceroChain: false,
  furnaceDmg: 80, furnaceRange: 8,
  blizzardDmg: 18, blizzardR: 4,
  orbDmg: 25, orbSpeed: 5,
  shieldDmg: 55, shieldOrbs: 4,
  rodDmg: 35, rodTime: 12, rodEvery: 1,
  squallDmg: 100, squallR: 6,
  judgeDmg: 70, judgeCd: 6,
  hallowDps: 14, hallowR: 4,
  hammerDmg: 60, hammerStun: 4,
  bubbleTime: 5,
  fxVenomCloud: false, fxHolyFire: false,
};

const it = (n: number) => n.toLocaleString('it', { maximumFractionDigits: 2 });
const pct = (k: number) => `${Math.round(k * 100)}%`;

export type CardKind = 'ability' | 'mod' | 'passive' | 'fusion' | 'filler';
export interface Card {
  id: string; kind: CardKind; name: string; icon: string; text: string; max: number;
  /** The owned ability a mod belongs to; for an ability card, the one it unlocks (= id). */
  of?: string;
  tier?: 'A' | 'B'; // ability cards: B are the specials, offered from level 6
  school?: School; // ability cards
  /** Extra condition on the picks so far (fusions, charge cards). */
  needs?: (count: (id: string) => number, owns: (a: string) => boolean) => boolean;
  apply?: (t: Tune) => void;
}

const special = (_c: (id: string) => number, owns: (a: string) => boolean) => SPECIALS.some(owns);
/** A school's abilities, for the fusions with any of them. */
const FROST = ['frost', 'font', 'caligo', 'blizzard', 'orb', 'lance'], STORM = ['chain', 'toll', 'shield', 'rod', 'squall'], FIRE = ['pyre', 'wisp', 'pillar', 'cero', 'furnace'];
const ability = (id: string, name: string, tier: 'A' | 'B', school: School, text: string): Card => ({ id, kind: 'ability', name, icon: id, text, max: 1, of: id, tier, school });
/** The school of each ability, the starting ones too; abilities of a school share their global cooldown (system.ts). */
export const SCHOOL: Record<string, School> = { mend: 'holy', ...Object.fromEntries(Object.entries(BASE_ATTACK).map(([s, id]) => [id, s as School])) };
const mod = (of: string, id: string, name: string, text: string, max: number, apply: (t: Tune) => void): Card =>
  ({ id, kind: 'mod', name, icon: of, text, max, of, apply });
/** The upgrades with a number to grow have no cap: each pick is a rank more, and each rank adds the same share. */
export const RANKS = Infinity;
type Num = { [K in keyof Tune]: Tune[K] extends number ? K : never }[keyof Tune];
/** A rank's step on field `f`: `k` of its base value more, or with `k` < 0 the value cut by |k| of what is left, so a
 *  cooldown or a cast never reaches 0 (eight ranks of −15% leave a quarter of it). */
const by = (f: Num, k: number) => (t: Tune) => { t[f] = k < 0 ? t[f] * (1 + k) : t[f] + BASE[f] * k; };
const rank = (of: string, id: string, name: string, text: string, ...steps: ((t: Tune) => void)[]): Card =>
  mod(of, id, name, text, RANKS, (t) => { for (const f of steps) f(t); });
/** A base attack's four upgrades, the shape of Caduta d'ossa's: damage, the third blow and mana back by ranks, the splash once. */
const baseMods = (of: string, name: string, n: [string, string, string, string], split = 'il colpo schizza, metà dei danni a chi gli sta entro 2,5 m.'): Card[] => [
  rank(of, `${of}_dmg`, n[0], `${name}: +40% ai danni per colpo a ogni rango (base ${PRIM_DMG}).`, (t) => { t.prim[of].dmg += PRIM_DMG * 0.4; }),
  mod(of, `${of}_split`, n[1], `${name}: ${split}`, 1, (t) => { t.prim[of].split = true; }),
  rank(of, `${of}_third`, n[2], `${name}: un colpo ogni tre infligge il 75% di danni in più a ogni rango.`, (t) => { t.prim[of].third += 0.75; }),
  rank(of, `${of}_mana`, n[3], `${name}: ogni colpo che va a segno ti ridà 4 mana in più a ogni rango.`, (t) => { t.prim[of].mana += 4; }),
];
const passive = (id: string, name: string, text: string, apply: (t: Tune) => void, needs?: Card['needs']): Card =>
  ({ id, kind: 'passive', name, icon: id, text, max: RANKS, apply, needs });

export const CARDS: Card[] = [
  ability('step', "Passo d'ombra", 'A', 'shadow', 'Scatto di 8 m nell’ombra: 25 danni a chi attraversi. 40 mana, recupero 12 s.'),
  ability('veil', 'Velo spettrale', 'B', 'shadow', 'Speciale: con la barra della furia piena, per 5 s diventi un’ombra e subisci il 50% di danni in meno.'),
  ability('wisp', 'Fuoco fatuo', 'A', 'fire', 'Per 60 s un fuoco fatuo si avventa su chi combatti e brucia chi sfiora: 15 danni al secondo.'),
  ability('strike', 'Sentenza del sepolcro', 'B', 'bone', `Speciale: con la barra della furia piena, una lancia d’ossa da ${BASE.strikeDmg} danni.`),
  ability('nova', 'Lamento della cripta', 'B', 'bone', `Speciale: con la barra della furia piena, ${BASE.novaDmg} danni a tutti entro ${BASE.novaR} m.`),
  ability('ward', 'Patto della tomba', 'B', 'shadow', 'Speciale: con la barra della furia piena, 5 s di immunità a ogni danno.'),
  ability('pyre', "Rogo dell'eretico", 'A', 'fire', `Lancio ${it(BASE.pyreCast)} s: un globo di fuoco dei ceri votivi da ${BASE.pyreDmg} danni, metà ai vicini; il bersaglio brucia e il pavimento arde. 45 mana.`),
  ability('frost', 'Dardo di brina', 'A', 'frost', `Lancio ${it(BASE.frostCast)} s: un dardo della laguna gelata da ${BASE.frostDmg} danni, e il bersaglio e chi gli sta entro 3 m rallentano del ${pct(1 - BASE.frostSlow)} per 6 s. 22 mana.`),
  ability('font', 'Acquasantiera gelata', 'B', 'frost', `Speciale: con la barra della furia piena, l'acqua santa ghiaccia attorno a te: ${BASE.fontDmg} danni e chi è entro 5 m resta congelato sul posto ${BASE.fontRoot} s.`),
  ability('caligo', 'Caligo gelato', 'A', 'frost', `Il caligo, la nebbia gelata della laguna, davanti a te fino a ${BASE.caligoRange} m: ${BASE.caligoDmg} danni e chi colpisce rallenta del 60% per 5 s. 30 mana, recupero 6 s.`),
  ability('chain', 'Catena di saette', 'A', 'storm', `Lancio ${it(BASE.chainCast)} s: una saetta da ${BASE.chainDmg} danni che rimbalza su altri ${BASE.chainHops} nemici. 35 mana, recupero 5 s.`),
  ability('toll', 'Rintocco del campanile', 'A', 'storm', `Un fulmine dal campanile sul bersaglio: ${BASE.tollDmg} danni entro ${it(BASE.tollR)} m e storditi ${it(BASE.tollStun)} s. 45 mana, recupero 18 s.`),
  ability('leap', 'Balzo del sepolcro', 'A', 'bone', `Un balzo fino a 12 m sul nemico: ${BASE.leapDmg} danni entro ${BASE.leapR} m e un attimo di stordimento. 30 mana, recupero ${BASE.leapCd} s.`),
  ability('whirl', "Turbine d'ossa", 'A', 'bone', `Per ${BASE.whirlTime} s giri su te stesso con la clava, anche correndo: ${BASE.whirlDmg} danni ogni mezzo secondo entro 3 m, e paghi il 30% in meno dei colpi. 35 mana, recupero 10 s.`),
  ability('grace', 'Colpo di grazia', 'A', 'bone', `Un fendente a due mani davanti a te: ${BASE.graceDmg} danni, fino al triplo sui nemici già feriti. 20 mana, recupero ${BASE.graceCd} s.`),
  ability('charge', 'Carica del dannato', 'A', 'shadow', `Ti scagli sul nemico (4-20 m): ${BASE.chargeDmg} danni e stordito ${it(BASE.chargeStun)} s. Riempie un quarto della furia. 25 mana, recupero ${BASE.chargeCd} s.`),
  // five a school: poison (Diablo's Witch Doctor and Necromancer, WoW's poisons), WoW's warlock drain, mage, shaman and paladin
  ability('plague', 'Nube di peste', 'A', 'plague', `Una nube pestilenziale sul bersaglio, larga ${it(BASE.plagueR)} m: ristagna ${BASE.plagueLife} s e corrode chi ci resta dentro (${BASE.plagueDps} danni al secondo). 25 mana, recupero ${BASE.plagueCd} s.`),
  ability('spit', 'Sputo di bile', 'A', 'plague', `Istantaneo: un grumo di bile velenosa da ${BASE.spitDmg} danni e una dose di veleno (${BASE.venomDps} danni al secondo per dose per 8 s, fino a ${BASE.venomMax} dosi). 18 mana.`),
  ability('untore', "Unguento dell'untore", 'A', 'plague', `Ungi il bersaglio: ${BASE.untoreDmg} danni e il suo veleno (almeno 2 dosi) passa a ogni nemico entro ${BASE.untoreR} m. 30 mana, recupero 10 s.`),
  ability('miasma', 'Fiato della fossa', 'B', 'plague', `Speciale: con la barra della furia piena, esali il miasma delle fosse davanti a te fino a ${BASE.miasmaR} m: ${BASE.miasmaDmg} danni, ${BASE.miasmaStacks} dosi di veleno e chi colpisce è sbalzato indietro di ${BASE.miasmaPush} m (meno i più forti).`),
  ability('fever', 'Febbre di palude', 'B', 'plague', `Speciale: con la barra della furia piena, il bersaglio e chi gli sta entro ${BASE.feverR} m prendono il ${pct(BASE.feverK)} di danni in più da tutto per 12 s (la metà sui più forti).`),
  ability('drain', "Risucchio d'anima", 'A', 'shadow', `Canalizzato 3 s: strappi l'anima al bersaglio, ${BASE.drainDmg} danni ogni mezzo secondo, e ognuno ti cura del ${pct(BASE.drainHeal)}. 40 mana, recupero 8 s.`),
  ability('pillar', 'Colonna di fiamme', 'B', 'fire', `Speciale: con la barra della furia piena, una colonna di fuoco sotto il bersaglio, ${BASE.pillarDmg} danni entro ${it(BASE.pillarR)} m, chi c'è brucia e il pavimento arde.`),
  ability('cero', 'Cero funebre', 'A', 'fire', `Istantaneo: accendi un cero nel bersaglio, ${BASE.ceroDps} danni al secondo per 4 s, poi scoppia: ${BASE.ceroDmg} danni entro 4 m. 30 mana, recupero 3 s.`),
  ability('furnace', 'Fornace di Murano', 'B', 'fire', `Speciale: con la barra della furia piena, il soffio della fornace davanti a te, fino a ${BASE.furnaceRange} m: ${BASE.furnaceDmg} danni, chi colpisce brucia ed è stordito 2 s.`),
  ability('blizzard', 'Bufera di bora', 'A', 'frost', `Canalizzato 4 s: la bora gelida sul bersaglio, ${BASE.blizzardDmg} danni ogni mezzo secondo entro ${BASE.blizzardR} m e rallentati del 50%. 55 mana, recupero 12 s.`),
  ability('orb', 'Globo di brina', 'B', 'frost', `Speciale: con la barra della furia piena, un globo di ghiaccio che rotola per 15 m: ${BASE.orbDmg} danni ogni mezzo secondo a chi passa entro 3,5 m, rallentati, e alla fine scoppia.`),
  ability('shield', 'Scudo di saette', 'A', 'storm', `Per 20 s ${BASE.shieldOrbs} saette ti girano attorno: ognuna fulmina il primo nemico che ti arriva entro 3 m (${BASE.shieldDmg} danni). 40 mana, recupero 20 s.`),
  ability('rod', 'Parafulmine', 'B', 'storm', `Speciale: con la barra della furia piena, pianti un parafulmine ai tuoi piedi: per ${BASE.rodTime} s ogni secondo fulmina il nemico più vicino entro 9 m (${BASE.rodDmg} danni).`),
  ability('squall', 'Burrasca', 'B', 'storm', `Speciale: con la barra della furia piena, un colpo di tuono attorno a te: ${BASE.squallDmg} danni entro ${BASE.squallR} m e i nemici sbalzati via di 5 m (meno i più forti).`),
  ability('judge', 'Giudizio del Redentore', 'A', 'holy', `Istantaneo: un martello di luce sul bersaglio, ${BASE.judgeDmg} danni. 25 mana, recupero ${BASE.judgeCd} s.`),
  ability('hallow', 'Terra consacrata', 'A', 'holy', `Consacri il suolo attorno a te per 8 s: ${BASE.hallowDps} danni al secondo ai nemici entro ${BASE.hallowR} m, e finché ci stai sopra recuperi l'1% della salute al secondo. 40 mana, recupero 12 s.`),
  ability('hammer', 'Martello della penitenza', 'B', 'holy', `Speciale: con la barra della furia piena, un martello d'oro sul bersaglio, ${BASE.hammerDmg} danni e stordito ${BASE.hammerStun} s (molto meno sui più forti).`),
  ability('bubble', 'Aureola del redento', 'B', 'holy', `Speciale: con la barra della furia piena, fuori dal tempo di recupero globale: per ${BASE.bubbleTime} s un'aureola ti rende immune a ogni danno.`),

  passive('dmg', 'Ossa più dure', '+8% a tutti i danni che infliggi, a ogni rango.', by('dmg', 0.08)),
  passive('hp', 'Carne di tomba', '+15% di salute massima a ogni rango (+192), e la recuperi subito.', by('hp', 0.15)),
  passive('armor', 'Pelle di lapide', '−8% ai danni che subisci a ogni rango.', by('armor', -0.08)),
  passive('mana', "Pozzo d'anime", '+20% di mana massimo a ogni rango (+80).', by('mana', 0.2)),
  passive('regen', 'Linfa nera', 'Rigenerazione del mana +33% a ogni rango (+1 al secondo, base 3).', (t) => { t.regen += 1; }),
  passive('speed', 'Passo del morto', '+8% alla velocità di corsa a ogni rango.', by('speed', 0.08)),
  passive('cdr', 'Gelo della cripta', '−10% ai tempi di recupero a ogni rango (non agli attacchi base).', by('cdr', -0.1)),
  passive('leech', "Sete d'anime", 'Ogni nemico che uccidi ti cura del 3% della salute massima, e del 3% in più a ogni rango.', (t) => { t.leech += 0.03; }),
  passive('fury', 'Furia del sepolcro', '+30% alla carica della barra della furia a ogni rango.', by('fury', 0.3), special),

  rank('fall', 'fall_dmg', 'Schegge affilate', `Caduta d'ossa: +30% ai danni per colpo a ogni rango (base ${BASE.fallDmg}).`, by('fallDmg', 0.3)),
  rank('fall', 'fall_reach', 'Braccio della fossa', "Caduta d'ossa: portata +15% (base 2,6 m) e arco +20° a ogni rango (base 125°, fino al cerchio intero).",
    by('fallRange', 0.15), (t) => { t.fallArc = Math.cos(Math.min(Math.PI, Math.acos(t.fallArc) + 0.175)); }),
  rank('fall', 'fall_third', 'Colpo del becchino', "Caduta d'ossa: il terzo colpo della combo infligge il 75% di danni in più a ogni rango.", (t) => { t.fallThird += 0.75; }),
  rank('fall', 'fall_mana', 'Ossa avide', "Caduta d'ossa: ogni fendente che colpisce ti ridà 4 mana in più a ogni rango.", (t) => { t.fallMana += 4; }),
  rank('plague', 'plague_dps', 'Peste virulenta', `Nube di peste: +33% ai danni al secondo a ogni rango (base ${BASE.plagueDps}).`, (t) => { t.plagueDps += 4; }),
  rank('plague', 'plague_size', 'Miasma esteso', `Nube di peste: raggio +25% a ogni rango (base ${it(BASE.plagueR)} m).`, by('plagueR', 0.25)),
  rank('plague', 'plague_cd', 'Contagio', `Nube di peste: recupero −25% a ogni rango (base ${BASE.plagueCd} s).`, by('plagueCd', -0.25)),
  rank('plague', 'plague_long', 'Ristagno', `Nube di peste: dura il 50% in più a ogni rango (base ${BASE.plagueLife} s).`, by('plagueLife', 0.5)),
  rank('wisp', 'wisp_dps', 'Fiamma vorace', `Fuoco fatuo: +50% ai danni al secondo a ogni rango (base ${BASE.wispDps}).`, by('wispDps', 0.5)),
  rank('wisp', 'wisp_still', 'Fuoco inquieto', `Fuoco fatuo: brucia il 50% più largo a ogni rango (base ${it(BASE.wispR)} m).`, by('wispR', 0.5)),
  rank('wisp', 'wisp_fast', 'Evocazione rapida', `Fuoco fatuo: evocazione −50% a ogni rango (base ${it(BASE.wispCast)} s).`, by('wispCast', -0.5)),
  rank('veil', 'veil_long', 'Velo più lungo', `Velo spettrale: dura il 40% in più a ogni rango (base ${BASE.veilTime} s).`, by('veilTime', 0.4)),
  rank('veil', 'veil_heal', 'Velo rigenerante', 'Velo spettrale: mentre dura ti cura del 3% della salute al secondo, e del 3% in più a ogni rango.', (t) => { t.veilHeal += 0.03; }),
  rank('step', 'step_dmg', 'Passo lacerante', `Passo d'ombra: +100% ai danni a ogni rango (base ${BASE.stepDmg}).`, by('stepDmg', 1)),
  rank('step', 'step_cd', 'Doppio passo', `Passo d'ombra: recupero −30% a ogni rango (base ${BASE.stepCd} s).`, by('stepCd', -0.3)),
  rank('strike', 'strike_dmg', 'Condanna', `Sentenza del sepolcro: +60% ai danni a ogni rango (base ${BASE.strikeDmg}).`, by('strikeDmg', 0.6)),
  rank('nova', 'nova_big', 'Lamento profondo', `Lamento della cripta: +50% ai danni (base ${BASE.novaDmg}) e raggio +20% (base ${BASE.novaR} m) a ogni rango.`, by('novaDmg', 0.5), by('novaR', 0.2)),
  rank('ward', 'ward_long', 'Patto eterno', `Patto della tomba: dura il 30% in più (base ${BASE.wardTime} s) e alla fine ti cura del 15% in più, a ogni rango.`, by('wardTime', 0.3), (t) => { t.wardHeal += 0.15; }),
  rank('potion', 'potion_big', 'Fiala capiente', `Fiala di linfa tombale: ripristina la metà in più a ogni rango (base il ${pct(BASE.potion)}, +15%).`, by('potion', 0.5)),
  rank('potion', 'potion_cd', 'Fiala rapida', `Fiala di linfa tombale: recupero −30% a ogni rango (base ${BASE.potionCd} s).`, by('potionCd', -0.3)),
  rank('pyre', 'pyre_fast', 'Rogo rapido', `Rogo dell'eretico: lancio −35% a ogni rango (base ${it(BASE.pyreCast)} s).`, by('pyreCast', -0.35)),
  rank('pyre', 'pyre_big', 'Pira', `Rogo dell'eretico: +30% ai danni (base ${BASE.pyreDmg}) e schizzi e fiamme a terra +20% più larghi (base ${it(BASE.pyreR)} m) a ogni rango.`, by('pyreDmg', 0.3), by('pyreR', 0.2)),
  rank('frost', 'frost_deep', 'Brina profonda', `Dardo di brina: +25% ai danni (base ${BASE.frostDmg}) a ogni rango, e ai rallentati lascia il 30% di velocità in meno (base ${pct(BASE.frostSlow)}).`, by('frostDmg', 0.25), by('frostSlow', -0.3)),
  rank('frost', 'frost_fast', 'Dardo rapido', `Dardo di brina: lancio −35% a ogni rango (base ${it(BASE.frostCast)} s).`, by('frostCast', -0.35)),
  rank('font', 'font_long', 'Gelo eterno', `Acquasantiera gelata: congela il 50% più a lungo a ogni rango (base ${BASE.fontRoot} s).`, by('fontRoot', 0.5)),
  rank('font', 'font_cd', 'Acquasantiera colma', `Acquasantiera gelata: +60% ai danni a ogni rango (base ${BASE.fontDmg}).`, by('fontDmg', 0.6)), // *_cd: the id of the cooldown card it was before it became a special, kept for the saves (likewise hammer_cd, bubble_cd)
  rank('caligo', 'caligo_big', 'Caligo fitto', `Caligo gelato: +35% ai danni (base ${BASE.caligoDmg}) e portata +25% (base ${BASE.caligoRange} m) a ogni rango.`, by('caligoDmg', 0.35), by('caligoRange', 0.25)),
  mod('caligo', 'caligo_freeze', 'Caligo di gennaio', 'Caligo gelato: chi era già rallentato resta congelato sul posto 2 s.', 1, (t) => { t.caligoFreeze = true; }),
  // the base attacks but Caduta d'ossa (its four are above)
  ...baseMods('lance', 'Stiletto di ghiaccio', ['Stiletto affilato', 'Frantumi', 'Stiletto del bravo', 'Brina avida'], 'chi è congelato va in frantumi e le schegge colpiscono per metà chi gli sta entro 3 m.'),
  ...baseMods('thorn', 'Spina di peste', ['Spina marcia', 'Pustola', 'Spina del monatto', 'Spina avida']),
  ...baseMods('umbra', "Strale d'ombra", ['Strale affilato', 'Ombra che dilaga', 'Strale della bauta', 'Ombra avida']),
  ...baseMods('ember', 'Tizzone', ['Tizzone rovente', 'Brace sparsa', 'Tizzone del vetraio', 'Brace avida'], 'le braci schizzano più forte: metà dei danni a chi gli sta entro 2,5 m (era un terzo entro 2 m).'),
  ...baseMods('spark', 'Folgore', ['Folgore viva', 'Folgore biforcuta', 'Folgore del campanaro', 'Folgore avida']),
  ...baseMods('smite', 'Castigo', ['Castigo severo', 'Castigo diffuso', 'Castigo trino', 'Castigo grato']),
  rank('chain', 'chain_long', 'Catena lunga', `Catena di saette: due rimbalzi in più a ogni rango (+50%, base ${BASE.chainHops}).`, (t) => { t.chainHops += 2; }),
  rank('chain', 'chain_fast', 'Saette rapide', `Catena di saette: lancio −35% a ogni rango (base ${it(BASE.chainCast)} s).`, by('chainCast', -0.35)),
  rank('toll', 'toll_long', 'Rintocco funebre', `Rintocco del campanile: storditi il 40% più a lungo a ogni rango (base ${it(BASE.tollStun)} s).`, by('tollStun', 0.4)),
  rank('toll', 'toll_big', 'Campane a morto', `Rintocco del campanile: +35% ai danni (base ${BASE.tollDmg}) e raggio +25% (base ${it(BASE.tollR)} m) a ogni rango.`, by('tollDmg', 0.35), by('tollR', 0.25)),
  rank('leap', 'leap_big', 'Balzo devastante', `Balzo del sepolcro: +55% ai danni (base ${BASE.leapDmg}) e raggio +30% (base ${BASE.leapR} m) a ogni rango.`, by('leapDmg', 0.55), by('leapR', 0.3)),
  rank('leap', 'leap_cd', 'Balzo leggero', `Balzo del sepolcro: recupero −40% a ogni rango (base ${BASE.leapCd} s).`, by('leapCd', -0.4)),
  rank('whirl', 'whirl_dmg', 'Turbine furioso', `Turbine d'ossa: +35% ai danni a ogni rango (base ${BASE.whirlDmg} ogni mezzo secondo).`, by('whirlDmg', 0.35)),
  rank('whirl', 'whirl_long', 'Turbine lungo', `Turbine d'ossa: dura il 50% in più a ogni rango (base ${BASE.whirlTime} s).`, by('whirlTime', 0.5)),
  rank('grace', 'grace_mul', 'Boia', 'Colpo di grazia: il colpo sui nemici feriti cresce del 75% a ogni rango (base fino al triplo).', by('graceMul', 0.75)),
  rank('grace', 'grace_cd', 'Lama del boia', `Colpo di grazia: recupero −40% a ogni rango (base ${BASE.graceCd} s).`, by('graceCd', -0.4)),
  rank('charge', 'charge_stun', 'Carica brutale', `Carica del dannato: +50% ai danni (base ${BASE.chargeDmg}) e +40% allo stordimento (base ${it(BASE.chargeStun)} s) a ogni rango.`, by('chargeDmg', 0.5), by('chargeStun', 0.4)),
  rank('charge', 'charge_cd', 'Carica instancabile', `Carica del dannato: recupero −30% a ogni rango (base ${BASE.chargeCd} s).`, by('chargeCd', -0.3)),
  mod('spit', 'spit_twin', 'Doppio sputo', 'Sputo di bile: due dosi di veleno a colpo invece di una.', 1, (t) => { t.spitStacks = 2; }),
  rank('untore', 'untore_far', 'Unzione diffusa', `Unguento dell'untore: +50% ai danni (base ${BASE.untoreDmg}) e il veleno passa il 40% più lontano (base ${BASE.untoreR} m) a ogni rango.`, by('untoreDmg', 0.5), by('untoreR', 0.4)),
  rank('miasma', 'miasma_more', 'Fossa comune', `Fiato della fossa: una dose di veleno in più (base ${BASE.miasmaStacks}, fino a ${BASE.venomMax}) e +30% ai danni (base ${BASE.miasmaDmg}) a ogni rango.`,
    (t) => { t.miasmaStacks = Math.min(t.venomMax, t.miasmaStacks + 1); }, by('miasmaDmg', 0.3)),
  rank('fever', 'fever_deep', 'Febbre terzana', `Febbre di palude: i danni subiti crescono del 50% a ogni rango (base +${pct(BASE.feverK)}), e il raggio del 30% (base ${BASE.feverR} m).`, by('feverK', 0.5), by('feverR', 0.3)),
  rank('drain', 'drain_deep', 'Sete del dannato', `Risucchio d'anima: +40% ai danni (base ${BASE.drainDmg} ogni mezzo secondo) e +40% alla cura (base ${pct(BASE.drainHeal)}) a ogni rango.`, by('drainDmg', 0.4), by('drainHeal', 0.4)),
  rank('pillar', 'pillar_big', "Rogo del Sant'Uffizio", `Colonna di fiamme: +40% ai danni (base ${BASE.pillarDmg}) e raggio +20% (base ${it(BASE.pillarR)} m) a ogni rango.`, by('pillarDmg', 0.4), by('pillarR', 0.2)),
  mod('cero', 'cero_chain', 'Processione', 'Cero funebre: lo scoppio accende un cero in due dei nemici che colpisce (i loro non si propagano).', 1, (t) => { t.ceroChain = true; }),
  rank('furnace', 'furnace_hot', 'Maestro vetraio', `Fornace di Murano: +40% ai danni (base ${BASE.furnaceDmg}) e portata +25% (base ${BASE.furnaceRange} m) a ogni rango.`, by('furnaceDmg', 0.4), by('furnaceRange', 0.25)),
  rank('blizzard', 'blizzard_big', 'Bora scura', `Bufera di bora: +30% ai danni (base ${BASE.blizzardDmg} ogni mezzo secondo) e raggio +25% (base ${BASE.blizzardR} m) a ogni rango.`, by('blizzardDmg', 0.3), by('blizzardR', 0.25)),
  rank('orb', 'orb_slow', 'Globo pigro', `Globo di brina: +30% ai danni a colpo (base ${BASE.orbDmg}) e rotola il 15% più piano (più colpi; base ${BASE.orbSpeed} m/s, non sotto 2) a ogni rango.`,
    by('orbDmg', 0.3), (t) => { t.orbSpeed = Math.max(2, t.orbSpeed * 0.85); }),
  rank('shield', 'shield_more', 'Corona di saette', `Scudo di saette: +25% ai danni (base ${BASE.shieldDmg}) e una saetta in più (base ${BASE.shieldOrbs}, fino a 6) a ogni rango.`,
    by('shieldDmg', 0.25), (t) => { t.shieldOrbs = Math.min(6, t.shieldOrbs + 1); }),
  rank('rod', 'rod_long', 'Parafulmine di San Marco', `Parafulmine: dura il 40% in più (base ${BASE.rodTime} s) e fulmina il 20% più spesso (base ogni ${BASE.rodEvery} s) a ogni rango.`, by('rodTime', 0.4), by('rodEvery', -0.2)),
  rank('squall', 'squall_big', 'Fortunale', `Burrasca: +35% ai danni (base ${BASE.squallDmg}) e raggio +25% (base ${BASE.squallR} m) a ogni rango.`, by('squallDmg', 0.35), by('squallR', 0.25)),
  rank('judge', 'judge_dmg', 'Giudizio universale', `Giudizio del Redentore: +35% ai danni (base ${BASE.judgeDmg}) e recupero −20% (base ${BASE.judgeCd} s) a ogni rango.`, by('judgeDmg', 0.35), by('judgeCd', -0.2)),
  rank('hallow', 'hallow_big', 'Sagrato', `Terra consacrata: +35% ai danni al secondo (base ${BASE.hallowDps}) e raggio +25% (base ${BASE.hallowR} m) a ogni rango.`, by('hallowDps', 0.35), by('hallowR', 0.25)),
  rank('hammer', 'hammer_cd', 'Penitenza severa', `Martello della penitenza: +40% ai danni (base ${BASE.hammerDmg}) e stordimento +20% (base ${BASE.hammerStun} s) a ogni rango.`, by('hammerDmg', 0.4), by('hammerStun', 0.2)),
  rank('bubble', 'bubble_cd', 'Santità', `Aureola del redento: dura il 30% in più a ogni rango (base ${BASE.bubbleTime} s).`, by('bubbleTime', 0.3)),
  { id: 'fury_start', kind: 'mod', name: 'Rancore', icon: 'fury', max: 1, text: 'Dopo una speciale la barra della furia riparte da 30 invece che da 0.',
    needs: special, apply: (t) => { t.furyStart = 30; } },

  { id: 'fx_wispplague', kind: 'fusion', name: 'Fuoco pestilente', icon: 'wisp', max: 1, text: 'Fusione. Il fuoco fatuo lascia cadere una nube di peste sotto di sé ogni 6 s.',
    needs: (_c, owns) => owns('wisp') && owns('plague'), apply: (t) => { t.fxWisp = true; } },
  { id: 'fx_stepplague', kind: 'fusion', name: 'Ombra appestata', icon: 'step', max: 1, text: "Fusione. Passo d'ombra lascia una nube di peste dove sparisci.",
    needs: (_c, owns) => owns('step') && owns('plague'), apply: (t) => { t.fxStep = true; } },
  { id: 'fx_fallplague', kind: 'fusion', name: 'Ossa appestate', icon: 'fall', max: 1, text: "Fusione. Il terzo colpo di Caduta d'ossa semina una nube di peste (al massimo ogni 3 s).",
    needs: (c, owns) => owns('fall') && c('plague_dps') >= 1, apply: (t) => { t.fxFall = true; } },

  { id: 'fx_shatter', kind: 'fusion', name: 'Frantumazione', icon: 'pyre', max: 1, text: "Fusione. Rogo dell'eretico su un nemico rallentato o congelato: +60% di danni e il ghiaccio esplode in schegge (30 danni entro 3 m).",
    needs: (_c, owns) => owns('pyre') && FROST.some(owns), apply: (t) => { t.fxShatter = true; } },
  { id: 'fx_storm', kind: 'fusion', name: 'Miasma elettrico', icon: 'chain', max: 1, text: 'Fusione. Le saette fanno +50% di danni a chi sta in una nube di peste, e la catena rimbalza su tutti loro (fino a 3 salti in più).',
    needs: (_c, owns) => STORM.some(owns) && owns('plague'), apply: (t) => { t.fxStorm = true; } },
  { id: 'fx_frostwhirl', kind: 'fusion', name: 'Turbine di brina', icon: 'whirl', max: 1, text: "Fusione. Turbine d'ossa gela chi colpisce (rallentato del 40%) e fa il doppio dei danni a chi è congelato.",
    needs: (_c, owns) => owns('whirl') && FROST.some(owns), apply: (t) => { t.fxFrostWhirl = true; } },
  { id: 'fx_venomcloud', kind: 'fusion', name: 'Miasma velenoso', icon: 'plague', max: 1, text: 'Fusione. Nube di peste dà una dose di veleno al secondo a chi ci sta dentro.',
    needs: (_c, owns) => owns('plague') && (owns('spit') || owns('untore') || owns('miasma')), apply: (t) => { t.fxVenomCloud = true; } },
  { id: 'fx_holyfire', kind: 'fusion', name: 'Giudizio ardente', icon: 'judge', max: 1, text: 'Fusione. Giudizio del Redentore incendia il bersaglio (brucia 4 s), e su chi già brucia fa +50% di danni.',
    needs: (_c, owns) => owns('judge') && FIRE.some(owns), apply: (t) => { t.fxHolyFire = true; } },

  // Repeatable, offered only once the cards above run short.
  { id: 'linfa', kind: 'filler', name: 'Linfa tombale', icon: 'potion', max: Infinity, text: 'Recuperi il 30% della salute e del mana.' },
  // Retired into Ossa più dure's and Carne di tomba's ranks: never offered, kept so older saves replay them.
  { id: 'ossa_eterne', kind: 'filler', name: 'Ossa eterne', icon: 'dmg', max: Infinity, text: '+2% a tutti i danni che infliggi. Si ripete.', apply: (t) => { t.dmg += 0.02; } },
  { id: 'carne_eterna', kind: 'filler', name: 'Carne eterna', icon: 'hp', max: Infinity, text: '+4% di salute massima. Si ripete.', apply: (t) => { t.hp += 0.04; } },
];
export const CARD = new Map(CARDS.map((c) => [c.id, c]));
for (const c of CARDS) if (c.school) SCHOOL[c.id] = c.school;
/** The specials: two a school, instant, each spending a full fury bar (tier B, offered from level 6). */
export const SPECIALS = CARDS.filter((c) => c.tier === 'B').map((c) => c.id);
/** The school a card belongs to: an ability's own, an upgrade its ability's; none for passives, fusions and the potion's. */
export const schoolOf = (c: Card): School | undefined => c.school ?? SCHOOL[c.of ?? ''];
/** A card a hero of `schools` may have: of his two schools, or of none. */
export const ours = (c: Card, schools: readonly School[]) => { const s = schoolOf(c); return !s || schools.includes(s); };

/** How many times each card was picked: what the offers filter on (`eligible`) and the level-up badge shows (`stacks`). */
export const counter = (picks: readonly string[]) => {
  const n = new Map<string, number>();
  for (const p of picks) n.set(p, (n.get(p) ?? 0) + 1);
  return (id: string) => n.get(id) ?? 0;
};

/** A ranked card's badge on the level-up window: the rank this pick brings it to ("rango 1" the first time). '' for the one-time cards. */
export const stacks = (c: Card, count: (id: string) => number) => (c.max === RANKS && c.kind !== 'filler' ? `rango ${count(c.id) + 1}` : '');

/** The abilities of school `s` a slot holds: its five, the base attack apart. */
export const slotsOf = (s: School) => Object.keys(SCHOOL).filter((id) => SCHOOL[id] === s && !BASES.includes(id));
/** School `s`'s specials (two) and its mana abilities (three, the heal counted for the Sacro). */
export const specialsOf = (s: School) => slotsOf(s).filter((id) => SPECIALS.includes(id));
export const manaOf = (s: School) => slotsOf(s).filter((id) => !SPECIALS.includes(id));

/**
 * The stats and ability numbers the picks and the tomes' `learned` abilities add up to (unknown ids and stacks past `max`
 * are ignored), for a hero of `schools` (primary, secondary): his base attack, and his secondary's once he owns SECOND_AT of its five.
 */
export function tuneOf(picks: readonly string[], learned: readonly string[] = [], schools: readonly School[] = RISORTO): Tune {
  const t: Tune = { ...BASE, owned: startOf(schools), prim: prims() }, seen = new Map<string, number>();
  for (const id of picks) {
    const c = CARD.get(id), k = (seen.get(id) ?? 0) + 1;
    if (!c || k > c.max) continue;
    seen.set(id, k);
    if (c.kind === 'ability') t.owned.push(id);
    c.apply?.(t);
  }
  for (const id of learned) if (CARD.get(id)?.kind === 'ability' && !t.owned.includes(id)) t.owned.push(id);
  if (slotsOf(schools[1]).filter((id) => t.owned.includes(id)).length >= SECOND_AT) t.owned.push(BASE_ATTACK[schools[1]]);
  if (!SPECIALS.some((s) => t.owned.includes(s))) t.fury = 0; // no special to spend it on: the bar stays empty and hidden
  return t;
}

/** Cards that may still be offered after `picks` and the tomes' `learned`: of the hero's schools (or none), not maxed nor owned, their ability owned, their needs met. */
export function eligible(picks: readonly string[], learned: readonly string[] = [], schools: readonly School[] = RISORTO): Card[] {
  const count = counter(picks), owned = tuneOf(picks, learned, schools).owned, owns = (a: string) => owned.includes(a);
  return CARDS.filter((c) => c.kind !== 'filler' && ours(c, schools) && count(c.id) < c.max && (c.kind === 'ability' ? !owns(c.id) : !c.of || owns(c.of)) && (!c.needs || c.needs(count, owns)));
}

/**
 * A save's picks and tomes' abilities made a hero of `schools`'s, now that he has only two (older runs took cards of any
 * school): a card of another school is dropped (an upgrade of a dropped ability with it), and so is whatever leaned on what
 * went (a fusion missing a parent, a fury card with no special left). A dropped pick leaves its level-up to choose again
 * (Levels.pending), a dropped tome ability gives back what the tome asked for it (`refund`, gold). Order is kept.
 */
export function ownSchools(picks: readonly string[], learned: readonly string[], schools: readonly School[]): { picks: string[]; learned: string[]; refund: number } {
  const keep = (id: string) => { const c = CARD.get(id); return !!c && ours(c, schools); };
  const lost = learned.filter((id) => !keep(id) && CARD.get(id)?.kind === 'ability');
  const learnt = learned.filter(keep);
  let kept = picks.filter((id) => !CARD.get(id) || keep(id)); // unknown ids are tuneOf's to ignore
  for (let n = kept.length + 1; kept.length < n;) { // what leaned on a dropped card, until nothing more goes
    n = kept.length;
    const count = counter(kept), owned = tuneOf(kept, learnt, schools).owned, owns = (a: string) => owned.includes(a);
    kept = kept.filter((id) => { const c = CARD.get(id); return !c || ((c.kind === 'ability' || !c.of || owns(c.of)) && (!c.needs || c.needs(count, owns))); });
  }
  return { picks: kept, learned: learnt, refund: lost.reduce((g, id) => g + TOME_PRICE[CARD.get(id)!.tier ?? 'A'], 0) };
}

/** Odds a card is drawn from the hero's primary school, his secondary, the cards of no school (passives, fusions, the potion's). */
export const LEAN = [0.5, 0.3, 0.2];
/** Which of LEAN's shares a card falls in for a hero of `schools`: an upgrade goes with its ability's school. */
export const leanOf = (c: Card, schools: readonly School[]) => { const s = schoolOf(c); return s === schools[0] ? 0 : s === schools[1] ? 1 : 2; };

/**
 * The three cards for the next level-up (the one `picks.length + 2` reaches), each drawn from its kind's pool: a share
 * by LEAN (the empty ones' odds go to the rest), then evenly within it; the heal fills in if the pool ever runs
 * short. The cards passed over go back into the pool.
 */
export function offer(picks: readonly string[], rnd: () => number = Math.random, learned: readonly string[] = [], schools: readonly School[] = RISORTO): Card[] {
  const lv = picks.length + 2, ok = eligible(picks, learned, schools), out: Card[] = [];
  const pick = (from: Card[]) => {
    const left = from.filter((c) => !out.includes(c));
    if (!left.length) return;
    const shares = LEAN.map((_, i) => left.filter((c) => leanOf(c, schools) === i)), w = LEAN.map((k, i) => (shares[i].length ? k : 0));
    let r = rnd() * w.reduce((a, b) => a + b, 0), i = 0;
    while (i < 2 && (r -= w[i]) >= 0) i++;
    while (!shares[i].length) i--; // r rounding onto an empty share's edge
    const of = shares[i];
    out.push(of[Math.floor(rnd() * of.length) % of.length]);
  };
  const abilities = ok.filter((c) => c.kind === 'ability' && (c.tier === 'A' || lv >= 6));
  const mods = ok.filter((c) => c.kind === 'mod' || c.kind === 'fusion'), passives = ok.filter((c) => c.kind === 'passive');
  if (lv % 2 === 0 && lv <= 10) {
    if (lv === 6 || lv === 8) pick(abilities.filter((c) => c.tier === 'B')); // the specials surface in time
    pick(abilities);
    pick(abilities);
    pick(abilities);
  } else if (lv % 2 === 0 && abilities.length) { // past 10: keep learning, or grow what is owned
    pick(abilities);
    pick(passives);
    pick(mods);
  } else {
    const fusions = mods.filter((c) => c.kind === 'fusion');
    pick(fusions.length && rnd() < 0.5 ? fusions : mods);
    pick(passives);
    pick(mods);
  }
  pick(mods); // short: fill from the upgrades, then the heal
  pick(passives);
  pick(mods);
  pick(FILLERS);
  return out.slice(0, 3);
}
const FILLERS = CARDS.filter((c) => c.id === 'linfa');

/** A merchant's tome: every ability of a school, for gold (ui/vendor.ts), sold only for the hero's two schools (`tomesOf`). The cost is
 * per ability it would still teach: five a school (Preghiera di suffragio, everyone's, aside), less what the hero's kit already gave. */
export interface Tome { school: School; name: string; icon: string }
export const TOMES: Tome[] = [
  { school: 'bone', name: 'Tomo delle Ossa', icon: 'strike' },
  { school: 'shadow', name: "Tomo dell'Ombra", icon: 'step' },
  { school: 'fire', name: 'Tomo del Fuoco', icon: 'pyre' },
  { school: 'frost', name: 'Tomo del Gelo', icon: 'frost' },
  { school: 'storm', name: 'Tomo del Fulmine', icon: 'chain' },
  { school: 'plague', name: 'Tomo della Peste', icon: 'miasma' },
  { school: 'holy', name: 'Tomo del Sacro', icon: 'judge' },
];
/** The tomes a hero of `schools` is sold: his primary school's, then his secondary's. */
export const tomesOf = (schools: readonly School[]) => schools.map((s) => TOMES.find((t) => t.school === s)!);
/** Gold a tome asks for each ability it teaches: a special costs more. */
export const TOME_PRICE = { A: 200, B: 350 } as const; // ~700 gold walking into the Reverendissimo, ~1200 after: the rest of the kit's school (900) or the Sacro (1100) by then, a whole one (1300) a level-2 goal
/** What `tome` would teach someone owning `owned`, and its price; a tome with nothing left to teach is not sold. */
export function tomeOf(tome: Tome, owned: readonly string[]): { teaches: Card[]; price: number } {
  const teaches = CARDS.filter((c) => c.kind === 'ability' && c.school === tome.school && !owned.includes(c.id));
  return { teaches, price: teaches.reduce((s, c) => s + TOME_PRICE[c.tier ?? 'A'], 0) };
}

/** Runtime level state: XP (main.ts sets it from the dead), the picks, the tomes' abilities, and the hook that lays them on the kit. */
export class Levels {
  xp = 0;
  /** The hero's schools, primary and secondary (player/heroes.ts). */
  schools: readonly School[] = RISORTO;
  /** The base attack on the big button, if the player put his secondary school's there (the book); else his own. */
  main = '';
  picks: string[] = [];
  learned: string[] = [];
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
