import { playSfx } from '../audio/engine.ts';
import { Bag, ITEM, RARITY } from '../loot/bag.ts';
import { sellPrice, type Equipment } from '../loot/gear.ts';
import { ICONS } from './icons.ts';
import { TIP_CSS, itemTip } from './tooltip.ts';

// The bag, Diablo style: B (or the satchel button under the gear) opens a framed grid of slots
// with what was picked up and the gold. Its overlay also hosts the character sheet (ui/sheet.ts)
// and Fra' Bortolo's shop (ui/vendor.ts), side by side with the bag, WoW style. Every slot of
// every panel is a cell keyed "kind:what" (b: bag slot, w: worn slot, s: shop goods, r: buyback);
// hovering one (tapping it, on touch) shows the tooltip, a click on the shown one uses it: a bag
// piece is worn (or sold, while the shop is open), a worn one taken off, goods bought. The game
// pauses while the overlay is up, like the map; B, C, Esc, the ✕ or a click outside close panels.

const CSS = `
#bag-btn, #sheet-btn { position: fixed; z-index: 6; right: calc(12px + env(safe-area-inset-right)); top: calc(56px + env(safe-area-inset-top));
  width: 38px; height: 38px; padding: 0; cursor: pointer; border-radius: 50%;
  box-shadow: 0 0 0 1px #000, 0 3px 10px rgba(0,0,0,.7); touch-action: manipulation; }
#sheet-btn { top: calc(100px + env(safe-area-inset-top)); }
#bag-btn:hover, #bag-btn:focus-visible, #sheet-btn:hover, #sheet-btn:focus-visible { filter: brightness(1.25); outline: none; }
#bag-btn.got, #sheet-btn.got { animation: baggot .5s ease-out; }
@keyframes baggot { 30% { transform: scale(1.25); box-shadow: 0 0 0 1px #000, 0 0 14px 4px rgba(255,200,90,.8); } }
/* Touch: gear, bag, figure and book (ui/book.ts) one under the other, 44 px apart at --k .72, clear of the thumb arc's top button. */
body.touch #bag-btn { top: calc(12px + 44px * var(--k) / .72 + env(safe-area-inset-top)); transform: scale(calc(var(--k) / .72)); transform-origin: 100% 0; }
body.touch #sheet-btn { top: calc(12px + 88px * var(--k) / .72 + env(safe-area-inset-top)); transform: scale(calc(var(--k) / .72)); transform-origin: 100% 0; }
#bag { position: fixed; inset: 0; z-index: 15; display: none; align-items: center; justify-content: center; overflow: auto;
  background: rgba(0,0,0,.5); font: 15px/1.35 Georgia, serif; color: #f3e2b0; user-select: none;
  --s: min(46px, calc((100vw - 80px) / 6), calc((100dvh - 120px) / 5)); }
#bag.duo { --s: min(46px, calc((100vw - 150px) / 12), calc((100dvh - 110px) / 5.6)); }
#bag.show { display: flex; }
#bag .row { display: flex; align-items: flex-start; justify-content: center; gap: 12px; margin: auto; padding: 22px 8px 8px; }
#bag .panel { position: relative; display: none; box-sizing: border-box; padding: 26px 14px 12px;
  border: 3px solid transparent; border-radius: 8px; background: var(--panel); box-shadow: var(--panel-shadow); }
#bag .panel.on { display: block; }
#bag h2 { position: absolute; left: 50%; top: -14px; transform: translateX(-50%); margin: 0; padding: 4px 22px; white-space: nowrap;
  font: bold 15px/20px Georgia, serif; color: #ffd75e; letter-spacing: 1px; text-shadow: 0 1px 2px #000;
  border: 2px solid transparent; border-radius: 4px; background: linear-gradient(#4a3420, #140e08) padding-box, var(--gilt) border-box; box-shadow: 0 0 0 1px #000, 0 3px 8px rgba(0,0,0,.6); }
#bag .x { position: absolute; right: 6px; top: 6px; width: 26px; height: 26px; padding: 0; cursor: pointer; font: bold 16px/1 system-ui, sans-serif;
  color: #f3e2b0; background: linear-gradient(#7a1a10, #3a0805); border: 1px solid #c9a45c; border-radius: 4px; }
#bag .grid { display: grid; grid-template-columns: repeat(6, var(--s)); gap: 4px; }
/* A slot, WoW style: a recessed dark socket; an item fills it with its painting, framed in its quality's
   colour (--c) under a bevel (lit top-left, shaded bottom-right) and a faint glow of the same colour. */
#bag .cell { position: relative; width: var(--s); height: var(--s); box-sizing: border-box; padding: 0; overflow: hidden; border-radius: 3px; cursor: default;
  background: radial-gradient(circle at 50% 40%, #1e1610, #070504); border: 1px solid #000; box-shadow: inset 0 0 8px #000, 0 0 0 1px rgba(217,173,82,.22); color: inherit; }
#bag .cell[data-k] { cursor: pointer; }
#bag .cell[data-k][style] { box-shadow: 0 0 0 1px #000, 0 0 6px -1px var(--c); }
#bag .cell::after { content: ''; position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
  box-shadow: inset 0 0 0 2px var(--c, transparent), inset 0 0 0 3px rgba(0,0,0,.55), inset 3px 3px 2px -1px rgba(255,240,200,.16), inset -3px -3px 3px -1px rgba(0,0,0,.6); }
#bag .cell[data-k]:hover, #bag .cell.sel { filter: brightness(1.3); outline: none; }
#bag .cell.sel { outline: 1px solid #ffd75e; outline-offset: 1px; }
#bag .cell .ico { position: absolute; inset: 0; width: auto; height: auto; }
#bag .cell b { position: absolute; z-index: 1; right: 4px; bottom: 2px; font: bold 11px system-ui, sans-serif; color: #fff; text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }
body.diablo #bag .cell .ico { filter: var(--ember); }
#bag .foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 10px; font: 12px/16px system-ui, sans-serif; color: #c9b48a; }
#bag .gold { color: #ffd75e; font: bold 16px Georgia, serif; text-shadow: 0 1px 2px #000; white-space: nowrap; }
#bag .gold i, #bag .coin { display: inline-block; width: 12px; height: 12px; margin-right: 6px; vertical-align: -1px; border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #fff3b0, #ffcf4a 45%, #8a5a00); box-shadow: 0 0 0 1px #000; }
#bag .say { position: fixed; left: 50%; bottom: 14%; z-index: 17; transform: translateX(-50%); padding: 6px 14px; pointer-events: none; white-space: nowrap;
  font: bold 15px Georgia, serif; color: #ff5a4a; text-shadow: 0 1px 2px #000; background: rgba(8,6,4,.85); border: 1px solid #6b5332; border-radius: 4px; }
#bag .say.ok { color: #ffd75e; }
#bag .say[hidden] { display: none; }
body.touch #bag .keys { display: none; }
@media (max-aspect-ratio: 1/1) {
  #bag .row { flex-direction: column; align-items: center; }
  #bag.duo { --s: min(46px, calc((100vw - 80px) / 6), calc((100dvh - 210px) / 10.6)); }
}
${TIP_CSS}`;

