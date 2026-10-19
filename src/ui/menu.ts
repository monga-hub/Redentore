import attribution from '../../ATTRIBUTION.md?raw';
import { getAudio, setAudio, type AudioSettings } from '../audio/engine.ts';
import { getQuality, isDiablo, QUALITIES, setDiablo, setQuality } from '../core/style.ts';
import { clearAutosave, save, setPending, slots, type GameState, type Slot } from '../core/save.ts';
import { ICONS } from './icons.ts';

// Game menu, WoW style: a gear button in the top-right corner opens a framed panel that
// pauses the game — save and load on three slots, audio, new game, credits, exit. "Esci"
// drops to a title screen, from which a game starts or loads. Loading and starting over
// reload the page (see core/save.ts). Its DOM is styled here, like quest/view.ts.

const CSS = `
#menu-btn { position: fixed; z-index: 6; right: calc(12px + env(safe-area-inset-right)); top: calc(12px + env(safe-area-inset-top));
  width: 38px; height: 38px; padding: 0; cursor: pointer; border-radius: 50%;
  box-shadow: 0 0 0 1px #000, 0 3px 10px rgba(0,0,0,.7); touch-action: manipulation; }
#menu-btn:hover, #menu-btn:focus-visible { filter: brightness(1.25); outline: none; }
body.touch #menu-btn { transform: scale(calc(var(--k) / .72)); transform-origin: 100% 0; }
body.touch #fullscreen { top: calc(56px + env(safe-area-inset-top)); } /* under the gear, in the column the minimap leaves free */
#menu { position: fixed; inset: 0; z-index: 20; display: none; align-items: center; justify-content: center;
  background: rgba(0,0,0,.55); font: 15px/1.35 Georgia, serif; color: #f3e2b0; touch-action: auto; user-select: none; }
#menu.show { display: flex; }
#menu.title { background: radial-gradient(ellipse at 50% 40%, #2a1c12 0%, #0b0705 70%, #000 100%); }
#menu .panel { position: relative; box-sizing: border-box; width: min(340px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow-y: auto;
  padding: 24px 22px 20px; border: 3px solid transparent; border-radius: 8px; background: var(--panel); box-shadow: var(--panel-shadow); }
#menu .panel.wide { width: min(560px, calc(100vw - 24px)); }
#menu h2 { width: fit-content; margin: -12px auto 16px; padding: 4px 22px; white-space: nowrap;
  font: bold 15px/20px Georgia, serif; color: #ffd75e; letter-spacing: 1px; text-shadow: 0 1px 2px #000;
  border: 2px solid transparent; border-radius: 4px; background: linear-gradient(#4a3420, #140e08) padding-box, var(--gilt) border-box; box-shadow: 0 0 0 1px #000, 0 3px 8px rgba(0,0,0,.6); }
#menu .logo { margin: 0 0 22px; text-align: center; font: bold 34px/1.1 Georgia, serif; color: #ffd75e; letter-spacing: 2px;
  text-shadow: 0 0 18px #a06a10, 0 2px 4px #000; }
#menu .logo small { display: block; margin-top: 8px; font-size: 14px; letter-spacing: 1px; color: #c9b48a; }
#menu .x { position: absolute; right: 6px; top: 6px; width: 30px; height: 30px; padding: 0; cursor: pointer; font: bold 18px/1 system-ui, sans-serif;
  color: #f3e2b0; background: linear-gradient(#7a1a10, #3a0805); border: 1px solid #c9a45c; border-radius: 4px; }
#menu .btn { display: block; width: 100%; margin: 7px 0; padding: 9px 12px; cursor: pointer; text-align: center;
  font: bold 15px Georgia, serif; color: #ffd75e; text-shadow: 0 1px 2px #000;
  border: 2px solid transparent; border-radius: 4px; background: linear-gradient(#9a2216, #520c07 55%, #2e0503) padding-box, var(--gilt) border-box;
  box-shadow: 0 0 0 1px #000, inset 0 1px 0 rgba(255,215,94,.3), 0 2px 5px rgba(0,0,0,.5); }
#menu .btn:hover, #menu .btn:focus-visible { filter: brightness(1.35); outline: none; }
#menu .btn:active { transform: translateY(1px); }
#menu .btn:disabled { cursor: default; filter: grayscale(1) brightness(.6); }
#menu .btn.back { margin-top: 16px; background: linear-gradient(#4a3a26, #1c140c) padding-box, var(--gilt) border-box; }
#menu .btn.style { display: flex; align-items: center; justify-content: space-between; gap: 10px; text-align: left; }
#menu .btn.style small { font: 11px/1.3 system-ui, sans-serif; color: #c9b48a; text-shadow: none; }
#menu .btn.style i { flex: none; width: 38px; height: 20px; border-radius: 10px; background: #1c140c; border: 1px solid #c9a45c; position: relative; }
#menu .btn.style i::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #6b5332; transition: left .15s, background .15s; }
#menu .btn.style[aria-pressed=true] i::after { left: 20px; background: #ff5a3a; box-shadow: 0 0 6px #ff5a3a; }
#menu hr { border: 0; border-top: 1px solid #4a3a26; margin: 12px 0; }
#menu .slot-row { display: flex; align-items: center; gap: 10px; margin: 8px 0; padding: 8px 10px; text-align: left; }
#menu .slot-row b { display: block; color: #ffd75e; }
#menu .slot-row span { display: block; font: 12px/1.3 system-ui, sans-serif; color: #c9b48a; }
#menu .slot-row.confirm { color: #fff; filter: hue-rotate(-20deg) brightness(1.4); }
#menu .msg { min-height: 1.3em; margin: 8px 0 0; text-align: center; font: 13px system-ui, sans-serif; color: #7dff64; }
#menu .msg.err { color: #ff6a5a; }
#menu label { display: flex; align-items: center; gap: 10px; margin: 14px 0; }
#menu input[type=range] { flex: 1; min-width: 0; accent-color: #c9a45c; }
#menu label .name { flex: none; width: 5.2em; }
#menu input[type=checkbox] { width: 20px; height: 20px; accent-color: #c9a45c; }
#menu output { min-width: 3em; text-align: right; font: 13px system-ui, sans-serif; }
#menu .credits { font: 13px/1.45 system-ui, sans-serif; color: #e8dcc0; }
#menu .credits h3 { margin: 14px 0 6px; font: bold 14px Georgia, serif; color: #ffd75e; }
#menu .credits p { margin: 4px 0; }
#menu .credits a { color: #8cc8ff; }
#menu .credits code { font-size: 11px; color: #c9b48a; word-break: break-all; }
#menu .credits .asset { margin: 8px 0; padding: 8px; border: 1px solid #4a3a26; border-radius: 4px; background: rgba(0,0,0,.3); }
`;


