// Levels check (`npm run check`): the 99 upgrade cards (every ability with a school and its modifiers, five abilities a school), the XP curve against the mobs' worth (first level after two friars, the quest
// route with the apiary, ~875 XP in scripts/balance.ts, level 9, a full clear level 11, no cap), the two-card offers over many random runs to level 30 (never an owned or maxed card,
// never a mod for a locked ability, new abilities on even levels with the specials from level 6, one past 10, fusions only
// with both parents, the offers leaning to the hero's schools by LEAN and even within each share), the repeatable cards when everything is taken, the
// replay of picks and tomes into numbers, the merchants' tomes, each hero's starting kit and base attack, the secondary school's base attack
// learnt with 3 of its 5, and the bar keeping a slot for an ability until it is unlocked, or finding one.
import { BASES, BASE_ATTACK, CARD, CARDS, LEAN, RISORTO, SCHOOL, SECOND_AT, SPECIALS, START, TOMES, TOME_PRICE, eligible, leanOf, levelOf, need, offer, slotsOf, startOf, tomeOf, tuneOf, type Card, type School } from '../src/player/levels.ts';
import { FRIAR, spawnGroups } from '../src/enemies/brain.ts';
import { APE, APETTA, PRIEST, REVERENDISSIMO, SACERDOTE } from '../src/enemies/caster.ts';
import { AbilitySystem, KEYS, POTION, PRIMARY, type Ability } from '../src/abilities/system.ts';
import { BAR, barOf } from '../src/abilities/forsaken.ts';
import { HEROES, HERO_IDS } from '../src/player/heroes.ts';
import { buildLevel } from '../src/level/index.ts';

const fail = (why: string) => { throw new Error(why); };

// Curve and budget. The kinds' counts are the spawn plans' (check-intro counts all 89 on the map).
if (need(1) !== 20 || need(2) !== 40) fail('curve');
const friars = spawnGroups(buildLevel().world).flat().length;
if (friars !== 32) fail(`${friars} friars`);
const full = friars * FRIAR.xp + 45 * PRIEST.xp + 7 * SACERDOTE.xp + APE.xp + 3 * APETTA.xp + REVERENDISSIMO.xp;
if (full !== 1145 || levelOf(full).lv !== 11) fail(`full clear ${full} XP is level ${levelOf(full).lv}, want 1145 / 11`);
if (levelOf(FRIAR.xp).lv !== 1 || levelOf(2 * FRIAR.xp).lv !== 2) fail('the first level must come with the second friar');
for (const [xp, lv] of [[560, 8], [720, 9], [875, 9], [900, 10], [19, 1], [20, 2], [2399, 15], [2400, 16], [3800, 20], [10 * 40 * 39, 40]]) if (levelOf(xp).lv !== lv) fail(`${xp} XP is level ${levelOf(xp).lv}, want ${lv}`);
const l = levelOf(70);
if (l.lv !== 3 || l.into !== 10 || l.next !== 60) fail(`levelOf(70) = ${JSON.stringify(l)}`);
if (levelOf(2400 + 5).next !== need(16) || levelOf(2400 + 5).into !== 5) fail('the curve stops at 16');
if (CARDS.filter((c) => c.kind !== 'ability' && c.kind !== 'filler').length !== 99) fail('99 upgrade cards');
// Five abilities a school, the starting ones counted, the base attacks and the potion apart; a base attack a school,
// each with four upgrades of Caduta d'ossa's shape (damage twice, reach, the third blow, mana back).
for (const school of ['bone', 'plague', 'shadow', 'fire', 'frost', 'storm', 'holy'] as School[]) {
  const of = [...START, ...CARDS.filter((c) => c.kind === 'ability').map((c) => c.id)].filter((id) => !BASES.includes(id) && SCHOOL[id] === school);
  if (of.length !== 5 || slotsOf(school).sort().join() !== of.sort().join()) fail(`${school}: ${of.length} abilities (${of}), want 5`);
  const base = BASE_ATTACK[school], mods = CARDS.filter((c) => c.kind === 'mod' && c.of === base);
  if (SCHOOL[base] !== school || CARD.get(base) || mods.length !== 4 || mods.reduce((n, c) => n + c.max, 0) !== 5) fail(`${school}'s base attack ${base}: ${mods.map((c) => c.id)}`);
}
// Every ability card has a school, an icon of its own and two modifiers; the new ten are offered from level 2.
const NEW = ['pyre', 'frost', 'font', 'caligo', 'chain', 'toll', 'leap', 'whirl', 'grace', 'charge'];
for (const c of CARDS.filter((c) => c.kind === 'ability')) {
  if (!c.school || SCHOOL[c.id] !== c.school) fail(`${c.id} has no school`);
  if (CARDS.filter((m) => m.kind === 'mod' && m.of === c.id).length < (NEW.includes(c.id) ? 2 : 1)) fail(`${c.id} lacks modifiers`);
}
for (const id of NEW) if (CARD.get(id)?.tier !== 'A') fail(`${id} must be a tier A ability`);

