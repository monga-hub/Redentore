import * as THREE from 'three';
import { CHURCH_FLOOR as F } from '../level/plan.ts';

// The opening shot: one continuous take over the real level, no cuts. From the lagoon over the
// pontile, through the sale espositive, a sweep across the whole orto, down the convent corridor,
// the chiostro mediano (through the grate), the chiostro grande, up the back stairs into the choir,
// a turn around the Reverendissimo under the dome, then backwards down the nave and out of the
// portone, which shuts in front of the lens, landing on the follow camera behind the player.
// A Catmull-Rom spline through hand-placed keys (`npm run check` flies it against every mesh of
// the level), travelled at the keys' speeds. Esc, Space, Enter, a click or a tap skips it.
// Over it, the backstory in cinematic captions, each timed to the place the lens is passing.
// When the browser holds the sound back until a gesture (iOS, a first visit), the take waits on
// its first frame for a click or a tap, so the score starts with the picture.

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

/**
 * The backstory, one caption per beat of the take: `at`..`to` s, shown while the lens is over one
 * of `where` (area labels; `npm run check` holds them to it). `vo` names the line's voice-over clip
 * for when there is one (Intro.onLine). The title card comes first, the call to arms last.
 */
export interface Caption { at: number; to: number; where: string[]; text: string; sub?: string; kind?: 'title' | 'final'; vo: string }

export const CAPTIONS: Caption[] = [
  { at: 0.6, to: 5, where: [], kind: 'title', text: 'Il Voto Spezzato', sub: 'Giudecca, Venezia', vo: 'intro-00' },
  { at: 5.4, to: 10.6, where: ['Pontile', 'Riva sulla laguna', 'Giardino dei pitosfori'], text: "Anno del Signore 1576. La peste divora Venezia: un'anima su tre finisce nelle fosse.", vo: 'intro-01' },
  { at: 11, to: 16.2, where: ['Sale espositive (antiche officine)'], text: 'Il Doge fa voto al Redentore: una chiesa, se il morbo cesserà. Palladio la innalza sulla Giudecca.', vo: 'intro-02' },
  { at: 16.6, to: 21.8, where: ['Orti coltivati', 'Frutteto', 'Uliveto'], text: "I frati cappuccini ne custodiscono l'orto. Di notte vi seppelliscono i morti che nessuno reclama.", vo: 'intro-03' },
  { at: 22.2, to: 27, where: ['Orti coltivati'], text: 'Venezia rende grazie. Ma il Reverendissimo non crede nella grazia: crede nel prezzo.', vo: 'intro-04' },
  { at: 27.4, to: 31.6, where: ['Corridoio del convento'], text: 'Sotto la prima pietra mura un secondo voto, scritto col sangue degli appestati.', vo: 'intro-05' },
  { at: 31.9, to: 35.4, where: ['Chiostro mediano'], text: '«Nessun morto lascerà la Giudecca. Serviranno questa casa in eterno.»', vo: 'intro-06' },
  { at: 35.8, to: 39.6, where: ['Chiostro grande'], text: 'Una notte di luglio, sul ponte di barche in festa, il voto si compie.', vo: 'intro-07' },
  { at: 39.9, to: 44.6, where: ['Chiostro grande', 'Coro dei frati'], text: 'I frati si levano dalle zolle. I preti smettono di respirare, non di pregare.', vo: 'intro-08' },
  { at: 45, to: 49.5, where: ['Presbiterio', 'Crociera e cupola'], text: 'E lui, sotto la cupola, attende.', vo: 'intro-09' },
  { at: 50, to: 56.8, where: ['Crociera e cupola'], text: 'Finché il voto regge, il Reverendissimo non può morire. Né vivere.', vo: 'intro-10' },
  { at: 57.4, to: 62.8, where: ['Chiesa del Redentore: navata'], text: 'Le porte si sbarrano dall\'interno. Da allora la Giudecca non restituisce i suoi morti.', vo: 'intro-11' },
  { at: 63.2, to: 67.8, where: ['Sagrato e scalinata', 'Fondamenta San Giacomo'], text: "Ma la terra dell'orto ha restituito anche te, Risorto. E tu ricordi il tuo nome.", vo: 'intro-12' },
  { at: 68.2, to: 73, where: ['Fondamenta San Giacomo'], kind: 'final', text: 'Spezza il voto.', vo: 'intro-13' },
];
const CAPTION_FADE = 0.6; // s in and out

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
#cinema .cap { position: absolute; z-index: 1; left: 50%; bottom: calc(9vh + 3.5vh); transform: translateX(-50%); box-sizing: border-box;
  width: min(880px, 100% - 32px); text-align: center; opacity: 0; font: italic clamp(15px, min(2.5vw, 4.6vh), 25px)/1.4 Georgia, 'Times New Roman', serif;
  color: #efe2c2; letter-spacing: .02em; text-shadow: 0 0 2px #000, 0 2px 6px #000, 0 0 22px rgba(0,0,0,.9); }
