// The dungeon's progression, as plain state over the collision World (no three.js, so
// `npm run check` walks it in Node). The church is shut at the start: Fra' Zuane, the porter's
// ghost on the fondamenta, gives the quest; the player takes the public route fondamenta ->
// calle -> convent corridor -> orto, finds the key in a chest at the end of the pontile on the
// lagoon (sealed until the quest is accepted), unlocks the grates of the chiostro grande, opens
// the choir door into the church and kills the Reverendissimo; then the main portone swings open
// onto the fondamenta and the player walks out. quest/view.ts draws the gates, the chest and the
// prompts, quest/npc.ts the porter, quest/dialogue.ts what he says.
//
// Level 2 (La dote delle Zitelle): back on the fondamenta the hero reports to Fra' Zuane (XP and gold),
// who offers the second quest; the chains across the Ponte de la Croce fall, the hero walks east (-X) to the
// Zitelle, takes the key of the church off the Maestra del merletto in the ospizio's lace hall, opens the
// church's back door from the court and kills the Governatrice under the dome; her portone opens on the
// sagrato, and Fra' Zuane hears it done.
//
// Level 3 (Le nozze di San Giorgio): Fra' Zuane's third quest drops the chain past the Tre Oci; the hero walks the
// Fondamenta San Giovanni to the Punta della Giudecca, where Mastro Iseppo's gondola rows itself across to San Giorgio
// Maggiore (quest/ferry.ts); takes the key of the Cenacolo off the Bibliotecario in Longhena's library and, for the ghost of
// Paolo Veronese, brings the musicians' instruments and the Nozze di Cana's canvas back (quest/squero.ts `musici`, `tela`:
// the wedding wants its witnesses, and the door opens on nothing less), opens the refectory from the antirefettorio and kills the Abate under the empty frame of the Nozze di Cana; the refectory's
// garden door opens, and the gondola rows the hero home to Fra' Zuane.
import type { Box, World } from '../core/physics.ts';
import type { Tune } from '../player/levels.ts';
import { CHURCH_FLOOR as F, SPAWN } from '../level/plan.ts';
import { ZCX, ZF } from '../level/zones/zitelle.ts';
import { GIVERS, SIDE, SideQuests, giverOf, type Giver } from './squero.ts';
import { BELFRY, CAMPANILE, CENACOLO, LANDING, PIER } from '../level/zones/sangiorgio.ts';

export type Need = 'key' | 'boss' | 'quest2' | 'key2' | 'boss2' | 'quest3' | 'key3' | 'boss3';

/** Where the quests stand, in order; derived from the flags, never stored. */
export type Stage = 'talk' | 'key' | 'grate' | 'boss' | 'leave' | 'report' | 'offer' | 'route' | 'ospizio' | 'church' | 'boss2' | 'return'
  | 'offer3' | 'route3' | 'biblioteca' | 'veronese' | 'cenacolo' | 'boss3' | 'return3' | 'done';
/** The stages of the second quest, La dote delle Zitelle (from Zuane's offer on). */
export const SECOND: readonly Stage[] = ['offer', 'route', 'ospizio', 'church', 'boss2', 'return'];
/** The third's, Le nozze di San Giorgio (from his third offer on); 'done' is the end of all three. */
export const THIRD: readonly Stage[] = ['offer3', 'route3', 'biblioteca', 'veronese', 'cenacolo', 'boss3', 'return3', 'done'];

export interface Gate {
  id: string;
  label: string; // shown in the prompt
  kind: 'grate' | 'door' | 'chain';
  // The door opening it fills (see the walls in zones/convento.ts and zones/chiesa.ts).
  axis: 'x' | 'z'; // the wall runs along this axis
  at: number; // centre along the wall
  c: number; // the wall's line (z for an 'x' wall, x for a 'z' wall)
  w: number; t: number; y0: number; h: number;
  needs: Need; // 'key', 'key2', 'key3': opened by the player holding that key (the Cenacolo's also wants the Nozze back, Quest.canvas); 'boss', 'boss2', 'boss3': swings open when that boss dies; 'quest2', 'quest3': falls when that quest is taken
  open: boolean;
  box: Box; // its collider while shut
}

