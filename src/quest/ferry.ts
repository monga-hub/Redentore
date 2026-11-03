import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { extrude } from '../level/builder.ts';
import { DECK, HULL, gondola, sheer, beam } from '../level/gondola.ts';
export { HULL } from '../level/gondola.ts';
import { loadModel, stand } from '../core/models.ts';
import { SPAWN } from '../level/plan.ts';
import { FERRY_A, FERRY_B } from '../level/zones/sangiorgio.ts';
import type { PlayerController } from '../player/controller.ts';
import type { Crossing } from './progress.ts';

// Mastro Iseppo's gondola, finished on the squero's trestles in level 2, black with its ferro: moored across the end of the
// Punta della Giudecca's pontile or of San Giorgio's approdo (FERRY_A, FERRY_B in zones/sangiorgio.ts), whichever is nearer
// the hero, it carries them across the channel, the hero standing in it, keys and casts held (main.ts); once the Abate is dead
// the trip back goes on, through a fade, to Fra' Zuane on the Redentore's fondamenta. "Il ferro sa la strada": the oar is
// pulled by the shade of a drowned gondolier, standing on the stern deck, who strokes as fast as the boat goes and rests the
// oar in the forcola when it lies still.
// Each trip arrives the way the next one leaves: OUT ends bow south at San Giorgio, rounding the approdo, and BACK (or home)
// ends bow north at the Punta, rounding the pontile, so the moored hull never swings or flips through a landing stage
// (scripts/check-ferry.ts sweeps the hull, its ferro and the oar's blade along both and against every solid of the level).

const SPEED = 10; // m/s at full stroke
const CREEP = 1.2; // m/s leaving and reaching a berth
const ACCEL = 1.4; // m/s more per metre away from a berth or out of a turn
const TURN = 1.1; // rad/s the gondolier swings the hull at most: slow round the turns at the stages
const FADE = 0.7; // s of the fade to black on the way home
/** Where each trip sets the hero down: on the approdo facing the basilica, on the pontile facing the fondamenta, beside Fra' Zuane. */
const ARRIVE: Record<Crossing, { x: number; z: number; yaw: number }> = {
  out: { x: -437.5, z: 100, yaw: Math.PI / 2 },
  back: { x: -413, z: 10, yaw: -Math.PI / 2 },
  home: SPAWN,
};

/** The forcola's notch, where the oar turns (boat frame: +X the bow, +Z starboard, y up, the water at -1.2). */
const NOTCH = new THREE.Vector3(-3, sheer(-3) + 0.62, HULL.starboard * beam(-3) - 0.04);
/** The oar: from the handle to the blade's tip along its own +X, the notch at 0. */
const OAR = { handle: -1.6, blade: 1.75, tip: 2.8 };
/** The oar's rest (yaw outboard, pitch down) and the stroke's sweep. */
const REST = { yaw: -0.5, pitch: 0.65 }, SWEEP = 0.2, LIFT = 0.08;
/** The gondolier's feet on the stern deck, a short reach behind the oar's grip (the Meshy body's arms are 0.5 m). */
const ROWER = new THREE.Vector3(-4.34, sheer(-4.34) + 0.03, -0.12);

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** One way across: a centripetal Catmull-Rom through (x, z), its speed limit along it. */
export class Route {
  readonly len: number;
  private curve: THREE.CatmullRomCurve3;
  private lim: Float32Array;
  private v = new THREE.Vector3();
  private w = new THREE.Vector3();
  private static STEP = 0.5;

  constructor(pts: [number, number][]) {
    this.curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    this.curve.arcLengthDivisions = 1000;
    this.len = this.curve.getLength();
    const S = Route.STEP, n = Math.ceil(this.len / S) + 1, lim = (this.lim = new Float32Array(n));
    const yaw = (d: number) => this.pose(THREE.MathUtils.clamp(d, 0, this.len)).yaw;
    for (let i = 0; i < n; i++) { // the sharpest bend within a step either side, in 10 cm steps
      let bend = 1e-6;
      for (let d = (i - 1) * S; d < (i + 1) * S; d += 0.1) bend = Math.max(bend, Math.abs(wrap(yaw(d + 0.1) - yaw(d))) / 0.1);
      lim[i] = Math.min(SPEED, TURN / bend);
    }
    lim[0] = lim[n - 1] = CREEP;
    for (let i = 1; i < n; i++) lim[i] = Math.min(lim[i], lim[i - 1] + S * ACCEL);
    for (let i = n - 2; i >= 0; i--) lim[i] = Math.min(lim[i], lim[i + 1] + S * ACCEL);
  }

