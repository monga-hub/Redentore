// Level 3's dead (see quest/progress.ts and zones/sangiorgio.ts): the caster brain of caster.ts with new kinds. The
// monaci neri, risen Benedictines walking in with the processional cross (melee); the amanuensi, the scribes who copy
// the names of the dead, flicking ink from the quill (bolts); the marinai of the darsena, drowned sailors with the
// boathook's long reach (fast melee). Elites: the Bibliotecario upstairs in Longhena's library (the key of the Cenacolo
// on his girdle; ink blots on the floor round the hero) and the Nostromo of the darsena (off the way, the anchor
// whirled round him). The boss, l'Abate di San Giorgio, in the Cenacolo under the empty frame of the Nozze di Cana:
// the Calice poured in a wedge before him, from 70% the campanile's bells in rings to jump, from 40% the tide over the
// floor but for islands of light, haste under 20%, and a wedding that will not wait past six minutes.
// Tuned with scripts/balance.ts for a hero who walks in from the Governatrice in level 2's gear.
import type { World } from '../core/physics.ts';
import { CENACOLO } from '../level/zones/sangiorgio.ts';
import { PRIEST, spawnPriests, type Bounds, type CasterKind, type Priest } from './caster.ts';
import { GONDOLIERE } from './zitelle.ts';

export const MONACO: CasterKind = {
  ...GONDOLIERE,
  hp: 460, xp: 22,
  aggro: 11, leash: 32,
  speed: 3.8,
  melee: { reach: 1.5, hit: 2.6, windup: 0.7, swing: 1.3, cooldown: 2.2, damage: 140 },
};
export const AMANUENSE: CasterKind = {
  ...PRIEST,
  hp: 260, xp: 20,
  aggro: 13, leash: 30,
  range: 18, keep: 6, cast: 1.4, cooldown: 2.2, bolt: 14, damage: 110,
};
export const MARINAIO: CasterKind = {
  ...GONDOLIERE,
  hp: 380, xp: 20,
  aggro: 10, leash: 32,
  speed: 4.4, walk: 6.5,
  melee: { reach: 2.2, hit: 3.2, windup: 0.6, swing: 1.2, cooldown: 2, damage: 120 }, // the boathook's reach
};

export const BIBLIOTECARIO: CasterKind = {
  ...PRIEST,
  hp: 4400, xp: 180,
  aggro: 12, leash: 40, blind: 12,
  range: 18, keep: 0, speed: 3.4, cast: 1.7, cooldown: 3.2, bolt: 13, damage: 130,
  radius: 0.6, margin: 1,
  melee: { reach: 1.8, hit: 2.9, windup: 0.75, swing: 1.4, cooldown: 2.4, damage: 200 }, // the ledger's iron clasp
  // Ink blots from the first blow (`at` 1): the marks of the bosses, no acts beyond.
  phases: { at: [1], marks: { every: 7, n: 3, cast: 1.6, radius: 2, spread: 3.2, damage: 320 }, haste: 1, berserk: Infinity, rage: 1 },
  resist: 0.6,
};
export const NOSTROMO: CasterKind = {
  ...MARINAIO,
  hp: 3800, xp: 160,
  aggro: 8, leash: 34, blind: 12,
  speed: 3.6, radius: 0.7, margin: 1,
  melee: { reach: 1.8, hit: 3.2, windup: 0.85, swing: 1.5, cooldown: 2.6, damage: 230 },
  nova: { every: 9, cast: 2, radius: 5, damage: 420 }, // the anchor whirled round him on its chain
  resist: 0.6,
};

/**
 * L'Abate di San Giorgio. Below 70% the Rintocchi, below 40% Acqua alta (caster.ts), haste under 20%, berserk at 6 minutes.
 * No nova: up close the Calice is the thing to step out of.
 */
export const ABATE: CasterKind = {
  ...PRIEST,
  name: "L'Abate di San Giorgio",
  hp: 21000, xp: 0, // his fall ends the third quest
  aggro: 14, leash: 60, blind: 15,
  range: 22, keep: 0, speed: 3, walk: 6, cast: 2, cooldown: 3.8, bolt: 12, life: 5, damage: 150,
  radius: 1.5, margin: 2,
  melee: { reach: 2, hit: 4.2, windup: 0.85, swing: 1.6, cooldown: 3.2, damage: 190 }, // the crozier
  pour: { every: 11, cast: 1.6, angle: Math.PI / 3, length: 13, damage: 380 },
  toll: { phase: 1, every: 12, n: 3, gap: 0.9, speed: 6, width: 1, reach: 18, damage: 260 },
  tide: { phase: 2, every: 17, warn: 3, time: 5, n: 3, r: 2, dps: 240 },
  phases: { at: [0.7, 0.4, 0.2], haste: 1.25, berserk: 360, rage: 3 },
  resist: 0.35,
};

/** Before the empty frame, facing the door from the antirefettorio (+Z). */
export const ABATE_AT = { x: -530, z: 11 };
/** His floor: the refectory between the monks' tables (x CENACOLO ± 1.8), the frame wall and the far door. */
export const ABATE_BOUNDS: Bounds = { x0: CENACOLO.x0 + 3.5, x1: CENACOLO.x1 - 3.5, z0: CENACOLO.z0 + 3, z1: CENACOLO.z1 - 2.5 };

type Spot = [number, number];
interface Pack { label: string; at: Spot; bounds: Bounds; members: [CasterKind, number, number][] }
const rect = (x0: number, x1: number, z0: number, z1: number): Bounds => ({ x0, x1, z0, z1 });
const QUAY = rect(-376, -301, 0.5, 19.5), ALLORI = rect(-545, -515, 47, 77), CIPRESSI = rect(-501, -465, 47, 77);

