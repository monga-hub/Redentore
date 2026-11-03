import { GEAR } from '../loot/gear.ts';
import type { Hero } from './heroes.ts';

export const CLOTH_SLOTS = ['testa', 'spalle', 'torso', 'mani', 'gambe', 'piedi'] as const;
export type ClothSlot = typeof CLOTH_SLOTS[number];
export type Finish = 'green' | 'blue' | 'epic';

export const HERO_OUTFIT_HEROES: readonly Hero[] = ['tizian', 'bortolo'];
export function hasHeroOutfits(hero: Hero): boolean { return HERO_OUTFIT_HEROES.includes(hero); }

/** Appearance follows the item's origin, independently of the current map or hero level. */
export function heroOutfitKey(hero: Hero, id?: string): { world: number; finish: Finish } | undefined {
  if (!hasHeroOutfits(hero)) return;
  const item = GEAR.find((g) => g.id === id);
  if (!item?.slot || item.rarity === 'comune' || !(CLOTH_SLOTS as readonly string[]).includes(item.slot)) return;
  return { world: item.l3 ? 3 : item.l2 ? 2 : 1, finish: item.rarity === 'noncomune' ? 'green' : item.rarity === 'raro' ? 'blue' : 'epic' };
}
