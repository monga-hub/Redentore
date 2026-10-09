import * as THREE from 'three';
import type { LevelBuilder } from './builder.ts';
import { texture } from './materials.ts';
import { fbm, smooth } from './textures.ts';
import { Props, rng } from './props.ts';

// Painted, blended ground for the open-air areas, WoW style: one mesh per area whose
// shader splats four layers (grass / beaten earth / gravel / paving) through a low-res
// mask drawn from the layout. The mask's edges are noise-warped and blurred, so lawns
// fray into earth and gravel instead of ending on a straight line. Grass tufts (crossed
// alpha cards, one InstancedMesh per 16 m chunk), pebbles and small flowers grow from the
// same mask, like WoW's ground effects: thick at the foot of walls, posts and trunks,
// medium on the lawn, almost none on the paths.
//
// Zones call groundPatch() and paint rectangles; finishGround() (after dressing, so trunks
// and benches exist) bakes the masks and grows the tufts. Nothing here collides.

export type Layer = 'grass' | 'dirt' | 'gravel' | 'paving';
const LAYERS: Layer[] = ['grass', 'dirt', 'gravel', 'paving']; // mask channels r, g, b, a
const TILE = { grass: 4, dirt: 3, gravel: 2, paving: 3.2 }; // metres per repeat (gravel, paving as in materials.ts)
const RES = 0.25; // metres per mask texel
const CHUNK = 16; // tuft batches, metres
const FADE: [number, number] = [22, 34]; // tufts thin out, then vanish, between these distances

interface Rect { x0: number; x1: number; z0: number; z1: number; layer: number }

export interface PatchOpts {
  lift?: number; // height above y 0: below room floors (0.02) unless it must cover them
  skirt?: boolean; // stray tufts in the paving joints up to 1.2 m outside (cloister courtyards)
}

class GroundPatch {
  readonly rects: Rect[] = [];
  readonly holes: Rect[] = [];
  readonly mesh: THREE.Mesh;
  readonly o: PatchOpts;
  readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number;
  constructor(mesh: THREE.Mesh, x0: number, x1: number, z0: number, z1: number, o: PatchOpts) {
    this.mesh = mesh; this.o = o;
    this.x0 = Math.min(x0, x1); this.x1 = Math.max(x0, x1); this.z0 = Math.min(z0, z1); this.z1 = Math.max(z0, z1);
  }

  /** Paint a rectangle of `layer`; later paint wins. */
  paint(x0: number, x1: number, z0: number, z1: number, layer: Layer): this {
    this.rects.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), layer: LAYERS.indexOf(layer) });
    return this;
  }

  /** No tufts, pebbles or flowers here: rooms and basins whose own floor covers the patch. */
  hole(x0: number, x1: number, z0: number, z1: number): this {
    this.holes.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), layer: -1 });
    return this;
  }

  inHole(x: number, z: number): boolean {
    return this.holes.some((h) => x >= h.x0 && x <= h.x1 && z >= h.z0 && z <= h.z1);
  }
}

const PATCHES = new WeakMap<LevelBuilder, GroundPatch[]>();

/** Ground mesh over x0..x1, z0..z1 in the builder's current zone, all `base` until painted. */
export function groundPatch(b: LevelBuilder, x0: number, x1: number, z0: number, z1: number, base: Layer, o: PatchOpts = {}): GroundPatch {
  const w = Math.abs(x1 - x0), d = Math.abs(z1 - z0);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), groundMaterial());
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((x0 + x1) / 2, o.lift ?? 0.012, (z0 + z1) / 2);
  b.add(mesh, 'grass');
  const p = new GroundPatch(mesh, x0, x1, z0, z1, o).paint(x0, x1, z0, z1, base);
  let list = PATCHES.get(b);
  if (!list) PATCHES.set(b, (list = []));
  list.push(p);
  return p;
}

/** Bake every patch's mask and grow its tufts, pebbles and flowers. Call once, after dressing. */
export function finishGround(b: LevelBuilder): void {
  for (const p of PATCHES.get(b) ?? []) {
    const m = bakeMask(p);
    const u = (p.mesh.material as THREE.MeshStandardMaterial).userData.uniforms;
    u.uMask.value = m.tex;
    u.uRect.value.set(p.x0, p.z0, 1 / (p.x1 - p.x0), 1 / (p.z1 - p.z0));
    grow(b, p, m);
  }
  PATCHES.delete(b);
}

