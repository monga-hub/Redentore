import * as THREE from 'three';
import { PHONE } from '../core/device.ts';
import { castOf, clock, foeAuras, marked, type Aura, type Marks } from './auras.ts';
import { ICONS } from './icons.ts';
import type { Kind, Mob } from './target.ts';

// WoW nameplates over the foes, plain pooled DOM: the hero's debuffs on it in a row of painted icons (ui/auras.ts) with
// their seconds left in big outlined digits and the doses stacked, the name, the health bar with its percent and the
// level at the right (a skull for a boss), a red frame on the target, gold on an elite, and the cast bar under it with
// the spell's icon beside. Only the nearest few foes that are fighting, hurt, marked or targeted get one; a plate keeps
// to its foe while it has one, moves every frame (a transform, nothing laid out) and redraws its text a few times a
// second, only what changed. Far plates shrink with the distance and drop the icons. The hero's own buffs are a row
// under the player frame (`HeroAuras`): at a phone's 390 px of height a plate over the hero would sit on the very fight.

const RANGE = 40; // m from the hero: farther foes get no plate (Tab's reach)
const MAX = PHONE ? 10 : 16; // plates at once, the nearest
const ICONS_MAX = 5; // icons a plate shows, then "+N"
const REDRAW = 0.1; // s between redraws of the text and icons
const MIN_S = 0.55; // a far plate shrinks to this
const FAR_S = 0.7; // smaller than this: no icons, no spell name
const OTHER = 0.85; // the plates of foes not targeted, at this of the target's size
const FULL = 8; // m past the hero (from the lens) a plate keeps its full size: farther, it shrinks with the distance
const OVER = 0.3; // m above the head
const W_PX = 100, UP = 28, ICON_ROW = 24, DOWN = 14; // px of a plate at scale 1: its width, above its bar's foot (name, bar), the icons' row over that, below it (the cast bar)
const BOSS_BAR = 100; // px the boss bar (quest/view.ts #boss) takes at the top: a boss's own plate keeps under it
const STACK = 70; // px a plate may be pushed up or down off its foe at most: past it, overlapping beats floating far from the head
const IDLE = new Set(['hoe', 'pray']); // at rest: no plate unless hurt, marked or targeted

const style = document.createElement('style');
style.textContent = `
#plates { position: fixed; inset: 0; pointer-events: none; overflow: hidden; } /* first in the body: under every frame of the HUD, like WoW's */
#plates .np { position: absolute; left: 0; top: 0; width: 100px; height: 12px; box-sizing: border-box; transform-origin: 0 0; will-change: transform;
  background: rgba(10,6,4,.82); border: 1px solid #000; border-radius: 2px; box-shadow: 0 0 0 1px rgba(255,255,255,.18), 0 1px 3px rgba(0,0,0,.8);
  font: bold 10px/10px system-ui, sans-serif; color: #fff; text-shadow: -1px 0 #000, 1px 0 #000, 0 -1px #000, 0 1px #000; }
#plates .np.elite { box-shadow: 0 0 0 1px #d9ad52, 0 1px 3px rgba(0,0,0,.8); }
#plates .np.tg { z-index: 1; box-shadow: 0 0 0 2px #ff2a1a, 0 0 8px rgba(255,40,20,.7); }
#plates .fill { position: absolute; inset: 0; transform-origin: 0 0; background: linear-gradient(#ff4a36, #b8160c 60%, #8a0e06); }
#plates .pc { position: absolute; inset: 0; text-align: center; line-height: 10px; }
#plates .lv { position: absolute; right: 2px; top: 0; line-height: 10px; }
#plates .lv.boss::after { content: '☠'; color: #ff4030; }
#plates .top { position: absolute; left: 50%; bottom: calc(100% + 1px); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; }
#plates .nm { white-space: nowrap; font: bold 12px/14px Georgia, serif; }
#plates .elite .nm { color: #ffd36a; }
#plates .own > :is(.fill, .pc, .lv), #plates .own .nm { display: none; }
#plates .own, #plates .own.tg { background: none; border-color: transparent; box-shadow: none; }
#plates .aus { display: flex; gap: 2px; margin-bottom: 1px; }
#plates .far .aus, #plates .far .cn { display: none; }
#plates .more { align-self: center; font-size: 11px; }
#plates .cast { position: absolute; left: -1px; right: -1px; top: calc(100% + 2px); height: 10px; background: #140c08; border: 1px solid #000; border-radius: 2px; }
#plates .cast[hidden] { display: none; }
#plates .cf { position: absolute; inset: 0; transform-origin: 0 0; background: linear-gradient(#ffd24a, #c88a10); }
#plates .cast.ch .cf { background: linear-gradient(#a8ff6a, #3e9a12); }
#plates .cn { position: absolute; left: 3px; right: 22px; top: 0; line-height: 10px; white-space: nowrap; overflow: hidden; }
#plates .ct { position: absolute; right: 3px; top: 0; line-height: 10px; }
#plates .ci { position: absolute; left: calc(100% + 3px); bottom: -1px; width: 24px; height: 24px; border: 1px solid #000; border-radius: 2px; box-shadow: 0 0 0 1px #ff9a2a; }
.au { position: relative; width: 22px; height: 22px; box-sizing: border-box; border: 1px solid #000; border-radius: 2px; box-shadow: 0 0 0 1px var(--sc, #888); }
.au[hidden] { display: none; }
.au.poison { --sc: #5fd13a; } .au.fire { --sc: #ff8a2a; } .au.frost { --sc: #4aa8ff; } .au.holy { --sc: #ffd24a; } .au.shadow { --sc: #b06aff; }
.au b, .au em { position: absolute; color: #fff; font-style: normal; text-shadow: -1px 0 #000, 1px 0 #000, 0 -1px #000, 0 1px #000, 0 0 3px #000; }
.au b { left: 50%; top: -6px; transform: translateX(-50%); font: bold 13px/14px system-ui, sans-serif; white-space: nowrap; }
.au em { right: -2px; bottom: -3px; font: bold 10px/11px system-ui, sans-serif; color: #e8ffb0; }
.au.end b { color: #ff6a50; }
#buffs { position: fixed; left: calc(16px + env(safe-area-inset-left)); top: calc(102px + env(safe-area-inset-top)); display: flex; gap: 6px; pointer-events: none; z-index: 4; }
#buffs .au { width: 30px; height: 30px; box-shadow: 0 0 0 1px var(--sc), 0 0 8px color-mix(in srgb, var(--sc) 55%, transparent); }
#buffs .au b { top: auto; bottom: -15px; font-size: 12px; }
#buffs .au em { font-size: 12px; }
#buffs .au.end { animation: buff-end .5s ease-in-out infinite alternate; }
@keyframes buff-end { to { opacity: .35; } }
body.touch #buffs { top: calc(72px + env(safe-area-inset-top)); }
`;
document.head.append(style);

