import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { arm, loadModel } from '../core/models.ts';
import { GEAR, type GearState, type Slot } from '../loot/gear.ts';

// What the hero wears, on the hero (WoW's paper doll): every visible slot shows its piece, and a full set reads as one
// look, like WoW's tier sets and Diablo's class sets in the Redentore's Venetian gothic. Eight looks, one per item family:
//   becchino   level 1 green, the strong pieces: the plague's gravedigger, beak mask, leather and rusty iron, bone
//   chierico   level 1 green, the casters': a cleric, black cassock, white cotta, saturno hat, crimson mozzetta and stole
//   arsenale   level 1 blue, strong: the Arsenale's steel, a crested morion with a plume, brass, the Scuola Grande's crimson
//   murano     level 1 blue, casters: Murano glass and fire, a crown of glass, teal and gold vestments, amber glass alight
//   voto       level 1 purple: the Reverendissimo's second vow, blackened steel and gold, skulls, a mitre, violet fire
//   gondola    level 2 green: the drowned gondolier, straw boater, striped shirt, crimson sash, rope, a codega's lantern
//   merletto   level 2 blue: the Pia Casa's black and lace on the squero's tarred iron, a tricorn, silver
//   broccato   level 2 purple: the Governatrice's gold brocade, lace and pearls, a crown and veil, a standing lace collar,
//              spectral cyan
// The hemp starter set is the Risorto's own body. The pieces are put together here out of a few shapes, each on a bone
// (helm on the head, pauldrons on the collarbones, cuirass on the chest, bracers, tassets and greaves on the limbs), then
// baked into the body's own skinned space and merged by material: the whole outfit is one draw per material, moved by
// the body's skeleton. Under them the body is dyed per region in its shader (hood, robe, gloves, leggings, boots: the
// dark cloth takes the set's colour, bone and skin keep theirs unless gloves or boots cover them) and its own bone
// pauldrons are pulled in under new ones. Weapons are the Meshy props the enemies carry, or built here for the two
// nobody does. What is swapped out is disposed.

type Look = 'becchino' | 'chierico' | 'arsenale' | 'murano' | 'voto' | 'gondola' | 'merletto' | 'broccato';
/** Body regions, dyed by the slot that covers them. */
const HEAD = 0, SHOULDER = 1, TORSO = 2, ARM = 3, HAND = 4, HIPS = 5, LEG = 6, FOOT = 7;
const REGION_SLOT: Slot[] = ['testa', 'spalle', 'torso', 'spalle', 'mani', 'torso', 'gambe', 'piedi'];
const REGION: Record<string, number> = {
  Head: HEAD, neck: HEAD, head_end: HEAD, headfront: HEAD, LeftShoulder: SHOULDER, RightShoulder: SHOULDER,
  Spine: TORSO, Spine01: TORSO, Spine02: TORSO, LeftArm: ARM, RightArm: ARM, LeftForeArm: HAND, LeftHand: HAND, RightForeArm: HAND, RightHand: HAND,
  Hips: HIPS, LeftUpLeg: LEG, RightUpLeg: LEG, LeftLeg: LEG, RightLeg: LEG, LeftFoot: FOOT, RightFoot: FOOT, LeftToeBase: FOOT, RightToeBase: FOOT,
};
const SHIN = 0.36; // m: the leg's skin below this is the boot's (piedi), above it the leggings' (gambe)

/** The look an item shows: by its quality, its level and whom it is for (a caster's piece leans on Intelletto first). */
export function lookOf(id: string): Look | undefined {
  const it = GEAR.find((g) => g.id === id);
  if (!it || it.rarity === 'comune') return undefined;
  if (it.rarity === 'epico' || it.rarity === 'leggendario') return it.l2 ? 'broccato' : 'voto';
  if (it.l2) return it.rarity === 'raro' ? 'merletto' : 'gondola';
  const caster = Object.keys(it.stats ?? {})[0] === 'intelletto';
  return it.rarity === 'raro' ? (caster ? 'murano' : 'arsenale') : caster ? 'chierico' : 'becchino';
}

// --- materials: one of each, shared by every piece, never disposed (a few dozen at most)
type MatDef = [color: number, rough: number, metal: number, glow?: number];
const MATS: Record<string, MatDef> = {
  leather: [0x6b4529, 0.75, 0], leatherDark: [0x33231a, 0.8, 0], rust: [0x7a5238, 0.7, 0.4], iron: [0x666a70, 0.45, 0.6], bone: [0xddd1b4, 0.6, 0],
  steel: [0xb7c0ca, 0.28, 0.7], brass: [0xc99a42, 0.32, 0.75], gold: [0xe8b84c, 0.28, 0.8], black: [0x4a3c5c, 0.38, 0.5, 0.24], crimson: [0x9a1c1e, 0.65, 0],
  felt: [0x1d1a20, 0.85, 0], linen: [0xe8e2d4, 0.85, 0], violet: [0x5a2384, 0.55, 0.05], teal: [0x17607e, 0.45, 0.25], straw: [0xd8b468, 0.85, 0],
  rope: [0xa28a60, 0.9, 0], sea: [0x35573f, 0.8, 0], lace: [0xf2ede2, 0.85, 0, 0.18], tar: [0x2a2a2e, 0.45, 0.5], pearl: [0xf6f1e8, 0.25, 0.1, 0.2],
  silver: [0xd2d6dc, 0.28, 0.75], glass: [0x6a9a70, 0.15, 0.2, 0.5],
  amber: [0xff8a2a, 0.2, 0, 2.2], cobalt: [0x4a88ff, 0.2, 0, 1.8], violetFire: [0xc070ff, 0.3, 0, 2.4], cyanFire: [0x9af0ff, 0.3, 0, 2], ember: [0xffb050, 0.4, 0, 2.4],
};
/** Cloth and lace: seen from inside too. */
const TWO_SIDED = new Set(['felt', 'linen', 'lace', 'crimson', 'violet', 'teal', 'sea', 'straw']);
/** Accents that glow and breathe (`Outfit.update`). */
const GLOWS = ['amber', 'cobalt', 'violetFire', 'cyanFire', 'ember'];
const mats = new Map<string, THREE.MeshStandardMaterial>();
/**
 * Their GPU side freed, as fx/atmosphere.ts does to the scene's on a rung that relights it: those not worn right now aren't
 * in the scene, and would keep the old rung's programs.
 */
export function relight(): void {
  for (const m of mats.values()) m.dispose();
}
function mat(key: string): THREE.MeshStandardMaterial {
  let m = mats.get(key);
  if (m) return m;
  const [color, roughness, metalness, glow = 0] = MATS[key];
  m = new THREE.MeshStandardMaterial({ color, roughness, metalness, side: TWO_SIDED.has(key) ? THREE.DoubleSide : THREE.FrontSide });
  m.emissive.setHex(color).multiplyScalar(glow || 0.16); // a little self-glow, like the body's, so pieces read at night
  m.userData.shared = true; // the x-ray silhouettes and hit flashes leave it alone, disposal too
  mats.set(key, m);
  return m;
}

// --- shapes, put together in a socket's frame: metres, +X the hero's left (outward on a left limb), +Y up (down the
// limb for limbs), +Z ahead
type V3 = [number, number, number];
const ZERO: V3 = [0, 0, 0];
function mesh(geo: THREE.BufferGeometry, m: string, at: V3 = ZERO, rot: V3 = ZERO, scale: V3 | number = 1): THREE.Mesh {
  const o = new THREE.Mesh(geo, mat(m));
  o.name = m;
  o.position.set(...at);
  o.rotation.set(...rot);
  if (typeof scale === 'number') o.scale.setScalar(scale);
  else o.scale.set(...scale);
  return o;
}
const group = (...kids: THREE.Object3D[]) => new THREE.Group().add(...kids);
/** Surface of revolution about +Y through (radius, height) pairs, bottom first; `phi`/`len` a part of the turn (0 = +Z, π/2 = +X). */
function lathe(pts: number[], segs = 16, phi = 0, len = Math.PI * 2): THREE.LatheGeometry {
  const v: THREE.Vector2[] = [];
  for (let i = 0; i < pts.length; i += 2) v.push(new THREE.Vector2(Math.max(pts[i], 1e-4), pts[i + 1]));
  return new THREE.LatheGeometry(v, segs, phi, len);
}
/** A dome's profile, rim to pole: radius `r`, down to `theta` from the pole, heights × `flat`. */
function cap(r: number, theta = Math.PI / 2, flat = 1, n = 6): number[] {
  const pts: number[] = [];
  for (let i = n; i >= 0; i--) { const t = (theta * i) / n; pts.push(r * Math.sin(t), r * Math.cos(t) * flat); }
  return pts;
}
/** A rolled rim: a ring of round section `t` at radius `R`, height `y`. */
const rim = (R: number, y: number, t: number, segs = 16, phi = 0, len = Math.PI * 2) =>
  lathe([R, y - t, R + t, y - t * 0.6, R + t * 1.3, y, R + t, y + t * 0.6, R, y + t], segs, phi, len);
