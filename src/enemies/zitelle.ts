// Level 2's dead (see quest/progress.ts, zones/giudecca.ts and zones/zitelle.ts): the caster brain of
// caster.ts with new kinds. On the fondamenta the gondolieri annegati (melee, the oar) and the codeghe,
// the lantern-bearers of the Venetian night (homing will-o'-wisps); inside the Pia Casa the zitelle,
// the lace-making girls (thread bolts). Elites: the Gastaldo dei gondolieri in the squero (off the way,
// a whirl of the oar to run out of) and the Maestra del merletto in the lace hall (her shears, lace
// lines; the church's key on her belt). The boss, la Governatrice, under the dome: lace lines through
// the player, two girls called at 70% and two at 40% who keep her veil up (most of each blow turned),
// the fuso under 25% (crossed threads spinning round her), and her patience runs out at 5 minutes.
// Tuned with scripts/balance.ts for a hero who arrives in level 1's gear at level 10-11.
// Pure math like caster.ts: `npm run check` and the balance bot drive it in Node.
import type { World } from '../core/physics.ts';
import { HALL } from '../level/zones/zitelle.ts';
import { PRIEST, spawnPriests, type Bounds, type CasterKind, type Priest } from './caster.ts';

export const GONDOLIERE: CasterKind = {
  ...PRIEST,
  hp: 300, xp: 16,
  aggro: 10, leash: 30, blind: 6,
  range: 0, keep: 0, // never casts: walks in with the oar
  speed: 3.9, walk: 6,
  radius: 0.45, margin: 0.8,
  melee: { reach: 1.5, hit: 2.5, windup: 0.65, swing: 1.25, cooldown: 2.1, damage: 105 },
};
export const CODEGA: CasterKind = {
  ...PRIEST,
  hp: 190, xp: 16,
  aggro: 13, leash: 30,
  range: 18, keep: 6, cast: 1.5, cooldown: 2.3, bolt: 12, damage: 85,
};
export const ZITELLA: CasterKind = {
  ...PRIEST,
  hp: 170, xp: 15,
  aggro: 12, leash: 28,
  range: 17, keep: 5, cast: 1.3, cooldown: 2, bolt: 15, damage: 75,
};
/** The girls round the Governatrice's hall: they never stir by themselves, she calls them. */
export const VELO: CasterKind = { ...ZITELLA, hp: 380, xp: 10, aggro: 0, leash: 60, blind: 30, keep: 0 };

export const GASTALDO: CasterKind = {
  ...GONDOLIERE,
  hp: 2100, xp: 90,
  aggro: 8, leash: 34, blind: 12,
  speed: 3.6, radius: 0.65, margin: 1,
  melee: { reach: 1.7, hit: 3.1, windup: 0.8, swing: 1.5, cooldown: 2.6, damage: 175 },
  nova: { every: 10, cast: 2, radius: 4.5, damage: 330 }, // the oar whirled round him
  resist: 0.6,
};
export const MAESTRA: CasterKind = {
  ...PRIEST,
  hp: 2800, xp: 120,
  aggro: 12, leash: 40, blind: 12,
  range: 18, keep: 0, speed: 3.4, cast: 1.8, cooldown: 3.4, damage: 95,
  radius: 0.6, margin: 1,
  melee: { reach: 1.8, hit: 2.9, windup: 0.75, swing: 1.4, cooldown: 2.4, damage: 160 }, // the shears
  lines: { every: 8, cast: 1.5, length: 16, width: 1.6, damage: 270, n: 1, spread: 0 },
  resist: 0.6,
};
export const GOVERNATRICE: CasterKind = {
  ...PRIEST,
  name: 'La Governatrice',
  hp: 14000, xp: 0, // her fall ends the second quest; 13000 before the quests paid XP
  aggro: 14, leash: 60, blind: 15,
  range: 22, keep: 0, speed: 2.9, walk: 6, cast: 2.2, cooldown: 4, bolt: 11, life: 5, damage: 125,
  radius: 1, margin: 1.6,
  melee: { reach: 1.5, hit: 4.2, windup: 0.85, swing: 1.6, cooldown: 3.2, damage: 140 }, // the sceptre
  lines: { every: 9, cast: 1.7, length: 22, width: 2, damage: 330, n: 2, spread: 0.55 },
  phases: { at: [0.7, 0.4, 0.25], haste: 1.2, berserk: 330, rage: 3 },
  veil: { cut: 0.8 },
  spin: { phase: 3, every: 14, time: 6, speed: 0.9, length: 9, width: 1.4, dps: 280 },
  resist: 0.35,
};

/** The hall under the dome, less her bulk's margin: where she walks. */
export const GOV_AT = { x: -240, z: -10 };

type Spot = [number, number];
interface Pack { label: string; at: Spot; bounds: Bounds; members: [CasterKind, number, number][] }
const rect = (x0: number, x1: number, z0: number, z1: number): Bounds => ({ x0, x1, z0, z1 });
const QUAY = rect(-166, -70, 10, 19.5), CAMPO = rect(-132, -104, -13.5, 10), CAMPIELLO = rect(-99.5, -76.5, -29.5, -16.5);
const SQUERO = rect(-196, -173, -25.5, 10), ZQUAY = rect(-299, -160, 0, 19.5);

/**
 * Every pack of level 2, in the order saved games index them (appended after level 1's mobs). `at`: where
 * the pack faces at rest (the middle of their circle); `members`: kind and spot.
 */
