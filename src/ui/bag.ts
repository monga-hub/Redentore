import { playSfx } from '../audio/engine.ts';
import { Bag, ITEM, RARITY, type Icon } from '../loot/bag.ts';

// The bag, Diablo style: B (or the satchel button under the gear) opens a framed grid of slots
// with what was picked up, a tooltip per item (name in its rarity's colour, rarity, lore, count)
// and the gold. Nothing to do with it yet: a vendor or equipment will read the same Bag. The game
// pauses while it is open, like the map; B, Esc, the ✕ or a click outside close it. Styled here, like ui/menu.ts.

const CSS = `
#bag-btn { position: fixed; z-index: 6; right: calc(12px + env(safe-area-inset-right)); top: calc(56px + env(safe-area-inset-top));
  width: 36px; height: 36px; padding: 0; cursor: pointer; border-radius: 50%; color: #f3e2b0;
  background: radial-gradient(circle at 40% 35%, #4a3a26, #120d09); border: 2px solid #c9a45c;
  box-shadow: 0 0 0 2px #000, 0 3px 10px rgba(0,0,0,.7); touch-action: manipulation; }
#bag-btn:hover, #bag-btn:focus-visible { border-color: #ffd75e; filter: brightness(1.2); outline: none; }
#bag-btn svg { display: block; width: 60%; height: 60%; margin: auto; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; }
#bag-btn.got { animation: baggot .5s ease-out; }
@keyframes baggot { 30% { transform: scale(1.25); border-color: #ffd75e; box-shadow: 0 0 0 2px #000, 0 0 14px 4px rgba(255,200,90,.8); } }
body.touch #bag-btn { top: calc(100px + env(safe-area-inset-top)); transform: scale(calc(var(--k) / .72)); transform-origin: 100% 0; }
body.diablo #bag-btn { background: radial-gradient(circle at 40% 35%, #3a3530, #0a0908); border-color: #77705f; color: #e9d6b0; }
#bag { position: fixed; inset: 0; z-index: 15; display: none; align-items: center; justify-content: center;
  background: rgba(0,0,0,.5); font: 15px/1.35 Georgia, serif; color: #f3e2b0; user-select: none; }
#bag.show { display: flex; }
#bag .panel { position: relative; box-sizing: border-box; padding: 26px 14px 12px;
  background: linear-gradient(rgba(34,25,16,.97), rgba(10,7,5,.97));
  border: 2px solid #c9a45c; border-radius: 8px; box-shadow: 0 0 0 2px #000, inset 0 0 0 1px #4a3a26, 0 10px 40px #000; }
#bag h2 { position: absolute; left: 50%; top: -14px; transform: translateX(-50%); margin: 0; padding: 4px 22px; white-space: nowrap;
  font: bold 15px/20px Georgia, serif; color: #ffd75e; letter-spacing: 1px; text-shadow: 0 1px 2px #000;
  background: linear-gradient(#3a2a18, #120d09); border: 2px solid #c9a45c; border-radius: 4px; box-shadow: 0 0 0 1px #000; }
#bag .x { position: absolute; right: 6px; top: 6px; width: 26px; height: 26px; padding: 0; cursor: pointer; font: bold 16px/1 system-ui, sans-serif;
  color: #f3e2b0; background: linear-gradient(#7a1a10, #3a0805); border: 1px solid #c9a45c; border-radius: 4px; }
#bag .grid { display: grid; grid-template-columns: repeat(6, var(--s)); gap: 4px; --s: min(46px, calc((100vw - 80px) / 6), calc((100dvh - 120px) / 5)); }
#bag .cell { position: relative; width: var(--s); height: var(--s); box-sizing: border-box; padding: 0; border-radius: 3px; cursor: default;
  background: radial-gradient(circle at 50% 40%, #1e1610, #070504); border: 1px solid #3b2a16; box-shadow: inset 0 0 8px #000; color: inherit; }
#bag .cell[data-i] { cursor: pointer; border-color: var(--c); box-shadow: inset 0 0 10px #000, inset 0 0 0 1px rgba(0,0,0,.6), 0 0 5px -1px var(--c); }
#bag .cell[data-i]:hover, #bag .cell.sel { filter: brightness(1.35); outline: none; }
#bag .cell svg { display: block; width: 78%; height: 78%; margin: auto; fill: none; stroke: var(--c); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
#bag .cell b { position: absolute; right: 3px; bottom: 1px; font: bold 11px system-ui, sans-serif; color: #fff; text-shadow: 1px 1px 0 #000, -1px -1px 0 #000; }
#bag .foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 10px; font: 12px/16px system-ui, sans-serif; color: #c9b48a; }
#bag .gold { color: #ffd75e; font: bold 16px Georgia, serif; text-shadow: 0 1px 2px #000; }
#bag .gold i { display: inline-block; width: 12px; height: 12px; margin-right: 6px; vertical-align: -1px; border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #fff3b0, #ffcf4a 45%, #8a5a00); box-shadow: 0 0 0 1px #000; }
body.touch #bag .keys { display: none; }
#bag .tip { position: fixed; z-index: 16; box-sizing: border-box; width: max-content; max-width: min(240px, calc(100vw - 24px)); padding: 8px 10px; pointer-events: none;
  background: rgba(8,6,4,.96); border: 1px solid #6b5332; border-radius: 4px; box-shadow: 0 0 0 1px #000, 0 4px 14px #000; }
#bag .tip[hidden] { display: none; }
#bag .tip b { display: block; font: bold 14px/18px Georgia, serif; }
#bag .tip small { display: block; font: 11px/15px system-ui, sans-serif; color: #c9b48a; }
#bag .tip p { margin: 6px 0 0; font: italic 12px/1.35 Georgia, serif; color: #e8dcc0; }
`;