const cone = (r: number, h: number, segs = 6) => new THREE.ConeGeometry(r, h, segs).translate(0, h / 2, 0); // base at the origin, tip up
const ball = (r: number, ws = 10, hs = 7) => new THREE.SphereGeometry(r, ws, hs);
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
const Y = new THREE.Vector3(0, 1, 0);
/** `o` turned so its +Y points along `dir`. */
function along<T extends THREE.Object3D>(o: T, dir: V3): T {
  o.quaternion.setFromUnitVectors(Y, new THREE.Vector3(...dir).normalize());
  return o;
}
/** `g` (a lathe) made wavy round its turn, `amp` m in and out: a frill, lace. */
function frilled(g: THREE.BufferGeometry, amp: number): THREE.BufferGeometry {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z), k = 1 + (amp / Math.max(r, 1e-4)) * Math.sin(Math.atan2(x, z) * 14); p.setX(i, x * k); p.setZ(i, z * k); }
  g.computeVertexNormals();
  return g;
}
/** A skull facing +Z: cranium, jaw, sockets (lit by `eyes`). */
function skull(s: number, m = 'bone', eyes = 'felt'): THREE.Group {
  const g = group(mesh(ball(s, 10, 8), m, ZERO, ZERO, [1, 0.95, 1.05]), mesh(box(s * 1.05, s * 0.5, s * 0.85), m, [0, -s * 0.85, s * 0.2]));
  for (const x of [-0.38, 0.38]) g.add(mesh(ball(s * 0.26, 6, 4), eyes, [x * s, -s * 0.12, s * 0.84]));
  return g;
}
const gem = (s: number, m: string, at: V3) => mesh(new THREE.OctahedronGeometry(s), m, at, ZERO, [0.75, 1, 0.75]);

// --- the body: rest-pose measures and frames on its bones

/** Rest-pose measures of the body, and the frames on its bones that pieces are built in. */
class Fit {
  readonly bones: THREE.Bone[];
  readonly names: string[];
  private rest: THREE.Matrix4[];
  private model = new THREE.Quaternion();
  readonly pos: Float32Array; // every vertex at rest, world
  readonly dom: Uint8Array; // its strongest bone
  /** Per bone: the body's own (skinned) coordinates to the world, at rest. */
  readonly skin: THREE.Matrix4[];
  readonly feet: number;

  constructor(root: THREE.Object3D, body: THREE.SkinnedMesh) {
    root.updateMatrixWorld(true);
    root.getWorldQuaternion(this.model);
    const sk = body.skeleton;
    this.bones = sk.bones;
    this.names = sk.bones.map((b) => b.name);
    this.rest = sk.bones.map((b) => b.matrixWorld.clone());
    this.skin = sk.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, sk.boneInverses[i]).multiply(body.bindMatrix));
    // Rest positions as the skinning lays them (the GLB's quantized positions only mean something through it).
    const g = body.geometry, p = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const v = new THREE.Vector3(), t = new THREE.Vector3(), acc = new THREE.Vector3();
    this.pos = new Float32Array(p.count * 3);
    this.dom = new Uint8Array(p.count);
    let feet = Infinity;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      acc.set(0, 0, 0);
      let best = 0, bw = -1;
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k), b = si.getComponent(i, k);
        if (w > bw) { bw = w; best = b; }
        if (w > 0) acc.addScaledVector(t.copy(v).applyMatrix4(this.skin[b]), w);
      }
      this.pos.set([acc.x, acc.y, acc.z], i * 3);
      feet = Math.min(feet, acc.y);
      this.dom[i] = best;
    }
    this.feet = feet;
  }

  bone(name: string): number {
    return this.names.indexOf(name);
  }

  private joint(name: string): THREE.Vector3 {
    return new THREE.Vector3().setFromMatrixPosition(this.rest[this.bone(name)]);
  }

  /**
   * The rest-pose world frame of a socket on `bone`: the model's axes, or down the limb toward the bone `toward` (away
   * from it if it starts with '-'), +Z then still as near ahead as it goes.
   */
  frame(bone: string, toward?: string): THREE.Matrix4 {
    const at = this.joint(bone), m = new THREE.Matrix4().makeRotationFromQuaternion(this.model);
    if (toward) {
      const y = toward.startsWith('-') ? at.clone().sub(this.joint(toward.slice(1))).normalize() : this.joint(toward).sub(at).normalize();
      const z = new THREE.Vector3(0, 0, 1).applyQuaternion(this.model);
      z.addScaledVector(y, -z.dot(y)).normalize();
      m.makeBasis(new THREE.Vector3().crossVectors(y, z), y, z);
    }
    return m.setPosition(at);
  }

  /** Where `bone`'s joint is, at rest, in the frame of `on`/`toward`. */
  at(bone: string, on: string, toward?: string): THREE.Vector3 {
    return this.joint(bone).applyMatrix4(this.frame(on, toward).invert());
  }

  /** The rest-pose vertices led by `bones`, in the frame of `on`/`toward`. */
  points(bones: string[], on: string, toward?: string): THREE.Vector3[] {
    const inv = this.frame(on, toward).invert(), ids = new Set(bones.map((b) => this.bone(b))), out: THREE.Vector3[] = [];
    for (let i = 0; i < this.dom.length; i++) if (ids.has(this.dom[i])) out.push(new THREE.Vector3().fromArray(this.pos, i * 3).applyMatrix4(inv));
    return out;
  }

  /** How far from the limb's axis its vertices between `y0` and `y1` m down it reach, quantile `q` (spikes and rags past it). */
  girth(bones: string[], on: string, toward: string, y0: number, y1: number, q: number): number {
    return quantile(this.points(bones, on, toward).filter((p) => p.y >= y0 && p.y <= y1).map((p) => Math.hypot(p.x, p.z)), q);
  }
}

function quantile(xs: number[], q: number): number {
  xs.sort((a, b) => a - b);
  return xs.length ? xs[Math.min(xs.length - 1, Math.floor(q * xs.length))] : 0;
}

/** The measures pieces are cut to, in their sockets' frames (m). */
interface Dress {
  /** Head frame: the top of the hood (its middle), the hood's half-width and half-depth, the face (front of the hood at eye height). */
  crown: THREE.Vector3; hoodX: number; hoodZ: number; face: THREE.Vector3;
  /** Left collarbone frame: the shoulder ball. */
  ball: THREE.Vector3;
  /** Upper spine (Spine01) frame: the chest's middle and half-sizes; the neck's base. */
  chest: THREE.Vector3; chestR: THREE.Vector3; neck: THREE.Vector3;
  /** Hips frame: the belt's middle and half-sizes. */
  waist: THREE.Vector3; waistR: THREE.Vector3;
  /** Limbs: girths and lengths (left; the right matches). */
  fore: number; foreLen: number; thigh: number; thighLen: number; shin: number; shinLen: number; footLen: number;
}

function measure(f: Fit): Dress {
  const hood = f.points(['Head'], 'Head'), top = Math.max(...hood.map((p) => p.y)), peak = hood.filter((p) => p.y > top - 0.05);
  const crown = peak.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(Math.max(1, peak.length));
  const q = (ps: THREE.Vector3[], k: 'x' | 'y' | 'z', at: number) => quantile(ps.map((p) => p[k]), at);
  const eye = hood.filter((p) => Math.abs(p.y - 0.1) < 0.04);
  const ribs = f.points(['Spine', 'Spine01', 'Spine02'], 'Spine01');
  const l = f.at('LeftArm', 'Spine01'), r = f.at('RightArm', 'Spine01'), neck = f.at('neck', 'Spine01'), low = f.at('Spine02', 'Spine01');
  const front = q(ribs, 'z', 0.92), back = q(ribs, 'z', 0.1);
  const belt = f.points(['Hips'], 'Hips').filter((p) => Math.abs(p.y - 0.06) < 0.05);
  const wx = Math.max(-q(belt, 'x', 0.08), q(belt, 'x', 0.92)), wf = q(belt, 'z', 0.92), wb = q(belt, 'z', 0.08);
  const len = (a: string, b: string) => f.at(b, a, b).y;
  return {
    crown, hoodX: Math.max(-q(hood, 'x', 0.03), q(hood, 'x', 0.97)), hoodZ: (q(hood, 'z', 0.97) - q(hood, 'z', 0.03)) / 2,
    face: new THREE.Vector3(0, 0.1, q(eye, 'z', 0.9)),
    ball: f.at('LeftArm', 'LeftShoulder'),
    chest: new THREE.Vector3(0, (neck.y + low.y) / 2, (front + back) / 2), chestR: new THREE.Vector3(Math.abs(l.x - r.x) * 0.36, (neck.y - low.y) / 2, (front - back) / 2), neck,
    waist: new THREE.Vector3(0, 0.06, (wf + wb) / 2), waistR: new THREE.Vector3(wx, 0.05, (wf - wb) / 2),
    fore: f.girth(['LeftForeArm'], 'LeftForeArm', 'LeftHand', 0.05, 0.2, 0.8), foreLen: len('LeftForeArm', 'LeftHand'),
    thigh: f.girth(['LeftUpLeg'], 'LeftUpLeg', 'LeftLeg', 0.08, 0.3, 0.6), thighLen: len('LeftUpLeg', 'LeftLeg'),
    shin: f.girth(['LeftLeg'], 'LeftLeg', 'LeftFoot', 0.15, 0.38, 0.6), shinLen: len('LeftLeg', 'LeftFoot'), footLen: len('LeftFoot', 'LeftToeBase'),
  };
}

