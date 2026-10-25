import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type LevelBuilder, extrude, shaped, tinted } from './builder.ts';
import { type Props, rng } from './props.ts';
import type { Role } from './materials.ts';

// Venetian fronts over the level's blank building faces. A face (one side of a block or a wall run) is
// split into houses of their own width, height and colour; each gets a pale intonaco skin tinted its
// colour (one merged batch per zone, materials.ts `facade`), or bare brick, stone quoins, string
// courses at its own floor lines, Venetian windows (rectangular with green or brown balconi, round-
// headed in Istrian frames, pointed and "a carena" gothic lights, polifore with a balcony on the piano
// nobile, small square attic lights), doors, grated ground-floor windows, water doors on a rio, and on
// the roof camini a imbuto, altane, a raised storey now and then. A convent range is one long front
// in the same vocabulary, regular as the real ones. Everything but the skin and the stone bands is
// a small kit of instanced pieces (Props): a window costs a few instances, not new geometry, and the
// kit casts no shadow, so a zone's facades add about a dozen draw calls. Nothing here collides.

export type Side = 'n' | 's' | 'e' | 'w'; // the face at z0, z1, x1 or x0 of a rectangle

export interface FrontOpts {
  convent?: boolean; // one regular range instead of a row of houses
  tint?: number; // convent: its colour (default pale)
  brick?: boolean; // convent: bare brick between the stone
  y0?: number; // foot (a house over a sotoportego starts on its beams; on a rio, the water)
  roof?: number; // eaves of the hipped roof behind (block(): h): chimneys, altane and raised storeys stand on it
  cornice?: boolean; // a cornice of its own at the top (a wall, a raised front); blocks have their eaves band
  openings?: { at: number; w: number; h: number }[]; // doors already cut through the face (world x or z): kept clear and framed
  water?: boolean; // a front on a rio: water doors at its foot
  ends?: boolean; // quoins at the face's two ends (default true: a building's corners)
}

const SK = 0.06; // the skin's thickness over the wall
const PALETTE = [0xffcc85, 0xdc7560, 0xf8b8a8, 0xfff8ea, 0xf09e6b, 0xffa888, 0xdcdcd6, 0xffe6a0, 0xffccc0, 0xb45a4c].map((c) => new THREE.Color(c));
// Painted wood, iron and the rest of the small stuff: tints of the kit's stone (one batch), not roles of their own.
const SHUTTERS = [0x5f8a52, 0x47704a, 0x8a6040, 0x5a8a7c, 0x8a9a74, 0x7a5236];
const DOORS = [0x8a5a38, 0x6e4a2e, 0x4f7048, 0x96704a];
const IRON = 0x34302c, BRICK = 0xa86048, AZURE = 0x3a4f8c, WOOD = 0x9a7656;

/**
 * A block (LevelBuilder.block, no mid band) with a Venetian front on each of `sides` ('n', 's', 'e', 'w'); those also
 * in `water` stand in a rio, from the water up with water doors. All one occlusion piece.
 */
export function houses(b: LevelBuilder, p: Props, x0: number, x1: number, z0: number, z1: number, h: number, sides: string, seed: number, role: Role = 'plaster', o: FrontOpts = {}, water = ''): void {
  b.together(() => {
    b.block(x0, x1, z0, z1, h, role, false);
    [...sides].forEach((side, i) => front(b, p, x0, x1, z0, z1, side as Side, h - 0.35, seed + i * 101, { roof: h, ...o, ...(water.includes(side) ? { water: true, y0: -1.2 } : {}) }));
  });
}

/** One front on the `side` face of the rectangle, from its foot to `top` (under the eaves band). */
export function front(b: LevelBuilder, p: Props, x0: number, x1: number, z0: number, z1: number, side: Side, top: number, seed: number, o: FrontOpts = {}): void {
  b.together(() => new Front(b, p, x0, x1, z0, z1, side, seed, o).build(top));
}

// ---------------------------------------------------------------- the kit (unit pieces, local +Z out of the wall)

