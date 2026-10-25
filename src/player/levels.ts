// Experience levels and the choose-a-card upgrades, Vampire Survivors style but on a finite budget:
// nobody respawns, so XP is the worth of the mobs lying dead (main.ts derives it every frame) and the
// curve is tuned to it. Full clear before the boss: 1145 XP, level 11; the quest route with the apiary
// ~870 (scripts/balance.ts) and ~1020 with the key's and Fra' Bortolo's quest XP, level 10: the boss is tuned for 10-11.
// Level 2 (the Zitelle) brings the route to ~1930 by the Governatrice, level 14; every quest (quest/progress.ts QUESTS)
// pays 950 XP in all, ~16 with the side quests done too. There is no cap: the curve goes on, and the risen dead keep feeding it.
// Each level offers two cards from everything not yet learnt or maxed, leaning to the hero's schools (`LEAN`: half his
// primary school's, a third his secondary's, the rest everything else), whatever was picked before.
// Even levels up to 10 offer two new abilities (the specials from level 6), past 10 a new ability against an upgrade;
// the others a modifier of an owned ability (or a fusion) against a stat passive. With the finite cards all taken, small
// repeatable ones (and the heal) keep coming. Every run starts with the base attack of the hero's school (`BASE_ATTACK`:
// Caduta d'ossa for the Ossa, Stiletto di ghiaccio for the Gelo...) and Preghiera di suffragio (the heal), the potion stays as
// an item; owning 3 of the 5 abilities of his secondary school teaches him that school's base attack too (`SECOND_AT`),
// which the book can put on the big button instead. The hero's school adds his own (player/heroes.ts kit, laid on as `learned` by a new game). The merchants' tomes (`TOMES`) teach a whole school for gold. Everything an
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
  fontDmg: number; fontRoot: number; fontCd: number;
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
  miasmaDmg: number; miasmaR: number; miasmaStacks: number; miasmaCd: number;
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
  hammerStun: number; hammerCd: number;
  bubbleCd: number;
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
/** Colonna di fiamme's cast (abilities/forsaken.ts). */
export const PILLAR_CAST = 0.8;
const prims = (): Record<string, Prim> => Object.fromEntries(BASES.filter((id) => id !== 'fall').map((id) => [id, { dmg: PRIM_DMG, split: false, third: 1, mana: 0 }]));
/** Abilities of the secondary school owned for its base attack to come by itself. */
export const SECOND_AT = 3;
/** The Risorto's: who `tuneOf` and the rest take a hero to be when not told. */
export const RISORTO: [School, School] = ['bone', 'shadow'];

