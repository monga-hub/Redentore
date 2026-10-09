import * as THREE from 'three';
import { type LevelBuilder, extrude, ring, shaped } from '../builder.ts';
import { material } from '../materials.ts';
import { Props } from '../props.ts';
import { CHURCH_FLOOR as F } from '../plan.ts';

// Interior of the Redentore read as a WoW cathedral (Scarlet Monastery, Cathedral of Light):
// Palladio's single nave keeps its plan, the dressing turns heavy and theatrical. Pilastered
// piers under a full entablature, round-arched chapels, an azure coffered barrel vault on
// stone ribs with gilt rosettes, triumphal arches into the domed crossing (gilt drum and
// ribbed dome under a moonlit oculus), a baldacchino over the high altar, crimson carpet
// and banners, chandeliers, and stained glass whose moonlight falls in coloured shafts with
// the window's print on the floor. Only pilasters, baldacchino columns and candelabra
// collide; the aisle from the door to the altar stays open.
//   vault       r 7 springing at F+13 (crown F+20): nave z -0.5..-29, presbytery+choir z -45..-59.5
//   order       pilasters F..F+11.6, entablature F+11.6..F+13; crossing piers up to F+15.6
//   glass       chapel lancets on the outer walls (x ±12), thermal lunettes on the facade and
//               choir walls, eight drum lancets, oculus at the top of the dome

const R = 7, SPRING = F + 13, TOP = F + 20;
const P = F + 0.6; // presbytery and choir floor
const CX = -37; // crossing centre z
const V2 = THREE.Vector2, V3 = THREE.Vector3;

export function buildChiesaInterior(b: LevelBuilder): void {
  const p = new Props(b, 71);
  vaults(b, p);
  order(b);
  crossing(b, p);
  const glass = windows(b);
  altar(b, p);
  carpet(b);
  for (const z of [-5, -14, -23]) chandelier(b, p, z);
  banners(b);
  shafts(b, glass);
  p.flush();
}

// ---------------------------------------------------------------- vaults

/** Coffered barrel vault over z0..z1 (z0 > z1): azure shell, stone ribs both ways, a gilt rosette per coffer. */
function vault(b: LevelBuilder, p: Props, z0: number, z1: number, ribs: number[], main: number[]): void {
  const len = z0 - z1;
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(R, R, len, 48, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), material('azure', true));
  shell.position.set(0, SPRING, (z0 + z1) / 2);
  b.add(shell, 'azure');
  b.cameraBlockers.push(shell);
  for (const z of ribs) b.decor(shaped(ring(0, SPRING, R - 0.3, R + 0.05, 0.32)).translate(0, 0, z), 'stoneDark');
  for (const z of main) {
    b.decor(shaped(ring(0, SPRING, R - 0.55, R + 0.05, 0.8)).translate(0, 0, z), 'stoneDark');
    b.decor(shaped(ring(0, SPRING, R - 0.62, R - 0.5, 0.5)).translate(0, 0, z), 'gold');
  }
  for (let k = 1; k < 8; k++) {
    const a = (k * Math.PI) / 8, m = new THREE.Matrix4().makeRotationZ(a).setPosition((R - 0.14) * Math.cos(a), SPRING + (R - 0.14) * Math.sin(a), 0);
    b.part(m, -0.15, 0.15, -0.13, 0.13, z1, z0, 'stoneDark');
  }
  const lines = [z0, ...ribs, z1].sort((u, v) => v - u);
  for (let i = 0; i < lines.length - 1; i++) {
    const z = (lines[i] + lines[i + 1]) / 2;
    for (let k = 0; k < 8; k++) {
      const a = ((k + 0.5) * Math.PI) / 8, r = R - 0.06;
      p.put(ROSETTE, 'gold', r * Math.cos(a), SPRING + r * Math.sin(a), z, 0.3, 0.08, 0.3, 0, 0, a - Math.PI / 2);
    }
  }
}

