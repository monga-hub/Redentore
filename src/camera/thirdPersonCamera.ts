import * as THREE from 'three';
import type { Input } from '../core/input.ts';

const MIN_DIST = 1.5, MAX_DIST = 30, SENS = 0.005;
const MIN_PITCH = -0.35, MAX_PITCH = 1.35;
const EYE = 1.6;

/**
 * WoW-style follow camera: orbits a target point above the player's head.
 * yaw 0 looks north (-Z). The boom is shortened when a camera-blocking mesh sits
 * between the player and the camera, so walls and ceilings never hide the hero.
 */
export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  yaw: number;
  pitch = 0.3;
  private dist = 7;
  private shown = 7; // smoothed, collision-limited distance
  private ray = new THREE.Raycaster();
  private target = new THREE.Vector3();
  private dir = new THREE.Vector3();

  private blockers: THREE.Object3D[];

  constructor(aspect: number, yaw: number, blockers: THREE.Object3D[]) {
    this.blockers = blockers;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1200);
    this.yaw = yaw;
  }

  update(dt: number, input: Input, feet: THREE.Vector3): void {
    const { dx, dy, wheel } = input.consume();
    this.yaw -= dx * SENS; // deltas only accumulate while a button is held
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * SENS, MIN_PITCH, MAX_PITCH);
    if (input.down('KeyQ')) this.yaw += 2 * dt;
    if (input.down('KeyE')) this.yaw -= 2 * dt;
    this.dist = THREE.MathUtils.clamp(this.dist * (1 + wheel * 0.12), MIN_DIST, MAX_DIST);

    this.target.set(feet.x, feet.y + EYE, feet.z);
    const cp = Math.cos(this.pitch);
    this.dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);

    this.ray.set(this.target, this.dir);
    this.ray.far = this.dist;
    const hit = this.ray.intersectObjects(this.blockers, false)[0];
    const limit = hit ? Math.max(0.3, hit.distance - 0.3) : this.dist;
    // snap in instantly when blocked, ease back out
    this.shown = limit < this.shown ? limit : THREE.MathUtils.damp(this.shown, limit, 6, dt);

    this.camera.position.copy(this.target).addScaledVector(this.dir, this.shown);
    this.camera.lookAt(this.target);
  }
}
