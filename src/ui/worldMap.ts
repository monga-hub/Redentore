import type { Discovery } from '../core/discovery.ts';
import type { Area } from '../level/builder.ts';
import type { FogLayer } from './fog.ts';
import { PX, WATER, type Minimap, type Pin } from './minimap.ts';

// The big map, WoW style: M (or the book button on the minimap) opens the whole complex in a
// framed overlay, north up, under the same fog as the minimap. Discovered places carry their
// names, the player shows as an arrow and the objective as a gold diamond. The game pauses while
// it is open; M, Esc, a click or a tap close it. Its DOM is styled here, like ui/menu.ts.

const CSS = `
#worldmap { position: fixed; inset: 0; z-index: 15; display: none; align-items: center; justify-content: center;
  background: rgba(0,0,0,.6); font: 15px/1.35 Georgia, serif; color: #f3e2b0; user-select: none; cursor: pointer; }
#worldmap.show { display: flex; }
#worldmap .panel { position: relative; box-sizing: border-box; display: flex; flex-direction: column;
  width: calc(100vw - 24px - env(safe-area-inset-left) - env(safe-area-inset-right)); height: calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  max-width: 900px; padding: 22px 12px 10px; border: 3px solid transparent; border-radius: 8px; background: var(--panel); box-shadow: var(--panel-shadow); }
#worldmap h2 { position: absolute; left: 50%; top: -14px; transform: translateX(-50%); margin: 0; padding: 4px 22px; white-space: nowrap;
  font: bold 15px/20px Georgia, serif; color: #ffd75e; letter-spacing: 1px; text-shadow: 0 1px 2px #000;
  border: 2px solid transparent; border-radius: 4px; background: linear-gradient(#4a3420, #140e08) padding-box, var(--gilt) border-box; box-shadow: 0 0 0 1px #000, 0 3px 8px rgba(0,0,0,.6); }
#worldmap .x { position: absolute; right: 6px; top: 6px; z-index: 1; width: 30px; height: 30px; padding: 0; cursor: pointer; font: bold 18px/1 system-ui, sans-serif;
  color: #f3e2b0; background: linear-gradient(#7a1a10, #3a0805); border: 1px solid #c9a45c; border-radius: 4px; }
#worldmap canvas { flex: 1; min-height: 0; width: 100%; border: 1px solid #000; border-radius: 3px;
  box-shadow: 0 0 0 1px #4a3a26, inset 0 0 20px #000; }
#worldmap .foot { display: flex; justify-content: space-between; gap: 12px; padding-top: 6px; font: 12px/16px system-ui, sans-serif; color: #c9b48a; }
#worldmap .foot b { color: #ffd75e; font-weight: normal; }
#worldmap .foot i { font-style: normal; }
body.touch #worldmap .foot i { display: none; }
`;

/** What the map shows of the game when it opens. */
export interface MapView { x: number; z: number; facing: number; area?: string; goal?: Pin }

export class WorldMap {
  private el = document.createElement('div');
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private place: HTMLElement;
  private found: HTMLElement;
  private bounds: { x0: number; x1: number; z0: number; z1: number };
  private names: number; // distinct place names on the level
  private v: MapView | null = null;
  private d: Discovery;
  private fog: FogLayer;
  private chart: Minimap;
  private areas: readonly Area[];

  constructor(d: Discovery, fog: FogLayer, chart: Minimap, areas: readonly Area[]) {
    this.d = d;
    this.fog = fog;
    this.chart = chart;
    this.areas = [...areas].sort((a, b) => size(b) - size(a)); // big places label first, small ones fit around them
    const M = 8; // m of shore around the areas
    this.bounds = {
      x0: Math.min(...areas.map((a) => a.x0)) - M, x1: Math.max(...areas.map((a) => a.x1)) + M,
      z0: Math.min(...areas.map((a) => a.z0)) - M, z1: Math.max(...areas.map((a) => a.z1)) + M,
    };
    this.names = new Set(areas.map((a) => a.label)).size;

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.el.id = 'worldmap';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-label', 'Mappa');
    this.el.innerHTML = `<div class="panel"><h2>Giudecca · Redentore e Zitelle</h2>
      <button class="x" aria-label="Chiudi mappa">✕</button><canvas></canvas>
      <div class="foot"><span class="place"></span><span class="found"></span><span><i>M · Esc · </i>tocca per chiudere</span></div></div>`;
    this.canvas = this.el.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.place = this.el.querySelector('.place')!;
    this.found = this.el.querySelector('.found')!;
    this.el.addEventListener('click', () => this.close());
    addEventListener('keydown', (e) => { // capture: while the map is up, game keys stay out of it
      if (!this.v) return;
      e.stopPropagation();
      if ((e.code === 'KeyM' || e.code === 'Escape') && !e.repeat) this.close();
    }, true);
    addEventListener('resize', () => this.draw());
    document.body.append(this.el);
  }

