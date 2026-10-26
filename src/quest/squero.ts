// Mastro Iseppo's side quests, in the squero on the road to the Zitelle (level 2). Plain state, no three.js and
// no DOM, so `npm run check` walks it in Node; quest/view.ts draws him, his glints and the tracker lines,
// main.ts feeds it the deaths and drops the quest items.
//
// Who he is: the proto (master boatwright) of the squero by the rio, who built the gondolas of the Giudecca's
// traghetto. His daughter Marieta was taken into the Pia Casa delle Zitelle to learn the lace; he worked forty
// years for the dowry that would bring her out. The plague took him at his trestles, the vow kept him there, and
// the Governatrice kept Marieta at her tables. He wants his last gondola finished, the black one on the
// trestles, to row his girl home.
//
// Six quests in a loose chain (each opens when the one it follows is done, so two can run at once), WoW and
// Diablo style: collect off the drowned gondolieri, kill the codeghe, the Gastaldo's head, a thimble under a bed
// in the Zitelle's dormitory, the Maestra's shears, an ex voto back in the Redentore; and a seventh started by a
// rare drop, Marieta's letter. Each pays XP, gold and one of level 2's epics; he sells the rest of them.
//
// Level 3 (San Giorgio) brings more givers on the same engine (GIVERS): Iseppo again, by his gondola on the approdo,
// the Fanalista of the darsena, Padre Archivista in Longhena's passage, and the ghost of Paolo Veronese in the antirefettorio, whose
// two quests (the musicians' instruments, then the canvas back off the Commissario delle Arti) open the Cenacolo, and the
// Cardinale benedettino before the high altar, who wants the conclave's voting slips counted. Padre Archivista's second sends the hero
// up the campanile, to the bell chamber 44 m over the lagoon. A quest may run in steps (`want` a list: collect, then use-points that burn what
// was collected, then a token), and one may weaken the Abate (`prep`, enemies/sangiorgio.ts PREPS).
import { ITEM, type Bag } from '../loot/bag.ts';
import { CHURCH_FLOOR } from '../level/plan.ts';
import { BELLS, LIB_F } from '../level/zones/sangiorgio.ts';
import type { Talk } from './dialogue.ts';
import { QUESTS, type QuestId } from './progress.ts';

/** In the squero's yard by the quay, on the gravel between the gondola and the shed, facing the fondamenta. */
export const ISEPPO = { x: -191, z: 1.5, yaw: Math.PI, r: 0.35, name: 'Mastro Iseppo' } as const;

/** On San Giorgio, at the head of the approdo by his moored gondola, facing the berth (off the Piazzale's pull). */
export const ISEPPO_RIVA = { x: -442.5, z: 101.2, yaw: Math.atan2(-8.1, 1.2), r: 0.35, name: 'Mastro Iseppo' } as const;
/** The Fanalista, on the east quay of the darsena by its lighthouse, facing across the basin (out of the Nostromo's pack's pull). */
export const FANALISTA = { x: -563, z: 141, yaw: Math.PI / 2, r: 0.35, name: 'Il Fanalista' } as const;
/** Padre Archivista, in the Passaggio del Longhena off the passage's middle, facing the chiostro degli allori (out of its packs' pull). */
export const ARCHIVISTA = { x: -506.5, z: 63, yaw: Math.PI / 2, r: 0.35, name: 'Padre Archivista' } as const;
/** Paolo Veronese's ghost, in the antirefettorio's north-east corner, facing into it (out of the arch from the allori, out of reach of the lavabi and the Cenacolo's door). */
export const VERONESE = { x: -525, z: 43.2, yaw: Math.PI / 2, r: 0.35, name: 'Paolo Veronese' } as const;
/** The Cardinale benedettino, on the presbytery before the high altar, facing the crossing (2 m toward it from the altar: out of the choir's pull). */
export const CARDINALE = { x: -543, y: 0.6, z: 102, yaw: -Math.PI / 2, r: 0.35, name: 'Il Cardinale benedettino' } as const;

/** The mob kinds a quest counts or loots, by name (main.ts maps them to enemies/zitelle.ts and enemies/sangiorgio.ts kinds). */
export type Foe = 'gondoliere' | 'codega' | 'zitella' | 'gastaldo' | 'maestra' | 'monaco' | 'amanuense' | 'marinaio' | 'nostromo' | 'bibliotecario' | 'commissario' | 'campanaro';

export type SideId = 'ferri' | 'lumi' | 'gastaldo' | 'ditale' | 'maestra' | 'exvoto' | 'lettera' | 'marinai' | 'fari' | 'acqua' | 'musici' | 'tela' | 'schede' | 'rintocchi'; // their ids in QUESTS

/** Who gives side quests, where, and what he says around them. `level`: his quests end with that level's boss (`over`). */
export type Giver = 'iseppo' | 'riva' | 'fanalista' | 'archivista' | 'veronese' | 'cardinale';
export interface GiverSpec { at: { x: number; y?: number; z: number; yaw: number; r: number; name: string }; level: 2 | 3; where: string; greet: string; bye: string; decline: string; full: string }

/**
 * What a quest wants. collect: `n` of `item`, dropped by `from` at `chance` while it is wanted; kill: `n` of
 * `from` while it runs (`woken`: only the hidden pack the quest woke, enemies/sangiorgio.ts); token: `item` off the elite `from` (laid at its body once it is dead, main.ts);
 * find: `item` picked up at `at`; finds: each of `finds` picked up at its spot, in any order; letter: hand `item` in (the rare drop that starts it); use: `needs` burnt at `at`,
 * `gives` put in the bag (a step of a quest in steps: using it moves the quest on; `say`: its prompt and notice, else
 * "Accendi" the label).
 */
export type Want =
  | { kind: 'collect'; item: string; n: number; from: Foe; chance: number }
  | { kind: 'kill'; n: number; from: Foe; woken?: true }
  | { kind: 'token'; item: string; from: Foe }
  | { kind: 'find'; item: string; at: { x: number; y: number; z: number }; label: string }
  | { kind: 'finds'; finds: readonly Find[] }
  | { kind: 'letter'; item: string }
  | { kind: 'use'; at: { x: number; y: number; z: number }; label: string; needs?: { item: string; n: number }; gives?: { item: string; n: number }; say?: [string, string] };

