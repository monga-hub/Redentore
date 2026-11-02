import attribution from '../../ATTRIBUTION.md?raw';
import { getAudio, setAudio, type AudioSettings } from '../audio/engine.ts';
import { ACTIONS, bindings, defaults, label, rebind, setBindings } from '../core/keys.ts';
import { getQuality, isDiablo, QUALITIES, setDiablo, setQuality } from '../core/style.ts';
import { ICONS } from './icons.ts';

// Game menu: a gear button in the top-right corner opens a framed panel that pauses the game, big buttons for a thumb:
// Riprendi, Cambia eroe (the run is kept, core/save.ts, and the page reloads onto the squad screen, ui/select.ts),
// audio, the view and the graphics, the keys (Comandi, core/keys.ts), credits. Each hero's run saves itself, so there is no save or load here;
// under the buttons, the account line (ui/account.ts): the login link, or the email and the cloud copy's state.
// Its DOM is styled here, like quest/view.ts.

const CSS = `
#menu-btn { position: fixed; z-index: 6; right: calc(12px + env(safe-area-inset-right)); top: calc(12px + env(safe-area-inset-top));
  width: 38px; height: 38px; padding: 0; cursor: pointer; border-radius: 50%;
  box-shadow: 0 0 0 1px #000, 0 3px 10px rgba(0,0,0,.7); touch-action: manipulation; }
#menu-btn:hover, #menu-btn:focus-visible { filter: brightness(1.25); outline: none; }
body.touch #menu-btn { transform: scale(calc(var(--k) / .72)); transform-origin: 100% 0; }
body.touch #fullscreen { right: auto; top: auto; left: calc(12px + env(safe-area-inset-left)); bottom: calc(168px * var(--k) + env(safe-area-inset-bottom)); } /* above the stick, bottom left: clear of the buffs' row under the player frame however long it grows, and of the right column (bag, figure, book) */
#menu { position: fixed; inset: 0; z-index: 20; display: none; align-items: center; justify-content: center;
  background: rgba(0,0,0,.55); font: 15px/1.35 Georgia, serif; color: #f3e2b0; touch-action: auto; user-select: none; }
#menu.show { display: flex; }
#menu .panel { position: relative; box-sizing: border-box; width: min(340px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow-y: auto;
  padding: 24px 22px 20px; border: 3px solid transparent; border-radius: 8px; background: var(--panel); box-shadow: var(--panel-shadow); }
#menu .panel.wide { width: min(560px, calc(100vw - 24px)); }
#menu h2 { width: fit-content; margin: -12px auto 16px; padding: 4px 22px; white-space: nowrap;
  font: bold 15px/20px Georgia, serif; color: #ffd75e; letter-spacing: 1px; text-shadow: 0 1px 2px #000;
  border: 2px solid transparent; border-radius: 4px; background: linear-gradient(#4a3420, #140e08) padding-box, var(--gilt) border-box; box-shadow: 0 0 0 1px #000, 0 3px 8px rgba(0,0,0,.6); }
#menu .x { position: absolute; right: 6px; top: 6px; width: 40px; height: 40px; padding: 0; cursor: pointer; font: bold 18px/1 system-ui, sans-serif;
  color: #f3e2b0; background: linear-gradient(#7a1a10, #3a0805); border: 1px solid #c9a45c; border-radius: 4px; }
#menu .btn { display: block; width: 100%; min-height: 54px; margin: 9px 0; padding: 9px 14px; cursor: pointer; text-align: center;
  font: bold 17px Georgia, serif; color: #ffd75e; text-shadow: 0 1px 2px #000;
  border: 2px solid transparent; border-radius: 4px; background: linear-gradient(#9a2216, #520c07 55%, #2e0503) padding-box, var(--gilt) border-box;
  box-shadow: 0 0 0 1px #000, inset 0 1px 0 rgba(255,215,94,.3), 0 2px 5px rgba(0,0,0,.5); }
#menu .btn:hover, #menu .btn:focus-visible { filter: brightness(1.35); outline: none; }
#menu .btn:active { transform: translateY(1px); }
#menu .btn:disabled { cursor: default; filter: grayscale(1) brightness(.6); }
#menu .btn > small { display: block; font: 12px/1.3 system-ui, sans-serif; color: #e8c9a0; text-shadow: none; }
#menu .btn.back, #menu .btn.quiet { margin-top: 16px; background: linear-gradient(#4a3a26, #1c140c) padding-box, var(--gilt) border-box; }
#menu .btn.style { display: flex; align-items: center; justify-content: space-between; gap: 10px; text-align: left; }
#menu .btn.style small { font: 11px/1.3 system-ui, sans-serif; color: #c9b48a; text-shadow: none; }
#menu .btn.style i { flex: none; width: 38px; height: 20px; border-radius: 10px; background: #1c140c; border: 1px solid #c9a45c; position: relative; }
#menu .btn.style i::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #6b5332; transition: left .15s, background .15s; }
#menu .btn.style[aria-pressed=true] i::after { left: 20px; background: #ff5a3a; box-shadow: 0 0 6px #ff5a3a; }
#menu hr { border: 0; border-top: 1px solid #4a3a26; margin: 12px 0; }
#menu label { display: flex; align-items: center; gap: 10px; margin: 18px 0; min-height: 32px; }
#menu input[type=range] { flex: 1; min-width: 0; accent-color: #c9a45c; }
#menu label .name { flex: none; width: 5.2em; }
#menu input[type=checkbox] { width: 26px; height: 26px; accent-color: #c9a45c; }
#menu output { min-width: 3em; text-align: right; font: 13px system-ui, sans-serif; }
body.touch #menu [data-go="keys"] { display: none; } /* the phone plays by touch */
#menu .binds { width: 100%; border-collapse: collapse; font: 14px system-ui, sans-serif; }
#menu .binds td { padding: 3px 4px; border-bottom: 1px solid #3a2c1c; }
#menu .binds td:first-child { color: #e8dcc0; }
#menu .binds tr.sep td { border-bottom: 1px solid #c9a45c; padding-top: 10px; color: #ffd75e; font: bold 13px Georgia, serif; }
#menu .key { width: 96px; min-height: 34px; padding: 4px 6px; cursor: pointer; font: bold 13px system-ui, sans-serif; color: #ffd75e;
  border: 1px solid #c9a45c; border-radius: 4px; background: linear-gradient(#3a2a1a, #140e08); }
#menu .key:hover, #menu .key:focus-visible { filter: brightness(1.35); outline: none; }
#menu .key.wait { color: #fff; background: linear-gradient(#9a2216, #520c07); animation: blink 1s infinite; }
@keyframes blink { 50% { filter: brightness(1.5); } }
#menu .account { margin: 14px 0 0; text-align: center; }
#menu .note { min-height: 2.6em; margin: 10px 0 0; font: 13px/1.3 system-ui, sans-serif; color: #ffb27a; }
#menu .hint { margin: 0 0 8px; font: 12px/1.35 system-ui, sans-serif; color: #c9b48a; }
#menu .credits { font: 13px/1.45 system-ui, sans-serif; color: #e8dcc0; }
#menu .credits h3 { margin: 14px 0 6px; font: bold 14px Georgia, serif; color: #ffd75e; }
#menu .credits p { margin: 4px 0; }
#menu .credits a { color: #8cc8ff; }
#menu .credits code { font-size: 11px; color: #c9b48a; word-break: break-all; }
#menu .credits .asset { margin: 8px 0; padding: 8px; border: 1px solid #4a3a26; border-radius: 4px; background: rgba(0,0,0,.3); }
`;


