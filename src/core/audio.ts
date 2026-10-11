// Master volume and mute, persisted in localStorage. Every sound connects to `output()`, a
// single gain node the settings drive, so the menu's slider covers whatever plays later.

const KEY = 'redentore.audio';

let volume = 0.8; // 0..1
let muted = false;
try {
  const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  if (typeof s?.volume === 'number') volume = Math.min(Math.max(s.volume, 0), 1);
  if (typeof s?.muted === 'boolean') muted = s.muted;
} catch { /* blocked or garbled storage: defaults */ }

let ctx: AudioContext | undefined;
let master: GainNode | undefined;

/** The node sounds connect to; the AudioContext is made on first use (browsers want a gesture before it plays). */
export function output(): GainNode {
  if (!master) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);
    apply();
  }
  void ctx!.resume().catch(() => {});
  return master;
}

function apply(): void {
  if (master) master.gain.value = muted ? 0 : volume;
}

export function getAudio(): { volume: number; muted: boolean } {
  return { volume, muted };
}

export function setAudio(next: { volume?: number; muted?: boolean }): void {
  if (next.volume !== undefined) volume = Math.min(Math.max(next.volume, 0), 1);
  if (next.muted !== undefined) muted = next.muted;
  apply();
  try { localStorage.setItem(KEY, JSON.stringify({ volume, muted })); } catch { /* not persisted, still applied */ }
}