type GateSpec = Omit<Gate, 'open' | 'box'>;

export const GATES: GateSpec[] = [
  { id: 'grata-nord', label: 'la grata del chiostro grande', kind: 'grate', axis: 'x', at: -7.5, c: -86, w: 3, t: 0.6, y0: 0, h: 3.2, needs: 'key' }, // from the orto
  { id: 'grata-ovest', label: 'la grata del chiostro grande', kind: 'grate', axis: 'z', at: -70, c: -17, w: 2.4, t: 0.6, y0: 0, h: 3.2, needs: 'key' }, // from the chiostro mediano
  { id: 'coro', label: 'la porta della chiesa', kind: 'door', axis: 'x', at: 0, c: -60, w: 2.4, t: 1, y0: F + 0.6, h: 3.4, needs: 'key' }, // choir back door
  { id: 'portone', label: 'il portone', kind: 'door', axis: 'x', at: 0, c: 0, w: 4, t: 1, y0: F, h: 8, needs: 'boss' }, // facade
  // Level 2 (zones/giudecca.ts, zones/zitelle.ts): appended, saved games name gates by id.
  { id: 'catene', label: 'le catene del Ponte de la Croce', kind: 'chain', axis: 'z', at: 15, c: -56.5, w: 10, t: 0.6, y0: 0, h: 3, needs: 'quest2' }, // across the whole quay
  { id: 'coro-zitelle', label: 'la porta della chiesa delle Zitelle', kind: 'door', axis: 'x', at: ZCX, c: -30, w: 2.4, t: 1, y0: ZF, h: 3.2, needs: 'key2' }, // the presbytery's back door, from the court
  { id: 'portone-zitelle', label: 'il portone delle Zitelle', kind: 'door', axis: 'x', at: ZCX, c: 0, w: 3.4, t: 1, y0: ZF, h: 6, needs: 'boss2' }, // facade
  // Level 3 (zones/sangiorgio.ts).
  { id: 'catene-punta', label: 'le catene oltre i Tre Oci', kind: 'chain', axis: 'z', at: 10, c: -302, w: 20, t: 0.6, y0: 0, h: 3, needs: 'quest3' }, // across the quay past the Tre Oci
  { id: 'cenacolo', label: 'la porta del Cenacolo', kind: 'door', axis: 'x', at: -530, c: CENACOLO.z1, w: 2.4, t: 1, y0: 0, h: 3.6, needs: 'key3' }, // from the antirefettorio
  { id: 'cenacolo-orto', label: 'la porta del giardino', kind: 'door', axis: 'x', at: -530, c: CENACOLO.z0, w: 2.4, t: 1, y0: 0, h: 3.6, needs: 'boss3' }, // the refectory's garden door
];

/** The chest with the key, at the far end of the pontile (zones/nord.ts: x -38..-32, z -194..-186, deck at 0). */
export const CHEST = { x: -35, z: -192.6, y: 0, w: 1.1, d: 0.7, h: 0.75 };

/**
 * On the landing outside the choir door (zones/chiesa.ts, F + 0.6), facing in: 3 m above the
 * chiostro grande, out of reach of its priests (they aggro and cast only within 2.5 m of their level).
 */
export const CHOIR_DOOR = { x: 0, z: -61, yaw: Math.PI } as const;

/** Fra' Zuane, chained to the fondamenta a few steps ahead and right of the spawn, turned toward it. */
export const NPC = { x: 3, z: 12.5, yaw: Math.atan2(-(SPAWN.x - 3), -(SPAWN.z - 12.5)), r: 0.35, name: "Fra' Zuane" } as const;

/**
 * Fra' Bortolo, the speziale's ghost, at the back of the serra (zones/orto.ts: x -5..3, z -91..-86,
 * its door at x -1 on the orto side) between the potting benches, facing the door. Out of every
 * friar's pull (the nearest hoes 11 m off, behind the glass), so a talk with him is never a fight.
 */
export const SPEZIALE = { x: -0.6, z: -87.2, yaw: 0, r: 0.35, name: "Fra' Bortolo" } as const;

/** His infusion of rue, once a run: casts this much quicker and every blow this much harder, for `time` s. */
export const BLESSING = { name: 'Benedizione della serra', time: 180, cast: 0.8, dmg: 1.1 } as const;