  get open(): boolean {
    return this.v !== null;
  }

  show(v: MapView): void {
    if (document.pointerLockElement) document.exitPointerLock();
    this.v = v;
    this.el.classList.add('show');
    this.el.querySelector<HTMLElement>('.x')!.focus({ preventScroll: true });
    this.draw();
  }

  close(): void {
    this.v = null;
    this.el.classList.remove('show');
  }

  private draw(): void {
    const v = this.v;
    if (!v) return;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, dpr = Math.min(devicePixelRatio, 2);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const c = this.ctx, b = this.bounds;
    // fit the complex, centred, 1 m = k px
    const k = Math.min(w / (b.x1 - b.x0), h / (b.z1 - b.z0));
    const ox = (b.x0 + b.x1) / 2 - w / 2 / k, oz = (b.z0 + b.z1) / 2 - h / 2 / k;
    const at = (x: number, z: number) => [(x - ox) * k, (z - oz) * k] as const;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = WATER;
    c.fillRect(0, 0, w, h);
    c.imageSmoothingEnabled = true;
    const m = this.chart;
    c.drawImage(m.chart, (ox - m.x0) * PX, (oz - m.z0) * PX, w / k * PX, h / k * PX, 0, 0, w, h);
    this.fog.draw(c, ox, oz, k, w, h);
    const shade = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,.5)');
    c.fillStyle = shade;
    c.fillRect(0, 0, w, h);

    // Names of the discovered places, big places first; a name that would overlap one already drawn is left off.
    const font = Math.round(Math.min(15, Math.max(10, k * 2.4)));
    c.font = `bold ${font}px Georgia, serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    const drawn: [number, number, number, number][] = [];
    const known = new Set<string>();
    for (const a of this.areas) {
      if (!this.d.discovered(a)) continue;
      known.add(a.label);
      const [x, y] = at((a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2);
      const hw = c.measureText(a.label).width / 2 + 3, hh = font * 0.7;
      if (drawn.some(([l, t, r, bt]) => x - hw < r && x + hw > l && y - hh < bt && y + hh > t)) continue;
      drawn.push([x - hw, y - hh, x + hw, y + hh]);
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(0,0,0,.85)';
      c.strokeText(a.label, x, y);
      c.fillStyle = '#ffd75e';
      c.fillText(a.label, x, y);
    }

    if (v.goal) { // gold diamond, as on the minimap
      const [x, y] = at(v.goal.x, v.goal.z);
      c.save();
      c.translate(x, y);
      c.rotate(Math.PI / 4);
      c.fillStyle = '#ffd200';
      c.strokeStyle = '#000';
      c.lineWidth = 1.5;
      c.fillRect(-5, -5, 10, 10);
      c.strokeRect(-5, -5, 10, 10);
      c.restore();
    }
    const [px, py] = at(v.x, v.z); // the player: the minimap's arrow, a size up, with a glow to find it at a glance
    c.save();
    c.translate(px, py);
    c.fillStyle = 'rgba(255,233,168,.25)';
    c.beginPath();
    c.arc(0, 0, 14, 0, Math.PI * 2);
    c.fill();
    c.rotate(-v.facing);
    c.beginPath();
    c.moveTo(0, -11);
    c.lineTo(7.5, 8);
    c.lineTo(0, 4);
    c.lineTo(-7.5, 8);
    c.closePath();
    c.fillStyle = '#ffe9a8';
    c.strokeStyle = '#000';
    c.lineWidth = 2;
    c.stroke();
    c.fill();
    c.restore();

    this.place.replaceChildren(...(v.area ? ['Sei in: ', Object.assign(document.createElement('b'), { textContent: v.area })] : []));
    this.found.textContent = `Luoghi scoperti: ${known.size}/${this.names}`;
  }
}

const size = (a: Area) => (a.x1 - a.x0) * (a.z1 - a.z0);
