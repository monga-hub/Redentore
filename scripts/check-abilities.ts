// Headless ability-system check (`npm run check`): GCD, off-GCD, cooldowns, one cast per
// key press, cast completion and movement interrupts, channel ticks.
import { AbilitySystem, GCD, type Ability } from '../src/abilities/system.ts';

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
console.log('abilities ok');
