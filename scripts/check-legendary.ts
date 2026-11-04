import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Bag, ITEM, RARITY, recoverItem, roll, COMPONENT_TABLES, TABLES } from '../src/loot/bag.ts';
import { ARMOR_SLOTS, COMPONENTS, OUTFITS, Equipment, componentId, outfitChoices, outfitSelection, isLegendaryComponentReward, componentShop, shop, shop2, sell, buy, buyPrice, sellPrice, worth } from '../src/loot/gear.ts';
import { Assembly, assemblyProgress } from '../src/loot/assembly.ts';
import { HERO_IDS, type Hero } from '../src/player/heroes.ts';
import { wholeOutfitKey } from '../src/player/whole-outfit-key.ts';
import { buildsFor } from '../src/loot/builds.ts';
import { finishWholeMaterial } from '../src/player/whole-outfit-material.ts';
import { itemTip } from '../src/ui/tooltip.ts';
import { serialize, deserialize, valid, type Game } from '../src/core/save.ts';
import { Quest } from '../src/quest/progress.ts';
import { World } from '../src/core/physics.ts';

const recipe = { chapter: 3, rarity: 'leggendario' } as const;
const legendary = COMPONENTS.filter(it => it.rarity === recipe.rarity);
assert.equal(legendary.length, 30);
assert.equal(OUTFITS.filter(it => it.rarity === recipe.rarity).length, 15);
assert([...legendary, ...OUTFITS.filter(it => it.rarity === recipe.rarity)].every(it => it.chapter === 3));
const encode = (bag: Bag) => JSON.stringify(bag.encode());
function ingredients(hero: Hero, n = 1): Bag {
  const bag = new Bag(); bag.hero = hero;
  for (const part of ARMOR_SLOTS) assert(bag.add(componentId(hero, 3, 'leggendario', part), n));
  return bag;
}
function game(hero: Hero, bag = new Bag(), gear = new Equipment(hero)): Game {
  bag.hero = hero;
  return { hero, bag, gear, player: { pos: { x: 0, y: 0, z: 0 }, facing: 0 },
    stats: { hp: 1, mana: 1, hpMax: 10000, manaMax: 10000 }, kit: { charge: 0 },
    levels: { xp: 0, picks: [], learned: [], main: '', apply() {} },
    quest: new Quest(new World()), mobs: [], time: 0, fog: { encode: () => '', decode: () => true } };
}
for (const it of legendary) {
  assert.equal(ITEM.get(it.id), it); assert.equal(recoverItem(it.id), it); assert(!it.recovered);
  assert(isLegendaryComponentReward(it.id, it.hero!));
  assert(!isLegendaryComponentReward(it.id, HERO_IDS.find(h => h !== it.hero)!));
  assert(it.illustration && ITEM.has(it.illustration));
  assert.match(itemTip(it), /#ff8a1a/); assert.match(itemTip(it), /Leggendario/);
  assert(!it.slot); assert(Number.isFinite(sellPrice(it))); assert(sellPrice(it) <= buyPrice(it));
}
for (const id of ['unknown', 'pezzo-risorto-1-leggendario-testa', 'pezzo-risorto-2-leggendario-testa', componentId('risorto', 3, 'epico', 'testa'), outfitChoices('risorto', 3, 'leggendario')[0].id]) {
  assert(!isLegendaryComponentReward(id, 'risorto'));
}
let assemblies = 0;
for (const hero of HERO_IDS) {
  const choices = outfitChoices(hero, 3, 'leggendario');
  assert.equal(choices.length, 3); assert.equal(new Set(choices.map(it => JSON.stringify(it.stats))).size, 3);
  for (const choice of choices) {
    const bag = ingredients(hero, 2), gear = new Equipment(hero);
    // Bag snapshot roundtrip recognizes actual ingredients before any craft.
    const copy = new Bag(); copy.hero = hero; copy.decode(JSON.parse(encode(bag)));
    assert.equal(encode(copy), encode(bag));
    const session = Assembly.begin(copy, recipe)!; assert(session);
    const before = encode(copy); assert(session.confirm(gear.worn.abito!)); assert.equal(encode(copy), before);
    assert.equal(session.confirm(choice.id), ''); assert(session.confirm(choice.id));
    for (const id of session.ingredientIds) assert.equal(copy.count(id), 1);
    // Compare with the same C3 epic build, then equip via the production transaction.
    const epic = outfitChoices(hero, 3, 'epico').find(it => it.build === choice.build)!;
    gear.decode({ abito: epic.id });
    assert.equal(gear.comparison(choice), epic);
    const tip = itemTip(choice, { worn: gear.comparison(choice), compact: true });
    assert.match(tip, /Leggendario/); assert.match(tip, /box worn/); assert.match(tip, /class="up"/);
    assert.equal(choice.ilvl, 46); assert.equal(choice.stats!.armatura, 281);
    assert.equal(epic.stats!.armatura, 231);
    assert(worth(choice) > worth(epic) && worth(choice) < worth(epic) * 1.3);
    assert.deepEqual(Object.keys(choice.stats!), Object.keys(epic.stats!));
    for (const [stat, value] of Object.entries(choice.stats!)) assert(Number.isFinite(value) && value >= epic.stats![stat as keyof typeof epic.stats]!);
    assert.equal(gear.wear(copy, copy.items.findIndex(s => s.id === choice.id)), '');
    const snapshot = JSON.parse(JSON.stringify(serialize(game(hero, copy, gear)))); assert(valid(snapshot));
    const restored = game(hero); deserialize(restored, snapshot);
    assert.deepEqual(restored.bag.encode(), copy.encode()); assert.deepEqual(restored.gear.encode(), gear.encode());
    assert.deepEqual(restored.gear.totals, gear.totals);
    const selection = outfitSelection(hero, restored.gear.worn);
    const key = wholeOutfitKey(hero, selection)!; assert(key); assert.equal(key.finish, 'epic');
    if (hero === 'fosca') {
      assert.equal(key.tier, undefined, 'Legendary retains its historical source while the new chapter pilot replaces epic');
      assert.equal(key.world, [2, 1, 3][buildsFor(hero).findIndex(b => b.id === selection.build)]);
    } else assert.deepEqual(key, wholeOutfitKey(hero, { ...selection, rarity: 'epico' }));
    const material = new THREE.MeshStandardMaterial(); finishWholeMaterial(material, selection);
    const shader = { fragmentShader: '#include <color_fragment>\n#include <roughnessmap_fragment>', vertexShader: '', uniforms: {} };
    material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    assert.match(shader.fragmentShader, /outfitCloth/); assert(!shader.fragmentShader.includes('undefined'));
    assemblies++;
  }
  // A single incompatible replacement cannot satisfy a legendary recipe.
  for (const wrong of [componentId(hero, 2, 'epico', 'testa'), componentId(hero, 3, 'epico', 'testa'), componentId(HERO_IDS.find(h => h !== hero)!, 3, 'leggendario', 'testa')]) {
    const bag = ingredients(hero); bag.remove(componentId(hero, 3, 'leggendario', 'testa')); bag.add(wrong);
    const before = encode(bag); assert.equal(Assembly.begin(bag, recipe), undefined); assert.equal(encode(bag), before);
  }
  for (const chapter of [1, 2, 3] as const) {
    assert(componentShop(hero, chapter).every(it => it.rarity !== 'leggendario'));
    assert((chapter === 2 ? shop2(hero) : shop(chapter === 3, hero)).every(it => it.rarity !== 'leggendario'));
  }
}
assert.equal(assemblies, 15);
for (const mode of ['cancel', 'stale', 'full', 'single-full'] as const) {
  const bag = ingredients('risorto', mode === 'single-full' ? 1 : 2);
  if (mode.includes('full')) while (bag.items.length < Bag.SLOTS) bag.items.push({ id: 'clava-osso', n: 1 });
  const session = Assembly.begin(bag, recipe)!;
  if (mode === 'cancel') session.cancel();
  if (mode === 'stale') bag.remove(session.ingredientIds[0]);
  const before = encode(bag), error = session.confirm(session.choices[0].id);
  if (mode === 'single-full') { assert.equal(error, ''); assert.equal(bag.items.length, 25); }
  else { assert(error); assert.equal(encode(bag), before); }
  session.cancel();
}
const mixed = ingredients('risorto', 47); // Three stacks per type, all counts survive.
mixed.decode({ gold: 123, items: [...mixed.encode().items, ['future-legendary', 83], ['mitria', 2]] });
const before = encode(mixed); const copy = new Bag(); copy.decode(JSON.parse(before)); assert.equal(encode(copy), before);
const sorted = ingredients('risorto'); sorted.add(componentId('risorto', 3, 'epico', 'testa'));
assert.deepEqual(assemblyProgress(sorted).map(p => p.rarity), ['epico', 'leggendario']);
const trade = ingredients('risorto'); const id = trade.items[0].id;
const sold = sell(trade, 0, id => ITEM.get(id))!; assert.equal(trade.count(id), 0);
assert.equal(buy(trade, ITEM.get(id)!, sold.gold), ''); assert.equal(trade.count(id), 1); assert.equal(trade.gold, 0);
assert.equal(RARITY.leggendario.color, '#ff8a1a');
for (const table of Object.values(COMPONENT_TABLES)) assert.equal(table.weights.leggendario, undefined);
for (const table of Object.values(TABLES)) { assert.equal(table.weights.leggendario, undefined); assert.equal(table.gear.weights.leggendario, undefined); }
assert.deepEqual(COMPONENT_TABLES.priest.weights, { comune: 28, noncomune: 30, raro: 30, epico: 12 });
let seed = 723; const rnd = () => (seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296;
for (const hero of HERO_IDS) for (const chapter of [1, 2, 3] as const) for (const tier of ['worker', 'friar', 'priest', 'elite', 'boss'] as const) for (let n = 0; n < 100; n++) {
  for (const id of roll(tier, rnd, chapter, hero).items) assert(!isLegendaryComponentReward(id, hero));
}
console.log('legendary ok: 30 canonical ingredients, 15 actual craft/equip/game-save roundtrips; all build shaders/epic master keys; orange compact comparison; invalid/mixed recipes; cancel/stale/full atomicity; lossless old/unknown data; sale/buyback; no shop/drop leakage');