/** One aura icon: its painted icon, the seconds left on it, the stacks in the corner; only what changed is written. */
class Slot {
  readonly el = document.createElement('div');
  private ic = document.createElement('span');
  private tm = document.createElement('b');
  private st = document.createElement('em');
  private id = '';
  private shown = '';
  private endAt: number;

  /** `endAt`: s left from which the icon warns it is running out. */
  constructor(endAt: number) {
    this.endAt = endAt;
    this.ic.className = 'ic';
    this.el.append(this.ic, this.tm, this.st);
    this.el.hidden = true;
  }

  set(a: Aura | undefined): void {
    if (!a) { if (this.id) { this.id = this.shown = ''; this.el.hidden = true; } return; }
    if (a.icon !== this.id) {
      this.id = a.icon;
      this.ic.innerHTML = ICONS[a.icon] ?? '';
      this.el.className = `au ${a.school}`;
      this.el.title = a.name;
      this.el.hidden = false;
    }
    const t = clock(a.t), n = a.n && a.n > 1 ? String(a.n) : '', key = `${t}|${n}`;
    if (key === this.shown) return;
    this.shown = key;
    this.tm.textContent = t;
    this.st.textContent = n;
    this.el.classList.toggle('end', a.t <= this.endAt);
  }
}

/** A row of slots and its "+N". */
class Row {
  readonly el = document.createElement('div');
  private slots: Slot[];
  private more = document.createElement('span');
  private extra = -1;

  constructor(n: number, endAt: number) {
    this.slots = Array.from({ length: n }, () => new Slot(endAt));
    this.more.className = 'more';
    this.el.append(...this.slots.map((s) => s.el), this.more);
  }

  /** Icons shown at the last `set`. */
  n = 0;

  set(auras: readonly Aura[]): void {
    this.n = Math.min(auras.length, this.slots.length);
    this.slots.forEach((s, i) => s.set(auras[i]));
    const extra = Math.max(0, auras.length - this.slots.length);
    if (extra !== this.extra) this.more.textContent = (this.extra = extra) ? `+${extra}` : '';
  }
}

