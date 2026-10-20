import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { arm, loadModel } from '../core/models.ts';
import { GEAR, type GearState, type Slot } from '../loot/gear.ts';

// What the hero wears, on the hero (WoW's paper doll): every visible slot shows its piece, and a full set reads as one
// look, like WoW's tier sets and Diablo's class sets in the Redentore's Venetian gothic. Eight looks, one per item family:
//   becchino   level 1 green, the strong pieces: the plague's gravedigger, waxed leather, rusty iron, a beak mask
//   chierico   level 1 green, the casters': a cleric, black cassock, white lace cotta, crimson mozzetta, a saturno hat
//   arsenale   level 1 blue, strong: the Arsenale's steel and brass, a crimson sash, a crested morion
//   murano     level 1 blue, casters: teal and gold vestments, Murano glass alight, a crown of glass flames
//   voto       level 1 purple: the Reverendissimo's second vow, blackened steel and gold, violet velvet, skulls, a mitre
//   gondola    level 2 green: the drowned gondolier, striped shirt, crimson sash, seaweed, a straw boater
//   merletto   level 2 blue: the Pia Casa's tarred iron and white lace, silver, a tricorn
//   broccato   level 2 purple: the Governatrice's gold brocade, lace and pearls, spectral cyan, a crown and veil
// The hemp starter set is the Risorto's own body. Each look is the whole body painted anew (a Meshy retexture of the hero
// on his own UVs, from a painted concept of him in that set: public/models/outfit/<look>-{base,normal,orm}.webp), and the
// body's maps are painted region by region (hood, shoulders, chest, arms, hands, hips, legs, feet) from the looks the
// slots over them wear: one set of three textures, repainted in place, so cloth and armour bend with the body. On top, as
// sculpted Meshy pieces baked onto the bones, the helm or hat on the hood and a pauldron on each shoulder (the body's own
// bone pauldrons pulled in under them); in the fist the weapon, a Meshy prop. Only what is worn is loaded; what is taken
// off is freed.

type Look = 'becchino' | 'chierico' | 'arsenale' | 'murano' | 'voto' | 'gondola' | 'merletto' | 'broccato';
/** Body regions, painted by the slot that covers them. */
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
export const LOOKS: readonly Look[] = ['becchino', 'chierico', 'arsenale', 'murano', 'voto', 'gondola', 'merletto', 'broccato'];
/** The outfit's files, under public/models/. */
export const DIR = 'outfit/';

// --- the sculpted pieces: public/models/outfit/<look>-<slot>.glb (Meshy image-to-3D, textures cut to 512 px)
type V3 = [number, number, number];
type Worn = 'testa' | 'spalle';
interface Piece { size: number; at: V3 }
/**
 * Every file faces +Z (Meshy's front). Helms sit on the hood's crown, the bottom of the piece `at` m from it in the
 * head's frame (+X his left, +Y up, +Z ahead); pauldrons, their front turned outward, on the left shoulder ball, their
 * middle `at` m from it, mirrored onto the right. `size`: m along the piece's longest side.
 */
export const PIECES: Partial<Record<`${Look}-${Worn}`, Piece>> = {
  'becchino-testa': { size: 0.5, at: [0, -0.34, 0.02] },
  'chierico-testa': { size: 0.56, at: [0, -0.1, 0] },
  'arsenale-testa': { size: 0.42, at: [0, -0.18, 0] },
  'murano-testa': { size: 0.27, at: [0, -0.12, 0] },
  'voto-testa': { size: 0.36, at: [0, -0.12, -0.045] },
  'gondola-testa': { size: 0.46, at: [0, -0.14, 0] },
  'merletto-testa': { size: 0.46, at: [0, -0.12, 0] },
  'broccato-testa': { size: 0.3, at: [0, -0.11, -0.02] },
  'becchino-spalle': { size: 0.26, at: [0.03, 0.05, 0] },
  'chierico-spalle': { size: 0.25, at: [0.03, 0.05, 0] },
  'arsenale-spalle': { size: 0.25, at: [0.03, 0.05, 0] },
  'murano-spalle': { size: 0.25, at: [0.03, 0.05, 0] },
  'voto-spalle': { size: 0.32, at: [0.03, 0.06, 0] },
  'gondola-spalle': { size: 0.27, at: [0.03, 0.05, 0] },
  'merletto-spalle': { size: 0.25, at: [0.03, 0.05, 0] },
  'broccato-spalle': { size: 0.28, at: [0.03, 0.05, 0] },
};