/** The abilities every run starts with: the hero's base attack, the heal, the potion. */
export const startOf = (schools: readonly School[] = RISORTO) => [BASE_ATTACK[schools[0]], 'mend', 'potion'];
export const START = startOf();
export const SPECIALS = ['strike', 'nova', 'ward'];
const BASE: Tune = {
  owned: START,
  dmg: 1, hp: 1, mana: 1, armor: 1, regen: 3, speed: 1, cdr: 1, leech: 0, fury: 1, furyStart: 0,
  fallDmg: 10, fallRange: 2.6, fallArc: Math.cos(1.1), fallThird: 1, fallMana: 0,
  plagueDps: 12, plagueR: 2.2, plagueCd: 5, plagueLife: 8,
  wispDps: 15, wispR: 1.6, wispCast: 1,
  veilTime: 5, veilHeal: 0,
  stepDmg: 25, stepCd: 12,
  strikeDmg: 50, novaR: 6, novaDmg: 20, wardTime: 5, wardHeal: 0,
  potion: 0.3, potionCd: 30,
  fxWisp: false, fxStep: false, fxFall: false,
  pyreDmg: 140, pyreCast: 1.2, pyreR: 2.5, // casts of a second or so: a caster faces a charging pack too
  frostDmg: 65, frostCast: 1, frostSlow: 0.5,
  fontDmg: 25, fontRoot: 4, fontCd: 20,
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
  miasmaDmg: 30, miasmaR: 7, miasmaStacks: 3, miasmaCd: 12,
  feverK: 0.2, feverR: 4,
  drainDmg: 16, drainHeal: 0.02,
  pillarDmg: 70, pillarR: 3.5,
  ceroDps: 12, ceroDmg: 60, ceroChain: false,
  furnaceDmg: 50, furnaceRange: 8,
  blizzardDmg: 18, blizzardR: 4,
  orbDmg: 15, orbSpeed: 5,
  shieldDmg: 45, shieldOrbs: 4,
  rodDmg: 22, rodTime: 12, rodEvery: 1,
  squallDmg: 60, squallR: 6,
  judgeDmg: 70, judgeCd: 6,
  hallowDps: 14, hallowR: 4,
  hammerStun: 4, hammerCd: 30,
  bubbleCd: 120,
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
/** A base attack's four upgrades, the shape of Caduta d'ossa's: damage (twice), a wider reach, the third blow, mana back. */
const baseMods = (of: string, name: string, n: [string, string, string, string], split = 'il colpo schizza, metà dei danni a chi gli sta entro 2,5 m.'): Card[] => [
  mod(of, `${of}_dmg`, n[0], `${name}: +3 danni per colpo (base ${PRIM_DMG}).`, 2, (t) => { t.prim[of].dmg += 3; }),
  mod(of, `${of}_split`, n[1], `${name}: ${split}`, 1, (t) => { t.prim[of].split = true; }),
  mod(of, `${of}_third`, n[2], `${name}: un colpo ogni tre ne infligge ×2,5.`, 1, (t) => { t.prim[of].third = 2.5; }),
  mod(of, `${of}_mana`, n[3], `${name}: ogni colpo che va a segno ti ridà 4 mana.`, 1, (t) => { t.prim[of].mana = 4; }),
];
const passive = (id: string, name: string, text: string, max: number, apply: (t: Tune) => void, needs?: Card['needs']): Card =>
  ({ id, kind: 'passive', name, icon: id, text, max, apply, needs });

export const CARDS: Card[] = [
  ability('step', "Passo d'ombra", 'A', 'shadow', 'Scatto di 8 m nell’ombra: 25 danni a chi attraversi. 40 mana, recupero 12 s.'),
  ability('veil', 'Velo spettrale', 'A', 'shadow', 'Per 5 s subisci il 50% di danni in meno. 50 mana, recupero 30 s.'),
  ability('wisp', 'Fuoco fatuo', 'A', 'fire', 'Per 60 s un fuoco fatuo si avventa su chi combatti e brucia chi sfiora: 15 danni al secondo.'),
  ability('strike', 'Sentenza del sepolcro', 'B', 'bone', 'Speciale: con la barra della furia piena, una lancia d’ossa da 50 danni.'),
  ability('nova', 'Lamento della cripta', 'B', 'bone', 'Speciale: con la barra della furia piena, 20 danni a tutti entro 6 m.'),
  ability('ward', 'Patto della tomba', 'B', 'shadow', 'Speciale: con la barra della furia piena, 5 s di immunità a ogni danno.'),
  ability('pyre', "Rogo dell'eretico", 'A', 'fire', `Lancio ${it(BASE.pyreCast)} s: un globo di fuoco dei ceri votivi da ${BASE.pyreDmg} danni, metà ai vicini; il bersaglio brucia e il pavimento arde. 45 mana.`),
  ability('frost', 'Dardo di brina', 'A', 'frost', `Lancio ${it(BASE.frostCast)} s: un dardo della laguna gelata da ${BASE.frostDmg} danni, e il bersaglio e chi gli sta entro 3 m rallentano del ${pct(1 - BASE.frostSlow)} per 6 s. 22 mana.`),
  ability('font', 'Acquasantiera gelata', 'A', 'frost', `L'acqua santa ghiaccia attorno a te: ${BASE.fontDmg} danni e chi è entro 5 m resta congelato sul posto ${BASE.fontRoot} s. 40 mana, recupero ${BASE.fontCd} s.`),
  ability('caligo', 'Caligo gelato', 'A', 'frost', `Il caligo, la nebbia gelata della laguna, davanti a te fino a ${BASE.caligoRange} m: ${BASE.caligoDmg} danni e chi colpisce rallenta del 60% per 5 s. 30 mana, recupero 6 s.`),
  ability('chain', 'Catena di saette', 'A', 'storm', `Lancio ${it(BASE.chainCast)} s: una saetta da ${BASE.chainDmg} danni che rimbalza su altri ${BASE.chainHops} nemici. 35 mana, recupero 5 s.`),
  ability('toll', 'Rintocco del campanile', 'A', 'storm', `Un fulmine dal campanile sul bersaglio: ${BASE.tollDmg} danni entro ${it(BASE.tollR)} m e storditi ${it(BASE.tollStun)} s. 45 mana, recupero 18 s.`),
  ability('leap', 'Balzo del sepolcro', 'A', 'bone', `Un balzo fino a 12 m sul nemico: ${BASE.leapDmg} danni entro ${BASE.leapR} m e un attimo di stordimento. 30 mana, recupero ${BASE.leapCd} s.`),
  ability('whirl', "Turbine d'ossa", 'A', 'bone', `Per ${BASE.whirlTime} s giri su te stesso con la clava, anche correndo: ${BASE.whirlDmg} danni ogni mezzo secondo entro 3 m, e paghi il 30% in meno dei colpi. 35 mana, recupero 10 s.`),
  ability('grace', 'Colpo di grazia', 'A', 'bone', `Un fendente a due mani davanti a te: ${BASE.graceDmg} danni, fino al triplo sui nemici già feriti. 20 mana, recupero ${BASE.graceCd} s.`),
  ability('charge', 'Carica del dannato', 'A', 'shadow', `Ti scagli sul nemico (4-20 m): ${BASE.chargeDmg} danni e stordito ${it(BASE.chargeStun)} s. Riempie la furia. Recupero ${BASE.chargeCd} s.`),
  // five a school: poison (Diablo's Witch Doctor and Necromancer, WoW's poisons), WoW's warlock drain, mage, shaman and paladin
  ability('plague', 'Nube di peste', 'A', 'plague', `Una nube pestilenziale sul bersaglio, larga ${it(BASE.plagueR)} m: ristagna ${BASE.plagueLife} s e corrode chi ci resta dentro (${BASE.plagueDps} danni al secondo). 25 mana, recupero ${BASE.plagueCd} s.`),
  ability('spit', 'Sputo di bile', 'A', 'plague', `Istantaneo: un grumo di bile velenosa da ${BASE.spitDmg} danni e una dose di veleno (${BASE.venomDps} danni al secondo per dose per 8 s, fino a ${BASE.venomMax} dosi). 18 mana.`),
  ability('untore', "Unguento dell'untore", 'A', 'plague', `Ungi il bersaglio: ${BASE.untoreDmg} danni e il suo veleno (almeno 2 dosi) passa a ogni nemico entro ${BASE.untoreR} m. 30 mana, recupero 10 s.`),
  ability('miasma', 'Fiato della fossa', 'A', 'plague', `Un anello di miasma esplode da te: ${BASE.miasmaDmg} danni e ${BASE.miasmaStacks} dosi di veleno a chi è entro ${BASE.miasmaR} m. 45 mana, recupero ${BASE.miasmaCd} s.`),
  ability('fever', 'Febbre di palude', 'A', 'plague', `Il bersaglio e chi gli sta entro ${BASE.feverR} m prendono il ${pct(BASE.feverK)} di danni in più da tutto per 12 s (la metà sui più forti). 30 mana, recupero 15 s.`),
  ability('drain', "Risucchio d'anima", 'A', 'shadow', `Canalizzato 3 s: strappi l'anima al bersaglio, ${BASE.drainDmg} danni ogni mezzo secondo, e ognuno ti cura del ${pct(BASE.drainHeal)}. 40 mana, recupero 8 s.`),
  ability('pillar', 'Colonna di fiamme', 'A', 'fire', `Lancio ${it(PILLAR_CAST)} s: una colonna di fuoco sotto il bersaglio, ${BASE.pillarDmg} danni entro ${it(BASE.pillarR)} m, chi c'è brucia e il pavimento arde. 50 mana, recupero 10 s.`),
  ability('cero', 'Cero funebre', 'A', 'fire', `Istantaneo: accendi un cero nel bersaglio, ${BASE.ceroDps} danni al secondo per 4 s, poi scoppia: ${BASE.ceroDmg} danni entro 4 m. 30 mana, recupero 3 s.`),
  ability('furnace', 'Fornace di Murano', 'A', 'fire', `Il soffio della fornace davanti a te, fino a ${BASE.furnaceRange} m: ${BASE.furnaceDmg} danni, chi colpisce brucia ed è stordito 2 s. 45 mana, recupero 14 s.`),
  ability('blizzard', 'Bufera di bora', 'A', 'frost', `Canalizzato 4 s: la bora gelida sul bersaglio, ${BASE.blizzardDmg} danni ogni mezzo secondo entro ${BASE.blizzardR} m e rallentati del 50%. 55 mana, recupero 12 s.`),
  ability('orb', 'Globo di brina', 'A', 'frost', `Un globo di ghiaccio che rotola per 15 m: ${BASE.orbDmg} danni ogni mezzo secondo a chi passa entro 3,5 m, rallentati, e alla fine scoppia. 50 mana, recupero 16 s.`),
  ability('shield', 'Scudo di saette', 'A', 'storm', `Per 20 s ${BASE.shieldOrbs} saette ti girano attorno: ognuna fulmina il primo nemico che ti arriva entro 3 m (${BASE.shieldDmg} danni). 40 mana, recupero 20 s.`),
  ability('rod', 'Parafulmine', 'A', 'storm', `Pianti un parafulmine ai tuoi piedi: per ${BASE.rodTime} s ogni secondo fulmina il nemico più vicino entro 9 m (${BASE.rodDmg} danni). 45 mana, recupero 18 s.`),
  ability('squall', 'Burrasca', 'A', 'storm', `Un colpo di tuono attorno a te: ${BASE.squallDmg} danni entro ${BASE.squallR} m e i nemici sbalzati via di 5 m (meno i più forti). 40 mana, recupero 15 s.`),
  ability('judge', 'Giudizio del Redentore', 'A', 'holy', `Istantaneo: un martello di luce sul bersaglio, ${BASE.judgeDmg} danni. 25 mana, recupero ${BASE.judgeCd} s.`),
  ability('hallow', 'Terra consacrata', 'A', 'holy', `Consacri il suolo attorno a te per 8 s: ${BASE.hallowDps} danni al secondo ai nemici entro ${BASE.hallowR} m, e finché ci stai sopra recuperi l'1% della salute al secondo. 40 mana, recupero 12 s.`),
  ability('hammer', 'Martello della penitenza', 'A', 'holy', `Istantaneo: un martello d'oro sul bersaglio, 30 danni e stordito ${BASE.hammerStun} s (molto meno sui più forti). 30 mana, recupero ${BASE.hammerCd} s.`),
  ability('bubble', 'Aureola del redento', 'A', 'holy', `Fuori dal tempo di recupero globale: per 5 s un'aureola ti rende immune a ogni danno. 60 mana, recupero ${BASE.bubbleCd} s.`),

  passive('dmg', 'Ossa più dure', '+8% a tutti i danni che infliggi.', 3, (t) => { t.dmg += 0.08; }),
  passive('hp', 'Carne di tomba', '+15% di salute massima (+192), e la recuperi subito.', 3, (t) => { t.hp += 0.15; }),
  passive('armor', 'Pelle di lapide', '−8% ai danni che subisci.', 2, (t) => { t.armor -= 0.08; }),
  passive('mana', "Pozzo d'anime", '+20% di mana massimo (+80).', 2, (t) => { t.mana += 0.2; }),
  passive('regen', 'Linfa nera', 'Rigenerazione del mana +1 al secondo (base 3).', 2, (t) => { t.regen += 1; }),
  passive('speed', 'Passo del morto', '+8% alla velocità di corsa.', 2, (t) => { t.speed += 0.08; }),
  passive('cdr', 'Gelo della cripta', '−10% ai tempi di recupero (non agli attacchi base).', 2, (t) => { t.cdr -= 0.1; }),
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
  mod('wisp', 'wisp_fast', 'Evocazione rapida', `Fuoco fatuo: si evoca all’istante (era ${it(BASE.wispCast)} s).`, 1, (t) => { t.wispCast = 0; }),
  mod('veil', 'veil_long', 'Velo più lungo', 'Velo spettrale: dura 8 s invece di 5.', 1, (t) => { t.veilTime = 8; }),
  mod('veil', 'veil_heal', 'Velo rigenerante', 'Velo spettrale: mentre dura ti cura del 3% della salute al secondo.', 1, (t) => { t.veilHeal = 0.03; }),
  mod('step', 'step_dmg', 'Passo lacerante', "Passo d'ombra: da 25 a 60 danni.", 1, (t) => { t.stepDmg = 60; }),
  mod('step', 'step_cd', 'Doppio passo', "Passo d'ombra: recupero da 12 a 7 s.", 1, (t) => { t.stepCd = 7; }),
  mod('strike', 'strike_dmg', 'Condanna', 'Sentenza del sepolcro: da 50 a 90 danni.', 1, (t) => { t.strikeDmg = 90; }),
  mod('nova', 'nova_big', 'Lamento profondo', 'Lamento della cripta: raggio da 6 a 8 m, danni da 20 a 35.', 1, (t) => { t.novaR = 8; t.novaDmg = 35; }),
  mod('ward', 'ward_long', 'Patto eterno', 'Patto della tomba: 7 s invece di 5, e alla fine ti cura del 15%.', 1, (t) => { t.wardTime = 7; t.wardHeal = 0.15; }),
  mod('potion', 'potion_big', 'Fiala capiente', 'Fiala di linfa tombale: ripristina il 45% invece del 30%.', 1, (t) => { t.potion = 0.45; }),
  mod('potion', 'potion_cd', 'Fiala rapida', 'Fiala di linfa tombale: recupero da 30 a 20 s.', 1, (t) => { t.potionCd = 20; }),
  mod('pyre', 'pyre_fast', 'Rogo rapido', `Rogo dell'eretico: lancio da ${it(BASE.pyreCast)} a 0,6 s.`, 1, (t) => { t.pyreCast = 0.6; }),
  mod('pyre', 'pyre_big', 'Pira', `Rogo dell'eretico: +50 danni (base ${BASE.pyreDmg}), schizzi e fiamme a terra da ${it(BASE.pyreR)} a 3,2 m.`, 1, (t) => { t.pyreDmg += 50; t.pyreR = 3.2; }),
  mod('frost', 'frost_deep', 'Brina profonda', `Dardo di brina: +15 danni (base ${BASE.frostDmg}) e rallenta del 70% invece del ${pct(1 - BASE.frostSlow)}.`, 1, (t) => { t.frostDmg += 15; t.frostSlow = 0.3; }),
  mod('frost', 'frost_fast', 'Dardo rapido', `Dardo di brina: lancio da ${it(BASE.frostCast)} a 0,5 s.`, 1, (t) => { t.frostCast = 0.5; }),
  mod('font', 'font_long', 'Gelo eterno', `Acquasantiera gelata: congela 6 s invece di ${BASE.fontRoot}.`, 1, (t) => { t.fontRoot = 6; }),
  mod('font', 'font_cd', 'Acquasantiera colma', `Acquasantiera gelata: recupero da ${BASE.fontCd} a 13 s.`, 1, (t) => { t.fontCd = 13; }),
  mod('caligo', 'caligo_big', 'Caligo fitto', `Caligo gelato: +20 danni (base ${BASE.caligoDmg}), arriva a 11 m.`, 1, (t) => { t.caligoDmg += 20; t.caligoRange = 11; }),
  mod('caligo', 'caligo_freeze', 'Caligo di gennaio', 'Caligo gelato: chi era già rallentato resta congelato sul posto 2 s.', 1, (t) => { t.caligoFreeze = true; }),
  // the base attacks but Caduta d'ossa (its four are above)
  ...baseMods('lance', 'Stiletto di ghiaccio', ['Stiletto affilato', 'Frantumi', 'Stiletto del bravo', 'Brina avida'], 'chi è congelato va in frantumi e le schegge colpiscono per metà chi gli sta entro 3 m.'),
  ...baseMods('thorn', 'Spina di peste', ['Spina marcia', 'Pustola', 'Spina del monatto', 'Spina avida']),
  ...baseMods('umbra', "Strale d'ombra", ['Strale affilato', 'Ombra che dilaga', 'Strale della bauta', 'Ombra avida']),
  ...baseMods('ember', 'Tizzone', ['Tizzone rovente', 'Brace sparsa', 'Tizzone del vetraio', 'Brace avida'], 'le braci schizzano più forte: metà dei danni a chi gli sta entro 2,5 m (era un terzo entro 2 m).'),
  ...baseMods('spark', 'Folgore', ['Folgore viva', 'Folgore biforcuta', 'Folgore del campanaro', 'Folgore avida']),
  ...baseMods('smite', 'Castigo', ['Castigo severo', 'Castigo diffuso', 'Castigo trino', 'Castigo grato']),
  mod('chain', 'chain_long', 'Catena lunga', `Catena di saette: rimbalza su 7 nemici invece di ${BASE.chainHops}.`, 1, (t) => { t.chainHops = 7; }),
  mod('chain', 'chain_fast', 'Saette rapide', `Catena di saette: lancio da ${it(BASE.chainCast)} a 0,5 s.`, 1, (t) => { t.chainCast = 0.5; }),
  mod('toll', 'toll_long', 'Rintocco funebre', `Rintocco del campanile: storditi 3,5 s invece di ${it(BASE.tollStun)}.`, 1, (t) => { t.tollStun = 3.5; }),
  mod('toll', 'toll_big', 'Campane a morto', `Rintocco del campanile: +35 danni (base ${BASE.tollDmg}), raggio da ${it(BASE.tollR)} a 4,5 m.`, 1, (t) => { t.tollDmg += 35; t.tollR = 4.5; }),
  mod('leap', 'leap_big', 'Balzo devastante', `Balzo del sepolcro: +35 danni (base ${BASE.leapDmg}), raggio da ${BASE.leapR} a 4 m.`, 1, (t) => { t.leapDmg += 35; t.leapR = 4; }),
  mod('leap', 'leap_cd', 'Balzo leggero', `Balzo del sepolcro: recupero da ${BASE.leapCd} a 7 s.`, 1, (t) => { t.leapCd = 7; }),
  mod('whirl', 'whirl_dmg', 'Turbine furioso', `Turbine d'ossa: +8 danni ogni mezzo secondo (base ${BASE.whirlDmg}).`, 1, (t) => { t.whirlDmg += 8; }),
  mod('whirl', 'whirl_long', 'Turbine lungo', `Turbine d'ossa: dura 4,5 s invece di ${BASE.whirlTime}.`, 1, (t) => { t.whirlTime = 4.5; }),
  mod('grace', 'grace_mul', 'Boia', 'Colpo di grazia: fino a 4,5 volte i danni sui nemici quasi morti (era il triplo).', 1, (t) => { t.graceMul = 3.5; }),
  mod('grace', 'grace_cd', 'Lama del boia', `Colpo di grazia: recupero da ${BASE.graceCd} a 3,5 s.`, 1, (t) => { t.graceCd = 3.5; }),
  mod('charge', 'charge_stun', 'Carica brutale', `Carica del dannato: +20 danni (base ${BASE.chargeDmg}), stordito 2,5 s invece di ${it(BASE.chargeStun)}.`, 1, (t) => { t.chargeDmg += 20; t.chargeStun = 2.5; }),
  mod('charge', 'charge_cd', 'Carica instancabile', `Carica del dannato: recupero da ${BASE.chargeCd} a 9 s.`, 1, (t) => { t.chargeCd = 9; }),
  mod('spit', 'spit_twin', 'Doppio sputo', 'Sputo di bile: due dosi di veleno a colpo invece di una.', 1, (t) => { t.spitStacks = 2; }),
  mod('untore', 'untore_far', 'Unzione diffusa', `Unguento dell'untore: il veleno passa entro 10 m (era ${BASE.untoreR}), +20 danni.`, 1, (t) => { t.untoreR = 10; t.untoreDmg += 20; }),
  mod('miasma', 'miasma_more', 'Fossa comune', `Fiato della fossa: 5 dosi di veleno invece di ${BASE.miasmaStacks}, recupero da ${BASE.miasmaCd} a 9 s.`, 1, (t) => { t.miasmaStacks = 5; t.miasmaCd = 9; }),
  mod('fever', 'fever_deep', 'Febbre terzana', `Febbre di palude: +35% di danni subiti invece del ${pct(BASE.feverK)}, entro 6 m.`, 1, (t) => { t.feverK = 0.35; t.feverR = 6; }),
  mod('drain', 'drain_deep', 'Sete del dannato', `Risucchio d'anima: +8 danni ogni mezzo secondo (base ${BASE.drainDmg}), e ognuno ti cura del 3%.`, 1, (t) => { t.drainDmg += 8; t.drainHeal = 0.03; }),
  mod('pillar', 'pillar_big', "Rogo del Sant'Uffizio", `Colonna di fiamme: +35 danni (base ${BASE.pillarDmg}), raggio da ${it(BASE.pillarR)} a 4,5 m.`, 1, (t) => { t.pillarDmg += 35; t.pillarR = 4.5; }),
  mod('cero', 'cero_chain', 'Processione', 'Cero funebre: lo scoppio accende un cero in due dei nemici che colpisce (i loro non si propagano).', 1, (t) => { t.ceroChain = true; }),
  mod('furnace', 'furnace_hot', 'Maestro vetraio', `Fornace di Murano: +30 danni (base ${BASE.furnaceDmg}), arriva a 11 m.`, 1, (t) => { t.furnaceDmg += 30; t.furnaceRange = 11; }),
  mod('blizzard', 'blizzard_big', 'Bora scura', `Bufera di bora: +6 danni ogni mezzo secondo (base ${BASE.blizzardDmg}), raggio da ${BASE.blizzardR} a 5,5 m.`, 1, (t) => { t.blizzardDmg += 6; t.blizzardR = 5.5; }),
  mod('orb', 'orb_slow', 'Globo pigro', `Globo di brina: rotola a 3,5 m/s invece di ${BASE.orbSpeed} (più colpi), +4 danni a colpo.`, 1, (t) => { t.orbSpeed = 3.5; t.orbDmg += 4; }),
  mod('shield', 'shield_more', 'Corona di saette', `Scudo di saette: 6 saette invece di ${BASE.shieldOrbs}, +10 danni.`, 1, (t) => { t.shieldOrbs = 6; t.shieldDmg += 10; }),
  mod('rod', 'rod_long', 'Parafulmine di San Marco', `Parafulmine: dura 18 s invece di ${BASE.rodTime} e fulmina ogni 0,7 s.`, 1, (t) => { t.rodTime = 18; t.rodEvery = 0.7; }),
  mod('squall', 'squall_big', 'Fortunale', `Burrasca: +25 danni (base ${BASE.squallDmg}), raggio da ${BASE.squallR} a 8 m.`, 1, (t) => { t.squallDmg += 25; t.squallR = 8; }),
  mod('judge', 'judge_dmg', 'Giudizio universale', `Giudizio del Redentore: +30 danni (base ${BASE.judgeDmg}), recupero da ${BASE.judgeCd} a 4,5 s.`, 1, (t) => { t.judgeDmg += 30; t.judgeCd = 4.5; }),
  mod('hallow', 'hallow_big', 'Sagrato', `Terra consacrata: raggio da ${BASE.hallowR} a 5,5 m, 20 danni al secondo.`, 1, (t) => { t.hallowR = 5.5; t.hallowDps = 20; }),
  mod('hammer', 'hammer_cd', 'Penitenza severa', `Martello della penitenza: recupero da ${BASE.hammerCd} a 20 s, stordito 5 s.`, 1, (t) => { t.hammerCd = 20; t.hammerStun = 5; }),
  mod('bubble', 'bubble_cd', 'Santità', `Aureola del redento: recupero da ${BASE.bubbleCd} a 80 s.`, 1, (t) => { t.bubbleCd = 80; }),
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
  { id: 'ossa_eterne', kind: 'filler', name: 'Ossa eterne', icon: 'dmg', max: Infinity, text: '+2% a tutti i danni che infliggi. Si ripete.', apply: (t) => { t.dmg += 0.02; } },
  { id: 'carne_eterna', kind: 'filler', name: 'Carne eterna', icon: 'hp', max: Infinity, text: '+4% di salute massima. Si ripete.', apply: (t) => { t.hp += 0.04; } },
];
export const CARD = new Map(CARDS.map((c) => [c.id, c]));
for (const c of CARDS) if (c.school) SCHOOL[c.id] = c.school;

const counter = (picks: readonly string[]) => {
  const n = new Map<string, number>();
  for (const p of picks) n.set(p, (n.get(p) ?? 0) + 1);
  return (id: string) => n.get(id) ?? 0;
};

/** The abilities of school `s` a slot holds: its five, the base attack apart. */
export const slotsOf = (s: School) => Object.keys(SCHOOL).filter((id) => SCHOOL[id] === s && !BASES.includes(id));

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

/** Cards that may still be offered after `picks` and the tomes' `learned`: not maxed nor owned, their ability owned, their needs met. */
export function eligible(picks: readonly string[], learned: readonly string[] = [], schools: readonly School[] = RISORTO): Card[] {
  const count = counter(picks), owned = tuneOf(picks, learned, schools).owned, owns = (a: string) => owned.includes(a);
  return CARDS.filter((c) => c.kind !== 'filler' && count(c.id) < c.max && (c.kind === 'ability' ? !owns(c.id) : !c.of || owns(c.of)) && (!c.needs || c.needs(count, owns)));
}

/** Odds a card is drawn from the hero's primary school, his secondary, everything else (cards of no school too). */
export const LEAN = [0.5, 0.3, 0.2];
/** Which of LEAN's shares a card falls in for a hero of `schools`: an upgrade goes with its ability's school. */
export const leanOf = (c: Card, schools: readonly School[]) => { const s = c.school ?? SCHOOL[c.of ?? '']; return s === schools[0] ? 0 : s === schools[1] ? 1 : 2; };

/**
 * The two cards for the next level-up (the one `picks.length + 2` reaches), each drawn from its kind's pool: a share
 * by LEAN (the empty ones' odds go to the rest), then evenly within it; the repeatable ones fill in when the pool runs
 * short. The card passed over goes back into the pool.
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
  } else if (lv % 2 === 0 && abilities.length) { // past 10: keep learning, or grow what is owned
    pick(abilities);
    pick(rnd() < 0.5 ? passives : mods);
  } else {
    const fusions = mods.filter((c) => c.kind === 'fusion');
    pick(fusions.length && rnd() < 0.5 ? fusions : mods);
    pick(passives);
  }
  pick(mods); // short: fill from the upgrades, then the heal
  pick(passives);
  pick(mods);
  pick(FILLERS);
  pick(FILLERS);
  return out.slice(0, 2);
}
const FILLERS = CARDS.filter((c) => c.kind === 'filler');

/** A merchant's tome: every ability of a school, for gold (ui/vendor.ts). The cost is per ability it would still teach:
 * four or five a school (Preghiera di suffragio, everyone's, aside), less what the hero's kit already gave. */
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
/** Gold a tome asks for each ability it teaches: a special costs more. */
export const TOME_PRICE = { A: 200, B: 350 } as const; // ~700 gold walking into the Reverendissimo, ~1200 after: Sacro (800) by then, the five-ability ones (1000-1300) a level-2 goal
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