export const PACKS: Pack[] = [
  { label: 'Fondamenta de la Croce', at: [-97.5, 15.5], bounds: QUAY, members: [[GONDOLIERE, -96, 14], [GONDOLIERE, -99, 17]] },
  { label: 'Campiello de la Croce', at: [-88, -25], bounds: CAMPIELLO, members: [[GONDOLIERE, -83, -25], [GONDOLIERE, -93, -25], [CODEGA, -88, -28.5]] },
  { label: 'Campo de Santa Croce', at: [-118, -3], bounds: CAMPO, members: [[GONDOLIERE, -112, 0], [GONDOLIERE, -124, 0], [CODEGA, -118, -9]] },
  { label: 'Fondamenta de la Croce', at: [-147.5, 15], bounds: QUAY, members: [[CODEGA, -145, 13], [CODEGA, -150, 17], [GONDOLIERE, -148, 15]] },
  { label: 'Ponte del Squero', at: [-178, 15], bounds: ZQUAY, members: [[GONDOLIERE, -178, 13], [GONDOLIERE, -178, 17], [CODEGA, -182, 15]] },
  { label: 'Squero', at: [-188, -16], bounds: SQUERO, members: [[GASTALDO, -189, -18], [GONDOLIERE, -182, -10], [GONDOLIERE, -192, -9]] },
  { label: 'Sagrato delle Zitelle', at: [-207, 5], bounds: rect(-229, -196.5, 0.5, 19.5), members: [[GONDOLIERE, -204, 6], [GONDOLIERE, -210, 6], [CODEGA, -207, 3]] },
  { label: 'Sagrato delle Zitelle', at: [-268, 6], bounds: rect(-283.5, -251, 0.5, 19.5), members: [[CODEGA, -265, 5], [CODEGA, -271, 5], [GONDOLIERE, -268, 8]] },
  { label: 'Refettorio', at: [-204, -6], bounds: rect(-209.4, -198.8, -11.4, -0.6), members: [[ZITELLA, -202, -9.5], [ZITELLA, -206, -2.5]] },
  { label: 'Portineria dell\'ospizio', at: [-222, -6], bounds: rect(-228.9, -210.6, -11.4, -0.6), members: [[ZITELLA, -214, -9], [ZITELLA, -226, -9]] },
  { label: 'Sala del merletto', at: [-222, -25], bounds: rect(-229, -198.8, -35.4, -12.6), members: [[MAESTRA, -222, -27], [ZITELLA, -218, -20], [ZITELLA, -226, -20], [ZITELLA, -219, -33]] },
  { label: 'Cortile delle Zitelle', at: [-226, -54], bounds: rect(-281.2, -198.8, -61.4, -36.6), members: [[ZITELLA, -226, -51], [ZITELLA, -222, -56], [ZITELLA, -230, -57]] },
  { label: 'Cortile delle Zitelle', at: [-254, -54], bounds: rect(-281.2, -198.8, -61.4, -36.6), members: [[ZITELLA, -254, -51], [ZITELLA, -250, -57], [ZITELLA, -258, -56]] },
  { label: 'Dormitorio delle zitelle', at: [-266, -26], bounds: rect(-281.4, -251.1, -35.4, -12.6), members: [[ZITELLA, -262, -30], [ZITELLA, -270, -30], [ZITELLA, -266, -21]] },
  { label: 'Infermeria', at: [-266, -6.5], bounds: rect(-281.4, -251.1, -11.4, -0.6), members: [[ZITELLA, -259, -6.5], [ZITELLA, -273, -6.5]] },
  { label: 'Orto delle Zitelle', at: [-240, -90], bounds: rect(-281.2, -198.8, -103.4, -74.6), members: [[CODEGA, -228, -89], [CODEGA, -252, -89], [GONDOLIERE, -240, -95]] },
];

/** Her girls, praying along the hall's side walls under the grated choirs. */
const WARDS: Spot[] = [[-232.6, -7], [-247.4, -13], [-232.6, -13], [-247.4, -7]];

export interface Level2 { all: Priest[]; boss: Priest; maestra: Priest; gastaldo: Priest; wards: Priest[] }

/** Level 2's casters: the packs, then the Governatrice and her wards (boss before them), always in this order. */
export function spawnLevel2(world: World): Level2 {
  const groups = PACKS.map((p) => p.members.map(([, x, z]) => [x, z, Math.atan2(x - p.at[0], z - p.at[1])] as [number, number, number]));
  const packs = spawnPriests(world, groups, PACKS.map((p) => p.bounds), PACKS.map((p) => p.members.map(([k]) => k)));
  const hall = { x0: HALL.x0, x1: HALL.x1, z0: HALL.z0, z1: HALL.z1 };
  const [[boss]] = spawnPriests(world, [[[GOV_AT.x, GOV_AT.z, Math.PI]]], [hall], [[GOVERNATRICE]]);
  const wards = spawnPriests(world, WARDS.map(([x, z]) => [[x, z, x < GOV_AT.x ? -Math.PI / 2 : Math.PI / 2]] as [number, number, number][]), WARDS.map(() => hall), WARDS.map(() => [VELO])).flat();
  boss.wards = wards;
  const all = [...packs.flat(), boss, ...wards];
  return { all, boss, maestra: all.find((m) => m.kind === MAESTRA)!, gastaldo: all.find((m) => m.kind === GASTALDO)!, wards };
}