const F = 0.13, DF = 0.1; // frame band width and depth
const WHITE = new THREE.Color(1, 1, 1), GLASS = new THREE.Color(0.07, 0.07, 0.085), TERRACOTTA = new THREE.Color(0.86, 0.5, 0.4);
type Outline = (p: THREE.Path, w: number, sp: number, dx: number, y: number) => THREE.Path; // opening w wide, springing sp over its foot (dx, y)
const RISE = { rect: 0, round: 0.5, pointed: 0.8, carena: 0.95 } as const;
type Arch = keyof typeof RISE;
const OUTLINE: Record<Arch, Outline> = {
  rect: (p, w, sp, dx, y) => p.moveTo(dx - w / 2, y).lineTo(dx + w / 2, y).lineTo(dx + w / 2, y + sp).lineTo(dx - w / 2, y + sp).lineTo(dx - w / 2, y),
  round: (p, w, sp, dx, y) => p.moveTo(dx - w / 2, y).lineTo(dx + w / 2, y).lineTo(dx + w / 2, y + sp).absarc(dx, y + sp, w / 2, 0, Math.PI, false).lineTo(dx - w / 2, y),
  pointed: (p, w, sp, dx, y) => {
    const r = RISE.pointed * w, s = y + sp;
    return p.moveTo(dx - w / 2, y).lineTo(dx + w / 2, y).lineTo(dx + w / 2, s).quadraticCurveTo(dx + w / 2, s + 0.62 * r, dx, s + r).quadraticCurveTo(dx - w / 2, s + 0.62 * r, dx - w / 2, s).lineTo(dx - w / 2, y);
  },
  carena: (p, w, sp, dx, y) => { // the ogee: swelling out, then drawn in to a point
    const r = RISE.carena * w, s = y + sp;
    return p.moveTo(dx - w / 2, y).lineTo(dx + w / 2, y).lineTo(dx + w / 2, s)
      .bezierCurveTo(dx + w / 2, s + 0.62 * r, dx + 0.06 * w, s + 0.42 * r, dx, s + r)
      .bezierCurveTo(dx - 0.06 * w, s + 0.42 * r, dx - w / 2, s + 0.62 * r, dx - w / 2, s).lineTo(dx - w / 2, y);
  },
};
const SPRING: Record<Arch, number> = { rect: 1, round: 1.4, pointed: 1.4, carena: 1.4 }; // unit openings: 1 wide
const H0 = (a: Arch) => SPRING[a] + RISE[a]; // a unit opening's height

const slab = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const flat = (s: THREE.Shape, d: number, z0: number) => extrude(s, d, 0).translate(0, 0, z0 + d / 2);

function kit(parts: [THREE.BufferGeometry, THREE.Color][]): THREE.BufferGeometry {
  const gs = parts.map(([g, c]) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute('uv');
    return tinted(n, c);
  });
  const m = mergeGeometries(gs)!;
  m.computeBoundingBox();
  return shaped(m, 0, m.boundingBox!.max.y, false);
}

/** `n` openings of shape `a` side by side in one stone frame (a single window: n = 1), dark glass, sill; a keystone on a round head. */
function lights(a: Arch, n: number): THREE.BufferGeometry {
  const key = a === 'round' && n === 1;
  const gap = 0.3, W = n + (n - 1) * gap, xs = Array.from({ length: n }, (_, i) => -W / 2 + 0.5 + i * (1 + gap));
  const sp = SPRING[a], top = H0(a);
  let frame: THREE.Shape;
  if (n === 1) frame = OUTLINE[a](new THREE.Shape(), 1 + 2 * F, sp + F * 0.6, 0, 0) as THREE.Shape;
  else frame = OUTLINE.rect(new THREE.Shape(), W + 2 * F, top + F, 0, 0) as THREE.Shape; // a polifora: the lights cut in one stone panel
  for (const x of xs) frame.holes.push(OUTLINE[a](new THREE.Path(), 1, sp, x, 0));
  const parts: [THREE.BufferGeometry, THREE.Color][] = [[flat(frame, DF, 0), WHITE]];
  for (const x of xs) parts.push([flat(OUTLINE[a](new THREE.Shape(), 1, sp, x, 0) as THREE.Shape, 0.01, 0.002), GLASS]);
  parts.push([slab(W + 2 * F + 0.2, 0.1, 0.2, 0, -0.05, 0.1), WHITE]); // sill
  if (key) parts.push([slab(0.18, 0.3, DF + 0.04, 0, top + 0.08, (DF + 0.04) / 2), WHITE]);
  return kit(parts);
}

