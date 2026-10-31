import * as THREE from 'three';
import { PLAYER, type World } from '../core/physics.ts';
import type { Input } from '../core/input.ts';
import { UndeadModel } from './undead.ts';
import type { Hero } from './heroes.ts';

const RUN = 6, WALK = 2.5, GRAVITY = 22, JUMP = 7, TURN = 12;
// Weight: the stride builds up and dies down instead of starting and stopping dead (full run in ~0.2 s, stopped in ~0.15 s);
// at speed a turn sweeps the run round an arc, sharper than PIVOT the hero plants and pushes off the other way.
const ACCEL = 30, BRAKE = 42, ARC = 9, PIVOT = 1.9;
// The body's yaw follows `facing` on a critically damped spring (s to settle ~3×): turns and casts' snaps swing, never pop.
const SWING = 0.07;
// Lean (rad): into a turn by speed × yaw rate, forward as he pushes off, back as he brakes; eased at LEAN_EASE /s.
const BANK = 0.0042, BANK_MAX = 0.2, PITCH = 0.0035, PITCH_MAX = 0.11, LEAN_EASE = 10;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Hero: skinned undead model over a capsule collider, camera-relative WASD, gravity, jump, step-up. */
export class PlayerController {
  readonly mesh = new THREE.Group();
  /** The body: its moves, aura and hands (abilities drive it). */
  readonly model: UndeadModel;
  /** Dead and falling: keys, stick and steering are ignored (gravity still applies). */
  frozen = false;
  /** Carried by a leap or a charge (abilities/grimoire.ts moves the feet), or standing in the gondola (quest/ferry.ts): no keys, no gravity. */
  carried: '' | 'leap' | 'charge' | 'boat' = '';
  /** Run speed × (level-up card). */
  speed = 1;
  readonly pos = new THREE.Vector3(); // feet position
  private vy = 0;
  grounded = true; // read by the footsteps (audio/director.ts)
  facing = 0; // yaw, same convention as the camera (0 = facing -Z / north)
  /** Ground velocity (m/s, x and z). */
  private readonly vel = new THREE.Vector2();
  private yaw = 0; // the body's yaw, sprung toward `facing`
  private yawV = 0;
  private bank = 0;
  private pitch = 0;

  readonly world: World;
  private spawn: { x: number; z: number; yaw: number };

  constructor(world: World, spawn: { x: number; z: number; yaw: number }, hero: Hero) {
    this.model = new UndeadModel(hero);
    this.world = world;
    this.spawn = spawn;
    this.mesh.add(this.model.root);
    this.mesh.rotation.order = 'YXZ'; // the lean in the body's own frame
    this.respawn(spawn);
  }

