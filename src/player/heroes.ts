// Who rises from the grave: the heroes a new game offers (ui/select.ts), each with their own body, their school and the kit it
// starts them with. The choice goes in the save (core/save.ts `hero`; older saves are the Risorto's). Every body is a Meshy
// character on the same 24-bone rig with the same clip names and timings, each clip his own (player/undead.ts), so the
// moves and the gear's sockets carry over (player/outfit.ts fits them per body). No three.js and no DOM: `npm run check` reads it in Node.
import type { School } from './levels.ts';

export type Hero = 'risorto' | 'bortolo' | 'fosca' | 'tizian' | 'zanetto';
export interface HeroDef {
  name: string;
  title: string;
  /** The school he starts in and the one he leans to (the select screen shows both). */
  school: [School, School];
  lore: string;
  /** His body under public/models/, and its portrait beside it. */
  file: string;
  portrait: string;
  /** m tall as he stands, hat, hood and spikes and all (core/models.ts `stand`): their builds differ, the capsule doesn't. */
  height: number;
  /** The weapon in his fist on a new game (loot/gear.ts). */
  weapon: string;
  /** The abilities of his school he starts with, beyond everyone's swing, heal and potion (levels.ts START). */
  kit: string[];
}

export const HEROES: Record<Hero, HeroDef> = {
  risorto: {
    name: 'Il Risorto', title: 'guerriero d’ossa', school: ['bone', 'shadow'],
    lore: 'Il morto senza nome levato dalla fossa della Giudecca, col patto della tomba ancora in bocca.',
    file: 'reietto.glb', height: 2.0, portrait: 'reietto.webp', weapon: 'clava-osso', kit: [],
  },
  bortolo: {
    name: 'Bortolo', title: 'gondoliere annegato', school: ['frost', 'storm'],
    lore: 'Annegò l’inverno in cui gelò la laguna. Il remo non si è più scongelato, e nemmeno lui.',
    file: 'bortolo.glb', height: 2.25, portrait: 'bortolo.webp', weapon: 'remo-gelato', kit: ['frost', 'caligo'],
  },
  fosca: {
    name: 'Suor Fosca', title: 'monaca del lazzaretto', school: ['plague', 'holy'],
    lore: 'Curò gli appestati del Lazzaretto Vecchio finché ne divenne il contagio. Ora benedice col miasma.',
    file: 'fosca.glb', height: 1.85, portrait: 'fosca.webp', weapon: 'stiletto-osso', kit: ['plague', 'spit'],
  },
  tizian: {
    name: 'Fra’ Tizian', title: 'soffiatore di Murano', school: ['fire', 'holy'],
    lore: 'Soffiava il vetro alle fornaci di Murano finché il forno lo prese vivo. Il vetro fuso gli cola ancora nelle costole.',
    file: 'tizian.glb', height: 1.68, portrait: 'tizian.webp', weapon: 'canna-vetraio', kit: ['pyre', 'cero'],
  },
  zanetto: {
    name: 'Zanetto', title: 'campanaro del Redentore', school: ['storm', 'bone'],
    lore: 'Il fulmine lo colse sul campanile mentre suonava a morto. Da allora ogni rintocco chiama la tempesta.',
    file: 'zanetto.glb', height: 1.95, portrait: 'zanetto.webp', weapon: 'martello-campana', kit: ['chain', 'toll'],
  },
};
export const HERO_IDS = Object.keys(HEROES) as Hero[];

/** A saved hero id made sound: anything else (an older save, another build's hero) is the Risorto. */
export const heroOf = (id: unknown): Hero => (HERO_IDS as unknown[]).includes(id) ? (id as Hero) : 'risorto';
