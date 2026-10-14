import * as THREE from 'three';
import { CHURCH_FLOOR as F } from '../level/plan.ts';
import type { LightSpot } from '../level/builder.ts';

// Wall torches and braziers: small emissive props (no colliders, so `npm run check`
// never sees them), a fixed pool of real point lights handed to the torches nearest
// the player each frame, and rising sparks. Flames are HDR-bright so bloom makes them
// glow; only POOL of them actually light the scene, which keeps the shader light
// count constant (no recompiles) and the frame rate flat however many torches exist.
// The zones add candles (flame only), hanging lamps and coloured window glows (light
// only) through LevelBuilder.lights; they share the same flames and light pool.

interface Emitter {
  x: number; y: number; z: number; // flame base
  nx: number; nz: number; // wall normal (0,0 for free-standing braziers)
  kind: 'torch' | 'brazier' | LightSpot['kind'];
  color: number;
  phase: number;
}

const POOL = 8; // real PointLights
const SPARKS = 5, BRAZIER_SPARKS = 14;
const LIGHT_COLOR = 0xff8a3c;
const FLAME = { torch: 1, brazier: 2.6, candle: 0.32, lamp: 0, glow: 0 }; // flame scale, 0 = none
const POWER = { torch: 9, brazier: 26, candle: 0, lamp: 30, glow: 7 }; // pooled light intensity, 0 = never lit

/** Torch on the wall face through (x, z), sticking out along the room-facing normal. */
function wall(x: number, z: number, nx: number, nz: number, floor = 0): Emitter {
  return { x: x + nx * 0.32, y: floor + 2.75, z: z + nz * 0.32, nx, nz, kind: 'torch', color: LIGHT_COLOR, phase: 0 };
}

function brazier(x: number, z: number, floor = 0): Emitter {
  return { x, y: floor + 1.1, z, nx: 0, nz: 0, kind: 'brazier', color: LIGHT_COLOR, phase: 0 };
}

/** Placement, from the coordinate tables at the top of each zone file. */
function layout(spots: LightSpot[]): Emitter[] {
  const P = F + 0.6; // presbytery and choir floor
  const e: Emitter[] = [];
  for (const s of [-1, 1]) {
    // Church (stone walls 1 m thick: faces 0.5 m off the wall line).
    for (const z of [-9.5, -18.5, -27.6]) e.push(wall(7 * s, z, -s, 0, F)); // nave piers
    for (const z of [-4.75, -14, -23.25]) e.push(wall(12 * s, z, -s, 0, F)); // chapel altars
    e.push(wall(4.5 * s, -0.5, 0, -1, F)); // inside the facade
    e.push(brazier(4 * s, 3.3, F)); // on the landing, before the giant pedestals
    for (const z of [-31, -43]) e.push(wall(7.5 * s, z, -s, 0, F)); // crossing piers
    e.push(wall(12.5 * s, -37, -s, 0, F)); // apse backs
    e.push(brazier(4 * s, -42.5, F)); // before the presbytery steps
    for (const z of [-49, -57]) e.push(wall(7 * s, z, -s, 0, P)); // presbytery, choir
    e.push(wall(4 * s, -59.5, 0, 1, P)); // choir back wall

    // Convent (0.6 m walls: faces 0.3 m off the wall line).
    e.push(wall(-21, -18.5 + 2.2 * s, 0, -s)); // ingresso, n and s walls
    e.push(wall(9 * s, -60.3, 0, -1)); // chiostro grande, under the church back
    e.push(brazier(3.5 * s, -68.5)); // flanking the church back stairs
  }
  e.push(
    wall(-36.7, -48.5, 1, 0), wall(-22.3, -48.5, -1, 0), wall(-28, -53.7, 0, 1), wall(-27, -43.3, 0, -1), // chiostrino
    wall(-36.7, -60, 1, 0), wall(-36.7, -78, 1, 0), wall(-31.3, -62, -1, 0), wall(-31.3, -76, -1, 0), // corridoio
    wall(-46.7, -66, 1, 0), wall(-46.7, -74, 1, 0), wall(-42, -60.3, 0, -1), wall(-42, -79.7, 0, 1), // chiostro ovest
    wall(-24, -56.3, 0, -1), wall(-24, -79.7, 0, 1), // chiostro mediano
    wall(-16.7, -64, 1, 0), wall(-16.7, -78, 1, 0), wall(12.7, -66, -1, 0), wall(12.7, -80, -1, 0), // chiostro grande
    wall(-13, -85.7, 0, 1), wall(6, -85.7, 0, 1),
    wall(27.7, -107, -1, 0), wall(27.7, -103, -1, 0), // segreteria
    // Corpo nord: north walls at z -161 (face -160.7).
    wall(-46.7, -158.5, 1, 0), wall(-46.7, -153.5, 1, 0), // cappella, flanking the altar
    wall(-37, -160.7, 0, 1), wall(-32, -160.7, 0, 1), // sale espositive
    wall(-28, -160.7, 0, 1), wall(-24, -160.7, 0, 1), // caffè
    wall(-6, -160.7, 0, 1), wall(2, -160.7, 0, 1), // laboratori
    wall(8, -160.7, 0, 1), wall(16, -160.7, 0, 1), // frantoio
  );
  for (const z of [-145, -154, -163]) e.push(wall(-21.7, z, 1, 0), wall(-9.3, z, -1, 0)); // androne
  for (const s of spots) e.push({ ...s, nx: 0, nz: 0, color: s.color ?? LIGHT_COLOR, phase: 0 });
  e.forEach((t, i) => (t.phase = i * 12.9898));
  return e;
}

