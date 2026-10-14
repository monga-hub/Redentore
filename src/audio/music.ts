import { AMBIENCE, MUSIC } from './manifest.ts';
import { bus, ctx, onPause } from './engine.ts';

// Adaptive score and ambience beds. The intro cue streams through an <audio> element (no 78 s
// of decoded PCM in memory) and follows the flythrough's clock; everything else is decoded on
// first use. Exploration and its combat layer are two loops of the same length started
// together, so combat fades its drums and horns in over the same chords; the boss has his own
// loop; victory and death are stings that hand back to exploration. Ambience beds crossfade
// by area. Positions and per-area rules are director.ts's business.

export type MusicState = 'none' | 'intro' | 'explore' | 'combat' | 'boss' | 'victory' | 'death';
type Track = keyof typeof MUSIC;
type Bed = keyof typeof AMBIENCE;

const url = (file: string) => `${import.meta.env.BASE_URL}audio/${file}`;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

function buffer(file: string): Promise<AudioBuffer | null> {
  let p = buffers.get(file);
  if (!p) {
    p = fetch(url(file)).then((r) => r.arrayBuffer()).then((a) => ctx!.decodeAudioData(a)).catch((e) => { console.warn('audio failed to load', file, e); return null; });
    buffers.set(file, p);
  }
  return p;
}

/** One playing loop or sting: a source and its fader. */
interface Layer { src?: AudioBufferSourceNode; gain: GainNode; level: number }

function layer(dest: AudioNode): Layer {
  const gain = ctx!.createGain();
  gain.gain.value = 0;
  gain.connect(dest);
  return { gain, level: 0 };
}

function fadeTo(l: Layer, level: number, time: number): void {
  l.level = level;
  const t = ctx!.currentTime;
  l.gain.gain.cancelScheduledValues(t);
  l.gain.gain.setValueAtTime(l.gain.gain.value, t);
  l.gain.gain.linearRampToValueAtTime(level, t + Math.max(time, 0.01));
}

function startLoop(l: Layer, buf: AudioBuffer, loop: readonly number[], when: number): void {
  const s = ctx!.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.loopStart = loop[0];
  s.loopEnd = loop[0] + loop[1];
  s.connect(l.gain);
  s.start(when, loop[0]);
  l.src = s;
}

function stopLayer(l: Layer, fade: number): void {
  fadeTo(l, 0, fade);
  const s = l.src;
  l.src = undefined;
  if (s) try { s.stop(ctx!.currentTime + fade + 0.1); } catch { /* not started */ }
}

const LEVEL: Record<Track, number> = { intro: 1, explore: 0.55, combat: 0.8, boss: 0.75, victory: 0.9, death: 0.85 }; // within the music bus

let state: MusicState = 'none';
let L: Record<'explore' | 'combat' | 'boss' | 'sting', Layer> | undefined;
let introEl: HTMLAudioElement | undefined;
let introGain: GainNode | undefined;
let after: MusicState = 'explore'; // where a sting hands back to
let stingTimer = 0;

function layers() {
  if (!L) {
    const m = bus('music');
    L = { explore: layer(m), combat: layer(m), boss: layer(m), sting: layer(m) };
    onPause((hidden) => { if (introEl && state === 'intro') { if (hidden) introEl.pause(); else void introEl.play().catch(() => {}); } });
  }
  return L;
}

/** The exploration pair runs from here on, in sync, whatever is on top (silent when not wanted). */
async function ensureExplore(): Promise<void> {
  const l = layers();
  if (l.explore.src) return;
  const [a, b] = await Promise.all([buffer(MUSIC.explore.file), buffer(MUSIC.combat.file)]);
  if (!a || !b || l.explore.src) return;
  const when = ctx!.currentTime + 0.05;
  startLoop(l.explore, a, MUSIC.explore.loop, when);
  startLoop(l.combat, b, MUSIC.combat.loop, when);
  apply(0); // the state may have moved on while they loaded
}

function apply(fade = -1): void {
  const l = layers();
  const f = (x: number) => (fade >= 0 ? fade : x);
  const ex = state === 'explore' ? LEVEL.explore : state === 'combat' ? LEVEL.explore * 0.8 : 0;
  if (l.explore.level !== ex) fadeTo(l.explore, ex, f(ex > l.explore.level ? 4 : 2));
  const co = state === 'combat' ? LEVEL.combat : 0;
  if (l.combat.level !== co) fadeTo(l.combat, co, f(co > 0 ? 1.2 : 3));
  if (state !== 'boss' && l.boss.src) stopLayer(l.boss, f(3));
}

