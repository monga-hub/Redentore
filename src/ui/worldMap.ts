import type { Discovery } from '../core/discovery.ts';
import type { Area } from '../level/builder.ts';
import { FogLayer } from './fog.ts';
import { PX, glyph, marks, type Minimap, type Pin, type Shape } from './minimap.ts';

// The big map, WoW style, inked on parchment: M (or the book button on the minimap) opens the map of the level the player
// stands in, north up, under the fog of what has been seen (blank paper where nobody has been). The "Giudecca" button,
// the wheel or a pinch out step back to the whole Giudecca, its three levels outlined; a tap (or the wheel or a pinch in)
// on one opens its map. Discovered places carry their names, the player shows as an arrow and the quests carry the
// minimap's marks (ui/minimap.ts marks). The game pauses while it is open; M, Esc, a click or a tap on a level's map close
// it. Its DOM is styled here, like ui/menu.ts.
// WoW's quest log flanks it: the shown level's discovered places on the left (the levels themselves on the Giudecca), the
// quests running on the right (gold once ready to hand in); tapping one tints its place or rings the spot the quest
// points at, turning to that level's map. Both columns fold away. Two fingers (or the wheel) zoom a level's map round the
// pinch, one finger (or the mouse) drags it. All the art is drawn here from the level's own footprints, nothing painted.

const CSS = `
#worldmap { position: fixed; inset: 0; z-index: 15; display: none; align-items: center; justify-content: center;
  background: rgba(0,0,0,.6); font: 15px/1.35 Georgia, serif; color: #f3e2b0; user-select: none; cursor: pointer; }
#worldmap.show { display: flex; }
#worldmap .panel { position: relative; box-sizing: border-box; display: flex; flex-direction: column;
  width: calc(100vw - 24px - env(safe-area-inset-left) - env(safe-area-inset-right)); height: calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  max-width: 1100px; padding: 42px 12px 8px; border: 3px solid transparent; border-radius: 8px; background: var(--panel); box-shadow: var(--panel-shadow); }
#worldmap .x, #worldmap .up { position: absolute; top: 6px; z-index: 1; height: 30px; padding: 0 8px; cursor: pointer; font: bold 14px/1 Georgia, serif;
  color: #f3e2b0; border: 1px solid #c9a45c; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,.5); }
#worldmap .x { right: 12px; width: 30px; padding: 0; font: bold 18px/1 system-ui, sans-serif; background: linear-gradient(#7a1a10, #3a0805); }
#worldmap .up { left: 12px; background: linear-gradient(#5a4128, #241709); }
#worldmap .up[hidden] { display: none; }
#worldmap .body { flex: 1; min-height: 0; display: flex; gap: 8px; }
#worldmap .col { flex: none; width: 190px; overflow-y: auto; overscroll-behavior: contain; cursor: default;
  border: 2px solid transparent; border-radius: 4px; background: linear-gradient(rgba(30,22,14,.92), rgba(10,7,4,.95)) padding-box, var(--gilt) border-box; }
#worldmap .col:not([open]) { width: auto; }
#worldmap .col summary { position: sticky; top: 0; z-index: 1; background: #1c140c; list-style: none; padding: 4px 8px; cursor: pointer; font: bold 13px/18px Georgia, serif; color: #ffd75e; text-shadow: 0 1px 2px #000; white-space: nowrap; }
#worldmap .col summary::-webkit-details-marker { display: none; }
#worldmap .col[open] summary { border-bottom: 1px solid #5e4422; }
#worldmap .col:not([open]) summary { writing-mode: vertical-rl; padding: 8px 2px; }
#worldmap .col ul { margin: 0; padding: 2px 0; list-style: none; }
#worldmap .col li { padding: 3px 8px; cursor: pointer; font: 12px/15px Georgia, serif; color: #e9d6b0; border-left: 3px solid transparent; }
#worldmap .col li:hover { background: rgba(255,215,94,.08); }
#worldmap .col li.sel { background: rgba(255,215,94,.16); border-left-color: #ffd75e; }
#worldmap .col li.here { color: #fff2c0; }
#worldmap .col li b { display: block; color: #ffd200; font-size: 13px; font-weight: bold; }
#worldmap .col li small { display: block; font-size: 11px; color: #c9b48a; }
#worldmap .col li.ready small { color: #ffd75e; }
#worldmap .col li.none { cursor: default; color: #8a7a5c; font-style: italic; }
@media (max-width: 900px), (max-height: 500px) { #worldmap .col { width: 140px; } #worldmap .col li b { font-size: 12px; } }
#worldmap canvas { touch-action: none; flex: 1; min-height: 0; min-width: 0; width: 100%; border: 2px solid #1a1108; border-radius: 4px;
  box-shadow: 0 0 0 1px #6a4f2c, 0 2px 10px rgba(0,0,0,.7); }
#worldmap .foot { display: flex; justify-content: space-between; gap: 12px; padding-top: 6px; font: 12px/16px system-ui, sans-serif; color: #c9b48a; }
#worldmap .foot b { color: #ffd75e; font-weight: normal; }
#worldmap .foot i { font-style: normal; }
body.touch #worldmap .foot i { display: none; }
`;