/** Triumphal arch at z: the wall above the vault's springing, ghiera and gilt soffit band, facing both ways. */
function arch(b: LevelBuilder, z: number, half: number): void {
  const s = new THREE.Shape().moveTo(-half, SPRING).lineTo(-R, SPRING).absarc(0, SPRING, R, Math.PI, 0, true).lineTo(half, SPRING).lineTo(half, TOP + 0.8).lineTo(-half, TOP + 0.8).closePath();
  b.decor(shaped(extrude(s, 0.8, 0.03), SPRING, TOP + 0.8 - SPRING).translate(0, 0, z), 'stone', true);
  b.decor(shaped(ring(0, SPRING, R - 0.2, R + 0.6, 1.3)).translate(0, 0, z), 'stoneDark');
  b.decor(shaped(ring(0, SPRING, R - 0.3, R - 0.15, 1.0)).translate(0, 0, z), 'gold');
  b.part(null, -0.35, 0.35, SPRING + R - 0.3, SPRING + R + 0.75, z - 0.8, z + 0.8, 'gold'); // keystone
}

function vaults(b: LevelBuilder, p: Props): void {
  const nave = [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => -9.375 - 2.3125 * k).filter((z) => z < -1 && z > -28.5);
  vault(b, p, -0.5, -29, nave, [-9.375, -18.625, -27.875]);
  vault(b, p, -45, -59.5, [1, 2, 3, 4, 5].map((k) => -45 - (14.5 * k) / 6), [-53.5]);
  arch(b, -29, 8);
  arch(b, -45, 8);
}

// ---------------------------------------------------------------- order

/** Pilaster on a wall face along z (face at x = xf, room side = sign nx), base y0 to capital top y1. */
function pilaster(b: LevelBuilder, xf: number, z: number, nx: number, y0: number, y1: number, w = 0.8): void {
  const x = (d: number) => xf + nx * d, h = w / 2;
  b.part(null, x(0), x(0.3), y0, y1 - 0.6, z - h, z + h, 'stone');
  b.part(null, x(0), x(0.42), y0, y0 + 0.5, z - h - 0.1, z + h + 0.1, 'stoneDark'); // base
  b.part(null, x(0), x(0.36), y1 - 0.72, y1 - 0.6, z - h - 0.04, z + h + 0.04, 'gold'); // astragal
  b.part(null, x(0), x(0.46), y1 - 0.6, y1, z - h - 0.12, z + h + 0.12, 'stoneDark'); // capital
  b.world.add(x(0.21), z, 0.21, h + 0.1, y0, y1);
}

/** Entablature along a z wall face: frieze, gilt fillet, projecting cornice. */
function entablatureZ(b: LevelBuilder, xf: number, nx: number, z0: number, z1: number, y: number): void {
  const x = (d: number) => xf + nx * d;
  b.part(null, x(0), x(0.32), y, y + 0.9, z0, z1, 'stone');
  b.part(null, x(0), x(0.4), y + 0.82, y + 0.92, z0, z1, 'gold');
  b.part(null, x(0), x(0.75), y + 0.92, y + 1.4, z0, z1, 'stoneDark');
}

function entablatureX(b: LevelBuilder, zf: number, nz: number, x0: number, x1: number, y: number): void {
  const z = (d: number) => zf + nz * d;
  b.part(null, x0, x1, y, y + 0.9, z(0), z(0.32), 'stone');
  b.part(null, x0, x1, y + 0.82, y + 0.92, z(0), z(0.4), 'gold');
  b.part(null, x0, x1, y + 0.92, y + 1.4, z(0), z(0.75), 'stoneDark');
}

function order(b: LevelBuilder): void {
  const E = F + 11.6;
  for (const s of [-1, 1]) {
    const xf = 7 * s, n = -s;
    // Nave piers between the chapel arches: a pair on each wide pier, one by the facade.
    pilaster(b, xf, -1.15, n, F, E, 0.7);
    for (const c of [-9.375, -18.625, -27.625]) for (const d of [-0.9, 0.9]) pilaster(b, xf, c + d, n, F, E);
    entablatureZ(b, xf, n, -0.5, -29, E);
    // Presbytery and choir.
    for (const z of [-46, -59]) pilaster(b, xf, z, n, P, E);
    entablatureZ(b, xf, n, -45, -59.5, E);
    // Crossing piers (faces at x ±7.5), clear of the torches at z -31 / -43; entablature over the apse arches.
    for (const z of [-32.4, -41.6]) pilaster(b, 7.5 * s, z, n, F, F + 14.4, 1);
    entablatureZ(b, 7.5 * s, n, -29, -45, F + 14.45);
  }
  entablatureX(b, -0.5, -1, -7, 7, E); // inside the facade, under the thermal window
  entablatureX(b, -59.5, 1, -7, 7, E); // choir back wall
}

// ---------------------------------------------------------------- crossing