// --- weapons: Meshy props (the enemies' and two of the hero's own), held as the club is (core/models.ts `arm`): m long, grip, tilt
interface Weapon { file: string; length: number; grip: number; tilt: number }
export const WEAPONS: Record<string, Weapon> = {
  'clava-osso': { file: 'clava.glb', length: 0.95, grip: 0.12, tilt: 1 },
  'campanaro-arma': { file: 'campanaro.glb', length: 0.9, grip: 0.12, tilt: 1 },
  'pellegrino-arma': { file: 'bastone.glb', length: 1.5, grip: 0.36, tilt: -0.95 },
  'ferrata-arma': { file: 'mazza.glb', length: 1.05, grip: 0.14, tilt: 1 },
  'turibolo-arma': { file: 'turibolo.glb', length: 0.85, grip: 0.12, tilt: 0.9 },
  pastorale: { file: 'pastorale.glb', length: 1.65, grip: 0.34, tilt: -0.95 },
  'remo-spezzato': { file: 'remo.glb', length: 1.3, grip: 0.3, tilt: 0.85 },
  'fuso-ferrato': { file: 'rocca.glb', length: 1.15, grip: 0.3, tilt: -0.9 },
  'scettro-governatrice': { file: 'scettro.glb', length: 1.2, grip: 0.3, tilt: -0.9 },
};

/** Free what `o` owns: its geometries, materials and textures. */
function dispose(o: THREE.Object3D): void {
  o.removeFromParent();
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const ma of [m.material].flat()) {
      for (const v of Object.values(ma)) if (v instanceof THREE.Texture) v.dispose();
      ma.dispose();
    }
  });
}

// --- the body: rest-pose measures and frames on its bones

/** Rest-pose measures of the body, and the frames on its bones that pieces are put in. */
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

  /** The rest-pose world frame of a socket on `bone`: the model's axes at its joint. */
  frame(bone: string): THREE.Matrix4 {
    return new THREE.Matrix4().makeRotationFromQuaternion(this.model).setPosition(new THREE.Vector3().setFromMatrixPosition(this.rest[this.bone(bone)]));
  }

  /** Where `bone`'s joint is, at rest, in the frame of `on`. */
  at(bone: string, on: string): THREE.Vector3 {
    return new THREE.Vector3().setFromMatrixPosition(this.rest[this.bone(bone)]).applyMatrix4(this.frame(on).invert());
  }

  /** The rest-pose vertices led by `bone`, in its frame. */
  points(bone: string): THREE.Vector3[] {
    const inv = this.frame(bone).invert(), id = this.bone(bone), out: THREE.Vector3[] = [];
    for (let i = 0; i < this.dom.length; i++) if (this.dom[i] === id) out.push(new THREE.Vector3().fromArray(this.pos, i * 3).applyMatrix4(inv));
    return out;
  }
}

/** Where the pieces go: the hood's crown (the middle of its top, head frame) and the left shoulder ball (collarbone frame). */
function sockets(f: Fit): Record<Worn, THREE.Vector3> {
  const hood = f.points('Head'), top = Math.max(...hood.map((p) => p.y)), peak = hood.filter((p) => p.y > top - 0.05);
  return { testa: peak.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(Math.max(1, peak.length)), spalle: f.at('LeftArm', 'LeftShoulder') };
}

// --- the body's maps, painted per region

