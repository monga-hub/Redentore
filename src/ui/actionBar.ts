import { GCD, KEYS, type Ability, type AbilitySystem, type Caster } from '../abilities/system.ts';
import { ICONS } from './icons.ts';

// WoW-style action bar overlay: 12 square buttons on 1..0 - =, clockwise cooldown sweep
// (a conic-gradient driven by one CSS variable), remaining seconds, key label, click/tap
// to cast, tooltip, cast bar, red error line and floating combat text. Plain DOM, styled
// in index.html; per frame it only writes values that changed.
// On touch devices the same buttons turn round and fan out bottom-right, Albion-style:
// one big button in the corner, an inner arc and an outer arc of smaller ones (RING).

/** Touch ring placement per bar slot: [angle (180 = left of the corner, 90 = above), radius px, diameter px]. */
const RING: Record<number, [number, number, number]> = {
  0: [0, 0, 92], // the big one, in the corner
  1: [95, 118, 58], 2: [125, 118, 58], 5: [155, 118, 58], 6: [185, 118, 58],
  3: [92, 192, 48], 4: [114, 192, 48], 7: [136, 192, 48], 8: [158, 192, 48], // + jump at 180 (index.html)
};

interface Slot<C extends Caster> {
  el: HTMLElement;
  cd: HTMLElement;
  key: HTMLElement;
  ability?: Ability<C>;
  p: string;
  text: string;
  wasCd: boolean;
}

const secs = (t: number) => (t >= 60 ? `${Math.ceil(t / 60)}m` : t >= 3 ? `${Math.ceil(t)}` : t.toFixed(1));
const num = (t: number) => t.toLocaleString('it', { maximumFractionDigits: 1 });

export class ActionBar<C extends Caster> {
  private root = el('div', 'actionbar');
  private castbar = el('div', 'castbar');
  private castFill = el('div', 'fill');
  private castName = el('span', 'name');
  private castTime = el('span', 'time');
  private errors = el('div', 'errors');
  private tip = el('div', 'tooltip');
  private slots: Slot<C>[] = [];
  private castHold = 0; // s the finished/interrupted cast bar stays up
  private sys: AbilitySystem<C>;

  constructor(sys: AbilitySystem<C>) {
    this.sys = sys;
    const bar = el('div', 'bar');
    this.castbar.append(this.castFill, this.castName, this.castTime);
    this.root.append(this.castbar, bar);
    document.body.append(this.root, this.errors, this.tip);

    KEYS.forEach((code, i) => {
      const a = sys.slots[i];
      const s: Slot<C> = { el: el('button', 'slot'), cd: el('span', 'cd'), key: el('span', 'key'), ability: a, p: '', text: '', wasCd: false };
      s.el.innerHTML = a ? `<div class="icon">${ICONS[a.icon] ?? ''}</div><div class="sweep"></div>` : '';
      s.el.classList.toggle('empty', !a);
      s.el.append(s.cd, s.key);
      const ring = RING[i];
      if (ring) {
        s.el.classList.add('ring');
        s.el.style.cssText = `--a:${ring[0]}deg;--r:${ring[1]}px;--d:${ring[2]}px`;
      }
      s.el.tabIndex = -1; // keys belong to the game, not to focus navigation
      s.key.textContent = code.replace('Digit', '').replace('Minus', '-').replace('Equal', '=');
      s.el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); // no focus, no text selection, no double-tap zoom
        if (sys.tryCast(i)) this.press(s);
      });
      if (a) {
        s.el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.showTip(s.el, a); });
        s.el.addEventListener('pointerleave', () => this.tip.classList.remove('show'));
      }
      bar.append(s.el);
      this.slots.push(s);
    });

    // Physical-key labels: on an Italian keyboard Minus is ' and Equal is ì.
    (navigator as Navigator & { keyboard?: { getLayoutMap(): Promise<Map<string, string>> } }).keyboard
      ?.getLayoutMap()
      .then((m) => this.slots.forEach((s, i) => { const k = m.get(KEYS[i]); if (k) s.key.textContent = k.toUpperCase(); }))
      .catch(() => {});
  }

  render(dt: number, pressed: (code: string) => boolean): void {
    const sys = this.sys;
    this.slots.forEach((s, i) => {
      const a = s.ability;
      if (!a) return;
      if (pressed(KEYS[i])) this.press(s);
      const cd = sys.cooldown(a), gcd = a.offGcd ? 0 : sys.gcd;
      const [left, total] = cd >= gcd ? [cd, a.cooldown] : [gcd, GCD];
      const p = left > 0 ? `${((left / total) * 100).toFixed(1)}%` : '0%';
      if (p !== s.p) s.el.style.setProperty('--p', (s.p = p));
      const text = cd > 0 ? secs(cd) : '';
      if (text !== s.text) s.cd.textContent = s.text = text;
      if (s.wasCd && cd === 0) flash(s.el, 'ready'); // the WoW "ready again" shine
      s.wasCd = cd > 0;
      s.el.classList.toggle('active', !!a.active?.(sys.ctx));
      s.el.classList.toggle('casting', sys.casting?.ability === a);
      s.el.classList.toggle('oom', !sys.affordable(a));
    });

    for (const n of sys.notices) {
      if (n.kind === 'error') { this.errors.textContent = n.text; flash(this.errors, 'show'); }
      else if (n.kind === 'heal' || n.kind === 'info') this.float(n.text, n.kind);
      else {
        this.castbar.className = `castbar show ${n.kind}`;
        this.castFill.style.width = '100%';
        this.castName.textContent = n.text;
        this.castTime.textContent = '';
        this.castHold = 0.6;
      }
    }
    sys.notices.length = 0;

    const c = sys.casting;
    if (c) {
      const p = c.t / c.total;
      const cls = `castbar show${c.channel ? ' channel' : ''}`;
      if (this.castbar.className !== cls) this.castbar.className = cls;
      this.castFill.style.width = `${(c.channel ? 1 - p : p) * 100}%`;
      this.castName.textContent = c.ability.name;
      this.castTime.textContent = `${num(c.total - c.t)} s`;
    } else if (this.castHold > 0 && (this.castHold -= dt) <= 0) {
      this.castbar.classList.remove('show');
    }
  }

  private press(s: Slot<C>): void {
    flash(s.el, 'pressed');
  }

  private float(text: string, kind: string): void {
    const f = el('div', `combat ${kind}`);
    f.textContent = text;
    f.addEventListener('animationend', () => f.remove());
    document.body.append(f);
  }

  private showTip(anchor: HTMLElement, a: Ability<C>): void {
    const cast = a.channel ? 'Canalizzata' : a.cast ? `Lancio ${num(a.cast)} s` : 'Istantanea';
    const cd = a.cooldown >= 60 ? `${num(a.cooldown / 60)} min` : `${num(a.cooldown)} s`;
    this.tip.innerHTML = `<b></b>${a.mana ? `<div class="row"><span>${a.mana} mana</span></div>` : ''}<div class="row"><span>${cast}</span><span>Recupero ${cd}</span></div><p></p>`;
    this.tip.querySelector('b')!.textContent = a.name;
    this.tip.querySelector('p')!.textContent = a.desc;
    const r = anchor.getBoundingClientRect();
    this.tip.style.left = `${Math.min(r.left, innerWidth - 280)}px`;
    this.tip.style.bottom = `${innerHeight - r.top + 8}px`;
    this.tip.classList.add('show');
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

/** Restart a one-shot CSS animation bound to `cls`. */
function flash(e: HTMLElement, cls: string): void {
  e.classList.remove(cls);
  void e.offsetWidth;
  e.classList.add(cls);
}