  respawn(s: { x: number; z: number; yaw: number }): void {
    this.pos.set(s.x, this.world.standHeight(s.x, s.z), s.z);
    this.vy = 0;
    this.facing = this.yaw = s.yaw;
    this.yawV = 0;
    this.vel.set(0, 0);
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

  /**
   * `camYaw`: camera heading; movement is relative to it. `turnToCamera`: right mouse held.
   * `steer`: world-space direction (length <= 1) to run along when no key or stick is held (click-to-move).
   */
  update(dt: number, input: Input, camYaw: number, turnToCamera: boolean, steer?: { x: number; z: number }): void {
    let f = (input.down('KeyW', 'ArrowUp') ? 1 : 0) - (input.down('KeyS', 'ArrowDown') ? 1 : 0);
    let r = (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0);
    if ((input.buttons & 3) === 3) f = 1; // both mouse buttons: auto-forward
    if (!f && !r) { f = -input.stickY; r = input.stickX; } // touch stick: analog, |v| <= 1
    if (this.frozen || this.carried) { f = r = 0; steer = undefined; turnToCamera = false; }
    const speed = input.down('ShiftLeft', 'ShiftRight') ? WALK : RUN * this.speed;

    // forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    let mx = -sin * f + cos * r, mz = -cos * f - sin * r;
    if (!mx && !mz && steer) { mx = steer.x; mz = steer.z; }
    const len = Math.hypot(mx, mz);
    let wx = 0, wz = 0;
    if (len > 0) {
      const k = (Math.min(1, len) / len) * speed; // keys: unit length; stick: keeps its partial tilt
      wx = mx * k; wz = mz * k;
      mx /= len; mz /= len;
    }
    if (this.carried) this.vel.set(0, 0); // the leap, the charge, the gondola move him
    else this.accelerate(wx, wz, dt);
    const x0 = this.pos.x, z0 = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    this.want = Math.hypot(wx, wz);
    const want = turnToCamera ? camYaw : len > 0 ? Math.atan2(-mx, -mz) : this.facing;
    let d = want - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += d * Math.min(1, TURN * dt);

    if (this.carried) { this.vy = 0; this.grounded = this.carried !== 'leap'; this.finish(dt); return; }
    this.world.resolve(this.pos, this.pos.y);
    if (dt > 0) { // a wall took some of the step: what is left of the velocity is what he really moved
      const gone = Math.hypot(this.pos.x - x0, this.pos.z - z0) / dt;
      if (gone < this.vel.length() * 0.9) this.vel.set((this.pos.x - x0) / dt, (this.pos.z - z0) / dt);
    }

    if (this.grounded && !this.frozen && input.down('Space')) { this.vy = JUMP; this.grounded = false; }
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
    this.finish(dt);
  }

  /** m/s the keys or the stick ask for this frame; the speed he really made last frame (lean). */
  private want = 0;
  private last = 0;

  /** The velocity toward the wanted one (`wx`, `wz`): arcs at speed, straight lines from a standstill or into a pivot. */
  private accelerate(wx: number, wz: number, dt: number): void {
    const v = this.vel, s = v.length(), ws = Math.hypot(wx, wz);
    if (ws > 0 && s > 0.5) {
      const h = Math.atan2(v.y, v.x), d = wrap(Math.atan2(wz, wx) - h);
      if (Math.abs(d) < PIVOT) {
        const nh = h + THREE.MathUtils.clamp(d, -ARC * dt, ARC * dt);
        const ns = ws > s ? Math.min(ws, s + ACCEL * dt) : Math.max(ws, s - BRAKE * dt);
        v.set(Math.cos(nh) * ns, Math.sin(nh) * ns);
        return;
      }
    }
    const dx = wx - v.x, dz = wz - v.y, dl = Math.hypot(dx, dz);
    const step = (ws > s && v.x * wx + v.y * wz >= 0 ? ACCEL : BRAKE) * dt;
    if (dl <= step) v.set(wx, wz);
    else v.set(v.x + (dx / dl) * step, v.y + (dz / dl) * step);
  }

  private finish(dt: number): void {
    const moved = dt > 0 ? Math.hypot(this.pos.x - this.mesh.position.x, this.pos.z - this.mesh.position.z) / dt : 0;
    const speed = this.carried === 'boat' ? 0 : Math.min(moved, RUN * 1.5); // clamp: respawn teleports; in the gondola he stands
    this.model.animate(dt, speed, this.grounded, this.carried ? 0 : this.want);
    this.mesh.position.copy(this.pos);
    // The body swings round to `facing` (smooth damp: stable at any dt).
    const w = 2 / SWING, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = wrap(this.yaw - this.facing), temp = (this.yawV + w * change) * dt;
    this.yawV = (this.yawV - w * temp) * e;
    this.yaw = this.facing + (change + temp) * e;
    const push = dt > 0 ? (speed - this.last) / dt : 0; // m/s² gained along his way
    this.last = speed;
    const lean = this.grounded && !this.carried && !this.frozen, k = Math.min(1, dt * LEAN_EASE);
    const bank = lean ? THREE.MathUtils.clamp(this.yawV * speed * BANK, -BANK_MAX, BANK_MAX) : 0;
    const pitch = lean ? THREE.MathUtils.clamp(-push * PITCH, -PITCH_MAX, PITCH_MAX * 0.7) : 0;
    this.bank += (bank - this.bank) * k;
    this.pitch += (pitch - this.pitch) * k;
    this.mesh.rotation.set(this.pitch, this.yaw, this.bank);
  }
}