/** A texel's RGBA bytes as one little-endian word. */
const rgba = (r: number, g: number, b: number, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
const FLAT = rgba(128, 128, 255); // a normal map's "no bump"
interface Maps { base: Uint32Array; normal: Uint32Array; orm: Uint32Array }

/** An image's texels at `n`×`n`, as they are in the file (no colour management: normals and masks stay numbers). */
async function texels(url: string, n: number): Promise<Uint32Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, n, n);
  bmp.close();
  const out = new Uint32Array(ctx.getImageData(0, 0, n, n).data.buffer);
  c.width = c.height = 0;
  return out;
}

/** Which region every texel of the body's UV atlas paints: each triangle by its corners' majority, the islands' edges grown out a few texels so filtering and mipmaps don't bleed. */
function regions(g: THREE.BufferGeometry, region: Float32Array, n: number): Uint8Array {
  const uv = g.attributes.uv, idx = g.index!, NONE = 255;
  let out = new Uint8Array(n * n).fill(NONE);
  const x = [0, 0, 0], y = [0, 0, 0];
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2), ra = region[a], rb = region[b], rc = region[c];
    const r = rb === rc ? rb : ra;
    [a, b, c].forEach((v, k) => { x[k] = uv.getX(v) * n; y[k] = uv.getY(v) * n; });
    const area = (x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]);
    if (!area) continue;
    const s = Math.sign(area), len = [0, 1, 2].map((k) => Math.hypot(x[(k + 1) % 3] - x[k], y[(k + 1) % 3] - y[k]) || 1);
    const x0 = Math.max(0, Math.floor(Math.min(...x) - 1)), x1 = Math.min(n - 1, Math.ceil(Math.max(...x) + 1));
    const y0 = Math.max(0, Math.floor(Math.min(...y) - 1)), y1 = Math.min(n - 1, Math.ceil(Math.max(...y) + 1));
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const cx = px + 0.5, cy = py + 0.5;
      let inside = true;
      for (let k = 0; k < 3 && inside; k++) { // within 0.7 texel of the triangle: neighbours overlap instead of leaving cracks
        const j = (k + 1) % 3, d = (s * ((x[j] - x[k]) * (cy - y[k]) - (y[j] - y[k]) * (cx - x[k]))) / len[k];
        inside = d >= -0.7;
      }
      if (inside) out[py * n + px] = r;
    }
  }
  for (let pass = 0; pass < 4; pass++) { // the gutters round each island take the region beside them
    const next = out.slice();
    for (let i = 0; i < n * n; i++) {
      if (out[i] !== NONE) continue;
      const px = i % n, l = px > 0 ? out[i - 1] : NONE, rt = px < n - 1 ? out[i + 1] : NONE, u = i >= n ? out[i - n] : NONE, d = i < n * n - n ? out[i + n] : NONE;
      next[i] = l !== NONE ? l : rt !== NONE ? rt : u !== NONE ? u : d;
    }
    out = next;
  }
  for (let i = 0; i < n * n; i++) if (out[i] === NONE) out[i] = TORSO; // nobody's: never sampled
  return out;
}

/**
 * The body's three maps (colour, normal, glow/roughness/metal), painted from the looks over each region and the body's own
 * colours where nothing is worn. Only the looks worn now stay decoded; a change while one is being painted waits its turn.
 */
class Paint {
  private readonly n: number;
  private readonly texel: Uint8Array;
  private readonly own: Maps;
  private readonly maps: THREE.DataTexture[];
  private got = new Map<Look, Promise<Maps | undefined>>();
  private want: (Look | undefined)[] = [];
  private busy = false;
  private again = false;

