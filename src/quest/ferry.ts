import * as THREE from 'three';
import { extrude, shaped } from '../level/builder.ts';
import { material } from '../level/materials.ts';
import { SPAWN } from '../level/plan.ts';
import { CROSSING, FERRY_A, FERRY_B } from '../level/zones/sangiorgio.ts';
import type { PlayerController } from '../player/controller.ts';
import type { Crossing } from './progress.ts';

// Mastro Iseppo's gondola, finished on the squero's trestles in level 2, black with its ferro, rowing itself ("il ferro sa
// la strada"): moored at the Punta della Giudecca's pontile or at San Giorgio's approdo, whichever is nearer the hero, it
// carries them across the channel along CROSSING (zones/sangiorgio.ts), the hero standing in it, keys and casts held
// (main.ts); once the Abate is dead the trip back goes on, through a fade, to Fra' Zuane on the Redentore's fondamenta.

const SPEED = 10; // m/s at full stroke: the ~95 m crossing in about 11 s
const DECK = -1.05; // the hero's feet in the hull, the water at -1.2
const FADE = 0.7; // s of the fade to black on the way home
/** Where each trip sets the hero down: on the approdo facing the basilica, on the pontile facing the fondamenta, beside Fra' Zuane. */
const ARRIVE: Record<Crossing, { x: number; z: number; yaw: number }> = {
  out: { x: -437.5, z: 100, yaw: Math.PI / 2 },
  back: { x: -413, z: 10, yaw: -Math.PI / 2 },
  home: SPAWN,
};

export class Ferry {
  readonly root = new THREE.Group();
  /** The trip under way, if any: main.ts holds the hero's keys meanwhile. */
  trip?: Crossing;
  private curve: THREE.CatmullRomCurve3;
  private back: THREE.CatmullRomCurve3;
  private len: number;
  private d = 0; // m along the trip
  private t = 0;
  private oar: THREE.Mesh;
  private fade = document.createElement('div');
  private v = new THREE.Vector3();
  private w = new THREE.Vector3();

  constructor() {
    const pts = CROSSING.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.curve = new THREE.CatmullRomCurve3(pts);
    this.back = new THREE.CatmullRomCurve3([...pts].reverse());
    this.len = this.curve.getLength();
    // The hull as on the squero's trestles (zones/giudecca.ts), the ferro at the prow (+X), afloat.
    const hull = new THREE.Shape().moveTo(-5.5, 1.1).quadraticCurveTo(-3, 0, 0, 0).quadraticCurveTo(3, 0, 5.5, 1.3).lineTo(5.2, 1.35).quadraticCurveTo(2.5, 0.55, 0, 0.55).quadraticCurveTo(-2.5, 0.55, -5.2, 1.15).closePath();
    const boat = new THREE.Mesh(shaped(extrude(hull, 1.4, 0.06)).translate(0, -1.45, 0), material('iron'));
    const ferro = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.25).translate(5.35, -0.2, 0), material('stone'));
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 1.1).translate(-1.6, -0.75, 0), material('wood'));
    this.oar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 4).translate(0, 0, 2), material('wood')); // pivoting on the forcola, rowing alone
    this.oar.position.set(-3.6, 0.1, 0.65);
    const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fffd8).multiplyScalar(2.5), fog: false })); // the ghost-light at the stern
    lamp.position.set(-4.9, 1.2, 0);
    for (const m of [boat, ferro, seat, this.oar]) m.castShadow = true;
    this.root.add(boat, ferro, seat, this.oar, lamp);
    this.root.visible = false;
    this.fade.style.cssText = `position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity ${FADE}s;z-index:6`;
    document.body.append(this.fade);
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
      const at = player.pos.x > -425 ? FERRY_A : FERRY_B, next = player.pos.x > -425 ? CROSSING[1] : CROSSING[CROSSING.length - 2];
      this.root.position.set(at.x, bob, at.z);
      this.root.rotation.set(0, Math.atan2(-(next[1] - at.z), next[0] - at.x), 0);
      this.oar.rotation.y = 0.5;
      return false;
    }
    const c = this.trip === 'out' ? this.curve : this.back;
    const v = Math.min(SPEED, 1.2 + this.d * 1.1, 1.2 + (this.len - this.d) * 1.1);
    this.d = Math.min(this.len, this.d + v * dt);
    const u = this.d / this.len;
    c.getPointAt(u, this.v);
    c.getTangentAt(u, this.w);
    this.root.visible = true;
    this.root.position.set(this.v.x, bob, this.v.z);
    this.root.rotation.set(Math.sin(this.t * 1.3) * 0.02, Math.atan2(-this.w.z, this.w.x), 0);
    this.oar.rotation.y = 0.5 + Math.sin(this.t * 2.4) * 0.35; // the stroke
    player.pos.set(this.v.x, DECK + bob, this.v.z);
    player.facing = Math.atan2(-this.w.x, -this.w.z);
    if (this.trip === 'home' && this.len - this.d < v * FADE) this.fade.style.opacity = '1'; // fading as it nears the Punta
    if (this.d < this.len) return false;
    player.carried = '';
    player.respawn(ARRIVE[this.trip]);
    this.trip = undefined;
    this.fade.style.opacity = '0';
    return true;
  }
}
