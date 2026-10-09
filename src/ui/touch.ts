import type { Input } from '../core/input.ts';

const STICK_R = 56; // px, knob travel from the stick centre
const DEAD = 0.12; // stick dead zone, fraction of STICK_R
const LOOK = 1.4; // finger px -> mouse px, so a thumb swipe turns as far as a mouse drag
const STICK_ZONE = 0.4; // touches starting in the left 40% of the screen drive the stick

/**
 * Phone controls, shown only on touch devices (body.touch, styled in index.html):
 * floating joystick on the left (camera-relative, analog), drag anywhere else to orbit
 * the camera, two-finger pinch to zoom, jump button bottom-right. Feeds the same
 * Input the keyboard/mouse use, so desktop behaviour is untouched.
 */
export class TouchControls {
  private stickId = -1;
  private ox = 0; // stick centre
  private oy = 0;
  private look = new Map<number, { x: number; y: number }>();
  private pinch = 0; // last two-finger distance, 0 = not pinching

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
        this.ox = e.clientX;
        this.oy = e.clientY;
        this.base.style.left = `${e.clientX}px`;
        this.base.style.top = `${e.clientY}px`;
        this.base.classList.add('active');
        this.moveStick(e.clientX, e.clientY);
      } else {
        this.look.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.pinch = this.look.size === 2 ? this.spread() : 0;
      }
    });

    el.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) return this.moveStick(e.clientX, e.clientY);
      const p = this.look.get(e.pointerId);
      if (!p) return;
      if (this.look.size === 1) {
        input.dx += (e.clientX - p.x) * LOOK;
        input.dy += (e.clientY - p.y) * LOOK;
      }
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.look.size === 2) {
        const d = this.spread();
        if (this.pinch > 0 && d > 0) input.wheel += (this.pinch / d - 1) / 0.12; // camera: dist *= 1 + wheel*0.12
        this.pinch = d;
      }
    });

    const end = (e: PointerEvent) => {
      if (e.pointerId === this.stickId) this.releaseStick();
      else if (this.look.delete(e.pointerId)) this.pinch = 0;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    addEventListener('blur', () => { this.releaseStick(); this.look.clear(); });

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
    let dx = x - this.ox, dy = y - this.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // rescale past the dead zone so the first bit of real tilt isn't lost
    const m = Math.min(d, STICK_R) / STICK_R;
    const k = m > DEAD ? (m - DEAD) / (1 - DEAD) / (m * STICK_R) : 0;
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