// One draw call each per zone (Props batches them): kept to the shapes that need curves; the rest is boxes.
const K = {
  rect: lights('rect', 1),
  round: lights('round', 1),
  pointed: lights('pointed', 1),
  carena: lights('carena', 1),
  poli3round: lights('round', 3),
  poli3carena: lights('carena', 3),
  poli4pointed: lights('pointed', 4),
  // Camino a imbuto: the funnel on top of a brick shaft, 0.7 tall, foot at 0.
  funnel: kit([[new THREE.CylinderGeometry(0.42, 0.2, 0.55, 8).translate(0, 0.42, 0), TERRACOTTA], [new THREE.CylinderGeometry(0.2, 0.2, 0.15, 8).translate(0, 0.07, 0), TERRACOTTA], [new THREE.CylinderGeometry(0.45, 0.45, 0.06, 8).translate(0, 0.72, 0), TERRACOTTA]]),
};
type Win = 'rect' | 'hood' | 'round' | 'pointed' | 'carena';
const POLI = { round: ['poli3round', 3, 'round'], carena: ['poli3carena', 3, 'carena'], pointed: ['poli4pointed', 4, 'pointed'] } as const;

// ---------------------------------------------------------------- composition

interface House { s0: number; s1: number; top: number; kind: 'gotico' | 'rinascimento' | 'popolare' | 'mattoni' | 'convento'; tint: THREE.Color; brick: boolean; shutter: number; door: number }

class Front {
  private readonly r: () => number;
  private readonly o: THREE.Vector3; // the face's left end, at y 0, seen from outside
  private readonly u: THREE.Vector3; // along it, left to right
  private readonly n: THREE.Vector3; // out of it
  private readonly m: THREE.Matrix4; // (s, y, t) -> world
  private readonly L: number;
  private readonly ry: number;
  private readonly open: [number, number, number][]; // openings as s0, s1, top
  private readonly b: LevelBuilder;
  private readonly p: Props;
  private readonly opt: FrontOpts;

  constructor(b: LevelBuilder, p: Props, x0: number, x1: number, z0: number, z1: number, side: Side, seed: number, opt: FrontOpts) {
    this.b = b;
    this.p = p;
    this.opt = opt;
    this.r = rng(seed);
    const [ox, oz, ux, uz, L] = side === 's' ? [x0, z1, 1, 0, x1 - x0] : side === 'n' ? [x1, z0, -1, 0, x1 - x0] : side === 'e' ? [x1, z1, 0, -1, z1 - z0] : [x0, z0, 0, 1, z1 - z0];
    this.o = new THREE.Vector3(ox, 0, oz);
    this.u = new THREE.Vector3(ux, 0, uz);
    this.n = new THREE.Vector3(-uz, 0, ux); // u × up
    this.m = new THREE.Matrix4().makeBasis(this.u, new THREE.Vector3(0, 1, 0), this.n).setPosition(this.o);
    this.L = L;
    this.ry = Math.atan2(this.n.x, this.n.z);
    this.open = (opt.openings ?? []).map((d) => {
      const s = side === 's' ? d.at - x0 : side === 'n' ? x1 - d.at : side === 'e' ? z1 - d.at : d.at - z0;
      return [s - d.w / 2, s + d.w / 2, (opt.y0 ?? 0) + d.h] as [number, number, number];
    });
  }

