// Loot check (`npm run check`): every tier's drops fall in its gold range and name real items, the
// boss always yields the nail and showers gold, gear drops get better by tier; the bag stacks by id
// (gear one per slot), refuses what does not fit and round-trips. Gear: the stat math, wearing from
// the bag (swapping), taking off, selling at a quarter, buying epics, crits, and the save of what is worn; and that every
// piece shows on the hero (player/outfit.ts), its files there.
import { BOSS3_PRIZE, Bag, ITEM, ITEMS, RARITY, RELIC, RELIC_PRIZE, TABLES, levelOfItem, roll, type Tier } from '../src/loot/bag.ts';
import { ARMOR_K, CRIT_BASE, Equipment, GEAR, SHOP, STARTER, shop, buy, buyPrice, crit, effects, sell, sellPrice, totals, worth } from '../src/loot/gear.ts';
import { existsSync } from 'node:fs';
import { DIR, LOOKS, PIECES, WEAPONS, lookOf } from '../src/player/outfit.ts';

const fail = (why: string) => { throw new Error(why); };
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

if (new Set(ITEMS.map((i) => i.id)).size !== ITEMS.length || ITEMS.some((i) => !RARITY[i.rarity] || !i.name || (!i.slot && !i.lore))) fail('item table malformed');
const gearRank: Record<string, number> = {};
const mean: Record<string, number> = {};
for (const tier of Object.keys(TABLES) as Tier[]) {
  const [lo, hi] = TABLES[tier].gold;
  let gold = 0, items = 0, pieces = 0, rank = 0;
  for (let i = 0; i < 2000; i++) {
    const d = roll(tier, rnd);
    if (d.gold.length !== TABLES[tier].piles || d.gold.some((g) => g < lo || g > hi || !Number.isInteger(g))) fail(`${tier} gold ${d.gold}`);
    if (d.items.some((id) => !ITEM.has(id))) fail(`${tier} dropped unknown ${d.items}`);
    if (tier !== 'boss' && d.items.includes('chiodo')) fail(`${tier} dropped the boss prize`);
    if (tier === 'boss' && d.items[0] !== 'chiodo') fail('boss without the nail');
    gold += d.gold.reduce((s, g) => s + g, 0);
    for (const id of d.items) if (ITEM.get(id)!.slot) { pieces++; rank += worth(ITEM.get(id)!); } else items++;
  }
  mean[tier] = gold / 2000;
  gearRank[tier] = rank / Math.max(pieces, 1);
  if (tier === 'elite' && pieces < 2000) fail(`elites dropped ${pieces} pieces in 2000`);
  if (tier === 'friar' && (items < 150 || items > 450)) fail(`friars dropped ${items} items in 2000`);
  if (tier === 'friar' && (pieces < 120 || pieces > 380)) fail(`friars dropped ${pieces} pieces in 2000`);
}
if (!(mean.worker < mean.friar && mean.friar < mean.priest && mean.priest < mean.elite && mean.elite * 5 < mean.boss)) fail(`gold by tier ${JSON.stringify(mean)}`);
if (!(gearRank.worker < gearRank.friar && gearRank.friar < gearRank.priest && gearRank.priest < gearRank.elite && gearRank.elite < gearRank.boss)) fail(`gear by tier ${JSON.stringify(gearRank)}`);