  /** Where the hull's middle is `d` m along, and its yaw (the bow +X). */
  pose(d: number): { x: number; z: number; yaw: number } {
    const u = THREE.MathUtils.clamp(d / this.len, 0, 1);
    this.curve.getPointAt(u, this.v);
    this.curve.getTangentAt(u, this.w);
    return { x: this.v.x, z: this.v.z, yaw: Math.atan2(-this.w.z, this.w.x) };
  }

  /** m/s the gondolier rows `d` m along. */
  speed(d: number): number {
    const f = THREE.MathUtils.clamp(d, 0, this.len) / Route.STEP, i = Math.min(Math.floor(f), this.lim.length - 2);
    return THREE.MathUtils.lerp(this.lim[i], this.lim[i + 1], f - i);
  }
}

/**
 * The Punta to San Giorgio, bow north off the pontile, up the channel east of the approdo and round its end to lie there bow
 * south; and back, south past the pontile's end and round it to lie there bow north. The home trip rows BACK.
 */
export const OUT = new Route([[FERRY_A.x, FERRY_A.z], [FERRY_A.x, FERRY_A.z + 6], [-420.5, 30], [-423.5, 55], [-423.5, 80], [-423, 100], [-424.2, 109], [-427.6, 113], [-430.8, 110.5], [FERRY_B.x, FERRY_B.z + 6], [FERRY_B.x, FERRY_B.z]]);
export const BACK = new Route([[FERRY_B.x, FERRY_B.z], [FERRY_B.x, FERRY_B.z - 6], [-429.5, 80], [-427, 55], [-425.5, 30], [-426, 12], [-425.4, 1], [-422.2, -3], [-419, -0.5], [FERRY_A.x, FERRY_A.z - 6], [FERRY_A.x, FERRY_A.z]]);
export const routeOf = (c: Crossing): Route => (c === 'out' ? OUT : BACK);

/** Plan points round the hull, its ferro, and the oar's blade at both ends of the stroke (boat frame, x and z): what must clear every stage. */
export function footprint(): [number, number][] {
  const pts: [number, number][] = [];
  for (let x = -HULL.half; x <= HULL.half + 1e-6; x += 0.25) pts.push([x, -HULL.port * beam(x)], [x, HULL.starboard * beam(x)]);
  pts.push([HULL.bow, 0]);
  for (const k of [-1, 0, 1]) pts.push(oarTip(REST.yaw + k * SWEEP, REST.pitch - (k < 0 ? 0 : LIFT)));
  return pts;
}
function oarTip(yaw: number, pitch: number): [number, number] {
  const h = OAR.tip * Math.cos(pitch);
  return [NOTCH.x + h * Math.cos(yaw), NOTCH.z - h * Math.sin(yaw)];
}

/** The oar along +X, the notch at 0, in one piece: a stout round shaft, a knob at the grip, the shaft flaring into a broad flat blade. */
function oarGeometry(): THREE.BufferGeometry {
  const len = OAR.blade - OAR.handle, R = 0.07;
  const shaft = new THREE.CylinderGeometry(R, R * 0.9, len, 12).rotateZ(-Math.PI / 2).translate(OAR.handle + len / 2, 0, 0);
  const knob = new THREE.SphereGeometry(R * 1.3, 12, 8).translate(OAR.handle, 0, 0);
  const w = 0.15, n = R * 0.9; // the blade's half-width; the shaft's at the neck, where the blade grows out of it
  const s = new THREE.Shape().moveTo(OAR.blade - 0.35, n).quadraticCurveTo(OAR.blade + 0.05, n, OAR.blade + 0.3, w).lineTo(OAR.tip - 0.16, w)
    .quadraticCurveTo(OAR.tip, w * 0.85, OAR.tip, 0).quadraticCurveTo(OAR.tip, -w * 0.85, OAR.tip - 0.16, -w).lineTo(OAR.blade + 0.3, -w)
    .quadraticCurveTo(OAR.blade + 0.05, -n, OAR.blade - 0.35, -n).closePath();
  const blade = extrude(s, 0.06, 0.02);
  return mergeGeometries([shaft.toNonIndexed(), knob.toNonIndexed(), blade.toNonIndexed()].map((g) => (g.deleteAttribute('uv'), g)))!;
}

