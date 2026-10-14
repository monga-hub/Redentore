import * as THREE from 'three';

// Spell effects for every caster, player and enemies, Diablo/WoW style: textured, layered and
// cheap. Everything is pooled and allocated once at startup, nothing per frame:
// - particles: camera-facing quads from one procedural atlas (soft glows, hot sparks stretched
//   along their motion, flares, smoke that erodes away through its own noise, bone shards,
//   flames, droplets, skulls), one draw call for the glowing ones and one for dark smoke;
// - ribbons: fading trails behind bolts and spears, and swept weapon trails between two edges;
// - decals: flat effects on the floor (shock rings, rune circles, cracks, scorch, toxic pools,
//   telegraphs that fill up), additive or dark;
// - bone spikes erupting from the ground, one instanced draw;
// - the one ability light (its shader count never changes, see torches.ts) and a camera shake.
// Callers describe a particle with a `Style` made once at module level and spawn it at a point,
// so emitting is allocation-free.

/** Particle atlas tiles (4×4). */
export const T = { glow: 0, spark: 1, star: 2, smoke: 3, smoke2: 4, wisp: 5, shard: 6, ring: 7, flame: 8, ember: 9, drop: 10, rune: 11, skull: 12, streak: 13 } as const;
/** Decal atlas tiles (4×4). */
export const D = { disc: 0, shock: 1, runes: 2, cracks: 3, scorch: 4, pool: 5, ring: 6, sigil: 7, splash: 8, swirl: 9 } as const;

type Range = number | [number, number];
const pick = (r: Range) => (typeof r === 'number' ? r : r[0] + Math.random() * (r[1] - r[0]));

/** How a particle looks and moves. Made once, spawned many times. */
export interface Style {
  life: Range; // s
  size: Range; // m across
  color: number; // hex, linear
  color2?: number; // colour it fades to over its life
  hdr?: number; // colour multiplier: > 1 blooms
  alpha?: number; // peak opacity
  grow?: number; // size multiplier reached at the end of life
  grav?: number; // m/s² down (negative rises)
  drag?: number; // 1/s
  tex?: number; // atlas tile (T), default glow
  spin?: Range; // rad/s
  upright?: boolean; // never turned: flames lick upward
  stretch?: number; // s: drawn this long along its velocity (sparks, streaks)
  erode?: boolean; // the noise eats it away as it ages (smoke)
  dark?: boolean; // normal blending (smoke, dirt, gore) instead of additive glow
  fadeIn?: number; // share of life spent fading in (default 0.12)
}

/** A flat effect on the floor. */
export interface DecalStyle {
  life: number; // s (held decals ignore it)
  size: number; // m across at birth
  grow?: number; // size multiplier at the end of life
  tile: number; // D
  color: number;
  color2?: number;
  hdr?: number;
  alpha?: number;
  spin?: number; // rad/s
  fadeIn?: number; // s
  fadeOut?: number; // share of life
  dark?: boolean;
}

// --- atlases -----------------------------------------------------------------------------------

let seed = 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const hash = (x: number, y: number) => { const h = Math.sin(x * 127.1 + y * 311.7 + seed * 0.013) * 43758.5453; return h - Math.floor(h); };
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, y: number, o = 5) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += vnoise(x * f, y * f) * a; f *= 2.03; a *= 0.5; } return s; };