// Offers over many seeded runs, picking at random among the two, to level 30: the Risorto (and the one of older saves, who
// started with Nube di peste), Bortolo, a Peste-Sacro hero.
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const fusionsSeen = new Set<string>();
const HEROS: [readonly School[], string[]][] = [[RISORTO, []], [RISORTO, ['plague']], [['frost', 'storm'], ['frost', 'caligo']], [['plague', 'holy'], []]];
let stalled = 0;
const unlocks = (t: { owned: string[] }, start: string[]) => t.owned.filter((id) => !start.includes(id) && !BASES.includes(id)).length;
for (let run = 0; run < 600; run++) {
  const picks: string[] = [], [sc, kit] = HEROS[run % 4], start = tuneOf([], kit, sc).owned;
  for (let n = 0; n < 29; n++) {
    const lv = picks.length + 2, cards = offer(picks, rnd, kit, sc), ok = eligible(picks, kit, sc), t = tuneOf(picks, kit, sc);
    const count = (id: string) => picks.filter((p) => p === id).length;
    const ids = cards.map((c) => c.id).join();
    if (cards.length !== 2 || cards[0] === cards[1]) fail(`level ${lv}: offer ${ids}`);
    for (const c of cards) {
      if (c.kind === 'filler') continue;
      if (!ok.includes(c)) fail(`level ${lv}: ${c.id} offered but not eligible after ${picks}`);
      if (count(c.id) >= c.max) fail(`level ${lv}: maxed ${c.id} offered`);
      if (c.kind === 'ability' && t.owned.includes(c.id)) fail(`level ${lv}: owned ${c.id} offered`);
      if (c.kind === 'mod' && c.of && !t.owned.includes(c.of)) fail(`level ${lv}: ${c.id} for locked ${c.of}`);
      if (c.kind === 'mod' && BASES.includes(c.of!) && c.of !== BASE_ATTACK[sc[0]] && c.of !== BASE_ATTACK[sc[1]]) fail(`level ${lv}: ${c.id} for a base attack not ${sc}'s`);
      if (c.kind === 'fusion') fusionsSeen.add(c.id);
    }
    const abilities = ok.filter((c) => c.kind === 'ability'), kinds = cards.map((c) => c.kind);
    if (lv % 2 === 0 && lv <= 10) {
      const open = abilities.filter((c) => c.tier === 'A' || lv >= 6);
      if (kinds.filter((k) => k === 'ability').length !== Math.min(2, open.length)) fail(`level ${lv}: ${ids} with ${open.length} abilities open`);
      if (lv < 6 && cards.some((c) => c.tier === 'B')) fail(`level ${lv}: a special before level 6`);
      if ((lv === 6 || lv === 8) && abilities.some((c) => c.tier === 'B') && !cards.some((c) => c.tier === 'B')) fail(`level ${lv}: no special offered`);
    } else if (lv % 2 === 0 && abilities.length) {
      if (kinds.filter((k) => k === 'ability').length !== 1) fail(`level ${lv}: ${ids}, want one new ability past 10`);
    } else {
      if (kinds.includes('ability')) fail(`level ${lv}: an ability off the ability levels`);
      if (ok.some((c) => c.kind === 'passive') && !kinds.includes('passive')) fail(`level ${lv}: no passive in ${ids}`);
      if (ok.some((c) => c.kind === 'mod' || c.kind === 'fusion') && !kinds.some((k) => k === 'mod' || k === 'fusion')) fail(`level ${lv}: no modifier in ${ids}`);
    }
    picks.push(cards[Math.floor(rnd() * 2)].id);
    if (lv === 10 && unlocks(tuneOf(picks, kit, sc), start) !== 5) fail(`run ${run}: ${tuneOf(picks, kit, sc).owned} owned at level 10, want 5 unlocks`);
    const tt = tuneOf(picks, kit, sc), second = slotsOf(sc[1]).filter((id) => tt.owned.includes(id)).length >= SECOND_AT;
    if (tt.owned.includes(BASE_ATTACK[sc[1]]) !== second) fail(`run ${run}: ${sc[1]}'s base attack ${second ? 'not ' : ''}learnt with ${tt.owned}`);
  }
  const t = tuneOf(picks, kit, sc);
  if (unlocks(t, start) <= 5) stalled++; // a coin flip at each even level: 1 in 1024 runs never takes the ability
  if (t.fury === 0 && SPECIALS.some((s) => t.owned.includes(s))) fail('a special owned but the charge bar off');
}
if (stalled > 3) fail(`${stalled} runs learnt no ability past level 10`);
if (fusionsSeen.size !== 8) fail(`fusions offered: ${[...fusionsSeen]}`);
// The lean: an offer's first card comes from the hero's primary school, his secondary and the rest by LEAN, whatever was
// picked; within each share every card is as likely as any other, and off-school cards keep coming.
for (const [before, lv, sc] of [[['frost', 'dmg'], 4, RISORTO], [['chain', 'dmg'], 4, ['frost', 'storm']], [['frost', 'dmg', 'pyre', 'hp', 'nova', 'regen', 'caligo', 'mana', 'font', 'speed'], 12, RISORTO], [['dmg', 'hp'], 4, ['plague', 'holy']]] as const) {
  const seen = new Map<string, number>(), share = [0, 0, 0], N = 60000;
  for (let i = 0; i < N; i++) {
    const o = offer(before, rnd, [], sc);
    if (o[0].kind === 'ability') share[leanOf(o[0], sc)]++;
    for (const c of o) if (c.kind === 'ability') seen.set(c.id, (seen.get(c.id) ?? 0) + 1);
  }
  const open = eligible(before, [], sc).filter((c) => c.kind === 'ability' && (c.tier === 'A' || lv >= 6));
  if (seen.size !== open.length) fail(`level ${lv} after ${before}: abilities offered ${JSON.stringify([...seen])}`);
  const tot = share.reduce((a, b) => a + b, 0);
  if (share.some((k, i) => Math.abs(k / tot - LEAN[i]) > 0.015)) fail(`level ${lv} for ${sc}: shares ${share.map((k) => (k / tot).toFixed(3))}, want ${LEAN}`);
  for (let i = 0; i < 3; i++) {
    const n = open.filter((c) => leanOf(c, sc) === i).map((c) => seen.get(c.id) ?? 0);
    if (Math.max(...n) > 1.3 * Math.min(...n)) fail(`level ${lv} for ${sc}: share ${i} uneven ${n}`); // ~600 draws a card in the thinnest share: noise
  }
}
// A level-up mod pool leans too: Bortolo's Stiletto upgrades come up as his school's.
{
  let lance = 0, N = 20000;
  for (let i = 0; i < N; i++) if (offer(['dmg'], rnd, ['frost', 'caligo'], ['frost', 'storm']).some((c) => c.of === 'lance')) lance++;
  if (lance / N < 0.35) fail(`Bortolo's stiletto upgrades offered ${lance / N}`);
  for (let i = 0; i < 2000; i++) if (offer(['dmg'], rnd, [], RISORTO).some((c) => BASES.includes(c.of ?? '') && c.of !== 'fall')) fail('the Risorto offered another school\'s base attack upgrade');
}

