import { DECLINE, QUEST_TITLE, TALK, type Talk } from '../quest/dialogue.ts';
import type { Stage } from '../quest/progress.ts';

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
  background: radial-gradient(ellipse at 30% 20%, #f4e6c2, #e2cc98 60%, #c9ad74); border: 3px solid #c9a45c; border-radius: 6px;
  box-shadow: 0 0 0 2px #000, inset 0 0 0 1px #6b4a1f, inset 0 0 30px rgba(110,70,20,.45), 0 10px 40px #000; animation: talk-in .25s ease-out; }
@keyframes talk-in { from { transform: translateY(16px); opacity: 0; } }
#talk .portrait { position: absolute; left: 14px; top: 16px; width: 84px; height: 84px; border-radius: 50%; overflow: hidden;
  background: radial-gradient(#2c4048, #070b0d) center / cover; border: 3px solid #c9a45c; box-shadow: 0 0 0 2px #000, 0 0 14px rgba(120,220,255,.45); }
#talk .portrait img { display: block; width: 100%; height: 100%; object-fit: cover; }
#talk .who { margin: 0 0 2px; font: bold 18px Georgia, serif; color: #6a1408; }
#talk .title { margin: 0 0 8px; font: italic 13px Georgia, serif; color: #6b4a1f; }
#talk .title:empty { display: none; }
#talk p.text { min-height: 4.4em; margin: 0; white-space: pre-wrap; }
#talk .btns { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; }
#talk button { min-width: 112px; padding: 9px 16px; cursor: pointer; font: bold 15px Georgia, serif; color: #ffd75e; text-shadow: 0 1px 2px #000;
  background: linear-gradient(#8a1c12, #4a0a06 60%, #2e0503); border: 1px solid #c9a45c; border-radius: 4px;
  box-shadow: 0 0 0 1px #000, inset 0 1px 0 rgba(255,215,94,.3); touch-action: manipulation; }
#talk button.no { background: linear-gradient(#4a3a26, #1c140c); }
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
body.diablo #talk .page { color: #e9d6b0; background: radial-gradient(ellipse at 30% 20%, #2b2520, #120f0c 70%); border-color: #77705f;
  box-shadow: 0 0 0 2px #000, inset 0 0 0 1px #3a3530, inset 0 0 40px #000, 0 10px 40px #000; }
body.diablo #talk .who { color: #ff8a5a; }
body.diablo #talk .title, body.diablo #talk .more { color: #b8a888; }
body.diablo #talk .portrait { border-color: #77705f; }
`;

const CPS = 55; // characters typed per second

export interface Speaker { name: string; portrait: string }

export class Dialogue {
  private el = document.createElement('div');
  private textEl: HTMLElement;
  private titleEl: HTMLElement;
  private btns: HTMLElement;
  private talk: Talk = { pages: [] };
  private page = 0;
  private text = '';
  private typed = 0; // characters shown
  private last = 0; // performance.now() of the last typing step
  private raf = 0;
  private onAccept?: () => void;
  /** Called when the window closes, after the accept handler if the quest was taken. */
  onClose?: () => void;

  constructor(who: Speaker) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.el.id = 'talk';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', who.name);
    this.el.innerHTML = `<div class="page"><div class="portrait"><img alt="" src="${who.portrait}"></div>
      <h3 class="who">${who.name}</h3><p class="title"></p><p class="text" aria-live="polite"></p><div class="btns"></div></div>`;
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
        else this.btns.querySelector<HTMLElement>('button')?.click(); // the first button: Continua, Accetta or Addio
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

  /** Opens on what the speaker says at `stage`; `accept` runs if the offered quest is taken. */
  show(stage: Stage, accept: () => void): void {
    this.talk = TALK[stage];
    this.onAccept = accept;
    this.titleEl.textContent = this.talk.offer ? QUEST_TITLE : '';
    this.el.classList.add('show');
    document.body.classList.add('talking');
    if (document.pointerLockElement) document.exitPointerLock();
    // audio: playSfx('dialogue-open'); duck the music under the voice while the window is up
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
    const html = this.text !== this.talk.pages[this.page] ? `<button data-do="close">Addio${key}</button>` // the decline line
      : !last ? `<button data-do="next">Continua${key}</button>`
      : this.talk.offer ? `<button data-do="accept">Accetta${key}</button><button class="no" data-do="decline">Rifiuta</button>`
      : `<button data-do="close">Addio${key}</button>`;
    if (this.btns.innerHTML !== html) this.btns.innerHTML = html;
    this.btns.style.visibility = this.typing ? 'hidden' : 'visible';
  }

  private choose(what: string): void {
    // audio: playSfx('ui-click')
    if (what === 'next') this.say(this.page + 1);
    else if (what === 'decline') this.say(this.page, DECLINE);
    else if (what === 'accept') {
      this.onAccept?.();
      this.close();
    } else this.close();
  }

  close(): void {
    if (!this.open) return;
    cancelAnimationFrame(this.raf);
    this.el.classList.remove('show');
    document.body.classList.remove('talking');
    // audio: playSfx('dialogue-close'); music back up
    this.onClose?.();
  }
}
