import * as THREE from 'three';

// Diablo view, after Diablo Immortal: whatever stands between the high camera and the hero fades,
// whole, to a ghost of itself, and the roofs over the hero lift off, so the camera never has to
// dive in and nothing is ever sliced.
//  - Pieces: the level is tagged in pieces (LevelBuilder.together: a wall run with its trims and
//    arches, an arcade side, a roof, a building; any other mesh, decor batch member or prop
//    instance is a piece of its own). Here a small piece standing on a big one (a pilaster, an
//    entablature, a torch on its wall) joins it, so they always fade together.
//  - Each frame a piece the sight lines to the hero cross eases to GHOST; a roof the hero stands
//    under, and whatever hangs from it, eases to nothing.
//  - Every mesh reads its piece's fade from a small texture by a per-vertex (merged batches) or
//    per-instance id, so pieces of one batch fade apart without a single extra draw call. Solid
//    materials turn the fade into MSAA coverage (alpha to coverage): see-through in the opaque
//    pass, without sorting, holes or z-fighting. The shadow map is untouched: a lifted roof still
//    shades the room under it.
//  - The hero and the enemies show through whatever still hides them as an x-ray silhouette, drawn
//    where the level is in front of them, before they are drawn themselves.
// In the WoW view everything reads fully opaque and the silhouettes are off.

const GHOST = 0.22; // opacity of a piece in the way
const CLOSE = 6; // m: in the way this near the eye, a ghost would only veil the view (and cost a second layer of shading): gone
const HEAD = 2.1; // m over the feet: a roof is all above this
const LOW = 1.2; // m over the feet: a piece lower than this never hides the hero from the high camera
const WIDE = new THREE.Vector3(0.25, 0, 0.25); // m: sight lines are this much thicker than lines
const IN = 0.25, OUT = 0.35; // m: under a roof once this far inside its plan, out again this far outside it
const HANG = 0.6; // m: what starts this little under a lifted roof (ribs, coffers, lanterns) goes with it
const HOLD = 0.3; // s a piece stays faded once the sight lines leave it
const RATE = { down: 4.5, up: 2.8 }; // fade per s
const HOST = 2.5, JOIN = 0.8; // m: an upright piece this tall and long hosts the smaller ones within this of it
const ROOF = 2; // m: a roof is at least this wide both ways (a chandelier is not)
const SCAN = 1; // s between looks for models streamed in
const ROW = 256; // fade texture width
const PLANTS = new Set(['hedge', 'foliage', 'olive', 'flower', 'fruit', 'trunk', 'grass']);

interface Group {
  box: THREE.Box3; // all its pieces
  wide: THREE.Box3; // the box a little wider, so a post or a trunk between two sight lines still counts
  plan?: readonly [number, number, number, number]; // a roof with eaves: inside = within its walls
  pieces: number[];
  fade: number;
  seen: number; // s left in the way
  under: boolean;
}

type Tagged = THREE.Mesh & { userData: { occ?: THREE.BufferGeometry; piece?: number; pieces?: number[]; role?: string } };

const U = { uPieceFade: { value: null as THREE.DataTexture | null } };

const VERT = /* glsl */ `#include <fog_vertex>
{
  int p = int(aPiece + 0.5);
  vOcc = texelFetch(uPieceFade, ivec2(p % ${ROW}, p / ${ROW}), 0).r;
}`;

const FRAG_DECL = /* glsl */ `varying float vOcc;
float occNoise() { return fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); }
`;

// Solid materials: the fade is the MSAA coverage. Cut-outs: a screen-door on a fixed noise (no time
// in it: nothing crawls). Glass: a plain alpha.
const FRAG_END = /* glsl */ `#include <dithering_fragment>
#if defined(OCC_SOLID)
gl_FragColor.rgb *= vOcc; // a ghost is a shade, not a lit veil over the room
gl_FragColor.a = vOcc;
#elif defined(OCC_CUT)
if (vOcc < 0.995 && occNoise() > vOcc) discard;
#else
gl_FragColor.a *= vOcc;
#endif`;

// Shadow pass for alpha-to-coverage materials: three would otherwise alpha-test their triplanar
// map with the mesh's UVs. Depth only, the shadow map compares depths.
const DEPTH = new THREE.ShaderMaterial({
  vertexShader: /* glsl */ `#include <common>
void main() {
  #include <begin_vertex>
  #include <project_vertex>
}`,
  fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }',
});

