import { playSfx } from '../audio/engine.ts';
import { KEYS, POTION, PRIMARY, SPARE, saveBar, type Ability, type AbilitySystem, type Caster } from '../abilities/system.ts';
import { CARD, SCHOOL, SECOND_AT, type School } from '../player/levels.ts';
import { RING } from './actionBar.ts';
import { ICONS } from './icons.ts';

// The ability book ("Libro delle abilità"), laid out like Diablo Immortal's: K, the book button under the figure or
// the game menu open it, and the game pauses. Left, every ability grouped by school (the primary attack apart, on top),
// with its icon, rank (1 + the upgrades picked for it) and a check when it is on the bar; the ones still to learn are
// greyed, with how to get them, so the list shows what a build can grow into. Right, a parchment page: big icon, name,
// school, cost, cast and cooldown, the description with its numbers picked out, the upgrades and passives working on it,
// and Equipaggia / Rimuovi under it, beside a small copy of the bar (the thumb arc on touch and in Stile Diablo, the
// row with keys otherwise). Equipaggia lights the eight slots: a tap on one puts the ability there, swapping with an
// ability already on the bar or sending the one there back to the book. Not armed, a tap on a slot opens its ability.
// With a mouse, drag an ability (from the list or a slot) onto a slot, or a slot onto the list to take it off.
// The primary attack and the potion are fixed: the big button and the potion's own button. The big button takes a base
// attack only: the hero's own, or his secondary school's once he has learnt it (Sul tasto grande).