// ---------------------------------------------------------------- mask

interface Mask {
  nx: number; nz: number;
  w: Float32Array; // 4 weights per texel
  near: Float32Array; // grass blurred over ~1.5 m: "a lawn is close"
  tex: THREE.DataTexture;
}

function bakeMask(p: GroundPatch): Mask {
  const nx = Math.ceil((p.x1 - p.x0) / RES), nz = Math.ceil((p.z1 - p.z0) / RES), n = nx * nz;
  const w = new Float32Array(n * 4);
  const layerAt = (x: number, z: number) => {
    for (let i = p.rects.length - 1; i > 0; i--) {
      const r = p.rects[i];
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r.layer;
    }
    return p.rects[0].layer;
  };
  // Hard layout, read through a domain warp: straight borders turn ragged.
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = p.x0 + (i + 0.5) * RES, z = p.z0 + (j + 0.5) * RES;
    const wx = (fbm(x / 48, z / 48, 32, 32, 2, 201) - 0.5) * 1.1, wz = (fbm(x / 48, z / 48, 32, 32, 2, 202) - 0.5) * 1.1;
    const sx = Math.min(p.x1, Math.max(p.x0, x + wx)), sz = Math.min(p.z1, Math.max(p.z0, z + wz)); // paths run out to the edge
    w[(j * nx + i) * 4 + layerAt(sx, sz)] = 1;
  }
  blur(w, nx, nz, 4, 2);
  blur(w, nx, nz, 4, 1);
  // Wear: worn earth patches inside lawns and a ragged earthy fringe where grass meets paths.
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = (j * nx + i) * 4, x = p.x0 + (i + 0.5) * RES, z = p.z0 + (j + 0.5) * RES;
    const g = w[k], noise = fbm(x / 64, z / 64, 20, 20, 2, 203);
    const worn = g * (smooth(0.74, 0.77, noise) * 0.7 + 4 * g * (1 - g) * 0.6 * noise);
    w[k] -= Math.min(worn, g);
    w[k + 1] += Math.min(worn, g);
  }
  const near = new Float32Array(n);
  for (let i = 0; i < n; i++) near[i] = w[i * 4];
  blur(near, nx, nz, 1, 6);
  blur(near, nx, nz, 1, 6);
  const bytes = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const s = w[i * 4] + w[i * 4 + 1] + w[i * 4 + 2] + w[i * 4 + 3] || 1;
    for (let c = 0; c < 4; c++) bytes[i * 4 + c] = Math.round((w[i * 4 + c] / s) * 255);
  }
  const tex = new THREE.DataTexture(bytes, nx, nz);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { nx, nz, w, near, tex };
}

/** Separable box blur of radius r (texels) over a grid of `ch` channels, in place (clamped edges, running sums). */
function blur(a: Float32Array, nx: number, nz: number, ch: number, r: number): void {
  const line = new Float32Array(Math.max(nx, nz)), k = 1 / (2 * r + 1);
  const pass = (len: number, lines: number, stride: number, step: number) => {
    for (let l = 0; l < lines; l++) for (let c = 0; c < ch; c++) {
      const o = l * stride * ch + c, st = step * ch, last = len - 1;
      let s = 0;
      for (let t = -r; t <= r; t++) s += a[o + Math.min(last, Math.max(0, t)) * st];
      for (let t = 0; t < len; t++) {
        line[t] = s * k;
        s += a[o + Math.min(last, t + r + 1) * st] - a[o + Math.max(0, t - r) * st];
      }
      for (let t = 0; t < len; t++) a[o + t * st] = line[t];
    }
  };
  pass(nx, nz, nx, 1); // rows
  pass(nz, nx, 1, nx); // columns
}

// ---------------------------------------------------------------- ground material

