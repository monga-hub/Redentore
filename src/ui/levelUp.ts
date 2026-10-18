import { duck, playSfx, unduck } from '../audio/engine.ts';
import type { Card } from '../player/levels.ts';
import { ICONS } from './icons.ts';

// The level-up window, Vampire Survivors style: the world holds still (main.ts) and two big cards
// wait for a pick, by click/tap or keys 1 / 2 (←/→ and Enter too). For LOCK s after it opens a press
// does nothing, so a player mashing 1 for Caduta d'ossa can't pick blind. A gold flash and "Livello N!"
// mark the level. Plain DOM, styled here like the dialogue window, WoW gold or Diablo stone.

const CSS = `
#levelup { position: fixed; inset: 0; z-index: 19; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
  padding: calc(12px + env(safe-area-inset-top)) 16px calc(12px + env(safe-area-inset-bottom)); box-sizing: border-box;
  background: radial-gradient(ellipse at 50% 45%, rgba(40,20,60,.55), rgba(0,0,0,.82)); user-select: none; touch-action: manipulation; }
#levelup.show { display: flex; animation: lu-in .3s ease-out; }
@keyframes lu-in { from { opacity: 0; } }
#levelup .head { text-align: center; font-family: Georgia, serif; text-shadow: 0 2px 4px #000, 0 0 18px rgba(255,200,90,.45); }
#levelup .head b { display: block; font-size: 34px; letter-spacing: 2px; color: #ffd75e; }
#levelup .head span { display: block; margin-top: 2px; font-size: 15px; font-style: italic; color: #e8d6b0; }
#levelup .cards { display: flex; gap: 22px; justify-content: center; width: min(720px, 100%); }
#levelup .card { position: relative; flex: 1 1 0; max-width: 330px; min-height: 290px; display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 16px 16px 14px; box-sizing: border-box; cursor: pointer; text-align: center; font: 15px/1.4 Georgia, serif; color: #f3e2b0;
  border: 3px solid transparent; border-radius: 8px; background: var(--panel); box-shadow: var(--panel-shadow); transition: transform .12s, box-shadow .12s, filter .12s; }
#levelup .card:hover, #levelup .card.sel { transform: translateY(-4px); filter: brightness(1.15); box-shadow: var(--panel-shadow), 0 0 22px 4px rgba(255,200,90,.55); }
#levelup.lock .card { pointer-events: none; filter: brightness(.6) saturate(.6); }
#levelup .tag { padding: 2px 10px; font: bold 11px/16px system-ui, sans-serif; letter-spacing: 1px; text-transform: uppercase; border-radius: 9px; color: #1a1208; background: #e0b55a; }
#levelup .card.ability .tag { background: #c48bff; }
#levelup .card.fusion .tag { background: #7dff3a; }
#levelup .card.filler .tag { background: #58ff9a; }
#levelup .ic { position: relative; width: 84px; height: 84px; flex: none; box-sizing: border-box; overflow: hidden; border: 3px solid transparent; border-radius: 6px;
  background: linear-gradient(#000, #000) padding-box, var(--gilt) border-box; box-shadow: 0 0 0 1px #000, 0 0 16px rgba(0,0,0,.8); }
#levelup .ic::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  box-shadow: inset 0 0 0 1px #000, inset 3px 3px 2px -1px rgba(255,240,200,.2), inset -3px -3px 4px -1px rgba(0,0,0,.6); background: linear-gradient(150deg, rgba(255,255,255,.14), transparent 40%); }
#levelup h3 { margin: 2px 0 0; font: bold 19px Georgia, serif; color: #ffd75e; }
#levelup p { margin: 0; color: #e9dcc0; }
#levelup .foot { margin-top: auto; display: flex; gap: 10px; align-items: center; font: 12px system-ui, sans-serif; color: #b8a888; }
#levelup kbd { padding: 1px 7px; font: 700 13px/1.4 sans-serif; color: #1a1208; background: #e0b55a; border-radius: 3px; }
body.touch #levelup kbd { display: none; }
body.diablo #levelup .head b { color: #ff8a5a; text-shadow: 0 2px 4px #000, 0 0 18px rgba(255,90,40,.5); }
body.diablo #levelup .card { color: #e9d6b0; border-radius: 2px; }
body.diablo #levelup .card:hover, body.diablo #levelup .card.sel { box-shadow: var(--panel-shadow), 0 0 22px 4px rgba(255,90,40,.5); }
body.diablo #levelup .ic { border-radius: 50%; background: linear-gradient(#000, #000) padding-box, var(--gilt-ring) border-box; }
body.diablo #levelup .ic::after { border-radius: 50%; }
body.diablo #levelup .ic .ico { filter: var(--ember); }
body.diablo #levelup h3 { color: #ff8a5a; text-transform: uppercase; letter-spacing: 1px; font-size: 16px; }
body.diablo #levelup .tag { border-radius: 1px; }
@media (max-width: 560px) {
  #levelup { gap: 12px; justify-content: flex-start; padding-top: calc(104px + env(safe-area-inset-top)); overflow-y: auto; background: rgba(0,0,0,.84); }
  #levelup .head b { font-size: 28px; }
  #levelup .cards { flex: none; flex-direction: column; align-items: stretch; gap: 14px; }
  #levelup .card { flex: none; max-width: none; min-height: 0; display: grid; grid-template-columns: 72px 1fr; grid-template-areas: "ic tag" "ic h" "p p"; column-gap: 12px; row-gap: 4px;
    align-items: center; text-align: left; padding: 12px 14px; font-size: 15px; }
  #levelup .tag { grid-area: tag; justify-self: start; }
  #levelup .ic { grid-area: ic; width: 72px; height: 72px; }
  #levelup h3 { grid-area: h; margin: 0; }
  #levelup p { grid-area: p; }
  #levelup .foot { display: none; }
}
@media (max-height: 500px) and (min-width: 561px) { /* a phone on its side */
  #levelup { gap: 8px; }
  #levelup .head b { font-size: 24px; }
  #levelup .head span { font-size: 13px; }
  #levelup .card { min-height: 0; gap: 4px; padding: 10px 12px; font-size: 14px; }
  #levelup .ic { width: 56px; height: 56px; }
  #levelup h3 { font-size: 16px; }
}
#lvflash { position: fixed; inset: 0; z-index: 18; pointer-events: none; opacity: 0;
  background: radial-gradient(ellipse at 50% 55%, rgba(255,215,94,.55), rgba(255,170,40,.18) 45%, transparent 75%); }
#lvflash.go { animation: lvflash 1.4s ease-out; }
@keyframes lvflash { 0% { opacity: 0 } 12% { opacity: 1 } 100% { opacity: 0 } }
.combat.level { color: #ffd75e; font-size: 30px; top: 30%; text-shadow: 0 2px 4px #000, 0 0 14px rgba(255,200,90,.8); }
body.diablo #lvflash { background: radial-gradient(ellipse at 50% 55%, rgba(255,110,40,.5), rgba(200,40,10,.16) 45%, transparent 75%); }
`;

