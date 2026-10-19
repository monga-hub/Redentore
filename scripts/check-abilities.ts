// Headless ability-system check (`npm run check`): GCD, off-GCD, a GCD per school, cooldowns, one cast per
// key press, cast completion and movement interrupts, cast pushback from hits, channel ticks, mana costs, charge bar and
// specials, player stats (Velo spettrale, immunity), dragging slots around the bar and remembering it; and the kit's table:
// every ability card has its ability, a school, a painted icon in the atlas and a tooltip with real numbers.
import { AbilitySystem, CHARGE_MAX, GCD, PUSHBACK, PUSHBACKS, loadBar, saveBar, type Ability } from '../src/abilities/system.ts';
import { PlayerStats } from '../src/player/stats.ts';
import { ABILITIES, plagueSpot } from '../src/abilities/forsaken.ts';
import { CARDS, SCHOOL } from '../src/player/levels.ts';
import { ATLAS } from '../src/ui/iconAtlas.ts';

const fired: string[] = [];
const ab = (id: string, extra: Partial<Ability> = {}): Ability =>
  ({ id, name: id, icon: '', desc: '', cooldown: 10, fire: (_c, t) => { fired.push(t ? `${id}#${t}` : id); }, ...extra });
const ctx = { player: { pos: { x: 0, y: 0, z: 0 } } };
const sys = new AbilitySystem(
  [ab('a'), ab('b'), ab('off', { offGcd: true }), ab('cast', { cast: 2 }), ab('chan', { channel: { duration: 4, tick: 2 } })],
  ['a', 'b', 'off', 'cast', 'chan'], ctx);
const step = (t: number, keys: string[] = []) => { for (let s = 0; s < t; s += 0.1) sys.update(0.1, (k) => s === 0 && keys.includes(k)); };
const eq = (want: string[], why: string) => {
  if (fired.join() !== want.join()) throw new Error(`${why}: fired [${fired}] want [${want}]`);
};

step(0.1, ['Digit1']);
eq(['a'], 'instant fires once');
step(0.1, ['Digit2']);
eq(['a'], 'GCD blocks a second ability');
step(0.1, ['Digit3']);
eq(['a', 'off'], 'off-GCD ignores the GCD');
step(GCD);
sys.tryCast(0);
eq(['a', 'off'], 'cooldown blocks a re-cast');
sys.notices.length = 0;

sys.tryCast(3); // 2 s cast
step(1.9);
eq(['a', 'off'], 'cast not done yet');
step(0.3);
eq(['a', 'off', 'cast'], 'cast fires when the bar fills');

step(GCD + 10);
sys.castMul = 0.8; // Fra' Bortolo's blessing: the 2 s cast fills in 1.6 s
sys.tryCast(3);
step(1.7);
eq(['a', 'off', 'cast', 'cast'], 'a blessed cast fills sooner');
sys.castMul = 1;
fired.length = 0;
fired.push('a', 'off', 'cast');

step(GCD);
sys.tryCast(4); // channel 4 s, tick 2 s
step(4.1);
eq(['a', 'off', 'cast', 'chan#1', 'chan#2'], 'channel ticks');

fired.length = 0;
step(10);
sys.tryCast(3);
step(0.5);
ctx.player.pos.x += 1; // walk away mid-cast
step(0.2);
step(3);
eq([], 'movement interrupts a cast');
if (sys.cooldown(sys.slots[3]!) !== 0) throw new Error('interrupted cast must not start its cooldown');
if (!sys.notices.some((n) => n.kind === 'fail')) throw new Error('interrupt not reported');

// Mana: costs are paid when the cooldown starts; short of mana nothing fires.
const stats = new PlayerStats(100, 50);
const pay = new AbilitySystem([ab('m', { mana: 30, cooldown: 0, offGcd: true }), ab('mc', { mana: 30, cast: 1 })], ['m', 'mc'], ctx);
pay.pool = stats;
const mana = (want: number, why: string) => { if (stats.mana !== want) throw new Error(`${why}: mana ${stats.mana} want ${want}`); };
fired.length = 0;
pay.tryCast(0);
mana(20, 'instant pays');
pay.tryCast(0);
eq(['m'], 'not enough mana blocks the cast');
if (!pay.notices.some((n) => n.text === 'Mana insufficiente.')) throw new Error('no mana error');
stats.update(2.5); // 3 mana/s within five seconds of spending
mana(27.5, 'regen');
stats.update(2.5); // five calm seconds: six times faster, up to the top
mana(50, 'resting regen');
stats.spendMana(5);
stats.update(1);
if (stats.resting || stats.mana !== 48) throw new Error(`spending ends the rest: mana ${stats.mana}`);
stats.mana = 45;
pay.tryCast(1);
mana(45, 'cast-time ability pays when the bar fills, not on press');
for (let t = 0; t < 1.1; t += 0.1) pay.update(0.1, () => false);
eq(['m', 'mc'], 'cast with mana fires');
mana(15, 'cast pays');

