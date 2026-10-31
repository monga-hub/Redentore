import * as THREE from 'three';
import { T, type Style, type Vfx } from '../abilities/vfx.ts';
import type { Mob } from '../ui/target.ts';

// Impacts and "Stile Diablo" flourishes, all visual: it only watches the enemies' health and state,
// so combat itself is untouched. In both views hits spray blood away from the hero, with a red mist,
// heavy blows give the lens a light kick, the floor takes splashes that dry away and every body
// leaves a pool that spreads out under it over a couple of seconds (one instanced draw, pooled and
// capped). In the Diablo view only: damage numbers pop over whoever is hit (damage over time is
// summed into a number every half second, big blows come out large and orange), and a fallen enemy
// goes up in a beam of light like a legendary drop. The quest chest wears the same beam until opened.

const POOLS = 12, SPLASHES = 44, DECALS = POOLS + SPLASHES; // pools under the dead, splashes from hits: the oldest give way
const DRY = 24, POOL_DRY = 32; // s each one lasts
const SPREAD = 2.4, SPREAD_AFTER = 0.35; // s a pool takes to spread out, s after the fall it starts
const BEAMS = 6, BEAM_LIFE = 3.2;
const NUMBERS = 28, NUMBER_LIFE = 0.95;
const TICK = 0.45; // s: damage over time is shown this often
const BIG = 25; // a single blow this strong is a "critical" number
const GORE = 0x6e0a07, LOOT = 0xff7a12;
const gore: Style = { life: [0.45, 0.8], size: [0.06, 0.12], color: GORE, alpha: 0.95, tex: T.drop, dark: true, grav: 11, drag: 1.5, stretch: 0.025 };
const mist: Style = { life: [0.35, 0.5], size: [0.35, 0.5], grow: 2.2, color: 0x5a0605, alpha: 0.55, tex: T.smoke2, erode: true, dark: true, drag: 4, fadeIn: 0.05 };
const loot: Style = { life: 1.4, size: 0.08, color: LOOT, hdr: 3, tex: T.spark, stretch: 0.02, drag: 1.2 };

/** Watched enemies: the brains (enemies/brain.ts, caster.ts) and their model height. */
export interface Watched { all: readonly Mob[]; height: number }

interface Track { mob: Mob; height: number; hp: number; acc: number; t: number; dead: boolean }
interface Float { el: HTMLElement; x: number; y: number; z: number; t: number }
interface Beam { mesh: THREE.Mesh; disc: THREE.Mesh; t: number }

// Splats painted once: a 2×2 atlas of irregular drops and smears, white on black (the shader tints).
function splats(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 4; k++) {
    const ox = (k % 2) * 128 + 64, oy = Math.floor(k / 2) * 128 + 64;
    g.fillStyle = '#fff';
    const blob = (x: number, y: number, r: number) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
    blob(ox, oy, 22 + rnd() * 10);
    for (let i = 0; i < 14; i++) { // lobes
      const a = rnd() * Math.PI * 2, d = 12 + rnd() * 24;
      blob(ox + Math.cos(a) * d, oy + Math.sin(a) * d, 6 + rnd() * 12);
    }
    for (let i = 0; i < 9; i++) { // streaks thrown out of it, thinning to a point
      const a = rnd() * Math.PI * 2, d = 20 + rnd() * 28, w = 3 + rnd() * 4, c = Math.cos(a), s = Math.sin(a);
      g.beginPath();
      g.moveTo(ox + c * 10 - s * w, oy + s * 10 + c * w);
      g.lineTo(ox + c * (10 + d), oy + s * (10 + d));
      g.lineTo(ox + c * 10 + s * w, oy + s * 10 - c * w);
      g.fill();
      blob(ox + c * (12 + d), oy + s * (12 + d), 1.5 + rnd() * 2.5);
    }
    for (let i = 0; i < 18; i++) { // flung drops
      const a = rnd() * Math.PI * 2, d = 34 + rnd() * 26;
      blob(ox + Math.cos(a) * d, oy + Math.sin(a) * d, 1.5 + rnd() * 4);
    }
  }
  // Green: how soon the liquid gets there as a stain spreads, blurred mask plus nearness to the tile's
  // middle, so the body of it runs out first and the flung drops land last (decal shader, aSpread).
  const img = g.getImageData(0, 0, 256, 256), d = img.data, a = new Float32Array(256 * 256), b = new Float32Array(256 * 256);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4] / 255;
  const blur = (from: Float32Array, to: Float32Array, dx: number, dy: number) => { // a box of 15 px, inside each tile
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      let sum = 0, n = 0;
      for (let k = -7; k <= 7; k++) {
        const u = x + k * dx, v = y + k * dy;
        if (u >> 7 !== x >> 7 || v >> 7 !== y >> 7) continue;
        sum += from[v * 256 + u]; n++;
      }
      to[y * 256 + x] = sum / n;
    }
  };
  for (let pass = 0; pass < 2; pass++) { blur(a, b, 1, 0); blur(b, a, 0, 1); }
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const r = Math.hypot((x & 127) - 64, (y & 127) - 64) / 64, i = y * 256 + x;
    d[i * 4 + 1] = Math.round(255 * Math.min(1, Math.max(0, a[i] * 0.55 + (1 - r) * 0.5)));
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// Gradient for the beams: bright at the foot, gone at the top.
export function beamTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d')!, r = g.createLinearGradient(0, 128, 0, 0);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