const CSS = `
#book-btn { position: fixed; z-index: 6; right: calc(12px + env(safe-area-inset-right)); top: calc(144px + env(safe-area-inset-top));
  width: 38px; height: 38px; padding: 0; cursor: pointer; border-radius: 50%; color: #f3d58a;
  box-shadow: 0 0 0 1px #000, 0 3px 10px rgba(0,0,0,.7); touch-action: manipulation; }
#book-btn svg { position: absolute; inset: 18%; width: 64%; height: 64%; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linejoin: round; filter: drop-shadow(0 1px 1px #000); }
#book-btn:hover, #book-btn:focus-visible { filter: brightness(1.25); outline: none; }
#book-btn.got { animation: baggot .5s ease-out; }
body.touch #book-btn { top: calc(12px + 132px * var(--k) / .72 + env(safe-area-inset-top)); transform: scale(calc(var(--k) / .72)); transform-origin: 100% 0; }
body.diablo #book-btn { color: #e9d6b0; }
#book { position: fixed; inset: 0; z-index: 15; display: none; align-items: center; justify-content: center;
  padding: calc(8px + env(safe-area-inset-top)) calc(8px + env(safe-area-inset-right)) calc(8px + env(safe-area-inset-bottom)) calc(8px + env(safe-area-inset-left));
  background: rgba(0,0,0,.55); font: 14px/1.35 Georgia, serif; color: #f3e2b0; user-select: none; touch-action: manipulation; }
#book.show { display: flex; }
#book .tome { position: relative; box-sizing: border-box; display: grid; grid-template-columns: minmax(200px, 38%) 1fr; gap: 10px;
  width: min(840px, 100%); height: min(520px, 100%); padding: 26px 12px 12px;
  border: 3px solid transparent; border-radius: 8px; background: var(--panel); box-shadow: var(--panel-shadow); }
#book h2 { position: absolute; left: 50%; top: -14px; transform: translateX(-50%); margin: 0; padding: 4px 22px; white-space: nowrap;
  font: bold 15px/20px Georgia, serif; color: #ffd75e; letter-spacing: 1px; text-shadow: 0 1px 2px #000;
  border: 2px solid transparent; border-radius: 4px; background: linear-gradient(#4a3420, #140e08) padding-box, var(--gilt) border-box; box-shadow: 0 0 0 1px #000, 0 3px 8px rgba(0,0,0,.6); }
#book .x { position: absolute; right: 6px; top: 6px; z-index: 1; width: 28px; height: 28px; padding: 0; cursor: pointer; font: bold 16px/1 system-ui, sans-serif;
  color: #f3e2b0; background: linear-gradient(#7a1a10, #3a0805); border: 1px solid #c9a45c; border-radius: 4px; }
#book .list { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-right: 4px; touch-action: pan-y; }
#book h3 { display: flex; align-items: center; gap: 8px; margin: 8px 0 3px; font: bold 11px/1 Georgia, serif; letter-spacing: 1.5px; text-transform: uppercase; color: #c9a45c; }
#book h3::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, rgba(201,164,92,.6), transparent); }
#book h3:first-child { margin-top: 0; }
#book .row { position: relative; display: flex; align-items: center; gap: 8px; width: 100%; margin: 0 0 3px; padding: 3px 26px 3px 3px; box-sizing: border-box; cursor: pointer;
  text-align: left; color: inherit; font: inherit; background: rgba(0,0,0,.25); border: 1px solid rgba(201,164,92,.18); border-radius: 4px; }
#book .row:hover { background: rgba(255,215,94,.08); }
#book .row.sel { background: linear-gradient(90deg, rgba(255,215,94,.22), rgba(255,215,94,.06)); border-color: #c9a45c; box-shadow: inset 0 0 8px rgba(255,215,94,.2); }
#book .ic { position: relative; flex: none; width: 34px; height: 34px; overflow: hidden; border: 2px solid transparent; border-radius: 4px;
  background: linear-gradient(#000, #000) padding-box, var(--gilt) border-box; box-shadow: 0 0 0 1px #000; }
#book .row b { display: block; font: bold 13px/16px Georgia, serif; color: #f3e2b0; }
#book .row small { display: block; font: 11px/14px system-ui, sans-serif; color: #b8a888; }
#book .row .chk { position: absolute; right: 7px; top: 50%; transform: translateY(-50%); font: bold 15px/1 system-ui, sans-serif; color: #7dff64; text-shadow: 0 1px 2px #000; }
#book .row.lock .ic .ico { filter: grayscale(1) brightness(.45); }
#book .row.lock b { color: #8a8070; }
#book .page { --q: .58; position: relative; min-height: 0; display: grid; grid-template-columns: 1fr auto; gap: 10px; padding: 12px 14px;
  color: #2a1a0c; border-radius: 4px;
  background: radial-gradient(ellipse at 50% 40%, #f3e6c2, #dcc58e 75%, #b99a5c); box-shadow: inset 0 0 0 1px #6b4a1e, inset 0 0 26px rgba(90,55,15,.55), 0 0 0 1px #000; }
#book .txt { min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 7px; touch-action: pan-y; }
#book .side { width: calc(380px * var(--q)); display: flex; flex-direction: column; align-items: stretch; justify-content: space-between; gap: 8px; }
#book .head { display: flex; align-items: center; gap: 12px; }
#book .page .ic { width: 62px; height: 62px; border-width: 3px; }
#book .page h4 { margin: 0; font: bold 20px/1.15 Georgia, serif; color: #3a1606; }
#book .page .sub { font: italic 13px Georgia, serif; color: #6b4a1e; }
#book .stats { display: flex; flex-wrap: wrap; gap: 4px 14px; font: bold 12px system-ui, sans-serif; color: #4a3010; }
#book .desc { margin: 0; font: 14px/1.4 Georgia, serif; }
#book .desc em, #book .mods em { font-style: normal; font-weight: bold; color: #a3360a; }
#book .mods { margin: 0; padding: 6px 8px; font: 12px/1.35 system-ui, sans-serif; background: rgba(110,70,20,.12); border-left: 3px solid #a37a2e; border-radius: 2px; }
#book .mods b { color: #3a1606; }
#book .note { margin: 0; font: italic 13px/1.35 Georgia, serif; color: #6b4a1e; }
#book .acts { display: flex; flex-wrap: wrap; gap: 6px; }
#book .acts .btn { flex: 1; }
#book .acts .hint { flex-basis: 100%; }
#book .btn { padding: 7px 10px; cursor: pointer; text-align: center; font: bold 14px Georgia, serif; color: #ffd75e; text-shadow: 0 1px 2px #000;
  border: 2px solid transparent; border-radius: 4px; background: linear-gradient(#9a2216, #520c07 55%, #2e0503) padding-box, var(--gilt) border-box;
  box-shadow: 0 0 0 1px #000, inset 0 1px 0 rgba(255,215,94,.3), 0 2px 5px rgba(0,0,0,.5); }
#book .btn.dim { background: linear-gradient(#4a3a26, #1c140c) padding-box, var(--gilt) border-box; }
#book .btn.on { filter: brightness(1.35); box-shadow: 0 0 0 1px #000, 0 0 10px 2px rgba(255,215,94,.7); }
#book .btn:hover { filter: brightness(1.3); }
#book .hint { margin: 0; font: 12px/1.3 system-ui, sans-serif; color: #6b4a1e; }
#book .hint.go { color: #a3360a; font-weight: bold; }
/* The bar in small: RING (actionBar.ts) scaled by --q, the corner bottom-right; the row of keys outside touch and Stile Diablo. */
#book .arc { position: relative; flex: none; width: calc(380px * var(--q)); height: calc(296px * var(--q)); }
#book .ps { position: absolute; box-sizing: border-box; width: calc(var(--d) * var(--q)); height: calc(var(--d) * var(--q)); padding: 0; overflow: hidden; cursor: pointer;
  right: calc((74px - cos(var(--a)) * var(--r) - var(--d) / 2) * var(--q)); bottom: calc((70px + sin(var(--a)) * var(--r) - var(--d) / 2) * var(--q));
  border-radius: 50%; border: 2px solid transparent; background: radial-gradient(#2a2018, #080605) padding-box, var(--gilt-ring) border-box; box-shadow: 0 0 0 1px #000, 0 2px 5px rgba(0,0,0,.6); color: #f3e2b0; }
#book .ps .ico { border-radius: 50%; }
#book .ps.fixed { cursor: default; filter: saturate(.7) brightness(.85); }
#book .ps.jump { pointer-events: none; opacity: .55; }
#book .ps.cur { box-shadow: 0 0 0 1px #000, 0 0 0 3px #ffd75e, 0 0 10px 3px #ffd75e; }
#book .arc.armed .ps:not(.fixed):not(.jump) { animation: armed .8s ease-in-out infinite alternate; }
@keyframes armed { from { box-shadow: 0 0 0 1px #000, 0 0 4px 1px rgba(255,215,94,.5); } to { box-shadow: 0 0 0 1px #000, 0 0 12px 4px #ffd75e; } }
#book .ps.drop { box-shadow: 0 0 0 2px #000, 0 0 12px 4px #f3e2b0; filter: brightness(1.3); }
#book .ps .k { position: absolute; right: 2px; top: 1px; display: none; font: bold 10px/1 system-ui, sans-serif; color: #fff; text-shadow: 1px 1px 0 #000, -1px -1px 0 #000; }
body:not(.touch):not(.diablo) #book .page { grid-template-columns: 1fr; grid-template-rows: 1fr auto; }
body:not(.touch):not(.diablo) #book .side { width: auto; }
body:not(.touch):not(.diablo) #book .arc { display: flex; align-self: center; gap: 3px; width: auto; height: auto; padding: 4px; border-radius: 4px; background: rgba(30,20,10,.75); }
body:not(.touch):not(.diablo) #book .ps { position: relative; right: auto; bottom: auto; width: 32px; height: 32px; border-radius: 3px; border-width: 1px; }
body:not(.touch):not(.diablo) #book .ps .ico { border-radius: 0; }
body:not(.touch):not(.diablo) #book .ps .k { display: block; }
body:not(.touch):not(.diablo) #book .ps.jump { display: none; }
body:not(.touch):not(.diablo) #book .ps.potion { margin-left: 8px; }
body.diablo:not(.touch) #book .ps.jump { display: none; }
body.diablo:not(.touch) #book .ps.potion { --r: 196px !important; } /* as on the bar (index.html) */
body.diablo #book .ic .ico, body.diablo #book .ps .ico { filter: var(--ember); }
body.diablo #book .row.lock .ic .ico { filter: grayscale(1) brightness(.45); }
body.touch #book .keys { display: none; }
@media (max-height: 430px) {
  #book .tome { padding-top: 22px; grid-template-columns: minmax(190px, 36%) 1fr; }
  #book .page { padding: 8px 10px; gap: 5px; }
  #book .page .ic { width: 46px; height: 46px; }
  #book .page h4 { font-size: 17px; }
  #book .desc { font-size: 13px; }
  #book .page { --q: .56; }
  #book .btn { padding: 5px 8px; font-size: 13px; }
}
@media (max-aspect-ratio: 1/1) { #book .tome { grid-template-columns: 1fr; grid-template-rows: 38% 1fr; } #book .page { grid-template-columns: 1fr; overflow-y: auto; } #book .side { width: auto; flex-direction: row-reverse; align-items: flex-end; } }
`;

