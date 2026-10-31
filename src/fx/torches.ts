import * as THREE from 'three';
import { CHURCH_FLOOR as F } from '../level/plan.ts';
import type { LightSpot } from '../level/builder.ts';
import { loadModel } from '../core/models.ts';

// Fire: wall torches, braziers, iron fire baskets and candelabra (Meshy props in Venetian gothic iron, fuoco.glb,
// visual only: no colliders, so `npm run check` never sees them), candles, and the lamps and coloured window glows
// the zones add through LevelBuilder.lights. A fixed pool of real point lights goes to the fires nearest the player
// each frame, which keeps the shader light count constant (no recompiles) and the frame rate flat however many fires
// burn; every other fire lights its stone with a glow painted on the floor under it (and on the wall behind a torch),
// flickering with it, so the far ones still throw pools of warm light, on the low-quality rungs too. Flames are
// billboards with a noise shader, HDR-bright so bloom makes them glow; sparks spit off them and embers drift up
// into the dark around the nearest.

type Kind = LightSpot['kind'];
type Prop = 'braciere' | 'torcia' | 'candelabro' | 'cesto';

interface Emitter {
  x: number; y: number; z: number; // flame base (light: where it hangs)
  nx: number; nz: number; // wall normal (0,0 when free-standing)
  kind: Kind;
  color: number;
  phase: number;
}

/**
 * Per kind: flame width and height in m (0: none), pooled light power (0: never lit), reach in m and fall-off (fires: the
 * physical square, for tight pools of light in the dark), sparks,
 * the floor glow's radius in m (0: none), and for the free-standing ones how high the flame stands over the floor.
 */
const KIND: Record<Kind, { flame: [number, number]; power: number; reach: number; decay: number; sparks: number; glow: number; lift: number }> = {
  torch: { flame: [0.34, 0.66], power: 7, reach: 6.5, decay: 2, sparks: 6, glow: 2.6, lift: 0 },
  brazier: { flame: [0.8, 1.25], power: 14, reach: 8, decay: 2, sparks: 20, glow: 4, lift: 1.1 },
  basket: { flame: [0.66, 1.05], power: 12, reach: 7.5, decay: 2, sparks: 16, glow: 3.6, lift: 1.1 },
  candelabrum: { flame: [0, 0], power: 5, reach: 5, decay: 2, sparks: 0, glow: 1.8, lift: 1.55 },
  candle: { flame: [0.07, 0.16], power: 0, reach: 0, decay: 2, sparks: 0, glow: 0, lift: 0 },
  lamp: { flame: [0, 0], power: 30, reach: 10, decay: 1.6, sparks: 0, glow: 0, lift: 0 },
  glow: { flame: [0, 0], power: 7, reach: 13, decay: 1.6, sparks: 0, glow: 0, lift: 0 },
};
const POOL = 8; // real PointLights
const EMBERS = 120; // drifting embers, round the nearest fires
const TORCH = 0xff9040, FIRE = 0xff7a2e, WAX = 0xffa858; // torches orange, braziers and baskets a deeper red, candles gold
/** The Meshy prop of each fire holder: height in m, and where it stands from the flame (torch: its cage sits 0.12 m out on the wall's normal). */
const PROP: Partial<Record<Kind, { model: Prop; h: number; drop: number; out: number }>> = {
  torch: { model: 'torcia', h: 0.9, drop: 0.5, out: -0.12 },
  brazier: { model: 'braciere', h: 1.3, drop: 1.1, out: 0 },
  basket: { model: 'cesto', h: 2.2, drop: 1.1, out: 0 },
  candelabrum: { model: 'candelabro', h: 1.9, drop: 1.55, out: 0 },
};
/** The candelabro's candle tips, per metre of its height (from its mesh): a ring of eight and the tall one in the middle. */
const TIPS: [number, number, number][] = [[0, 1, 0], ...Array.from({ length: 8 }, (_, i): [number, number, number] => [0.145 * Math.cos(i * Math.PI / 4 + 0.4), 0.806, 0.145 * Math.sin(i * Math.PI / 4 + 0.4)])];
const CELL = 48; // m: props are instanced per cell of this grid, so those off screen are culled
const GLOW = 0.06; // props' self-glow from their colour map: a shaded side never goes black