type View = 'main' | 'save' | 'load' | 'audio' | 'credits' | 'title';

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
const QUALITY_HINT = { auto: 'Si adatta al telefono, scende se rallenta', alta: 'Sempre al massimo: luci, ombre, bagliore', bassa: 'Più fluida: meno pixel, niente bagliore' };
const qualityBtn = () => `<button class="btn style" data-do="quality"><span>Grafica: ${getQuality()[0].toUpperCase() + getQuality().slice(1)}<br><small>${QUALITY_HINT[getQuality()]}</small></span></button>`;

export const playTime = (s: number) => {
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
};

export interface MenuHooks {
  snapshot(): GameState;
  where(): string; // the area name, for the slot's label
  opened?(): void; // the game is about to pause
}

export class Menu {
  private el = document.createElement('div');
  private view: View | null = null;
  private from: View = 'main'; // where "Indietro" goes from load/credits
  private confirm = -1; // slot awaiting a second tap to overwrite
  private hooks: MenuHooks;

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
    this.el.addEventListener('click', (e) => this.act(e));
    this.el.addEventListener('input', (e) => this.audioInput(e));
    addEventListener('keydown', (e) => { // capture: while the menu is up, game keys (Tab targeting, abilities) stay out of it
      if (!this.view) return;
      e.stopPropagation();
      if (e.code === 'Escape' && !e.repeat) this.toggle();
    }, true);
    document.body.append(btn, this.el);
  }

  /** The game is paused while the menu (or the title screen) is up. */
  get paused(): boolean {
    return this.view !== null;
  }

  /** Esc and the gear button: open the menu, step back out of a sub-panel, or close it. The title screen stays. */
  toggle(): void {
    if (this.view === 'title') return;
    if (!this.view) this.show('main');
    else if (this.view === 'main') this.close();
    else this.show(this.from);
  }

  close(): void {
    this.view = null;
    this.el.classList.remove('show', 'title');
    this.el.innerHTML = '';
  }

  private show(v: View): void {
    if (!this.view) {
      this.hooks.opened?.();
      if (document.pointerLockElement) document.exitPointerLock();
    }
    if (v === 'main' || v === 'title') this.from = v;
    this.view = v;
    this.confirm = -1;
    this.el.classList.add('show');
    this.el.classList.toggle('title', v === 'title');
    this.el.setAttribute('aria-label', v === 'title' ? 'Redentore Dungeon' : 'Menu di gioco');
    this.el.innerHTML = this.render(v);
    this.el.querySelector<HTMLElement>('.btn:not(:disabled), input')?.focus({ preventScroll: true });
  }

  private render(v: View): string {
    const x = '<button class="x" data-do="close" aria-label="Chiudi">✕</button>';
    const back = '<button class="btn back" data-do="back">Indietro</button>';
    switch (v) {
      case 'main': return `<div class="panel"><h2>Menu di gioco</h2>${x}
        <button class="btn" data-do="close">Torna al gioco</button><hr>
        <button class="btn" data-go="save">Salva partita</button>
        <button class="btn" data-go="load">Carica partita</button>
        <button class="btn" data-go="audio">Audio</button>
        ${styleBtn()}${qualityBtn()}<hr>
        <button class="btn" data-do="new">Nuova partita</button>
        <button class="btn" data-go="credits">Crediti</button>
        <button class="btn" data-do="exit">Esci</button></div>`;
      case 'title': return `<div class="panel"><div class="logo">Redentore Dungeon<small>Giudecca, Venezia</small></div>
        <button class="btn" data-do="new">Nuova partita</button>
        <button class="btn" data-go="load">Carica partita</button>
        ${styleBtn()}
        <button class="btn" data-go="credits">Crediti</button></div>`;
      case 'save':
      case 'load': {
        const rows = slots().map((s, i) => this.slotRow(v, i, s)).join('');
        return `<div class="panel"><h2>${v === 'save' ? 'Salva partita' : 'Carica partita'}</h2>${this.from === 'main' ? x : ''}
          ${rows}<p class="msg" role="status"></p>${back}</div>`;
      }
      case 'audio': {
        const a = getAudio();
        const row = (k: keyof typeof SLIDERS) => `<label><span class="name">${SLIDERS[k]}</span><input type="range" name="${k}" min="0" max="100" step="1" value="${Math.round(a[k] * 100)}" aria-label="Volume ${SLIDERS[k].toLowerCase()}">
            <output>${Math.round(a[k] * 100)}%</output></label>`;
        return `<div class="panel"><h2>Audio</h2>${x}
          ${(Object.keys(SLIDERS) as (keyof typeof SLIDERS)[]).map(row).join('')}
          <label><input type="checkbox" name="muted" ${a.muted ? 'checked' : ''}> Disattiva audio</label>${back}</div>`;
      }
      case 'credits': return `<div class="panel wide"><h2>Crediti</h2>${this.from === 'main' ? x : ''}<div class="credits">
        <h3>Redentore Dungeon</h3>
        <p>Un dungeon nella Chiesa del Redentore e nell'Orto dei Frati, Giudecca, Venezia. Ispirato a World of Warcraft; nessun asset o logo Blizzard.</p>
        <p>Ideato da Daniele Sartori. Codice, livello, effetti e interfaccia costruiti con <a href="https://threejs.org" target="_blank" rel="noopener">three.js</a>, TypeScript e Vite, scritti con l'aiuto di Claude (Anthropic).</p>
        <h3>Modelli, suoni e licenze</h3>${credits(attribution)}</div>${back}</div>`;
    }
  }

  private slotRow(v: 'save' | 'load', i: number, s: Slot | undefined): string {
    const info = s ? `<b>${esc(s.label)}</b><span>${new Date(s.savedAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })} · ${playTime(s.state.time)}</span>`
      : '<b>Vuoto</b><span>Nessuna partita salvata</span>';
    const confirm = v === 'save' && this.confirm === i;
    return `<button class="btn slot-row${confirm ? ' confirm' : ''}" data-slot="${i}" ${v === 'load' && !s ? 'disabled' : ''}>
      <div>${confirm ? '<b>Sovrascrivere?</b><span>Tocca di nuovo per confermare</span>' : `<span>Slot ${i + 1}</span>${info}`}</div></button>`;
  }

  private act(e: Event): void {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    const { go, do: d, slot } = b.dataset;
    if (go) this.show(go as View);
    else if (d === 'close') this.close();
    else if (d === 'back') this.show(this.from);
    else if (d === 'new') { clearAutosave(); location.reload(); } // a clean boot is a clean start
    else if (d === 'exit') this.show('title');
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
    else if (slot !== undefined) this.slot(+slot);
  }

  private slot(i: number): void {
    const s = slots()[i];
    if (this.view === 'load') {
      if (s && setPending(s.state)) location.reload();
      else this.say('Impossibile caricare: memoria del browser non disponibile.', true);
      return;
    }
    if (s && this.confirm !== i) { // overwriting takes a second tap
      this.show('save');
      this.confirm = i;
      this.el.querySelector(`[data-slot="${i}"]`)!.outerHTML = this.slotRow('save', i, s);
      this.el.querySelector<HTMLElement>(`[data-slot="${i}"]`)!.focus();
      return;
    }
    const ok = save(i, { label: this.hooks.where() || 'Redentore', savedAt: Date.now(), state: this.hooks.snapshot() });
    this.show('save');
    this.say(ok ? `Partita salvata nello slot ${i + 1}.` : 'Salvataggio non riuscito: memoria del browser piena o bloccata.', !ok);
  }

  private say(text: string, err = false): void {
    const m = this.el.querySelector('.msg');
    if (!m) return;
    m.textContent = text;
    m.classList.toggle('err', err);
  }

  private audioInput(e: Event): void {
    const t = e.target as HTMLInputElement;
    if (t.name in SLIDERS) {
      setAudio({ [t.name]: +t.value / 100 });
      t.nextElementSibling!.textContent = `${t.value}%`;
    } else if (t.name === 'muted') setAudio({ muted: t.checked });
  }
}
