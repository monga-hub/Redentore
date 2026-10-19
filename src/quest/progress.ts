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
import type { Box, World } from '../core/physics.ts';
import type { Tune } from '../player/levels.ts';
import { CHURCH_FLOOR as F, SPAWN } from '../level/plan.ts';
import { ZCX, ZF } from '../level/zones/zitelle.ts';
import { ISEPPO, SideQuests } from './squero.ts';

export type Need = 'key' | 'boss' | 'quest2' | 'key2' | 'boss2';

/** Where the quests stand, in order; derived from the flags, never stored. */
export type Stage = 'talk' | 'key' | 'grate' | 'boss' | 'leave' | 'report' | 'offer' | 'route' | 'ospizio' | 'church' | 'boss2' | 'return' | 'done';
/** The stages of the second quest, La dote delle Zitelle (from Zuane's offer on). */
export const SECOND: readonly Stage[] = ['offer', 'route', 'ospizio', 'church', 'boss2', 'return', 'done'];

export interface Gate {
  id: string;
  label: string; // shown in the prompt
  kind: 'grate' | 'door' | 'chain';
  // The door opening it fills (see the walls in zones/convento.ts and zones/chiesa.ts).
  axis: 'x' | 'z'; // the wall runs along this axis
  at: number; // centre along the wall
  c: number; // the wall's line (z for an 'x' wall, x for a 'z' wall)
  w: number; t: number; y0: number; h: number;
  needs: Need; // 'key', 'key2': opened by the player holding that key; 'boss', 'boss2': swings open when that boss dies; 'quest2': falls when the second quest is taken
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
export interface Prompt { text: string; act?: () => string; talk?: 'zuane' | 'speziale' | 'iseppo' }

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
    world.add(ISEPPO.x, ISEPPO.z, ISEPPO.r, ISEPPO.r, 0, 1.8);
    this.side.complete = (id) => this.complete(id);
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
    return this.reported2 ? 'done' : 'return';
  }

  gate(id: string): Gate {
    return this.gates.find((g) => g.id === id)!;
  }

  /** Per frame with the player's feet: walking out of the open portone ends the first quest's fight, reaching the Zitelle the second's walk. */
  update(p: { x: number; z: number }): boolean {
    const s = this.stage;
    if (s === 'leave' && p.z >= OUTSIDE) return (this.out = true);
    if (s === 'route' && p.x <= ZITELLE) return (this.arrived = true);
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
    if (this.gate('coro-zitelle').open) return ANDITO;
    if (this.gate('catene').open) return CROCE;
    return this.gate('coro').open ? CHOIR_DOOR : SPAWN;
  }

  /** The nearest thing to interact with around the player's feet `p`, if any. */
  prompt(p: { x: number; y: number; z: number }): Prompt | undefined {
    if (Math.hypot(p.x - NPC.x, p.z - NPC.z) < REACH && p.y < 1.5) return { text: `Parla con ${NPC.name}`, act: () => '', talk: 'zuane' };
    if (Math.hypot(p.x - SPEZIALE.x, p.z - SPEZIALE.z) < REACH && p.y < 1.5) return { text: `Parla con ${SPEZIALE.name}`, act: () => '', talk: 'speziale' };
    if (Math.hypot(p.x - ISEPPO.x, p.z - ISEPPO.z) < REACH && p.y < 1.5) return { text: `Parla con ${ISEPPO.name}`, act: () => '', talk: 'iseppo' };
    const find = this.side.prompt(p);
    if (find) return find;
    if (!this.chestOpen && Math.hypot(p.x - CHEST.x, p.z - CHEST.z) < REACH && Math.abs(p.y - CHEST.y) < 1.5) {
      if (!this.accepted) return { text: 'Un sigillo spettrale chiude il baule' };
      return { text: 'Apri il baule', act: () => { this.takeKey(); return 'Hai trovato la chiave del chiostro grande'; } };
    }
    for (const g of this.gates) {
      const c = this.centre(g);
      if (g.open || Math.hypot(p.x - c.x, p.z - c.z) > REACH || Math.abs(p.y - g.y0) > 1.5) continue;
      if (g.needs === 'boss' || g.needs === 'boss2') return { text: `${cap(g.label)} è sbarrato` };
      if (g.needs === 'quest2') return { text: `${cap(g.label)} sbarrano la fondamenta` };
      if (!(g.needs === 'key2' ? this.key2 : this.key)) return { text: `${cap(g.label)} è chiusa a chiave` };
      return { text: `Apri ${g.label}`, act: () => { this.open(g); return ''; } };
    }
    return undefined;
  }
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