type View = 'main' | 'audio' | 'keys' | 'credits';

/** The audio panel's sliders: master, then each bus (audio/engine.ts). */
const SLIDERS: Record<Exclude<keyof AudioSettings, 'muted'>, string> = { volume: 'Generale', music: 'Musica', sfx: 'Effetti', ambience: 'Ambiente', voice: 'Voci' };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** Markdown inline bits ATTRIBUTION.md uses: [text](url), `code`, bare https links. Input already escaped. */
const inline = (s: string) => s
  .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');

/** ATTRIBUTION.md as cards: one per table row (file, asset, author, license, source), then any closing prose. */
export function credits(md: string): string {
  const lines = md.split('\n').map((l) => l.trim());
  const rows = lines.filter((l) => l.startsWith('|') && !/^\|\s*-/.test(l)).map((l) => l.slice(1, -1).split('|').map((c) => inline(esc(c.trim()))));
  const [head, ...body] = rows;
  const cards = body.map((r) => `<div class="asset">${r.map((c, i) => `<p><b>${head?.[i] ?? ''}:</b> ${c}</p>`).join('')}</div>`).join('');
  const prose = lines.filter((l) => l && !l.startsWith('|') && !l.startsWith('#')).map((l) => `<p>${inline(esc(l))}</p>`).join('');
  return cards + prose;
}

/** The "Stile Diablo" switch: camera, controls, look and HUD of Diablo Immortal, applied at once and remembered. */
const styleBtn = () => `<button class="btn style" data-do="style" aria-pressed="${isDiablo()}"><span>Stile Diablo<br><small>${isDiablo()
  ? 'Visuale isometrica, clic per muoverti e attaccare' : 'Ora: camera in terza persona (WoW)'}</small></span><i aria-hidden="true"></i></button>`;

