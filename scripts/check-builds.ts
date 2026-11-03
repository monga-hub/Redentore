import assert from 'node:assert/strict';
import { BUILDS, buildsFor } from '../src/loot/builds.ts';
import { BASES, CARD } from '../src/player/levels.ts';
import { HERO_IDS, HEROES } from '../src/player/heroes.ts';
import { SideQuests, SIDE_BY } from '../src/quest/squero.ts';
import { Bag, ITEM, roll, levelOfItem } from '../src/loot/bag.ts';
import { effects, Equipment, OUTFITS, ARMOR_SLOTS, STARTER, outfitChoices, outfitSelection, shop, shop2, buyPrice, sellPrice, sell, totals, worth } from '../src/loot/gear.ts';

assert.equal(BUILDS.length, 15);
for (const b of BUILDS) {
  assert(b.schools.every((s) => HEROES[b.hero].school.includes(s)));
  assert(b.spells.every((id) => BASES.includes(id) || CARD.has(id) || id === 'mend'));
}
assert.equal(new Set(OUTFITS.map((it) => `${it.build}:${it.chapter}`)).size, 45);
assert.equal(new Set(OUTFITS.map((it) => it.id)).size, OUTFITS.length);
for (const hero of HERO_IDS) {
  assert.equal(buildsFor(hero).length, 3);
  const gear = new Equipment(hero), bag = new Bag();
  bag.hero = hero;
  assert.equal(Object.keys(gear.worn).length, 2);
  for (const chapter of [1, 2, 3] as const) {
    const goods = chapter === 2 ? shop2(hero) : shop(chapter === 3, hero);
    for (const rarity of ['comune', 'noncomune', 'raro', 'epico'] as const) {
      const choices = outfitChoices(hero, chapter, rarity);
      assert.equal(choices.length, 3);
      assert.equal(new Set(choices.map((it) => JSON.stringify(it.stats))).size, 3);
      for (const it of choices) {
        if (rarity === 'noncomune' || rarity === 'epico') assert(goods.some((g) => g.id === it.id));
        assert.equal(levelOfItem(it), chapter);
        assert(it.stats!.intelletto! > 0 && it.stats!.spirito! > 0);
        if (chapter > 1) {
          const prev = outfitChoices(hero, (chapter - 1) as 1 | 2, rarity).find((x) => x.build === it.build)!;
          assert(buyPrice(it) > buyPrice(prev));
          assert(worth(it) > worth(prev));
        }
        assert(bag.add(it.id));
        const weapon = gear.worn.arma;
        assert.equal(gear.wear(bag, bag.items.findIndex((x) => x.id === it.id)), '');
        assert.equal(gear.worn.arma, weapon);
        assert.equal(gear.worn.abito, it.id);
        assert.deepEqual(outfitSelection(hero, gear.worn), { build: it.build, chapter, rarity, legacy: false });
        assert.equal(gear.totals.armatura, it.stats!.armatura);
        const e = effects(gear.totals);
        assert(e.physical > 1 || e.magic > 1);
        if (it.build === 'fosca-untora') assert(e.agilityHaste > 0);
        if (it.build === 'risorto-fossore') assert(e.strengthPower > 0);
        const copy = new Equipment(hero); copy.decode(JSON.parse(JSON.stringify(gear.encode())));
        assert.deepEqual(copy.encode(), gear.encode());
        assert.equal(gear.takeOff(bag, 'abito'), '');
        const idx = bag.items.findIndex((x) => x.id === it.id), before = bag.gold;
        assert.equal(sell(bag, idx, (id) => ITEM.get(id))!.gold, sellPrice(it));
        assert.equal(bag.gold, before + sellPrice(it));
      }
    }
    let seed = 17;
    const rnd = () => ((seed = seed * 16807 % 2147483647) / 2147483647), found = new Set<string>();
    for (let i = 0; i < 400; i++) for (const id of roll('elite', rnd, chapter, hero).items) {
      const it = ITEM.get(id)!;
      if (!it.slot) continue;
      assert(!ARMOR_SLOTS.includes(it.slot as typeof ARMOR_SLOTS[number]));
      if (it.build) { assert.equal(it.hero, hero); assert.equal(it.chapter, chapter); found.add(it.build); }
    }
    assert.equal(found.size, 3);
  }
  const other = OUTFITS.find((it) => it.hero !== hero)!;
  bag.add(other.id);
  const before = JSON.stringify([gear.encode(), bag.encode()]);
  assert(gear.wear(bag, bag.items.findIndex((x) => x.id === other.id)));
  assert.equal(JSON.stringify([gear.encode(), bag.encode()]), before);
}