/** One foe's plate; the box is the health bar, the icons and the name sit above it, the cast bar under it. */
class Plate {
  readonly el = document.createElement('div');
  kind!: Kind;
  mob!: Mob;
  readonly row = new Row(ICONS_MAX, 3);
  private nm = document.createElement('b');
  private fill = document.createElement('i');
  private pc = document.createElement('span');
  private lv = document.createElement('span');
  private cast = document.createElement('div');
  private cf = document.createElement('i');
  private cn = document.createElement('span');
  private ct = document.createElement('span');
  private ci = document.createElement('span');
  private state = { hp: -1, pc: '', lv: '', cls: '', spell: '', ct: '', cf: -1, at: '' };

  constructor(layer: HTMLElement) {
    this.el.className = 'np';
    const top = document.createElement('div');
    top.className = 'top';
    this.row.el.className = 'aus';
    this.nm.className = 'nm';
    top.append(this.row.el, this.nm);
    this.fill.className = 'fill';
    this.pc.className = 'pc';
    this.lv.className = 'lv';
    this.cast.className = 'cast';
    this.cf.className = 'cf';
    this.cn.className = 'cn';
    this.ct.className = 'ct';
    this.ci.className = 'ci';
    this.cast.append(this.cf, this.cn, this.ct, this.ci);
    this.cast.hidden = true;
    this.el.append(this.fill, this.pc, this.lv, top, this.cast);
    this.el.hidden = true;
    layer.append(this.el);
  }

  bind(kind: Kind, mob: Mob): void {
    this.kind = kind;
    this.mob = mob;
    this.nm.textContent = kind.name;
    this.state = { hp: -1, pc: '', lv: '', cls: '', spell: '', ct: '', cf: -1, at: '' };
    this.el.style.visibility = 'hidden'; // until placed
    this.el.hidden = false;
  }

  free(): void {
    this.el.hidden = true;
  }

  /** Moved to screen point (x, y) at scale `s`, or out of sight with NaN; `at` is the transform as last written. */
  place(x: number, y: number, s: number): void {
    const at = Number.isNaN(x) ? '' : `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${s.toFixed(3)}) translate(-50%,-100%)`;
    if (at === this.state.at) return;
    if (!at !== !this.state.at) this.el.style.visibility = at ? '' : 'hidden';
    if (at) this.el.style.transform = at;
    this.state.at = at;
  }

  /** Every frame: the health and the cast bar's fill. With `redraw`: the text, the frame, the icons too. */
  update(redraw: boolean, cls: string, heroLv: number, marks: Marks): void {
    const m = this.mob, k = this.kind, st = this.state;
    if (cls !== st.cls) this.el.className = st.cls = cls;
    const r = Math.max(0, Math.min(1, m.hp / k.max));
    if (r !== st.hp) {
      this.fill.style.transform = `scaleX(${(st.hp = r).toFixed(4)})`;
      const pc = `${Math.ceil(r * 100)}%`;
      if (pc !== st.pc) this.pc.textContent = st.pc = pc;
    }
    const c = castOf(m);
    this.cast.hidden = !c;
    if (c) {
      const f = Math.min(1, c.t / c.total), w = c.channel ? 1 - f : f;
      if (w !== st.cf) this.cf.style.transform = `scaleX(${(st.cf = w).toFixed(3)})`;
      if (c.name !== st.spell) {
        this.cn.textContent = st.spell = c.name;
        this.ci.innerHTML = ICONS[c.icon] ?? '';
        this.cast.classList.toggle('ch', !!c.channel);
      }
      const ct = Math.max(0, c.total - c.t).toFixed(1);
      if (redraw && ct !== st.ct) this.ct.textContent = st.ct = ct;
    } else st.spell = '';
    if (!redraw) return;
    const lv = k.lv === undefined ? 'boss' : `${k.lv}|${heroLv}`;
    if (lv !== st.lv) {
      st.lv = lv;
      this.lv.className = k.lv === undefined ? 'lv boss' : 'lv';
      this.lv.textContent = k.lv === undefined ? '' : String(k.lv);
      this.lv.style.color = k.lv === undefined ? '' : hue(k.lv - heroLv);
    }
    this.row.set(foeAuras(m, marks));
  }
}

/** WoW's level colours, by how far above (+) or below the hero the foe stands. */
const hue = (d: number) => (d >= 5 ? '#ff2020' : d >= 3 ? '#ff8a20' : d >= -2 ? '#ffe020' : d >= -7 ? '#40e040' : '#a0a0a0');

export class Plates {
  private layer = document.createElement('div');
  private on = new Map<Mob, Plate>();
  private spare: Plate[] = [];
  private redraw = 0;
  private v = new THREE.Vector3();
  private hero = new THREE.Vector3();
  private kinds: readonly Kind[];
  private camera: THREE.Camera;
  private marks: Marks;
  private target: () => Mob | undefined;