/** A 4×4 atlas of `S`-px tiles; `draw(i, g, px)` paints tile i with canvas calls or raw pixels. */
function atlas(S: number, tiles: ((g: CanvasRenderingContext2D, px: ImageData) => boolean)[]): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = S * 4;
  const g = c.getContext('2d', { willReadFrequently: true })!; // kept on the CPU: uploads without a GPU readback
  const t = document.createElement('canvas');
  t.width = t.height = S;
  const tg = t.getContext('2d', { willReadFrequently: true })!;
  tiles.forEach((draw, i) => {
    tg.clearRect(0, 0, S, S);
    const px = tg.createImageData(S, S);
    if (draw(tg, px)) tg.putImageData(px, 0, 0);
    g.drawImage(t, (i % 4) * S, Math.floor(i / 4) * S);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 2;
  return tex;
}

/** Fill raw pixels: `f(u, v)` in -1..1 returns [luma, alpha] in 0..1. */
const field = (px: ImageData, f: (u: number, v: number) => [number, number]) => {
  const S = px.width, d = px.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const [l, a] = f((x + 0.5) / S * 2 - 1, (y + 0.5) / S * 2 - 1), i = (y * S + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, l * 255));
    d[i + 3] = Math.max(0, Math.min(255, a * 255));
  }
  return true;
};
const sat = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function particleAtlas(): THREE.Texture {
  const S = 128;
  const smokeTile = (s: number, stretch = 1) => (_: CanvasRenderingContext2D, px: ImageData) => {
    seed = s;
    return field(px, (u, v) => {
      const r = Math.hypot(u, v * stretch), n = fbm(u * 2.2 + 7, v * 2.2 * stretch + 3), m = smooth(1, 0.35, r + (n - 0.5) * 0.5);
      return [0.62 + 0.38 * smooth(0.2, 0.8, fbm(u * 3 + 1.7 - v, v * 3 + 9)) - v * 0.12, m * smooth(0.18, 0.75, n + 0.25 * (1 - r))];
    });
  };
  const draw = (f: (g: CanvasRenderingContext2D) => void) => (g: CanvasRenderingContext2D) => {
    g.save(); g.translate(S / 2, S / 2); g.fillStyle = g.strokeStyle = '#fff'; g.lineCap = g.lineJoin = 'round'; f(g); g.restore(); return false;
  };
  return atlas(S, [
    (_, px) => field(px, (u, v) => { const r = u * u + v * v; return [1, Math.exp(-r * 4.5) * smooth(1, 0.8, Math.sqrt(r))]; }), // glow
    (_, px) => field(px, (u, v) => { const r = Math.hypot(u, v); return [1, sat(Math.exp(-r * r * 30) + Math.exp(-r * r * 5) * 0.35) * smooth(1, 0.85, r)]; }), // spark
    (_, px) => field(px, (u, v) => { // star
      const r = Math.hypot(u, v), x = Math.abs(u), y = Math.abs(v);
      return [1, sat(Math.exp(-x * 9 - y * y * 220) + Math.exp(-y * 9 - x * x * 220) + Math.exp(-r * r * 22) + 0.4 * Math.exp(-r * r * 5)) * smooth(1, 0.85, r)];
    }),
    smokeTile(11), smokeTile(23), smokeTile(37, 1.8),
    draw((g) => { // bone shard: a jagged splinter
      g.beginPath(); g.moveTo(0, -58); g.lineTo(9, -30); g.lineTo(5, -6); g.lineTo(13, 18); g.lineTo(4, 54); g.lineTo(-6, 22); g.lineTo(-11, -4); g.lineTo(-5, -28); g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.moveTo(0, -58); g.lineTo(-5, -28); g.lineTo(-11, -4); g.lineTo(-6, 22); g.lineTo(4, 54); g.lineTo(0, 10); g.closePath(); g.fill();
    }),
    (_, px) => field(px, (u, v) => { const r = Math.hypot(u, v); return [1, Math.exp(-((r - 0.78) ** 2) * 260) + Math.exp(-((r - 0.78) ** 2) * 30) * 0.3]; }), // ring
    (_, px) => { seed = 5; return field(px, (u, v) => { // flame: a flickering teardrop, tip up
      const w = 0.55 * smooth(-1, 0.6, -v) * (0.6 + 0.4 * smooth(1, 0.2, v)), n = fbm(u * 3, v * 2 + 4);
      const d = Math.abs(u) / Math.max(w, 1e-3);
      return [1, sat(smooth(1.1, 0.2, d + (n - 0.5) * 0.7) * smooth(1, 0.55, v) * smooth(-1, -0.6, v) * 1.2)];
    }); },
    (_, px) => { seed = 9; return field(px, (u, v) => { const r = Math.hypot(u, v); return [1, smooth(0.75, 0.2, r + (fbm(u * 4, v * 4) - 0.5) * 0.6)]; }); }, // ember
    (_, px) => field(px, (u, v) => { // droplet with a highlight
      const r = Math.hypot(u, v * 0.85 + 0.1), h = Math.exp(-((u + 0.25) ** 2 + (v + 0.3) ** 2) * 40);
      return [0.7 + h * 0.6, smooth(0.62, 0.5, r)];
    }),
    draw((g) => { // rune glyph
      g.lineWidth = 9;
      g.beginPath(); g.moveTo(0, -46); g.lineTo(0, 46); g.moveTo(0, -20); g.lineTo(26, -42); g.moveTo(0, 6); g.lineTo(-26, -16); g.moveTo(0, 22); g.lineTo(24, 44); g.stroke();
    }),
    draw((g) => { // skull
      g.beginPath(); g.ellipse(0, -8, 40, 38, 0, 0, Math.PI * 2); g.fill();
      g.fillRect(-22, 20, 44, 26);
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.ellipse(-15, -4, 11, 13, 0.2, 0, Math.PI * 2); g.ellipse(15, -4, 11, 13, -0.2, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(0, 12); g.lineTo(-6, 22); g.lineTo(6, 22); g.fill();
      for (let i = -2; i <= 2; i++) g.fillRect(i * 9 - 1.5, 32, 3, 14);
    }),
    (_, px) => field(px, (u, v) => [1, Math.exp(-u * u * 60) * smooth(1, 0.3, Math.abs(v))]), // streak (vertical)
  ]);
}

function decalAtlas(): THREE.Texture {
  const S = 256;
  const draw = (f: (g: CanvasRenderingContext2D) => void) => (g: CanvasRenderingContext2D) => {
    g.save(); g.translate(S / 2, S / 2); g.fillStyle = g.strokeStyle = '#fff'; g.lineCap = g.lineJoin = 'round'; f(g); g.restore(); return false;
  };
  const circle = (g: CanvasRenderingContext2D, r: number, w: number) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
  return atlas(S, [
    (_, px) => field(px, (u, v) => { const r = Math.hypot(u, v); return [1, Math.exp(-r * r * 3.2) * smooth(1, 0.7, r)]; }), // disc
    (_, px) => { seed = 3; return field(px, (u, v) => { // shock ring: a crisp front with a smoky band trailing inside it, hollow
      const r = Math.hypot(u, v), n = fbm(Math.atan2(v, u) * 3 + 10, r * 4), band = smooth(0.62, 0.93, r);
      return [1, sat(smooth(1, 0.94, r) * band * band * (0.5 + 0.6 * n) + Math.exp(-((r - 0.94) ** 2) * 900) * 0.8)];
    }); },
    draw((g) => { // rune circle
      circle(g, 122, 5); circle(g, 102, 3); circle(g, 62, 3);
      g.lineWidth = 3;
      for (let i = 0; i < 20; i++) {
        g.save(); g.rotate((i / 20) * Math.PI * 2);
        const h = (i * 7) % 4;
        g.beginPath(); g.moveTo(-5, -106); g.lineTo(0, -118); g.lineTo(5, -106 - h * 2);
        if (h & 1) { g.moveTo(-6, -112); g.lineTo(6, -112); }
        if (h === 2) { g.moveTo(0, -106); g.lineTo(0, -98); }
        g.stroke(); g.restore();
      }
      g.lineWidth = 3; g.beginPath();
      for (let i = 0; i <= 5; i++) { const a = (i * 4 / 5) * Math.PI - Math.PI / 2; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 100, Math.sin(a) * 100); }
      g.stroke();
    }),
    draw((g) => { // cracks: a crater and jagged fissures
      seed = 17;
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, 40); grd.addColorStop(0, 'rgba(255,255,255,.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(0, 0, 40, 0, Math.PI * 2); g.fill();
      for (let k = 0; k < 11; k++) {
        let a = (k / 11) * Math.PI * 2 + rand() * 0.3, r = 10, w = 6;
        g.beginPath(); g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        while (r < 118) { r += 10 + rand() * 12; a += (rand() - 0.5) * 0.35; g.lineWidth = w; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); w = Math.max(1.5, w * 0.85); }
        g.stroke();
        if (rand() < 0.6) { const b = a + 0.4, rr = r * 0.6; g.lineWidth = 2; g.beginPath(); g.moveTo(Math.cos(a) * rr * 0.8, Math.sin(a) * rr * 0.8); g.lineTo(Math.cos(b) * rr, Math.sin(b) * rr); g.stroke(); }
      }
    }),
    (_, px) => { seed = 29; return field(px, (u, v) => { const r = Math.hypot(u, v), n = fbm(u * 3 + 2, v * 3 + 5); return [1, smooth(0.95, 0.4, r + (n - 0.5) * 0.7) * (0.6 + 0.4 * n)]; }); }, // scorch
    (_, px) => { seed = 41; return field(px, (u, v) => { // pool: a lumpy puddle with a bright rim and bubbles
      const r = Math.hypot(u, v) + (fbm(u * 2.5 + 3, v * 2.5) - 0.5) * 0.35, n = fbm(u * 6, v * 6 + 2);
      return [1, smooth(0.9, 0.82, r) * (0.35 + 0.35 * n) + Math.exp(-((r - 0.84) ** 2) * 600) * 0.7 + smooth(0.6, 0.62, n) * smooth(0.82, 0.6, r) * 0.6];
    }); },
    draw((g) => { circle(g, 120, 6); circle(g, 112, 2); }), // ring (telegraph edge)
    draw((g) => { // sigil: star in two circles
      circle(g, 120, 5); circle(g, 92, 4);
      g.lineWidth = 4; g.beginPath();
      for (let i = 0; i <= 5; i++) { const a = (i * 2 / 5) * Math.PI * 2 - Math.PI / 2; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 92, Math.sin(a) * 92); }
      g.stroke();
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; g.beginPath(); g.arc(Math.cos(a) * 106, Math.sin(a) * 106, 7, 0, Math.PI * 2); g.fill(); }
    }),
    draw((g) => { // splash: a blot and flung droplets
      seed = 53;
      g.beginPath(); g.arc(0, 0, 34, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 26; i++) { const a = rand() * Math.PI * 2, d = 30 + rand() * 80, s = 3 + rand() * 9 * (1 - d / 120); g.beginPath(); g.ellipse(Math.cos(a) * d, Math.sin(a) * d, s * 1.6, s, a, 0, Math.PI * 2); g.fill(); }
    }),
    draw((g) => { // swirl: four arms spiralling in
      g.lineWidth = 7;
      for (let k = 0; k < 4; k++) { g.beginPath(); for (let i = 0; i <= 40; i++) { const t = i / 40, a = k * Math.PI / 2 + t * 4, r = 118 * (1 - t * 0.85); g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } g.stroke(); }
    }),
  ]);
}

