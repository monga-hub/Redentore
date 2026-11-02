import { CATEGORIES, NO_AREA, add, json, list, load, markdown, remove, zones, type Category, type Note } from '../core/notes.ts';

// The zone notes panel (core/notes.ts), opened by the quill on the minimap: write a note on the zone you stand in
// (a bug, a name that jars, something drawn wrong), read and delete the ones left, and hand them all over as a
// file or through the clipboard. It pauses the game like the menu and keeps game keys out while you type.

const CSS = `
#notes { position: fixed; inset: 0; z-index: 20; display: none; align-items: center; justify-content: center;
  background: rgba(0,0,0,.55); font: 14px/1.35 Georgia, serif; color: #f3e2b0; touch-action: auto; }
#notes.show { display: flex; }
#notes .panel { position: relative; box-sizing: border-box; width: min(440px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow-y: auto;
  padding: 22px 18px 16px; border: 3px solid transparent; border-radius: 8px; background: var(--panel); box-shadow: var(--panel-shadow); }
#notes h2 { margin: 0 44px 4px 0; font: bold 16px Georgia, serif; color: #ffd75e; text-shadow: 0 1px 2px #000; }
#notes .where { margin: 0 0 10px; font: 12px system-ui, sans-serif; color: #c9b48a; }
#notes .x { position: absolute; right: 6px; top: 6px; width: 40px; height: 40px; padding: 0; cursor: pointer; font: bold 18px/1 system-ui, sans-serif;
  color: #f3e2b0; background: linear-gradient(#7a1a10, #3a0805); border: 1px solid #c9a45c; border-radius: 4px; }
#notes .cats { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
#notes .cats button, #notes .row button { min-height: 36px; padding: 4px 12px; cursor: pointer; font: bold 13px Georgia, serif; color: #f3e2b0;
  border: 1px solid #6b5332; border-radius: 4px; background: linear-gradient(#4a3a26, #1c140c); touch-action: manipulation; }
#notes .cats button[aria-pressed=true] { color: #ffd75e; border-color: #ffd75e; background: linear-gradient(#9a2216, #520c07); }
#notes textarea, #notes select { box-sizing: border-box; width: 100%; font: 16px system-ui, sans-serif; color: #f3e2b0; /* 16px: iOS does not zoom in */
  background: rgba(0,0,0,.45); border: 1px solid #6b5332; border-radius: 4px; user-select: text; -webkit-user-select: text; }
#notes textarea { min-height: 72px; padding: 8px; resize: vertical; }
#notes select { min-height: 36px; padding: 4px 6px; }
#notes .row { display: flex; gap: 6px; margin: 8px 0; flex-wrap: wrap; align-items: center; }
#notes .row .save { margin-left: auto; color: #ffd75e; background: linear-gradient(#9a2216, #520c07 55%, #2e0503); }
#notes .msg { font: 12px system-ui, sans-serif; color: #9fd28a; }
#notes ul { list-style: none; margin: 6px 0; padding: 0; }
#notes li { position: relative; margin: 6px 0; padding: 6px 40px 6px 8px; border: 1px solid #4a3a26; border-radius: 4px; background: rgba(0,0,0,.3); font: 13px/1.4 system-ui, sans-serif; }
#notes li b { color: #ffd75e; font-weight: bold; }
#notes li small { display: block; color: #a8957a; font-size: 11px; }
#notes li .del { position: absolute; right: 4px; top: 4px; width: 32px; height: 32px; padding: 0; cursor: pointer; color: #f3e2b0; font: bold 15px system-ui, sans-serif;
  background: linear-gradient(#5a1a10, #2a0805); border: 1px solid #6b5332; border-radius: 4px; }
#notes .none { font: italic 13px system-ui, sans-serif; color: #a8957a; }
#notes hr { border: 0; border-top: 1px solid #4a3a26; margin: 12px 0 8px; }
`;
const LABEL: Record<Category, string> = { bug: 'Bug', nome: 'Nome', grafica: 'Grafica', altro: 'Altro' };
export const QUILL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 3C12 4 7 9 5 19M20 3c-1 6-5 10-11 11M4 21l2-3"/></svg>';

declare const __BUILD__: { sha: string; time: number };