function crossing(b: LevelBuilder, p: Props): void {
  // Drum: base and top cornices, pilaster strips between the windows.
  const lathe = (pts: [number, number][], y: number, role: 'stoneDark' | 'gold') => {
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, h]) => new V2(r, h)), 48), material(role, true));
    m.position.set(0, y, CX);
    b.add(m, role);
  };
  lathe([[8, 0], [7.4, 0], [7.4, 0.14], [7.5, 0.22], [7.5, 0.5], [8, 0.5]], TOP + 0.8, 'stoneDark');
  lathe([[8, 0], [7.55, 0.08], [7.55, 0.3], [8, 0.36]], F + 26.45, 'gold');
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4, m = face(7.98 * Math.cos(a), CX + 7.98 * Math.sin(a), -Math.cos(a), -Math.sin(a));
    b.part(m, -0.32, 0.32, TOP + 1.3, F + 26.45, 0, 0.22, 'stone');
  }
  // Dome: azure inner shell, sixteen gilt ribs, moonlit oculus.
  const inner = new THREE.Mesh(new THREE.SphereGeometry(7.88, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2), material('azure', true));
  inner.position.set(0, F + 26.8, CX);
  b.add(inner, 'azure');
  for (let k = 0; k < 16; k++) p.put(RIB, 'gold', 0, F + 26.8, CX, 1, 1, 1, 0, (k * Math.PI) / 8, 0);
  p.put(OCULUS_RING, 'gold', 0, F + 34.45, CX, 1, 1, 1);
  const oculus = new THREE.Mesh(new THREE.CircleGeometry(1.05, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.5, 3.2), fog: false }));
  oculus.position.set(0, F + 34.5, CX);
  oculus.userData.castShadow = false;
  b.add(oculus);

  // Floor inlay under the dome: two stone rings and a gilt sixteen-point star.
  const flat = (s: THREE.Shape, role: 'stoneDark' | 'gold', y: number) => b.decor(shaped(extrude(s, 0.02, 0)).rotateX(-Math.PI / 2).translate(0, F + y, CX), role);
  for (const [r0, r1] of [[6.2, 6.6], [3.3, 3.5]]) {
    const s = new THREE.Shape().absarc(0, 0, r1, 0, Math.PI * 2, false);
    s.holes.push(new THREE.Path().absarc(0, 0, r0, 0, Math.PI * 2, true));
    flat(s, 'stoneDark', 0.012);
  }
  const star = new THREE.Shape(Array.from({ length: 32 }, (_, i) => {
    const a = (i * Math.PI) / 16, r = i % 2 ? 1.05 : i % 4 ? 2.1 : 2.8;
    return new V2(r * Math.cos(a), r * Math.sin(a));
  }));
  flat(star, 'gold', 0.014);
}

// ---------------------------------------------------------------- stained glass

type Kind = 'lancet' | 'fan';
interface Win { kind: Kind; m: THREE.Matrix4; outline: THREE.Vector2[] }

/** Frame on a wall face through (x, z): local x along the wall, y = world y, z = the room-side normal. */
function face(x: number, z: number, nx: number, nz: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeBasis(new V3(nz, 0, -nx), new V3(0, 1, 0), new V3(nx, 0, nz)).setPosition(x, 0, z);
}

/** Round-headed light w wide from y0 to y1 (counter-clockwise outline). */
function lancet(w: number, y0: number, y1: number, n = 10): THREE.Vector2[] {
  const r = w / 2, sp = y1 - r, pts = [new V2(-r, y0)];
  for (let i = 0; i <= n; i++) pts.push(new V2(r * Math.cos((Math.PI * i) / n), sp + r * Math.sin((Math.PI * i) / n)));
  pts.splice(1, 0, new V2(r, y0));
  return pts;
}

/** Thermal (Diocletian) lunette: half disc of radius r on the line y0. */
function fan(r: number, y0: number, n = 24): THREE.Vector2[] {
  return Array.from({ length: n + 1 }, (_, i) => new V2(r * Math.cos((Math.PI * i) / n), y0 + r * Math.sin((Math.PI * i) / n)));
}