/** What the map shows of the game when it opens. */
export interface MapView {
  x: number; z: number; facing: number; area?: string; goal?: Pin; npcs?: Pin[];
  /** The side quests' pins, as the minimap's `also`. */
  also?: Pin[];
  /** The quest log: the quests running and the spot each points at (objective, else giver). */
  quests?: { title: string; line: string; ready: boolean; at?: { x: number; z: number } }[];
  /** The quest's level: the map that opens when the player stands nowhere named (on the water). */
  level?: 1 | 2 | 3;
}

/** Each zone's level (level/index.ts); the Redentore's are the rest. */
const LEVELS = new Map([['giudecca', 2], ['zitelle', 2], ['punta', 3], ['sangiorgio', 3]]);
const lvl = (a: Area) => LEVELS.get(a.zone) ?? 1;
/** The maps: 0 the whole Giudecca, then each level's. */
const MAPS = ['La Giudecca', 'Il Redentore', 'Santa Croce e le Zitelle', 'La Punta e San Giorgio'];

const ROT = Math.PI; // north (+Z, level/plan.ts) up and east (-X) right, as a paper map: the world turned half round
const TOP = 46; // px kept for the banner over the map
const PAPER = [138, 117, 76]; // the parchment's own tone: the lagoon, the unknown and the fog
const INK = '#33240f';
// Floors in stone, gardens in green, the church floors rose like WoW's special rooms; anything else in stone.
const STONE: Partial<Record<string, string>> = { grass: '#8d9658', hedge: '#7d8a4e', foliage: '#848f53', soil: '#a68d5c', water: '#7d8c80', wood: '#b49b6d' };
const SACRED = /chiesa|basilica|aula|altar|presbiterio|coro|crociera|cappell|santuario|cupola/i;
const LABEL = (px: number) => `bold ${px}px Georgia, 'Times New Roman', serif`;

export class WorldMap {
  private el = document.createElement('div');
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private place: HTMLElement;
  private found: HTMLElement;
  private up: HTMLButtonElement;
  private all: Box[]; // per map: the area it frames (0 the whole Giudecca)
  private v: MapView | null = null;
  private d: Discovery;
  private fog: FogLayer; // its own, in the paper's tone
  private chart: Minimap;
  private sheet?: HTMLCanvasElement; // the inked parchment chart, baked on the first opening
  private paper?: HTMLCanvasElement; // the sheet's mottle
  private areas: readonly Area[];
  private places: HTMLElement;
  private log: HTMLElement;
  private map = 1; // the map shown
  private hover = 0; // the level under the mouse on the Giudecca
  private sel?: { area: string } | { quest: number }; // what the log has highlighted on the map
  private zoom = 1; // 1: the whole map fits
  private push = 1; // the wheel's or pinch's zoom past the map's limits: far enough and the map steps out (or in)
  private c = { x: 0, z: 0 }; // m: the spot at the map's centre
  private o = { x: 0, y: 0 }; // px: where on the canvas that spot sits
  private k = 1; // px per m, as last drawn
  private touches = new Map<number, { x: number; y: number }>();
  private moved = 0; // px dragged since the press: past a few, the release is no tap

