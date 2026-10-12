import * as THREE from 'three';
import type { Input } from '../core/input.ts';

// "Stile Diablo" camera, after Diablo Immortal: high up at a fixed yaw (the site reads diagonally,
// not along its axes), looking steeply down through a narrow perspective lens, pulled back so the
// hero is about a seventh of the screen tall with plenty of floor around and sits a little below
// the centre. No orbit; wheel and pinch zoom within a range. Walls and roofs between the camera
// and the hero fade or lift off (fx/occlusion.ts) rather than pulling the camera in.

export const DIABLO = { yaw: Math.PI / 4, pitch: THREE.MathUtils.degToRad(58), fov: 33 }; // yaw: looking north-west
const MIN_DIST = 9, MAX_DIST = 24, DIST = 18;
const AIM_UP = 1, AIM_AHEAD = 1.3; // m: aim over the head and a little up-screen, so the hero sits below the centre
const FOLLOW = 8, FOLLOW_Y = 5; // 1/s: a quick but soft follow; stairs ease in slower

export class DiabloCamera {
  readonly yaw = DIABLO.yaw;
  private dist = DIST; // wanted (wheel / pinch)
  private zoom = DIST; // eased towards dist
  private focus = new THREE.Vector3();
  private placed = false;
  private dir = new THREE.Vector3();

  readonly camera: THREE.PerspectiveCamera;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    const cp = Math.cos(DIABLO.pitch);
    this.dir.set(Math.sin(this.yaw) * cp, Math.sin(DIABLO.pitch), Math.cos(this.yaw) * cp);
  }

  /** Jump straight onto the hero on the next update (respawns, loads); a CameraBlend smooths the cut. */
  snap(): void {
    this.placed = false;
  }

  update(dt: number, input: Input, feet: THREE.Vector3): void {
    const { wheel, zoom } = input.consume(); // drags are dropped: the view never orbits
    this.dist = THREE.MathUtils.clamp(this.dist * (1 + wheel * 0.12) * zoom, MIN_DIST, MAX_DIST);
    this.zoom = THREE.MathUtils.damp(this.zoom, this.dist, 10, dt);
    const x = feet.x - Math.sin(this.yaw) * AIM_AHEAD, y = feet.y + AIM_UP, z = feet.z - Math.cos(this.yaw) * AIM_AHEAD;
    const f = this.focus;
    if (!this.placed || f.distanceToSquared(feet) > 400) f.set(x, y, z); // a teleport cuts, it doesn't pan across the map
    else f.set(THREE.MathUtils.damp(f.x, x, FOLLOW, dt), THREE.MathUtils.damp(f.y, y, FOLLOW_Y, dt), THREE.MathUtils.damp(f.z, z, FOLLOW, dt));
    this.placed = true;
    const c = this.camera;
    c.position.copy(f).addScaledVector(this.dir, this.zoom);
    c.lookAt(f);
    if (c.fov !== DIABLO.fov) {
      c.fov = DIABLO.fov;
      c.updateProjectionMatrix();
    }
  }
}

/**
 * Eases the camera from where it was when `start` was called to wherever the active controller puts
 * it now: switching style mid-game, or the intro handing over to the Diablo view.
 */
export class CameraBlend {
  private from = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private fov = 60;
  private t = 1;
  private readonly time: number;

  constructor(time = 1.2) {
    this.time = time;
  }

  start(c: THREE.PerspectiveCamera): void {
    this.from.copy(c.position);
    this.q.copy(c.quaternion);
    this.fov = c.fov;
    this.t = 0;
  }

  /** After the controller placed the camera this frame. */
  apply(c: THREE.PerspectiveCamera, dt: number): void {
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / this.time);
    const k = this.t * this.t * (3 - 2 * this.t);
    c.position.lerpVectors(this.from, c.position, k);
    c.quaternion.slerpQuaternions(this.q, c.quaternion, k);
    c.fov = this.fov + (c.fov - this.fov) * k;
    c.updateProjectionMatrix();
  }
}
