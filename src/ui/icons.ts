import atlas from './icons.webp';
import cap from './art/cap.webp';
import stone from './art/stone.webp';
import { ATLAS, COLS, ROWS } from './iconAtlas.ts';

// Painted square icons, classic-MMORPG style: abilities, level-up cards, items and gear, buffs, HUD
// buttons, all in one WebP atlas (scripts/icons/build.py paints and packs them). An icon is an <i
// class="ico"> showing its cell of the atlas at whatever size its box has; frames and quality
// borders come from the CSS around it. The painted interface art (panel stone, the action bar's
// winged lions) goes to index.html's skin as --stone-img and --cap-img.

const style = document.createElement('style');
style.textContent = `.ico { display: block; width: 100%; height: 100%; background: url(${atlas}) 0 0 / ${COLS * 100}% ${ROWS * 100}% no-repeat; }`;
document.head.append(style);
document.documentElement.style.setProperty('--stone-img', `url(${stone})`);
document.documentElement.style.setProperty('--cap-img', `url(${cap})`);

/** The markup of icon `id` ('' if there's none). */
export function icon(id: string): string {
  const n = (ATLAS as readonly string[]).indexOf(id);
  if (n < 0) return '';
  const x = ((n % COLS) / (COLS - 1)) * 100, y = (Math.floor(n / COLS) / (ROWS - 1)) * 100;
  return `<i class="ico" style="background-position: ${+x.toFixed(3)}% ${+y.toFixed(3)}%" aria-hidden="true"></i>`;
}

export const ICONS: Record<string, string> = Object.fromEntries(ATLAS.map((id) => [id, icon(id)]));