// Charge: casts fill it, specials wait for it full, refuse on a failed check without spending it, then empty it.
let aim = false;
const fury = new AbilitySystem([ab('hit', { charge: 40, cooldown: 0, offGcd: true }), ab('sp', { special: true, cooldown: 0, offGcd: true, check: () => (aim ? undefined : 'Nessun bersaglio.') })], ['hit', 'sp'], ctx);
fired.length = 0;
fury.tryCast(1);
eq([], 'special locked while the bar is not full');
for (let i = 0; i < 3; i++) fury.tryCast(0);
if (fury.charge !== CHARGE_MAX) throw new Error(`charge ${fury.charge}: must fill and clamp`);
fury.tryCast(1);
if (fury.charge !== CHARGE_MAX || fired.includes('sp')) throw new Error('failed check must not fire or spend the charge');
aim = true;
fury.tryCast(1);
if ((fury.charge as number) !== 0 || !fired.includes('sp')) throw new Error('special fires and empties the bar');

// Health: clamps, death fires once, the dead don't heal.
let deaths = 0;
stats.onDeath = () => deaths++;
if (stats.takeDamage(30) !== 30 || stats.heal(50) !== 30) throw new Error('damage/heal clamp');
if (stats.takeDamage(500) !== 100 || stats.takeDamage(5) !== 0 || !stats.dead || deaths !== 1 || stats.heal(10) !== 0) throw new Error('death');

