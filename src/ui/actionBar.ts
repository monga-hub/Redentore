import { CHARGE_MAX, GCD, KEYS, saveBar, type Ability, type AbilitySystem, type Caster } from '../abilities/system.ts';
import { ICONS } from './icons.ts';

// WoW-style action bar overlay: 12 square buttons on 1..0 - =, clockwise cooldown sweep
// (a conic-gradient driven by one CSS variable), remaining seconds, key label, click/tap
// to cast, tooltip, cast bar, red error line and floating combat text. Plain DOM, styled
// in index.html; per frame it only writes values that changed.
// On touch devices the same buttons turn round and fan out bottom-right, Albion-style:
// one big button in the corner, an inner arc and an outer arc of smaller ones (RING).
// There a quick tap casts on release and a press held for HOLD ms shows the tooltip
// instead, until the finger lifts.
// With a mouse, a click casts on release and a filled slot can be dragged onto another one to swap
// them instead (`grab`), without casting; keys still cast on press and stay
// with the slots, so the player's own arrangement is what 1..0 cast. Touch is unchanged.
// A half-ring over the main button (slot 0, the big one on touch) shows the charge bar,
// green → yellow → red when full; until then the specials stay greyed out. It shows once a special
// is on the bar; abilities unlocked by a level-up appear in their slot by themselves.
// The cooldown sweep shows each slot's school GCD, so after an ice spell only the ice slots sweep;
// a hit that sets the cast bar back flashes it red as the fill jumps back.

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

