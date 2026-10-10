import * as THREE from 'three';

// Ability VFX building blocks. One pooled particle cloud (a ring buffer drawn in a single
// draw call) plus a few reusable meshes; nothing is allocated per cast, and the only light
// is created once at startup so the shader light count never changes (see torches.ts).

const MAX = 2048;

export interface Puff {
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  life: number;
  size: number; // metres
  color: number; // hex
  hdr?: number; // colour multiplier, > 1 blooms
  alpha?: number; // peak opacity
  grow?: number; // size multiplier reached at end of life
  grav?: number; // m/s² (negative rises)
  drag?: number; // 1/s
  normal?: boolean; // normal blending (dark smoke) instead of additive glow
}

const VERT = /* glsl */ `
  attribute vec4 tint;
  attribute float size;
  uniform float uScale;
  varying vec4 vTint;
  void main() {
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * uScale / max(-mv.z, 0.1);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */ `
  varying vec4 vTint;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, d);
    gl_FragColor = vec4(vTint.rgb, vTint.a * a * a);
  }`;

class Cloud {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private tint = new Float32Array(MAX * 4);
  private size = new Float32Array(MAX);
  private vel = new Float32Array(MAX * 3);
  private rgb = new Float32Array(MAX * 3);
  private alpha = new Float32Array(MAX);
  private age = new Float32Array(MAX);
  private life = new Float32Array(MAX); // 0 = dead slot
  private size0 = new Float32Array(MAX);
  private grow = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private drag = new Float32Array(MAX);
  private next = 0;
  private alive = 0;
  private c = new THREE.Color();

  constructor(blending: THREE.Blending) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tint', new THREE.BufferAttribute(this.tint, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: { uScale: { value: 500 } },
      transparent: true, depthWrite: false, blending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    // Pixels per metre at 1 m: follows canvas height and fov without any resize wiring.
    const v = new THREE.Vector2();
    this.points.onBeforeRender = (r, _s, cam) => {
      const fov = (cam as THREE.PerspectiveCamera).fov ?? 60;
      m.uniforms.uScale.value = r.getDrawingBufferSize(v).y / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    };
  }

  emit(p: Puff): void {
    const i = this.next;
    this.next = (i + 1) % MAX; // ponytail: oldest particle is overwritten when the pool is full
    if (!this.life[i]) this.alive++;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([p.vx ?? 0, p.vy ?? 0, p.vz ?? 0], i * 3);
    this.c.setHex(p.color).multiplyScalar(p.hdr ?? 1);
    this.rgb.set([this.c.r, this.c.g, this.c.b], i * 3);
    this.alpha[i] = p.alpha ?? 1;
    this.age[i] = 0;
    this.life[i] = p.life;
    this.size0[i] = p.size;
    this.grow[i] = p.grow ?? 1;
    this.grav[i] = p.grav ?? 0;
    this.drag[i] = p.drag ?? 0;
  }

  update(dt: number): void {
    if (!this.alive) return;
    for (let i = 0; i < MAX; i++) {
      if (!this.life[i]) continue;
      const t = (this.age[i] += dt) / this.life[i];
      if (t >= 1) { this.life[i] = 0; this.size[i] = 0; this.tint[i * 4 + 3] = 0; this.alive--; continue; }
      const k = Math.exp(-this.drag[i] * dt), j = i * 3;
      this.vel[j + 1] -= this.grav[i] * dt;
      for (let a = 0; a < 3; a++) { this.vel[j + a] *= k; this.pos[j + a] += this.vel[j + a] * dt; }
      const fade = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      this.tint.set([this.rgb[j], this.rgb[j + 1], this.rgb[j + 2], fade * this.alpha[i]], i * 4);
      this.size[i] = this.size0[i] * (1 + (this.grow[i] - 1) * t);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.tint.needsUpdate = a.size.needsUpdate = true;
  }
}

/** Flat additive ring/disc on the ground: shock waves, rune circles. */
function groundRing(inner: number, outer: number): THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 64, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
  );
  m.visible = false;
  m.renderOrder = 2;
  return m;
}

export class Vfx {
  readonly root = new THREE.Group();
  private glow = new Cloud(THREE.AdditiveBlending);
  private smoke = new Cloud(THREE.NormalBlending);
  /** The one light abilities may use (Fuoco fatuo, flashes). Intensity 0 when idle. */
  readonly light = new THREE.PointLight(0x66ffcc, 0, 14, 1.6);
  readonly wave = groundRing(0.9, 1); // Lamento della cripta shock wave
  readonly runes = groundRing(0.55, 1.4); // Patto della tomba circle
  readonly column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.9, 14, 24, 1, true).translate(0, 7, 0),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x58ff9a).multiplyScalar(2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
  );
  readonly wisp = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8dffe0).multiplyScalar(4) }),
  );
  private flash = 0;
  private flashColor = new THREE.Color();

  constructor() {
    this.column.visible = this.wisp.visible = false;
    // A PointLight at intensity 0 still counts in the shader: added once here, only dimmed later.
    this.root.add(this.glow.points, this.smoke.points, this.light, this.wave, this.runes, this.column, this.wisp);
    this.runes.material.map = runeTexture();
  }

  puff(p: Puff): void {
    (p.normal ? this.smoke : this.glow).emit(p);
  }

  /** `n` particles in a sphere of radius `r` around (x,y,z) drifting outwards. */
  burst(x: number, y: number, z: number, n: number, r: number, base: Omit<Puff, 'x' | 'y' | 'z'>, speed = 1): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u);
      const dx = Math.cos(a) * s, dy = u, dz = Math.sin(a) * s, k = Math.random();
      this.puff({ ...base, x: x + dx * r * k, y: y + dy * r * k, z: z + dz * r * k, vx: dx * speed, vy: dy * speed + (base.vy ?? 0), vz: dz * speed });
    }
  }

  /** Short light pulse at a point (shares the ability light with the wisp). */
  pulse(x: number, y: number, z: number, color: number, power = 30): void {
    this.flash = power;
    this.flashColor.setHex(color);
    this.light.position.set(x, y, z);
  }

  /** `wispOn`: the wisp owns the light while it lives; a pulse overrides it briefly. */
  update(dt: number, wispOn: boolean): void {
    this.glow.update(dt);
    this.smoke.update(dt);
    this.flash *= Math.exp(-dt * 7);
    if (this.flash > 0.5) {
      this.light.color.copy(this.flashColor);
      this.light.intensity = this.flash;
    } else if (wispOn) {
      this.light.color.setHex(0x66ffcc);
      this.light.position.copy(this.wisp.position);
      this.light.intensity = 9 + Math.sin(performance.now() * 0.011) * 1.2;
    } else this.light.intensity = 0;
  }
}

/** Procedural rune circle: ticks, glyph strokes and a double ring, on a canvas. */
function runeTexture(): THREE.Texture {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.translate(S / 2, S / 2);
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  for (const r of [124, 104]) { g.lineWidth = r === 124 ? 4 : 2; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }
  g.lineWidth = 3;
  for (let i = 0; i < 16; i++) {
    g.save();
    g.rotate((i / 16) * Math.PI * 2);
    g.beginPath(); // a little angular glyph between the rings
    const h = (i * 7) % 3;
    g.moveTo(-5, -108); g.lineTo(0, -120); g.lineTo(5, -108 - h * 3);
    if (h) { g.moveTo(-5, -114); g.lineTo(5, -114); }
    g.stroke();
    g.restore();
  }
  // RingGeometry UVs map the full square, so the canvas circle lines up with the ring.
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
