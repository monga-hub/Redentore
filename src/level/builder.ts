import * as THREE from 'three';
import { World } from '../core/physics.ts';
import { material, type Role } from './materials.ts';

// SCALE: 1 unit = 1 metre. Axes: +X = east, +Y = up, -Z = north (lagoon), +Z = south
// (Fondamenta San Giacomo). Origin = centre of the church facade at ground level.
// Side naming used by room(): n = min z edge, s = max z edge, w = min x, e = max x.

export interface Door {
  at: number; // centre along the wall (world x for n/s walls, world z for e/w walls)
  w?: number; // width, default 2.4
  h?: number; // height, default 3.2
  y0?: number; // sill height, default = wall base
}

export interface WallOpts {
  h: number; // top of wall (absolute y)
  y0?: number; // base, default 0
  t?: number; // thickness, default 0.6
  role?: Role;
  doors?: Door[];
}

/** false = no wall on that side (a neighbour provides it); array = wall with these doors. */
export type Side = Door[] | false;

export interface RoomOpts {
  h: number;
  y0?: number;
  role?: Role;
  roof?: boolean; // ceiling slab, default true
  roofRole?: Role;
  floor?: Role; // floor overlay tint
  n?: Side; s?: Side; e?: Side; w?: Side;
}

export interface Area {
  zone: string;
  label: string;
  x0: number; x1: number; z0: number; z1: number;
}

interface BoxOpts {
  collide?: boolean; // default true
  visible?: boolean; // default true (false = invisible barrier)
  camera?: boolean; // blocks the follow camera; default = collide && visible
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

export class LevelBuilder {
  readonly root = new THREE.Group();
  readonly world = new World();
  /** zone id -> group holding every mesh of that zone (materials/props hook in here). */
  readonly zones = new Map<string, THREE.Group>();
  /** Named sub-areas, used by the HUD and by scripts/check-walkable.ts. */
  readonly areas: Area[] = [];
  /** Meshes the third-person camera must not pass through. */
  readonly cameraBlockers: THREE.Object3D[] = [];
  private current!: THREE.Group;
  private zoneId = '';

  zone(id: string): this {
    let g = this.zones.get(id);
    if (!g) {
      g = new THREE.Group();
      g.name = `zone:${id}`;
      this.zones.set(id, g);
      this.root.add(g);
    }
    this.current = g;
    this.zoneId = id;
    return this;
  }

