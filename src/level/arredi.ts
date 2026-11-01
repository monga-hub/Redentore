import * as THREE from 'three';
import type { LevelBuilder, Piece } from './builder.ts';
import type { World } from '../core/physics.ts';
import type { Mob } from '../ui/target.ts';
import { loadModel } from '../core/models.ts';

// San Giorgio's church furniture, level 3 only (zones/sangiorgio.ts places it): walnut pews and rush chairs, lecterns,
// candelabra, the monks' carved stalls, saints in their niches, heaps of fallen marble. Meshy models packed in arredi.glb
// (ATTRIBUTION.md), one node per kind, 1 m tall, feet on y = 0, front on +Z; loaded once the hero is on level 3's side of the
// lagoon, so level 1 and 2 never hold them. One InstancedMesh per kind.
// Pews, chairs, lecterns and candelabra break under the hero's blows (main.ts kit.hurt): the piece goes, a pew leaves its
// wreck, splinters fly and settle where they land (a capped ring of chunks, the oldest reused), a puff of dust. Their colliders
// go with them; colliders stay under 1 m so they never block a line of sight (core/physics.ts sees, enemies/caster.ts sees).

type Kind = Piece['kind'];
/** Footprint per metre of height, [w, d] (x, z of the packed model), as packed. */
const FOOT: Record<Kind, [number, number]> = {
  panca: [0.83, 0.32], rotta: [2.65, 1.56], sedia: [0.58, 0.61], leggio: [0.45, 0.54], stallo: [0.8, 0.34],
  statua: [0.34, 0.32], macerie: [10.9, 10.9], candelabro: [0.35, 0.35],
};
/** What breaks, into how many chunks of what. */
const BREAK: Partial<Record<Kind, { n: number; tint: number; len: number }>> = {
  panca: { n: 16, tint: 0x5a3a24, len: 0.5 },
  sedia: { n: 9, tint: 0x6a4a2c, len: 0.3 },
  leggio: { n: 11, tint: 0x5a3a24, len: 0.35 },
  candelabro: { n: 7, tint: 0x2a2826, len: 0.3 },
};
const COLLIDE = 0.95; // m: colliders' top, under a caster's sight line
const CHUNKS = 200, PUFFS = 4, MOTES = 28;
// Self-glow from the colour map: dark walnut still reads in the unlit church; pale marble needs little.
const GLOW = (kind: string) => (kind === 'statua' || kind === 'macerie' ? 0.12 : 0.38);