/** One thing to pick up at a spot (a `finds` want). */
export interface Find { item: string; at: { x: number; y: number; z: number }; label: string }

export interface SideQuest {
  id: SideId;
  /** Iseppo in the squero when absent. */
  giver?: Giver;
  /** One want, or steps in order: each moves on once met, the last is handed in. */
  want: Want | readonly Want[];
  /** Opens once this one is handed in (the chain); none: from the first talk. */
  after?: SideId;
  /** The epic he gives, if any (its XP, gold and title are QUESTS', quest/progress.ts, paid through Quest.complete). */
  reward?: string;
  /** The Abate weakened once it is handed in (enemies/sangiorgio.ts PREPS). */
  prep?: string;
  /** The tracker's line; `n` is the progress so far, `step` the step under way. */
  line: (n: number, step: number) => string;
  offer: string[];
  busy: string;
  done: string[];
}

/** Where his thimble-quest and ex-voto quest send the hero: Marieta's bed by the dormitory's east wall, a chapel of the Redentore. */
export const DITALE = { x: -277.1, y: 0, z: -34.2 };
export const EXVOTO = { x: 10.6, y: CHURCH_FLOOR, z: -23.25 };

/** The darsena's two lighthouses, where the Fanalista's oil is burnt: at the foot of each tower (zones/sangiorgio.ts darsena). */
export const FARI = [{ x: -596, y: 0, z: 144.5 }, { x: -566, y: 0, z: 144.5 }] as const;
/** The step of I fari della darsena that wakes the basin's drowned and the Nostromo: both lamps lit. */
export const FARI_LIT = 3;

/** Acqua di San Benedetto: the well of the chiostro degli allori, the antirefettorio's two lavabi (zones/sangiorgio.ts). */
export const POZZO = { x: -530, y: 0.5, z: 62 };
export const LAVABI = [{ x: -535.2, y: 0.6, z: 40 }, { x: -524.8, y: 0.6, z: 40 }] as const;
/** The step of Acqua di San Benedetto that wakes the cellar's monks round the well: wine drawn. */
export const VINO = 1;

/**
 * I musici di Cana: the four instruments of the musicians in the Nozze's foreground (Veronese, Tiziano, Tintoretto, Bassano), each
 * by a pack: the viola in Longhena's library, the violin in the presbytery under Tintoretto's canvas, the violone among the monks'
 * stalls, the flute on the Teatro Verde's stage (zones/sangiorgio.ts).
 */
export const STRUMENTI: readonly Find[] = [
  { item: 'viola-gamba', at: { x: -491, y: LIB_F, z: 9.5 }, label: 'la viola da gamba' },
  { item: 'violino-tintoretto', at: { x: -547, y: 0.6, z: 108.6 }, label: 'il violino' },
  { item: 'violone-tiziano', at: { x: -564.5, y: 0.6, z: 106 }, label: 'il violone' },
  { item: 'flauto-bassano', at: { x: -574, y: 0.5, z: -36.5 }, label: 'il flauto' },
];
/** La tela tagliata: the rolled canvas, off the Commissario delle Arti; handed in, the Nozze hang in the Cenacolo's frame again (quest/view.ts). */
export const TELA = 'tela-arrotolata';
/** The step of Rintocchi muti that wakes the Campanaro in the bell chamber: the three clappers out. */
export const MUTE = 3;
/** Le schede del conclave: the voting slips of 1800 the amanuensi still copy, off them while it runs (they rise again for it, main.ts). */
export const SCHEDA = 'scheda-conclave';

/** Marieta's letter, off a zitella: each kill's chance starts at `base` and rises by `ramp`; sure once the Maestra's key is taken. */
export const LETTER_DROP = { base: 0.04, ramp: 0.02 } as const;