/** Torch on the wall face through (x, z), sticking out along the room-facing normal. */
function wall(x: number, z: number, nx: number, nz: number, floor = 0): Emitter {
  return { x: x + nx * 0.32, y: floor + 2.75, z: z + nz * 0.32, nx, nz, kind: 'torch', color: TORCH, phase: 0 };
}

/** A free-standing fire on the floor at (x, z): brazier, fire basket or candelabrum (snapped to the ground under it). */
function stand(kind: 'brazier' | 'basket' | 'candelabrum', x: number, z: number, floor = 0): Emitter {
  return { x, y: floor + KIND[kind].lift, z, nx: 0, nz: 0, kind, color: kind === 'candelabrum' ? WAX : FIRE, phase: 0 };
}

const brazier = (x: number, z: number, floor = 0) => stand('brazier', x, z, floor);
const basket = (x: number, z: number, floor = 0) => stand('basket', x, z, floor);
const candelabrum = (x: number, z: number, floor = 0) => stand('candelabrum', x, z, floor);

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
    e.push(candelabrum(2.8 * s, -47.4, P)); // flanking the high altar
    for (const z of [-49, -57]) e.push(wall(7 * s, z, -s, 0, P)); // presbytery, choir
    e.push(wall(4 * s, -59.5, 0, 1, P)); // choir back wall
    e.push(basket(11.5 * s, 9)); // the sagrato's corners on the fondamenta
    e.push(basket(30 * s, 19.2)); // the fondamenta's quay edge

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
    basket(-39.5, -184.6), basket(-30.5, -184.6), // the riva, either side of the pontile and its chest

    // Level 2: fire baskets down the quay edge of the fondamenta (clear of the two bridges), braziers before Santa
    // Croce's shut door, baskets either side of the Zitelle's portone, braziers at the hall's far corners where the
    // Governatrice fights, candelabra by her altar.
    ...[-95, -140, -200, -232, -270].map((x) => basket(x, 19.2)),
    brazier(-122, -12.4), brazier(-114, -12.4),
    basket(-247.5, 1.5), basket(-232.5, 1.5),
    brazier(-247, -17.6, 0.8), brazier(-233, -17.6, 0.8),
    candelabrum(-243.2, -24, 0.8), candelabrum(-236.8, -24, 0.8),

    // Level 3: baskets on the fondamenta San Giovanni and at the Punta's pier, at San Giorgio's landing; braziers either
    // side of the basilica's door, in the crossing's corners and the Cenacolo's (the Abate's hall), candelabra by the
    // high altar.
    basket(-320, 19.2), basket(-350, 19.2), basket(-403, 6.5), basket(-403, 13.5),
    basket(-446, 96.6), basket(-446, 103.4),
    brazier(-475.8, 97), brazier(-475.8, 107),
    brazier(-538.5, 81.5), brazier(-521.5, 81.5), brazier(-538.5, 122.5), brazier(-521.5, 122.5),
    candelabrum(-543, 97, 0.6), candelabrum(-543, 107, 0.6),
    brazier(-546, 6), brazier(-514, 6), brazier(-546, 34), brazier(-514, 34),
  );
  for (const z of [-145, -154, -163]) e.push(wall(-21.7, z, 1, 0), wall(-9.3, z, -1, 0)); // androne
  for (const s of spots) e.push({ ...s, nx: s.nx ?? 0, nz: s.nz ?? 0, color: s.color ?? (s.kind === 'torch' ? TORCH : s.kind === 'candle' ? WAX : FIRE), phase: 0 });
  e.forEach((t, i) => (t.phase = i * 12.9898));
  return e;
}

