// Exact stat/channel checks plus actual grimoire/ability effects through the shared player damage callback.
import assert from 'node:assert/strict';
import { effects, damageMultiplier, crit, totals, STAT, GEAR, type DamageKind, type Stats } from '../src/loot/gear.ts';
import { World } from '../src/core/physics.ts';
import { control, root } from '../src/enemies/control.ts';
import { Grimoire } from '../src/abilities/grimoire.ts';
import { ABILITIES, tune, type Forsaken } from '../src/abilities/forsaken.ts';
import { tuneOf } from '../src/player/levels.ts';
import { PlayerStats } from '../src/player/stats.ts';
import { AbilitySystem } from '../src/abilities/system.ts';
import { FRIAR } from '../src/enemies/brain.ts';
import type { Mob } from '../src/ui/target.ts';

const near = (n: number, want: number) => assert.ok(Math.abs(n - want) < 1e-8, `${n} != ${want}`);
const legacy = effects({ potenza: 20, intelletto: 8, spirito: 12, celerita: 10 });
near(legacy.dmg, 1.2); near(legacy.physical, 1.2); near(legacy.magic, 1.2);
near(legacy.haste, 1.1); near(legacy.mana, 80); near(legacy.regen, 1.2);
assert.ok(Object.values(effects({})).every(Number.isFinite));
for (const k of ['forza', 'agilita', 'potenzaAttacco', 'potenzaMagica'] as const) assert.equal(totals(['clava-osso'])[k], 0);
const club = GEAR.find((g) => g.id === 'clava-osso')!.stats!;
try {
  Object.assign(club, { forza: 8, agilita: 12, potenzaAttacco: 6, potenzaMagica: 4 });
  const total = totals(['clava-osso']);
  assert.deepEqual([total.forza, total.agilita, total.potenzaAttacco, total.potenzaMagica], [8, 12, 6, 4]);
} finally {
  delete club.forza; delete club.agilita; delete club.potenzaAttacco; delete club.potenzaMagica;
}
const worn = effects({ potenza: 10, potenzaAttacco: 20, potenzaMagica: 40, forza: 80, agilita: 60, celerita: 10 });
near(worn.physical, 1.5); near(worn.magic, 1.5); near(worn.strengthPower, 20); near(worn.agilityHaste, 15); near(worn.haste, 1.25);
near(damageMultiplier(effects({ potenzaAttacco: 40, potenzaMagica: 10 }), 'hybrid'), 1.25);
assert.ok(effects({ forza: 1e9 }).strengthPower < 40 && effects({ agilita: 1e9 }).agilityHaste < 30);
near(effects({ forza: -10, agilita: -10 }).haste, 1);

const world = new World(); world.add(0, 0, 100, 100, -1, 0);
const mob: Mob = { x: 0, y: 0, z: -1, hp: FRIAR.hp, state: 'chase', cc: control() };
const stats = new PlayerStats();
const hits: { n: number; kind: DamageKind }[] = [];
const gear = effects({ potenza: 10, potenzaAttacco: 30, potenzaMagica: 10 });
const host = {
  player: { pos: { x: 0, y: 0, z: 0 }, facing: 0, world }, stats,
  foes: () => [mob], aimed: () => mob,
  hurt: (inside: (x: number, z: number, m: Mob) => boolean, n: number, kind: DamageKind = 'magic') => {
    if (inside(mob.x, mob.z, mob)) hits.push({ n: n * damageMultiplier(gear, kind), kind });
  },
};
const t = tuneOf([]), book = new Grimoire(host, t);
const take = (kind: DamageKind, base: number) => {
  assert.equal(hits.length, 1); assert.equal(hits[0].kind, kind);
  near(hits[0].n, base * damageMultiplier(gear, kind)); hits.length = 0;
};
book.whirl(); take('physical', t.whirlDmg);
t.fxFrostWhirl = true; root(mob.cc!, 3); book.whirl();
assert.deepEqual(hits.map((h) => h.kind), ['physical', 'magic']);
near(hits[0].n, t.whirlDmg * gear.physical); near(hits[1].n, t.whirlDmg * gear.magic);
hits.length = 0; t.fxFrostWhirl = false; mob.cc = control();
book.grace(); take('physical', t.graceDmg); // no wounds on a full-health friar
book.shoot('thorn', { x: 0, y: 1.2, z: 0 }); book.update(0.1); take('magic', t.prim.thorn.dmg);
book.hallow(); stats.hp = stats.hpMax / 2; book.update(0.1);
assert.ok(hits.length && hits.every((h) => h.kind === 'magic'));
near(stats.hp, stats.hpMax * 0.501); // percentage heal independent of SP
hits.length = 0; book.reset();
book.shoot('venom', { x: 0, y: 1.2, z: 0 }); book.update(0.1);
assert.ok(hits.length >= 2 && hits.every((h) => h.kind === 'magic')); // impact and poison tick
near(hits.at(-1)!.n, t.venomDps * 0.1 * gear.magic);
hits.length = 0; book.reset();
// The bone basic attack and mixed bone/shadow special use the very same host callback.
const kit = { ...host, vfx: { ribbons: { begin() {}, push() {}, end() {} }, spawn() {} }, comboStep: 0, swingCombo() {}, release() {}, magic: book, nextCombo: () => 0,
  player: { ...host.player, model: { play() {}, fight() {} } },
  at(_t: number, f: () => void) { f(); },
} as unknown as Forsaken;
ABILITIES.find((a) => a.id === 'fall')!.fire(kit, 0); take('physical', tune.fallDmg);
// Cosmetic methods are inert; the special uses the real player damage callback.
const strike = ABILITIES.find((a) => a.id === 'strike')!;
assert.ok(strike);
kit.strikeTarget = () => mob;
kit.impale = () => {};