/** A piece on a bone: `o` built in the frame of `on` (down the limb toward `toward`), mirrored left to right if `mirror`. */
interface Placed { on: string; toward?: string; o: THREE.Object3D; mirror?: boolean }
const on = (bone: string, o: THREE.Object3D, toward?: string): Placed => ({ on: bone, toward, o });
/** The same piece on both sides: built for the left (`Left…` bones), mirrored onto the right. */
function both(bone: string, make: () => THREE.Object3D, toward?: string): Placed[] {
  const side = (s: string) => toward && (toward.startsWith('-') ? `-${s}${toward.slice(1)}` : `${s}${toward}`);
  return [{ on: `Left${bone}`, toward: side('Left'), o: make() }, { on: `Right${bone}`, toward: side('Right'), o: make(), mirror: true }];
}

// --- the pieces, by kind

interface PadOpts { r: number; metal: string; trim: string; lames?: number; flat?: number; spikes?: number; spike?: string; spikeLen?: number; skull?: string; gem?: string; frill?: string; boss?: string; studs?: string }
/**
 * A pauldron for the left shoulder: a shell over the shoulder ball, longer front to back, open toward the neck, a rolled
 * rim and a ridge over the top, `lames` bands below it down the arm; ornaments on the outside.
 */
function pauldron(d: Dress, o: PadOpts): THREE.Group {
  const g = new THREE.Group(), r = o.r, flat = o.flat ?? 0.9, phi = -0.2 * Math.PI, len = 1.4 * Math.PI, th = Math.PI * 0.5;
  const shell = group(mesh(lathe(cap(r, th, flat, 7), 18, phi, len), o.metal), mesh(rim(r * Math.sin(th), r * Math.cos(th) * flat, r * 0.07, 18, phi, len), o.trim));
  shell.add(mesh(new THREE.TorusGeometry(r * 0.995, r * 0.045, 4, 16, Math.PI), o.trim, ZERO, [0, Math.PI / 2, 0], [1, flat, 1])); // the ridge, front to back over the top
  shell.scale.set(1, 1, 1.18);
  g.add(shell);
  for (let i = 1; i <= (o.lames ?? 1); i++) { // bands down the outside of the arm, each a little narrower
    const rr = r * (1.02 - 0.09 * i), y = -r * 0.16 * i - r * 0.05;
    g.add(mesh(lathe([rr * 1.06, y - r * 0.2, rr, y], 16, 0.15 * Math.PI, 0.7 * Math.PI), o.metal, [r * 0.08 * i, 0, 0], ZERO, [1, 1, 1.15]));
    g.add(mesh(rim(rr * 1.06, y - r * 0.2, r * 0.045, 16, 0.15 * Math.PI, 0.7 * Math.PI), o.trim, [r * 0.08 * i, 0, 0], ZERO, [1, 1, 1.15]));
  }
  if (o.frill) g.add(mesh(frilled(lathe([r * 1.28, -r * 0.42, r * 1.14, -r * 0.24, r * 1.0, -r * 0.06], 30, phi, len), r * 0.07), o.frill, ZERO, ZERO, [1, 1, 1.15]));
  const n = o.spikes ?? 0;
  for (let i = 0; i < n; i++) { // up the ridge, front to back, the middle one tallest
    const a = (i - (n - 1) / 2) * 0.55;
    g.add(along(mesh(cone(r * 0.12, r * (o.spikeLen ?? 0.7) * (i === (n - 1) / 2 ? 1.35 : 1)), o.spike ?? o.trim, [r * 0.12, r * flat * Math.cos(a) * 0.92, r * Math.sin(a) * 1.08]), [0.35, 1, Math.sin(a) * 1.3]));
  }
  if (o.skull) { const s = skull(r * 0.32, 'bone', o.skull); s.position.set(r * 0.9, r * 0.12, 0); s.rotation.y = Math.PI / 2; g.add(s); }
  if (o.boss) g.add(mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.34, r * 0.08, 12).rotateZ(Math.PI / 2), o.boss, [r * 0.92, r * 0.18, 0], [0, 0, -0.5]));
  if (o.gem) g.add(gem(r * 0.15, o.gem, [r * 0.55, r * 0.72, r * 0.6]));
  if (o.studs) for (const a of [-0.5, 0, 0.5]) g.add(mesh(ball(r * 0.05, 6, 4), o.studs, [r * Math.sin(th) * 0.98, r * Math.cos(th) * flat + r * 0.03, Math.sin(a) * r * 1.1]));
  g.position.copy(d.ball).add(new THREE.Vector3(r * 0.05, r * 0.12, 0));
  g.rotation.z = -0.28; // the shell leans out over the arm
  return g;
}
const pads = (d: Dress, o: PadOpts) => both('Shoulder', () => pauldron(d, o));

/** A bracer down each forearm, flaring to the wrist, rims at both ends; spikes, a frill, a gem, claws over the fingers. */
function bracers(d: Dress, o: { metal: string; trim: string; r?: number; spikes?: number; spike?: string; frill?: string; claws?: string; gem?: string; bands?: number; cuff?: boolean }): Placed[] {
  const r = d.fore * (o.r ?? 1.1), L = d.foreLen, top = o.cuff ? 0.78 : 0.32; // a cuff: just the wrist
  const out = both('ForeArm', () => {
    const g = group(mesh(lathe([r * 0.92, L * top, r, L * Math.max(top, 0.5), r * 1.1, L * 0.8, r * 1.26, L * 0.98], 14), o.metal));
    g.add(mesh(rim(r * 0.92, L * top, r * 0.09, 14), o.trim), mesh(rim(r * 1.26, L * 0.98, r * 0.1, 14), o.trim));
    for (let i = 1; i < (o.bands ?? 0) + 1; i++) g.add(mesh(rim(r * (1 + 0.08 * i), L * (0.5 + 0.13 * i), r * 0.06, 14), o.trim));
    for (let i = 0; i < (o.spikes ?? 0); i++) g.add(along(mesh(cone(r * 0.2, r * 1.15), o.spike ?? o.trim, [r * 1.02, L * (0.5 + 0.18 * i), 0]), [1, -0.6, 0]));
    if (o.frill) g.add(mesh(frilled(lathe([r * 1.18, L * 0.95, r * 1.38, L * 1.0, r * 1.52, L * 1.07], 24), r * 0.12), o.frill));
    if (o.gem) g.add(gem(r * 0.28, o.gem, [0, L * 0.68, r * 1.12]));
    return g;
  }, 'Hand');
  if (o.claws) out.push(...both('Hand', () => group(...[-0.022, 0, 0.022].map((x) => along(mesh(cone(0.008, 0.075, 5), o.claws!, [x, 0.08, 0.035]), [0, 1, 0.35]))), '-ForeArm'));
  return out;
}

/** Thigh plates (tassets) down the front and outside of each thigh, and a cop on each knee. */
function tassets(d: Dress, o: { metal: string; trim: string; len?: number; lames?: number; knee?: string; skull?: string; cloth?: string }): Placed[] {
  const r = d.thigh * 1.08, L = d.thighLen * (o.len ?? 0.62), n = o.lames ?? 2, h = L / n;
  const out = both('UpLeg', () => {
    const g = new THREE.Group();
    for (let i = 0; i < n; i++) { // overlapping lames from the hip down, each a touch narrower
      const y = 0.04 + i * h * 0.92, rr = r * (1.06 - 0.03 * i);
      g.add(mesh(lathe([rr * 1.04, y + h, rr, y], 12, Math.PI * 0.05, Math.PI * 0.75), o.metal));
      g.add(mesh(rim(rr * 1.04, y + h, r * 0.035, 12, Math.PI * 0.05, Math.PI * 0.75), o.trim));
    }
    if (o.cloth) g.add(mesh(lathe([r * 1.02, L + 0.06, r * 1.08, 0.0], 12, -Math.PI * 0.15, Math.PI * 0.4), o.cloth));
    return g;
  }, 'Leg');
  out.push(...both('Leg', () => {
    const k = group(mesh(lathe(cap(d.shin * 0.5, Math.PI * 0.5, 0.6, 4), 10), o.knee ?? o.metal, [0, 0, d.shin * 0.85], [Math.PI / 2, 0, 0]));
    k.add(mesh(rim(d.shin * 0.5, 0, d.shin * 0.05, 10), o.trim, [0, 0, d.shin * 0.85], [Math.PI / 2, 0, 0]));
    if (o.skull) { const s = skull(d.shin * 0.2, 'bone', o.skull); s.position.set(0, 0, d.shin * 1.18); k.add(s); }
    return k;
  }, 'Foot'));
  return out;
}

