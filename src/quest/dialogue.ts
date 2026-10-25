// What Fra' Zuane says, by quest stage (quest/progress.ts). No DOM and no three.js: the window
// that types it out is ui/dialogue.ts, and `npm run check` walks it in Node.
//
// Who he is: the porter (portinaio) of the Capuchin convent, keeper of its keys. On the night
// the Reverendissimo's vow took the Giudecca he locked the grates of the chiostro grande on the
// risen priests, ran for the pontile to row the key to the Patriarch, and hid it in the relic
// chest under a seal of his own name before the vow's chains dragged him back to the church's
// threshold, which he can neither cross nor leave. He has waited four centuries for someone the
// vow raised and did not keep.

import { BOONS, SECOND, THIRD, type Stage } from './progress.ts';

export const QUEST_TITLE = 'La chiave del portinaio';
export const QUEST2_TITLE = 'La dote delle Zitelle';
export const QUEST3_TITLE = 'Le nozze di San Giorgio';
/** The tracker's title at a stage: the first quest until it is handed in, then the second, then the third. */
export const titleOf = (s: Stage) => (THIRD.includes(s) ? QUEST3_TITLE : SECOND.includes(s) ? QUEST2_TITLE : QUEST_TITLE);

/** The tracker's line for each stage. */
export const OBJECTIVE: Record<Stage, string> = {
  talk: "Parla con Fra' Zuane, sulla fondamenta",
  key: 'Trova la chiave nel baule in fondo al pontile',
  grate: 'Apri la grata del chiostro grande',
  boss: 'Sconfiggi il Reverendissimo sotto la cupola',
  leave: 'Esci dal portone sulla fondamenta',
  report: "Torna da Fra' Zuane, sulla fondamenta",
  offer: "Parla con Fra' Zuane",
  route: 'Raggiungi le Zitelle lungo la fondamenta, verso levante',
  ospizio: "Prendi la chiave della Maestra del merletto, nell'ospizio",
  church: 'Apri la porta della chiesa dal cortile delle Zitelle',
  boss2: 'Sconfiggi la Governatrice sotto la cupola delle Zitelle',
  return: "Torna da Fra' Zuane",
  offer3: "Parla con Fra' Zuane",
  route3: 'Raggiungi la punta della Giudecca e sali sulla gondola di Mastro Iseppo',
  biblioteca: 'Prendi la chiave del Cenacolo al Bibliotecario, in cima allo scalone del Longhena',
  cenacolo: "Apri la porta del Cenacolo dall'antirefettorio",
  boss3: "Sconfiggi l'Abate di San Giorgio nel Cenacolo",
  return3: "Torna da Fra' Zuane, al Redentore",
  done: 'Le nozze sono rotte',
};

/** The tracker's line for Fra' Bortolo's errand, from Fra' Zuane's first quest until he is found. */
export const BORTOLO_OBJECTIVE = "Trova Fra' Bortolo nella serra dell'orto";

export interface Talk {
  pages: string[];
  /** The last page offers the quest: Accetta / Rifiuta instead of a goodbye. */
  offer?: true;
  /** The offered quest's name (default the first) and the answer to a Rifiuta (default DECLINE). */
  title?: string;
  decline?: string;
  /** The last page asks for one of these instead of Accetta / Rifiuta (the rite's boons); the accept handler gets its id. */
  choices?: readonly { id: string; label: string }[];
}