/** z past which a player is back out on the fondamenta (the foot of the scalinata). */
const OUTSIDE = 10;
/** x past which (-X, east) the hero has reached the Zitelle (their sagrato, zones/zitelle.ts). */
const ZITELLE = -196;

/** Level 2 checkpoints: past the chains, the foot of the Ponte de la Croce's far side; once the church's back door is open, the andito at its steps. */
export const CROCE = { x: -78, z: 15, yaw: Math.PI / 2 } as const;
export const ANDITO = { x: ZCX, z: -35, yaw: Math.PI } as const; // facing the back door
/** Level 3 checkpoints: on the Punta by the gondola, once ashore on the approdo before the basilica, then in the antirefettorio. */
export const PUNTA = { x: -398, z: 10, yaw: Math.PI / 2 } as const;
export const APPRODO = { x: -440, z: 100, yaw: Math.PI / 2 } as const; // facing the facade (-X)
export const ANTIREF = { x: -530, z: 41, yaw: 0 } as const; // facing the Cenacolo's door
/** x past which (-X) the gondola has set the hero down on San Giorgio (the approdo, zones/sangiorgio.ts). */
const ASHORE = LANDING.x1 - 2;
/** Where the gondola is boarded: the end of each landing stage. */
export const BERTHS = { punta: { x: PIER.x0 + 1.4, z: (PIER.z0 + PIER.z1) / 2 }, sangiorgio: { x: LANDING.x1 - 1.4, z: (LANDING.z0 + LANDING.z1) / 2 } } as const;

/**
 * What every quest is worth when done: experience on top of the dead's, gold into the bag, and the name on the
 * "Missione completata" banner (quest/view.ts). The XP is sized to the level the hero usually has when it lands
 * (player/levels.ts need: 20 × level), most of a level for an errand, a whole one or more for a boss handed in,
 * so every quest levels the hero up. Saved by id (core/save.ts): append, never rename.
 */
/**
 * Fra' Bortolo's side quest, Le teste dei frati (QUESTS.teste): once he has asked, every friar's death may throw out a
 * head (`rate`), and always does when the friars left could no longer make up the `need`. Brought back to the serra,
 * the rue rite buys one lasting boon, picked from BOONS.
 */
export const HEADS = { need: 12, rate: 0.5, item: 'testa-frate' } as const;
/** The rite's boons: laid on the kit after the level-up cards (main.ts levels.apply), for good. */
export const BOONS = [
  { id: 'fiala', label: 'Fiala +30%', text: 'la Fiala di linfa tombale ripristina il 30% in più', apply: (t: Tune) => { t.potion *= 1.3; } },
  { id: 'vigore', label: 'Salute +8%', text: "l'8% di salute massima in più", apply: (t: Tune) => { t.hp *= 1.08; } },
  { id: 'rapida', label: 'Fiala rapida', text: 'il recupero della Fiala si accorcia del 20%', apply: (t: Tune) => { t.potionCd *= 0.8; } },
] as const;

