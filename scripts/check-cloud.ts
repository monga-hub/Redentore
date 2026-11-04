// Cloud saves check (`npm run check`): with a fake hub client, the device and the account merge hero by hero, the run
// further on winning: a cloud run further on comes down (the device's kept aside), a newer device run goes up, a run on one side
// only reaches the other; the hero in play is never overwritten; offline (no client), logged out and a throwing cloud
// leave the device's runs exactly as they were; autosaves go up in one throttled batch, and a failed one is retried.
import { CloudSync, GAME, REPLACED, merge, type Saves } from '../src/core/cloud.ts';
import { autosave, resume, type GameState } from '../src/core/save.ts';
import { HERO_IDS, HEROES, type Hero } from '../src/player/heroes.ts';
import { starter } from '../src/loot/gear.ts';

const fail = (why: string) => { throw new Error(why); };
console.warn = () => undefined; // the failures below are meant
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

// The captain's case: a level-16 run kept on the computer before cloud saves (no stamp), a level-1 run of the same hero
// tried on the phone today (stamped). Further on wins, not newer: the computer sends it up, the phone brings it down
// (its own kept aside), and the phone's run never buries it, whichever device logs in first.
for (const computerFirst of [true, false]) {
  const pc = mem(), phone = mem(), h = hub('a@b.it');
  const old = { ...run('bortolo', 7200), build: { xp: 99999, lv: 16, picks: [] } };
  pc.setItem('redentore.hero.bortolo', JSON.stringify(old)); // no `at`: kept before cloud saves
  autosave({ ...run('bortolo', 300), build: { xp: 10, lv: 1, picks: [] } }, phone, Date.now());
  const order = computerFirst ? [pc, phone, pc] : [phone, pc, phone, pc];
  for (const store of order) await merge(h.client, store);
  if (cloudRun(h, 'bortolo')?.time !== 7200) fail(`computer first ${computerFirst}: the cloud holds ${cloudRun(h, 'bortolo')?.time}, not the level-16 run`);
  if (resume('bortolo', phone)?.time !== 7200) fail(`computer first ${computerFirst}: the phone does not show the level-16 run`);
  if (resume('bortolo', pc)?.time !== 7200) fail(`computer first ${computerFirst}: the computer lost its level-16 run`);
  if ((JSON.parse(phone.getItem(REPLACED('bortolo'))!) as GameState).time !== 300) fail('the phone\'s own run was not kept aside');
}
// Along one run, the copy played on is further on and goes up as before.
{
  const pc = mem(), phone = mem(), h = hub('a@b.it');
  autosave(run('risorto', 100), pc, 1000);
  await merge(h.client, pc);
  await merge(h.client, phone);
  autosave(run('risorto', 160), phone, 2000); // played on, on the phone
  await merge(h.client, phone);
  if ((await merge(h.client, pc)).join() !== 'risorto' || resume('risorto', pc)?.time !== 160) fail('the run played on did not reach the computer');
}
// A run the first release's newest-wins merge buried under REPLACED comes back, and goes up again.
{
  const pc = mem(), h = hub('a@b.it');
  autosave({ ...run('bortolo', 300), build: { xp: 10, lv: 1, picks: [] } }, pc, 5000);
  pc.setItem(REPLACED('bortolo'), JSON.stringify({ ...run('bortolo', 7200), build: { xp: 99999, lv: 16, picks: [] } }));
  h.rows.set(`${GAME}/bortolo`, { ...run('bortolo', 300), build: { xp: 10, lv: 1, picks: [] }, at: 5000 });
  if ((await merge(h.client, pc)).join() !== 'bortolo' || resume('bortolo', pc)?.time !== 7200 || cloudRun(h, 'bortolo')?.time !== 7200) fail('the buried run did not come back');
  if ((JSON.parse(pc.getItem(REPLACED('bortolo'))!) as GameState).time !== 300) fail('the run laid over the buried one was not kept aside');
  // "Ricomincia" drops the backup with the slot, so it never comes back over the new run.
  const sync = new CloudSync(pc, async () => h.client, 0);
  await sync.ready;
  sync.forget('bortolo');
  if (pc.getItem(REPLACED('bortolo'))) fail('Ricomincia kept the backup');
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

// The hub says no (save → false: no session after all): not "saved", the reason kept for the account line.
{
  const store = mem(), h = hub('a@b.it');
  autosave(run('risorto', 10), store, 1000);
  h.client.save = async () => false;
  const sync = new CloudSync(store, async () => h.client, 0);
  await sync.ready;
  if (sync.status !== 'error' || !sync.error) fail(`a refused upload at boot: ${sync.status}`);
  sync.push('risorto');
  await sync.flush();
  if (sync.status !== 'error' || !sync.error) fail(`a refused autosave: ${sync.status}`);
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
  if (h.calls.join() !== 'load risorto,save risorto,load bortolo,save bortolo' || cloudRun(h, 'risorto')?.time !== 5) fail(`throttled uploads: ${h.calls}`);
  sync.forget('risorto');
  await new Promise((r) => setTimeout(r, 0));
  if (cloudRun(h, 'risorto') || !cloudRun(h, 'bortolo')) fail('Ricomincia did not drop only his slot');
}

console.log('cloud ok: merge both ways, further on wins (a level-16 run kept before cloud saves reaches the phone), a buried run comes back, refused uploads shown, the hero in play kept, offline / logged out / cloud down leave the device alone, throttled uploads');

// Whole outfits, retained legacy inventory and currencies travel independently for all five heroes.
{
  const desktop = mem(), phone = mem(), h = hub('outfits@test.invalid');
  for (const hero of HERO_IDS) {
    const state = run(hero, 123);
    state.gear = starter(HEROES[hero].weapon);
    state.bag = { gold: 12345, items: [['canapa-torso', 1], ['unknown-recoverable', 2]] };
    state.build = { xp: 20, lv: 2, picks: ['hp'], learned: [], main: '' };
    autosave(state, desktop, 4321);
  }
  await merge(h.client, desktop);
  await merge(h.client, phone);
  for (const hero of HERO_IDS) {
    const a = resume(hero, desktop)!, b = resume(hero, phone)!;
    if (JSON.stringify(a) !== JSON.stringify(b) || !b.gear?.abito || b.bag?.gold !== 12345) fail(`whole outfit cloud round trip lost ${hero}`);
  }
}
