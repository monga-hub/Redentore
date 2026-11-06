import type { Discovery } from '../core/discovery.ts';
import type { Area } from '../level/builder.ts';
import { FogLayer } from './fog.ts';
import { glyph, marks, type Minimap, type Pin, type Shape } from './minimap.ts';

// The big map, WoW dungeon-map style: a sheet of warm mottled parchment filling the panel, burnt at its torn edges, the
// level's floors raised on it as pale embossed stone (walls carved, gardens a faint olive wash), a scroll banner with the
// map's name, a handful of iconic places named and a faint sepia sketch of a church front in the empty paper.
// M (or the book button on the minimap) opens the map of the level the player stands in, north up, under the fog of what
// has been seen (bare parchment where nobody has been). The "Giudecca" button, the wheel or a pinch out step back to the
// whole Giudecca: the island faintly sketched, each level a raised region with its name; a tap (or the wheel or a pinch
// in) on one opens its map. The player shows as an arrow and the quests carry the minimap's marks (ui/minimap.ts marks).
// The game pauses while it is open; M, Esc, a click or a tap on a level's map close it. Its DOM is styled here.
// WoW's quest log folds over the map's lower corners: the shown level's discovered places (the levels on the Giudecca) and
// the quests running (gold once ready to hand in); tapping one tints its place or rings the spot the quest points at,
// turning to that level's map. Two fingers (or the wheel) zoom a level's map round the pinch, one finger (or the mouse)
// drags it. All the art is drawn here from the level's own footprints, nothing painted.

