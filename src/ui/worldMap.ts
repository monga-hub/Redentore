import type { Discovery } from '../core/discovery.ts';
import type { Area } from '../level/builder.ts';
import type { FogLayer } from './fog.ts';
import { PX, WATER, glyph, under, type Minimap, type Pin } from './minimap.ts';

// The big map, WoW style: M (or the book button on the minimap) opens the whole complex in a
// framed overlay, turned like the minimap to the camera's heading at opening, under the same fog as the minimap. Discovered places carry their
// names, the player shows as an arrow and the objective as a gold diamond. The game pauses while
// it is open; M, Esc, a click or a tap close it. Its DOM is styled here, like ui/menu.ts.
// WoW's quest log flanks it: the level's discovered places on the left, the quests running on the right (gold once
// ready to hand in); tapping one tints its place or rings the spot the quest points at. Both columns fold away.
// Two fingers (or the wheel) zoom it round the pinch, one finger (or the mouse) drags it; it opens on the whole level.

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
#worldmap .body { flex: 1; min-height: 0; display: flex; gap: 8px; }
#worldmap .col { flex: none; width: 190px; overflow-y: auto; overscroll-behavior: contain; cursor: default;
  border: 2px solid transparent; border-radius: 4px; background: linear-gradient(rgba(30,22,14,.92), rgba(10,7,4,.95)) padding-box, var(--gilt) border-box; }
#worldmap .col:not([open]) { width: auto; }
#worldmap .col:last-child { margin-top: 16px; } /* clear of the close button */
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
#worldmap canvas { touch-action: none; flex: 1; min-height: 0; min-width: 0; width: 100%; border: 1px solid #000; border-radius: 3px;
  box-shadow: 0 0 0 1px #4a3a26, inset 0 0 20px #000; }