const LOCK = 0.6; // s
const TAG: Record<Card['kind'], string> = { ability: 'Nuova abilità', mod: 'Potenziamento', passive: 'Potenziamento', fusion: 'Fusione', filler: 'Ristoro' };

export class LevelUp {
  private el = document.createElement('div');
  private flashEl = document.createElement('div');
  private cardsEl: HTMLElement;
  private title: HTMLElement;
  private cards: Card[] = [];
  private sel = -1;
  private lockT = 0;
  private onPick?: (c: Card) => void;

  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.el.id = 'levelup';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Livello superiore');
    this.el.innerHTML = '<div class="head"><b></b><span>Scegli un dono della tomba</span></div><div class="cards"></div>';
    this.title = this.el.querySelector('.head b')!;
    this.cardsEl = this.el.querySelector('.cards')!;
    this.flashEl.id = 'lvflash';
    this.el.addEventListener('click', (e) => {
      const c = (e.target as HTMLElement).closest<HTMLElement>('.card');
      if (c) this.choose(Number(c.dataset.i));
    });
    for (const t of ['pointerdown', 'pointerup', 'pointermove', 'wheel']) this.el.addEventListener(t, (e) => e.stopPropagation());
    addEventListener('keydown', (e) => { // capture: while it is up, no key reaches the game
      if (!this.open) return;
      e.stopPropagation();
      e.preventDefault();
      if (e.repeat) return;
      const n = this.cards.length;
      if (e.code === 'Digit1' || e.code === 'Numpad1') this.choose(0);
      else if (e.code === 'Digit2' || e.code === 'Numpad2') this.choose(1);
      else if (e.code === 'ArrowLeft' || e.code === 'ArrowUp' || e.code === 'KeyA') this.select((this.sel + n - 1) % n);
      else if (e.code === 'ArrowRight' || e.code === 'ArrowDown' || e.code === 'KeyD') this.select((this.sel + 1) % n);
      else if ((e.code === 'Enter' || e.code === 'Space') && this.sel >= 0) this.choose(this.sel);
    }, true);
    document.body.append(this.flashEl, this.el);
  }

  get open(): boolean {
    return this.el.classList.contains('show');
  }

  /** The gold flash and "Livello N!" over the hero. */
  flash(lv: number): void {
    this.flashEl.classList.remove('go');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('go');
    const f = document.createElement('div');
    f.className = 'combat level';
    f.textContent = `Livello ${lv}!`;
    f.addEventListener('animationend', () => f.remove());
    document.body.append(f);
    playSfx('quest', null, { ui: true });
  }

  /** Offer `cards` for level `lv`; `pick` gets the one chosen and the window closes. */
  show(lv: number, cards: Card[], count: (id: string) => number, pick: (c: Card) => void): void {
    this.cards = cards;
    this.onPick = pick;
    this.title.textContent = `Livello ${lv}`;
    this.cardsEl.innerHTML = cards.map((c, i) => {
      const stacks = c.max > 1 && Number.isFinite(c.max) ? `<span>${count(c.id) + 1}/${c.max}</span>` : '';
      return `<button class="card ${c.kind}" data-i="${i}" tabindex="-1"><span class="tag">${TAG[c.kind]}</span><div class="ic">${ICONS[c.icon] ?? ''}</div>`
        + `<h3></h3><p></p><div class="foot">${stacks}<kbd>${i + 1}</kbd></div></button>`;
    }).join('');
    this.cardsEl.querySelectorAll('.card').forEach((b, i) => {
      b.querySelector('h3')!.textContent = cards[i].name;
      b.querySelector('p')!.textContent = cards[i].text;
    });
    this.sel = -1;
    this.lockT = LOCK;
    this.el.classList.add('show', 'lock');
    document.body.classList.add('leveling');
    if (document.pointerLockElement) document.exitPointerLock();
    duck(6, 600);
  }

  /** Per frame while open (the world is paused): runs the input lock down. */
  update(dt: number): void {
    if (this.lockT > 0 && (this.lockT -= dt) <= 0) this.el.classList.remove('lock');
  }

  private select(i: number): void {
    if (this.lockT > 0) return;
    this.sel = i;
    this.cardsEl.querySelectorAll('.card').forEach((b, j) => b.classList.toggle('sel', j === i));
    playSfx('ui_hover', null, { ui: true });
  }

  private choose(i: number): void {
    const c = this.cards[i];
    if (!c || this.lockT > 0 || !this.open) return;
    playSfx('ui_click', null, { ui: true });
    this.el.classList.remove('show');
    document.body.classList.remove('leveling');
    unduck();
    this.onPick?.(c);
  }
}
