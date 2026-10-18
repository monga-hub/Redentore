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

// Fra' Bortolo, the speziale (apothecary) of the convent, in the serra (quest/progress.ts SPEZIALE).
// In the plague years he grew the herbs for the sick and helped bury the dead nobody claimed;
// he put a sprig of rue, the herb of grace, in the mouth of each one he buried. That is why the
// hero remembers a name: the vow raised them, but grace kept them. The risen keep out of his
// glasshouse (the rue stings them), and so does the vow's chain: he is bound to it, not dragged.
// He tells what the intro only hints at, and gives the hero his blessing once (BLESSING).

/** First talk: the lore, and the blessing as he says goodbye. */
export const SPEZIALE_TALK: Talk = {
  pages: [
    'Piano, piano: non calpestare la ruta. Sei il primo che varca questa porta senza una zappa in mano da quattro secoli. Sono Fra\' Bortolo, lo speziale. Queste erbe le ho seminate io, per gli appestati.',
    'Quelli che nessuno reclamava li seppellivamo nell\'orto, di notte. Il Reverendissimo benediceva le fosse e contava i corpi. Credevamo che pregasse. Contava: ogni morto era una moneta per il suo secondo voto.',
    'Poi la notte del Redentore il conto fu saldato. I fratelli si alzarono dalle zolle e zappano ancora: il voto dice «servirete questa casa», e loro servono. Non ricordano più il proprio nome.',
    'Tu sì. Sai perché? A ognuno, prima della terra, mettevo in bocca un rametto di ruta: l\'erba della grazia. A te pure. Il voto ti ha rialzato, ma la grazia ti ha lasciato il nome. Per questo cammini da te, Risorto.',
    'Qui dentro non entrano: la ruta brucia loro la gola. Ma il voto non si spezza in una serra. Bevi questo infuso, ruta e salvia e una preghiera vera: per un poco le tue mani saranno più svelte del suo rancore.',
  ],
};

/** Once the infusion is given; and once the Reverendissimo is dead. */
export const SPEZIALE_AGAIN: Talk = { pages: ['La ruta ha dato quello che poteva, per questa notte. Va\', Risorto. Lui è sotto la cupola, e non si stanca di aspettare.'] };
export const SPEZIALE_DONE: Talk = { pages: ['La senti? La terra si è fatta leggera. I fratelli sono tornati a dormire nelle loro fosse. Lasciami ancora un poco con le mie erbe, Risorto. Poi verrò anch\'io.'] };