  private rand(a: number, b: number): number { return a + (b - a) * this.r(); }
  private pick<T>(xs: readonly T[]): T { return xs[Math.floor(this.r() * xs.length)]; }
  private at(s: number, y: number, t: number): THREE.Vector3 { return this.o.clone().addScaledVector(this.u, s).addScaledVector(this.n, t).setY(y); }

  /** Kit piece `g` with its foot's middle at (s, y) on the skin, scaled sx along the face and sy up. */
  private put(g: THREE.BufferGeometry, s: number, y: number, sx: number, sy: number, t = SK, sz = 1): void {
    const w = this.at(s, y, t);
    this.p.put(g, 'stone', w.x, w.y, w.z, sx, sy, sz, 0, this.ry, 0, undefined, false);
  }

  /** Instanced box over s0..s1, y0..y1, t0..t1 (the face's axes are the world's): the kit's stone in `tint`, or a lit pane. */
  private box(s0: number, s1: number, y0: number, y1: number, t0: number, t1: number, tint?: THREE.ColorRepresentation | 'lit'): void {
    const a = this.at(s0, y0, t0), c = this.at(s1, y1, t1);
    this.p.box(Math.min(a.x, c.x), Math.max(a.x, c.x), y0, y1, Math.min(a.z, c.z), Math.max(a.z, c.z), tint === 'lit' ? 'lantern' : 'stone', 0, tint === 'lit' ? undefined : tint);
  }

  /** A rectangular window w × wh at (c, sy) under a little cornice. */
  private hood(c: number, sy: number, w: number, wh: number): void {
    this.put(K.rect, c, sy, w, wh);
    const y = sy + wh + F * wh;
    this.box(c - w / 2 - F - 0.15, c + w / 2 + F + 0.15, y, y + 0.1, SK, SK + 0.18);
    this.box(c - w / 2 - F - 0.05, c + w / 2 + F + 0.05, y + 0.1, y + 0.22, SK, SK + 0.12);
  }

  /** Merged band (string course, zoccolo, cornice) or skin, in the face's frame. */
  private part(s0: number, s1: number, y0: number, y1: number, t0: number, t1: number, role: Role, tint?: THREE.Color): void {
    if (s1 - s0 > 0.02 && y1 - y0 > 0.02) this.b.part(this.m, s0, s1, y0, y1, t0, t1, role, false, tint);
  }

  /** s0..s1 with the openings taken out, for a band from y. */
  private clear(s0: number, s1: number, y: number): [number, number][] {
    const out: [number, number][] = [];
    let cur = s0;
    for (const [a, c, top] of [...this.open].sort((x, z) => x[0] - z[0])) {
      if (top <= y || c <= cur || a >= s1) continue;
      out.push([cur, Math.max(cur, a)]);
      cur = Math.min(s1, c);
    }
    out.push([cur, s1]);
    return out.filter(([a, c]) => c - a > 0.05);
  }

  private blocked(s0: number, s1: number, y: number): boolean {
    return this.open.some(([a, c, top]) => y < top + 0.3 && s1 > a - 0.3 && s0 < c + 0.3);
  }

  build(top: number): void {
    const { opt } = this, y0 = opt.y0 ?? 0;
    const list = opt.convent ? [this.convent(top)] : this.row(top);
    for (const h of list) this.house(h, y0);
    for (const [a, c, t] of this.open) { // a stone frame round each door cut through the wall
      if (t - y0 > 4.5) continue;
      this.box(a - F, a, y0, t, SK, SK + DF);
      this.box(c, c + F, y0, t, SK, SK + DF);
      this.box(a - F, c + F, t, t + F, SK, SK + DF);
    }
    if (opt.ends ?? true) {
      this.quoins(0, 1, y0, Math.max(...list.filter((h) => h.s0 === 0).map((h) => h.top)), list[0]);
      this.quoins(this.L, -1, y0, Math.max(...list.filter((h) => h.s1 === this.L).map((h) => h.top)), list[list.length - 1]);
    }
  }

