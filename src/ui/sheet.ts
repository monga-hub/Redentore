import { ITEM, RARITY, type Bag } from '../loot/bag.ts';
import { ARMOR_SLOTS, SLOT, type Equipment, type Slot } from '../loot/gear.ts';
import { playSfx } from '../audio/engine.ts';
import type { BagPanel } from './bag.ts';
import { ICONS } from './icons.ts';
import { itemIcon } from './itemIcon.ts';
import { buildOf } from '../loot/builds.ts';
import { itemTip, spellName } from './tooltip.ts';
import { RANK, SCHOOL_NAME, medal } from './book.ts';
import type { School } from '../player/levels.ts';

// C (or the figure button under the satchel) opens the character sheet in the bag's overlay:
// all four equipment slots down the left, the full-length hero beside them (ui/figure.ts draws
// him into `stage`; a drag turns him round), then his level, schools and stats.
// Hover (tap) a slot for its tooltip; click the shown one to take it off into the bag.

const CSS = `
#bag .sheet .doll { display: grid; grid-template-columns: var(--s) calc(var(--s) * 3.8) auto; gap: 8px; align-items: start; }
#bag .sheet .col { display: flex; flex-direction: column; gap: 4px; }
#bag .sheet .cell:not([style]) .ico { opacity: .3; filter: grayscale(1); } /* an empty slot shows what goes there, faded */
#bag .sheet .stage { position: relative; grid-column: 2; grid-row: 1; height: calc(var(--s) * 4 + 12px); border-radius: 6px; overflow: hidden; background: #120c08; }
#bag .sheet .stage canvas { display: block; width: 100%; height: 100%; touch-action: none; cursor: grab; }
#bag .sheet .stage::after { content: ''; position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
  box-shadow: inset 0 0 16px 6px rgba(0,0,0,.85), inset 0 0 0 1px rgba(217,173,82,.35); }
#bag .sheet .stats { grid-column: 3; grid-row: 1; min-width: 112px; padding: 16px 0 0 8px; border-left: 1px solid rgba(217,173,82,.25); } /* clear of the ✕ */
#bag .sheet .lv { margin: 0 0 6px; font: bold 12px/15px Georgia, serif; color: #ffd75e; }
#bag .sheet .sch { display: flex; flex-direction: column; gap: 2px; margin: -2px 0 6px; font: 11px/15px Georgia, serif; color: #f3e2b0; }
#bag .sheet .sch span { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
#bag .sheet .sch small { color: #9a8c70; font-style: italic; }
#bag .sheet dl { display: grid; grid-template-columns: auto auto; gap: 1px 10px; margin: 0; font: 11px/15px system-ui, sans-serif; }
#bag .sheet dt { color: #c9b48a; } #bag .sheet dd { margin: 0; text-align: right; color: #f3ecd8; white-space: nowrap; }
#bag .sheet .build-info { max-width: min(400px, calc(100vw - 70px)); margin-top: 8px; font: 11px/15px Georgia, serif; }
#bag .sheet .build-info p { margin: 4px 0; }
#bag .sheet dd.up { color: #3fd84a; }
/* Leave room for both panels when the bag is open beside the sheet. */
#bag.duo:has(.sheet.on) { --s: min(46px, calc((100vw - 170px) / 14.6), calc((100dvh - 110px) / 5.6)); }
@media (max-width: 480px) { /* a phone held upright: the numbers under the doll */
  #bag.duo:has(.sheet.on) { --s: min(46px, calc((100vw - 80px) / 6), calc((100dvh - 210px) / 10.6)); }
  #bag .sheet .doll { grid-template-columns: var(--s) calc(var(--s) * 3.8); }
  #bag .sheet .stats { grid-column: 1 / 3; grid-row: 2; padding: 6px 0 0; border: 0; }
}
`;

/** The numbers beside the figure (main.ts reads them off the stats, the cards and the gear). */
export interface Summary { name: string; lv: number; schools: readonly School[]; hp: number; mana: number; armor: number; cut: number; dmg: number; physical?: number; magic?: number; crit: number; haste: number; regen: number }

export class SheetPanel {
  readonly el = document.createElement('div');
  private readonly host: BagPanel;
  private readonly bag: Bag;
  private readonly gear: Equipment;
  private readonly read: () => Summary;
  /** Where the hero is drawn (ui/figure.ts), kept across redraws. */
  readonly stage = document.createElement('canvas');

