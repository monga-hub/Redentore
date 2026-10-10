import type { PlayerStats } from '../player/stats.ts';
import { ICONS } from './icons.ts';

/** Area name banner, player frame (portrait, health and mana bars) and damage text. Plain DOM, styled in index.html. */
export class Hud {
  private zone = document.getElementById('zone')!;
  private last = '';
  private hp = new Bar(document.querySelector<HTMLElement>('#unit .hp')!);
  private mp = new Bar(document.querySelector<HTMLElement>('#unit .mp')!);
  private lastHp = -1;

  constructor() {
    document.querySelector('#unit .portrait')!.innerHTML = ICONS.will;
  }

  setArea(label: string | undefined): void {
    const text = label ?? '';
    if (text === this.last) return;
    this.last = text;
    this.zone.textContent = text;
    this.zone.classList.remove('show');
    void this.zone.offsetWidth; // restart the fade animation
    if (text) this.zone.classList.add('show');
  }

  setStats(s: PlayerStats): void {
    this.hp.set(s.hp, s.hpMax);
    this.mp.set(s.mana, s.manaMax);
    this.hp.el.classList.toggle('low', s.hp > 0 && s.hp < s.hpMax * 0.25);
    if (this.lastHp >= 0 && s.hp < this.lastHp) {
      const f = document.createElement('div');
      f.className = 'combat dmg';
      f.textContent = `-${Math.round(this.lastHp - s.hp)}`;
      f.addEventListener('animationend', () => f.remove());
      document.body.append(f);
    }
    this.lastHp = s.hp;
  }
}

/** One resource bar: instant fill, a trailing "lag" fill that eases down after a hit, and `cur / max`. */
class Bar {
  private fill: HTMLElement;
  private lag: HTMLElement;
  private text: HTMLElement;
  private shown = '';

  readonly el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
    el.innerHTML = '<i class="lag"></i><i class="fill"></i><span></span>';
    [this.lag, this.fill] = el.querySelectorAll('i');
    this.text = el.querySelector('span')!;
  }

  set(cur: number, max: number): void {
    const c = Math.ceil(cur), key = `${c}/${max}`;
    if (key === this.shown) return;
    this.shown = key;
    const p = `${(c / max) * 100}%`;
    this.fill.style.width = p;
    this.lag.style.width = p; // CSS transition makes it trail behind on the way down
    this.text.textContent = `${c} / ${max}`;
  }
}