  constructor(d: Discovery, chart: Minimap, areas: readonly Area[]) {
    this.d = d;
    this.fog = new FogLayer(d, PAPER);
    this.chart = chart;
    this.areas = [...areas].sort((a, b) => size(b) - size(a)); // big places label first, small ones fit around them
    const M = 8; // m of shore around the areas
    this.all = [0, 1, 2, 3].map((m) => {
      const as = areas.filter((a) => !m || lvl(a) === m);
      return { x0: Math.min(...as.map((a) => a.x0)) - M, x1: Math.max(...as.map((a) => a.x1)) + M, z0: Math.min(...as.map((a) => a.z0)) - M, z1: Math.max(...as.map((a) => a.z1)) + M };
    });

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.el.id = 'worldmap';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-label', 'Mappa');
    this.el.innerHTML = `<div class="panel"><button class="up" aria-label="Mappa della Giudecca">◂ Giudecca</button>
      <button class="x" aria-label="Chiudi mappa">✕</button><div class="body">
      <details class="col" open><summary>Luoghi</summary><ul class="places"></ul></details><canvas></canvas>
      <details class="col" open><summary>Missioni</summary><ul class="log"></ul></details></div>
      <div class="foot"><span class="place"></span><span class="found"></span><span><i>M · Esc · </i>tocca per chiudere</span></div></div>`;
    this.canvas = this.el.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.place = this.el.querySelector('.place')!;
    this.found = this.el.querySelector('.found')!;
    this.places = this.el.querySelector('.places')!;
    this.log = this.el.querySelector('.log')!;
    this.up = this.el.querySelector('.up')!;
    this.up.addEventListener('click', (e) => { e.stopPropagation(); this.turn(0); });
    this.el.addEventListener('click', () => this.close());
    for (const col of this.el.querySelectorAll('.col')) {
      col.addEventListener('click', (e) => { // a tap in the log picks (or drops) a highlight, or opens a level; the map stays open
        e.stopPropagation();
        const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-k]');
        if (!li) return;
        const k = li.dataset.k!;
        if (k.startsWith('m')) return this.turn(+k.slice(1));
        const pick = k.startsWith('q') ? { quest: +k.slice(1) } : { area: k.slice(1) };
        this.sel = this.key() === k ? undefined : pick;
        const p = this.spot(), m = p && this.mapAt(p.x, p.z);
        if (m && m !== this.map) this.turn(m, true); // the pick lies on another level: turn to its map
        if (p && this.zoom > 1) this.c = this.clamp(p); // zoomed in: bring the pick into view
        this.list();
        this.draw();
      });
      col.addEventListener('toggle', () => this.draw()); // the canvas widens or narrows
    }
    addEventListener('keydown', (e) => { // capture: while the map is up, game keys stay out of it
      if (!this.v) return;
      e.stopPropagation();
      if ((e.code === 'KeyM' || e.code === 'Escape') && !e.repeat) this.close();
    }, true);
    addEventListener('resize', () => this.draw());
    const cv = this.canvas;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      if (!this.touches.size) this.moved = 0;
      this.touches.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    });
    cv.addEventListener('pointermove', (e) => {
      const t = this.touches.get(e.pointerId);
      if (!t) { // the mouse over the Giudecca: outline the level under it
        const h = this.map ? 0 : this.levelAt(e.offsetX, e.offsetY);
        if (h !== this.hover) { this.hover = h; cv.style.cursor = h ? 'zoom-in' : ''; this.draw(); }
        return;
      }
      const [a, b] = [...this.touches.values()], p = { x: e.offsetX, y: e.offsetY };
      if (b) { // pinch: the zoom follows the fingers' spread round their midpoint, which pans as they move
        const o = a === t ? b : a, d0 = Math.hypot(t.x - o.x, t.y - o.y), d1 = Math.hypot(p.x - o.x, p.y - o.y);
        this.pan((p.x - t.x) / 2, (p.y - t.y) / 2);
        if (d0 > 0) this.zoomAt(d1 / d0, (p.x + o.x) / 2, (p.y + o.y) / 2);
      } else this.pan(p.x - t.x, p.y - t.y);
      this.moved += Math.hypot(p.x - t.x, p.y - t.y);
      this.touches.set(e.pointerId, p);
      this.draw();
    });
    for (const ev of ['pointerup', 'pointercancel'] as const) cv.addEventListener(ev, (e) => this.touches.delete(e.pointerId));
    cv.addEventListener('click', (e) => {
      if (this.moved > 8) return e.stopPropagation(); // a drag or pinch is no tap to close
      const m = this.map ? 0 : this.levelAt(e.offsetX, e.offsetY);
      if (m) { e.stopPropagation(); this.turn(m); } // a level tapped on the Giudecca opens; elsewhere a tap closes
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomAt(Math.exp(-e.deltaY / 300), e.offsetX, e.offsetY);
      this.draw();
    }, { passive: false });
    document.body.append(this.el);
  }

  get open(): boolean {
    return this.v !== null;
  }

  show(v: MapView): void {
    if (document.pointerLockElement) document.exitPointerLock();
    this.v = v;
    this.sel = undefined;
    this.el.classList.add('show');
    for (const col of this.el.querySelectorAll<HTMLDetailsElement>('.col')) col.open = innerWidth >= 900 && innerHeight > 500; // a phone keeps the map wide
    this.fog.update(Infinity); // what has been seen since the last look, at once
    this.turn(this.mapAt(v.x, v.z) || (v.level ?? 1), true);
    this.list();
    this.el.querySelector<HTMLElement>('.x')!.focus({ preventScroll: true });
    this.draw();
  }

  close(): void {
    this.v = null;
    this.el.classList.remove('show');
  }

  /** Turns to map `m` (0 the Giudecca), whole; `quiet`: the caller redraws. */
  private turn(m: number, quiet = false): void {
    const b = this.all[m];
    this.map = m;
    this.hover = 0;
    this.canvas.style.cursor = '';
    this.zoom = this.push = 1;
    this.c = { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 };
    this.up.hidden = !m;
    if (quiet) return;
    this.list();
    this.draw();
  }

  private draw(): void {
    const v = this.v;
    if (!v) return;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, dpr = Math.min(devicePixelRatio, 2);
    if (!w || !h) return;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const c = this.ctx, b = this.all[this.map], m = this.chart;
    this.sheet ??= ink(m, this.areas);
    this.paper ??= mottle();
    // fit the map north up below the banner, centred, 1 m = k px
    const cos = Math.cos(ROT), sin = Math.sin(ROT);
    const k = (this.k = this.zoom * Math.min((w - 24) / (b.x1 - b.x0), (h - TOP - 16) / (b.z1 - b.z0)));
    const cx = this.c.x, cz = this.c.z, o = (this.o = { x: w / 2, y: (h + TOP) / 2 });
    const at = (x: number, z: number) => [o.x + ((x - cx) * cos - (z - cz) * sin) * k, o.y + ((x - cx) * sin + (z - cz) * cos) * k] as const;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = `rgb(${PAPER})`;
    c.fillRect(0, 0, w, h);
    c.imageSmoothingEnabled = true;
    c.save();
    const R = Math.hypot(w, h) / k + 1; // m: a square this half-size covers the window round the centre spot
    c.translate(o.x, o.y);
    c.rotate(ROT);
    c.translate(-R * k, -R * k);
    c.drawImage(this.sheet, (cx - R - m.x0) * PX, (cz - R - m.z0) * PX, 2 * R * PX, 2 * R * PX, 0, 0, 2 * R * k, 2 * R * k);
    this.fog.draw(c, cx - R, cz - R, k, 2 * R * k, 2 * R * k);
    c.restore();
    const rect = (q: Box) => { // a box on the map, as a new subpath
      c.moveTo(...at(q.x0, q.z0));
      for (const [x, z] of [[q.x1, q.z0], [q.x1, q.z1], [q.x0, q.z1]] as const) c.lineTo(...at(x, z));
      c.closePath();
    };
    if (this.map) { // the neighbouring levels faded into the paper, as WoW leaves a zone's neighbours blank
      c.fillStyle = `rgba(${PAPER},.7)`;
      c.beginPath();
      c.rect(0, 0, w, h);
      rect(b);
      c.fill('evenodd');
    }
    rose(c, w, h); // faint, under the paper's stains
    c.save(); // the sheet: its mottle and stains, its edges darkened with age
    c.globalCompositeOperation = 'multiply';
    c.drawImage(this.paper, 0, 0, Math.max(w, h), Math.max(w, h)); // square, so the stains stay round
    const age = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.hypot(w, h) / 2);
    age.addColorStop(0, '#fff');
    age.addColorStop(1, '#8a6238');
    c.fillStyle = age;
    c.fillRect(0, 0, w, h);
    c.restore();

    const known = new Set<string>(), names = new Set<string>();
    if (this.map) { // the discovered places of this level, big places first; a name that would overlap one already drawn is left off
      const font = Math.round(Math.min(13, Math.max(8, k * 1.6)));
      const drawn: [number, number, number, number][] = [];
      for (const a of this.areas) {
        if (lvl(a) !== this.map) continue;
        names.add(a.label);
        if (!this.d.discovered(a)) continue;
        known.add(a.label);
        const [x, y] = at((a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2);
        const hw = label(c, a.label, x, y, font, true) / 2 + 3, hh = font * 0.7;
        if (drawn.some(([l, t, r, bt]) => x - hw < r && x + hw > l && y - hh < bt && y + hh > t)) continue;
        drawn.push([x - hw, y - hh, x + hw, y + hh]);
        label(c, a.label, x, y, font);
      }
    } else for (let n = 1; n < MAPS.length; n++) { // the Giudecca: each level outlined in ink, named once it is discovered
      const q = this.all[n], seen = this.areas.some((a) => lvl(a) === n && this.d.discovered(a));
      if (seen) known.add(MAPS[n]);
      c.save();
      c.beginPath();
      rect(q);
      if (n === this.hover) { c.fillStyle = 'rgba(255,236,170,.22)'; c.fill(); }
      c.setLineDash([6, 4]);
      c.strokeStyle = n === this.hover ? '#7a1a10' : 'rgba(51,36,15,.6)';
      c.lineWidth = n === this.hover ? 2 : 1.2;
      c.stroke();
      c.restore();
      const px = Math.round(Math.min(18, Math.max(9, w / 48))), [x, y] = at((q.x0 + q.x1) / 2, q.z0); // inside its south edge, clear of the buildings
      const name = seen ? MAPS[n] : 'Terra incognita', i = [...name].reduce((b, ch, j) => ch === ' ' && Math.abs(j - name.length / 2) < Math.abs(b - name.length / 2) ? j : b, -99);
      if (label(c, name, x, y, px, true) < (q.x1 - q.x0) * k || i < 0) label(c, name, x, y - px, px);
      else { label(c, name.slice(0, i), x, y - 2.2 * px, px); label(c, name.slice(i + 1), x, y - px, px); } // too wide for its outline: two lines
    }

    this.highlight(at, k);
    for (const { at: g, giver } of marks(v.goal, v.also ?? [], v.npcs ?? [])) { // the minimap's marks: gold diamonds, givers' "!"/"?"
      const [x, y] = at(g.x, g.z);
      if (giver) { glyph(c, x, y, g.state, 20); continue; }
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
    c.fillStyle = 'rgba(255,233,168,.35)';
    c.beginPath();
    c.arc(0, 0, 14, 0, Math.PI * 2);
    c.fill();
    c.rotate(ROT - v.facing);
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
    banner(c, w, MAPS[this.map]);

    this.place.replaceChildren(...(v.area ? ['Sei in: ', Object.assign(document.createElement('b'), { textContent: v.area })] : []));
    this.found.textContent = this.map ? `Luoghi scoperti: ${known.size}/${names.size}` : `Livelli esplorati: ${known.size}/${MAPS.length - 1}`;
  }

  /** Drags the map by (dx, dy) px on screen, held over the map. */
  private pan(dx: number, dy: number): void {
    const cos = Math.cos(ROT), sin = Math.sin(ROT);
    this.c = this.clamp({ x: this.c.x - (dx * cos + dy * sin) / this.k, z: this.c.z - (-dx * sin + dy * cos) / this.k });
  }

  /**
   * Zooms by f round the canvas point (x, y), which keeps the spot under it; 1 (the whole map) to 8. Zooming on past 1 on a
   * level's map steps out to the Giudecca; zooming in on the Giudecca opens the level under (x, y).
   */
  private zoomAt(f: number, x: number, y: number): void {
    if (!this.map) {
      this.push = Math.max(1, this.push * f);
      const m = this.push > 1.4 && this.levelAt(x, y);
      if (m) this.turn(m, true);
      return;
    }
    const z = Math.min(8, Math.max(1, this.zoom * f)), dx = x - this.o.x, dy = y - this.o.y;
    this.push = z === 1 && f < 1 ? this.push * f : 1;
    if (this.push < 0.7) return this.turn(0, true);
    if (z === this.zoom) return;
    this.pan(-dx, -dy); // the anchor to the centre, zoom, then back
    this.k *= z / this.zoom;
    this.zoom = z;
    this.pan(dx, dy);
  }

  private clamp(p: { x: number; z: number }): { x: number; z: number } {
    const b = this.all[this.map];
    return { x: Math.min(b.x1, Math.max(b.x0, p.x)), z: Math.min(b.z1, Math.max(b.z0, p.z)) };
  }

  /** The level whose place lies nearest (x, z), within 20 m; 0 out on the water. */
  private mapAt(x: number, z: number): number {
    let best = 20, m = 0;
    for (const a of this.areas) {
      const d = Math.hypot(Math.max(a.x0 - x, 0, x - a.x1), Math.max(a.z0 - z, 0, z - a.z1));
      if (d < best) { best = d; m = lvl(a); }
    }
    return m;
  }

  /** The level outlined under the canvas point (x, y) on the Giudecca, else 0. */
  private levelAt(x: number, y: number): number {
    const cos = Math.cos(ROT), sin = Math.sin(ROT), dx = x - this.o.x, dy = y - this.o.y;
    const wx = this.c.x + (dx * cos + dy * sin) / this.k, wz = this.c.z + (-dx * sin + dy * cos) / this.k;
    const i = this.all.findIndex((b, i) => i > 0 && wx >= b.x0 && wx <= b.x1 && wz >= b.z0 && wz <= b.z1);
    return i > 0 ? this.mapAt(wx, wz) || i : 0; // where two outlines overlap, the nearer place's level
  }

  /** Where the log's pick is: its place's middle, or the quest's spot. */
  private spot(): { x: number; z: number } | undefined {
    const s = this.sel;
    if (!s) return;
    if ('quest' in s) return this.v?.quests?.[s.quest]?.at;
    const a = this.areas.find((a) => a.label === s.area);
    return a && { x: (a.x0 + a.x1) / 2, z: (a.z0 + a.z1) / 2 };
  }

  private key(): string | undefined {
    const s = this.sel;
    return !s ? undefined : 'quest' in s ? `q${s.quest}` : `a${s.area}`;
  }

  /** Fills the two columns: the shown level's discovered places (on the Giudecca, the levels), then the quests running. */
  private list(): void {
    const v = this.v;
    if (!v) return;
    const key = this.key(), li = (k: string, cls: string, ...kids: (string | Node)[]) => {
      const e = document.createElement('li');
      e.dataset.k = k;
      e.className = cls + (k === key ? ' sel' : '');
      e.append(...kids);
      return e;
    };
    const tag = (t: 'b' | 'small', text: string) => Object.assign(document.createElement(t), { textContent: text });
    const none = (text: string) => Object.assign(document.createElement('li'), { className: 'none', textContent: text });
    const here = this.mapAt(v.x, v.z);
    if (!this.map) {
      this.places.replaceChildren(...MAPS.slice(1).map((n, i) => {
        const as = this.areas.filter((a) => lvl(a) === i + 1), seen = new Set(as.filter((a) => this.d.discovered(a)).map((a) => a.label)).size;
        return li(`m${i + 1}`, i + 1 === here ? 'here' : '', tag('b', seen ? n : 'Terra incognita'), tag('small', `Livello ${i + 1} · ${seen}/${new Set(as.map((a) => a.label)).size} luoghi`));
      }));
    } else {
      const names = [...new Set(this.areas.filter((a) => lvl(a) === this.map && this.d.discovered(a)).map((a) => a.label))]
        .sort((a, b) => a.localeCompare(b, 'it'));
      this.places.replaceChildren(...(names.length ? names.map((n) => li(`a${n}`, n === v.area ? 'here' : '', n)) : [none('Nessun luogo scoperto')]));
    }
    const qs = v.quests ?? [];
    this.log.replaceChildren(...(qs.length ? qs.map((q, i) => li(`q${i}`, q.ready ? 'ready' : '', tag('b', q.title), tag('small', q.line))) : [none('Nessuna missione')]));
  }

  /** The log's pick on the map: a place's rooms tinted red ochre, or an inked ring round the quest's spot. */
  private highlight(at: (x: number, z: number) => readonly [number, number], k: number): void {
    const s = this.sel, c = this.ctx;
    if (!s) return;
    c.save();
    c.strokeStyle = '#8a1c0e';
    c.lineWidth = 2;
    if ('area' in s) {
      c.fillStyle = 'rgba(176,48,24,.25)';
      for (const a of this.areas) {
        if (a.label !== s.area) continue;
        c.beginPath();
        for (const [x, z] of [[a.x0, a.z0], [a.x1, a.z0], [a.x1, a.z1], [a.x0, a.z1]] as const) c.lineTo(...at(x, z));
        c.closePath();
        c.fill();
        c.stroke();
      }
    } else {
      const p = this.v?.quests?.[s.quest]?.at;
      if (p) {
        const [x, y] = at(p.x, p.z), r = Math.max(22, 10 * k); // ~10 m round the spot, never too small to see
        c.fillStyle = 'rgba(176,48,24,.18)';
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
    }
    c.restore();
  }
}

interface Box { x0: number; x1: number; z0: number; z1: number }
const size = (a: Area) => (a.x1 - a.x0) * (a.z1 - a.z0);

/**
 * The parchment chart, on the minimap's grid (PX texels per metre from its x0, z0): the lagoon left as bare paper with
 * two faint inked shorelines, the floors as light flat stone inside a dark inked rim with a bevel, the gardens green, the
 * church floors rose, the buildings' masses tan under them and the walls dark. Each outline is the union's: every footprint stroked wide, then the next pass over it.
 */
function ink(m: Minimap, areas: readonly Area[]): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = m.chart.width;
  cv.height = m.chart.height;
  const g = cv.getContext('2d')!, bg = `rgb(${PAPER})`;
  g.fillStyle = bg;
  g.fillRect(0, 0, cv.width, cv.height);
  g.lineJoin = 'round';
  const all = m.shapes.map((s) => {
    const p = new Path2D();
    for (const [x, z] of s.pts) p.lineTo((x - m.x0) * PX, (z - m.z0) * PX);
    p.closePath();
    return { s, p };
  });
  const pass = (style: string, width: number, fill: boolean) => {
    g.strokeStyle = g.fillStyle = style;
    g.lineWidth = width * PX;
    for (const { p } of all) { if (width) g.stroke(p); if (fill) g.fill(p); }
  };
  for (const r of [7, 3.5]) { // the shorelines: a thin line r m off the land
    pass('rgba(51,36,15,.3)', 2 * r, false);
    pass(bg, 2 * r - 0.4, true);
  }
  pass(INK, 1.4, true); // the rim
  pass('#6e5a3a', 0.7, false); // the bevel
  const area = (x: number, z: number) => { // the smallest named place holding (x, z)
    let best: Area | undefined;
    for (const a of areas) if (x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1 && (!best || size(a) < size(best))) best = a;
    return best;
  };
  const thin = (s: Shape) => { const [a, b, c] = s.pts; return Math.min(Math.hypot(a[0] - b[0], a[1] - b[1]), Math.hypot(b[0] - c[0], b[1] - c[1])) < 2; };
  g.fillStyle = '#9e8659'; // the buildings' masses (and the platforms floors stand on): darker tan, under the floors
  g.strokeStyle = INK;
  g.lineWidth = 0.3 * PX;
  for (const { s, p } of all) if (s.wall && !thin(s)) { g.fill(p); g.stroke(p); }
  for (const { s, p } of all) {
    if (s.wall) continue;
    const mx = s.pts.reduce((t, q) => t + q[0], 0) / s.pts.length, mz = s.pts.reduce((t, q) => t + q[1], 0) / s.pts.length;
    g.fillStyle = STONE[s.role] ?? (SACRED.test(area(mx, mz)?.label ?? '') ? '#c4a296' : '#c9b78f');
    g.fill(p);
    g.strokeStyle = 'rgba(51,36,15,.18)'; // the joins between floors, faint
    g.lineWidth = 0.6;
    g.stroke(p);
  }
  g.fillStyle = '#5c4a30';
  g.strokeStyle = INK;
  g.lineWidth = 0.25 * PX;
  for (const { s, p } of all) if (s.wall && thin(s)) { g.fill(p); g.stroke(p); }
  return cv;
}

