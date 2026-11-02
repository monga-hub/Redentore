// Cloud saves check (`npm run check`): with a fake hub client, the device and the account merge hero by hero by the
// run's stamp: a newer cloud run comes down (the device's kept aside), a newer device run goes up, a run on one side
// only reaches the other; the hero in play is never overwritten; offline (no client), logged out and a throwing cloud
// leave the device's runs exactly as they were; autosaves go up in one throttled batch, and a failed one is retried.
import { CloudSync, GAME, REPLACED, merge, type Saves } from '../src/core/cloud.ts';
import { autosave, resume, type GameState } from '../src/core/save.ts';
import type { Hero } from '../src/player/heroes.ts';

const fail = (why: string) => { throw new Error(why); };
const mem = (): Storage & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
};
const run = (hero: Hero, time: number): GameState => ({ v: 1, hero, player: { x: 0, y: 0, z: 0, yaw: 0, hp: 100, mana: 0, charge: 0 }, quest: { key: false, gates: [], bossDead: false }, dead: [], time });

/** The hub's client over a Map, as /hub/saves.js behaves: logged out sends nothing; `down` throws like a network error. */
function hub(email: string | null) {
  const rows = new Map<string, unknown>(), calls: string[] = [];
  let who: { id: string; email: string } | null = email ? { id: 'u1', email } : null;
  const cbs: ((u: typeof who) => void)[] = [];
  const f = {
    rows, calls, down: false,
    login(e: string | null) { who = e ? { id: e, email: e } : null; for (const cb of cbs) cb(who); },
    client: {
      async load(g, slot = 'default') { calls.push(`load ${slot}`); if (f.down) throw new Error('offline'); return who ? rows.get(`${g}/${slot}`) ?? null : null; },
      async save(g, data, slot = 'default') { calls.push(`save ${slot}`); if (f.down) throw new Error('offline'); if (!who) return false; rows.set(`${g}/${slot}`, JSON.parse(JSON.stringify(data))); return true; },
      async remove(g, slot = 'default') { calls.push(`remove ${slot}`); if (f.down) throw new Error('offline'); if (!who) return false; return rows.delete(`${g}/${slot}`); },
      onUserChange(cb) { cbs.push(cb); queueMicrotask(() => cb(who)); return () => undefined; },
    } as Saves,
  };
  return f;
}
const cloudRun = (h: ReturnType<typeof hub>, hero: Hero) => h.rows.get(`${GAME}/${hero}`) as GameState | undefined;

// Merge: cloud newer comes down (the device's run kept aside), device newer goes up, one side only reaches the other.
{
  const store = mem(), h = hub('a@b.it');
  autosave(run('risorto', 10), store, 1000); // older here
  h.rows.set(`${GAME}/risorto`, { ...run('risorto', 50), at: 2000 });
  autosave(run('bortolo', 70), store, 3000); // newer here
  h.rows.set(`${GAME}/bortolo`, { ...run('bortolo', 20), at: 500 });
  autosave(run('fosca', 5), store, 100); // here only
  h.rows.set(`${GAME}/tizian`, { ...run('tizian', 9), at: 900 }); // there only
  h.rows.set(`${GAME}/zanetto`, { junk: true }); // refused, never laid over anything
  const pulled = await merge(h.client, store);
  if (pulled.sort().join() !== 'risorto,tizian') fail(`pulled ${pulled}`);
  if (resume('risorto', store)?.time !== 50 || resume('risorto', store)?.at !== 2000) fail('newer cloud run not brought down with its stamp');
  if ((JSON.parse(store.getItem(REPLACED('risorto'))!) as GameState).time !== 10) fail('the replaced device run was not kept aside');
  if (cloudRun(h, 'bortolo')?.time !== 70 || resume('bortolo', store)?.time !== 70) fail('newer device run not sent up');
  if (cloudRun(h, 'fosca')?.time !== 5) fail('device-only run not sent up');
  if (resume('tizian', store)?.time !== 9) fail('cloud-only run not brought down');
  const before = [...store.m];
  h.calls.length = 0;
  await merge(h.client, store);
  if (h.calls.some((c) => c.startsWith('save')) || JSON.stringify([...store.m]) !== JSON.stringify(before)) fail('a second merge changed something');
  // The hero in play is never overwritten on the device.
  h.rows.set(`${GAME}/fosca`, { ...run('fosca', 99), at: 9999 });
  if ((await merge(h.client, store, 'fosca')).length || resume('fosca', store)?.time !== 5) fail('the hero in play was overwritten');
  // An older save without a stamp still goes up the first time.
  const old = mem(), h2 = hub('a@b.it');
  old.setItem('redentore.hero.risorto', JSON.stringify(run('risorto', 33)));
  await merge(h2.client, old);
  if (cloudRun(h2, 'risorto')?.time !== 33) fail('an unstamped device run was not sent up');
}