const SVG = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
/** Glyphs per kind of item, stroked in the rarity's colour. */
const GLYPH: Record<Icon, string> = {
  rosary: SVG('<circle cx="12" cy="9" r="6" stroke-dasharray="1.6 1.6"/><path d="M12 15v5M10 18h4"/>'),
  candle: SVG('<path d="M9 21h6M10 21V9h4v12M12 9V7"/><path d="M12 7c-1.5-1.5-1-3 0-4.5 1 1.5 1.5 3 0 4.5z"/>'),
  bone: SVG('<path d="M7 17l10-10"/><circle cx="5.5" cy="16.5" r="1.8"/><circle cx="7.5" cy="18.5" r="1.8"/><circle cx="16.5" cy="5.5" r="1.8"/><circle cx="18.5" cy="7.5" r="1.8"/>'),
  relic: SVG('<path d="M5 9h14v11H5zM5 9l2-4h10l2 4M12 12v5M10 14h4"/>'),
  medal: SVG('<path d="M8 3l4 6 4-6"/><circle cx="12" cy="15" r="5.5"/><path d="M12 12.5v5M10 15h4"/>'),
  vial: SVG('<path d="M10 3h4M10.5 3v5L7 14a5 5 0 1 0 10 0l-3.5-6V3"/><path d="M8 15h8"/>'),
  skull: SVG('<path d="M5 11a7 7 0 0 1 14 0v3l-2 1v4H7v-4l-2-1z"/><circle cx="9.5" cy="12" r="1.6"/><circle cx="14.5" cy="12" r="1.6"/><path d="M10 19v-2M14 19v-2M12 16v-1"/>'),
  nail: SVG('<path d="M7 4h10M12 4v15l-1 2"/><path d="M9 6h6"/>'),
};
const SATCHEL = SVG('<path d="M5 9h14l-1 11H6zM9 9V6a3 3 0 0 1 6 0v3M5 9l1 4h12l1-4M12 13v2"/>');

export class BagPanel {
  private el = document.createElement('div');
  private grid: HTMLElement;
  private gold: HTMLElement;
  private tip: HTMLElement;
  private btn = document.createElement('button');
  private shown = false;
  private seen = '';
  private readonly bag: Bag;
  /** Called as it opens, to stop casts, drags and click-to-move. */
  opened = () => {};

