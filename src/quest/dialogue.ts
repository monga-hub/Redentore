// What Fra' Zuane says, by quest stage (quest/progress.ts). No DOM and no three.js: the window
// that types it out is ui/dialogue.ts, and `npm run check` walks it in Node.
//
// Who he is: the porter (portinaio) of the Capuchin convent, keeper of its keys. On the night
// the Reverendissimo's vow took the Giudecca he locked the grates of the chiostro grande on the
// risen priests, ran for the pontile to row the key to the Patriarch, and hid it in the relic
// chest under a seal of his own name before the vow's chains dragged him back to the church's
// threshold, which he can neither cross nor leave. He has waited four centuries for someone the
// vow raised and did not keep.

import type { Stage } from './progress.ts';

export const QUEST_TITLE = 'La chiave del portinaio';

/** The tracker's line for each stage. */
export const OBJECTIVE: Record<Stage, string> = {
  talk: "Parla con Fra' Zuane, sulla fondamenta",
  key: 'Trova la chiave nel baule in fondo al pontile',
  grate: 'Apri la grata del chiostro grande',
  boss: 'Sconfiggi il Reverendissimo sotto la cupola',
  leave: 'Esci dal portone sulla fondamenta',
  done: 'Il voto è spezzato',
};

export interface Talk {
  pages: string[];
  /** The last page offers the quest: Accetta / Rifiuta instead of a goodbye. */
  offer?: true;
}

export const TALK: Record<Stage, Talk> = {
  talk: {
    pages: [
      'Fermo, fratello. No... non fratello. Hai gli occhi di chi è tornato dalle zolle dell\'orto, eppure cammini da te. Allora è vero: il voto si incrina.',
      'Sono Fra\' Zuane, il portinaio. Le chiavi di questa casa erano mie. La notte del Redentore, quando i morti si alzarono, chiusi le grate del chiostro grande sui preti del Reverendissimo.',
      'Corsi al pontile per portare la chiave al Patriarca, ma la laguna non mi volle. Feci in tempo a nasconderla nel baule delle reliquie, sigillato col mio nome. Poi le sue catene mi trascinarono qui, su una soglia che non posso varcare.',
      'Il portone è sbarrato da dentro. Passa dalla calle e dal convento, attraversa l\'orto fino al pontile sulla laguna. Prendi la chiave, apri la grata del chiostro grande, entra in chiesa dal coro.',
      'E sotto la cupola, spezza il voto. Ti do il mio nome: il sigillo ti riconoscerà. Fallo, Risorto, e forse anche questo vecchio portinaio potrà andarsene.',
    ],
    offer: true,
  },
  key: { pages: ['Il baule è in fondo al pontile, dove l\'acqua è più nera. I frati zappano ancora l\'orto, sai. Non hanno mai smesso. E non amano chi calpesta i loro solchi.'] },
  grate: { pages: ['La senti, vero? Pesa più del ferro. Apri la grata del chiostro grande: dall\'orto, o dal chiostro mediano. Dietro, la porta del coro.'] },
  boss: { pages: ['Il coro è aperto. Lui ti aspetta sotto la cupola. Non ascoltare le sue preghiere, Risorto: sono le nostre, e ce le ha rubate.'] },
  leave: { pages: ['Le campane... le senti? Il voto si è spezzato. Esci dal portone, Risorto. Torna sulla fondamenta, che io veda il cielo con te.'] },
  done: { pages: ['È finita. Sento la laguna che mi chiama, finalmente. Va\' in pace, Risorto. Qualunque cosa tu sia, sei stato più cristiano di chi ci ha voluti morti.'] },
};

/** Said when the offer is turned down. */
export const DECLINE = 'Il voto ha atteso quattro secoli. Può attendere ancora un poco. Io sono qui: dove altro potrei andare?';