/** The paper's mottle: random greys at a few scales, blown up smooth and multiplied; light, so it only ages the sheet. */
function mottle(): HTMLCanvasElement {
  const N = 1024, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, N, N);
  g.imageSmoothingEnabled = true;
  g.globalCompositeOperation = 'multiply';
  for (const [n, lo] of [[5, 222], [13, 232], [40, 240], [400, 238]] as const) {
    const s = document.createElement('canvas');
    s.width = s.height = n;
    const c = s.getContext('2d')!, img = c.createImageData(n, n);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = lo + Math.random() * (255 - lo);
      img.data[i] = v;
      img.data[i + 1] = v * 0.97;
      img.data[i + 2] = v * 0.9;
      img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    g.drawImage(s, 0, 0, N, N);
  }
  for (let i = 0; i < 6; i++) { // tea stains
    const x = Math.random() * N, y = Math.random() * N, r = 40 + Math.random() * 120, s = g.createRadialGradient(x, y, 0, x, y, r);
    s.addColorStop(0, 'rgba(200,165,115,.12)');
    s.addColorStop(0.85, 'rgba(190,150,100,.22)');
    s.addColorStop(1, 'rgba(190,150,100,0)');
    g.fillStyle = s;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  return cv;
}

/** A place's name in small inked capitals on a pale halo, centred at (x, y) but kept on the canvas; `measure`: only its width. */
function label(c: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, measure = false): number {
  c.save();
  c.font = LABEL(px);
  c.letterSpacing = `${Math.max(0.5, px / 10)}px`;
  const t = text.toUpperCase(), w = c.measureText(t).width;
  if (!measure) {
    x = Math.min(c.canvas.clientWidth - w / 2 - 4, Math.max(w / 2 + 4, x));
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(222,204,160,.75)';
    c.strokeText(t, x, y);
    c.fillStyle = INK;
    c.fillText(t, x, y);
  }
  c.restore();
  return w;
}