/** Sum of incommensurate sines: cheap, smooth, never repeats visibly. */
function flicker(t: number, ph: number): number {
  return 0.82 + 0.1 * Math.sin(t * 9.1 + ph) + 0.06 * Math.sin(t * 23.7 + ph * 1.7) + 0.04 * Math.sin(t * 4.3 + ph * 0.3);
}

function softDot(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export const DOT = softDot();

export class Torches {
  readonly root = new THREE.Group();
  /** Light multiplier per kind ("Stile Diablo": torches and braziers brighter, the church's lamps and window glows dimmer). */
  boost: Partial<Record<Emitter['kind'], number>> = {};
  /** Brazier flame size multiplier, and how far over the bowl its light hangs: seen from above (Diablo view) the
   * stacked cones and a light just over the wide Meshy bowl would blow out to a white disc. */
  brazierFlame = 1;
  brazierLift = 0.5;
  /** Brazier flame bases, and the iron that holds them (swapped for a Meshy brazier in the Diablo view). */
  readonly braziers: { x: number; y: number; z: number }[];
  readonly brazierIron: THREE.InstancedMesh[];
  readonly em: Emitter[]; // every flame (audio/director.ts: the nearest crackle)
  private readonly flames: number[]; // emitters drawing a flame
  private readonly lit: number[]; // emitters competing for the light pool
  private readonly lights: THREE.PointLight[] = [];
  private readonly outer: THREE.InstancedMesh;
  private readonly core: THREE.InstancedMesh;
  private readonly order: number[];
  private readonly dist: Float32Array;
  // sparks
  private readonly spark: { e: number; age: number; life: number; vx: number; vy: number; vz: number }[] = [];
  private readonly sparkPos: Float32Array;
  private readonly sparkCol: Float32Array;
  private readonly sparkGeo = new THREE.BufferGeometry();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();

  constructor(spots: LightSpot[] = []) {
    this.root.name = 'fx:torches';
    this.em = layout(spots);
    const n = this.em.length;
    this.flames = this.em.flatMap((e, i) => (FLAME[e.kind] ? [i] : []));
    this.lit = this.em.flatMap((e, i) => (POWER[e.kind] ? [i] : []));
    this.order = [...this.lit];
    this.dist = new Float32Array(n);

    // Hardware: wall torch = tilted haft + cup; brazier = stand, foot and bowl.
    const iron = new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.55, metalness: 0.5 });
    const torches = this.em.filter((t) => t.kind === 'torch'), braziers = this.em.filter((t) => t.kind === 'brazier');
    const haft = new THREE.CylinderGeometry(0.035, 0.025, 0.55, 6).translate(0, -0.3, 0);
    const cup = new THREE.CylinderGeometry(0.09, 0.05, 0.14, 8);
    const hafts = new THREE.InstancedMesh(haft, iron, torches.length);
    const cups = new THREE.InstancedMesh(cup, iron, torches.length);
    torches.forEach((t, i) => {
      // Tilt the haft so its foot touches the wall and its top holds the cup at the flame.
      this.q.setFromAxisAngle(this.v.set(t.nz, 0, -t.nx), 0.45);
      this.m.compose(this.sc.set(t.x, t.y - 0.06, t.z), this.q, this.v.set(1, 1, 1));
      hafts.setMatrixAt(i, this.m);
      this.m.makeTranslation(t.x, t.y - 0.06, t.z);
      cups.setMatrixAt(i, this.m);
    });
    const stand = new THREE.CylinderGeometry(0.06, 0.09, 0.85, 8).translate(0, -0.6, 0);
    const foot = new THREE.CylinderGeometry(0.32, 0.38, 0.12, 10).translate(0, -1.04, 0);
    const bowl = new THREE.CylinderGeometry(0.5, 0.26, 0.3, 12).translate(0, -0.08, 0);
    const parts = [stand, foot, bowl].map((g) => new THREE.InstancedMesh(g, iron, braziers.length));
    this.braziers = braziers.map(({ x, y, z }) => ({ x, y, z }));
    this.brazierIron = parts;
    braziers.forEach((t, i) => {
      this.m.makeTranslation(t.x, t.y, t.z);
      for (const p of parts) p.setMatrixAt(i, this.m);
    });
    for (const im of [hafts, cups, ...parts]) {
      im.castShadow = im.receiveShadow = true;
      this.root.add(im);
    }

    // Flames: two additive cones (outer orange, inner gold core), HDR colours for bloom.
    const flameMat = (r: number, g: number, b: number) =>
      new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
    this.outer = new THREE.InstancedMesh(new THREE.ConeGeometry(0.11, 0.42, 7).translate(0, 0.21, 0), flameMat(5, 1.3, 0.25), this.flames.length);
    this.core = new THREE.InstancedMesh(new THREE.ConeGeometry(0.06, 0.24, 6).translate(0, 0.12, 0), flameMat(9, 5.5, 1.6), this.flames.length);
    for (const im of [this.outer, this.core]) {
      im.frustumCulled = false; // instances span the whole site
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.root.add(im);
    }

    for (let i = 0; i < POOL; i++) {
      const l = new THREE.PointLight(LIGHT_COLOR, 0, 13, 1.6);
      this.lights.push(l);
      this.root.add(l);
    }

    // Sparks: one Points buffer for every emitter, fading through vertex colour.
    this.em.forEach((t, e) => {
      for (let k = 0; k < (t.kind === 'brazier' ? BRAZIER_SPARKS : t.kind === 'torch' ? SPARKS : 0); k++) this.spark.push({ e, age: Math.random() * 2, life: 0, vx: 0, vy: 0, vz: 0 });
    });
    this.sparkPos = new Float32Array(this.spark.length * 3);
    this.sparkCol = new Float32Array(this.spark.length * 3);
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparkGeo.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3).setUsage(THREE.DynamicDrawUsage));
    const sparks = new THREE.Points(this.sparkGeo, new THREE.PointsMaterial({
      size: 0.07, map: DOT, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false,
    }));
    sparks.frustumCulled = false;
    this.root.add(sparks);
  }

  update(t: number, dt: number, focus: THREE.Vector3): void {
    const { em, m, q, sc, v } = this;
    q.identity();
    this.flames.forEach((i, k) => {
      const e = em[i], f = flicker(t, e.phase), s = FLAME[e.kind] * (e.kind === 'brazier' ? this.brazierFlame : 1);
      // Flames stretch and sway a little; height follows the flicker.
      m.compose(v.set(e.x, e.y, e.z), q, sc.set(s * (0.9 + 0.1 * f), s * (0.55 + 0.6 * f), s * (0.9 + 0.1 * f)));
      this.outer.setMatrixAt(k, m);
      m.compose(v.set(e.x, e.y + 0.01, e.z), q, sc.set(s, s * (0.6 + 0.5 * f), s));
      this.core.setMatrixAt(k, m);
    });
    for (const i of this.lit) this.dist[i] = Math.hypot(em[i].x - focus.x, em[i].y - focus.y, em[i].z - focus.z);
    this.outer.instanceMatrix.needsUpdate = this.core.instanceMatrix.needsUpdate = true;

    // Light pool: nearest POOL torches. Each fades out as it nears the distance of the
    // first torch left without a light, so hand-overs never pop.
    this.order.sort((a, b) => this.dist[a] - this.dist[b]);
    const cut = this.order.length > POOL ? this.dist[this.order[POOL]] : Infinity;
    for (let k = 0; k < POOL; k++) {
      const l = this.lights[k], i = this.order[k];
      if (i === undefined) { l.intensity = 0; continue; }
      const e = em[i], w = Math.min(1, Math.max(0, (cut - this.dist[i]) / 4));
      l.position.set(e.x + e.nx * 0.6, e.y + (e.kind === 'brazier' ? this.brazierLift : e.kind === 'torch' ? 0.3 : 0), e.z + e.nz * 0.6);
      l.color.setHex(e.color);
      l.intensity = POWER[e.kind] * (e.kind === 'glow' ? 1 : flicker(t, e.phase)) * w * (this.boost[e.kind] ?? 1);
    }

    // Sparks: rise with buoyancy and a little drift, cool from gold to dark red.
    for (let k = 0; k < this.spark.length; k++) {
      const p = this.spark[k], e = em[p.e], o = k * 3;
      p.age += dt;
      if (p.age >= p.life) {
        p.age = 0;
        const big = e.kind === 'brazier';
        p.life = 0.6 + Math.random() * (big ? 1.6 : 1.1);
        const r = big ? 0.35 : 0.06;
        this.sparkPos[o] = e.x + (Math.random() - 0.5) * r;
        this.sparkPos[o + 1] = e.y + 0.15;
        this.sparkPos[o + 2] = e.z + (Math.random() - 0.5) * r;
        p.vx = (Math.random() - 0.5) * 0.3 + e.nx * 0.08;
        p.vy = 0.5 + Math.random() * 0.7;
        p.vz = (Math.random() - 0.5) * 0.3 + e.nz * 0.08;
      }
      p.vx += (Math.random() - 0.5) * 2 * dt;
      p.vz += (Math.random() - 0.5) * 2 * dt;
      this.sparkPos[o] += p.vx * dt;
      this.sparkPos[o + 1] += p.vy * dt;
      this.sparkPos[o + 2] += p.vz * dt;
      const a = 1 - p.age / p.life, h = a * a * 4;
      this.sparkCol[o] = h * 1.6;
      this.sparkCol[o + 1] = h * 0.55 * a;
      this.sparkCol[o + 2] = h * 0.12 * a;
    }
    this.sparkGeo.attributes.position.needsUpdate = this.sparkGeo.attributes.color.needsUpdate = true;
  }
}
