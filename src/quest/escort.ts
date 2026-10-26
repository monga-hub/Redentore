// WoW's escort: a quest giver walks a path at a procession's pace, with health of his own, and the mobs his quest wakes go
// for him, not the hero. Plain state, no three.js, so `npm run check` walks it in Node: quest/squero.ts drives it from the
// quest's steps (an `escort` want: on to that point of the path, then he stands while a wave is up), main.ts points the
// woken at him and lays their blows on him, quest/view.ts draws him where he is. If he falls the quest goes back to its
// first step and he to his starting place, whole (a retry); a load starts the walk over the same way.

/** Where he stands or walks: feet and facing (0 faces -Z). */
export interface Pose { x: number; y: number; z: number; yaw: number }

/**
 * His health, and the share of it he prays back each s he walks (between the waves: each wave is a fight of its own); his pace,
 * how near the hero must come to set him off and how far ahead he will not walk. A wave of 4 monaci neri strikes at ~255 dps:
 * in scripts/balance.ts incoronazione every build at 16-18 brings him through at the first try, never under ~half his health
 * (the plague's slow kills the lowest); with HANDS=0.6 the arcane and venom builds keep ~15%, the plague's needs a second try.
 */
export const ESCORT = { hp: 10000, mend: 0.05, speed: 1.4, near: 4, wait: 14 } as const;

export class Escort {
  /** Where he is now: his starting spot's copy (its name and size too), moved as he walks. */
  readonly pose: Pose & { r: number; name: string };
  hp: number = ESCORT.hp;
  /** The last point of the path he has reached. */
  at = 0;
  /** Set off: the hero came to him. */
  on = false;
  private rest: Pose;
  private path: readonly { x: number; y: number; z: number }[];

  /** `rest`: where he waits (the path's first point); `path`: the way, point by point. */
  constructor(rest: Pose & { r: number; name: string }, path: readonly { x: number; y: number; z: number }[]) {
    this.rest = rest;
    this.path = path;
    this.pose = { ...rest };
  }

  /** Back at his starting place and whole (a fall, a load), or `end`: at the path's end, the procession done. */
  reset(end = false): void {
    const p = end ? this.path[this.path.length - 1] : this.rest;
    Object.assign(this.pose, { x: p.x, y: p.y, z: p.z, yaw: this.rest.yaw });
    this.hp = ESCORT.hp;
    this.at = end ? this.path.length - 1 : 0;
    this.on = false;
  }

  /** A blow on him; true once he has fallen. */
  hurt(n: number): boolean {
    this.hp = Math.max(0, this.hp - n);
    return this.hp === 0;
  }

  /**
   * Per frame: on toward point `to` of the path (none, or there already: he stands), once the hero has come within
   * `near` of him, and only while the hero keeps within `wait`. Returns true while he walks.
   */
  update(dt: number, hero: { x: number; z: number }, to?: number): boolean {
    const p = this.pose, d = Math.hypot(hero.x - p.x, hero.z - p.z);
    if (to === undefined || this.at >= to) return false;
    if (!this.on && d > ESCORT.near) return false;
    this.on = true;
    if (d > ESCORT.wait) return false;
    this.hp = Math.min(ESCORT.hp, this.hp + ESCORT.hp * ESCORT.mend * dt);
    let step = ESCORT.speed * dt;
    while (step > 0 && this.at < to) {
      const a = this.path[this.at], b = this.path[this.at + 1], left = Math.hypot(b.x - p.x, b.z - p.z);
      if (left > 1e-6) p.yaw = Math.atan2(-(b.x - p.x), -(b.z - p.z));
      if (left <= step) { p.x = b.x; p.y = b.y; p.z = b.z; this.at++; step -= left; continue; }
      p.x += ((b.x - p.x) / left) * step;
      p.z += ((b.z - p.z) / left) * step;
      p.y = a.y + (b.y - a.y) * (1 - (left - step) / Math.hypot(b.x - a.x, b.z - a.z));
      step = 0;
    }
    return true;
  }
}