function windows(b: LevelBuilder): Win[] {
  const out: Win[] = [];
  const add = (kind: Kind, m: THREE.Matrix4, outline: THREE.Vector2[], frame: THREE.Vector2[]) => {
    out.push({ kind, m, outline });
    const s = new THREE.Shape(frame);
    s.holes.push(new THREE.Path(outline.slice().reverse()));
    b.decor(shaped(extrude(s, 0.26, 0.03)).translate(0, 0, 0.1).applyMatrix4(m), 'stoneDark');
  };
  for (const s of [-1, 1]) for (const z of [-4.75, -14, -23.75]) {
    add('lancet', face(12 * s, z, -s, 0), lancet(1.6, F + 6.8, F + 11.6), lancet(2.1, F + 6.55, F + 11.85));
  }
  for (let k = 0; k < 8; k++) {
    const a = ((k + 0.5) * Math.PI) / 4;
    add('lancet', face(7.97 * Math.cos(a), CX + 7.97 * Math.sin(a), -Math.cos(a), -Math.sin(a)), lancet(1.4, TOP + 1.5, F + 25.7), lancet(1.8, TOP + 1.3, F + 25.9));
  }
  for (const [z, nz] of [[-0.5, -1], [-59.5, 1]]) {
    const m = face(0, z, 0, nz), y0 = SPRING + 0.45, r = 5.7;
    add('fan', m, fan(r, y0), fan(r + 0.35, y0 - 0.3));
    for (const x of [-r / 3, r / 3]) b.part(m, x - 0.14, x + 0.14, y0, y0 + Math.sqrt(r * r - x * x), 0, 0.3, 'stoneDark'); // mullions
  }
  // The panes: one mesh per pattern, HDR so bloom lifts them.
  for (const kind of ['lancet', 'fan'] as const) {
    const geos = out.filter((w) => w.kind === kind).map((w) => pane(w.outline).translate(0, 0, 0.05).applyMatrix4(w.m));
    const mesh = new THREE.Mesh(mergeAll(geos), new THREE.MeshBasicMaterial({ map: glassTexture(kind), color: new THREE.Color(2.3, 2.3, 2.3), fog: false }));
    mesh.userData.castShadow = false;
    b.add(mesh);
  }
  return out;
}

/** Flat pane over an outline, UVs normalised to its bounding box. */
function pane(outline: THREE.Vector2[]): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(new THREE.Shape(outline));
  const box = new THREE.Box2().setFromPoints(outline), size = box.getSize(new V2());
  const pos = g.getAttribute('position'), uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - box.min.x) / size.x, (pos.getY(i) - box.min.y) / size.y);
  return g;
}

function mergeAll(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const n = flat.reduce((s, g) => s + g.getAttribute('position').count, 0);
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of flat) {
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    uv.set(g.getAttribute('uv').array as Float32Array, o * 2);
    o += g.getAttribute('position').count;
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)).setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// Scarlet glass: crimson and gold dominant, cobalt and violet to cool it, a little green.
const GLASS: [number, number, number, number][] = [
  [0.72, 0.05, 0.06, 0.38], [0.86, 0.56, 0.1, 0.2], [0.1, 0.2, 0.68, 0.24], [0.4, 0.1, 0.5, 0.12], [0.16, 0.46, 0.2, 0.06],
];
const LEAD: [number, number, number] = [0.03, 0.025, 0.02];

