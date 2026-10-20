import { ITEM, RARITY, type Bag } from '../loot/bag.ts';
import { SLOTS, type Equipment, type Slot } from '../loot/gear.ts';
import { playSfx } from '../audio/engine.ts';
import type { BagPanel } from './bag.ts';
import { ICONS } from './icons.ts';
import { itemTip } from './tooltip.ts';

// The character sheet, WoW style: C (or the figure button under the satchel) opens a paper doll
// in the bag's overlay: head, neck, shoulders, chest down the left, hands, legs, feet, ring down the
// right, the weapon underneath, and between them the hero himself, full length and as dressed now,
// idling (ui/figure.ts draws him into `stage`; a drag turns him round). Beside it the numbers gear and
// levels make (health, mana, armor and what it turns aside, damage, crit, cast speed, mana regen).
// Hover (tap) a slot for its tooltip; click the shown one to take it off into the bag.

const CSS = `
#bag .sheet .doll { display: grid; grid-template-columns: var(--s) calc(var(--s) * 3.2) var(--s) auto; grid-template-rows: repeat(5, var(--s)); gap: 4px 8px; }
#bag .sheet .col { display: flex; flex-direction: column; gap: 4px; grid-row: 1 / 5; }
#bag .sheet .col.r { grid-column: 3; }
#bag .sheet .cell:not([style]) .ico { opacity: .3; filter: grayscale(1); } /* an empty slot shows what goes there, faded */
#bag .sheet .stage { position: relative; grid-column: 2; grid-row: 1 / 5; border-radius: 6px; overflow: hidden; background: #120c08; }
#bag .sheet .stage canvas { display: block; width: 100%; height: 100%; touch-action: none; cursor: grab; }
#bag .sheet .stage::after { content: ''; position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
  box-shadow: inset 0 0 16px 6px rgba(0,0,0,.85), inset 0 0 0 1px rgba(217,173,82,.35); }
#bag .sheet .wpn { grid-column: 2; grid-row: 5; display: flex; justify-content: center; }
#bag .sheet .stats { grid-column: 4; grid-row: 1 / 6; min-width: 112px; padding: 16px 0 0 8px; border-left: 1px solid rgba(217,173,82,.25); } /* clear of the ✕ */
#bag .sheet .lv { margin: 0 0 6px; font: bold 12px/15px Georgia, serif; color: #ffd75e; }
#bag .sheet dl { display: grid; grid-template-columns: auto auto; gap: 1px 10px; margin: 0; font: 11px/15px system-ui, sans-serif; }
#bag .sheet dt { color: #c9b48a; } #bag .sheet dd { margin: 0; text-align: right; color: #f3ecd8; white-space: nowrap; }
#bag .sheet dd.up { color: #3fd84a; }
/* Beside the bag the sheet is wider than six cells now: the cells shrink a little sooner. */
#bag.duo:has(.sheet.on) { --s: min(46px, calc((100vw - 170px) / 14), calc((100dvh - 110px) / 5.6)); }
@media (max-width: 480px) { /* a phone held upright: the numbers under the doll */
  #bag .sheet .doll { grid-template-columns: var(--s) calc(var(--s) * 3.2) var(--s); grid-template-rows: repeat(5, var(--s)) auto; }
  #bag .sheet .stats { grid-column: 1 / 4; grid-row: 6; padding: 6px 0 0; border: 0; }
}
`;

/** The numbers beside the figure (main.ts reads them off the stats, the cards and the gear). */
export interface Summary { lv: number; hp: number; mana: number; armor: number; cut: number; dmg: number; crit: number; haste: number; regen: number }

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
      tip: (slot, tap) => itemTip(ITEM.get(this.gear.worn[slot as Slot]!)!, { worn: null, hint: `${tap ? 'Tocca di nuovo' : 'Clic'}: togli` }),
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
    const id = this.gear.worn[slot], it = id ? ITEM.get(id) : undefined, s = SLOTS.find((x) => x.id === slot)!;
    if (!it) return `<div class="cell" title="${s.name}">${ICONS[s.icon]}</div>`;
    return `<button class="cell" data-k="w:${slot}" style="--c: ${RARITY[it.rarity].color}" aria-label="${s.name}: ${it.name}">${ICONS[it.icon]}</button>`;
  }

  private render(): void {
    if (!this.shown) return;
    const n = this.read(), pct = (k: number) => `${Math.round(k * 100)}%`, it = (x: number) => Math.round(x).toLocaleString('it-IT');
    const col = (ids: Slot[], side = '') => `<div class="col ${side}">${ids.map((s) => this.cell(s)).join('')}</div>`;
    this.el.innerHTML = `<h2>Personaggio</h2><button class="x" aria-label="Chiudi scheda">✕</button>
      <div class="doll">${col(['testa', 'amuleto', 'spalle', 'torso'])}<div class="stage" title="Trascina per girarlo"></div>${col(['mani', 'gambe', 'piedi', 'anello'], 'r')}
        <div class="wpn">${this.cell('arma')}</div>
        <div class="stats"><div class="lv">Il Risorto · livello ${n.lv}</div>
          <dl><dt>Salute</dt><dd>${it(n.hp)}</dd><dt>Mana</dt><dd>${it(n.mana)}</dd>
          <dt>Armatura</dt><dd title="Danni subiti in meno">${it(n.armor)} (−${pct(n.cut)})</dd>
          <dt>Danni</dt><dd class="${n.dmg > 1 ? 'up' : ''}">+${pct(n.dmg - 1)}</dd><dt>Critico</dt><dd>${Math.round(n.crit)}% (×1,5)</dd>
          <dt>Celerità</dt><dd class="${n.haste > 1 ? 'up' : ''}">+${pct(n.haste - 1)}</dd><dt>Mana/s</dt><dd>${n.regen.toLocaleString('it-IT', { maximumFractionDigits: 1 })}</dd></dl></div></div>`;
    this.el.querySelector('.stage')!.append(this.stage);
  }
}
