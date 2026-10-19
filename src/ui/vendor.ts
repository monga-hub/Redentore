import { ITEM, RARITY, type Bag, type Item } from '../loot/bag.ts';
import { buy, buyPrice, sell, sellPrice, type Equipment } from '../loot/gear.ts';
import { playSfx } from '../audio/engine.ts';
import type { BagPanel } from './bag.ts';
import { ICONS } from './icons.ts';
import { itemTip } from './tooltip.ts';

// The merchants' window, WoW style (Fra' Bortolo's shop, Mastro Iseppo's): "Commercia" in their dialogue opens it
// with the bag beside it. Left, their goods, purple pieces with their price; under them the buyback row of
// what was sold this visit. While it is open a click on a bag slot sells the whole stack for a
// quarter of its price (ui/bag.ts `selling`); goods and buyback are bought the same way.

const CSS = `
#bag .vendor { width: min(380px, calc(100vw - 24px)); }
#bag.duo .vendor { width: auto; }
#bag .vendor .sub { margin: -6px 0 8px; text-align: center; font: italic 12px Georgia, serif; color: #c9b48a; }
#bag .vendor .goods { display: grid; grid-template-columns: repeat(2, minmax(0, 168px)); gap: 4px 8px; }
#bag .vendor .good { display: flex; align-items: center; gap: 6px; min-width: 0; font: 12px/14px Georgia, serif; }
#bag .vendor .good .cell { flex: none; width: calc(var(--s) * .85); height: calc(var(--s) * .85); }
#bag .vendor .good span { min-width: 0; }
#bag .vendor .good em { display: block; overflow: hidden; text-overflow: ellipsis; font-style: normal; font-weight: bold; }
#bag .vendor .good small { display: block; font: 11px system-ui, sans-serif; color: #ffd75e; }
#bag .vendor .good small.no { color: #ff5a4a; }
#bag .vendor .good .coin { width: 9px; height: 9px; margin-right: 4px; }
#bag .vendor .back { display: flex; align-items: center; gap: 4px; margin-top: 10px; min-height: calc(var(--s) * .75); }
#bag .vendor .back > small { margin-right: 6px; font: 11px system-ui, sans-serif; color: #c9b48a; }
#bag .vendor .back .cell { width: calc(var(--s) * .75); height: calc(var(--s) * .75); }
#bag .vendor .foot small { font: 11px system-ui, sans-serif; color: #c9b48a; }
@media (max-width: 760px) { #bag.duo .vendor .goods { grid-template-columns: minmax(0, 168px); max-height: calc(100dvh - 190px); overflow-y: auto; } }
`;
const BACK = 6; // buyback slots, oldest dropped

/** A shop: its keeper's name, the line under it and what is on sale. */
export interface Merchant { name: string; sub: string; goods: () => readonly Item[] }

export class VendorPanel {
  readonly el = document.createElement('div');
  private readonly host: BagPanel;
  private readonly bag: Bag;
  private readonly gear: Equipment;
  private sold: { id: string; n: number }[] = []; // this visit's sales, newest last
  private who: Merchant = { name: '', sub: '', goods: () => [] };

  constructor(host: BagPanel, bag: Bag, gear: Equipment) {
    this.host = host;
    this.bag = bag;
    this.gear = gear;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.el.className = 'panel vendor';
    this.el.addEventListener('hidden', () => { // closed: no more selling from the bag, and the buyback goes
      if (this.host.selling === this.sell) this.host.selling = undefined;
      this.sold.length = 0;
    });
    host.mount(this.el);
    const hint = (tap: boolean, verb: string, price: number) => (this.bag.gold < price ? 'Non hai abbastanza oro' : `${tap ? 'Tocca di nuovo' : 'Clic'}: ${verb}`);
    host.kind('s', {
      tip: (id, tap) => {
        const it = ITEM.get(id)!, p = buyPrice(it);
        return itemTip(it, { worn: ITEM.get(this.gear.worn[it.slot!] ?? ''), price: `Prezzo: ${p.toLocaleString('it-IT')} oro`, hint: hint(tap, 'compra', p), no: this.bag.gold < p });
      },
      use: (id) => this.buy(id, buyPrice(ITEM.get(id)!)),
    }, () => this.render());
    host.kind('r', {
      tip: (i, tap) => {
        const s = this.sold[Number(i)], it = ITEM.get(s.id)!, p = sellPrice(it) * s.n;
        return itemTip(it, { n: s.n, worn: null, price: `Riacquisto: ${p.toLocaleString('it-IT')} oro`, hint: hint(tap, 'riacquista', p), no: this.bag.gold < p });
      },
      use: (i) => {
        const s = this.sold[Number(i)], it = ITEM.get(s.id)!, p = sellPrice(it) * s.n;
        if (this.bag.gold < p) return this.host.say('Non hai abbastanza oro.');
        if (!this.bag.add(s.id, s.n)) return this.host.say('La borsa è piena.');
        this.bag.gold -= p;
        this.sold.splice(Number(i), 1);
        playSfx('loot', null, { ui: true, rate: 1.4, gain: 0.5 });
      },
    });
  }

  /** "Commercia": `who`'s shop and the bag. */
  open(who: Merchant): void {
    this.who = who;
    this.host.show(this.el, true);
    this.host.show(undefined, true);
    this.host.selling = this.sell;
  }

  private sell = (i: number): void => {
    const s = sell(this.bag, i, (id) => ITEM.get(id));
    if (!s) return;
    this.sold.push({ id: s.id, n: s.n });
    if (this.sold.length > BACK) this.sold.shift();
    playSfx('loot', null, { ui: true, rate: 1.7, gain: 0.5 });
    this.host.say(`+${s.gold.toLocaleString('it-IT')} oro`, true);
  };

  private buy(id: string, price: number): void {
    const it = ITEM.get(id)!, why = buy(this.bag, it, price);
    if (why) return this.host.say(why);
    playSfx('loot', null, { ui: true, rate: 1.1, gain: 0.6 });
    this.host.say(`Comprato: ${it.name}`, true);
  }

  private render(): void {
    if (!this.el.classList.contains('on')) return;
    const cell = (k: string, id: string, n = 1) => {
      const it = ITEM.get(id)!;
      return `<button class="cell" data-k="${k}" style="--c: ${RARITY[it.rarity].color}" aria-label="${it.name}">${ICONS[it.icon]}${n > 1 ? `<b>${n}</b>` : ''}</button>`;
    };
    this.el.innerHTML = `<h2>${this.who.name}</h2><button class="x" aria-label="Chiudi bottega">✕</button>
      <p class="sub">${this.who.sub}</p>
      <div class="goods">${this.who.goods().map((it) => {
        const p = buyPrice(it);
        return `<div class="good">${cell(`s:${it.id}`, it.id)}<span><em style="color: ${RARITY[it.rarity].color}">${it.name}</em><small class="${this.bag.gold < p ? 'no' : ''}"><i class="coin"></i>${p.toLocaleString('it-IT')}</small></span></div>`;
      }).join('')}</div>
      <div class="back"><small>Riacquista</small>${this.sold.map((s, i) => cell(`r:${i}`, s.id, s.n)).join('')}</div>
      <div class="foot"><small>Scegli un oggetto della borsa per venderlo</small></div>`;
  }
}
