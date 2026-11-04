import * as THREE from 'three';
import { PHONE } from '../core/device.ts';
import type { GearState } from '../loot/gear.ts';
import { HEROES, type Hero } from '../player/heroes.ts';
import { UndeadModel } from '../player/undead.ts';
import { SelectBackdrop } from './selectBackdrop.ts';

// A painted sanctuary behind the same live, draggable hero. Scenery owns no hero resources.
const TURN = 0.01;
const DIST = 4.3;
const FOV = 35;

/** Soft contact shadow, fading to clear. */
function dot(size = 64, falloff = 0.4): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!, h = size / 2, r = g.createRadialGradient(h, h, 0, h, h, h);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(falloff, 'rgba(255,255,255,.45)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

/** Every geometry, material, texture and skeleton under `root`, freed on the GPU. */
function free(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    for (const x of [m.material ?? []].flat()) {
      for (const v of Object.values(x)) if (v instanceof THREE.Texture) v.dispose();
      x.dispose();
    }
    if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose();
    if (o instanceof THREE.InstancedMesh) o.dispose();
  });
}

export class SelectStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  private readonly holder = new THREE.Group(); // the hero's turn
  private readonly fire = new THREE.PointLight(0xff8a3c, 26, 0, 2);
  private readonly backdrop: SelectBackdrop;
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private model?: UndeadModel;
  private yaw = -0.35; // a three-quarter view, toward the fire
  /** Where his chest faces in the holder (eased: each body's idle turns him its own way), as the sheet's figure (ui/figure.ts). */
  private facing?: number;
  private far = 1; // the lens backed off for a tall hero, so his hat stays under the title
  private t = 0;
  private last = performance.now();
  private raf = 0;
  private gone = false;

  constructor(host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: !PHONE, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, PHONE ? 1.25 : 2)); // one body: no need for the phone's DPR 3
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const canvas = this.renderer.domElement;
    canvas.className = 'stage';
    host.prepend(canvas);
    this.backdrop = new SelectBackdrop(host);
    const s = this.scene;

    s.add(this.holder);

    // Light: a cold moon behind him (his rim), a faint blue fill from the lens, the brazier's warm flicker on his right.
    const moonLight = new THREE.DirectionalLight(0xa9bcff, 2.2);
    moonLight.position.set(-5, 9, -12);
    const fill = new THREE.DirectionalLight(0x8396c8, 0.9);
    fill.position.set(-3, 3, 6);
    this.fire.position.set(3.5, 1.5, -3.6);
    s.add(new THREE.HemisphereLight(0x50618a, 0x1a140f, 0.9), moonLight, fill, this.fire);

    // Contact shadow grounds the live model on the painted paving without hiding the artwork.
    const pool = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24).rotateX(-Math.PI / 2).translate(0, 0.01, 0),
      new THREE.MeshBasicMaterial({ color: 0, map: dot(64, 0.5), transparent: true, opacity: 0.75, depthWrite: false }));
    s.add(pool);

    let px = -1;
    canvas.addEventListener('pointerdown', (e) => { px = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (px < 0) return; this.yaw += (e.clientX - px) * TURN; px = e.clientX; });
    const up = () => { px = -1; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.visibility);
    this.reduced.addEventListener('change', this.motion);
    this.resize();
    this.visibility();
  }

  /** Stand `hero` in the middle, dressed in `worn`; whoever stood there goes. */
  show(hero: Hero, worn: GearState): void {
    if (this.model) { this.model.dispose(); this.holder.remove(this.model.root); free(this.model.root); }
    this.model = new UndeadModel(hero);
    this.facing = undefined;
    this.model.wear(worn);
    this.holder.add(this.model.root);
    this.far = Math.max(1, HEROES[hero].height / 2);
    this.resize();
  }

  private readonly resize = () => {
    const w = innerWidth, h = innerHeight, c = this.cam;
    this.renderer.setSize(w, h);
    c.aspect = w / h;
    c.fov = c.aspect < 1 ? FOV * 1.25 : FOV; // upright: a little more of him and the night
    c.updateProjectionMatrix();
    // The roster covers the left: the hero stands at about 3/5 of the width, his feet near the bottom.
    const d = DIST * this.far, half = d * Math.tan(THREE.MathUtils.degToRad(c.fov / 2)) * c.aspect;
    c.position.set(-0.2 * half, 1.3 * this.far, d);
    c.lookAt(-0.2 * half, 1.02 * this.far, 0);
  };

  private readonly motion = () => { this.backdrop.pause(document.hidden || this.reduced.matches, this.reduced.matches); };

  private readonly visibility = () => {
    cancelAnimationFrame(this.raf);
    this.motion();
    if (document.hidden || this.gone) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  };

  private readonly frame = (now: number) => {
    if (this.gone || document.hidden) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000), t = (this.t += dt);
    this.last = now;
    this.model?.animate(this.reduced.matches ? 0 : dt, 0, true);
    const root = this.model?.root, l = root?.getObjectByName('LeftArm'), r = root?.getObjectByName('RightArm');
    if (l && r) { // his chest's way, from the line of his shoulders (his left is -X at rest), turned to the lens
      const a = this.holder.worldToLocal(l.getWorldPosition(new THREE.Vector3())).sub(this.holder.worldToLocal(r.getWorldPosition(new THREE.Vector3()))), f = Math.atan2(a.z, -a.x);
      this.facing = this.facing === undefined ? f : this.facing + Math.atan2(Math.sin(f - this.facing), Math.cos(f - this.facing)) * 0.1;
    }
    this.holder.rotation.y = this.yaw - (this.facing ?? 0) - Math.PI;
    this.fire.intensity = this.reduced.matches ? 23 : 26 * (0.82 + 0.1 * Math.sin(t * 9.1) + 0.06 * Math.sin(t * 23.7) + 0.04 * Math.sin(t * 4.3));
    this.renderer.render(this.scene, this.cam);
  };

  /** Everything off the GPU, the context dropped, the canvas gone. */
  dispose(): void {
    if (this.gone) return;
    this.gone = true;
    this.backdrop.dispose();
    this.model?.dispose();
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.visibility);
    this.reduced.removeEventListener('change', this.motion);
    free(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
