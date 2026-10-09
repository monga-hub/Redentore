import * as THREE from 'three';
import { World } from '../core/physics.ts';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { material, type Role } from './materials.ts';

// SCALE: 1 unit = 1 metre. Axes: +X = east, +Y = up, -Z = north (lagoon), +Z = south
// (Fondamenta San Giacomo). Origin = centre of the church facade at ground level.
// Side naming used by room(): n = min z edge, s = max z edge, w = min x, e = max x.

export interface Door {
  at: number; // centre along the wall (world x for n/s walls, world z for e/w walls)
  w?: number; // width, default 2.4
  h?: number; // height, default 3.2
  y0?: number; // sill height, default = wall base
  arch?: boolean; // round head: extruded lunette + ghiera under the lintel (visual, collider unchanged)
}

export interface WallOpts {
  h: number; // top of wall (absolute y)
  y0?: number; // base, default 0
  t?: number; // thickness, default 0.6
  role?: Role;
  doors?: Door[];
  trim?: boolean | number; // zoccolo + top cornice; a number also runs a marcapiano that high above the base
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
  trim?: boolean | number; // see WallOpts
  n?: Side; s?: Side; e?: Side; w?: Side;
}

export interface Area {
  zone: string;
  label: string;
  x0: number; x1: number; z0: number; z1: number;
}

export interface ArcadeOpts {
  spacing?: number; // target bay, default 3.4
  gaps?: [number, number][]; // parapet left open in the bays facing these points (doors, garden walks)
  clear?: [number, number][]; // no pier within 1.9 m: one wide trabeated bay (stairs crossing the arcade)
  upper?: string; // sides ('nesw') whose perimeter wall above the roof gets a marcapiano and windows
}

/** Extra flame or light for fx/torches.ts: candle flame (no light), hanging lamp, or steady coloured glow. */
export interface LightSpot {
  x: number; y: number; z: number;
  kind: 'candle' | 'lamp' | 'glow';
  color?: number; // glow only
}

interface BoxOpts {
  collide?: boolean; // default true
  visible?: boolean; // default true (false = invisible barrier)
  camera?: boolean; // blocks the follow camera; default = collide && visible
  bevel?: number; // chamfer width, default min(12 cm, quarter of the smallest side)
}

