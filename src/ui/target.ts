import * as THREE from 'three';
import { Bar } from './hud.ts';

/** A targetable mob: brain state from enemies/brain.ts or enemies/caster.ts. */
export interface Mob { x: number; y: number; z: number; hp: number; state: string }

/** One kind of enemy: display name, full health, model height and the live brains. */
export interface Kind { name: string; max: number; height: number; all: readonly Mob[]; ready: () => boolean }

const TAP_PX = 8; // pointer travel below this is a tap, not a camera drag
const TAP_MS = 350;
const PICK_PX = 26; // min screen radius around a mob's body that still selects it
const TAB_RANGE = 40; // m: Tab only picks enemies this close

/**
 * Closest mob under screen point (x, y): each living mob is a vertical feet-to-head segment
 * projected to the screen; the nearest segment within reach wins, the closer mob on a tie.
 * `seen` rules out mobs hidden behind walls.
 */
export function pick(kinds: readonly Kind[], camera: THREE.Camera, x: number, y: number, w: number, h: number, seen: (m: Mob, k: Kind) => boolean = () => true): { kind: Kind; mob: Mob } | undefined {
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  let best: { kind: Kind; mob: Mob } | undefined, bestD = Infinity;
  for (const kind of kinds) {
    if (!kind.ready()) continue;
    for (const mob of kind.all) {
      if (mob.state === 'dead') continue;
      a.set(mob.x, mob.y, mob.z).project(camera);
      b.set(mob.x, mob.y + kind.height, mob.z).project(camera);
      if (a.z > 1 || b.z > 1) continue; // behind the camera
      const ax = (a.x + 1) / 2 * w, ay = (1 - a.y) / 2 * h, bx = (b.x + 1) / 2 * w, by = (1 - b.y) / 2 * h;
      const len = Math.hypot(bx - ax, by - ay);
      const t = len > 0 ? THREE.MathUtils.clamp(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (len * len), 0, 1) : 0;
      const d = Math.hypot(x - (ax + (bx - ax) * t), y - (ay + (by - ay) * t));
      if (d > Math.max(PICK_PX, len * 0.25)) continue; // the body is roughly a quarter as wide as tall
      const score = d + a.z; // a.z in 0..1: breaks ties towards the camera
      if (score < bestD && seen(mob, kind)) { bestD = score; best = { kind, mob }; }
    }
  }
  return best;
}

/**
 * Target selection, WoW style: click or tap an enemy to target it, click empty ground to clear,
 * Tab for the nearest one. A red ring marks the target's feet and the frame next to the player's
 * (#target, styled in index.html) shows its name and health. Dying clears the target.
 */
export class Targeting {
  target?: { kind: Kind; mob: Mob };
  private ring: THREE.Mesh;
  private frame = document.getElementById('target')!;
  private name = this.frame.querySelector<HTMLElement>('.name')!;
  private hp = new Bar(this.frame.querySelector<HTMLElement>('.hp')!);
  private kinds: readonly Kind[];
  private camera: THREE.Camera;
  private player = new THREE.Vector3();
  private t = 0;
  private ray = new THREE.Raycaster();
  private blockers: THREE.Object3D[];

  constructor(el: HTMLElement, camera: THREE.Camera, scene: THREE.Scene, blockers: THREE.Object3D[], kinds: readonly Kind[]) {
    this.kinds = kinds;
    this.camera = camera;
    this.blockers = blockers;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.68, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.85, depthWrite: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending }),
    );
    this.ring.renderOrder = 2;
    this.ring.visible = false;
    scene.add(this.ring);

    // A tap is a press and release that barely moved: anything longer is the camera drag.
    // Under pointer lock clientX freezes, so mouse travel is summed from movementX/Y.
    const downs = new Map<number, { x: number; y: number; t: number; moved: number }>();
    el.addEventListener('pointerdown', (e) => downs.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }));
    addEventListener('pointermove', (e) => {
      const d = downs.get(e.pointerId);
      if (d) d.moved = Math.max(d.moved + Math.abs(e.movementX) + Math.abs(e.movementY), Math.hypot(e.clientX - d.x, e.clientY - d.y));
    });
    addEventListener('pointerup', (e) => {
      const d = downs.get(e.pointerId);
      downs.delete(e.pointerId);
      if (d && d.moved < TAP_PX && performance.now() - d.t < TAP_MS) this.target = pick(this.kinds, this.camera, d.x, d.y, innerWidth, innerHeight, (m, k) => this.seen(m, k));
    });
    addEventListener('pointercancel', (e) => downs.delete(e.pointerId));
    addEventListener('keydown', (e) => {
      if (e.code !== 'Tab') return;
      e.preventDefault(); // keep focus off the browser chrome
      if (!e.repeat) this.nearest();
    });
  }

  /** Tab: the nearest living enemy in range and in sight, skipping the current target so repeated presses alternate. */
  nearest(): void {
    let best: { kind: Kind; mob: Mob } | undefined, bestD = TAB_RANGE;
    for (const kind of this.kinds) {
      if (!kind.ready()) continue;
      for (const mob of kind.all) {
        const d = Math.hypot(mob.x - this.player.x, mob.z - this.player.z);
        if (mob.state === 'dead' || mob === this.target?.mob || d >= bestD || !this.seen(mob, kind)) continue;
        bestD = d;
        best = { kind, mob };
      }
    }
    if (best) this.target = best;
  }

  /** Line of sight from the camera to the mob's chest, through the same meshes the camera avoids. */
  private seen(m: Mob, k: Kind): boolean {
    const to = new THREE.Vector3(m.x, m.y + k.height * 0.6, m.z).sub(this.camera.position);
    this.ray.set(this.camera.position, to.clone().normalize());
    this.ray.far = to.length();
    return this.ray.intersectObjects(this.blockers, false).length === 0;
  }

  /** Per frame, after the enemies moved. `player`: feet position, for Tab. */
  update(dt: number, player: THREE.Vector3): void {
    this.player.copy(player);
    if (this.target?.mob.state === 'dead') this.target = undefined;
    const tg = this.target;
    this.frame.hidden = !tg;
    this.ring.visible = !!tg;
    if (!tg) return;
    this.t += dt;
    this.ring.position.set(tg.mob.x, tg.mob.y + 0.04, tg.mob.z);
    this.ring.scale.setScalar(1 + Math.sin(this.t * 4) * 0.04);
    this.name.textContent = tg.kind.name;
    this.hp.set(tg.mob.hp, tg.kind.max);
  }
}