const GROUND_VERT = `#include <project_vertex>
vGround = (modelMatrix * vec4(transformed, 1.0)).xz;`;
const GROUND_FRAG_DECL = `varying vec2 vGround;
uniform sampler2D uMask, uGrass, uDirt, uGravel, uPave;
uniform vec4 uRect;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), u.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), u.x), u.y);
}
`;
const GROUND_FRAG = `{
  vec2 w = vGround;
  vec4 mk = texture2D(uMask, (w - uRect.xy) * uRect.zw);
  vec3 cG = texture2D(uGrass, w / ${TILE.grass.toFixed(1)}).rgb;
  vec3 cD = texture2D(uDirt, w / ${TILE.dirt.toFixed(1)}).rgb;
  vec3 cR = texture2D(uGravel, w / ${TILE.gravel.toFixed(1)}).rgb;
  vec3 cP = texture2D(uPave, w / ${TILE.paving.toFixed(1)}).rgb;
  // Painted macro on the lawn: broad value/hue drift and hard-edged sun-dried blotches.
  float m1 = gNoise(w * 0.07 + 3.0), m2 = gNoise(w * 0.19 + gNoise(w * 0.05) * 2.0);
  cG *= (0.86 + 0.3 * m1) * mix(vec3(0.95, 1.0, 1.04), vec3(1.05, 1.0, 0.9), m1);
  cG = mix(cG, cG * vec3(1.12, 1.07, 0.84), smoothstep(0.64, 0.67, m2));
  // Height blend: along a fade each layer's own relief and a painterly noise decide who
  // shows, so transitions are jagged clumps, not a cross-dissolve. Joints sit low:
  // grass and earth creep into the paving and between the pebbles.
  float n1 = gNoise(w * 1.6) * 0.65 + gNoise(w * 5.1 + 7.0) * 0.35;
  float n2 = gNoise(w * 2.3 + 13.0);
  vec3 L = vec3(0.3, 0.5, 0.2);
  vec4 h = mk + vec4(n1 - 0.5, n2 - 0.5, dot(cR, L) - 0.55, (dot(cP, L) - 0.3) * 1.6) * 0.5;
  float top = max(max(h.x, h.y), max(h.z, h.w));
  vec4 k = max(h - top + 0.12, 0.0);
  k /= k.x + k.y + k.z + k.w;
  vec3 col = cG * k.x + cD * k.y + cR * k.z + cP * k.w;
  col *= 0.92 + 0.16 * gNoise(w * 0.11 + 21.0);
  diffuseColor.rgb *= col;
}`;

function groundMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  const uniforms = {
    uMask: { value: null as THREE.Texture | null },
    uRect: { value: new THREE.Vector4() },
    uGrass: { value: texture('grass') },
    uDirt: { value: texture('dirt') },
    uGravel: { value: texture('gravel') },
    uPave: { value: texture('paving') },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'varying vec2 vGround;\n' + sh.vertexShader.replace('#include <project_vertex>', GROUND_VERT);
    sh.fragmentShader = GROUND_FRAG_DECL + sh.fragmentShader.replace('#include <map_fragment>', GROUND_FRAG);
  };
  m.customProgramCacheKey = () => 'ground';
  return m;
}

// ---------------------------------------------------------------- tufts

/** Three unit quads crossed at 60°, foot on y 0, top at y 1, normals straight up. */
const TUFT = (() => {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let q = 0; q < 3; q++) {
    const a = (q * Math.PI) / 3, c = Math.cos(a), s = Math.sin(a), base = q * 4;
    for (const [lx, y, u] of [[-0.4, 0, 0], [0.4, 0, 1], [0.6, 1, 1], [-0.6, 1, 0]]) { // flares out a little
      pos.push(lx * c, y - 0.03, lx * s);
      uv.push(u, y);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
})();

const TIME = { value: 0 };

const TUFT_VERT = `#include <begin_vertex>
{
  // Per-instance distance thinning (shrinks to nothing, no pop) and wind on the tip only.
  vec3 ip = (modelMatrix * instanceMatrix[3]).xyz;
  float r = fract(sin(dot(ip.xz, vec2(12.9898, 78.233))) * 43758.5453);
  float keep = smoothstep(${FADE[1].toFixed(1)}, ${FADE[0].toFixed(1)}, distance(ip, cameraPosition));
  transformed *= clamp((keep - r) * 6.0 + 0.15, 0.0, 1.0);
  float tip = position.y * position.y;
  transformed.xz += vec2(sin(uTime * 1.3 + ip.x * 0.7 + ip.z * 0.5), cos(uTime * 1.1 + ip.x * 0.5 - ip.z * 0.6) * 0.6) * 0.12 * tip;
}`;

let tuftMat: THREE.MeshStandardMaterial | undefined;
function tuftMaterial(): THREE.MeshStandardMaterial {
  if (tuftMat) return tuftMat;
  const map = texture('tuft');
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = TIME;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', TUFT_VERT);
    // Lit like the ground under it from both sides: drop the back-face normal flip.
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
  };
  m.customProgramCacheKey = () => 'tuft';
  return (tuftMat = m);
}

