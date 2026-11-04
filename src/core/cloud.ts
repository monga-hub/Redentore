// Cloud saves: each hero's run (core/save.ts) mirrored to the player's Mongames account through the hub's save client,
// https://monga-hub.github.io/hub/saves.js, imported at runtime (the game is on the hub's origin and shares its login).
// The run on the device stays the one played: logged out, offline, in `npm run dev` or with the hub missing, nothing
// changes. Logged in, each hero is a slot of his own (slot = hero id), like his key on the device: an autosave uploads
// only that hero, "Ricomincia" drops only his slot, and two devices playing different heroes never overwrite each other.
// On boot and on every login, device and account are merged hero by hero: the run further on (more XP, then more time
// played, then the newer `at` stamp) wins both ways. Along one run that is the newer copy; two runs of a hero that met
// for the first time (a level-16 hero kept on the computer before cloud saves, a new one tried on the phone) keep the
// further one, never the one touched last. A device run the cloud replaces is kept once under REPLACED (and comes
// back if it is further on, as the newest-wins merge of the first release could bury one there); an error leaves the
// device's runs untouched and shows on the account line.
// No DOM, so `npm run check` drives it in Node with a fake client (scripts/check-cloud.ts).
import { ahead, autosave, resume, valid, type GameState } from './save.ts';
import { HERO_IDS, heroOf, type Hero } from '../player/heroes.ts';

export const GAME = 'redentore'; // the hub's game_id
/** A device run the cloud's newer one replaced, kept as it was. */
export const REPLACED = (hero: Hero) => `redentore.replaced.${hero}`;

/** The slice of /hub/saves.js used here (see the hub's README, "Salvataggi nel cloud"). */
export interface Saves {
  load(game: string, slot?: string): Promise<unknown>;
  save(game: string, data: unknown, slot?: string): Promise<boolean>;
  remove(game: string, slot?: string): Promise<boolean>;
  /** Called now and on every login, logout and token refresh. */
  onUserChange(cb: (u: { id: string; email: string } | null) => void): () => void;
}

/** The hub's client, or null: offline, local dev, the hub not (yet) deployed. */
export async function connect(): Promise<Saves | null> {
  const url = '/hub/saves.js'; // a variable: served by the hub, not bundled
  try { return await import(/* @vite-ignore */ url) as Saves; } catch { return null; }
}

const stamp = (s?: GameState) => s?.at ?? 0;
/** Negative when `a` is further on than `b`; 0 for the same run. */
const lead = (a: GameState, b: GameState) => ahead(a, b) || stamp(b) - stamp(a);
const parse = (r: string | null): unknown => { try { return JSON.parse(r ?? 'null'); } catch { return null; } };
/** Sends `s` as `hero`'s slot; false from the hub (no session after all) is an error too. */
async function send(cloud: Saves, s: GameState, hero: Hero): Promise<void> {
  if (!await cloud.save(GAME, s, hero)) throw new Error('nessuna sessione');
}

/** `hero`'s run as `got` holds it, or undefined. */
const runOf = (got: unknown, hero: Hero) => (valid(got) && heroOf(got.hero) === hero ? got : undefined);

/** Keep `s` as `hero`'s run on the device, the run it replaces under REPLACED. False (nothing changed) without room. */
function lay(store: Storage, hero: Hero, s: GameState, mine?: GameState): boolean {
  try { if (mine) store.setItem(REPLACED(hero), JSON.stringify(mine)); } catch { return false; } // no room for the backup: the device keeps its own
  return autosave(s, store, stamp(s));
}

/**
 * Device and account, hero by hero: the run further on is copied over the other; a run on one side only goes to the
 * other. `skip`, the hero being played, is never overwritten on the device (his next upload goes up). The heroes whose
 * device run changed are returned. Throws on the first cloud error, every device write before it sound.
 */
export async function merge(cloud: Saves, store: Storage, skip?: Hero): Promise<Hero[]> {
  const pulled: Hero[] = [];
  await Promise.all(HERO_IDS.map(async (hero) => {
    let mine = resume(hero, store);
    const back = runOf(parse(store.getItem(REPLACED(hero))), hero);
    if (back && hero !== skip && (!mine || lead(back, mine) < 0) && lay(store, hero, back, mine)) { mine = back; pulled.push(hero); }
    const theirs = runOf(await cloud.load(GAME, hero), hero);
    if (theirs && (!mine || lead(theirs, mine) < 0)) {
      if (hero !== skip && lay(store, hero, theirs, mine) && !pulled.includes(hero)) pulled.push(hero);
    } else if (mine && (!theirs || lead(mine, theirs) < 0)) await send(cloud, mine, hero);
  }));
  return pulled;
}

