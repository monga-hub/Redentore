// WoW-style ability runner: 12 bar slots on 1..0 - =, per-ability cooldowns, a 1.5 s global
// cooldown, instant / cast-time / channelled abilities, movement interrupts. No DOM and no
// three.js here, so `npm run check` exercises it in Node (scripts/check-abilities.ts).

export const KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'];
export const GCD = 1.5;
export const CHARGE_MAX = 100;
const MOVING = 0.5; // m/s of feet motion that counts as moving (cancels casts)

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
  mana?: number; // cost, paid when the cooldown starts (instant/channel: on press; cast: when the bar fills)
  charge?: number; // added to the charge bar when the cooldown starts
  special?: boolean; // needs a full charge bar and empties it
  /** Why it can't be used right now (e.g. no target), checked on press; nothing is spent. */
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
}

export type Notice = { kind: 'error' | 'heal' | 'info' | 'done' | 'fail'; text: string };

export class AbilitySystem<C extends Caster = Caster> {
  gcd = 0;
  casting: Casting<C> | null = null;
  /** UI feedback since the last drain: error messages, combat text, cast bar outcomes. */
  notices: Notice[] = [];
  /** 0..CHARGE_MAX: every cast fills it by its `charge`, a special spends it all. */
  charge = 0;
  /** Mana pool abilities with a `mana` cost draw from (player/stats.ts). Absent = free. */
  pool?: { mana: number; spendMana(n: number): boolean };
  readonly slots: (Ability<C> | undefined)[];
  private cds = new Map<string, number>();
  private moving = false;
  private last: { x: number; y: number; z: number };

  readonly ctx: C;

  constructor(abilities: Ability<C>[], bar: (string | null)[], ctx: C) {
    this.ctx = ctx;
    const byId = new Map(abilities.map((a) => [a.id, a]));
    this.slots = KEYS.map((_, i) => (bar[i] ? byId.get(bar[i]!) : undefined));
    const p = ctx.player.pos;
    this.last = { x: p.x, y: p.y, z: p.z };
  }

  cooldown(a: Ability<C>): number {
    return this.cds.get(a.id) ?? 0;
  }

  /** Press slot `i` (keyboard, click or tap). Returns true if something started. */
  tryCast(i: number): boolean {
    const a = this.slots[i];
    if (!a) return false;
    if (this.cooldown(a) > 0) return this.fail('Abilità non ancora pronta.');
    if (!a.offGcd && this.gcd > 0) return false; // WoW stays silent on the GCD
    if (this.casting && !a.offGcd) return this.fail("Un'altra azione è in corso.");
    if ((a.cast || a.channel) && this.moving) return this.fail('Non puoi farlo mentre ti muovi.');
    if (!this.affordable(a)) return this.fail('Mana insufficiente.');
    if (!this.charged(a)) return this.fail('La barra della furia non è piena.');
    const why = a.check?.(this.ctx);
    if (why) return this.fail(why);

    if (!a.offGcd) this.gcd = GCD;
    if (a.cast || a.channel) {
      const total = a.cast ?? a.channel!.duration;
      this.casting = { ability: a, t: 0, total, channel: !a.cast, ticks: 0 };
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

    this.gcd = Math.max(0, this.gcd - dt);
    for (const [id, t] of this.cds) {
      if (t <= dt) this.cds.delete(id);
      else this.cds.set(id, t - dt);
    }

    const c = this.casting;
    if (c) {
      if (this.moving) {
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
          else { this.start(a); a.fire(this.ctx, 0); this.stop(true); }
        }
      }
    }

    KEYS.forEach((k, i) => { if (pressed(k)) this.tryCast(i); });
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
    this.charge = a.special ? 0 : Math.min(CHARGE_MAX, this.charge + (a.charge ?? 0));
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
