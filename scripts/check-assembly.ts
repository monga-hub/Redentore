import assert from 'node:assert/strict';
import { Bag, ITEM, roll, rollComponents, recoverItem } from '../src/loot/bag.ts';
import { Assembly, assemblyProgress } from '../src/loot/assembly.ts';
import { ARMOR_SLOTS, COMPONENTS, Equipment, STARTER, componentId, componentShop, shop, shop2, sell, buy, sellPrice, buyPrice } from '../src/loot/gear.ts';
import { HERO_IDS } from '../src/player/heroes.ts';
import { Quest, QUESTS } from '../src/quest/progress.ts';
import { SIDE } from '../src/quest/squero.ts';
import { World } from '../src/core/physics.ts';

const recipe = { chapter: 2, rarity: 'epico' } as const;
function ingredients(bag: Bag, n = 1) { for (const part of ARMOR_SLOTS) assert(bag.add(componentId(bag.hero!, recipe.chapter, recipe.rarity, part), n)); }
const encode = (b: Bag) => JSON.stringify(b.encode());
let outputs = 0;
for (const hero of HERO_IDS) for (const chapter of [1,2,3] as const) for (const rarity of ['comune','noncomune','raro','epico'] as const) for (let build=0;build<3;build++) {
  const bag = new Bag(); bag.hero = hero;
  for (const part of ARMOR_SLOTS) assert(bag.add(componentId(hero,chapter,rarity,part),2));
  const before = encode(bag), session = Assembly.begin(bag,{chapter,rarity})!;
  assert(session); assert.equal(Assembly.begin(bag,{chapter,rarity}),undefined);
  assert.equal(encode(bag),before); assert.equal(session.choices.length,3);
  assert(session.confirm('wrong'));
  assert.equal(encode(bag),before);
  const it = session.choices[build];
  assert.equal(session.confirm(it.id),'');
  assert(session.confirm(it.id)); assert.equal(bag.count(it.id),1);
  for (const part of ARMOR_SLOTS) assert.equal(bag.count(componentId(hero,chapter,rarity,part)),1);
  const equipment = new Equipment(hero); assert.equal(equipment.wear(bag,bag.items.findIndex(s=>s.id===it.id)),'');
  assert.equal(equipment.worn.abito,it.id); assert.equal(Object.keys(equipment.worn).length,2);
  const copy = new Bag(); copy.hero=hero; copy.decode(JSON.parse(encode(bag))); assert.equal(encode(copy),encode(bag));
  outputs++;
}
assert.equal(outputs,180);
const bag = new Bag(); bag.hero='fosca'; ingredients(bag,2);
let before = encode(bag), session = Assembly.begin(bag,recipe)!;
session.cancel(); assert.equal(encode(bag),before); assert(session.confirm(session.choices[0].id));
session = Assembly.begin(bag,recipe)!;
// Reload through serialized bag: pending UI is intentionally absent and has consumed nothing.
const reload = new Bag(); reload.hero='fosca'; reload.decode(JSON.parse(before));
assert.equal(encode(reload),before); const resumed = Assembly.begin(reload,recipe)!; assert(resumed); resumed.cancel();
bag.remove(session.ingredientIds[0]); before=encode(bag);
assert(session.confirm(session.choices[0].id)); assert.equal(encode(bag),before);
ingredients(bag);
// Full bag + stacked ingredients: consuming six leaves all stacks, output cannot fit.
while (bag.items.length<Bag.SLOTS) bag.items.push({id:'clava-osso',n:1});
before=encode(bag); session=Assembly.begin(bag,recipe)!;
assert(session.confirm(session.choices[0].id)); assert.equal(encode(bag),before); session.cancel();
// Full bag, six single ingredients: succeeds after consumption.
const full=new Bag(); full.hero='fosca'; ingredients(full);
while(full.items.length<Bag.SLOTS) full.items.push({id:'clava-osso',n:1});
session=Assembly.begin(full,recipe)!; assert.equal(session.confirm(session.choices[0].id),''); assert.equal(full.items.length,25);
// Overflow saves refuse without losing ingredients.
const overflow = new Bag(); overflow.hero='fosca'; ingredients(overflow,2);
while(overflow.items.length<35) overflow.items.push({id:'clava-osso',n:1});
before=encode(overflow); session=Assembly.begin(overflow,recipe)!; assert(session.confirm(session.choices[0].id)); assert.equal(encode(overflow),before); session.cancel();
// No inference of chapter/hero from legacy names, even complete matching armor.
const legacy=new Bag(); legacy.hero='risorto';
legacy.decode({gold:999999,items:[...Object.values(STARTER).map(id=>[id!,1] as [string,number]),['unknown-component',7]]});
recoverItem('unknown-component'); before=encode(legacy); assert.equal(assemblyProgress(legacy).length,0);
assert.equal(Assembly.begin(legacy,{chapter:1,rarity:'comune'}),undefined); assert.equal(encode(legacy),before);
// Saved chapter1 epic and huge gold cannot produce chapter2 epic on arrival, through refresh or buyback.
const boundary = new Bag(); boundary.hero='risorto'; boundary.gold=999999;
for(const part of ARMOR_SLOTS) boundary.add(componentId('risorto',1,'epico',part));
for(let refresh=0;refresh<3;refresh++) {
  const goods=componentShop('risorto',2); assert.equal(goods.length,18);
  assert(!goods.some(it=>it.rarity==='epico'||it.slot==='abito'));
  for(const it of goods) assert.equal(buy(boundary,it),'');
  assert.equal(Assembly.begin(boundary,recipe),undefined);
}
const epic=componentId('risorto',1,'epico','testa');
const sold=sell(boundary,boundary.items.findIndex(s=>s.id===epic),id=>ITEM.get(id))!;
assert.equal(buy(boundary,ITEM.get(epic)!,sold.gold),'');
assert.equal(Assembly.begin(boundary,recipe),undefined);
assert(boundary.count(epic)>0);
// Sell/buyback cannot mint either gold or components; ordinary purchase costs >= resale.
for(const it of COMPONENTS) assert(sellPrice(it)<=buyPrice(it));
for(const hero of HERO_IDS) for(const chapter of [1,2,3] as const) {
  const goods=chapter===2?shop2(hero):shop(chapter===3,hero);
  assert(goods.every(it=>it.slot!=='abito'&&(!it.component||(it.chapter===chapter&&it.rarity!=='epico'))));
}
// Quest completion remains one-time, with real XP/gold/flags and zero armor grants, even full bag.
const q=new Quest(new World()); const rewards=new Bag(); rewards.hero='fosca'; q.side.bag=rewards;
const armorFree=SIDE.filter(s=>['ferri','lumi','gastaldo','maestra','lettera','musici','incoronazione'].includes(s.id));
for(const side of armorFree) {
  assert.equal(side.reward,undefined); q.side.taken.push(side.id); q.side.steps[side.id]=99;
  const xp=q.bonusXp; assert(q.side.handIn(side)); assert.equal(q.bonusXp,xp+QUESTS[side.id].xp);
  assert(q.done.includes(side.id)); assert(!q.side.handIn(side)); assert.equal(rewards.items.length,0);
}
const done=JSON.stringify(q.side.encode()); q.side.decode(JSON.parse(done)); assert.equal(JSON.stringify(q.side.encode()),done);
// Production missing-part protection applies to every rarity/hero/chapter without increasing rarity.
for (const hero of HERO_IDS) for (const chapter of [1,2,3] as const) for (const rarity of ['comune','noncomune','raro','epico'] as const) {
  const present = new Bag(); present.hero=hero;
  for(const part of ARMOR_SLOTS.slice(0,5)) present.add(componentId(hero,chapter,rarity,part));
  const before=encode(present);
  const candidates=rollComponents('boss',()=>rarity === 'comune' ? .01 : rarity === 'noncomune' ? .4 : rarity === 'raro' ? .65 : .99,chapter,hero,present);
  assert.equal(candidates[0],componentId(hero,chapter,rarity,'piedi'));
  assert.equal(encode(present),before);
}
let seed=123;const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
for(const chapter of [1,2,3] as const) for(const tier of ['worker','friar','priest','elite','boss'] as const) for(let i=0;i<1000;i++) for(const id of roll(tier,rnd,chapter,'fosca').items) {
  const it=ITEM.get(id)!;assert(it.slot!=='abito');
  if(it.component){assert.equal(it.chapter,chapter);assert.equal(it.hero,'fosca');assert(!it.slot);}
}
console.log(`assembly ok: ${outputs} actual hero/chapter/rarity/build transactions + equip; cancel/stale/reload/doubleclick/full/overflow/legacy; vendor-refresh/sell-buyback/chapter boundary; quest one-time XP/flags; 15000 production drops`);