const bag = new Bag();
if (!bag.add('falange', 25) || bag.items.length !== 2 || bag.items[0].n !== Bag.STACK || bag.count('falange') !== 25) fail('stacking');
if (bag.add('nope') || bag.add('falange', 0)) fail('junk added');
const FLAVOUR = ITEMS.filter((i) => !i.slot);
for (let i = 2; i < Bag.SLOTS; i++) bag.add(FLAVOUR[i % FLAVOUR.length].id === 'falange' ? 'chiodo' : FLAVOUR[i % FLAVOUR.length].id, Bag.STACK);
if (bag.items.length !== Bag.SLOTS) fail(`${bag.items.length} slots used`);
if (bag.add('teschio-cera', Bag.STACK + 1) || !bag.add('falange', Bag.STACK - 5) || bag.add('falange')) fail('full bag accepted or refused wrongly');
if (!bag.remove('falange', 21) || bag.count('falange') !== 19 || bag.remove('falange', 20)) fail('remove');
bag.gold = 1234;
const back = new Bag();
back.decode(JSON.parse(JSON.stringify(bag.encode())));
if (back.gold !== 1234 || JSON.stringify(back.encode()) !== JSON.stringify(bag.encode())) fail('bag round-trip');
back.decode({ gold: -5, items: [['from_the_future', 3], ['mozzicone', 2]] });
if (back.gold !== 0 || back.items.length !== 1 || back.count('mozzicone') !== 2) fail('unknown ids or negative gold kept');
// --- gear ---
if (GEAR.some((g) => !g.slot || !g.stats || !Object.keys(g.stats).length) || shop(false).length !== 9 || shop(true).length !== 15 || shop(true).some((g) => g.l2) || SHOP.some((g) => g.rarity !== 'epico')) fail('gear table malformed');
if (Object.keys(STARTER).length !== 7 || STARTER.amuleto || STARTER.anello) fail('starter set');
const t = totals(['canapa-torso', 'saio-voto', 'nope', undefined]), hemp = ITEM.get('canapa-torso')!.stats!, torso = ITEM.get('saio-voto')!.stats!;
if (t.vigore !== hemp.vigore! + torso.vigore! || t.armatura !== hemp.armatura! + torso.armatura! || t.potenza !== torso.potenza) fail(`totals ${JSON.stringify(t)}`);
const e = effects({ ...t, armatura: ARMOR_K, critico: 5, celerita: 10, spirito: 10 });
if (e.cut !== 0.5 || e.crit !== CRIT_BASE + 5 || Math.abs(e.haste - 1.1) > 1e-9 || Math.abs(e.regen - 1) > 1e-9 || e.hp !== t.vigore * 10) fail(`effects ${JSON.stringify(e)}`);
if (crit(100, 10, () => 0.05) !== 150 || crit(100, 10, () => 0.5) !== 100 || Math.abs(crit(0.5, 10) - 0.525) > 1e-9) fail('crit');
if (buyPrice(ITEM.get('saio-voto')!) !== 480 || sellPrice(ITEM.get('saio-voto')!) !== 120 || sellPrice(ITEM.get('chiodo')!) !== 150) fail('prices');
const ep = (ids: string[]) => ids.reduce((s, id) => s + worth(ITEM.get(id)!), 0);
if (!(ep(Object.values(STARTER) as string[]) < ep(shop(false).map((g) => g.id)))) fail('epics not better than the starter set');
if (!(ep(shop(false).map((g) => g.id)) < ep(SHOP.filter((g) => g.l2).map((g) => g.id)))) fail("level 2's epics not better than level 1's");
// Level 3's epics (six slots) each beat level 2's in the same slot; the Abate's ring is legendary, his alone.
for (const g of SHOP.filter((x) => x.l3)) { const two = SHOP.find((x) => x.l2 && x.slot === g.slot)!; if (!(worth(g) > worth(two)) || g.ilvl! <= two.ilvl!) fail(`${g.id} not better than ${two.id}`); }
if (ITEM.get(BOSS3_PRIZE)?.rarity !== 'leggendario' || !ITEM.get(BOSS3_PRIZE)!.l3 || !roll('boss', Math.random, 3).items.includes(BOSS3_PRIZE)) fail("the Abate's ring");
for (const lv of [1, 2, 3] as const) for (let i = 0; i < 300; i++) for (const id of roll(lv === 3 && i % 2 ? 'boss' : 'elite', Math.random, lv).items) {
  const it = ITEM.get(id)!;
  if (levelOfItem(it) !== lv && it.slot) fail(`level ${lv} dropped ${id}`);
  if (id === BOSS3_PRIZE && (lv !== 3 || i % 2 === 0)) fail('the Abate\'s ring rolled off a table');
}

