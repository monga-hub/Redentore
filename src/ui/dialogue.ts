import { duck, playSfx, unduck } from '../audio/engine.ts';

// The quest-giver's window, WoW style: a parchment page in a gold frame with the speaker's portrait,
// name and greeting over the list of what he has for the hero: yellow "!" a quest on offer, gold "?"
// one ready to hand in, grey "?" one taken and not yet done, a plain line to talk, Commercia for a
// vendor. A title opens the quest's whole text with its objective and reward and Accetta / Rifiuta,
// Completa (or the reward to pick), or Indietro. The game is paused while it is up (main.ts) and keys
// stay out of the game: F, Space or Enter press the first button, Esc or a move key closes it, and so
// do ✕ and a tap off the page. Its DOM is styled here, like the menu.

const CSS = `
#talk { position: fixed; inset: 0; z-index: 19; display: none; align-items: flex-end; justify-content: center;
  padding: 0 12px calc(16px + env(safe-area-inset-bottom)); box-sizing: border-box; background: linear-gradient(transparent 40%, rgba(0,0,0,.55));
  touch-action: auto; user-select: none; }
#talk.show { display: flex; }
#talk .page { position: relative; box-sizing: border-box; display: flex; flex-direction: column; width: min(600px, 100%); max-height: calc(100dvh - 24px);
  padding: 16px 20px 14px 112px; color: #2b1a0c; font: 16px/1.45 Georgia, serif;
  border: 4px solid transparent; border-radius: 6px; background: radial-gradient(ellipse at 30% 20%, #f4e6c2, #e2cc98 60%, #c9ad74) padding-box, var(--gilt) border-box;
  box-shadow: 0 0 0 1px #000, inset 0 0 0 1px #6b4a1f, inset 0 0 30px rgba(110,70,20,.45), 0 10px 40px #000; animation: talk-in .25s ease-out; }
@keyframes talk-in { from { transform: translateY(16px); opacity: 0; } }
#talk .portrait { position: absolute; left: 14px; top: 16px; width: 84px; height: 84px; border-radius: 50%; overflow: hidden;
  border: 4px solid transparent; background: radial-gradient(#2c4048, #070b0d) padding-box, var(--gilt-ring) border-box; box-shadow: 0 0 0 1px #000, 0 0 14px rgba(120,220,255,.45); }
#talk .portrait img { display: block; width: 100%; height: 100%; object-fit: cover; }
#talk .who { margin: 0 34px 2px 0; font: bold 18px Georgia, serif; color: #6a1408; }
#talk .title { margin: 0 0 6px; font: italic 13px Georgia, serif; color: #6b4a1f; }
#talk .title:empty { display: none; }
#talk .body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
#talk p.text { margin: 0 0 8px; white-space: pre-wrap; }
#talk .x { position: absolute; right: 8px; top: 8px; width: 40px; height: 40px; padding: 0; min-width: 0; font: bold 20px/1 Georgia, serif; }
#talk ul { list-style: none; margin: 0; padding: 0; }
#talk li button.q { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; margin: 0 0 6px; padding: 6px 10px; text-align: left;
  color: #3a1f08; text-shadow: none; font: bold 15px Georgia, serif; background: rgba(255,240,200,.45); border: 1px solid #a8844a; box-shadow: none; }
#talk li button.q:hover, #talk li button.q:focus-visible { background: rgba(255,226,140,.7); }
#talk .ic { flex: none; width: 26px; text-align: center; font: bold 22px/1 Georgia, serif; -webkit-text-stroke: 1px #1a0d00; }
#talk .ic.offer { color: #ffd200; } #talk .ic.ready { color: #ffb000; } #talk .ic.busy { color: #8a8478; -webkit-text-stroke: 1px #3a3530; }
#talk .ic.talk, #talk .ic.shop { -webkit-text-stroke: 0; font-size: 18px; color: #6b4a1f; }
#talk .obj { margin: 4px 0 8px; font: 14px/1.4 Georgia, serif; }
#talk .obj b { display: block; color: #6a1408; font-size: 13px; text-transform: uppercase; letter-spacing: .05em; }
#talk .btns { flex: none; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 10px; }
#talk .btns:empty { display: none; }
#talk button { min-width: 112px; min-height: 44px; padding: 9px 16px; cursor: pointer; font: bold 15px Georgia, serif; color: #ffd75e; text-shadow: 0 1px 2px #000;
  border: 2px solid transparent; border-radius: 4px; background: linear-gradient(#9a2216, #520c07 55%, #2e0503) padding-box, var(--gilt) border-box;
  box-shadow: 0 0 0 1px #000, inset 0 1px 0 rgba(255,215,94,.3), 0 2px 5px rgba(0,0,0,.4); touch-action: manipulation; }
#talk button.no { background: linear-gradient(#4a3a26, #1c140c) padding-box, var(--gilt) border-box; }
#talk .btns button:hover, #talk .btns button:focus-visible, #talk .x:hover { filter: brightness(1.35); outline: none; }
#talk kbd { margin-left: 6px; padding: 0 4px; font: 700 11px/1.3 sans-serif; color: #1a1208; background: #e0b55a; border-radius: 3px; text-shadow: none; }
body.touch #talk kbd { display: none; }
body.talking #quest-prompt { display: none !important; }
@media (max-width: 520px) {
  #talk .page { padding: 92px 14px 12px; font-size: 15px; }
  #talk .portrait { left: 50%; top: 10px; margin-left: -36px; width: 72px; height: 72px; }
  #talk .who, #talk .title { text-align: center; margin-right: 0; }
  #talk .btns { justify-content: stretch; }
  #talk .btns button { flex: 1; min-width: 0; }
}
@media (max-height: 430px) { /* a phone on its side: a smaller portrait, the page as tall as the screen allows */
  #talk { padding-bottom: calc(6px + env(safe-area-inset-bottom)); }
  #talk .page { max-height: calc(100dvh - 12px); padding: 10px 14px 10px 84px; font-size: 15px; }
  #talk .portrait { left: 10px; top: 10px; width: 60px; height: 60px; }
}
body.diablo #talk .page { color: #e9d6b0; background: var(--panel); border-width: 3px;
  box-shadow: 0 0 0 2px #000, inset 0 0 0 1px #3a3530, inset 0 0 40px #000, 0 10px 40px #000; }
body.diablo #talk .who, body.diablo #talk .obj b { color: #ff8a5a; }
body.diablo #talk .title { color: #b8a888; }
body.diablo #talk li button.q { color: #e9d6b0; background: rgba(0,0,0,.35); border-color: #5a4a30; }
body.diablo #talk li button.q:hover { background: rgba(90,60,20,.5); }
`;