// The secondary school's base attack: learnt with SECOND_AT of that school's five, by cards or tomes; its upgrades come
// with it (the Sacro's five count the heal everyone has); the primary school's own abilities never teach it.
{
  const owns = (picks: string[], learned: string[], sc: readonly School[], id: string) => tuneOf(picks, learned, sc).owned.includes(id);
  if (owns(['step', 'veil'], [], RISORTO, 'umbra') || !owns(['step', 'veil'], ['charge'], RISORTO, 'umbra') || !owns(['step', 'veil', 'drain'], [], RISORTO, 'umbra')) fail("the Risorto's Strale d'ombra at 3 of the Ombra's 5");
  if (eligible(['step', 'veil'], [], RISORTO).some((c) => c.of === 'umbra') || !eligible(['step', 'veil', 'drain'], [], RISORTO).some((c) => c.id === 'umbra_dmg')) fail("Strale d'ombra's upgrades come with it");
  if (owns([], ['chain', 'toll'], ['frost', 'storm'], 'spark') || !owns(['rod'], ['chain', 'toll'], ['frost', 'storm'], 'spark')) fail("Bortolo's Folgore at 3 of the Fulmine's 5");
  if (owns(['judge'], [], ['plague', 'holy'], 'smite') || !owns(['judge', 'hallow'], [], ['plague', 'holy'], 'smite')) fail('the Sacro counts the heal');
  if (owns(['leap', 'whirl', 'grace', 'nova', 'strike'], [], RISORTO, 'umbra') || owns(['frost', 'font', 'blizzard', 'orb'], ['caligo'], RISORTO, 'lance')) fail('a school not his secondary teaches its base attack');
  if (owns(['chain', 'toll', 'rod'], [], RISORTO, 'spark')) fail("the Fulmine's base attack for a hero not of it");
}