const SCHOOLS: [School, string][] = [['bone', 'Ossa'], ['plague', 'Peste'], ['shadow', 'Ombra'], ['fire', 'Fuoco'], ['frost', 'Gelo'], ['storm', 'Fulmine'], ['holy', 'Sacro']];
export const SCHOOL_NAME = new Map(SCHOOLS);
const BOOK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5C9.5 4.8 6.5 4.6 3 5.2v13c3.5-.6 6.5-.4 9 1.3 2.5-1.7 5.5-1.9 9-1.3v-13c-3.5-.6-6.5-.4-9 1.3zM12 6.5v13M5.5 8.6c1.8-.2 3.4 0 4.6.6M5.5 11.4c1.8-.2 3.4 0 4.6.6M13.9 9.2c1.2-.6 2.8-.8 4.6-.6M13.9 12c1.2-.6 2.8-.8 4.6-.6"/></svg>';
const DRAG = 6; // px a mouse press travels before it becomes a drag

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); // no digits in the entities, for `lit`
/** Escaped, with every number (and its %, s or m) picked out, as on Diablo Immortal's skill page. */
const lit = (s: string) => esc(s).replace(/[+−]?\d+(?:[.,]\d+)?(?:\s?(?:%|s\b|m\b))?/g, '<em>$&</em>');
const num = (t: number) => t.toLocaleString('it', { maximumFractionDigits: 1 });