/** The "Grafica" button: each tap moves Auto -> Alta -> Bassa and back. */
const QUALITY_HINT = { auto: "Prova il telefono all'avvio, poi si adatta", alta: 'Sempre al massimo: luci, ombre, bagliore', bassa: 'Per telefoni deboli: niente ombre né bagliore, meno luci e pixel' };
const qualityBtn = () => `<button class="btn style" data-do="quality"><span>Grafica: ${getQuality()[0].toUpperCase() + getQuality().slice(1)}<br><small>${QUALITY_HINT[getQuality()]}</small></span></button>`;

export const playTime = (s: number) => {
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
};

export interface MenuHooks {
  opened?(): void; // the game is about to pause
  leave(): void; // "Cambia eroe": keep the run, back to the squad screen
  account?(): HTMLElement; // the account line, under the main panel's buttons
}

export class Menu {
  private el = document.createElement('div');
  private view: View | null = null;
  private hooks: MenuHooks;
  /** The key cell waiting for a press in Comandi. */
  private wait: { id: string; slot: number } | null = null;

  constructor(hooks: MenuHooks) {
    this.hooks = hooks;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    const btn = document.createElement('button');
    btn.id = 'menu-btn';
    btn.className = 'orb';
    btn.setAttribute('aria-label', 'Menu di gioco');
    btn.title = 'Menu (Esc)';
    btn.innerHTML = ICONS.ui_menu;
    btn.addEventListener('click', () => this.toggle());
    this.el.id = 'menu';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-label', 'Menu di gioco');
    this.el.addEventListener('click', (e) => this.act(e));
    this.el.addEventListener('input', (e) => this.audioInput(e));
    addEventListener('keydown', (e) => { // capture: while the menu is up, game keys (Tab targeting, abilities) stay out of it
      if (!this.view) return;
      e.stopPropagation();
      if (this.wait) { e.preventDefault(); if (!e.repeat) this.bind(e.code); }
      else if (e.code === 'Escape' && !e.repeat) this.toggle();
    }, true);
    document.body.append(btn, this.el);
  }

  /** The game is paused while the menu is up. */
  get paused(): boolean {
    return this.view !== null;
  }

  /** Esc and the gear button: open the menu, step back out of a sub-panel, or close it. */
  toggle(): void {
    if (!this.view) this.show('main');
    else if (this.view === 'main') this.close();
    else this.show('main');
  }

  close(): void {
    this.view = null;
    this.wait = null;
    this.el.classList.remove('show');
    this.el.innerHTML = '';
  }

  private show(v: View): void {
    if (!this.view) {
      this.hooks.opened?.();
      if (document.pointerLockElement) document.exitPointerLock();
    }
    this.view = v;
    this.wait = null;
    this.el.classList.add('show');
    this.el.innerHTML = this.render(v);
    if (v === 'main' && this.hooks.account) this.el.querySelector('.panel')!.append(this.hooks.account());
    this.el.querySelector<HTMLElement>('.btn:not(:disabled), input')?.focus({ preventScroll: true });
  }

  private render(v: View): string {
    const x = '<button class="x" data-do="close" aria-label="Chiudi">✕</button>';
    const back = '<button class="btn back" data-go="main">Indietro</button>';
    switch (v) {
      case 'main': return `<div class="panel"><h2>Menu</h2>${x}
        <button class="btn" data-do="close">Riprendi</button>
        <button class="btn" data-do="leave">Cambia eroe<small>Salva e torna alla squadra</small></button><hr>
        <button class="btn" data-go="audio">Audio</button>
        <button class="btn" data-go="keys">Comandi<small>Cambia i tasti di movimento e della barra</small></button>
        ${styleBtn()}${qualityBtn()}
        <button class="btn quiet" data-go="credits">Crediti</button></div>`;
      case 'audio': {
        const a = getAudio();
        const row = (k: keyof typeof SLIDERS) => `<label><span class="name">${SLIDERS[k]}</span><input type="range" name="${k}" min="0" max="100" step="1" value="${Math.round(a[k] * 100)}" aria-label="Volume ${SLIDERS[k].toLowerCase()}">
            <output>${Math.round(a[k] * 100)}%</output></label>`;
        return `<div class="panel"><h2>Audio</h2>${x}
          ${(Object.keys(SLIDERS) as (keyof typeof SLIDERS)[]).map(row).join('')}
          <label><input type="checkbox" name="muted" ${a.muted ? 'checked' : ''}> Disattiva audio</label>${back}</div>`;
      }
      case 'keys': return `<div class="panel wide"><h2>Comandi</h2>${x}${this.keysTable()}<p class="note" role="status"></p>
        <button class="btn quiet" data-do="reset">Ripristina predefiniti</button>${back}</div>`;
      case 'credits': return `<div class="panel wide"><h2>Crediti</h2>${x}<div class="credits">
        <h3>Redentore Dungeon</h3>
        <p>Un dungeon nella Chiesa del Redentore e nell'Orto dei Frati, Giudecca, Venezia. Ispirato a World of Warcraft; nessun asset o logo Blizzard.</p>
        <p>Ideato da Daniele Sartori. Codice, livello, effetti e interfaccia costruiti con <a href="https://threejs.org" target="_blank" rel="noopener">three.js</a>, TypeScript e Vite, scritti con l'aiuto di Claude (Anthropic).</p>
        <h3>Modelli, suoni e licenze</h3>${credits(attribution)}</div>${back}</div>`;
    }
  }