// Fusions need both parents; charge cards a special.
const has = (picks: string[], id: string) => eligible(picks).some((c) => c.id === id);
const hasL = (picks: string[], id: string) => eligible(picks, ['plague']).some((c) => c.id === id); // with the Nube di peste learnt
if (hasL(['wisp'], 'fx_wispplague') !== true || hasL([], 'fx_wispplague') || hasL(['step'], 'fx_wispplague') || has(['wisp'], 'fx_wispplague')) fail('Fuoco pestilente needs the wisp and the plague');
if (has([], 'fx_fallplague') || !has(['plague_dps'], 'fx_fallplague')) fail('Ossa appestate needs Peste virulenta');
if (has(['step'], 'fury') || has(['step'], 'fury_start') || !has(['nova'], 'fury')) fail('charge cards need a special');
if (has(['pyre'], 'fx_shatter') || has(['frost'], 'fx_shatter') || !has(['pyre', 'caligo'], 'fx_shatter') || !eligible(['pyre'], [], ['frost', 'storm']).some((c) => c.id === 'fx_shatter')) fail('Frantumazione needs fire and frost (Bortolo has his stiletto)');
if (!hasL(['chain'], 'fx_storm') || !hasL(['toll'], 'fx_storm') || hasL(['frost'], 'fx_storm') || has(['chain'], 'fx_storm')) fail('Miasma elettrico needs lightning and the plague');
if (has(['whirl'], 'fx_frostwhirl') || !has(['whirl', 'font'], 'fx_frostwhirl') || !has(['whirl', 'orb'], 'fx_frostwhirl')) fail('Turbine di brina needs the whirl and frost');
if (!has(['pyre', 'blizzard'], 'fx_shatter') || !hasL(['rod'], 'fx_storm')) fail('the new frost and lightning open the old fusions');
if (hasL([], 'fx_venomcloud') || !hasL(['spit'], 'fx_venomcloud') || !hasL(['miasma'], 'fx_venomcloud') || has(['spit'], 'fx_venomcloud')) fail('Miasma velenoso needs a poison and the plague');
if (has(['judge'], 'fx_holyfire') || has(['cero'], 'fx_holyfire') || !has(['judge', 'cero'], 'fx_holyfire')) fail('Giudizio ardente needs the judgment and fire');
if (has([], 'wisp_dps') || !has(['wisp'], 'wisp_dps') || !has([], 'potion_big')) fail('mods need their ability (the potion is owned)');