// Stains: unlit, so dark enough to never glow in the night. Fresh blood is a wet red, brighter where
// it lies deep with a faint sheen, its rim darker; as it dries it goes to a dull maroon. `aState`:
// opacity, how far it has spread (0..1), how wet it still is (0..1).
const decalMaterial = (map: THREE.Texture) => new THREE.ShaderMaterial({
  uniforms: { map: { value: map } },
  vertexShader: /* glsl */ `
    attribute vec3 aState;
    attribute vec2 aTile;
    varying vec2 vUv;
    varying vec3 vState;
    void main() {
      vUv = (uv + aTile) * 0.5;
      vState = aState;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D map;
    varying vec2 vUv;
    varying vec3 vState;
    void main() {
      vec2 m = texture2D(map, vUv).rg;
      float edge = 1.0 - vState.y;
      float a = m.r * smoothstep(edge - 0.02, edge + 0.12, m.g) * vState.x;
      float deep = smoothstep(0.45, 0.85, m.g), wet = vState.z;
      vec3 c = mix(vec3(0.045, 0.005, 0.004), vec3(0.1, 0.006, 0.005), deep);
      c = mix(c, mix(vec3(0.1, 0.006, 0.005), vec3(0.24, 0.012, 0.009), deep), wet);
      c += vec3(0.07, 0.025, 0.02) * wet * smoothstep(0.82, 0.95, m.g); // the sheen on the deep of it
      gl_FragColor = vec4(c, a);
    }`,
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});

export class DiabloFx {
  readonly root = new THREE.Group();
  enabled = false;
  private tracks: Track[];
  private decals: THREE.InstancedMesh;
  private state: THREE.InstancedBufferAttribute;
  private tile: THREE.InstancedBufferAttribute;
  private born = new Float32Array(DECALS).fill(-1e9);
  private nextSplash = 0;
  private nextPool = 0;
  private flourish = new THREE.Group(); // the Diablo view's beams
  private beams: Beam[] = [];
  private chest: Beam;
  private numbers: Float[] = [];
  private layer = document.createElement('div');
  private time = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();

  private readonly vfx: Vfx;
  private readonly camera: THREE.Camera;
  private readonly hero: { x: number; z: number };