/** A piece standing at (x, z) on floor y, its front turned `yaw`; with a collider of its footprint when `solid`. */
export function place(b: LevelBuilder, kind: Kind, x: number, y: number, z: number, yaw: number, h: number, o: { solid?: boolean; tilt?: number; stretch?: number; fixed?: boolean } = {}): Piece {
  const p: Piece = { kind, x, y, z, yaw, h, tilt: o.tilt, stretch: o.stretch, fixed: o.fixed };
  if (o.solid) {
    const [w, d] = FOOT[kind];
    p.box = b.world.add(x, z, (w * h * (o.stretch ?? 1)) / 2, (d * h) / 2, y, y + Math.min(COLLIDE, h), yaw);
  }
  b.furniture.push(p);
  return p;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function pose(p: Piece, kind = p.kind, h = p.h): THREE.Matrix4 {
  _q.setFromEuler(_e.set(0, p.yaw, p.tilt ?? 0, 'YXZ'));
  const k = kind === p.kind ? p.stretch ?? 1 : 1;
  // knocked on its side, it lies on the floor rather than through it
  const lift = p.tilt ? Math.abs(Math.sin(p.tilt)) * (FOOT[kind][0] * h) / 2 : 0;
  return _m.compose(_p.set(p.x, p.y + lift, p.z), _q, _s.set(h * k, h, h));
}

interface Chunk { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; rz: number; sx: number; sy: number; sz: number; floor: number; moving: boolean }
interface Puff { pts: THREE.Points; mat: THREE.PointsMaterial; t: number; v: Float32Array }

export class Arredi {
  readonly root = new THREE.Group();
  private kinds = new Map<Kind, { im: THREE.InstancedMesh; of: Piece[] }>();
  private wrecks: Piece[] = []; // a broken pew's wreck slot per pew (the ones laid broken already first)
  private started = false;
  private ready = false;
  private chunks: Chunk[] = [];
  private chunkMesh?: THREE.InstancedMesh;
  private next = 0;
  private moving = 0;
  private puffs: Puff[] = [];
  private probe: Mob = { x: 0, y: 0, z: 0, hp: 1, state: 'idle' };
  broke = 0; // how many have broken (the soak, the screenshots)

  private pieces: Piece[];
  private world: World;

  constructor(pieces: Piece[], world: World) {
    this.pieces = pieces;
    this.world = world;
    this.root.name = 'arredi';
  }

  /** Loads the pack and builds the batches: once, when level 3 comes into view (main.ts stream). */
  load(): void {
    if (this.started || typeof document === 'undefined') return;
    this.started = true;
    loadModel('arredi.glb').then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const src = new Map<string, THREE.Mesh>();
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.metalness = 0;
        mat.roughness = 0.85;
        mat.emissiveMap = mat.map;
        mat.emissive.setScalar(GLOW(o.name));
        src.set(o.name, m);
      });
      const pews = this.pieces.filter((p) => p.kind === 'panca');
      this.wrecks = [...this.pieces.filter((p) => p.kind === 'rotta'), ...pews.map((p): Piece => ({ ...p, kind: 'rotta', box: undefined, broken: true }))];
      const groups = new Map<Kind, Piece[]>();
      for (const p of this.pieces) if (p.kind !== 'rotta') groups.set(p.kind, [...(groups.get(p.kind) ?? []), p]);
      groups.set('rotta', this.wrecks);
      for (const [kind, of] of groups) {
        const s = src.get(kind);
        if (!s) continue;
        const im = new THREE.InstancedMesh(s.geometry, s.material, of.length);
        im.castShadow = im.receiveShadow = true;
        of.forEach((p, i) => im.setMatrixAt(i, kind === 'rotta' && p.broken && !this.pieces.includes(p) ? ZERO : pose(p).multiply(s.matrixWorld)));
        im.userData.node = s.matrixWorld.clone();
        im.computeBoundingSphere();
        this.root.add(im);
        this.kinds.set(kind, { im, of });
      }
      this.chunkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), CHUNKS);
      this.chunkMesh.castShadow = true;
      for (let i = 0; i < CHUNKS; i++) {
        this.chunkMesh.setMatrixAt(i, ZERO);
        this.chunkMesh.setColorAt(i, new THREE.Color(0xffffff));
        this.chunks.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, sx: 0, sy: 0, sz: 0, floor: 0, moving: false });
      }
      this.chunkMesh.frustumCulled = false; // they fly: the batch's bounds would trail them
      this.root.add(this.chunkMesh);
      const dot = document.createElement('canvas');
      dot.width = dot.height = 32;
      const g2 = dot.getContext('2d')!, r = g2.createRadialGradient(16, 16, 0, 16, 16, 16);
      r.addColorStop(0, 'rgba(255,255,255,0.8)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g2.fillStyle = r;
      g2.fillRect(0, 0, 32, 32);
      const DOT = new THREE.CanvasTexture(dot);
      for (let i = 0; i < PUFFS; i++) {
        const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3));
        const mat = new THREE.PointsMaterial({ map: DOT, color: 0xb8ab94, size: 0.9, transparent: true, opacity: 0, depthWrite: false });
        const pts = new THREE.Points(g, mat);
        pts.frustumCulled = false;
        pts.visible = false;
        this.root.add(pts);
        this.puffs.push({ pts, mat, t: 1e9, v: new Float32Array(MOTES * 3) });
      }
      this.ready = true;
    });
  }

  /** Every standing breakable piece the blow reaches (`inside`, as the enemies take it) breaks. */
  hurtWhere(inside: (x: number, z: number, mob: Mob) => boolean): void {
    if (!this.ready || !this.root.visible) return;
    for (const p of this.pieces) {
      if (p.broken || p.fixed || !BREAK[p.kind]) continue;
      Object.assign(this.probe, { x: p.x, y: p.y, z: p.z });
      if (inside(p.x, p.z, this.probe)) this.smash(p);
    }
  }

  /** `p` breaks: gone (a pew to its wreck), its collider with it, splinters and dust. */
  smash(p: Piece): void {
    if (p.broken) return;
    p.broken = true;
    this.broke++;
    if (p.box) {
      const i = this.world.boxes.indexOf(p.box);
      if (i >= 0) this.world.boxes.splice(i, 1);
      p.box = undefined;
    }
    const k = this.kinds.get(p.kind)!;
    k.im.setMatrixAt(k.of.indexOf(p), ZERO);
    k.im.instanceMatrix.needsUpdate = true;
    if (p.kind === 'panca') {
      const w = this.kinds.get('rotta'), slot = w?.of.findIndex((r) => r.x === p.x && r.z === p.z && !this.pieces.includes(r));
      if (w && slot !== undefined && slot >= 0) {
        w.im.setMatrixAt(slot, pose({ ...w.of[slot], tilt: 0, stretch: 1 }, 'rotta', p.h * 0.7).multiply(w.im.userData.node));
        w.im.instanceMatrix.needsUpdate = true;
        w.im.computeBoundingSphere();
      }
    }
    const B = BREAK[p.kind]!, [fw, fd] = FOOT[p.kind], half = (fw * p.h * (p.stretch ?? 1)) / 2;
    const c = new THREE.Color(B.tint), cs = Math.cos(p.yaw), sn = Math.sin(p.yaw);
    for (let i = 0; i < B.n; i++) {
      const j = this.next, ch = this.chunks[j];
      this.next = (this.next + 1) % CHUNKS;
      const along = (Math.random() * 2 - 1) * half, across = (Math.random() - 0.5) * fd * p.h;
      ch.x = p.x + along * cs + across * sn;
      ch.z = p.z - along * sn + across * cs;
      ch.y = p.y + 0.2 + Math.random() * p.h * 0.6;
      const a = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3;
      ch.vx = Math.cos(a) * v; ch.vz = Math.sin(a) * v; ch.vy = 2 + Math.random() * 3.5;
      ch.rx = Math.random() * 6; ch.ry = Math.random() * 6; ch.rz = Math.random() * 6;
      const l = B.len * (0.4 + Math.random() * 0.8), t = 0.03 + Math.random() * 0.05;
      ch.sx = t; ch.sy = t * (0.6 + Math.random()); ch.sz = l;
      ch.floor = p.y;
      if (!ch.moving) this.moving++;
      ch.moving = true;
      this.chunkMesh!.setColorAt(j, c.clone().multiplyScalar(0.75 + Math.random() * 0.5));
    }
    this.chunkMesh!.instanceColor!.needsUpdate = true;
    const puff = this.puffs.reduce((a, b) => (b.t > a.t ? b : a));
    puff.t = 0;
    const pos = puff.pts.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < MOTES; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * half;
      pos.setXYZ(i, p.x + Math.cos(a) * r, p.y + 0.2 + Math.random() * 0.6, p.z + Math.sin(a) * r);
      puff.v.set([Math.cos(a) * (0.6 + Math.random()), 0.3 + Math.random() * 0.8, Math.sin(a) * (0.6 + Math.random())], i * 3);
    }
    pos.needsUpdate = true;
    puff.pts.visible = true;
  }

  update(dt: number): void {
    if (!this.ready) return;
    dt = Math.min(dt, 0.05);
    if (this.moving) {
      const m = this.chunkMesh!;
      for (let i = 0; i < CHUNKS; i++) {
        const c = this.chunks[i];
        if (!c.moving) continue;
        c.vy -= 9.8 * dt;
        c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
        const spin = Math.hypot(c.vx, c.vz) + Math.abs(c.vy);
        c.rx += spin * dt * 2; c.rz += spin * dt * 1.3;
        const rest = c.floor + c.sy / 2;
        if (c.y < rest) {
          c.y = rest;
          c.vy *= -0.3; c.vx *= 0.55; c.vz *= 0.55;
          if (Math.abs(c.vy) < 0.4 && Math.hypot(c.vx, c.vz) < 0.3) {
            c.moving = false; this.moving--;
            c.rx = 0; c.rz = Math.round(c.rz / Math.PI) * Math.PI; // settles flat
          }
        }
        _q.setFromEuler(_e.set(c.rx, c.ry, c.rz));
        m.setMatrixAt(i, _m.compose(_p.set(c.x, c.y, c.z), _q, _s.set(c.sx, c.sy, c.sz)));
      }
      m.instanceMatrix.needsUpdate = true;
    }
    for (const f of this.puffs) {
      if (!f.pts.visible) continue;
      f.t += dt;
      const pos = f.pts.geometry.getAttribute('position') as THREE.BufferAttribute, slow = Math.exp(-2 * dt);
      for (let i = 0; i < MOTES; i++) {
        pos.setXYZ(i, pos.getX(i) + f.v[i * 3] * dt, pos.getY(i) + f.v[i * 3 + 1] * dt, pos.getZ(i) + f.v[i * 3 + 2] * dt);
        f.v[i * 3] *= slow; f.v[i * 3 + 2] *= slow;
      }
      pos.needsUpdate = true;
      f.mat.size = 0.9 + f.t * 1.4;
      f.mat.opacity = 0.55 * Math.max(0, 1 - f.t / 1.8);
      if (f.t > 1.8) f.pts.visible = false;
    }
  }
}