// Everything taken: two of the repeatable cards (the heal, the small damage and health ones), and they stack.
const all = CARDS.flatMap((c: Card) => (c.kind === 'filler' ? [] : Array(c.max).fill(c.id)));
if (eligible(all).length) fail('cards left after taking everything');
for (let i = 0; i < 50; i++) {
  const o = offer(all, rnd);
  if (o.length !== 2 || o[0] === o[1] || o.some((c) => c.kind !== 'filler')) fail(`exhausted offer ${o.map((c) => c.id)}`);
}
if (Math.abs(tuneOf(['ossa_eterne', 'ossa_eterne', 'ossa_eterne']).dmg - 1.06) > 1e-9 || Math.abs(tuneOf(['carne_eterna', 'carne_eterna']).hp - 1.08) > 1e-9) fail('repeatable cards do not stack');
// A run long past every finite card still gets two cards a level.
{
  const picks: string[] = [];
  for (let n = 0; n < 150; n++) { const o = offer(picks, rnd); if (o.length !== 2) fail(`level ${n + 2}: ${o.length} cards`); picks.push(o[0].id); }
}

// Tomes: each teaches every ability of its school not owned, priced per ability (specials dearer); together they teach every ability.
const learnable = CARDS.filter((c) => c.kind === 'ability').map((c) => c.id);
if (TOMES.flatMap((t) => tomeOf(t, START).teaches.map((c) => c.id)).sort().join() !== [...learnable].sort().join()) fail('the tomes do not teach every ability');
for (const t of TOMES) {
  const { teaches, price } = tomeOf(t, START);
  if (teaches.length < 4 || teaches.some((c) => c.school !== t.school) || price !== teaches.reduce((s, c) => s + TOME_PRICE[c.tier!], 0)) fail(`${t.name}: ${teaches.map((c) => c.id)} for ${price}`);
}
if (TOMES.length !== 7 || !TOMES.some((t) => t.school === 'plague') || !TOMES.some((t) => t.school === 'holy')) fail('a tome for every school, Peste and Sacro too');
const gelo = TOMES.find((t) => t.school === 'frost')!;
if (tomeOf(gelo, [...START, 'frost']).price !== tomeOf(gelo, START).price - TOME_PRICE.A || tomeOf(gelo, [...START, 'frost', 'font', 'caligo', 'blizzard', 'orb']).teaches.length) fail('a tome charges for what is known');
if (tomeOf(gelo, tuneOf([], HEROES.bortolo.kit, HEROES.bortolo.school).owned).price !== 600 || tomeOf(gelo, START).teaches.some((c) => BASES.includes(c.id))) fail('the Gelo tome: 600 to Bortolo, never a base attack');
// Learnt from a tome: owned, never offered again, its upgrades open, and the other schools still offered at the same odds.
const tomed = tuneOf(['dmg'], ['frost', 'font', 'caligo']);
if (!['frost', 'font', 'caligo'].every((id) => tomed.owned.includes(id)) || tuneOf([], ['hp', 'nope']).owned.join() !== START.join()) fail(`tome abilities owned: ${tomed.owned}`);
if (tuneOf(['frost'], ['frost']).owned.filter((id) => id === 'frost').length !== 1) fail('an ability picked and learnt counts once');
{
  const gelo = ['frost', 'font', 'caligo', 'blizzard', 'orb'], ok = eligible(['dmg'], gelo);
  if (ok.some((c) => c.school === 'frost') || !ok.some((c) => c.id === 'frost_fast') || !ok.some((c) => c.id === 'orb_slow') || !ok.some((c) => c.id === 'pyre')) fail('tome abilities in the offers');
  for (let i = 0; i < 500; i++) if (offer(['dmg'], rnd, gelo).some((c) => c.kind === 'ability' && c.school === 'frost')) fail('a learnt ability offered');
  if (has(['pyre'], 'fx_shatter') || !eligible(['pyre'], ['caligo']).some((c) => c.id === 'fx_shatter')) fail('a fusion needs a tome ability');
}

