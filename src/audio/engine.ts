import { BANKS, MARK, SOUNDS } from './manifest.ts';
import { MIX, type Bus } from './mix.ts';

// The game's audio engine on Web Audio, WoW/Diablo style. One AudioContext, made at boot and
// resumed on the first user gesture (Safari and Chrome only let sound start from one), a
// master limiter and four buses — music, sfx, ambience, voice — whose volumes the menu sets
// and localStorage keeps. Effects live in a few MP3 "sprites" (manifest.ts, built by
// scripts/audio/build.py), decoded per bank on first use. They play placed in 3D around the
// listener (the hero; the lens during the intro) with distance falloff, a voice cap per sound
// and overall, and a random pitch, level and variant every time so a repeat never sounds
// machine-made. Music and ambience beds are in music.ts, the game's wiring in director.ts.
// Nothing touches the browser at import time: Node (`npm run check`) loads the callers.

export type { Bus };
export type Sound = keyof typeof SOUNDS;
export interface V3 { x: number; y: number; z: number }

export interface AudioSettings { volume: number; muted: boolean; music: number; sfx: number; ambience: number; voice: number }
const KEY = 'redentore.audio';
const settings: AudioSettings = { volume: 0.8, muted: false, music: 0.7, sfx: 0.9, ambience: 0.8, voice: 1 };
const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
try {
  const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  for (const k of ['volume', 'music', 'sfx', 'ambience', 'voice'] as const) if (typeof s?.[k] === 'number') settings[k] = clamp01(s[k]);
  if (typeof s?.muted === 'boolean') settings.muted = s.muted;
} catch { /* blocked or garbled storage: defaults */ }

export function getAudio(): AudioSettings {
  return { ...settings };
}

export function setAudio(next: Partial<AudioSettings>): void {
  for (const k of ['volume', 'music', 'sfx', 'ambience', 'voice'] as const) if (next[k] !== undefined) settings[k] = clamp01(next[k]!);
  if (next.muted !== undefined) settings.muted = next.muted;
  apply();
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* not persisted, still applied */ }
}

// ---------------------------------------------------------------- graph

export let ctx: AudioContext | undefined;
let master: GainNode;
const buses = {} as Record<Bus, GainNode>;
/** Game sfx and ambience pass through these low-passes: shut while the menu is up ("muffled"). */
const muffles: BiquadFilterNode[] = [];
let ducker: GainNode; // under the music bus: big hits and speech push the music down
let limit: DynamicsCompressorNode;
let unlocked = false;

function apply(): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(settings.muted ? 0 : settings.volume, t, 0.02);
  for (const b of ['music', 'sfx', 'ambience', 'voice'] as const) buses[b].gain.setTargetAtTime(settings[b], t, 0.02);
}

/** Make the context and the buses (suspended until a gesture). Safe to call again. */
export function initAudio(): void {
  if (ctx || typeof AudioContext === 'undefined') return;
  ctx = new AudioContext({ latencyHint: 'interactive' });
  limit = ctx.createDynamicsCompressor(); // a brick wall for the pile-ups of a big fight
  limit.threshold.value = -8; limit.knee.value = 6; limit.ratio.value = 12; limit.attack.value = 0.003; limit.release.value = 0.25;
  limit.connect(ctx.destination);
  master = ctx.createGain();
  master.connect(limit);
  for (const b of ['music', 'sfx', 'ambience', 'voice'] as const) {
    buses[b] = ctx.createGain();
    buses[b].connect(master);
  }
  ducker = ctx.createGain();
  ducker.connect(buses.music);
  for (const b of ['sfx', 'ambience'] as const) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 20000;
    f.connect(buses[b]);
    muffles.push(f);
  }
  apply();
  // iOS: play through the ring/silent switch like a video would, not like a notification.
  try { (navigator as Navigator & { audioSession?: { type: string } }).audioSession!.type = 'playback'; } catch { /* not Safari 16.4+ */ }
  const go = () => unlock();
  for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, go, { capture: true, passive: true });
  addEventListener('visibilitychange', () => { // a hidden tab is silent and spends nothing
    if (document.hidden) void ctx!.suspend().catch(() => {});
    else if (unlocked) void ctx!.resume().catch(() => {});
    for (const f of pauseHooks) f(document.hidden);
  });
  void ctx.resume().then(() => { if (ctx!.state === 'running') unlocked = true; }, () => {}); // allowed already (a returning player in Chrome)
}

/** On a user gesture: start the context; iOS also wants a buffer played from inside the gesture. */
export function unlock(): void {
  if (!ctx || (unlocked && ctx.state === 'running')) return;
  void ctx.resume().then(() => { unlocked = ctx!.state === 'running'; }, () => {});
  const s = ctx.createBufferSource();
  s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
  s.connect(ctx.destination);
  s.start();
  unlocked = true;
}

/** Sound can play now (or will on its own: muted, or no Web Audio, never needs a gesture). */
export function audioReady(): boolean {
  return !ctx || settings.muted || (unlocked && ctx.state === 'running');
}