/** Greaves down the front of each shin, a cuff at the knee, a cap over the toes. */
function greaves(d: Dress, o: { metal: string; trim: string; cap?: string; spike?: string; studs?: string; w?: number }): Placed[] {
  const r = d.shin * (o.w ?? 1.02), L = d.shinLen;
  return [
    ...both('Leg', () => {
      const g = group(mesh(lathe([r * 0.92, L * 0.92, r, L * 0.62, r * 1.12, L * 0.36], 12, -Math.PI * 0.42, Math.PI * 0.84), o.metal));
      g.add(mesh(rim(r * 1.12, L * 0.36, r * 0.1, 14), o.trim), mesh(rim(r * 0.92, L * 0.92, r * 0.07, 12, -Math.PI * 0.42, Math.PI * 0.84), o.trim));
      if (o.spike) g.add(along(mesh(cone(r * 0.2, r * 0.9), o.spike, [0, L * 0.38, r * 1.15]), [0, -0.7, 1]));
      if (o.studs) for (const y of [0.5, 0.65, 0.8]) g.add(mesh(ball(r * 0.07, 6, 4), o.studs, [0, L * y, r * (1.1 - 0.12 * y)]));
      return g;
    }, 'Foot'),
    ...both('Foot', () => group(mesh(lathe(cap(d.shin * 0.62, Math.PI * 0.5, 1.9, 5), 10, -Math.PI / 2, Math.PI), o.cap ?? o.metal, [0, d.footLen * 0.1, 0], ZERO, [1, 1, 0.85])), 'ToeBase'),
  ];
}

/** A belt round the waist with a buckle (or a skull lit by `skullEyes`) in front. */
function belt(d: Dress, m: string, buckle: string, w = 1, skullEyes?: string): Placed {
  const c = d.waist, r = d.waistR, g = group(mesh(rim(1, 0, 0.05 * w, 20), m, [c.x, c.y + 0.02, c.z], ZERO, [r.x * 1.08, 1, r.z * 1.12]));
  if (skullEyes) { const s = skull(0.035 * w, 'bone', skullEyes); s.position.set(c.x, c.y + 0.03, c.z + r.z * 1.2); g.add(s); }
  else g.add(mesh(box(0.065 * w, 0.055 * w, 0.02), buckle, [c.x, c.y + 0.02, c.z + r.z * 1.17]));
  return on('Hips', g);
}

/** A cuirass round the ribs: an open shell, a ridge down the front, a rolled neckline; `k` × the chest's girth. */
function cuirass(d: Dress, m: string, trim: string, k = 1.12, o: { ridge?: boolean; gem?: string; skull?: string } = {}): Placed {
  const c = d.chest, r = d.chestR, g = new THREE.Group(), shell = new THREE.Group();
  shell.add(mesh(lathe([0.86, -1.05, 1, -0.55, 1.04, 0, 0.98, 0.5, 0.8, 0.9, 0.55, 1.05], 18), m));
  shell.add(mesh(rim(0.55, 1.05, 0.06, 18), trim), mesh(rim(0.86, -1.05, 0.05, 18), trim));
  shell.scale.set(r.x * k, r.y, r.z * k);
  g.add(shell);
  g.position.copy(c);
  if (o.ridge !== false) g.add(mesh(box(0.016, r.y * 1.7, 0.02), trim, [0, 0, r.z * k * 1.02], [0.08, 0, 0]));
  if (o.gem) g.add(gem(0.03, o.gem, [0, r.y * 0.3, r.z * k * 1.06]));
  if (o.skull) { const s = skull(0.045, 'bone', o.skull); s.position.set(0, r.y * 0.25, r.z * k * 1.08); g.add(s); }
  return on('Spine01', g);
}

/** A short cape round the shoulders (a mozzetta, a capelet), open in front, its hem rolled in `hem`. */
function capelet(d: Dress, m: string, hem: string, long = 1): Placed {
  const n = d.neck, R = d.chestR.x * 1.45, h = 0.15 * long, phi = Math.PI * 0.1, len = Math.PI * 1.8;
  const g = group(mesh(lathe([R, -h, R * 0.92, -h * 0.6, R * 0.72, -h * 0.2, R * 0.48, 0.0, R * 0.38, 0.03], 22, phi, len), m), mesh(rim(R, -h, 0.01, 22, phi, len), hem));
  g.position.set(0, n.y - 0.0, d.chest.z - 0.015);
  g.scale.set(1, 1, 0.78);
  return on('Spine01', g);
}

/** A cape down the back from the shoulders to the thighs. */
function cape(d: Dress, m: string, hem: string, long = 1): Placed {
  const n = d.neck, R = d.chestR.x * 1.25, h = 0.58 * long, phi = Math.PI * 0.56, len = Math.PI * 0.88;
  const cloth = lathe([R * 1.75, -h, R * 1.45, -h * 0.55, R * 1.18, -h * 0.22, R * 0.95, -0.02, R * 0.7, 0.03], 16, phi, len), p = cloth.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < -h * 0.9) p.setY(i, p.getY(i) + (i % 2 ? 0.035 : -0.01)); // a ragged hem
  cloth.computeVertexNormals();
  const g = group(mesh(cloth, m), mesh(rim(R * 0.72, 0.03, 0.012, 16, phi, len), hem));
  g.position.set(0, n.y, d.chest.z - 0.02);
  g.scale.set(1, 1, 0.8);
  return on('Spine01', g);
}

/** A head piece set on the crown of the hood, `drop` m down into it, leaning back `tilt`. */
const crowned = (d: Dress, o: THREE.Object3D, drop = 0.05, tilt = -0.12): Placed => {
  o.position.add(new THREE.Vector3(d.crown.x, d.crown.y - drop, d.crown.z));
  o.rotation.x += tilt;
  return on('Head', o);
};

// --- the looks

/** Dye of the body regions under a slot: colour, strength (1), cover (bone and skin dyed too), stripes (a metre). */
interface Dye { color: number; k?: number; cover?: number; stripes?: number }
type Shown = 'testa' | 'spalle' | 'torso' | 'mani' | 'gambe' | 'piedi';
const SHOWN: Shown[] = ['testa', 'spalle', 'torso', 'mani', 'gambe', 'piedi'];
type Kit = Record<Shown, (d: Dress) => Placed[]> & { dye: Partial<Record<Shown, Dye>> };

