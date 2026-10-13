import * as THREE from 'three';
import { material } from '../level/materials.ts';
import type { LevelBuilder } from '../level/builder.ts';
import type { Box } from '../core/physics.ts';

// Diablo view, after Diablo Immortal: nothing between the high camera and the floor around the hero
// is ever see-through. Walls on the camera's side drop to a low stub capped with a stone coping,
// roofs and tall props in the way fade out whole, and whoever is still hidden shows as an x-ray
// silhouette. The camera never has to dive in and nothing is ever veiled or sliced open.
//  - Pieces: the level is tagged in pieces (LevelBuilder.together: a wall run with its trims and
//    arches, an arcade side, a roof, a building; any other mesh, decor batch member or prop
//    instance is a piece of its own). Here a small piece standing on a big one (a pilaster, an
//    entablature, a torch on its wall) joins it, so they always go together.
//  - Each frame: a wall at least TALL with a solid box in it (LevelBuilder.solids), on the camera's
//    side of the hero, whose run hides any floor within REACH of him (up to the walls of where he
//    stands) eases down to STUB over the floor; a roof (all above the head) hiding any of that floor
//    fades out, and so does whatever rests on or hangs from a lowered wall; a tree, pergola, column
//    or prop crossing the sight lines to the hero fades out. Hysteresis on reach and side, and a
//    short hold, so walking along a wall never flickers.
//  - Every mesh reads its piece's fade and cut height from a small texture by a per-vertex
//    (merged batches) or per-instance id, so pieces of one batch go apart without a single extra
//    draw call. The cut is a discard over that height; instanced slabs (a stone coping per upright
//    box the cut crosses, a dark fill inside it on a building) close the stubs, two draws while any
//    wall is down. Fades of solid materials are MSAA coverage (alpha to coverage),
//    so they need no sorting; a mesh faded out whole leaves the view's layer, not the shadow map's:
//    a hidden roof still shades its room.
//  - The hero and the enemies show through whatever still hides them as an x-ray silhouette, drawn
//    where the level is in front of them, before they are drawn themselves.
// In the WoW view everything reads whole and opaque and the silhouettes are off.

const STUB = 1; // m over the floor: a lowered wall, knee to waist
const COPING = 0.1, LIP = 0.04; // m: the slab capping a stub, and its overhang
const RIM = 0.3; // m: over a stub this much wider (a building), the top is a dark fill inside a stone rim
const HEAD = 2.1; // m over the feet: a roof is all above this
const ROOF = 2; // m: a roof is at least this wide both ways (a window band or a lantern is not)
const LOW = 1.2; // m over the feet: a piece lower than this never hides anyone
const TALL = 3.2; // m: walls drop from this tall; garden walls, podiums and landings never do
const REACH = 4.5, GIVE = 1; // m around the hero whose floor stays in view; let go this much further out
const SIDE = { on: 0.2, off: -1.2 }; // m towards the eye: a wall on the camera's side of the hero
const WIDE = new THREE.Vector3(0.25, 0, 0.25); // m: sight lines to the hero are this much thicker than lines
const HOLD = 0.3; // s a piece stays down once out of the way
const RATE = { down: 4, up: 3.3 }; // per s: down in a quarter second, back in a third
const HOST = 2.5, JOIN = 0.8; // m: an upright piece this tall and long hosts the smaller ones within this of it
const SCAN = 1; // s between looks for models streamed in
const ROW = 256; // fade texture width
const FAR = 1e6; // cut height of a whole piece
const DEEP = -10, CM = 100; // the texture keeps a cut height as centimetres over DEEP in 16 bits (all ones: no cut)
const GONE = 1; // layer of a mesh faded out whole: the shadow cameras still draw it (a hidden roof still shades its room), the view does not
const UNIT = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
const PLANTS = new Set(['hedge', 'foliage', 'olive', 'flower', 'fruit', 'trunk', 'grass']);

interface Solid {
  m: THREE.Matrix4; // unit cube -> world
  box: THREE.Box3;
  top: boolean; // wide enough (a building) to show a dark fill inside its coping when cut
}