/** none: no hub client, nothing shown. out: logged out. sync: talking to the account. ok: all sent. error: kept on the device only (`error` says why). */
export type Status = 'none' | 'out' | 'sync' | 'ok' | 'error';

/** The live mirror main.ts and the screens share: login state, the boot merge, throttled uploads. */
export class CloudSync {
  status: Status = 'none';
  email = '';
  /** Why the last talk with the account failed ('' when it did not). */
  error = '';
  /** The hero in play: merges leave his device run alone. */
  playing?: Hero;
  /** Settles once the client is known and the first merge (if logged in) is over. */
  readonly ready: Promise<void>;
  private client: Saves | null = null;
  private user = '';
  private dirty = new Set<Hero>();
  private timer?: ReturnType<typeof setTimeout>;
  private queue = Promise.resolve();
  private seen = new Set<() => void>();
  private store: Storage;
  private wait: number;

  constructor(store: Storage = localStorage, client: () => Promise<Saves | null> = connect, wait = 15e3) {
    this.store = store;
    this.wait = wait;
    this.ready = client().then((c) => new Promise<void>((first) => {
      this.client = c;
      if (!c) return first();
      try {
        c.onUserChange((u) => { this.run(() => this.login(u)).then(() => first()); });
      } catch (e) { this.fail(e); first(); }
    }));
  }

  /** Call `f` on every change; it is dropped once it returns false (a screen gone). */
  on(f: () => boolean | void): void {
    const g = () => { if (f() === false) this.seen.delete(g); };
    this.seen.add(g);
  }

  /** A hero's run was kept on the device: sent within `wait`, together with any other kept meanwhile. */
  push(hero: Hero): void {
    if (this.status === 'none' || this.status === 'out') return;
    this.dirty.add(hero);
    this.timer ??= setTimeout(() => void this.flush(), this.wait);
  }

  /** Send what is waiting now (the tab hidden, the hero changed). */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    return this.run(async () => {
      if (!this.client || !this.user || !this.dirty.size) return;
      const heroes = [...this.dirty];
      this.dirty.clear();
      this.set('sync');
      try {
        for (const hero of heroes) { const s = resume(hero, this.store); if (s) await send(this.client, s, hero); }
        this.set('ok');
      } catch (e) {
        for (const h of heroes) this.dirty.add(h); // tried again with the next push
        this.fail(e);
      }
    });
  }

  /**
   * "Ricomincia": his slot and his device backup go too (if the removal fails, his new run's first upload replaces it).
   * ponytail: another device still holding his old run sends it up again, and being further on it comes back here
   * (the new one kept under REPLACED): Ricomincia there too. A per-run id would tell the two apart, if it ever matters.
   */
  forget(hero: Hero): void {
    this.dirty.delete(hero);
    try { this.store.removeItem(REPLACED(hero)); } catch { /* blocked storage */ }
    if (this.user) this.client?.remove(GAME, hero).catch(() => { /* replaced by the next upload */ });
  }

  private async login(u: { id: string; email: string } | null): Promise<void> {
    if (!u) { this.user = this.email = ''; this.dirty.clear(); this.set('out'); return; }
    if (u.id === this.user && this.status !== 'error') return; // a token refresh
    this.user = u.id;
    this.email = u.email;
    this.set('sync');
    try {
      await merge(this.client!, this.store, this.playing);
      this.set('ok');
    } catch (e) { this.fail(e); }
  }

  /** One talk with the account at a time. */
  private run(f: () => Promise<void>): Promise<void> {
    return (this.queue = this.queue.then(f)); // f never throws
  }

  private fail(e: unknown): void {
    this.error = (e as { message?: string })?.message || String(e);
    console.warn('Redentore: salvataggio nel cloud non riuscito', e);
    this.set('error');
  }

  private set(s: Status): void {
    if (s !== 'error') this.error = '';
    this.status = s;
    for (const f of [...this.seen]) f();
  }
}