  private convent(top: number): House {
    const brick = !!this.opt.brick;
    return { s0: 0, s1: this.L, top, kind: 'convento', tint: new THREE.Color(this.opt.tint ?? 0xf4ead8), brick, shutter: this.pick(SHUTTERS), door: this.pick(DOORS) };
  }

  /** The face split into houses 5 to 11 m wide, no two neighbours alike. */
  private row(top: number): House[] {
    const n = Math.max(1, Math.round(this.L / 7.5)), wts = Array.from({ length: n }, () => this.rand(0.7, 1.3)), sum = wts.reduce((a, c) => a + c, 0);
    const out: House[] = [];
    let s = 0, last = -1, lastKind = '';
    for (const wt of wts) {
      const s1 = out.length === n - 1 ? this.L : s + (this.L * wt) / sum;
      let ci = Math.floor(this.r() * PALETTE.length);
      if (ci === last) ci = (ci + 1 + Math.floor(this.r() * (PALETTE.length - 1))) % PALETTE.length;
      last = ci;
      let kind = this.pick(['gotico', 'gotico', 'rinascimento', 'popolare', 'popolare', 'popolare', 'mattoni'] as const);
      if (kind === lastKind && kind !== 'popolare') kind = 'popolare';
      lastKind = kind;
      const raise = this.opt.roof !== undefined && s1 - s > 4.5 && this.r() < 0.3 ? this.rand(1.4, 2.8) : 0;
      out.push({ s0: s, s1, top: top + raise, kind, tint: PALETTE[ci], brick: kind === 'mattoni', shutter: this.pick(SHUTTERS), door: this.pick(DOORS) });
      s = s1;
    }
    return out;
  }

