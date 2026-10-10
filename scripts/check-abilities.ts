// Headless ability-system check (`npm run check`): GCD, off-GCD, cooldowns, one cast per
// key press, cast completion and movement interrupts, channel ticks, mana costs, charge bar and
// specials, player stats (Velo spettrale, immunity).
import { AbilitySystem, CHARGE_MAX, GCD, type Ability } from '../src/abilities/system.ts';
import { PlayerStats } from '../src/player/stats.ts';

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
stats.update(10);
mana(45, 'regen');
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
if (fury.charge !== 0 || !fired.includes('sp')) throw new Error('special fires and empties the bar');

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
console.log('abilities ok');