  area(label: string, x0: number, x1: number, z0: number, z1: number): this {
    this.areas.push({ zone: this.zoneId, label, x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
    return this;
  }

  add<T extends THREE.Object3D>(obj: T, role?: Role): T {
    if (role) obj.userData.role = role;
    this.current.add(obj);
    return obj;
  }

  /** Axis-aligned box by extents (any order). Collides by default. */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, role: Role, o: BoxOpts = {}): THREE.Mesh {
    return this.obox((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(z1 - z0), Math.min(y0, y1), Math.max(y0, y1), 0, role, o);
  }

  /** Box centred at (cx,cz), size w (local x) by d (local z), rotated `rot` rad about Y. */
  obox(cx: number, cz: number, w: number, d: number, y0: number, y1: number, rot: number, role: Role, o: BoxOpts = {}): THREE.Mesh {
    const { collide = true, visible = true } = o;
    const mesh = new THREE.Mesh(UNIT_BOX, material(role));
    mesh.scale.set(w, y1 - y0, d);
    mesh.position.set(cx, (y0 + y1) / 2, cz);
    mesh.rotation.y = rot;
    mesh.visible = visible;
    mesh.updateMatrixWorld();
    this.add(mesh, role);
    if (collide) this.world.add(cx, cz, w / 2, d / 2, y0, y1, rot);
    if (o.camera ?? (collide && visible)) this.cameraBlockers.push(mesh);
    return mesh;
  }

  /** Invisible collision-only box (map edges, water edges). */
  barrier(x0: number, x1: number, z0: number, z1: number, h = 4): void {
    this.box(x0, x1, 0, h, z0, z1, 'mass', { visible: false });
  }

  /** Thin non-colliding floor tint lying on top of the site slab. `lift` orders overlapping overlays. */
  floor(x0: number, x1: number, z0: number, z1: number, role: Role, y = 0, lift = 0.01): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(z1 - z0)), material(role));
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, y + lift, (z0 + z1) / 2);
    return this.add(m, role);
  }

  /** Wall along X at constant z (from x0 to x1), with door openings. */
  wallX(z: number, x0: number, x1: number, o: WallOpts): void {
    this.wall('x', z, x0, x1, o);
  }

  /** Wall along Z at constant x (from z0 to z1), with door openings. */
  wallZ(x: number, z0: number, z1: number, o: WallOpts): void {
    this.wall('z', x, z0, z1, o);
  }

  private wall(axis: 'x' | 'z', c: number, a0: number, a1: number, o: WallOpts): void {
    const { h, y0 = 0, t = 0.6, role = 'mass', doors = [] } = o;
    const lo = Math.min(a0, a1) - t / 2, hi = Math.max(a0, a1) + t / 2; // overlap corners
    const piece = (p0: number, p1: number, b: number, top: number) => {
      if (p1 - p0 < 1e-3 || top - b < 1e-3) return;
      if (axis === 'x') this.box(p0, p1, b, top, c - t / 2, c + t / 2, role);
      else this.box(c - t / 2, c + t / 2, b, top, p0, p1, role);
    };
    let cur = lo;
    for (const d of [...doors].sort((p, q) => p.at - q.at)) {
      const w = d.w ?? 2.4, dy0 = d.y0 ?? y0, dy1 = dy0 + (d.h ?? 3.2);
      const d0 = d.at - w / 2, d1 = d.at + w / 2;
      piece(cur, d0, y0, h);
      piece(d0, d1, dy1, h); // lintel
      piece(d0, d1, y0, dy0); // sill
      cur = d1;
    }
    piece(cur, hi, y0, h);
  }

  /** Walled rectangle with optional ceiling; sides set to false are left to a neighbour. */
  room(x0: number, x1: number, z0: number, z1: number, o: RoomOpts): void {
    const { h, y0 = 0, role = 'plaster', roof = true } = o;
    const wo = (doors: Door[]): WallOpts => ({ h, y0, role, doors });
    if (o.n !== false) this.wallX(z0, x0, x1, wo(o.n ?? []));
    if (o.s !== false) this.wallX(z1, x0, x1, wo(o.s ?? []));
    if (o.w !== false) this.wallZ(x0, z0, z1, wo(o.w ?? []));
    if (o.e !== false) this.wallZ(x1, z0, z1, wo(o.e ?? []));
    if (roof) this.box(x0, x1, h, h + 0.4, z0, z1, o.roofRole ?? 'roof');
    if (o.floor) this.floor(x0, x1, z0, z1, o.floor, y0, 0.02);
  }

  /**
   * Cloister walk: a roofed ring `depth` wide inside the rectangle, columns on the
   * courtyard edge. Columns closer than 2.2 m to any `keepClear` point are skipped
   * (doors, stair feet).
   */
  portico(x0: number, x1: number, z0: number, z1: number, depth: number, h: number, keepClear: [number, number][] = [], spacing = 3.4): void {
    const ix0 = x0 + depth, ix1 = x1 - depth, iz0 = z0 + depth, iz1 = z1 - depth;
    const posts = new Map<string, [number, number]>();
    const edge = (ax: number, az: number, bx: number, bz: number) => {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / spacing));
      for (let i = 0; i <= n; i++) {
        const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
        posts.set(`${x.toFixed(2)},${z.toFixed(2)}`, [x, z]);
      }
    };
    edge(ix0, iz0, ix1, iz0); edge(ix1, iz0, ix1, iz1); edge(ix1, iz1, ix0, iz1); edge(ix0, iz1, ix0, iz0);
    for (const [x, z] of posts.values()) {
      if (keepClear.some(([kx, kz]) => Math.hypot(x - kx, z - kz) < 2.2)) continue;
      this.column(x, z, 0.3, 0, h, 'stoneDark');
    }
    // roof ring (4 slabs, no overlap)
    this.box(x0, x1, h, h + 0.35, z0, iz0, 'roof');
    this.box(x0, x1, h, h + 0.35, iz1, z1, 'roof');
    this.box(x0, ix0, h, h + 0.35, iz0, iz1, 'roof');
    this.box(ix1, x1, h, h + 0.35, iz0, iz1, 'roof');
  }

  /** Cylinder with a square collider of matching footprint. */
  column(x: number, z: number, r: number, y0: number, y1: number, role: Role, collide = true): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, y1 - y0, 12), material(role));
    m.position.set(x, (y0 + y1) / 2, z);
    this.add(m, role);
    if (collide) this.world.add(x, z, r * 0.9, r * 0.9, y0, y1);
    return m;
  }

  /**
   * Straight flight of `n` steps rising from yLow at the `from` edge to yHigh at the
   * `to` edge. Steps run along Z (axis 'z': from/to are z, a0/a1 the x span) or along X.
   */
  stairs(axis: 'x' | 'z', a0: number, a1: number, from: number, to: number, yLow: number, yHigh: number, n: number, role: Role = 'stoneDark'): void {
    for (let i = 0; i < n; i++) {
      const p0 = from + ((to - from) * i) / n, p1 = from + ((to - from) * (i + 1)) / n;
      const top = yLow + ((yHigh - yLow) * (i + 1)) / n;
      if (axis === 'z') this.box(a0, a1, yLow, top, p0, p1, role, { camera: false });
      else this.box(p0, p1, yLow, top, a0, a1, role, { camera: false });
    }
  }

  /** Posts + beams pergola over a rectangle; beams sit at 2.6 m so the player walks under. */
  pergola(x0: number, x1: number, z0: number, z1: number, alongZ: boolean, spacing = 3): void {
    const len = alongZ ? z1 - z0 : x1 - x0;
    const n = Math.max(1, Math.round(Math.abs(len) / spacing));
    for (let i = 0; i <= n; i++) {
      const p = (alongZ ? z0 : x0) + (len * i) / n;
      if (alongZ) {
        this.box(x0 - 0.12, x0 + 0.12, 0, 2.6, p - 0.12, p + 0.12, 'wood', { camera: false });
        this.box(x1 - 0.12, x1 + 0.12, 0, 2.6, p - 0.12, p + 0.12, 'wood', { camera: false });
        this.box(x0, x1, 2.6, 2.8, p - 0.08, p + 0.08, 'wood', { collide: false });
      } else {
        this.box(p - 0.12, p + 0.12, 0, 2.6, z0 - 0.12, z0 + 0.12, 'wood', { camera: false });
        this.box(p - 0.12, p + 0.12, 0, 2.6, z1 - 0.12, z1 + 0.12, 'wood', { camera: false });
        this.box(p - 0.08, p + 0.08, 2.6, 2.8, z0, z1, 'wood', { collide: false });
      }
    }
    if (alongZ) {
      this.box(x0 - 0.1, x0 + 0.1, 2.8, 2.95, z0, z1, 'wood', { collide: false });
      this.box(x1 - 0.1, x1 + 0.1, 2.8, 2.95, z0, z1, 'wood', { collide: false });
    } else {
      this.box(x0, x1, 2.8, 2.95, z0 - 0.1, z0 + 0.1, 'wood', { collide: false });
      this.box(x0, x1, 2.8, 2.95, z1 - 0.1, z1 + 0.1, 'wood', { collide: false });
    }
  }

  /** Smallest named area containing (x,z), for the HUD. */
  areaAt(x: number, z: number): Area | undefined {
    let best: Area | undefined, bestA = Infinity;
    for (const a of this.areas) {
      if (x < a.x0 || x > a.x1 || z < a.z0 || z > a.z1) continue;
      const s = (a.x1 - a.x0) * (a.z1 - a.z0);
      if (s < bestA) { best = a; bestA = s; }
    }
    return best;
  }
}
