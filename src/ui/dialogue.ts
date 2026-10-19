import { DECLINE, QUEST_TITLE, type Talk } from '../quest/dialogue.ts';
import { duck, playSfx, unduck } from '../audio/engine.ts';

// The quest-giver's window, WoW style: a parchment page in a gold frame with the speaker's
// portrait and name, the text typed out, Continua between pages and Accetta / Rifiuta on the
// quest's offer. A press while the text is typing shows it whole; another moves on. The game is
// paused while it is up (main.ts), and keys stay out of the game: Space, Enter or F go on, Esc
// closes. Its DOM is styled here, like the menu.

const CSS = `
#talk { position: fixed; inset: 0; z-index: 19; display: none; align-items: flex-end; justify-content: center;
  padding: 0 12px calc(16px + env(safe-area-inset-bottom)); box-sizing: border-box; background: linear-gradient(transparent 40%, rgba(0,0,0,.55));
  touch-action: auto; user-select: none; }
#talk.show { display: flex; }
#talk .page { position: relative; box-sizing: border-box; width: min(600px, 100%); max-height: calc(100dvh - 24px); overflow-y: auto;
  padding: 18px 20px 14px 112px; color: #2b1a0c; font: 16px/1.45 Georgia, serif;
  border: 4px solid transparent; border-radius: 6px; background: radial-gradient(ellipse at 30% 20%, #f4e6c2, #e2cc98 60%, #c9ad74) padding-box, var(--gilt) border-box;
  box-shadow: 0 0 0 1px #000, inset 0 0 0 1px #6b4a1f, inset 0 0 30px rgba(110,70,20,.45), 0 10px 40px #000; animation: talk-in .25s ease-out; }
@keyframes talk-in { from { transform: translateY(16px); opacity: 0; } }
#talk .portrait { position: absolute; left: 14px; top: 16px; width: 84px; height: 84px; border-radius: 50%; overflow: hidden;
  border: 4px solid transparent; background: radial-gradient(#2c4048, #070b0d) padding-box, var(--gilt-ring) border-box; box-shadow: 0 0 0 1px #000, 0 0 14px rgba(120,220,255,.45); }
#talk .portrait img { display: block; width: 100%; height: 100%; object-fit: cover; }
#talk .who { margin: 0 0 2px; font: bold 18px Georgia, serif; color: #6a1408; }
#talk .title { margin: 0 0 8px; font: italic 13px Georgia, serif; color: #6b4a1f; }
#talk .title:empty { display: none; }
#talk p.text { min-height: 4.4em; margin: 0; white-space: pre-wrap; }
#talk .btns { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 12px; }
#talk button { min-width: 112px; padding: 9px 16px; cursor: pointer; font: bold 15px Georgia, serif; color: #ffd75e; text-shadow: 0 1px 2px #000;
  border: 2px solid transparent; border-radius: 4px; background: linear-gradient(#9a2216, #520c07 55%, #2e0503) padding-box, var(--gilt) border-box;
  box-shadow: 0 0 0 1px #000, inset 0 1px 0 rgba(255,215,94,.3), 0 2px 5px rgba(0,0,0,.4); touch-action: manipulation; }
#talk button.no { background: linear-gradient(#4a3a26, #1c140c) padding-box, var(--gilt) border-box; }
#talk button.shop { order: -1; margin-right: auto; background: linear-gradient(#2a5a1c, #12300a 60%, #0a1c05) padding-box, var(--gilt) border-box; }
#talk button:hover, #talk button:focus-visible { filter: brightness(1.35); outline: none; }
#talk kbd { margin-left: 6px; padding: 0 4px; font: 700 11px/1.3 sans-serif; color: #1a1208; background: #e0b55a; border-radius: 3px; text-shadow: none; }
body.touch #talk kbd { display: none; }
body.talking #quest-prompt { display: none !important; }
#talk .more { position: absolute; right: 12px; bottom: 8px; font: 11px system-ui, sans-serif; color: #6b4a1f; opacity: .8; }
@media (max-width: 520px) {
  #talk .page { padding: 92px 14px 12px; font-size: 15px; }
  #talk .portrait { left: 50%; top: 10px; margin-left: -36px; width: 72px; height: 72px; }
  #talk .who, #talk .title { text-align: center; }
  #talk .btns { justify-content: stretch; }
  #talk button { flex: 1; min-width: 0; }
}
body.diablo #talk .page { color: #e9d6b0; background: var(--panel); border-width: 3px;
  box-shadow: 0 0 0 2px #000, inset 0 0 0 1px #3a3530, inset 0 0 40px #000, 0 10px 40px #000; }
body.diablo #talk .who { color: #ff8a5a; }
body.diablo #talk .title, body.diablo #talk .more { color: #b8a888; }

`;

const CPS = 55; // characters typed per second

/** `tint`: a CSS filter on the portrait (Fra' Bortolo is Fra' Zuane's picture turned green). */
export interface Speaker { name: string; portrait: string; tint?: string }