/** Where the hero stands when a note is written. */
export interface Spot { area: string; level: number; lv: number; hero: string; x: number; z: number }
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&${({ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' })[c]};`);
const when = (ms: number) => new Date(ms).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });

export class NotesPanel {
  private el = document.createElement('div');
  private spot: Spot = { area: '', level: 1, lv: 1, hero: '', x: 0, z: 0 };
  private cat: Category = 'bug';
  private zone = ''; // the filter: '' every zone, else '=' + the zone (an unnamed zone is '=')
  /** The notes' spots, for the minimap's marks. */
  pins: { x: number; z: number }[] = load().map((n) => ({ x: n.x, z: n.z }));
  opened = () => {};

  private where: () => Spot;

  constructor(where: () => Spot) {
    this.where = where;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.el.id = 'notes';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-label', 'Note sulla zona');
    this.el.innerHTML = `<div class="panel">
      <button class="x" aria-label="Chiudi">✕</button>
      <h2>Note sulla zona</h2><p class="where"></p>
      <div class="cats">${CATEGORIES.map((c) => `<button data-cat="${c}">${LABEL[c]}</button>`).join('')}</div>
      <textarea maxlength="1000" placeholder="Cosa non va qui? Un nome, un muro, un bug…" aria-label="Testo della nota"></textarea>
      <div class="row"><span class="msg" aria-live="polite"></span><button class="save">Salva nota</button></div>
      <hr><select aria-label="Filtra per zona"></select><ul></ul>
      <div class="row"><button data-out="md">Scarica .md</button><button data-out="json">Scarica .json</button><button data-out="copy">Copia</button></div>
    </div>`;
    this.el.addEventListener('click', (e) => this.act(e));
    this.el.querySelector('select')!.addEventListener('change', (e) => { this.zone = (e.target as HTMLSelectElement).value; this.render(); });
    addEventListener('keydown', (e) => { // capture: while writing, WASD and the bar's keys stay out of the game
      if (!this.open) return;
      e.stopPropagation();
      if (e.code === 'Escape' && !e.repeat) this.close();
    }, true);
    document.body.append(this.el);
  }

  get open(): boolean { return this.el.classList.contains('show'); }

  toggle(): void { if (this.open) this.close(); else this.show(); }

  show(): void {
    this.spot = this.where();
    this.zone = '';
    this.el.querySelector('.where')!.textContent = `${this.spot.area || NO_AREA} · livello ${this.spot.level} · ${this.spot.hero}`;
    this.say('');
    this.render();
    this.el.classList.add('show');
    this.opened();
  }

  close(): void {
    (document.activeElement as HTMLElement | null)?.blur?.(); // drops the phone's keyboard
    this.el.classList.remove('show');
  }

  private say(s: string): void { this.el.querySelector('.msg')!.textContent = s; }

  private render(): void {
    const all = load(), here = this.spot.area;
    this.pins = all.map((n) => ({ x: n.x, z: n.z }));
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-cat]')) b.setAttribute('aria-pressed', String(b.dataset.cat === this.cat));
    const sel = this.el.querySelector('select')!;
    sel.innerHTML = `<option value="">Tutte le zone (${all.length})</option>` + zones(all, here).map((z) =>
      `<option value="=${esc(z)}">${esc(z || NO_AREA)}${z === here ? ' (qui)' : ''} (${all.filter((n) => n.area === z).length})</option>`).join('');
    sel.value = this.zone;
    const shown = list(all, here, this.zone ? this.zone.slice(1) : undefined);
    this.el.querySelector('ul')!.innerHTML = shown.length ? shown.map((n) => `<li><b>[${LABEL[n.category]}]</b> ${esc(n.text)}
      <small>${esc(n.area || NO_AREA)} · livello ${n.level} · ${esc(n.hero)} · ${when(n.at)}</small><button class="del" data-del="${esc(n.id)}" aria-label="Elimina nota">✕</button></li>`).join('')
      : '<li class="none">Nessuna nota ancora.</li>';
  }

  private act(e: Event): void {
    const t = e.target as HTMLElement, b = t.closest('button');
    if (t === this.el || b?.classList.contains('x')) return this.close(); // the backdrop or ✕
    if (!b) return;
    if (b.dataset.cat) { this.cat = b.dataset.cat as Category; return this.render(); }
    if (b.dataset.del) { remove(b.dataset.del); return this.render(); }
    if (b.classList.contains('save')) return this.save();
    if (b.dataset.out) return this.out(b.dataset.out);
  }

  private save(): void {
    const box = this.el.querySelector('textarea')!;
    if (!box.value.trim()) { this.say('Scrivi qualcosa prima di salvare.'); return; }
    const n = add({ ...this.spot, text: box.value, category: this.cat, version: __BUILD__.sha });
    if (!n) { this.say('Non salvata: il browser non tiene i dati.'); return; }
    box.value = '';
    this.say(`Salvata per ${n.area || NO_AREA}.`);
    this.render();
  }

  private out(kind: string): void {
    const all: Note[] = load();
    if (!all.length) { this.say('Nessuna nota da esportare.'); return; }
    if (kind === 'copy') {
      navigator.clipboard?.writeText(markdown(all)).then(() => this.say('Copiate negli appunti.'), () => this.say('Copia non riuscita: usa Scarica.'));
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([kind === 'md' ? markdown(all) : json(all)], { type: kind === 'md' ? 'text/markdown' : 'application/json' }));
    a.download = `redentore-note-${new Date().toISOString().slice(0, 10)}.${kind}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}
