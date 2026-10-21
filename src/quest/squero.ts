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
import type { Bag } from '../loot/bag.ts';
import { CHURCH_FLOOR } from '../level/plan.ts';
import type { Talk } from './dialogue.ts';
import { QUESTS, type QuestId } from './progress.ts';

/** In the squero's yard by the quay, on the gravel between the gondola and the shed, facing the fondamenta. */
export const ISEPPO = { x: -191, z: 1.5, yaw: Math.PI, r: 0.35, name: 'Mastro Iseppo' } as const;

/** The level-2 mob kinds a quest counts or loots, by name (main.ts maps them to enemies/zitelle.ts kinds). */
export type Foe = 'gondoliere' | 'codega' | 'zitella' | 'gastaldo' | 'maestra';

export type SideId = 'ferri' | 'lumi' | 'gastaldo' | 'ditale' | 'maestra' | 'exvoto' | 'lettera'; // their ids in QUESTS

/**
 * What a quest wants. collect: `n` of `item`, dropped by `from` at `chance` while it is wanted; kill: `n` of
 * `from` while it runs; token: `item` off the elite `from` (laid at its body once it is dead, main.ts);
 * find: `item` picked up at `at`; letter: hand `item` in (the rare drop that starts it).
 */
export type Want =
  | { kind: 'collect'; item: string; n: number; from: Foe; chance: number }
  | { kind: 'kill'; n: number; from: Foe }
  | { kind: 'token'; item: string; from: Foe }
  | { kind: 'find'; item: string; at: { x: number; y: number; z: number }; label: string }
  | { kind: 'letter'; item: string };

export interface SideQuest {
  id: SideId;
  want: Want;
  /** Opens once this one is handed in (the chain); none: from the first talk. */
  after?: SideId;
  /** The epic he gives (its XP, gold and title are QUESTS', quest/progress.ts, paid through Quest.complete). */
  reward: string;
  /** The tracker's line; `n` is the progress so far. */
  line: (n: number) => string;
  offer: string[];
  busy: string;
  done: string[];
}

/** Where his thimble-quest and ex-voto quest send the hero: Marieta's bed by the dormitory's east wall, a chapel of the Redentore. */
export const DITALE = { x: -277.1, y: 0, z: -34.2 };
export const EXVOTO = { x: 10.6, y: CHURCH_FLOOR, z: -23.25 };

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
];
export const SIDE_BY = new Map(SIDE.map((q) => [q.id, q]));

/** His goodbye once every quest is handed in. */
export const ISEPPO_DONE = 'La gondola è pronta: ferro, benedizione e tutto. Quando il filo si spezza, Risorto, io vado a prendere la mia ragazza. Vuoi qualcosa dalla bottega, intanto?';
export const ISEPPO_DECLINE = 'Come vuoi. Il legno aspetta, l\'ho sempre detto: è l\'uomo che ha fretta.';
/** Said when the bag has no room for his reward. */
export const ISEPPO_FULL = 'Hai la borsa piena come una peata a Rialto. Fa\' spazio, Risorto, e torna: il mio regalo non lo lascio per terra.';

/** Saved form: the quests taken (and not yet handed in), the ones handed in, kill counts by quest. */
export interface SideState { taken: string[]; done: string[]; kills?: Record<string, number> }

/** What happens when the hero talks to him: the window's lines, what Accetta does, and the reward handed out as it opens. */
export interface SideTalk { talk: Talk; accept?: () => void; paid?: SideQuest }

const REACH = 2.6;

export class SideQuests {
  taken: SideId[] = []; // in order of taking
  done: SideId[] = [];
  kills: Partial<Record<SideId, number>> = {};
  private letterKills = 0; // zitelle rolled for the letter (not saved: a load starts the ramp over)
  /** The bag the quest items go in and out of (main.ts, the checks). */
  bag?: Bag;

  active(id: SideId): boolean {
    return this.taken.includes(id);
  }

  /** Taken and its want met: ready to hand in. `over`: the Governatrice is dead, so no more drowned rise to be counted. */
  ready(q: SideQuest, over = false): boolean {
    if (!this.active(q.id)) return false;
    const w = q.want;
    if (w.kind === 'kill') return over || (this.kills[q.id] ?? 0) >= w.n;
    if (w.kind === 'collect') return over || this.have(w.item) >= w.n;
    return this.have(w.item) > 0;
  }

  /** Progress for the tracker line. */
  progress(q: SideQuest): number {
    const w = q.want;
    return w.kind === 'kill' ? Math.min(w.n, this.kills[q.id] ?? 0) : w.kind === 'collect' ? Math.min(w.n, this.have(w.item)) : 0;
  }

  /** Quests he would offer now: in the chain, not yet taken or done. */
  open(): SideQuest[] {
    return SIDE.filter((q) => q.want.kind !== 'letter' && !this.taken.includes(q.id) && !this.done.includes(q.id) && (!q.after || this.done.includes(q.after)));
  }

  /** A quest of his is ready to hand in: his "?" is up (Quest.marks). */
  handInReady(over = false): boolean {
    return SIDE.some((q) => this.ready(q, over));
  }

  /** A quest handed in: its XP, gold and banner (Quest.complete, set by Quest). */
  complete: (id: QuestId) => boolean = () => false;

