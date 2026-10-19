import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { playSfx } from '../audio/engine.ts';
import type { World } from '../core/physics.ts';
import { beamTexture, discTexture } from '../fx/diabloFx.ts';
import type { Mob } from '../ui/target.ts';
import { Bag, ITEM, RARITY, roll, type Icon, type Rarity, type Tier } from './bag.ts';

// Loot on the ground, in both camera styles: a dead enemy throws its gold and items out in a
// small arc; gold glints, items (gear too) stand in a beam of their rarity's colour and every drop wears a
// name plate. Walking over one puts it in the bag (gold is pulled in from a little further),
// with a sound and a floating "+N oro". Everything is pooled: a fixed set of meshes shared by
// geometry and material, no lights, plates as plain DOM placed each frame.

const POOL = 40; // ponytail: drops alive at once; past it the oldest is recycled (lost), raise if a big fight leaves too many
const FLY = 0.55, ARC = 1.1, SPREAD = [0.5, 1.6]; // s in the air, m high, m from the corpse
const DELAY = 0.3; // s after the death: the corpse folds first
const REACH = 0.9, MAGNET = 2.4, PULL = 9; // m pickup radius, m gold reach, m/s the pull
const LABEL = 24; // m: plates further than this are hidden
const BEAM_H: Record<Rarity, number> = { comune: 0, noncomune: 1.4, raro: 2.2, epico: 3, leggendario: 4.5 };
const GOLD = 0xffcf4a;

/** Watched enemies, what tier of loot they drop, from which level's tables, and when their deaths drop nothing (a victory takes them all). */
export interface Dropper { all: readonly Mob[]; tier: Tier; level?: 1 | 2; quiet?: () => boolean }

interface Loose {
  gold: number; id: string; // gold > 0: a pile, else the item `id`
  mesh: THREE.Mesh; glint: THREE.Sprite; beam: THREE.Mesh; disc: THREE.Mesh; plate: HTMLElement;
  from: THREE.Vector3; to: THREE.Vector3; t: number; live: boolean; born: number; full: boolean;
}
interface Float { el: HTMLElement; t: number; n: number; gold: boolean }

const CSS = `
#loot { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 1; }
#loot .plate { position: absolute; left: 0; top: 0; translate: -50% -100%; white-space: nowrap; will-change: transform;
  padding: 1px 6px; font: bold 12px/16px Georgia, serif; text-shadow: 0 1px 2px #000;
  background: rgba(8,6,4,.72); border: 1px solid rgba(0,0,0,.9); border-radius: 3px; }
#loot .plate.gold { color: #ffd75e; font-size: 11px; line-height: 14px; background: rgba(8,6,4,.55); }
#loot .gain { position: absolute; left: 50%; top: 42%; translate: -50% 0; white-space: nowrap; font: bold 17px Georgia, serif;
  text-shadow: 0 0 3px #000, 0 2px 2px #000; animation: lootgain 1.3s ease-out forwards; }
#loot .gain.gold { color: #ffd75e; }
@keyframes lootgain { 0% { opacity: 0; transform: translateY(8px) scale(.7) } 15% { opacity: 1; transform: translateY(0) scale(1.1) }
  25% { transform: scale(1) } 75% { opacity: 1 } 100% { opacity: 0; transform: translateY(-46px) } }
body.touch #loot .plate { font-size: 11px; }
`;

