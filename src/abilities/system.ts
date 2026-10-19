// WoW-style ability runner: the primary attack on 1, eight slots the player fills from the ability book on 2..9, the
// potion on R; per-ability cooldowns, a 1.5 s global
// cooldown per school (an ice spell holds back the ice ones, not fire or the club), instant /
// cast-time / channelled abilities, movement interrupts, cast pushback when the hero is hit. No DOM
// and no three.js here, so `npm run check` exercises it in Node (scripts/check-abilities.ts).

export const KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'KeyR'];
export const GCD = 1.5;
export const CHARGE_MAX = 100;
/** WoW pushback: each hit taken during a cast sets its bar back this many s, at most PUSHBACKS times per cast. */
export const PUSHBACK = 0.5;
export const PUSHBACKS = 3;
const MOVING = 0.5; // m/s of feet motion that counts as moving (cancels casts)

const LAYOUT = 'redentore.bar';
/** The slots the player fills (ability book, drags), in the order a new unlock takes them: the touch fan's thumb order.
 *  The others are fixed: slot 0 the primary attack (the big button), slot 9 the potion; they keep what the default bar puts there. */
export const SPARE = [1, 2, 3, 4, 5, 6, 7, 8];
export const PRIMARY = 0, POTION = 9;

/** The bar as ability ids (locked ones too), and the abilities the player took off it, which unlocks leave in the book. */
export interface Layout { bar: (string | null)[]; off: string[] }

/**
 * The player's arrangement if one is stored, made sound: the fixed slots as in `def`, each other slot empty or a distinct
 * ability of `known`. The layout keeps abilities owned in earlier runs in their slots too (AbilitySystem shows only the
 * owned ones), so a slot the player gave an ability is kept for it, and unlocks never disturb an arranged bar.
 * A bar from before the book (12 slots, the potion and the club among them) keeps slots 1-8 where they were and moves
 * what sat on 0, 9, 0, -, = into the free ones; the potion and the club go to their fixed slots.
 */
export function loadBar(def: (string | null)[], store?: Storage, known: readonly string[] = def.filter((x): x is string => !!x)): Layout {
  let raw: unknown;
  try { raw = JSON.parse((store ?? localStorage).getItem(LAYOUT) ?? 'null'); } catch { /* blocked storage or junk */ }
  const s: unknown[] | undefined = Array.isArray(raw) ? raw : Array.isArray((raw as Layout | null)?.bar) ? (raw as Layout).bar : undefined;
  if (!s) return { bar: [...def], off: [] }; // nothing stored: the default bar
  const bar = def.map((d, i) => (SPARE.includes(i) ? null : d));
  const fit = (x: unknown): x is string => typeof x === 'string' && known.includes(x) && !bar.includes(x);
  for (const i of SPARE) if (fit(s[i])) bar[i] = s[i];
  for (const x of s) if (fit(x)) { const i = SPARE.find((k) => !bar[k]); if (i !== undefined) bar[i] = x; }
  const o = (raw as Layout).off;
  const off = Array.isArray(o) ? o.filter((x) => known.includes(x) && !bar.includes(x)) : [];
  return { bar, off };
}

/** Remember the bar for `loadBar`. */
export function saveBar(layout: Layout, store?: Storage): void {
  try { (store ?? localStorage).setItem(LAYOUT, JSON.stringify(layout)); } catch { /* not persisted, still applied */ }
}

export interface Caster {
  player: { pos: { x: number; y: number; z: number } };
}

export interface Ability<C extends Caster = Caster> {
  id: string;
  name: string;
  icon: string; // key into ui/icons.ts
  desc: string; // tooltip text
  cooldown: number; // s
  cast?: number; // cast time in s; absent = instant
  channel?: { duration: number; tick: number };
  offGcd?: boolean;
  /** The GCD this ability starts and waits for: one per school (absent: the shared '' one). */
  school?: string;
  /** A channel that goes on while the caster runs (Turbine d'ossa). */
  mobile?: boolean;
  /** A blow of the club (Caduta d'ossa): off the GCD, but the hands are busy while a cast or a channel runs. */
  swing?: boolean;
  mana?: number; // cost, paid when the cooldown starts (instant/channel: on press; cast: when the bar fills)
  charge?: number; // added to the charge bar when the cooldown starts
  special?: boolean; // needs a full charge bar and empties it
  /** Why it can't be used right now (e.g. no target, out of sight), checked on press and again as a cast bar fills; nothing is spent. */
  check?(ctx: C): string | undefined;
  /** Instant: on press. Cast: when the bar fills. Channel: on every tick (`tick` counts from 1). */
  fire(ctx: C, tick: number): void;
  /** Every frame while casting or channelling; `p` is progress 0..1. */
  during?(ctx: C, p: number, dt: number): void;
  /** Cast or channel finished (`ok`) or was interrupted. */
  end?(ctx: C, ok: boolean): void;
  /** Buff currently running: the button glows. */
  active?(ctx: C): boolean;
}

export interface Casting<C extends Caster> {
  ability: Ability<C>;
  t: number;
  total: number;
  channel: boolean;
  ticks: number;
  /** Times hits have set the bar back (PUSHBACKS at most). */
  pushed: number;
}

