import { Bag, ITEM, RARITY } from '../loot/bag.ts';
import { Assembly, type Recipe } from '../loot/assembly.ts';
import { buildOf } from '../loot/builds.ts';
import { STAT, type Stat } from '../loot/gear.ts';
import { CHOICE_CSS } from './levelUp.ts';
import { itemIcon } from './itemIcon.ts';
import { playSfx } from '../audio/engine.ts';

/** Uses the skill-choice card conventions inside the already-paused bag modal. */
export class AssemblyPanel {
  readonly el = document.createElement('div');
  private session?: Assembly;
  private selected = -1;
  private timer = 0;
  private ready = false;
  private readonly bag: Bag;
  private readonly changed: (message?: string) => void;
  private returnFocus?: HTMLElement;

  constructor(parent: HTMLElement, bag: Bag, changed: (message?: string) => void) {
    this.bag = bag;
    this.changed = changed;
    const style = document.createElement('style');
    style.textContent = CHOICE_CSS.slice(0, CHOICE_CSS.indexOf('#lvflash')).replaceAll('#levelup', '#assembly') + `
      #assembly { z-index: 20; overflow-y: auto; justify-content: flex-start; padding-top: 18px; }
      #assembly .cards { margin:0; flex:1 1 auto; min-height:0; overflow-y:auto; align-items:flex-start; }
      #assembly .head, #assembly .status { flex-shrink:0; }
      #assembly .card { min-height: 0; }
      #assembly .actions { display: flex; gap: 16px; padding: 8px; flex-shrink:0; background:rgba(12,8,4,.95); border-radius:4px; }
      #assembly .actions button { padding: 10px 18px; font: bold 16px Georgia; color:#f3e2b0; background:linear-gradient(#4a3420,#140e08); border:1px solid #c9a45c; border-radius:4px; }
      #assembly .actions button:disabled {opacity:.5;}
      #assembly .status { color: #ffd75e; font: 15px Georgia; }
      #assembly .joining { display:flex; gap:6px; padding:20px 0; }
      #assembly .joining .ic { width:44px; height:44px; animation: piece-join .45s ease-in-out; }
      @keyframes piece-join { from { transform: translateY(-16px) scale(.65); opacity:.2; } to { transform:none; opacity:1; } }
      @media(prefers-reduced-motion:reduce) { #assembly, #assembly * { animation:none !important; transition:none !important; } }
      @media(max-width:560px) { #assembly .cards { margin:0; flex:none; overflow:visible; } #assembly .card p { grid-area:auto; grid-column:1 / -1; } #assembly .head b { font-size:24px; } }
      @media(max-height:500px) { #assembly { gap:6px; padding-top:8px; } #assembly .card { font-size:12px; gap:3px; } #assembly .head b {font-size:22px;} #assembly .actions {padding:0;} #assembly .card .foot {display:none;} #assembly .head span {font-size:12px;} }
    `;
    document.head.append(style);
    this.el.id = 'assembly';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-label', 'Unisci sei componenti');
    for (const type of ['click', 'pointerdown', 'pointerup', 'pointermove', 'wheel']) this.el.addEventListener(type, e => e.stopPropagation());
    this.el.addEventListener('click', e => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button) return;
      if (button.dataset.choice !== undefined) this.select(Number(button.dataset.choice));
      else if (button.dataset.action === 'cancel') this.close();
      else if (button.dataset.action === 'confirm') this.confirm();
    });
    parent.append(this.el);
  }

  get open(): boolean { return !!this.session; }

  show(recipe: Recipe): void {
    if (this.open) return;
    const session = Assembly.begin(this.bag, recipe);
    if (!session) return this.changed('Servono sei pezzi diversi compatibili.');
    this.session = session;
    this.returnFocus = document.activeElement as HTMLElement;
    this.selected = -1;
    this.ready = false;
    this.el.innerHTML = `<div class="head"><b>Unione dei sei pezzi</b><span>Capitolo ${recipe.chapter} · ${RARITY[recipe.rarity].name} · nessun pezzo consumato prima della conferma</span></div><div class="joining">${session.ingredientIds.map(id => `<div class="ic">${itemIcon(ITEM.get(id)!)}</div>`).join('')}</div><div class="status" role="status">Intrecciando il corredo…</div><div class="actions"><button data-action="cancel">Annulla</button></div>`;
    this.el.classList.add('show');
    this.el.querySelector<HTMLButtonElement>('button')!.focus();
    this.timer = window.setTimeout(() => {
      if (this.session !== session) return;
      this.ready = true;
      this.el.querySelector('.joining')!.outerHTML = `<div class="cards">${session.choices.map((it, i) => {
        const build = buildOf(it.build)!;
        const stats = Object.entries(it.stats!).map(([key, value]) => `${key === 'armatura' ? 'Armatura' : STAT[key as Stat].name} +${value}`).join(' · ');
        return `<button class="card" data-choice="${i}" aria-pressed="false"><span class="tag">${build.role}</span><div class="ic">${itemIcon(it)}</div><h3>${build.name}</h3><p>${build.description}</p><p>${build.priorities}</p><p>${stats}</p><div class="foot"><kbd>${i + 1}</kbd></div></button>`;
      }).join('')}</div>`;
      this.el.querySelector('.status')!.textContent = 'Scegli una build, poi conferma: consuma un pezzo per parte.';
      this.el.querySelector('.actions')!.insertAdjacentHTML('afterbegin', '<button data-action="confirm" disabled>Conferma abito</button>');
      this.el.querySelector<HTMLButtonElement>('[data-choice]')!.focus();
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450);
  }

  key(e: KeyboardEvent): void {
    e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Escape') return this.close();
    if (e.code === 'Tab') {
      const buttons = [...this.el.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(index + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
    } else if (/^(Digit|Numpad)[123]$/.test(e.code)) this.select(Number(e.code.slice(-1)) - 1);
    else if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(e.code)) this.select((this.selected + (e.code === 'ArrowLeft' || e.code === 'ArrowUp' ? 2 : 1)) % 3);
    else if (e.code === 'Enter' || e.code === 'Space') (document.activeElement as HTMLButtonElement)?.click();
  }

  close(): void {
    clearTimeout(this.timer);
    this.session?.cancel();
    this.session = undefined;
    this.el.classList.remove('show');
    this.el.innerHTML = '';
    const focus = this.returnFocus;
    this.changed();
    if (focus?.isConnected) focus.focus();
    else this.el.parentElement?.querySelector<HTMLElement>('.bagp .x')?.focus();
  }

  private select(index: number): void {
    if (!this.ready || !this.session?.choices[index]) return;
    this.selected = index;
    this.el.querySelectorAll<HTMLElement>('[data-choice]').forEach((el, i) => { el.classList.toggle('sel', i === index); el.setAttribute('aria-pressed', String(i === index)); });
    const button = this.el.querySelector<HTMLButtonElement>('[data-action="confirm"]')!;
    button.disabled = false;
    button.textContent = `Crea ${buildOf(this.session.choices[index].build)!.name}`;
  }

  private confirm(): void {
    const item = this.session?.choices[this.selected];
    if (!item || !this.ready) return;
    const error = this.session!.confirm(item.id);
    if (error) { this.el.querySelector('.status')!.textContent = error; return; }
    playSfx('quest', null, { ui: true });
    this.close();
    this.changed(`Creato: ${item.name}`);
  }
}