export const QUESTS = {
  chiave: { title: 'Il baule del pontile', xp: 80, gold: 30 }, // the key out of the chest, ~level 5
  bortolo: { title: 'Lo speziale della serra', xp: 70, gold: 30 }, // Fra' Bortolo found, ~level 5
  reverendissimo: { title: 'La chiave del portinaio', xp: 200, gold: 80 }, // handed in to Fra' Zuane, ~level 10
  zitelle: { title: 'La dote delle Zitelle', xp: 300, gold: 200 }, // handed in to Fra' Zuane, ~level 14
  teste: { title: 'Le teste dei frati', xp: 140, gold: 60 }, // Fra' Bortolo's side quest, in the orto, ~level 7
  relic: { title: 'La corona del portinaio', xp: 160, gold: 120 }, // Fra' Zuane's corona given back, a random drop, ~level 6-10
  // Mastro Iseppo's, in the squero (quest/squero.ts), ~level 11-13: most of a level each, and one of level 2's epics.
  ferri: { title: 'I ferri di prua', xp: 140, gold: 60 },
  lumi: { title: 'Lumi spenti', xp: 140, gold: 50 },
  gastaldo: { title: 'La testa del Gastaldo', xp: 160, gold: 80 },
  ditale: { title: 'Il ditale di Marieta', xp: 150, gold: 50 },
  maestra: { title: 'Le forbici della Maestra', xp: 170, gold: 80 },
  exvoto: { title: 'L\'ex voto del Redentore', xp: 170, gold: 70 },
  lettera: { title: 'La lettera di Marieta', xp: 160, gold: 40 }, // a rare drop off the zitelle
  sangiorgio: { title: 'Le nozze di San Giorgio', xp: 420, gold: 320 }, // handed in to Fra' Zuane, ~level 17-18
  // San Giorgio's side quests (quest/squero.ts), ~level 15-17.
  marinai: { title: 'I marinai della Riva', xp: 160, gold: 60 }, // Mastro Iseppo, on the approdo
  fari: { title: 'I fari della darsena', xp: 220, gold: 90 }, // the Fanalista
  acqua: { title: 'Acqua di San Benedetto', xp: 180, gold: 70 }, // Padre Archivista
  rintocchi: { title: 'Rintocchi muti', xp: 300, gold: 120 }, // his second, up the campanile: the Campanaro di San Giorgio
  musici: { title: 'I musici di Cana', xp: 200, gold: 80 }, // the Veronese, the first of his two: the main quest's way into the Cenacolo
  tela: { title: 'La tela tagliata', xp: 320, gold: 140 }, // the Veronese's second: the Commissario delle Arti
  schede: { title: 'Le schede del conclave', xp: 150, gold: 50 }, // the Cardinale benedettino, the first of his three
  tiara: { title: 'La tiara di cartapesta', xp: 180, gold: 70 }, // his second: the ladies' three jewels
  incoronazione: { title: "L'incoronazione", xp: 350, gold: 150 }, // his third: walked from the altar to the Bacino through three waves, and crowned
  sabbia: { title: 'Il libro di sabbia', xp: 200, gold: 0 }, // the secret one: a page off an amanuense, the book in the labyrinth, its shelf in the library
} as const;
export type QuestId = keyof typeof QUESTS;
/** A quest's experience (the shared helper: every completion goes through `Quest.complete`). */
export const questXp = (id: QuestId) => QUESTS[id].xp;

/**
 * Fra' Zuane's corona, off any of the dead: each kill's chance starts at `base` and rises by `ramp` (about one run in
 * two has it by the 11th kill, nine in ten by the 20th), and once the key is in hand the next kill is sure, so it
 * always falls before the Reverendissimo does (his own death drops it at the latest).
 */
export const RELIC_DROP = { base: 0.02, ramp: 0.01 } as const;

const REACH = 2.6; // m: interaction distance from a gate's centre or the chest

/** What the player can do right here, for the prompt. `act` is undefined for a locked/barred notice. */
export interface Prompt { text: string; act?: () => string; talk?: 'zuane' | 'speziale' | Giver; ferry?: Crossing; climb?: { x: number; z: number; yaw: number } }
/** The gondola's trips (quest/ferry.ts): the Punta to San Giorgio, back, or home to the Redentore once the Abate is dead. */
export type Crossing = 'out' | 'back' | 'home';

/** WoW's marker over a quest giver: gold "?" with a quest ready to hand in, gold "!" with one on offer, else none. */
export type Mark = 'ready' | 'offer' | undefined;
const mark = (ready: boolean, offer: boolean): Mark => (ready ? 'ready' : offer ? 'offer' : undefined); // "?" wins