export class LevelBuilder {
  readonly root = new THREE.Group();
  readonly world = new World();
  /** zone id -> group holding every mesh of that zone (materials/props hook in here). */
  readonly zones = new Map<string, THREE.Group>();
  /** Named sub-areas, used by the HUD and by scripts/check-walkable.ts. */
  readonly areas: Area[] = [];
  /** Meshes the third-person camera must not pass through. */
  readonly cameraBlockers: THREE.Object3D[] = [];
  /** Candles, lamps and window glows placed by the zones; fx/torches.ts lights them. */
  readonly lights: LightSpot[] = [];
  private current!: THREE.Group;
  private zoneId = '';
  private decorBatches = new Map<string, { zone: THREE.Group; role: Role; cam: boolean; geos: THREE.BufferGeometry[] }>();

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
    const h = y1 - y0, bevel = o.bevel ?? Math.min(0.12, 0.25 * Math.min(w, h, d));
    const mesh = new THREE.Mesh(chamferBox(w, h, d, bevel), material(role));
    mesh.userData.size = [w, h, d];
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
    const { h, y0 = 0, t = 0.6, role = 'mass', doors = [], trim } = o;
    const lo = Math.min(a0, a1) - t / 2, hi = Math.max(a0, a1) + t / 2; // overlap corners
    // wall frame: x along the wall, y up, z across it
    const frame = axis === 'x' ? new THREE.Matrix4().makeTranslation(0, 0, c) : new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(c, 0, 0);
    const piece = (p0: number, p1: number, b: number, top: number) => {
      if (p1 - p0 < 1e-3 || top - b < 1e-3) return;
      if (axis === 'x') this.box(p0, p1, b, top, c - t / 2, c + t / 2, role);
      else this.box(c - t / 2, c + t / 2, b, top, p0, p1, role);
      if (trim && b === y0 && top === h) this.part(frame, p0, p1, y0, y0 + 0.5, -t / 2 - 0.06, t / 2 + 0.06, 'stoneDark'); // zoccolo
    };
    let cur = lo;
    for (const d of [...doors].sort((p, q) => p.at - q.at)) {
      const w = d.w ?? 2.4, dy0 = d.y0 ?? y0, dy1 = dy0 + (d.h ?? 3.2);
      const d0 = d.at - w / 2, d1 = d.at + w / 2, r = w / 2, spring = dy1 - r;
      piece(cur, d0, y0, h);
      piece(d0, d1, dy1, h); // lintel
      piece(d0, d1, y0, dy0); // sill
      if (d.arch && spring >= dy0 + 1.5) {
        const lunette = new THREE.Shape().moveTo(d0, dy1).lineTo(d0, spring).absarc(d.at, spring, r, Math.PI, 0, true).lineTo(d1, dy1).closePath();
        this.decor(shaped(extrude(lunette, t, 0.03), y0, h - y0).applyMatrix4(frame), role);
        this.decor(shaped(ring(d.at, spring, r - 0.05, r + 0.26, t + 0.14), y0, h - y0).applyMatrix4(frame), 'stoneDark');
        this.part(frame, d.at - 0.18, d.at + 0.18, dy1 - 0.12, dy1 + 0.38, -t / 2 - 0.12, t / 2 + 0.12, 'stoneDark'); // keystone
      }
      cur = d1;
    }
    piece(cur, hi, y0, h);
    if (trim) {
      this.part(frame, lo - 0.1, hi + 0.1, h - 0.28, h, -t / 2 - 0.14, t / 2 + 0.14, 'stoneDark'); // cornice
      if (typeof trim === 'number') this.part(frame, lo - 0.05, hi + 0.05, y0 + trim, y0 + trim + 0.2, -t / 2 - 0.09, t / 2 + 0.09, 'stoneDark'); // marcapiano
    }
  }

  /** Walled rectangle with optional ceiling; sides set to false are left to a neighbour. */
  room(x0: number, x1: number, z0: number, z1: number, o: RoomOpts): void {
    const { h, y0 = 0, role = 'plaster', roof = true } = o;
    const wo = (doors: Door[]): WallOpts => ({ h, y0, role, doors, trim: o.trim });
    if (o.n !== false) this.wallX(z0, x0, x1, wo(o.n ?? []));
    if (o.s !== false) this.wallX(z1, x0, x1, wo(o.s ?? []));
    if (o.w !== false) this.wallZ(x0, z0, z1, wo(o.w ?? []));
    if (o.e !== false) this.wallZ(x1, z0, z1, wo(o.e ?? []));
    if (roof) this.box(x0, x1, h, h + 0.4, z0, z1, o.roofRole ?? 'roof');
    if (o.floor) this.floor(x0, x1, z0, z1, o.floor, y0, 0.02);
  }

  /** Visual-only geometry (world space), merged per zone and role by flush(). `cam` = blocks the follow camera. */
  decor(g: THREE.BufferGeometry, role: Role, cam = false): void {
    const key = `${this.zoneId}|${role}|${cam}`;
    let d = this.decorBatches.get(key);
    if (!d) this.decorBatches.set(key, (d = { zone: this.current, role, cam, geos: [] }));
    d.geos.push(g);
  }

  /** Visual-only chamfered box by extents in frame `m` (null = world), batched through decor(). */
  part(m: THREE.Matrix4 | null, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, role: Role, cam = false): void {
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0);
    const g = chamferBox(w, h, d, Math.min(0.06, 0.25 * Math.min(w, h, d))).clone().translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.decor(m ? g.applyMatrix4(m) : g, role, cam);
  }

  /** Merges every decor() batch into one mesh per zone and role. Call once, after building. */
  flush(): void {
    for (const d of this.decorBatches.values()) {
      const m = new THREE.Mesh(mergeGeometries(d.geos)!, material(d.role));
      m.userData.role = d.role;
      d.zone.add(m);
      if (d.cam) this.cameraBlockers.push(m);
    }
    this.decorBatches.clear();
  }

  private collider(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): void {
    this.world.add((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, y0, y1);
  }

  /**
   * Cloister walk `depth` wide inside the rectangle, roofed at eave height `h`: on the courtyard
   * edge, brick piers on a parapet carry round arches (extruded spandrel, stone ghiera, keystone);
   * behind them exposed rafters under a boarded lean-to roof that oversails the courtyard with a
   * row of coppi ends. Colliders: piers, parapets and the old flat roof ring; the rest is visual.
   */
  arcade(x0: number, x1: number, z0: number, z1: number, depth: number, h: number, o: ArcadeOpts = {}): void {
    const { spacing = 3.4, gaps = [], clear = [], upper = '' } = o;
    const T = 0.5, e = T / 2, K = 0.4, OV = 0.8, tw = 0.3 - depth; // spandrel, pitch, eave overhang, wall face
    const ix0 = x0 + depth, ix1 = x1 - depth, iz0 = z0 + depth, iz1 = z1 - depth;
    for (const [a, b, c, d] of [[x0, x1, z0, iz0], [x0, x1, iz1, z1], [x0, ix0, iz0, iz1], [ix1, x1, iz0, iz1]]) this.collider(a, b, h, h + 0.35, c, d);

    // Each side in its own frame: s along the arcade from corner A, t across it towards the courtyard.
    const sides = ([['n', ix0, iz0, 1, 0, ix1 - ix0], ['e', ix1, iz0, 0, 1, iz1 - iz0], ['s', ix1, iz1, -1, 0, ix1 - ix0], ['w', ix0, iz1, 0, -1, iz1 - iz0]] as const).map(([key, ax, az, ux, uz, L]) => {
      const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(ux, 0, uz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-uz, 0, ux)).setPosition(ax, 0, az);
      const local = ([x, z]: [number, number]) => [(x - ax) * ux + (z - az) * uz, (z - az) * ux - (x - ax) * uz];
      const n = Math.max(1, Math.ceil(L / spacing - 0.25));
      const piers: { s: number; r: number }[] = [];
      for (let i = 0; i <= n; i++) {
        const s = (L * i) / n, corner = i === 0 || i === n;
        if (corner || !clear.some((p) => Math.hypot(local(p)[0] - s, local(p)[1]) < 1.9)) piers.push({ s, r: corner ? 0.45 : 0.35 });
      }
      const bays = piers.slice(1).map((p, j) => ({ a: piers[j].s, b: p.s, o0: piers[j].s + piers[j].r, o1: p.s - p.r, wide: p.s - piers[j].s > L / n + 0.01 }));
      return { key, m, local, L, piers, bays };
    });
    const rMax = Math.max(...sides.flatMap((sd) => sd.bays.filter((b) => !b.wide).map((b) => (b.o1 - b.o0) / 2)));
    const spring = Math.min(2.6, h - 0.55 - rMax), top = h - 0.2, lintel = h - 0.8;
    const yr = h + 0.18, y = (t: number) => yr - K * t; // rafter underside, rising towards the wall
    const tiles: THREE.Matrix4[] = [];

    for (const { key, m, local, L, piers, bays } of sides) {
      const put = (s0: number, s1: number, y0: number, y1: number, t0: number, t1: number, role: Role, cam = false) => this.part(m, s0, s1, y0, y1, t0, t1, role, cam);
      const solid = (s0: number, s1: number, y0: number, y1: number, t0: number, t1: number) => {
        const p = new THREE.Vector3(s0, 0, t0).applyMatrix4(m), q = new THREE.Vector3(s1, 0, t1).applyMatrix4(m);
        this.collider(p.x, q.x, y0, y1, p.z, q.z);
      };
      for (const { s, r } of piers.slice(0, -1)) { // the far corner pier belongs to the next side
        put(s - r, s + r, 0, spring - 0.28, -r, r, 'brick');
        put(s - r - 0.09, s + r + 0.09, 0, 0.4, -r - 0.09, r + 0.09, 'stoneDark'); // plinth
        put(s - r - 0.1, s + r + 0.1, spring - 0.28, spring, -r - 0.1, r + 0.1, 'stoneDark'); // impost
        solid(s - r, s + r, 0, spring, -r, r);
      }
      // Spandrel wall: one extruded outline per side, arches cut along its bottom edge.
      const sh = new THREE.Shape().moveTo(-e, spring).lineTo(-e, top).lineTo(L + e, top).lineTo(L + e, spring);
      for (const b of [...bays].reverse()) {
        sh.lineTo(b.o1, spring);
        if (b.wide) sh.lineTo(b.o1, lintel).lineTo(b.o0, lintel).lineTo(b.o0, spring);
        else sh.absarc((b.o0 + b.o1) / 2, spring, (b.o1 - b.o0) / 2, 0, Math.PI, false);
      }
      this.decor(shaped(extrude(sh.closePath(), T, 0.04), 0, h).applyMatrix4(m), 'plaster', true);
      for (const b of bays) {
        const c = (b.o0 + b.o1) / 2, r = (b.o1 - b.o0) / 2;
        if (b.wide) put(b.o0 - 0.2, b.o1 + 0.2, lintel, lintel + 0.32, -e - 0.07, e + 0.07, 'stoneDark');
        else {
          this.decor(shaped(ring(c, spring, r - 0.06, r + 0.24, T + 0.14), 0, h).applyMatrix4(m), 'stoneDark');
          put(c - 0.17, c + 0.17, spring + r - 0.1, spring + r + 0.36, -e - 0.12, e + 0.12, 'stoneDark'); // keystone
        }
        const open = b.wide || gaps.some((g) => {
          const [gs, gt] = local(g);
          return Math.abs(gt) < depth + 0.5 && gs > b.a - 1.2 && gs < b.b + 1.2;
        });
        if (open) continue;
        put(b.o0, b.o1, 0, 0.7, -0.22, 0.22, 'brick'); // parapet
        put(b.o0, b.o1, 0.7, 0.8, -0.29, 0.29, 'stoneDark'); // coping
        solid(b.o0, b.o1, 0, 0.8, -0.22, 0.22);
      }

      // Roof: cornice, wall plate, rafters (jack rafters and a valley beam at the corners),
      // boards and the coppi slab; plan = trapezoid mitred along the corner diagonals.
      put(-e - 0.15, L + e + 0.15, top, h, -e - 0.16, e + 0.16, 'stoneDark');
      put(-e, L + e, h, yr, -0.14, 0.14, 'wood');
      put(tw, L - tw, y(tw) - 0.22, y(tw), tw, tw + 0.2, 'wood'); // ledger on the wall
      for (let s = tw + 0.4; s < L - tw - 0.3; s += 0.8) {
        const te = Math.min(OV, s, L - s);
        if (te - tw > 0.5) this.decor(beam(new THREE.Vector3(s, y(tw) + 0.11, tw), new THREE.Vector3(s, y(te) + 0.11, te), 0.16, 0.22).applyMatrix4(m), 'wood');
      }
      this.decor(beam(new THREE.Vector3(OV, y(OV) + 0.11, OV), new THREE.Vector3(tw, y(tw) + 0.11, tw), 0.2, 0.24).applyMatrix4(m), 'wood');
      const plan = (t0: number, t1: number): [number, number][] => [[t0, t0], [L - t0, t0], [L - t1, t1], [t1, t1]];
      this.decor(slope(plan(tw, OV), yr + 0.28, K, 0.05).applyMatrix4(m), 'wood', true);
      this.decor(slope(plan(tw, OV + 0.12), yr + 0.42, K, 0.14).applyMatrix4(m), 'roof', true);
      const te = OV + 0.12, tilt = new THREE.Matrix4().makeRotationX(Math.atan(K));
      for (let s = te + 0.15; s < L - te - 0.1; s += 0.3) tiles.push(m.clone().multiply(new THREE.Matrix4().makeTranslation(s, y(te - 0.2) + 0.42, te - 0.2)).multiply(tilt));

      // Perimeter wall above the roof: marcapiano and a few deep round-headed windows.
      if (!upper.includes(key)) continue;
      const probe = new THREE.Vector3(L / 2, 0, tw - 0.3).applyMatrix4(m);
      const wallTop = Math.max(0, ...this.world.boxes.filter((b) => Math.abs(probe.x - b.cx) <= b.hx && Math.abs(probe.z - b.cz) <= b.hz).map((b) => b.y1));
      const band = y(tw) + 0.52;
      put(tw, L - tw, band, band + 0.22, tw - 0.1, tw + 0.14, 'stoneDark');
      const wy = band + 0.55, wh = Math.min(1.7, wallTop - 0.4 - wy), r = 0.42;
      if (wh < 0.9) continue;
      bays.forEach((b, j) => {
        if (j % 2 === 0 || b.wide) return;
        const c = (b.a + b.b) / 2, at = (g: THREE.BufferGeometry, d: number) => g.translate(0, 0, tw + d / 2).applyMatrix4(m);
        const outline = (p: THREE.Path, rr: number, yb: number) => p.moveTo(c - rr, yb).lineTo(c + rr, yb).lineTo(c + rr, wy + wh - r).absarc(c, wy + wh - r, rr, 0, Math.PI, false).lineTo(c - rr, yb);
        const frame = outline(new THREE.Shape(), r + 0.16, wy - 0.06) as THREE.Shape;
        frame.holes.push(outline(new THREE.Path(), r, wy));
        this.decor(at(shaped(extrude(outline(new THREE.Shape(), r + 0.02, wy) as THREE.Shape, 0.06, 0), 0, wallTop), 0.06), 'wood');
        this.decor(at(shaped(extrude(frame, 0.24, 0.03), 0, wallTop), 0.24), 'stoneDark');
        put(c - r - 0.28, c + r + 0.28, wy - 0.2, wy - 0.04, tw, tw + 0.32, 'stoneDark'); // sill
      });
    }
    const coppi = new THREE.InstancedMesh(COPPO, material('roof'), tiles.length);
    tiles.forEach((t, i) => coppi.setMatrixAt(i, t));
    coppi.computeBoundingSphere();
    this.add(coppi, 'roof');
  }

  /** Low chamfered stone curb framing a lawn (inside its edge, under step height, no collider). */
  curb(x0: number, x1: number, z0: number, z1: number, w = 0.22, h = 0.14): void {
    this.part(null, x0, x1, 0, h, z0, z0 + w, 'stoneDark');
    this.part(null, x0, x1, 0, h, z1 - w, z1, 'stoneDark');
    this.part(null, x0, x0 + w, 0, h, z0 + w, z1 - w, 'stoneDark');
    this.part(null, x1 - w, x1, 0, h, z0 + w, z1 - w, 'stoneDark');
  }

  /** Well-head of radius r, rim top at h + 0.26: stepped base, drum, thick chamfered rim. Collider as column(). */
  well(x: number, z: number, r: number, h: number, role: Role = 'stoneDark'): THREE.Mesh {
    const p: THREE.Vector2[] = [];
    for (const [px, py] of [[r + 0.25, 0], [r + 0.25, 0.12], [r + 0.19, 0.18], [r, 0.18], [r, h - 0.22], [r + 0.14, h - 0.22], [r + 0.22, h - 0.14], [r + 0.22, h + 0.18], [r + 0.14, h + 0.26], [r - 0.12, h + 0.26], [r - 0.2, h + 0.18], [r - 0.2, h], [0, h]]) {
      p.push(new THREE.Vector2(px, py), new THREE.Vector2(px, py)); // doubled = hard creases
    }
    const m = new THREE.Mesh(new THREE.LatheGeometry(p.slice(1, -1), 14), material(role));
    m.position.set(x, 0, z);
    this.add(m, role);
    this.world.add(x, z, r * 0.9, r * 0.9, 0, h);
    return m;
  }

  /** Closed building volume: box, then zoccolo, marcapiano, eaves cornice and a hipped coppi roof. */
  block(x0: number, x1: number, z0: number, z1: number, h: number, role: Role = 'mass'): void {
    this.box(x0, x1, 0, h, z0, z1, role);
    this.band(x0, x1, z0, z1, 0, 0.6, 0.08);
    this.band(x0, x1, z0, z1, h * 0.5, h * 0.5 + 0.22, 0.1);
    this.band(x0, x1, z0, z1, h - 0.35, h, 0.3);
    this.hipRoof(x0, x1, z0, z1, h);
  }

  /** Visual ring of trim `out` proud of a rectangle's faces, from y0 to y1. */
  band(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, out: number, role: Role = 'stoneDark'): void {
    this.part(null, x0 - out, x1 + out, y0, y1, z0 - out, z0 + out, role);
    this.part(null, x0 - out, x1 + out, y0, y1, z1 - out, z1 + out, role);
    this.part(null, x0 - out, x0 + out, y0, y1, z0 + out, z1 - out, role);
    this.part(null, x1 - out, x1 + out, y0, y1, z0 + out, z1 - out, role);
  }

  /** Hipped roof over a rectangle, eaves at y overhanging by `ov`, pitch k (rise per run). Visual only. */
  hipRoof(x0: number, x1: number, z0: number, z1: number, y: number, ov = 0.7, k = 0.45): void {
    this.decor(hip(x0 - ov, x1 + ov, z0 - ov, z1 + ov, y, k), 'roof');
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
   * Tuscan column of shaft radius r standing on y0, abacus top flush with y1: square plinth
   * + torus base, shaft with entasis, astragal, echinus and square abacus. One merged mesh;
   * the geometry is shared between columns of the same size. Colliders: the plinth (low
   * enough to step onto) and the shaft.
   */
  order(x: number, z: number, r: number, y0: number, y1: number, role: Role): THREE.Mesh {
    const m = new THREE.Mesh(columnGeometry(r, y1 - y0), material(role));
    m.position.set(x, y0, z);
    this.add(m, role);
    this.world.add(x, z, 1.3 * r, 1.3 * r, y0, y0 + 0.45 * r);
    this.world.add(x, z, r, r, y0, y1);
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
      if (axis === 'z') this.box(a0, a1, yLow, top, p0, p1, role, { camera: false, bevel: 0.03 });
      else this.box(p0, p1, yLow, top, a0, a1, role, { camera: false, bevel: 0.03 });
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

const COLUMNS = new Map<string, THREE.BufferGeometry>();

/** Tuscan column profile in units of the shaft radius r (base and capital r tall each), origin at the foot. */
export function columnGeometry(r: number, h: number): THREE.BufferGeometry {
  const key = `${r}|${h}`;
  let g = COLUMNS.get(key);
  if (g) return g;
  const p: THREE.Vector2[] = [];
  const pt = (x: number, y: number) => p.push(new THREE.Vector2(x * r, y));
  const edge = () => p.push(p[p.length - 1].clone()); // duplicated point = hard crease in the lathe normals
  const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pt(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
    }
  };
  const hp = Math.PI / 2;
  // Base: torus on the plinth, fillet.
  arc(1.08, 0.625 * r, 0.175, 0.175 * r, -hp, hp, 6);
  edge();
  pt(1.04, 0.8 * r); edge();
  pt(1.04, 0.88 * r); // apophyge: short flare into the shaft
  // Shaft: straight lower third, then entasis tapering to 0.84 r under the astragal.
  const s0 = r, s1 = h - r;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pt(1 - 0.16 * Math.pow(Math.max(0, (t - 1 / 3) / (2 / 3)), 1.4), s0 + (s1 - s0) * t);
  }
  edge();
  // Capital: astragal bead, neck, fillet, echinus (cushion under the abacus).
  arc(0.86, h - 0.925 * r, 0.075, 0.075 * r, -hp, hp, 4);
  edge();
  pt(0.86, h - 0.85 * r); edge();
  pt(0.86, h - 0.62 * r); edge();
  pt(0.92, h - 0.62 * r); edge();
  pt(0.92, h - 0.58 * r);
  arc(0.92, h - 0.28 * r, 0.3, 0.3 * r, -hp, 0, 5);
  edge();
  pt(0, h - 0.28 * r); // hidden lid under the abacus
  const lathe = new THREE.LatheGeometry(p, 16);
  const plinth = new THREE.BoxGeometry(2.6 * r, 0.45 * r, 2.6 * r).translate(0, 0.225 * r, 0);
  const abacus = new THREE.BoxGeometry(2.56 * r, 0.28 * r, 2.56 * r).translate(0, h - 0.14 * r, 0);
  g = mergeGeometries([plinth, lathe, abacus])!;
  const pos = g.getAttribute('position'), shape = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) shape.set([pos.getY(i), h, 0], i * 3);
  g.setAttribute('aShape', new THREE.BufferAttribute(shape, 3));
  COLUMNS.set(key, g);
  return g;
}

