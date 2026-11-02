// Zone notes check (`npm run check`): a note saved comes back after a "reload" with its zone, level, hero, spot and
// version; blank notes and junk in storage are refused; the list puts the zone at hand first and filters by zone;
// deleting drops just that one; the Markdown and JSON exports carry every note.
import { KEY, add, json, list, load, markdown, remove, zones } from '../src/core/notes.ts';

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
if (r.text !== 'Il nome "Segreteria" non suona veneziano' || r.area !== 'Segreteria' || r.level !== 1 || r.hero !== 'Il Risorto' || r.x !== 12.34 || r.z !== -56.7 || r.version !== 'abc1234' || r.at !== 1000 || r.category !== 'nome') fail(`note restored as ${JSON.stringify(r)}`);

const here = list(back, 'Segreteria');
if (here.map((n) => n.id).join() !== [c.id, a.id, b.id].join()) fail('the zone at hand is not first, newest first');
if (list(back, 'Segreteria', 'Pontile della Punta').map((n) => n.id).join() !== b.id) fail('zone filter');
if (zones(back, 'Pontile della Punta').join() !== 'Pontile della Punta,Segreteria') fail('zones order');

const md = markdown(back);
for (const n of back) if (!md.includes(n.text)) fail(`markdown lacks ${n.text}`);
if (!md.includes('## Segreteria') || !md.includes('## Pontile della Punta') || !md.includes('livello 2') || !md.includes('v abc1234')) fail('markdown lacks zone/where');
if ((JSON.parse(json(back)) as unknown[]).length !== 3) fail('json export');

remove(a.id, s);
if (load(s).map((n) => n.id).sort().join() !== [b.id, c.id].sort().join()) fail('delete dropped the wrong note');

const junk = mem();
junk.setItem(KEY, '{nope');
if (load(junk).length) fail('junk read as notes');
junk.setItem(KEY, JSON.stringify([{ id: 1 }, { ...a }]));
if (load(junk).length !== 1) fail('malformed note kept');

console.log('notes: save, reload, list, filter, delete and export ok');