  constructor(host: BagPanel, bag: Bag, gear: Equipment, read: () => Summary) {
    this.host = host;
    this.bag = bag;
    this.gear = gear;
    this.read = read;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.el.className = 'panel sheet';
    host.mount(this.el);
    host.keys.KeyC = () => this.toggle();
    host.kind('w', {
      tip: (slot, tap) => itemTip(ITEM.get(this.gear.worn[slot as Slot]!)!, { worn: null, compact: tap, hint: `${tap ? 'Tocca di nuovo' : 'Clic'}: togli` }),
      use: (slot) => {
        const why = this.gear.takeOff(this.bag, slot as Slot);
        if (why) this.host.say(why);
        else playSfx('ui_click', null, { ui: true, rate: 0.7 });
      },
    }, () => this.render());
  }

  get shown(): boolean {
    return this.el.classList.contains('on');
  }

  toggle(): void {
    this.host.show(this.el, !this.shown);
  }

  private cell(slot: Slot): string {
    const id = this.gear.worn[slot], it = id ? ITEM.get(id) : undefined, s = SLOT.get(slot)!;
    if (!it) return `<button class="cell" data-slot="${slot}" title="${s.name}" aria-label="${s.name}: vuoto">${ICONS[s.icon]}</button>`;
    return `<button class="cell" data-slot="${slot}" data-k="w:${slot}" style="--c: ${RARITY[it.rarity].color}" aria-label="${s.name}: ${it.name}">${itemIcon(it)}</button>`;
  }

  private render(): void {
    if (!this.shown) return;
    const n = this.read(), pct = (k: number) => `${Math.round(k * 100)}%`, it = (x: number) => Math.round(x).toLocaleString('it-IT');
    const slots: Slot[] = ['abito', 'arma', 'amuleto', 'anello'];
    this.el.innerHTML = `<h2>Personaggio</h2><button class="x" aria-label="Chiudi scheda">✕</button>
      <div class="doll"><div class="col">${slots.map((s) => this.cell(s)).join('')}</div><div class="stage" title="Trascina per girarlo"></div>
        <div class="stats"><div class="lv">${n.name} · livello ${n.lv}</div>
          <div class="sch">${n.schools.map((s, i) => `<span>${medal(i)}${SCHOOL_NAME.get(s)} <small>${RANK[i]}</small></span>`).join('')}</div>
          <dl><dt>Salute</dt><dd>${it(n.hp)}</dd><dt>Mana</dt><dd>${it(n.mana)}</dd>
          <dt>Armatura</dt><dd title="Danni subiti in meno">${it(n.armor)} (−${pct(n.cut)})</dd>
          <dt>Danni fisici</dt><dd class="${(n.physical ?? n.dmg) > 1 ? 'up' : ''}">+${pct((n.physical ?? n.dmg) - 1)}</dd><dt>Danni magici</dt><dd class="${(n.magic ?? n.dmg) > 1 ? 'up' : ''}">+${pct((n.magic ?? n.dmg) - 1)}</dd><dt>Critico</dt><dd>${Math.round(n.crit)}% (×1,5)</dd>
          <dt>Velocità lancio</dt><dd class="${n.haste > 1 ? 'up' : ''}">+${pct(n.haste - 1)}</dd><dt>Mana/s</dt><dd>${n.regen.toLocaleString('it-IT', { maximumFractionDigits: 1 })}</dd></dl></div></div>`;
    const build = buildOf(ITEM.get(this.gear.worn.abito ?? '')?.build);
    if (build) {
      const info = document.createElement('div'); info.className = 'build-info';
      info.innerHTML = `<b>${build.name} · ${build.role}</b><details><summary>Consigli di gioco</summary><p>${build.description}</p><p>Priorità: ${build.priorities}</p><p>${build.spells.map(spellName).join(' · ')}</p><p>Abilità da apprendere normalmente; puoi usare anche le altre.</p></details>`;
      this.el.append(info);
    }
    if (!this.gear.worn.abito && ARMOR_SLOTS.some((slot) => this.gear.worn[slot])) {
      const legacy = document.createElement('div');
      legacy.innerHTML = `<p>Vecchio corredo conservato: indossa un abito completo per sostituirlo. Tutti i pezzi passeranno in borsa.</p>${ARMOR_SLOTS.filter((slot) => this.gear.worn[slot]).map((slot) => this.cell(slot)).join('')}`;
      this.el.append(legacy);
    }
    this.el.querySelector('.stage')!.append(this.stage);
  }
}