// One small shape per kind of item, lying on the floor; all centred on their footprint.
function shapes(): Record<Icon, THREE.BufferGeometry> {
  const bead = (a: number) => new THREE.SphereGeometry(0.035, 6, 4).translate(Math.cos(a) * 0.14, 0.035, Math.sin(a) * 0.14);
  return {
    rosary: mergeGeometries([...Array.from({ length: 12 }, (_, i) => bead((i / 12) * Math.PI * 2)), new THREE.BoxGeometry(0.03, 0.02, 0.12).translate(0, 0.02, 0.22), new THREE.BoxGeometry(0.08, 0.02, 0.03).translate(0, 0.02, 0.24)]),
    candle: new THREE.CylinderGeometry(0.05, 0.055, 0.26, 8).translate(0, 0.13, 0),
    bone: mergeGeometries([new THREE.CapsuleGeometry(0.03, 0.26, 2, 6).rotateZ(Math.PI / 2).translate(0, 0.04, 0), new THREE.SphereGeometry(0.055, 6, 4).translate(-0.17, 0.05, 0), new THREE.SphereGeometry(0.055, 6, 4).translate(0.17, 0.05, 0)]),
    relic: new THREE.BoxGeometry(0.22, 0.16, 0.14).translate(0, 0.08, 0),
    medal: new THREE.CylinderGeometry(0.09, 0.09, 0.02, 12).translate(0, 0.01, 0),
    vial: mergeGeometries([new THREE.SphereGeometry(0.07, 8, 6).translate(0, 0.07, 0), new THREE.CylinderGeometry(0.025, 0.025, 0.09, 6).translate(0, 0.17, 0)]),
    skull: new THREE.SphereGeometry(0.1, 8, 6).scale(1, 0.9, 1.15).translate(0, 0.09, 0),
    nail: new THREE.ConeGeometry(0.03, 0.34, 6).rotateZ(Math.PI / 2).translate(0, 0.03, 0),
    // gear, lying folded or in pairs
    helm: new THREE.SphereGeometry(0.13, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.9, 1.15),
    shoulders: mergeGeometries([-1, 1].map((s) => new THREE.SphereGeometry(0.09, 8, 5).scale(1, 0.55, 1).translate(s * 0.1, 0.04, 0))),
    chest: new THREE.BoxGeometry(0.34, 0.05, 0.4).translate(0, 0.025, 0),
    gloves: mergeGeometries([-1, 1].map((s) => new THREE.BoxGeometry(0.1, 0.04, 0.16).rotateY(s * 0.3).translate(s * 0.08, 0.02, 0))),
    legs: mergeGeometries([-1, 1].map((s) => new THREE.BoxGeometry(0.1, 0.05, 0.38).translate(s * 0.06, 0.025, 0))),
    boots: mergeGeometries([-1, 1].map((s) => new THREE.BoxGeometry(0.09, 0.14, 0.2).translate(s * 0.07, 0.07, 0))),
    club: mergeGeometries([new THREE.CylinderGeometry(0.025, 0.03, 0.4, 6).rotateZ(Math.PI / 2).translate(-0.05, 0.03, 0), new THREE.SphereGeometry(0.07, 8, 6).scale(1.4, 1, 1).translate(0.2, 0.06, 0)]),
    amulet: mergeGeometries([new THREE.TorusGeometry(0.1, 0.012, 5, 16).rotateX(Math.PI / 2).translate(0, 0.012, 0), new THREE.SphereGeometry(0.045, 4, 2).translate(0, 0.03, 0.12)]),
    ring: new THREE.TorusGeometry(0.06, 0.018, 6, 14).rotateX(Math.PI / 2).translate(0, 0.018, 0),
  };
}
const TINT: Record<Icon, number> = {
  rosary: 0x7a4a26, candle: 0xe8dcc0, bone: 0xd8ccae, relic: 0xb8b8c0, medal: 0xc9a45c, vial: 0x9ad0c0, skull: 0xe0d0a8, nail: 0x6a5040,
  helm: 0x6a5a48, shoulders: 0x7a6a50, chest: 0x6a5a48, gloves: 0x8a7a60, legs: 0x5a4a38, boots: 0x4a3a28, club: 0xd8ccae, amulet: 0xc9a45c, ring: 0xc9a45c,
};
const METAL = new Set<Icon>(['relic', 'medal', 'amulet', 'ring']);