export const SIDE: readonly SideQuest[] = [
  {
    id: 'ferri',
    want: { kind: 'collect', item: 'ferro-iseppo', n: 6, from: 'gondoliere', chance: 0.5 },
    reward: 'zoccoli-voga',
    line: (n) => `Ferri di Mastro Iseppo dai gondolieri annegati: ${n}/6`,
    offer: [
      'Ehi, tu. Sì, tu che cammini e non galleggi. Mastro Iseppo, proto di questo squero. Quaranta gondole ho varato su questo scalo, e ognuna portava il mio ferro a prua: sei denti e una I incisa sotto il collo.',
      'I gondolieri annegati se li portano ancora addosso, i miei ferri, come medaglie. La gondola sui cavalletti è l\'ultima, ed è senza ferro. Portamene sei: uno buono lo troverò.',
    ],
    busy: 'Sei ferri, Risorto. I gondolieri li tengono stretti, ma l\'acqua ha mangiato le loro dita prima delle mie.',
    done: [
      'Fammi vedere... questo è del Toni, questo del Bepi. Questo l\'ho battuto la settimana del voto. Li conosco tutti, come figli.',
      'Tieni questi zoccoli: erano di un gondoliere che pagava a ferri invece che a ducati. Camminano sull\'acqua bassa meglio di te.',
    ],
  },
  {
    id: 'lumi',
    want: { kind: 'kill', n: 6, from: 'codega' },
    reward: 'collare-puntoaria',
    line: (n) => `Codeghe abbattute lungo la fondamenta: ${n}/6`,
    offer: [
      'Le vedi, quelle lanterne lungo la riva? Le codeghe. Una volta per due soldi ti accompagnavano a casa di notte. Adesso accompagnano i morti, ma dalla parte sbagliata: verso le Zitelle.',
      'Ogni anima che passa davanti al mio squero con una codega davanti finisce cucita nel velo. Spegni sei di quei lumi, Risorto. Che i morti si perdano pure: meglio persi che cuciti.',
    ],
    busy: 'Ne vedo ancora, di lumi, sulla fondamenta. Sei, ho detto. Le codeghe non si fanno pagare, ma tu fatti pagare da me.',
    done: [
      'La riva è più buia. Bene. Al buio un morto si siede e aspetta; con un lume davanti cammina, e cammina dove vuole lei.',
      'Questo colletto l\'ho tolto a una codega che bussava allo squero. Punto in aria delle Zitelle: tienilo tu, che hai il collo ancora caldo.',
    ],
  },
  {
    id: 'gastaldo', after: 'ferri',
    want: { kind: 'token', item: 'testa-gastaldo', from: 'gastaldo' },
    reward: 'cosciali-gastaldo',
    line: () => 'Porta la testa del Gastaldo dei gondolieri a Mastro Iseppo',
    offer: [
      'I ferri sono a posto, ma la gondola non va da nessuna parte finché lui comanda il traghetto. Il Gastaldo dei gondolieri. È là sotto il mio tezon, col remo in mano, come fosse suo.',
      'Fu lui a vendere i suoi uomini alla Governatrice: un annegato, un punto del velo, e la Pia Casa pagava. Io a quella gente facevo le gondole. Portami la sua testa, Risorto. La appendo al tezon, come si faceva una volta.',
    ],
    busy: 'Il Gastaldo è sotto il tezon. Attento al remo: quando lo fa girare, sta\' lontano, che non è voga da cristiani.',
    done: [
      'Eccolo qua, il Gastaldo. Da vivo non mi ha mai guardato negli occhi, da morto non può fare altro. La appendo al tezon: che la vedano tutti, i suoi annegati.',
      'Le sue gambiere: cuoio buono di Rialto, comprato coi soldi degli altri. Mettitele tu. Almeno una volta servono a qualcuno che rema per sé.',
    ],
  },
  {
    id: 'ditale', after: 'lumi',
    want: { kind: 'find', item: 'ditale-marieta', at: DITALE, label: 'il ditale di Marieta' },
    reward: 'fede-senza-dote',
    line: () => 'Cerca il ditale di Marieta sotto il suo letto, nel dormitorio delle Zitelle',
    offer: [
      'Ti dico perché sto qui, Risorto. Mia figlia, Marieta. Bella come sua madre, e povera come suo padre: la presero alle Zitelle a dodici anni, a imparare il merletto e a farsi una dote. Io lavoravo per il resto.',
      'Le portai un ditale d\'argento, la domenica prima del voto. Lo teneva sotto il materasso, nell\'ultimo letto del dormitorio, quello vicino alla finestra a levante. Portamelo. Voglio sapere se l\'ha tenuto.',
    ],
    busy: 'Il dormitorio è nell\'ala a levante dell\'ospizio. L\'ultimo letto, vicino al muro. Le zitelle dormono poco, Risorto: fa\' piano.',
    done: [
      'L\'ha tenuto. L\'ha tenuto... Guarda come è consumato: ha cucito fino all\'ultimo, la mia Marieta. Per la dote che io non ho fatto in tempo a finire.',
      'Questo anello era per il suo sposo. Non c\'è mai stato, uno sposo. Portalo tu, Risorto: meglio al dito di un morto che cammina che in fondo al mio grembiule.',
    ],
  },
  {
    id: 'maestra', after: 'gastaldo',
    want: { kind: 'token', item: 'forbici-maestra', from: 'maestra' },
    reward: 'guanti-maestra',
    line: () => 'Porta le forbici della Maestra del merletto a Mastro Iseppo',
    offer: [
      'La Maestra del merletto. Teneva le ragazze ai tavoli dall\'alba al vespro, e chi sbagliava un punto lo rifaceva al buio. Marieta aveva le dita piene di tagli. Quelle forbici le ha tagliate tutte, le sue figlie.',
      'Con quelle forbici si taglia anche il filo che tiene Marieta al velo. Va\' nella sala del merletto e prendile alla Maestra. Non te le darà per gentilezza.',
    ],
    busy: 'La sala del merletto è nell\'ala a ponente dell\'ospizio. Quando la Maestra stende il filo per terra, fa\' un passo di lato.',
    done: [
      'Forbici da merletto, fine come un ago. Le ho tenute in mano un momento e ho sentito il filo tirare, Risorto. Dall\'altra parte c\'è lei. C\'è Marieta.',
      'I guanti della Maestra. Non hanno mai smesso di contare. Ora conteranno per te.',
    ],
  },
  {
    id: 'exvoto', after: 'ditale',
    want: { kind: 'find', item: 'ex-voto', at: EXVOTO, label: 'l\'ex voto di Mastro Iseppo' },
    reward: 'rosario-spolette',
    line: () => 'Recupera l\'ex voto di Mastro Iseppo nella terza cappella a destra del Redentore',
    offer: [
      'Nel settantasette, quando il Palladio alzò il Redentore, ogni squero della Giudecca portò un ex voto. Il mio era una gondolina di pero, lunga così, con un ferro d\'argento a prua. La appesi nella terza cappella a destra.',
      'Una gondola non si vara senza benedizione, e la mia benedizione è là, nella chiesa che hai liberato. Torna al Redentore, Risorto. Riporta la gondolina al suo squero.',
    ],
    busy: 'Il Redentore è oltre il Ponte de la Croce, a ponente. Terza cappella a destra, entrando dal portone. La gondolina di pero.',
    done: [
      'È lei. Il pero si è fatto nero, ma il ferro brilla ancora. Quattro secoli appesa davanti a un santo, e io qui a bestemmiare sul legno. Adesso la gondola grande è benedetta.',
      'Questo rosario me lo diede Marieta, l\'ultima volta: spolette d\'osso al posto dei grani. Lei non lo vorrebbe al collo di un padre che non è venuto a prenderla. Al tuo sì.',
    ],
  },
  {
    id: 'lettera',
    want: { kind: 'letter', item: 'lettera-marieta' },
    reward: 'busto-broccato',
    line: () => 'Porta la lettera a Mastro Iseppo, nello squero',
    offer: [],
    busy: '',
    done: [
      'Una lettera? Con la ceralacca delle Zitelle... «Caro padre». È la sua mano, Risorto. La mano di Marieta. Non sapevo nemmeno che avesse imparato a scrivere.',
      '«Non venite a prendermi: la Governatrice dice che la dote non basta mai. Ma io conto i punti, e ogni sera ne cucio uno sbagliato, apposta, perché il velo non si finisca». Ha resistito, la mia ragazza. Quattrocento anni.',
      'Tieni questo busto di broccato: era il corredo della Pia Casa, la dote che non le hanno mai dato. Io ho la lettera. Mi basta.',
    ],
  },
  // San Giorgio (level 3).
  {
    id: 'marinai', giver: 'riva',
    want: { kind: 'kill', n: 10, from: 'marinaio' },
    reward: 'remo-marieta',
    line: (n) => `Marinai annegati abbattuti sull'isola: ${n}/10`,
    offer: [
      'La gondola ti ha portato, Risorto, e la gondola ti riporta. Ma vuota, eh: non piena. Li vedi, sulla riva? I marinai della Serenissima, annegati con la flotta. Si aggrappano ai remi di chi passa.',
      'Uno mi ha già preso il remo di poppa, stanotte: l\'ho tenuto per un pelo. Abbattine dieci, che io possa vogare in pace. Tanto si rialzano finché l\'Abate li chiama: dieci, e mi basta.',
    ],
    busy: 'Dieci marinai, Risorto. Stanno sulla riva, sul piazzale, lungo la fondamenta e giù alla darsena. Si rialzano, ma tu contali lo stesso.',
    done: [
      'Dieci. Senti che silenzio, sotto la gondola? Nessuna mano sul legno. Adesso posso aspettarti quanto vuoi.',
      'Prendi questo remo. Era il primo che ho fatto per Marieta, quando era piccola: le insegnavo a vogare in rio. Non l\'ha mai portato fuori dallo squero. Portalo tu.',
    ],
  },
  {
    id: 'fari', giver: 'fanalista',
    want: [
      { kind: 'collect', item: 'ampolla-faro', n: 5, from: 'marinaio', chance: 0.5 },
      { kind: 'use', at: FARI[0], label: 'il faro di ponente', needs: { item: 'ampolla-faro', n: 3 } },
      { kind: 'use', at: FARI[1], label: 'il faro di levante', needs: { item: 'ampolla-faro', n: 2 } },
      { kind: 'token', item: 'spegnimoccolo', from: 'nostromo' },
    ],
    reward: 'lanterna-faro',
    prep: 'faro',
    line: (n, step) => [`Ampolle d'olio dei fanali dai marinai annegati: ${n}/5`, 'Accendi il faro di ponente, alla bocca della darsena (3 ampolle)',
      'Accendi il faro di levante, alla bocca della darsena (2 ampolle)', 'Abbatti il Nostromo della darsena e porta il suo spegnimoccolo al Fanalista'][step],
    offer: [
      'Fermo lì, che ti vedo appena. Il Fanalista della darsena, ero: due fari alla bocca, dal tempo dei francesi. Ogni sera li accendevo, ogni mattina li spegnevo. Ora li spegne un altro, e non li riaccende.',
      'Senza luce la laguna prende chi vuole: barche, morti, l\'acqua alta dentro le chiese. Porta olio, Risorto: cinque ampolle, i marinai le hanno ancora alla cintura. Poi accendili tu, i miei fari.',
    ],
    busy: 'Olio e fuoco, Risorto. Tre ampolle al faro di ponente, due a quello di levante. E guarda il bacino, quando la seconda fiamma prende: chi li spegneva non sarà contento.',
    done: [
      'Il Nostromo. Lo sapevo. Con quel suo spegnimoccolo di ferro, ogni notte, prima uno e poi l\'altro. Voleva il buio per portare le barche sul fondo. Adesso la darsena ha di nuovo i suoi occhi.',
      'Prendi la lanterna piccola, quella che portavo in giro per le banchine. E ascolta: quando l\'Abate chiama l\'acqua alta, la luce dei fari arriva fin là. Ci sarà un\'isola asciutta in più, per te.',
    ],
  },
  {
    id: 'acqua', giver: 'archivista',
    want: [
      { kind: 'use', at: POZZO, label: 'il pozzo degli Allori', say: ['Attingi al pozzo degli Allori', 'Dal pozzo sale vino, non acqua. E qualcuno lo sta benedicendo...'] },
      { kind: 'kill', n: 3, from: 'monaco', woken: true },
      { kind: 'use', at: POZZO, label: 'il pozzo degli Allori', gives: { item: 'acqua-allori', n: 2 }, say: ['Attingi di nuovo al pozzo degli Allori', 'Due brocche d\'acqua chiara: il pozzo è tornato pozzo'] },
      { kind: 'use', at: LAVABI[0], label: 'il lavabo di ponente', needs: { item: 'acqua-allori', n: 1 }, say: ['Versa l\'acqua nel lavabo di ponente', 'Il lavabo di ponente ha di nuovo acqua'] },
      { kind: 'use', at: LAVABI[1], label: 'il lavabo di levante', needs: { item: 'acqua-allori', n: 1 }, say: ['Versa l\'acqua nel lavabo di levante', 'Il lavabo di levante ha di nuovo acqua'] },
    ],
    reward: 'ampolle-benedetto',
    prep: 'calice',
    line: (n, step) => ['Attingi al pozzo del chiostro degli Allori', `Abbatti i monaci della cantina, al pozzo degli Allori: ${n}/3`, 'Attingi di nuovo al pozzo degli Allori',
      'Versa l\'acqua nel lavabo di ponente dell\'Antirefettorio', 'Versa l\'acqua nel lavabo di levante dell\'Antirefettorio'][step],
    offer: [
      'Piano, piano, figliolo: qui si sussurra. Padre Archivista, di San Giorgio. Ho scritto ogni nome che è entrato in questo monastero per trecento anni, e ogni nome che ne è uscito. Il tuo non c\'è. Strano.',
      'Ora et labora, diceva il Padre Benedetto. Prima del refettorio ci si lavava le mani ai lavabi del Palladio, nell\'Antirefettorio. Ma il pozzo degli Allori dà vino, adesso: l\'Abate ha fatto come a Cana, e i suoi monaci lo benedicono ogni notte.',
      'Va\' al pozzo, attingi. Poi fa\' quello che serve, e riporta l\'acqua ai due lavabi, una brocca per lavabo. Un\'abbazia che non si lava le mani non è più un\'abbazia.',
    ],
    busy: 'Il pozzo è in mezzo al chiostro degli Allori, qui dietro. I lavabi sono nell\'Antirefettorio, uno per parte, davanti alla porta del Cenacolo.',
    done: [
      'Senti? L\'acqua nei lavabi. Trecento anni che non la sentivo. Scrivo anche questo, nel registro: «la notte del Risorto, i lavabi tornarono acqua».',
      'Prendi queste ampolle: tre, dall\'ultima acqua buona che avevo. Quando l\'Abate alza il Calice di Cana, il suo vino ci si stempera dentro. Brucerà meno, figliolo. Molto meno.',
    ],
  },
  {
    id: 'musici', giver: 'veronese',
    want: { kind: 'finds', finds: STRUMENTI },
    reward: 'mantello-caliari',
    line: (n) => `Strumenti di Cana: ${n}/4 (Biblioteca, Presbiterio, Coro, Teatro Verde)`,
    offer: [
      'Non spaventarti, ragazzo: sono solo un pittore. Paolo Caliari, da Verona. In Venezia mi chiamano il Veronese. Quella porta l\'ho varcata ogni mattina per quindici mesi, con i pennelli: là dentro ho dipinto le Nozze di Cana, sessanta metri quadri di tela.',
      'Ora la porta non mi vuole, e la cornice è vuota. I monaci sanno che le nozze non finiscono senza testimoni, e i testimoni erano miei: in primo piano, a suonare, ho messo me stesso con la viola, Tiziano al violone, il Tintoretto al violino, il Bassano al flauto.',
      'Gli strumenti sono scappati dal quadro quando l\'hanno tagliato, e i morti dell\'Abate li tengono come reliquie. La viola in Biblioteca, il violino nel Presbiterio, il violone nel Coro dei monaci, il flauto sul palco del Teatro Verde. Riportameli, tutti e quattro.',
    ],
    busy: 'Quattro strumenti, ragazzo: viola, violino, violone, flauto. Senza musica, una festa di nozze è solo gente seduta che mangia. E sulla tavola c\'è una clessidra: il tempo corre.',
    done: [
      'La viola! L\'ho accordata io, nel sessantadue. E il violone di Tiziano, che pesava più di lui. Senti? Suonano da soli, appena si toccano. Le nozze hanno di nuovo la loro musica.',
      'Prendi questo mantello: è il mio, quello che porto nel quadro, bianco e oro. Ma la musica non basta, ragazzo. Manca la tela.',
    ],
  },
  {
    id: 'tela', giver: 'veronese', after: 'musici',
    want: { kind: 'token', item: TELA, from: 'commissario' },
    reward: 'sciabola-commissario',
    line: () => 'Sconfiggi il Commissario delle Arti nel chiostro dei cipressi e riporta la tela al Veronese',
    offer: [
      'L\'undici settembre del novantasette vennero i commissari della Repubblica francese, con un inventario e un paio di forbici da sarto. Tagliarono le Nozze dalla cornice, le arrotolarono come un tappeto, le caricarono su una nave per Parigi.',
      'Uno di loro non è mai partito. Il Commissario delle Arti: il convento diventò caserma, e lui è rimasto con la tela sotto il braccio, a contare quadri che non ci sono più. Ora sta nel chiostro dei cipressi, dove dormivano le truppe.',
      'Riportami la tela, ragazzo. Attento alla sciabola: taglia in lungo, come ha tagliato me. E segna il pavimento come segnava i quadri, con il gesso rosso. Quando lo metti alle strette chiama i suoi granatieri.',
    ],
    busy: 'Il chiostro dei cipressi, dietro il passaggio del Longhena. Il Commissario ha la tela, e la tela ha le mie nozze. Senza di lei la porta del Cenacolo non si apre.',
    done: [
      'È lei. Arrotolata male, con il colore all\'infuori, come un sacco di grano... Ma è lei. Il Cristo, la sposa, i servi con le giare, il mio cane. Vieni, la riappendiamo.',
      'Ecco: la cornice ha di nuovo le sue nozze, e le nozze i loro testimoni. La porta del Cenacolo ora ti lascerà passare. Tieni la sua sciabola: ha tagliato abbastanza tele, che tagli qualcos\'altro.',
    ],
  },
  {
    id: 'rintocchi', giver: 'archivista', after: 'acqua',
    want: [
      ...BELLS.map((b): Want => ({ kind: 'use', at: b.at, label: b.label, say: [`Togli il batacchio ${b.of}`, `Hai tolto il batacchio ${b.of}: tace`] })),
      { kind: 'kill', n: 1, from: 'campanaro', woken: true },
    ],
    reward: 'batacchio-sangiorgio',
    prep: 'rintocchi',
    line: (_n, step) => [...BELLS.map((b) => `Sali sul campanile e togli il batacchio ${b.of}`), 'Abbatti il Campanaro di San Giorgio nella cella campanaria'][step],
    offer: [
      'Figliolo. Ho scritto un\'altra riga, nel registro, e non mi piace: «le campane suonano da sole». Ogni notte, alle tre, quando l\'Abate chiama la marea. Nessuno sale più sul campanile dal settantaquattro, quando crollò.',
      'Lo rifece il Buratti, nel novantuno, con l\'angelo in cima. Nel milleottocento le campane suonarono per il papa nuovo, e il campanaro tirò le corde finché le mani gli sanguinarono. Non è più sceso.',
      'Sali, figliolo. La porta è alla base, verso il campo. Lassù ci sono tre campane: togli i batacchi, tutti e tre. Una campana senza lingua non chiama nessuno, nemmeno il mare.',
    ],
    busy: 'Tre batacchi, figliolo: la maggiore, la mezzana, la piccola. E se il campanaro sale a riprenderseli, ricordati che lassù non c\'è dove scappare.',
    done: [
      'Il batacchio della maggiore. Pesa come un peccato. Stanotte alle tre ho sentito il silenzio, figliolo: per la prima volta in duecento anni il registro non ha niente da scrivere.',
      'Tienilo tu. Quando l\'Abate fa suonare le sue campane, una lingua gli mancherà: due rintocchi, non tre. E dalla cella si vede tutta la laguna, vero? Io non ci sono mai salito.',
    ],
  },
  // The Cardinale's conclave, the first of three (the tiara, then the coronation, follow it with `after`).
  {
    id: 'schede', giver: 'cardinale',
    want: { kind: 'collect', item: SCHEDA, n: 8, from: 'amanuense', chance: 0.5 },
    line: (n) => `Schede del conclave dagli amanuensi: ${n}/8`,
    offer: [
      'Pace a te, figlio. Non inginocchiarti, non sono ancora nessuno. Barnaba Chiaramonti, monaco di San Benedetto, cardinale di Imola. Il primo dicembre del novantanove ci chiusero qui dentro, trentaquattro cardinali, a eleggere un papa.',
      'Pio VI era morto in esilio, Roma era dei francesi, e l\'Austria ci prestò quest\'isola. Centoquattro giorni di schede, di fumo, di freddo. Le ricopiavano gli amanuensi del monastero, una per una, per l\'archivio.',
      'Le ricopiano ancora, figlio. Da due secoli. Il conclave non si chiude finché le schede non sono contate, e loro non smettono di scrivere. Portamene otto: le conterò io, e forse potranno posare la penna.',
    ],
    busy: 'Otto schede, figlio. Gli amanuensi le tengono nelle maniche: in Biblioteca, nel Coro, nei chiostri. Si rialzano a scrivere finché il conclave è aperto.',
    done: [
      'Chiaramonti. Chiaramonti. Chiaramonti... Le ho contate otto volte, come allora. Il quattordici marzo del milleottocento mi chiamarono per nome, e io dissi: accetto. Pio VII.',
      'Prendi questo, per la fatica. Ma un papa senza tiara non si incorona, figlio: Napoleone si è portato via quella vera. Torna da me, quando avrai tempo.',
    ],
  },
];
export const SIDE_BY = new Map(SIDE.map((q) => [q.id, q]));

