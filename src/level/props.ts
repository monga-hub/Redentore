import * as THREE from 'three';
import type { LevelBuilder } from './builder.ts';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { material, leafMaterial, type Role } from './materials.ts';
import { MODELS, proxy, modelOf, dress, type Model } from './models.ts';

// Stylised low-poly props (vegetation, furniture). Every repeated piece goes through
// Props, which batches it into one InstancedMesh per (geometry, role) and zone, so a
// few thousand leaves and poles cost a handful of draw calls. Colliders go straight
// into the builder's world; instances never block the camera.

// Shared unit geometries. CYL/BOX are centred; *_BASE sit on y=0.
const CYL = new THREE.CylinderGeometry(1, 1, 1, 7);
const CYL_HI = new THREE.CylinderGeometry(1, 1, 1, 12);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const BLOB = new THREE.IcosahedronGeometry(1, 1);
const GEM = new THREE.IcosahedronGeometry(1, 0);
const CONE = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
const DISC = new THREE.CylinderGeometry(1, 1, 1, 9).translate(0, 0.5, 0);

// Crowns are painted, not textured: light and AO baked into vertex colours (warm lit top,
// cool dark underside, darker in the crevices between lumps), outline broken by displacement.
// Normals stay the undisplaced sphere's ("foliage normals"), so the mass shades soft and round.
const LIT: [number, number, number] = [1.16, 1.12, 0.92], SHADE: [number, number, number] = [0.58, 0.64, 0.72];
function crownShade(y: number, k: number, out: number[]): void {
  const t = Math.min(1, Math.max(0, (y + 1) / 2)), g = t * t * (3 - 2 * t);
  for (let c = 0; c < 3; c++) out.push((SHADE[c] + (LIT[c] - SHADE[c]) * g) * k);
}

/** Lumpy smooth sphere: a few random lobes pushed out, ripples between. */
function leafyMass(seed: number): THREE.BufferGeometry {
  const r = rng(seed);
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 2).deleteAttribute('normal').deleteAttribute('uv'));
  const lobes = Array.from({ length: 5 }, () => new THREE.Vector3(r() - 0.5, r() - 0.3, r() - 0.5).normalize());
  const pos = g.getAttribute('position'), n = new THREE.Vector3(), col: number[] = [], nrm: number[] = [];
  const ph = [r() * 6, r() * 6, r() * 6];
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(pos, i).normalize();
    let lump = 0;
    for (const l of lobes) lump += Math.pow(Math.max(0, n.dot(l)), 5);
    const rip = Math.sin(n.x * 7 + ph[0]) * Math.sin(n.y * 6 + ph[1]) * Math.sin(n.z * 7 + ph[2]);
    const d = 0.86 + 0.26 * Math.min(1, lump) + 0.07 * rip;
    pos.setXYZ(i, n.x * d, n.y * d, n.z * d);
    nrm.push(n.x, n.y, n.z);
    crownShade(n.y, 0.72 + 0.32 * (d - 0.79) / 0.4 + 0.08 * r(), col);
  }
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
const LEAFY = [11, 23, 37, 51].map(leafyMass);

