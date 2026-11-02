// Real potion effects, progression and old layouts; no browser storage or renderer.
import assert from 'node:assert/strict';
import { ABILITIES, BAR, barOf, tune, type Forsaken } from '../src/abilities/forsaken.ts';
import { AbilitySystem, KEYS, MANA_POTION, POTION, loadBar, saveBar } from '../src/abilities/system.ts';
import { CARD, counter, eligible, startOf, tuneOf } from '../src/player/levels.ts';
import { HEROES } from '../src/player/heroes.ts';
import { PlayerStats } from '../src/player/stats.ts';
import { BOONS } from '../src/quest/progress.ts';

const health = ABILITIES.find((a) => a.id === 'potion')!, mana = ABILITIES.find((a) => a.id === 'mana_potion')!;
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
assert.notEqual(health.icon, mana.icon);
assert.notEqual(health.name, mana.name);
for (const picks of [[], ['health_potion_big', 'health_potion_cd'], ['mana_potion_big', 'mana_potion_cd'], ['potion_big', 'potion_cd']]) {
  Object.assign(tune, tuneOf(picks));
  const stats = new PlayerStats(1000, 500);
  stats.hp = 100; stats.mana = 20;
  const ctx = { player: { pos: { x: 0, y: 0, z: 0 } }, stats, healBurst() {} } as unknown as Forsaken;
  const cast = { id: 'cast', name: 'cast', icon: '', desc: '', school: 'holy', cooldown: 1, cast: 10, fire() {} };
  const sys = new AbilitySystem([health, mana, cast], [...BAR.slice(0, 1), 'cast', ...BAR.slice(2)], ctx);
  Object.assign(ctx, { system: sys });
  assert.ok(sys.tryCast(1)); // both vials can be used during a cast and its GCD
  assert.ok(sys.tryCast(POTION));
  near(stats.hp, 100 + 1000 * tune.potion);
  assert.equal(stats.mana, 20);
  assert.equal(sys.cooldown(mana), 0);
  assert.ok(sys.tryCast(MANA_POTION));
  near(stats.mana, 20 + 500 * tune.manaPotion);
  near(stats.hp, 100 + 1000 * tune.potion);
  near(sys.cooldown(health), tune.potionCd);
  near(sys.cooldown(mana), tune.manaPotionCd);
  assert.equal(sys.gcd(health), 0); assert.equal(sys.gcd(mana), 0);
  assert.equal(sys.casting?.ability.id, 'cast');
  assert.equal(sys.tryCast(POTION), false); assert.equal(sys.tryCast(MANA_POTION), false);
  sys.cancel(); sys.update(Math.min(tune.potionCd, tune.manaPotionCd), () => false);
  near(sys.cooldown(health), Math.max(0, tune.potionCd - tune.manaPotionCd));
  near(sys.cooldown(mana), Math.max(0, tune.manaPotionCd - tune.potionCd));
  // Restoration caps at maxima and never spills into the other resource.
  stats.hp = stats.hpMax - 1; stats.mana = stats.manaMax - 1;
  health.fire(ctx, 0); assert.equal(stats.hp, stats.hpMax); assert.equal(stats.mana, stats.manaMax - 1);
  mana.fire(ctx, 0); assert.equal(stats.mana, stats.manaMax); assert.equal(stats.hp, stats.hpMax);
}
const h = tuneOf(['health_potion_big', 'health_potion_cd']), m = tuneOf(['mana_potion_big', 'mana_potion_cd']);
near(h.potion, .45); near(h.potionCd, 21); near(h.manaPotion, .3); near(h.manaPotionCd, 30);
near(m.potion, .3); near(m.potionCd, 30); near(m.manaPotion, .45); near(m.manaPotionCd, 21);
const legacy = ['potion_big', 'potion_big', 'potion_cd', 'potion_cd'];
const t = tuneOf([...legacy, 'health_potion_big', 'mana_potion_cd']);
near(t.potion, .75); near(t.manaPotion, .6); near(t.potionCd, 14.7); near(t.manaPotionCd, 10.29);
assert.equal(counter(legacy)('health_potion_big'), 2); assert.equal(counter(legacy)('mana_potion_cd'), 2);
for (const hero of Object.values(HEROES)) {
  const own = startOf(hero.school), bar = barOf(hero.kit, own[0]), offers = eligible([], [], hero.school).map((c) => c.id);
  for (const id of ['health_potion_big', 'health_potion_cd', 'mana_potion_big', 'mana_potion_cd']) assert.ok(offers.includes(id));
  assert.ok(!offers.includes('potion_big') && !offers.includes('potion_cd'));
  assert.ok(own.includes(health.id) && own.includes(mana.id));
  assert.equal(bar[POTION], health.id); assert.equal(bar[MANA_POTION], mana.id); assert.equal(bar.length, KEYS.length);
}
assert.equal(CARD.get('potion_big')!.kind, 'filler');
const boon = tuneOf(legacy);
BOONS.find((b) => b.id === 'fiala')!.apply(boon); near(boon.potion, .78); near(boon.manaPotion, .78);
BOONS.find((b) => b.id === 'rapida')!.apply(boon); near(boon.potionCd, 11.76); near(boon.manaPotionCd, 11.76);

const data = new Map<string, string>();
const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } } as Storage;
const known = ABILITIES.map((a) => a.id);
const full = ['fall', 'leap', 'whirl', 'step', 'nova', 'ward', 'mend', 'veil', 'strike', 'potion'];
for (const raw of [full, { bar: full, off: ['charge'] }, { bar: ['fall', null, 'step', null, null, null, null, null, null, 'potion'], off: ['mend'] }]) {
  data.set('redentore.bar', JSON.stringify(raw));
  const old = Array.isArray(raw) ? { bar: raw, off: [] } : raw;
  const migrated = loadBar(BAR, store, known);
  assert.deepEqual(migrated, { bar: [...old.bar, 'mana_potion'], off: old.off });
  saveBar(migrated, store); assert.deepEqual(loadBar(BAR, store, known), migrated);
  const sys = new AbilitySystem(ABILITIES, migrated.bar, { player: { pos: { x: 0, y: 0, z: 0 } } } as Forsaken, [...known], migrated.off);
  for (const slot of [POTION, MANA_POTION]) { sys.swap(slot, 1); sys.remove(slot); sys.equip(sys.slots[slot]!.id, 1); }
  assert.equal(sys.slots[POTION]?.id, 'potion'); assert.equal(sys.slots[MANA_POTION]?.id, 'mana_potion');
}
// The older 12-slot array can hold a spell at index 10: relocate it rather than overwrite it with mana.
data.set('redentore.bar', JSON.stringify(['step', 'mend', null, null, null, null, null, null, null, 'potion', 'leap', 'fall']));
assert.deepEqual(loadBar(BAR, store, known).bar, ['fall', 'mend', 'step', 'leap', null, null, null, null, null, 'potion', 'mana_potion']);
Object.assign(tune, tuneOf([]));
console.log('potions ok: isolated resources, independent cooldowns/ranks, legacy benefits, every hero, 10/12-slot layouts');
