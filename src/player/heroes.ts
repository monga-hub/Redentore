// Who rises from the grave: the heroes a new game offers (ui/select.ts), each with his own body, his school and the kit it
// starts him with. The choice goes in the save (core/save.ts `hero`; older saves are the Risorto's). Every body is a Meshy
// character on the same 24-bone rig, so the clips, the moves and the gear's sockets carry over (player/outfit.ts fits them
// per body). No three.js and no DOM: `npm run check` reads it in Node.
import type { School } from './levels.ts';

export type Hero = 'risorto' | 'bortolo';
export interface HeroDef {
  name: string;
  title: string;
  /** The school he starts in and the one he leans to (the select screen shows both). */
  school: [School, School];
  lore: string;
  /** His body under public/models/, and its portrait beside it. */
  file: string;
  portrait: string;
  /** The weapon in his fist on a new game (loot/gear.ts). */
  weapon: string;
  /** The abilities of his school he starts with, beyond everyone's swing, heal and potion (levels.ts START). */
  kit: string[];
}

export const HEROES: Record<Hero, HeroDef> = {
  risorto: {
    name: 'Il Risorto', title: 'guerriero d’ossa', school: ['bone', 'shadow'],
    lore: 'Il morto senza nome levato dalla fossa della Giudecca, col patto della tomba ancora in bocca.',
    file: 'reietto.glb', portrait: 'reietto.webp', weapon: 'clava-osso', kit: [],
  },
  bortolo: {
    name: 'Bortolo', title: 'gondoliere annegato', school: ['frost', 'storm'],
    lore: 'Annegò l’inverno in cui gelò la laguna. Il remo non si è più scongelato, e nemmeno lui.',
    file: 'bortolo.glb', portrait: 'bortolo.webp', weapon: 'remo-gelato', kit: ['frost', 'caligo'],
  },
};
export const HERO_IDS = Object.keys(HEROES) as Hero[];

/** A saved hero id made sound: anything else (an older save, another build's hero) is the Risorto. */
export const heroOf = (id: unknown): Hero => (HERO_IDS as unknown[]).includes(id) ? (id as Hero) : 'risorto';