const _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _b = new THREE.Quaternion();
const _s = new THREE.Vector3(), _e = new THREE.Vector3(), _h = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Vector3();
/** Turn `bone` by the world rotation `q`, children along. */
function turn(bone: THREE.Object3D, q: THREE.Quaternion): void {
  bone.parent!.getWorldQuaternion(_p).invert();
  bone.quaternion.copy(_p.multiply(q).multiply(bone.getWorldQuaternion(_b)));
  bone.updateMatrixWorld(true);
}
/** Two-bone reach: the arm's wrist to `to` (world), the elbow bent toward `pole`. */
function reach(upper: THREE.Object3D, fore: THREE.Object3D, hand: THREE.Object3D, to: THREE.Vector3, pole: THREE.Vector3): void {
  upper.getWorldPosition(_s); fore.getWorldPosition(_e); hand.getWorldPosition(_h);
  const a = _s.distanceTo(_e), b = _e.distanceTo(_h), d = THREE.MathUtils.clamp(_s.distanceTo(to), Math.abs(a - b) + 1e-3, a + b - 1e-3);
  _d.subVectors(to, _s).normalize();
  _n.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
  const c = (a * a + d * d - b * b) / (2 * a * d);
  _m.copy(_s).addScaledVector(_d, a * c).addScaledVector(_n, a * Math.sqrt(Math.max(0, 1 - c * c))); // where the elbow goes
  turn(upper, _q.setFromUnitVectors(_e.sub(_s).normalize(), _m.sub(_s).normalize()));
  fore.getWorldPosition(_e); hand.getWorldPosition(_h);
  turn(fore, _q.setFromUnitVectors(_h.sub(_e).normalize(), _d.subVectors(to, _e).normalize()));
}

interface Rower {
  mixer: THREE.AnimationMixer;
  spine: THREE.Object3D;
  arms: [THREE.Object3D, THREE.Object3D, THREE.Object3D][]; // right, left: upper arm, forearm, hand
}

export class Ferry {
  readonly root = new THREE.Group();
  /** The trip under way, if any: main.ts holds the hero's keys meanwhile. */
  trip?: Crossing;
  private d = 0; // m along the trip
  private t = 0;
  private v = 0; // m/s now
  private pull = 0; // 0..1: how hard the gondolier rows
  private phase = 0; // of the stroke
  private oar = new THREE.Group();
  private hold = [new THREE.Object3D(), new THREE.Object3D()]; // on the oar's grip: the right hand, the left
  private body = new THREE.Group();
  private rower?: Rower;
  private loading = false;
  private fade = document.createElement('div');
  private across = new THREE.Vector3();
  private pole = new THREE.Vector3();
  private grip = new THREE.Vector3();
  private rest = new THREE.Vector3(); // the grip at rest, in the boat's frame