// Replay: numbers from picks, stacks past max and unknown ids ignored, order-free, survives JSON.
const t = tuneOf(['dmg', 'dmg', 'dmg', 'dmg', 'hp', 'plague_size', 'junk', 'nova', 'wisp_fast']);
if (Math.abs(t.dmg - 1.24) > 1e-9 || t.hp !== 1.15 || Math.abs(t.plagueR - 2.75) > 1e-9 || t.wispCast !== 0) fail(`tune ${JSON.stringify(t)}`);
if (t.owned.join() !== 'fall,mend,potion,nova' || t.fury !== 1) fail('owned / fury');
if (tuneOf([]).fury !== 0 || tuneOf([]).owned.join() !== START.join()) fail('the start');
const picks = ['veil', 'armor', 'strike', 'fury', 'ward', 'ward_long'];
if (JSON.stringify(tuneOf(JSON.parse(JSON.stringify(picks)))) !== JSON.stringify(tuneOf(picks))) fail('replay after JSON');
if (!CARD.get('linfa') || CARD.get('linfa')!.kind !== 'filler') fail('filler');

// The bar: a locked ability's slot stays its own, an unlock lands there even after the bar was rearranged.
const ab = (id: string): Ability => ({ id, name: id, icon: '', desc: '', cooldown: 1, fire: () => {} });
const sys = new AbilitySystem(['fall', 'plague', 'wisp', 'step'].map(ab), ['fall', 'plague', 'wisp', 'step'], { player: { pos: { x: 0, y: 0, z: 0 } } }, ['fall', 'plague']);
if (sys.slots[2] || sys.slots[3] || !sys.slots[0] || sys.tryCast(3)) fail('locked abilities shown');
sys.swap(1, 3); // plague dragged onto step's (empty-looking) slot
if (sys.slots[3]?.id !== 'plague' || sys.slots[1]) fail('drag onto a locked slot');
sys.unlock('step');
if (sys.slots[1]?.id !== 'step' || sys.slots[3]?.id !== 'plague' || sys.slots[0]?.id !== 'fall') fail(`unlock moved the bar: ${sys.layout().bar}`);
// More abilities than slots: an unlock takes the first slot that is empty or only remembers one not owned now.
const names = ['fall', 'plague', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'potion', 'new1', 'new2'];
const big = new AbilitySystem(names.map(ab), names.slice(0, 10), { player: { pos: { x: 0, y: 0, z: 0 } } }, ['fall', 'plague', 'potion']);
big.unlock('new1');
if (big.slots[2]?.id !== 'new1' || big.layout().bar.includes('a')) fail(`unlock without a slot: ${big.layout().bar}`);
big.unlock('a'); // its old slot went to new1: the next free one
if (big.slots[3]?.id !== 'a' || big.slots[2]?.id !== 'new1') fail(`re-placed: ${big.layout().bar}`);
// The starting bar (abilities/forsaken.ts BAR): the primary attack fixed on 0, the potion on 9, the kit on 1-2, each
// unlock on the next free slot, in the touch arc's thumb order (with the eight full, the rest wait in the book: `big` above).
if (BAR[PRIMARY] !== 'fall' || BAR[POTION] !== 'potion' || BAR.length !== KEYS.length) fail(`default bar ${BAR}`);
const later = ['nova', 'veil', 'strike', 'step', 'ward'];
const run = new AbilitySystem([...START, ...later].map(ab), BAR, { player: { pos: { x: 0, y: 0, z: 0 } } }, START);
for (const id of later) run.unlock(id);
if (run.layout().bar.join() !== ['fall', 'mend', ...later, null, null, 'potion'].join()) fail(`unlocks out of thumb order: ${run.layout().bar}`);
// Each hero's kit (player/heroes.ts): abilities of his own school, on a new game's bar between his school's base attack and the heal.
for (const id of HERO_IDS) {
  const h = HEROES[id], main = BASE_ATTACK[h.school[0]], b = barOf(h.kit, main);
  if (h.kit.some((a) => CARD.get(a)?.kind !== 'ability' || SCHOOL[a] !== h.school[0])) fail(`${id}'s kit ${h.kit} is not of his school`);
  if (b.length !== KEYS.length || b[PRIMARY] !== main || b[POTION] !== 'potion' || b.slice(1, 2 + h.kit.length).join() !== [...h.kit, 'mend'].join()) fail(`${id}'s bar ${b}`);
  if (tuneOf([], h.kit, h.school).owned.join() !== [...startOf(h.school), ...h.kit].join()) fail(`${id} starts with ${tuneOf([], h.kit, h.school).owned}`);
}
if (BASE_ATTACK[HEROES.risorto.school[0]] !== 'fall' || BASE_ATTACK[HEROES.bortolo.school[0]] !== 'lance' || BASE_ATTACK.plague !== 'thorn') fail('the Risorto swings Caduta d\'ossa, Bortolo throws the stiletto, the Peste has its own');
// The big button takes a base attack only: one learnt waits in the book for it (setMain), never on the eight.
{
  const mk = (id: string): Ability => ({ ...ab(id), main: BASES.includes(id) });
  const ids = ['lance', 'spark', 'frost', 'mend', 'potion', 'chain'], s2 = new AbilitySystem(ids.map(mk), barOf(['frost'], 'lance'), { player: { pos: { x: 0, y: 0, z: 0 } } }, ['lance', 'frost', 'mend', 'potion']);
  s2.unlock('spark', 'chain');
  if (s2.layout().bar.includes('spark') || !s2.layout().bar.includes('chain')) fail(`a base attack took a slot: ${s2.layout().bar}`);
  s2.equip('spark', 5);
  s2.setMain('chain');
  if (s2.slots[5] || s2.slots[PRIMARY]?.id !== 'lance') fail('a base attack equipped on the eight, or another on the big button');
  s2.setMain('spark');
  if (s2.slots[PRIMARY]?.id !== 'spark' || s2.layout().bar.includes('lance')) fail(`setMain: ${s2.layout().bar}`);
}
if (START.includes('plague') || !HEROES.bortolo.kit.includes('frost') || HEROES.risorto.kit.length) fail('the Risorto starts in Ossa alone, Bortolo in Gelo');
// A reload with a full bar and abilities waiting in the book (tomes): replaying them all keeps every slot where it was.
{
  const kept = ['fall', 'miasma', 'spit', 'fever', 'pillar', 'furnace', 'blizzard', 'squall', 'hallow', 'potion'], book = ['leap', 'whirl', 'grace', 'untore'];
  const ids = [...new Set([...START, ...kept, ...book])];
  const re = new AbilitySystem(ids.map(ab), kept, { player: { pos: { x: 0, y: 0, z: 0 } } }, START, ['plague', 'mend']);
  re.unlock(...book, ...kept);
  if (re.layout().bar.join() !== kept.join()) fail(`a reload scrambled the bar: ${re.layout().bar}`);
}
console.log(`levels ok (full clear ${full} XP = level ${levelOf(full).lv}, 600 runs to level 30 offered cleanly, offers leaning by school, ${TOMES.length} tomes)`);