const CHAMFERS = new Map<string, THREE.BufferGeometry>();

/**
 * Box w×h×d centred on the origin, every edge cut by a 45° chamfer `b` wide (one segment,
 * 44 triangles, flat normals). Built per size and cached, so the bevel never stretches the
 * way a scaled unit box would. aShape = (height above the base, total height, 1 on chamfer
 * faces): the triplanar shader paints the foot, the top and the lit arrises from it.
 */
function chamferBox(w: number, h: number, d: number, b: number): THREE.BufferGeometry {
  const key = [w, h, d, b].map((v) => v.toFixed(3)).join('|');
  let g = CHAMFERS.get(key);
  if (g) return g;
  const a = [w / 2, h / 2, d / 2];
  // vertex of corner s (signs) lying on the face normal to axis i
  const P = (s: number[], i: number) => a.map((e, k) => s[k] * (k === i ? e : e - b));
  const pos: number[] = [], shape: number[] = [];
  const tri = (p: number[], q: number[], r: number[], edge: number) => {
    // convex and centred: the face normal must point away from the origin
    const u = q.map((v, k) => v - p[k]), v = r.map((x, k) => x - p[k]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n[0] * (p[0] + q[0] + r[0]) + n[1] * (p[1] + q[1] + r[1]) + n[2] * (p[2] + q[2] + r[2]) < 0) [q, r] = [r, q];
    for (const c of [p, q, r]) { pos.push(...c); shape.push(c[1] + a[1], h, edge); }
  };
  const quad = (p: number[], q: number[], r: number[], s: number[], edge: number) => { tri(p, q, r, edge); tri(p, r, s, edge); };
  const corner = (i: number, si: number, j: number, sj: number, k: number, sk: number) => {
    const s = [0, 0, 0];
    s[i] = si; s[j] = sj; s[k] = sk;
    return s;
  };
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3, k = (i + 2) % 3;
    for (const si of [-1, 1]) {
      // face
      quad(P(corner(i, si, j, -1, k, -1), i), P(corner(i, si, j, 1, k, -1), i), P(corner(i, si, j, 1, k, 1), i), P(corner(i, si, j, -1, k, 1), i), 0);
      // chamfer between this face and the j faces, running along k
      for (const sj of [-1, 1]) {
        const c0 = corner(i, si, j, sj, k, -1), c1 = corner(i, si, j, sj, k, 1);
        quad(P(c0, i), P(c0, j), P(c1, j), P(c1, i), 1);
      }
    }
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const s = [sx, sy, sz];
    tri(P(s, 0), P(s, 1), P(s, 2), 1);
  }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2)); // triplanar: unused
  g.setAttribute('aShape', new THREE.Float32BufferAttribute(shape, 3));
  g.computeVertexNormals();
  CHAMFERS.set(key, g);
  return g;
}

