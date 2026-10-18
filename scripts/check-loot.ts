// Loot check (`npm run check`): every tier's drops fall in its gold range and name real items, the
// boss always yields the nail and showers gold; the bag stacks by id, refuses what does not fit and round-trips.
import { Bag, ITEM, ITEMS, RARITY, TABLES, roll, type Tier } from '../src/loot/bag.ts';

const fail = (why: string) => { throw new Error(why); };
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

if (new Set(ITEMS.map((i) => i.id)).size !== ITEMS.length || ITEMS.some((i) => !RARITY[i.rarity] || !i.name || !i.lore)) fail('item table malformed');
const mean: Record<string, number> = {};
for (const tier of Object.keys(TABLES) as Tier[]) {
  const [lo, hi] = TABLES[tier].gold;
  let gold = 0, items = 0;
  for (let i = 0; i < 2000; i++) {
    const d = roll(tier, rnd);
    if (d.gold.length !== TABLES[tier].piles || d.gold.some((g) => g < lo || g > hi || !Number.isInteger(g))) fail(`${tier} gold ${d.gold}`);
    if (d.items.some((id) => !ITEM.has(id))) fail(`${tier} dropped unknown ${d.items}`);
    if (tier !== 'boss' && d.items.includes('chiodo')) fail(`${tier} dropped the boss prize`);
    if (tier === 'boss' && d.items[0] !== 'chiodo') fail('boss without the nail');
    gold += d.gold.reduce((s, g) => s + g, 0);
    items += d.items.length;
  }
  mean[tier] = gold / 2000;
  if (tier === 'friar' && (items < 150 || items > 450)) fail(`friars dropped ${items} items in 2000`);
}
if (!(mean.worker < mean.friar && mean.friar < mean.priest && mean.priest < mean.elite && mean.elite * 5 < mean.boss)) fail(`gold by tier ${JSON.stringify(mean)}`);

const bag = new Bag();
if (!bag.add('falange', 25) || bag.items.length !== 2 || bag.items[0].n !== Bag.STACK || bag.count('falange') !== 25) fail('stacking');
if (bag.add('nope') || bag.add('falange', 0)) fail('junk added');
for (let i = 2; i < Bag.SLOTS; i++) bag.add(ITEMS[i % ITEMS.length].id === 'falange' ? 'chiodo' : ITEMS[i % ITEMS.length].id, Bag.STACK);
if (bag.items.length !== Bag.SLOTS) fail(`${bag.items.length} slots used`);
if (bag.add('teschio-cera', Bag.STACK + 1) || !bag.add('falange', Bag.STACK - 5) || bag.add('falange')) fail('full bag accepted or refused wrongly');
if (!bag.remove('falange', 21) || bag.count('falange') !== 19 || bag.remove('falange', 20)) fail('remove');
bag.gold = 1234;
const back = new Bag();
back.decode(JSON.parse(JSON.stringify(bag.encode())));
if (back.gold !== 1234 || JSON.stringify(back.encode()) !== JSON.stringify(bag.encode())) fail('bag round-trip');
back.decode({ gold: -5, items: [['from_the_future', 3], ['mozzicone', 2]] });
if (back.gold !== 0 || back.items.length !== 1 || back.count('mozzicone') !== 2) fail('unknown ids or negative gold kept');
console.log(`loot ok: gold per kill ${Object.entries(mean).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}`);
