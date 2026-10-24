import { playSfx } from '../audio/engine.ts';
import type { PlayerStats } from '../player/stats.ts';

const CHARGE = 0.8; // share of a level where the XP bar starts to crackle

/** Area name banner, player frame (portrait, health and mana bars) and damage text. Plain DOM, styled in index.html. */
export class Hud {
  private zone = document.getElementById('zone')!;
  private last = '';
  private hp = new Bar(document.querySelector<HTMLElement>('#unit .hp')!);
  private mp = new Bar(document.querySelector<HTMLElement>('#unit .mp')!);
  private xp = new Bar(document.querySelector<HTMLElement>('#unit .xp')!);
  private lv = document.querySelector<HTMLElement>('#unit .lv')!;
  private lastLv = 0;
  private lastHp = -1;
  private charged = false;

  /** `portrait`: the hero's, under public/models/; `name` on his frame. */
  constructor(portrait: string, name: string) {
    document.querySelector('#unit .name')!.textContent = name;
    document.querySelector('#unit .portrait')!.innerHTML = `<img alt="" src="${import.meta.env.BASE_URL}models/${portrait}">`;
    this.xp.el.addEventListener('animationend', (e) => { if (e.animationName === 'xpburst') this.xp.el.classList.remove('up'); }); // drops the frame back under the level-up veil
  }

  setArea(label: string | undefined): void {
    const text = label ?? '';
    if (text === this.last) return;
    this.last = text;
    this.zone.textContent = text;
    this.fit();
    this.zone.classList.remove('show');
    void this.zone.offsetWidth; // restart the fade animation
    if (text) this.zone.classList.add('show');
  }

  /**
   * On a phone held sideways the quest tracker (quest/view.ts) shares the title's row: the title then keeps to the band
   * between the player frame and the tracker, a size down, wrapping if it must, so neither covers the other.
   */
  private fit(): void {
    const z = this.zone;
    z.style.left = z.style.right = '';
    z.classList.remove('narrow');
    const q = document.getElementById('quests')?.getBoundingClientRect(), t = z.getBoundingClientRect();
    if (!q?.width || !z.textContent) return;
    const words = document.createRange();
    words.selectNodeContents(z);
    if (q.top > t.top + 90 || q.bottom < t.top || q.left > (innerWidth + words.getBoundingClientRect().width) / 2 + 8) return;
    z.style.left = `${document.getElementById('unit')!.getBoundingClientRect().right + 8}px`;
    z.style.right = `${innerWidth - q.left + 8}px`;
    z.classList.add('narrow');
  }

  /** Level badge and the XP bar into the next level (full at the cap); the badge pops on a level-up.
   *  From CHARGE of the level the bar crackles, harder towards the top (`--charge` 0..1), with a zap
   *  once on the way in; the level-up itself bursts on it. */
  setLevel(lv: number, into: number, next: number): void {
    if (next) this.xp.set(into, next);
    else this.xp.set(1, 1);
    const k = next ? Math.max(0, (into / next - CHARGE) / (1 - CHARGE)) : 0, on = next > 0 && into >= next * CHARGE;
    this.xp.el.style.setProperty('--charge', k.toFixed(2));
    if (on !== this.charged) {
      this.charged = on;
      this.xp.el.classList.toggle('charged', on);
      if (on && lv === this.lastLv) playSfx('zap', null, { ui: true, gain: 0.5, rate: 1.4 });
    }
    if (lv === this.lastLv) return;
    this.lv.textContent = String(lv);
    this.lv.title = `Livello ${lv}`;
    if (this.lastLv) {
      for (const el of [this.lv, this.xp.el]) { el.classList.remove('up'); void el.offsetWidth; el.classList.add('up'); }
    }
    this.lastLv = lv;
  }

  setStats(s: PlayerStats): void {
    this.hp.set(s.hp, s.hpMax);
    this.mp.set(s.mana, s.manaMax);
    this.mp.el.classList.toggle('rest', s.resting && s.mana < s.manaMax); // the five-second rule: the bar glows while it fills fast
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
export class Bar {
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
