import * as THREE from 'three';
import { CHURCH_FLOOR as F } from '../level/plan.ts';

// The opening shot: one continuous take over the real level, no cuts. From the lagoon over the
// pontile, through the sale espositive, a sweep across the whole orto, down the convent corridor,
// the chiostro mediano (through the grate), the chiostro grande, up the back stairs into the choir,
// a turn around the Reverendissimo under the dome, then backwards down the nave and out of the
// portone, which shuts in front of the lens, landing on the follow camera behind the player.
// A Catmull-Rom spline through hand-placed keys (`npm run check` flies it against every mesh of
// the level), travelled at the keys' speeds. Esc, Space, Enter, a click or a tap skips it.

type V = [number, number, number];
/** Where the lens is, what it looks at, how fast it travels through there (m/s). */
interface Key { at: V; look: V; v: number }

const BOSS: V = [0, F + 2.8, -37]; // the Reverendissimo's chest, under the dome (enemies/caster.ts BOSS_AT)
const ORBIT = 6.5; // m around the boss: inside the crossing piers, clear of his bulk

/** The take, up to the steps of the scalinata; the landing on the follow camera is added by introPath(). */
export const KEYS: Key[] = [
  { at: [-30, 14, -240], look: [-34, 2, -190], v: 13 }, // high over the lagoon, the complex ahead
  { at: [-33, 7, -218], look: [-34.5, 1, -186], v: 12 },
  { at: [-34.5, 2.6, -199], look: [-33, 1.8, -180], v: 7 }, // low over the pontile and its chest
  { at: [-33, 2.4, -186], look: [-32.5, 3, -168], v: 6 }, // the riva
  { at: [-32.2, 4, -174], look: [-34.5, 1.9, -160], v: 5 }, // over the garden walk and its priests
  { at: [-34.5, 1.9, -161], look: [-34.5, 1.9, -151], v: 4 }, // door of the sale espositive
  { at: [-34.5, 2.2, -156], look: [-34.5, 2, -145], v: 3.5 },
  { at: [-34.5, 1.9, -151], look: [-30, 4, -140], v: 4 }, // out into the orto
  { at: [-31, 5, -144], look: [-20, 6, -125], v: 7 },
  { at: [-20, 11, -132], look: [0, 4, -118], v: 14 }, // rising over the vegetable beds
  { at: [0, 15, -124], look: [12, 4, -105], v: 16 }, // the frutteto, the uliveto beyond
  { at: [12, 15, -106], look: [-5, 4, -96], v: 16 },
  { at: [2, 13, -95], look: [-25, 3, -92], v: 14 }, // back west along the convent wall
  { at: [-22, 8, -93], look: [-34, 2, -86], v: 9 },
  { at: [-34, 2.3, -91], look: [-34, 2, -80], v: 4.5 },
  { at: [-34, 1.9, -86], look: [-34, 2, -72], v: 4 }, // into the convent corridor
  { at: [-34, 2.1, -76], look: [-30, 2, -68], v: 5 },
  { at: [-33.2, 2, -69.5], look: [-26, 2, -67], v: 3.5 },
  { at: [-31, 1.9, -68], look: [-22, 2.5, -71], v: 3.5 }, // the chiostro mediano
  { at: [-28.6, 2, -69.6], look: [-17, 2.5, -71], v: 3.5 }, // between two piers of its arcade
  { at: [-24, 4, -71], look: [-17, 2, -70], v: 4.5 }, // over the court and its priests
  { at: [-19.4, 2, -69.5], look: [-12, 2.5, -70.5], v: 3.5 },
  { at: [-17, 1.9, -70], look: [-8, 3, -73], v: 3.5 }, // through the grate into the chiostro grande
  { at: [-14.2, 2.1, -68], look: [-4, 4, -72], v: 4 }, // between two piers of its arcade
  { at: [-11, 5, -71], look: [0, 4.5, -64], v: 5 }, // over the court and its priests
  { at: [-4, 5.5, -72], look: [0, 4.2, -60], v: 5 },
  { at: [0, 4.4, -66.5], look: [0, 4.2, -55], v: 4 },
  { at: [0, 3.9, -64], look: [0, 4.4, -55], v: 3.5 }, // up the church's back stairs, under the arcade
  { at: [0, 4.1, -60], look: [3.75, 6.5, -53.5], v: 3 }, // the choir door
  { at: [2.4, 5.5, -56.5], look: [4, 6.5, -48], v: 3 },
  { at: [3.75, 7, -53.5], look: [3, 6.5, -44], v: 3.5 }, // between the choir columns, over the sacerdoti
  { at: [4.4, 6.6, -48], look: BOSS, v: 4 }, // past the baldacchino
  ...Array.from({ length: 17 }, (_, i): Key => { // a full turn around the boss from the east, on round to the nave side
    const a = ((2 + i) * Math.PI) / 6; // counter-clockwise seen from above, 60 deg .. 540 deg
    return { at: [ORBIT * Math.sin(a), F + 4.6, BOSS[2] - ORBIT * Math.cos(a)], look: BOSS, v: 6 };
  }),
  { at: [0, F + 3.7, -27], look: BOSS, v: 5 }, // backing down the nave, under the chandeliers
  { at: [0, F + 3.6, -15], look: [0, F + 3, -37], v: 5.5 },
  { at: [0, F + 3.6, -5], look: [0, F + 3, -30], v: 4.5 },
  { at: [0, F + 2.6, 0], look: [0, F + 3, -20], v: 3.5 }, // the portone
  { at: [0, F + 2.4, 4], look: [0, F + 3.5, -8], v: 3 },
  { at: [0, 4.6, 10], look: [0, F + 3.5, -2], v: 3 }, // it shuts; down the scalinata
];

