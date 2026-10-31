import * as THREE from 'three';
import { loadModel } from '../core/models.ts';

// Shells: the big glowing shapes of the heroes' spells, WoW style: spheres of light bursting round the hero, walls of light
// rising off a ring on the floor, crescent slashes sweeping with a blow, cones of breath, beams, and the spectral Meshy
// shapes (a bell, ice crystals, an ice javelin, a bone spear, a skull, a twist of flame: public/models/fx-shapes.glb, bare
// meshes). Additive, unlit, one shader for every shape (one program), its look picked per instance: a fresnel rim that
// erodes through a scrolling noise as it ages, a crescent bright at its sweeping head, a wall bright at its foot with
// streaks running up, spiral bands, a breath's streaks. Pooled per shape in an InstancedMesh, compacted every frame, so a
// shape draws once while any of it lives and not at all otherwise; no lights, no textures but one 64 px noise.

export type Shape = 'sphere' | 'ring' | 'arc' | 'cone' | 'bell' | 'crystal' | 'icespear' | 'bonespear' | 'skull' | 'flame';
const SHAPES: Shape[] = ['sphere', 'ring', 'arc', 'cone', 'bell', 'crystal', 'icespear', 'bonespear', 'skull', 'flame'];
const MESHY: Shape[] = ['bell', 'crystal', 'icespear', 'bonespear', 'skull', 'flame'];
const MAX: Record<Shape, number> = { sphere: 40, ring: 16, arc: 24, cone: 6, bell: 4, crystal: 24, icespear: 12, bonespear: 8, skull: 10, flame: 10 };

/** How the shader draws it: 0 rim, 1 crescent, 2 wall, 3 spiral, 4 spectral body (rim and a faint fill), 5 breath. */
export const L = { rim: 0, arc: 1, wall: 2, swirl: 3, body: 4, breath: 5 } as const;

type V3 = number | [number, number, number];
const v3 = (v: V3): [number, number, number] => (typeof v === 'number' ? [v, v, v] : v);

/** A shell's look and life, made once at module level. */
export interface ShellStyle {
  shape: Shape;
  look: number; // L
  life: number; // s (held shells ignore it)
  color: number;
  color2?: number; // colour it fades to
  hdr?: number;
  alpha?: number;
  size: V3; // m: x, y, z (spheres: radius; the ring and arc: radius and height; Meshy shapes: height)
  grow?: V3; // size multiplier at the end of life, eased out
  ease?: number; // the growth's ease-out power (default 3: a burst)
  fadeIn?: number; // share of life
  fadeOut?: number; // share of life
  spin?: number; // rad/s about its own up
  rise?: number; // m/s up
  sweep?: [number, number]; // crescents: where the bright head runs over the life (0 = start of the arc, 1 = its end)
}

export interface Shell {
  on: boolean; held: boolean;
  x: number; y: number; z: number;
  yaw: number; pitch: number; roll: number;
  sx: number; sy: number; sz: number;
  alpha: number; sweep: number; t: number; // t: life share, drives the erosion (held: set it)
  color: THREE.Color; // held: set freely (hdr included)
  age: number; style: ShellStyle; seed: number; scale: number;
  c0: THREE.Color; c1: THREE.Color;
}

