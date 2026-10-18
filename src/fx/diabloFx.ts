import * as THREE from 'three';
import { T, type Style, type Vfx } from '../abilities/vfx.ts';
import type { Mob } from '../ui/target.ts';

// "Stile Diablo" flourishes, all visual: it only watches the enemies' health and state, so
// combat itself is untouched. Damage numbers pop over whoever is hit (damage over time is
// summed into a number every half second, big blows come out large and orange), hits throw
// sparks and gore and leave blood on the floor that dries away, and a fallen enemy goes up in a
// beam of light like a legendary drop. The quest chest wears the same beam until it is opened.

const DECALS = 48, DRY = 24; // blood stains alive at once; s each one lasts
const BEAMS = 6, BEAM_LIFE = 3.2;
const NUMBERS = 28, NUMBER_LIFE = 0.95;
const TICK = 0.45; // s: damage over time is shown this often
const BIG = 25; // a single blow this strong is a "critical" number
const GORE = 0x4a0806, SPARK = 0xffe2c0, LOOT = 0xff7a12;
const spark: Style = { life: 0.3, size: 0.07, color: SPARK, hdr: 3, tex: T.spark, stretch: 0.03, drag: 5 };
const gore: Style = { life: 0.7, size: [0.06, 0.11], color: GORE, alpha: 0.95, tex: T.drop, dark: true, grav: 9, drag: 1 };
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
    for (let i = 0; i < 18; i++) { // flung drops
      const a = rnd() * Math.PI * 2, d = 34 + rnd() * 26;
      blob(ox + Math.cos(a) * d, oy + Math.sin(a) * d, 1.5 + rnd() * 4);
    }
  }
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

// Stains: unlit, so dark enough to never glow in the night; a wet maroon on any floor.
const decalMaterial = (map: THREE.Texture) => new THREE.ShaderMaterial({
  uniforms: { map: { value: map }, tint: { value: new THREE.Color(0.11, 0.006, 0.004) } },
  vertexShader: /* glsl */ `
    attribute float aFade;
    attribute vec2 aTile;
    varying vec2 vUv;
    varying float vFade;
    void main() {
      vUv = (uv + aTile) * 0.5;
      vFade = aFade;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D map;
    uniform vec3 tint;
    varying vec2 vUv;
    varying float vFade;
    void main() {
      gl_FragColor = vec4(tint, texture2D(map, vUv).r * vFade);
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
  private fade: THREE.InstancedBufferAttribute;
  private tile: THREE.InstancedBufferAttribute;
  private born = new Float32Array(DECALS).fill(-1e9);
  private next = 0;
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

  constructor(watched: Watched[], vfx: Vfx, camera: THREE.Camera, chest: { x: number; y: number; z: number }) {
    this.vfx = vfx;
    this.camera = camera;
    this.root.name = 'fx:diablo';
    this.root.visible = false;
    this.tracks = watched.flatMap((w) => w.all.map((mob) => ({ mob, height: w.height, hp: mob.hp, acc: 0, t: 0, dead: mob.state === 'dead' })));

    const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(DECALS), 1).setUsage(THREE.DynamicDrawUsage);
    this.tile = new THREE.InstancedBufferAttribute(new Float32Array(DECALS * 2), 2);
    plane.setAttribute('aFade', this.fade);
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
      this.root.add(mesh, disc);
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
    this.root.visible = this.enabled;
    if (!this.enabled) return;

    // Stains dry away over their last third.
    for (let i = 0; i < DECALS; i++) {
      const age = this.time - this.born[i];
      this.fade.setX(i, age < 0 ? 0 : Math.min(1, age * 6) * THREE.MathUtils.clamp((DRY - age) / (DRY / 3), 0, 1) * 0.92);
    }
    this.fade.needsUpdate = true;

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
      if (this.enabled && d >= 1) this.hit(m, k.height, d);
    }
    if (k.acc >= 1 && (d >= 4 || k.t >= TICK || m.state === 'dead')) {
      if (this.enabled) this.number(m.x, m.y + k.height + 0.2, m.z, Math.round(k.acc), d >= BIG ? 'big' : d >= 4 ? '' : 'dot');
      k.acc = 0;
      k.t = 0;
    }
    const dead = m.state === 'dead';
    if (dead && !k.dead && this.enabled) this.fall(m);
    k.dead = dead;
  }

  private hit(m: Mob, h: number, d: number): void {
    const y = m.y + h * 0.55;
    this.vfx.burst(spark, m.x, y, m.z, 8, 0.25, 3.2); // the white flash of the blow
    this.vfx.burst(gore, m.x, y, m.z, 10, 0.2, 1.8, 1.5);
    if (d >= 8 || Math.random() < 0.25) this.stain(m.x + (Math.random() - 0.5) * 0.8, m.y, m.z + (Math.random() - 0.5) * 0.8, 0.7 + Math.min(d, 50) / 40);
  }

  private fall(m: Mob): void {
    this.stain(m.x, m.y, m.z, 1.7);
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
    const i = this.next;
    this.next = (i + 1) % DECALS;
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