/** The map's name on a scroll banner across the top, its ends curled back. */
function banner(c: CanvasRenderingContext2D, w: number, text: string): void {
  const px = Math.min(20, Math.max(13, w / 40));
  c.save();
  c.font = LABEL(px);
  c.letterSpacing = `${px / 6}px`;
  const t = text.toUpperCase(), tw = Math.min(c.measureText(t).width, w - 120), hw = tw / 2 + 22, cx = w / 2, y0 = 8, hgt = px + 16;
  for (const s of [-1, 1]) { // the tails, behind
    const x = cx + s * hw;
    c.beginPath();
    c.moveTo(x - s * 10, y0 + 8);
    c.lineTo(x + s * 26, y0 + 8);
    c.lineTo(x + s * 16, y0 + 8 + hgt / 2);
    c.lineTo(x + s * 26, y0 + 8 + hgt);
    c.lineTo(x - s * 10, y0 + 8 + hgt);
    c.closePath();
    c.fillStyle = '#7d6236';
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    c.stroke();
  }
  const grad = c.createLinearGradient(0, y0, 0, y0 + hgt);
  grad.addColorStop(0, '#d9bf86');
  grad.addColorStop(1, '#a8884f');
  c.beginPath();
  c.moveTo(cx - hw, y0);
  c.quadraticCurveTo(cx, y0 + 5, cx + hw, y0);
  c.lineTo(cx + hw, y0 + hgt);
  c.quadraticCurveTo(cx, y0 + hgt + 5, cx - hw, y0 + hgt);
  c.closePath();
  c.shadowColor = 'rgba(0,0,0,.45)';
  c.shadowBlur = 6;
  c.shadowOffsetY = 2;
  c.fillStyle = grad;
  c.fill();
  c.shadowColor = 'transparent';
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  c.stroke();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = 'rgba(255,240,200,.5)';
  c.fillText(t, cx, y0 + hgt / 2 + 3, tw);
  c.fillStyle = '#3a2410';
  c.fillText(t, cx, y0 + hgt / 2 + 2, tw);
  c.restore();
}