// Offline / local dev: no client. Nothing is sent, nothing changes, nothing shows.
{
  const store = mem();
  autosave(run('risorto', 10), store, 1000);
  const before = JSON.stringify([...store.m]);
  const sync = new CloudSync(store, async () => null, 0);
  await sync.ready;
  sync.push('risorto');
  await sync.flush();
  if (sync.status !== 'none' || JSON.stringify([...store.m]) !== before) fail(`offline: ${sync.status}`);
}

// Logged out: the hub sends nothing; the link to log in shows.
{
  const store = mem(), h = hub(null);
  autosave(run('risorto', 10), store, 1000);
  h.rows.set(`${GAME}/bortolo`, { ...run('bortolo', 1), at: 1 }); // someone else's, unreachable
  const sync = new CloudSync(store, async () => h.client, 0);
  await sync.ready;
  sync.push('risorto');
  await sync.flush();
  if (sync.status !== 'out' || h.calls.length || resume('bortolo', store) || resume('risorto', store)?.time !== 10) fail(`logged out: ${sync.status}, ${h.calls}`);
  // Logging in (another tab) merges at once.
  h.rows.clear();
  h.login('a@b.it');
  await sync.flush();
  if (sync.status !== 'ok' || sync.email !== 'a@b.it' || cloudRun(h, 'risorto')?.time !== 10) fail(`login did not merge: ${sync.status}`);
}

// The cloud throws: the device keeps every run as it was, the state says so, and the upload is retried.
{
  const store = mem(), h = hub('a@b.it');
  autosave(run('risorto', 10), store, 1000);
  h.rows.set(`${GAME}/risorto`, { ...run('risorto', 50), at: 2000 });
  h.down = true;
  const before = JSON.stringify([...store.m]);
  const sync = new CloudSync(store, async () => h.client, 0);
  await sync.ready;
  if (sync.status !== 'error' || JSON.stringify([...store.m]) !== before) fail(`cloud down at boot: ${sync.status}`);
  autosave(run('risorto', 60), store, 3000);
  sync.push('risorto');
  await sync.flush();
  if (sync.status !== 'error' || resume('risorto', store)?.time !== 60) fail('a failed upload touched the device run');
  h.down = false;
  await sync.flush(); // retried
  if (sync.status !== 'ok' || cloudRun(h, 'risorto')?.time !== 60) fail('a failed upload was not retried');
}

// Uploads: autosaves gather into one throttled batch of the latest runs; "Ricomincia" drops the slot.
{
  const store = mem(), h = hub('a@b.it');
  const sync = new CloudSync(store, async () => h.client, 30);
  await sync.ready;
  h.calls.length = 0;
  for (let t = 1; t <= 5; t++) { autosave(run('risorto', t), store, 1000 + t); sync.push('risorto'); }
  autosave(run('bortolo', 7), store, 2000); sync.push('bortolo');
  if (h.calls.length) fail('uploaded before the wait');
  await new Promise((r) => setTimeout(r, 60));
  await sync.flush();
  if (h.calls.join() !== 'save risorto,save bortolo' || cloudRun(h, 'risorto')?.time !== 5) fail(`throttled uploads: ${h.calls}`);
  sync.forget('risorto');
  await new Promise((r) => setTimeout(r, 0));
  if (cloudRun(h, 'risorto') || !cloudRun(h, 'bortolo')) fail('Ricomincia did not drop only his slot');
}

console.log('cloud ok: merge both ways, the hero in play kept, offline / logged out / cloud down leave the device alone, throttled uploads');