const pauseHooks: ((hidden: boolean) => void)[] = [];
export function onPause(f: (hidden: boolean) => void): void {
  pauseHooks.push(f);
}

export function bus(b: Bus): AudioNode {
  return b === 'music' ? ducker : b === 'sfx' ? muffles[0] : b === 'ambience' ? muffles[1] : buses.voice;
}

/** UI sounds skip the menu's muffle. */
function out(b: Bus, ui: boolean): AudioNode {
  return ui ? buses.sfx : bus(b);
}

/** The menu (or the map) is up: the world behind it goes muffled, the music stays. */
export function muffle(on: boolean): void {
  if (!ctx) return;
  for (const f of muffles) f.frequency.setTargetAtTime(on ? 700 : 20000, ctx.currentTime, on ? 0.08 : 0.2);
}

let duckEnd = 0, duckLevel = 1;
/** Push the music down by `db` for `hold` s, then let it back over `release` s (the deepest request wins). */
export function duck(db: number, hold: number, release = 0.8): void {
  if (!ctx) return;
  const now = ctx.currentTime, level = 10 ** (-Math.abs(db) / 20);
  if (now < duckEnd) { duckLevel = Math.min(duckLevel, level); duckEnd = Math.max(duckEnd, now + hold); } else { duckLevel = level; duckEnd = now + hold; }
  const g = ducker.gain;
  g.cancelScheduledValues(now);
  g.setTargetAtTime(duckLevel, now, 0.04);
  g.setTargetAtTime(1, duckEnd, release / 3);
}

/** Let the music back up now, whatever ducks are pending (a dialogue window closing). */
export function unduck(release = 0.8): void {
  if (!ctx) return;
  const now = ctx.currentTime;
  duckEnd = now;
  duckLevel = 1;
  ducker.gain.cancelScheduledValues(now);
  ducker.gain.setTargetAtTime(1, now, release / 3);
}

// ---------------------------------------------------------------- listener

const ear = { x: 0, y: 0, z: 0 };
/** Where the listener is and which way it faces (a horizontal forward is enough). */
export function setListener(p: V3, fx: number, fz: number): void {
  ear.x = p.x; ear.y = p.y; ear.z = p.z;
  if (!ctx) return;
  const l = ctx.listener, n = Math.hypot(fx, fz) || 1;
  if (l.positionX) {
    l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
    l.forwardX.value = fx / n; l.forwardY.value = 0; l.forwardZ.value = fz / n;
    l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
  } else {
    l.setPosition(p.x, p.y, p.z);
    l.setOrientation(fx / n, 0, fz / n, 0, 1, 0);
  }
}

export const listener = (): Readonly<V3> => ear;

// ---------------------------------------------------------------- banks

interface Bank { buf: AudioBuffer; shift: number }
const banks = new Map<string, Bank | null>(); // null: loading (or failed)

const url = (file: string) => `${import.meta.env.BASE_URL}audio/${file}`;

/** Fetch and decode a bank once; the click at MARK s gives the decoder's offset (MP3 priming). */
export function loadBank(name: keyof typeof BANKS): void {
  if (!ctx || banks.has(name)) return;
  banks.set(name, null);
  fetch(url(BANKS[name]))
    .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.arrayBuffer(); })
    .then((a) => ctx!.decodeAudioData(a))
    .then((buf) => {
      const d = buf.getChannelData(0), end = Math.min(d.length, Math.round((MARK + 0.15) * buf.sampleRate));
      let i = 0;
      while (i < end && Math.abs(d[i]) < 0.3) i++;
      const shift = i < end ? Math.min(Math.max(i / buf.sampleRate - MARK, -0.05), 0.1) : 0;
      banks.set(name, { buf, shift });
    })
    .catch((e) => console.warn('audio bank failed to load', name, e));
}

export const bankReady = (name: keyof typeof BANKS) => !!banks.get(name);

// ---------------------------------------------------------------- voices

export interface PlayOpts { gain?: number; rate?: number; delay?: number; ui?: boolean; variant?: number }

export interface Voice {
  name: Sound;
  src: AudioBufferSourceNode;
  gain: GainNode;
  panner?: PannerNode;
  at: number; // ctx time it started
  ends: number;
  loop: boolean;
}

const MAX_VOICES = 48;
const playing: Voice[] = [];
const lastStart = new Map<Sound, number>();
const lastVariant = new Map<Sound, number>();
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function prune(now: number): void {
  for (let i = playing.length - 1; i >= 0; i--) if (!playing[i].loop && playing[i].ends < now) playing.splice(i, 1);
}

function stopVoice(v: Voice, fade = 0.05): void {
  const i = playing.indexOf(v);
  if (i >= 0) playing.splice(i, 1);
  if (!ctx) return;
  const t = ctx.currentTime;
  v.gain.gain.cancelScheduledValues(t);
  v.gain.gain.setTargetAtTime(0, t, fade / 3);
  try { v.src.stop(t + fade + 0.05); } catch { /* already stopped */ }
}

/** Fade a voice out and stop it. */
export function stop(v: Voice | undefined, fade = 0.05): void {
  if (v) stopVoice(v, fade);
}

