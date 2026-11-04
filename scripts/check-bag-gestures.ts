import assert from 'node:assert/strict';
import { Bag, ITEM } from '../src/loot/bag.ts';
import { ARMOR_SLOTS, Equipment, outfitChoices } from '../src/loot/gear.ts';
import { itemTip } from '../src/ui/tooltip.ts';

const bag = new Bag(), gear = new Equipment('zanetto');
const outfits = (['comune', 'raro', 'epico'] as const).map(r => outfitChoices('zanetto', 3, r)[0]);
bag.decode({ gold: 123, items: [...outfits.map(it => [it.id, 1] as [string, number]), ['rosario-bosso', 7], ['unknown-gesture-record', 3], ['canapa-torso', 2]] });
const original = bag.encode();
const stack = bag.selection(3)!, unknown = bag.selection(4)!;
assert(bag.reorder(stack, 0));
assert.equal(bag.items[0], stack.stack);
assert(bag.reorder(unknown, 29));
assert.equal(bag.items.at(-1), unknown.stack);
const copy = new Bag(); copy.decode(JSON.parse(JSON.stringify(bag.encode())));
assert.deepEqual(copy.encode(), bag.encode());
assert.equal(bag.reorder(stack, -1), false);
assert.equal(bag.reorder(stack, 30), false);
// A pending confirmation follows the record through reordering, but never a changed/replaced stack.
stack.stack.n++;
assert.equal(bag.discard(stack), false);
stack.stack.n--;
const old = bag.selection(0)!;
bag.decode(bag.encode());
assert.equal(bag.discard(old), false);
const selected = bag.selection(bag.items.findIndex(s => s.id === 'rosario-bosso'))!;
assert(bag.discard(selected)); assert.equal(bag.discard(selected), false);
assert.equal(bag.count('rosario-bosso'), 0); assert.equal(bag.gold, original.gold);
assert(bag.discard(bag.selection(bag.items.findIndex(s => s.id === unknown.id))!));
for (const item of outfits) {
  const tip = itemTip(item, { worn: null, hint: 'Tocca di nuovo: indossa' });
  assert(tip.includes(item.name) && tip.includes(`Livello oggetto ${item.ilvl}`));
  assert(tip.includes(`${item.stats!.armatura} Armatura`) && tip.includes('class="g"'));
  assert(!/Consigli:|Priorità:|Le abilità|Presidio elettrico|class="lore"/.test(tip));
  const touch = itemTip(item, { compact: true, worn: ITEM.get(gear.worn.abito!) });
  assert.equal((touch.match(/class="box/g) ?? []).length, 1);
  assert(!/Se lo indossi|nessuna differenza|Equipaggiato: aumenta/.test(touch));
  assert.equal(gear.wear(bag, bag.items.findIndex(s => s.id === item.id)), '');
}
assert(bag.items.some(s => s.id === 'canapa-torso' && s.n === 2));
// Full-bag legacy conversion is atomic; freeing enough room then preserves every old piece.
gear.decode({ testa: 'mitria', torso: 'saio-voto', mani: 'canapa-mani', arma: 'clava-osso' });
bag.decode({ gold: 123, items: [[outfits[0].id, 1], ...Array.from({ length: 29 }, () => ['canapa-torso', 1] as [string, number])] });
const full = JSON.stringify([bag.encode(), gear.encode()]);
assert.match(gear.wear(bag, 0), /spazio/);
assert.equal(JSON.stringify([bag.encode(), gear.encode()]), full);
bag.items.splice(1, 3);
assert.equal(gear.wear(bag, 0), '');
assert(ARMOR_SLOTS.every(s => !gear.worn[s]));
for (const id of ['mitria', 'saio-voto', 'canapa-mani']) assert.equal(bag.count(id), 1);
assert.equal(gear.worn.arma, 'clava-osso');
assert(ITEM.get('unknown-gesture-record')?.recovered);
console.log('bag gestures: ordered lossless saves, exact-stack discard, stale/double confirmation, compact stats and atomic equip ok');