export class Occlusion {
  private on = false;
  private scan = 0;
  private readonly roots: THREE.Object3D[];
  private readonly plans: ReadonlyMap<number, readonly [number, number, number, number]>;
  private readonly fresh: () => number;
  private readonly boxes = new Map<number, THREE.Box3>(); // piece -> world bounds
  private groups: Group[] = [];
  private byPiece = new Map<number, Group>();
  private dirty = false; // pieces added since the groups were built
  private tex!: THREE.DataTexture;
  private readonly xray: XRay;
  private readonly ray = new THREE.Ray();
  private readonly eye = new THREE.Vector3();
  private readonly sight = new THREE.Box3(); // around all the sight lines
  private readonly to: THREE.Vector3[] = Array.from({ length: 5 }, () => new THREE.Vector3());
  private readonly hit = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly toEye = new THREE.Vector3();
  private readonly under: Group[] = [];
  private readonly one: THREE.Vector3[] = [];
  private readonly frustum = new THREE.Frustum();
  private readonly vp = new THREE.Matrix4();

  /**
   * `roots`: what may fade (the level, torches). `plans`/`fresh`: the builder's roof plans and
   * piece counter. `bodies`: [root, colour] of the characters that show through as silhouettes.
   */
  constructor(roots: THREE.Object3D[], plans: ReadonlyMap<number, readonly [number, number, number, number]>, fresh: () => number, bodies: [THREE.Object3D, number][]) {
    this.roots = roots;
    this.plans = plans;
    this.fresh = fresh;
    this.xray = new XRay(bodies);
    this.texture(1);
  }

  /** Diablo view on or off: fades and silhouettes; off, every piece reads opaque again. */
  set enabled(on: boolean) {
    if (on === this.on) return;
    this.on = on;
    this.scan = 0;
    this.xray.enabled = on;
    this.xray.update(this.frustum, () => false);
    if (on) return;
    for (const g of this.groups) { g.fade = 1; g.seen = 0; g.under = false; }
    this.tex.image.data!.fill(255);
    this.tex.needsUpdate = true;
  }

  get enabled(): boolean {
    return this.on;
  }