/** Distance (m) from each mask texel to the nearest ground-standing collider, 0 inside one. */
function wallDistance(b: LevelBuilder, p: GroundPatch, nx: number, nz: number, y: number): Float32Array {
  const d = new Float32Array(nx * nz).fill(1e3);
  for (const bx of b.world.boxes) {
    if (bx.y0 > y + 0.1 || bx.y1 < y + 0.1) continue;
    const ext = Math.hypot(bx.hx, bx.hz);
    if (bx.cx + ext < p.x0 || bx.cx - ext > p.x1 || bx.cz + ext < p.z0 || bx.cz - ext > p.z1) continue;
    const i0 = Math.max(0, Math.floor((bx.cx - ext - p.x0) / RES)), i1 = Math.min(nx - 1, Math.ceil((bx.cx + ext - p.x0) / RES));
    const j0 = Math.max(0, Math.floor((bx.cz - ext - p.z0) / RES)), j1 = Math.min(nz - 1, Math.ceil((bx.cz + ext - p.z0) / RES));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = p.x0 + (i + 0.5) * RES - bx.cx, dz = p.z0 + (j + 0.5) * RES - bx.cz;
      if (Math.abs(bx.cos * dx - bx.sin * dz) <= bx.hx + 0.05 && Math.abs(bx.sin * dx + bx.cos * dz) <= bx.hz + 0.05) d[j * nx + i] = 0;
    }
  }
  // Two-pass chamfer distance transform.
  const D = RES, DD = RES * Math.SQRT2;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    if (i > 0) d[k] = Math.min(d[k], d[k - 1] + D);
    if (j > 0) {
      d[k] = Math.min(d[k], d[k - nx] + D);
      if (i > 0) d[k] = Math.min(d[k], d[k - nx - 1] + DD);
      if (i < nx - 1) d[k] = Math.min(d[k], d[k - nx + 1] + DD);
    }
  }
  for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i;
    if (i < nx - 1) d[k] = Math.min(d[k], d[k + 1] + D);
    if (j < nz - 1) {
      d[k] = Math.min(d[k], d[k + nx] + D);
      if (i < nx - 1) d[k] = Math.min(d[k], d[k + nx + 1] + DD);
      if (i > 0) d[k] = Math.min(d[k], d[k + nx - 1] + DD);
    }
  }
  return d;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const FLOWERS = [0xf4efe2, 0xf2d34a, 0xb59ad8, 0xf0b6c8];

/**
 * Scatter tufts by rejection sampling at up to 10 per m². Density: ~2-4/m² on the lawn
 * (clumped), +6 within ~0.6 m of walls, posts and trunks, a fringe along lawn edges, weeds
 * at the foot of walls on gravel/earth, strays in paving joints near a lawn.
 */