// --- particles ---------------------------------------------------------------------------------

const P_VERT = /* glsl */ `
  attribute vec3 iPos;
  attribute vec3 iVel;
  attribute vec4 iSrs; // size, rotation, stretch (s), tile
  attribute vec4 iCol;
  attribute vec2 iAge; // life fraction, erodes
  varying vec2 vUv;
  varying vec4 vCol;
  varying vec2 vAge;
  void main() {
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    vec2 c = position.xy;
    vec2 off;
    if (iSrs.z > 0.0) {
      vec2 d = (modelViewMatrix * vec4(iVel, 0.0)).xy;
      float l = length(d);
      vec2 ax = l > 1e-4 ? d / l : vec2(0.0, 1.0);
      off = vec2(-ax.y, ax.x) * c.x * iSrs.x + ax * c.y * (iSrs.x + l * iSrs.z);
    } else {
      float s = sin(iSrs.y), k = cos(iSrs.y);
      off = vec2(k * c.x - s * c.y, s * c.x + k * c.y) * iSrs.x;
    }
    mv.xy += off;
    gl_Position = projectionMatrix * mv;
    vUv = (vec2(mod(iSrs.w, 4.0), 3.0 - floor(iSrs.w / 4.0)) + uv) * 0.25;
    vCol = iCol;
    vAge = iAge;
  }`;