const KITS: Record<Look, Kit> = {
  becchino: {
    dye: { testa: { color: 0x3a2618 }, spalle: { color: 0x3a2618 }, torso: { color: 0x4a3020 }, mani: { color: 0x5b3b24, cover: 0.85 }, gambe: { color: 0x3a2a1c }, piedi: { color: 0x2b1d15, cover: 0.7 } },
    testa: (d) => {
      const hat = group(mesh(lathe([0.215, -0.02, 0.2, 0.0, 0.11, 0.012, 0.1, 0.09, 0.085, 0.1, 0.0, 0.105], 18), 'leatherDark'), mesh(rim(0.103, 0.03, 0.012), 'rust'));
      const f = d.face, beak = group(along(mesh(new THREE.ConeGeometry(0.042, 0.26, 8).translate(0, 0.13, 0), 'leather'), [0, -0.5, 1]));
      for (const x of [-0.045, 0.045]) beak.add(mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 10).rotateX(Math.PI / 2), 'glass', [x, 0.05, 0]), mesh(new THREE.TorusGeometry(0.027, 0.006, 4, 10), 'rust', [x, 0.05, 0.01]));
      beak.position.set(f.x, f.y - 0.01, f.z - 0.02);
      return [crowned(d, hat, 0.045), on('Head', beak)];
    },
    spalle: (d) => pads(d, { r: 0.12, metal: 'leather', trim: 'rust', lames: 1, spikes: 1, spike: 'bone', spikeLen: 0.9, studs: 'iron' }),
    torso: (d) => {
      const c = d.chest, r = d.chestR, g = new THREE.Group();
      g.add(mesh(rim(1, 0, 0.028, 22), 'leatherDark', [c.x, c.y - r.y * 0.1, c.z], [0, 0, -0.75], [r.x * 1.35, 1, r.z * 1.25]));
      for (let i = 0; i < 4; i++) g.add(mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.055, 6), 'glass', [c.x + r.x * (0.6 - i * 0.36), c.y + r.y * (0.45 - i * 0.3), c.z + r.z * 1.22], [0, 0, -0.75]));
      return [on('Spine01', g), belt(d, 'leatherDark', 'rust')];
    },
    mani: (d) => bracers(d, { metal: 'leather', trim: 'rust', bands: 1 }),
    gambe: (d) => tassets(d, { metal: 'leather', trim: 'rust', lames: 2, knee: 'rust' }),
    piedi: (d) => greaves(d, { metal: 'rust', trim: 'leatherDark', cap: 'rust', studs: 'iron' }),
  },
  chierico: {
    dye: { testa: { color: 0x1a171c }, spalle: { color: 0x1a171c }, torso: { color: 0x17141a }, mani: { color: 0x1d1a20, cover: 0.55 }, gambe: { color: 0x17141a, cover: 0.3 }, piedi: { color: 0x141216, cover: 0.85 } },
    testa: (d) => [crowned(d, group(mesh(lathe([0.25, 0, 0.245, 0.012, 0.11, 0.016, 0.105, 0.05, 0.085, 0.095, 0.0, 0.11], 20), 'felt'), mesh(rim(0.108, 0.025, 0.008), 'crimson')), 0.045, -0.08)],
    spalle: (d) => [capelet(d, 'crimson', 'gold')],
    torso: (d) => {
      const c = d.chest, r = d.chestR, w = d.waist, wr = d.waistR, stole = new THREE.Group();
      for (const x of [-1, 1]) {
        stole.add(mesh(box(0.045, r.y * 2.4, 0.012), 'crimson', [x * r.x * 0.45, c.y - r.y * 0.35, c.z + r.z * 1.12], [0.12, 0, x * 0.1]));
        stole.add(mesh(box(0.035, 0.008, 0.014), 'gold', [x * r.x * 0.38, c.y - r.y * 1.45, c.z + r.z * 1.25]), mesh(box(0.008, 0.035, 0.014), 'gold', [x * r.x * 0.38, c.y - r.y * 1.45, c.z + r.z * 1.25]));
      }
      const cotta = group(mesh(lathe([wr.x * 1.5, -0.17, wr.x * 1.3, -0.06, wr.x * 1.12, 0.06], 20), 'linen'), mesh(lathe([wr.x * 1.6, -0.2, wr.x * 1.5, -0.17], 20), 'lace'));
      cotta.position.set(w.x, w.y, w.z);
      cotta.scale.set(1, 1, (wr.z / wr.x) * 1.1);
      return [on('Spine01', stole), on('Hips', cotta)];
    },
    mani: (d) => bracers(d, { metal: 'linen', trim: 'crimson', r: 1.08, frill: 'lace', cuff: true }),
    gambe: () => [],
    piedi: (d) => both('Foot', () => group(mesh(box(0.035, 0.022, 0.01), 'silver', [0, d.footLen * 0.2, d.shin * 0.55])), 'ToeBase'),
  },
  arsenale: {
    dye: { testa: { color: 0x7a1618 }, spalle: { color: 0x6a1416 }, torso: { color: 0x7a1618 }, mani: { color: 0x9aa3ad, cover: 0.9 }, gambe: { color: 0x5a1012, cover: 0.3 }, piedi: { color: 0x8c949e, cover: 0.85 } },
    testa: (d) => {
      const brim = lathe([0.225, 0.03, 0.2, 0.005, 0.15, 0.0], 22), p = brim.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), rr = Math.hypot(x, z); p.setY(i, p.getY(i) + ((z * z) / (rr * rr + 1e-6)) * Math.max(0, rr - 0.14) * 0.7); } // turned up front and back, a morion's boat
      brim.computeVertexNormals();
      const crest = new THREE.Shape().moveTo(-0.11, 0).quadraticCurveTo(-0.1, 0.07, 0, 0.085).quadraticCurveTo(0.1, 0.07, 0.11, 0).closePath();
      const comb = new THREE.ExtrudeGeometry(crest, { depth: 0.012, bevelEnabled: false, curveSegments: 8 }).translate(0, 0, -0.006).rotateY(Math.PI / 2);
      const helm = group(mesh(lathe(cap(0.135, Math.PI / 2, 1.1, 7), 18), 'steel'), mesh(brim, 'steel'), mesh(rim(0.137, 0.004, 0.009, 18), 'brass'), mesh(comb, 'steel', [0, 0.1, 0]));
      helm.add(mesh(ball(0.05, 8, 6), 'crimson', [0, 0.16, -0.1], [1.25, 0, 0], [0.45, 1.8, 0.7])); // the plume, sweeping back off the comb
      for (let a = 0; a < 6; a++) helm.add(mesh(ball(0.009, 5, 3), 'brass', [Math.sin(a * 1.05) * 0.14, 0.03, Math.cos(a * 1.05) * 0.14]));
      return [crowned(d, helm, 0.11, -0.05)];
    },
    spalle: (d) => pads(d, { r: 0.14, metal: 'steel', trim: 'brass', lames: 2, boss: 'brass', studs: 'brass' }),
    torso: (d) => {
      const c = d.chest, r = d.chestR, sash = mesh(rim(1, 0, 0.035, 20), 'crimson', [c.x, c.y - r.y * 0.2, c.z], [0, 0, 0.7], [r.x * 1.3, 1, r.z * 1.3]);
      return [cuirass(d, 'steel', 'brass', 1.16), on('Spine01', sash), belt(d, 'leatherDark', 'brass')];
    },
    mani: (d) => bracers(d, { metal: 'steel', trim: 'brass', r: 1.15, bands: 1 }),
    gambe: (d) => tassets(d, { metal: 'steel', trim: 'brass', lames: 2, len: 0.7 }),
    piedi: (d) => greaves(d, { metal: 'steel', trim: 'brass', cap: 'steel' }),
  },
  murano: {
    dye: { testa: { color: 0x10506a }, spalle: { color: 0x0e4058 }, torso: { color: 0x10506a }, mani: { color: 0xb08a3a, cover: 0.5 }, gambe: { color: 0x0c3a50, cover: 0.3 }, piedi: { color: 0x6a5020, cover: 0.8 } },
    testa: (d) => {
      const g = group(mesh(rim(1, 0, 0.12, 20), 'gold', ZERO, ZERO, [d.hoodX * 0.98, 0.18, d.hoodZ * 0.9]));
      [-2, -1, 0, 1, 2].forEach((i) => { // glass flames round the front, the middle one tallest
        const a = i * 0.42, h = 0.09 + (2 - Math.abs(i)) * 0.045;
        g.add(mesh(new THREE.ConeGeometry(0.018, h, 6).translate(0, h / 2, 0), i ? 'amber' : 'cobalt', [Math.sin(a) * d.hoodX * 0.95, 0.01, Math.cos(a) * d.hoodZ * 0.86], [Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25]));
      });
      g.position.set(0, d.crown.y - 0.08, d.crown.z + 0.01);
      g.rotation.x = -0.15;
      return [on('Head', g)];
    },
    spalle: (d) => pads(d, { r: 0.12, metal: 'teal', trim: 'gold', lames: 1, flat: 0.75, gem: 'amber', studs: 'gold' }),
    torso: (d) => {
      const c = d.chest, r = d.chestR, morse = group(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.014, 14).rotateX(Math.PI / 2), 'gold'), mesh(ball(0.022, 8, 6), 'amber', [0, 0, 0.012]));
      morse.position.set(0, c.y + r.y * 0.55, c.z + r.z * 1.15);
      return [cape(d, 'teal', 'gold', 0.95), on('Spine01', morse), belt(d, 'gold', 'cobalt', 0.8)];
    },
    mani: (d) => bracers(d, { metal: 'gold', trim: 'teal', r: 1.1, gem: 'cobalt' }),
    gambe: (d) => both('Leg', () => group(mesh(rim(d.shin * 1.05, 0.02, 0.012, 12), 'gold')), 'Foot'),
    piedi: (d) => both('Foot', () => group(mesh(lathe(cap(d.shin * 0.55, Math.PI * 0.5, 1.8, 5), 10, -Math.PI / 2, Math.PI), 'gold', [0, d.footLen * 0.15, 0], ZERO, [1, 1, 0.8])), 'ToeBase'),
  },
  voto: {
    dye: { testa: { color: 0x4a1a6a }, spalle: { color: 0x2a1238 }, torso: { color: 0x3b1556 }, mani: { color: 0x3a3442, cover: 0.85 }, gambe: { color: 0x2a1238, cover: 0.3 }, piedi: { color: 0x3a3442, cover: 0.85 } },
    testa: (d) => {
      const w = d.hoodX * 0.78, h = 0.27, mitre = new THREE.Group();
      const shape = new THREE.Shape().moveTo(-w, 0).lineTo(w, 0).lineTo(w * 1.02, h * 0.5).quadraticCurveTo(w * 0.7, h * 0.92, 0, h).quadraticCurveTo(-w * 0.7, h * 0.92, -w * 1.02, h * 0.5).closePath();
      const panel = new THREE.ExtrudeGeometry(shape, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.008, bevelSegments: 1, curveSegments: 6 });
      for (const z of [1, -1]) { // front and back, violet in a gold frame, leaning together
        const side = group(mesh(panel, 'gold', [0, -0.006, -0.008], ZERO, [1.08, 1.05, 1]), mesh(panel, 'violet', [0, 0, 0.004]));
        side.position.z = z * d.hoodZ * 0.3;
        side.rotation.set(-z * 0.13, z < 0 ? Math.PI : 0, 0);
        mitre.add(side);
      }
      mitre.add(mesh(lathe([w * 1.06, 0, w * 1.08, 0.055], 16), 'gold', ZERO, ZERO, [1, 1, (d.hoodZ / w) * 0.42]));
      mitre.add(mesh(box(0.024, 0.15, 0.016), 'violetFire', [0, 0.13, d.hoodZ * 0.3 + 0.03]), mesh(box(0.09, 0.024, 0.016), 'violetFire', [0, 0.16, d.hoodZ * 0.3 + 0.03])); // the cross alight
      for (const x of [-1, 1]) mitre.add(mesh(box(0.035, 0.24, 0.008), 'violet', [x * w * 0.5, -0.12, -d.hoodZ * 0.62], [0.2, 0, 0]), mesh(box(0.035, 0.03, 0.01), 'gold', [x * w * 0.5, -0.235, -d.hoodZ * 0.66], [0.2, 0, 0]));
      return [crowned(d, mitre, 0.07, -0.12)];
    },
    spalle: (d) => [...pads(d, { r: 0.155, metal: 'black', trim: 'gold', lames: 3, flat: 0.8, spikes: 3, spike: 'bone', spikeLen: 1.05, skull: 'violetFire', gem: 'violetFire' }), cape(d, 'violet', 'gold', 1.15)],
    torso: (d) => [cuirass(d, 'black', 'gold', 1.18, { skull: 'violetFire', ridge: false }), belt(d, 'gold', 'gold', 1.3, 'violetFire')],
    mani: (d) => bracers(d, { metal: 'black', trim: 'gold', r: 1.2, spikes: 2, spike: 'gold', claws: 'gold', gem: 'violetFire' }),
    gambe: (d) => tassets(d, { metal: 'black', trim: 'gold', lames: 2, len: 0.75, knee: 'gold', skull: 'violetFire' }),
    piedi: (d) => greaves(d, { metal: 'black', trim: 'gold', cap: 'gold', spike: 'gold' }),
  },
  gondola: {
    dye: { testa: { color: 0x22382a }, spalle: { color: 0x22382a }, torso: { color: 0x1c2846, stripes: 26 }, mani: { color: 0x35573f, cover: 0.4 }, gambe: { color: 0x141820, cover: 0.3 }, piedi: { color: 0x15161a, cover: 0.7 } },
    testa: (d) => [crowned(d, group(mesh(lathe([0.2, 0, 0.2, 0.008, 0.115, 0.01, 0.112, 0.075, 0.0, 0.078], 22), 'straw'), mesh(lathe([0.1135, 0.012, 0.1135, 0.04], 22), 'crimson')), 0.04, -0.1)],
    spalle: (d) => {
      const lantern = group(mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.07, 6), 'ember'), mesh(cone(0.04, 0.035, 6), 'iron', [0, 0.035, 0]), mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 6), 'iron', [0, -0.04, 0]));
      lantern.position.copy(d.ball).add(new THREE.Vector3(-0.02, -0.08, 0.1));
      return [capelet(d, 'sea', 'rope', 0.9), on('LeftShoulder', lantern)];
    },
    torso: (d) => {
      const w = d.waist, wr = d.waistR, sash = group(mesh(rim(1, 0, 0.045, 20), 'crimson', [w.x, w.y + 0.03, w.z], ZERO, [wr.x * 1.12, 1, wr.z * 1.18]), mesh(box(0.05, 0.16, 0.012), 'crimson', [w.x + wr.x * 0.7, w.y - 0.06, w.z + wr.z * 0.9], [0, 0.5, 0.15]));
      return [on('Hips', sash)];
    },
    mani: (d) => both('ForeArm', () => group(...[0.55, 0.72, 0.9].map((y) => mesh(rim(d.fore * 1.05, d.foreLen * y, 0.01, 12), 'rope'))), 'Hand'),
    gambe: (d) => both('Leg', () => group(mesh(rim(d.shin * 1.02, 0.03, 0.012, 12), 'rope')), 'Foot'),
    piedi: () => [],
  },
  merletto: {
    dye: { testa: { color: 0x141218 }, spalle: { color: 0x141218 }, torso: { color: 0x121016 }, mani: { color: 0x1a1820, cover: 0.6 }, gambe: { color: 0x121016, cover: 0.3 }, piedi: { color: 0x202024, cover: 0.85 } },
    testa: (d) => {
      const corner = (g: THREE.BufferGeometry, lift: number) => { // three sides turned up into the tricorn's corners
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), z = p.getZ(i), a = Math.atan2(x, z), k = Math.max(0, (Math.hypot(x, z) - 0.1) / 0.1) + lift, s = 1 + 0.12 * Math.cos(3 * a) * Math.min(1, k);
          p.setXYZ(i, x * s, p.getY(i) + k * 0.085 * (0.55 - 0.45 * Math.cos(3 * a)), z * s);
        }
        g.computeVertexNormals();
        return g;
      };
      const hat = group(mesh(corner(lathe([0.2, 0.0, 0.17, 0.0, 0.11, 0.0], 30), 0), 'felt'), mesh(lathe(cap(0.112, Math.PI / 2, 0.6, 5), 18), 'felt'), mesh(corner(lathe([0.2, 0.0, 0.21, 0.015], 30), 0), 'lace'));
      hat.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.008, 10).rotateX(Math.PI / 2), 'silver', [0.08, 0.06, 0.11], [0, 0.6, 0]));
      hat.rotation.y = Math.PI / 3; // a corner ahead
      return [crowned(d, group(hat), 0.04, -0.08)];
    },
    spalle: (d) => pads(d, { r: 0.13, metal: 'tar', trim: 'silver', lames: 2, frill: 'lace', studs: 'silver' }),
    torso: (d) => {
      const n = d.neck, c = d.chest, r = d.chestR, jabot = new THREE.Group();
      for (let i = 0; i < 3; i++) jabot.add(mesh(lathe([0.05 + i * 0.008, -0.03, 0.012, 0.0], 10, -Math.PI / 2, Math.PI), 'lace', [0, n.y - 0.05 - i * 0.045, c.z + r.z * 1.0], [-0.3, 0, 0]));
      for (let i = 0; i < 4; i++) jabot.add(mesh(ball(0.009, 6, 4), 'silver', [0, c.y - r.y * (0.1 + i * 0.32), c.z + r.z * 1.1]));
      return [on('Spine01', jabot), belt(d, 'tar', 'silver')];
    },
    mani: (d) => bracers(d, { metal: 'tar', trim: 'silver', r: 1.08, frill: 'lace', bands: 1 }),
    gambe: (d) => both('Leg', () => group(mesh(box(0.03, 0.022, 0.01), 'silver', [0, 0.04, d.shin * 1.0])), 'Foot'),
    piedi: (d) => greaves(d, { metal: 'tar', trim: 'silver', cap: 'tar', w: 0.98 }),
  },
  broccato: {
    dye: { testa: { color: 0xd8d0c0 }, spalle: { color: 0xb08a3a }, torso: { color: 0xa07a2a, cover: 0.15 }, mani: { color: 0xe8e0d0, cover: 0.7 }, gambe: { color: 0x7a6230, cover: 0.3 }, piedi: { color: 0xb08a3a, cover: 0.85 } },
    testa: (d) => {
      const band = new THREE.CylinderGeometry(0.115, 0.11, 0.06, 16, 1, true), p = band.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setY(i, 0.03 + 0.05 * Math.max(0, Math.cos(Math.atan2(p.getX(i), p.getZ(i)) * 8))); // the crown's points
      band.computeVertexNormals();
      const crown = group(mesh(band, 'gold'), mesh(rim(0.112, -0.03, 0.008, 16), 'gold'));
      for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; crown.add(mesh(ball(0.011, 6, 4), 'pearl', [Math.sin(a) * 0.115, 0.085, Math.cos(a) * 0.115])); }
      crown.add(mesh(new THREE.TorusGeometry(0.15, 0.007, 4, 28), 'cyanFire', [0, -0.06, -0.15], [0.12, 0, 0])); // the halo, behind the head
      crown.add(mesh(lathe([0.25, -0.42, 0.19, -0.22, 0.13, -0.05, 0.115, 0.0], 14, Math.PI * 0.55, Math.PI * 0.9), 'lace', [0, 0, -0.02])); // the veil down the back
      return [crowned(d, crown, 0.06, -0.15)];
    },
    spalle: (d) => {
      const collar = group(mesh(lathe([0.21, 0.22, 0.15, 0.12, 0.09, 0.03, 0.07, 0.0], 16, Math.PI * 0.5, Math.PI), 'lace'), mesh(rim(0.21, 0.22, 0.007, 16, Math.PI * 0.5, Math.PI), 'gold'));
      for (let i = 0; i < 7; i++) { const a = Math.PI * (0.58 + i * 0.14); collar.add(mesh(ball(0.01, 6, 4), 'pearl', [Math.sin(a) * 0.21, 0.23, Math.cos(a) * 0.21])); }
      collar.position.set(0, d.neck.y - 0.02, d.chest.z - d.chestR.z * 0.3);
      collar.rotation.x = -0.25;
      return [...pads(d, { r: 0.14, metal: 'gold', trim: 'pearl', lames: 2, frill: 'lace', gem: 'cyanFire' }), on('Spine01', collar)];
    },
    torso: (d) => {
      const c = d.chest, r = d.chestR, g = new THREE.Group();
      for (let i = 0; i < 4; i++) g.add(mesh(ball(0.011, 6, 4), 'pearl', [0, c.y - r.y * (0.5 - i * 0.3), c.z + r.z * 1.24]));
      g.add(mesh(new THREE.OctahedronGeometry(0.03), 'cyanFire', [0, c.y + r.y * 0.6, c.z + r.z * 1.26], ZERO, [1, 1.3, 0.6]));
      return [cuirass(d, 'gold', 'pearl', 1.14, { ridge: false }), on('Spine01', g), belt(d, 'gold', 'cyanFire', 1)];
    },
    mani: (d) => bracers(d, { metal: 'gold', trim: 'pearl', r: 1.12, frill: 'lace', gem: 'cyanFire' }),
    gambe: (d) => tassets(d, { metal: 'gold', trim: 'pearl', lames: 2, len: 0.7, knee: 'gold', cloth: 'lace' }),
    piedi: (d) => greaves(d, { metal: 'gold', trim: 'pearl', cap: 'gold' }),
  },
};

