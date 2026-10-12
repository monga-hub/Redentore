import * as THREE from 'three';

// Diablo view: whatever stands between the high camera and the hero is cut away in the level's
// shaders, so the camera never has to dive in. Two cuts, dithered at the edges:
//  - roof: under a roof (a camera-blocking mesh overhead), everything above ROOF m over the feet
//    within ROOF_R m is dropped, so rooms read like a dungeon seen from above, walls cut at the
//    same height. Back faces of what is left are painted as a dark cap, so a cut wall looks solid
//    instead of hollow. Plants are spared (a tree in a courtyard is not a ceiling).
//  - hole: a cone from the camera to the hero's chest, HOLE m wide at the hero, through anything
//    nearer to the camera than the hero and higher than FLOOR m over the feet (floors and the foot
//    of the walls stay).
// The shadow map is untouched: roofs still shade the rooms under them.
// The patch wraps each material's own onBeforeCompile; in the WoW view it is switched off by a
// uniform and the materials keep their original sides.

const ROOF = 3.6, ROOF_R = 30, HOLE = 3.2, FLOOR = 1;
const OPEN = 1e4; // roof height when nothing is overhead
const PLANTS = new Set(['hedge', 'foliage', 'olive', 'flower', 'fruit', 'trunk']);
const CHECK = 0.2; // s between looks overhead

const U = {
  uCutOn: { value: 0 },
  uCutEye: { value: new THREE.Vector3() },
  uCutFloor: { value: 0 },
  uCutRoof: { value: OPEN },
  uCutRoofR: { value: ROOF_R },
  uCutHole: { value: HOLE },
};

const VERT = /* glsl */ `#include <fog_vertex>
#ifdef USE_INSTANCING
vCutW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
vCutW = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`;

const FRAG_DECL = /* glsl */ `varying vec3 vCutW;
uniform float uCutOn, uCutFloor, uCutRoof, uCutRoofR, uCutHole;
uniform vec3 uCutEye;
`;

const FRAG = /* glsl */ `#include <clipping_planes_fragment>
if (uCutOn > 0.5) {
  float cut = 0.0, roofed = 0.0;
#ifdef CUT_ROOF
  float rd = distance(vCutW.xz, uCutEye.xz);
  roofed = step(uCutRoof, ${OPEN - 1}.0) * step(rd, uCutRoofR);
  cut = step(uCutRoof, vCutW.y) * smoothstep(uCutRoofR, uCutRoofR - 4.0, rd);
#endif
  vec3 sight = uCutEye - cameraPosition, w = vCutW - cameraPosition;
  float len = length(sight), t = dot(w, sight) / len, perp = length(w - sight * (t / len)), r = uCutHole * t / len;
  float before = step(uCutFloor, vCutW.y) * step(t, len - 0.6);
  cut = max(cut, before * smoothstep(r, r * 0.82, perp));
  float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (cut > dither) discard;
#ifdef CUT_CAP
  if (!gl_FrontFacing) { // inside a cut wall: a dark cap; elsewhere culled as before
    if (roofed < 0.5 && before * step(perp, r * 1.3) < 0.5) discard;
    gl_FragColor = vec4(0.014, 0.011, 0.01, 1.0);
    return;
  }
#endif
}`;

type Patched = THREE.Material & { userData: { cut?: { side: THREE.Side; shadowSide: THREE.Side | null; roof: boolean } } };

export class Cutaway {
  private on = false;
  private mats = new Set<Patched>();
  private ray = new THREE.Raycaster();
  private up = new THREE.Vector3(0, 1, 0);
  private head = new THREE.Vector3();
  private check = 0;
  private scan = 0;
  private roofed = false;
  private roofT = 0; // s the overhead state has disagreed with `roofed`
  private roof = OPEN; // eased cut height, relative to the feet

  private readonly roots: THREE.Object3D[];
  private readonly blockers: THREE.Object3D[];

  constructor(roots: THREE.Object3D[], blockers: THREE.Object3D[]) {
    this.roots = roots;
    this.blockers = blockers;
    this.ray.far = 30;
  }

  /** Switch the cuts on (Diablo view) or off: back faces become caps or are culled again (programs recompile once). */
  set enabled(on: boolean) {
    if (on === this.on) return;
    this.on = on;
    U.uCutOn.value = on ? 1 : 0;
    this.scan = 0;
    for (const m of this.mats) this.sides(m);
    if (on) this.patchAll();
  }

  get enabled(): boolean {
    return this.on;
  }

  /** Per frame, after the camera moved. `feet`: the hero's feet. */
  update(dt: number, feet: THREE.Vector3): void {
    if (!this.on) return;
    if ((this.scan -= dt) <= 0) { // models stream in after boot: patch their materials as they appear
      this.scan = 1;
      this.patchAll();
    }
    if ((this.check -= dt) <= 0) {
      this.check = CHECK;
      this.ray.set(this.head.set(feet.x, feet.y + 1.7, feet.z), this.up);
      const over = this.ray.intersectObjects(this.blockers, false).some((h) => h.object.visible); // pergolas' invisible camera stops don't count
      this.roofT = over === this.roofed ? 0 : this.roofT + CHECK;
      if (this.roofT >= (over ? 0.15 : 0.4)) { this.roofed = over; this.roofT = 0; }
    }
    // The cut slides down as you step under a roof and back up as you leave.
    this.roof = THREE.MathUtils.damp(this.roof, this.roofed ? ROOF : 30, 6, dt);
    U.uCutRoof.value = this.roof > 29 ? OPEN : feet.y + this.roof;
    U.uCutEye.value.set(feet.x, feet.y + 1.2, feet.z);
    U.uCutFloor.value = feet.y + FLOOR;
  }

  private patchAll(): void {
    for (const r of this.roots) r.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of [mesh.material].flat() as Patched[]) {
        if (!m.userData.cut && !(m as THREE.ShaderMaterial).isShaderMaterial) this.patch(m, !PLANTS.has(o.userData.role));
      }
    });
  }

  private patch(m: Patched, roof: boolean): void {
    m.userData.cut = { side: m.side, shadowSide: m.shadowSide, roof };
    const own = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey(); // the default key is the original hook's source: read it before wrapping
    m.onBeforeCompile = (sh, r) => {
      own(sh, r);
      if (!sh.vertexShader.includes('#include <fog_vertex>') || !sh.fragmentShader.includes('#include <clipping_planes_fragment>')) return;
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec3 vCutW;\n' + sh.vertexShader.replace('#include <fog_vertex>', VERT);
      sh.fragmentShader = FRAG_DECL + sh.fragmentShader.replace('#include <clipping_planes_fragment>', FRAG);
    };
    m.customProgramCacheKey = () => `${key}|cut`;
    if (roof) m.defines = { ...m.defines, CUT_ROOF: '' };
    this.mats.add(m);
    this.sides(m);
  }

  /** Closed solids go double-sided while the cuts are on, their back faces drawn as caps. */
  private sides(m: Patched): void {
    const { side, shadowSide, roof } = m.userData.cut!;
    const cap = this.on && roof && side === THREE.FrontSide && !m.transparent;
    m.side = cap ? THREE.DoubleSide : side;
    m.shadowSide = cap ? THREE.BackSide : shadowSide; // the shadow map renders back faces of a front-sided solid, as before
    if (cap) m.defines = { ...m.defines, CUT_CAP: '' };
    else if (m.defines && 'CUT_CAP' in m.defines) delete m.defines.CUT_CAP;
    m.needsUpdate = true;
  }
}
