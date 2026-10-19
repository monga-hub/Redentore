// The hero's fall, Diablo style: the world drains to grey under a dark vignette and "You are dead" fades in,
// gilded like the victory banner. main.ts shows it on the death and hides it on the wake-up, where the grey
// fades back out. Plain DOM over the canvas: a CSS filter on the canvas, no extra render pass.

const CSS = `
#death { position: fixed; inset: 0; z-index: 6; pointer-events: none; opacity: 0; transition: opacity 1.2s ease;
  background: radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(0,0,0,.85) 100%); }
#death.show { opacity: 1; }
#death b { position: absolute; left: 0; right: 0; top: 38%; text-align: center; opacity: 0; transform: scale(1.15); transition: opacity 1s ease .5s, transform 2.4s ease-out .5s;
  font: 700 clamp(40px, 9vw, 72px)/1.1 Georgia, serif; letter-spacing: 4px; color: #c9302a; text-shadow: 0 0 22px #5a0a06, 0 3px 6px #000, 0 0 2px #ffd36a; }
#death.show b { opacity: 1; transform: scale(1); }
canvas.dead { filter: grayscale(1) brightness(.75); }
canvas.fade { transition: filter 1.2s ease; }
`;

export class DeathScreen {
  private el = document.createElement('div');
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const style = document.createElement('style');
    style.textContent = CSS;
    this.el.id = 'death';
    this.el.innerHTML = '<b>You are dead</b>';
    document.head.append(style);
    document.body.append(this.el);
    canvas.classList.add('fade');
  }

  show(): void { this.el.classList.add('show'); this.canvas.classList.add('dead'); }
  hide(): void { this.el.classList.remove('show'); this.canvas.classList.remove('dead'); }
}