export type Notice = { kind: 'error' | 'heal' | 'info' | 'done' | 'fail'; text: string };

export class AbilitySystem<C extends Caster = Caster> {
  /** s left of each school's global cooldown. */
  private gcds = new Map<string, number>();
  casting: Casting<C> | null = null;
  /** UI feedback since the last drain: error messages, combat text, cast bar outcomes. */
  notices: Notice[] = [];
  /** 0..CHARGE_MAX: every cast fills it by its `charge`, a special spends it all. */
  charge = 0;
  /** Called as a cast is about to start, before its `check`: the Diablo view turns the hero to the target. */
  aim?: (a: Ability<C>) => void;
  /** Mana pool abilities with a `mana` cost draw from (player/stats.ts). Absent = free. */
  pool?: { mana: number; spendMana(n: number): boolean };
  /** Charge gained per cast ×; after a special the bar restarts at `chargeAfter` (level-up cards). */
  chargeMul = 1;
  chargeAfter = 0;
  /** Cast times and the GCD × (Fra' Bortolo's blessing, Celerità on gear); channels keep their length. */
  castMul = 1;
  /** What each bar slot shows: its ability once owned. The player rearranges it from the book (`equip`, `remove`) or by dragging (`swap`). */
  readonly slots: (Ability<C> | undefined)[];
  private bar: (string | null)[];
  private byId: Map<string, Ability<C>>;
  private owned: Set<string>;
  private off: Set<string>; // taken off the bar by the player: unlocks leave them in the book
  private cds = new Map<string, number>();
  private moving = false;
  private last: { x: number; y: number; z: number };

  readonly ctx: C;

  /** `owned`: the abilities shown from the start (default all); `unlock` adds more. `off`: the ones the player took off the bar. */
  constructor(abilities: Ability<C>[], bar: (string | null)[], ctx: C, owned?: Iterable<string>, off: Iterable<string> = []) {
    this.ctx = ctx;
    this.byId = new Map(abilities.map((a) => [a.id, a]));
    this.bar = KEYS.map((_, i) => bar[i] ?? null);
    this.owned = new Set(owned ?? abilities.map((a) => a.id));
    this.off = new Set(off);
    for (const id of this.owned) this.place(id);
    this.slots = [];
    this.fill();
    const p = ctx.player.pos;
    this.last = { x: p.x, y: p.y, z: p.z };
  }

  cooldown(a: Ability<C>): number {
    return this.cds.get(a.id) ?? 0;
  }

  /** s left of the global cooldown `a` waits for: its school's; 0 off the GCD. */
  gcd(a: Ability<C>): number {
    return a.offGcd ? 0 : this.gcds.get(a.school ?? '') ?? 0;
  }

  /** Press slot `i` (keyboard, click or tap). Returns true if something started. */
  tryCast(i: number): boolean {
    const a = this.slots[i];
    if (!a) return false;
    if (this.cooldown(a) > 0) return this.fail('Abilità non ancora pronta.');
    if (this.gcd(a) > 0) return false; // WoW stays silent on the GCD
    if (this.casting && (!a.offGcd || a.swing)) return this.fail("Un'altra azione è in corso.");
    if ((a.cast || (a.channel && !a.mobile)) && this.moving) return this.fail('Non puoi farlo mentre ti muovi.');
    if (!this.affordable(a)) return this.fail('Mana insufficiente.');
    if (!this.charged(a)) return this.fail('La barra della furia non è piena.');
    this.aim?.(a);
    const why = a.check?.(this.ctx);
    if (why) return this.fail(why);

    if (!a.offGcd) this.gcds.set(a.school ?? '', GCD * this.castMul);
    if (a.cast || a.channel) {
      const total = a.cast ? a.cast * this.castMul : a.channel!.duration;
      this.casting = { ability: a, t: 0, total, channel: !a.cast, ticks: 0, pushed: 0 };
      if (a.channel) this.start(a); // channels start their cooldown at once
    } else {
      this.start(a);
      a.fire(this.ctx, 0);
    }
    return true;
  }

  /** Call once per frame before the player moves. `pressed`: true once per key press. */
  update(dt: number, pressed: (code: string) => boolean): void {
    const p = this.ctx.player.pos;
    this.moving = dt > 0 && Math.hypot(p.x - this.last.x, p.y - this.last.y, p.z - this.last.z) / dt > MOVING;
    this.last = { x: p.x, y: p.y, z: p.z };

    for (const [k, t] of this.gcds) {
      if (t <= dt) this.gcds.delete(k);
      else this.gcds.set(k, t - dt);
    }
    for (const [id, t] of this.cds) {
      if (t <= dt) this.cds.delete(id);
      else this.cds.set(id, t - dt);
    }

    const c = this.casting;
    if (c) {
      if (this.moving && !c.ability.mobile) {
        this.stop(false);
      } else {
        c.t = Math.min(c.total, c.t + dt);
        const a = c.ability;
        a.during?.(this.ctx, c.t / c.total, dt);
        if (c.channel) {
          const due = Math.floor(c.t / a.channel!.tick + 1e-6);
          while (c.ticks < due) a.fire(this.ctx, ++c.ticks);
        }
        if (c.t >= c.total) {
          if (c.channel) this.stop(true);
          else if (!this.affordable(a)) { this.stop(false); this.fail('Mana insufficiente.'); }
          else if (a.check?.(this.ctx)) { const why = a.check(this.ctx)!; this.stop(false); this.fail(why); } // the target went out of sight: nothing spent
          else { this.start(a); a.fire(this.ctx, 0); this.stop(true); }
        }
      }
    }

    KEYS.forEach((k, i) => { if (pressed(k)) this.tryCast(i); });
  }