function grow(b: LevelBuilder, p: GroundPatch, mk: Mask): void {
  const y = p.mesh.position.y, skirt = p.o.skirt ? 1.2 : 0;
  const zone = p.mesh.parent!.name.slice('zone:'.length);
  const dist = wallDistance(b, p, mk.nx, mk.nz, y);
  const r = rng(Math.round(p.x0 * 131 + p.z0 * 71) | 0);
  const props = new Props(b, Math.round(p.x1 * 31 - p.z1 * 17) | 0);
  const chunks = new Map<string, { m: THREE.Matrix4[]; c: THREE.Color[] }>();
  const x0 = p.x0 - skirt, z0 = p.z0 - skirt, w = p.x1 - p.x0 + 2 * skirt, d = p.z1 - p.z0 + 2 * skirt;
  const tries = Math.round(w * d * 10);
  for (let t = 0; t < tries; t++) {
    const x = x0 + r() * w, z = z0 + r() * d, roll = r();
    if (p.inHole(x, z)) continue;
    const i = Math.floor((x - p.x0) / RES), j = Math.floor((z - p.z0) / RES);
    let g = 0, dens = 0, wall = 1e3, earth = 0;
    if (i >= 0 && j >= 0 && i < mk.nx && j < mk.nz) {
      const k = j * mk.nx + i;
      wall = dist[k];
      if (wall < 0.05) continue;
      g = mk.w[k * 4];
      earth = mk.w[k * 4 + 1] + mk.w[k * 4 + 2];
      const near = 1 - smooth(0.15, 0.7, wall);
      const clump = smooth(0.35, 0.7, fbm(x / 32, z / 32, 16, 16, 2, 211));
      dens = g * g * (2.5 + 3.5 * clump) + near * (6 * g + 1.5 * earth) + 3 * g * (1 - g) + mk.near[k] * (1 - g) * 0.6;
    } else {
      // skirt: outside the courtyard, in the walk's paving joints, thinning away from the lawn
      const out = Math.max(p.x0 - x, x - p.x1, p.z0 - z, z - p.z1);
      dens = 0.8 * (1 - out / skirt);
      if (b.world.blocked(x, z, y, 0.08)) continue;
    }
    if (roll * 10 >= dens) continue;
    const big = r();
    const h = (0.24 + 0.16 * big) * (1 + 0.5 * (1 - smooth(0.15, 0.7, wall))) * (0.55 + 0.45 * g);
    const s = (0.4 + 0.18 * r()) * (0.7 + 0.3 * g);
    _q.setFromAxisAngle(UP, r() * Math.PI * 2);
    _m.compose(_p.set(x, y, z), _q, _s.set(s, h, s));
    const v = 0.9 + 0.2 * r(), dry = 0.1 * r() + 0.15 * (1 - g);
    _c.setRGB(v * (1 + dry * 0.6), v * (1 + dry * 0.25), v * (1 - dry));
    const key = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
    let ch = chunks.get(key);
    if (!ch) chunks.set(key, (ch = { m: [], c: [] }));
    ch.m.push(_m.clone());
    ch.c.push(_c.clone());
    // flowers ride on a few lawn tufts, in drifts
    if (g > 0.6 && r() < 0.06 * smooth(0.5, 0.75, fbm(x / 24, z / 24, 12, 12, 2, 212))) {
      const fr = 0.035 + 0.02 * r();
      props.blob(x, y + h * 0.85, z, fr, fr * 0.7, fr, 'flower', FLOWERS[Math.floor(r() * FLOWERS.length)], true);
    }
  }
  // pebbles: on earth and gravel near lawns and walls
  for (let t = 0, n = Math.round(w * d * 0.6); t < n; t++) {
    const x = p.x0 + r() * (p.x1 - p.x0), z = p.z0 + r() * (p.z1 - p.z0);
    if (p.inHole(x, z)) continue;
    const k = Math.floor((z - p.z0) / RES) * mk.nx + Math.floor((x - p.x0) / RES);
    const e = mk.w[k * 4 + 1] + 0.5 * mk.w[k * 4 + 2];
    if (dist[k] < 0.1 || r() >= e * (mk.near[k] + 1 - smooth(0.2, 1, dist[k]))) continue;
    const pr = 0.03 + 0.06 * r() * r();
    props.blob(x, y + pr * 0.15, z, pr, pr * 0.45, pr * (0.7 + 0.5 * r()), 'stoneDark', props.vary(0.4), true);
  }
  const mat = tuftMaterial();
  for (const { m, c } of chunks.values()) {
    const im = new THREE.InstancedMesh(TUFT, mat, m.length);
    m.forEach((mx, k) => { im.setMatrixAt(k, mx); im.setColorAt(k, c[k]); });
    im.computeBoundingSphere();
    im.computeBoundingBox();
    im.userData.role = 'grass';
    im.userData.castShadow = false; // alpha cards: receive only (fx/atmosphere.ts)
    im.onBeforeRender = () => { TIME.value = performance.now() / 1000; };
    p.mesh.parent!.add(im);
  }
  b.zone(zone);
  props.flush();
}