export interface IntroPath {
  duration: number; // s
  /** The lens and its aim `t` seconds into the take. */
  sample(t: number, at: THREE.Vector3, look: THREE.Vector3): void;
}

/** The take, ending on the follow camera's pose (`endAt` looking at `endLook`) at rest. */
export function introPath(endAt: THREE.Vector3, endLook: THREE.Vector3): IntroPath {
  const keys = [...KEYS, { at: endAt.toArray(), look: endLook.toArray(), v: 0.8 }];
  const lens = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.at)), false, 'centripetal');
  const aim = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.look)));
  lens.arcLengthDivisions = 4000;
  // Time per arc-length step, at the speed eased between the keys either side (both curves pass key i at t = i/(n-1)).
  const N = 4000, ds = lens.getLength() / N, last = keys.length - 1;
  const ts = [0], times = [0];
  const speed = (t: number) => {
    const i = Math.min(Math.floor(t * last), last - 1), f = t * last - i;
    return THREE.MathUtils.lerp(keys[i].v, keys[i + 1].v, f * f * (3 - 2 * f));
  };
  for (let i = 1; i <= N; i++) {
    const t = lens.getUtoTmapping(i / N, 0);
    times.push(times[i - 1] + (2 * ds) / (speed(ts[i - 1]) + speed(t)));
    ts.push(t);
  }
  return {
    duration: times[N],
    sample(time, at, look) {
      let lo = 0, hi = N; // the last step at or before `time`
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= time) lo = mid;
        else hi = mid;
      }
      const f = THREE.MathUtils.clamp((time - times[lo]) / (times[hi] - times[lo]), 0, 1);
      const t = THREE.MathUtils.lerp(ts[lo], ts[hi], f);
      lens.getPoint(t, at);
      aim.getPoint(t, look);
    },
  };
}

const CSS = `
body.cinema > :not(canvas, #cinema) { visibility: hidden !important; }
#cinema { position: fixed; inset: 0; z-index: 30; pointer-events: none; transition: opacity .8s; }
#cinema.out { opacity: 0; }
#cinema::before, #cinema::after { content: ''; position: absolute; left: 0; right: 0; height: 9vh; background: #000; }
#cinema::before { top: 0; }
#cinema::after { bottom: 0; }
#cinema i { position: absolute; inset: 0; background: #000; animation: cinema-in 2.5s ease-in forwards; }
@keyframes cinema-in { to { opacity: 0; } }
#cinema span { position: absolute; z-index: 1; right: calc(16px + env(safe-area-inset-right)); bottom: calc(9vh - 32px); font: 600 14px/24px Georgia, serif;
  color: #f3e6c4; opacity: .7; text-shadow: 0 1px 2px #000; }
#cinema kbd { margin-right: 6px; padding: 1px 5px; font: 700 12px/1.2 sans-serif; color: #1a1208; background: #e0b55a; border-radius: 3px; }
body.touch #cinema kbd { display: none; }
`;

const SKIP = new Set(['Escape', 'Space', 'Enter']);

/** Plays the take on `camera` until it ends or is skipped; the HUD stays hidden meanwhile. */
export class Intro {
  done = false;
  time = 0;
  private path: IntroPath;
  private camera: THREE.Camera;
  private el = document.createElement('div');
  private look = new THREE.Vector3();
  private skipped = false;

  constructor(camera: THREE.Camera, endAt: THREE.Vector3, endLook: THREE.Vector3) {
    this.camera = camera;
    this.path = introPath(endAt, endLook);
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.el.id = 'cinema';
    this.el.innerHTML = '<i></i><span><kbd>Esc</kbd>Salta</span>';
    document.body.append(this.el);
    document.body.classList.add('cinema');
    // Capture: while the take runs, no key or press reaches the game (no menu, no pointer lock, no jump).
    addEventListener('keydown', this.key, true);
    addEventListener('pointerdown', this.press, true);
  }

  get duration(): number {
    return this.path.duration;
  }

  private key = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (SKIP.has(e.code)) { e.preventDefault(); this.skipped = true; }
  };

  private press = (e: PointerEvent) => {
    e.stopPropagation();
    this.skipped = true;
  };

  /** Moves the lens; false once the take is over (or skipped) and the game has it back. */
  update(dt: number): boolean {
    if (this.done) return false;
    this.time += dt;
    if (this.skipped || this.time >= this.path.duration) {
      this.done = true;
      removeEventListener('keydown', this.key, true);
      removeEventListener('pointerdown', this.press, true);
      document.body.classList.remove('cinema');
      this.el.classList.add('out');
      setTimeout(() => this.el.remove(), 900);
      return false;
    }
    this.path.sample(this.time, this.camera.position, this.look);
    this.camera.lookAt(this.look);
    return true;
  }
}