const HOLD = 450; // ms
const DRAG = 6; // px a mouse press travels before it becomes a drag

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
  private gauge?: SVGElement;
  private charge = -1;
  private pushed = 0; // pushbacks of the cast on the bar, seen so far
  private sys: AbilitySystem<C>;
  private ghost?: HTMLElement; // the icon being dragged

  constructor(sys: AbilitySystem<C>) {
    this.sys = sys;
    const bar = el('div', 'bar');
    this.castbar.append(this.castFill, this.castName, this.castTime);
    this.root.append(this.castbar, bar);
    document.body.append(this.root, this.errors, this.tip);

    KEYS.forEach((code, i) => {
      const s: Slot<C> = { el: el('button', 'slot'), cd: el('span', 'cd'), key: el('span', 'key'), p: '', text: '', wasCd: false };
      if (i === 0) {
        s.el.classList.add('main');
        s.el.insertAdjacentHTML('beforeend', '<svg class="charge" viewBox="0 0 100 100"><path d="M6 50 A44 44 0 0 1 94 50"/><path class="fill" pathLength="100" d="M6 50 A44 44 0 0 1 94 50"/></svg>');
        this.gauge = s.el.querySelector('.charge')!;
      }
      const ring = RING[i];
      if (ring) {
        s.el.classList.add('ring');
        s.el.style.cssText = `--a:${ring[0]}deg;--r:${ring[1]}px;--d:${ring[2]}px`;
      }
      s.el.tabIndex = -1; // keys belong to the game, not to focus navigation
      s.key.textContent = code.replace('Digit', '').replace('Minus', '-').replace('Equal', '=');
      let hold = 0, held = false;
      s.el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); // no focus, no text selection, no double-tap zoom
        if (e.pointerType === 'touch' && s.ability) {
          held = false;
          s.el.classList.add('down');
          hold = window.setTimeout(() => { held = true; this.showTip(s.el, s.ability!); }, HOLD);
        } else if (e.pointerType !== 'touch' && e.button === 0 && s.ability) {
          this.grab(i, e, () => { if (sys.tryCast(i)) this.press(s); });
        }
      });
      const lift = (cast: boolean) => (e: PointerEvent) => {
        if (e.pointerType !== 'touch' || !s.el.classList.contains('down')) return;
        clearTimeout(hold);
        s.el.classList.remove('down');
        this.tip.classList.remove('show');
        if (cast && !held && sys.tryCast(i)) this.press(s);
      };
      s.el.addEventListener('pointerup', lift(true));
      s.el.addEventListener('pointercancel', lift(false));
      s.el.addEventListener('contextmenu', (e) => e.preventDefault()); // Android long-press menu
      s.el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && s.ability && !this.ghost) this.showTip(s.el, s.ability); });
      s.el.addEventListener('pointerleave', () => this.tip.classList.remove('show'));
      s.el.append(s.cd, s.key);
      bar.append(s.el);
      this.slots.push(s);
      this.paint(i);
    });

    // Physical-key labels: on an Italian keyboard Minus is ' and Equal is ì.
    (navigator as Navigator & { keyboard?: { getLayoutMap(): Promise<Map<string, string>> } }).keyboard
      ?.getLayoutMap()
      .then((m) => this.slots.forEach((s, i) => { const k = m.get(KEYS[i]); if (k) s.key.textContent = k.toUpperCase(); }))
      .catch(() => {});
  }

  render(dt: number, pressed: (code: string) => boolean): void {
    const sys = this.sys;
    this.slots.forEach((s, i) => { if (s.ability !== sys.slots[i]) this.paint(i); }); // unlocked meanwhile
    const fury = sys.slots.some((a) => a?.special);
    if (this.gauge && this.gauge.classList.contains('off') === fury) this.gauge.classList.toggle('off', !fury);
    if (sys.charge !== this.charge && this.gauge) {
      const full = sys.charge >= CHARGE_MAX, f = this.gauge.lastElementChild as SVGElement;
      if (full && this.charge >= 0) this.float('Furia piena!', 'fury');
      this.charge = sys.charge;
      f.style.strokeDasharray = `${(sys.charge / CHARGE_MAX) * 100} 100`;
      f.style.stroke = `hsl(${120 * (1 - sys.charge / CHARGE_MAX)} 90% 52%)`;
      this.gauge.classList.toggle('full', full);
    }
    this.slots.forEach((s, i) => {
      const a = s.ability;
      if (!a) return;
      if (pressed(KEYS[i])) this.press(s);
      const cd = sys.cooldown(a), gcd = sys.gcd(a); // only the slots of the school just used sweep
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
      if (a.special) s.el.classList.toggle('locked', !sys.charged(a));
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
      if (c.pushed > this.pushed) flash(this.castFill, 'pushed'); // a hit set the bar back
      this.pushed = c.pushed;
      this.castName.textContent = c.ability.name;
      this.castTime.textContent = `${num(c.total - c.t)} s`;
    } else if (this.castHold > 0 && (this.castHold -= dt) <= 0) {
      this.castbar.classList.remove('show');
    }
  }

  /** Show what slot `i` holds now: icon, empty/special look, and no stale cooldown text or "ready" shine. */
  private paint(i: number): void {
    const s = this.slots[i], a = (s.ability = this.sys.slots[i]);
    s.el.querySelector('.icon')?.remove();
    s.el.querySelector('.sweep')?.remove();
    if (a) s.el.insertAdjacentHTML('afterbegin', `<div class="icon">${ICONS[a.icon] ?? ''}</div><div class="sweep"></div>`);
    s.el.classList.toggle('empty', !a);
    s.el.classList.toggle('special', !!a?.special);
    s.el.classList.remove('active', 'casting', 'oom', 'locked');
    s.p = s.text = '';
    s.wasCd = !!a && this.sys.cooldown(a) > 0;
  }

  /**
   * Mouse press on a filled slot, WoW-style: released within DRAG px it is a click and casts (`click`);
   * once the pointer travels further it picks the ability up instead, and never casts. The icon follows
   * the cursor; dropping it on another slot swaps the two, anywhere else puts it back. The new bar is
   * remembered for the next visit.
   */
  private grab(from: number, down: PointerEvent, click: () => void): void {
    let over: HTMLElement | undefined;
    const target = (e: PointerEvent) => document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.slot') ?? undefined;
    const move = (e: PointerEvent) => {
      e.stopPropagation(); // captured ahead of core/input.ts: a held button over the bar must not orbit the camera
      if (!this.ghost) {
        if (Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < DRAG) return;
        this.ghost = el('div', 'drag-ghost');
        this.ghost.innerHTML = this.slots[from].el.querySelector('.icon')!.outerHTML;
        document.body.append(this.ghost);
        this.slots[from].el.classList.add('lifted');
        this.tip.classList.remove('show');
      }
      this.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      const t = target(e);
      if (t !== over) { over?.classList.remove('drop'); over = t; over?.classList.add('drop'); }
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== down.pointerId) return;
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', end);
      removeEventListener('pointercancel', end);
      if (!this.ghost) { if (e.type === 'pointerup') click(); return; }
      this.ghost.remove();
      this.ghost = undefined;
      over?.classList.remove('drop');
      this.slots[from].el.classList.remove('lifted');
      const to = this.slots.findIndex((s) => s.el === over);
      if (e.type !== 'pointerup' || to < 0 || to === from) return;
      this.sys.swap(from, to);
      this.paint(from);
      this.paint(to);
      saveBar(this.sys.layout());
    };
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
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
    this.tip.innerHTML = `<b></b>${a.mana ? `<div class="row"><span>${a.mana} mana</span></div>` : ''}<div class="row"><span>${cast}</span>${a.cooldown ? `<span>Recupero ${cd}</span>` : ''}</div><p></p>`;
    this.tip.querySelector('b')!.textContent = a.name;
    this.tip.querySelector('p')!.textContent = a.desc;
    const r = anchor.getBoundingClientRect(), t = this.tip;
    t.classList.add('show');
    // above the button, kept on screen; if there's no room above (high ring buttons on a short phone), beside it on the left
    const w = t.offsetWidth, h = t.offsetHeight;
    const above = r.top - h - 8 >= 8;
    t.style.left = `${Math.max(8, Math.min(above ? r.left : r.left - w - 8, innerWidth - w - 8))}px`;
    t.style.top = `${above ? r.top - h - 8 : Math.max(8, Math.min(r.top, innerHeight - h - 8))}px`;
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