/** Change the score's state; repeated calls with the same state do nothing. */
export function setMusic(next: MusicState): void {
  if (!ctx || next === state) return;
  const prev = state;
  state = next;
  const l = layers();
  if (prev === 'intro' && introEl) { // fade the cue out under whatever comes next
    const el = introEl, g = introGain!;
    g.gain.setTargetAtTime(0, ctx.currentTime, next === 'none' ? 0.1 : 0.8);
    setTimeout(() => el.pause(), 4000);
    introEl = undefined;
  }
  if (next === 'intro') return void startIntro();
  if (next === 'victory' || next === 'death') {
    for (const k of ['explore', 'combat'] as const) fadeTo(l[k], 0, 1);
    if (l.boss.src) stopLayer(l.boss, 1.5);
    after = 'explore';
    void buffer(MUSIC[next].file).then((b) => {
      if (!b || state !== next) return;
      if (l.sting.src) stopLayer(l.sting, 0.2);
      const s = ctx!.createBufferSource();
      s.buffer = b;
      s.connect(l.sting.gain);
      fadeTo(l.sting, LEVEL[next], 0.05);
      s.start();
      l.sting.src = s;
      clearTimeout(stingTimer);
      stingTimer = window.setTimeout(() => { if (state === next) setMusic(after); }, (b.duration - 1.5) * 1000);
    });
    return;
  }
  if (l.sting.src && prev !== 'victory' && prev !== 'death') stopLayer(l.sting, 1);
  if (next === 'boss') {
    if (!l.boss.src) void buffer(MUSIC.boss.file).then((b) => {
      if (!b || state !== 'boss' || l.boss.src) return;
      startLoop(l.boss, b, MUSIC.boss.loop, ctx!.currentTime + 0.05);
      fadeTo(l.boss, LEVEL.boss, 1.5);
    });
  }
  if (next === 'explore' || next === 'combat') void ensureExplore();
  apply();
}

export const musicState = () => state;

function startIntro(): void {
  if (!introEl) {
    introEl = new Audio(url(MUSIC.intro.file));
    introEl.preload = 'auto';
    introEl.crossOrigin = 'anonymous';
    introGain = ctx!.createGain();
    ctx!.createMediaElementSource(introEl).connect(introGain).connect(bus('music'));
  }
  introGain!.gain.value = LEVEL.intro;
  introEl.currentTime = 0;
  void introEl.play().catch(() => {});
  void ensureExplore(); // decoded meanwhile, silent until the hand-over
}

/** Keep the streamed intro cue on the flythrough's clock (it slows with the frame rate, the audio doesn't). */
export function syncIntro(t: number): void {
  const el = introEl;
  if (!el || state !== 'intro' || el.paused || el.readyState < 2) return;
  const diff = t - el.currentTime;
  if (Math.abs(diff) > 0.6) el.currentTime = t;
  else el.playbackRate = Math.abs(diff) > 0.08 ? 1 + Math.max(-0.06, Math.min(0.06, diff * 0.3)) : 1;
}

// ---------------------------------------------------------------- ambience beds

interface BedPlay { l: Layer; filter: BiquadFilterNode; quiet: number }
const beds = new Map<Bed, BedPlay>();
const RELEASE = 20; // s silent before a bed is stopped and its PCM let go

/**
 * Crossfade to the bed of an area at `level`; `lowpass` (Hz) muffles it, as heard from indoors.
 * null fades every bed out. Cheap to call every frame.
 */
export function setAmbience(name: Bed | null, level = 1, lowpass = 20000): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  if (name && !beds.has(name)) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    filter.connect(bus('ambience'));
    const b: BedPlay = { l: layer(filter), filter, quiet: 0 };
    beds.set(name, b);
    void buffer(AMBIENCE[name].file).then((buf) => { if (buf && beds.get(name) === b) startLoop(b.l, buf, AMBIENCE[name].loop, ctx!.currentTime + 0.02); });
  }
  for (const [n, b] of beds) {
    const want = n === name ? level : 0;
    if (b.l.level !== want) { fadeTo(b.l, want, 3); b.quiet = t; }
    if (n === name) b.filter.frequency.setTargetAtTime(lowpass, t, 0.5);
    else if (t - b.quiet > RELEASE) {
      stopLayer(b.l, 0);
      b.filter.disconnect();
      beds.delete(n);
      buffers.delete(AMBIENCE[n].file);
    }
  }
}