// A four-point star for the gold's glint.
function star(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.15, 'rgba(255,255,255,0.5)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, d = i % 2 ? 6 : 32;
    g.lineTo(32 + Math.cos(a) * d, 32 + Math.sin(a) * d);
  }
  g.fill();
  return new THREE.CanvasTexture(c);
}

export class Drops {
  readonly root = new THREE.Group();
  private pool: Loose[] = [];
  private tracks: { mob: Mob; tier: Tier; level: 1 | 2; quiet?: () => boolean; dead: boolean; t: number }[];
  private layer = document.createElement('div');
  private floats: Float[] = [];
  private time = 0;
  private geo: Record<Icon, THREE.BufferGeometry>;
  private mats: Record<Icon, THREE.MeshStandardMaterial>;
  private beamMats: Record<Rarity, THREE.MeshBasicMaterial>;
  private discMats: Record<Rarity, THREE.MeshBasicMaterial>;
  private pile: THREE.BufferGeometry;
  private goldMat: THREE.Material;
  private p = new THREE.Vector3();

  private readonly world: World;
  private readonly bag: Bag;
  private readonly camera: THREE.Camera;
  /** Asked at each death that drops: an extra item id to throw out too (Fra' Zuane's corona, main.ts). */
  extra?: () => string | undefined;