  private have(item: string): number {
    return this.bag?.count(item) ?? 0;
  }

  /** A level-2 mob of `foe` died: the kill quests running count it. */
  killed(foe: Foe): void {
    for (const q of SIDE) if (q.want.kind === 'kill' && q.want.from === foe && this.active(q.id)) this.kills[q.id] = (this.kills[q.id] ?? 0) + 1;
  }

  /**
   * A death of `foe` that drops loot: the quest item to throw out with it, if any. `ground` counts one id lying
   * loose; `key2`: the Maestra's key is taken (the letter is sure by then).
   */
  loot(foe: Foe, ground: (id: string) => number, key2: boolean, rnd: () => number = Math.random): string | undefined {
    for (const q of SIDE) {
      const w = q.want;
      if (w.kind === 'collect' && w.from === foe && this.active(q.id) && this.have(w.item) + ground(w.item) < w.n && rnd() < w.chance) return w.item;
    }
    const letter = SIDE_BY.get('lettera')!.want as { item: string };
    if (foe === 'zitella' && !this.active('lettera') && !this.done.includes('lettera') && !this.have(letter.item) && !ground(letter.item)
      && (key2 || rnd() < LETTER_DROP.base + LETTER_DROP.ramp * this.letterKills++)) return letter.item;
    return undefined;
  }

  /** Per frame (main.ts): the letter picked up starts its quest. Returns the quest started, if any. */
  update(): SideQuest | undefined {
    const q = SIDE_BY.get('lettera')!;
    if (this.active(q.id) || this.done.includes(q.id) || !this.have((q.want as { item: string }).item)) return undefined;
    this.taken.push(q.id);
    return q;
  }

  /** The elites whose token a running quest still wants and isn't in the bag: main.ts lays it at their body once dead. */
  tokens(): { item: string; from: Foe }[] {
    return SIDE.flatMap((q) => (q.want.kind === 'token' && this.active(q.id) && !this.have(q.want.item) ? [{ item: q.want.item, from: q.want.from }] : []));
  }

  /** Find spots still to search (quest/view.ts glints them, main.ts pins them). */
  spots(): { q: SideQuest; at: { x: number; y: number; z: number } }[] {
    return SIDE.flatMap((q) => (q.want.kind === 'find' && this.active(q.id) && !this.have(q.want.item) ? [{ q, at: q.want.at }] : []));
  }

  /** "Raccogli ..." at a find spot under the hero's feet `p`. */
  prompt(p: { x: number; y: number; z: number }): { text: string; act: () => string } | undefined {
    for (const { q, at } of this.spots()) {
      if (Math.hypot(p.x - at.x, p.z - at.z) > REACH || Math.abs(p.y - at.y) > 1.5) continue;
      const w = q.want as { item: string; label: string };
      return { text: `Raccogli ${w.label}`, act: () => (this.bag?.add(w.item) ? `Hai trovato ${w.label}` : 'La borsa è piena') };
    }
    return undefined;
  }

  /**
   * Talking to him: hand in the first quest ready (paid at once: its items out, the reward in), else offer the
   * next in the chain, else the line of one running, else his goodbye. `over`: the Governatrice is dead.
   */
  talk(over = false): SideTalk {
    const ready = SIDE.find((q) => this.ready(q, over));
    if (ready) {
      if (!this.handIn(ready)) return { talk: { pages: [ISEPPO_FULL] } };
      return { talk: { pages: ready.done }, paid: ready };
    }
    const next = this.open()[0];
    if (next) return { talk: { pages: next.offer, offer: true, title: QUESTS[next.id].title, decline: ISEPPO_DECLINE }, accept: () => { if (!this.taken.includes(next.id)) this.taken.push(next.id); } };
    const busy = SIDE.find((q) => this.active(q.id) && q.busy);
    return { talk: { pages: [busy ? busy.busy : ISEPPO_DONE] } };
  }

  /** Its items out of the bag, the reward in; false (nothing changed) when the bag has no room for the reward. */
  handIn(q: SideQuest): boolean {
    const bag = this.bag, w = q.want;
    if (!bag) return false;
    const item = w.kind === 'kill' ? undefined : w.item, n = item ? Math.min(this.have(item), w.kind === 'collect' ? w.n : 1) : 0;
    if (item) bag.remove(item, n);
    if (!bag.add(q.reward)) { if (item) bag.add(item, n); return false; }
    this.taken.splice(this.taken.indexOf(q.id), 1);
    this.done.push(q.id);
    delete this.kills[q.id];
    this.complete(q.id);
    return true;
  }

  encode(): SideState {
    return { taken: [...this.taken], done: [...this.done], kills: { ...this.kills } };
  }

  /** Lay a saved state over a fresh one; ids from another build are dropped. */
  decode(s: SideState): void {
    const known = (id: string): id is SideId => SIDE_BY.has(id as SideId);
    this.done = s.done.filter(known);
    this.taken = s.taken.filter(known).filter((id) => !this.done.includes(id));
    this.kills = Object.fromEntries(Object.entries(s.kills ?? {}).filter(([id, n]) => this.taken.includes(id as SideId) && Number.isFinite(n) && n > 0));
  }
}