// --- weapons: the props the enemies carry, held as the club is (core/models.ts `arm`): m long, grip, tilt
interface Weapon { file?: string; make?: () => THREE.Group; length: number; grip: number; tilt: number }
/** Mazza del campanaro: a bronze bell for a head, on an iron-bound haft. */
function bellMace(): THREE.Group {
  const g = group(mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.7, 8), 'leatherDark', [0, 0.35, 0]), mesh(rim(0.022, 0.12, 0.008, 8), 'iron'), mesh(rim(0.02, 0.6, 0.008, 8), 'iron'));
  g.add(mesh(lathe([0.11, 0.62, 0.1, 0.66, 0.07, 0.72, 0.06, 0.8, 0.05, 0.84, 0.0, 0.85], 14), 'brass'), mesh(rim(0.11, 0.62, 0.012, 14), 'brass'), mesh(ball(0.025, 6, 4), 'iron', [0, 0.615, 0]));
  return g;
}
/** Turibolo di Murano: a censer of gold and amber glass on a short rod, its chains up to the lid. */
function censer(): THREE.Group {
  const g = group(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.42, 8), 'gold', [0, 0.21, 0]), mesh(rim(0.016, 0.0, 0.01, 8), 'gold'));
  for (const a of [0, 2.1, 4.2]) g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.2, 4), 'gold', [Math.sin(a) * 0.05, 0.53, Math.cos(a) * 0.05], [Math.cos(a) * 0.2, 0, -Math.sin(a) * 0.2]));
  g.add(mesh(lathe([0.0, 0.62, 0.06, 0.63, 0.085, 0.67, 0.08, 0.72, 0.06, 0.74], 12), 'gold'), mesh(ball(0.07, 10, 7), 'amber', [0, 0.77, 0], ZERO, [1, 0.8, 1]));
  g.add(mesh(lathe(cap(0.075, Math.PI * 0.5, 0.9, 5), 12), 'gold', [0, 0.79, 0]), mesh(cone(0.02, 0.06, 6), 'gold', [0, 0.85, 0]));
  return g;
}
export const WEAPONS: Record<string, Weapon> = {
  'clava-osso': { file: 'clava.glb', length: 0.95, grip: 0.12, tilt: 1 },
  'campanaro-arma': { make: bellMace, length: 0.9, grip: 0.12, tilt: 1 },
  'pellegrino-arma': { file: 'bastone.glb', length: 1.5, grip: 0.36, tilt: -0.95 },
  'ferrata-arma': { file: 'mazza.glb', length: 1.05, grip: 0.14, tilt: 1 },
  'turibolo-arma': { make: censer, length: 0.85, grip: 0.08, tilt: 0.9 },
  pastorale: { file: 'pastorale.glb', length: 1.65, grip: 0.34, tilt: -0.95 },
  'remo-spezzato': { file: 'remo.glb', length: 1.3, grip: 0.3, tilt: 0.85 },
  'fuso-ferrato': { file: 'rocca.glb', length: 1.15, grip: 0.3, tilt: -0.9 },
  'scettro-governatrice': { file: 'scettro.glb', length: 1.2, grip: 0.3, tilt: -0.9 },
};