const VERT = /* glsl */ `
  attribute vec4 iColor;
  attribute vec4 iParam; // life share, seed, look, sweep
  varying vec2 vUv;
  varying vec3 vP;
  varying vec3 vN;
  varying vec3 vV;
  varying vec4 vCol;
  varying vec4 vPar;
  varying float vNear;
  void main() {
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    bool wide = iParam.z < 0.5 || (iParam.z > 1.5 && iParam.z < 3.5); // domes, walls, columns
    float near = wide ? 6.0 : 3.5; // domes and walls reach round the lens: they fade further out
    vNear = smoothstep(near * 0.35, near, distance(cameraPosition, wp.xyz)); // a shell round the lens would fill the screen: it fades there
    float big = max(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz) * 0.3);
    if (wide) vNear *= clamp(2.2 / big, 0.3, 1.0); // its light spread as it grows: a wide dome or wall no longer floods the bloom
    vUv = uv;
    vP = position;
    vCol = iColor;
    vPar = iParam;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const FRAG = /* glsl */ `
  uniform sampler2D noise;
  uniform float time;
  varying vec2 vUv;
  varying vec3 vP;
  varying vec3 vN;
  varying vec3 vV;
  varying vec4 vCol;
  varying vec4 vPar;
  varying float vNear;
  void main() {
    float t = vPar.x, seed = vPar.y, look = vPar.z, sweep = vPar.w;
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float a;
    if (look < 0.5) { // rim: a shell of light, its edge brightest, eaten away as it ages
      float n = texture2D(noise, vec2(vUv.x * 3.0 + seed, vUv.y * 2.0 - time * 0.35)).r;
      a = (0.12 + pow(f, 2.6) * 1.1) * (0.45 + 0.9 * n);
      a *= smoothstep(t - 0.25, t + 0.05, n * 0.85 + 0.15);
    } else if (look < 1.5) { // crescent: bright where the head is, a tail fading behind, the outer edge hottest
      float u = vUv.x, v = vUv.y;
      float n = texture2D(noise, vec2(u * 3.0 - time * 1.5 + seed, v * 0.8)).r;
      float tail = u <= sweep ? exp(-(sweep - u) * 4.0) : smoothstep(sweep + 0.05, sweep, u);
      a = tail * (pow(v, 2.5) * 1.3 + 0.25 * v) * (0.7 + 0.6 * n) * smoothstep(0.0, 0.08, u) * smoothstep(1.0, 0.9, u);
    } else if (look < 2.5) { // wall: off a ring on the floor, bright at its foot, streaks running up
      float v = vUv.y;
      float n = texture2D(noise, vec2(vUv.x * 9.0 + seed, v * 0.7 - time * 1.4)).r;
      a = pow(1.0 - v, 2.0) * (0.2 + 0.9 * n * n) + smoothstep(0.06, 0.0, v) * 0.5;
      a *= smoothstep(t - 0.3, t, n * 0.9 + 0.1 + (1.0 - v) * 0.3);
    } else if (look < 3.5) { // spiral bands wound round a column, climbing
      float v = vUv.y;
      float n = texture2D(noise, vec2(vUv.x * 2.0 + v * 1.6 - time * 0.9 + seed, v * 1.2 - time * 2.2)).r;
      a = smoothstep(0.35, 0.8, n) * 1.3 * pow(1.0 - v, 0.8) * smoothstep(0.0, 0.06, v) + pow(f, 3.0) * 0.25 * (1.0 - v);
    } else if (look < 4.5) { // spectral body: rim and a faint fill, the noise crawling over it, eroding
      float n = texture2D(noise, vec2(vP.x + vP.z + seed, vP.y * 1.5 - time * 0.4)).r;
      a = (0.14 + pow(f, 1.8) * 1.2) * (0.6 + 0.8 * n);
      a *= smoothstep(t - 0.25, t + 0.05, n * 0.85 + 0.15);
    } else { // breath: streaks along a cone, thick near the mouth, gone at the far end
      float v = vUv.y;
      float n = texture2D(noise, vec2(vUv.x * 6.0 + seed, v * 1.5 - time * 3.0)).r;
      a = smoothstep(0.0, 0.12, v) * pow(1.0 - v, 1.1) * (0.2 + 1.2 * n * n) * (1.0 - f * 0.6);
    }
    a *= vCol.a * vNear * 0.8;
    vec3 c = vCol.rgb;
    c = mix(c, vec3(max(c.r, max(c.g, c.b))), smoothstep(1.0, 2.0, a) * 0.4); // white-hot where it is thickest
    gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
  }`;

/** A tiling 64 px value noise (one channel), the only texture the shells read. */
function noiseTexture(): THREE.DataTexture {
  const S = 64, d = new Uint8Array(S * S * 4);
  let s = 3;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const g = Array.from({ length: 16 * 16 }, r), at = (x: number, y: number) => g[((y + 16) % 16) * 16 + ((x + 16) % 16)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0, amp = 0.5, tot = 0;
    for (let o = 0, f = 4; o < 3; o++, f *= 2, amp *= 0.5) {
      const fx = (x / S) * f, fy = (y / S) * f, xi = Math.floor(fx), yi = Math.floor(fy), u = fx - xi, w = fy - yi;
      const su = u * u * (3 - 2 * u), sw = w * w * (3 - 2 * w), k = 16 / f;
      const A = at(xi * k, yi * k), B = at((xi + 1) * k, yi * k), C = at(xi * k, (yi + 1) * k), D = at((xi + 1) * k, (yi + 1) * k);
      v += (A + (B - A) * su + (C - A) * sw + (A - B - C + D) * su * sw) * amp; tot += amp;
    }
    const i = (y * S + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = Math.round((v / tot) * 255); d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, S, S);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** The crescent: a ring sector in the floor plane, forward (-Z) at its middle, thick there and thin at both tips. */
function arcGeometry(): THREE.BufferGeometry {
  const N = 40, A = 2.6, W = 0.42, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, a = -A / 2 + u * A, w = W * Math.sin(Math.PI * u) ** 0.8, s = Math.sin(a), c = Math.cos(a);
    pos.push(s * (1 - w), 0, -c * (1 - w), s, 0, -c);
    uv.push(u, 0, u, 1);
    if (i < N) { const o = i * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function geometry(shape: Shape): THREE.BufferGeometry {
  switch (shape) {
    case 'sphere': return new THREE.SphereGeometry(1, 28, 18);
    case 'ring': return new THREE.CylinderGeometry(1, 1, 1, 40, 1, true).translate(0, 0.5, 0); // foot on the floor, 1 m tall
    case 'arc': return arcGeometry();
    case 'cone': return new THREE.ConeGeometry(1, 1, 28, 1, true).rotateX(Math.PI).translate(0, 0.5, 0); // tip at the origin, mouth 1 m up
    default: return new THREE.BufferGeometry(); // filled in by the Meshy file
  }
}

const POOL: Shell[] = [];
const ease = (t: number, p: number) => 1 - (1 - t) ** p;

export class Shells {
  readonly root = new THREE.Group();
  readonly noise = noiseTexture();
  private meshes = new Map<Shape, THREE.InstancedMesh>();
  private live = new Map<Shape, Shell[]>();
  private material: THREE.ShaderMaterial;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler(0, 0, 0, 'YXZ');
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private time = 0;
  private priming = 0;
  /** The Meshy shapes are in (they load after the start; until then their shells are skipped). */
  loaded = false;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: { noise: { value: this.noise }, time: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    for (const shape of SHAPES) {
      const n = MAX[shape], g = geometry(shape);
      g.setAttribute('iColor', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('iParam', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage));
      const mesh = new THREE.InstancedMesh(g, this.material, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      mesh.count = 0;
      mesh.visible = false;
      this.meshes.set(shape, mesh);
      this.live.set(shape, []);
      if (!MESHY.includes(shape)) this.root.add(mesh);
    }
    loadModel('fx-shapes.glb').then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      for (const shape of MESHY) {
        const src = gltf.scene.getObjectByName(`fx-${shape}`) as THREE.Mesh | undefined;
        const mesh = this.meshes.get(shape)!;
        if (!src?.geometry) continue;
        const g = mesh.geometry, s = src.geometry;
        const q = s.getAttribute('position'), pos = new THREE.Float32BufferAttribute(q.count * 3, 3); // dequantized into metres
        for (let i = 0; i < q.count; i++) pos.setXYZ(i, q.getX(i), q.getY(i), q.getZ(i));
        pos.applyMatrix4(src.matrixWorld);
        g.setAttribute('position', pos);
        g.setIndex(s.index);
        g.computeVertexNormals();
        const uv = new Float32Array(pos.count * 2); // round its up axis, up it: the rim look's noise
        for (let i = 0; i < pos.count; i++) { uv[i * 2] = Math.atan2(pos.getZ(i), pos.getX(i)) / Math.PI; uv[i * 2 + 1] = pos.getY(i); }
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        s.dispose();
        this.root.add(mesh);
      }
      this.loaded = true;
    }).catch(() => { /* no spectral shapes: the rest still draws */ });
  }

  /** A fire-and-forget shell of `style` at (x,y,z), turned `yaw` about up (then `pitch`, `roll`), `scale` × its size. */
  spawn(style: ShellStyle, x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0, scale = 1): Shell | undefined {
    const d = this.take(style, false);
    if (!d) return undefined;
    Object.assign(d, { x, y, z, yaw, pitch, roll, scale });
    return d;
  }

  /** A shell its owner places, sizes and colours every frame (`on`, position, angles, sx/sy/sz, alpha, t, sweep). */
  hold(style: ShellStyle): Shell {
    const d = this.make(style);
    d.held = true;
    d.on = false;
    return d;
  }

  /** Let a held shell go back to the pool. */
  release(d: Shell): void {
    d.on = false;
    const list = this.live.get(d.style.shape)!, i = list.indexOf(d);
    if (i >= 0) list.splice(i, 1);
    POOL.push(d);
  }

  private make(style: ShellStyle): Shell {
    const d = POOL.pop() ?? { on: false, held: false, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, sx: 1, sy: 1, sz: 1, alpha: 1, sweep: 1, t: 0, color: new THREE.Color(), age: 0, style, seed: 0, scale: 1, c0: new THREE.Color(), c1: new THREE.Color() };
    const [sx, sy, sz] = v3(style.size), hdr = style.hdr ?? 1;
    Object.assign(d, { on: true, held: false, age: 0, style, seed: Math.random() * 10, scale: 1, sx, sy, sz, alpha: style.alpha ?? 1, t: 0, sweep: style.sweep?.[0] ?? 1, yaw: 0, pitch: 0, roll: 0 });
    d.c0.setHex(style.color).multiplyScalar(hdr);
    d.c1.setHex(style.color2 ?? style.color).multiplyScalar(hdr);
    d.color.copy(d.c0);
    const list = this.live.get(style.shape)!;
    if (list.length >= MAX[style.shape]) { // full: the oldest loose one gives way
      const old = list.findIndex((s) => !s.held);
      if (old < 0) return d; // all held: this one is never drawn
      POOL.push(list.splice(old, 1)[0]);
    }
    list.push(d);
    return d;
  }

  private take(style: ShellStyle, held: boolean): Shell | undefined {
    if (MESHY.includes(style.shape) && !this.loaded) return undefined;
    const d = this.make(style);
    d.held = held;
    return d;
  }

  /** Draw every shape once at nothing (Vfx.prime): their programs and buffers made before the first spell. */
  prime(): void {
    this.priming = 2;
  }

  update(dt: number): void {
    this.time += dt;
    this.material.uniforms.time.value = this.time;
    for (const shape of SHAPES) {
      const mesh = this.meshes.get(shape)!, list = this.live.get(shape)!;
      const C = (mesh.geometry.getAttribute('iColor') as THREE.InstancedBufferAttribute).array as Float32Array;
      const P = (mesh.geometry.getAttribute('iParam') as THREE.InstancedBufferAttribute).array as Float32Array;
      let n = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        const d = list[i], s = d.style;
        if (!d.held) {
          const t = (d.age += dt) / s.life;
          if (t >= 1) { list.splice(i, 1); d.on = false; POOL.push(d); continue; }
          const fi = s.fadeIn ?? 0.06, fo = s.fadeOut ?? 0.5;
          d.alpha = (s.alpha ?? 1) * Math.min(1, t / fi) * (t > 1 - fo ? (1 - t) / fo : 1);
          const [gx, gy, gz] = v3(s.grow ?? 1), k = ease(t, s.ease ?? 3), [bx, by, bz] = v3(s.size);
          d.sx = bx * (1 + (gx - 1) * k) * d.scale; d.sy = by * (1 + (gy - 1) * k) * d.scale; d.sz = bz * (1 + (gz - 1) * k) * d.scale;
          d.yaw += (s.spin ?? 0) * dt;
          d.y += (s.rise ?? 0) * dt;
          if (s.sweep) d.sweep = s.sweep[0] + (s.sweep[1] - s.sweep[0]) * ease(t, 2);
          d.t = t;
          d.color.copy(d.c0).lerp(d.c1, t);
        }
        if (!d.on || d.alpha <= 0.002) continue;
        this.q.setFromEuler(this.e.set(d.pitch, d.yaw, d.roll));
        mesh.setMatrixAt(n, this.m.compose(this.p.set(d.x, d.y, d.z), this.q, this.s.set(d.sx, d.sy, d.sz)));
        C[n * 4] = d.color.r; C[n * 4 + 1] = d.color.g; C[n * 4 + 2] = d.color.b; C[n * 4 + 3] = d.alpha;
        P[n * 4] = d.t; P[n * 4 + 1] = d.seed; P[n * 4 + 2] = s.look; P[n * 4 + 3] = d.sweep;
        n++;
      }
      if (this.priming > 0 && !n && mesh.parent) { mesh.setMatrixAt(0, this.m.makeScale(0, 0, 0)); n = 1; } // drawn at nothing
      mesh.count = n;
      mesh.visible = n > 0;
      if (n) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.geometry.getAttribute('iColor').needsUpdate = true;
        mesh.geometry.getAttribute('iParam').needsUpdate = true;
      }
    }
    if (this.priming > 0) this.priming--;
  }
}