  /** `hero`: the hero's feet, live; blood flies away from them. */
  constructor(watched: Watched[], vfx: Vfx, camera: THREE.Camera, chest: { x: number; y: number; z: number }, hero: { x: number; z: number }) {
    this.vfx = vfx;
    this.camera = camera;
    this.hero = hero;
    this.root.name = 'fx:impacts';
    this.flourish.visible = false;
    this.root.add(this.flourish);
    this.tracks = watched.flatMap((w) => w.all.map((mob) => ({ mob, height: w.height, hp: mob.hp, acc: 0, t: 0, dead: mob.state === 'dead' })));

    const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.state = new THREE.InstancedBufferAttribute(new Float32Array(DECALS * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.tile = new THREE.InstancedBufferAttribute(new Float32Array(DECALS * 2), 2);
    plane.setAttribute('aState', this.state);
    plane.setAttribute('aTile', this.tile);
    this.decals = new THREE.InstancedMesh(plane, decalMaterial(splats()), DECALS);
    this.decals.frustumCulled = false; // instances anywhere on the site
    this.decals.renderOrder = 1;
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < DECALS; i++) this.decals.setMatrixAt(i, this.m);
    this.root.add(this.decals);

    const beamGeo = new THREE.CylinderGeometry(0.2, 0.32, 7, 16, 1, true).translate(0, 3.5, 0);
    const discGeo = new THREE.CircleGeometry(1.1, 32).rotateX(-Math.PI / 2);
    const tex = beamTexture(), glow = discTexture();
    const make = (): Beam => {
      const mesh = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ map: tex, color: LOOT, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
      const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ map: glow, color: LOOT, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
      mesh.renderOrder = disc.renderOrder = 2;
      mesh.visible = disc.visible = false;
      this.flourish.add(mesh, disc);
      return { mesh, disc, t: BEAM_LIFE };
    };
    for (let i = 0; i < BEAMS; i++) this.beams.push(make());
    this.chest = make();
    this.chest.mesh.position.set(chest.x, chest.y, chest.z);
    this.chest.disc.position.set(chest.x, chest.y + 0.05, chest.z);

    this.layer.id = 'dmg';
    document.body.append(this.layer);
  }

  /** Per frame, after the enemies moved. `chestShut`: the key is still in the chest. */
  update(dt: number, chestShut: boolean): void {
    this.time += dt;
    for (const k of this.tracks) this.watch(k, dt);

    // Splashes land at once, pools run out under the body; both go dull, then dry away over their last third.
    for (let i = 0; i < DECALS; i++) {
      const pool = i < POOLS, age = this.time - this.born[i] - (pool ? SPREAD_AFTER : 0), life = pool ? POOL_DRY : DRY;
      const spread = age < 0 ? 0 : pool ? 1 - (1 - Math.min(1, age / SPREAD)) ** 2.5 : Math.min(1, 0.4 + age * 8);
      this.state.setXYZ(i, age < 0 ? 0 : THREE.MathUtils.clamp((life - age) / (life / 3), 0, 1) * 0.95, spread, THREE.MathUtils.clamp(1 - age / (life * 0.45), 0, 1));
    }
    this.state.needsUpdate = true;
    this.flourish.visible = this.enabled;
    if (!this.enabled) return;

    for (const b of this.beams) this.beam(b, (b.t += dt) / BEAM_LIFE);
    const c = this.chest;
    c.mesh.visible = c.disc.visible = chestShut;
    if (chestShut) this.beam(c, 0.5 + Math.sin(this.time * 2.2) * 0.04, true);

    this.place();
  }

  private watch(k: Track, dt: number): void {
    const m = k.mob, d = k.hp - m.hp;
    k.hp = m.hp;
    k.t += dt;
    if (d > 0) {
      k.acc += d;
      if (d >= 1) this.hit(m, k.height, d);
    }
    if (k.acc >= 1 && (d >= 4 || k.t >= TICK || m.state === 'dead')) {
      if (this.enabled) this.number(m.x, m.y + k.height + 0.2, m.z, Math.round(k.acc), d >= BIG ? 'big' : d >= 4 ? '' : 'dot');
      k.acc = 0;
      k.t = 0;
    }
    const dead = m.state === 'dead';
    if (dead && !k.dead) this.fall(m, k);
    k.dead = dead;
  }

  /**
   * The blow lands (the flash and sparks are the enemy's own, vfx.impact): blood sprays out of the far side,
   * away from the hero, with a puff of red mist, and splashes the floor beyond; a heavy blow kicks the lens.
   */
  private hit(m: Mob, h: number, d: number): void {
    const y = m.y + h * 0.55, s = Math.min(1, h / 2), heavy = d >= BIG;
    let dx = m.x - this.hero.x, dz = m.z - this.hero.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const n = heavy ? 14 : d >= 8 ? 9 : 4;
    for (let i = 0; i < n; i++) {
      const sp = (1.6 + Math.random() * 2.4) * (heavy ? 1.3 : 1), side = (Math.random() - 0.5) * 1.6;
      this.vfx.spawn(gore, m.x + dx * 0.2 * s, y + (Math.random() - 0.5) * 0.3 * s, m.z + dz * 0.2 * s, (dx - dz * side) * sp, 1 + Math.random() * 2.2, (dz + dx * side) * sp);
    }
    if (d >= 4) this.vfx.spawn(mist, m.x + dx * 0.25 * s, y, m.z + dz * 0.25 * s, dx * 1.2, 0.3, dz * 1.2);
    if (heavy) this.vfx.shake(Math.min(0.12, 0.05 + d / 1500)); // a heavy blow or a crit: a light kick, never a lurch
    if (d >= 8 || Math.random() < 0.25) {
      const k = (0.5 + Math.random() * 0.9) * s;
      this.stain(m.x + dx * k + (Math.random() - 0.5) * 0.4, m.y, m.z + dz * k + (Math.random() - 0.5) * 0.4, (0.45 + Math.min(d, 60) / 70) * Math.max(0.7, s));
    }
  }

  private fall(m: Mob, k: Track): void {
    this.pool(m.x, m.y, m.z, 0.9 + k.height * 0.3);
    if (!this.enabled) return;
    const b = this.beams.reduce((a, c) => (c.t > a.t ? c : a)); // the oldest
    b.t = 0;
    b.mesh.position.set(m.x, m.y, m.z);
    b.disc.position.set(m.x, m.y + 0.05, m.z);
    this.vfx.burst(loot, m.x, m.y + 0.6, m.z, 30, 0.5, 1, 2.2);
  }

  private beam(b: Beam, k: number, steady = false): void {
    const on = k < 1;
    b.mesh.visible = b.disc.visible = on;
    if (!on) return;
    const a = steady ? 1 : Math.min(1, k * 12) * Math.min(1, (1 - k) * 3);
    b.mesh.scale.set(1, steady ? 1 : 0.4 + Math.min(1, k * 6) * 0.6, 1);
    (b.mesh.material as THREE.MeshBasicMaterial).color.setHex(LOOT).multiplyScalar(0.9 * a);
    (b.disc.material as THREE.MeshBasicMaterial).color.setHex(LOOT).multiplyScalar(0.8 * a);
  }

  private stain(x: number, y: number, z: number, size: number): void {
    this.lay(POOLS + this.nextSplash, x, y, z, size);
    this.nextSplash = (this.nextSplash + 1) % SPLASHES;
  }

  /** The pool under a body: its own slots, so a flurry of hits never wipes it. */
  private pool(x: number, y: number, z: number, size: number): void {
    this.lay(this.nextPool, x, y, z, size);
    this.nextPool = (this.nextPool + 1) % POOLS;
  }

  private lay(i: number, x: number, y: number, z: number, size: number): void {
    this.q.setFromAxisAngle(this.v.set(0, 1, 0), Math.random() * Math.PI * 2);
    this.m.compose(this.p.set(x, y + 0.03, z), this.q, this.s.set(size, 1, size));
    this.decals.setMatrixAt(i, this.m);
    this.decals.instanceMatrix.needsUpdate = true;
    const t = Math.floor(Math.random() * 4);
    this.tile.setXY(i, t % 2, Math.floor(t / 2));
    this.tile.needsUpdate = true;
    this.born[i] = this.time;
  }

  private number(x: number, y: number, z: number, n: number, kind: string): void {
    let f = this.numbers.find((u) => this.time - u.t > NUMBER_LIFE);
    if (!f) {
      if (this.numbers.length >= NUMBERS) f = this.numbers.reduce((a, c) => (c.t < a.t ? c : a));
      else {
        f = { el: document.createElement('span'), x: 0, y: 0, z: 0, t: 0 };
        this.layer.append(f.el);
        this.numbers.push(f);
      }
    }
    Object.assign(f, { x: x + (Math.random() - 0.5) * 0.6, y, z, t: this.time });
    f.el.textContent = String(n);
    f.el.className = kind;
    f.el.style.animation = 'none';
    void f.el.offsetWidth; // restart the pop
    f.el.style.animation = '';
  }

  /** Numbers follow their spot in the world as the camera moves, rising as they fade. */
  private place(): void {
    for (const f of this.numbers) {
      const age = this.time - f.t;
      if (age > NUMBER_LIFE) { if (f.el.style.visibility !== 'hidden') f.el.style.visibility = 'hidden'; continue; }
      this.p.set(f.x, f.y + age * 0.9, f.z).project(this.camera);
      const off = this.p.z > 1;
      f.el.style.visibility = off ? 'hidden' : 'visible';
      if (!off) f.el.style.transform = `translate3d(${((this.p.x + 1) / 2) * innerWidth}px, ${((1 - this.p.y) / 2) * innerHeight}px, 0)`;
    }
  }
}

/** Soft round glow, for the beam's footprint. */
export function discTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