const P_FRAG = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec4 vCol;
  varying vec2 vAge;
  void main() {
    vec4 t = texture2D(map, vUv);
    float a = t.a;
    if (vAge.y > 0.0) { float e = vAge.x * 0.9 - 0.15; a = smoothstep(e, e + 0.22, a) * a; } // eroding away
    gl_FragColor = vec4(vCol.rgb * t.rgb, vCol.a * a);
  }`;

class Particles {
  readonly mesh: THREE.Mesh;
  private readonly max: number;
  private pos: Float32Array; private vel: Float32Array; private srs: Float32Array; private col: Float32Array; private ages: Float32Array;
  private age: Float32Array; private life: Float32Array; private size0: Float32Array; private grow: Float32Array;
  private grav: Float32Array; private drag: Float32Array; private spin: Float32Array; private rgb: Float32Array;
  private alpha: Float32Array; private fadeIn: Float32Array;
  private attrs: THREE.InstancedBufferAttribute[];
  private next = 0;
  private alive = 0;
  private c = new THREE.Color();

  constructor(max: number, map: THREE.Texture, blending: THREE.Blending) {
    this.max = max;
    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    g.setAttribute('uv', quad.getAttribute('uv'));
    const attr = (name: string, n: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      return a;
    };
    this.attrs = [attr('iPos', 3), attr('iVel', 3), attr('iSrs', 4), attr('iCol', 4), attr('iAge', 2)];
    [this.pos, this.vel, this.srs, this.col, this.ages] = this.attrs.map((a) => a.array as Float32Array);
    g.instanceCount = max;
    this.age = new Float32Array(max); this.life = new Float32Array(max); this.size0 = new Float32Array(max); this.grow = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.spin = new Float32Array(max); this.rgb = new Float32Array(max * 6);
    this.alpha = new Float32Array(max); this.fadeIn = new Float32Array(max);
    const m = new THREE.ShaderMaterial({ vertexShader: P_VERT, fragmentShader: P_FRAG, uniforms: { map: { value: map } }, transparent: true, depthWrite: false, blending });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
  }

  spawn(s: Style, x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    const i = this.next;
    this.next = (i + 1) % this.max; // ponytail: the oldest particle is overwritten when the pool is full
    if (!this.life[i]) this.alive++;
    const j = i * 3, k = i * 4, h = i * 6;
    this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z;
    this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
    const hdr = s.hdr ?? 1;
    this.c.setHex(s.color).multiplyScalar(hdr);
    this.rgb[h] = this.c.r; this.rgb[h + 1] = this.c.g; this.rgb[h + 2] = this.c.b;
    if (s.color2 !== undefined) this.c.setHex(s.color2).multiplyScalar(hdr);
    this.rgb[h + 3] = this.c.r; this.rgb[h + 4] = this.c.g; this.rgb[h + 5] = this.c.b;
    this.alpha[i] = s.alpha ?? 1;
    this.age[i] = 0;
    this.life[i] = pick(s.life);
    this.size0[i] = pick(s.size);
    this.grow[i] = s.grow ?? 1;
    this.grav[i] = s.grav ?? 0;
    this.drag[i] = s.drag ?? 0;
    this.spin[i] = s.spin === undefined ? 0 : pick(s.spin) * (Math.random() < 0.5 ? -1 : 1);
    this.fadeIn[i] = s.fadeIn ?? 0.12;
    this.srs[k] = 0; this.srs[k + 1] = s.upright ? 0 : Math.random() * Math.PI * 2; this.srs[k + 2] = s.stretch ?? 0; this.srs[k + 3] = s.tex ?? T.glow;
    this.ages[i * 2] = 0; this.ages[i * 2 + 1] = s.erode ? 1 : 0;
  }

  update(dt: number): void {
    this.mesh.visible = this.alive > 0;
    if (!this.alive) return;
    for (let i = 0; i < this.max; i++) {
      if (!this.life[i]) continue;
      const t = (this.age[i] += dt) / this.life[i], k = i * 4;
      if (t >= 1) { this.life[i] = 0; this.srs[k] = 0; this.col[k + 3] = 0; this.alive--; continue; }
      const f = Math.exp(-this.drag[i] * dt), j = i * 3, h = i * 6;
      this.vel[j + 1] -= this.grav[i] * dt;
      for (let a = 0; a < 3; a++) { this.vel[j + a] *= f; this.pos[j + a] += this.vel[j + a] * dt; }
      const fi = this.fadeIn[i], fade = t < fi ? t / fi : 1 - (t - fi) / (1 - fi);
      this.col[k] = this.rgb[h] + (this.rgb[h + 3] - this.rgb[h]) * t;
      this.col[k + 1] = this.rgb[h + 1] + (this.rgb[h + 4] - this.rgb[h + 1]) * t;
      this.col[k + 2] = this.rgb[h + 2] + (this.rgb[h + 5] - this.rgb[h + 2]) * t;
      this.col[k + 3] = fade * this.alpha[i];
      this.srs[k] = this.size0[i] * (1 + (this.grow[i] - 1) * t);
      this.srs[k + 1] += this.spin[i] * dt;
      this.ages[i * 2] = t;
    }
    for (const a of this.attrs) a.needsUpdate = true;
  }
}

// --- ribbons -----------------------------------------------------------------------------------

const R_SLOTS = 32, R_PTS = 24, R_SUB = 3, R_RP = (R_PTS - 1) * R_SUB + 1;
const R_VERT = /* glsl */ `
  attribute vec4 rgba;
  attribute float side;
  varying vec4 vCol;
  varying float vSide;
  void main() { vCol = rgba; vSide = side; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const R_FRAG = /* glsl */ `
  varying vec4 vCol;
  varying float vSide;
  void main() {
    float a = vSide > 1.5 ? pow(clamp(vSide - 2.0, 0.0, 1.0), 1.2) : max(1.0 - vSide * vSide, 0.0); // weapon trails: bright at the tip; trails: soft edges
    gl_FragColor = vec4(vCol.rgb, vCol.a * a);
  }`;

/** How a trail looks: its colour from head to tail, width and how long a point lives. */
export interface RibbonStyle { color: number; color2?: number; hdr?: number; alpha?: number; width: number; life: number }

/**
 * Trails, pooled: a slot is opened with a style, fed a point (or, for a weapon trail, two edges)
 * every frame, and closed; its points age out after `life` s. Smoothed with Catmull-Rom.
 */
class Ribbons {
  readonly mesh: THREE.Mesh;
  private a = new Float32Array(R_SLOTS * R_PTS * 3); // points (or first edge)
  private b = new Float32Array(R_SLOTS * R_PTS * 3); // second edge (weapon trails)
  private tm = new Float32Array(R_SLOTS * R_PTS);
  private head = new Int32Array(R_SLOTS);
  private count = new Int32Array(R_SLOTS);
  private open = new Uint8Array(R_SLOTS);
  private used = new Uint8Array(R_SLOTS);
  private edge = new Uint8Array(R_SLOTS);
  private style: RibbonStyle[] = [];
  private c0 = new Float32Array(R_SLOTS * 3);
  private c1 = new Float32Array(R_SLOTS * 3);
  private pos: THREE.BufferAttribute;
  private rgba: THREE.BufferAttribute;
  private side: THREE.BufferAttribute;
  private now = 0;
  private c = new THREE.Color();
  private v = new THREE.Vector3();
  private w = new THREE.Vector3();
  private q = new Float32Array(6); // interpolated point and edge
  private dirty = false;

  constructor() {
    const g = new THREE.BufferGeometry(), n = R_SLOTS * R_RP * 2;
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.rgba = new THREE.BufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.side = new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('rgba', this.rgba);
    g.setAttribute('side', this.side);
    const idx: number[] = [];
    for (let s = 0; s < R_SLOTS; s++) for (let i = 0; i < R_RP - 1; i++) {
      const o = (s * R_RP + i) * 2;
      idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: R_VERT, fragmentShader: R_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    for (let s = 0; s < R_SLOTS; s++) this.style.push({ color: 0, width: 0, life: 1 });
  }

  /** A new trail; returns its slot, or -1 when every slot is busy. `edge`: fed two points per sample. */
  begin(st: RibbonStyle, edge = false): number {
    const s = this.used.indexOf(0);
    if (s < 0) return -1;
    this.used[s] = this.open[s] = 1;
    this.edge[s] = edge ? 1 : 0;
    this.head[s] = this.count[s] = 0;
    this.style[s] = st;
    const hdr = st.hdr ?? 1;
    this.c.setHex(st.color).multiplyScalar(hdr).toArray(this.c0, s * 3);
    this.c.setHex(st.color2 ?? st.color).multiplyScalar(hdr).toArray(this.c1, s * 3);
    return s;
  }

  push(s: number, x: number, y: number, z: number, bx = 0, by = 0, bz = 0): void {
    if (s < 0 || !this.open[s]) return;
    const i = s * R_PTS + this.head[s];
    this.a[i * 3] = x; this.a[i * 3 + 1] = y; this.a[i * 3 + 2] = z;
    this.b[i * 3] = bx; this.b[i * 3 + 1] = by; this.b[i * 3 + 2] = bz;
    this.tm[i] = this.now;
    this.head[s] = (this.head[s] + 1) % R_PTS;
    this.count[s] = Math.min(R_PTS, this.count[s] + 1);
  }

  /** Stop feeding the trail; it fades out and frees its slot. */
  end(s: number): void {
    if (s >= 0) this.open[s] = 0;
  }

  update(dt: number, eye: THREE.Vector3): void {
    this.now += dt;
    let any = false;
    for (let s = 0; s < R_SLOTS; s++) {
      if (!this.used[s]) continue;
      const st = this.style[s];
      while (this.count[s] > 0 && this.now - this.tm[s * R_PTS + (this.head[s] - this.count[s] + R_PTS) % R_PTS] > st.life) this.count[s]--;
      if (!this.count[s] && !this.open[s]) { this.used[s] = 0; this.clear(s); continue; }
      any = true;
      this.build(s, eye);
    }
    if (any || this.dirty) {
      this.pos.needsUpdate = this.rgba.needsUpdate = this.side.needsUpdate = true;
      this.dirty = any;
    }
    this.mesh.visible = any;
  }

  private clear(s: number): void {
    const o = s * R_RP * 2;
    (this.rgba.array as Float32Array).fill(0, o * 4, (o + R_RP * 2) * 4);
    (this.pos.array as Float32Array).fill(0, o * 3, (o + R_RP * 2) * 3);
    this.dirty = true;
  }

  /** Index of point `k` (0 = oldest, clamped) of slot `s`. */
  private at(s: number, k: number): number {
    const n = this.count[s], kk = Math.max(0, Math.min(n - 1, k));
    return s * R_PTS + (this.head[s] - n + kk + R_PTS * 2) % R_PTS;
  }

  private build(s: number, eye: THREE.Vector3): void {
    const n = this.count[s], st = this.style[s], edge = this.edge[s] === 1, o = s * R_RP * 2;
    const P = this.pos.array as Float32Array, C = this.rgba.array as Float32Array, S = this.side.array as Float32Array;
    const total = n > 1 ? (n - 1) * R_SUB + 1 : 0;
    for (let r = 0; r < R_RP; r++) {
      const vi = o + r * 2;
      if (r >= total) { // unused: collapse onto the last written vertex
        for (let e = 0; e < 2; e++) { C[(vi + e) * 4 + 3] = 0; P.copyWithin((vi + e) * 3, Math.max(o, vi - 1) * 3, Math.max(o, vi - 1) * 3 + 3); }
        continue;
      }
      const seg = Math.min(n - 2, Math.floor(r / R_SUB)), f = r / R_SUB - seg;
      const i0 = this.at(s, seg - 1), i1 = this.at(s, seg), i2 = this.at(s, seg + 1), i3 = this.at(s, seg + 2);
      for (let e = 0; e < (edge ? 2 : 1); e++) {
        const A = e ? this.b : this.a;
        for (let c = 0; c < 3; c++) {
          const p0 = A[i0 * 3 + c], p1 = A[i1 * 3 + c], p2 = A[i2 * 3 + c], p3 = A[i3 * 3 + c];
          this.q[e * 3 + c] = 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
        }
      }
      const tAge = this.now - (this.tm[i1] + (this.tm[i2] - this.tm[i1]) * f), u = Math.min(1, tAge / st.life); // 0 head .. 1 tail
      const alpha = (st.alpha ?? 1) * (1 - u) * (1 - u) * Math.min(1, r / 2);
      if (edge) {
        P[vi * 3] = this.q[0]; P[vi * 3 + 1] = this.q[1]; P[vi * 3 + 2] = this.q[2];
        P[vi * 3 + 3] = this.q[3]; P[vi * 3 + 4] = this.q[4]; P[vi * 3 + 5] = this.q[5];
        S[vi] = 2; S[vi + 1] = 3;
      } else {
        // camera-facing: across the trail's direction and the line of sight
        this.v.set(this.a[i2 * 3] - this.a[i1 * 3], this.a[i2 * 3 + 1] - this.a[i1 * 3 + 1], this.a[i2 * 3 + 2] - this.a[i1 * 3 + 2]);
        this.w.set(eye.x - this.q[0], eye.y - this.q[1], eye.z - this.q[2]);
        this.v.cross(this.w);
        const l = this.v.length(), half = st.width * 0.5 * (1 - u * 0.7) / (l > 1e-6 ? l : 1);
        if (l <= 1e-6) this.v.set(0, 1, 0);
        P[vi * 3] = this.q[0] - this.v.x * half; P[vi * 3 + 1] = this.q[1] - this.v.y * half; P[vi * 3 + 2] = this.q[2] - this.v.z * half;
        P[vi * 3 + 3] = this.q[0] + this.v.x * half; P[vi * 3 + 4] = this.q[1] + this.v.y * half; P[vi * 3 + 5] = this.q[2] + this.v.z * half;
        S[vi] = -1; S[vi + 1] = 1;
      }
      for (let e = 0; e < 2; e++) {
        const ci = (vi + e) * 4;
        for (let c = 0; c < 3; c++) C[ci + c] = this.c0[s * 3 + c] + (this.c1[s * 3 + c] - this.c0[s * 3 + c]) * u;
        C[ci + 3] = alpha;
      }
    }
  }
}

// --- decals ------------------------------------------------------------------------------------

const D_VERT = /* glsl */ `
  attribute vec4 iPos; // x, y, z, size
  attribute vec4 iCol;
  attribute vec3 iMisc; // rotation, tile, fill
  varying vec2 vUv;
  varying vec2 vLocal;
  varying vec4 vCol;
  varying float vFill;
  void main() {
    float s = sin(iMisc.x), k = cos(iMisc.x);
    vec2 p = position.xz;
    vLocal = p;
    p = vec2(k * p.x - s * p.y, s * p.x + k * p.y) * iPos.w;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(iPos.x + p.x, iPos.y, iPos.z + p.y, 1.0);
    vUv = (vec2(mod(iMisc.y, 4.0), 3.0 - floor(iMisc.y / 4.0)) + uv) * 0.25;
    vCol = iCol;
    vFill = iMisc.z;
  }`;
const D_FRAG = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec2 vLocal;
  varying vec4 vCol;
  varying float vFill;
  void main() {
    float a = texture2D(map, vUv).a;
    if (vFill < 1.0) { // a telegraph: the area so far, and a bright front where it is filling
      float r = length(vLocal) * 2.0;
      a = max(a, step(r, vFill) * 0.35 + smoothstep(0.05, 0.0, abs(r - vFill)) * 1.2);
    }
    gl_FragColor = vec4(vCol.rgb, vCol.a * a);
  }`;

/** A decal record: fire-and-forget ones age out, held ones are placed by their owner every frame. */
export interface Decal {
  on: boolean; held: boolean;
  x: number; y: number; z: number; size: number; rot: number; alpha: number; fill: number;
  color: THREE.Color; // held decals: set freely (hdr included)
  age: number; style: DecalStyle; c0: THREE.Color; c1: THREE.Color;
}

class Decals {
  readonly mesh: THREE.Mesh;
  private all: Decal[] = [];
  private iPos: THREE.InstancedBufferAttribute;
  private iCol: THREE.InstancedBufferAttribute;
  private iMisc: THREE.InstancedBufferAttribute;
  private next = 0;

  constructor(max: number, map: THREE.Texture, blending: THREE.Blending) {
    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    g.setAttribute('uv', quad.getAttribute('uv'));
    const attr = (name: string, n: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      return a;
    };
    this.iPos = attr('iPos', 4); this.iCol = attr('iCol', 4); this.iMisc = attr('iMisc', 3);
    g.instanceCount = max;
    for (let i = 0; i < max; i++) this.all.push({ on: false, held: false, x: 0, y: 0, z: 0, size: 1, rot: 0, alpha: 0, fill: 1, color: new THREE.Color(), age: 0, style: { life: 1, size: 1, tile: 0, color: 0 }, c0: new THREE.Color(), c1: new THREE.Color() });
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      vertexShader: D_VERT, fragmentShader: D_FRAG, uniforms: { map: { value: map } }, transparent: true, depthWrite: false, blending,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  private take(): Decal {
    for (let n = 0; n < this.all.length; n++) {
      const d = this.all[(this.next + n) % this.all.length];
      if (!d.held && !d.on) { this.next = (this.next + n + 1) % this.all.length; return d; }
    }
    const d = this.all.find((e) => !e.held)!; // ponytail: pool full, the first loose decal is reused
    return d;
  }

  spawn(s: DecalStyle, x: number, y: number, z: number, rot = Math.random() * Math.PI * 2): Decal {
    const d = this.take();
    Object.assign(d, { on: true, x, y, z, rot, age: 0, style: s, fill: 1, size: s.size });
    const hdr = s.hdr ?? 1;
    d.c0.setHex(s.color).multiplyScalar(hdr);
    d.c1.setHex(s.color2 ?? s.color).multiplyScalar(hdr);
    return d;
  }

  /** A decal its owner places and colours every frame (`on`, position, size, alpha, fill). */
  hold(s: DecalStyle): Decal {
    const d = this.take();
    Object.assign(d, { held: true, on: false, style: s, size: s.size, alpha: 0, fill: 1 });
    d.color.setHex(s.color).multiplyScalar(s.hdr ?? 1);
    return d;
  }

  update(dt: number): void {
    const P = this.iPos.array as Float32Array, C = this.iCol.array as Float32Array, M = this.iMisc.array as Float32Array;
    let any = false;
    for (let i = 0; i < this.all.length; i++) {
      const d = this.all[i];
      if (d.on && !d.held) {
        const s = d.style, t = (d.age += dt) / s.life;
        if (t >= 1) d.on = false;
        else {
          const fo = s.fadeOut ?? 0.5;
          d.alpha = (s.alpha ?? 1) * Math.min(1, d.age / (s.fadeIn ?? 0.04)) * (t > 1 - fo ? (1 - t) / fo : 1);
          d.size = s.size * (1 + ((s.grow ?? 1) - 1) * (1 - (1 - t) * (1 - t))); // eases out
          d.rot += (s.spin ?? 0) * dt;
          d.color.copy(d.c0).lerp(d.c1, t);
        }
      }
      const on = d.on && d.alpha > 0.002;
      any ||= on;
      P[i * 4] = d.x; P[i * 4 + 1] = d.y; P[i * 4 + 2] = d.z; P[i * 4 + 3] = on ? d.size : 0;
      C[i * 4] = d.color.r; C[i * 4 + 1] = d.color.g; C[i * 4 + 2] = d.color.b; C[i * 4 + 3] = d.alpha;
      M[i * 3] = d.rot; M[i * 3 + 1] = d.style.tile; M[i * 3 + 2] = d.fill;
    }
    this.iPos.needsUpdate = this.iCol.needsUpdate = this.iMisc.needsUpdate = true;
    this.mesh.visible = any;
  }
}

// --- bone spikes -------------------------------------------------------------------------------

const SPIKES = 32;

/** A jagged bone spike 1 m tall, base on y = 0, a little bent. */
function spikeGeometry(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(0.16, 1, 7, 4).translate(0, 0.5, 0);
  const p = g.getAttribute('position');
  seed = 77;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), k = 1 + (rand() - 0.5) * 0.5;
    p.setXYZ(i, p.getX(i) * k + y * y * 0.12, y, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

class Spikes {
  readonly mesh: THREE.InstancedMesh;
  private t = new Float32Array(SPIKES).fill(-1);
  private delay = new Float32Array(SPIKES);
  private life = new Float32Array(SPIKES);
  private h = new Float32Array(SPIKES);
  private base: THREE.Vector3[] = [];
  private tilt: THREE.Quaternion[] = [];
  private next = 0;
  private m = new THREE.Matrix4();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private live = 0;
  private e = new THREE.Euler();

  constructor() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xe0d6be, roughness: 0.7, emissive: 0x4a1a80, emissiveIntensity: 1 });
    this.mesh = new THREE.InstancedMesh(spikeGeometry(), mat, SPIKES);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < SPIKES; i++) { this.mesh.setMatrixAt(i, this.m); this.base.push(new THREE.Vector3()); this.tilt.push(new THREE.Quaternion()); }
    this.mesh.visible = false;
  }

  /** A spike `h` m tall bursting out of the floor at (x,y,z) after `delay` s, leaning `lean` rad toward the floor direction (cos dir, sin dir), gone after `life` s. */
  spawn(x: number, y: number, z: number, h: number, lean: number, dir: number, delay = 0, life = 0.9): void {
    const i = this.next;
    this.next = (i + 1) % SPIKES;
    if (this.t[i] < 0) this.live++;
    this.t[i] = 0; this.delay[i] = delay; this.life[i] = life; this.h[i] = h;
    this.base[i].set(x, y, z);
    this.tilt[i].setFromEuler(this.e.set(Math.sin(dir) * lean, Math.random() * Math.PI * 2, -Math.cos(dir) * lean, 'XZY')); // spun, then leant toward (cos dir, sin dir)
  }

  update(dt: number): void {
    this.mesh.visible = this.live > 0;
    if (!this.live) return;
    for (let i = 0; i < SPIKES; i++) {
      if (this.t[i] < 0) continue;
      const t = (this.t[i] += dt) - this.delay[i], L = this.life[i];
      if (t >= L) { this.t[i] = -1; this.live--; this.m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, this.m); continue; }
      // shoots up with an overshoot, holds, then sinks back into the floor
      const up = t < 0 ? 0 : t < 0.08 ? t / 0.08 * 1.15 : t < 0.16 ? 1.15 - (t - 0.08) / 0.08 * 0.15 : 1;
      const down = t > L - 0.35 ? (L - t) / 0.35 : 1;
      const k = Math.max(0, up) * down, w = 0.6 + 0.4 * k;
      this.p.copy(this.base[i]).y -= (1 - down) * this.h[i] * 0.4;
      this.m.compose(this.p, this.tilt[i], this.s.set(w * this.h[i] * 0.55, Math.max(1e-3, k * this.h[i]), w * this.h[i] * 0.55));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const hitFlare: Style = { life: 0.14, size: 0.9, grow: 0.5, color: 0xfff2dc, hdr: 2.6, tex: T.star, fadeIn: 0.05 };
const hitFlareBig: Style = { ...hitFlare, life: 0.2, size: 1.6 };
const hitSpark: Style = { life: [0.15, 0.3], size: 0.045, color: 0xfff0d0, color2: 0xff9a40, hdr: 4, tex: T.spark, stretch: 0.04, drag: 5, grav: 6 };

// --- facade ------------------------------------------------------------------------------------

/** A soft additive sprite from the particle atlas (orbs, halos, crystal glows). */
function sprite(map: THREE.Texture, tile: number, color: number, hdr: number, size: number): THREE.Sprite {
  const t = map.clone(); // shares the image and its upload, own window into the atlas
  t.repeat.set(0.25, 0.25);
  t.offset.set((tile % 4) * 0.25, (3 - Math.floor(tile / 4)) * 0.25);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color: new THREE.Color(color).multiplyScalar(hdr), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: true }));
  s.scale.setScalar(size);
  s.renderOrder = 3;
  return s;
}

export class Vfx {
  readonly root = new THREE.Group();
  /** The one light abilities may use (Fuoco fatuo, flashes). Intensity 0 when idle. */
  readonly light = new THREE.PointLight(0x66ffcc, 0, 16, 1.6);
  readonly map: THREE.Texture;
  /** Every texture the effects draw with, to upload ahead of the first spell (main.ts). */
  readonly textures: THREE.Texture[];
  private glow: Particles;
  private smoke: Particles;
  readonly ribbons = new Ribbons();
  private floorGlow: Decals;
  private floorDark: Decals;
  private spikes = new Spikes();
  /** Sentenza del sepolcro's beam. */
  readonly column: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private flash = 0;
  private flashColor = new THREE.Color();
  private trauma = 0;
  private time = 0;
  private eye = new THREE.Vector3();
  private priming = 0; // frames left drawing every effect at nothing (prime)
  private sprites: THREE.Sprite[] = [];
  /** Where the light rests between flashes (the wisp), when `on`. */
  readonly idle = { on: false, x: 0, y: 0, z: 0, color: 0, power: 0 };

  constructor() {
    this.map = particleAtlas();
    const dmap = decalAtlas();
    this.glow = new Particles(2560, this.map, THREE.AdditiveBlending);
    this.smoke = new Particles(1024, this.map, THREE.NormalBlending);
    this.floorGlow = new Decals(72, dmap, THREE.AdditiveBlending); // the casters hold 18 for their telegraphs
    this.floorDark = new Decals(24, dmap, THREE.NormalBlending);
    const beam = document.createElement('canvas');
    beam.width = 4; beam.height = 128;
    const g = beam.getContext('2d')!, r = g.createLinearGradient(0, 128, 0, 0);
    r.addColorStop(0, '#fff'); r.addColorStop(0.3, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 4, 128);
    this.column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.8, 14, 24, 1, true).translate(0, 7, 0),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(beam), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
    );
    this.column.visible = false;
    this.textures = [this.map, dmap, this.column.material.map!];
    // The smoke draws first so the glows sit on top of it.
    this.smoke.mesh.renderOrder = 1;
    // A PointLight at intensity 0 still counts in the shader: added once here, only dimmed later.
    this.root.add(this.floorDark.mesh, this.floorGlow.mesh, this.smoke.mesh, this.glow.mesh, this.ribbons.mesh, this.spikes.mesh, this.column, this.light);
  }

  /** One particle of style `s` at (x,y,z) moving at (vx,vy,vz). */
  spawn(s: Style, x: number, y: number, z: number, vx = 0, vy = 0, vz = 0): void {
    (s.dark ? this.smoke : this.glow).spawn(s, x, y, z, vx, vy, vz);
  }

  /** `n` particles in a ball of radius `r` around (x,y,z), flying outwards at `speed` (plus `up`). */
  burst(s: Style, x: number, y: number, z: number, n: number, r: number, speed: number, up = 0): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, q = Math.sqrt(1 - u * u);
      const dx = Math.cos(a) * q, dy = u, dz = Math.sin(a) * q, k = Math.random(), sp = speed * (0.5 + Math.random() * 0.5);
      this.spawn(s, x + dx * r * k, y + dy * r * k, z + dz * r * k, dx * sp, dy * sp + up, dz * sp);
    }
  }

  /** `n` particles on a flat ring of radius `r`, flying out along the floor at `speed` (plus `up`). */
  ring(s: Style, x: number, y: number, z: number, n: number, r: number, speed: number, up = 0): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2, c = Math.cos(a), d = Math.sin(a), sp = speed * (0.75 + Math.random() * 0.5);
      this.spawn(s, x + c * r, y, z + d * r, c * sp, up * (0.6 + Math.random() * 0.8), d * sp);
    }
  }

  /** How many particles to emit this frame for `rate` per second on average. */
  count(rate: number, dt: number): number {
    return Math.floor(rate * dt + Math.random());
  }

  decal(s: DecalStyle, x: number, y: number, z: number, rot?: number): Decal {
    return (s.dark ? this.floorDark : this.floorGlow).spawn(s, x, y, z, rot);
  }

  hold(s: DecalStyle): Decal {
    return (s.dark ? this.floorDark : this.floorGlow).hold(s);
  }

  /** Bone spike (see Spikes.spawn). */
  spike(x: number, y: number, z: number, h: number, lean: number, dir: number, delay = 0, life = 0.9): void {
    this.spikes.spawn(x, y, z, h, lean, dir, delay, life);
  }

  sprite(tile: number, color: number, hdr: number, size: number): THREE.Sprite {
    const s = sprite(this.map, tile, color, hdr, size);
    this.sprites.push(s);
    return s;
  }

  /**
   * Draw every effect once, at nothing, for a couple of frames: the GPU driver builds a pipeline
   * per program, blending and target on its first real draw, a hitch compiling alone doesn't
   * prevent (main.ts, with fx.warm, at load and on a style or quality change).
   */
  prime(): void {
    this.priming = 2;
  }

  /** A blow landing on someone at (x,y,z): a white-hot flash and splinters; `big` for heavy hits. */
  impact(x: number, y: number, z: number, big: boolean): void {
    this.spawn(big ? hitFlareBig : hitFlare, x, y, z);
    this.burst(hitSpark, x, y, z, big ? 14 : 7, 0.15, big ? 6 : 4.5);
  }

  /** Short light pulse at a point; a stronger pulse takes the light over from a weaker one. */
  pulse(x: number, y: number, z: number, color: number, power = 30): void {
    if (power < this.flash) return;
    this.flash = power;
    this.flashColor.setHex(color);
    this.light.position.set(x, y, z);
  }

  /** Camera shake: `k` 0..1 of trauma, added up and decaying. */
  shake(k: number): void {
    this.trauma = Math.min(1, this.trauma + k);
  }

  /** After the camera controllers placed the camera: offset it by the shake. Also where trails face. */
  applyShake(camera: THREE.Camera, dt: number): void {
    this.eye.copy(camera.position);
    if (this.trauma <= 0) return;
    const s = this.trauma * this.trauma * 0.28, t = this.time * 31;
    camera.position.x += s * (Math.sin(t) * 0.6 + Math.sin(t * 2.3 + 1) * 0.4);
    camera.position.y += s * (Math.sin(t * 1.7 + 2) * 0.6 + Math.sin(t * 3.1) * 0.4);
    camera.position.z += s * (Math.sin(t * 1.3 + 4) * 0.6 + Math.sin(t * 2.7 + 3) * 0.4);
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
  }

  update(dt: number): void {
    this.time += dt;
    this.glow.update(dt);
    this.smoke.update(dt);
    this.ribbons.update(dt, this.eye);
    this.floorGlow.update(dt);
    this.floorDark.update(dt);
    this.spikes.update(dt);
    if (this.priming > 0) {
      this.priming--;
      for (const m of [this.glow.mesh, this.smoke.mesh, this.ribbons.mesh, this.floorGlow.mesh, this.floorDark.mesh, this.spikes.mesh]) m.visible = true; // empty: nothing shows
      for (const o of [this.column, ...this.sprites]) if (!o.visible) { o.visible = true; o.scale.setScalar(0); o.userData.primed = true; }
    } else {
      for (const o of [this.column, ...this.sprites]) if (o.userData.primed) { o.visible = o.userData.primed = false; }
    }
    this.flash *= Math.exp(-dt * 7);
    const w = this.idle;
    if (this.flash > 0.5 && (!w.on || this.flash > w.power)) {
      this.light.color.copy(this.flashColor);
      this.light.intensity = this.flash;
    } else if (w.on) {
      this.light.color.setHex(w.color);
      this.light.position.set(w.x, w.y, w.z);
      this.light.intensity = w.power;
      this.flash = 0;
    } else this.light.intensity = 0;
  }
}