function hash(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

function pick(h: number): [number, number, number] {
  for (const [r, g, bl, w] of GLASS) {
    if (h < w) return [r, g, bl];
    h -= w;
  }
  return [GLASS[0][0], GLASS[0][1], GLASS[0][2]];
}

/**
 * Painted stained glass, pure data (runs in Node for the walk check). Lancet: diamond
 * quarries around a petalled medallion, banded border. Fan: three lights split by mullions,
 * gilt sunburst at the foot, radial crimson and cobalt panes, banded rim.
 */
const GLASS_MAPS = new Map<Kind, THREE.DataTexture>();

function glassTexture(kind: Kind): THREE.DataTexture {
  const hit = GLASS_MAPS.get(kind);
  if (hit) return hit;
  const W = kind === 'lancet' ? 128 : 256, H = kind === 'lancet' ? 384 : 128, d = new Uint8Array(W * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    let c: [number, number, number];
    if (kind === 'lancet') {
      const x = i + 0.5, y = j + 0.5, r = W / 2, edge = Math.min(x, W - x, y < H - r ? Infinity : r - Math.hypot(x - r, y - (H - r)), y);
      const mx = x - r, my = y - H * 0.58, mr = Math.hypot(mx, my), ma = Math.atan2(my, mx);
      if (edge < 3) c = LEAD;
      else if (edge < 11) c = edge < 4.5 || edge > 9.5 ? LEAD : Math.floor((y + x * 0.2) / 14) % 2 ? [0.86, 0.56, 0.1] : [0.72, 0.05, 0.06];
      else if (mr < 46) {
        const sector = Math.floor(((ma + Math.PI) / (Math.PI * 2)) * 8), sa = ((ma + Math.PI) / (Math.PI * 2)) * 8 - sector;
        if (Math.abs(mr - 46) < 2.5 || Math.abs(mr - 16) < 2 || (mr > 16 && Math.min(sa, 1 - sa) * mr * 0.785 < 1.4)) c = LEAD;
        else if (mr < 16) c = [0.95, 0.75, 0.25];
        else c = sector % 2 ? [0.72, 0.05, 0.06] : [0.1, 0.2, 0.68];
      } else {
        const a = (x + y) / 18, bq = (x - y) / 18, fa = a - Math.floor(a), fb = bq - Math.floor(bq);
        c = Math.min(fa, 1 - fa, fb, 1 - fb) < 0.07 ? LEAD : pick(hash(Math.floor(a), Math.floor(bq)));
      }
    } else {
      const x = i + 0.5 - W / 2, y = j + 0.5, R0 = W / 2, rr = Math.hypot(x, y) / R0, a = Math.atan2(y, x);
      const sec = (a / Math.PI) * 14, fs = sec - Math.floor(sec);
      if (rr > 0.985 || Math.abs(Math.abs(x) - R0 / 3) < 3) c = LEAD;
      else if (rr > 0.9) c = Math.abs(rr - 0.9) < 0.012 ? LEAD : Math.floor(sec * 2) % 2 ? [0.86, 0.56, 0.1] : [0.72, 0.05, 0.06];
      else if (rr < 0.3) {
        const ray = Math.floor((a / Math.PI) * 18);
        c = Math.abs(rr - 0.3) < 0.015 || rr < 0.012 ? LEAD : ray % 2 ? [0.98, 0.82, 0.35] : [0.86, 0.5, 0.1];
      } else if (Math.abs(rr - 0.3) < 0.015 || Math.abs(rr - 0.6) < 0.012 || Math.min(fs, 1 - fs) * rr * 3.1 < 0.022) c = LEAD;
      else {
        const band = rr < 0.6 ? 0 : 1, cell = Math.floor(sec);
        c = (cell + band) % 2 ? [0.72, 0.05, 0.06] : band ? [0.1, 0.2, 0.68] : [0.4, 0.1, 0.5];
        if (hash(cell, band) < 0.2) c = [0.86, 0.56, 0.1];
      }
    }
    const k = c === LEAD ? 1 : 0.82 + 0.3 * hash(i >> 3, j >> 3), o = (j * W + i) * 4;
    d[o] = Math.min(255, c[0] * k * 255); d[o + 1] = Math.min(255, c[1] * k * 255); d[o + 2] = Math.min(255, c[2] * k * 255); d[o + 3] = 255;
  }
  const t = dataTexture(d, W, H);
  GLASS_MAPS.set(kind, t);
  return t;
}

function dataTexture(d: Uint8Array, w: number, h: number, srgb = true): THREE.DataTexture {
  const t = new THREE.DataTexture(d, w, h);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/** Alpha profile of a light shaft: soft across each face, fading from the window to the floor. */
function shaftTexture(): THREE.DataTexture {
  const W = 32, H = 64, d = new Uint8Array(W * H * 4).fill(255);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = (i + 0.5) / W, v = (j + 0.5) / H; // v 0 = window
    const across = Math.pow(Math.sin(Math.PI * u), 1.4) * (0.8 + 0.2 * Math.sin(u * 23));
    d[(j * W + i) * 4 + 3] = 255 * across * Math.min(1, v / 0.08) * (1 - 0.7 * v);
  }
  return dataTexture(d, W, H, false);
}

function discTexture(): THREE.DataTexture {
  const N = 64, d = new Uint8Array(N * N * 4).fill(255);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const r = Math.hypot(i + 0.5 - N / 2, j + 0.5 - N / 2) / (N / 2);
    d[(j * N + i) * 4 + 3] = 255 * Math.max(0, Math.min(1, (1 - r) / 0.6)) ** 1.5;
  }
  return dataTexture(d, N, N, false);
}

// ---------------------------------------------------------------- moonlight shafts

