// Collision world: every solid in the level is a box, optionally rotated about Y.
// A box is both a floor and a wall: if its top is within STEP of the player's feet
// the player stands/steps onto it, otherwise (and if it overlaps the body height)
// it pushes the player out horizontally. Stairs, curbs, platforms and walls all
// fall out of this single rule. Pure math, no three.js import, so it runs in Node
// (see scripts/check-walkable.ts).

export interface Box {
  cx: number;
  cz: number;
  hx: number; // half extents in the box's local frame
  hz: number;
  y0: number;
  y1: number;
  cos: number; // of rotation about Y (three.js convention)
  sin: number;
}

export const PLAYER = {
  radius: 0.35,
  height: 1.8,
  step: 0.45, // max climbable rise without jumping
};

export class World {
  boxes: Box[] = [];

  add(cx: number, cz: number, hx: number, hz: number, y0: number, y1: number, rot = 0): Box {
    const b = { cx, cz, hx, hz, y0, y1, cos: Math.cos(rot), sin: Math.sin(rot) };
    this.boxes.push(b);
    return b;
  }

  /** Highest box top under (x,z) that a player with feet at `feet` can stand on; -Infinity if none. */
  groundAt(x: number, z: number, feet: number): number {
    let g = -Infinity;
    const reach = feet + PLAYER.step;
    for (const b of this.boxes) {
      if (b.y1 > reach || b.y1 <= g) continue;
      const dx = x - b.cx, dz = z - b.cz;
      const lx = b.cos * dx - b.sin * dz;
      const lz = b.sin * dx + b.cos * dz;
      if (Math.abs(lx) <= b.hx && Math.abs(lz) <= b.hz) g = b.y1;
    }
    return g;
  }

  /** Lowest surface at (x,z) with headroom for the player (spawns, teleports). */
  standHeight(x: number, z: number): number {
    const tops = this.boxes
      .filter((b) => {
        const dx = x - b.cx, dz = z - b.cz;
        return Math.abs(b.cos * dx - b.sin * dz) <= b.hx && Math.abs(b.sin * dx + b.cos * dz) <= b.hz;
      })
      .map((b) => b.y1)
      .sort((a, b) => a - b);
    return tops.find((t) => !this.blocked(x, z, t, 0.05)) ?? 0;
  }

  private blocks(b: Box, feet: number): boolean {
    return b.y1 > feet + PLAYER.step && b.y0 < feet + PLAYER.height;
  }

  /** True if a player circle at (x,z) with feet at `feet` overlaps a wall. */
  blocked(x: number, z: number, feet: number, r = PLAYER.radius): boolean {
    for (const b of this.boxes) {
      if (!this.blocks(b, feet)) continue;
      const dx = x - b.cx, dz = z - b.cz;
      const lx = b.cos * dx - b.sin * dz;
      const lz = b.sin * dx + b.cos * dz;
      const ox = Math.abs(lx) - b.hx, oz = Math.abs(lz) - b.hz;
      if (ox < r && oz < r && (ox <= 0 || oz <= 0 || ox * ox + oz * oz < r * r)) return true;
    }
    return false;
  }

  /**
   * The first share (0..1) of the segment a→b that runs into a solid box, 1 if it is clear: what stops a
   * bolt or blocks a line of sight. Boxes the segment starts inside are ignored (a caster against a wall,
   * the floor under a spark). Exact slab test in each box's frame; no allocations.
   */
  ray(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
    let best = 1;
    const ex = bx - ax, ey = by - ay, ez = bz - az;
    for (const b of this.boxes) {
      const dx = ax - b.cx, dz = az - b.cz;
      const lx = b.cos * dx - b.sin * dz, lz = b.sin * dx + b.cos * dz; // start, box frame
      const vx = b.cos * ex - b.sin * ez, vz = b.sin * ex + b.cos * ez; // direction, box frame
      let t0 = -Infinity, t1 = best;
      if (Math.abs(vx) < 1e-9) { if (Math.abs(lx) > b.hx) continue; } else {
        let p = (-b.hx - lx) / vx, q = (b.hx - lx) / vx;
        if (p > q) { const r = p; p = q; q = r; }
        if (p > t0) t0 = p; if (q < t1) t1 = q;
      }
      if (Math.abs(vz) < 1e-9) { if (Math.abs(lz) > b.hz) continue; } else {
        let p = (-b.hz - lz) / vz, q = (b.hz - lz) / vz;
        if (p > q) { const r = p; p = q; q = r; }
        if (p > t0) t0 = p; if (q < t1) t1 = q;
      }
      if (Math.abs(ey) < 1e-9) { if (ay <= b.y0 || ay >= b.y1) continue; } else {
        let p = (b.y0 - ay) / ey, q = (b.y1 - ay) / ey;
        if (p > q) { const r = p; p = q; q = r; }
        if (p > t0) t0 = p; if (q < t1) t1 = q;
      }
      if (t0 <= 0 || t0 > t1) continue; // missed, or it starts inside this box
      best = t0;
    }
    return best;
  }

  /**
   * Nothing solid between a and b, both `lift` m above the given feet: a line of sight. Head height by
   * default, so walls, doors and grates block it and hives, beds, benches and the cloisters' parapets don't.
   */
  sees(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, lift = 1.5): boolean {
    return this.ray(a.x, a.y + lift, a.z, b.x, b.y + lift, b.z) >= 1;
  }

  /** Push the circle at p out of every blocking box (a few relaxation passes). */
  resolve(p: { x: number; z: number }, feet: number, r = PLAYER.radius): void {
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const b of this.boxes) {
        if (!this.blocks(b, feet)) continue;
        const dx = p.x - b.cx, dz = p.z - b.cz;
        const lx = b.cos * dx - b.sin * dz;
        const lz = b.sin * dx + b.cos * dz;
        const qx = Math.max(-b.hx, Math.min(b.hx, lx));
        const qz = Math.max(-b.hz, Math.min(b.hz, lz));
        let ex = lx - qx, ez = lz - qz;
        const d2 = ex * ex + ez * ez;
        if (d2 >= r * r) continue;
        if (d2 > 1e-12) {
          const d = Math.sqrt(d2);
          ex = (ex / d) * (r - d);
          ez = (ez / d) * (r - d);
        } else {
          // centre inside the box: leave along the shallowest axis
          const px = b.hx - Math.abs(lx), pz = b.hz - Math.abs(lz);
          if (px < pz) { ex = Math.sign(lx || 1) * (px + r); ez = 0; }
          else { ex = 0; ez = Math.sign(lz || 1) * (pz + r); }
        }
        // local push back to world frame
        p.x += b.cos * ex + b.sin * ez;
        p.z += -b.sin * ex + b.cos * ez;
        moved = true;
      }
      if (!moved) break;
    }
  }
}