export class Quest {
  accepted = false; // Fra' Zuane's quest taken
  key = false;
  chestOpen = false;
  bossDead = false;
  out = false; // back on the fondamenta after the boss
  blessed = false; // Fra' Bortolo's blessing taken (once a run)
  blessLeft = 0; // s of it still running
  blessed2 = false; // his second infusion, on the road to the Zitelle
  reported = false; // the first quest handed in to Fra' Zuane
  accepted2 = false; // La dote delle Zitelle taken
  arrived = false; // reached the Zitelle
  key2 = false; // the key of the church, off the Maestra del merletto
  boss2Dead = false; // the Governatrice
  reported2 = false; // the second quest handed in
  relic = false; // Fra' Zuane's corona picked up (main.ts), once a run
  relicBack = false; // and given back to him
  accepted3 = false; // Le nozze di San Giorgio taken
  landed = false; // set down on San Giorgio by the gondola
  key3 = false; // the key of the Cenacolo, off the Bibliotecario
  boss3Dead = false; // the Abate
  reported3 = false; // the third quest handed in
  blessed3 = false; // Fra' Bortolo's third rue, on the way to San Giorgio
  /** Mastro Iseppo's side quests in the squero (quest/squero.ts); their rewards go through `complete`. */
  readonly side = new SideQuests();
  private relicKills = 0; // kills rolled for it so far (not saved: a load starts the ramp over)
  asked = false; // Le teste dei frati taken from Fra' Bortolo
  heads = 0; // friars' heads picked up for it
  boon = ''; // the rite's boon (BOONS id) once the heads are handed in
  found = false; // Fra' Bortolo found in the serra, as Fra' Zuane asked
  /** The quests done, in order: their rewards (bonusXp, and the banner and gold quest/view.ts hands out once each). */
  done: QuestId[] = [];
  readonly gates: Gate[];
  private world: World;
  /** The Cardinale's collider, kept on him as his procession walks (`update`). */
  private held: Box;

  /** Adds the shut gates' and the chest's colliders to `world`. */
  constructor(world: World) {
    this.world = world;
    this.gates = GATES.map((g) => {
      const [hx, hz] = g.axis === 'x' ? [g.w / 2, g.t / 2 + 0.05] : [g.t / 2 + 0.05, g.w / 2];
      const [cx, cz] = g.axis === 'x' ? [g.at, g.c] : [g.c, g.at];
      return { ...g, open: false, box: world.add(cx, cz, hx, hz, g.y0, g.y0 + g.h) };
    });
    world.add(CHEST.x, CHEST.z, CHEST.w / 2, CHEST.d / 2, CHEST.y, CHEST.y + CHEST.h);
    world.add(NPC.x, NPC.z, NPC.r, NPC.r, 0, 1.8);
    world.add(SPEZIALE.x, SPEZIALE.z, SPEZIALE.r, SPEZIALE.r, 0, 1.8);
    const held = (Object.keys(GIVERS) as Giver[]).map((g) => { const at = GIVERS[g].at; return world.add(at.x, at.z, at.r, at.r, at.y ?? 0, (at.y ?? 0) + 1.8); });
    this.held = held[Object.keys(GIVERS).indexOf('cardinale')];
    this.side.complete = (id) => this.complete(id);
    this.side.over = (q) => { const g = giverOf(q); return g ? (GIVERS[g].level === 3 ? this.boss3Dead : this.boss2Dead) : false; }; // a secret is never stranded: it has no one to hand it to
  }

  get stage(): Stage {
    if (!this.accepted) return 'talk';
    if (!this.key) return 'key';
    if (!this.gates.some((g) => g.kind === 'grate' && g.open)) return 'grate';
    if (!this.bossDead) return 'boss';
    if (!this.out) return 'leave';
    if (!this.reported) return 'report';
    if (!this.accepted2) return 'offer';
    if (!this.arrived) return 'route';
    if (!this.key2) return 'ospizio';
    if (!this.gate('coro-zitelle').open) return 'church';
    if (!this.boss2Dead) return 'boss2';
    if (!this.reported2) return 'return';
    if (!this.accepted3) return 'offer3';
    if (!this.landed) return 'route3';
    if (!this.key3) return 'biblioteca';
    if (!this.gate('cenacolo').open) return this.canvas ? 'cenacolo' : 'veronese'; // a door opened before the Veronese's chain (an older save) stays open
    if (!this.boss3Dead) return 'boss3';
    return this.reported3 ? 'done' : 'return3';
  }

  gate(id: string): Gate {
    return this.gates.find((g) => g.id === id)!;
  }