/** One kind of cell: its tooltip (with `tap` true on touch), and what a click on the shown one does. */
export interface Kind { tip(what: string, tap: boolean): string; use(what: string): void }

export class BagPanel {
  readonly el = document.createElement('div');
  private row: HTMLElement;
  private panel: HTMLElement;
  private grid: HTMLElement;
  private gold: HTMLElement;
  private tip: HTMLElement;
  private sayEl: HTMLElement;
  private sayT = 0;
  private btn = document.createElement('button');
  readonly sheetBtn = document.createElement('button');
  private seen = '';
  private sel?: HTMLElement;
  private readonly bag: Bag;
  private readonly gear: Equipment;
  private kinds: Record<string, Kind> = {};
  private renders: (() => void)[] = [];
  /** Keys handled while the overlay is up (main.ts opens it on B and C). */
  readonly keys: Record<string, () => void> = { KeyB: () => this.toggle() };
  /** Set while the shop is open: a click on a bag slot sells it. */
  selling?: (i: number) => void;
  /** Called as it opens, to stop casts, drags and click-to-move. */
  opened = () => {};

  constructor(bag: Bag, gear: Equipment) {
    this.bag = bag;
    this.gear = gear;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.btn.id = 'bag-btn';
    this.btn.className = 'orb';
    this.btn.setAttribute('aria-label', 'Borsa (B)');
    this.btn.title = 'Borsa (B)';
    this.btn.innerHTML = ICONS.ui_bag;
    this.btn.addEventListener('click', () => this.toggle());
    this.sheetBtn.id = 'sheet-btn';
    this.sheetBtn.className = 'orb';
    this.sheetBtn.setAttribute('aria-label', 'Personaggio (C)');
    this.sheetBtn.title = 'Personaggio (C)';
    this.sheetBtn.innerHTML = ICONS.ui_sheet;
    this.sheetBtn.addEventListener('click', () => this.keys.KeyC?.());
    this.el.id = 'bag';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-label', 'Borsa');
    this.el.innerHTML = `<div class="row"><div class="panel bagp"><h2>Borsa</h2><button class="x" aria-label="Chiudi borsa">✕</button>
      <div class="grid"></div><div class="foot"><span class="gold"></span><span class="keys">B · Esc</span></div></div></div><div class="tip" hidden></div><div class="say" hidden></div>`;
    this.row = this.el.querySelector('.row')!;
    this.panel = this.el.querySelector('.bagp')!;
    this.grid = this.el.querySelector('.grid')!;
    this.gold = this.el.querySelector('.gold')!;
    this.tip = this.el.querySelector('.tip')!;
    this.sayEl = this.el.querySelector('.say')!;
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === this.el || t === this.row) return this.close();
      const x = t.closest<HTMLElement>('.x');
      if (x) return this.show(x.closest<HTMLElement>('.panel')!, false);
      const c = t.closest<HTMLElement>('.cell[data-k]');
      if (!c) return this.select(null);
      if (c === this.sel) this.use(c); // the shown one: hovered with a mouse, tapped once on touch
      else this.select(c, true);
    });
    this.el.addEventListener('pointerover', (e) => { if (e.pointerType === 'mouse') this.select((e.target as HTMLElement).closest<HTMLElement>('.cell[data-k]')); });
    this.kind('b', {
      tip: (what, tap) => {
        const s = this.bag.items[Number(what)], it = ITEM.get(s.id)!;
        const verb = it.quest ? '' : this.selling ? `vendi per ${(sellPrice(it) * s.n).toLocaleString('it-IT')} oro` : it.slot ? 'indossa' : '';
        return itemTip(it, { n: s.n, worn: it.slot ? ITEM.get(this.gear.worn[it.slot] ?? '') : null, hint: verb && `${tap ? 'Tocca di nuovo' : 'Clic'}: ${verb}` });
      },
      use: (what) => {
        const i = Number(what), it = ITEM.get(this.bag.items[i]?.id ?? '');
        if (!it) return;
        if (it.quest) return this.say(it.id === 'corona-zuane' ? 'Fra’ Zuane la aspetta, sulla fondamenta.' : 'Mastro Iseppo lo aspetta, allo squero.');
        if (this.selling) return this.selling(i);
        if (!it.slot) return this.say('Questo non si indossa: Fra’ Bortolo potrebbe comprarlo.');
        this.say(this.gear.wear(this.bag, i));
        playSfx('ui_click', null, { ui: true, rate: 0.8 });
      },
    });
    addEventListener('keydown', (e) => { // capture: while the overlay is up, game keys stay out of it (main.ts opens it on B and C)
      if (!this.open) return;
      e.stopPropagation();
      if (e.repeat) return;
      if (e.code === 'Escape') this.close();
      else this.keys[e.code]?.();
    }, true);
    document.body.append(this.btn, this.sheetBtn, this.el);
  }

  /** Register the cells keyed `prefix:...` of another panel, and a render for when anything changes. */
  kind(prefix: string, k: Kind, render?: () => void): void {
    this.kinds[prefix] = k;
    if (render) this.renders.push(render);
  }

  /** Put another panel (the sheet, the shop) in the overlay, left of the bag. */
  mount(panel: HTMLElement): void {
    this.row.insertBefore(panel, this.panel);
  }

  get open(): boolean {
    return this.el.classList.contains('show');
  }

  get bagShown(): boolean {
    return this.panel.classList.contains('on');
  }

  /** Show or hide one panel; the overlay follows (and the game pauses with it). */
  show(panel: HTMLElement = this.panel, on = true): void {
    if (panel.classList.contains('on') === on) return;
    const was = this.open;
    panel.classList.toggle('on', on);
    const n = this.row.querySelectorAll('.panel.on').length;
    this.el.classList.toggle('duo', n > 1);
    this.el.classList.toggle('show', n > 0);
    this.select(null);
    if (on && !was) {
      if (document.pointerLockElement) document.exitPointerLock();
      this.opened();
      this.refresh();
      panel.querySelector<HTMLElement>('.x')?.focus({ preventScroll: true });
    }
    if (on) this.refresh();
    playSfx(on ? 'ui_open' : 'ui_close', null, { ui: true });
    if (!n) this.selling = undefined;
    for (const p of this.row.querySelectorAll<HTMLElement>('.panel')) if (!p.classList.contains('on')) p.dispatchEvent(new Event('hidden'));
  }

  toggle(): void {
    this.show(this.panel, !this.bagShown);
  }

  close(): void {
    for (const p of this.row.querySelectorAll<HTMLElement>('.panel.on')) this.show(p, false);
  }

  /** A short line over the panels: an error in red, or `ok` news in gold. '' says nothing. */
  say(text: string, ok = false): void {
    if (!text) return;
    if (!ok) playSfx('ui_error', null, { ui: true });
    this.sayEl.textContent = text;
    this.sayEl.classList.toggle('ok', ok);
    this.sayEl.hidden = false;
    clearTimeout(this.sayT);
    this.sayT = window.setTimeout(() => { this.sayEl.hidden = true; }, 2200);
  }

  /** Per frame: the buttons pulse when something new goes in. */
  update(): void {
    const key = JSON.stringify(this.bag.encode());
    if (key === this.seen) return;
    if (this.seen && !this.open) { this.btn.classList.remove('got'); void this.btn.offsetWidth; this.btn.classList.add('got'); }
    this.seen = key;
    if (this.open) this.refresh();
  }

  /** Redraw every panel (after a wear, a sale, a purchase). */
  refresh(): void {
    this.seen = JSON.stringify(this.bag.encode());
    this.gold.innerHTML = `<i></i>${this.bag.gold.toLocaleString('it-IT')} oro`;
    this.grid.innerHTML = Array.from({ length: Bag.SLOTS }, (_, i) => {
      const s = this.bag.items[i], it = s && ITEM.get(s.id);
      if (!it) return '<div class="cell"></div>';
      return `<button class="cell" data-k="b:${i}" style="--c: ${RARITY[it.rarity].color}" aria-label="${it.name}${s.n > 1 ? `, ${s.n}` : ''}">${ICONS[it.icon]}${s.n > 1 ? `<b>${s.n}</b>` : ''}</button>`;
    }).join('');
    for (const r of this.renders) r();
    this.sel = undefined;
    this.tip.hidden = true;
  }

  private use(c: HTMLElement): void {
    const [k, what] = split(c.dataset.k!);
    this.kinds[k]?.use(what);
    this.refresh();
  }

  /** Show `c`'s tooltip beside the panels (above or below the cell when they fill the width); null hides it. */
  private select(c: HTMLElement | null, tap = false): void {
    this.sel?.classList.remove('sel');
    this.sel = c ?? undefined;
    if (!c) { this.tip.hidden = true; return; }
    c.classList.add('sel');
    const [k, what] = split(c.dataset.k!);
    this.tip.innerHTML = this.kinds[k]?.tip(what, tap && document.body.classList.contains('touch')) ?? '';
    this.tip.hidden = false;
    const panels = [...this.row.querySelectorAll('.panel.on')].map((p) => p.getBoundingClientRect());
    const p = { left: Math.min(...panels.map((r) => r.left)), right: Math.max(...panels.map((r) => r.right)) };
    const room = () => p.left - this.tip.offsetWidth >= 16 || p.right + this.tip.offsetWidth <= innerWidth - 16;
    this.tip.classList.remove('stack'); // the worn piece under the new one instead of beside it, if that fits beside the panels
    if (!room()) { this.tip.classList.add('stack'); if (!room()) this.tip.classList.remove('stack'); }
    const b = c.getBoundingClientRect(), w = this.tip.offsetWidth, h = this.tip.offsetHeight;
    const left = p.left - w - 8, right = p.right + 8, side = left >= 8 || right + w <= innerWidth - 8;
    this.tip.style.left = `${side ? (left >= 8 ? left : right) : Math.min(Math.max(8, b.left + b.width / 2 - w / 2), innerWidth - w - 8)}px`;
    this.tip.style.top = `${side ? Math.min(Math.max(8, b.top), innerHeight - h - 8) : b.top - h - 8 < 8 ? Math.min(b.bottom + 8, innerHeight - h - 8) : b.top - h - 8}px`;
  }
}

const split = (key: string) => [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)] as const;
