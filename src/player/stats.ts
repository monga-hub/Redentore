// Player resources: health and mana. The single owner of the player's stats; enemies call
// `takeDamage`, abilities `spendMana`/`heal`. No DOM and no three.js, so `npm run check`
// exercises it in Node. Also exposed as `window.playerStats` (see main.ts).

const MANA_REGEN = 2.5; // mana/s, always on

export class PlayerStats {
  hp: number;
  mana: number;
  /** Called once when health reaches 0. */
  onDeath?: () => void;

  readonly hpMax: number;
  readonly manaMax: number;

  constructor(hpMax = 1280, manaMax = 400) {
    this.hp = this.hpMax = hpMax;
    this.mana = this.manaMax = manaMax;
  }

  get dead(): boolean {
    return this.hp <= 0;
  }

  /** Returns the damage actually taken. */
  takeDamage(n: number): number {
    if (this.dead || !(n > 0)) return 0;
    const d = Math.min(n, this.hp);
    this.hp -= d;
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
    if (!this.dead) this.restoreMana(MANA_REGEN * dt);
  }
}

declare global {
  interface Window { playerStats: PlayerStats }
}
