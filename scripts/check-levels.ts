// Levels check (`npm run check`): the 75 upgrade cards (every ability with a school and its modifiers, five abilities a school), the XP curve against the mobs' worth (first level after two friars, the quest
// route with the apiary, ~875 XP in scripts/balance.ts, level 9, a full clear level 11, no cap), the two-card offers over many random runs to level 30 (never an owned or maxed card,
// never a mod for a locked ability, new abilities on even levels with the specials from level 6, one past 10, fusions only
// with both parents, every ability as likely as any other whatever was picked), the repeatable cards when everything is taken, the
// replay of picks and tomes into numbers, the merchants' tomes, and the bar keeping a slot for an ability until it is unlocked, or finding one.
import { CARD, CARDS, SCHOOL, SPECIALS, START, TOMES, TOME_PRICE, eligible, levelOf, need, offer, tomeOf, tuneOf, type Card } from '../src/player/levels.ts';
import { FRIAR, spawnGroups } from '../src/enemies/brain.ts';
import { APE, APETTA, PRIEST, REVERENDISSIMO, SACERDOTE } from '../src/enemies/caster.ts';
import { AbilitySystem, KEYS, POTION, PRIMARY, type Ability } from '../src/abilities/system.ts';
import { BAR } from '../src/abilities/forsaken.ts';
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
if (CARDS.filter((c) => c.kind !== 'ability' && c.kind !== 'filler').length !== 75) fail('75 upgrade cards');
// Five abilities a school, the starting ones counted, the primary attack (Caduta d'ossa) and the potion apart.
for (const school of ['bone', 'plague', 'shadow', 'fire', 'frost', 'storm', 'holy']) {
  const of = [...START, ...CARDS.filter((c) => c.kind === 'ability').map((c) => c.id)].filter((id) => id !== 'fall' && SCHOOL[id] === school);
  if (of.length !== 5) fail(`${school}: ${of.length} abilities (${of}), want 5`);
}
// Every ability card has a school, an icon of its own and two modifiers; the new ten are offered from level 2.
const NEW = ['pyre', 'frost', 'font', 'lance', 'chain', 'toll', 'leap', 'whirl', 'grace', 'charge'];
for (const c of CARDS.filter((c) => c.kind === 'ability')) {
  if (!c.school || SCHOOL[c.id] !== c.school) fail(`${c.id} has no school`);
  if (CARDS.filter((m) => m.kind === 'mod' && m.of === c.id).length < (NEW.includes(c.id) ? 2 : 1)) fail(`${c.id} lacks modifiers`);
}
for (const id of NEW) if (CARD.get(id)?.tier !== 'A') fail(`${id} must be a tier A ability`);