  constructor(droppers: Dropper[], world: World, bag: Bag, camera: THREE.Camera) {
    this.world = world;
    this.bag = bag;
    this.camera = camera;
    this.root.name = 'loot';
    this.tracks = droppers.flatMap((d) => d.all.map((mob) => ({ mob, tier: d.tier, level: d.level ?? 1, quiet: d.quiet, dead: mob.state === 'dead', t: 0 }))); // the dead of a loaded game drop nothing

    this.geo = shapes();
    this.mats = Object.fromEntries(Object.entries(TINT).map(([k, c]) => [k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: METAL.has(k as Icon) ? 0.8 : 0.1, emissive: c, emissiveIntensity: 0.12 })])) as Record<Icon, THREE.MeshStandardMaterial>;
    const coin = new THREE.CylinderGeometry(0.075, 0.075, 0.018, 10);
    const pile = this.pile = mergeGeometries([0, 1, 2, 3, 4].map((i) => coin.clone().rotateX(i ? 0.25 : 0).rotateY(i).translate(i ? Math.cos(i * 1.9) * 0.1 : 0, 0.009 + (i ? 0 : 0.02), i ? Math.sin(i * 1.9) * 0.1 : 0)));
    const goldMat = this.goldMat = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.9, roughness: 0.3, emissive: 0x8a5a00, emissiveIntensity: 0.35 });
    const beamTex = beamTexture(), discTex = discTexture(), starTex = star();
    const glow = (map: THREE.Texture, c: string) => new THREE.MeshBasicMaterial({ map, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
    this.beamMats = Object.fromEntries(Object.entries(RARITY).map(([k, r]) => [k, glow(beamTex, r.color)])) as Record<Rarity, THREE.MeshBasicMaterial>;
    this.discMats = Object.fromEntries(Object.entries(RARITY).map(([k, r]) => [k, glow(discTex, r.color)])) as Record<Rarity, THREE.MeshBasicMaterial>;
    const beamGeo = new THREE.CylinderGeometry(0.07, 0.12, 1, 10, 1, true).translate(0, 0.5, 0);
    const discGeo = new THREE.CircleGeometry(0.45, 20).rotateX(-Math.PI / 2);
    const starMat = new THREE.SpriteMaterial({ map: starTex, color: 0xfff0b0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.layer.id = 'loot';
    document.body.append(this.layer);
    for (let i = 0; i < POOL; i++) {
      const l: Loose = {
        gold: 0, id: '', mesh: new THREE.Mesh(pile, goldMat), glint: new THREE.Sprite(starMat), beam: new THREE.Mesh(beamGeo), disc: new THREE.Mesh(discGeo),
        plate: document.createElement('span'), from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, live: false, born: 0, full: false,
      };
      l.beam.renderOrder = l.disc.renderOrder = l.glint.renderOrder = 2;
      l.mesh.visible = l.glint.visible = l.beam.visible = l.disc.visible = false;
      l.plate.className = 'plate';
      l.plate.style.visibility = 'hidden';
      this.layer.append(l.plate);
      this.root.add(l.mesh, l.glint, l.beam, l.disc);
      this.pool.push(l);
    }
  }

  /** Throw `gold` (or the item `id`) out of (x, y, z), `far` times the usual spread. */
  spawn(x: number, y: number, z: number, gold: number, id = '', far = 1): void {
    const l = this.pool.find((d) => !d.live) ?? this.pool.reduce((a, d) => (d.born < a.born ? d : a));
    const a = Math.random() * Math.PI * 2;
    let r = (SPREAD[0] + Math.random() * (SPREAD[1] - SPREAD[0])) * far;
    const feet = y + 0.3;
    if (this.world.blocked(x + Math.cos(a) * r, z + Math.sin(a) * r, feet, 0.15)) r = 0.2; // not into a wall
    const tx = x + Math.cos(a) * r, tz = z + Math.sin(a) * r, g = this.world.groundAt(tx, tz, feet);
    Object.assign(l, { gold, id, t: -DELAY - Math.random() * 0.15, live: true, born: this.time, full: false });
    l.from.set(x, y + 1, z);
    l.to.set(tx, Number.isFinite(g) ? g : y, tz);
    const item = ITEM.get(id);
    l.mesh.geometry = item ? this.geo[item.icon] : this.pile;
    l.mesh.material = item ? this.mats[item.icon] : this.goldMat;
    if (item) {
      l.beam.material = this.beamMats[item.rarity];
      l.disc.material = this.discMats[item.rarity];
      l.beam.scale.set(1, BEAM_H[item.rarity] || 0.001, 1);
    }
    l.mesh.rotation.set(0, Math.random() * Math.PI * 2, 0);
    l.plate.textContent = item ? item.name : `${gold} oro`;
    l.plate.className = item ? 'plate' : 'plate gold';
    l.plate.style.color = item ? RARITY[item.rarity].color : '';
  }
  /**
   * Per frame, after the enemies moved (and before a victory's: its dead drop nothing, the boss's own loot aside).
   * Returns what to tell the player (a full bag).
   */
  update(dt: number, hero: { x: number; y: number; z: number }): string[] {
    this.time += dt;
    for (const k of this.tracks) {
      const dead = k.mob.state === 'dead';
      if (dead && !k.dead && !k.quiet?.()) {
        const d = roll(k.tier, Math.random, k.level), m = k.mob, far = k.tier === 'boss' ? 2.4 : k.tier === 'elite' ? 1.5 : 1; // out from under a big body
        for (const g of d.gold) this.spawn(m.x, m.y, m.z, g, '', far);
        for (const id of d.items) this.spawn(m.x, m.y, m.z, 0, id, far);
        const x = this.extra?.();
        if (x) this.spawn(m.x, m.y, m.z, 0, x, far);
      }
      k.dead = dead;
    }
    const out: string[] = [];
    for (const l of this.pool) if (l.live && this.step(l, dt, hero)) out.push('La borsa è piena');
    this.place();
    return out;
  }

  /** Fly, lie, glint; picked up when the hero is on it. True the first time a full bag refuses it. */
  private step(l: Loose, dt: number, h: { x: number; y: number; z: number }): boolean {
    l.t += dt;
    const item = ITEM.get(l.id), on = l.t >= 0;
    l.mesh.visible = on;
    l.glint.visible = on && !item;
    l.beam.visible = l.disc.visible = on && !!item && l.t > FLY && BEAM_H[item.rarity] > 0;
    if (!on) return false;
    const k = Math.min(l.t / FLY, 1), m = l.mesh;
    m.position.lerpVectors(l.from, l.to, k);
    m.position.y += Math.sin(Math.PI * k) * ARC;
    if (k < 1) m.rotation.x = l.t * 14; // tumbling in the air
    else m.rotation.x = 0;
    const flat = Math.hypot(h.x - m.position.x, h.z - m.position.z), level = Math.abs(h.y - l.to.y) < 1.6;
    if (k === 1 && !item && level && flat < MAGNET) { // gold slides to the hero's feet
      const s = Math.min(1, (PULL * dt) / Math.max(flat, 1e-3));
      l.to.x = m.position.x += (h.x - m.position.x) * s;
      l.to.z = m.position.z += (h.z - m.position.z) * s;
    }
    l.beam.position.copy(l.to);
    l.disc.position.set(l.to.x, l.to.y + 0.03, l.to.z);
    const tw = Math.sin(this.time * 5 + l.born * 13);
    l.glint.position.set(m.position.x, m.position.y + 0.12, m.position.z);
    l.glint.scale.setScalar(0.18 + Math.max(0, tw) * 0.32);
    if (k < 1 || !level || flat > REACH) { l.full = false; return false; }
    if (item && !this.bag.add(l.id)) { const first = !l.full; l.full = true; return first; }
    if (!item) this.bag.gold += l.gold;
    playSfx('loot', null, { ui: true, rate: item ? 1.1 : 1.7, gain: item ? 0.6 : 0.4 });
    this.gain(item ? `+ ${item.name}` : '', l.gold, item ? RARITY[item.rarity].color : '');
    this.free(l);
    return false;
  }

  private free(l: Loose): void {
    l.live = false;
    l.mesh.visible = l.glint.visible = l.beam.visible = l.disc.visible = false;
    l.plate.style.visibility = 'hidden';
  }

  /** A floating "+N oro" (summed while it is fresh) or "+ item" over the hero. */
  private gain(text: string, gold: number, color: string): void {
    const fresh = gold ? this.floats.find((f) => f.gold && this.time - f.t < 0.5) : undefined;
    const f = fresh ?? { el: document.createElement('div'), t: this.time, n: 0, gold: gold > 0 };
    if (!fresh) {
      f.el.className = gold ? 'gain gold' : 'gain';
      f.el.style.color = color;
      if (!gold) f.el.style.marginTop = `${-22 * this.floats.filter((x) => !x.gold && this.time - x.t < 1).length}px`; // stacked, not overlaid
      f.el.addEventListener('animationend', () => { f.el.remove(); this.floats.splice(this.floats.indexOf(f), 1); });
      this.layer.append(f.el);
      this.floats.push(f);
    }
    f.n += gold;
    f.el.textContent = gold ? `+${f.n} oro` : text;
  }

  /** Plates follow their drop on screen; far, airborne or behind-camera ones hide. */
  private place(): void {
    const c = this.camera.position;
    for (const l of this.pool) {
      if (!l.live) continue;
      const m = l.mesh.position;
      this.p.set(m.x, m.y + (ITEM.has(l.id) ? 0.55 : 0.35), m.z).project(this.camera);
      const hide = l.t < FLY || this.p.z > 1 || Math.hypot(m.x - c.x, m.z - c.z) > LABEL + Math.max(0, c.y - m.y);
      l.plate.style.visibility = hide ? 'hidden' : 'visible';
      if (!hide) l.plate.style.transform = `translate3d(${(((this.p.x + 1) / 2) * innerWidth).toFixed(1)}px, ${(((1 - this.p.y) / 2) * innerHeight).toFixed(1)}px, 0)`;
    }
  }

  /** Every drop on the ground (debug and checks). */
  get loose(): { x: number; y: number; z: number; gold: number; id: string }[] {
    return this.pool.filter((l) => l.live).map((l) => ({ x: l.to.x, y: l.to.y, z: l.to.z, gold: l.gold, id: l.id }));
  }
}