  constructor() {
    const hull = gondola();
    const beech = new THREE.MeshStandardMaterial({ color: 0xb38a58, roughness: 0.5 });
    this.oar.add(new THREE.Mesh(oarGeometry(), beech));
    this.oar.position.copy(NOTCH);
    this.oar.rotation.order = 'YZX';
    this.hold[0].position.set(OAR.handle + 0.06, 0, 0);
    this.hold[1].position.set(OAR.handle + 0.26, 0, 0);
    this.oar.add(...this.hold);
    const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fffd8).multiplyScalar(2.5), fog: false })); // the ghost-light on the stern
    lamp.position.set(-HULL.half + 0.1, sheer(-HULL.half) + 0.32, 0);
    this.body.position.copy(ROWER);
    this.body.rotation.y = -Math.PI / 2 - 0.4; // facing the bow, turned to the oar on the right
    this.oar.traverse((o) => { o.castShadow = true; });
    this.root.add(...hull.children, this.oar, lamp, this.body);
    this.root.visible = false;
    this.pose(0);
    this.oar.updateMatrix();
    this.rest.copy(this.hold[0].position).applyMatrix4(this.oar.matrix);
    this.fade.style.cssText = `position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity ${FADE}s;z-index:6`;
    document.body.append(this.fade);
  }

  /** The drowned gondolier's shade, fetched the first time the gondola shows (level 3 only). */
  private summon(): void {
    this.loading = true;
    loadModel('gondoliere.glb').then((gltf) => {
      const model = gltf.scene;
      stand(model, 1.8);
      model.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const m = o.material as THREE.MeshStandardMaterial;
        m.emissive.setHex(0x6fd8c0); // a ghost, as Fra' Zuane is: the lamp's sea-green
        m.emissiveIntensity = 0.45;
      });
      this.body.add(model);
      const mixer = new THREE.AnimationMixer(model);
      mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'Idle') ?? gltf.animations[0]).play();
      const bone = (n: string) => model.getObjectByName(n)!;
      this.rower = { mixer, spine: bone('Spine'), arms: (['Right', 'Left'] as const).map((s) => [bone(`${s}Arm`), bone(`${s}ForeArm`), bone(`${s}Hand`)] as [THREE.Object3D, THREE.Object3D, THREE.Object3D]) };
    });
  }

  /** The hero steps aboard: the trip starts. */
  board(c: Crossing, player: PlayerController): void {
    if (this.trip) return;
    this.trip = c;
    this.d = 0;
    player.carried = 'boat';
  }

  /** The hero fell aboard: the trip is called off where it stands (main.ts wakes them at the checkpoint). */
  abort(player: PlayerController): void {
    if (!this.trip) return;
    this.trip = undefined;
    player.carried = '';
    this.fade.style.opacity = '0';
  }

  /** Per frame: moored at the nearer berth (shown once `shown`), or rowing with the hero aboard; true on arrival. */
  update(dt: number, player: PlayerController, shown: boolean): boolean {
    this.t += dt;
    const bob = Math.sin(this.t * 1.7) * 0.04;
    if (!this.trip) {
      this.root.visible = shown;
      if (shown && !this.loading) this.summon();
      const at = player.pos.x > -425 ? FERRY_A : FERRY_B;
      this.root.position.set(at.x, bob, at.z);
      this.root.rotation.set(0, at.yaw, 0);
      this.v = 0;
      this.pose(dt);
      return false;
    }
    const r = routeOf(this.trip);
    this.v = r.speed(this.d);
    this.d = Math.min(r.len, this.d + this.v * dt);
    const p = r.pose(this.d);
    this.root.visible = true;
    this.root.position.set(p.x, bob, p.z);
    this.root.rotation.set(Math.sin(this.t * 1.3) * 0.02, p.yaw, 0);
    this.pose(dt);
    player.pos.set(p.x, DECK + bob, p.z);
    player.facing = p.yaw - Math.PI / 2; // the hero's yaw 0 looks down -Z, the hull's bow is +X
    if (this.trip === 'home' && r.len - this.d < this.v * FADE) this.fade.style.opacity = '1'; // fading as it nears the Punta
    if (this.d < r.len) return false;
    player.carried = '';
    player.respawn(ARRIVE[this.trip]);
    this.trip = undefined;
    this.fade.style.opacity = '0';
    return true;
  }

  /** The stroke: the oar swept in the forcola as hard as the boat goes, the gondolier leaning into it, both hands on the grip. */
  private pose(dt: number): void {
    const want = Math.min(1, this.v / 3);
    this.pull += (want - this.pull) * (1 - Math.exp(-dt * 2.5));
    this.phase += dt * 2 * Math.PI * (0.3 + 0.35 * Math.min(1, this.v / SPEED)) * Math.min(1, this.pull * 8);
    const k = this.pull, sin = Math.sin(this.phase), cos = Math.cos(this.phase);
    this.oar.rotation.set(0, REST.yaw + k * SWEEP * sin, -(REST.pitch - k * LIFT * Math.max(0, cos))); // drive as the yaw falls (the grip pushed forward), the blade lifted coming back
    const rw = this.rower;
    if (!rw || !this.root.visible) return;
    rw.mixer.update(dt);
    this.oar.updateMatrix(); // the body rocks after the grip, the arms take the rest
    const g = this.grip.copy(this.hold[0].position).applyMatrix4(this.oar.matrix).sub(this.rest);
    this.body.position.set(ROWER.x + 0.9 * g.x, ROWER.y, ROWER.z + 0.9 * g.z);
    this.root.updateMatrixWorld(true);
    // Lean into the drive, about the hull's beam.
    const across = this.across.set(0, 0, 1).transformDirection(this.root.matrixWorld);
    turn(rw.spine, _q.setFromAxisAngle(across, -(0.22 - k * 0.12 * sin)));
    rw.arms.forEach(([upper, fore, hand], i) => {
      this.pole.set(0, -1, 0).addScaledVector(across, i ? -0.7 : 0.7); // elbows down and out to their own side
      reach(upper, fore, hand, this.hold[i].getWorldPosition(this.grip), this.pole);
    });
  }
}