// Offers over many seeded runs, picking at random among the two, to level 30.
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const fusionsSeen = new Set<string>();
for (let run = 0; run < 400; run++) {
  const picks: string[] = [];
  for (let n = 0; n < 29; n++) {
    const lv = picks.length + 2, cards = offer(picks, rnd), ok = eligible(picks), t = tuneOf(picks);
    const count = (id: string) => picks.filter((p) => p === id).length;
    const ids = cards.map((c) => c.id).join();
    if (cards.length !== 2 || cards[0] === cards[1]) fail(`level ${lv}: offer ${ids}`);
    for (const c of cards) {
      if (c.kind === 'filler') continue;
      if (!ok.includes(c)) fail(`level ${lv}: ${c.id} offered but not eligible after ${picks}`);
      if (count(c.id) >= c.max) fail(`level ${lv}: maxed ${c.id} offered`);
      if (c.kind === 'ability' && t.owned.includes(c.id)) fail(`level ${lv}: owned ${c.id} offered`);
      if (c.kind === 'mod' && c.of && !t.owned.includes(c.of)) fail(`level ${lv}: ${c.id} for locked ${c.of}`);
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
    if (lv === 10 && tuneOf(picks).owned.length !== START.length + 5) fail(`run ${run}: ${tuneOf(picks).owned} owned at level 10, want 5 unlocks`);
  }
  const t = tuneOf(picks);
  if (t.owned.length <= START.length + 5) fail(`run ${run}: no ability learnt past level 10`);
  if (t.fury === 0 && SPECIALS.some((s) => t.owned.includes(s))) fail('a special owned but the charge bar off');
}
if (fusionsSeen.size !== 8) fail(`fusions offered: ${[...fusionsSeen]}`);
// No lean: whatever was picked, every ability still to learn is as likely as any other, at 4 and past 10 alike.
for (const [before, lv] of [[['frost', 'dmg'], 4], [['chain', 'dmg'], 4], [['frost', 'dmg', 'pyre', 'hp', 'nova', 'regen', 'lance', 'mana', 'font', 'speed'], 12]] as const) {
  const seen = new Map<string, number>(), N = 20000;
  for (let i = 0; i < N; i++) for (const c of offer(before, rnd)) if (c.kind === 'ability') seen.set(c.id, (seen.get(c.id) ?? 0) + 1);
  const open = eligible(before).filter((c) => c.kind === 'ability' && (c.tier === 'A' || lv >= 6)), n = open.map((c) => seen.get(c.id) ?? 0);
  if (seen.size !== open.length || Math.max(...n) > 1.15 * Math.min(...n)) fail(`level ${lv} after ${before}: abilities offered ${JSON.stringify([...seen])}`);
}

// Fusions need both parents; charge cards a special.
const has = (picks: string[], id: string) => eligible(picks).some((c) => c.id === id);
if (has(['wisp'], 'fx_wispplague') !== true || has([], 'fx_wispplague') || has(['step'], 'fx_wispplague')) fail('Fuoco pestilente needs the wisp');
if (has([], 'fx_fallplague') || !has(['plague_dps'], 'fx_fallplague')) fail('Ossa appestate needs Peste virulenta');
if (has(['step'], 'fury') || has(['step'], 'fury_start') || !has(['nova'], 'fury')) fail('charge cards need a special');
if (has(['pyre'], 'fx_shatter') || has(['frost'], 'fx_shatter') || !has(['pyre', 'lance'], 'fx_shatter')) fail('Frantumazione needs fire and frost');
if (!has(['chain'], 'fx_storm') || !has(['toll'], 'fx_storm') || has(['frost'], 'fx_storm')) fail('Miasma elettrico needs lightning (plague is owned)');
if (has(['whirl'], 'fx_frostwhirl') || !has(['whirl', 'font'], 'fx_frostwhirl') || !has(['whirl', 'orb'], 'fx_frostwhirl')) fail('Turbine di brina needs the whirl and frost');
if (!has(['pyre', 'blizzard'], 'fx_shatter') || !has(['rod'], 'fx_storm')) fail('the new frost and lightning open the old fusions');
if (has([], 'fx_venomcloud') || !has(['spit'], 'fx_venomcloud') || !has(['miasma'], 'fx_venomcloud')) fail('Miasma velenoso needs a poison');
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
if (tomeOf(gelo, [...START, 'frost']).price !== tomeOf(gelo, START).price - TOME_PRICE.A || tomeOf(gelo, [...START, 'frost', 'font', 'lance', 'blizzard', 'orb']).teaches.length) fail('a tome charges for what is known');
// Learnt from a tome: owned, never offered again, its upgrades open, and the other schools still offered at the same odds.
const tomed = tuneOf(['dmg'], ['frost', 'font', 'lance']);
if (!['frost', 'font', 'lance'].every((id) => tomed.owned.includes(id)) || tuneOf([], ['hp', 'nope']).owned.join() !== START.join()) fail(`tome abilities owned: ${tomed.owned}`);
if (tuneOf(['frost'], ['frost']).owned.filter((id) => id === 'frost').length !== 1) fail('an ability picked and learnt counts once');
{
  const gelo = ['frost', 'font', 'lance', 'blizzard', 'orb'], ok = eligible(['dmg'], gelo);
  if (ok.some((c) => c.school === 'frost') || !ok.some((c) => c.id === 'frost_fast') || !ok.some((c) => c.id === 'orb_slow') || !ok.some((c) => c.id === 'pyre')) fail('tome abilities in the offers');
  for (let i = 0; i < 500; i++) if (offer(['dmg'], rnd, gelo).some((c) => c.kind === 'ability' && c.school === 'frost')) fail('a learnt ability offered');
  if (has(['pyre'], 'fx_shatter') || !eligible(['pyre'], ['lance']).some((c) => c.id === 'fx_shatter')) fail('a fusion needs a tome ability');
}

// Replay: numbers from picks, stacks past max and unknown ids ignored, order-free, survives JSON.
const t = tuneOf(['dmg', 'dmg', 'dmg', 'dmg', 'hp', 'plague_size', 'junk', 'nova', 'wisp_fast']);
if (Math.abs(t.dmg - 1.24) > 1e-9 || t.hp !== 1.15 || Math.abs(t.plagueR - 2.75) > 1e-9 || t.wispCast !== 0) fail(`tune ${JSON.stringify(t)}`);
if (t.owned.join() !== 'fall,plague,mend,potion,nova' || t.fury !== 1) fail('owned / fury');
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
if (run.layout().bar.join() !== ['fall', 'plague', 'mend', ...later, null, 'potion'].join()) fail(`unlocks out of thumb order: ${run.layout().bar}`);
// A reload with a full bar and abilities waiting in the book (tomes): replaying them all keeps every slot where it was.
{
  const kept = ['fall', 'miasma', 'spit', 'fever', 'pillar', 'furnace', 'blizzard', 'squall', 'hallow', 'potion'], book = ['leap', 'whirl', 'grace', 'untore'];
  const ids = [...new Set([...START, ...kept, ...book])];
  const re = new AbilitySystem(ids.map(ab), kept, { player: { pos: { x: 0, y: 0, z: 0 } } }, START, ['plague', 'mend']);
  re.unlock(...book, ...kept);
  if (re.layout().bar.join() !== kept.join()) fail(`a reload scrambled the bar: ${re.layout().bar}`);
}
console.log(`levels ok (full clear ${full} XP = level ${levelOf(full).lv}, 400 runs to level 30 offered cleanly, offers even, ${TOMES.length} tomes)`);
