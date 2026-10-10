import type { Input } from '../core/input.ts';

const STICK_TRAVEL = 0.47; // knob travel from the stick centre, fraction of the stick's size (scaled by --k in index.html)
const DEAD = 0.12; // stick dead zone, fraction of the knob travel
const LOOK = 1.4; // finger px -> mouse px, so a thumb swipe turns as far as a mouse drag
const STICK_ZONE = 0.4; // touches starting in the left 40% of the screen drive the stick
// A second finger this soon after a still stick touch means the two landed together: a pinch, not a walk.
const PINCH_MS = 250, PINCH_SLOP = 16; // ms, px

/**
 * Phone controls, shown only on touch devices (body.touch, styled in index.html):
 * floating joystick on the left (camera-relative, analog), drag anywhere else to orbit
 * the camera, two-finger pinch to zoom, jump button bottom-right. A pinch never orbits or
 * walks: once two look fingers are down, the camera ignores drags until every one lifts,
 * and a pinch whose first finger lands in the stick zone takes that finger off the stick. Feeds the same
 * Input the keyboard/mouse use, so desktop behaviour is untouched.
 */
export class TouchControls {
  private stickId = -1;
  private ox = 0; // stick centre
  private oy = 0;
  private r = 1; // px knob travel, measured at touch-down
  private stickT = 0; // stick touch-down time
  private sx = 0; // stick finger's last position
  private sy = 0;
  private look = new Map<number, { x: number; y: number }>();
  private pinch = 0; // last two-finger distance, 0 = not pinching
  private pinched = false; // two look fingers were down since the last time none were

  private input: Input;
  private base = document.getElementById('stick')!;
  private knob = document.getElementById('knob')!;

  constructor(el: HTMLElement, input: Input) {
    this.input = input;
    const enable = () => document.body.classList.add('touch');
    if (matchMedia('(pointer: coarse)').matches) enable();

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      enable(); // hybrid laptops: switch the UI on at the first touch
      el.setPointerCapture(e.pointerId);
      if (this.stickId < 0 && e.clientX < innerWidth * STICK_ZONE) {
        this.stickId = e.pointerId;
        this.stickT = performance.now();
        this.ox = e.clientX;
        this.oy = e.clientY;
        this.r = this.base.offsetWidth * STICK_TRAVEL;
        this.base.style.left = `${e.clientX}px`;
        this.base.style.top = `${e.clientY}px`;
        this.base.classList.add('active');
        this.moveStick(e.clientX, e.clientY);
      } else {
        if (this.stickId >= 0 && !this.look.size && performance.now() - this.stickT < PINCH_MS
          && Math.hypot(this.sx - this.ox, this.sy - this.oy) < PINCH_SLOP) {
          this.look.set(this.stickId, { x: this.sx, y: this.sy });
          this.releaseStick();
        }
        this.look.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.pinched ||= this.look.size >= 2;
        this.pinch = this.look.size === 2 ? this.spread() : 0;
      }
    });

    el.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) return this.moveStick(e.clientX, e.clientY);
      const p = this.look.get(e.pointerId);
      if (!p) return;
      if (this.look.size === 1 && !this.pinched) {
        input.dx += (e.clientX - p.x) * LOOK;
        input.dy += (e.clientY - p.y) * LOOK;
      }
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.look.size === 2) {
        const d = this.spread();
        if (this.pinch > 0 && d > 0) input.zoom *= this.pinch / d; // fingers apart = closer, proportional to the spread
        this.pinch = d;
      }
    });

    const end = (e: PointerEvent) => {
      if (e.pointerId === this.stickId) this.releaseStick();
      else if (this.look.delete(e.pointerId)) {
        this.pinch = this.look.size === 2 ? this.spread() : 0; // 3 -> 2 fingers: carry on from the new pair
        if (!this.look.size) this.pinched = false;
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    addEventListener('blur', () => { this.releaseStick(); this.look.clear(); this.pinch = 0; this.pinched = false; });

    const jump = document.getElementById('jump')!;
    const press = (on: boolean) => (e: PointerEvent) => {
      if (on) jump.setPointerCapture(e.pointerId);
      e.preventDefault();
      jump.classList.toggle('down', on);
      input.press('Space', on);
    };
    jump.addEventListener('pointerdown', press(true));
    jump.addEventListener('pointerup', press(false));
    jump.addEventListener('pointercancel', press(false));

    const full = document.getElementById('fullscreen')!;
    if (!document.fullscreenEnabled) full.remove(); // iPhone Safari: no Fullscreen API
    full.addEventListener('click', () => {
      if (document.fullscreenElement) return void document.exitFullscreen();
      document.documentElement.requestFullscreen({ navigationUI: 'hide' })
        .then(() => (screen.orientation as { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
        .catch(() => {});
    });
  }

  private spread(): number {
    const [a, b] = [...this.look.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private moveStick(x: number, y: number): void {
    this.sx = x;
    this.sy = y;
    let dx = x - this.ox, dy = y - this.oy;
    const d = Math.hypot(dx, dy);
    const r = this.r;
    if (d > r) { dx *= r / d; dy *= r / d; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // rescale past the dead zone so the first bit of real tilt isn't lost
    const m = Math.min(d, r) / r;
    const k = m > DEAD ? (m - DEAD) / (1 - DEAD) / (m * r) : 0;
    this.input.stickX = dx * k;
    this.input.stickY = dy * k;
  }

  private releaseStick(): void {
    this.stickId = -1;
    this.input.stickX = this.input.stickY = 0;
    this.knob.style.transform = '';
    this.base.style.left = this.base.style.top = '';
    this.base.classList.remove('active');
  }
}