/** His goodbye once every quest is handed in. */
export const ISEPPO_DONE = 'La gondola è pronta: ferro, benedizione e tutto. Quando il filo si spezza, Risorto, io vado a prendere la mia ragazza. Vuoi qualcosa dalla bottega, intanto?';
export const ISEPPO_DECLINE = 'Come vuoi. Il legno aspetta, l\'ho sempre detto: è l\'uomo che ha fretta.';
/** Said when the bag has no room for his reward. */
export const ISEPPO_FULL = 'Hai la borsa piena come una peata a Rialto. Fa\' spazio, Risorto, e torna: il mio regalo non lo lascio per terra.';

/** The givers, by the `talk` of their prompt (quest/progress.ts). */
export const GIVERS: Record<Giver, GiverSpec> = {
  iseppo: { at: ISEPPO, level: 2, where: 'nello squero', greet: 'Mastro Iseppo, proto dello squero. Parla, Risorto: il legno ascolta.', bye: ISEPPO_DONE, decline: ISEPPO_DECLINE, full: ISEPPO_FULL },
  riva: { at: ISEPPO_RIVA, level: 3, where: "sull'approdo di San Giorgio", greet: 'Sono qui, Risorto, con la gondola. Il ferro sa la strada, ma il proto la guarda lo stesso.',
    bye: 'La gondola aspetta. Quando l\'Abate è giù, ti porto a casa: dritto dal frate.',
    decline: 'Va bene. Io resto a poppa, e tengo il remo stretto.',
    full: 'Hai la borsa piena, Risorto. Fa\' spazio e torna: qui non scappa niente, nemmeno io.' },
  fanalista: { at: FANALISTA, level: 3, where: 'alla darsena', greet: 'Il Fanalista, Risorto. Parla piano: al buio le voci vanno lontano.',
    bye: 'I fari sono accesi. Finché bruciano, la darsena sa dov\'è il Bacino. Va\', Risorto.',
    decline: 'Allora resta al buio anche tu. Io aspetto: i fanalisti sono abituati.',
    full: 'La borsa è piena, Risorto. Fa\' spazio: la lanterna non te la appoggio per terra, nell\'umido.' },
  archivista: { at: ARCHIVISTA, level: 3, where: 'nel Passaggio del Longhena', greet: 'Figliolo. Parla piano: i nomi dormono, qui intorno.',
    bye: 'I lavabi hanno acqua, le campane tacciono, e il registro ha due righe in più. Va\', figliolo: l\'Abate ti aspetta, e io scrivo.',
    decline: 'Come vuoi. Annoto anche questo: «ripassò più tardi».',
    full: 'Hai la borsa piena, figliolo. Fa\' spazio e torna: quello che ho per te non si appoggia per terra.' },
  veronese: { at: VERONESE, level: 3, where: "nell'Antirefettorio", greet: 'Ragazzo. Guarda quella porta: dietro c\'è il mio quadro più grande, e non posso entrare.',
    bye: 'Le nozze sono di nuovo al loro posto. Va\', ragazzo: io resto a guardarle. Un pittore non si stanca mai del suo quadro.',
    decline: 'Va bene. Io aspetto qui. Sono quattrocento anni che aspetto davanti a questa porta.',
    full: 'Hai la borsa piena, ragazzo. Fa\' spazio e torna: questo non si appoggia per terra.' },
  cardinale: { at: CARDINALE, level: 3, where: "davanti all'altar maggiore", greet: 'Figlio. Parla piano: il conclave è ancora riunito.',
    bye: 'Le schede sono contate. Va\' in pace, figlio: io resto davanti all\'altare, ad aspettare la mia tiara.',
    decline: 'Va bene. Abbiamo aspettato centoquattro giorni, allora: possiamo aspettare ancora.',
    full: 'Hai la borsa piena, figlio. Fa\' spazio e torna.' },
};
export const giverOf = (q: SideQuest): Giver => q.giver ?? 'iseppo';
/** A quest's steps, one for a single want. */
export const stepsOf = (q: SideQuest): readonly Want[] => (Array.isArray(q.want) ? q.want : [q.want as Want]);