/** Free what `o` owns: its geometries, and its materials and textures unless shared. */
function dispose(o: THREE.Object3D): void {
  o.removeFromParent();
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const ma of [m.material].flat()) {
      if (ma.userData.shared) continue;
      for (const v of Object.values(ma)) if (v instanceof THREE.Texture) v.dispose();
      ma.dispose();
    }
  });
}

// --- the body's shader: regions dyed, its own bone pauldrons pulled in under new ones

const VERT_HEAD = /* glsl */ `
attribute float aRegion;
attribute float aPad;
uniform float uPad;
uniform vec3 uPadL;
uniform vec3 uPadR;
varying float vRegion;
varying float vStripe;`;
const VERT_BODY = /* glsl */ `#include <begin_vertex>
vRegion = aRegion;
vStripe = transformed.y;
transformed = mix(transformed, aPad > 0.0 ? uPadL : uPadR, abs(aPad) * uPad);`;
const FRAG_HEAD = /* glsl */ `
uniform vec4 uDye[8];
uniform vec4 uCover[8];
varying float vRegion;
varying float vStripe;`;
// Dark cloth and leather take the colour, scaled by their own shade so folds keep; bone and skin keep theirs unless
// `cover` (gloves, boots) dyes them too; `stripes` bands it with linen.
const FRAG_DYE = /* glsl */ `#include <map_fragment>
{
  int r = int(vRegion + 0.5);
  vec4 d = uDye[r], c = uCover[r];
  float l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float k = d.a * mix(1.0 - smoothstep(0.05, 0.16, l), 1.0, c.x);
  vec3 dyed = d.rgb * (0.35 + 5.0 * l);
  if (c.y > 0.0) dyed = mix(dyed, vec3(0.78, 0.75, 0.68) * (0.45 + 2.5 * l), step(0.5, fract(vStripe * c.y)));
  diffuseColor.rgb = mix(diffuseColor.rgb, dyed, k);
}`;
// The self-glow was the map again: it follows the dye.
const FRAG_GLOW = /* glsl */ `#ifdef USE_EMISSIVEMAP
  totalEmissiveRadiance *= diffuseColor.rgb;
#endif`;

/**
 * The hero's gear on the hero. `wear` lays a worn set on (only the slots that changed are rebuilt, then the outfit
 * re-merged); `onWeapon` hears of each weapon put in the fist (its top, for the swing's trail) or none.
 */
export class Outfit {
  private readonly fit: Fit;
  private readonly dress: Dress;
  private readonly root: THREE.Group;
  private readonly body: THREE.SkinnedMesh;
  /** Shared with the body's shader. */
  readonly uniforms = {
    uDye: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
    uCover: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
    uPad: { value: 0 }, uPadL: { value: new THREE.Vector3() }, uPadR: { value: new THREE.Vector3() },
  };
  private worn: GearState = {};
  /** Per slot, its pieces baked into the body's space, by material. */
  private parts = new Map<Shown, Map<string, THREE.BufferGeometry[]>>();
  private merged: THREE.SkinnedMesh[] = [];
  private weapon?: THREE.Object3D;
  private unit = 1; // body units a metre
  private t = 0;
  onWeapon: (top?: THREE.Object3D) => void = () => {};