export class AbilityBook<C extends Caster> {
  readonly btn = document.createElement('button');
  private el = document.createElement('div');
  private sys: AbilitySystem<C>;
  private all: Ability<C>[];
  private picks: () => readonly string[];
  private sel: string;
  private armed = false;
  private drag?: { id: string; from: number; ghost?: HTMLElement; over?: HTMLElement; x: number; y: number; pointer: number };
  private noClick = false;
  /** Called as it opens, to stop casts, drags and click-to-move. */
  opened = () => {};

  private setMain: (id: string) => void;
  /** `abilities`: the kit (the potion is left out: it has its own button), the hero's base attacks among them; `picks`: the
   *  level-up cards so far; `setMain`: a base attack goes on the big button. */
  constructor(sys: AbilitySystem<C>, abilities: Ability<C>[], picks: () => readonly string[], setMain: (id: string) => void = (id) => sys.setMain(id)) {
    this.sys = sys;
    this.setMain = setMain;
    this.all = abilities.filter((a) => a.id !== sys.layout().bar[POTION]);
    this.picks = picks;
    this.sel = sys.slots[PRIMARY]?.id ?? this.all[0].id;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.btn.id = 'book-btn';
    this.btn.className = 'orb';
    this.btn.setAttribute('aria-label', 'Libro delle abilità (K)');
    this.btn.title = 'Libro delle abilità (K)';
    this.btn.innerHTML = BOOK_SVG;
    this.btn.addEventListener('click', () => this.toggle());
    this.el.id = 'book';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-label', 'Libro delle abilità');
    this.el.addEventListener('click', (e) => this.click(e));
    this.el.addEventListener('pointerdown', (e) => this.press(e));
    addEventListener('keydown', (e) => { // capture: while the book is up, game keys stay out of it
      if (!this.open) return;
      e.stopPropagation();
      if (e.repeat) return;
      if (e.code === 'Escape' || e.code === 'KeyK') this.close();
    }, true);
    document.body.append(this.btn, this.el);
  }

