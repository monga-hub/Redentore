import * as THREE from 'three';
import type { Input } from '../core/input.ts';
import type { PlayerController } from './controller.ts';
import type { Mob, Targeting } from '../ui/target.ts';

// Diablo view controls on top of the usual ones (WASD and the stick still move, now relative to
// the screen): with the mouse, click the ground to walk there, hold to keep walking towards the
// cursor, click an enemy to walk up to it and keep swinging the main attack until it falls. Any key
// or stick movement cancels the order. Casts turn the hero to the target, else to the nearest foe
// close by, else (mouse) towards the cursor: `aim`, hooked into the ability system by main.ts.
// No pathfinding: the hero walks straight and slides along walls; a walk that stops getting closer gives up.

const REACH = 2; // m: where a click-attack stops to swing (Caduta d'ossa reaches 2.6)
const AIM = 8; // m: auto-aim reach when nothing is targeted
const KEEP = 40; // m: an attack order is dropped past this (the foe evaded home)
const STUCK = 0.6; // s without getting closer ends a walk
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

type Order = { kind: 'move'; x: number; z: number } | { kind: 'attack'; mob: Mob };

export class DiabloControls {
  enabled = false;
  /** World direction to run along this frame (player.update's `steer`). */
  readonly steer = { x: 0, z: 0 };
  /** Called to swing the main attack when a click-attack is in reach; true if it went off. */
  swing?: () => boolean;
  private order: Order | null = null;
  private held = false; // left button down on the ground: keep walking towards the cursor
  private mouse = { x: 0, y: 0, over: false };
  private best = Infinity;
  private stuckT = 0;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ground = new THREE.Vector3();
  private marker: THREE.Mesh;
  private markT = 1;

  private readonly camera: THREE.Camera;
  private readonly player: PlayerController;
  private readonly targeting: Targeting;
  private readonly foes: () => Iterable<Mob>;

  constructor(el: HTMLElement, camera: THREE.Camera, scene: THREE.Scene, player: PlayerController, targeting: Targeting, foes: () => Iterable<Mob>) {
    this.camera = camera;
    this.player = player;
    this.targeting = targeting;
    this.foes = foes;
    // Where a click lands: a gold ring that shrinks away, as in the Diablo games.
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.4, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffc85a, transparent: true, depthWrite: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending }),
    );
    this.marker.visible = false;
    this.marker.renderOrder = 2;
    scene.add(this.marker);

    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled || e.pointerType !== 'mouse' || e.button !== 0) return;
      this.track(e);
      const t = targeting.at(e.clientX, e.clientY);
      if (t) {
        targeting.target = t;
        this.order = { kind: 'attack', mob: t.mob };
        return;
      }
      this.held = true;
      if (this.cursorGround()) this.walk(this.ground.x, this.ground.z, true);
    });
    addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') this.track(e); });
    addEventListener('pointerup', (e) => { if (e.button === 0) this.held = false; });
    el.addEventListener('pointerleave', () => { this.mouse.over = false; });
    addEventListener('blur', () => { this.held = false; });
  }

  /** Drop any order (respawn, menu). */
  stop(): void {
    this.order = null;
    this.held = false;
  }

  /** Per frame, before the player moves. */
  update(dt: number, input: Input): void {
    this.steer.x = this.steer.z = 0;
    this.fadeMarker(dt);
    if (!this.enabled) return;
    if (input.down(...MOVE_KEYS) || input.stickX || input.stickY) this.stop(); // the keys take over
    if (this.held && this.mouse.over && this.cursorGround()) this.walk(this.ground.x, this.ground.z, false);
    const o = this.order, p = this.player.pos;
    if (!o) return;
    if (o.kind === 'move') {
      const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.3 || this.stalled(d, dt)) { this.order = null; return; }
      this.steer.x = dx / d;
      this.steer.z = dz / d;
      return;
    }
    const m = o.mob, dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
    if (m.state === 'dead' || d > KEEP) { this.order = null; return; }
    if (d > REACH) {
      this.steer.x = dx / d;
      this.steer.z = dz / d;
    } else {
      this.face(m.x, m.z);
      this.swing?.();
    }
  }

  /** Turn the hero for a cast: the target, else the nearest foe within AIM m, else the cursor. */
  aim(): void {
    if (!this.enabled) return;
    const p = this.player.pos, t = this.targeting.target?.mob;
    let m = t && t.state !== 'dead' && Math.hypot(t.x - p.x, t.z - p.z) < KEEP ? t : undefined, best = AIM;
    if (!m) {
      for (const f of this.foes()) {
        const d = Math.hypot(f.x - p.x, f.z - p.z);
        if (f.state !== 'dead' && d < best) { best = d; m = f; }
      }
    }
    if (m) this.face(m.x, m.z);
    else if (this.mouse.over && this.cursorGround()) this.face(this.ground.x, this.ground.z);
  }

  private face(x: number, z: number): void {
    const p = this.player.pos, dx = x - p.x, dz = z - p.z;
    if (dx * dx + dz * dz > 1e-4) this.player.facing = Math.atan2(-dx, -dz);
  }

  private walk(x: number, z: number, mark: boolean): void {
    if (this.order?.kind !== 'move') { this.best = Infinity; this.stuckT = 0; }
    this.order = { kind: 'move', x, z };
    if (mark) {
      this.marker.position.set(x, this.player.pos.y + 0.05, z);
      this.markT = 0;
    }
  }

  /** True once the walk has not got 5 cm closer for STUCK s (a wall in the way). */
  private stalled(d: number, dt: number): boolean {
    if (d < this.best - 0.05) { this.best = d; this.stuckT = 0; return false; }
    return (this.stuckT += dt) > STUCK;
  }

  private track(e: PointerEvent): void {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
    this.mouse.over = true;
  }

  /** The cursor's point on the horizontal plane through the hero's feet, into `ground`. */
  private cursorGround(): boolean {
    this.ndc.set((this.mouse.x / innerWidth) * 2 - 1, -(this.mouse.y / innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    this.plane.constant = -this.player.pos.y;
    return this.ray.ray.intersectPlane(this.plane, this.ground) !== null;
  }

  private fadeMarker(dt: number): void {
    const m = this.marker;
    m.visible = this.markT < 1;
    if (!m.visible) return;
    this.markT = Math.min(1, this.markT + dt / 0.45);
    m.scale.setScalar(1.3 - this.markT * 0.8);
    (m.material as THREE.MeshBasicMaterial).color.setHex(0xffc85a).multiplyScalar(2.2 * (1 - this.markT));
  }
}