  /** `root`: the stood body's scene (core/models.ts `stand`). */
  constructor(root: THREE.Group, body: THREE.SkinnedMesh) {
    this.root = root;
    this.body = body;
    this.fit = new Fit(root, body);
    this.dress = measure(this.fit);
    this.mark();
    const m = body.material as THREE.MeshStandardMaterial;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>${VERT_HEAD}`).replace('#include <begin_vertex>', VERT_BODY);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>${FRAG_HEAD}`).replace('#include <map_fragment>', FRAG_DYE).replace('#include <emissivemap_fragment>', FRAG_GLOW);
    };
    m.customProgramCacheKey = () => 'hero-dyed';
  }

  /** Per vertex: its region, and how far it is pulled in under a pauldron (sign: the side), from the skin weights and the rest pose. */
  private mark(): void {
    const f = this.fit, g = this.body.geometry, n = f.dom.length, sw = g.attributes.skinWeight, si = g.attributes.skinIndex;
    const region = new Float32Array(n), pad = new Float32Array(n), L = f.bone('LeftShoulder'), R = f.bone('RightShoulder'), arms = [f.bone('LeftArm'), f.bone('RightArm')];
    const along = (['Left', 'Right'] as const).map((s) => f.frame(`${s}Arm`, `${s}ForeArm`).invert()), q = new THREE.Vector3();
    const joints = (['Left', 'Right'] as const).map((s) => new THREE.Vector3().setFromMatrixPosition(f.bones[f.bone(`${s}Arm`)].matrixWorld));
    const mid = (joints[0].x + joints[1].x) / 2, half = Math.abs(joints[0].x - joints[1].x) / 2, p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      p.fromArray(f.pos, i * 3);
      let r = REGION[f.names[f.dom[i]]] ?? TORSO;
      if (r === LEG && p.y - f.feet < SHIN) r = FOOT;
      region[i] = r;
      let w = 0, wa = 0;
      for (let k = 0; k < 4; k++) { const b = si.getComponent(i, k), x = sw.getComponent(i, k); if (b === L || b === R) w += x; if (b === arms[0] || b === arms[1]) wa += x; }
      if (!w && !wa) continue;
      const left = p.x > mid === joints[0].x > mid, j = joints[left ? 0 : 1];
      // All round the shoulder ball but not the hood's drape over the spine; down the upper arm, what sticks out of it (the plates' teeth).
      w *= THREE.MathUtils.smoothstep(p.distanceTo(j), 0.03, 0.1) * THREE.MathUtils.smoothstep(Math.abs(p.x - mid), half * 0.35, half * 0.7);
      q.copy(p).applyMatrix4(along[left ? 0 : 1]);
      wa *= THREE.MathUtils.smoothstep(Math.hypot(q.x, q.z), 0.055, 0.085) * (1 - THREE.MathUtils.smoothstep(q.y, 0.1, 0.17));
      w = Math.max(w, wa);
      pad[i] = left ? w : -w;
    }
    g.setAttribute('aRegion', new THREE.BufferAttribute(region, 1));
    g.setAttribute('aPad', new THREE.BufferAttribute(pad, 1));
    const into = (b: number) => f.skin[b].clone().invert(); // the world into the body's own coordinates
    this.uniforms.uPadL.value.copy(joints[0]).applyMatrix4(into(L));
    this.uniforms.uPadR.value.copy(joints[1]).applyMatrix4(into(R));
    this.unit = into(L).getMaxScaleOnAxis();
  }

  wear(worn: GearState): void {
    if (!('arma' in this.worn) || worn.arma !== this.worn.arma) this.arm((this.worn.arma = worn.arma));
    let changed = false;
    for (const slot of SHOWN) {
      const id = worn[slot];
      if (slot in this.worn && id === this.worn[slot]) continue;
      this.worn[slot] = id;
      changed = true;
      const look = id ? lookOf(id) : undefined;
      this.parts.set(slot, look ? this.bake(KITS[look][slot](this.dress)) : new Map());
    }
    if (changed) { this.merge(); this.dye(); }
  }

  /** The pieces into the body's skinned space, rigid on their bones, by material. */
  private bake(placed: Placed[]): Map<string, THREE.BufferGeometry[]> {
    const out = new Map<string, THREE.BufferGeometry[]>(), f = this.fit, flip = new THREE.Matrix4().makeScale(-1, 1, 1);
    for (const p of placed) {
      const b = f.bone(p.on), to = new THREE.Matrix4().copy(f.skin[b]).invert().multiply(f.frame(p.on, p.toward));
      if (p.mirror) to.multiply(flip);
      p.o.updateMatrixWorld(true);
      p.o.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        m.geometry.dispose();
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(to, m.matrixWorld));
        if (to.determinant() * m.matrixWorld.determinant() < 0) g = flipWinding(g);
        const n = g.attributes.position.count;
        g.deleteAttribute('uv'); // nothing is mapped: lean buffers, a byte a bone index and weight
        g.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(new Uint8Array(n * 4).map((_, i) => (i % 4 ? 0 : b)), 4));
        g.setAttribute('skinWeight', new THREE.Uint8BufferAttribute(new Uint8Array(n * 4).map((_, i) => (i % 4 ? 0 : 255)), 4, true));
        out.set(m.name, [...(out.get(m.name) ?? []), g]);
      });
    }
    return out;
  }

  /** Every slot's pieces, one skinned mesh per material on the body's skeleton; the last ones freed. */
  private merge(): void {
    for (const m of this.merged) { m.removeFromParent(); m.geometry.dispose(); }
    this.merged = [];
    const by = new Map<string, THREE.BufferGeometry[]>();
    for (const parts of this.parts.values()) for (const [k, gs] of parts) by.set(k, [...(by.get(k) ?? []), ...gs]);
    const body = this.body, ghost = (body.material as THREE.Material).transparent;
    for (const [k, gs] of by) {
      const geo = mergeGeometries(gs);
      if (!geo) continue;
      const m = new THREE.SkinnedMesh(geo, mat(k));
      m.bind(body.skeleton, body.bindMatrix);
      m.position.copy(body.position);
      m.quaternion.copy(body.quaternion);
      m.scale.copy(body.scale);
      m.boundingSphere = body.boundingSphere!.clone(); // the body's generous bounds, swings and all
      m.castShadow = !ghost;
      body.parent!.add(m);
      this.merged.push(m);
    }
  }

  /** The regions' dyes, off what covers them. */
  private dye(): void {
    const u = this.uniforms;
    REGION_SLOT.forEach((slot, r) => {
      const id = this.worn[slot], look = id ? lookOf(id) : undefined, d = look ? KITS[look].dye[slot as Shown] : undefined, c = new THREE.Color(d?.color ?? 0);
      u.uDye.value[r].set(c.r, c.g, c.b, d ? d.k ?? 1 : 0);
      u.uCover.value[r].set(r === ARM || r === HIPS ? 0 : d?.cover ?? 0, (d?.stripes ?? 0) / this.unit, 0, 0);
    });
    u.uPad.value = this.parts.get('spalle')?.size ? 1 : 0;
  }

  private arm(id?: string): void {
    if (this.weapon) { dispose(this.weapon); this.weapon = undefined; this.onWeapon(); }
    const w = id ? WEAPONS[id] : undefined;
    if (!w) return;
    const hold = (prop: THREE.Group) => {
      if (this.worn.arma !== id || this.weapon) { dispose(prop); return; } // swapped again meanwhile
      prop.traverse((o) => { o.userData.xray = true; }); // no x-ray twin (fx/occlusion.ts): its list would keep every weapon ever swapped out
      const top = arm(this.root, prop, w.length, w.grip, w.tilt);
      this.weapon = top.parent!;
      this.onWeapon(top);
    };
    if (w.make) hold(w.make());
    else loadModel(w.file!).then((gltf) => hold(gltf.scene), (e) => console.error('weapon failed to load', e));
  }

  /** The glowing accents breathe. */
  update(dt: number): void {
    this.t += dt;
    const k = 0.8 + 0.2 * Math.sin(this.t * 2.2);
    for (const key of GLOWS) { const m = mats.get(key); if (m) m.emissiveIntensity = k; }
  }
}

/** The same triangles facing the other way (a mirrored piece). */
function flipWinding(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const a of Object.values(g.attributes)) {
    const s = a.itemSize, arr = a.array;
    for (let t = 0; t < a.count; t += 3) for (let k = 0; k < s; k++) { const i = (t + 1) * s + k, j = (t + 2) * s + k, x = arr[i]; arr[i] = arr[j]; arr[j] = x; }
  }
  return g;
}
