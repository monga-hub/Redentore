import * as THREE from 'three';
import type { FogLayer } from './fog.ts';
import { ICONS } from './icons.ts';

/** Something on the map: a mob (alive unless `state === 'dead'`) or a fixed spot. */
export interface Pin { x: number; z: number; state?: string }

// Map paint per material role (level/materials.ts), muted like a parchment chart. Roles not
// listed (roofs, glass, props) are left off: the map shows floors and walls, not what covers them.
const PAINT: Partial<Record<string, string>> = {
  ground: '#4b4537', paving: '#7d7462', gravel: '#8d836c', grass: '#4d6234', soil: '#5a4430',
  hedge: '#3a5229', foliage: '#43592f', wood: '#6e5235', stone: '#b4a88c', stoneDark: '#6a6355',
  plaster: '#9a5e46', brick: '#87503b', mass: '#7a6a50', water: '#1c3442',
};
export const WATER = '#16303e'; // everything the level does not cover: the lagoon and the canal
/** A quest giver's "!" (offer, yellow) or gold "?" (ready) at (x, y), upright, in the overhead marks' colours (quest/npc.ts). */
export function glyph(c: CanvasRenderingContext2D, x: number, y: number, mark: string | undefined, px: number): void {
  c.save();
  c.font = `bold ${px}px Georgia, serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineWidth = 3;
  c.strokeStyle = '#000';
  c.fillStyle = mark === 'ready' ? '#ffb300' : '#ffe24a';
  const ch = mark === 'ready' ? '?' : '!';
  c.strokeText(ch, x, y);
  c.fillText(ch, x, y);
  c.restore();
}
/** A pin standing on a marked quest giver: the glyph takes its place. */
export const under = (q: Pin, npcs: Pin[]) => npcs.some((n) => Math.hypot(n.x - q.x, n.z - q.z) < 1);
export const PX = 4; // baked map texels per metre
const OVERHEAD = 3.6; // m: a slab starting this high is a ceiling or an upper floor, not on the map
const WALL = 1.6; // m: a box this tall reads as a wall (bright, outlined)
const ZOOMS = [1.4, 2, 2.8, 4]; // display px per metre; WoW's zoom steps
const HZ = 30; // redraws per second

/**
 * WoW-style minimap, top right (styled in index.html): a round window on a top-down chart of the
 * complex turned with the camera (what lies ahead on screen is up; the N on the rim follows the real north, +Z,
 * level/plan.ts), centred on the player with an arrow turning with their facing, the unexplored
 * parts under the fog of war; red dots for living enemies in range and a gold marker for the
 * current objective, pinned to the rim when far. The book button opens the big map (ui/worldMap.ts).
 * The chart is baked once from the level's floor and wall boxes into an offscreen canvas, so a
 * frame costs one drawImage plus a few dots, at most HZ times a second.
 */
export class Minimap {
  private el = document.getElementById('minimap')!;
  private name = this.el.querySelector<HTMLElement>('.name')!;
  private canvas = this.el.querySelector('canvas')!;
  private north = this.el.querySelector<HTMLElement>('.north')!;
  private ctx = this.canvas.getContext('2d')!;
  /** The baked chart, PX texels per metre; the big map draws it too. */
  readonly chart: HTMLCanvasElement;
  readonly x0: number; // world x/z of the chart's top-left texel
  readonly z0: number;
  private fog: FogLayer;
  private zoom = 1;
  private size = 0; // css px of the round window, read from the layout
  private wait = 0;
  private label = '';

  /** `root`: the level's meshes (after flush). `openMap`: the book button. */
  constructor(root: THREE.Object3D, fog: FogLayer, openMap: () => void) {
    this.fog = fog;
    const shapes = bake(root);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const s of shapes) for (const [x, z] of s.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const M = 40; // m of open water around the complex so the window never shows the chart's edge
    this.x0 = x0 - M;
    this.z0 = z0 - M;
    this.chart = document.createElement('canvas');
    this.chart.width = Math.ceil((x1 - x0 + 2 * M) * PX);
    this.chart.height = Math.ceil((z1 - z0 + 2 * M) * PX);
    const g = this.chart.getContext('2d')!;
    g.fillStyle = WATER;
    g.fillRect(0, 0, this.chart.width, this.chart.height);
    g.lineJoin = 'round';
    for (const s of shapes) {
      g.beginPath();
      for (const [x, z] of s.pts) g.lineTo((x - this.x0) * PX, (z - this.z0) * PX);
      g.closePath();
      g.fillStyle = s.color;
      g.fill();
      if (s.wall) { // a dark rim so walls and doorways read at a glance
        g.strokeStyle = 'rgba(0,0,0,.55)';
        g.lineWidth = 1.5;
        g.stroke();
      }
    }

    const [zin, zout, map] = this.el.querySelectorAll('button');
    map.innerHTML = ICONS.ui_map;
    map.addEventListener('click', openMap);
    zin.addEventListener('click', () => this.step(1));
    zout.addEventListener('click', () => this.step(-1));
    this.el.addEventListener('wheel', (e) => { e.preventDefault(); this.step(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  }

  private step(d: number): void {
    this.zoom = THREE.MathUtils.clamp(this.zoom + d, 0, ZOOMS.length - 1);
    this.wait = 0;
  }

  /** `facing`: player yaw; `view`: the camera's (both 0 = looking -Z, as in camera/). `foes`: every mob. `goal`: the objective, if any; `also`: side quests' pins. */
  update(dt: number, p: { x: number; z: number }, facing: number, view: number, label: string | undefined, foes: Pin[], goal?: Pin, also: Pin[] = [], npcs: Pin[] = []): void {
    if ((label ?? '') !== this.label) this.name.textContent = this.label = label ?? '';
    if ((this.wait -= dt) > 0) return;
    this.wait = 1 / HZ;

    const size = this.canvas.clientWidth, dpr = Math.min(devicePixelRatio, 2);
    if (size !== this.size || this.canvas.width !== Math.round(size * dpr)) {
      this.size = size;
      this.canvas.width = this.canvas.height = Math.round(size * dpr);
    }
    const c = this.ctx, r = size / 2, k = ZOOMS[this.zoom];
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, size, size);
    c.save();
    c.beginPath();
    c.arc(r, r, r, 0, Math.PI * 2);
    c.clip();
    // The chart, scaled so 1 m = k px, with the player's spot at the centre.
    c.imageSmoothingEnabled = true;
    c.save();
    c.translate(r, r);
    c.rotate(view); // the camera's heading up
    c.translate(-r, -r);
    c.drawImage(this.chart, (p.x - this.x0) * PX - r / k * PX, (p.z - this.z0) * PX - r / k * PX, size / k * PX, size / k * PX, 0, 0, size, size);
    this.fog.draw(c, p.x - r / k, p.z - r / k, k, size, size);
    c.restore();
    // Inner shade towards the rim, like a lens.
    const shade = c.createRadialGradient(r, r, r * 0.6, r, r, r);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,.45)');
    c.fillStyle = shade;
    c.fillRect(0, 0, size, size);

    const cos = Math.cos(view), sin = Math.sin(view);
    const at = (q: Pin) => { const dx = (q.x - p.x) * k, dz = (q.z - p.z) * k; return [r + dx * cos - dz * sin, r + dx * sin + dz * cos] as const; }; // turned like the chart
    this.north.style.transform = `translate(${-sin * (r + 1)}px, ${cos * (r + 1)}px)`; // +Z on the rim
    c.lineWidth = 1;
    c.strokeStyle = '#000';
    c.fillStyle = '#ff2a1a';
    for (const f of foes) {
      if (f.state === 'dead' || f === goal) continue;
      const [x, y] = at(f);
      if (Math.hypot(x - r, y - r) > r - 3) continue;
      c.beginPath();
      c.arc(x, y, 2.6, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    c.restore();

    for (const g of [...(goal ? [goal, ...also] : also).filter((q) => !under(q, npcs)), ...npcs]) { // gold diamond, or a quest giver's "!"/"?"; beyond the window it clings to the rim, pointing the way
      let [x, y] = at(g);
      const d = Math.hypot(x - r, y - r), max = r - 6;
      if (d > max) { x = r + (x - r) / d * max; y = r + (y - r) / d * max; }
      if (npcs.includes(g)) { glyph(c, x, y, g.state, 15); continue; }
      c.save();
      c.translate(x, y);
      c.rotate(Math.PI / 4);
      c.fillStyle = '#ffd200';
      c.strokeStyle = '#000';
      c.lineWidth = 1.5;
      c.fillRect(-4, -4, 8, 8);
      c.strokeRect(-4, -4, 8, 8);
      c.restore();
    }

    // The player: a bright arrow turning with their facing (up when facing where the camera looks).
    c.save();
    c.translate(r, r);
    c.rotate(view - facing);
    c.beginPath();
    c.moveTo(0, -8);
    c.lineTo(5.5, 6);
    c.lineTo(0, 3);
    c.lineTo(-5.5, 6);
    c.closePath();
    c.fillStyle = '#ffe9a8';
    c.strokeStyle = '#000';
    c.lineWidth = 1.5;
    c.stroke();
    c.fill();
    c.restore();
  }
}

interface Shape { pts: [number, number][]; color: string; wall: boolean; top: number }

/** Top-down footprints of the level's boxes and flat floors, lowest first so higher things paint over. */
function bake(root: THREE.Object3D): Shape[] {
  root.updateMatrixWorld(true);
  const shapes: Shape[] = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    const color = PAINT[o.userData.role as string];
    if (!m.isMesh || !color || !m.visible || (m as THREE.InstancedMesh).isInstancedMesh) return;
    let corners: [number, number, number][];
    const size = o.userData.size as [number, number, number] | undefined;
    if (size) {
      const [w, h, d] = size;
      corners = [[-w / 2, -h / 2, -d / 2], [w / 2, -h / 2, -d / 2], [w / 2, -h / 2, d / 2], [-w / 2, -h / 2, d / 2], [0, h / 2, 0]];
    } else if (m.geometry instanceof THREE.PlaneGeometry) {
      const { width: w, height: h } = m.geometry.parameters;
      corners = [[-w / 2, -h / 2, 0], [w / 2, -h / 2, 0], [w / 2, h / 2, 0], [-w / 2, h / 2, 0]];
    } else return;
    let bottom = Infinity, top = -Infinity;
    const pts: [number, number][] = [];
    for (const [i, c] of corners.entries()) {
      v.set(...c).applyMatrix4(m.matrixWorld);
      bottom = Math.min(bottom, v.y);
      top = Math.max(top, v.y);
      if (i < 4) pts.push([v.x, v.z]);
    }
    if (bottom > OVERHEAD) return;
    if (pts.every(([x, z]) => Math.abs(x) > 300 || Math.abs(z) > 300)) return; // the sea plane: that's the background
    const wall = top - bottom > WALL;
    shapes.push({ pts, top, wall, color: wall ? lighten(color) : color });
  });
  return shapes.sort((a, b) => a.top - b.top);
}

function lighten(hex: string): string {
  return `#${new THREE.Color(hex).lerp(new THREE.Color('#e8dcc0'), 0.35).getHexString()}`;
}