// Mixed legacy loadout: exact records and value survive twice, including a future id.
const gear = new Equipment('risorto'), bag = new Bag();
const mixed = { ...STARTER, testa: 'mitria', torso: 'saio-voto', amuleto: 'ruta-oro', anello: 'anello-1576' };
gear.decode(mixed);
bag.decode({ gold: 12345, items: [['canapa-mani', 1], ['future-gear', 3], ['falange', 19]] });
const oldStats = totals(Object.values(mixed));
assert.deepEqual(gear.totals, oldStats);
for (let i = 0; i < 2; i++) {
  const old = JSON.stringify([gear.encode(), bag.encode()]);
  gear.decode(JSON.parse(JSON.stringify(gear.encode()))); bag.decode(JSON.parse(JSON.stringify(bag.encode())));
  assert.equal(JSON.stringify([gear.encode(), bag.encode()]), old);
}
assert.equal(sell(bag, 1, (id) => ITEM.get(id)), undefined);
const outfit = outfitChoices('risorto', 1)[1];
bag.add(outfit.id);
while (bag.items.length < Bag.SLOTS) bag.add('saio-voto');
const full = JSON.stringify([gear.encode(), bag.encode()]);
assert.match(gear.wear(bag, 3), /spazio/);
assert.equal(JSON.stringify([gear.encode(), bag.encode()]), full);
bag.items.splice(4, 6);
const n = bag.count('mitria');
assert.equal(gear.wear(bag, 3), '');
assert.equal(bag.count('mitria'), n + 1);
assert(ARMOR_SLOTS.every((slot) => !gear.worn[slot]));
assert.equal(gear.worn.amuleto, 'ruta-oro'); assert.equal(gear.worn.anello, 'anello-1576');
assert.equal(bag.gold, 12345);
const reloaded = new Equipment('risorto'); reloaded.decode(gear.encode());
assert.deepEqual(reloaded.encode(), gear.encode());
const unknown = new Equipment('risorto'); unknown.decode({ torso: 'future-armor' });
assert.deepEqual(unknown.encode(), { torso: 'future-armor' });
assert.equal(unknown.totals.armatura, 0);
console.log('builds ok: 15 families, 45 chapter definitions, hero shops/drops, atomic legacy swap and lossless round trips');

// Existing dialogue choice path consumes one eligible reward and preserves the other two as choices only.
const side = new SideQuests();
const rewards = new Bag(); rewards.hero = 'fosca'; side.bag = rewards;
const quest = [...SIDE_BY.values()].find((q) => q.reward === 'busto-broccato')!;
const options = side.rewardChoices(quest);
assert.equal(options.length, 3);
assert(options.every((it) => it.hero === 'fosca' && it.chapter === 2 && it.rarity === 'epico'));
const untouched = JSON.stringify(rewards.encode());
assert.equal(side.handIn(quest, 'wrong-hero-reward'), false);
assert.equal(JSON.stringify(rewards.encode()), untouched);

side.taken.push(quest.id);
assert(side.handIn(quest, options[2].id));
assert.equal(rewards.count(options[2].id), 1);
assert.equal(rewards.count(options[0].id), 0);
assert.equal(side.handIn(quest, options[2].id), false);
assert.equal(rewards.count(options[2].id), 1);