#worldmap .foot { display: flex; justify-content: space-between; gap: 12px; padding-top: 6px; font: 12px/16px system-ui, sans-serif; color: #c9b48a; }
#worldmap .foot b { color: #ffd75e; font-weight: normal; }
#worldmap .foot i { font-style: normal; }
body.touch #worldmap .foot i { display: none; }
`;

/** What the map shows of the game when it opens. */
export interface MapView {
  x: number; z: number; facing: number; view: number; area?: string; goal?: Pin; npcs?: Pin[];
  /** The quest log: the quests running and the spot each points at (objective, else giver). */
  quests?: { title: string; line: string; ready: boolean; at?: { x: number; z: number } }[];
  /** The second level's places (the Giudecca and the Zitelle) are the ones listed. */
  level2?: boolean;
}

const LEVEL2 = new Set(['giudecca', 'zitelle']); // zones past the Ponte de la Croce

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
  private places: HTMLElement;
  private log: HTMLElement;
  private sel?: { area: string } | { quest: number }; // what the log has highlighted on the map
  private zoom = 1; // 1: the whole level fits
  private c = { x: 0, z: 0 }; // m: the spot at the canvas's centre
  private k = 1; // px per m, as last drawn
  private touches = new Map<number, { x: number; y: number }>();
  private moved = 0; // px dragged since the press: past a few, the release is no tap

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
    this.el.addEventListener('click', () => this.close());
    for (const col of this.el.querySelectorAll('.col')) {
      col.addEventListener('click', (e) => { // a tap in the log picks (or drops) a highlight; the map stays open
        e.stopPropagation();
        const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-k]');
        if (!li) return;
        const k = li.dataset.k!, pick = k.startsWith('q') ? { quest: +k.slice(1) } : { area: k.slice(1) };
        this.sel = this.key() === k ? undefined : pick;
        const p = this.spot();
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
      if (!t) return;
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
    cv.addEventListener('click', (e) => { if (this.moved > 8) e.stopPropagation(); }); // a drag or pinch is no tap to close
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
    this.zoom = 1;
    this.c = { x: (this.bounds.x0 + this.bounds.x1) / 2, z: (this.bounds.z0 + this.bounds.z1) / 2 };
    this.el.classList.add('show');
    this.list();
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
    // fit the complex turned to the camera's heading (as the minimap), centred, 1 m = k px
    const cos = Math.cos(v.view), sin = Math.sin(v.view), bw = b.x1 - b.x0, bh = b.z1 - b.z0;
    const k = (this.k = this.zoom * Math.min(w / (Math.abs(cos) * bw + Math.abs(sin) * bh), h / (Math.abs(sin) * bw + Math.abs(cos) * bh)));
    const cx = this.c.x, cz = this.c.z;
    const at = (x: number, z: number) => [w / 2 + ((x - cx) * cos - (z - cz) * sin) * k, h / 2 + ((x - cx) * sin + (z - cz) * cos) * k] as const;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = WATER;
    c.fillRect(0, 0, w, h);
    c.imageSmoothingEnabled = true;
    const m = this.chart;
    c.save();
    const R = Math.hypot(w, h) / 2 / k + 1; // m: a square this half-size covers the turned window
    c.translate(w / 2, h / 2);
    c.rotate(v.view);
    c.translate(-R * k, -R * k);
    c.drawImage(m.chart, (cx - R - m.x0) * PX, (cz - R - m.z0) * PX, 2 * R * PX, 2 * R * PX, 0, 0, 2 * R * k, 2 * R * k);
    this.fog.draw(c, cx - R, cz - R, k, 2 * R * k, 2 * R * k);
    c.restore();
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

    this.highlight(at, k);
    for (const n of v.npcs ?? []) glyph(c, ...at(n.x, n.z), n.state, 20);
    if (v.goal && !under(v.goal, v.npcs ?? [])) { // gold diamond, as on the minimap
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
    c.rotate(v.view - v.facing);
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

  /** Drags the map by (dx, dy) px on screen, held over the level. */
  private pan(dx: number, dy: number): void {
    const r = this.v?.view ?? 0, cos = Math.cos(r), sin = Math.sin(r);
    this.c = this.clamp({ x: this.c.x - (dx * cos + dy * sin) / this.k, z: this.c.z - (-dx * sin + dy * cos) / this.k });
  }

  /** Zooms by f round the canvas point (x, y), which keeps the spot under it; 1 (the whole level) to 8. */
  private zoomAt(f: number, x: number, y: number): void {
    const z = Math.min(8, Math.max(1, this.zoom * f)), dx = x - this.canvas.clientWidth / 2, dy = y - this.canvas.clientHeight / 2;
    if (z === this.zoom) return;
    this.pan(-dx, -dy); // the anchor to the centre, zoom, then back
    this.k *= z / this.zoom;
    this.zoom = z;
    this.pan(dx, dy);
  }

  private clamp(p: { x: number; z: number }): { x: number; z: number } {
    const b = this.bounds;
    return { x: Math.min(b.x1, Math.max(b.x0, p.x)), z: Math.min(b.z1, Math.max(b.z0, p.z)) };
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

  /** Fills the two columns: the level's discovered places, then the quests running. */
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
    const names = [...new Set(this.areas.filter((a) => LEVEL2.has(a.zone) === !!v.level2 && this.d.discovered(a)).map((a) => a.label))]
      .sort((a, b) => a.localeCompare(b, 'it'));
    this.places.replaceChildren(...(names.length ? names.map((n) => li(`a${n}`, n === v.area ? 'here' : '', n)) : [none('Nessun luogo scoperto')]));
    const qs = v.quests ?? [];
    this.log.replaceChildren(...(qs.length ? qs.map((q, i) => li(`q${i}`, q.ready ? 'ready' : '', tag('b', q.title), tag('small', q.line))) : [none('Nessuna missione')]));
  }

  /** The log's pick on the map: a place's rectangles tinted gold, or a gilded ring round the quest's spot. */
  private highlight(at: (x: number, z: number) => readonly [number, number], k: number): void {
    const s = this.sel, c = this.ctx;
    if (!s) return;
    c.save();
    if ('area' in s) {
      c.fillStyle = 'rgba(255,215,94,.22)';
      c.strokeStyle = '#ffd75e';
      c.lineWidth = 2;
      c.shadowColor = '#ffd200';
      c.shadowBlur = 10;
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
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,215,94,.45)');
        g.addColorStop(1, 'rgba(255,215,94,0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#ffd75e';
        c.lineWidth = 2;
        c.shadowColor = '#ffd200';
        c.shadowBlur = 8;
        c.stroke();
      }
    }
    c.restore();
  }
}

const size = (a: Area) => (a.x1 - a.x0) * (a.z1 - a.z0);