strike.fire(kit, 0); take('hybrid', tune.strikeDmg);
// Crit benefits both schools and continuous ticks; gear never enters incoming damage.
for (const kind of ['physical', 'magic', 'hybrid'] as const) {
  const n = 100 * damageMultiplier(gear, kind);
  near(crit(n, 100), n * 1.5);
  near(crit(0.1 * damageMultiplier(gear, kind), 20), 0.11 * damageMultiplier(gear, kind));
}
near(stats.takeDamage(100), 100);
stats.immune = 2; near(stats.takeDamage(100), 0);
// Existing cast/GCD path: agility accelerates neither channels nor fixed ability cooldowns.
const system = new AbilitySystem([
  { id: 'cast', name: '', icon: '', desc: '', cooldown: 10, cast: 2, fire() {} },
  { id: 'channel', name: '', icon: '', desc: '', cooldown: 10, channel: { duration: 4, tick: 1 }, fire() {} },
], ['cast', 'channel'], host);
system.castMul = 1 / worn.haste;
assert.ok(system.tryCast(0)); near(system.casting!.total, 1.6); near(system.gcd(system.slots[0]!), 1.2);
system.cancel(); system.update(2, () => false);
assert.ok(system.tryCast(1)); near(system.casting!.total, 4); near(system.cooldown(system.slots[1]!), 10);

// Representative equal-budget offense allocations, independent of the item owner's catalogue.
// Universal Potenza stays the efficient hybrid; specialists win when their channel dominates.
const recipes: Record<string, Stats> = {
  universal: { potenza: 30 }, physical: { forza: 40, potenzaAttacco: 45 / 1.75 },
  magic: { potenzaMagica: 75 / 1.75 }, hybrid: { potenza: 24, critico: 5 },
  plague: { potenzaMagica: 60 / 1.75, agilita: 20 },
};
const rows = Object.entries(recipes).map(([build, recipe]) => {
  const budget = Object.entries(recipe).reduce((n, [k, v]) => n + v * STAT[k as keyof typeof STAT].cost, 0);
  near(budget, 75);
  const e = effects(recipe), critAverage = 1 + e.crit / 100 * 0.5;
  return { build, physical: damageMultiplier(e, 'physical'), magic: damageMultiplier(e, 'magic'),
    hybrid: damageMultiplier(e, 'hybrid'), castSpeed: e.haste,
    physical80: e.physical * 0.8 + e.magic * 0.2, magic80: e.magic * 0.8 + e.physical * 0.2,
    gcdMagic: e.magic * e.haste,
    mixedExpected: damageMultiplier(e, 'hybrid') * critAverage };
});
assert.ok(rows[1].physical > rows[0].physical && rows[1].magic < rows[0].magic);
assert.ok(rows[2].magic > rows[0].magic && rows[2].physical < rows[0].physical);
assert.ok(rows[0].hybrid > rows[1].hybrid && rows[0].hybrid > rows[2].hybrid);
assert.ok(rows[3].mixedExpected > rows[1].mixedExpected && rows[3].mixedExpected > rows[2].mixedExpected);
assert.ok(rows[4].castSpeed > rows[0].castSpeed);
assert.ok(rows[1].physical80 > rows[0].physical80 && rows[2].magic80 > rows[0].magic80);
assert.ok(rows[4].gcdMagic > rows[2].gcdMagic); // ideal GCD-limited casting, not a DoT tick multiplier
assert.ok(effects({ agilita: 20 }).haste > effects({ celerita: 20 * STAT.agilita.cost / STAT.celerita.cost }).haste);
console.table(rows);
console.log('gear scaling: exact formulas, legacy, effect channels, periodic damage, healing, crit, cast/GCD and equal budgets OK');