  private house(h: House, y0: number): void {
    const { s0, s1, tint } = h, W = s1 - s0, water = !!this.opt.water;
    const skinRole: Role = h.brick ? 'brick' : 'facade', skinTint = h.brick ? undefined : tint;
    const roof = this.opt.roof, raised = roof !== undefined && h.top > roof;
    // The skin, round the openings and over them.
    for (const [a, c] of this.clear(s0, s1, y0)) this.part(a, c, y0, h.top, 0, SK, skinRole, skinTint);
    for (const [a, c, t] of this.open) if (c > s0 && a < s1) this.part(Math.max(a, s0), Math.min(c, s1), t, h.top, 0, SK, skinRole, skinTint);
    if (raised) { // a storey over the eaves: its body back into the roof, its own cornice and hipped roof
      this.part(s0 + 0.02, s1 - 0.02, roof - 0.4, h.top, -3.4, 0, skinRole, skinTint);
      this.cornice(s0, s1, h.top);
      const a = this.at(s0 - 0.05, 0, -3.4), c = this.at(s1 + 0.05, 0, 0.3);
      this.b.hipRoof(Math.min(a.x, c.x), Math.max(a.x, c.x), Math.min(a.z, c.z), Math.max(a.z, c.z), h.top + 0.3, 0.45, 0.4);
    } else if (this.opt.cornice) this.cornice(s0, s1, h.top);
    // Floors: the ground floor (none over a sotoportego), a taller piano nobile, the upper ones, an attic if there's room.
    const sotto = y0 > 0.5, ceil = h.top - 0.3, ys: number[] = [];
    let y = y0;
    if (!sotto) { ys.push(y0); y = y0 + (water ? this.rand(4.2, 4.6) : this.rand(3.4, 4.1)); }
    while (y + 2.6 <= ceil) {
      ys.push(y);
      y += ys.length === (sotto ? 1 : 2) ? this.rand(3.5, 4.1) : this.rand(2.9, 3.4);
    }
    if (ceil - y >= 1.3) ys.push(y);
    const floors = ys.map((fy, i) => ({ y: fy, h: (ys[i + 1] ?? ceil) - fy }));
    const ground = sotto ? undefined : floors.shift();
    // Bands: the zoccolo (Istrian stone, tall on the water), a string course at each floor (thin, or none, on popular houses).
    const zh = water ? 1.6 : this.rand(0.45, 0.8);
    for (const [a, c] of this.clear(s0, s1, y0)) this.part(a, c, y0, y0 + zh, 0, SK + 0.08, 'stoneDark');
    floors.forEach((f, k) => {
      if (h.kind === 'popolare' && k > 0 && this.r() < 0.5) return;
      for (const [a, c] of this.clear(s0, s1, f.y)) this.part(a, c, f.y - 0.06, f.y + 0.1, 0, SK + (h.kind === 'popolare' ? 0.06 : 0.12), 'stoneDark');
    });
    // Bays.
    const bayW = h.kind === 'convento' ? 3.3 : this.rand(2.2, 2.7);
    const nb = Math.max(1, Math.floor((W - 0.6) / bayW)), cs = Array.from({ length: nb }, (_, i) => s0 + (W * (i + 0.5)) / nb);
    const arch: Arch = h.kind === 'gotico' ? (this.r() < 0.6 ? 'carena' : 'pointed') : h.kind === 'rinascimento' ? 'round' : 'rect';
    const mid = nb >= 3 ? (nb % 2 ? [Math.floor(nb / 2)] : [nb / 2 - 1, nb / 2]) : [];
    const lit = () => this.r() < 0.07;
    const sw = h.kind === 'convento' ? 0.95 : this.rand(0.85, 1.05);
    floors.forEach((f, k) => {
      const top = k === floors.length - 1 && f.h < 2.6; // a low last floor: square attic lights
      const nobile = k === 0 && h.kind !== 'popolare' && h.kind !== 'convento';
      if (nobile && mid.length && arch !== 'rect') { // the polifora over a balcony
        const [g, n, a] = POLI[arch], c = mid.reduce((q, i) => q + cs[i], 0) / mid.length, span = n + (n - 1) * 0.3;
        const lw = Math.min(0.85, ((W * mid.length) / nb - 0.6) / (span + 2 * F)), lh = Math.min(f.h - 1.3, 2.6), sy = f.y + Math.max(0.9, (f.h - lh) * 0.55);
        this.put(K[g], c, sy, lw, lh / H0(a));
        if (lit()) this.box(c - (span * lw) / 2, c + (span * lw) / 2, sy, sy + lh * 0.6, SK + 0.004, SK + 0.02, 'lit');
        this.balcony(c, span * lw + 0.8, sy, true);
      }
      cs.forEach((c, i) => {
        if (nobile && mid.includes(i) && arch !== 'rect') return;
        const a: Win = top ? 'rect' : h.kind === 'convento' ? (k === 0 ? 'hood' : 'rect') : arch === 'rect' ? (nobile || this.r() < 0.3 ? 'hood' : 'rect') : k <= 1 ? arch : 'rect';
        const w = top ? 0.7 : sw, wh = top ? 0.7 : Math.min(f.h - 1.4, a === 'rect' || a === 'hood' ? 1.9 : 2.4), sy = f.y + (top ? (f.h - wh) * 0.45 : Math.max(0.85, (f.h - wh) * 0.5));
        if (wh < 0.6 || c - w / 2 - F < s0 + 0.25 || c + w / 2 + F > s1 - 0.25) return;
        if (a === 'hood') this.hood(c, sy, w, wh);
        else this.put(K[a], c, sy, w, wh / H0(a));
        const flat = a === 'rect' || a === 'hood';
        if (lit()) this.box(c - w / 2, c + w / 2, sy, sy + wh * (flat ? 1 : 0.7), SK + 0.004, SK + 0.02, 'lit');
        if (flat && !top) this.shutters(h, c, w, sy, wh);
        if (k === 0 && h.kind === 'popolare' && this.r() < 0.3) this.balcony(c, w + 0.8, sy, false);
      });
    });
    if (ground) this.groundFloor(h, ground, cs, arch);
    // On the roof: camini a imbuto, now and then an altana.
    if (roof !== undefined) {
      const eave = raised ? h.top + 0.3 : roof, ov = raised ? 0.45 : 0.7, k = raised ? 0.4 : 0.45;
      const surface = (d: number) => eave + k * (d + ov);
      for (let i = 0, n = W > 6 ? 2 : 1; i < n; i++) {
        if (this.r() < 0.35) continue;
        const s = this.rand(s0 + 0.8, s1 - 0.8), d = this.rand(1.2, raised ? 2.4 : 3), yb = surface(d) - 0.3, sh = this.rand(1.3, 2.3);
        this.box(s - 0.25, s + 0.25, yb, yb + sh, -d - 0.25, -d + 0.25, BRICK);
        this.put(K.funnel, s, yb + sh, 1, 1, -d);
      }
      if (!raised && h.kind !== 'convento' && W > 4.5 && this.r() < 0.18) this.altana(s0 + this.rand(0.8, W - 3.4), surface);
    }
    // An edicola on the corner now and then: a little round-headed frame, the Madonna's picture, a candle.
    if (h.kind !== 'convento' && ground && this.r() < 0.12 && !this.blocked(s0, s0 + 1.2, y0 + 2.4)) {
      const s = s0 + 0.7, y = y0 + 2.5;
      this.put(K.round, s, y, 0.45, 0.65 / H0('round'), SK, 1.6);
      this.box(s - 0.18, s + 0.18, y + 0.05, y + 0.45, SK, SK + 0.03, AZURE);
      const { x, z } = this.at(s, 0, SK + 0.2);
      this.b.lights.push({ x, y: y + 0.12, z, kind: 'candle' });
    }
  }