  private keysTable(): string {
    const b = bindings();
    const cell = (id: string, slot: number) => {
      const w = this.wait?.id === id && this.wait.slot === slot;
      return `<button class="key${w ? ' wait' : ''}" data-key="${id}" data-slot="${slot}" aria-label="Cambia tasto">${w ? 'Premi un tasto…' : esc(label(b[id][slot]))}</button>`;
    };
    const rows = ACTIONS.map((a, i) => `${i === 0 ? '<tr class="sep"><td colspan="3">Movimento</td></tr>' : a.id === 'barra1' ? '<tr class="sep"><td colspan="3">Barra delle azioni</td></tr>' : ''}
      <tr><td>${a.name}</td><td>${cell(a.id, 0)}</td><td>${a.keys.length > 1 ? cell(a.id, 1) : ''}</td></tr>`).join('');
    return `<div class="binding"><p class="hint">Clic su un tasto, poi premi quello nuovo. Esc annulla, Backspace lo toglie. Un tasto già usato si scambia.
      Esc, Tab, Invio, M, B, C, K e F restano fissi; le carte del livello si scelgono sempre con 1, 2, 3.</p><table class="binds">${rows}</table></div>`;
  }

  /** A press while a key cell waits: Esc gives up, Backspace/Canc clears, anything else is bound (or refused). */
  private bind(code: string): void {
    const w = this.wait!;
    this.wait = null;
    let note = '';
    if (code !== 'Escape') {
      const r = rebind(bindings(), w.id, w.slot, code === 'Backspace' || code === 'Delete' ? '' : code);
      note = r.note;
      if (r.b !== bindings()) setBindings(r.b);
    }
    this.redrawKeys(note, w);
  }

  private redrawKeys(note: string, focus?: { id: string; slot: number }): void {
    this.el.querySelector('.binding')!.outerHTML = this.keysTable();
    this.el.querySelector('.note')!.textContent = note;
    if (focus) this.el.querySelector<HTMLElement>(`[data-key="${focus.id}"][data-slot="${focus.slot}"]`)?.focus({ preventScroll: true });
  }

  private act(e: Event): void {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    const { go, do: d } = b.dataset;
    if (b.dataset.key) {
      this.wait = { id: b.dataset.key, slot: Number(b.dataset.slot) };
      this.redrawKeys('');
      this.el.querySelector<HTMLElement>('.key.wait')?.focus({ preventScroll: true });
    }
    else if (d === 'reset') { setBindings(defaults()); this.wait = null; this.redrawKeys('Tasti predefiniti ripristinati.'); }
    else if (go) this.show(go as View);
    else if (d === 'close') this.close();
    else if (d === 'leave') this.hooks.leave();
    else if (d === 'style') {
      setDiablo(!isDiablo());
      b.outerHTML = styleBtn();
      this.el.querySelector<HTMLElement>('[data-do="style"]')!.focus();
    }
    else if (d === 'quality') {
      setQuality(QUALITIES[(QUALITIES.indexOf(getQuality()) + 1) % QUALITIES.length]);
      b.outerHTML = qualityBtn();
      this.el.querySelector<HTMLElement>('[data-do="quality"]')!.focus();
    }
  }

  private audioInput(e: Event): void {
    const t = e.target as HTMLInputElement;
    if (t.name in SLIDERS) {
      setAudio({ [t.name]: +t.value / 100 });
      t.nextElementSibling!.textContent = `${t.value}%`;
    } else if (t.name === 'muted') setAudio({ muted: t.checked });
  }
}
