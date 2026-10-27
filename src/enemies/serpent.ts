import * as THREE from 'three';
import { D, T, type Decal, type DecalStyle, type Style, type Vfx } from '../abilities/vfx.ts';
import { playSfx } from '../audio/engine.ts';
import type { Priest } from './caster.ts';
import { flash } from './friars.ts';

// Carpaccio's dragon (enemies/drago.ts), drawn: a Meshy head (models/drago.glb, made from the plan's concept) on a body Meshy
// can't rig, so built here every frame. One spine from the tail's tip to the head through the lagoon: the tail curled out of the
// water by the shore, two coils arching out of the sea behind, the neck rising from the water's edge to the head over the stage.
// A tube of scales is laid along it each frame (one draw, its vertices rewritten in place), a ridge of spines on its back, two
// tattered wings at the shoulders. It sinks and rises with the brain: hidden at rest, up out of the water when pulled, under
// for the Immersione and up again at its new spot, down into the lagoon dead. The head acts out the bite, the breath and the
// gob of venom; the tail rises for the Coda and comes down on the shore. Its water: foam where the body cuts the surface, spray
// and a wave at each rise and fall, the three spots marked by mooring poles and, while it is under, rings on the shore.

const WATER = -1.2; // the lagoon's surface (zones/fondamenta.ts)
const SHORE = -40; // San Giorgio's south edge: the sea is -Z
const N = 84, R = 10; // rings along the spine, sides round it
const GIRTH = 1.5; // m of the body's radius at its thickest
const SPINES = 34;
const HEAD = 2.4; // the head's scale over the model's 2-unit length: ~5 m of skull and jaws
const SINK = 15; // m it drops when under
const SEA = 0x9ad8c8, VENOM = 0x8cff6a;
const GLOW = 0.32; // self-light over the maps: the lagoon at night would swallow it

const spray: Style = { life: [0.9, 1.5], size: [0.5, 1.1], grow: 1.8, color: 0xe8f6ff, color2: 0x5d8ea0, hdr: 1.05, alpha: 0.75, tex: T.smoke, erode: true, grav: 7, drag: 0.5 };
const drop: Style = { life: [0.8, 1.3], size: [0.07, 0.14], color: 0xf0fbff, color2: 0x88b8cc, hdr: 1.5, tex: T.drop, stretch: 0.05, grav: 13, drag: 0.2 };
const bubble: Style = { life: [0.4, 0.8], size: [0.15, 0.35], grow: 1.5, color: 0xd8f4ff, hdr: 1.2, alpha: 0.7, tex: T.ring, grav: -1 };
const venom: Style = { life: [0.6, 1], size: [0.5, 1.1], grow: 2.2, color: 0xa8ff88, color2: 0x0c3a10, hdr: 1.5, alpha: 0.75, tex: T.smoke, erode: true, drag: 1.4 };
const venomSpark: Style = { life: [0.4, 0.7], size: [0.06, 0.12], color: 0xeaffd0, color2: VENOM, hdr: 3, tex: T.spark, stretch: 0.04, drag: 1.5, grav: 3 };
const dust: Style = { life: [1, 1.6], size: [0.8, 1.5], grow: 2, color: 0x3a3a30, alpha: 0.6, tex: T.smoke2, erode: true, dark: true, drag: 2, grav: -0.3 };
const wave: DecalStyle = { life: 1.6, size: 3, grow: 5, tile: D.shock, color: 0xd0ecff, hdr: 1.5, fadeOut: 0.7 };
const quake: DecalStyle = { life: 0.7, size: 2, grow: 7, tile: D.shock, color: SEA, hdr: 2.2, fadeOut: 0.6 };
const cracks: DecalStyle = { life: 4, size: 9, tile: D.cracks, color: 0x07090a, alpha: 0.85, fadeOut: 0.4, dark: true };
const foam: DecalStyle = { life: 0, size: 2, tile: D.splash, color: 0xc8e8f0, hdr: 1, alpha: 0.6 };
const spotRing: DecalStyle = { life: 0, size: 9, tile: D.ring, color: SEA, hdr: 1.6 };
const spotRunes: DecalStyle = { life: 0, size: 7, tile: D.swirl, color: SEA, hdr: 1.1 };