/** Distance gain beyond the panner's falloff: fades to nothing at `far` so a culled voice never pops. */
const edge = (d: number, far: number) => Math.min(1, Math.max(0, (far - d) / (far * 0.25)));

/**
 * Play `name` once: placed at `pos` in the world (or flat, for the UI and the hero's own voice).
 * Returns the voice, or nothing when it is out of earshot, capped, too soon after the last one,
 * or its bank is still loading (it starts loading then).
 */
export function playSfx(name: Sound, pos?: V3 | null, o: PlayOpts = {}): Voice | undefined {
  if (!ctx || !unlocked || settings.muted) return;
  const def = SOUNDS[name], mix = MIX(name);
  const bank = banks.get(def.bank);
  if (!bank) { loadBank(def.bank); return; }
  const now = ctx.currentTime;
  prune(now);
  if (now - (lastStart.get(name) ?? -1) < mix.gap) return;
  let dist = 0;
  if (pos) {
    dist = Math.hypot(pos.x - ear.x, pos.y - ear.y, pos.z - ear.z);
    if (dist >= mix.far) return;
  }
  const same = playing.filter((v) => v.name === name);
  if (same.length >= mix.max) stopVoice(same[0], 0.03); // steal the oldest of its kind
  else if (playing.length >= MAX_VOICES) { const old = playing.find((v) => !v.loop); if (old) stopVoice(old, 0.03); else return; }

  const n = def.v.length;
  let k = o.variant ?? Math.floor(Math.random() * n);
  if (o.variant === undefined && n > 1 && k === lastVariant.get(name)) k = (k + 1 + Math.floor(Math.random() * (n - 1))) % n; // never the same twice running
  lastVariant.set(name, k);
  const [start, dur] = def.v[k];
  const rate = (o.rate ?? 1) * 2 ** (rnd(-mix.pitch, mix.pitch) / 12);
  const g = 10 ** ((mix.gain + rnd(-mix.vol, mix.vol)) / 20) * (o.gain ?? 1) * (pos ? edge(dist, mix.far) : 1);

  const src = ctx.createBufferSource();
  src.buffer = bank.buf;
  src.playbackRate.value = rate;
  const gain = ctx.createGain();
  gain.gain.value = g;
  src.connect(gain);
  let panner: PannerNode | undefined;
  if (pos) {
    panner = ctx.createPanner();
    panner.panningModel = 'equalpower'; // HRTF is many times the CPU for little gain on speakers
    panner.distanceModel = 'inverse';
    panner.refDistance = mix.ref;
    panner.rolloffFactor = 1;
    panner.maxDistance = 10000;
    place(panner, pos);
    gain.connect(panner).connect(out(mix.bus, false));
  } else gain.connect(out(mix.bus, !!o.ui));
  const at = now + (o.delay ?? 0);
  const loop = 'loop' in def && def.loop;
  if (loop) {
    src.loop = true;
    src.loopStart = start + bank.shift;
    src.loopEnd = start + bank.shift + dur;
    src.start(at, start + bank.shift + Math.random() * dur);
  } else src.start(at, start + bank.shift, dur);
  const v: Voice = { name, src, gain, panner, at, ends: at + dur / rate, loop };
  playing.push(v);
  lastStart.set(name, now);
  if (mix.duck) duck(mix.duck, Math.min(dur / rate, 3) + (o.delay ?? 0), 0.8); // big hits and speech over the score
  return v;
}

function place(p: PannerNode, pos: V3): void {
  if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
}

/**
 * A looping sound tied to something in the world (a torch, a bee, the wisp): call `set` every
 * frame with where it is and how loud (0 = off). It starts when in earshot and audible, fades
 * out and frees its voice when not.
 */
export class Emitter {
  private v?: Voice;
  private name: Sound;
  constructor(name: Sound) {
    this.name = name;
  }

  set(pos: V3 | null, level: number): void {
    if (!ctx) return;
    const far = MIX(this.name).far;
    const d = pos ? Math.hypot(pos.x - ear.x, pos.y - ear.y, pos.z - ear.z) : 0;
    const on = level > 0.001 && d < far;
    if (!on) {
      if (this.v) { stopVoice(this.v, 0.4); this.v = undefined; }
      return;
    }
    if (!this.v || !playing.includes(this.v)) this.v = playSfx(this.name, pos, { gain: 0 });
    if (!this.v) return;
    if (pos && this.v.panner) place(this.v.panner, pos);
    const g = 10 ** (MIX(this.name).gain / 20) * level * (pos ? edge(d, far) : 1);
    this.v.gain.gain.setTargetAtTime(g, ctx.currentTime, 0.12);
  }

  off(): void {
    this.set(null, 0);
  }
}

/** Live voices (debugging, the CPU check). */
export const voices = () => playing.length;

/** The final mix as a MediaStream, to record clips of the game's sound (console: MediaRecorder). */
export function tap(): MediaStream | undefined {
  if (!ctx) return;
  const d = ctx.createMediaStreamDestination();
  limit.connect(d);
  return d.stream;
}