/** Shape extruded `depth` thick, centred on z = 0, with a one-segment bevel. */
export function extrude(s: THREE.Shape, depth: number, bevel: number): THREE.BufferGeometry {
  const d = depth - 2 * bevel;
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 10 }).translate(0, 0, -d / 2);
}

/** Half annulus (an arch ring) between radii r0 and r1, springing at (cx, cy), `depth` thick. */
export function ring(cx: number, cy: number, r0: number, r1: number, depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape().moveTo(cx + r1, cy).absarc(cx, cy, r1, 0, Math.PI, false).lineTo(cx - r0, cy).absarc(cx, cy, r0, Math.PI, 0, true).closePath();
  return extrude(s, depth, 0.03);
}

/**
 * Adds the aShape attribute chamferBox carries: height above `base`, total height H (default:
 * the geometry's own extent), 1 on bevel faces (normal tilted off the extrusion axis).
 */
export function shaped(g: THREE.BufferGeometry, base?: number, H?: number, bevels = true): THREE.BufferGeometry {
  g.computeBoundingBox();
  const lo = base ?? g.boundingBox!.min.y, hh = H ?? g.boundingBox!.max.y - lo;
  const pos = g.getAttribute('position'), nrm = g.getAttribute('normal'), a = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const nz = Math.abs(nrm.getZ(i));
    a.set([pos.getY(i) - lo, hh, bevels && nz > 0.2 && nz < 0.95 ? 1 : 0], i * 3);
  }
  g.setAttribute('aShape', new THREE.BufferAttribute(a, 3));
  g.clearGroups();
  return g;
}

