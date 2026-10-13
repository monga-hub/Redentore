import * as THREE from 'three';
import type { World } from '../core/physics.ts';
import { SHADOW_FAR, loadModel } from '../core/models.ts';
import { D, T, type Decal, type DecalStyle, type RibbonStyle, type Style, type Vfx } from '../abilities/vfx.ts';
import type { PlayerStats } from '../player/stats.ts';
import { separate, type Target } from './brain.ts';
import { APE, hurt, killAll, spawnApiary, think, wipe, type CasterState, type Priest } from './caster.ts';
import { barMat, flash, ownMaterials } from './friars.ts';

// L'ape gigante and her workers at the apiary: a giant hornet generated with Meshy AI (see
// ATTRIBUTION.md), one static mesh animated here in code, as Meshy's auto-rig is for bipeds:
// it hovers with a bob and a sway, its wings beat in the vertex shader (each wing turns about
// its root on the thorax), it leans into the chase, rears back and dives stinger first, rises
// and spins while a poison swarm gathers round it, jolts when struck and drops out of the air
// when killed. The workers are the same mesh, small. The AI is the caster brain (caster.ts APE).

const FILE = 'ape.glb';
// The mesh in Meshy's frame, 1.9 long: head +Z, wings rising from the thorax's top sides (x ±0.22, y 0.2).
const STINGER = new THREE.Vector3(0, -0.02, -0.95); // its tip
const HINGE = { x: 0.22, y: 0.2 };
const SIZES = { queen: 1.35, worker: 0.42 }; // scale: a 2.6 m hornet, workers 0.8 m long
const HOVER = { queen: 1.25, worker: 1.1 }; // m from the floor to the middle of the body
const FLAP = { hz: 13, amp: 0.55 }; // wing beats per second, radians either way
const SINK = { after: 6, time: 2.5, depth: 1.2 };
const FAR = 40; // m: a hovering bee farther than this skips its bob and wingbeat
const BAR_W = 0.07, BIG = 25;

const VENOM = 0x9cff3a, AMBER = 0xffb21c, MURK = 0x1d2a08;
const venomMote: Style = { life: [0.4, 0.7], size: [0.05, 0.1], color: 0xd8ff8a, color2: VENOM, hdr: 2.5, tex: T.spark, drag: 2 };
const swarmSpeck: Style = { life: [0.6, 1], size: [0.06, 0.1], color: 0x140e04, alpha: 0.95, tex: T.ember, dark: true, drag: 0.6, spin: [4, 10] };
const cloud: Style = { life: [1.2, 1.8], size: [1.2, 1.8], grow: 1.8, color: 0x6fa020, color2: MURK, alpha: 0.55, tex: T.smoke, erode: true, dark: true, drag: 2.2, grav: -0.2 };
const cloudGlow: Style = { life: [0.5, 0.8], size: [0.8, 1.3], grow: 1.5, color: VENOM, hdr: 1.3, alpha: 0.5, tex: T.smoke2, erode: true, drag: 2.5 };
const ichor: Style = { life: [0.6, 1.1], size: [0.07, 0.13], color: AMBER, hdr: 1.4, tex: T.drop, grav: 8, drag: 1 };
const chip: Style = { life: [0.5, 0.9], size: [0.08, 0.16], color: 0x2a1a08, alpha: 0.95, tex: T.shard, dark: true, grav: 9, drag: 1, spin: [3, 8] };
const soul: Style = { life: [1.4, 1.8], size: 0.6, grow: 1.5, color: 0xe8ff9a, hdr: 1.2, alpha: 0.6, tex: T.skull, grav: -1.2, fadeIn: 0.25 };
const dust: Style = { life: [0.8, 1.2], size: [0.4, 0.7], grow: 2, color: 0x6a5642, alpha: 0.45, tex: T.smoke, erode: true, dark: true, drag: 2 };
const stab: DecalStyle = { life: 0.4, size: 0.6, grow: 3, tile: D.shock, color: VENOM, hdr: 1.6, fadeOut: 0.6 };
const pool: DecalStyle = { life: 5, size: 7, tile: D.pool, color: 0x3e6a10, alpha: 0.7, fadeIn: 0.2, fadeOut: 0.5, dark: true };
const wave: DecalStyle = { life: 0.5, size: 2, grow: APE.nova!.radius, tile: D.shock, color: 0xe0ffb0, color2: VENOM, hdr: 2, fadeOut: 0.5 };
const tele: DecalStyle = { life: 0, size: APE.nova!.radius * 2, tile: D.ring, color: VENOM, hdr: 2.4 };
const edge: Style = { life: [0.5, 0.8], size: [0.3, 0.55], grow: 0.6, color: 0xc8ff70, color2: 0x2a5008, hdr: 1.6, tex: T.flame, upright: true, grav: -2.5, fadeIn: 0.2 };
const teleSwirl: DecalStyle = { life: 0, size: 4, tile: D.swirl, color: VENOM, hdr: 1.2 };
const stingTrail: RibbonStyle = { color: 0xf0ffd0, color2: VENOM, hdr: 1.8, alpha: 0.7, width: 0, life: 0.16 };