/** A faint wind rose, bottom right, its rhumb lines across the sheet: the sketch in the paper's empty space. N points up. */
function rose(c: CanvasRenderingContext2D, w: number, h: number): void {
  const r = Math.min(48, Math.max(22, Math.min(w, h) * 0.09)), x = w - r - 18, y = h - r - 18;
  c.save();
  c.translate(x, y);
  c.strokeStyle = 'rgba(51,36,15,.09)';
  c.lineWidth = 1;
  for (let i = 0; i < 16; i++) { // the rhumb lines
    const a = (i * Math.PI) / 8;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(Math.cos(a) * 2 * (w + h), Math.sin(a) * 2 * (w + h));
    c.stroke();
  }
  c.globalAlpha = 0.55;
  c.strokeStyle = INK;
  c.beginPath();
  c.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  c.stroke();
  for (let i = 0; i < 8; i++) { // four long points and four short, each half light and half dark
    const a = (i * Math.PI) / 4 - Math.PI / 2, l = i % 2 ? r * 0.55 : r, s = r * 0.13;
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a) * l, Math.sin(a) * l);
      c.lineTo(Math.cos(a + side * Math.PI / 4) * s, Math.sin(a + side * Math.PI / 4) * s);
      c.closePath();
      c.fillStyle = side < 0 ? INK : '#d8c69a';
      c.fill();
      c.stroke();
    }
  }
  c.font = LABEL(Math.round(r * 0.36));
  c.textAlign = 'center';
  c.textBaseline = 'bottom';
  c.fillStyle = INK;
  c.fillText('N', 0, -r - 1);
  c.restore();
}