/** Saved form: the quests taken (and not yet handed in), the ones handed in, kill counts by quest, the step each quest in steps is on. */
export interface SideState { taken: string[]; done: string[]; kills?: Record<string, number>; steps?: Record<string, number> }

/** What happens when the hero talks to a giver: the window's lines, what Accetta does, and the reward handed out as it opens. */
export interface SideTalk { talk: Talk; accept?: () => void; paid?: SideQuest }

const REACH = 2.6;

export class SideQuests {
  taken: SideId[] = []; // in order of taking
  done: SideId[] = [];
  kills: Partial<Record<SideId, number>> = {};
  steps: Partial<Record<SideId, number>> = {}; // the step under way of a quest in steps (absent: the first)
  private letterKills = 0; // zitelle rolled for the letter (not saved: a load starts the ramp over)
  /** The bag the quest items go in and out of (main.ts, the checks). */
  bag?: Bag;
  /** Its giver's level is over (its boss dead), so no more of its dead rise to be counted: set by Quest. */
  over: (q: SideQuest) => boolean = () => false;

  active(id: SideId): boolean {
    return this.taken.includes(id);
  }

  /** The step under way, and its want. */
  step(q: SideQuest): number {
    return this.steps[q.id] ?? 0;
  }
  want(q: SideQuest): Want {
    const s = stepsOf(q);
    return s[Math.min(this.step(q), s.length - 1)];
  }