  /** Per frame with the player's feet: walking out of the open portone ends the first quest's fight, reaching the Zitelle the second's walk (and the Cardinale's collider is kept on him). */
  update(p: { x: number; z: number }): boolean {
    const e = this.side.escort.pose;
    Object.assign(this.held, { cx: e.x, cz: e.z, y0: e.y, y1: e.y + 1.8 });
    const s = this.stage;
    if (s === 'leave' && p.z >= OUTSIDE) return (this.out = true);
    if (s === 'route' && p.x <= ZITELLE) return (this.arrived = true);
    if (s === 'route3' && p.x <= ASHORE) return (this.landed = true);
    return false;
  }

  /** A quest is done: its reward is the hero's, once (false if it already was). */
  complete(id: QuestId): boolean {
    if (this.done.includes(id)) return false;
    this.done.push(id);
    return true;
  }

  /** Fra' Zuane hears the first quest done (once): its reward is laid on. */
  report(): boolean {
    if (!this.out || this.reported) return false;
    this.reported = true;
    return this.complete('reverendissimo');
  }

  /** Every quest giver's marker (`alive`: friars left, for Fra' Bortolo's heads); quest/view.ts hangs them over their heads. */
  marks(alive: number): Record<NonNullable<Prompt['talk']>, Mark> {
    const s = this.stage, over = this.boss2Dead;
    return {
      zuane: mark(s === 'report' || s === 'return' || s === 'return3' || (this.relic && !this.relicBack), s === 'talk' || s === 'offer' || s === 'offer3'),
      speziale: mark((this.accepted && !this.found) || this.headsReady(alive),
        !this.blessed || (this.accepted2 && !this.blessed2 && !over) || (this.accepted3 && !this.blessed3 && !this.boss3Dead) || (!this.asked && !this.bossDead && alive > 0)),
      ...Object.fromEntries((Object.keys(GIVERS) as Giver[]).map((g) => [g, // out of sight until their level opens: the chains fall
        (GIVERS[g].level === 3 ? this.accepted3 : this.accepted2) ? mark(this.side.handInReady(g), this.side.open(g).length > 0) : undefined])) as Record<Giver, Mark>,
    };
  }

  /** The Abate's weakenings earned (enemies/sangiorgio.ts PREPS): one for each side quest handed in that has one. */
  preps(): string[] {
    return SIDE.flatMap((q) => (q.prep && this.side.done.includes(q.id) ? [q.prep] : []));
  }

  /** Fra' Bortolo is found, once Fra' Zuane has sent the hero looking. */
  meet(): boolean {
    if (!this.accepted || this.found) return false;
    this.found = true;
    return this.complete('bortolo');
  }

  /** La dote delle Zitelle taken: the chains on the Ponte de la Croce fall. */
  accept2(): void {
    this.report();
    this.reported = this.accepted2 = true;
    for (const g of this.gates) if (g.needs === 'quest2') this.open(g);
  }

  /** The Maestra del merletto is dead: her key of the church is the hero's. */
  takeKey2(): void {
    this.key2 = true;
  }

  /** The Governatrice is dead: her portone opens onto the sagrato. */
  win2(): void {
    if (this.boss2Dead) return;
    this.boss2Dead = true;
    for (const g of this.gates) if (g.needs === 'boss2') this.open(g);
  }

  /** Fra' Zuane hears the second quest done (once). */
  report2(): boolean {
    if (this.stage !== 'return') return false;
    this.reported2 = true;
    return this.complete('zitelle');
  }

  /** Le nozze di San Giorgio taken: the chain past the Tre Oci falls. */
  accept3(): void {
    this.report2();
    this.accepted3 = true;
    for (const g of this.gates) if (g.needs === 'quest3') this.open(g);
  }

  /** The Nozze di Cana hang in the Cenacolo's frame again: the Veronese's La tela tagliata handed in. The Cenacolo's door wants it with its key. */
  get canvas(): boolean {
    return this.side.done.includes('tela');
  }

  /** The Bibliotecario is dead: the key of the Cenacolo is the hero's. */
  takeKey3(): void {
    this.key3 = true;
  }

  /** The Abate is dead: the refectory's garden door opens. */
  win3(): void {
    if (this.boss3Dead) return;
    this.boss3Dead = true;
    for (const g of this.gates) if (g.needs === 'boss3') this.open(g);
  }

  /** Fra' Zuane hears the third quest done (once). */
  report3(): boolean {
    if (this.stage !== 'return3') return false;
    this.reported3 = true;
    return this.complete('sangiorgio');
  }

