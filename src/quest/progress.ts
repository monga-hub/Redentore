// The dungeon's progression, as plain state over the collision World (no three.js, so
// `npm run check` walks it in Node). The church is shut at the start: Fra' Zuane, the porter's
// ghost on the fondamenta, gives the quest; the player takes the public route fondamenta ->
// calle -> convent corridor -> orto, finds the key in a chest at the end of the pontile on the
// lagoon (sealed until the quest is accepted), unlocks the grates of the chiostro grande, opens
// the choir door into the church and kills the Reverendissimo; then the main portone swings open
// onto the fondamenta and the player walks out. quest/view.ts draws the gates, the chest and the
// prompts, quest/npc.ts the porter, quest/dialogue.ts what he says.
import type { Box, World } from '../core/physics.ts';
import { CHURCH_FLOOR as F, SPAWN } from '../level/plan.ts';

export type Need = 'key' | 'boss';

/** Where the quest stands, in order; derived from the flags, never stored. */
export type Stage = 'talk' | 'key' | 'grate' | 'boss' | 'leave' | 'done';

export interface Gate {
  id: string;
  label: string; // shown in the prompt
  kind: 'grate' | 'door';
  // The door opening it fills (see the walls in zones/convento.ts and zones/chiesa.ts).
  axis: 'x' | 'z'; // the wall runs along this axis
  at: number; // centre along the wall
  c: number; // the wall's line (z for an 'x' wall, x for a 'z' wall)
  w: number; t: number; y0: number; h: number;
  needs: Need; // 'key': opened by the player holding the key; 'boss': swings open when the boss dies
  open: boolean;
  box: Box; // its collider while shut
}

type GateSpec = Omit<Gate, 'open' | 'box'>;

export const GATES: GateSpec[] = [
  { id: 'grata-nord', label: 'la grata del chiostro grande', kind: 'grate', axis: 'x', at: -7.5, c: -86, w: 3, t: 0.6, y0: 0, h: 3.2, needs: 'key' }, // from the orto
  { id: 'grata-ovest', label: 'la grata del chiostro grande', kind: 'grate', axis: 'z', at: -70, c: -17, w: 2.4, t: 0.6, y0: 0, h: 3.2, needs: 'key' }, // from the chiostro mediano
  { id: 'coro', label: 'la porta della chiesa', kind: 'door', axis: 'x', at: 0, c: -60, w: 2.4, t: 1, y0: F + 0.6, h: 3.4, needs: 'key' }, // choir back door
  { id: 'portone', label: 'il portone', kind: 'door', axis: 'x', at: 0, c: 0, w: 4, t: 1, y0: F, h: 8, needs: 'boss' }, // facade
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

/** z past which a player is back out on the fondamenta (the foot of the scalinata). */
const OUTSIDE = 10;

const REACH = 2.6; // m: interaction distance from a gate's centre or the chest

/** What the player can do right here, for the prompt. `act` is undefined for a locked/barred notice. */
export interface Prompt { text: string; act?: () => string; talk?: true }

export class Quest {
  accepted = false; // Fra' Zuane's quest taken
  key = false;
  chestOpen = false;
  bossDead = false;
  out = false; // back on the fondamenta after the boss
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
  }

  get stage(): Stage {
    if (!this.accepted) return 'talk';
    if (!this.key) return 'key';
    if (!this.gates.some((g) => g.kind === 'grate' && g.open)) return 'grate';
    if (!this.bossDead) return 'boss';
    return this.out ? 'done' : 'leave';
  }

  /** Per frame with the player's feet: walking out of the open portone ends the quest. */
  update(p: { z: number }): boolean {
    if (this.stage !== 'leave' || p.z < OUTSIDE) return false;
    this.out = true;
    return true;
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
  }

  /** The Reverendissimo is dead: the portone opens onto the fondamenta. */
  win(): void {
    if (this.bossDead) return;
    this.bossDead = true;
    for (const g of this.gates) if (g.needs === 'boss') this.open(g);
  }

  /**
   * Where a fallen player wakes: at the choir door once it is open, so a boss attempt
   * is a short walk away instead of the whole route again; on the fondamenta before that.
   */
  checkpoint(): { x: number; z: number; yaw: number } {
    return this.gates.find((g) => g.id === 'coro')!.open ? CHOIR_DOOR : SPAWN;
  }

  /** The nearest thing to interact with around the player's feet `p`, if any. */
  prompt(p: { x: number; y: number; z: number }): Prompt | undefined {
    if (Math.hypot(p.x - NPC.x, p.z - NPC.z) < REACH && p.y < 1.5) return { text: `Parla con ${NPC.name}`, act: () => '', talk: true };
    if (!this.chestOpen && Math.hypot(p.x - CHEST.x, p.z - CHEST.z) < REACH && Math.abs(p.y - CHEST.y) < 1.5) {
      if (!this.accepted) return { text: 'Un sigillo spettrale chiude il baule' };
      return { text: 'Apri il baule', act: () => { this.takeKey(); return 'Hai trovato la chiave del chiostro grande'; } };
    }
    for (const g of this.gates) {
      const c = this.centre(g);
      if (g.open || Math.hypot(p.x - c.x, p.z - c.z) > REACH || Math.abs(p.y - g.y0) > 1.5) continue;
      if (g.needs === 'boss') return { text: `${cap(g.label)} è sbarrato` };
      if (!this.key) return { text: `${cap(g.label)} è chiusa a chiave` };
      return { text: `Apri ${g.label}`, act: () => { this.open(g); return ''; } };
    }
    return undefined;
  }
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