  /** Done, or taken and at `step` or past it (a quest in steps: what it has set off, main.ts). */
  reached(id: SideId, step: number): boolean {
    return this.done.includes(id) || (this.active(id) && this.step(SIDE_BY.get(id)!) >= step);
  }

  /** `w` is met (a use-point never is: using it moves the quest on). */
  private met(q: SideQuest, w: Want): boolean {
    if (w.kind === 'kill') return (this.kills[q.id] ?? 0) >= w.n;
    if (w.kind === 'collect') return this.have(w.item) >= w.n;
    if (w.kind === 'finds') return w.finds.every((f) => this.have(f.item) > 0);
    return w.kind !== 'use' && this.have(w.item) > 0;
  }

  /** Taken and its last step met: ready to hand in. `over`: its level's boss is dead, so it is ready whatever is left. */
  ready(q: SideQuest, over = this.over(q)): boolean {
    if (!this.active(q.id)) return false;
    const n = stepsOf(q).length;
    return over || this.step(q) >= n || (this.step(q) === n - 1 && this.met(q, this.want(q))); // past a last use-point, or the last want met
  }

  /** Progress for the tracker line. */
  progress(q: SideQuest): number {
    const w = this.want(q);
    return w.kind === 'kill' ? Math.min(w.n, this.kills[q.id] ?? 0) : w.kind === 'collect' ? Math.min(w.n, this.have(w.item)) : w.kind === 'finds' ? w.finds.filter((f) => this.have(f.item) > 0).length : 0;
  }