  /** Experience the quests done have earned, on top of the dead's (main.ts adds it). */
  get bonusXp(): number {
    return this.done.reduce((s, id) => s + questXp(id), 0);
  }

  /** A death that drops loot: does Fra' Zuane's corona fall with it? (RELIC_DROP; never once found.) */
  rollRelic(rnd: () => number = Math.random): boolean {
    if (this.relic) return false;
    return this.key || rnd() < RELIC_DROP.base + RELIC_DROP.ramp * this.relicKills++;
  }

  /** Heads the rite wants with `alive` friars left: 12, or what is still to be had once the friars run short (the boss's fall takes them all). */
  headsNeed(alive: number): number {
    return Math.min(HEADS.need, this.heads + alive);
  }

  /** Le teste dei frati is on and `need` heads are in hand. */
  headsReady(alive: number): boolean {
    return this.asked && !this.boon && this.heads >= this.headsNeed(alive);
  }

  /** A friar just died, `alive` left and `ground` heads lying unpicked: does a head roll out of its hood? */
  headDrop(alive: number, ground: number, rnd: () => number = Math.random): boolean {
    if (!this.asked || this.boon) return false;
    const short = HEADS.need - this.heads - ground;
    return short > 0 && (rnd() < HEADS.rate || short > alive); // the last friars always pay
  }

  /** The rite: the heads are spent on boon `id`, and Le teste dei frati is done (once). */
  rite(id: string): boolean {
    if (this.boon || !BOONS.some((b) => b.id === id)) return false;
    this.boon = id;
    this.heads = 0;
    return this.complete('teste');
  }

  /** The corona is in his hands again (once). */
  returnRelic(): boolean {
    if (!this.relic || this.relicBack) return false;
    this.relicBack = true;
    return this.complete('relic');
  }

  centre(g: Gate): { x: number; z: number } {
    return g.axis === 'x' ? { x: g.at, z: g.c } : { x: g.c, z: g.at };
  }

  open(g: Gate): void {
    if (g.open) return;
    g.open = true;
    const i = this.world.boxes.indexOf(g.box);
    if (i >= 0) this.world.boxes.splice(i, 1);
  }

  takeKey(): void {
    this.chestOpen = this.key = true;
    this.complete('chiave');
  }

  /** The Reverendissimo is dead: the portone opens onto the fondamenta. */
  win(): void {
    if (this.bossDead) return;
    this.bossDead = true;
    for (const g of this.gates) if (g.needs === 'boss') this.open(g);
  }

  /** Fra' Bortolo's blessing, the first time only. */
  bless(): boolean {
    if (this.blessed) return false;
    this.blessed = true;
    this.blessLeft = BLESSING.time;
    return true;
  }

  /** His rue for San Giorgio, once the third quest is taken: the blessing once more. */
  bless3(): boolean {
    if (this.blessed3 || !this.accepted3) return false;
    this.blessed3 = true;
    this.blessLeft = BLESSING.time;
    return true;
  }

  /** His last rue, once the second quest is taken: the same blessing again, once. */
  bless2(): boolean {
    if (this.blessed2 || !this.accepted2) return false;
    this.blessed2 = true;
    this.blessLeft = BLESSING.time;
    return true;
  }

  /** Cast time × and damage × while the blessing runs. */
  get castMul(): number { return this.blessLeft > 0 ? BLESSING.cast : 1; }
  get dmgMul(): number { return this.blessLeft > 0 ? BLESSING.dmg : 1; }

  /**
   * Where a fallen player wakes: at the choir door once it is open, so a boss attempt
   * is a short walk away instead of the whole route again; on the fondamenta before that.
   * In level 2, past the Ponte de la Croce, then in the andito behind the Zitelle's altar.
   */
  checkpoint(): { x: number; z: number; yaw: number } {
    if (this.gate('cenacolo').open) return ANTIREF;
    if (this.landed) return APPRODO;
    if (this.gate('catene-punta').open) return PUNTA;
    if (this.gate('coro-zitelle').open) return ANDITO;
    if (this.gate('catene').open) return CROCE;
    return this.gate('coro').open ? CHOIR_DOOR : SPAWN;
  }