/**
 * Every pack of level 3, in the order saved games index them (appended after level 2's mobs). `at`: where the pack
 * faces at rest; `members`: kind and spot.
 */
export const PACKS: Pack[] = [
  { label: 'Fondamenta San Giovanni', at: [-326, 11], bounds: QUAY, members: [[MARINAIO, -323, 9], [MARINAIO, -329, 9], [MONACO, -326, 14]] },
  { label: 'Fondamenta San Giovanni', at: [-358, 10], bounds: QUAY, members: [[MONACO, -355, 8], [MONACO, -361, 8], [AMANUENSE, -358, 14]] },
  { label: 'Punta della Giudecca', at: [-388, -7], bounds: rect(-403.5, -376, -13.5, 19.5), members: [[MONACO, -388, -4], [AMANUENSE, -385, -9], [AMANUENSE, -391, -9]] },
  { label: 'Piazzale di San Giorgio', at: [-462, 92], bounds: rect(-477.5, -444.5, 86.5, 133.5), members: [[MARINAIO, -459, 90], [MARINAIO, -465, 90], [AMANUENSE, -462, 95]] },
  { label: 'Piazzale di San Giorgio', at: [-462, 121], bounds: rect(-477.5, -444.5, 86.5, 133.5), members: [[MONACO, -459, 119], [MONACO, -465, 119], [MARINAIO, -462, 124]] },
  { label: 'Basilica di San Giorgio Maggiore', at: [-500, 102], bounds: rect(-519, -479, 95.5, 108.5), members: [[MONACO, -497, 100], [MONACO, -497, 104], [AMANUENSE, -503, 102]] },
  { label: 'Crociera sotto la cupola', at: [-530, 108], bounds: rect(-539, -521, 81, 123), members: [[AMANUENSE, -527, 113], [AMANUENSE, -533, 113], [MONACO, -530, 106]] },
  { label: 'Coro dei monaci', at: [-561, 102], bounds: rect(-567, -555, 93, 111), members: [[AMANUENSE, -559, 99], [AMANUENSE, -559, 105], [AMANUENSE, -564, 102]] },
  { label: 'Chiostro degli allori', at: [-537, 56], bounds: ALLORI, members: [[MONACO, -535, 54], [MONACO, -539, 58], [AMANUENSE, -540, 53]] },
  { label: 'Chiostro degli allori', at: [-523, 70], bounds: ALLORI, members: [[MONACO, -521, 72], [AMANUENSE, -525, 67], [AMANUENSE, -520, 67]] },
  { label: 'Chiostro dei cipressi', at: [-483, 66], bounds: CIPRESSI, members: [[MONACO, -481, 66], [MONACO, -485, 66], [AMANUENSE, -483, 59]] },
  { label: 'Scalone del Longhena', at: [-491, 24], bounds: rect(-497.5, -484.5, 20.5, 26), members: [[AMANUENSE, -494.5, 23], [AMANUENSE, -487.5, 23]] },
  { label: 'Biblioteca del Longhena', at: [-491, 6], bounds: rect(-506.5, -472, -4.5, 18.5), members: [[BIBLIOTECARIO, -491, 5], [AMANUENSE, -495, -1.5], [AMANUENSE, -487, -1.5], [AMANUENSE, -491, 14]] },
  { label: 'Darsena di San Giorgio', at: [-581, 129], bounds: rect(-599.5, -563, 124.5, 133.5), members: [[NOSTROMO, -581, 128], [MARINAIO, -596, 130], [MARINAIO, -566, 130]] },
  { label: 'Fondamenta di San Giorgio', at: [-520, 126], bounds: rect(-567.5, -478.5, 118.5, 133.5), members: [[MARINAIO, -517, 124], [MARINAIO, -523, 124], [MONACO, -520, 129]] },
  { label: 'Riva di San Giorgio', at: [-448, 40], bounds: rect(-451.5, -444.5, -35, 85), members: [[MARINAIO, -448, 37], [MARINAIO, -448, 43]] },
  { label: 'Giardino di San Giorgio', at: [-470, -10], bounds: rect(-547, -453, -35, 3), members: [[MONACO, -467, -8], [MONACO, -473, -8], [AMANUENSE, -470, -14]] },
  { label: 'Teatro Verde', at: [-574, -29], bounds: rect(-596, -552, -32.5, -10), members: [[MONACO, -574, -27], [AMANUENSE, -570, -30], [AMANUENSE, -578, -30]] },
];

export interface Level3 { all: Priest[]; boss: Priest; bibliotecario: Priest; nostromo: Priest }

/** Level 3's casters: the packs, then the Abate, always in this order. */
export function spawnLevel3(world: World): Level3 {
  const groups = PACKS.map((p) => p.members.map(([, x, z]) => [x, z, Math.atan2(x - p.at[0], z - p.at[1])] as [number, number, number]));
  const packs = spawnPriests(world, groups, PACKS.map((p) => p.bounds), PACKS.map((p) => p.members.map(([k]) => k)));
  const [[boss]] = spawnPriests(world, [[[ABATE_AT.x, ABATE_AT.z, Math.PI]]], [ABATE_BOUNDS], [[ABATE]]);
  const all = [...packs.flat(), boss];
  return { all, boss, bibliotecario: all.find((m) => m.kind === BIBLIOTECARIO)!, nostromo: all.find((m) => m.kind === NOSTROMO)! };
}
