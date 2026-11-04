import { reconcileBuild } from './build-state.ts';
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
  canEditBuild?(hero: Hero): Promise<boolean>;
  onUserChange(cb: (u: { id: string; email: string } | null) => void): () => void;
}

/** The hub's client, or null: offline, local dev, the hub not (yet) deployed. */
export async function connect(): Promise<Saves | null> {
  const url = '/hub/saves.js'; // a variable: served by the hub, not bundled
  try { const hub = await import(/* @vite-ignore */ url) as Saves; const { guardedSaves } = await import('./build-cloud.ts'); return guardedSaves(hub); } catch { return null; }
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
    let back = runOf(parse(store.getItem(REPLACED(hero))), hero);
    if (back?.build?.edit && mine?.build?.edit && back.build.edit.lineage !== mine.build.edit.lineage) back = undefined; // an old run is a backup, never a restore candidate
    if (back && mine) { const next = reconcileBuild(mine, back); if (next !== mine) { if (!autosave(next, store, stamp(mine))) throw Error('Salvataggio locale non disponibile.'); mine = next; } }
    const restored = back ? reconcileBuild(back,mine) : undefined;
    if (restored && hero !== skip && (!mine || lead(restored, mine) < 0) && lay(store, hero, restored, mine)) { mine = restored; pulled.push(hero); }
    const theirs = runOf(await cloud.load(GAME, hero), hero);
    if (mine?.build?.edit && theirs?.build?.edit && mine.build.edit.lineage !== theirs.build.edit.lineage) {
      if (hero === skip) throw Error('La partita cloud è cambiata: copia locale conservata. Esci e riprendi.');
      if (!lay(store,hero,theirs,mine)) throw Error('Salvataggio locale non disponibile.');
      pulled.push(hero); return;
    }
    if (mine && theirs) {
      const w = lead(theirs,mine)<0 ? theirs : mine, d = w === theirs ? mine : theirs;
      const combined = reconcileBuild(w,d);
      if (combined !== w) {
        if (hero === skip && combined.build?.edit?.id !== mine.build?.edit?.id) throw Error('La build cloud è cambiata: copia locale conservata. Esci e riprendi la partita.');
        if (!lay(store,hero,combined,mine)) throw Error('Salvataggio locale non disponibile.');
        mine = combined;
        await send(cloud,combined,hero);
        if(hero!==skip)pulled.push(hero);
        return;
      }
      if (combined.build?.edit && combined.build.edit.id !== theirs.build?.edit?.id) { await send(cloud,combined,hero); return; }
    }
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
  readonly acknowledgedBuild = new Map<Hero,string>();
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

  async buildEditAllowed(hero: Hero): Promise<string | undefined> {
    if (this.status === 'none' || this.status === 'out') return undefined;
    try { return await this.client?.canEditBuild?.(hero) === false ? 'Non puoi modificare la build durante una sessione multiplayer.' : undefined; } catch { return 'Verifica della sessione non disponibile: riprova prima di modificare la build.'; }
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
        for (const hero of heroes) {
          const s = resume(hero,this.store); if (!s) continue;
          const remote = runOf(await this.client.load(GAME,hero),hero);
          const winner = remote && lead(remote,s)<0 ? remote : s;
          const combined = reconcileBuild(winner,winner===s?remote:s);
          if (combined.build?.edit?.id !== s.build?.edit?.id) {
            try { this.store.setItem(REPLACED(hero),JSON.stringify(remote)); } catch { /* current local state remains intact */ }
            throw Error('La build cloud è cambiata: copia locale conservata. Esci e riprendi la partita.');
          }
          await send(this.client,combined,hero);
          if(combined.build?.edit)this.acknowledgedBuild.set(hero,combined.build.edit.id);
        }
        this.set('ok');
      } catch (e) {
        for (const h of heroes) this.dirty.add(h); // tried again with the next push
        this.fail(e);
      }
    });
  }

  /** Serialize an explicitly confirmed restart before any later upload of the new run. */
  forget(hero: Hero): void {
    this.dirty.delete(hero);
    try { this.store.removeItem(REPLACED(hero)); } catch { /* blocked storage */ }
    if (this.user) void this.run(async () => {
      try { if (!await this.client?.remove(GAME,hero)) throw Error('Ripartenza cloud non confermata.'); }
      catch(e) { this.fail(e); }
    });
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