/** Leaf cards scattered over the unit sphere, roughly tangent, tilted at random so the crown's edge frays. */
const CARDS = (() => {
  const r = rng(97), N = 40, pos: number[] = [], nrm: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  const n = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Quaternion(), v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N, a = i * 2.39996; // fibonacci sphere
    n.set(Math.cos(a) * Math.sqrt(1 - y * y), y, Math.sin(a) * Math.sqrt(1 - y * y));
    t.set(0, 1, 0).cross(n);
    if (t.lengthSq() < 1e-4) t.set(1, 0, 0);
    t.normalize().applyQuaternion(q.setFromAxisAngle(n, r() * 6.28));
    b.crossVectors(n, t);
    const tilt = (r() - 0.5) * 1.4, size = 0.6 + 0.3 * r(), c = n.clone().multiplyScalar(0.84 + 0.14 * r());
    q.setFromAxisAngle(t, tilt);
    const bb = b.clone().applyQuaternion(q);
    const base = i * 4;
    for (const [du, dv] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      v.copy(c).addScaledVector(t, (du - 0.5) * size).addScaledVector(bb, (dv - 0.5) * size);
      pos.push(v.x, v.y, v.z);
      const vn = v.clone().normalize();
      nrm.push(vn.x, vn.y, vn.z);
      uv.push(du, dv);
      crownShade(vn.y, 0.85 + 0.15 * Math.min(1, v.length()), col);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
})();

/** Bark: darker at the foot, ridged in value around the girth (painted fissures, no texture). */
const BARK = (() => {
  const g = new THREE.CylinderGeometry(1, 1, 1, 8, 3), pos = g.getAttribute('position'), r = rng(5), col: number[] = [];
  const ridge = Array.from({ length: 9 }, () => 0.78 + 0.34 * r());
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + 0.5, seg = Math.round(((Math.atan2(pos.getZ(i), pos.getX(i)) / (Math.PI * 2)) + 1) * 8) % 8;
    const k = ridge[seg] * (0.62 + 0.42 * y) * (0.92 + 0.16 * r());
    col.push(k * 1.02, k, k * 0.96);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
})();
const LEAF_ROLES = new Set<Role>(['foliage', 'hedge', 'olive']);

/** Deterministic PRNG (mulberry32) so the garden looks the same on every load. */
export function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Batch { geo: THREE.BufferGeometry; role: Role; m: THREE.Matrix4[]; c: THREE.Color[]; shadow: boolean }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Props {
  readonly b: LevelBuilder;
  readonly r: () => number;
  /** Models' own yaw and tint, so swapping a shape for a model never shifts the seeded layout. */
  private rm: () => number;
  private batches = new Map<string, Batch>();
  private muted = 0;

  constructor(b: LevelBuilder, seed: number) {
    this.b = b;
    this.r = rng(seed);
    this.rm = rng(seed + 1000);
  }

  /**
   * Runs `f` for its random draws and colliders only, its shapes dropped: the procedural plants a
   * model replaces still roll the dice, so every position and gap drawn after them stays as it was.
   * ponytail: dead draws kept for a byte-identical layout; delete them once the layout may reshuffle.
   */
  mute(f: () => void): void {
    this.muted++;
    f();
    this.muted--;
  }

  /** Meshy model `name` standing at (x, y, z), `h` m tall and `wide` times its own width, random yaw. */
  model(name: Model, x: number, y: number, z: number, h: number, wide = 1, tint?: THREE.ColorRepresentation, shadow = true): void {
    _q.setFromAxisAngle(UP, this.rm() * Math.PI * 2);
    const k = 1 - 0.07 + this.rm() * 0.14; // light per-instance shade and size so neighbours don't read as clones
    h *= 0.92 + this.rm() * 0.16;
    // Batched per 16 m chunk, as the grass (ground.ts): the plants out of view get culled.
    const chunk = `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
    this.push(proxy(name), 'foliage', _m.compose(_p.set(x, y, z), _q, _s.set(h * wide, h, h * wide)), new THREE.Color(tint ?? 0xffffff).multiplyScalar(k), shadow, chunk);
  }

  /** Random in [a, b). */
  rand(a: number, b: number): number {
    return a + (b - a) * this.r();
  }

  /** Instance `geo` at (x,y,z), scaled, rotated (Euler XYZ), optional colour multiplier. */
  put(geo: THREE.BufferGeometry, role: Role, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0, tint?: THREE.ColorRepresentation, shadow = true): void {
    _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')); // yaw last: tilts stay local to the prop
    this.push(geo, role, _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)), tint, shadow);
  }

  private push(geo: THREE.BufferGeometry, role: Role, m: THREE.Matrix4, tint?: THREE.ColorRepresentation, shadow = true, chunk = ''): void {
    if (this.muted) return;
    const key = `${geo.uuid}:${role}:${chunk}`;
    let bt = this.batches.get(key);
    if (!bt) this.batches.set(key, (bt = { geo, role, m: [], c: [], shadow }));
    bt.m.push(m.clone());
    // ponytail: per-instance tint multiplies the role material, so a later material pass keeps the variation
    bt.c.push(new THREE.Color(tint ?? 0xffffff));
  }

  /** Cylinder of radius r from point a to point b (poles, beams, branches). */
  rod(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, role: Role, smooth = false): void {
    _d.set(bx - ax, by - ay, bz - az);
    const len = _d.length();
    _q.setFromUnitVectors(UP, _d.divideScalar(len));
    this.push(role === 'trunk' ? BARK : smooth ? CYL_HI : CYL, role, _m.compose(_p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _s.set(r, len, r)));
  }

  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, role: Role, ry = 0, tint?: THREE.ColorRepresentation): void {
    this.put(BOX, role, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0), 0, ry, 0, tint);
  }

  /** Ellipsoid; leaf roles get a lumpy, vertex-shaded mass instead of a plain sphere. */
  blob(x: number, y: number, z: number, rx: number, ry: number, rz: number, role: Role, tint?: THREE.ColorRepresentation, faceted = false): void {
    const geo = faceted ? GEM : LEAF_ROLES.has(role) ? LEAFY[Math.floor(this.r() * LEAFY.length)] : BLOB;
    this.put(geo, role, x, y, z, rx, ry, rz, this.r() * 0.6, this.r() * 6.28, this.r() * 0.6, tint);
  }

  /** Leafy clump: a blob for the dark inner mass plus a shell of leaf cards that frays its outline. */
  crown(x: number, y: number, z: number, rx: number, ry: number, rz: number, role: Role, tint?: THREE.ColorRepresentation): void {
    const c = new THREE.Color(tint ?? 0xffffff);
    const mass = LEAFY[Math.floor(this.r() * LEAFY.length)];
    this.put(mass, role, x, y, z, rx * 0.8, ry * 0.8, rz * 0.8, this.rand(-0.15, 0.15), this.r() * 6.28, this.rand(-0.15, 0.15), c.clone().multiplyScalar(0.82));
    // ponytail: upright yaw only, so the cards' baked top light stays on top
    this.put(CARDS, role, x, y, z, rx, ry, rz, 0, this.r() * 6.28, 0, c);
  }

  cone(x: number, y: number, z: number, r: number, h: number, role: Role, tint?: THREE.ColorRepresentation): void {
    this.put(CONE, role, x, y, z, r, h, r, 0, this.r() * 6.28, 0, tint);
  }

  disc(x: number, y: number, z: number, r: number, h: number, role: Role, tint?: THREE.ColorRepresentation): void {
    this.put(DISC, role, x, y, z, r, h, r, 0, this.r() * 6.28, 0, tint);
  }

  /** Builds one InstancedMesh per batch into the builder's current zone and resets. */
  flush(): void {
    for (const { geo, role, m, c, shadow } of this.batches.values()) {
      const im = new THREE.InstancedMesh(geo, geo === CARDS ? leafMaterial(role) : material(role), m.length);
      m.forEach((mx, i) => { im.setMatrixAt(i, mx); im.setColorAt(i, c[i]); });
      if (geo === CARDS || !shadow) im.userData.castShadow = false; // alpha cards would cast square shadows; the mass casts
      const name = modelOf(geo);
      if (name) dress(im, name);
      im.computeBoundingSphere();
      im.computeBoundingBox();
      this.b.add(im, role);
    }
    this.batches.clear();
  }

  /** Light varied tint around white, so repeated leaves don't read as clones. */
  vary(spread = 0.14): THREE.Color {
    const k = 1 - spread / 2 + this.r() * spread;
    return new THREE.Color(k, k * (0.97 + this.r() * 0.06), k);
  }
}

// ---------------------------------------------------------------- vegetation

/** Gnarled olive (Meshy model), crown lifted clear of the player's head; trunk collider. */
export function olive(p: Props, x: number, z: number, s = 1): void {
  p.model('olive', x, 0, z, 4.2 * s, 1.1);
  p.mute(() => {
    const lean = p.rand(0, Math.PI * 2), tilt = p.rand(0.15, 0.4);
    const fx = x + Math.cos(lean) * tilt, fz = z + Math.sin(lean) * tilt; // fork point
    const fy = 1.3 * s;
    p.rod(x, 0, z, fx, fy, fz, 0.24 * s, 'trunk');
    p.blob(x, 0.12, z, 0.38 * s, 0.22, 0.38 * s, 'trunk', undefined, true); // root flare
    const arms = 2 + Math.floor(p.r() * 2);
    for (let i = 0; i < arms; i++) {
      const a = lean + (i / arms) * Math.PI * 2 + p.rand(-0.4, 0.4);
      const reach = p.rand(0.7, 1.3) * s;
      const ex = fx + Math.cos(a) * reach, ez = fz + Math.sin(a) * reach, ey = fy + p.rand(1.1, 1.6) * s;
      p.rod(fx, fy - 0.1, fz, ex, ey, ez, 0.13 * s, 'trunk');
      // two or three overlapping clumps per arm
      for (let k = 0; k < 3; k++) {
        const cr = p.rand(0.75, 1.1) * s, dy = p.rand(-0.15, 0.4);
        p.crown(ex + p.rand(-0.6, 0.6) * s, ey + (0.35 + dy) * s, ez + p.rand(-0.6, 0.6) * s, cr * 1.15, cr * 0.66, cr * 1.15, 'olive', p.vary(0.2).multiplyScalar(0.86 + 0.3 * dy));
      }
    }
    p.b.world.add(x, z, 0.22 * s, 0.22 * s, 0, 2.2);
  });
}

/** Orchard tree (Meshy model); trunk collider. */
export function fruitTree(p: Props, x: number, z: number, fruit: THREE.ColorRepresentation, s = 1): void {
  p.model('fruitTree', x, 0, z, 4.2 * s, 1.2);
  p.mute(() => {
    const top = 2.1 * s;
    p.rod(x, 0, z, x + p.rand(-0.1, 0.1), top, z + p.rand(-0.1, 0.1), 0.14 * s, 'trunk');
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + p.r();
      p.crown(x + Math.cos(a) * 0.7 * s, top + 0.75 * s + p.rand(-0.2, 0.3), z + Math.sin(a) * 0.7 * s, 0.95 * s, 0.8 * s, 0.95 * s, 'foliage', p.vary().multiplyScalar(0.88));
    }
    p.crown(x, top + 1.35 * s, z, 0.9 * s, 0.75 * s, 0.9 * s, 'foliage', p.vary().multiplyScalar(1.06));
    for (let k = 0; k < 9; k++) {
      const a = p.r() * Math.PI * 2, rr = p.rand(0.9, 1.45) * s;
      p.blob(x + Math.cos(a) * rr, top + p.rand(0.4, 1.4) * s, z + Math.sin(a) * rr, 0.11, 0.11, 0.11, 'fruit', fruit, true);
    }
    p.b.world.add(x, z, 0.16 * s, 0.16 * s, 0, 2.2);
  });
}

/** Italian cypress (Meshy model) about 1.8 m wide; trunk collider. */
export function cypress(p: Props, x: number, z: number, h = 7): void {
  p.model('cypress', x, 0, z, h, 1.8 / (MODELS.cypress[0] * h));
  p.mute(() => {
    p.rod(x, 0, z, x, 0.8, z, 0.15, 'trunk');
    const n = 5;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), r = 0.85 * (1 - t * 0.75);
      p.crown(x, 0.9 + t * (h - 1.6), z, r, h / n * 0.8, r, 'hedge', p.vary(0.1).multiplyScalar(0.8 + 0.3 * t));
    }
    p.cone(x, h - 1.2, z, 0.35, 1.4, 'hedge');
    p.b.world.add(x, z, 0.45, 0.45, 0, 2);
  });
}

/** Rounded shrub (Meshy model, tinted by role: box, pittosporum, sage); `solid` adds a collider. */
export function shrub(p: Props, x: number, z: number, r: number, role: Role = 'hedge', solid = false, y = 0): void {
  p.model('bush', x, y, z, 1.6 * r, 1, role === 'olive' ? 0xc8d8cc : role === 'hedge' ? 0xd8e4d0 : 0xffffff);
  p.mute(() => {
    p.crown(x, y + r * 0.55, z, r, r * 0.75, r, role, p.vary().multiplyScalar(0.92));
    p.crown(x + r * 0.35, y + r * 0.85, z - r * 0.2, r * 0.6, r * 0.5, r * 0.6, role, p.vary().multiplyScalar(1.05));
    if (solid) p.b.world.add(x, z, r * 0.7, r * 0.7, y, y + r * 1.2);
  });
}

/** Leaves, twigs and hanging fruit clusters lying over a pergola roof rectangle at height y. Vines are Meshy clumps; roses (`flowers`) stay procedural. */
export function vineCanopy(p: Props, x0: number, x1: number, z0: number, z1: number, y: number, bunch: THREE.ColorRepresentation, flowers = false): void {
  // A vine clump r wide, h tall, its top at `top`; the procedural leaves only roll the dice then.
  const vine = (x: number, top: number, z: number, r: number, h: number) => p.model('vine', x, top - h, z, h, (2 * r) / (MODELS.vine[0] * h));
  const leaf = (f: () => void) => (flowers ? f() : p.mute(f));
  const area = Math.abs((x1 - x0) * (z1 - z0));
  const n = Math.round(area * 0.55); // leaf cards fill out each clump, so fewer of them
  for (let i = 0; i < n; i++) {
    if (p.r() < 0.12) continue; // light gaps
    const x = p.rand(x0, x1), z = p.rand(z0, z1), r = p.rand(0.55, 0.95);
    if (!flowers && i % 2 === 0) vine(x, y + 0.35, z, r * 2, r * 0.7); // half as many, twice as wide; flat, so the grapes hang clear of the walk
    leaf(() => p.crown(x, y + p.rand(0.05, 0.3), z, r, r * 0.42, r, 'foliage', p.vary(0.24)));
  }
  // drooping fringe along the long edges
  const alongZ = Math.abs(z1 - z0) > Math.abs(x1 - x0);
  const len = alongZ ? Math.abs(z1 - z0) : Math.abs(x1 - x0);
  for (let t = 0; t < len; t += p.rand(0.9, 1.8)) {
    for (const side of [0, 1]) {
      const x = alongZ ? (side ? x1 : x0) : Math.min(x0, x1) + t;
      const z = alongZ ? Math.min(z0, z1) + t : side ? z1 : z0;
      leaf(() => p.crown(x, y - 0.25, z, 0.35, p.rand(0.35, 0.6), 0.35, 'foliage', p.vary(0.2).multiplyScalar(0.85)));
    }
  }
  for (let i = 0; i < area / 3; i++) {
    const x = p.rand(x0 + 0.3, x1 - 0.3), z = p.rand(z0 + 0.3, z1 - 0.3);
    if (flowers) p.blob(x, y - 0.05, z, 0.16, 0.16, 0.16, 'flower', bunch, true);
    else leaf(() => p.put(CONE, 'fruit', x, y - 0.05, z, 0.09, 0.24, 0.09, Math.PI, 0, 0, bunch)); // the clumps carry their grapes
  }
}

/** A climbing stem twisting up a post to the beam at height `top`. */
export function climber(p: Props, x: number, z: number, top: number, role: Role = 'trunk'): void {
  let px = x, pz = z, py = 0;
  for (let i = 1; i <= 3; i++) {
    const a = i * 2.1 + p.r();
    const nx = x + Math.cos(a) * 0.17, nz = z + Math.sin(a) * 0.17, ny = (top * i) / 3;
    p.rod(px, py, pz, nx, ny, nz, 0.05, role);
    p.blob(nx, ny - 0.3, nz, 0.16, 0.12, 0.16, 'foliage', p.vary(0.2)); // leaf tuft at each turn
    px = nx; pz = nz; py = ny;
  }
}

// ---------------------------------------------------------------- structures

/**
 * Rustic pole pergola over a walkway (the orto's covered paths). Runs along `axis`
 * between a0..a1 with the walk spanning c0..c1 across it; poles sit on both edges
 * every ~3 m, no pole inside any `gaps` range (crossings), and corner poles at gap edges.
 * Poles collide as thin posts; nothing else does, so the walk stays open.
 */
export function walkPergola(p: Props, axis: 'x' | 'z', a0: number, a1: number, c0: number, c1: number, gaps: [number, number][], posts: Map<string, [number, number]>): void {
  const H = 2.6;
  const at = (a: number, c: number): [number, number] => (axis === 'z' ? [c, a] : [a, c]);
  // segment the run at the gaps, place evenly spaced stations on each solid segment
  const cuts = [a0, ...gaps.flat().sort((u, v) => u - v), a1];
  const stations: number[] = [];
  for (let i = 0; i < cuts.length; i += 2) {
    const s0 = cuts[i], s1 = cuts[i + 1], n = Math.max(1, Math.round((s1 - s0) / 3));
    for (let k = 0; k <= n; k++) stations.push(s0 + ((s1 - s0) * k) / n);
  }
  for (const a of stations) {
    for (const c of [c0, c1]) {
      const [x, z] = at(a, c);
      posts.set(`${x.toFixed(2)},${z.toFixed(2)}`, [x, z]);
    }
    const [ax, az] = at(a, c0 - 0.35), [bx, bz] = at(a, c1 + 0.35);
    p.rod(ax, H, az, bx, H, bz, 0.09, 'wood'); // cross beam
  }
  for (const c of [c0, c1]) {
    const [ax, az] = at(a0 - 0.3, c), [bx, bz] = at(a1 + 0.3, c);
    p.rod(ax, H + 0.16, az, bx, H + 0.16, bz, 0.08, 'wood'); // long rail
  }
  // lath of thin poles across the top
  for (let a = a0; a <= a1; a += 0.7) {
    const [ax, az] = at(a, c0 - 0.5), [bx, bz] = at(a, c1 + 0.5);
    p.rod(ax, H + 0.3, az, bx, H + 0.3, bz, 0.035, 'wood');
  }
}

/** Raw poles for the stations collected by walkPergola (shared corners placed once). */
export function pergolaPosts(p: Props, posts: Map<string, [number, number]>, h = 2.75): void {
  let i = 0;
  for (const [x, z] of posts.values()) {
    p.rod(x, 0, z, x + p.rand(-0.04, 0.04), h, z + p.rand(-0.04, 0.04), 0.11, 'wood');
    p.b.world.add(x, z, 0.1, 0.1, 0, h);
    if (i++ % 2 === 0) climber(p, x, z, h);
  }
}

/** Wooden slatted bench facing local -z, rotated `rot` about Y. */
export function bench(p: Props, x: number, z: number, rot: number): void {
  const c = Math.cos(rot), s = Math.sin(rot);
  const at = (lx: number, lz: number): [number, number] => [x + c * lx + s * lz, z - s * lx + c * lz];
  const part = (lx: number, lz: number, w: number, d: number, y0: number, y1: number, tiltX = 0) => {
    const [px, pz] = at(lx, lz);
    p.put(BOX, 'wood', px, (y0 + y1) / 2, pz, w, y1 - y0, d, tiltX, rot, 0);
  };
  for (const lz of [-0.15, 0, 0.15]) part(0, lz, 1.8, 0.12, 0.42, 0.47); // seat slats
  for (const ly of [0.62, 0.78]) part(0, 0.27, 1.8, 0.04, ly, ly + 0.11, -0.15); // back slats
  for (const lx of [-0.75, 0.75]) {
    part(lx, -0.15, 0.08, 0.08, 0, 0.42);
    part(lx, 0.25, 0.08, 0.08, 0, 0.9);
  }
  p.b.world.add(x, z, 0.9, 0.3, 0, 0.9, rot);
}

/** Dressing for an existing well-head column (r, top h): rim, dark water, optional pulley frame. */
export function wellTop(p: Props, x: number, z: number, r: number, h: number, frame: boolean): void {
  p.put(CYL_HI, 'stone', x, h + 0.06, z, r + 0.08, 0.12, r + 0.08);
  p.disc(x, h + 0.12, z, r * 0.72, 0.005, 'water', 0x445566); // dark opening on the rim
  if (!frame) return;
  for (const s of [-1, 1]) p.rod(x + s * r * 0.85, h, z, x + s * r * 0.85, h + 1.7, z, 0.06, 'stoneDark');
  p.rod(x - r, h + 1.7, z, x + r, h + 1.7, z, 0.05, 'stoneDark');
  p.put(CYL_HI, 'wood', x, h + 1.55, z, 0.14, 0.08, 0.14, 0, 0, Math.PI / 2);
  p.rod(x, h + 1.15, z, x, h + 1.55, z, 0.01, 'wood'); // rope
  p.put(DISC, 'wood', x, h + 0.9, z, 0.15, 0.25, 0.15); // bucket
}
