// Crowd control on enemies, WoW style: slows (chill), roots (frozen in ice), stuns, burning and poison for the
// looks, and Febbre di palude's vulnerability (every hit lands harder). Every mob carries one `Control`; abilities lay effects on it (abilities/grimoire.ts), the brains
// read it (brain.ts, caster.ts: a stunned mob does nothing and loses its cast, a rooted one can't walk,
// a slowed one walks slower) and the views tint and freeze the bodies (friars.ts, priests.ts, bees.ts).
// Hard control (roots, stuns) has diminishing returns per mob: each one within DR_RESET s of the last
// lasts half as long, the fourth is shrugged off. `resist` scales every duration and slow: the
// Reverendissimo's is low, so he is never locked down for long. No three.js: `npm run check` drives it.

export const DR_RESET = 15; // s without hard control before a mob's diminishing returns reset
const DR_IMMUNE = 3; // the fourth root or stun in a row does nothing

export interface Control {
  slow: number; // s of chill left
  slowK: number; // speed multiplier while chilled
  root: number; // s frozen in place
  stun: number; // s stunned
  burn: number; // s burning (damage is the caster's, this is the look)
  poison: number; // s poisoned (the same: the look)
  vuln: number; // s exposed: every hit lands vulnK harder (the brains' `hurt`)
  vulnK: number;
  dr: number; // hard controls in a row
  drT: number; // s since the last one
  resist: number; // 0..1: durations ×, slows ×
}

export const control = (resist = 1): Control => ({ slow: 0, slowK: 1, root: 0, stun: 0, burn: 0, poison: 0, vuln: 0, vulnK: 0, dr: 0, drT: DR_RESET, resist });

/** Every frame: timers run down (the evading and the dead are cleared by `clear`). */
export function tick(c: Control, dt: number): void {
  c.slow = Math.max(0, c.slow - dt);
  c.root = Math.max(0, c.root - dt);
  c.stun = Math.max(0, c.stun - dt);
  c.burn = Math.max(0, c.burn - dt);
  c.poison = Math.max(0, c.poison - dt);
  c.vuln = Math.max(0, c.vuln - dt);
  if ((c.drT += dt) >= DR_RESET) c.dr = 0;
}

export function clear(c: Control): void {
  c.slow = c.root = c.stun = c.burn = c.poison = c.vuln = 0;
  c.slowK = 1;
}

/** Chill: walk at `k` of the speed for `t` s (the stronger slow wins; resist softens it). */
export function chill(c: Control, t: number, k: number): void {
  const kk = 1 - (1 - k) * c.resist;
  if (kk <= c.slowK || c.slow <= 0) c.slowK = kk;
  c.slow = Math.max(c.slow, t * Math.max(c.resist, 0.5));
}

/** Hard control for `t` s before resist and diminishing returns; returns the seconds it actually lasts. */
function hard(c: Control, t: number): number {
  if (c.dr >= DR_IMMUNE && c.drT < DR_RESET) return 0;
  const d = t * c.resist * 0.5 ** c.dr;
  c.dr++;
  c.drT = 0;
  return d;
}

export function root(c: Control, t: number): number {
  const d = hard(c, t);
  c.root = Math.max(c.root, d);
  return d;
}

export function stun(c: Control, t: number): number {
  const d = hard(c, t);
  c.stun = Math.max(c.stun, d);
  return d;
}

/** Exposed for `t` s: every hit lands `k` harder (+0.2 = +20%); resist halves it at most, so the bosses take a little more, not much. */
export function expose(c: Control, t: number, k: number): void {
  c.vulnK = Math.max(c.vuln > 0 ? c.vulnK : 0, k * Math.max(c.resist, 0.5));
  c.vuln = Math.max(c.vuln, t);
}

/** Damage `n` as an exposed mob takes it. */
export const exposed = (c: Control | undefined, n: number) => (c && c.vuln > 0 ? n * (1 + c.vulnK) : n);

/** How fast the mob may walk now: 0 rooted or stunned, the chill's share slowed. */
export const pace = (c: Control) => (c.stun > 0 || c.root > 0 ? 0 : c.slow > 0 ? c.slowK : 1);
/** Frozen solid: rooted by frost (Stiletto di ghiaccio shatters it). */
export const frozen = (c: Control) => c.root > 0;
export const chilled = (c: Control) => c.slow > 0 || c.root > 0;
/** How fast a body animates: frozen solid stops dead, a stun barely sways. */
export const still = (c: Control) => (c.root > 0 ? 0 : c.stun > 0 ? 0.12 : 1);