/** Chamfered beam w wide, h deep, from a to b (not vertical); its depth stays in the vertical plane. */
function beam(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number): THREE.BufferGeometry {
  const x = b.clone().sub(a), len = x.length();
  x.divideScalar(len);
  const z = x.clone().cross(new THREE.Vector3(0, 1, 0)).normalize(), y = z.clone().cross(x);
  const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(a.clone().add(b).multiplyScalar(0.5));
  return chamferBox(len, h, w, Math.min(0.04, 0.2 * Math.min(w, h))).clone().applyMatrix4(m);
}

/** Inclined slab over a plan polygon of (x, z) points: top at y0 - k z, `th` thick (vertical). */
function slope(pts: [number, number][], y0: number, k: number, th: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z))), { depth: th, bevelEnabled: false });
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i), y0 - th + k * p.getY(i) + p.getZ(i), -p.getY(i)); // (x, -z, up) -> (x, y, z), orientation kept
  g.computeVertexNormals();
  return shaped(g, undefined, undefined, false);
}

/** Hipped roof solid: eave rectangle at y with a 0.2 m fascia below it, ridge along the long side. */
function hip(x0: number, x1: number, z0: number, z1: number, y: number, k: number): THREE.BufferGeometry {
  const hh = Math.min(x1 - x0, z1 - z0) / 2, ry = y + k * hh, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const alongX = x1 - x0 >= z1 - z0;
  const r0 = alongX ? [x0 + hh, ry, cz] : [cx, ry, z0 + hh], r1 = alongX ? [x1 - hh, ry, cz] : [cx, ry, z1 - hh];
  const e = [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], f = e.map(([x, , z]) => [x, y - 0.2, z]);
  const c = [cx, y, cz], pos: number[] = [];
  const tri = (p: number[], q: number[], r: number[]) => { // convex solid: orient away from the centre
    const u = q.map((v, i) => v - p[i]), v = r.map((w, i) => w - p[i]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n.reduce((acc, ni, i) => acc + ni * (p[i] + q[i] + r[i] - 3 * c[i]), 0) < 0) [q, r] = [r, q];
    pos.push(...p, ...q, ...r);
  };
  const quad = (p: number[], q: number[], r: number[], s: number[]) => { tri(p, q, r); tri(p, r, s); };
  for (let i = 0; i < 4; i++) quad(f[i], f[(i + 1) % 4], e[(i + 1) % 4], e[i]); // fascia
  quad(f[0], f[1], f[2], f[3]); // soffit
  if (alongX) { quad(e[0], e[1], r1, r0); quad(e[2], e[3], r0, r1); tri(e[3], e[0], r0); tri(e[1], e[2], r1); }
  else { quad(e[3], e[0], r0, r1); quad(e[1], e[2], r1, r0); tri(e[0], e[1], r0); tri(e[2], e[3], r1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.computeVertexNormals();
  return shaped(g, undefined, undefined, false);
}

/** Coppo end for the eaves: half cylinder lying along z, convex side up. */
const COPPO = new THREE.CylinderGeometry(0.12, 0.12, 0.42, 8, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2);
