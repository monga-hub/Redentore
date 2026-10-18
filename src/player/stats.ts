// Player resources: health and mana. The single owner of the player's stats; enemies call
// `takeDamage`, abilities `spendMana`/`heal`. No DOM and no three.js, so `npm run check`
// exercises it in Node. Also exposed as `window.playerStats` (see main.ts).

export const VEIL_CUT = 0.5; // Velo spettrale: share of incoming damage it takes off
export const GUARD_CUT = 0.3; // Turbine d'ossa: the whirling club parries this share

export class PlayerStats {
  hp: number;
  mana: number;
  /** s left of Velo spettrale (incoming damage × VEIL_CUT off) and of total immunity. */
  veil = 0;
  immune = 0;
  /** s left of the whirl's parry (refreshed every frame of Turbine d'ossa). */
  guard = 0;
  /** Called once when health reaches 0. */
  onDeath?: () => void;
  /** Called with the damage actually taken, before `onDeath` (the hero flinches). */
  onHurt?: (n: number) => void;

  hpMax: number;
  manaMax: number;
  /** Level-up cards and armor: share of incoming damage taken, and mana/s, always on. */
  armor = 1;
  regen = 2;
  private base: [number, number];

  constructor(hpMax = 1280, manaMax = 400) {
    this.hp = this.hpMax = hpMax;
    this.mana = this.manaMax = manaMax;
    this.base = [hpMax, manaMax];
  }

  /** Scale the maxima off the starting ones and add the gear's flat `plusHp`/`plusMana`; what a raise adds is filled in at once. */
  grow(hp: number, mana: number, plusHp = 0, plusMana = 0): void {
    const h = Math.round(this.base[0] * hp + plusHp), m = Math.round(this.base[1] * mana + plusMana);
    if (!this.dead) this.hp = Math.min(h, this.hp + Math.max(0, h - this.hpMax));
    this.mana = Math.min(m, this.mana + Math.max(0, m - this.manaMax));
    this.hpMax = h;
    this.manaMax = m;
  }

  get dead(): boolean {
    return this.hp <= 0;
  }

  /** Returns the damage actually taken. */
  takeDamage(n: number): number {
    if (this.dead || !(n > 0) || this.immune > 0) return 0;
    const d = Math.min((this.veil > 0 ? n * (1 - VEIL_CUT) : n) * (this.guard > 0 ? 1 - GUARD_CUT : 1) * this.armor, this.hp);
    this.hp -= d;
    if (d > 0) this.onHurt?.(d);
    if (this.dead) this.onDeath?.();
    return d;
  }

  /** Returns the health actually restored. The dead stay dead (see `revive`). */
  heal(n: number): number {
    if (this.dead || !(n > 0)) return 0;
    const h = Math.min(n, this.hpMax - this.hp);
    this.hp += h;
    return h;
  }

  /** Spends `n` mana if there is enough; false (and nothing spent) otherwise. */
  spendMana(n: number): boolean {
    if (this.mana < n) return false;
    this.mana -= n;
    return true;
  }

  restoreMana(n: number): number {
    const m = Math.min(Math.max(n, 0), this.manaMax - this.mana);
    this.mana += m;
    return m;
  }

  revive(): void {
    this.hp = this.hpMax;
    this.mana = this.manaMax;
  }

  update(dt: number): void {
    this.veil = Math.max(0, this.veil - dt);
    this.immune = Math.max(0, this.immune - dt);
    this.guard = Math.max(0, this.guard - dt);
    if (!this.dead) this.restoreMana(this.regen * dt);
  }
}

declare global {
  interface Window { playerStats: PlayerStats }
}