/** Sum of incommensurate sines: cheap, smooth, never repeats visibly; now and then a gust drags the fire down. */
function flicker(t: number, ph: number): number {
  const gust = Math.max(0, Math.sin(t * 0.9 + ph * 2.1));
  return 0.84 + 0.1 * Math.sin(t * 9.1 + ph) + 0.07 * Math.sin(t * 23.7 + ph * 1.7) + 0.05 * Math.sin(t * 4.3 + ph * 0.3) - 0.22 * gust ** 12;
}

function radial(size: number, stops: [number, string][]): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!, h = size / 2;
  const r = g.createRadialGradient(h, h, 0, h, h, h);
  for (const [at, col] of stops) r.addColorStop(at, col);
  g.fillStyle = r;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

export const DOT = radial(32, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]);
/** The light a fire throws on its stone: bright under it, a long soft fall-off. */
const POOLTEX = radial(64, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [0.6, 'rgba(255,255,255,0.15)'], [1, 'rgba(255,255,255,0)']]);

/**
 * Flames: a camera-facing quad per flame, standing on its base (half towards the camera's up, half the world's, so a
 * steep camera still sees a tall flame), drawn as a licking tongue of fbm noise from a white-gold core to red edges.
 * A basic material with its shader patched, so fx/occlusion.ts can still fade a torch with its lowered wall.
 */
