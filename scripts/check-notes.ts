// Zone notes check (`npm run check`): a note saved comes back after a "reload" with its zone (a renamed one's new name), level, hero, spot and
// version; blank notes and junk in storage are refused; the list puts the zone at hand first and filters by zone;
// deleting drops just that one; the Markdown and JSON exports carry every note.
import { KEY, add, json, list, load, markdown, remove, zones } from '../src/core/notes.ts';
import assert from 'node:assert/strict';
import { saveAndSubmit } from '../src/core/notes-cloud.ts';

const fail = (why: string) => { throw new Error(why); };
const mem = (): Storage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
};

const s = mem();
const base = { level: 1, lv: 3, hero: 'Il Risorto', x: 12.34, z: -56.7, version: 'abc1234' };
const a = add({ ...base, text: '  Il nome "Segreteria" non suona veneziano  ', category: 'nome', area: 'Segreteria' }, s, 1000)!;
const b = add({ ...base, text: 'Muro che compenetra', category: 'grafica', area: 'Pontile della Punta' }, s, 2000)!;
const c = add({ ...base, text: 'Porta bloccata', category: 'bug', area: 'Segreteria', level: 2 }, s, 3000)!;
if (!a || !b || !c) fail('a note was not saved');
if (add({ ...base, text: '   ', category: 'bug', area: 'X' }, s)) fail('blank note saved');
if (add({ ...base, text: 'x', category: 'boh' as never, area: 'X' }, s)) fail('unknown category saved');

const back = load(s); // as after a reload
if (back.length !== 3) fail(`${back.length} notes after reload`);
const r = back.find((n) => n.id === a.id)!;
if (r.text !== 'Il nome "Segreteria" non suona veneziano' || r.area !== 'Foresteria' || r.level !== 1 || r.hero !== 'Il Risorto' || r.x !== 12.34 || r.z !== -56.7 || r.version !== 'abc1234' || r.at !== 1000 || r.category !== 'nome') fail(`note restored as ${JSON.stringify(r)}`);

const here = list(back, 'Foresteria'); // saved under the old name, filed under the new (notes.ts RENAMED)
if (here.map((n) => n.id).join() !== [c.id, a.id, b.id].join()) fail('the zone at hand is not first, newest first');
if (list(back, 'Foresteria', 'Pontile della Punta').map((n) => n.id).join() !== b.id) fail('zone filter');
if (zones(back, 'Pontile della Punta').join() !== 'Pontile della Punta,Foresteria') fail('zones order');

const md = markdown(back);
for (const n of back) if (!md.includes(n.text)) fail(`markdown lacks ${n.text}`);
if (!md.includes('## Foresteria') || !md.includes('## Pontile della Punta') || !md.includes('livello 2') || !md.includes('v abc1234')) fail('markdown lacks zone/where');
if ((JSON.parse(json(back)) as unknown[]).length !== 3) fail('json export');

remove(a.id, s);
if (load(s).map((n) => n.id).sort().join() !== [b.id, c.id].sort().join()) fail('delete dropped the wrong note');

const junk = mem();
junk.setItem(KEY, '{nope');
if (load(junk).length) fail('junk read as notes');
junk.setItem(KEY, JSON.stringify([{ id: 1 }, { ...a }]));
if (load(junk).length !== 1) fail('malformed note kept');

console.log('notes: save, reload, list, filter, delete and export ok');

// Exercise the same local-first path used by the panel with a mocked hub module.
const input = { ...base, text: '  Porta bloccata  ', category: 'bug' as const, area: 'Pontile', level: 2 };
for (const outcome of ['sent', 'out', 'database', 'import'] as const) {
  const store = mem();
  add({ ...input, text: 'Nota precedente' }, store, 1000);
  let calls = 0;
  const client = async () => {
    assert.equal(load(store).length, 2, 'local note exists before importing');
    if (outcome === 'import') throw new Error('offline / missing module');
    return { submit: async (game: string, payload: unknown) => {
      calls++;
      assert.equal(game, 'redentore');
      assert.deepEqual(payload, {
        category: 'bug', text: 'Porta bloccata', zone: 'Pontile', level: 2,
        hero: base.hero, position: { x: base.x, z: base.z }, gameVersion: base.version,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      if (outcome === 'database') throw new Error('database / session error');
      return outcome === 'sent';
    } };
  };
  const result = saveAndSubmit(input, store, client, Date.parse('2026-01-01T00:00:00Z'))!;
  assert.ok(result);
  const localBefore = store.getItem(KEY);
  assert.equal(await result.delivery, outcome === 'database' || outcome === 'import' ? 'error' : outcome);
  assert.equal(calls, outcome === 'import' ? 0 : 1, 'only the new note, one attempt');
  assert.equal(store.getItem(KEY), localBefore, 'delivery must not modify or delete local notes');
  assert.deepEqual(load(store).find((n) => n.id === result.note.id), result.note);
  assert.equal(JSON.parse(json(load(store))).length, 2);
  assert.ok(markdown(load(store)).includes('Porta bloccata'));
}
let imports = 0;
const unusedClient = async () => { imports++; throw new Error('must not import'); };
const refused = mem();
refused.setItem = () => { throw new Error('quota'); };
assert.equal(saveAndSubmit(input, refused, unusedClient), undefined);
assert.equal(saveAndSubmit({ ...input, text: ' ' }, mem(), unusedClient), undefined);
assert.equal(imports, 0, 'do not send notes that could not be saved locally');
console.log('notes hub: success, logged out, database/session failure, import failure, local preservation and no historical resend ok');