  constructor(bag: Bag) {
    this.bag = bag;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.btn.id = 'bag-btn';
    this.btn.setAttribute('aria-label', 'Borsa (B)');
    this.btn.title = 'Borsa (B)';
    this.btn.innerHTML = SATCHEL;
    this.btn.addEventListener('click', () => this.toggle());
    this.el.id = 'bag';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-label', 'Borsa');
    this.el.innerHTML = `<div class="panel"><h2>Borsa</h2><button class="x" aria-label="Chiudi borsa">✕</button>
      <div class="grid"></div><div class="foot"><span class="gold"></span><span class="keys">B · Esc</span></div></div><div class="tip" hidden></div>`;
    this.grid = this.el.querySelector('.grid')!;
    this.gold = this.el.querySelector('.gold')!;
    this.tip = this.el.querySelector('.tip')!;
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
    this.el.querySelector('.x')!.addEventListener('click', () => this.close());
    this.grid.addEventListener('pointerover', (e) => this.hint(e.target as HTMLElement));
    this.grid.addEventListener('pointerleave', () => this.hint(null));
    this.grid.addEventListener('click', (e) => this.hint(e.target as HTMLElement)); // a tap shows it on touch
    addEventListener('keydown', (e) => { // capture: while the bag is up, game keys stay out of it (main.ts opens it on B)
      if (!this.shown) return;
      e.stopPropagation();
      if ((e.code === 'KeyB' || e.code === 'Escape') && !e.repeat) this.close();
    }, true);
    document.body.append(this.btn, this.el);
  }

  get open(): boolean {
    return this.shown;
  }

  toggle(): void {
    if (this.shown) return this.close();
    if (document.pointerLockElement) document.exitPointerLock();
    this.opened();
    this.shown = true;
    this.seen = '';
    this.render();
    this.el.classList.add('show');
    playSfx('ui_open', null, { ui: true });
    this.el.querySelector<HTMLElement>('.x')!.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.shown) return;
    this.shown = false;
    this.hint(null);
    this.el.classList.remove('show');
    playSfx('ui_close', null, { ui: true });
  }

  /** Per frame: the button pulses when something new goes in; the open grid follows the bag. */
  update(): void {
    const key = JSON.stringify(this.bag.encode());
    if (key === this.seen) return;
    if (this.seen && !this.shown) { this.btn.classList.remove('got'); void this.btn.offsetWidth; this.btn.classList.add('got'); }
    this.seen = key;
    if (this.shown) this.render();
  }

  private render(): void {
    this.seen = JSON.stringify(this.bag.encode());
    this.gold.innerHTML = `<i></i>${this.bag.gold.toLocaleString('it-IT')} oro`;
    this.grid.innerHTML = Array.from({ length: Bag.SLOTS }, (_, i) => {
      const s = this.bag.items[i], it = s && ITEM.get(s.id);
      if (!it) return '<div class="cell"></div>';
      return `<button class="cell" data-i="${i}" style="--c: ${RARITY[it.rarity].color}" aria-label="${it.name}${s.n > 1 ? `, ${s.n}` : ''}">${GLYPH[it.icon]}${s.n > 1 ? `<b>${s.n}</b>` : ''}</button>`;
    }).join('');
  }

  private hint(t: HTMLElement | null): void {
    const slot = t?.closest<HTMLElement>('.cell[data-i]');
    for (const s of this.grid.querySelectorAll('.sel')) s.classList.remove('sel');
    const s = slot && this.bag.items[Number(slot.dataset.i)], it = s && ITEM.get(s.id);
    if (!slot || !s || !it) { this.tip.hidden = true; return; }
    slot.classList.add('sel');
    const r = RARITY[it.rarity];
    this.tip.innerHTML = `<b style="color: ${r.color}">${it.name}</b><small>${r.name}${s.n > 1 ? ` · ${s.n} pezzi` : ''}</small><p>${it.lore}</p>`;
    const p = this.el.querySelector('.panel')!.getBoundingClientRect(), room = Math.max(p.left, innerWidth - p.right) - 16;
    this.tip.style.maxWidth = room >= 140 ? `${Math.min(room, 240)}px` : ''; // narrow enough to sit beside the panel on a phone
    this.tip.hidden = false;
    const b = slot.getBoundingClientRect(), w = this.tip.offsetWidth, h = this.tip.offsetHeight;
    const left = p.left - w - 8, right = p.right + 8, side = left >= 8 || right + w <= innerWidth - 8; // beside the panel, else above or below the slot
    this.tip.style.left = `${side ? (left >= 8 ? left : right) : Math.min(Math.max(8, b.left + b.width / 2 - w / 2), innerWidth - w - 8)}px`;
    this.tip.style.top = `${side ? Math.min(Math.max(8, b.top), innerHeight - h - 8) : b.top - h - 8 < 8 ? b.bottom + 8 : b.top - h - 8}px`;
  }
}