const additive = (o: THREE.MeshBasicMaterialParameters) => new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide, ...o });

/**
 * Moonlight through a window: its outline (world, coarse) swept along `dir` to the floor as
 * an additive prism, and the full outline printed on the floor with the window's own glass
 * texture. `spread` widens the print around its centre (a shaft from a small oculus).
 */
function shaft(b: LevelBuilder, w: { outline: THREE.Vector2[]; m: THREE.Matrix4 }, dir: THREE.Vector3, floor: number, tint: THREE.Color, print: THREE.Texture, strength: number, spread = 1): void {
  const world = w.outline.map((v) => new V3(v.x, v.y, 0.06).applyMatrix4(w.m));
  const land = (q: THREE.Vector3) => q.clone().addScaledVector(dir, (q.y - floor) / -dir.y);
  let foot = world.map(land);
  const c = foot.reduce((s, q) => s.add(q), new V3()).divideScalar(foot.length);
  foot = foot.map((q) => c.clone().lerp(q, spread));
  // Sides: a coarse ring of quads (every other outline point keeps the faces broad).
  const ringIdx = world.map((_, i) => i).filter((i) => i % 2 === 0 || world.length < 8);
  const pos: number[] = [], uv: number[] = [];
  ringIdx.forEach((i, k) => {
    const j = ringIdx[(k + 1) % ringIdx.length];
    for (const [q, u, v] of [[world[i], 0, 0], [world[j], 1, 0], [foot[j], 1, 1], [world[i], 0, 0], [foot[j], 1, 1], [foot[i], 0, 1]] as const) {
      pos.push(q.x, q.y, q.z);
      uv.push(u, v);
    }
  });
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)).setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const beam = new THREE.Mesh(g, additive({ map: SHAFT, color: tint.clone().multiplyScalar(strength) }));
  beam.renderOrder = 2;
  b.add(beam);
  // Floor print: the pane's own triangulation with every vertex carried down to the floor.
  const pg = pane(w.outline).translate(0, 0, 0.06).applyMatrix4(w.m), pp = pg.getAttribute('position');
  for (let i = 0; i < pp.count; i++) {
    const q = c.clone().lerp(land(new V3().fromBufferAttribute(pp, i)), spread);
    pp.setXYZ(i, q.x, floor + 0.035, q.z);
  }
  const printMesh = new THREE.Mesh(pg, additive({ map: print, color: tint.clone().multiplyScalar(strength * 2.2) }));
  printMesh.renderOrder = 2;
  b.add(printMesh);
  b.lights.push({ x: c.x, y: floor + 1.4, z: c.z, kind: 'glow', color: tint.getHex() });
}

const SHAFT = shaftTexture();

function shafts(b: LevelBuilder, glass: Win[]): void {
  // East chapels catch the moon (ESE); their shafts cross the nave towards the west pews.
  const east = new V3(-0.7, -0.66, -0.18).normalize();
  const lancetPrint = glassTexture('lancet'), fanPrint = glassTexture('fan');
  const tints = [0xff4a52, 0xffc070, 0x7a94ff].map((c) => new THREE.Color(c));
  glass.filter((w) => w.kind === 'lancet' && w.m.elements[12] > 11).forEach((w, i) => shaft(b, w, east, F, tints[i], lancetPrint, 0.22));
  // Facade lunette faces the southern sky: a wide, pale fan of light over the first pews.
  const front = glass.find((w) => w.kind === 'fan' && w.m.elements[14] > -1)!;
  shaft(b, front, new V3(0, -0.78, -0.62).normalize(), F, new THREE.Color(0xb8c4ff), fanPrint, 0.12);
  // Oculus: a single cold column straight down onto the star under the dome.
  shaft(b, { outline: Array.from({ length: 12 }, (_, i) => new V2(Math.cos((i * Math.PI) / 6), Math.sin((i * Math.PI) / 6))), m: new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, F + 34.4, CX) },
    new V3(0, -1, 0), F, new THREE.Color(0xc8d4ff), discTexture(), 0.2, 2.4);
}

// ---------------------------------------------------------------- altar