  /** `marks`: the grimoire's poisons and candles; `target`: the selected foe. */
  constructor(kinds: readonly Kind[], camera: THREE.Camera, marks: Marks, target: () => Mob | undefined) {
    this.kinds = kinds;
    this.camera = camera;
    this.marks = marks;
    this.target = target;
    this.layer.id = 'plates';
    document.body.prepend(this.layer);
  }

  /** Per frame, after the camera moved. `hero`: the hero's feet; `heroLv` colours the levels. */
  update(dt: number, hero: THREE.Vector3, heroLv: number): void {
    const tg = this.target(), want: { kind: Kind; mob: Mob; d: number }[] = [];
    for (const kind of this.kinds) {
      if (!kind.ready()) continue;
      for (const mob of kind.all) {
        if (mob.state === 'dead') continue;
        const d = Math.hypot(mob.x - hero.x, mob.z - hero.z);
        if (d > RANGE || (mob !== tg && IDLE.has(mob.state) && mob.hp >= kind.max && !marked(mob, this.marks))) continue;
        want.push({ kind, mob, d: mob === tg ? -1 : d });
      }
    }
    want.sort((a, b) => a.d - b.d).length = Math.min(want.length, MAX);
    const keep = new Set(want.map((w) => w.mob));
    for (const [m, p] of this.on) if (!keep.has(m)) { p.free(); this.on.delete(m); this.spare.push(p); }
    const fresh = new Set<Plate>();
    for (const w of want) if (!this.on.has(w.mob)) {
      const p = this.spare.pop() ?? new Plate(this.layer);
      p.bind(w.kind, w.mob);
      this.on.set(w.mob, p);
      fresh.add(p);
    }

    const redraw = (this.redraw -= dt) <= 0;
    if (redraw) this.redraw = REDRAW;
    const cam = this.camera.position, ref = Math.max(cam.distanceTo(this.hero.set(hero.x, hero.y + 1.6, hero.z)), 4) + FULL, W = innerWidth, H = innerHeight; // both views, any zoom, a lens pushed in by a wall
    const base = Math.min(1.35, Math.max(0.9, H / 400));
    const placed: { l: number; r: number; t: number; b: number }[] = [];
    for (const { mob: m } of want) { // nearest first: it keeps its spot, the ones behind stack up over it, like WoW's
      const p = this.on.get(m)!, own = !!p.kind.ownBar?.();
      const at = this.v.set(m.x, m.y + p.kind.height + OVER, m.z), s = Math.max(MIN_S, Math.min(1, ref / Math.max(cam.distanceTo(at), 0.1)));
      at.project(this.camera);
      const x = ((at.x + 1) / 2) * W, k = s * base * (m === tg ? 1 : OTHER), far = s < FAR_S;
      let y = ((1 - at.y) / 2) * H;
      if (at.z > 1 || x < -80 || x > W + 80 || y < -40 || y > H + 80) { p.place(NaN, 0, 0); continue; } // behind the lens or off the screen
      const half = (W_PX / 2) * k, up = (UP + (far || !p.row.n ? 0 : ICON_ROW)) * k, down = DOWN * k;
      y = Math.max(y, up + (own ? BOSS_BAR : 0)); // on the screen, and under the boss bar
      const y0 = y;
      const hits = (y: number) => placed.some((o) => x - half < o.r && x + half > o.l && y + down > o.t && y - up < o.b);
      if (hits(y)) { // the nearest free spot just over or under a plate in the way, not too far off the head; none: it overlaps
        for (const o of placed) for (const c of [o.t - down, o.b + up]) if (Math.abs(c - y0) <= STACK * k && (y === y0 || Math.abs(c - y0) < Math.abs(y - y0)) && !hits(c)) y = c;
      }
      placed.push({ l: x - half, r: x + half, t: y - up, b: y + down });
      p.place(x, y, k);
      const cls = `np${m === tg ? ' tg' : ''}${p.kind.rank === 'elite' ? ' elite' : ''}${own ? ' own' : ''}${far ? ' far' : ''}`;
      p.update(redraw || fresh.has(p), cls, heroLv, this.marks);
    }
  }
}

/** The hero's buffs under the player frame, WoW style: the same icons and timers as the plates'. */
export class HeroAuras {
  private row = new Row(8, 10);
  private t = 0;

  constructor() {
    this.row.el.id = 'buffs';
    document.body.append(this.row.el);
  }

  /** `auras` is only read every REDRAW s. */
  update(dt: number, auras: () => readonly Aura[]): void {
    if ((this.t -= dt) > 0) return;
    this.t = REDRAW;
    this.row.set(auras());
  }
}