  /** Exchange two of the player's slots (one may look empty): keys and buttons follow the slots, cooldowns the abilities. The fixed ones stay. */
  swap(i: number, j: number): void {
    if (!SPARE.includes(i) || !SPARE.includes(j)) return;
    [this.bar[i], this.bar[j]] = [this.bar[j], this.bar[i]];
    this.fill();
  }

  /** The book's Equipaggia: owned ability `id` into the player's slot `i`. One already on the bar swaps places; one
   *  from the book sends what was there back to the book. */
  equip(id: string, i: number): void {
    if (!SPARE.includes(i) || !this.owned.has(id) || (this.bar.includes(id) && !SPARE.includes(this.bar.indexOf(id)))) return; // the fixed ones stay
    if (this.bar.includes(id)) return this.swap(this.bar.indexOf(id), i);
    const was = this.bar[i];
    if (was && this.owned.has(was)) this.off.add(was);
    this.bar[i] = id;
    this.off.delete(id);
    this.fill();
  }

  /** The book's Rimuovi: empty the player's slot `i`; its ability stays in the book until equipped again. */
  remove(i: number): void {
    const id = this.bar[i];
    if (!SPARE.includes(i) || !id) return;
    if (this.owned.has(id)) this.off.add(id);
    this.bar[i] = null;
    this.fill();
  }

  /**
   * Show ability `id` on the bar as it becomes owned: in the slot the layout keeps for it, else the first empty slot, else
   * the first that only remembers an ability not owned now (SPARE order: the touch ring's thumb order), unless the player took
   * it off; with every slot taken it waits in the book. Owning it already changes nothing, so a removed one stays off.
   * Several at once (a load replaying the picks and the tomes) are all owned before any is placed, so one waiting in the
   * book never takes the slot the bar keeps for another.
   */
  unlock(...ids: string[]): void {
    const fresh = ids.filter((id) => !this.owned.has(id));
    for (const id of fresh) this.owned.add(id);
    for (const id of fresh) this.place(id);
    this.fill();
  }

  /** A level-up card picked just now: `id` goes on the bar even if an earlier run took it off. */
  learn(id: string): void {
    this.off.delete(id);
    this.owned.add(id);
    this.place(id);
    this.fill();
  }

  private place(id: string): void {
    if (this.bar.includes(id) || this.off.has(id)) return;
    const i = SPARE.find((k) => !this.bar[k]) ?? SPARE.find((k) => !this.owned.has(this.bar[k]!)); // an empty one first: a load owns the rest only as it replays the picks
    if (i !== undefined) this.bar[i] = id;
  }

  owns(id: string): boolean {
    return this.owned.has(id);
  }

  /** The bar as ability ids, locked ones too, and what the player took off: the shape `loadBar` reads back. */
  layout(): Layout {
    return { bar: [...this.bar], off: [...this.off] };
  }

  private fill(): void {
    this.bar.forEach((id, i) => { this.slots[i] = id && this.owned.has(id) ? this.byId.get(id) : undefined; });
  }

  /** The hero was hit: a cast bar (not a channel) goes back PUSHBACK s, PUSHBACKS times a cast at most. */
  pushback(): void {
    const c = this.casting;
    if (!c || c.channel || c.pushed >= PUSHBACKS) return;
    c.pushed++;
    c.t = Math.max(0, c.t - PUSHBACK);
  }

  /** Interrupt whatever is being cast (e.g. Esc). */
  cancel(): void {
    if (this.casting) this.stop(false);
  }

  affordable(a: Ability<C>): boolean {
    return !a.mana || !this.pool || this.pool.mana >= a.mana;
  }

  /** Specials wait for a full charge bar. */
  charged(a: Ability<C>): boolean {
    return !a.special || this.charge >= CHARGE_MAX;
  }

  private start(a: Ability<C>): void {
    this.cds.set(a.id, a.cooldown);
    if (a.mana) this.pool?.spendMana(a.mana);
    this.charge = a.special ? this.chargeAfter : Math.min(CHARGE_MAX, this.charge + (a.charge ?? 0) * this.chargeMul);
  }

  private stop(ok: boolean): void {
    const c = this.casting!;
    this.casting = null;
    c.ability.end?.(this.ctx, ok);
    this.notices.push(ok ? { kind: 'done', text: c.ability.name } : { kind: 'fail', text: 'Interrotto' });
  }

  private fail(text: string): false {
    this.notices.push({ kind: 'error', text });
    return false;
  }
}