/** Signed wing weight per vertex: 0 on the body, ±1 out on the right/left wing (by height and reach past the thorax). */
function wingWeights(g: THREE.BufferGeometry): void {
  const p = g.attributes.position, w = new Float32Array(p.count);
  const ramp = (a: number, b: number, v: number) => THREE.MathUtils.smoothstep(v, a, b);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    w[i] = Math.sign(x) * ramp(0.1, 0.3, y) * ramp(0.22, 0.4, Math.abs(x));
  }
  g.setAttribute('wing', new THREE.BufferAttribute(w, 1));
}

/** Wingbeat in the vertex shader: each wing vertex turns about its wing's root by `flap` × its weight (normals too). */
function beat(m: THREE.MeshStandardMaterial, flap: { value: number }): void {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.flap = flap;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float wing;
        uniform float flap;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        float wa = flap * wing, wc = cos(wa), ws = sin(wa);
        objectNormal.xy = mat2(wc, ws, -ws, wc) * objectNormal.xy;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec2 hinge = vec2(sign(wing) * ${HINGE.x.toFixed(2)}, ${HINGE.y.toFixed(2)});
        transformed.xy = hinge + mat2(wc, ws, -ws, wc) * (transformed.xy - hinge);`);
  };
  m.customProgramCacheKey = () => 'ape-wings';
}

/** One bee: the mesh in a body that hovers, leans, dives and falls, and its nameplate bar. */
class View {
  readonly root = new THREE.Group();
  private body = new THREE.Group(); // hover, sway, attack moves
  private mats: THREE.MeshStandardMaterial[];
  private flap = { value: 0 };
  private phase = Math.random() * 10;
  private beatAmp = 1; // eases to 0 in death
  private flashK = 0;
  private jolt = new THREE.Vector3(); // hit recoil, springing back
  private state?: CasterState;
  private fall = { y: 0, v: 0, roll: 0 }; // death drop
  private trail = -1;
  private bar = new THREE.Group();
  private fill: THREE.Sprite;
  private tip = new THREE.Object3D();
  private mesh: THREE.Mesh;
  private v = new THREE.Vector3();
  readonly queen: boolean;
  readonly height: number;

  constructor(mesh: THREE.Mesh, queen: boolean) {
    this.queen = queen;
    const k = queen ? SIZES.queen : SIZES.worker, hover = queen ? HOVER.queen : HOVER.worker;
    this.height = hover + 0.65 * k;
    const m = mesh.clone();
    m.rotation.y = Math.PI; // head to -Z, the game's yaw 0
    m.scale.setScalar(k);
    this.mesh = m;
    this.mats = ownMaterials(m);
    for (const mat of this.mats) beat(mat, this.flap);
    this.tip.position.copy(STINGER);
    m.add(this.tip);
    this.body.position.y = hover;
    this.body.add(m);
    this.root.add(this.body);

    const bg = new THREE.Sprite(barMat(0x140c08));
    bg.scale.set(0.075, 0.011, 1);
    this.fill = new THREE.Sprite(barMat(0xc8241c));
    this.fill.scale.set(BAR_W, 0.006, 1);
    this.fill.renderOrder = 1;
    this.bar.add(bg, this.fill);
    this.bar.position.y = this.height + 0.35;
    this.root.add(this.bar);
  }

  /** Struck for `n`: the red flash and a jolt away from the blow. */
  hit(n: number): void {
    this.flashK = 1;
    const k = (n >= BIG ? 0.35 : 0.18) * (this.queen ? 1 : 1.5);
    this.jolt.set((Math.random() - 0.5) * k, k * 0.4, k); // back (+Z in the body's frame) and up a little
  }

  stingerAt(v: THREE.Vector3): THREE.Vector3 {
    return this.tip.getWorldPosition(v);
  }

  /** `d`: m from the hero. */
  update(f: Priest, dt: number, vfx: Vfx, d: number): void {
    const far = d > FAR && f.state === 'pray';
    this.mesh.castShadow = d < SHADOW_FAR;
    const was = this.state;
    if (f.state !== was) {
      this.state = f.state;
      if (f.state === 'dead') this.fall = { y: 0, v: 0, roll: 0 };
    }
    const K = f.kind, hover = this.queen ? HOVER.queen : HOVER.worker, s = this.queen ? 1 : 0.5;
    this.phase += dt;
    const t = this.phase;

    // Body pose in the bee's frame (yaw applied by root): offsets and turns layered per state.
    let x = Math.sin(t * 1.3) * 0.12 * s, y = hover + Math.sin(t * 2.4) * 0.12 * s, z = 0;
    let pitch = Math.sin(t * 1.9) * 0.05, roll = Math.sin(t * 1.1) * 0.08, spin = 0, buzz = 1;
    if (f.state === 'chase' || f.state === 'evade') pitch -= f.move ? 0.28 : 0.1; // leans into the flight
    if (f.state === 'swing' && K.melee) {
      // Rears back and up, coiled, then dives: the body swings up so the stinger thrusts forward and down.
      const w = K.melee.windup, u = f.t / w;
      if (u < 1) {
        const e = THREE.MathUtils.smootherstep(u, 0, 0.85);
        z += 0.6 * e * s; y += 0.45 * e * s; pitch -= 0.35 * e;
        if (u > 0.8) { const d = (u - 0.8) / 0.2; z -= 1.9 * d * s; y -= 0.6 * d * s; pitch += 1.5 * d; }
      } else {
        const r = THREE.MathUtils.smoothstep(f.t, w, K.melee.swing);
        z += (0.6 - 1.9) * (1 - r) * s; y += (0.45 - 0.6) * (1 - r) * s; pitch += (1.5 - 0.35) * (1 - r);
      }
      buzz = 1.4;
    }
    if (f.state === 'nova' && K.nova) {
      const p = Math.min(f.t / K.nova.cast, 1);
      y += 1.1 * THREE.MathUtils.smoothstep(p, 0, 0.5); spin = p * p * 9; pitch += 0.2 * p; buzz = 1.6;
    }

    // Death: the wings stop and it drops, rolling onto its back, a bounce on the floor.
    if (f.state === 'dead') {
      this.beatAmp = Math.max(0, this.beatAmp - dt * 3);
      const F = this.fall;
      if (F.y > -hover + 0.25 * s || F.v < -0.5) {
        F.v -= 14 * dt; F.y += F.v * dt;
        if (F.y < -hover + 0.25 * s) {
          F.y = -hover + 0.25 * s;
          if (F.v < -2) { vfx.burst(dust, f.x, f.y + 0.1, f.z, this.queen ? 8 : 2, 0.4 * s + 0.2, 1); if (this.queen) vfx.shake(0.15); }
          F.v = F.v < -2 ? -F.v * 0.3 : 0;
        }
      }
      F.roll = Math.min(2.6, F.roll + dt * 5);
      y += F.y; roll += F.roll; pitch = 0.3;
      x = 0; z = 0;
    } else this.beatAmp = Math.min(1, this.beatAmp + dt * 3);

    // Hit jolt: a spring back to rest.
    this.jolt.multiplyScalar(Math.max(0, 1 - dt * 8));
    x += this.jolt.x; y += this.jolt.y; z += this.jolt.z;

    const sink = f.state === 'dead' ? THREE.MathUtils.clamp((f.t - SINK.after) / SINK.time, 0, 1) : 0;
    this.root.visible = sink < 1;
    this.root.position.set(f.x, f.y - sink * SINK.depth * s, f.z);
    this.root.rotation.y = f.yaw + spin;
    if (!far) {
      this.body.position.set(x, y, z);
      this.body.rotation.set(pitch, 0, roll, 'YXZ');
      this.flap.value = Math.sin(t * Math.PI * 2 * FLAP.hz * buzz * (this.queen ? 1 : 1.6)) * FLAP.amp * this.beatAmp;
    }

    // The stinger's arc in the dive, venom dripping off it; a gouge where it hits the floor.
    const m = K.melee, live = !!m && f.state === 'swing' && f.t > m.windup * 0.75 && f.t < m.windup + 0.15;
    if (live && this.trail < 0) this.trail = vfx.ribbons.begin({ ...stingTrail, width: 0.12 * s }, false);
    if (this.trail >= 0) {
      this.stingerAt(this.v);
      vfx.ribbons.push(this.trail, this.v.x, this.v.y, this.v.z);
      if (Math.random() < dt * 30) vfx.spawn(venomMote, this.v.x, this.v.y, this.v.z, 0, -0.5, 0);
      if (!live) {
        vfx.ribbons.end(this.trail);
        this.trail = -1;
        if (this.queen) vfx.decal(stab, this.v.x, f.y + 0.04, this.v.z);
      }
    }

    if (this.flashK > 0) this.flashK = Math.max(0, this.flashK - dt * 4);
    flash(this.mats, this.flashK);
    const r = f.hp / K.hp;
    this.bar.visible = f.state !== 'dead' && (f.state !== 'pray' || r < 1);
    this.bar.position.y = y + 0.65 * (this.queen ? SIZES.queen : SIZES.worker) + 0.35;
    this.fill.scale.x = BAR_W * Math.max(r, 1e-3);
    this.fill.center.x = 0.5 / Math.max(r, 1e-3);
  }
}

/** The apiary's bees: brains, bodies, the giant's stinger and poison swarm, combat glue. */
export class Bees {
  readonly root = new THREE.Group();
  readonly all: Priest[];
  readonly queen: Priest;
  private views: View[] = [];
  private tele: Decal;
  private teleSwirl: Decal;
  private world: World;
  private vfx: Vfx;
  private stats: PlayerStats;

  constructor(world: World, vfx: Vfx, stats: PlayerStats) {
    this.world = world;
    this.vfx = vfx;
    this.stats = stats;
    const { all, queen } = spawnApiary(world);
    this.all = all;
    this.queen = queen;
    this.tele = vfx.hold(tele);
    this.teleSwirl = vfx.hold(teleSwirl);
    loadModel(FILE).then((gltf) => {
      let mesh!: THREE.Mesh;
      gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
      // Bake the node's (dequantising) transform into float positions: the wing weights and the shader read Meshy's frame.
      mesh.updateWorldMatrix(true, false);
      const g = mesh.geometry.clone();
      for (const name of ['position', 'normal']) {
        const a = g.getAttribute(name), f = new Float32Array(a.count * 3);
        for (let i = 0; i < a.count; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); }
        g.setAttribute(name, new THREE.BufferAttribute(f, 3));
      }
      g.applyMatrix4(mesh.matrixWorld);
      wingWeights(g);
      g.computeBoundingSphere();
      const base = new THREE.Mesh(g, mesh.material);
      this.views = this.all.map((f) => new View(base, f.kind === APE));
      for (const v of this.views) this.root.add(v.root);
    }, (e) => console.error('bee model failed to load', e));
  }

  /** Model height over the feet, for targeting and damage numbers: the giant's and a worker's. */
  static readonly HEIGHT = { queen: HOVER.queen + 0.65 * SIZES.queen, worker: HOVER.worker + 0.65 * SIZES.worker };

  killAll(): void {
    killAll(this.all);
  }

  wipe(): void {
    wipe(this.all);
  }

  update(dt: number, player: Target): void {
    if (!this.views.length) return;
    let dmg = 0;
    this.all.forEach((f) => {
      const was = f.state, hit = think(f, player, this.world, dt, []);
      dmg += hit;
      if (was === 'nova' && f.state !== 'nova') this.swarm(f, hit > 0);
    });
    separate(this.all, this.world);
    this.drawTelegraph(dt);
    this.all.forEach((f, i) => this.views[i].update(f, dt, this.vfx, Math.hypot(f.x - player.x, f.z - player.z)));
    if (dmg > 0) this.stats.takeDamage(dmg);
  }

  /** The swarm gathering: a venom ring fills the floor to its edge, motes and specks spiral in to the giant. */
  private drawTelegraph(dt: number): void {
    const f = this.queen, on = f.state === 'nova', t = this.tele, s = this.teleSwirl;
    t.on = s.on = on;
    if (!on) return;
    const n = f.kind.nova!, p = Math.min(f.t / n.cast, 1);
    t.x = s.x = f.x; t.y = s.y = f.y + 0.06; t.z = s.z = f.z;
    t.fill = 0.08 + 0.92 * p;
    t.alpha = 0.5 + 0.5 * p;
    t.rot += dt * 0.4;
    s.rot -= dt * (1 + p * 3);
    s.alpha = Math.min(1, f.t * 3) * 0.7;
    s.size = 3 + p * 5;
    const v = this.vfx, y = f.y + HOVER.queen + 1;
    for (let i = v.count(40 + p * 110, dt); i > 0; i--) { // venom licking the edge to run out past
      const a = Math.random() * Math.PI * 2, r = n.radius * (0.97 + Math.random() * 0.06);
      v.spawn(edge, f.x + Math.cos(a) * r, f.y + 0.1, f.z + Math.sin(a) * r, 0, 0.6 + p, 0);
    }
    for (let i = v.count(30 + p * 90, dt); i > 0; i--) {
      const a = Math.random() * Math.PI * 2, r = n.radius * (0.4 + Math.random() * 0.6), h = Math.random() * 2;
      const tx = -Math.cos(a) * r * 1.6 - Math.sin(a) * 3, tz = -Math.sin(a) * r * 1.6 + Math.cos(a) * 3; // inward, swirling
      v.spawn(Math.random() < 0.5 ? swarmSpeck : venomMote, f.x + Math.cos(a) * r, y - 1 + h, f.z + Math.sin(a) * r, tx, (1 - h) * 0.8, tz);
    }
  }

  /** The swarm goes off: a cloud of poison and bees bursting out to its radius, a venom pool left behind. */
  private swarm(f: Priest, hit: boolean): void {
    const r = f.kind.nova!.radius, v = this.vfx, y = f.y + 0.05;
    v.decal(wave, f.x, y + 0.02, f.z);
    v.decal(pool, f.x, y, f.z);
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2, sp = r * 1.4;
      v.spawn(cloud, f.x + Math.cos(a) * 0.6, f.y + 0.6 + Math.random(), f.z + Math.sin(a) * 0.6, Math.cos(a) * sp, 0.3, Math.sin(a) * sp);
    }
    v.ring(cloudGlow, f.x, f.y + 0.5, f.z, 16, 1, r * 1.6, 0.3);
    v.burst(swarmSpeck, f.x, f.y + 1.5, f.z, 70, 1, r * 2, 1);
    v.burst(venomMote, f.x, f.y + 1.5, f.z, 40, 1, 6);
    v.pulse(f.x, f.y + 1.5, f.z, VENOM, hit ? 45 : 30);
    v.shake(hit ? 0.45 : 0.25);
  }

  /** Damage every bee for which `inside(x, z)` holds (abilities). */
  hurtWhere(inside: (x: number, z: number, f: Priest) => boolean, n: number): void {
    this.all.forEach((f, i) => {
      if (f.state === 'dead' || !inside(f.x, f.z, f)) return;
      const killed = hurt(f, n), view = this.views[i], h = view?.height ?? 2;
      if (n >= 1 || killed) {
        view?.hit(n);
        this.vfx.impact(f.x, f.y + h * 0.7, f.z, n >= BIG);
      }
      if (killed) {
        const big = f.kind === APE;
        this.vfx.burst(ichor, f.x, f.y + h * 0.7, f.z, big ? 30 : 8, 0.4, 2.5, 1.5);
        this.vfx.burst(chip, f.x, f.y + h * 0.7, f.z, big ? 14 : 3, 0.3, 2.5, 2);
        if (big) this.vfx.spawn(soul, f.x, f.y + h, f.z);
      }
    });
  }
}
