// Cloud saves: each hero's run (core/save.ts) mirrored to the player's Mongames account through the hub's save client,
// https://monga-hub.github.io/hub/saves.js, imported at runtime (the game is on the hub's origin and shares its login).
// The run on the device stays the one played: logged out, offline, in `npm run dev` or with the hub missing, nothing
// changes. Logged in, each hero is a slot of his own (slot = hero id), like his key on the device: an autosave uploads
// only that hero, "Ricomincia" drops only his slot, and two devices playing different heroes never overwrite each other.
// On boot and on every login, device and account are merged hero by hero by the run's `at` stamp: the newer wins
// both ways. A device run the cloud replaces is kept once under REPLACED; an error leaves the device's runs untouched.
// No DOM, so `npm run check` drives it in Node with a fake client (scripts/check-cloud.ts).
import { autosave, resume, valid, type GameState } from './save.ts';
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

/**
 * Device and account, hero by hero: the newer run (by `at`) is copied over the older; a run on one side only goes to
 * the other. `skip`, the hero being played, is never overwritten on the device (his next upload wins). The heroes whose
 * device run changed are returned. Throws on the first cloud error, every device write before it sound.
 */
export async function merge(cloud: Saves, store: Storage, skip?: Hero): Promise<Hero[]> {
  const pulled: Hero[] = [];
  await Promise.all(HERO_IDS.map(async (hero) => {
    const got = await cloud.load(GAME, hero);
    const theirs = valid(got) && heroOf(got.hero) === hero ? got : undefined, mine = resume(hero, store);
    if (theirs && (!mine || stamp(theirs) > stamp(mine))) {
      if (hero === skip) return;
      try { if (mine) store.setItem(REPLACED(hero), JSON.stringify(mine)); } catch { return; } // no room for the backup: the device keeps its own
      if (autosave(theirs, store, stamp(theirs))) pulled.push(hero);
    } else if (mine && (!theirs || stamp(mine) > stamp(theirs))) await cloud.save(GAME, mine, hero);
  }));
  return pulled;
}

/** none: no hub client, nothing shown. out: logged out. sync: talking to the account. ok: all sent. error: kept on the device only. */
export type Status = 'none' | 'out' | 'sync' | 'ok' | 'error';

/** The live mirror main.ts and the screens share: login state, the boot merge, throttled uploads. */
export class CloudSync {
  status: Status = 'none';
  email = '';
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
      } catch { this.set('error'); first(); }
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
      const send = [...this.dirty];
      this.dirty.clear();
      this.set('sync');
      try {
        for (const hero of send) { const s = resume(hero, this.store); if (s) await this.client.save(GAME, s, hero); }
        this.set('ok');
      } catch {
        for (const h of send) this.dirty.add(h); // tried again with the next push
        this.set('error');
      }
    });
  }

  /** "Ricomincia": his slot goes too (if this fails, his new run's first upload replaces it). */
  forget(hero: Hero): void {
    this.dirty.delete(hero);
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
    } catch { this.set('error'); }
  }

  /** One talk with the account at a time. */
  private run(f: () => Promise<void>): Promise<void> {
    return (this.queue = this.queue.then(f)); // f never throws
  }

  private set(s: Status): void {
    this.status = s;
    for (const f of [...this.seen]) f();
  }
}
