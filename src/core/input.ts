// Keyboard + mouse state. Mouse: left-drag orbits the camera, right-drag also
// turns the character (WoW style), both buttons = run forward, wheel = zoom.
// Touch pointers are ignored here: TouchControls (ui/touch.ts) feeds the stick,
// camera deltas, pinch zoom and virtual keys instead.
export class Input {
  private keys = new Set<string>();
  buttons = 0; // bitmask from PointerEvent.buttons
  dx = 0; // accumulated mouse/drag delta since last consume()
  dy = 0;
  wheel = 0;
  stickX = 0; // virtual joystick, -1..1 (right / down positive)
  stickY = 0;

  constructor(el: HTMLElement) {
    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.buttons = 0; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      this.buttons = e.buttons;
      el.setPointerCapture(e.pointerId);
      el.requestPointerLock?.()?.catch?.(() => {});
    });
    addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      this.buttons = e.buttons;
      if (!this.buttons && document.pointerLockElement) document.exitPointerLock();
    });
    addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.buttons = e.buttons;
      if (this.buttons) { this.dx += e.movementX; this.dy += e.movementY; }
    });
    el.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }

  /** Virtual key (touch buttons). */
  press(code: string, on: boolean): void {
    if (on) this.keys.add(code);
    else this.keys.delete(code);
  }

  down(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  consume(): { dx: number; dy: number; wheel: number } {
    const r = { dx: this.dx, dy: this.dy, wheel: this.wheel };
    this.dx = this.dy = this.wheel = 0;
    return r;
  }
}