  /**
   * Mastro Iseppo's gondola at the end of either landing stage: across to San Giorgio from the Punta; back from San
   * Giorgio to the Punta, or once the Abate is dead home to the Redentore, where Fra' Zuane waits.
   */
  ferry(p: { x: number; y: number; z: number }): Prompt | undefined {
    if (Math.abs(p.y) > 1 || !this.accepted3) return undefined;
    const { punta, sangiorgio } = BERTHS;
    if (Math.hypot(p.x - punta.x, p.z - punta.z) < REACH) return { text: 'Sali sulla gondola: a San Giorgio', act: () => '', ferry: 'out' };
    if (Math.hypot(p.x - sangiorgio.x, p.z - sangiorgio.z) < REACH) {
      return this.boss3Dead ? { text: "Sali sulla gondola: al Redentore, da Fra' Zuane", act: () => '', ferry: 'home' } : { text: 'Sali sulla gondola: alla Punta della Giudecca', act: () => '', ferry: 'back' };
    }
    return undefined;
  }

  /** San Giorgio's campanile: up by the door at its foot to the bell chamber, down again by the stair's hatch (main.ts fades the way). */
  climb(p: { x: number; y: number; z: number }): Prompt | undefined {
    if (!this.accepted3) return undefined;
    const { door, hatch, top } = CAMPANILE;
    if (Math.hypot(p.x - door.x, p.z - door.z) < REACH && p.y < 1.5) return { text: 'Sali sul campanile', act: () => '', climb: top };
    if (Math.hypot(p.x - hatch.x, p.z - hatch.z) < REACH * 0.6 && Math.abs(p.y - BELFRY.y) < 1.5) return { text: 'Scendi dal campanile', act: () => '', climb: door };
    return undefined;
  }

  /** The nearest thing to interact with around the player's feet `p`, if any. */
  prompt(p: { x: number; y: number; z: number }): Prompt | undefined {
    if (Math.hypot(p.x - NPC.x, p.z - NPC.z) < REACH && p.y < 1.5) return { text: `Parla con ${NPC.name}`, act: () => '', talk: 'zuane' };
    if (Math.hypot(p.x - SPEZIALE.x, p.z - SPEZIALE.z) < REACH && p.y < 1.5) return { text: `Parla con ${SPEZIALE.name}`, act: () => '', talk: 'speziale' };
    for (const g of Object.keys(GIVERS) as Giver[]) { const at = this.side.where(g); if (Math.hypot(p.x - at.x, p.z - at.z) < REACH && p.y < 1.5) return { text: `Parla con ${at.name}`, act: () => '', talk: g }; }
    const find = this.side.prompt(p);
    if (find) return find;
    const ferry = this.ferry(p) ?? this.climb(p);
    if (ferry) return ferry;
    if (!this.chestOpen && Math.hypot(p.x - CHEST.x, p.z - CHEST.z) < REACH && Math.abs(p.y - CHEST.y) < 1.5) {
      if (!this.accepted) return { text: 'Un sigillo spettrale chiude il baule' };
      return { text: 'Apri il baule', act: () => { this.takeKey(); return 'Hai trovato la chiave del chiostro grande'; } };
    }
    for (const g of this.gates) {
      const c = this.centre(g);
      if (g.open || Math.hypot(p.x - c.x, p.z - c.z) > REACH || Math.abs(p.y - g.y0) > 1.5) continue;
      if (g.needs === 'boss' || g.needs === 'boss2') return { text: `${cap(g.label)} è sbarrato` };
      if (g.needs === 'boss3') return { text: `${cap(g.label)} è sbarrata` };
      if (g.needs === 'quest2' || g.needs === 'quest3') return { text: `${cap(g.label)} sbarrano la fondamenta` };
      if (!(g.needs === 'key3' ? this.key3 : g.needs === 'key2' ? this.key2 : this.key)) return { text: `${cap(g.label)} è chiusa a chiave` };
      if (g.id === 'cenacolo' && !this.canvas) return { text: 'La chiave gira, ma la porta non cede: le nozze non hanno testimoni' };
      return { text: `Apri ${g.label}`, act: () => { this.open(g); return ''; } };
    }
    return undefined;
  }
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
