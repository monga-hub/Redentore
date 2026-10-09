// Procedural, seamlessly tiling albedo painters for the stylized materials.
// Pure JS (no canvas/DOM), so the headless `npm run check` can build the level too.
// Look: hand-painted fantasy-RPG style — bold per-block value shifts, painted bevels
// (lit top/left edge, dark bottom/right), dark joints, controlled saturation.
// Tints sampled from the reference frames of the Redentore complex.

export type RGB = [number, number, number];
/** u, v in [0,1); v = 0 is the bottom row (world-up on walls). */
export type Painter = (u: number, v: number) => RGB;

// ---- maths ---------------------------------------------------------------

export function hash(x: number, y: number, s = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;
const fract = (a: number) => a - Math.floor(a);
const clamp01 = (a: number) => Math.min(1, Math.max(0, a));
export const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Value noise with integer period `px`×`py` lattice cells over the unit tile. */
function vnoise(u: number, v: number, px: number, py: number, s: number): number {
  const x = u * px, y = v * py, xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const x0 = mod(xi, px), x1 = mod(xi + 1, px), y0 = mod(yi, py), y1 = mod(yi + 1, py);
  const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), d = hash(x1, y1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Tileable fBm in [0,1]; `px`,`py` = base lattice period (stretch for streaks/grain). */
export function fbm(u: number, v: number, px: number, py = px, oct = 4, s = 0): number {
  let sum = 0, amp = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += vnoise(u, v, px << i, py << i, s + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

/** Tileable cellular noise on a g×g jittered grid: nearest/second distances (in cells) and cell id. */
function voronoi(u: number, v: number, g: number, s: number): { f1: number; f2: number; id: number; ox: number; oy: number } {
  const x = u * g, y = v * g, xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0, ox = 0, oy = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = mod(xi + i, g), cy = mod(yi + j, g);
    const dx = xi + i + hash(cx, cy, s) - x, dy = yi + j + hash(cx, cy, s + 1) - y;
    const d = Math.hypot(dx, dy);
    if (d < f1) { f2 = f1; f1 = d; id = hash(cx, cy, s + 2); ox = dx; oy = dy; } else if (d < f2) f2 = d;
  }
  return { f1, f2, id, ox, oy };
}

// ---- colour --------------------------------------------------------------

export const hex = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const pick = (pal: RGB[], r: number) => pal[Math.min(pal.length - 1, Math.floor(r * pal.length))];

// ---- block layouts -------------------------------------------------------

interface Cell {
  id: number; // per-block random in [0,1)
  col: number; row: number;
  joint: number; // 1 inside the mortar joint, 0 on the block face (soft edge)
  shade: number; // painted bevel multiplier on the face
}

/**
 * Running-bond grid: `rows` courses, `cols` blocks per course, course `r` shifted by
 * `shift(r)` blocks. `n` = texels per tile (joint/bevel widths are in texels).
 */
function bond(u: number, v: number, cols: number, rows: number, shift: (row: number) => number, n: number, jointPx: number, bevelPx: number): Cell {
  const y = v * rows, row = Math.floor(y), fy = y - row;
  const x = u * cols + shift(row), cf = Math.floor(x), fx = x - cf, col = mod(cf, cols);
  const cw = n / cols, ch = n / rows;
  // edge distances in texels, wobbled a little so joints look hand-cut
  const wob = (vnoise(u, v, 32, 32, 91) - 0.5) * jointPx * 0.8;
  const l = fx * cw + wob, r = (1 - fx) * cw - wob, b = fy * ch + wob, t = (1 - fy) * ch - wob;
  const d = Math.min(l, r, b, t);
  const joint = 1 - smooth(jointPx * 0.5, jointPx * 0.5 + 1.2, d);
  const e = (k: number) => 1 - smooth(jointPx * 0.5, jointPx * 0.5 + bevelPx, k);
  const shade = 1 + 0.16 * e(t) + 0.07 * e(l) - 0.2 * e(b) - 0.1 * e(r);
  return { id: hash(col, mod(row, rows), 7), col, row, joint, shade };
}

// ---- painters ------------------------------------------------------------

/** Pietra d'Istria ashlar: pale cream blocks, grey rain streaks, thin joints. */
function istria(base: number, cols: number, rows: number, n: number): Painter {
  const b = hex(base), joint = mul(b, 0.62), cool = hex(0xc9cdd0), warm = hex(0xe8d6b4);
  return (u, v) => {
    const c = bond(u, v, cols, rows, r => hash(r, 0, 3) * 0.8 + 0.1, n, 3, 7);
    let col = mix(b, c.id < 0.5 ? cool : warm, Math.abs(c.id - 0.5) * 0.5);
    col = mul(col, 0.92 + c.id * 0.12);
    col = mul(col, 0.9 + 0.18 * fbm(u, v, 6, 6, 4, 11));
    const streak = smooth(0.6, 0.85, fbm(u, v, 12, 2, 3, 13)); // vertical weathering
    col = mul(col, 1 - streak * 0.1);
    col = mul(col, 0.96 + 0.08 * hash(Math.floor(u * n), Math.floor(v * n), 5)); // grain
    return mix(mul(col, c.shade), joint, c.joint);
  };
}

const BRICKS = [0xc98a5e, 0xb86b4a, 0xd4a072, 0xa85a3f, 0xc47c56, 0xbf7350, 0xd9b083].map(hex);

/** Venetian brick (mattoni a vista), half-bond; `n` texels per tile. */
function brick(n: number, cols = 4, rows = 16): Painter {
  const mortar = hex(0xcfc3aa), burnt = hex(0x7d4632);
  return (u, v) => {
    const c = bond(u, v, cols, rows, r => (r & 1) * 0.5 + (hash(r, 1, 9) - 0.5) * 0.08, n, 4, 5);
    let col = pick(BRICKS, c.id);
    if (hash(c.col, c.row, 21) > 0.93) col = mix(col, burnt, 0.6);
    col = mul(col, 0.86 + 0.24 * fbm(u, v, 24, 24, 3, 22));
    col = mul(col, 0.93 + 0.1 * hash(Math.floor(u * n), Math.floor(v * n), 23));
    const m = mul(mortar, 0.82 + 0.25 * fbm(u, v, 40, 40, 2, 24));
    return mix(mul(col, c.shade), m, c.joint);
  };
}

/** Intonaco: washed, mottled plaster scaling off in patches to show the brick (scrostato). */
function plaster(base: number, peel: number): Painter {
  const b = hex(base), lit = mix(b, hex(0xf2e2c8), 0.35), dark = mul(b, 0.72);
  const under = brick(512 / 3); // tile = 3 brick tiles
  return (u, v) => {
    const wash = fbm(u, v, 3, 3, 5, 31);
    let col = mix(dark, lit, smooth(0.25, 0.8, wash));
    col = mul(col, 0.94 + 0.1 * fbm(u, v, 16, 16, 3, 32));
    const drip = smooth(0.6, 0.85, fbm(u, v, 16, 2, 3, 33));
    col = mul(col, 1 - drip * 0.15);
    const p = fbm(u, v, 5, 5, 5, 34);
    if (p > peel) {
      const inner = under(fract(u * 3), fract(v * 3));
      const rim = smooth(peel, peel + 0.025, p);
      return mix(mul(lit, 1.12), mul(inner, 0.85 + 0.15 * rim), rim); // bright broken edge, then brick
    }
    const shadow = smooth(peel - 0.04, peel, p); // plaster lip casts a soft dark line
    return mul(col, 1 - shadow * 0.25);
  };
}

/** Trachite masegni: dark grey slabs, uneven lengths, speckled and worn smooth. */
function trachite(n: number): Painter {
  const pal = [0x5f5e5b, 0x56585c, 0x67615a, 0x4f4f50, 0x6b6966].map(hex), joint = hex(0x3a3734);
  return (u, v) => {
    const c = bond(u, v, 3, 4, r => hash(r, 2, 41), n, 3.5, 6);
    let col = pick(pal, c.id);
    col = mul(col, 0.85 + 0.3 * fbm(u, v, 8, 8, 4, 42));
    const worn = smooth(0.55, 0.75, fbm(u, v, 5, 5, 3, 43));
    col = mix(col, hex(0x8a877f), worn * 0.25);
    col = mul(col, 0.88 + 0.24 * hash(Math.floor(u * n), Math.floor(v * n), 44));
    return mix(mul(col, c.shade), joint, c.joint);
  };
}

/** Coppi: rounded terracotta channels with staggered overlaps. Channels run along v. */
function coppi(): Painter {
  const pal = [0xb0583a, 0x9c4a32, 0xc4693f, 0xa65a3c, 0xb96a48].map(hex), lichen = hex(0x8f8f62);
  const ch = 8, rows = 4;
  return (u, v) => {
    const x = u * ch, col = Math.floor(x), fx = x - col;
    const y = v * rows + hash(col, 0, 51), row = Math.floor(y), fy = y - row;
    const id = hash(col, mod(row, rows), 52);
    let c = pick(pal, id);
    c = mul(c, 0.55 + 0.6 * Math.sin(Math.PI * fx) ** 0.6); // convex cross-section, dark valleys
    c = mul(c, 1 - 0.35 * smooth(0.82, 1, fy) + 0.12 * smooth(0.2, 0, fy)); // lip shadow / lit nose
    c = mul(c, 0.9 + 0.2 * fbm(u, v, 16, 16, 3, 53));
    const moss = smooth(0.62, 0.78, fbm(u, v, 6, 6, 4, 54));
    return mix(c, lichen, moss * 0.55);
  };
}

/** Planks along v with stretched grain and dark seams. */
function planks(base: number, cols: number): Painter {
  const b = hex(base), seam = hex(0x3a281b);
  return (u, v) => {
    const c = bond(v, u, 2, cols, r => hash(r, 3, 61), 256, 3, 4); // swapped: boards run along v
    const g = fbm(u, v, 48, 3, 3, 62);
    const rings = 0.5 + 0.5 * Math.sin((u * cols * 5 + g * 4 + c.id * 7) * Math.PI * 2);
    let col = mul(b, 0.8 + c.id * 0.35);
    col = mul(col, 0.82 + 0.18 * rings);
    col = mul(col, 0.9 + 0.15 * fbm(u, v, 64, 4, 2, 63));
    return mix(mul(col, c.shade), seam, c.joint);
  };
}

function bark(): Painter {
  const b = hex(0x6a5240), dark = hex(0x3b2c22);
  return (u, v) => {
    const f = fbm(u, v, 16, 3, 4, 71);
    return mix(mul(b, 0.85 + 0.35 * fbm(u, v, 8, 8, 3, 72)), dark, smooth(0.45, 0.62, f) * 0.8);
  };
}

/** Leafy clumps: cellular blobs, lit centres, dark gaps. */
function leaves(dark: number, light: number, g: number): Painter {
  const d = hex(dark), l = hex(light);
  return (u, v) => {
    const c = voronoi(u, v, g, 81);
    const lit = clamp01(0.5 - c.oy * 0.9 + c.ox * 0.3) * (1 - smooth(0.2, 0.55, c.f1));
    const col = mix(d, l, 0.25 + 0.55 * lit + 0.2 * c.id);
    return mul(col, 0.65 + 0.35 * smooth(0, 0.25, c.f2 - c.f1));
  };
}

function grass(): Painter {
  const a = hex(0x5a8038), b = hex(0x7ea64a), hi = hex(0xa9c76a);
  return (u, v) => {
    let col = mix(a, b, smooth(0.3, 0.7, fbm(u, v, 4, 4, 4, 91)));
    const blades = fbm(u, v, 96, 24, 2, 92);
    col = mix(col, hi, smooth(0.62, 0.8, blades) * 0.6);
    col = mul(col, 0.85 + 0.2 * fbm(u, v, 48, 48, 2, 93));
    return col;
  };
}

function gravel(): Painter {
  const base = hex(0xc9bc9f), gap = hex(0x8e8270), pal = [0xd8ccb2, 0xbcae94, 0xe2d9c4, 0xa99b84].map(hex);
  return (u, v) => {
    const c = voronoi(u, v, 48, 101);
    const peb = mix(base, pick(pal, c.id), 0.7);
    return mix(mul(peb, 1.05 - c.f1 * 0.3), gap, 1 - smooth(0.02, 0.12, c.f2 - c.f1));
  };
}

function soil(): Painter {
  const b = hex(0x6e4f36), d = hex(0x3f2c1e), l = hex(0x8c6a4b);
  return (u, v) => {
    const furrow = 0.5 + 0.5 * Math.sin(v * Math.PI * 2 * 6 + fbm(u, v, 4, 4, 2, 111) * 3);
    let col = mix(d, b, furrow);
    col = mix(col, l, smooth(0.6, 0.75, fbm(u, v, 32, 32, 3, 112)) * 0.5);
    return mul(col, 0.9 + 0.2 * fbm(u, v, 64, 64, 2, 113));
  };
}

/** Site slab: beaten earth and stone dust, broad mottling. */
function ground(): Painter {
  const a = hex(0x8c8272), b = hex(0xa69a85), d = hex(0x6f685d);
  return (u, v) => {
    let col = mix(a, b, smooth(0.3, 0.7, fbm(u, v, 3, 3, 5, 121)));
    col = mix(col, d, smooth(0.6, 0.8, fbm(u, v, 8, 8, 3, 122)) * 0.5);
    return mul(col, 0.9 + 0.18 * fbm(u, v, 64, 64, 2, 123));
  };
}

function water(): Painter {
  const a = hex(0x2f5f78), b = hex(0x4f8aa0), hi = hex(0x9cc8d4);
  return (u, v) => {
    let col = mix(a, b, fbm(u, v, 3, 3, 4, 131));
    return mix(col, hi, smooth(0.66, 0.8, fbm(u, v, 24, 6, 3, 132)) * 0.5);
  };
}

/** Painter and texel size per textured role. */
export const PAINTERS: Record<string, { paint: Painter; size: number }> = {
  stone: { paint: istria(0xe4ddcc, 2, 4, 512), size: 512 },
  stoneDark: { paint: istria(0xbdb3a1, 1, 2, 256), size: 256 },
  brick: { paint: brick(512), size: 512 },
  plaster: { paint: plaster(0xb4553f, 0.64), size: 512 },
  mass: { paint: plaster(0xc4a57c, 0.66), size: 512 },
  roof: { paint: coppi(), size: 256 },
  paving: { paint: trachite(512), size: 512 },
  ground: { paint: ground(), size: 256 },
  gravel: { paint: gravel(), size: 256 },
  grass: { paint: grass(), size: 256 },
  soil: { paint: soil(), size: 256 },
  hedge: { paint: leaves(0x2f4f26, 0x6f9a48, 10), size: 256 },
  foliage: { paint: leaves(0x4a6338, 0x9fb27a, 8), size: 256 },
  trunk: { paint: bark(), size: 128 },
  wood: { paint: planks(0x8a6040, 5), size: 256 },
  water: { paint: water(), size: 256 },
};

/** Rasterise a painter into sRGB RGBA bytes (row 0 = v 0). */
export function rasterize(paint: Painter, size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const c = paint((x + 0.5) / size, (y + 0.5) / size), i = (y * size + x) * 4;
    out[i] = clamp01(c[0]) * 255 + 0.5;
    out[i + 1] = clamp01(c[1]) * 255 + 0.5;
    out[i + 2] = clamp01(c[2]) * 255 + 0.5;
    out[i + 3] = 255;
  }
  return out;
}
