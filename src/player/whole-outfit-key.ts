import type { Hero } from './heroes.ts';
import type { Rarity } from '../loot/bag.ts';
import type { Finish } from './hero-outfit-key.ts';

/** Structural adapter for the canonical loot outfitSelection; no stats affect appearance. */
export interface OutfitSelection { build: string; chapter: 1 | 2 | 3; rarity: Rarity; legacy: boolean }
export const OUTFIT_APPEARANCES: Record<Hero, readonly string[]> = {
  risorto: ['risorto-fossore', 'risorto-divoratore', 'risorto-predatore'],
  bortolo: ['bortolo-custode-laguna', 'bortolo-barcaiolo-tempesta', 'bortolo-navigatore-bora'],
  fosca: ['fosca-untora', 'fosca-custode-suffragio', 'fosca-penitente-contagio'],
  tizian: ['tizian-maestro-fornace', 'tizian-frate-vetro', 'tizian-penitente-braci'],
  zanetto: ['zanetto-araldo-temporale', 'zanetto-batacchio-sepolcro', 'zanetto-rintocco-guerra'],
};
const SOURCES: Record<Hero, readonly number[]> = { risorto: [1, 2, 3], bortolo: [2, 1, 3], fosca: [2, 1, 3], tizian: [1, 2, 3], zanetto: [2, 1, 3] };
export function wholeOutfitKey(hero: Hero, selection?: OutfitSelection): { world: number; finish: Finish; tier?: true } | undefined {
  if (!selection || selection.legacy || selection.rarity === 'comune') return;
  const build = OUTFIT_APPEARANCES[hero].indexOf(selection.build);
  if (build < 0 || ![1, 2, 3].includes(selection.chapter)) return;
  const finish = selection.rarity === 'noncomune' ? 'green' : selection.rarity === 'raro' ? 'blue' : 'epic';
  // The new pilot is shared by all stat builds of this hero/chapter; other assets retain their existing fallback.
  if (hero === 'fosca' && selection.chapter === 3 && ['noncomune', 'raro', 'epico'].includes(selection.rarity)) return { world: 3, finish, tier: true };
  return { world: SOURCES[hero][build], finish };
}