  /** Per frame, after the camera moved. `feet`: the hero's feet. */
  update(dt: number, feet: THREE.Vector3, camera: THREE.Camera): void {
    if (!this.on) return;
    if ((this.scan -= dt) <= 0) { // models stream in after boot (Meshy props, the gothic dressing)
      this.scan = SCAN;
      for (const r of this.roots) r.traverse((o) => this.tag(o as Tagged));
      if (this.dirty) this.group();
      this.xray.scan();
    }
    const eye = camera.getWorldPosition(this.eye);
    this.right.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize().multiplyScalar(0.55);
    const [foot, chest, head, left, right] = this.to;
    foot.copy(feet).setY(feet.y + 0.3);
    chest.copy(feet).setY(feet.y + 1.1);
    head.copy(feet).setY(feet.y + 1.85);
    left.copy(chest).sub(this.right);
    right.copy(chest).add(this.right);
    this.sight.setFromPoints(this.to).expandByPoint(eye);
    const top = feet.y + HEAD;

    // Roofs the hero stands under (plan, with some give either way so the edge never flickers);
    // the smallest one is the room he is in.
    this.under.length = 0;
    let room: readonly number[] | undefined, area = Infinity;
    for (const g of this.groups) {
      const b = g.box;
      if (b.min.y <= top || b.max.x - b.min.x < ROOF || b.max.z - b.min.z < ROOF) { g.under = false; continue; }
      const plan = g.plan ?? [b.min.x, b.max.x, b.min.z, b.max.z], [x0, x1, z0, z1] = plan, m = g.under ? -OUT : IN;
      g.under = feet.x > x0 + m && feet.x < x1 - m && feet.z > z0 + m && feet.z < z1 - m;
      if (!g.under) continue;
      this.under.push(g);
      if ((x1 - x0) * (z1 - z0) < area) { room = plan; area = (x1 - x0) * (z1 - z0); }
    }
    // Indoors, the room's walls on the camera's side fade whole, as in Diablo: the room opens like a box.
    const toEye = this.toEye.subVectors(eye, feet).setY(0);

    const data = this.tex.image.data as Uint8Array;
    let changed = false;
    for (const g of this.groups) {
      const b = g.box;
      if (b.max.y > feet.y + LOW && (this.sight.intersectsBox(g.wide) && this.crosses(eye, this.to, g.wide) || room && this.near(b, room, toEye))) g.seen = HOLD;
      else g.seen -= dt;
      let want = g.seen <= 0 ? 1 : b.distanceToPoint(eye) < CLOSE ? 0 : GHOST;
      if (b.min.y > top && this.lifted(b)) want = 0;
      if (want === g.fade) continue;
      g.fade = want < g.fade ? Math.max(want, g.fade - RATE.down * dt) : Math.min(want, g.fade + RATE.up * dt);
      for (const p of g.pieces) data[p] = Math.round(255 * g.fade);
      changed = true;
    }
    if (changed) this.tex.needsUpdate = true;
    this.frustum.setFromProjectionMatrix(this.vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    this.xray.update(this.frustum, (p) => this.hidden(eye, p));
  }

  /** Is `p` behind a piece that is not faded? */
  private hidden(eye: THREE.Vector3, p: THREE.Vector3): boolean {
    this.sight.setFromPoints([eye, p]);
    this.one[0] = p;
    for (const g of this.groups) if (g.fade > 0.5 && this.sight.intersectsBox(g.box) && this.crosses(eye, this.one, g.box)) return true;
    return false;
  }

  /** Does any sight line from the eye to `to` cross `b` before reaching it? */
  private crosses(eye: THREE.Vector3, to: THREE.Vector3[], b: THREE.Box3): boolean {
    for (const t of to) {
      const len = eye.distanceTo(t);
      this.ray.origin.copy(eye);
      this.ray.direction.subVectors(t, eye).divideScalar(len);
      if (this.ray.intersectBox(b, this.hit) && this.hit.distanceTo(eye) < len - 0.4) return true;
    }
    return false;
  }

  /** A wall of the room (plan x0 x1 z0 z1) on the side `toEye` looks from? */
  private near(b: THREE.Box3, [x0, x1, z0, z1]: readonly number[], toEye: THREE.Vector3): boolean {
    if (b.max.y - b.min.y < HOST || b.min.x < x0 - 1 || b.max.x > x1 + 1 || b.min.z < z0 - 1 || b.max.z > z1 + 1) return false;
    return ((b.min.x + b.max.x - x0 - x1) * toEye.x + (b.min.z + b.max.z - z0 - z1) * toEye.z) > 0; // its centre is off the room's towards the eye
  }

  /** Under one of the roofs the hero stands under: that roof itself, and what hangs from it. */
  private lifted(b: THREE.Box3): boolean {
    for (const r of this.under) {
      const R = r.box;
      if (b.min.y >= R.min.y - HANG && b.min.x >= R.min.x - 0.3 && b.max.x <= R.max.x + 0.3 && b.min.z >= R.min.z - 0.3 && b.max.z <= R.max.z + 0.3) return true;
    }
    return false;
  }

  /** Give a mesh its piece ids (a vertex or instance attribute) and patch its materials; noted bounds per piece. */
  private tag(mesh: Tagged): void {
    if (!mesh.isMesh || mesh.userData.occ === mesh.geometry || (mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
    const mats = [mesh.material].flat() as THREE.Material[];
    if (!mats.some(fades)) return;
    for (const m of mats) if (fades(m)) patch(m);
    if (mats.some((m) => m.alphaToCoverage)) mesh.customDepthMaterial = DEPTH;
    const src = mesh.geometry, im = mesh as unknown as THREE.InstancedMesh;
    mesh.updateWorldMatrix(true, false);
    if (!src.boundingBox) src.computeBoundingBox();
    let g = src;
    if (src.getAttribute('aPiece') && !im.isInstancedMesh) { // a merged batch: bounds per piece from its vertices
      const pos = src.getAttribute('position'), ids = src.getAttribute('aPiece'), v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) this.grow(ids.getX(i), v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
    } else if (im.isInstancedMesh) {
      const m = new THREE.Matrix4(), box = new THREE.Box3(), plant = PLANTS.has(mesh.userData.role ?? '');
      const ids = mesh.userData.pieces ??= Array.from({ length: im.count }, (_, i) => {
        box.copy(src.boundingBox!).applyMatrix4(im.getMatrixAt(i, m).premultiply(mesh.matrixWorld));
        // ponytail: low greenery (grass, flowers, crops) never hides anyone: no piece, no work per frame
        return plant && box.max.y - box.min.y < 1 && box.min.y < 2.5 ? 0 : this.fresh();
      }); // kept across a swap to the Meshy model (level/models.ts dress)
      for (let i = 0; i < im.count; i++) {
        if (!ids[i]) continue;
        box.copy(src.boundingBox!).applyMatrix4(im.getMatrixAt(i, m).premultiply(mesh.matrixWorld));
        this.grow(ids[i], box.min).grow(ids[i], box.max);
      }
      g = ids.some((id) => id) ? shared(src, new THREE.InstancedBufferAttribute(Float32Array.from(ids), 1)) : src; // none: aPiece reads its default, 0
    } else {
      const id = mesh.userData.piece ?? this.fresh(), box = src.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
      this.grow(id, box.min).grow(id, box.max);
      g = shared(src, new THREE.Float32BufferAttribute(new Float32Array(src.getAttribute('position').count).fill(id), 1));
    }
    mesh.geometry = g;
    mesh.userData.occ = g;
    this.dirty = true;
  }

  private grow(id: number, p: THREE.Vector3): this {
    let b = this.boxes.get(id);
    if (!b) this.boxes.set(id, (b = new THREE.Box3()));
    b.expandByPoint(p);
    return this;
  }

  /** Pieces into groups: each small piece joins the smallest big one it stands on, if any. */
  private group(): void {
    this.dirty = false;
    const ids = [...this.boxes.keys()], vol = (b: THREE.Box3) => (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z);
    const hosts = ids.filter((id) => {
      const b = this.boxes.get(id)!, h = b.max.y - b.min.y, w = b.max.x - b.min.x, d = b.max.z - b.min.z;
      return h >= HOST && Math.max(w, d) >= HOST && h >= 0.25 * Math.min(w, d); // walls, buildings; not a podium
    }).map((id) => ({ id, box: this.boxes.get(id)!.clone().expandByScalar(JOIN), vol: vol(this.boxes.get(id)!) }));
    const owner = new Map<number, number>();
    for (const id of ids) {
      const b = this.boxes.get(id)!, v = vol(b);
      let best = id, bestV = Infinity;
      for (const h of hosts) if (h.id !== id && h.vol > v && h.vol < bestV && h.box.containsBox(b)) { best = h.id; bestV = h.vol; }
      owner.set(id, best);
    }
    const old = this.byPiece, byOwner = new Map<number, Group>();
    for (const id of ids) {
      const o = owner.get(id)!;
      let g = byOwner.get(o);
      if (!g) {
        const before = old.get(o);
        byOwner.set(o, (g = { box: new THREE.Box3(), wide: new THREE.Box3(), plan: this.plans.get(o), pieces: [], fade: before?.fade ?? 1, seen: before?.seen ?? 0, under: before?.under ?? false }));
      }
      g.box.union(this.boxes.get(id)!);
      g.pieces.push(id);
    }
    this.groups = [...byOwner.values()];
    for (const g of this.groups) g.wide.copy(g.box).expandByVector(WIDE);
    this.byPiece = new Map(this.groups.flatMap((g) => g.pieces.map((p) => [p, g] as const)));
    this.texture(Math.max(...ids, 1) + 1);
    const data = this.tex.image.data as Uint8Array;
    for (const g of this.groups) for (const p of g.pieces) data[p] = Math.round(255 * g.fade);
    this.tex.needsUpdate = true;
  }

  /** A fade texture with room for `n` pieces (texel 0: untagged, always opaque). */
  private texture(n: number): void {
    const rows = Math.ceil(n / ROW);
    if (this.tex && this.tex.image.height >= rows) return;
    const t = new THREE.DataTexture(new Uint8Array(ROW * rows).fill(255), ROW, rows, THREE.RedFormat, THREE.UnsignedByteType);
    t.needsUpdate = true;
    this.tex?.dispose();
    this.tex = U.uPieceFade.value = t;
  }
}

/** Patched for fading: level materials and the Meshy props' own. Glows and effects never fade. */
function fades(m: THREE.Material): boolean {
  return !(m as THREE.ShaderMaterial).isShaderMaterial && m.blending === THREE.NormalBlending;
}

/** Wraps a material's own onBeforeCompile with the fade; solid ones turn alpha into coverage (programs recompile once). */
function patch(m: THREE.Material): void {
  if (m.userData.occ) return;
  m.userData.occ = true;
  const solid = !m.transparent && m.alphaTest === 0;
  const own = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey(); // the default key is the original hook's source: read it before wrapping
  m.onBeforeCompile = (sh, r) => {
    own(sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute float aPiece;\nuniform highp sampler2D uPieceFade;\nvarying float vOcc;\n' + sh.vertexShader.replace('#include <fog_vertex>', VERT);
    sh.fragmentShader = FRAG_DECL + sh.fragmentShader
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vOcc < 0.004) discard;')
      .replace('#include <dithering_fragment>', FRAG_END);
  };
  m.customProgramCacheKey = () => `${key}|occ`;
  Object.assign(m, { defaultAttributeValues: { ...(m as THREE.ShaderMaterial).defaultAttributeValues, aPiece: [0] } }); // meshes left untagged: piece 0, opaque
  m.defines = { ...m.defines, [solid ? 'OCC_SOLID' : m.alphaTest > 0 ? 'OCC_CUT' : 'OCC_BLEND']: '' };
  m.alphaToCoverage = solid;
  m.needsUpdate = true;
}

/** `src`'s buffers (shared on the GPU) plus a piece id attribute. */
function shared(src: THREE.BufferGeometry, piece: THREE.BufferAttribute): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setIndex(src.index);
  for (const [k, a] of Object.entries(src.attributes)) g.setAttribute(k, a);
  g.setAttribute('aPiece', piece);
  for (const gr of src.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  g.setDrawRange(src.drawRange.start, src.drawRange.count);
  g.boundingBox = src.boundingBox;
  g.boundingSphere = src.boundingSphere;
  return g;
}

/**
 * Silhouettes: each body mesh gets a twin sharing its geometry and skeleton, drawn just before it
 * where the depth already laid down (the level) is in front of it, with a rim-lit colour. Lifted
 * towards the eye first, so the floor under the feet and a tuft of grass don't count as cover.
 */
class XRay {
  enabled = false;
  private readonly bodies: [THREE.Object3D, THREE.ShaderMaterial][];
  private readonly chars = new Map<THREE.Object3D, { twins: THREE.Mesh[]; shown: boolean }>(); // each root's children
  private readonly p = new THREE.Vector3();
  private readonly sphere = new THREE.Sphere(this.p, 2);

  constructor(bodies: [THREE.Object3D, number][]) {
    this.bodies = bodies.map(([root, color]) => [root, xrayMaterial(color)]);
  }

  /** Twins drawn only for the characters on screen with something solid in front: no extra draws otherwise. */
  update(frustum: THREE.Frustum, hidden: (chest: THREE.Vector3) => boolean): void {
    for (const [c, b] of this.chars) {
      c.getWorldPosition(this.p).y += 1.2;
      const show = this.enabled && c.visible && frustum.intersectsSphere(this.sphere) && hidden(this.p);
      if (show === b.shown) continue;
      b.shown = show;
      for (const t of b.twins) t.visible = show;
    }
  }

  /** Twins for the bodies loaded since the last look. */
  scan(): void {
    for (const [root, mat] of this.bodies) for (const c of root.children) c.traverse((o) => {
      const src = o as THREE.SkinnedMesh;
      if (!src.isMesh || src.userData.xray || src.userData.twin) return;
      const m = src.material as THREE.MeshStandardMaterial;
      if (Array.isArray(m) || !m.isMeshStandardMaterial || m.transparent || m.blending !== THREE.NormalBlending || m.userData.shared) return;
      let t: THREE.Mesh = new THREE.Mesh(src.geometry, mat);
      if (src.isSkinnedMesh) {
        const s = new THREE.SkinnedMesh(src.geometry, mat);
        s.bind(src.skeleton, src.bindMatrix);
        s.bindMode = src.bindMode;
        t = s;
      }
      t.userData.xray = true;
      t.frustumCulled = false;
      t.renderOrder = 1; // after the level (0), before the body itself (2)
      t.raycast = () => {};
      t.visible = false;
      src.renderOrder = 2;
      src.userData.twin = t;
      src.add(t);
      let b = this.chars.get(c);
      if (!b) this.chars.set(c, (b = { twins: [], shown: false }));
      b.twins.push(t);
      b.shown = false;
    });
  }
}

function xrayMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */ `#include <common>
#include <skinning_pars_vertex>
varying vec3 vN;
varying vec3 vV;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vN = normalize(transformedNormal);
  vV = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * vec4(mvPosition.xyz + vV * 0.45, 1.0);
}`,
    fragmentShader: /* glsl */ `uniform vec3 uColor;
varying vec3 vN;
varying vec3 vV;
void main() {
  float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  gl_FragColor = vec4(uColor * (0.07 + 0.85 * rim * rim * rim), 1.0); // mostly the outline: through a ghost it only edges the body
}`,
    depthFunc: THREE.GreaterDepth,
    depthWrite: false,
    blending: THREE.AdditiveBlending, // opaque list (drawn before the body), blended all the same
  });
}
