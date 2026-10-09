// Procedural, seamlessly tiling albedo painters for the stylized materials.
// Pure JS (no canvas/DOM), so the headless `npm run check` can build the level too.
// Look: hand-painted fantasy-RPG style — bold per-block value shifts, painted bevels
// (lit top/left edge, dark bottom/right), dark joints, controlled saturation.
// Tints sampled from the reference frames of the Redentore complex.

export type RGB = [number, number, number];
/** RGB plus height, stored in the texture's alpha. */
export type RGBH = [number, number, number, number];
/** u, v in [0,1); v = 0 is the bottom row (world-up on walls). */
export type Painter = (u: number, v: number) => RGB;
type AnyPainter = (u: number, v: number) => RGB | RGBH;

// ---- maths ---------------------------------------------------------------

export function hash(x: number, y: number, s = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;
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
  const shade = 1 + 0.24 * e(t) + 0.1 * e(l) - 0.28 * e(b) - 0.14 * e(r);
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
    col = mul(col, 0.9 + 0.18 * fbm(u, v, 3, 3, 2, 11));
    const streak = smooth(0.6, 0.85, fbm(u, v, 12, 2, 3, 13)); // vertical weathering
    col = mul(col, 1 - streak * 0.1);
    return mix(mul(col, c.shade), joint, c.joint);
  };
}

const BRICKS = [0xc98a5e, 0xb86b4a, 0xd4a072, 0xa85a3f, 0xc47c56, 0xbf7350, 0xd9b083].map(hex);

/**
 * Aged cloister brick: 8×32 bricks per tile, exact half bond so the shader can rebuild the
 * grid and draw every world brick from a random cell of this pool (materials.ts, TRI_BRICK).
 * Each cell is self-contained (joint centred on the cell edge) so shuffled cells meet in
 * mortar. Alpha = height: 0 hole, ~0.2 mortar, ~0.45 chipped clay, ~0.9 brick face.
 */
function agedBrick(n: number): (u: number, v: number) => RGBH {
  const cols = 8, rows = 32, cw = n / cols, ch = n / rows, jh = 2.2; // half joint, texels
  const mortar = hex(0xc2b59b), burnt = hex(0x6e3b2a), pale = hex(0xdcb48c), hole = hex(0x2e221c);
  return (u, v) => {
    const y = v * rows, row = Math.floor(y), x = u * cols + (row & 1) * 0.5, cf = Math.floor(x);
    const col = mod(cf, cols), id = hash(col, row, 7), r2 = hash(col, row, 8), r3 = hash(col, row, 9);
    const lx = (x - cf) * cw, ly = (y - row) * ch;
    // per-edge inset + hand-cut wobble: no two bricks share an outline
    const wob = (vnoise(u, v, 128, 128, 91) - 0.5) * 2.2;
    const l = lx - hash(col, row, 10) * 1.5 + wob, r = cw - lx - hash(col, row, 11) * 1.5 - wob;
    const b = ly - hash(col, row, 12) * 1.2 + wob, t = ch - ly - hash(col, row, 13) * 1.2 - wob;
    const d = Math.min(l, r, b, t);
    // chips: noisy bites eaten from the arrises, a few bricks badly damaged
    const chipK = r2 < 0.25 ? 9 + r2 * 40 : r2 * 7;
    const eat = smooth(0.42, 0.78, fbm(u, v, 96, 96, 3, 14)) * chipK;
    const corner = Math.min(Math.hypot(Math.min(l, r), Math.min(b, t)), 99) - r3 * r3 * 10;
    const dd = Math.min(d - eat, corner);
    const face = smooth(jh, jh + 1, dd), clay = smooth(jh, jh + 1, d) * (1 - face);
    // mortar: weathered, eroded deeper in places
    const ero = smooth(0.5, 0.75, fbm(u, v, 48, 48, 3, 15));
    let m = mul(mortar, (0.8 + 0.22 * fbm(u, v, 64, 64, 2, 24)) * (1 - 0.3 * ero));
    const mh = 0.22 - 0.12 * ero;
    if (hash(col, row, 17) < 0.035) { // missing brick: a dark socket with crumbs
      const g = fbm(u, v, 128, 128, 2, 18), inside = smooth(jh, jh + 3, d);
      return [...mix(m, mul(hole, 0.8 + 0.5 * g), inside), mh * (1 - inside) + 0.05 * g];
    }
    let c = pick(BRICKS, id);
    if (r3 > 0.9) c = mix(c, burnt, 0.55 + (r3 - 0.9) * 3); // clinkered headers
    else if (r3 < 0.1) c = mix(c, pale, 0.45); // underfired, salmon
    c = mul(c, 0.84 + 0.26 * hash(col, row, 19));
    const mott = fbm(u, v, 16, 16, 2, 22);
    c = mul(c, 0.82 + 0.3 * mott);
    const pit = smooth(0.66, 0.8, fbm(u, v, 160, 160, 2, 25)); // pockmarks and spalls
    c = mul(c, 1 - 0.12 * pit);
    const e = (k: number) => 1 - smooth(jh, jh + 5, k);
    const shade = 1 + 0.14 * e(t) + 0.06 * e(l) - 0.18 * e(b) - 0.08 * e(r);
    const broken = mul(mix(c, hex(0x8a4a34), 0.4), 0.78 + 0.2 * mott); // fresh break, darker clay
    const col3 = mix(mix(m, broken, clay), mul(c, shade), face);
    const h = mh * (1 - clay - face) + (0.4 + 0.1 * mott) * clay + (0.82 + 0.14 * mott - 0.2 * pit) * face;
    return [...col3, h];
  };
}

