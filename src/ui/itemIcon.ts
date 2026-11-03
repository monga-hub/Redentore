import type { Item } from '../loot/bag.ts';
import { OUTFIT_APPEARANCES } from '../player/whole-outfit-key.ts';
import { hasHeroOutfits } from '../player/hero-outfit-key.ts';
import type { Hero } from '../player/heroes.ts';
import { ICONS } from './icons.ts';
import { CLOTHING_ICONS, CLOTHING_COLS, CLOTHING_ROWS } from './clothingIconAtlas.ts';

let hero: Hero = 'risorto';
export function itemIconHero(value: Hero): void { hero = value; }

/** Inventory, equipment and shops share the same hero/item portrait lookup. */
export function itemIcon(item: Pick<Item, 'id' | 'icon'>): string {
  const build = OUTFIT_APPEARANCES[hero].findIndex(id => item.id.startsWith(`abito-${id}-`));
  if (build >= 0) return `<i class="ico" aria-hidden="true" style="background-image:url('${import.meta.env.BASE_URL}models/hero-outfits/whole-icons.webp');background-size:300% 500%;background-position:${build / 2 * 100}% ${(['risorto', 'bortolo', 'fosca', 'tizian', 'zanetto'].indexOf(hero)) / 4 * 100}%"></i>`;
  const n = (CLOTHING_ICONS as readonly string[]).indexOf(item.id);
  if (!hasHeroOutfits(hero) || n < 0) return ICONS[item.icon] ?? '';
  const x = n % CLOTHING_COLS / (CLOTHING_COLS - 1) * 100;
  const y = Math.floor(n / CLOTHING_COLS) / (CLOTHING_ROWS - 1) * 100;
  return `<i class="ico" aria-hidden="true" style="background-image:url('${import.meta.env.BASE_URL}models/hero-outfits/${hero}/icons.webp');background-size:${CLOTHING_COLS * 100}% ${CLOTHING_ROWS * 100}%;background-position:${x}% ${y}%"></i>`;
}