#cinema .cap.title { bottom: auto; top: 36%; font: 700 clamp(30px, min(6vw, 11vh), 64px)/1.1 Georgia, serif; text-transform: uppercase; letter-spacing: .16em;
  color: #f6d98a; text-shadow: 0 0 3px #000, 0 0 24px rgba(200,120,30,.7), 0 0 60px rgba(120,40,0,.6); }
#cinema .cap.title small { display: block; margin-top: .7em; font: italic 400 clamp(13px, min(2vw, 3.6vh), 20px)/1 Georgia, serif; text-transform: none; letter-spacing: .3em; color: #d9c79a; }
#cinema .cap.final { bottom: auto; top: 42%; font: 700 clamp(24px, min(4.6vw, 8vh), 48px)/1.1 Georgia, serif; font-style: normal; text-transform: uppercase; letter-spacing: .22em;
  color: #ffd27a; text-shadow: 0 0 3px #000, 0 0 30px rgba(255,120,30,.75), 0 0 70px rgba(160,20,0,.7); }
body.diablo #cinema .cap.final, body.diablo #cinema .cap.title { color: #ff9a6a; }
#cinema span { position: absolute; z-index: 1; right: calc(16px + env(safe-area-inset-right)); bottom: calc(9vh - 32px); font: 600 14px/24px Georgia, serif;
  color: #f3e6c4; opacity: .7; text-shadow: 0 1px 2px #000; }
#cinema kbd { margin-right: 6px; padding: 1px 5px; font: 700 12px/1.2 sans-serif; color: #1a1208; background: #e0b55a; border-radius: 3px; }
body.touch #cinema kbd { display: none; }
#cinema b { position: absolute; z-index: 1; left: 0; right: 0; top: 50%; text-align: center; font: 600 20px/1.4 Georgia, serif;
  color: #f3e6c4; letter-spacing: 1px; text-shadow: 0 0 12px #000, 0 1px 2px #000; opacity: 0; transition: opacity .6s; }
#cinema.wait b { opacity: .9; animation: cinema-wait 2.4s ease-in-out infinite; }
@keyframes cinema-wait { 50% { opacity: .45; } }
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
  private cap = document.createElement('div');
  private line = -1; // the caption up, by index in CAPTIONS
  /** A caption comes up: the hook for its voice-over (`c.vo`). */
  onLine?: (c: Caption) => void;
  private rolling = false; // past the wait for a gesture
  private go = false;
  private wait = 0;
  private ready: () => boolean;

  /** `ready`: the sound can start without a gesture (audio/engine.ts audioReady). */
  constructor(camera: THREE.Camera, endAt: THREE.Vector3, endLook: THREE.Vector3, ready: () => boolean = () => true) {
    this.camera = camera;
    this.ready = ready;
    this.path = introPath(endAt, endLook);
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.el.id = 'cinema';
    this.el.innerHTML = '<i></i><b>Tocca o premi un tasto per iniziare</b><span><kbd>Esc</kbd>Salta</span>';
    this.cap.className = 'cap';
    this.cap.setAttribute('aria-live', 'polite');
    this.el.append(this.cap);
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
    this.go = true;
    if (SKIP.has(e.code)) { e.preventDefault(); this.skipped = true; }
  };

  private press = (e: PointerEvent) => {
    e.stopPropagation();
    if (this.rolling) this.skipped = true;
    this.go = true; // while waiting, the first press only starts it
  };

  /** Moves the lens; false once the take is over (or skipped) and the game has it back. */
  update(dt: number): boolean {
    if (this.done) return false;
    if (!this.rolling) {
      this.wait += dt;
      if (this.go || this.ready()) {
        this.rolling = true;
        this.el.classList.remove('wait');
      } else {
        if (this.wait > 0.4) this.el.classList.add('wait');
        this.path.sample(0, this.camera.position, this.look);
        this.camera.lookAt(this.look);
        return true;
      }
    }
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
    this.caption();
    return true;
  }

  /** The caption for this moment of the take, faded in and out at its ends. */
  private caption(): void {
    const i = CAPTIONS.findIndex((c) => this.time >= c.at && this.time < c.to), c = CAPTIONS[i];
    if (i !== this.line) {
      this.line = i;
      this.cap.className = `cap ${c?.kind ?? ''}`;
      this.cap.textContent = c?.text ?? '';
      if (c?.sub) this.cap.append(Object.assign(document.createElement('small'), { textContent: c.sub }));
      if (c) this.onLine?.(c); // audio: playVoice(c.vo) once the lines are recorded
    }
    this.cap.style.opacity = c ? String(Math.min(1, (this.time - c.at) / CAPTION_FADE, (c.to - this.time) / CAPTION_FADE)) : '0';
  }
}