  constructor(body: THREE.SkinnedMesh, region: Float32Array) {
    const m = body.material as THREE.MeshStandardMaterial, img = m.map!.image as HTMLImageElement | ImageBitmap, n = (this.n = img.width);
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, n, n);
    const base = new Uint32Array(ctx.getImageData(0, 0, n, n).data.buffer);
    c.width = c.height = 0;
    this.own = { base, normal: new Uint32Array(n * n).fill(FLAT), orm: new Uint32Array(n * n).fill(rgba(0, Math.round(m.roughness * 255), Math.round(m.metalness * 255))) };
    this.texel = regions(body.geometry, region, n);
    this.maps = [base, this.own.normal, this.own.orm].map((src, i) => {
      const t = new THREE.DataTexture(new Uint8Array(src.slice().buffer), n, n);
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = 4;
      if (!i) t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      return t;
    });
    m.map!.dispose();
    m.map = m.emissiveMap = this.maps[0];
    m.normalMap = this.maps[1];
    m.normalScale.set(1, -1); // glTF's UVs, no tangents: as GLTFLoader does
    m.roughnessMap = m.metalnessMap = this.maps[2];
    m.roughness = 1;
    m.metalness = METAL;
    m.needsUpdate = true;
  }

  /** Paint `looks` (one per region; none: the body's own) once their maps are in. */
  paint(looks: (Look | undefined)[]): void {
    this.want = looks;
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    void this.run().finally(() => { this.busy = false; });
  }

  private async run(): Promise<void> {
    do {
      this.again = false;
      const want = this.want, worn = new Set(want.filter((k): k is Look => !!k));
      for (const k of [...this.got.keys()]) if (!worn.has(k)) this.got.delete(k);
      for (const k of worn) if (!this.got.has(k)) this.got.set(k, this.load(k));
      const src = await Promise.all(want.map((k) => (k ? this.got.get(k)! : this.own)));
      if (this.again) continue; // changed meanwhile: paint the latest
      const out = this.maps.map((t) => new Uint32Array((t.image.data as Uint8Array).buffer)), texel = this.texel, own = this.own;
      const by = src.map((s) => s ?? own);
      for (let i = 0; i < texel.length; i++) { const s = by[texel[i]]; out[0][i] = s.base[i]; out[1][i] = s.normal[i]; out[2][i] = s.orm[i]; }
      for (const t of this.maps) t.needsUpdate = true;
    } while (this.again);
  }

  private async load(look: Look): Promise<Maps | undefined> {
    try {
      const [base, normal, orm] = await Promise.all(['base', 'normal', 'orm'].map((k) => texels(`${import.meta.env.BASE_URL}models/${DIR}${look}-${k}.webp`, this.n)));
      return { base, normal, orm };
    } catch (e) {
      console.error('outfit maps failed to load', e);
      return undefined;
    }
  }
}

// --- the shaders: the body's own bone pauldrons pulled in under new ones; on everything he wears, glow where a map's red
// channel says, and a soft shoulder on the lit colour