interface Group {
  box: THREE.Box3; // all its pieces
  wide: THREE.Box3; // the box a little wider, so a post or a trunk between two sight lines still counts
  pieces: number[];
  solids: Solid[]; // its upright boxes: a wall hides what they hide (a roof's eaves over it do not count), a cut through one needs a coping
  on: boolean;
  seen: number; // s left in the way
  k: number; // 0 whole .. 1 lowered or gone
  floor: number; // a wall's stub top, this frame
  fade: number; // as drawn
  cut: number;
}

type Tagged = THREE.Mesh & { userData: { occ?: THREE.BufferGeometry; piece?: number; pieces?: number[]; role?: string } };

const U = { uPieceFade: { value: null as THREE.DataTexture | null } };

const VERT = /* glsl */ `#include <fog_vertex>
{
  int p = int(aPiece + 0.5);
  vec4 o = texelFetch(uPieceFade, ivec2(p % ${ROW}, p / ${ROW}), 0);
  // A piece is either faded (its fade) or cut (whole below the cut height, gone a millimetre over it):
  // one varying, so the fragment shader stays as light as without cuts. The view is rigid, so the
  // world height comes from the view position.
#ifdef USE_INSTANCING
  vOcc = o.r; // props and coppi: never cut, only faded
#else
  float cut = o.g * 65280.0 + o.b * 255.0;
  vOcc = cut < 65534.5 ? 1.0 + 1000.0 * (cut / ${CM}.0 + ${DEEP}.0 - dot(viewMatrix[1].xyz, mvPosition.xyz - viewMatrix[3].xyz)) : o.r;
#endif
}`;

const FRAG_DECL = /* glsl */ `varying float vOcc;
float occNoise() { return fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); }
`;

