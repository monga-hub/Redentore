import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadModel } from '../core/models.ts';
import { PHONE } from '../core/device.ts';
import { material, texture } from '../level/materials.ts';
import { rng } from '../level/props.ts';
import type { GearState } from '../loot/gear.ts';
import type { Hero } from '../player/heroes.ts';
import { UndeadModel } from '../player/undead.ts';

// The select screen's stage (ui/select.ts): the chosen hero himself, the game's body in his save's clothes, idling on a
// cemetery island in the lagoon by night (San Michele's brick wall and cypresses, gravestones and a fallen column from
// gotico.glb, a brazier burning on the right, the moon over the water, the city's outline in the fog across it). A drag
// turns him round. Its own small renderer and context, drawn before the game's exists; `dispose` frees every geometry,
// texture and skeleton on it and drops the context, so the game starts with the GPU to itself.

const TURN = 0.01; // rad a dragged px
const DIST = 4.3; // m from the hero to the lens
const FOV = 35;
const FIRE = new THREE.Vector3(3.5, 0.8, -3.6); // the flame's base over the brazier's bowl
const SPARKS = 14;

/** A soft round spot, white, fading to clear: flames, sparks, mist, glows. */
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

/** The night sky behind everything: deep blue overhead, a paler haze toward the lagoon's horizon. */
function sky(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!, l = g.createLinearGradient(0, 0, 0, 256);
  l.addColorStop(0, '#05080f');
  l.addColorStop(0.55, '#162233');
  l.addColorStop(0.8, '#2a3a4f');
  l.addColorStop(1, '#141c27');
  g.fillStyle = l;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The full moon, pale and mottled. */
function moon(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!, r = g.createRadialGradient(56, 54, 4, 64, 64, 44);
  r.addColorStop(0, '#f4f2e6');
  r.addColorStop(1, '#b9bfc4');
  g.fillStyle = r;
  g.beginPath();
  g.arc(64, 64, 44, 0, Math.PI * 2);
  g.fill();
  const rnd = rng(7);
  g.fillStyle = 'rgba(110,120,130,.28)'; // the maria
  for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(40 + rnd() * 48, 40 + rnd() * 48, 4 + rnd() * 11, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The moon's road on the water: broken pale streaks, thinning with distance. */
function glitter(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!, rnd = rng(3);
  for (let i = 0; i < 160; i++) {
    const y = rnd() * 256, w = (6 + rnd() * 26) * (0.4 + y / 256), x = 32 + (rnd() - 0.5) * (12 + 36 * (y / 256)) - w / 2;
    g.fillStyle = `rgba(200,215,255,${0.15 + rnd() * 0.5})`;
    g.fillRect(x, y, w, 1 + rnd() * 2);
  }
  return new THREE.CanvasTexture(c);
}

/** A bare tree: a trunk forking `depth` times into thinner, shorter, crooked limbs, one geometry. */
function bareTree(seed: number, height: number, depth: number): THREE.BufferGeometry {
  const rnd = rng(seed), parts: THREE.BufferGeometry[] = [], up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
  const limb = (from: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, d: number) => {
    const g = new THREE.CylinderGeometry(r * 0.62, r, len, 5, 1, true).translate(0, len / 2, 0);
    g.applyQuaternion(q.setFromUnitVectors(up, dir)).translate(from.x, from.y, from.z);
    parts.push(g);
    if (!d) return;
    const end = from.clone().addScaledVector(dir, len);
    for (let i = 0, n = 2 + Math.floor(rnd() * 2); i < n; i++) {
      const next = dir.clone().add(new THREE.Vector3(rnd() - 0.5, rnd() * 0.5 - 0.1, rnd() - 0.5).multiplyScalar(1.4)).normalize();
      limb(end.clone().addScaledVector(dir, -len * rnd() * 0.25), next, len * (0.62 + rnd() * 0.18), r * 0.6, d - 1);
    }
  };
  limb(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0.12, 1, 0.05).normalize(), height * 0.42, height * 0.045, depth);
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  for (const p of parts) p.dispose();
  return g;
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
  private readonly flames: THREE.Sprite[] = [];
  private readonly mist: THREE.Sprite[] = [];
  private readonly sparks: THREE.Points;
  private readonly spark = Array.from({ length: SPARKS }, () => ({ age: 9, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
  private model?: UndeadModel;
  private yaw = -0.35; // a three-quarter view, toward the fire
  /** Where his chest faces in the holder (eased: each body's idle turns him its own way), as the sheet's figure (ui/figure.ts). */
  private facing?: number;
  private t = 0;
  private last = performance.now();
  private raf = 0;
  private gone = false;

  constructor(host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: !PHONE });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, PHONE ? 1.25 : 2)); // one body and a few props: no need for the phone's DPR 3
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const canvas = this.renderer.domElement;
    canvas.className = 'stage';
    host.prepend(canvas);
    const s = this.scene;
    s.background = sky();
    s.fog = new THREE.Fog(0x1b2636, 7, 72);
    s.add(this.holder);

    // Light: a cold moon behind him (his rim), a faint blue fill from the lens, the brazier's warm flicker on his right.
    const moonLight = new THREE.DirectionalLight(0xa9bcff, 2.2);
    moonLight.position.set(-5, 9, -12);
    const fill = new THREE.DirectionalLight(0x8396c8, 0.9);
    fill.position.set(-3, 3, 6);
    this.fire.position.copy(FIRE).setY(FIRE.y + 0.7);
    s.add(new THREE.HemisphereLight(0x50618a, 0x1a140f, 0.9), moonLight, fill, this.fire);

    // The island's ground, the lagoon past its wall, the moon's road on the water.
    const earth = new THREE.PlaneGeometry(90, 22).rotateX(-Math.PI / 2).translate(0, 0, -0.5), uv = earth.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 15, uv.getY(i) * 3.7); // the site slab's 6 m tile
    const ground = new THREE.Mesh(earth, new THREE.MeshStandardMaterial({ map: texture('ground'), color: 0x4a4740, roughness: 1 }));
    const water = new THREE.Mesh(new THREE.PlaneGeometry(260, 120).rotateX(-Math.PI / 2).translate(0, -0.35, -71), material('water'));
    const road = new THREE.Mesh(new THREE.PlaneGeometry(9, 60).rotateX(-Math.PI / 2).translate(-5, -0.3, -45),
      new THREE.MeshBasicMaterial({ map: glitter(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }));
    s.add(ground, water, road);
    // His shadow: a dark pool under his feet.
    const pool = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24).rotateX(-Math.PI / 2).translate(0, 0.01, 0),
      new THREE.MeshBasicMaterial({ color: 0, map: dot(64, 0.5), transparent: true, opacity: 0.75, depthWrite: false }));
    s.add(pool);

    // The moon, its halo, and the city across the water: a campanile, a dome on its drum, roofs, all fog.
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot(128, 0.15), color: 0x8fa6d8, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }));
    halo.position.set(-8, 17, -80);
    halo.scale.setScalar(34);
    const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: moon(), fog: false, depthWrite: false }));
    disc.position.set(-8, 17, -79);
    disc.scale.setScalar(8);
    s.add(halo, disc);
    const far = new THREE.MeshBasicMaterial({ color: 0x0d1420 });
    const city = [
      new THREE.BoxGeometry(70, 4, 4).translate(6, 1.6, -58),
      new THREE.BoxGeometry(1.6, 15, 1.6).translate(-14, 7.3, -56), new THREE.ConeGeometry(1.3, 3, 4).rotateY(Math.PI / 4).translate(-14, 16.3, -56),
      new THREE.CylinderGeometry(4.2, 4.2, 4, 16).translate(12, 5.5, -60), new THREE.SphereGeometry(4.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(12, 7.4, -60),
      new THREE.CylinderGeometry(0.5, 0.7, 2.4, 8).translate(12, 12.8, -60),
      new THREE.BoxGeometry(9, 7, 4).translate(20, 3.4, -59), new THREE.BoxGeometry(7, 6, 4).translate(-4, 3, -57), new THREE.BoxGeometry(6, 8.5, 4).translate(28, 4.2, -59),
    ];
    const skyline = new THREE.Mesh(mergeGeometries(city.map((g) => g.toNonIndexed())), far);
    for (const g of city) g.dispose();
    s.add(skyline);

    // San Michele's brick wall along the shore, broken; cypresses over it; two bare trees, one leaning in over him.
    const rnd = rng(11), bricks: THREE.BufferGeometry[] = [];
    for (let x = -16; x < 16; x += 2.4) {
      if (rnd() < 0.18) continue; // a breach
      const h = x > -4 && x < 4 ? 0.9 + rnd() * 0.8 : 1.4 + rnd() * 1.6;
      bricks.push(new THREE.BoxGeometry(2.42, h, 0.45).translate(x, h / 2, -10.5 - rnd() * 0.3).toNonIndexed());
    }
    s.add(new THREE.Mesh(mergeGeometries(bricks), material('brick')));
    for (const g of bricks) g.dispose();
    const green = new THREE.MeshStandardMaterial({ color: 0x0e1912, roughness: 1 });
    const cypress = new THREE.ConeGeometry(0.75, 6.5, 7).translate(0, 3.6, 0);
    for (const [x, z, k] of [[-9, -12.5, 1], [-7.4, -13, 1.15], [6.5, -12.4, 0.95], [8.3, -13.2, 1.2], [10.6, -12.6, 0.9], [-12.5, -12.8, 1.1], [1.8, -13.4, 0.8]] as const) {
      const c = new THREE.Mesh(cypress, green);
      c.position.set(x, 0, z);
      c.scale.set(k * 0.9, k, k * 0.9);
      s.add(c);
    }
    const bark = new THREE.MeshStandardMaterial({ color: 0x17120f, roughness: 1 });
    const near = new THREE.Mesh(bareTree(5, 6.2, 4), bark);
    near.position.set(-4.4, 0, -3.6);
    near.rotation.set(0, 0.6, -0.22); // leaning in over him
    const back = new THREE.Mesh(bareTree(21, 5, 3), bark);
    back.position.set(5.5, 0, -8);
    back.rotation.y = 2;
    s.add(near, back);

    // The fire: flames stacked over the brazier's bowl, sparks rising off them.
    const flame = dot(64, 0.3);
    for (const [color, k] of [[0xff5a12, 1], [0xff9a30, 0.7], [0xfff0b0, 0.4]] as const) {
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: flame, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      f.userData.k = k;
      this.flames.push(f);
      s.add(f);
    }
    const pts = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
    this.sparks = new THREE.Points(pts, new THREE.PointsMaterial({ color: 0xffa040, size: 0.06, map: flame, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sparks.frustumCulled = false;
    s.add(this.sparks);
    // Fog drifting low over the graves.
    const wisp = dot(64, 0.2);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: wisp, color: 0x8796ad, transparent: true, opacity: 0.14 + rnd() * 0.1, depthWrite: false }));
      m.position.set(-10 + rnd() * 20, 0.35 + rnd() * 0.5, -1.5 - rnd() * 9);
      m.scale.set(7 + rnd() * 5, 1.6 + rnd(), 1);
      m.userData.v = (rnd() - 0.5) * 0.25;
      this.mist.push(m);
      s.add(m);
    }

    // The graveyard: gotico.glb's pieces (one node each, 1 m tall, feet on y = 0), as the Diablo view lays them (level/gothic.ts).
    type Piece = [name: string, x: number, z: number, yaw: number, h: number, tilt?: number];
    const PIECES: Piece[] = [
      ['brazier', FIRE.x, FIRE.z, 0.4, 0.85], ['skulls', 4.3, -4.1, 0.8, 0.5], ['bones', 1.7, -2.6, 2.6, 0.18],
      ['gravestone', -2.3, -3.6, 0.25, 1.25, 0.08], ['gravestone', 1.4, -4.6, -0.2, 1.15, -0.12], ['gravestone', 3.9, -3.2, -0.45, 1.3],
      ['gravestone', -4.8, -6.4, 0.1, 1.35, -0.1], ['gravestone', -0.2, -6.8, 0.3, 1.2, 0.15], ['gravestone', 5.6, -6.2, -0.3, 1.25, 0.1],
      ['gravestone', -7.4, -3.3, 0.5, 1.3], ['gravestone', 7.2, -2.6, -0.6, 1.2, -0.08],
      ['column', -3.4, -4.6, 1.2, 0.6], ['coffin', 5.6, -5.4, 2.4, 0.55], ['cage', -3.9, -3.2, 0.7, 1.3],
    ];
    loadModel('gotico.glb').then((gltf) => {
      if (this.gone) return; // never drawn: nothing of it reached the GPU
      gltf.scene.updateMatrixWorld(true);
      const m = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
      gltf.scene.traverse((o) => {
        const src = o as THREE.Mesh;
        const mine = src.isMesh ? PIECES.filter((t) => t[0] === src.name) : [];
        if (!mine.length) return;
        const mat = src.material as THREE.MeshStandardMaterial;
        Object.assign(mat, { metalness: 0, roughness: 1 });
        const im = new THREE.InstancedMesh(src.geometry, mat, mine.length);
        mine.forEach(([name, x, z, yaw, h, tilt = 0], i) => {
          const y = name === 'cage' ? 3.3 : 0; // the gibbet hangs from the leaning tree
          m.compose(p.set(x, y, z), q.setFromEuler(e.set(tilt, yaw, tilt * 0.5)), sc.setScalar(h));
          im.setMatrixAt(i, m.multiply(src.matrixWorld)); // meshopt's dequantisation lives on the node
        });
        im.computeBoundingSphere();
        s.add(im);
      });
    }, (e) => console.error('select stage props failed to load', e));

    let px = -1;
    canvas.addEventListener('pointerdown', (e) => { px = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (px < 0) return; this.yaw += (e.clientX - px) * TURN; px = e.clientX; });
    const up = () => { px = -1; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    addEventListener('resize', this.resize);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Stand `hero` in the middle, dressed in `worn`; whoever stood there goes. */
  show(hero: Hero, worn: GearState): void {
    if (this.model) { this.holder.remove(this.model.root); free(this.model.root); }
    this.model = new UndeadModel(hero);
    this.facing = undefined;
    this.model.wear(worn);
    this.holder.add(this.model.root);
  }

  private readonly resize = () => {
    const w = innerWidth, h = innerHeight, c = this.cam;
    this.renderer.setSize(w, h);
    c.aspect = w / h;
    c.fov = c.aspect < 1 ? FOV * 1.25 : FOV; // upright: a little more of him and the night
    c.updateProjectionMatrix();
    // The roster covers the left: the hero stands at about 3/5 of the width, his feet near the bottom.
    const half = DIST * Math.tan(THREE.MathUtils.degToRad(c.fov / 2)) * c.aspect;
    c.position.set(-0.2 * half, 1.3, DIST);
    c.lookAt(-0.2 * half, 1.02, 0);
  };

  private readonly frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000), t = (this.t += dt);
    this.last = now;
    this.model?.animate(dt, 0, true);
    const root = this.model?.root, l = root?.getObjectByName('LeftArm'), r = root?.getObjectByName('RightArm');
    if (l && r) { // his chest's way, from the line of his shoulders (his left is -X at rest), turned to the lens
      const a = this.holder.worldToLocal(l.getWorldPosition(new THREE.Vector3())).sub(this.holder.worldToLocal(r.getWorldPosition(new THREE.Vector3()))), f = Math.atan2(a.z, -a.x);
      this.facing = this.facing === undefined ? f : this.facing + Math.atan2(Math.sin(f - this.facing), Math.cos(f - this.facing)) * 0.1;
    }
    this.holder.rotation.y = this.yaw - (this.facing ?? 0) - Math.PI;
    const k = 0.82 + 0.1 * Math.sin(t * 9.1) + 0.06 * Math.sin(t * 23.7) + 0.04 * Math.sin(t * 4.3); // the fire's flicker
    this.fire.intensity = 26 * k;
    this.flames.forEach((f, i) => {
      const s = f.userData.k as number, w = 0.8 * s * (0.9 + 0.2 * Math.sin(t * (11 + i * 3) + i));
      f.scale.set(w, w * 1.5 * k, 1);
      f.position.set(FIRE.x + 0.03 * Math.sin(t * 7 + i), FIRE.y + w * 0.5, FIRE.z);
    });
    const pos = this.sparks.geometry.attributes.position as THREE.BufferAttribute;
    this.spark.forEach((p, i) => {
      if ((p.age += dt) > p.life) Object.assign(p, { age: 0, life: 0.8 + Math.random() * 0.9, x: FIRE.x, y: FIRE.y + 0.3, z: FIRE.z, vx: (Math.random() - 0.5) * 0.4, vy: 0.9 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.4 });
      p.x += (p.vx + 0.2 * Math.sin(t * 3 + i)) * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      pos.setXYZ(i, p.x, p.y, p.z);
    });
    pos.needsUpdate = true;
    for (const m of this.mist) m.position.x = ((m.position.x + (m.userData.v as number) * dt + 14) % 28 + 28) % 28 - 14;
    this.renderer.render(this.scene, this.cam);
  };

  /** Everything off the GPU, the context dropped, the canvas gone. */
  dispose(): void {
    this.gone = true;
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.resize);
    free(this.scene);
    (this.scene.background as THREE.Texture).dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