  /** The tracker's line for a quest running. */
  line(q: SideQuest): string {
    return q.line(this.progress(q), this.step(q));
  }

  /** Quests `giver` would offer now: in the chain, not yet taken or done. */
  open(giver: Giver = 'iseppo'): SideQuest[] {
    return SIDE.filter((q) => giverOf(q) === giver && !stepsOf(q).some((w) => w.kind === 'letter') && !this.taken.includes(q.id) && !this.done.includes(q.id) && (!q.after || this.done.includes(q.after)));
  }

  /** A quest of `giver`'s is ready to hand in: his "?" is up (Quest.marks). */
  handInReady(giver: Giver = 'iseppo', over?: boolean): boolean {
    return SIDE.some((q) => giverOf(q) === giver && this.ready(q, over ?? this.over(q)));
  }

  /** A quest handed in: its XP, gold and banner (Quest.complete, set by Quest). */
  complete: (id: QuestId) => boolean = () => false;

  private have(item: string): number {
    return this.bag?.count(item) ?? 0;
  }

  /** The quests taken, with their want under way (none once past the last). */
  private running(): { q: SideQuest; w: Want }[] {
    return SIDE.flatMap((q) => (this.active(q.id) && this.step(q) < stepsOf(q).length ? [{ q, w: this.want(q) }] : []));
  }

  /** A mob of `foe` died (`woke`: the quest whose hidden pack it was in): the kill quests running count it. */
  killed(foe: Foe, woke?: SideId): void {
    for (const { q, w } of this.running()) if (w.kind === 'kill' && w.from === foe && (!w.woken || woke === q.id)) this.kills[q.id] = (this.kills[q.id] ?? 0) + 1;
  }

  /**
   * A death of `foe` that drops loot: the quest item to throw out with it, if any. `ground` counts one id lying
   * loose; `key2`: the Maestra's key is taken (the letter is sure by then).
   */
  loot(foe: Foe, ground: (id: string) => number, key2: boolean, rnd: () => number = Math.random): string | undefined {
    for (const { w } of this.running()) {
      if (w.kind === 'collect' && w.from === foe && this.have(w.item) + ground(w.item) < w.n && rnd() < w.chance) return w.item;
    }
    const letter = SIDE_BY.get('lettera')!.want as { item: string };
    if (foe === 'zitella' && !this.active('lettera') && !this.done.includes('lettera') && !this.have(letter.item) && !ground(letter.item)
      && (key2 || rnd() < LETTER_DROP.base + LETTER_DROP.ramp * this.letterKills++)) return letter.item;
    return undefined;
  }