function flameMaterial(time: { value: number }): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = 'attribute float aPhase;\nvarying vec2 vFlame;\nvarying float vPhase;\n' + sh.vertexShader.replace('#include <project_vertex>', /* glsl */ `
      vFlame = position.xy + vec2(0.5, 0.0);
      vPhase = aPhase;
      vec4 base = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      vec2 size = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
      vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 up = normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]) + vec3(0.0, 1.0, 0.0));
      vec4 mvPosition = viewMatrix * vec4(base.xyz + right * position.x * size.x + up * position.y * size.y, 1.0);
      gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = 'uniform float uTime;\nvarying vec2 vFlame;\nvarying float vPhase;\n' + /* glsl */ `
      float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float fn(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f); return mix(mix(fh(i), fh(i + vec2(1, 0)), u.x), mix(fh(i + vec2(0, 1)), fh(i + vec2(1, 1)), u.x), u.y); }
      ` + sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', /* glsl */ `
      vec2 p = vec2(vFlame.x * 2.0 - 1.0, vFlame.y);
      float t = uTime + vPhase;
      float q = fn(vec2(p.x * 3.0 + vPhase, p.y * 4.0 - t * 4.2)) * 0.62 + fn(vec2(p.x * 7.0 - vPhase, p.y * 9.0 - t * 7.3)) * 0.38;
      p.x += (q - 0.5) * 0.5 * p.y; // licks sideways, more towards the tip
      float w = 0.9 * (1.0 - p.y) * sqrt(p.y * 1.4 + 0.06); // a teardrop, widest a third of the way up
      float body = smoothstep(w, w * 0.2, abs(p.x)) * smoothstep(0.0, 0.07, p.y);
      float k = body * smoothstep(1.0, 0.3, p.y + q * 0.5);
      if (k < 0.01) discard;
      vec3 fire = mix(vec3(1.1, 0.1, 0.015), vec3(2.4, 0.72, 0.1), smoothstep(0.05, 0.55, k));
      fire = mix(fire, vec3(3.6, 2.3, 0.8), smoothstep(0.62, 1.0, k));
      vec4 diffuseColor = vec4(fire * k, 1.0);`);
  };
  m.customProgramCacheKey = () => 'flame';
  return m;
}

export class Torches {
  readonly root = new THREE.Group();
  /** Light multiplier per kind ("Stile Diablo": torches and braziers brighter, the church's lamps and window glows dimmer). */
  boost: Partial<Record<Kind, number>> = {};
  /** Brazier and basket flame size multiplier, and how far over the bowl their light hangs: seen from above (Diablo view) a
   * tall flame and a light just over the wide bowl would blow out to a white disc. */
  brazierFlame = 1;
  brazierLift = 0.5;
  static readonly POOL = POOL;
  readonly em: Emitter[]; // every flame (audio/director.ts: the nearest crackle)
  private readonly flames: number[]; // emitters drawing a flame
  private readonly lit: number[]; // emitters competing for the light pool
  private readonly glows: number[]; // emitters painting their light on the floor
  private readonly lights: THREE.PointLight[] = [];
  private pool = POOL;
  private readonly flame: THREE.InstancedMesh;
  private readonly floorGlow: THREE.InstancedMesh;
  private readonly wallGlow: THREE.InstancedMesh;
  private readonly walls: number[]; // torches, in wallGlow's order
  private readonly order: number[];
  private readonly dist: Float32Array;
  private readonly time = { value: 0 };
  private coals?: THREE.MeshStandardMaterial; // the brazier's glowing coals, breathing with the fire
  // sparks: spat off every fire; embers: drift up round the nearest
  private readonly spark: { e: number; age: number; life: number; vx: number; vy: number; vz: number }[] = [];
  private readonly sparkPos: Float32Array;
  private readonly sparkCol: Float32Array;
  private readonly sparkGeo = new THREE.BufferGeometry();
  private readonly ember: { age: number; life: number; vy: number; sway: number; ph: number }[] = [];
  private readonly emberPos = new Float32Array(EMBERS * 3);
  private readonly emberCol = new Float32Array(EMBERS * 3);
  private readonly emberGeo = new THREE.BufferGeometry();
  private embers = EMBERS;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();
  private readonly c = new THREE.Color();

  /** `ground(x, z, feet)`: the floor under a free-standing fire (World.groundAt), -Infinity if none. */
  constructor(spots: LightSpot[] = [], ground?: (x: number, z: number, feet: number) => number) {
    this.root.name = 'fx:torches';
    this.em = layout(spots);
    if (ground) for (const e of this.em) {
      const lift = KIND[e.kind].lift;
      if (!lift || e.nx || e.nz) continue;
      const g = ground(e.x, e.z, e.y - lift + 0.3);
      if (g > -Infinity) e.y = g + lift;
    }
    this.em.push(...this.em.flatMap((e) => e.kind !== 'candelabrum' ? [] : TIPS.map(([x, y, z]): Emitter => { // its candles
      const h = PROP.candelabrum!.h, a = e.phase, ca = Math.cos(a), sa = Math.sin(a);
      return { x: e.x + (x * ca + z * sa) * h, y: e.y - KIND.candelabrum.lift + y * h, z: e.z + (-x * sa + z * ca) * h, nx: 0, nz: 0, kind: 'candle', color: WAX, phase: e.phase + y * 7 };
    })));
    const n = this.em.length, pick = (f: (e: Emitter) => boolean) => this.em.flatMap((e, i) => (f(e) ? [i] : []));
    this.flames = pick((e) => KIND[e.kind].flame[0] > 0);
    this.lit = pick((e) => KIND[e.kind].power > 0);
    this.glows = pick((e) => KIND[e.kind].glow > 0);
    this.walls = pick((e) => e.kind === 'torch');
    this.order = [...this.lit];
    this.dist = new Float32Array(n);

    const phases = new THREE.InstancedBufferAttribute(Float32Array.from(this.flames, (i) => this.em[i].phase % 100), 1);
    this.flame = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).setAttribute('aPhase', phases), flameMaterial(this.time), this.flames.length);
    this.flame.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.flame.frustumCulled = false; // instances span the whole site

    // Painted light: a disc on the floor under each fire, a tall patch on the wall behind each torch.
    const glowMat = () => new THREE.MeshBasicMaterial({ map: POOLTEX, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.floorGlow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), glowMat(), this.glows.length);
    this.glows.forEach((i, k) => {
      const e = this.em[i], r = KIND[e.kind].glow * 2, fy = e.nx || e.nz ? e.y - 2.75 : e.y - KIND[e.kind].lift;
      const gy = ground && (e.nx || e.nz) ? ground(e.x + e.nx * 0.8, e.z + e.nz * 0.8, fy + 0.3) : -Infinity;
      this.m.makeScale(r, 1, r).setPosition(e.x + e.nx * 0.7, (gy > -Infinity ? gy : fy) + 0.03, e.z + e.nz * 0.7);
      this.floorGlow.setMatrixAt(k, this.m);
      this.floorGlow.setColorAt(k, this.c.setRGB(0, 0, 0));
    });
    this.wallGlow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glowMat(), this.walls.length);
    this.walls.forEach((i, k) => {
      const e = this.em[i];
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), Math.atan2(e.nx, e.nz));
      this.m.compose(this.v.set(e.x - e.nx * 0.29, e.y + 0.15, e.z - e.nz * 0.29), this.q, this.sc.set(2.6, 3.2, 1));
      this.wallGlow.setMatrixAt(k, this.m);
      this.wallGlow.setColorAt(k, this.c.setRGB(0, 0, 0));
    });
    for (const im of [this.floorGlow, this.wallGlow]) {
      im.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.renderOrder = 1; // over the floor, under the flames
    }
    this.flame.renderOrder = 2;
    this.root.add(this.floorGlow, this.wallGlow, this.flame);

    for (let i = 0; i < POOL; i++) {
      const l = new THREE.PointLight(TORCH, 0, 13, 1.6);
      this.lights.push(l);
      this.root.add(l);
    }

    // Sparks: one Points buffer for every emitter, fading through vertex colour.
    this.em.forEach((t, e) => {
      for (let k = 0; k < KIND[t.kind].sparks; k++) this.spark.push({ e, age: Math.random() * 2, life: 0, vx: 0, vy: 0, vz: 0 });
    });
    this.sparkPos = new Float32Array(this.spark.length * 3);
    this.sparkCol = new Float32Array(this.spark.length * 3);
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparkGeo.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3).setUsage(THREE.DynamicDrawUsage));
    const points = (geo: THREE.BufferGeometry, size: number) => {
      const p = new THREE.Points(geo, new THREE.PointsMaterial({ size, map: DOT, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
      p.frustumCulled = false;
      this.root.add(p);
    };
    points(this.sparkGeo, 0.07);
    for (let k = 0; k < EMBERS; k++) this.ember.push({ age: 0, life: -1, vy: 0, sway: 0, ph: k * 1.7 });
    this.emberGeo.setAttribute('position', new THREE.BufferAttribute(this.emberPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.emberGeo.setAttribute('color', new THREE.BufferAttribute(this.emberCol, 3).setUsage(THREE.DynamicDrawUsage));
    points(this.emberGeo, 0.11);

    this.update(0, 0, new THREE.Vector3()); // flames in place before fx/occlusion.ts reads their bounds
    void this.props();
  }

  /** The Meshy iron: one instanced mesh per prop and grid cell. */
  private async props(): Promise<void> {
    const gltf = await loadModel('fuoco.glb').catch((e) => { console.error('fire props failed to load', e); return undefined; });
    if (!gltf) return;
    gltf.scene.updateMatrixWorld(true);
    const { m, q, v, sc } = this;
    gltf.scene.traverse((o) => {
      const src = o as THREE.Mesh;
      if (!src.isMesh) return;
      const kinds = (Object.keys(PROP) as Kind[]).filter((k) => PROP[k]!.model === src.name);
      const cells = new Map<string, Emitter[]>();
      for (const e of this.em) if (kinds.includes(e.kind)) {
        const key = `${Math.floor(e.x / CELL)},${Math.floor(e.z / CELL)}`;
        cells.set(key, [...cells.get(key) ?? [], e]);
      }
      if (!cells.size) return;
      const mat = src.material as THREE.MeshStandardMaterial, iron = src.name !== 'cesto'; // the basket stands on Istrian stone
      mat.metalness = iron ? 0.45 : 0.1;
      mat.roughness = iron ? 0.5 : 0.8;
      if (mat.emissiveMap) this.coals = mat; // the brazier's coals (an emissive mask)
      else {
        mat.emissiveMap = mat.map;
        mat.emissive.setScalar(GLOW);
      }
      for (const list of cells.values()) {
        const im = new THREE.InstancedMesh(src.geometry, mat, list.length);
        list.forEach((e, i) => {
          const p = PROP[e.kind]!, wallside = e.nx || e.nz;
          q.setFromAxisAngle(v.set(0, 1, 0), wallside ? Math.atan2(e.nx, e.nz) : e.phase);
          m.compose(v.set(e.x + e.nx * p.out, e.y - p.drop, e.z + e.nz * p.out), q, sc.setScalar(p.h));
          im.setMatrixAt(i, m.multiply(src.matrixWorld)); // meshopt's dequantisation lives on the node
        });
        im.castShadow = src.name !== 'torcia'; // on the wall, the moon never sees a torch's shadow
        im.receiveShadow = true;
        im.computeBoundingSphere();
        this.root.add(im);
      }
    });
  }

  /** Light only `n` of the POOL lights (the quality ladder's ultra-light rungs, which also halve the embers): the rest are
   * hidden, so they leave the shader's light count at once and the programs change (fx/atmosphere.ts disposes and warms them). */
  setPool(n: number): void {
    this.pool = n;
    this.lights.forEach((l, k) => (l.visible = k < n));
    this.embers = n < POOL ? EMBERS / 2 : EMBERS;
  }

  update(t: number, dt: number, focus: THREE.Vector3): void {
    const { em, m, q, sc, v, c } = this;
    this.time.value = t;
    q.identity();
    this.flames.forEach((i, k) => {
      const e = em[i], f = flicker(t, e.phase), [w, h] = KIND[e.kind].flame, big = e.kind === 'brazier' || e.kind === 'basket' ? this.brazierFlame : 1;
      m.compose(v.set(e.x, e.y - h * 0.06 * big, e.z), q, sc.set(w * big * (0.92 + 0.1 * f), h * big * (0.6 + 0.5 * f), 1));
      this.flame.setMatrixAt(k, m);
    });
    this.flame.instanceMatrix.needsUpdate = true;
    for (const i of this.lit) this.dist[i] = Math.hypot(em[i].x - focus.x, em[i].y - focus.y, em[i].z - focus.z);
    if (this.coals) this.coals.emissiveIntensity = 1.8 * flicker(t * 0.7, 3);

    // Painted light: as bright as the fire, a little more for the ones without a real light.
    const glow = (im: THREE.InstancedMesh, list: number[], k0: number) => list.forEach((i, k) => {
      const e = em[i], f = flicker(t, e.phase) * (this.boost[e.kind] ?? 1) * k0;
      im.setColorAt(k, c.setHex(e.color).multiplyScalar(e.kind === 'candelabrum' ? f * 0.5 : f));
    });
    glow(this.floorGlow, this.glows, 0.3);
    glow(this.wallGlow, this.walls, 0.2);
    this.floorGlow.instanceColor!.needsUpdate = this.wallGlow.instanceColor!.needsUpdate = true;

    // Light pool: nearest `pool` fires. Each fades out as it nears the distance of the
    // first fire left without a light, so hand-overs never pop.
    this.order.sort((a, b) => this.dist[a] - this.dist[b]);
    const n = this.pool, cut = this.order.length > n ? this.dist[this.order[n]] : Infinity;
    for (let k = 0; k < POOL; k++) {
      const l = this.lights[k], i = this.order[k];
      if (i === undefined || k >= n) { l.intensity = 0; continue; }
      const e = em[i], K = KIND[e.kind], w = Math.min(1, Math.max(0, (cut - this.dist[i]) / 4)), bowl = e.kind === 'brazier' || e.kind === 'basket';
      l.position.set(e.x + e.nx * 0.6, e.y + (bowl ? this.brazierLift : e.kind === 'torch' ? 0.3 : 0), e.z + e.nz * 0.6);
      l.color.setHex(e.color);
      l.distance = K.reach;
      l.decay = K.decay;
      l.intensity = K.power * (e.kind === 'glow' ? 1 : flicker(t, e.phase)) * w * (this.boost[e.kind] ?? 1);
    }

    // Sparks: rise with buoyancy and a little drift, cool from gold to dark red.
    for (let k = 0; k < this.spark.length; k++) {
      const p = this.spark[k], e = em[p.e], o = k * 3;
      p.age += dt;
      if (p.age >= p.life) {
        p.age = 0;
        const big = e.kind !== 'torch';
        p.life = 0.6 + Math.random() * (big ? 1.8 : 1.2);
        const r = big ? 0.4 : 0.07;
        this.sparkPos[o] = e.x + (Math.random() - 0.5) * r;
        this.sparkPos[o + 1] = e.y + 0.15;
        this.sparkPos[o + 2] = e.z + (Math.random() - 0.5) * r;
        p.vx = (Math.random() - 0.5) * 0.4 + e.nx * 0.1;
        p.vy = 0.6 + Math.random() * (big ? 1.1 : 0.7);
        p.vz = (Math.random() - 0.5) * 0.4 + e.nz * 0.1;
      }
      p.vx += (Math.random() - 0.5) * 2.4 * dt;
      p.vz += (Math.random() - 0.5) * 2.4 * dt;
      this.sparkPos[o] += p.vx * dt;
      this.sparkPos[o + 1] += p.vy * dt;
      this.sparkPos[o + 2] += p.vz * dt;
      const a = 1 - p.age / p.life, h = a * a * 4;
      this.sparkCol[o] = h * 1.6;
      this.sparkCol[o + 1] = h * 0.55 * a;
      this.sparkCol[o + 2] = h * 0.12 * a;
    }
    this.sparkGeo.attributes.position.needsUpdate = this.sparkGeo.attributes.color.needsUpdate = true;

    // Embers: born over one of the six nearest fires (none past 30 m), they wander up into the dark for seconds,
    // swaying, winking, cooling; the wind carries them a little.
    const near = this.order.filter((i) => KIND[em[i].kind].sparks > 0 && this.dist[i] < 30).slice(0, 6);
    for (let k = 0; k < EMBERS; k++) {
      const p = this.ember[k], o = k * 3;
      p.age += dt;
      if (p.age >= p.life) {
        const i = near[(Math.random() * near.length) | 0];
        if (i === undefined || k >= this.embers) { p.life = 0.5 + Math.random(); p.age = 0; this.emberCol[o] = this.emberCol[o + 1] = this.emberCol[o + 2] = 0; continue; }
        const e = em[i], r = e.kind === 'torch' ? 0.15 : 0.5;
        p.age = 0;
        p.life = 3 + Math.random() * 4;
        p.vy = 0.25 + Math.random() * 0.45;
        p.sway = 0.2 + Math.random() * 0.35;
        this.emberPos[o] = e.x + e.nx * 0.2 + (Math.random() - 0.5) * r;
        this.emberPos[o + 1] = e.y + 0.3 + Math.random() * 0.4;
        this.emberPos[o + 2] = e.z + e.nz * 0.2 + (Math.random() - 0.5) * r;
      }
      this.emberPos[o] += (Math.sin(t * 0.8 + p.ph) * p.sway + 0.08) * dt;
      this.emberPos[o + 1] += p.vy * dt;
      this.emberPos[o + 2] += Math.cos(t * 0.67 + p.ph * 1.3) * p.sway * dt;
      const a = p.age / p.life, life = Math.min(1, a * 6) * (1 - a) * (1 - a), wink = 0.55 + 0.45 * Math.sin(t * 11 + p.ph * 5);
      const h = life * wink * 3;
      this.emberCol[o] = h * 1.5;
      this.emberCol[o + 1] = h * (0.25 + 0.4 * (1 - a));
      this.emberCol[o + 2] = h * 0.05;
    }
    this.emberGeo.attributes.position.needsUpdate = this.emberGeo.attributes.color.needsUpdate = true;
  }
}
