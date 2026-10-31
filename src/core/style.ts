// "Stile Diablo": the menu's switch between the WoW follow camera (default) and a Diablo Immortal
// look (high fixed isometric camera, click-to-move, gothic grading, restyled HUD). Persisted in
// localStorage like the audio settings; whatever depends on it subscribes with `onStyle` and is
// called at once with the current value, then on every change, so the switch works mid-game.

const KEY = 'redentore.style';

let diablo = false;
try { diablo = localStorage.getItem(KEY) === 'diablo'; } catch { /* blocked storage: default WoW */ }

const subs: ((diablo: boolean) => void)[] = [];

export function isDiablo(): boolean {
  return diablo;
}

export function setDiablo(on: boolean): void {
  if (on === diablo) return;
  diablo = on;
  try { localStorage.setItem(KEY, on ? 'diablo' : 'wow'); } catch { /* not persisted, still applied */ }
  for (const f of subs) f(on);
}

export function onStyle(f: (diablo: boolean) => void): void {
  subs.push(f);
  f(diablo);
}

// The menu's "Grafica": Auto walks fx/atmosphere.ts's quality ladder on the frame rate, Alta and Bassa
// pin its top and bottom rung. Persisted and subscribed like the style.
export type Quality = 'auto' | 'alta' | 'bassa';
export const QUALITIES: readonly Quality[] = ['auto', 'alta', 'bassa'];
const QKEY = 'redentore.quality';

let quality: Quality = 'auto';
try { quality = QUALITIES.find((q) => q === localStorage.getItem(QKEY)) ?? 'auto'; } catch { /* blocked storage: auto */ }

const qsubs: ((q: Quality) => void)[] = [];

export function getQuality(): Quality {
  return quality;
}

export function setQuality(q: Quality): void {
  if (q === quality) return;
  quality = q;
  try { localStorage.setItem(QKEY, q); } catch { /* not persisted, still applied */ }
  for (const f of qsubs) f(q);
}

export function onQuality(f: (q: Quality) => void): void {
  qsubs.push(f);
  f(quality);
}

// The minimap's camera button: three distances, close / medium / far (camera/*.ts STEPS), one tap
// each round. Persisted like the style; a pinch or the wheel still zooms freely in between.
const VKEY = 'redentore.view';
export const VIEWS = ['Vicina', 'Media', 'Lontana'] as const;

let view = 1;
try { view = Math.max(0, ['0', '1', '2'].indexOf(localStorage.getItem(VKEY) ?? '1')); } catch { /* blocked storage: medium */ }

export function getView(): number {
  return view;
}

export function setView(v: number): void {
  view = v;
  try { localStorage.setItem(VKEY, String(v)); } catch { /* not persisted, still applied */ }
}