  /**
   * Per frame (main.ts): the letter picked up starts its quest, and a quest in steps whose step is met moves on (its
   * items stay in the bag: the next step may burn them). Returns the quest started, if any.
   */
  update(): SideQuest | undefined {
    for (const { q, w } of this.running()) if (this.step(q) < stepsOf(q).length - 1 && this.met(q, w)) this.steps[q.id] = this.step(q) + 1;
    const q = SIDE_BY.get('lettera')!;
    if (this.active(q.id) || this.done.includes(q.id) || !this.have((q.want as { item: string }).item)) return undefined;
    this.taken.push(q.id);
    return q;
  }

  /** The elites whose token a running quest still wants and isn't in the bag: main.ts lays it at their body once dead. */
  tokens(): { item: string; from: Foe }[] {
    return this.running().flatMap(({ w }) => (w.kind === 'token' && !this.have(w.item) ? [{ item: w.item, from: w.from }] : []));
  }

  /** Find spots still to search and use-points still to use (quest/view.ts glints them, main.ts pins them); `find`: what lies there. */
  spots(): { q: SideQuest; at: { x: number; y: number; z: number }; find?: Find }[] {
    return this.running().flatMap(({ q, w }) => (w.kind === 'finds' ? w.finds.filter((f) => !this.have(f.item)).map((f) => ({ q, at: f.at, find: f }))
      : (w.kind === 'find' && !this.have(w.item)) || w.kind === 'use' ? [{ q, at: w.at }] : []));
  }

  /** "Raccogli ..." at a find spot, "Accendi ..." at a use-point, under the hero's feet `p`. */
  prompt(p: { x: number; y: number; z: number }): { text: string; act?: () => string } | undefined {
    for (const { q, at, find } of this.spots()) {
      if (Math.hypot(p.x - at.x, p.z - at.z) > REACH || Math.abs(p.y - at.y) > 1.5) continue;
      const w = this.want(q);
      if (w.kind === 'use') {
        const [text, did] = w.say ?? [`Accendi ${w.label}`, `Hai acceso ${w.label}`], need = w.needs, give = w.gives;
        if (need && this.have(need.item) < need.n) return { text: `Per ${w.label} servono ${need.n} × ${ITEM.get(need.item)?.name ?? need.item}` };
        return { text, act: () => {
          if (give && !this.bag?.add(give.item, give.n)) return 'La borsa è piena';
          if (need) this.bag!.remove(need.item, need.n);
          this.steps[q.id] = this.step(q) + 1;
          return did;
        } };
      }
      const f = find ?? (w as Find);
      return { text: `Raccogli ${f.label}`, act: () => (this.bag?.add(f.item) ? `Hai trovato ${f.label}` : 'La borsa è piena') };
    }
    return undefined;
  }

  /**
   * Talking to `giver`: hand in the first quest of his ready (paid at once: its items out, the reward in), else offer
   * the next in the chain, else the line of one running, else his goodbye.
   */
  talk(giver: Giver = 'iseppo'): SideTalk {
    const g = GIVERS[giver], mine = SIDE.filter((q) => giverOf(q) === giver);
    const ready = mine.find((q) => this.ready(q));
    if (ready) {
      if (!this.handIn(ready)) return { talk: { pages: [g.full] } };
      return { talk: { pages: ready.done }, paid: ready };
    }
    const next = this.open(giver)[0];
    if (next) return { talk: { pages: next.offer, offer: true, title: QUESTS[next.id].title, decline: g.decline }, accept: () => { if (!this.taken.includes(next.id)) this.taken.push(next.id); } };
    const busy = mine.find((q) => this.active(q.id) && q.busy);
    return { talk: { pages: [busy ? busy.busy : g.bye] } };
  }

  /** Its items out of the bag (every step's), the reward in; false (nothing changed) when the bag has no room for the reward. */
  handIn(q: SideQuest): boolean {
    const bag = this.bag;
    if (!bag) return false;
    const items = [...new Set(stepsOf(q).flatMap((w) => (w.kind === 'kill' ? [] : w.kind === 'use' ? [w.needs?.item, w.gives?.item].filter((i) => i !== undefined) : w.kind === 'finds' ? w.finds.map((f) => f.item) : [w.item])))].map((id) => [id, this.have(id)] as const);
    for (const [id, n] of items) if (n) bag.remove(id, n);
    if (q.reward && !bag.add(q.reward)) { for (const [id, n] of items) if (n) bag.add(id, n); return false; }
    this.taken.splice(this.taken.indexOf(q.id), 1);
    this.done.push(q.id);
    delete this.kills[q.id];
    delete this.steps[q.id];
    this.complete(q.id);
    return true;
  }

  /** One past the last step a quest can be on: past its last use-point, else on its last want. */
  private ends(q: SideQuest): number {
    const s = stepsOf(q);
    return s.length + (s[s.length - 1].kind === 'use' ? 1 : 0);
  }

  encode(): SideState {
    return { taken: [...this.taken], done: [...this.done], kills: { ...this.kills }, steps: { ...this.steps } };
  }

  /** Lay a saved state over a fresh one; ids from another build are dropped, and steps past a quest's last (one past a last use-point is kept: ready). */
  decode(s: SideState): void {
    const known = (id: string): id is SideId => SIDE_BY.has(id as SideId);
    this.done = s.done.filter(known);
    this.taken = s.taken.filter(known).filter((id) => !this.done.includes(id));
    this.kills = Object.fromEntries(Object.entries(s.kills ?? {}).filter(([id, n]) => this.taken.includes(id as SideId) && Number.isFinite(n) && n > 0));
    this.steps = Object.fromEntries(Object.entries(s.steps ?? {}).filter(([id, n]) => this.taken.includes(id as SideId) && Number.isInteger(n) && n > 0 && n < this.ends(SIDE_BY.get(id as SideId)!)));
  }
}