function altar(b: LevelBuilder, p: Props): void {
  const az = -49.9;
  // Baldacchino: four columns, gilt-banded entablature with a crimson valance, gilt cupola,
  // cross before a sunburst.
  for (const x of [-2.45, 2.45]) for (const z of [-48.1, -51.7]) {
    b.order(x, z, 0.2, P, P + 5.8, 'stoneDark');
    b.part(null, x - 0.24, x + 0.24, P + 4.9, P + 5.0, z - 0.24, z + 0.24, 'gold');
  }
  b.part(null, -2.8, 2.8, P + 5.8, P + 6.5, -47.75, -52.05, 'stoneDark');
  b.part(null, -2.86, 2.86, P + 6.05, P + 6.22, -47.69, -52.11, 'gold');
  for (const [x0, x1, z0, z1] of [[-2.8, 2.8, -47.7, -47.74], [-2.8, 2.8, -52.06, -52.1], [-2.84, -2.8, -47.7, -52.1], [2.8, 2.84, -47.7, -52.1]]) {
    b.part(null, x0, x1, P + 5.3, P + 5.8, z0, z1, 'cloth');
    b.part(null, x0 - 0.005, x1 + 0.005, P + 5.3, P + 5.36, z0 - 0.005, z1 + 0.005, 'gold');
  }
  p.put(CUPOLA, 'gold', 0, P + 6.5, az, 2.1, 1.15, 1.7);
  p.box(-0.09, 0.09, P + 7.5, P + 10.3, az - 0.09, az + 0.09, 'gold');
  p.box(-0.55, 0.55, P + 9.2, P + 9.38, az - 0.09, az + 0.09, 'gold');
  p.put(ROSETTE, 'gold', 0, P + 9.29, az - 0.15, 0.55, 0.05, 0.55, Math.PI / 2);
  for (let k = 0; k < 24; k++) {
    const a = (k * Math.PI) / 12, len = k % 2 ? 0.75 : 1.3, r = 0.55 + len / 2;
    p.put(RAY, 'gold', -Math.sin(a) * r, P + 9.29 + Math.cos(a) * r, az - 0.15, 0.07, len, 0.03, 0, 0, a);
  }
  // Frontal on the high altar (front face z -49.3).
  b.part(null, -1.45, 1.45, P + 0.08, P + 0.94, -49.3, -49.26, 'cloth');
  for (const [x0, x1, y0, y1] of [[-1.45, 1.45, P + 0.86, P + 0.94], [-1.45, 1.45, P + 0.08, P + 0.15], [-0.08, 0.08, P + 0.15, P + 0.86], [-0.4, 0.4, P + 0.56, P + 0.64]]) {
    b.part(null, x0, x1, y0, y1, -49.28, -49.245, 'gold');
  }
  b.lights.push({ x: 0, y: P + 2.2, z: -48.4, kind: 'glow', color: 0xffa860 }); // the altar's candles, as one steady warm fill
  // Gilt candelabra, one each side.
  for (const s of [-1, 1]) {
    const x = 3.5 * s;
    p.cone(x, P, az, 0.32, 0.35, 'gold');
    p.rod(x, P, az, x, P + 1.75, az, 0.045, 'gold', true);
    p.rod(x - 0.45, P + 1.55, az, x + 0.45, P + 1.55, az, 0.03, 'gold', true);
    for (const [dx, y] of [[-0.45, P + 1.55], [0, P + 1.75], [0.45, P + 1.55]]) candle(b, p, x + dx, y, az);
    b.world.add(x, az, 0.25, 0.25, P, P + 1.8);
  }
}

function candle(b: LevelBuilder, p: Props, x: number, y: number, z: number, h = 0.26): void {
  p.disc(x, y, z, 0.07, 0.05, 'gold');
  p.rod(x, y + 0.04, z, x, y + h, z, 0.026, 'flower');
  b.lights.push({ x, y: y + h + 0.01, z, kind: 'candle' });
}

// ---------------------------------------------------------------- carpet, chandeliers, banners

/** Crimson runner with gilt borders from the door, through the crossing, up the steps to the altar. */
function carpet(b: LevelBuilder): void {
  const run = (y: number, z0: number, z1: number) => {
    b.part(null, -1.1, 1.1, y, y + 0.025, z0, z1, 'cloth');
    for (const s of [-1, 1]) b.part(null, 1.1 * s, 1.24 * s, y, y + 0.026, z0, z1, 'gold');
  };
  run(F, -0.6, -45);
  for (let i = 0; i < 3; i++) {
    const z0 = -45 - 0.4 * i, top = F + 0.2 * (i + 1);
    run(top, z0, z0 - 0.4);
    b.part(null, -1.1, 1.1, top - 0.2, top + 0.025, z0 + 0.025, z0, 'cloth'); // riser
  }
  run(P, -46.2, -49.2);
}