export const TALK: Record<Stage, Talk> = {
  talk: {
    pages: [
      'Fermo, fratello. No... non fratello. Hai gli occhi di chi è tornato dalle zolle dell\'orto, eppure cammini da te. Allora è vero: il voto si incrina.',
      'Sono Fra\' Zuane, il portinaio. Le chiavi di questa casa erano mie. La notte del Redentore, quando i morti si alzarono, chiusi le grate del chiostro grande sui preti del Reverendissimo.',
      'Corsi al pontile per portare la chiave al Patriarca, ma la laguna non mi volle. Feci in tempo a nasconderla nel baule delle reliquie, sigillato col mio nome. Poi le sue catene mi trascinarono qui, su una soglia che non posso varcare.',
      'Il portone è sbarrato da dentro. Passa dalla calle e dal convento, attraversa l\'orto fino al pontile sulla laguna. Prendi la chiave, apri la grata del chiostro grande, entra in chiesa dal coro.',
      'Nell\'orto c\'è la serra di Fra\' Bortolo, lo speziale. Se la sua ruta resiste ancora, resiste anche lui. Cercalo: sa del voto cose che io ho dimenticato, e un vivo... un quasi vivo ha bisogno delle sue erbe.',
      'E sotto la cupola, spezza il voto. Ti do il mio nome: il sigillo ti riconoscerà. Fallo, Risorto, e forse anche questo vecchio portinaio potrà andarsene.',
    ],
    offer: true,
  },
  key: { pages: ['Il baule è in fondo al pontile, dove l\'acqua è più nera. I frati zappano ancora l\'orto, sai. Non hanno mai smesso. E non amano chi calpesta i loro solchi.'] },
  grate: { pages: ['La senti, vero? Pesa più del ferro. Apri la grata del chiostro grande: dall\'orto, o dal chiostro mediano. Dietro, la porta del coro.'] },
  boss: { pages: ['Il coro è aperto. Lui ti aspetta sotto la cupola. Non ascoltare le sue preghiere, Risorto: sono le nostre, e ce le ha rubate.'] },
  leave: { pages: ['Le campane... le senti? Il voto si è spezzato. Esci dal portone, Risorto. Torna sulla fondamenta, che io veda il cielo con te.'] },
  // Level 2: the first quest handed in, the second offered in the same breath.
  report: {
    pages: [
      'Il cielo, Risorto. Lo vedo di nuovo, sopra la cupola. Hai spezzato il voto del Reverendissimo. Sento la laguna che mi chiama... ma le catene non mi lasciano. Guarda: non sono più di ferro.',
      'Sono di filo. Merletto bianco, stretto ai polsi come una promessa. Lo conosco, questo punto: è il punto in aria delle Zitelle, in fondo alla fondamenta. Stanotte le loro campane hanno ripreso a suonare.',
      'Il Reverendissimo contava le anime, ma il conto andava saldato. Ogni morto dell\'orto fu messo in dote: la Governatrice della Pia Casa li cucì in un velo per la Madonna della Presentazione. Metà del voto era sua.',
      'Finché il velo non è finito, nessuno di noi riposa. Le sue figlie filano ancora, i gondolieri annegati fanno la guardia ai rii e le codeghe fanno luce a chi non dovrebbe più camminare.',
      'Le catene sul Ponte de la Croce cadranno al tuo passo. Entra dall\'ospizio: la Maestra del merletto porta alla cintura la chiave della chiesa. E tieni a mente la ruta di Fra\' Bortolo: le zitelle la temono.',
      'Prendi queste monete per la strada: è tutto quello che un portinaio può darti. Va\' alle Zitelle, Risorto, e taglia quel filo.',
    ],
    offer: true, title: QUEST2_TITLE,
    decline: 'Il filo è paziente come chi l\'ha filato. Torna quando vuoi, Risorto: le Zitelle non si muovono.',
  },
  offer: {
    pages: ['Le catene di filo tirano ancora, Risorto. Le Zitelle aspettano in fondo alla fondamenta, oltre il Ponte de la Croce. Vuoi tagliare quel filo?'],
    offer: true, title: QUEST2_TITLE,
    decline: 'Il filo è paziente come chi l\'ha filato. Torna quando vuoi, Risorto: le Zitelle non si muovono.',
  },
  route: { pages: ['Segui la fondamenta verso levante, oltre il rio de la Croce e il rio del Squero. I gondolieri non sono mai tornati dall\'ultima voga: non fermarti a contrattare il prezzo.'] },
  ospizio: { pages: ['L\'ospizio ha una porta sola sulla fondamenta: la portineria. La Maestra del merletto sta nella sala grande, tra i tavoli e i tomboli. Ha la chiave della chiesa, e non ha mai dato niente a nessuno.'] },
  church: { pages: ['Hai la chiave. La porta della chiesa si apre dal cortile, dietro l\'altare. La Governatrice ti aspetta sotto la cupola. Non guardare il velo, Risorto: chi lo guarda ci resta cucito.'] },
  boss2: { pages: ['Il filo trema: la sento lavorare da qui. Sotto la cupola, Risorto. Taglialo prima che lei finisca il velo.'] },
  return: {
    pages: [
      'Il filo si è sciolto. Le campane delle Zitelle tacciono, e le catene... guarda: polvere bianca. Hai reso la dote a chi l\'aveva perduta, Risorto.',
      'Ma senti la laguna? Non è quieta. Il Reverendissimo e la Governatrice erano due nodi dello stesso filo, e il filo continua oltre San Giorgio. Riposa, per stanotte. Domani parleremo di chi l\'ha teso.',
    ],
  },
  // Level 3: the second quest handed in, the third offered (Le nozze di San Giorgio), the Abate's wedding to the lagoon.
  offer3: {
    pages: [
      'Per i morti la notte è una sola, Risorto: il domani che ti avevo promesso è già qui. Ascolta le campane. Non le Zitelle: più in là, oltre la punta della Giudecca. San Giorgio Maggiore suona a nozze.',
      'Il Reverendissimo contava le anime. La Governatrice le cuciva nel suo velo, come una dote. Ma una dote serve a una cosa sola, Risorto: a sposarsi. Chi ha teso il filo è l\'Abate di San Giorgio, il signore dell\'isola qui di fronte.',
      'Nel 1576 la peste arrivava dall\'acqua. L\'Abate fece un patto con la laguna: le anime della Giudecca, velate dal merletto delle Zitelle, in sposa al mare, e l\'acqua avrebbe risparmiato la sua isola.',
      'Come il Doge alla Sensa, quando getta l\'anello in laguna e dice: ti sposiamo, mare. Le nozze si celebrano nel Cenacolo dei monaci, sotto le Nozze di Cana del Veronese.',
      'Là l\'acqua si fece vino; lui vuole che il vino torni acqua, e i vivi marea. Il quadro lo portarono via i Francesi, due secoli dopo: la festa perse i suoi testimoni, e non è mai finita.',
      'Le catene oltre i Tre Oci cadranno al tuo passo. Segui la fondamenta fino alla punta della Giudecca: Mastro Iseppo mi manda a dire che la sua gondola è varata, e ti aspetta al pontile.',
      'Il Cenacolo è chiuso a chiave, e la chiave la tiene il Bibliotecario, in cima allo scalone del Longhena.',
      'Va\', Risorto. Rompi quelle nozze prima che l\'acqua dica di sì.',
    ],
    offer: true, title: QUEST3_TITLE,
    decline: 'Le nozze aspettano da quattro secoli, Risorto. Ma ogni notte la marea sale di un dito. Torna presto.',
  },
  route3: { pages: ['La fondamenta continua oltre i Tre Oci, fino alla punta. Là c\'è il pontile, e la gondola di Iseppo. Non serve remare: il ferro sa la strada. E non guardare giù, Risorto: in quell\'acqua c\'è gente che aspetta un passaggio.'] },
  biblioteca: { pages: ['La biblioteca è in cima allo scalone del Longhena. Dalla basilica passi al chiostro degli allori, poi a quello dei cipressi. Il Bibliotecario copia i nomi dei morti in un registro che non finisce mai: prendigli la chiave del Cenacolo.'] },
  cenacolo: { pages: ['Hai la chiave. Il Cenacolo si apre dall\'antirefettorio, sul lato sud del chiostro degli allori. Dentro i monaci apparecchiano ancora la tavola. Non bere niente, Risorto.'] },
  boss3: { pages: ['L\'Abate è nel Cenacolo, sotto la cornice vuota. Quando versa il calice, fatti da parte. Quando suonano le campane, salta. E quando sale l\'acqua... cerca la luce.'] },
  return3: {
    pages: [
      'Le campane di San Giorgio tacciono. L\'ho sentito da qui, Risorto: un tonfo nell\'acqua, come un anello che cade. Le nozze sono rotte. La marea torna marea.',
      'Il Reverendissimo, la Governatrice, l\'Abate: tre nodi di un filo solo, e li hai sciolti tutti. Il voto del 1576 voleva una chiesa per la città salvata, non anime in dote. Ora è compiuto davvero.',
      'Guarda i miei polsi. Niente ferro, niente merletto. Solo pelle vecchia. Dopo quattro secoli posso varcare questa soglia, e non ho più nessuna porta da custodire.',
      'Nell\'orto i frati hanno posato le zappe. Sui rii delle Zitelle i gondolieri tirano i remi in barca. A San Giorgio i monaci sparecchiano la tavola. Riposano tutti, Risorto. Tutti, tranne te.',
      'Prendi le chiavi del Redentore: erano mie, adesso sono tue. Io scendo al pontile ad aspettare l\'alba. Sarà la prima che vedo, e l\'ultima. Grazie, fratello. Adesso sì, fratello.',
    ],
  },
  done: { pages: ['L\'alba è vicina, Risorto. La fondamenta è tua, e la laguna anche: va\' dove vuoi, nessuno ti chiamerà più. Quando sarai stanco, l\'orto del Redentore ha zolle morbide.'] },
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
/** On the road to the Zitelle: what he knows of them, and a second infusion (once). */
export const SPEZIALE_ZITELLE: Talk = {
  pages: [
    'Le Zitelle? Povere figlie senza dote. Nella peste portavo la ruta anche a loro, in fondo alla fondamenta. La Governatrice la faceva bruciare in cortile: diceva che l\'erba della grazia rovinava il bianco del filo.',
    'Il filo, Risorto. Lei cuciva i nostri morti nel suo velo e le ragazze contavano i punti. Se il Reverendissimo era il conto, lei era la cassa. Bevi: l\'ultima ruta che ho. Fa\' che basti.',
  ],
};
/** On the way to San Giorgio: why the Abate wanted his rue, a third infusion (once), and level 3's goods in his chest. */
export const SPEZIALE_SANGIORGIO: Talk = {
  pages: [
    'San Giorgio? Nella peste i benedettini compravano la mia ruta a sacchi. L\'Abate la voleva tutta, e io credevo che fosse per i malati. No: contava chi l\'aveva avuta. Chi muore con la ruta in bocca, la laguna non può sposarlo.',
    'Per questo ti cercherà, Risorto: sei l\'unico invitato che non può prendere. Bevi l\'ultimo infuso. E guarda nella mia cassa: per l\'isola ho tenuto da parte cose che i morti di San Giorgio non devono avere.',
  ],
};
export const SPEZIALE_SANGIORGIO_AGAIN: Talk = { pages: ['La ruta è finita, Risorto, ma la cassa è aperta: prendi quello che ti serve per San Giorgio. E se senti cantare in coro, non rispondere all\'amen.'] };
export const SPEZIALE_ZITELLE_AGAIN: Talk = { pages: ['Non ho altra ruta, Risorto. Va\' alle Zitelle. Se senti cantare sottovoce tra i tavoli del merletto, non fermarti ad ascoltare.'] };

// Fra' Zuane's corona: the Capuchin rosary he wore at the cord, olive-wood beads and a worn medal of
// San Francesco, his mother's gift at his vestition. It snapped off as he ran for the pontile and the
// beads went into the orto's furrows; one of the dead brings it up (loot/bag.ts RELIC).
export const RELIC_TITLE = 'La corona del portinaio';
export const RELIC_OBJECTIVE = "Riporta la corona a Fra' Zuane, sulla fondamenta";
export const RELIC_TALK: Talk = {
  pages: [
    'Quella... quella è la mia corona. Il legno d\'ulivo, la medaglietta di San Francesco consumata dal pollice. Dove l\'hai trovata, Risorto? No, non dirmelo. Lo so: nell\'orto, tra i fratelli.',
    'Me la diede mia madre il giorno della vestizione, a Treviso. «Così non ti perdi», disse. La notte del Redentore il cordone si strappò mentre correvo al pontile, e i grani finirono nei solchi.',
    'Quattro secoli di Ave Maria contate sulle dita, Risorto. Le dita di un morto non bastano: si perde il conto. Lasciami... lasciami dirne una, adesso, con i grani giusti.',
    '...Ecco. Le mani non tremano più. Tieni la medaglietta: io ho ritrovato la corona, a te il santo serve più che a me. San Francesco ti guardi le spalle, dove io non posso arrivare.',
  ],
};

// Le teste dei frati (quest/progress.ts HEADS): the rite the Reverendissimo forbade, asked after the lore.
export const HEADS_TITLE = 'Le teste dei frati';
/** His ask: after the lore on the first talk, or on its own while it is still open. */
export const SPEZIALE_HEADS: Talk = {
  pages: [
    'Un\'altra cosa, Risorto. La ruta da sola non ridà il nome ai fratelli: serve il rito intero, quello che il Reverendissimo ci proibì. E il rito vuole le teste di chi il nome l\'ha perso.',
    'Portamene dodici. Non guardarmi così: loro non le usano più, e la grazia non chiede permesso. Le metterò nella terra sotto la ruta, e la terra ti renderà qualcosa che resta.',
  ],
  offer: true, title: HEADS_TITLE,
  decline: 'La ruta sa aspettare, Risorto. Se cambi idea la serra è qui, e i fratelli non vanno da nessuna parte.',
};
/** While he waits for them: `n` in hand of `need`. */
export const spezialeWait = (n: number, need: number): Talk => ({
  pages: [`${n ? `Ne hai ${n}.` : 'Ancora nessuna?'} Me ne servono ${need}. I fratelli zappano nell\'orto: guarda sotto i cappucci, Risorto, e non fare quella faccia.`],
});
/** The heads brought back: the rite, and a boon to pick. */
export const SPEZIALE_RITE: Talk = {
  pages: [
    'Eccole. Le conto due volte, come faceva lui con i corpi... no. Lui contava per tenerle, io per restituirle. Mettile qui, tra la ruta e la salvia, e non respirare.',
    'Scegli cosa vuoi che la terra ti renda: una fiala più forte, un corpo più saldo o una fiala che torna piena prima. Una volta sola, Risorto: il rito non si ripete.',
  ],
  choices: BOONS,
};

/** Each quest-giver's greeting over his list of quests (ui/dialogue.ts). */
export const GREET = {
  zuane: 'Risorto. Il portinaio è ancora qui, sulla sua soglia. Cosa cerchi?',
  speziale: 'Piano con la ruta, Risorto. Cosa ti porta nella serra?',
  iseppo: 'Mastro Iseppo, proto dello squero. Parla, Risorto: il legno ascolta.',
} as const;