  get open(): boolean {
    return this.el.classList.contains('show');
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  show(): void {
    if (this.open) return;
    if (document.pointerLockElement) document.exitPointerLock();
    this.opened();
    this.armed = false;
    this.el.classList.add('show');
    this.render();
    playSfx('ui_open', null, { ui: true });
    this.el.querySelector<HTMLElement>('.row.sel')?.scrollIntoView({ block: 'nearest' });
  }

  close(): void {
    if (!this.open) return;
    this.el.classList.remove('show');
    this.el.innerHTML = '';
    playSfx('ui_close', null, { ui: true });
  }

  /** The book button pulses: a level-up taught an ability. */
  nudge(): void {
    this.btn.classList.remove('got');
    void this.btn.offsetWidth;
    this.btn.classList.add('got');
  }

  /** Slot `id` sits in, -1 off the bar. */
  private slotOf(id: string): number {
    return this.sys.slots.findIndex((a) => a?.id === id);
  }

  /** The upgrade cards picked for `a` (mods and fusions), with how many times each. */
  private upgrades(a: Ability<C>): [string, number][] {
    const n = new Map<string, number>();
    for (const p of this.picks()) {
      const c = CARD.get(p);
      if (c && ((c.kind === 'mod' && c.of === a.id) || (c.kind === 'fusion' && (c.icon === a.id || c.text.toLowerCase().includes(a.name.toLowerCase()))))) n.set(p, (n.get(p) ?? 0) + 1);
    }
    return [...n];
  }

  /** Passives picked that work on `a`: damage on what deals it, cooldowns on what has one (not the base attacks), fury on the specials. */
  private passives(a: Ability<C>): [string, number][] {
    const n = new Map<string, number>();
    for (const p of this.picks()) {
      const ok = p === 'dmg' || p === 'ossa_eterne' ? /\d danni/.test(a.desc) : p === 'cdr' ? a.cooldown > 0 && !a.main : p === 'fury' ? !!a.special : false;
      if (ok) n.set(p, (n.get(p) ?? 0) + 1);
    }
    return [...n];
  }

  private row(a: Ability<C>): string {
    const owned = this.sys.owns(a.id), on = this.slotOf(a.id) >= 0, rank = 1 + this.upgrades(a).reduce((s, [, k]) => s + k, 0);
    const sub = !owned ? (a.special ? 'Speciale · da imparare' : 'Da imparare') : a.id === this.sys.slots[PRIMARY]?.id ? `Tasto grande · rango ${rank}` : `Rango ${rank}${on ? '' : ' · nel libro'}`;
    return `<button class="row${owned ? '' : ' lock'}${a.id === this.sel ? ' sel' : ''}" data-id="${a.id}"><span class="ic">${ICONS[a.icon] ?? ''}</span>
      <span><b>${esc(a.name)}</b><small>${sub}</small></span>${on ? '<i class="chk" aria-label="Equipaggiata">✓</i>' : ''}</button>`;
  }

  private list(): string {
    const mains = this.all.filter((a) => a.main);
    let html = mains.length ? `<h3>Attacchi primari</h3>${mains.map((a) => this.row(a)).join('')}` : '';
    for (const [s, name] of SCHOOLS) {
      const of = this.all.filter((a) => !a.main && SCHOOL[a.id] === s);
      of.sort((x, y) => +this.sys.owns(y.id) - +this.sys.owns(x.id)); // learnt first
      if (of.length) html += `<h3>${name}</h3>${of.map((a) => this.row(a)).join('')}`;
    }
    return html;
  }

  private page(): string {
    const a = this.all.find((x) => x.id === this.sel)!, owned = this.sys.owns(a.id), at = this.slotOf(a.id);
    const primary = a.id === this.sys.slots[PRIMARY]?.id, touch = document.body.classList.contains('touch');
    const cast = a.channel ? `Canalizzata ${num(a.channel.duration)} s` : a.cast ? `Lancio ${num(a.cast)} s` : 'Istantanea';
    const cd = a.cooldown >= 60 ? `Recupero ${num(a.cooldown / 60)} min` : a.cooldown > 0 ? `Recupero ${num(a.cooldown)} s` : '';
    const stats = [a.mana ? `${a.mana} mana` : a.special ? 'Furia piena' : 'Nessun costo', cast, cd].filter(Boolean).map((t) => `<span>${t}</span>`).join('');
    const line = ([id, n]: [string, number]) => { const c = CARD.get(id)!; return `<b>${esc(c.name)}${n > 1 ? ` ×${n}` : ''}</b>: ${lit(c.text)}`; };
    const ups = this.upgrades(a), pas = this.passives(a);
    const mods = ups.length || pas.length ? `<p class="mods">${[...ups, ...pas].map(line).join('<br>')}</p>` : '';
    let note = '', acts = '';
    const school = SCHOOL_NAME.get(SCHOOL[a.id] as School) ?? '';
    if (primary) note = "L'attacco primario sta sempre sul tasto grande: non si toglie e non si sposta."
      + (this.all.some((x) => x.main && x !== a && this.sys.owns(x.id)) ? " Al suo posto puoi mettere l'altro attacco base che conosci." : '');
    else if (a.main && !owned) note = `Non ancora appreso. È l'attacco base della scuola ${school}: lo impari da solo quando conosci ${SECOND_AT} delle sue 5 abilità, e allora può prendere il tasto grande.`;
    else if (a.main) acts = `<div class="acts"><button class="btn" data-do="main">Sul tasto grande</button><p class="hint">Prende il posto di ${esc(this.sys.slots[PRIMARY]?.name ?? '')}, che resta nel libro. I potenziamenti restano a ciascuno.</p></div>`;
    else if (!owned) note = (a.special ? 'Non ancora appresa. Speciale: la sua carta può uscire dal livello 6 in poi, ai passaggi di livello pari.'
      : 'Non ancora appresa. Ai passaggi di livello pari una delle carte può insegnarla: scegli la sua.')
      + " Oppure compra il tomo della sua scuola da Fra' Bortolo o da Mastro Iseppo: insegna tutta la scuola.";
    else {
      const hint = this.armed ? `<p class="hint go">${touch ? 'Tocca' : 'Clic su'} un tasto illuminato per metterla lì.</p>`
        : at >= 0 ? `<p class="hint">Sulla barra${touch ? '' : `, tasto ${KEYS[at].replace(/^(Digit|Key)/, '')}`}.</p>` : `<p class="hint">Nel libro: non è sulla barra.${touch ? '' : ' Trascinala su un tasto.'}</p>`;
      acts = `<div class="acts"><button class="btn${this.armed ? ' on' : ''}" data-do="equip">${at >= 0 ? 'Sposta' : 'Equipaggia'}</button>
        ${at >= 0 ? '<button class="btn dim" data-do="remove">Rimuovi</button>' : ''}${hint}</div>`;
    }
    return `<div class="txt"><div class="head"><span class="ic">${ICONS[a.icon] ?? ''}</span><div><h4>${esc(a.name)}</h4>
        <div class="sub">${primary ? 'Attacco primario · ' : a.main ? 'Attacco base · ' : a.special ? 'Speciale · ' : ''}${school}</div></div></div>
      <div class="stats">${stats}</div><p class="desc">${lit(a.desc)}</p>${mods}${note ? `<p class="note">${note}</p>` : ''}</div>
      <div class="side">${this.arc()}${acts}</div>`;
  }

  /** The bar in small: its ten buttons where RING puts them (the jump too, greyed, on touch), the selected one lit. */
  private arc(): string {
    const btn = (i: number) => {
      const a = this.sys.slots[i], [deg, r, d] = RING[i], fixed = !SPARE.includes(i);
      return `<button class="ps${fixed ? ' fixed' : ''}${i === POTION ? ' potion' : ''}${a && a.id === this.sel ? ' cur' : ''}" data-slot="${i}"
        style="--a:${deg}deg;--r:${r}px;--d:${d}px" aria-label="${a ? esc(a.name) : 'Vuoto'}">${a ? ICONS[a.icon] ?? '' : ''}<span class="k">${KEYS[i].replace(/^(Digit|Key)/, '')}</span></button>`;
    };
    return `<div class="arc${this.armed ? ' armed' : ''}">${KEYS.map((_, i) => btn(i)).join('')}
      <span class="ps jump" style="--a:180deg;--r:196px;--d:54px">${ICONS.ui_jump}</span></div>`;
  }

  private render(): void {
    const top = this.el.querySelector('.list')?.scrollTop ?? 0;
    this.el.innerHTML = `<div class="tome"><h2>Libro delle abilità</h2><button class="x" aria-label="Chiudi il libro">✕</button>
      <div class="list">${this.list()}</div><div class="page">${this.page()}</div></div>`;
    this.el.querySelector('.list')!.scrollTop = top;
  }

  /** Put the selected ability (or `id`) on slot `i`, remember the bar. */
  private put(id: string, i: number): void {
    if (!SPARE.includes(i) || !this.sys.owns(id) || this.all.find((a) => a.id === id)?.main) return;
    this.sys.equip(id, i);
    saveBar(this.sys.layout());
    playSfx('ui_click', null, { ui: true, rate: 0.8 });
  }

  private click(e: Event): void {
    if (this.noClick) { this.noClick = false; return; } // the end of a drag
    const t = e.target as HTMLElement;
    if (t === this.el || t.closest('.x')) return this.close();
    const row = t.closest<HTMLElement>('.row'), slot = t.closest<HTMLElement>('.ps[data-slot]'), act = t.closest<HTMLElement>('[data-do]');
    if (row) { this.sel = row.dataset.id!; this.armed = false; playSfx('ui_page', null, { ui: true }); }
    else if (slot) {
      const i = +slot.dataset.slot!;
      if (this.armed && SPARE.includes(i)) { this.put(this.sel, i); this.armed = false; }
      else if (this.sys.slots[i] && i !== POTION) { this.sel = this.sys.slots[i]!.id; this.armed = false; }
    } else if (act?.dataset.do === 'equip') this.armed = !this.armed;
    else if (act?.dataset.do === 'main') { this.setMain(this.sel); playSfx('ui_click', null, { ui: true, rate: 0.8 }); }
    else if (act?.dataset.do === 'remove') {
      this.sys.remove(this.slotOf(this.sel));
      saveBar(this.sys.layout());
      playSfx('ui_click', null, { ui: true, rate: 0.6 });
      this.armed = false;
    } else return;
    this.render();
  }

  /** Mouse drags, WoW-style: an owned ability from the list or a slot onto a slot; a slot onto the list takes it off. */
  private press(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const t = e.target as HTMLElement, row = t.closest<HTMLElement>('.row'), slot = t.closest<HTMLElement>('.ps[data-slot]');
    const from = slot ? +slot.dataset.slot! : -1, id = row?.dataset.id ?? (SPARE.includes(from) ? this.sys.slots[from]?.id : undefined);
    if (!id || !this.sys.owns(id) || this.all.find((a) => a.id === id)?.main) return;
    this.drag = { id, from, x: e.clientX, y: e.clientY, pointer: e.pointerId };
    const move = (m: PointerEvent) => {
      const d = this.drag!;
      if (!d.ghost) {
        if (Math.hypot(m.clientX - d.x, m.clientY - d.y) < DRAG) return;
        d.ghost = document.createElement('div');
        d.ghost.className = 'drag-ghost';
        d.ghost.innerHTML = ICONS[this.all.find((a) => a.id === id)!.icon] ?? '';
        document.body.append(d.ghost);
      }
      d.ghost.style.transform = `translate(${m.clientX}px, ${m.clientY}px)`;
      const over = document.elementFromPoint(m.clientX, m.clientY)?.closest<HTMLElement>('.ps[data-slot]') ?? undefined;
      const ok = over && SPARE.includes(+over.dataset.slot!) ? over : undefined;
      if (ok !== d.over) { d.over?.classList.remove('drop'); d.over = ok; ok?.classList.add('drop'); }
    };
    const end = (u: PointerEvent) => {
      const d = this.drag!;
      if (u.pointerId !== d.pointer) return;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', end);
      removeEventListener('pointercancel', end);
      this.drag = undefined;
      if (!d.ghost) return; // a click: the click handler takes it
      d.ghost.remove();
      this.noClick = true;
      setTimeout(() => { this.noClick = false; });
      if (u.type !== 'pointerup') return this.render();
      const list = document.elementFromPoint(u.clientX, u.clientY)?.closest('.list');
      if (d.over) { this.put(d.id, +d.over.dataset.slot!); this.sel = d.id; }
      else if (list && d.from >= 0) { this.sys.remove(d.from); saveBar(this.sys.layout()); playSfx('ui_click', null, { ui: true, rate: 0.6 }); }
      this.armed = false;
      this.render();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
  }
}