  private groundFloor(h: House, f: { y: number; h: number }, cs: number[], arch: Arch): void {
    const water = !!this.opt.water;
    const doorAt = cs.length > 2 ? cs[Math.floor(this.r() * cs.length)] : cs[0] + (cs.length === 1 ? this.rand(-0.4, 0.4) : 0);
    cs.forEach((c) => {
      if (c === doorAt) { // the door, or on a rio the water door
        const w = water ? this.rand(1.5, 1.9) : this.rand(1.2, 1.6), a: Arch = water || arch === 'round' ? 'round' : arch === 'rect' ? 'rect' : arch, dh = Math.min(f.h - 0.5, water ? 2.9 : this.rand(2.4, 2.8));
        if (this.blocked(c - w / 2, c + w / 2, f.y)) return;
        if (c - w / 2 - F < h.s0 + 0.2 || c + w / 2 + F > h.s1 - 0.2) return;
        this.put(K[a], c, f.y, w, dh / H0(a));
        const leaf = a === 'rect' ? dh : SPRING[a] * dh / H0(a);
        if (!water || this.r() < 0.5) this.box(c - w / 2, c + w / 2, f.y, f.y + leaf * (water ? 0.9 : 1), SK + 0.004, SK + 0.05, h.door); // the wooden door (a water door half shut)
        if (water) this.box(c - w / 2 - 0.1, c + w / 2 + 0.1, f.y - 0.08, f.y + 0.06, 0, SK + 0.3); // its step on the water
        return;
      }
      // A small grated window high in the wall.
      const w = 0.8, wh = 1, sy = f.y + Math.min(1.6, f.h - 1.5);
      if (this.blocked(c - w / 2, c + w / 2, f.y) || h.kind === 'convento' && this.r() < 0.25) return;
      this.put(K.rect, c, sy, w, wh);
      for (let x = c - w / 2 + 0.16; x < c + w / 2 - 0.1; x += 0.16) this.box(x - 0.015, x + 0.015, sy, sy + wh, SK + 0.04, SK + 0.07, IRON);
      this.box(c - w / 2, c + w / 2, sy + wh * 0.5 - 0.015, sy + wh * 0.5 + 0.015, SK + 0.04, SK + 0.07, IRON);
    });
  }

