// Il drago di Carpaccio (the San Giorgio plan's quest 9; this is its prototype, the fight alone): the sea serpent of Carpaccio's
// San Giorgio e il drago, down off the canvas and back in the lagoon, rising out of the water behind the Teatro Verde's stage.
// The caster brain of caster.ts on a kind that never walks: it holds the shore at one of three spots and lunges, breathes and
// lashes from there. The Fiato, its breath poured in a wedge (`pour`); the Coda, the tail brought down round it (`nova`);
// the Immersione (`dive`), under the water and up at another spot; from 40% the drowned sailors climb out of the lagoon, and
// again at 20% (`waves`). Pure math like caster.ts: the balance bot drives it in Node (scripts/balance.ts drago), and the body,
// a Meshy head on a procedural serpent, is enemies/serpent.ts's. No quest yet: main.ts's `?drago=1` sandbox calls it up.
import type { World } from '../core/physics.ts';
import { PRIEST, killAll, spawnPriests, type Bounds, type CasterKind, type Priest } from './caster.ts';
import { MARINAIO, lull, rouse } from './sangiorgio.ts';

/** The water's edge behind the Teatro Verde (zones/sangiorgio.ts garden): the stage's back, and either side of it. */
export const DRAGO_SPOTS: [number, number][] = [[-574, -38.4], [-592, -38.4], [-556, -38.4]];
/** The theatre's lawn and stage, from the island's south edge (z -40) to the tiers: the sailors' floor. */
export const TEATRO: Bounds = { x0: -599.4, x1: -549, z0: -39.6, z1: -9 };

/**
 * The dragon. Tuned with scripts/balance.ts drago for a hero at level 18-19 in level 3's typical gear: the dodging melee bot wins
 * every try in 4-5 minutes, the caster half of them (it loses the Abate at 18 too); the venom gobs and the drowned do much of the harm.
 */
export const DRAGO: CasterKind = {
  ...PRIEST,
  name: 'Il drago di Carpaccio',
  hp: 8000, xp: 0, // the quest's reward will be its worth
  aggro: 16, leash: 40, blind: Infinity,
  range: 24, keep: 0, speed: 0, walk: 14, cast: 1.8, cooldown: 3.4, bolt: 14, life: 4, damage: 110, // a gob of venom at range
  radius: 1.6, margin: 0,
  melee: { reach: 1.4, hit: 3.4, windup: 0.9, swing: 1.7, cooldown: 3.2, damage: 170 }, // the bite
  pour: { every: 12, cast: 1.7, angle: Math.PI / 3.5, length: 14, damage: 340 }, // il Fiato
  nova: { every: 14, cast: 2.2, radius: 7, damage: 360 }, // la Coda
  dive: { every: 30, under: 4, warn: 1.6, rise: 3, radius: 4.5, damage: 380, spots: DRAGO_SPOTS }, // l'Immersione
  phases: { at: [0.4, 0.2], haste: 1.2, berserk: 420, rage: 2.5 },
  resist: 0.15,
};

/** Where the drowned climb out, along the edge either side of the dragon's spots. */
const SAILORS: [number, number][] = [[-584, -39], [-564, -39], [-597, -39], [-551, -39]]; // two a wave, the nearer first

export interface Drago { all: Priest[]; boss: Priest; sailors: Priest[]; wave: number }

/** The dragon at its home spot (the stage's back, facing the tiers) and its sailors asleep under the water. */
export function spawnDrago(world: World): Drago {
  const [[boss], sailors] = spawnPriests(world, [[[DRAGO_SPOTS[0][0], DRAGO_SPOTS[0][1], Math.PI]], SAILORS.map(([x, z]) => [x, z, Math.PI] as [number, number, number])],
    [{ x0: -600, x1: -548, z0: -40, z1: -36 }, TEATRO], [[DRAGO], SAILORS.map(() => MARINAIO)]);
  lull(sailors);
  return { all: [boss, ...sailors], boss, sailors, wave: 0 };
}

/**
 * The sailors by the dragon's acts: a wave out of the water at each, two more each time (whoever of them lies dead gets up again), back under when it
 * goes back to rest, dead with it. main.ts calls each act out (its ACTS).
 */
export function waves(d: Drago, world: World): void {
  const b = d.boss;
  if (b.state === 'dead') { if (d.wave >= 0) { killAll(d.sailors); d.wave = -1; } return; }
  if (b.state === 'pray' || b.state === 'evade') { if (d.wave > 0) lull(d.sailors); d.wave = 0; return; }
  if (d.wave < 0 || b.phase <= d.wave) return;
  d.wave = b.phase;
  rouse(d.sailors.slice(0, 2 * d.wave).filter((s) => s.state === 'dead'), world, true);
}
