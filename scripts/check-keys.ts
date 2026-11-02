// Key bindings check (`npm run check`): the defaults reach the game as they are; a rebound key stands in for its
// action and the default it replaced goes quiet; a key another action holds swaps over; reserved keys are refused;
// bindings survive storage and junk or duplicates fall back to the defaults.
import { ACTIONS, RESERVED, defaults, find, load, rebind, save, translate } from '../src/core/keys.ts';

const fail = (why: string) => { throw new Error(why); };
const mem = (): Storage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; } };
};

// Defaults: every default key reaches the game as its action's first code; system keys pass through.
const d = defaults();
if (translate(d, 'KeyW') !== 'KeyW' || translate(d, 'ArrowUp') !== 'KeyW' || translate(d, 'ShiftRight') !== 'ShiftLeft') fail('defaults do not translate to the game codes');
if (translate(d, 'Digit5') !== 'Digit5' || translate(d, 'KeyR') !== 'KeyR') fail('bar defaults moved');
for (const k of ['Escape', 'KeyM', 'KeyF', 'Tab', 'KeyZ']) if (translate(d, k) !== k) fail(`${k} should pass through`);

// A free key: forward on I, W goes quiet, the arrow still works.
let r = rebind(d, 'avanti', 0, 'KeyI');
if (r.note || translate(r.b, 'KeyI') !== 'KeyW' || translate(r.b, 'KeyW') !== '' || translate(r.b, 'ArrowUp') !== 'KeyW') fail('free rebind wrong');
if (d.avanti[0] !== 'KeyW') fail('rebind mutated its input');

// A held key swaps: slot 1 on W, forward takes Digit1.
r = rebind(d, 'barra1', 0, 'KeyW');
if (!r.note.includes('Avanti') || r.b.barra1[0] !== 'KeyW' || r.b.avanti[0] !== 'Digit1') fail(`swap wrong: ${JSON.stringify(r)}`);
if (translate(r.b, 'KeyW') !== 'Digit1' || translate(r.b, 'Digit1') !== 'KeyW') fail('swap does not translate');
// Swapping within one action's own slots, and rebinding a key to where it already is, are no-ops of a kind.
if (rebind(d, 'avanti', 1, 'KeyW').b.avanti.join() !== 'ArrowUp,KeyW') fail('in-action swap wrong');
if (rebind(d, 'avanti', 0, 'KeyW').note) fail('same key noted');

// Clearing: the slot goes empty and its old key quiet; taking a key off an emptied slot's neighbour leaves it empty.
r = rebind(d, 'cammina', 1, '');
if (r.b.cammina[1] !== '' || translate(r.b, 'ShiftRight') !== '' || find(r.b, '')) fail('clear wrong');
r = rebind(r.b, 'cammina', 1, 'KeyQ');
if (r.b['gira-sx'][0] !== '' || !r.note.includes('senza tasto')) fail('swap onto empty wrong');

// Reserved keys are refused and leave the bindings alone.
for (const k of RESERVED) { const x = rebind(d, 'salta', 0, k); if (x.b !== d || !x.note) fail(`${k} not refused`); }

// Storage: kept across a reload; junk, wrong shapes, reserved and duplicate keys fall back.
const s = mem();
if (JSON.stringify(load(s)) !== JSON.stringify(d)) fail('empty storage is not the defaults');
r = rebind(d, 'pozione', 0, 'KeyG');
save(r.b, s);
if (load(s).pozione[0] !== 'KeyG' || translate(load(s), 'KeyG') !== 'KeyR') fail('bindings not kept');
s.setItem('redentore.keys', '{oops'); if (load(s).pozione[0] !== 'KeyR') fail('junk accepted');
s.setItem('redentore.keys', JSON.stringify({ salta: ['KeyM'], avanti: ['KeyW'] })); if (load(s).salta[0] !== 'Space' || load(s).avanti.length !== 2) fail('bad entries accepted');
s.setItem('redentore.keys', JSON.stringify({ ...d, salta: ['KeyW'] })); if (load(s).salta[0] !== 'Space' || load(s).avanti[0] !== 'KeyW') fail('duplicate accepted');
if (ACTIONS.filter((a) => a.id.startsWith('barra')).length !== 9) fail('bar actions missing');

console.log(`keys ok: ${ACTIONS.length} actions, swaps, clears, ${RESERVED.size} reserved, storage`);

// Older bindings keep their customized keys, including a T already taken by health.
const old = rebind(d, 'pozione', 0, 'KeyT').b;
delete old['pozione-mana'];
save(old, s);
const migrated = load(s);
if (migrated.pozione[0] !== 'KeyT' || migrated['pozione-mana'][0] !== 'KeyY' || translate(migrated, 'KeyY') !== 'KeyT' || translate(migrated, 'KeyT') !== 'KeyR') fail('new mana key displaced an old binding');
for (const [id, keys] of Object.entries(old)) if (migrated[id].join() !== keys.join()) fail(`migration changed ${id}`);
save(migrated, s);
if (JSON.stringify(load(s)) !== JSON.stringify(migrated)) fail('key migration not stable');
const moved = rebind(migrated, 'pozione-mana', 0, 'KeyG').b;
save(moved, s);
if (load(s)['pozione-mana'][0] !== 'KeyG' || translate(load(s), 'KeyG') !== 'KeyT') fail('mana cannot be rebound');