  /** Balconi: open leaves either side of the window, or shut over it; some windows go without. */
  private shutters(h: House, c: number, w: number, sy: number, wh: number): void {
    const r = this.r();
    if (r < 0.2) return;
    if (r < 0.42) this.box(c - w / 2, c + w / 2, sy, sy + wh, SK + 0.004, SK + 0.06, h.shutter);
    else for (const d of [-1, 1]) this.box(Math.min(c + d * (w / 2 + F), c + d * (w + F + 0.02)), Math.max(c + d * (w / 2 + F), c + d * (w + F + 0.02)), sy - 0.02, sy + wh + 0.02, SK, SK + 0.05, h.shutter);
  }

  /** A balcony w wide under a window sill at y: a stone slab on corbels with balusters (or iron bars), a rail. */
  private balcony(c: number, w: number, y: number, stone: boolean): void {
    const d = stone ? 0.75 : 0.55, a = c - w / 2, z = c + w / 2;
    this.part(a, z, y - 0.2, y - 0.04, 0, SK + d, 'stoneDark');
    for (const s of [a + 0.25, z - 0.25]) this.part(s - 0.1, s + 0.1, y - 0.55, y - 0.2, 0, SK + d * 0.7, 'stoneDark');
    if (stone) {
      this.box(a, z, y + 0.66, y + 0.8, SK + d - 0.18, SK + d - 0.02);
      for (let s = a + 0.15; s < z - 0.1; s += 0.22) this.box(s - 0.045, s + 0.045, y - 0.04, y + 0.66, SK + d - 0.15, SK + d - 0.06);
      for (const s of [a + 0.06, z - 0.06]) this.box(s - 0.06, s + 0.06, y - 0.04, y + 0.66, 0, SK + d - 0.02);
    } else {
      this.box(a, z, y + 0.85, y + 0.9, SK + d - 0.05, SK + d, IRON);
      for (let s = a + 0.05; s < z; s += 0.14) this.box(s - 0.012, s + 0.012, y - 0.04, y + 0.85, SK + d - 0.04, SK + d - 0.01, IRON);
    }
  }

  /** An altana: a wooden platform on posts over the roof, 2.6 m wide, its railing. */
  private altana(s: number, surface: (d: number) => number): void {
    const d0 = 0.8, d1 = 3.2, deck = surface(d1) + 0.4;
    for (const ss of [s + 0.1, s + 2.5]) for (const d of [d0, d1]) this.box(ss - 0.07, ss + 0.07, surface(d) - 0.2, deck + 1, -d - 0.07, -d + 0.07, WOOD);
    this.box(s, s + 2.6, deck, deck + 0.1, -d1 - 0.1, -d0 + 0.1, WOOD);
    this.box(s, s + 2.6, deck + 0.95, deck + 1.02, -d0 + 0.02, -d0 + 0.1, WOOD);
    this.box(s, s + 2.6, deck + 0.95, deck + 1.02, -d1 - 0.1, -d1 - 0.02, WOOD);
    for (const ss of [s + 0.02, s + 2.52]) this.box(ss, ss + 0.08, deck + 0.95, deck + 1.02, -d1, -d0, WOOD);
    for (let ss = s + 0.35; ss < s + 2.4; ss += 0.3) this.box(ss - 0.02, ss + 0.02, deck + 0.1, deck + 0.95, -d0 + 0.03, -d0 + 0.07, WOOD);
  }

  private cornice(s0: number, s1: number, y: number): void {
    this.part(s0 - 0.1, s1 + 0.1, y - 0.25, y - 0.05, 0, SK + 0.18, 'stoneDark');
    this.part(s0 - 0.15, s1 + 0.15, y - 0.05, y + 0.12, 0, SK + 0.3, 'stoneDark');
  }

  /** Stone quoins up a corner at s (`dir` into the face), long and short blocks in turn. */
  private quoins(s: number, dir: number, y0: number, top: number, h: House): void {
    if (h.kind === 'mattoni' || !Number.isFinite(top)) return;
    let i = 0;
    for (let y = y0 + 0.8; y + 0.4 < top - 0.3; y += 0.46, i++) {
      const w = i % 2 ? 0.34 : 0.58;
      this.box(Math.min(s, s + dir * w), Math.max(s, s + dir * w), y, y + 0.42, SK, SK + 0.05);
    }
  }
}