/** The scales: bronze-green, darker along the back, a pale ridged belly (the middle of the texture's width, u 0.5). */
function scales(): THREE.CanvasTexture {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const back = g.createLinearGradient(0, 0, S, 0);
  back.addColorStop(0, '#24341f'); back.addColorStop(0.3, '#4a6236'); back.addColorStop(0.42, '#8a8a52'); back.addColorStop(0.5, '#b8b07a');
  back.addColorStop(0.58, '#8a8a52'); back.addColorStop(0.7, '#4a6236'); back.addColorStop(1, '#24341f');
  g.fillStyle = back;
  g.fillRect(0, 0, S, S);
  const W = 16, H = 12;
  for (let row = -1; row < S / H + 1; row++) for (let col = -1; col < S / W + 1; col++) {
    const x = col * W + (row % 2 ? W / 2 : 0), y = row * H, belly = Math.abs(x / S - 0.5) < 0.09;
    if (belly) continue;
    g.beginPath();
    g.ellipse(x, y, W * 0.55, H * 0.9, 0, 0, Math.PI);
    g.strokeStyle = 'rgba(10,18,8,0.55)'; g.lineWidth = 1.6; g.stroke();
    g.fillStyle = `rgba(${150 + (row * 37 + col * 53) % 60},${150 + (row * 13) % 40},90,0.12)`; g.fill();
  }
  for (let y = 0; y < S; y += 9) { g.fillStyle = 'rgba(40,36,20,0.5)'; g.fillRect(S * 0.41, y, S * 0.18, 1.5); } // the belly's plates
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** One wing: an arm and four fingers from the shoulder (local +X out, +Y up, -Z back), a membrane torn along its trailing edge. */
function wingGeometry(): THREE.BufferGeometry {
  const P = { S: [0, 0, 0], E: [2.6, 1.8, -0.4], W: [4.4, 3, -0.8], F1: [8, 4.4, -1.2], F2: [7.6, 1.6, -2.2], F3: [6.2, -0.6, -2.8], F4: [3.8, -1.6, -2.6], B: [0.4, -1.8, -1],
    M12: [6.4, 2.2, -1.9], M23: [5.6, 0.6, -2.4], M34: [4.4, -0.4, -2.6], M4B: [2, -1.2, -1.9] } as const;
  const tri = [['S', 'E', 'W'], ['S', 'W', 'B'], ['W', 'F1', 'M12'], ['W', 'M12', 'F2'], ['W', 'F2', 'M23'], ['W', 'M23', 'F3'], ['W', 'F3', 'M34'], ['W', 'M34', 'F4'], ['W', 'F4', 'M4B'], ['W', 'M4B', 'B']] as const;
  const pos: number[] = [], col: number[] = [];
  for (const t of tri) for (const k of t) { pos.push(...P[k]); const bone = k === 'S' || k === 'E' || k === 'W' || k[0] === 'F'; col.push(...(bone ? [0.62, 0.6, 0.42] : [0.38, 0.2, 0.14])); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const ease = (k: number) => k * k * (3 - 2 * k);
const clamp01 = (k: number) => Math.min(1, Math.max(0, k));
const V = () => new THREE.Vector3();

/** Carpaccio's dragon in the world; Priests (enemies/priests.ts) drives it like a caster's body. */
export class Serpent {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private tube: THREE.Mesh;
  private pos: THREE.BufferAttribute;
  private nor: THREE.BufferAttribute;
  private spines: THREE.InstancedMesh;
  private wings: THREE.Group[] = [];
  private head = new THREE.Group();
  private mouth = new THREE.Vector3(); // between the jaws, in the head's frame
  private stump = new THREE.Vector3(); // the neck's way into the head, in its frame (unit)
  private mats: THREE.MeshStandardMaterial[] = [];
  private vfx: Vfx;
  private spots: [number, number][];
  private ctrl = Array.from({ length: 12 }, V);
  private curve: THREE.CatmullRomCurve3;
  private pts = Array.from({ length: N + 1 }, V);
  private tan = Array.from({ length: N + 1 }, V);
  private nrm = Array.from({ length: N + 1 }, V);
  private foams: Decal[] = [];
  private marks: [Decal, Decal][] = [];
  private time = 0;
  private sink = 1; // 0 up, 1 under
  private state?: string;
  private flashK = 0;
  private slam = 0; // s the tail lies on the shore after the Coda
  private recoil = 0; // the spit's jerk
  private dead = 0; // s since it fell
  private v = V(); private w = V(); private u = V(); private q = new THREE.Quaternion(); private m = new THREE.Matrix4();
  private fwd = V(); private rest = V(); private look = V(); private shoulder = V();

  constructor(head: THREE.Group, vfx: Vfx, spots: [number, number][]) {
    this.vfx = vfx;
    this.spots = spots;
    // The head: the model's snout +Z, its neck stump down and back; pivot moved onto the stump, scaled up.
    const model = head;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model), stump = V(), n = { k: 0 };
    model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const a = o.geometry.getAttribute('position'), p = V();
      for (let i = 0; i < a.count; i += 3) {
        p.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld);
        if (p.z < box.min.z + (box.max.z - box.min.z) * 0.22 && p.y < (box.min.y + box.max.y) / 2) { stump.add(p); n.k++; } // the back and bottom: where the neck was cut
      }
      const m = (o.material as THREE.MeshStandardMaterial).clone();
      m.emissiveMap = m.map; // lit from within, its own colours, enough to read against the night
      m.emissive.setScalar(GLOW);
      m.userData.glow = GLOW;
      o.material = m;
      this.mats.push(m);
    });
    stump.divideScalar(Math.max(1, n.k));
    const mid = box.getCenter(V());
    this.stump.set(0, stump.y - mid.y, stump.z - mid.z).normalize();
    model.position.copy(stump).multiplyScalar(-1);
    const pivot = new THREE.Group();
    pivot.add(model);
    pivot.scale.setScalar(HEAD);
    this.head.add(pivot);
    this.mouth.set(-stump.x, (box.min.y * 0.6 + box.max.y * 0.4) - stump.y, box.max.z * 0.75 - stump.z).multiplyScalar(HEAD);

    const map = scales();
    const skin = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: new THREE.Color().setScalar(GLOW), roughness: 0.5, metalness: 0.15 });
    skin.userData.glow = GLOW;
    this.mats.push(skin);
    const g = new THREE.BufferGeometry();
    const verts = (N + 1) * (R + 1);
    this.pos = new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.nor = new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const uv = new Float32Array(verts * 2), idx: number[] = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j <= R; j++) {
      uv[(i * (R + 1) + j) * 2] = j / R;
      uv[(i * (R + 1) + j) * 2 + 1] = i * 0.5;
      if (i < N && j < R) { const a = i * (R + 1) + j, b = a + R + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    }
    g.setAttribute('position', this.pos);
    g.setAttribute('normal', this.nor);
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.tube = new THREE.Mesh(g, skin);
    this.tube.frustumCulled = false; // rewritten every frame: no bounds to trust
    const horn = new THREE.MeshStandardMaterial({ color: 0x8a7a50, roughness: 0.6, metalness: 0.2, emissive: new THREE.Color().setScalar(GLOW * 0.5) });
    horn.userData.glow = GLOW * 0.5;
    this.mats.push(horn);
    this.spines = new THREE.InstancedMesh(new THREE.ConeGeometry(0.2, 1, 5).translate(0, 0.5, 0), horn, SPINES);
    this.spines.frustumCulled = false;
    const tint = [0.1, 0.05, 0.03]; // the membrane's own glow: a dark leathery umber, not grey
    const membrane = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85, color: 0x6e5a3e, emissive: new THREE.Color(...tint) });
    membrane.userData.glow = 0;
    membrane.userData.ghost = tint;
    this.mats.push(membrane);
    const wg = wingGeometry();
    for (const s of [1, -1]) { const w = new THREE.Group(), m = new THREE.Mesh(wg, membrane); m.scale.set(s * 1.4, 1.4, 1.4); w.add(m); this.wings.push(w); }
    this.body.add(this.tube, this.spines, this.head, ...this.wings);
    this.body.visible = false;
    this.root.add(this.body);
    this.curve = new THREE.CatmullRomCurve3(this.ctrl, false, 'centripetal');

    // The three spots, each marked out in the water by a cluster of mooring poles (bricole) bound at the top.
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.9 });
    for (const [x] of spots) for (const [dx, dz, tilt] of [[-0.35, 0, 0.12], [0.35, 0.1, -0.12], [0, -0.4, 0.05]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 5, 6), wood);
      pole.position.set(x + 3.2 + dx, WATER + 1.4, SHORE - 2.2 + dz);
      pole.rotation.z = tilt;
      this.root.add(pole);
    }
    for (let i = 0; i < 8; i++) this.foams.push(vfx.hold(foam));
    for (let i = 0; i < spots.length; i++) this.marks.push([vfx.hold(spotRing), vfx.hold(spotRunes)]);
  }

  /** World position between the jaws: where the gob of venom leaves. */
  tipAt(v = V()): THREE.Vector3 {
    this.head.updateMatrixWorld(true);
    return v.copy(this.mouth).applyMatrix4(this.head.matrixWorld);
  }

  hit(n: number): void {
    this.flashK = Math.min(1, 0.5 + n / 200);
  }

  update(f: Priest, dt: number, _vfx: Vfx, d: number): void {
    this.time += dt;
    const was = this.state, now = f.state, K = f.kind, v = this.vfx;
    this.state = now;
    if (was !== undefined && was !== now) this.change(f, was, now, d);

    // Up or under: at rest and evading it lies hidden, the Immersione's first second takes it down, dead it slumps and goes.
    const under = now === 'pray' || now === 'evade' || (now === 'dive' && f.t > 0.2) || (now === 'dead' && this.dead > 2.5);
    this.sink = clamp01(this.sink + (under ? 1 : -1) * dt / (under ? (now === 'dead' ? 4 : 1.1) : 1.6));
    if (now === 'dead') this.dead += dt; else this.dead = 0;
    this.body.visible = this.sink < 0.995;
    this.markSpots(f, dt);
    if (this.body.visible) this.pose(f, dt);
    else for (const c of this.foams) c.on = false;
    this.flashK = Math.max(0, this.flashK - dt * 4);
    flash(this.mats, this.flashK, f.cc);
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 3);
    if (this.slam > 0) this.slam -= dt;

    // The breath: venom pouring from the jaws down the wedge as it lets go.
    if (now === 'pour' && K.pour) {
      const p = f.t / K.pour.cast;
      if (p > 0.45) {
        const m = this.tipAt(this.v);
        for (let i = v.count(90, dt); i > 0; i--) {
          const a = f.pourA + (Math.random() - 0.5) * K.pour.angle, s = 6 + Math.random() * 10, tx = f.x + Math.sin(a) * K.pour.length * 0.7, tz = f.z + Math.cos(a) * K.pour.length * 0.7;
          this.w.set(tx - m.x, f.y - m.y, tz - m.z).normalize();
          v.spawn(venom, m.x, m.y, m.z, this.w.x * s, this.w.y * s, this.w.z * s);
        }
      }
    }
    // While it charges a spit, venom drips from the jaws.
    if ((now === 'cast' || now === 'pour') && Math.random() < dt * 30) { const m = this.tipAt(this.v); v.spawn(venomSpark, m.x, m.y - 0.2, m.z, 0, -1, 0); }
  }

  /** The brain changed state: the moments that get their sound, their water, their shake. */
  private change(f: Priest, was: string, now: string, d: number): void {
    const v = this.vfx, near = d < 30 ? 1 : 0.4, K = f.kind, at = { x: f.x, y: f.y + 6, z: f.z };
    if (was === 'dive' && now === 'chase') { // up out of the water: a wall of spray, a roar, the bells
      this.splash(f.x, SHORE - 3, 1.6);
      this.splash(f.x - 4, SHORE - 6, 0.8);
      v.decal(wave, f.x, f.y + 0.06, f.z);
      v.shake(0.7 * near);
      playSfx('boss_roar', at, { rate: 0.62, gain: 1.6 });
      playSfx('boss_nova', at, { rate: 0.55, gain: 1.2 });
      playSfx('toll_bell', at, { rate: 0.5, gain: 1.2, delay: 0.4 });
      this.sink = Math.min(this.sink, 0.75); // breaks the surface at once
    }
    if (now === 'dive' && was !== 'pray') { // under: the water closes over it
      this.splash(f.x, SHORE - 3, 1.2);
      playSfx('boss_nova', at, { rate: 0.7, gain: 1.1 });
      v.shake(0.35 * near);
    }
    if (was === 'pray' && now === 'dive') playSfx('bell_far', at, { rate: 0.7, gain: 1.4 }); // pulled: something stirs under the water
    if (now === 'pour') playSfx('boss_roar', at, { rate: 0.85, gain: 1.2, variant: 1 });
    if (was === 'pour' && now !== 'dead' && K.pour) { // the breath let go: the wedge in green fumes
      for (let i = 0; i < 40; i++) {
        const a = f.pourA + (Math.random() - 0.5) * K.pour.angle, r = 1.5 + Math.random() * (K.pour.length - 1.5);
        v.spawn(venom, f.x + Math.sin(a) * r, f.y + 0.4, f.z + Math.cos(a) * r, Math.sin(a) * 1.5, 1 + Math.random(), Math.cos(a) * 1.5);
      }
      v.pulse(f.x, f.y + 3, f.z, VENOM, 50);
      v.shake(0.4 * near);
      playSfx('plague_hit', at, { rate: 0.6, gain: 1.4 });
    }
    if (now === 'nova') playSfx('boss_nova_cast', at, { rate: 0.7, gain: 1.3 });
    if (was === 'nova' && now !== 'dead' && K.nova) { // the Coda comes down: the shore cracks, a wave of sea water races out
      const r = K.nova.radius;
      v.decal(quake, f.x, f.y + 0.07, f.z);
      v.decal(cracks, f.x, f.y + 0.05, f.z);
      v.ring(spray, f.x, f.y + 0.4, f.z, 36, 1, r * 1.6, 3);
      v.burst(dust, f.x, f.y + 0.5, f.z, 14, r * 0.6, 1.5);
      v.burst(drop, f.x, f.y + 1, f.z, 60, 1.5, 8, 6);
      v.pulse(f.x, f.y + 2, f.z, SEA, 70);
      v.shake(0.9 * near);
      playSfx('boss_nova', at, { rate: 0.75, gain: 1.5 });
      playSfx('hit_big', at, { rate: 0.6, gain: 1.4 });
      this.slam = 0.5;
    }
    if (was === 'cast' && now === 'chase' && f.cd > 1) { this.recoil = 1; playSfx('plague_cast', at, { rate: 0.7 }); }
    if (now === 'swing') playSfx('boss_swing', at, { rate: 0.7, gain: 1.2, delay: Math.max(0, (K.melee?.windup ?? 0.8) - 0.4) });
    if (now === 'dead') { // it falls: one last roar, the bells three times, the head down into the water
      playSfx('boss_death', at, { rate: 0.7, gain: 1.4 });
      for (let i = 0; i < 3; i++) playSfx('toll_bell', at, { delay: 1 + i * 1.6, rate: 0.8, gain: 1.3 });
      v.shake(0.8);
      v.pulse(f.x, f.y + 4, f.z, 0xfff0c0, 110);
    }
  }

  /** A column of sea water thrown up at (x, z), `k` its size; a wave out over the surface. */
  private splash(x: number, z: number, k: number): void {
    const v = this.vfx;
    v.burst(spray, x, WATER + 1, z, Math.round(40 * k), 2.5 * k, 6 * k, 10 * k);
    v.burst(drop, x, WATER + 2, z, Math.round(80 * k), 2 * k, 7 * k, 12 * k);
    v.decal(wave, x, WATER + 0.05, z);
  }

  /**
   * The Immersione's rings: while it is under, a ring on the shore at every spot it may come up at, its burst's reach; the
   * last `warn` s the one it picked fills and the water boils off it.
   */
  private markSpots(f: Priest, dt: number): void {
    const V = f.kind.dive, on = !!V && f.state === 'dive';
    this.marks.forEach(([ring, runes], i) => {
      ring.on = runes.on = on;
      if (!on || !V) return;
      const [x, z] = this.spots[i], left = V.under - f.t, picked = i === f.diveTo && left < V.warn, p = picked ? 1 - left / V.warn : 0;
      ring.x = runes.x = x; ring.z = runes.z = z;
      ring.y = runes.y = (Math.abs(x - this.spots[0][0]) < 7 ? 0.5 : 0) + 0.08; // the stage's top
      ring.size = V.radius * 2;
      runes.size = V.radius * 1.6;
      ring.fill = picked ? 0.1 + 0.9 * p : 1;
      ring.alpha = picked ? 0.7 + 0.3 * p : 0.3;
      ring.color.setHex(picked ? VENOM : SEA).multiplyScalar(spotRing.hdr!);
      runes.alpha = picked ? 0.9 : 0.25;
      runes.rot += dt * (picked ? 3 : 0.4);
      if (f.t > 1.2 && Math.random() < dt * (picked ? 40 : 6)) this.vfx.spawn(bubble, x + (Math.random() - 0.5) * 4, WATER + 0.1, SHORE - 1.5 - Math.random() * 3, 0, 0.5, 0);
      if (picked && Math.random() < dt * 12) this.vfx.spawn(spray, x + (Math.random() - 0.5) * 3, WATER + 0.3, SHORE - 2.5, 0, 3, 0);
    });
  }

  /** Lay the spine, the head on it, the tube and spines along it, the wings, the foam where it cuts the water. */
  private pose(f: Priest, dt: number): void {
    const K = f.kind, t = this.time, c = this.ctrl, ax = f.x, ay = f.y, az = f.z, drop = ease(this.sink) * SINK;
    this.fwd.set(-Math.sin(f.yaw), 0, -Math.cos(f.yaw));
    if (this.fwd.z < 0.35) { this.fwd.z = 0.35; this.fwd.normalize(); } // it faces the land, never back out to sea
    const fw = this.fwd, bob = Math.sin(t * 1.3) * 0.25;

    // The head: up over the stage, bobbing, looking down at the ground ahead; the bite, the breath, the spit move it.
    const rest = this.rest.set(ax + fw.x * 0.8, ay + 6.2 + bob, az - 1.6 + fw.z * 0.8);
    const look = this.look.set(ax + fw.x * 9, ay, az + fw.z * 9);
    if (f.state === 'swing' && K.melee) {
      const w = K.melee.windup, s = f.t;
      const lunge = this.v.set(ax + fw.x * 1.6, ay + 2, az + fw.z * 1.6);
      if (s < w) { const k = ease(s / w); rest.addScaledVector(fw, -1.4 * k).y += 1.2 * k; }
      else if (s < w + 0.14) rest.lerp(lunge, ease((s - w) / 0.14));
      else rest.lerp(lunge, 1 - ease(clamp01((s - w - 0.14) / Math.max(0.3, K.melee.swing - w - 0.14))));
      look.set(ax + fw.x * 4, ay, az + fw.z * 4);
    } else if (f.state === 'pour' && K.pour) {
      const p = f.t / K.pour.cast, dx = Math.sin(f.pourA), dz = Math.cos(f.pourA);
      if (p < 0.5) { const k = ease(p / 0.5); rest.addScaledVector(fw, -1.8 * k).y += 2 * k; }
      else { rest.addScaledVector(fw, -1.8).y += 2; rest.x += dx * 2.4 * ease((p - 0.5) / 0.5); rest.z += dz * 2.4 * ease((p - 0.5) / 0.5); rest.y -= 2.2 * ease((p - 0.5) / 0.5); }
      look.set(ax + dx * K.pour.length * 0.6, ay, az + dz * K.pour.length * 0.6);
    } else if (f.state === 'cast') {
      const k = ease(clamp01(f.t / f.kind.cast));
      rest.addScaledVector(fw, -1 * k).y += 0.8 * k;
    } else if (f.state === 'nova') {
      rest.y += 1.2 * ease(clamp01(f.t / (K.nova?.cast ?? 1))); // rears up as the tail comes up
    }
    if (this.recoil > 0) rest.addScaledVector(fw, 1.2 * this.recoil);
    if (f.state === 'dead') { const k = ease(clamp01(this.dead / 2.2)); rest.y -= 5.5 * k; rest.addScaledVector(fw, 2.5 * k); look.y -= 8 * k; }
    rest.y -= drop;
    this.head.position.copy(rest);
    this.head.lookAt(look.x, look.y - drop, look.z);
    this.head.updateMatrixWorld(true);

    // The spine, tail tip first. Out to sea is -Z; the coils roll on the swell.
    const o = SHORE, w1 = Math.sin(t * 0.9) * 0.6, w2 = Math.sin(t * 0.9 + 2) * 0.6, curl = Math.sin(t * 1.7) * 0.5;
    let tip: [number, number, number] = [ax + 7.5, 2.4 + curl, o - 1.4];
    if (f.state === 'nova' && K.nova) { // the Coda: the tail up high, then brought down on the shore
      const p = f.t / K.nova.cast, up: [number, number, number] = [ax + 5, ay + 12, o - 3], hit: [number, number, number] = [ax + 1.5, ay + 0.6, az + 3];
      tip = p < 0.82 ? lerp3(tip, up, ease(p / 0.82)) : lerp3(up, hit, ease((p - 0.82) / 0.18));
    } else if (this.slam > 0) tip = [ax + 1.5, ay + 0.6, az + 3];
    const raise = f.state === 'nova' ? ease(clamp01((f.t / (K.nova?.cast ?? 1)) / 0.8)) : this.slam > 0 ? 1 : 0;
    const pts: [number, number, number][] = [
      tip,
      [ax + 8.2, 0.4 + 4 * raise, o - 3],
      [ax + 8.8, -3, o - 6.5],
      [ax + 6, 2 + w1, o - 11],
      [ax + 1.5, -3.5, o - 14.5],
      [ax - 4.5, 2.6 + w2, o - 12.5],
      [ax - 6.5, -3.5, o - 8],
      [ax - 2.5, -1.8, o - 5],
      [ax - 1, 2.6 + bob * 0.5, o - 3.4],
    ];
    pts.forEach(([x, y, z], i) => c[i].set(x, y - drop, z));
    this.w.copy(this.stump).transformDirection(this.head.matrixWorld); // the stump's way out, in the world
    c[9].copy(rest).addScaledVector(this.w, 3.2);
    c[10].copy(rest).addScaledVector(this.w, 1.2);
    c[11].copy(rest).addScaledVector(this.w, -0.3); // into the skull, under the scales of the head
    this.curve.updateArcLengths();
    for (let i = 0; i <= N; i++) this.curve.getPointAt(i / N, this.pts[i]);
    this.frames();
    this.skin();
    this.ridge();
    this.fly(f, dt);
    this.foam();
  }

  /** Tangents, and a normal on the back: up, or out to sea where the spine stands upright (the neck's back faces the lagoon). */
  private frames(): void {
    const up = this.u;
    for (let i = 0; i <= N; i++) {
      const a = this.pts[Math.max(0, i - 1)], b = this.pts[Math.min(N, i + 1)], tg = this.tan[i].subVectors(b, a).normalize();
      up.set(0, 1, -0.9).normalize();
      this.nrm[i].copy(up).addScaledVector(tg, -up.dot(tg)).normalize();
    }
  }

  /** The tube: thin at the tail, thick through the coils, narrowing up the neck to the head's stump. */
  private skin(): void {
    const P = this.pos.array as Float32Array, Nn = this.nor.array as Float32Array, b = this.v, d = this.w;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const r = GIRTH * (s < 0.12 ? 0.12 + (s / 0.12) * 0.45 : s < 0.3 ? 0.57 + ((s - 0.12) / 0.18) * 0.43 : s < 0.78 ? 1 + Math.sin(s * 20) * 0.04 : 1 - ((s - 0.78) / 0.22) * 0.38);
      const p = this.pts[i], n = this.nrm[i];
      b.crossVectors(this.tan[i], n);
      for (let j = 0; j <= R; j++) {
        const a = (j / R) * Math.PI * 2, k = (i * (R + 1) + j) * 3; // j 0: the back, R/2: the belly
        d.copy(n).multiplyScalar(Math.cos(a)).addScaledVector(b, Math.sin(a));
        P[k] = p.x + d.x * r; P[k + 1] = p.y + d.y * r * 0.92; P[k + 2] = p.z + d.z * r;
        Nn[k] = d.x; Nn[k + 1] = d.y; Nn[k + 2] = d.z;
      }
    }
    this.pos.needsUpdate = this.nor.needsUpdate = true;
  }

  /** The spines along its back, leaning towards the tail. */
  private ridge(): void {
    for (let i = 0; i < SPINES; i++) {
      const s = 0.06 + (i / (SPINES - 1)) * 0.9, k = Math.round(s * N), p = this.pts[k], n = this.nrm[k], r = (s < 0.3 ? 0.6 : s < 0.78 ? 1 : 0.8) * GIRTH;
      this.v.copy(n).addScaledVector(this.tan[k], -0.5).normalize();
      this.q.setFromUnitVectors(Y, this.v);
      this.w.copy(p).addScaledVector(n, r * 0.85);
      this.m.compose(this.w, this.q, this.u.set(r, r * (1.1 + (i % 3) * 0.25), r));
      this.spines.setMatrixAt(i, this.m);
    }
    this.spines.instanceMatrix.needsUpdate = true;
  }

  /** The wings at the shoulders, where the neck leaves the water: spread and beating slowly, flung wide as it rises. */
  private fly(f: Priest, dt: number): void {
    let k = Math.round(N * 0.82);
    for (let i = Math.round(N * 0.7); i < N; i++) if (this.pts[i].y > WATER + 1.4 - ease(this.sink) * SINK) { k = i; break; }
    this.shoulder.copy(this.pts[k]);
    const beat = Math.sin(this.time * (f.state === 'pour' ? 3 : 1.3)) * 0.22, rise = this.sink > 0.05 ? 0.6 * this.sink : 0, fold = f.state === 'dead' ? ease(clamp01(this.dead / 2)) : 0;
    this.wings.forEach((w, i) => {
      const s = i ? -1 : 1;
      w.position.copy(this.shoulder).addScaledVector(this.nrm[k], 0.5 * GIRTH);
      w.position.x += s * 0.5 * GIRTH;
      w.rotation.set(-0.35, s * (0.35 - fold), s * (0.25 + beat + rise - fold * 0.9), 'YXZ');
    });
    void dt;
  }

  /** Foam rings where the body cuts the water. */
  private foam(): void {
    let k = 0;
    for (let i = 1; i <= N && k < this.foams.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      if ((a.y - WATER) * (b.y - WATER) > 0) continue;
      const c = this.foams[k++], u = (WATER - a.y) / (b.y - a.y || 1);
      c.on = true;
      c.x = a.x + (b.x - a.x) * u; c.y = WATER + 0.04; c.z = a.z + (b.z - a.z) * u;
      c.size = 3.2 + Math.sin(this.time * 3 + i) * 0.3;
      c.rot += 0.01;
      if (Math.random() < 0.08) this.vfx.spawn(spray, c.x, WATER + 0.2, c.z, 0, 1.5, 0);
    }
    for (; k < this.foams.length; k++) this.foams[k].on = false;
  }
}

const Y = new THREE.Vector3(0, 1, 0);
const lerp3 = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