const MOVE = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const ICON = { offer: '!', ready: '?', busy: '?', talk: '❦', shop: '⚖' };

/** `tint`: a CSS filter on the portrait (Fra' Bortolo is Fra' Zuane's picture turned green). */
export interface Speaker { name: string; portrait: string; tint?: string }

/** One line of the list. offer: Accetta runs `act`; ready: Completa (or a pick of `choices`) runs it; busy and talk only show `text`. */
export interface Entry {
  title: string;
  state: 'offer' | 'ready' | 'busy' | 'talk';
  text: string;
  objective?: string;
  reward?: { xp: number; gold: number; item?: string };
  choices?: readonly { id: string; label: string }[];
  /** Returns a line to say instead of going back to the list (Completa with no room in the bag). */
  act?: (choice?: string) => string | void;
  /** Said back on the list after a Rifiuta. */
  decline?: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export class Dialogue {
  private el = document.createElement('div');
  private body: HTMLElement;
  private titleEl: HTMLElement;
  private btns: HTMLElement;
  private whoEl: HTMLElement;
  private img: HTMLImageElement;
  private greeting = '';
  private entries: () => Entry[] = () => [];
  private shown: Entry[] = [];
  private detail?: Entry;
  private onShop?: () => void;
  /** Called when the window closes. */
  onClose?: () => void;

  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.el.id = 'talk';
    this.el.setAttribute('role', 'dialog');
    this.el.innerHTML = `<div class="page"><div class="portrait"><img alt=""></div><button class="x no" data-do="close" aria-label="Chiudi">✕</button>
      <h3 class="who"></h3><p class="title"></p><div class="body" aria-live="polite"></div><div class="btns"></div></div>`;
    this.whoEl = this.el.querySelector('.who')!;
    this.img = this.el.querySelector('img')!;
    this.body = this.el.querySelector('.body')!;
    this.titleEl = this.el.querySelector('.title')!;
    this.btns = this.el.querySelector('.btns')!;
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b) this.choose(b.dataset.do!);
      else if (e.target === this.el) this.close(); // a tap off the page
    });
    for (const t of ['pointerdown', 'pointerup', 'pointermove', 'wheel']) this.el.addEventListener(t, (e) => e.stopPropagation());
    addEventListener('keydown', (e) => { // capture: while it is up, no key reaches the game
      if (!this.open) return;
      e.stopPropagation();
      if (e.repeat) return;
      if (e.code === 'Escape' || MOVE.includes(e.code)) this.close(); // walking away
      else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyF') {
        e.preventDefault(); // the first quest on the list, or the page's first button; never a boon, which wants a deliberate click
        const b = this.el.querySelector<HTMLElement>(this.detail ? '.btns button' : 'li button');
        if (!b?.dataset.do?.startsWith('pick:')) b?.click();
      }
    }, true);
    document.body.append(this.el);
  }

  get open(): boolean {
    return this.el.classList.contains('show');
  }

  /** Opens on `who`'s list: `greeting` over `entries` (asked again each time the list is drawn); `shop` adds Commercia (a vendor). */
  show(who: Speaker, greeting: string, entries: () => Entry[], shop?: () => void): void {
    this.el.setAttribute('aria-label', who.name);
    this.whoEl.textContent = who.name;
    this.img.src = who.portrait;
    this.img.style.filter = who.tint ?? '';
    this.greeting = greeting;
    this.entries = entries;
    this.onShop = shop;
    this.el.classList.add('show');
    document.body.classList.add('talking');
    if (document.pointerLockElement) document.exitPointerLock();
    playSfx('ui_open', null, { ui: true });
    duck(6, 600); // the music under the speaker while the window is up
    this.list();
  }

  private list(say = this.greeting): void {
    this.detail = undefined;
    this.shown = this.entries();
    this.titleEl.textContent = '';
    const items = this.shown.map((q, i) => `<li><button class="q" data-do="open:${i}"><span class="ic ${q.state}">${ICON[q.state]}</span>${esc(q.title)}</button></li>`);
    if (this.onShop) items.push(`<li><button class="q" data-do="shop"><span class="ic shop">${ICON.shop}</span>Commercia</button></li>`);
    this.body.innerHTML = `<p class="text">${esc(say)}</p><ul>${items.join('')}</ul>`;
    this.body.scrollTop = 0;
    this.btns.innerHTML = '';
  }

  private page(q: Entry, say = q.text): void {
    this.detail = q;
    this.titleEl.textContent = q.title;
    const r = q.reward;
    this.body.innerHTML = `<p class="text">${esc(say)}</p>`
      + (q.objective && say === q.text ? `<div class="obj"><b>Obiettivo</b>${esc(q.objective)}</div>` : '')
      + (r && say === q.text ? `<div class="obj"><b>Ricompensa</b>${r.xp} esperienza · ${r.gold} oro${r.item ? ` · ${esc(r.item)}` : ''}</div>` : '');
    this.body.scrollTop = 0;
    const key = '<kbd>F</kbd>';
    this.btns.innerHTML = say !== q.text ? `<button data-do="back">Indietro${key}</button>`
      : q.state === 'offer' ? `<button data-do="act">Accetta${key}</button><button class="no" data-do="decline">Rifiuta</button>`
      : q.state === 'ready' && q.choices ? q.choices.map((c) => `<button data-do="pick:${c.id}">${esc(c.label)}</button>`).join('')
      : q.state === 'ready' ? `<button data-do="act">Completa${key}</button><button class="no" data-do="back">Indietro</button>`
      : `<button data-do="back">Indietro${key}</button>`;
  }

  private choose(what: string): void {
    playSfx('ui_click', null, { ui: true });
    const q = this.detail;
    if (what.startsWith('open:')) this.page(this.shown[+what.slice(5)]);
    else if (what === 'back') this.list();
    else if (what === 'decline') this.list(q?.decline ?? this.greeting);
    else if (what === 'shop') {
      const shop = this.onShop;
      this.close();
      shop?.();
    } else if (q && (what === 'act' || what.startsWith('pick:'))) {
      const say = q.act?.(what.slice(5) || undefined);
      if (say) this.page(q, say);
      else if (this.entries().some((e) => e.state === 'offer' || e.state === 'ready')) this.list(); // more to take or hand in: back to the list
      else this.close();
    } else this.close();
  }

  close(): void {
    if (!this.open) return;
    this.el.classList.remove('show');
    document.body.classList.remove('talking');
    playSfx('ui_close', null, { ui: true });
    unduck();
    this.onClose?.();
  }
}