// Velo spettrale halves damage, immunity takes none, both wear off.
const tank = new PlayerStats(1000, 0);
tank.veil = 5;
if (tank.takeDamage(100) !== 50) throw new Error('veil halves damage');
tank.immune = 5;
if (tank.takeDamage(100) !== 0) throw new Error('immune takes no damage');
tank.update(5);
if (tank.takeDamage(100) !== 100) throw new Error('buffs expire');
// Nube di peste lands on the enemy, never on the caster: target, else nearest foe in reach, else ahead.
const at = { x: 0, y: 0, z: 0 }, mob = (x: number, z: number, state = 'idle') => ({ x, y: 1, z, hp: 10, state });
const spot = (want: { x: number; z: number }, got: { x: number; z: number }, why: string) => {
  if (Math.hypot(got.x - want.x, got.z - want.z) > 1e-6) throw new Error(`${why}: cloud at ${got.x},${got.z} want ${want.x},${want.z}`);
};
const near = mob(3, 0), far = mob(-8, 0), aimedMob = mob(0, 10);
spot(aimedMob, plagueSpot(at, 0, aimedMob, [near, far, aimedMob]), 'selected target wins');
spot(near, plagueSpot(at, 0, mob(0, 50), [far, near]), 'out-of-reach target falls back to nearest foe');
spot(near, plagueSpot(at, 0, mob(0, 5, 'dead'), [far, near]), 'dead target falls back to nearest foe');
spot(far, plagueSpot(at, 0, undefined, [mob(1, 0, 'dead'), far]), 'dead foes ignored');
const ahead = plagueSpot(at, 0, undefined, [mob(0, 100)]);
if (ahead.z > -4 || Math.abs(ahead.x) > 1e-6) throw new Error(`no foe in reach: cloud must land well ahead (-Z), got ${ahead.x},${ahead.z}`);
// Rearranging the bar: keys follow the slots, cooldowns the abilities; the fixed slots (primary 0, potion 9) stay; the book
// equips and removes; the layout survives storage, sanitizes junk and migrates the 12-slot bar from before the book.
const store = new Map<string, string>();
const mem = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } } as Storage;
const def = ['p', 'x', 'y', null, null, null, null, null, null, 'pot'];
const idAt = (b: AbilitySystem, i: number) => b.slots[i]?.id; // a call: no narrowing across the steps
const span = (b: (string | null)[]) => b.slice(0, 4).join();
const bar = new AbilitySystem([ab('p'), ab('x'), ab('y'), ab('z'), ab('pot')], loadBar(def, mem).bar, ctx, ['p', 'x', 'y', 'pot']);
if (loadBar(def, mem).bar.join() !== def.join()) throw new Error('nothing stored: the default bar');
fired.length = 0;
bar.swap(1, 2);
bar.swap(1, 3); // onto an empty slot: a move
bar.swap(0, 3); // the primary attack is fixed
bar.swap(9, 1); // so is the potion
if (fired.length || bar.gcd(bar.slots[2]!) || bar.cooldown(bar.slots[2]!)) throw new Error('rearranging the bar must not cast');
if (span(bar.layout().bar) !== 'p,,x,y' || bar.layout().bar[9] !== 'pot') throw new Error(`layout after swaps: ${bar.layout().bar}`);
bar.tryCast(3);
if (fired.join() !== 'y' || bar.cooldown(bar.slots[3]!) !== 10) throw new Error('key 4 must cast y, now in slot 4, and y cools down');
bar.remove(3); // Rimuovi: y back to the book
bar.remove(0); // not the primary
if (bar.slots[3] || bar.slots[0]?.id !== 'p' || bar.layout().off.join() !== 'y') throw new Error(`remove: ${JSON.stringify(bar.layout())}`);
bar.unlock('y'); // owned already: a removed one stays off
bar.unlock('z'); // a new one takes the first free slot
if (idAt(bar, 1) !== 'z' || bar.slots.some((a) => a?.id === 'y')) throw new Error(`unlock after remove: ${bar.layout().bar}`);
bar.equip('y', 1); // from the book onto z: z goes to the book
if (idAt(bar, 1) !== 'y' || bar.layout().off.join() !== 'z') throw new Error(`equip from the book: ${JSON.stringify(bar.layout())}`);
bar.equip('x', 1); // from the bar: a swap
bar.equip('p', 4); // the fixed ones stay
bar.equip('x', 0);
if (span(bar.layout().bar) !== 'p,x,y,' || bar.slots[4]) throw new Error(`equip: ${bar.layout().bar}`);
saveBar(bar.layout(), mem);
const saved = loadBar(def, mem, ['p', 'x', 'y', 'z', 'pot']);
if (span(saved.bar) !== 'p,x,y,' || saved.off.join() !== 'z') throw new Error(`saved layout not restored: ${JSON.stringify(saved)}`);
const relearn = new AbilitySystem([ab('p'), ab('x'), ab('y'), ab('z'), ab('pot')], saved.bar, ctx, ['p', 'x', 'pot'], saved.off);
relearn.unlock('y'); // a load replays the picks: y back in its slot
relearn.unlock('z'); // still off
if (relearn.slots[2]?.id !== 'y' || relearn.slots.some((a) => a?.id === 'z')) throw new Error(`load keeps a removed one off: ${relearn.layout().bar}`);
const fresh = new AbilitySystem([ab('p'), ab('x'), ab('z'), ab('pot')], saved.bar, ctx, ['p', 'x', 'pot'], saved.off);
fresh.learn('z'); // a card picked now: on the bar even though an earlier run took it off, on the first empty slot
if (fresh.slots[3]?.id !== 'z' || fresh.layout().off.length) throw new Error(`learn: ${JSON.stringify(fresh.layout())}`);
for (const junk of [JSON.stringify([1, 'q', 'x', 'x']), JSON.stringify({ bar: ['x', 'pot', 'p'], off: ['p', 7] }), '{"bar":7}', 'nope']) {
  store.set('redentore.bar', junk);
  const l = loadBar(def, mem);
  if (l.bar[0] !== 'p' || l.bar[9] !== 'pot' || l.bar.filter((x) => x === 'x').length > 1 || l.bar.includes('q') || l.off.length) throw new Error(`junk layout ${junk}: ${JSON.stringify(l)}`);
}
// The 12-slot bar from before the book: slots 1-8 stay put, what sat on 9, 0, -, = moves into the free ones, the potion and the club to their own.
store.set('redentore.bar', JSON.stringify(['y', 'z', 'pot', null, 'x', null, null, null, null, 'q', 'p', null]));
const old = loadBar(def, mem, ['p', 'x', 'y', 'z', 'q', 'pot']);
if (old.bar.join() !== 'p,z,y,q,x,,,,,pot') throw new Error(`old bar migrated: ${old.bar}`);
// A cast whose target goes out of sight while the bar fills is refused at the end: no mana, no cooldown.
let visible = true;
const sighted = new AbilitySystem([ab('bolt', { cast: 1, mana: 10, check: () => (visible ? undefined : 'Bersaglio non in vista.') })], ['bolt'], ctx);
sighted.pool = new PlayerStats();
const mana0 = sighted.pool.mana;
fired.length = 0;
sighted.tryCast(0);
visible = false;
for (let t = 0; t < 1.2; t += 0.1) sighted.update(0.1, () => false);
if (fired.length || sighted.pool.mana !== mana0 || sighted.cooldown(sighted.slots[0]!) || !sighted.notices.some((n) => n.text === 'Bersaglio non in vista.')) throw new Error('a cast at a hidden target must cost nothing');
// A GCD per school: an ice spell holds the ice ones back, fire and the shared '' ones go at once.
const schools = new AbilitySystem([ab('ice1', { school: 'frost' }), ab('ice2', { school: 'frost' }), ab('fire', { school: 'fire' }), ab('none')], ['ice1', 'ice2', 'fire', 'none'], ctx);
fired.length = 0;
schools.tryCast(0);
schools.tryCast(1);
eq(['ice1'], 'same school waits for its GCD');
schools.tryCast(2);
schools.tryCast(3);
eq(['ice1', 'fire', 'none'], 'other schools are free');
if (schools.gcd(schools.slots[1]!) !== GCD || schools.gcd(schools.slots[2]!) !== GCD) throw new Error('each school runs its own GCD');
for (let t = 0; t < GCD + 0.05; t += 0.1) schools.update(0.1, () => false);
schools.tryCast(1);
eq(['ice1', 'fire', 'none', 'ice2'], 'school GCD wears off');
// Pushback: each hit sets a cast back PUSHBACK s, PUSHBACKS times at most; a channel is not set back.
const push = new AbilitySystem([ab('long', { cast: 2 }), ab('ch', { channel: { duration: 2, tick: 1 }, offGcd: true })], ['long', 'ch'], ctx);
fired.length = 0;
push.tryCast(0);
for (let i = 0; i < 10; i++) push.update(0.1, () => false); // 1 s in
push.pushback();
const back = push.casting!.t;
if (Math.abs(back - (1 - PUSHBACK)) > 1e-6) throw new Error(`pushback: bar at ${back}, want ${1 - PUSHBACK}`);
for (let i = 0; i < PUSHBACKS + 3; i++) push.pushback();
if (push.casting!.pushed !== PUSHBACKS || push.casting!.t !== 0) throw new Error(`pushback capped at ${PUSHBACKS}: pushed ${push.casting!.pushed}, bar ${push.casting!.t}`);
for (let i = 0; i < 19; i++) push.update(0.1, () => false); // 1.9 s of the 2 s bar
eq([], 'a pushed cast takes longer');
for (let i = 0; i < 2; i++) push.update(0.1, () => false);
eq(['long'], 'a pushed cast still lands');
for (let t = 0; t < 10; t += 0.1) push.update(0.1, () => false);
push.tryCast(1);
push.update(0.5, () => false);
push.pushback();
if ((push.casting!.t as number) !== 0.5) throw new Error('channels are not set back');
// The kit's table: one ability per card, each with a school (its GCD), an icon of the atlas and a tooltip with no holes.
const table = new Map(ABILITIES.map((a) => [a.id, a]));
for (const c of CARDS) if (c.kind === 'ability' && !table.has(c.id)) throw new Error(`card ${c.id} has no ability`);
for (const a of ABILITIES) {
  if (a.id !== 'potion' && (!a.school || a.school !== SCHOOL[a.id])) throw new Error(`${a.id} has no school`); // the potion: the shared GCD-free slot
  if (!(ATLAS as readonly string[]).includes(a.icon)) throw new Error(`${a.id}: icon ${a.icon} not in the atlas`);
  if (/undefined|NaN/.test(a.desc) || !/\d/.test(a.desc)) throw new Error(`${a.id}: tooltip "${a.desc}"`);
  if (!(a.cooldown >= 0) || (a.mana !== undefined && !(a.mana > 0))) throw new Error(`${a.id}: cooldown ${a.cooldown}, mana ${a.mana}`);
}
for (const c of CARDS) if (c.kind !== 'filler' && !(ATLAS as readonly string[]).includes(c.icon)) throw new Error(`card ${c.id}: icon ${c.icon} not in the atlas`);
console.log(`abilities ok (${ABILITIES.length} in the kit)`);