const VERT_HEAD = /* glsl */ `
attribute float aPad;
uniform float uPad;
uniform vec3 uPadL;
uniform vec3 uPadR;`;
const VERT_BODY = /* glsl */ `#include <begin_vertex>
transformed = mix(transformed, aPad > 0.0 ? uPadL : uPadR, abs(aPad) * uPad);`;
const FRAG_HEAD = /* glsl */ `
uniform float uGlow;`;
// Runes, gems, glass: the glow/roughness/metal map's red channel lights its colour up (Outfit.update makes it breathe).
const FRAG_GLOW = /* glsl */ `#include <emissivemap_fragment>
vec3 glowAdd = vec3(0.0);
#ifdef USE_ROUGHNESSMAP
  glowAdd = diffuseColor.rgb * texture2D( roughnessMap, vRoughnessMapUv ).r * uGlow;
#endif`;
// The lit colour eased under 1 (where the bloom starts) past 0.75: the Diablo view's light over his head would burn a straw
// hat, lace or gold white. The glow goes on after, and still blooms.
const FRAG_SHOULDER = /* glsl */ `{
  float peak = max(outgoingLight.r, max(outgoingLight.g, outgoingLight.b));
  if (peak > 0.75) outgoingLight *= (0.75 + 0.25 * (1.0 - exp((0.75 - peak) * 4.0))) / peak;
  outgoingLight += glowAdd;
}
#include <opaque_fragment>`;
/** What the hero wears and the hero himself: glow and the soft shoulder in `sh`'s fragment shader. */
function lit(sh: THREE.WebGLProgramParametersWithUniforms, glow: { value: number }): void {
  sh.uniforms.uGlow = glow;
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>${FRAG_HEAD}`).replace('#include <emissivemap_fragment>', FRAG_GLOW).replace('#include <opaque_fragment>', FRAG_SHOULDER);
}
const GLOW = 1.3;
/**
 * × the maps' metalness: the night has no environment to mirror, and full metal shows only the lights' highlights (black
 * steel reads as a hole); half keeps the paint, as WoW's painted armour does.
 */
const METAL = 0.5;

/**
 * A piece's (or one of the hero's own weapons') material made like the body's: half metal, a little self-glow so it reads
 * at night, its glass and gems alight with the shared breathing strength. `paint`: false for the enemies' props he picks
 * up, which keep their own look and only get the soft shoulder.
 */
function dress(m: THREE.MeshStandardMaterial, glow: { value: number }, paint = true): void {
  if (paint) {
    m.metalness = METAL;
    m.emissive.setScalar(0.18);
    m.emissiveMap = m.map;
  }
  m.onBeforeCompile = (sh) => lit(sh, glow);
  m.customProgramCacheKey = () => 'outfit-piece';
}

/** One mesh, every attribute plain floats (quantized GLBs' normalized integers would clamp when moved), indexed as it was. */
function floats(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) {
    const a = src.attributes[k];
    if (!a) continue;
    const f = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a.getComponent(i, c);
    out.setAttribute(k, new THREE.BufferAttribute(f, a.itemSize));
  }
  const idx = src.index;
  out.setIndex(idx ? Array.from(idx.array) : Array.from({ length: src.attributes.position.count }, (_, i) => i));
  return out;
}

/**
 * The hero's gear on the hero. `wear` lays a worn set on (only the slots that changed are redone); `onWeapon` hears of
 * each weapon put in the fist (its top, for the swing's trail) or none.
 */
export class Outfit {
  private readonly fit: Fit;
  private readonly socket: Record<Worn, THREE.Vector3>;
  private readonly root: THREE.Group;
  private readonly body: THREE.SkinnedMesh;
  private readonly paint: Paint;
  /** Shared with the body's shader (and the pieces': uGlow). */
  readonly uniforms = { uPad: { value: 0 }, uPadL: { value: new THREE.Vector3() }, uPadR: { value: new THREE.Vector3() }, uGlow: { value: GLOW } };
  private worn: GearState = {};
  private pieces = new Map<Worn, THREE.SkinnedMesh>();
  private weapon?: THREE.Object3D;
  private t = 0;
  onWeapon: (top?: THREE.Object3D) => void = () => {};

  /** `root`: the stood body's scene (core/models.ts `stand`). */
  constructor(root: THREE.Group, body: THREE.SkinnedMesh) {
    this.root = root;
    this.body = body;
    this.fit = new Fit(root, body);
    this.socket = sockets(this.fit);
    this.paint = new Paint(body, this.mark());
    const m = body.material as THREE.MeshStandardMaterial;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>${VERT_HEAD}`).replace('#include <begin_vertex>', VERT_BODY);
      lit(sh, this.uniforms.uGlow);
    };
    m.customProgramCacheKey = () => 'hero-dressed';
  }

  /**
   * Per vertex: its region (returned), and how far it is pulled in under a pauldron (sign: the side, the `aPad`
   * attribute), from the skin weights and the rest pose.
   */
  private mark(): Float32Array {
    const f = this.fit, g = this.body.geometry, n = f.dom.length, sw = g.attributes.skinWeight, si = g.attributes.skinIndex;
    const region = new Float32Array(n), pad = new Float32Array(n), L = f.bone('LeftShoulder'), R = f.bone('RightShoulder'), arms = [f.bone('LeftArm'), f.bone('RightArm')];
    const joints = (['Left', 'Right'] as const).map((s) => new THREE.Vector3().setFromMatrixPosition(f.bones[f.bone(`${s}Arm`)].matrixWorld));
    const fores = (['Left', 'Right'] as const).map((s) => new THREE.Vector3().setFromMatrixPosition(f.bones[f.bone(`${s}ForeArm`)].matrixWorld));
    const mid = (joints[0].x + joints[1].x) / 2, half = Math.abs(joints[0].x - joints[1].x) / 2, p = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      p.fromArray(f.pos, i * 3);
      let r = REGION[f.names[f.dom[i]]] ?? TORSO;
      if (r === LEG && p.y - f.feet < SHIN) r = FOOT;
      region[i] = r;
      let w = 0, wa = 0;
      for (let k = 0; k < 4; k++) { const b = si.getComponent(i, k), x = sw.getComponent(i, k); if (b === L || b === R) w += x; if (b === arms[0] || b === arms[1]) wa += x; }
      if (!w && !wa) continue;
      const left = p.x > mid === joints[0].x > mid, j = joints[left ? 0 : 1], e = fores[left ? 0 : 1];
      // All round the shoulder ball but not the hood's drape over the spine; down the upper arm, what sticks out of it (the plates' teeth).
      w *= THREE.MathUtils.smoothstep(p.distanceTo(j), 0.03, 0.1) * THREE.MathUtils.smoothstep(Math.abs(p.x - mid), half * 0.35, half * 0.7);
      const axis = q.copy(e).sub(j).normalize(), d = p.clone().sub(j), along = d.dot(axis), off = d.addScaledVector(axis, -along).length(); // m down the upper arm, and out from it
      wa *= THREE.MathUtils.smoothstep(off, 0.055, 0.085) * (1 - THREE.MathUtils.smoothstep(along, 0.1, 0.17));
      pad[i] = left ? Math.max(w, wa) : -Math.max(w, wa);
    }
    g.setAttribute('aPad', new THREE.BufferAttribute(pad, 1));
    const into = (b: number) => f.skin[b].clone().invert(); // the world into the body's own coordinates
    this.uniforms.uPadL.value.copy(joints[0]).applyMatrix4(into(L));
    this.uniforms.uPadR.value.copy(joints[1]).applyMatrix4(into(R));
    return region;
  }

  wear(worn: GearState): void {
    if (!('arma' in this.worn) || worn.arma !== this.worn.arma) this.arm((this.worn.arma = worn.arma));
    let changed = false;
    for (const slot of ['testa', 'spalle', 'torso', 'mani', 'gambe', 'piedi'] as const) {
      const id = worn[slot];
      if (slot in this.worn && id === this.worn[slot]) continue;
      const was = this.worn[slot] && lookOf(this.worn[slot]!);
      this.worn[slot] = id;
      changed = true;
      if ((slot === 'testa' || slot === 'spalle') && (!this.pieces.has(slot) || was !== (id && lookOf(id)))) this.piece(slot);
    }
    if (changed) this.paint.paint(REGION_SLOT.map((s) => { const id = this.worn[s]; return id ? lookOf(id) : undefined; }));
  }

  /** The piece of what `slot` wears now, in place of the one there: loaded, then baked onto its bones. */
  private piece(slot: Worn): void {
    const old = this.pieces.get(slot);
    if (old) { dispose(old); this.pieces.delete(slot); }
    if (slot === 'spalle') this.uniforms.uPad.value = 0;
    const id = this.worn[slot], look = id && lookOf(id), p = look && PIECES[`${look}-${slot}`];
    if (!p) return;
    loadModel(`${DIR}${look}-${slot}.glb`, 256).then((gltf) => {
      const now = this.worn[slot];
      if (this.pieces.has(slot) || !now || lookOf(now) !== look) { dispose(gltf.scene); return; } // swapped again meanwhile
      const m = this.bake(slot, p, gltf.scene);
      this.pieces.set(slot, m);
      if (slot === 'spalle') this.uniforms.uPad.value = 1;
    }, (e) => console.error('outfit piece failed to load', e));
  }

  /** A piece's meshes into the body's skinned space, rigid on its bone (both shoulders for pauldrons): one skinned mesh on the body's skeleton. */
  private bake(slot: Worn, p: Piece, scene: THREE.Group): THREE.SkinnedMesh {
    scene.updateMatrixWorld(true);
    const parts: THREE.BufferGeometry[] = [];
    let material: THREE.MeshStandardMaterial | undefined;
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      parts.push(floats(m.geometry).applyMatrix4(m.matrixWorld));
      m.geometry.dispose();
      material ??= m.material as THREE.MeshStandardMaterial;
    });
    const g = parts.length > 1 ? mergeGeometries(parts)! : parts[0];
    // a pauldron's front turned out to his left; its bottom (a helm) or middle (a pauldron) on the socket, `size` m long, `at` from it
    if (slot === 'spalle') g.rotateY(Math.PI / 2);
    g.computeBoundingBox();
    const b = g.boundingBox!, size = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3()), k = p.size / Math.max(size.x, size.y, size.z);
    g.translate(-c.x, -(slot === 'testa' ? b.min.y : c.y), -c.z).scale(k, k, k).translate(...p.at);
    const s = this.socket[slot], f = this.fit, flip = new THREE.Matrix4().makeScale(-1, 1, 1), sides: [string, boolean][] = slot === 'testa' ? [['Head', false]] : [['LeftShoulder', false], ['RightShoulder', true]];
    const baked = sides.map(([bone, mirror]) => {
      const i = f.bone(bone), to = new THREE.Matrix4().copy(f.skin[i]).invert().multiply(f.frame(bone));
      if (mirror) to.multiply(flip);
      let one = g.clone().translate(s.x, s.y, s.z).applyMatrix4(to); // built for the left, the flip takes it right
      if (to.determinant() < 0) one = flipWinding(one);
      const n = one.attributes.position.count;
      one.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(new Uint8Array(n * 4).map((_, j) => (j % 4 ? 0 : i)), 4));
      one.setAttribute('skinWeight', new THREE.Uint8BufferAttribute(new Uint8Array(n * 4).map((_, j) => (j % 4 ? 0 : 255)), 4, true));
      return one;
    });
    g.dispose();
    const geo = baked.length > 1 ? mergeGeometries(baked)! : baked[0];
    if (baked.length > 1) for (const x of baked) x.dispose();
    const mat = material!, body = this.body;
    dress(mat, this.uniforms.uGlow);
    const m = new THREE.SkinnedMesh(geo, mat);
    m.bind(body.skeleton, body.bindMatrix);
    m.position.copy(body.position);
    m.quaternion.copy(body.quaternion);
    m.scale.copy(body.scale);
    m.boundingSphere = body.boundingSphere!.clone(); // the body's generous bounds, swings and all
    m.castShadow = !(body.material as THREE.Material).transparent;
    m.userData.xray = true; // no x-ray twin (fx/occlusion.ts): the body's own covers it, and its list would keep every piece ever taken off
    body.parent!.add(m);
    return m; // the file's meshes are spent (their geometries freed above), their material lives on in this one
  }

  private arm(id?: string): void {
    if (this.weapon) { dispose(this.weapon); this.weapon = undefined; this.onWeapon(); }
    const w = id ? WEAPONS[id] : undefined;
    if (!w) return;
    loadModel(w.file).then((gltf) => {
      const prop = gltf.scene;
      if (this.worn.arma !== id || this.weapon) { dispose(prop); return; } // swapped again meanwhile
      prop.traverse((o) => {
        o.userData.xray = true; // no x-ray twin either
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m?.isMeshStandardMaterial) dress(m, this.uniforms.uGlow, !!m.metalnessMap); // his own PBR props painted like his pieces
      });
      const top = arm(this.root, prop, w.length, w.grip, w.tilt);
      this.weapon = top.parent!;
      this.onWeapon(top);
    }, (e) => console.error('weapon failed to load', e));
  }

  /** The glowing glass, gems and runes breathe. */
  update(dt: number): void {
    this.t += dt;
    this.uniforms.uGlow.value = GLOW * (0.8 + 0.2 * Math.sin(this.t * 2.2));
  }
}

/** The same triangles facing the other way (a mirrored piece). */
function flipWinding(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const idx = g.index!.array;
  for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; }
  g.index!.needsUpdate = true;
  return g;
}