// Solid materials: the fade is the MSAA coverage, and it darkens too, so it reads as going into
// shadow rather than as a veil; under a cut vOcc is over 1: whole (coverage saturates). Cut-outs: a
// screen-door on a fixed noise (no time in it: nothing crawls). Glass and flames: a plain alpha.
const FRAG_END = /* glsl */ `#include <dithering_fragment>
#if defined(OCC_SOLID)
gl_FragColor.rgb *= min(vOcc, 1.0);
gl_FragColor.a = vOcc;
#elif defined(OCC_CUT)
if (vOcc < 0.995 && occNoise() > vOcc) discard;
#else
gl_FragColor.a *= min(vOcc, 1.0);
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
  private readonly walls: Box[]; // colliders that bound the floor in view: two metres tall or more
  private readonly area = { x: NaN, z: NaN, y: NaN, w: 0, e: 0, n: 0, s: 0 }; // free floor around the hero, m each way
  private readonly solids = new Map<number, Solid[]>(); // piece -> its upright boxes
  private readonly fresh: () => number;
  private readonly boxes = new Map<number, THREE.Box3>(); // piece -> world bounds
  private groups: Group[] = [];
  private readonly meshes = new Map<THREE.Mesh, { pieces: number[]; gone: boolean }>(); // every tagged mesh: its pieces
  private dirty = false; // pieces added since the groups were built
  private tex!: THREE.DataTexture;
  private readonly caps: THREE.InstancedMesh;
  private readonly tops: THREE.InstancedMesh; // lowered buildings' fills
  private readonly xray: XRay;
  private readonly ray = new THREE.Ray();
  private readonly sweep = new THREE.Ray(); // from the hero's middle to the eye
  private readonly eye = new THREE.Vector3();
  private readonly mid = new THREE.Vector3();
  private readonly sight = new THREE.Box3(); // around all the sight lines
  private readonly to: THREE.Vector3[] = Array.from({ length: 5 }, () => new THREE.Vector3());
  private readonly hit = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly toEye = new THREE.Vector3();
  private readonly near = new THREE.Box3();
  private readonly lowered: Group[] = [];
  private readonly lifted: THREE.Box3[] = []; // roofs going or gone this frame
  private readonly one: THREE.Vector3[] = [];
  private readonly frustum = new THREE.Frustum();
  private readonly vp = new THREE.Matrix4();

  /**
   * `roots`: what may fade (the level, torches); the copings go in the first. `level`: its upright
   * boxes, colliders and piece counter. `bodies`: [root, colour] of the characters that show through
   * as silhouettes.
   */
  constructor(roots: THREE.Object3D[], level: Pick<LevelBuilder, 'solids' | 'world' | 'pieceId'>, bodies: [THREE.Object3D, number][]) {
    this.roots = roots;
    const solids = level.solids;
    for (const [p, m] of solids) {
      let l = this.solids.get(p);
      if (!l) this.solids.set(p, (l = []));
      const e = m.elements;
      l.push({ m, box: UNIT.clone().applyMatrix4(m), top: Math.min(Math.hypot(e[0], e[2]), Math.hypot(e[8], e[10])) > 2 * RIM + 0.5 && e[5] >= TALL });
    }
    this.walls = level.world.boxes.filter((b) => b.y1 - b.y0 >= 2);
    this.fresh = () => level.pieceId();
    this.xray = new XRay(bodies);
    this.texture(1);
    const make = (mat: THREE.Material) => {
      const im = new THREE.InstancedMesh(SLAB, mat, solids.length);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.userData.occ = im.geometry; // never tagged: piece 0, whole
      im.frustumCulled = false;
      im.receiveShadow = false; // inside the wall's own shadow: lit as the top of a parapet
      im.count = 0;
      im.visible = false;
      roots[0].add(im);
      return im;
    };
    this.caps = make(material('stoneDark'));
    this.tops = make(FILL); // solid and dark, so a cut building never reads as a pale wash
  }

  /** Diablo view on or off: lowered walls, fades and silhouettes; off, every piece reads whole again. */
  set enabled(on: boolean) {
    if (on === this.on) return;
    this.on = on;
    this.xray.enabled = on;
    this.xray.update(this.frustum, () => false);
    if (on) { // patch the level now, so a warm-up right after compiles the programs drawn
      this.look();
      this.scan = SCAN;
      return;
    }
    for (const g of this.groups) Object.assign(g, { on: false, seen: 0, k: 0, fade: 1, cut: FAR });
    this.clear();
    this.cull();
    this.caps.visible = this.tops.visible = false;
  }

  get enabled(): boolean {
    return this.on;
  }

  /** Per frame, after the camera moved. `feet`: the hero's feet. */
  update(dt: number, feet: THREE.Vector3, camera: THREE.Camera): void {
    if (!this.on) return;
    if ((this.scan -= dt) <= 0) { // models stream in after boot (Meshy props, the gothic dressing)
      this.scan = SCAN;
      this.look();
    }
    const eye = camera.getWorldPosition(this.eye);
    // Sight lines to the hero, for props; the floor around him swept towards the eye, for walls and roofs.
    this.right.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize().multiplyScalar(0.55);
    const [foot, chest, head, left, right] = this.to;
    foot.copy(feet).setY(feet.y + 0.3);
    chest.copy(feet).setY(feet.y + 1.1);
    head.copy(feet).setY(feet.y + 1.85);
    left.copy(chest).sub(this.right);
    right.copy(chest).add(this.right);
    this.sight.setFromPoints(this.to).expandByPoint(eye);
    this.mid.copy(feet).setY(feet.y + 0.95);
    this.measure(feet);
    this.toEye.subVectors(eye, feet).setY(0).normalize();
    const top = feet.y + HEAD, len = eye.distanceTo(this.mid);
    this.sweep.origin.copy(this.mid);
    this.sweep.direction.subVectors(eye, this.mid).divideScalar(len);

    let changed = false;
    this.caps.count = this.tops.count = 0;
    this.lowered.length = this.lifted.length = 0;
    for (const pass of [0, 1, 2]) for (const g of this.groups) { // walls, roofs, the rest: what rests on a lowered wall or hangs under a hidden roof goes with it
      const b = g.box, wall = g.solids.length > 0 && b.max.y - b.min.y >= TALL && b.min.y < feet.y + 3; // walls on the church podium too
      const roof = !wall && b.min.y > top && b.max.x - b.min.x >= ROOF && b.max.z - b.min.z >= ROOF;
      if (pass !== (wall ? 0 : roof ? 1 : 2)) continue;
      const floor = g.floor = Math.max(b.min.y, feet.y) + STUB, r = REACH + (g.on ? GIVE : 0);
      let hit: boolean;
      if (wall) {
        hit = b.max.y > floor + 0.3 && this.ahead(b, feet) > (g.on ? SIDE.off : SIDE.on) && g.solids.some((s) => this.sweeps(s.box, r, len));
        if (hit || g.k > 0) this.lowered.push(g);
      } else if (roof) {
        hit = this.sweeps(b, r, len) || this.carried(b, true);
        if (hit || g.k > 0) this.lifted.push(b);
      } else hit = this.carried(b, false) || b.min.y > top && this.hangs(b) || g.solids.length === 0 && b.max.y > feet.y + LOW && this.sight.intersectsBox(g.wide) && this.crosses(eye, this.to, g.wide); // other architecture stays: the silhouettes show who it hides
      g.seen = hit ? HOLD : g.seen - dt;
      g.on = g.seen > 0;
      const k = g.on ? Math.min(1, g.k + RATE.down * dt) : Math.max(0, g.k - RATE.up * dt);
      const e = k * k * (3 - 2 * k);
      const fade = wall ? 1 : 1 - e, cut = wall && k > 0 ? b.max.y + 0.01 + (floor - b.max.y - 0.01) * e : FAR;
      if (wall && k > 0) for (const s of g.solids) this.cap(s, cut);
      g.k = k;
      if (fade === g.fade && cut === g.cut) continue;
      g.fade = fade;
      g.cut = cut;
      changed = true;
      for (const p of g.pieces) {
        // A prop on a lowered wall (a torch, a banner) is never sliced: it goes whole if the cut would cross it.
        const whole = wall && !this.solids.has(p) && this.boxes.get(p)!.max.y > floor + 0.05;
        this.write(p, whole ? 1 - e : fade, whole ? FAR : cut);
      }
    }
    if (changed) {
      this.tex.needsUpdate = true;
      this.cull();
    }
    for (const im of [this.caps, this.tops]) {
      if (im.count || im.visible) im.instanceMatrix.needsUpdate = true;
      im.visible = im.count > 0;
    }
    this.frustum.setFromProjectionMatrix(this.vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    this.xray.update(this.frustum, (p) => this.hidden(eye, p));
  }

  /** Does the free floor within `r` of the hero, swept towards the eye, run into `b`? */
  private sweeps(b: THREE.Box3, r: number, len: number): boolean {
    const a = this.area, n = this.near.copy(b); // b grown by the floor patch mirrored: the sweep of the patch hits b = the ray hits this
    n.min.x -= Math.min(r, a.e);
    n.max.x += Math.min(r, a.w);
    n.min.z -= Math.min(r, a.s);
    n.max.z += Math.min(r, a.n);
    n.min.y -= 0.95;
    n.max.y += 0.95;
    return this.sweep.intersectBox(n, this.hit) !== null && this.hit.distanceTo(this.mid) < len;
  }

  /** The free floor around the hero along each axis, up to the first wall (and just into it). */
  private measure(feet: THREE.Vector3): void {
    const a = this.area;
    if (Math.abs(feet.x - a.x) + Math.abs(feet.z - a.z) + Math.abs(feet.y - a.y) < 0.1) return; // he has not moved
    a.x = feet.x; a.y = feet.y; a.z = feet.z;
    const run = (dx: number, dz: number) => {
      for (let d = 0.25; d < REACH + GIVE; d += 0.25) if (this.walled(feet.x + dx * d, feet.z + dz * d, feet.y)) return d + 0.1;
      return REACH + GIVE;
    };
    a.e = run(1, 0); a.w = run(-1, 0); a.s = run(0, 1); a.n = run(0, -1);
  }

  /** Is (x, z) inside a wall standing over the floor at `y`? */
  private walled(x: number, z: number, y: number): boolean {
    for (const b of this.walls) {
      if (b.y1 < y + 2 || b.y0 > y + 1.8) continue;
      const dx = x - b.cx, dz = z - b.cz;
      if (Math.abs(b.cos * dx - b.sin * dz) <= b.hx && Math.abs(b.sin * dx + b.cos * dz) <= b.hz) return true;
    }
    return false;
  }

  /** Closes upright box `s` where the cut at `y` crosses it: a stone coping, and on a building a dark fill inside a stone rim. */
  private cap(s: Solid, y: number): void {
    if (s.box.min.y > y - 0.05 || s.box.max.y < y + 0.05) return;
    slab(this.caps, s.m.elements, LIP, COPING, y + 0.005);
    if (s.top) slab(this.tops, s.m.elements, -RIM, 0.05, y + 0.012);
  }

  /**
   * Does `b` go with a wall being lowered: a roof resting on its top, or something hanging from it
   * (off the floor, over its stub, centred within JOIN of it)?
   */
  private carried(b: THREE.Box3, roof: boolean): boolean {
    for (const w of this.lowered) {
      const l = w.box;
      if (roof ? b.min.y > l.max.y - 1.5 && b.min.y < l.max.y + 1 && b.min.x < l.max.x && b.max.x > l.min.x && b.min.z < l.max.z && b.max.z > l.min.z
        : b.min.y > w.floor - STUB + 0.3 && b.max.y > w.floor + 0.3 && b.min.y < l.max.y + 1.5 && Math.abs(b.min.x + b.max.x - l.min.x - l.max.x) < l.max.x - l.min.x + 2 * JOIN && Math.abs(b.min.z + b.max.z - l.min.z - l.max.z) < l.max.z - l.min.z + 2 * JOIN) return true;
    }
    return false;
  }

  /** Is `b` (all above the head) under a roof going or gone, within its plan: a chandelier, a rib, a lantern? */
  private hangs(b: THREE.Box3): boolean {
    const x = (b.min.x + b.max.x) / 2, z = (b.min.z + b.max.z) / 2;
    return this.lifted.some((r) => b.max.y < r.max.y + 0.5 && x > r.min.x - 0.3 && x < r.max.x + 0.3 && z > r.min.z - 0.3 && z < r.max.z + 0.3);
  }

  /** How far towards the eye the nearest point of `b` lies from the hero (on the ground). */
  private ahead(b: THREE.Box3, feet: THREE.Vector3): number {
    const x = THREE.MathUtils.clamp(feet.x, b.min.x, b.max.x), z = THREE.MathUtils.clamp(feet.z, b.min.z, b.max.z);
    return (x - feet.x) * this.toEye.x + (z - feet.z) * this.toEye.z;
  }

  /** Is `p` behind a piece that is still there? A lowered wall counts up to its stub. */
  private hidden(eye: THREE.Vector3, p: THREE.Vector3): boolean {
    this.sight.setFromPoints([eye, p]);
    this.one[0] = p;
    for (const g of this.groups) {
      if (g.fade <= 0.5) continue;
      const b = this.near.copy(g.box);
      b.max.y = Math.min(b.max.y, g.cut);
      if (this.sight.intersectsBox(b) && this.crosses(eye, this.one, b)) return true;
    }
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

  /** Meshes whose pieces are all faded out leave the view's layer: no draw call, no vertex work. */
  private cull(): void {
    const d = this.tex.image.data as Uint8Array;
    for (const [mesh, m] of this.meshes) {
      const gone = m.pieces.every((p) => d[4 * p] === 0);
      if (gone === m.gone) continue;
      m.gone = gone;
      mesh.layers.set(gone ? GONE : 0);
    }
  }

  /** Tags what streamed in since the last look; regroups if anything did. */
  private look(): void {
    this.roots[0].parent?.traverse((o) => (o as THREE.Object3D & { shadow?: THREE.LightShadow }).shadow?.camera.layers.enable(GONE)); // lights added since too
    for (const r of this.roots) r.traverse((o) => this.tag(o as Tagged));
    if (this.dirty) this.group();
    this.xray.scan();
  }

  /** Give a mesh its piece ids (a vertex or instance attribute) and patch its materials; noted bounds per piece. */
  private tag(mesh: Tagged): void {
    if (!mesh.isMesh || mesh.userData.occ === mesh.geometry || (mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
    const mats = [mesh.material].flat() as THREE.Material[], inst = !!(mesh as unknown as THREE.InstancedMesh).isInstancedMesh;
    if (!mats.some((m) => fades(m, inst))) return;
    for (const m of mats) if (fades(m, inst)) patch(m);
    if (mats.some((m) => m.alphaToCoverage)) mesh.customDepthMaterial = DEPTH;
    const src = mesh.geometry, im = mesh as unknown as THREE.InstancedMesh;
    mesh.updateWorldMatrix(true, false);
    if (!src.boundingBox) src.computeBoundingBox();
    let g = src;
    let pieces: number[];
    if (src.getAttribute('aPiece') && !im.isInstancedMesh) { // a merged batch: bounds per piece from its vertices
      const pos = src.getAttribute('position'), ids = src.getAttribute('aPiece'), v = new THREE.Vector3(), seen = new Set<number>();
      for (let i = 0; i < pos.count; i++) {
        this.grow(ids.getX(i), v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
        seen.add(ids.getX(i));
      }
      pieces = [...seen];
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
      pieces = ids;
    } else {
      const id = mesh.userData.piece ?? this.fresh(), box = src.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
      this.grow(id, box.min).grow(id, box.max);
      g = shared(src, new THREE.Float32BufferAttribute(new Float32Array(src.getAttribute('position').count).fill(id), 1));
      pieces = [id];
    }
    this.meshes.set(mesh, { pieces, gone: false });
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
    const old = new Map(this.groups.flatMap((g) => g.pieces.map((p) => [p, g] as const))), byOwner = new Map<number, Group>();
    for (const id of ids) {
      const o = owner.get(id)!;
      let g = byOwner.get(o);
      if (!g) {
        const { on = false, seen = 0, k = 0 } = old.get(o) ?? {};
        byOwner.set(o, (g = { box: new THREE.Box3(), wide: new THREE.Box3(), pieces: [], solids: [], on, seen, k, floor: 0, fade: NaN, cut: NaN })); // NaN: drawn on the next update
      }
      g.box.union(this.boxes.get(id)!);
      g.pieces.push(id);
      g.solids.push(...this.solids.get(id) ?? []);
    }
    this.groups = [...byOwner.values()];
    for (const g of this.groups) g.wide.copy(g.box).expandByVector(WIDE);
    this.texture(Math.max(...ids, 1) + 1);
  }

  /** A fade texture with room for `n` pieces: fade, cut height (two bytes) each; texel 0, untagged, always whole. */
  private texture(n: number): void {
    const rows = Math.ceil(n / ROW);
    if (this.tex && this.tex.image.height >= rows) return;
    const t = new THREE.DataTexture(new Uint8Array(4 * ROW * rows), ROW, rows);
    this.tex?.dispose();
    this.tex = U.uPieceFade.value = t;
    this.clear();
    for (const g of this.groups) g.fade = g.cut = NaN;
  }

  /** Piece `p` drawn at `fade`, cut at height `cut` (FAR: whole). */
  private write(p: number, fade: number, cut: number): void {
    const d = this.tex.image.data as Uint8Array, c = cut >= FAR ? 65535 : THREE.MathUtils.clamp(Math.round((cut - DEEP) * CM), 0, 65534);
    d[4 * p] = Math.round(255 * fade);
    d[4 * p + 1] = c >> 8;
    d[4 * p + 2] = c & 255;
  }

  /** Every piece whole. */
  private clear(): void {
    (this.tex.image.data as Uint8Array).fill(255);
    this.tex.needsUpdate = true;
  }
}

const SLAB = new THREE.BoxGeometry().translate(0, -0.5, 0); // top face at the origin
const FILL = new THREE.MeshStandardMaterial({ color: 0x1d1814, roughness: 1 }); // a cut building's inside

/** Instance `i` of `im`: box `e` (unit cube -> world) as a slab `h` thick, `out` wider all round (negative: inset), its top at `y`. */
function slab(im: THREE.InstancedMesh, e: ArrayLike<number>, out: number, h: number, y: number): void {
  const kx = 1 + (2 * out) / Math.hypot(e[0], e[2]), kz = 1 + (2 * out) / Math.hypot(e[8], e[10]);
  (im.instanceMatrix.array as Float32Array).set([e[0] * kx, 0, e[2] * kx, 0, 0, h, 0, 0, e[8] * kz, 0, e[10] * kz, 0, e[12], y, e[14], 1], 16 * im.count++);
}

/** Patched for fading: level materials, the Meshy props' own and the torch flames (instanced glows). Spell effects and light shafts never fade. */
function fades(m: THREE.Material, instanced: boolean): boolean {
  return !(m as THREE.ShaderMaterial).isShaderMaterial && (m.blending === THREE.NormalBlending || (instanced && m.blending === THREE.AdditiveBlending));
}

/** Wraps a material's own onBeforeCompile with the fade and the cut; solid ones turn alpha into coverage (programs recompile once). */
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
  Object.assign(m, { defaultAttributeValues: { ...(m as THREE.ShaderMaterial).defaultAttributeValues, aPiece: [0] } }); // meshes left untagged: piece 0, whole
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