/** Intonaco: washed, mottled plaster. Scaling patches are cut in world space (materials.ts, TRI_PEEL). */
function plaster(base: number): Painter {
  const b = hex(base), lit = mix(b, hex(0xf2e2c8), 0.35), dark = mul(b, 0.72);
  return (u, v) => {
    const wash = fbm(u, v, 3, 3, 3, 31);
    let col = mix(dark, lit, 0.15 + 0.35 * smooth(0.42, 0.45, wash) + 0.35 * smooth(0.6, 0.63, wash) + 0.15 * wash);
    col = mul(col, 0.95 + 0.08 * fbm(u, v, 8, 8, 2, 32));
    const drip = smooth(0.6, 0.85, fbm(u, v, 16, 2, 3, 33));
    return mul(col, 1 - drip * 0.15);
  };
}

/** Trachite masegni: dark grey slabs, uneven lengths, speckled and worn smooth. */
function trachite(n: number): Painter {
  const pal = [0x5f5e5b, 0x56585c, 0x67615a, 0x4f4f50, 0x6b6966].map(hex), joint = hex(0x3a3734);
  return (u, v) => {
    const c = bond(u, v, 3, 4, r => hash(r, 2, 41), n, 3.5, 6);
    let col = pick(pal, c.id);
    col = mul(col, 0.85 + 0.3 * fbm(u, v, 4, 4, 2, 42));
    const worn = smooth(0.55, 0.75, fbm(u, v, 5, 5, 3, 43));
    col = mix(col, hex(0x8a877f), worn * 0.25);
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
    c = mul(c, 0.9 + 0.2 * fbm(u, v, 8, 8, 2, 53));
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
    col = mul(col, 0.9 + 0.15 * fbm(u, v, 16, 2, 2, 63));
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

/**
 * Painted lawn: three flat tones (blue-green shade, olive mid, yellow-green light) cut at hard
 * thresholds of a large noise, pushed around by directional brush strokes whose direction
 * swaps between macro patches. No per-texel grain: the tufts (ground.ts) carry the detail.
 */
function grass(): Painter {
  const shade = hex(0x3b5236), midT = hex(0x5c7140), lit = hex(0x87924f);
  return (u, v) => {
    const dir = smooth(0.42, 0.58, fbm(u, v, 2, 2, 2, 94));
    const strokes = fbm(u, v, 3, 18, 3, 92) * (1 - dir) + fbm(u, v, 18, 3, 3, 95) * dir;
    const t = fbm(u, v, 3, 3, 3, 91) + (strokes - 0.5) * 0.45;
    let col = mix(shade, midT, smooth(0.4, 0.43, t));
    col = mix(col, lit, smooth(0.58, 0.61, t));
    return mul(col, 0.94 + 0.12 * fbm(u, v, 6, 6, 2, 93)); // soft wash, not grain
  };
}

/** Beaten earth between lawns and paths: three warm greys at hard thresholds, a few pebbles. */
function dirt(): Painter {
  const dark = hex(0x5c4532), midT = hex(0x7f6249), lit = hex(0x9e7f5e), peb = hex(0xa79a86);
  return (u, v) => {
    const t = fbm(u, v, 3, 3, 3, 141) + (fbm(u, v, 4, 16, 2, 142) - 0.5) * 0.35;
    let col = mix(dark, midT, smooth(0.38, 0.41, t));
    col = mix(col, lit, smooth(0.6, 0.63, t));
    const c = voronoi(u, v, 24, 143);
    if (c.id < 0.18) col = mix(col, mul(peb, 0.85 + c.id), 1 - smooth(0.18, 0.24, c.f1));
    return col;
  };
}

/**
 * Alpha card for a grass tuft: 9 tapering, curving blades fanned out from the base. Dark at
 * the foot, light yellow-green at the tips (baked AO + light). RGB is filled everywhere so
 * mipmaps don't bleed black into the blade edges.
 */
function tuft(): (u: number, v: number) => RGBH {
  const foot = hex(0x34482f), tip = hex(0xa9b267), fill = hex(0x56693c);
  const blades = Array.from({ length: 9 }, (_, i) => {
    const xb = 0.3 + 0.4 * hash(i, 0, 151), lean = (xb - 0.5) * 1.3 + (hash(i, 1, 151) - 0.5) * 0.5;
    return { xb, xt: xb + lean * 0.6, h: 0.62 + 0.38 * hash(i, 2, 151), w: 0.045 + 0.03 * hash(i, 3, 151), k: 0.8 + 0.35 * hash(i, 4, 151) };
  });
  return (u, v) => {
    for (const b of blades) {
      const t = v / b.h;
      if (t >= 1) continue;
      const cx = b.xb + (b.xt - b.xb) * t * t; // bends over towards the tip
      const hw = b.w * Math.pow(1 - t, 0.75);
      const dx = (u - cx) / hw;
      if (Math.abs(dx) >= 1) continue;
      const rib = dx > 0 ? 1.12 : 0.9; // painted midrib: one half lit, one in shade
      const c = mul(mix(foot, tip, smooth(0, 0.95, v)), b.k * rib);
      return [...c, 1];
    }
    return [...fill, 0];
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
export const PAINTERS: Record<string, { paint: AnyPainter; size: number }> = {
  stone: { paint: istria(0xe4ddcc, 2, 4, 512), size: 512 },
  stoneDark: { paint: istria(0xbdb3a1, 1, 2, 256), size: 256 },
  brick: { paint: agedBrick(1024), size: 1024 },
  plaster: { paint: plaster(0xb4553f), size: 512 },
  mass: { paint: plaster(0xc4a57c), size: 512 },
  roof: { paint: coppi(), size: 256 },
  paving: { paint: trachite(512), size: 512 },
  ground: { paint: ground(), size: 256 },
  gravel: { paint: gravel(), size: 256 },
  grass: { paint: grass(), size: 512 },
  dirt: { paint: dirt(), size: 256 },
  tuft: { paint: tuft(), size: 128 },
  soil: { paint: soil(), size: 256 },
  hedge: { paint: leaves(0x2f4f26, 0x6f9a48, 10), size: 256 },
  foliage: { paint: leaves(0x4a6338, 0x9fb27a, 8), size: 256 },
  trunk: { paint: bark(), size: 128 },
  wood: { paint: planks(0x8a6040, 5), size: 256 },
  water: { paint: water(), size: 256 },
};

/** Rasterise a painter into sRGB RGBA bytes (row 0 = v 0). */
export function rasterize(paint: AnyPainter, size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const c = paint((x + 0.5) / size, (y + 0.5) / size), i = (y * size + x) * 4;
    out[i] = clamp01(c[0]) * 255 + 0.5;
    out[i + 1] = clamp01(c[1]) * 255 + 0.5;
    out[i + 2] = clamp01(c[2]) * 255 + 0.5;
    out[i + 3] = clamp01(c[3] ?? 1) * 255 + 0.5;
  }
  return out;
}
