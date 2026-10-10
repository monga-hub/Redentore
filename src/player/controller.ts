import * as THREE from 'three';
import { PLAYER, type World } from '../core/physics.ts';
import type { Input } from '../core/input.ts';
import { UndeadModel } from './undead.ts';

const RUN = 6, WALK = 2.5, GRAVITY = 22, JUMP = 7, TURN = 12;

/** Hero: skinned undead model over a capsule collider, camera-relative WASD, gravity, jump, step-up. */
export class PlayerController {
  readonly mesh = new THREE.Group();
  private model = new UndeadModel();
  readonly pos = new THREE.Vector3(); // feet position
  private vy = 0;
  private grounded = true;
  facing = 0; // yaw, same convention as the camera (0 = facing -Z / north)

  readonly world: World;
  private spawn: { x: number; z: number; yaw: number };

  constructor(world: World, spawn: { x: number; z: number; yaw: number }) {
    this.world = world;
    this.spawn = spawn;
    this.mesh.add(this.model.root);
    this.respawn(spawn);
  }

  respawn(s: { x: number; z: number; yaw: number }): void {
    this.pos.set(s.x, this.world.standHeight(s.x, s.z), s.z);
    this.vy = 0;
    this.facing = s.yaw;
  }

  /** Main-attack swing on the model; movement carries on underneath. */
  attack(): void {
    this.model.attack();
  }

  /** Blink up to `dist` m along the facing, stopping short of the first wall. Returns metres travelled. */
  blink(dist: number): number {
    const dx = -Math.sin(this.facing), dz = -Math.cos(this.facing), STEP = 0.2;
    let d = 0;
    while (d + STEP <= dist && !this.world.blocked(this.pos.x + dx * (d + STEP), this.pos.z + dz * (d + STEP), this.pos.y)) d += STEP;
    this.pos.x += dx * d;
    this.pos.z += dz * d;
    this.grounded = false; // let gravity settle the feet if we blinked off a ledge
    return d;
  }

  /** `camYaw`: camera heading; movement is relative to it. `turnToCamera`: right mouse held. */
  update(dt: number, input: Input, camYaw: number, turnToCamera: boolean): void {
    let f = (input.down('KeyW', 'ArrowUp') ? 1 : 0) - (input.down('KeyS', 'ArrowDown') ? 1 : 0);
    let r = (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0);
    if ((input.buttons & 3) === 3) f = 1; // both mouse buttons: auto-forward
    if (!f && !r) { f = -input.stickY; r = input.stickX; } // touch stick: analog, |v| <= 1
    const speed = (input.down('ShiftLeft', 'ShiftRight') ? WALK : RUN);

    // forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    let mx = -sin * f + cos * r, mz = -cos * f - sin * r;
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      const k = Math.min(1, len) / len; // keys: unit length; stick: keeps its partial tilt
      this.pos.x += mx * k * speed * dt;
      this.pos.z += mz * k * speed * dt;
      mx /= len; mz /= len;
    }
    const want = turnToCamera ? camYaw : len > 0 ? Math.atan2(-mx, -mz) : this.facing;
    let d = want - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += d * Math.min(1, TURN * dt);

    this.world.resolve(this.pos, this.pos.y);

    if (this.grounded && input.down('Space')) { this.vy = JUMP; this.grounded = false; }
    const ground = this.world.groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.grounded && this.vy <= 0 && this.pos.y - ground < PLAYER.step + 0.05) {
      this.pos.y = ground; // stick to stairs going down, step up going up
    } else {
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;
      this.grounded = this.pos.y <= ground;
      if (this.grounded) { this.pos.y = ground; this.vy = 0; }
    }
    if (this.pos.y < -10) this.respawn(this.spawn); // safety net, barriers should prevent it

    const moved = dt > 0 ? Math.hypot(this.pos.x - this.mesh.position.x, this.pos.z - this.mesh.position.z) / dt : 0;
    this.model.animate(dt, Math.min(moved, RUN * 1.5), this.grounded); // clamp: respawn teleports
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.facing;
  }
}