export class Dialogue {
  private el = document.createElement('div');
  private textEl: HTMLElement;
  private titleEl: HTMLElement;
  private btns: HTMLElement;
  private whoEl: HTMLElement;
  private img: HTMLImageElement;
  private talk: Talk = { pages: [] };
  private page = 0;
  private text = '';
  private typed = 0; // characters shown
  private last = 0; // performance.now() of the last typing step
  private raf = 0;
  private onAccept?: (choice?: string) => void;
  private onShop?: () => void;
  /** Called when the window closes, after the accept handler if the quest was taken. */
  onClose?: () => void;

  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.el.id = 'talk';
    this.el.setAttribute('role', 'dialog');
    this.el.innerHTML = `<div class="page"><div class="portrait"><img alt=""></div>
      <h3 class="who"></h3><p class="title"></p><p class="text" aria-live="polite"></p><div class="btns"></div></div>`;
    this.whoEl = this.el.querySelector('.who')!;
    this.img = this.el.querySelector('img')!;
    this.textEl = this.el.querySelector('.text')!;
    this.titleEl = this.el.querySelector('.title')!;
    this.btns = this.el.querySelector('.btns')!;
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b) this.choose(b.dataset.do!);
      else if (this.typing) this.finish(); // a tap on the page shows the rest at once
    });
    for (const t of ['pointerdown', 'pointerup', 'pointermove', 'wheel']) this.el.addEventListener(t, (e) => e.stopPropagation());
    addEventListener('keydown', (e) => { // capture: while it is up, no key reaches the game
      if (!this.open) return;
      e.stopPropagation();
      if (e.repeat) return;
      if (e.code === 'Escape') this.close();
      else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyF') {
        e.preventDefault();
        if (this.typing) this.finish();
        else { // the first button: Continua, Accetta or Addio; never a boon, which wants a deliberate click
          const b = this.btns.querySelector<HTMLElement>('button');
          if (!b?.dataset.do?.startsWith('pick:')) b?.click();
        }
      }
    }, true);
    document.body.append(this.el);
  }

  get open(): boolean {
    return this.el.classList.contains('show');
  }

  private get typing(): boolean {
    return this.typed < this.text.length;
  }

  /** Opens on `talk` in `who`'s voice; `accept` runs if the offered quest is taken (with the id of the choice picked); `shop` adds Commercia (a vendor) to every page. */
  show(who: Speaker, talk: Talk, accept?: (choice?: string) => void, shop?: () => void): void {
    this.el.setAttribute('aria-label', who.name);
    this.whoEl.textContent = who.name;
    this.img.src = who.portrait;
    this.img.style.filter = who.tint ?? '';
    this.talk = talk;
    this.onAccept = accept;
    this.onShop = shop;
    this.titleEl.textContent = this.talk.offer ? this.talk.title ?? QUEST_TITLE : '';
    this.el.classList.add('show');
    document.body.classList.add('talking');
    if (document.pointerLockElement) document.exitPointerLock();
    playSfx('ui_open', null, { ui: true });
    duck(6, 600); // the music under the speaker while the window is up
    this.say(0);
  }

  private say(page: number, text = this.talk.pages[page]): void {
    this.page = page;
    this.text = text;
    this.typed = 0;
    this.textEl.textContent = '';
    this.buttons();
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    const step = (now: number) => {
      this.typed = Math.min(this.text.length, this.typed + ((now - this.last) / 1000) * CPS);
      this.last = now;
      this.textEl.textContent = this.text.slice(0, Math.floor(this.typed));
      if (this.typing) this.raf = requestAnimationFrame(step);
      else this.buttons();
    };
    this.raf = requestAnimationFrame(step);
  }

  private finish(): void {
    this.typed = this.text.length;
    this.textEl.textContent = this.text;
    this.buttons();
  }

  private buttons(): void {
    const last = this.page >= this.talk.pages.length - 1, key = '<kbd>F</kbd>';
    let html = this.text !== this.talk.pages[this.page] ? `<button data-do="close">Addio${key}</button>` // the decline line
      : !last ? `<button data-do="next">Continua${key}</button>`
      : this.talk.choices ? this.talk.choices.map((c) => `<button data-do="pick:${c.id}">${c.label}</button>`).join('')
      : this.talk.offer ? `<button data-do="accept">Accetta${key}</button><button class="no" data-do="decline">Rifiuta</button>`
      : `<button data-do="close">Addio${key}</button>`;
    if (this.onShop) html += '<button class="shop" data-do="shop">Commercia</button>';
    if (this.btns.innerHTML !== html) this.btns.innerHTML = html;
    this.btns.style.visibility = this.typing ? 'hidden' : 'visible';
  }

  private choose(what: string): void {
    playSfx('ui_click', null, { ui: true });
    if (what === 'next') this.say(this.page + 1);
    else if (what === 'decline') this.say(this.page, this.talk.decline ?? DECLINE);
    else if (what === 'shop') {
      const shop = this.onShop;
      this.close();
      shop?.();
    }
    else if (what === 'accept' || what.startsWith('pick:')) {
      this.onAccept?.(what.slice(5) || undefined);
      this.close();
    } else this.close();
  }

  close(): void {
    if (!this.open) return;
    cancelAnimationFrame(this.raf);
    this.el.classList.remove('show');
    document.body.classList.remove('talking');
    playSfx('ui_close', null, { ui: true });
    unduck();
    this.onClose?.();
  }
}
