import { ITEM, RARITY, type Bag } from '../loot/bag.ts';
import { SLOTS, type Equipment, type Slot } from '../loot/gear.ts';
import { playSfx } from '../audio/engine.ts';
import { GLYPH, type BagPanel } from './bag.ts';
import { itemTip } from './tooltip.ts';

// The character sheet, WoW style: C (or the figure button under the satchel) opens a paper doll
// in the bag's overlay: head, neck, shoulders, chest down the left, hands, legs, feet, ring down the
// right, the weapon underneath, the hero's portrait in the middle with the numbers gear and levels
// make (health, mana, armor and what it turns aside, damage, crit, cast speed, mana regen).
// Hover (tap) a slot for its tooltip; click the shown one to take it off into the bag.

const CSS = `
#bag .sheet .doll { display: grid; grid-template-columns: var(--s) minmax(132px, auto) var(--s); gap: 4px 10px; }
#bag .sheet .col { display: flex; flex-direction: column; gap: 4px; }
#bag .sheet .cell:not([style]) svg { opacity: .35; }
#bag .sheet .mid { display: flex; flex-direction: column; align-items: center; min-width: 0; }
#bag .sheet .pic { width: calc(var(--s) * 1.2); height: calc(var(--s) * 1.2); border-radius: 50%; overflow: hidden; flex: none;
  background: radial-gradient(#3a2a18, #070504); border: 2px solid #c9a45c; box-shadow: 0 0 0 1px #000; }
#bag .sheet .pic img { display: block; width: 100%; height: 100%; object-fit: cover; }
#bag .sheet .lv { margin: 2px 0 3px; font: bold 12px/15px Georgia, serif; color: #ffd75e; }
#bag .sheet dl { display: grid; grid-template-columns: auto auto; gap: 0 10px; margin: 0; width: 100%; font: 11px/14.5px system-ui, sans-serif; }
#bag .sheet dt { color: #c9b48a; } #bag .sheet dd { margin: 0; text-align: right; color: #f3ecd8; white-space: nowrap; }
#bag .sheet dd.up { color: #3fd84a; }
#bag .sheet .wpn { display: flex; justify-content: center; margin-top: 4px; }
`;

/** The numbers under the portrait (main.ts reads them off the stats, the cards and the gear). */
export interface Summary { lv: number; hp: number; mana: number; armor: number; cut: number; dmg: number; crit: number; haste: number; regen: number }

export class SheetPanel {
  readonly el = document.createElement('div');
  private readonly host: BagPanel;
  private readonly bag: Bag;
  private readonly gear: Equipment;
  private readonly read: () => Summary;

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
    if (!it) return `<div class="cell" title="${s.name}">${GLYPH[s.icon]}</div>`;
    return `<button class="cell" data-k="w:${slot}" style="--c: ${RARITY[it.rarity].color}" aria-label="${s.name}: ${it.name}">${GLYPH[it.icon]}</button>`;
  }

  private render(): void {
    if (!this.shown) return;
    const n = this.read(), pct = (k: number) => `${Math.round(k * 100)}%`, it = (x: number) => Math.round(x).toLocaleString('it-IT');
    const col = (ids: Slot[]) => `<div class="col">${ids.map((s) => this.cell(s)).join('')}</div>`;
    this.el.innerHTML = `<h2>Personaggio</h2><button class="x" aria-label="Chiudi scheda">✕</button>
      <div class="doll">${col(['testa', 'amuleto', 'spalle', 'torso'])}
        <div class="mid"><div class="pic"><img alt="" src="${import.meta.env.BASE_URL}models/reietto.webp"></div><div class="lv">Il Risorto · livello ${n.lv}</div>
          <dl><dt>Salute</dt><dd>${it(n.hp)}</dd><dt>Mana</dt><dd>${it(n.mana)}</dd>
          <dt>Armatura</dt><dd title="Danni subiti in meno">${it(n.armor)} (−${pct(n.cut)})</dd>
          <dt>Danni</dt><dd class="${n.dmg > 1 ? 'up' : ''}">+${pct(n.dmg - 1)}</dd><dt>Critico</dt><dd>${Math.round(n.crit)}% (×1,5)</dd>
          <dt>Celerità</dt><dd class="${n.haste > 1 ? 'up' : ''}">+${pct(n.haste - 1)}</dd><dt>Mana/s</dt><dd>${n.regen.toLocaleString('it-IT', { maximumFractionDigits: 1 })}</dd></dl></div>
        ${col(['mani', 'gambe', 'piedi', 'anello'])}</div>
      <div class="wpn">${this.cell('arma')}</div>`;
  }
}