const CSS = `
#worldmap { position: fixed; inset: 0; z-index: 15; display: none; align-items: center; justify-content: center;
  background: rgba(0,0,0,.6); font: 15px/1.35 Georgia, serif; color: #f3e2b0; user-select: none; cursor: pointer; }
#worldmap.show { display: flex; }
#worldmap .panel { position: relative; box-sizing: border-box; display: flex; flex-direction: column;
  width: calc(100vw - 24px - env(safe-area-inset-left) - env(safe-area-inset-right)); height: calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  max-width: 1400px; padding: 42px 12px 8px; border: 3px solid transparent; border-radius: 8px; background: var(--panel); box-shadow: var(--panel-shadow); }
#worldmap .x, #worldmap .up { position: absolute; top: 6px; z-index: 1; height: 30px; padding: 0 8px; cursor: pointer; font: bold 14px/1 Georgia, serif;
  color: #f3e2b0; border: 1px solid #c9a45c; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,.5); }
#worldmap .x { right: 12px; width: 30px; padding: 0; font: bold 18px/1 system-ui, sans-serif; background: linear-gradient(#7a1a10, #3a0805); }
#worldmap .up { left: 12px; background: linear-gradient(#5a4128, #241709); }
#worldmap .up[hidden] { display: none; }
@media (max-height: 500px) { /* a phone on its side: the buttons sit on the sheet's corners, the map keeps the height */
  #worldmap .panel { width: calc(100vw - 8px - env(safe-area-inset-left) - env(safe-area-inset-right)); height: calc(100dvh - 8px - env(safe-area-inset-top) - env(safe-area-inset-bottom)); padding: 6px 8px 4px; }
  #worldmap .foot { padding-top: 3px; font-size: 11px; line-height: 14px; } #worldmap .x, #worldmap .up { top: 16px; } #worldmap .up { left: 22px; } #worldmap .x { right: 22px; } }
#worldmap .body { position: relative; flex: 1; min-height: 0; display: flex; }
#worldmap .col { position: absolute; bottom: 10px; z-index: 1; width: 220px; max-width: calc(50% - 16px); max-height: calc(100% - 70px);
  overflow-y: auto; overscroll-behavior: contain; cursor: default;
  border: 2px solid transparent; border-radius: 4px; background: linear-gradient(rgba(30,22,14,.94), rgba(10,7,4,.96)) padding-box, var(--gilt) border-box;
  box-shadow: 0 2px 8px rgba(0,0,0,.6); }
#worldmap .col:first-of-type { left: 14px; }
#worldmap .col:last-of-type { right: 14px; }
#worldmap .col:not([open]) { width: auto; }
#worldmap .col summary { position: sticky; top: 0; z-index: 1; background: #1c140c; list-style: none; padding: 4px 10px; cursor: pointer; font: bold 13px/18px Georgia, serif; color: #ffd75e; text-shadow: 0 1px 2px #000; white-space: nowrap; }
#worldmap .col summary::-webkit-details-marker { display: none; }
#worldmap .col summary::before { content: '▸ '; }
#worldmap .col[open] summary::before { content: '▾ '; }
#worldmap .col[open] summary { border-bottom: 1px solid #5e4422; }
#worldmap .col ul { margin: 0; padding: 2px 0; list-style: none; }
#worldmap .col li { padding: 3px 8px; cursor: pointer; font: 12px/15px Georgia, serif; color: #e9d6b0; border-left: 3px solid transparent; }
#worldmap .col li:hover { background: rgba(255,215,94,.08); }
#worldmap .col li.sel { background: rgba(255,215,94,.16); border-left-color: #ffd75e; }
#worldmap .col li.here { color: #fff2c0; }
#worldmap .col li b { display: block; color: #ffd200; font-size: 13px; font-weight: bold; }
#worldmap .col li small { display: block; font-size: 11px; color: #c9b48a; }
#worldmap .col li.ready small { color: #ffd75e; }
#worldmap .col li.none { cursor: default; color: #8a7a5c; font-style: italic; }
@media (max-width: 900px), (max-height: 500px) { #worldmap .col { width: 170px; } #worldmap .col li b { font-size: 12px; } }
#worldmap canvas { touch-action: none; flex: 1; min-height: 0; min-width: 0; width: 100%; background: #24160a; border-radius: 3px;
  box-shadow: 0 0 0 1px #000, 0 2px 10px rgba(0,0,0,.7); }
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

/** The few iconic places each level's map names (WoW names a handful, not every room): area label → name on the map. */
const LANDMARKS: Record<number, [string, string][]> = {
  1: [['Chiesa del Redentore: navata', 'Chiesa del Redentore'], ['Chiostro grande', 'Chiostro grande'], ['Orti coltivati', 'Orti'], ['Riva sulla laguna', 'Riva sulla laguna']],
  2: [['Santa Croce: santuario della Rinascita', 'Santa Croce'], ['Squero', 'Squero'], ['Le Zitelle: aula sotto la cupola', 'Le Zitelle'], ['Orto delle Zitelle', 'Orto delle Zitelle']],
  3: [['Punta della Giudecca', 'Punta della Giudecca'], ['Basilica di San Giorgio Maggiore', 'San Giorgio Maggiore'], ['Chiostro dei cipressi', 'Chiostro dei cipressi'], ['Teatro Verde', 'Teatro Verde']],
};

const ROT = Math.PI; // north (+Z, level/plan.ts) up and east (-X) right, as a paper map: the world turned half round
const TOP = 54; // px kept for the banner over the map
const EDGE = 22; // px of torn, burnt border round the sheet
/** The banner's band and the border for a sheet h px tall: slimmer on a phone on its side, so the map keeps the height. */
const frame = (h: number) => (h < 500 ? { top: 42, edge: 12 } : { top: TOP, edge: EDGE });
const S = 6; // texels per metre of a level's baked floors
const S0 = 1.5; // texels per metre of the Giudecca's baked island and regions
const PAPER = '#cfa65f'; // the parchment, before its mottle
const INK = '#3a2611';
const LABEL = (px: number) => `bold ${px}px Georgia, 'Times New Roman', serif`;
// The raised stone (sampled off WoW's parchment maps, a shade lighter): the outline, the wall band and its lit inner
// edge, the floor; the garden washes over it.
const STONE = { line: '#4f3517', wall: '#cbb07e', lit: '#f3e6c4', floor: '#e4d0a2' };
const WASH: Partial<Record<string, string>> = { grass: 'rgba(110,118,62,.2)', hedge: 'rgba(92,100,50,.3)', foliage: 'rgba(100,108,54,.26)', soil: 'rgba(120,90,52,.18)', water: 'rgba(96,110,100,.45)' };

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
  private fog: FogLayer; // its own: its alpha wipes the floors not yet seen off the sheet
  private chart: Minimap;
  private art?: { floors: Sheet[]; regions: Sheet[]; isle: Sheet; mottle: HTMLCanvasElement }; // baked on the first opening
  private edge?: HTMLCanvasElement; // the burnt border, for the canvas's size
  private layer = document.createElement('canvas'); // the floors, before the fog wipes them onto the paper
  private bareKey = ''; // the sketch's spot, kept per map and canvas size
  private bareAt?: { x: number; z: number; m: number };
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
    this.fog = new FogLayer(d);
    this.chart = chart;
    this.areas = [...areas].sort((a, b) => size(b) - size(a)); // big places label first, small ones fit around them
    const M = 4; // m of shore around the areas
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
    for (const col of this.el.querySelectorAll<HTMLDetailsElement>('.col')) col.open = false; // the map first; the lists unfold over it on a tap
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
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H || !this.edge) {
      this.canvas.width = this.layer.width = W;
      this.canvas.height = this.layer.height = H;
      this.edge = burn(w, h, dpr);
    }
    const art = (this.art ??= this.bake());
    const c = this.ctx, b = this.all[this.map];
    // fit the map north up between the banner and the burnt edge, centred, 1 m = k px
    const cos = Math.cos(ROT), sin = Math.sin(ROT);
    const { top, edge } = frame(h), fit = Math.min((w - 2 * edge) / (b.x1 - b.x0), (h - top - edge) / (b.z1 - b.z0));
    const k = (this.k = this.zoom * fit);
    const cx = this.c.x, cz = this.c.z, o = (this.o = { x: w / 2, y: (h + top - edge) / 2 });
    const at = (x: number, z: number) => [o.x + ((x - cx) * cos - (z - cz) * sin) * k, o.y + ((x - cx) * sin + (z - cz) * cos) * k] as const;
    const R = Math.hypot(w, h) / k + 1, ox = cx - R, oz = cz - R; // m: a square 2R wide from (ox, oz) covers the window
    const turn = (g: CanvasRenderingContext2D) => { // g in world metres from (ox, oz), turned north up
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.translate(o.x, o.y);
      g.rotate(ROT);
      g.scale(k, k);
      g.translate(-R, -R);
    };
    const put = (g: CanvasRenderingContext2D, s: Sheet, alpha = 1, op: GlobalCompositeOperation = 'source-over') => {
      g.globalAlpha = alpha;
      g.globalCompositeOperation = op;
      g.drawImage(s.cv, s.x0 - ox, s.z0 - oz, s.cv.width / s.p, s.cv.height / s.p);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    };
    const seen = (n: number) => this.areas.some((a) => lvl(a) === n && this.d.discovered(a));

    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.imageSmoothingEnabled = true;
    c.fillStyle = PAPER;
    c.fillRect(0, 0, w, h);
    const bare = this.bare(w, h, fit);
    if (bare) { const [x, y] = at(bare.x, bare.z); sketch(c, x, y, bare.m * k, this.map !== 1); }
    c.save();
    turn(c);
    if (!this.map) put(c, art.isle);
    if (!this.map) for (let n = 1; n < MAPS.length; n++) { // each level a raised region, faint until set foot in; the one under the mouse lit
      put(c, art.regions[n], seen(n) ? 1 : 0.4);
      if (n === this.hover) put(c, art.regions[n], 0.25, 'lighter');
    }
    c.restore();
    const l = this.layer.getContext('2d')!; // the floors, the fog wiping off what nobody has seen
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.clearRect(0, 0, W, H);
    l.save();
    turn(l);
    l.imageSmoothingEnabled = true;
    for (let n = 1; n < MAPS.length; n++) if (!this.map || n === this.map) put(l, art.floors[n]);
    l.globalCompositeOperation = 'destination-out';
    this.fog.draw(l, ox, oz, 1, 2 * R, 2 * R);
    l.restore();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.layer, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.save(); // the paper's mottle and stains over it all, then its burnt border
    c.globalCompositeOperation = 'multiply';
    c.drawImage(art.mottle, 0, 0, Math.max(w, h), Math.max(w, h)); // square, so the stains stay round
    c.restore();
    c.drawImage(this.edge, 0, 0, w, h);

    const known = new Set<string>(), names = new Set<string>();
    if (this.map) { // only the level's iconic places are named, once discovered
      for (const a of this.areas) {
        if (lvl(a) !== this.map) continue;
        names.add(a.label);
        if (this.d.discovered(a)) known.add(a.label);
      }
      // each beside its place on bare paper where it can, as WoW's are: slid out right or left past the level's places
      const px = Math.round(Math.min(14, Math.max(10, w / 85))), lh = px * 1.3;
      const box = (a: Area) => { const [x0, y0] = at(a.x0, a.z0), [x1, y1] = at(a.x1, a.z1); return { l: Math.min(x0, x1), r: Math.max(x0, x1), t: Math.min(y0, y1), b: Math.max(y0, y1) }; };
      const boxes = this.areas.filter((a) => lvl(a) === this.map).map(box);
      const free = (l: number, r: number, y: number) => l > EDGE && r < w - EDGE && !boxes.some((q) => l < q.r + 3 && r > q.l - 3 && y - lh / 2 < q.b && y + lh / 2 > q.t);
      for (const [place, name] of LANDMARKS[this.map] ?? []) {
        const a = this.areas.find((a) => a.label === place);
        if (!a || !known.has(place)) continue;
        const q = box(a), y = (q.t + q.b) / 2, tw = textWidth(c, name, px);
        let x = (q.l + q.r) / 2;
        for (let d = 6; d < 90; d += 4) {
          if (free(q.r + d, q.r + d + tw, y)) { x = q.r + d + tw / 2; break; }
          if (free(q.l - d - tw, q.l - d, y)) { x = q.l - d - tw / 2; break; }
        }
        label(c, name, x, y, px, w / 3);
      }
    } else for (let n = 1; n < MAPS.length; n++) { // the Giudecca: each level named on its region
      const q = this.all[n], [x, y] = at((q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2), on = seen(n);
      if (on) known.add(MAPS[n]);
      label(c, on ? MAPS[n] : 'Terra incognita', x, y, Math.round(Math.min(19, Math.max(12, w / 55))), Math.max(90, (q.x1 - q.x0) * k), on ? 1 : 0.55);
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
    banner(c, w, h, MAPS[this.map], art.mottle);

    this.place.replaceChildren(...(v.area ? ['Sei in: ', Object.assign(document.createElement('b'), { textContent: v.area })] : []));
    this.found.textContent = this.map ? `Luoghi scoperti: ${known.size}/${names.size}` : `Livelli esplorati: ${known.size}/${MAPS.length - 1}`;
  }

  /** Bakes the art from the level's footprints: each level's raised floors, its region on the Giudecca, the island, the paper's mottle. */
  private bake(): NonNullable<WorldMap['art']> {
    const own = this.chart.shapes.map((s) => {
      const x = s.pts.reduce((t, q) => t + q[0], 0) / s.pts.length, z = s.pts.reduce((t, q) => t + q[1], 0) / s.pts.length;
      return { s, n: s.role === 'ground' ? 0 : this.mapAt(x, z) };
    });
    const floors: Sheet[] = [], regions: Sheet[] = [];
    for (let n = 1; n < MAPS.length; n++) {
      const mine = own.filter((q) => q.n === n).map((q) => q.s);
      floors[n] = raised(this.all[n], mine);
      regions[n] = region(this.all[n], mine);
    }
    return { floors, regions, isle: island(this.all[0], this.chart.shapes.filter((s) => !s.wall)), mottle: mottle() };
  }

  /**
   * The biggest square of bare paper on the shown map as it opens (no place within reach, clear of the banner and the
   * burnt edge), as its centre and side in metres, for the sketch; none under 90 px. Kept per map and canvas size.
   */
  private bare(w: number, h: number, fit: number): { x: number; z: number; m: number } | undefined {
    const key = `${this.map}:${w}:${h}`;
    if (key === this.bareKey) return this.bareAt;
    const M = this.map ? 4 : 16; // m kept clear round each place (the Giudecca's regions swell 9 m past their floors)
    const G = 10, cols = Math.floor(w / G), rows = Math.floor(h / G), b = this.all[this.map];
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, ox = w / 2, { top, edge } = frame(h), oy = (h + top - edge) / 2;
    const world = (sx: number, sy: number) => [cx - (sx - ox) / fit, cz - (sy - oy) / fit] as const; // ROT: the world half round
    const run = new Int16Array(cols * rows);
    let best = 0, end = 0;
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) { // the classic largest-square sweep
      const sx = (q + 0.5) * G, sy = (r + 0.5) * G, [x, z] = world(sx, sy), i = r * cols + q;
      const free = sy > top + 4 && sy < h - edge - 6 && sx > edge + 6 && sx < w - edge - 6
        && !this.areas.some((a) => x > a.x0 - M && x < a.x1 + M && z > a.z0 - M && z < a.z1 + M);
      run[i] = !free ? 0 : r && q ? 1 + Math.min(run[i - 1], run[i - cols], run[i - cols - 1]) : 1;
      if (run[i] > best) { best = run[i]; end = i; }
    }
    const side = best * G, [x, z] = world((end % cols + 1) * G - side / 2, (Math.floor(end / cols) + 1) * G - side / 2);
    this.bareKey = key;
    return (this.bareAt = side >= 90 ? { x, z, m: side / fit } : undefined);
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
/** Baked art lying in the world: texel (0, 0) at world (x0, z0), p texels per metre, unturned (north is +Z). */
interface Sheet { cv: HTMLCanvasElement; x0: number; z0: number; p: number }
const size = (a: Area) => (a.x1 - a.x0) * (a.z1 - a.z0);
/** A wall to carve: a tall box, unless it is a broad low one, a platform walked on (the church's floor is its top). */
const carved = (s: Shape) => {
  const [a, b, c] = s.pts;
  return s.wall && (s.top > 3.6 || Math.min(Math.hypot(a[0] - b[0], a[1] - b[1]), Math.hypot(b[0] - c[0], b[1] - c[1])) < 2);
};

const canvas = (w: number, h: number) => Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.ceil(w)), height: Math.max(1, Math.ceil(h)) });
const pen = (cv: HTMLCanvasElement) => cv.getContext('2d')!;
/** A blank sheet over box b and `pad` m round it. */
const sheet = (b: Box, pad: number, p: number): Sheet => ({ cv: canvas((b.x1 - b.x0 + 2 * pad) * p, (b.z1 - b.z0 + 2 * pad) * p), x0: b.x0 - pad, z0: b.z0 - pad, p });
const trace = (sh: Sheet, s: Shape) => {
  const p = new Path2D();
  for (const [x, z] of s.pts) p.lineTo((x - sh.x0) * sh.p, (z - sh.z0) * sh.p);
  p.closePath();
  return p;
};
/** The same size as `src`, its shape in `color`. */
function tint(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const cv = canvas(src.width, src.height), g = pen(cv);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, cv.width, cv.height);
  return cv;
}
/** `src`'s shape grown (or, `shrink`, worn) by r texels: itself joined (or met) with copies moved round two rings. */
function grow(src: HTMLCanvasElement, r: number, shrink = false): HTMLCanvasElement {
  const cv = canvas(src.width, src.height), g = pen(cv), n = Math.max(8, Math.ceil(r * 3));
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = shrink ? 'destination-in' : 'source-over';
  for (const f of [0.5, 1]) for (let i = 0; i < n; i++) g.drawImage(src, f * r * Math.cos((2 * Math.PI * i) / n), f * r * Math.sin((2 * Math.PI * i) / n));
  return cv;
}
/** `src`'s shape in `color`, blurred and moved by (dx, dy), drawn onto g: canvas shadows, which blur everywhere ctx.filter may not. */
function soft(g: CanvasRenderingContext2D, src: HTMLCanvasElement, color: string, blur: number, dx: number, dy: number): void {
  g.save();
  g.shadowColor = color;
  g.shadowBlur = blur;
  g.shadowOffsetX = src.width + 64 + dx;
  g.shadowOffsetY = dy;
  g.drawImage(src, -src.width - 64, 0);
  g.restore();
}
/** A seeded random, so the paper keeps its stains from one opening to the next. */
function seeded(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stone raised off the parchment, as WoW's dungeon maps: a soft shadow cast to the lower right, a thin dark outline, a
 * wall band lit along its inner edge round a pale floor, the edges bevelled (lit to the upper left, shaded to the lower
 * right) and `wash` tinting the floor. `u`: texels per metre of the look (the band, the bevel, the shadow). Sheets lie
 * world-wise and are turned half round on screen (ROT), so the screen's lower right is the sheet's upper left.
 */
function emboss(mask: HTMLCanvasElement, u: number, pal = STONE, wash?: HTMLCanvasElement): HTMLCanvasElement {
  const out = canvas(mask.width, mask.height), g = pen(out);
  soft(g, mask, 'rgba(30,16,4,.7)', 1.6 * u, -0.7 * u, -0.9 * u);
  g.drawImage(tint(grow(mask, 0.28 * u), pal.line), 0, 0);
  g.drawImage(tint(mask, pal.wall), 0, 0);
  const inner = grow(mask, 0.6 * u, true);
  g.drawImage(tint(grow(inner, 0.2 * u), pal.lit), 0, 0);
  g.drawImage(tint(inner, pal.floor), 0, 0);
  if (wash) {
    const t = pen(wash);
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(inner, 0, 0);
    g.drawImage(wash, 0, 0);
  }
  for (const [color, d] of [['rgba(255,250,230,.75)', -0.3 * u], ['rgba(40,22,6,.5)', 0.3 * u]] as const) {
    const t = tint(mask, color), tg = pen(t);
    tg.globalCompositeOperation = 'destination-out';
    tg.drawImage(mask, d, d);
    g.drawImage(t, 0, 0);
  }
  return out;
}

/**
 * A level's floors raised in stone: every floor footprint joined (a hair wider, so touching floors close up), the walls
 * standing on them carved out (a little thicker, so they read), the gardens, beds and ponds washed in faint colour.
 */
function raised(b: Box, shapes: readonly Shape[]): Sheet {
  const sh = sheet(b, 6, S), mask = canvas(sh.cv.width, sh.cv.height), wash = canvas(sh.cv.width, sh.cv.height);
  const g = pen(mask), t = pen(wash);
  g.lineJoin = 'round';
  // lowest first, as the minimap paints them, a wall a step early: a platform's floor (at its top) then covers it again
  const low = (s: Shape) => s.top - (carved(s) ? 0.3 : 0);
  for (const s of [...shapes].sort((a, b) => low(a) - low(b))) {
    const p = trace(sh, s), wall = carved(s);
    g.globalCompositeOperation = wall ? 'destination-out' : 'source-over'; // walls carved a little thicker, so they read
    g.fillStyle = g.strokeStyle = '#fff';
    g.lineWidth = (wall ? 0.5 : 0.3) * S; // floors a hair wider, so touching ones close up
    g.fill(p);
    g.stroke(p);
    if (wall) continue;
    t.globalCompositeOperation = 'destination-out'; // a floor laid over a lawn hides it
    t.fill(p);
    t.globalCompositeOperation = 'source-over';
    const c = WASH[s.role];
    if (c) { t.fillStyle = c; t.fill(p); }
  }
  sh.cv = emboss(mask, S, STONE, wash);
  return sh;
}

/** A level's region on the Giudecca: its floors swollen into one rounded raised island of paler parchment. */
function region(b: Box, shapes: readonly Shape[]): Sheet {
  const sh = sheet(b, 22, S0), mask = canvas(sh.cv.width, sh.cv.height), g = pen(mask);
  g.lineJoin = 'round';
  g.fillStyle = g.strokeStyle = '#fff';
  g.lineWidth = 18 * S0;
  for (const s of shapes) {
    if (carved(s)) continue;
    const p = trace(sh, s);
    g.fill(p);
    g.stroke(p);
  }
  sh.cv = emboss(mask, 3.2, { line: '#5c401f', wall: '#ad8d5a', lit: '#cbb07d', floor: '#bd9f6a' });
  return sh;
}

/** The Giudecca, faintly sketched: its land a shade paler than the paper, inside a coastline and a fainter one off it. */
function island(b: Box, shapes: readonly Shape[]): Sheet {
  const sh = sheet(b, 40, S0), land = canvas(sh.cv.width, sh.cv.height), g = pen(land);
  g.lineJoin = 'round';
  g.fillStyle = g.strokeStyle = '#fff';
  g.lineWidth = 12 * S0; // round-cornered, as drawn by hand
  for (const s of shapes) {
    const p = trace(sh, s);
    g.fill(p);
    g.stroke(p);
  }
  const out = pen(sh.cv);
  out.drawImage(tint(land, 'rgba(255,238,200,.13)'), 0, 0);
  for (const [r, color] of [[0, 'rgba(64,42,18,.42)'], [5 * S0, 'rgba(64,42,18,.18)']] as const) { // a line r texels off the shore
    const ring = grow(land, r + 1.2), rg = pen(ring);
    rg.globalCompositeOperation = 'destination-out';
    rg.drawImage(r ? grow(land, r) : land, 0, 0);
    out.drawImage(tint(ring, color), 0, 0);
  }
  return sh;
}

/** The paper's mottle, to multiply over the sheet: warm blotches at a few scales, a fine grain, a few tea stains and their rings. */
function mottle(): HTMLCanvasElement {
  const N = 1024, cv = canvas(N, N), g = pen(cv), rnd = seeded(11);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, N, N);
  g.imageSmoothingEnabled = true;
  g.globalCompositeOperation = 'multiply';
  for (const [n, lo] of [[4, 178], [9, 202], [22, 220], [70, 232], [512, 220]] as const) {
    const s = canvas(n, n), c = pen(s), img = c.createImageData(n, n);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = lo + rnd() * (255 - lo);
      img.data[i] = v;
      img.data[i + 1] = 255 - (255 - v) * 1.12; // the darker, the browner
      img.data[i + 2] = 255 - (255 - v) * 1.45;
      img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    g.drawImage(s, 0, 0, N, N);
  }
  for (let i = 0; i < 7; i++) { // soft stains, each a few blots run together
    const x0 = rnd() * N, y0 = rnd() * N;
    for (let j = 0; j < 4; j++) {
      const x = x0 + (rnd() - 0.5) * 120, y = y0 + (rnd() - 0.5) * 120, r = 30 + rnd() * 70, s = g.createRadialGradient(x, y, 0, x, y, r);
      s.addColorStop(0, 'rgba(140,95,45,.17)');
      s.addColorStop(1, 'rgba(150,105,55,0)');
      g.fillStyle = s;
      g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
  }
  g.globalCompositeOperation = 'screen'; // a few paler patches where the sheet kept its colour
  for (let i = 0; i < 5; i++) {
    const x = rnd() * N, y = rnd() * N, r = 120 + rnd() * 220, s = g.createRadialGradient(x, y, 0, x, y, r);
    s.addColorStop(0, 'rgba(255,250,235,.22)');
    s.addColorStop(1, 'rgba(255,250,235,0)');
    g.fillStyle = s;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  return cv;
}

/** The sheet's border for a w × h canvas: a torn edge with the dark of the panel past it, burnt brown creeping in, the corners darkest. */
function burn(w: number, h: number, dpr: number): HTMLCanvasElement {
  const cv = canvas(w * dpr, h * dpr), g = pen(cv), rnd = seeded(5), ph = [0, 1, 2, 3].map(() => rnd() * 2 * Math.PI);
  g.scale(dpr, dpr);
  const n = (t: number) => Math.sin(t * 0.019 + ph[0]) * 0.45 + Math.sin(t * 0.053 + ph[1]) * 0.3 + Math.sin(t * 0.17 + ph[2]) * 0.15 + Math.sin(t * 0.61 + ph[3]) * 0.1;
  const tear = new Path2D();
  let t = 0;
  for (const [x0, y0, x1, y1, nx, ny] of [[0, 0, w, 0, 0, 1], [w, 0, w, h, -1, 0], [w, h, 0, h, 0, -1], [0, h, 0, 0, 1, 0]]) {
    const L = Math.hypot(x1 - x0, y1 - y0);
    for (let s = 0; s < L; s += 4, t += 4) { const d = 6 + 5 * n(t); tear.lineTo(x0 + ((x1 - x0) * s) / L + nx * d, y0 + ((y1 - y0) * s) / L + ny * d); }
  }
  tear.closePath();
  const outside = new Path2D();
  outside.rect(-4, -4, w + 8, h + 8);
  outside.addPath(tear);
  g.fillStyle = '#24160a';
  g.fill(outside, 'evenodd');
  g.save();
  g.clip(tear);
  g.strokeStyle = 'rgba(52,28,8,.85)';
  g.lineWidth = 5;
  g.shadowColor = 'rgba(78,40,10,.75)';
  g.shadowBlur = 20 * dpr;
  g.stroke(tear);
  g.stroke(tear);
  for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) {
    const r = Math.min(w, h) * 0.32, s = g.createRadialGradient(x, y, 0, x, y, r);
    s.addColorStop(0, 'rgba(62,32,8,.5)');
    s.addColorStop(1, 'rgba(62,32,8,0)');
    g.fillStyle = s;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  g.restore();
  return cv;
}

/** `text` split at its most central space when wider than `max` at the context's font. */
function lines(c: CanvasRenderingContext2D, text: string, max: number): string[] {
  if (c.measureText(text).width <= max) return [text];
  const i = [...text].reduce((b, ch, j) => ch === ' ' && Math.abs(j - text.length / 2) < Math.abs(b - text.length / 2) ? j : b, -99);
  return i < 0 ? [text] : [text.slice(0, i), text.slice(i + 1)];
}

/** The width of `text` as label() sets it on one line. */
function textWidth(c: CanvasRenderingContext2D, text: string, px: number): number {
  c.save();
  c.font = LABEL(px);
  c.letterSpacing = `${Math.max(0.5, px / 9)}px`;
  const w = c.measureText(text.toUpperCase()).width;
  c.restore();
  return w;
}

/** A place's name in small cut capitals of dark ink, centred at (x, y) but kept on the sheet, on two lines past `max` px. */
function label(c: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, max: number, alpha = 1): void {
  c.save();
  c.globalAlpha = alpha;
  c.font = LABEL(px);
  c.letterSpacing = `${Math.max(0.5, px / 9)}px`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const ls = lines(c, text.toUpperCase(), max), hw = Math.max(...ls.map((l) => c.measureText(l).width)) / 2, cw = c.canvas.clientWidth;
  x = Math.min(cw - hw - EDGE, Math.max(hw + EDGE, x));
  ls.forEach((l, i) => {
    const ly = y + (i - (ls.length - 1) / 2) * px * 1.15;
    c.fillStyle = 'rgba(255,238,196,.55)'; // the light on the cut's lower lip
    c.fillText(l, x + 0.6, ly + 1);
    c.fillStyle = INK;
    c.fillText(l, x, ly);
  });
  c.restore();
}

/** The map's name on a parchment scroll across the top: a plaque with the letters raised in pale gilt, its ribbon ends rolled up at the sides. */
function banner(c: CanvasRenderingContext2D, w: number, h: number, text: string, mottle: HTMLCanvasElement): void {
  const px = Math.round(Math.min(26, Math.max(14, Math.min(w / 42, h / 22))));
  c.save();
  c.font = LABEL(px);
  c.letterSpacing = `${px * 0.16}px`;
  const ls = lines(c, text.toUpperCase(), Math.min(w * 0.42, w - 200));
  const tw = Math.min(w - 150, Math.max(...ls.map((l) => c.measureText(l).width)));
  const lh = px * 1.12, bw = tw + px * 2.2, bh = ls.length * lh + px * 0.8, cx = w / 2, y0 = 5, x0 = cx - bw / 2, x1 = cx + bw / 2;
  const th = Math.min(bh * 0.6, px * 1.5), out = px * 2.3, yt = y0 + bh - th * 0.55;
  for (const s of [-1, 1]) { // the ribbon's ends, from behind the plaque out and down to a roll
    const x = s < 0 ? x0 : x1, rx = x + s * out, ry = yt + th * 0.7;
    const end = c.createLinearGradient(0, yt, 0, yt + th * 1.4);
    end.addColorStop(0, '#a98652');
    end.addColorStop(1, '#7a5a30');
    c.beginPath();
    c.moveTo(x - s * px * 0.6, yt);
    c.lineTo(rx, yt + th * 0.2);
    c.lineTo(rx, yt + th * 1.2);
    c.lineTo(x - s * px * 0.6, yt + th);
    c.closePath();
    c.fillStyle = end;
    c.fill();
    c.strokeStyle = '#3e2912';
    c.lineWidth = 1.3;
    c.stroke();
    c.beginPath(); // the fold where it turns under the plaque
    c.moveTo(x, yt + th);
    c.lineTo(x + s * px * 0.5, yt + th * 1.05);
    c.lineTo(x, yt + th * 0.55);
    c.fillStyle = '#5a3f1e';
    c.fill();
    c.beginPath(); // the roll
    c.ellipse(rx, ry, th * 0.34, th * 0.52, 0, 0, Math.PI * 2);
    c.fillStyle = '#8f6e3e';
    c.fill();
    c.stroke();
    c.beginPath();
    c.ellipse(rx + s * th * 0.04, ry, th * 0.15, th * 0.26, 0, 0, Math.PI * 2);
    c.stroke();
  }
  const plaque = new Path2D(); // its top and bottom edges dipping a little
  plaque.moveTo(x0, y0);
  plaque.quadraticCurveTo(cx, y0 + 5, x1, y0);
  plaque.lineTo(x1, y0 + bh);
  plaque.quadraticCurveTo(cx, y0 + bh + 5, x0, y0 + bh);
  plaque.closePath();
  const face = c.createLinearGradient(0, y0, 0, y0 + bh);
  face.addColorStop(0, '#d3b273');
  face.addColorStop(1, '#a8874c');
  c.save();
  c.shadowColor = 'rgba(30,16,4,.6)';
  c.shadowBlur = 8;
  c.shadowOffsetX = 2;
  c.shadowOffsetY = 3;
  c.fillStyle = face;
  c.fill(plaque);
  c.restore();
  c.save();
  c.clip(plaque);
  c.globalCompositeOperation = 'multiply';
  c.drawImage(mottle, x0, y0 - bw / 2, bw, bw);
  c.restore();
  c.strokeStyle = 'rgba(255,238,196,.45)';
  c.lineWidth = 1;
  c.strokeRect(x0 + 4, y0 + 5, bw - 8, bh - 7);
  c.strokeStyle = '#3e2912';
  c.lineWidth = 1.6;
  c.stroke(plaque);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  ls.forEach((l, i) => {
    const y = y0 + px * 0.4 + lh * (i + 0.5) + 2;
    c.fillStyle = 'rgba(46,26,8,.9)'; // raised: shaded below right, caught by the light above left
    c.fillText(l, cx + 1.2, y + 1.6, tw);
    c.fillStyle = 'rgba(255,246,214,.7)';
    c.fillText(l, cx - 0.6, y - 0.6, tw);
    c.fillStyle = '#e2c486';
    c.fillText(l, cx, y, tw);
  });
  c.restore();
}

/**
 * A faint sepia pen sketch of a Palladian church front, as the Redentore's (with San Giorgio's campanile beside it on the
 * other maps), `hgt` px tall and centred on (x, y): the drawing WoW's maps keep in their empty paper. Each line twice, a
 * hair apart, as a hand would.
 */
function sketch(c: CanvasRenderingContext2D, x: number, y: number, hgt: number, campanile: boolean): void {
  const u = (hgt * 0.85) / 112, x1 = campanile ? 80 : 58; // drawing units, y up: the front 116 wide, 112 to the cross
  const L = (...pts: [number, number][]) => {
    c.beginPath();
    for (const [a, b] of pts) c.lineTo(a, -b);
    c.stroke();
  };
  const draw = () => {
    L([-60, 0], [x1 + 4, 0]); // ground and steps
    L([-24, 0], [-24, 3], [24, 3], [24, 0]);
    L([-22, 3], [-22, 6], [22, 6], [22, 3]);
    for (const s of [-1, 1]) {
      L([s * 48, 0], [s * 48, 34], [s * 20, 41]); // the wings' half pediments
      L([s * 48, 30], [s * 20, 30]);
      L([s * 28, 40], [s * 28, 84]); // the turrets, their cones
      L([s * 33, 39], [s * 33, 84]);
      L([s * 26.5, 84], [s * 30.5, 95], [s * 34.5, 84]);
      L([s * 40, 6], [s * 40, 22], [s * 34, 22], [s * 34, 6]); // the niches
    }
    L([-20, 6], [-20, 50]);
    L([20, 6], [20, 50]);
    for (const q of [-16, -6, 6, 16]) { // the half columns and their capitals
      L([q - 1.5, 6], [q - 1.5, 46]);
      L([q + 1.5, 6], [q + 1.5, 46]);
      L([q - 2.6, 46.5], [q + 2.6, 46.5]);
    }
    L([-22, 48], [22, 48]);
    L([-23, 51], [23, 51]);
    L([-24, 51], [0, 64], [24, 51]); // the pediment, the attic behind it
    L([-17, 53], [0, 61], [17, 53]);
    L([-26, 56], [-26, 68], [26, 68], [26, 56]);
    L([-26, 68], [0, 74], [26, 68]);
    c.beginPath(); // the door
    c.moveTo(-4, -6);
    c.lineTo(-4, -20);
    c.arc(0, -20, 4, Math.PI, 0);
    c.lineTo(4, -6);
    c.stroke();
    L([-16, 74], [-16, 81], [16, 81], [16, 74]); // the drum, the dome, the lantern and the Redeemer's cross
    c.beginPath();
    c.ellipse(0, -81, 16, 15, 0, Math.PI, 2 * Math.PI);
    c.stroke();
    for (let i = 0; i < 5; i++) { const q = 6 + i * 2; L([q, 81], [q, 81 + Math.sqrt(1 - (q / 16) ** 2) * 14]); } // its shade
    L([-3, 95.5], [-3, 101], [3, 101], [3, 95.5]);
    L([-3.6, 101], [0, 106], [3.6, 101]);
    L([0, 106], [0, 112]);
    L([-1.8, 109.5], [1.8, 109.5]);
    if (campanile) { // San Giorgio's bell tower, off to the side
      const X = 72;
      L([X - 6, 0], [X - 6, 84], [X + 6, 84], [X + 6, 0]);
      for (const q of [22, 44, 66]) L([X - 6, q], [X + 6, q]);
      L([X - 7, 84], [X - 7, 94], [X + 7, 94], [X + 7, 84]);
      L([X - 2.5, 86], [X - 2.5, 92]);
      L([X + 2.5, 86], [X + 2.5, 92]);
      L([X - 7, 94], [X, 110], [X + 7, 94]);
    }
  };
  c.save();
  c.translate(x - (u * (x1 - 60)) / 2, y + 56 * u);
  c.scale(u, u);
  c.lineWidth = 0.9 / u;
  c.lineCap = c.lineJoin = 'round';
  c.strokeStyle = 'rgba(66,40,14,.17)';
  for (const j of [0, 0.7]) {
    c.save();
    c.translate(j, -j * 0.5);
    draw();
    c.restore();
  }
  c.restore();
}
