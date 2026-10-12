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