const gear = new Equipment(), bag2 = new Bag();
let changed = 0;
gear.onChange = () => changed++;
bag2.add('saio-voto');
bag2.add('saio-voto');
bag2.add('falange', 3);
if (bag2.items.length !== 3 || bag2.items[0].n !== 1) fail('gear stacked');
if (gear.wear(bag2, 0) || gear.worn.torso !== 'saio-voto' || bag2.items[0].id !== 'canapa-torso' || changed !== 1) fail('wear: no swap into the bag slot');
if (!gear.wear(bag2, 2) || changed !== 1) fail('wore a flavour item');
if (gear.takeOff(bag2, 'torso') || gear.worn.torso || bag2.count('saio-voto') !== 2) fail('take off');
if (gear.wear(bag2, 1) || gear.wear(bag2, bag2.items.findIndex((x) => x.id === 'canapa-torso')) || gear.worn.torso !== 'canapa-torso') fail('wear into an empty slot, then swap back');
const full = new Bag();
for (let i = 0; i < Bag.SLOTS; i++) full.add(GEAR[i % GEAR.length].id);
if (gear.takeOff(full, 'testa') !== 'La borsa è piena.' || gear.worn.testa !== 'canapa-testa') fail('took off into a full bag');
bag2.gold = 10;
const sold = sell(bag2, bag2.items.findIndex((x) => x.id === 'falange'), (id) => ITEM.get(id));
if (!sold || sold.n !== 3 || bag2.gold !== 10 + 3 * sellPrice(ITEM.get('falange')!) || bag2.count('falange')) fail('sell a stack');
if (buy(bag2, ITEM.get('pastorale')!) !== 'Non hai abbastanza oro.' || bag2.count('pastorale')) fail('bought without the gold');
bag2.gold = 1000;
if (buy(bag2, ITEM.get('pastorale')!) || bag2.gold !== 1000 - 624 || !bag2.count('pastorale')) fail('buy');
// Fra' Zuane's corona: no table rolls it, Fra' Bortolo won't buy it; nor does any table roll his medal, which is worn on the neck.
for (const t of Object.keys(TABLES) as Tier[]) for (const lv of [1, 2] as const) for (let i = 0; i < 2000; i++) if (roll(t, Math.random, lv).items.some((id) => id === RELIC || id === RELIC_PRIZE)) fail(`${t} rolled the corona or the medal`);
const rb = new Bag();
rb.add(RELIC);
if (sell(rb, 0, (id) => ITEM.get(id)) || !rb.count(RELIC)) fail('sold the corona');
if (ITEM.get(RELIC_PRIZE)?.slot !== 'amuleto' || !buyPrice(ITEM.get(RELIC_PRIZE)!)) fail('the medal is not a priced neck piece');
const g2 = new Equipment();
g2.decode(JSON.parse(JSON.stringify({ ...gear.encode(), anello: 'saio-voto', amuleto: 'from_the_future' })));
if (JSON.stringify(g2.encode()) !== JSON.stringify(gear.encode())) fail('gear round-trip keeps junk or loses pieces');

// What is worn shows: a model in the fist for every weapon, a look for every visible piece past the hemp (neck and ring don't show).
for (const g of GEAR) if (g.slot === 'arma' ? !WEAPONS[g.id] : g.slot !== 'amuleto' && g.slot !== 'anello' && g.rarity !== 'comune' && !lookOf(g.id)) fail(`${g.id} does not show on the hero`);
// Every look: the body painted anew (three maps), a helm and a pair of pauldrons; every weapon's model.
const model = (f: string) => existsSync(new URL(`../public/models/${f}`, import.meta.url));
for (const l of LOOKS) {
  for (const k of ['base', 'normal', 'orm']) if (!model(`${DIR}${l}-${k}.webp`)) fail(`${l} has no ${k} map`);
  for (const s of ['testa', 'spalle'] as const) if (!PIECES[`${l}-${s}`] || !model(`${DIR}${l}-${s}.glb`)) fail(`${l} has no ${s} piece`);
}
for (const [id, w] of Object.entries(WEAPONS)) if (!model(w.file)) fail(`${id}: no ${w.file}`);

console.log(`loot ok: gear worth by tier ${Object.entries(gearRank).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ')}; gold per kill ${Object.entries(mean).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}`);