const TORUS = new THREE.TorusGeometry(1, 0.045, 6, 32).rotateX(Math.PI / 2);

/** Gilt wheel of eight candles hung on chains from the vault crown, with a real lamp in the pool. */
function chandelier(b: LevelBuilder, p: Props, z: number): void {
  const y = F + 7.6, hook = y + 2.2;
  p.put(TORUS, 'gold', 0, y, z, 1.35, 1.6, 1.35);
  p.put(TORUS, 'gold', 0, y + 0.45, z, 0.55, 1.2, 0.55);
  p.put(GEM, 'gold', 0, y + 0.1, z, 0.22, 0.32, 0.22);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4, cx = 1.35 * Math.cos(a), cz = z + 1.35 * Math.sin(a);
    candle(b, p, cx, y, cz, 0.24);
    if (k % 2 === 0) {
      p.rod(0, y + 0.1, z, cx, y, cz, 0.025, 'gold');
      p.rod(cx, y, cz, 0, hook, z, 0.012, 'stoneDark');
    }
  }
  p.rod(0, hook, z, 0, TOP, z, 0.03, 'stoneDark');
  b.lights.push({ x: 0, y: y - 0.3, z, kind: 'lamp' });
}

/** Crimson swallowtail banner with gilt edging and a gilt sun, hung from a rod `out` off a wall face. */
function banner(b: LevelBuilder, m: THREE.Matrix4, top: number, len: number, w: number): void {
  const h = w / 2, notch = 0.5;
  const outline = (e: number) => new THREE.Shape([new V2(-h - e, e), new V2(-h - e, -len - e), new V2(0, -len + notch - e * 1.5), new V2(h + e, -len - e), new V2(h + e, e)]);
  const drape = (g: THREE.BufferGeometry, dz: number) => {
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), t = Math.min(1, -y / len);
      pos.setZ(i, pos.getZ(i) + dz + 0.32 + 0.14 * Math.sin(Math.PI * t * 0.8) + 0.035 * Math.sin(x * 5 + y * 1.3));
    }
    g.computeVertexNormals();
    return shaped(g).translate(0, top, 0).applyMatrix4(m);
  };
  b.decor(drape(extrude(outline(0), 0.03, 0), 0), 'cloth');
  b.decor(drape(extrude(outline(0.06), 0.02, 0), -0.03), 'gold');
  const sun = new THREE.Shape(Array.from({ length: 24 }, (_, i) => {
    const a = (i * Math.PI) / 12, r = (i % 2 ? 0.17 : 0.3) * w;
    return new V2(r * Math.cos(a), -len * 0.36 + r * Math.sin(a));
  }));
  b.decor(drape(extrude(sun, 0.02, 0), 0.025), 'gold');
  b.part(m, -h - 0.15, h + 0.15, top + 0.02, top + 0.1, 0.27, 0.35, 'gold'); // rod
  for (const x of [-h - 0.18, h + 0.18]) b.part(m, x - 0.05, x + 0.05, top - 0.02, top + 0.14, 0.26, 0.36, 'gold'); // finials
  b.part(m, -0.04, 0.04, top + 0.06, top + 0.14, 0, 0.3, 'stoneDark'); // bracket
}

function banners(b: LevelBuilder): void {
  for (const s of [-1, 1]) {
    for (const z of [-9.375, -18.625, -27.625]) banner(b, face(7 * s, z, -s, 0), F + 10.9, 6, 0.9); // between the pilaster pairs, over the torches
    for (const z of [-49, -57]) banner(b, face(7 * s, z, -s, 0), P + 10.4, 5.4, 1.1);
    banner(b, face(4.5 * s, -0.5, 0, -1), F + 11.2, 6.2, 1.3); // inside the facade, over the door torches
  }
}

// ---------------------------------------------------------------- shared geometry

const ROSETTE = new THREE.CylinderGeometry(1, 0.8, 1, 10);
const RAY = new THREE.BoxGeometry(1, 1, 1);
const GEM = new THREE.OctahedronGeometry(1, 0);
const CUPOLA = new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const RIB = new THREE.TorusGeometry(7.76, 0.13, 6, 24, Math.PI / 2);
const OCULUS_RING = new THREE.TorusGeometry(1.15, 0.12, 6, 24).rotateX(Math.PI / 2);
