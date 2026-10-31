// Level 3's dead (see quest/progress.ts and zones/sangiorgio.ts): the caster brain of caster.ts with new kinds. The
// monaci neri, risen Benedictines walking in with the processional cross (melee); the amanuensi, the scribes who copy
// the names of the dead, flicking ink from the quill (bolts); the marinai of the darsena, drowned sailors with the
// boathook's long reach (fast melee). Elites: the Bibliotecario upstairs in Longhena's library (the key of the Cenacolo
// on his girdle; ink blots on the floor round the hero) and the Nostromo of the darsena (off the way, the anchor
// whirled round him). The boss, l'Abate di San Giorgio, in the Cenacolo under the empty frame of the Nozze di Cana:
// the Calice poured in a wedge before him, from 70% the campanile's bells in rings to jump, from 40% the tide over the
// floor but for islands of light, haste under 20%, and a wedding that will not wait past six minutes.
// The Veronese's chain (quest/squero.ts) wakes the Commissario delle Arti in the chiostro dei cipressi, a miniboss off the way,
// and at half his health his three granatieri. Padre Archivista's Rintocchi muti brings the Campanaro di San Giorgio up to the bell
// chamber once its three clappers are out: bells' rings and a hammer's boom in eight metres of floor, 44 m over the lagoon. The
// Cardinale's L'incoronazione walks him from the high altar to the Bacino, and three waves of monaci neri come for him on the way.
// Tuned with scripts/balance.ts for a hero who walks in from the Governatrice in level 2's gear.
import type { World } from '../core/physics.ts';
import { BELFRY, CENACOLO } from '../level/zones/sangiorgio.ts';
import { PRIEST, killAll, pull, revive, spawnPriests, type Bounds, type CasterKind, type Priest } from './caster.ts';
import { FARI_LIT, MUTE, ONDATE, VINO, type SideId } from '../quest/squero.ts';
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
  hp: 3600, xp: 180,
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
 * Il Commissario delle Arti, who cut the Nozze di Cana from their frame in 1797 and never left with them (the Veronese's La
 * tela tagliata). Asleep until that quest is taken, then at rest in the chiostro dei cipressi. The sabre in melee and a
 * pistol's ice-blue shot at range; the Squarcio, a long narrow slash along the floor where the hero stood (the Calice's
 * wedge, cut thin); from the first blow the Inventario, red chalk crosses round the hero that burst; at half his health his
 * three granatieri climb into the cloister (main.ts) and he quickens. A miniboss for a hero at about level 17.
 */
export const COMMISSARIO: CasterKind = {
  ...PRIEST,
  name: 'Il Commissario delle Arti',
  hp: 7000, xp: 300,
  aggro: 9, leash: 40, blind: 12,
  range: 16, keep: 0, speed: 3.6, walk: 6, cast: 1.5, cooldown: 3.6, bolt: 16, damage: 150,
  radius: 0.6, margin: 1,
  melee: { reach: 1.8, hit: 3, windup: 0.7, swing: 1.3, cooldown: 2.6, damage: 190 },
  pour: { every: 10, cast: 1.3, angle: Math.PI / 7, length: 12, damage: 400 }, // the Squarcio
  phases: { at: [1, 0.5], marks: { every: 8, n: 3, cast: 1.6, radius: 2, spread: 3.4, damage: 340 }, haste: 1.2, berserk: 240, rage: 2.5 }, // the Inventario
  resist: 0.5,
};
/** His granatieri, drowned grenadiers of the Armée d'Italie (the marinai's bodies in blue): a hidden pack he calls at half health. */
export const GRANATIERE: CasterKind = { ...MARINAIO, hp: 420, xp: 24, aggro: 14, melee: { ...MARINAIO.melee!, damage: 100 } };

/**
 * Il Campanaro di San Giorgio, who rang the bells for the pope of 1800 until his hands bled (Padre Archivista's Rintocchi muti): a
 * monk's body grown to 2.8 m and gone to bronze, the bell hammer in his fist. He comes up the stair once the three clappers are out,
 * into the bell chamber's eight metres: from the first blow the Rintocchi (rings to jump, as the Abate's), and the Rimbombo, the
 * hammer brought down on the floor (a nova to get out of, in a room with no room). Half down he hurries; berserk at four minutes.
 */
export const CAMPANARO: CasterKind = {
  ...MONACO,
  name: 'Il Campanaro di San Giorgio',
  hp: 5000, xp: 260,
  aggro: 9, leash: 30, blind: 12,
  speed: 3.4, walk: 6, radius: 0.6, margin: 0.9,
  melee: { reach: 1.8, hit: 3, windup: 0.8, swing: 1.4, cooldown: 2.6, damage: 200 },
  nova: { every: 10, cast: 2, radius: 3.4, damage: 380 }, // the Rimbombo
  toll: { phase: 1, every: 11, n: 3, gap: 0.9, speed: 5, width: 1, reach: 10, damage: 220 },
  phases: { at: [1, 0.5], haste: 1.2, berserk: 240, rage: 2.5 },
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

/**
 * The side quests' weakenings of the Abate (quest/squero.ts `prep`), laid on ABATE as his fight starts (`prepare`, main.ts
 * at the pull; scripts/balance.ts PREPS=). Each turns the untouched copy, so a fight only ever has the ones earned.
 */
export const PREPS: Record<string, { text: string; apply: (k: CasterKind) => void }> = {
  faro: { text: "La Lanterna del faro: l'acqua alta lascia un'isola asciutta in più", apply: (k) => { k.tide = { ...k.tide!, n: k.tide!.n + 1 }; } }, // I fari della darsena
  calice: { text: 'Le Ampolle di San Benedetto: il Calice di Cana brucia il 40% in meno', apply: (k) => { k.pour = { ...k.pour!, damage: Math.round(k.pour!.damage * 0.6) }; } }, // Acqua di San Benedetto
  rintocchi: { text: 'Il Batacchio di San Giorgio: le campane dell\'Abate suonano due rintocchi, non tre', apply: (k) => { k.toll = { ...k.toll!, n: k.toll!.n - 1 }; } }, // Rintocchi muti
  benedizione: { text: 'La Benedizione apostolica: ogni tuo colpo sull\'Abate pesa il 10% in più', apply: (k) => { k.frail = (k.frail ?? 1) * 1.1; } }, // L'incoronazione
};
const PRISTINE = { ...ABATE, frail: 1 }; // every key a weakening may set, so a fight without it is rid of it
/** ABATE as it was written, with the weakenings `ids` on it (unknown ids are ignored). */
export function prepare(ids: readonly string[]): void {
  Object.assign(ABATE, PRISTINE);
  for (const id of ids) PREPS[id]?.apply(ABATE);
}

/** Before the empty frame, facing the door from the antirefettorio (+Z). */
export const ABATE_AT = { x: -530, z: 11 };
/** His floor: the refectory between the monks' tables (x CENACOLO ± 1.8), the frame wall and the far door. */
export const ABATE_BOUNDS: Bounds = { x0: CENACOLO.x0 + 3.5, x1: CENACOLO.x1 - 3.5, z0: CENACOLO.z0 + 3, z1: CENACOLO.z1 - 2.5 };

type Spot = [number, number];
/**
 * `hidden`: asleep (dead, out of sight, worth nothing) until that side quest reaches that step (or `also` is taken), then up and on the hero (`rouse`),
 * `say` called out; `rest`: up at its spots instead, waiting; `under`: and only once the Commissario, fighting, is under that
 * share of his health (main.ts puts them back to sleep when he is back at rest).
 */
export interface Pack { label: string; at: Spot; bounds: Bounds; members: [CasterKind, number, number][]; hidden?: { quest: SideId; step: number; say: string; rest?: true; under?: number; also?: SideId } }
const rect = (x0: number, x1: number, z0: number, z1: number): Bounds => ({ x0, x1, z0, z1 });
const QUAY = rect(-376, -301, 0.5, 19.5), ALLORI = rect(-545, -515, 47, 77), CIPRESSI = rect(-501, -465, 47, 77);
/** The procession's floors: the crossing with its transepts, the nave with its aisles, the piazzale before the portal. */
const CROCIERA = rect(-539, -521, 81, 123), NAVATA = rect(-519, -479, 87, 117), PIAZZALE = rect(-477.5, -444.5, 86.5, 133.5);
/** The darsena with both quays out to the lighthouses (zones/sangiorgio.ts darsena): the Fanalista's wave, and the Nostromo once it calls him. */
export const DARSENA = rect(-599.5, -562.5, 124.5, 149.5);
/** The bell chamber's floor inside its parapet (zones/sangiorgio.ts BELFRY). */
export const BELL_FLOOR = rect(BELFRY.x0 + 0.3, BELFRY.x1 - 0.3, BELFRY.z0 + 0.3, BELFRY.z1 - 0.3);

/**
 * Every pack of level 3, in the order saved games index them (appended after level 2's mobs; the hidden ones after the
 * Abate, so new ones go at the end). `at`: where the pack faces at rest; `members`: kind and spot.
 */
export const PACKS: Pack[] = [
  { label: 'Fondamenta San Giovanni', at: [-326, 11], bounds: QUAY, members: [[MARINAIO, -323, 9], [MARINAIO, -329, 9], [MONACO, -326, 14]] },
  { label: 'Fondamenta San Giovanni', at: [-358, 10], bounds: QUAY, members: [[MONACO, -355, 8], [MONACO, -361, 8], [AMANUENSE, -358, 14]] },
  { label: 'Punta della Giudecca', at: [-388, -7], bounds: rect(-403.5, -376, -13.5, 19.5), members: [[MONACO, -388, -4], [AMANUENSE, -385, -9], [AMANUENSE, -391, -9]] },
  { label: 'Piazzale di San Giorgio', at: [-462, 92], bounds: PIAZZALE, members: [[MARINAIO, -459, 90], [MARINAIO, -465, 90], [AMANUENSE, -462, 95]] },
  { label: 'Piazzale di San Giorgio', at: [-462, 121], bounds: PIAZZALE, members: [[MONACO, -459, 119], [MONACO, -465, 119], [MARINAIO, -462, 124]] },
  { label: 'Basilica di San Giorgio Maggiore', at: [-500, 102], bounds: rect(-519, -479, 95.5, 108.5), members: [[MONACO, -497, 100], [MONACO, -497, 104], [AMANUENSE, -503, 102]] },
  { label: 'Crociera sotto la cupola', at: [-530, 108], bounds: CROCIERA, members: [[AMANUENSE, -527, 113], [AMANUENSE, -533, 113], [MONACO, -530, 106]] },
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
  // Hidden. I fari della darsena: the second lamp lit (the east one, by the Fanalista), the drowned climb out of the basin onto its quay.
  { label: 'Darsena di San Giorgio', at: [-581, 141], bounds: DARSENA, members: [[MARINAIO, -569, 136.5], [MARINAIO, -569, 140.5], [MARINAIO, -564, 135.5], [MARINAIO, -563.5, 146]], hidden: { quest: 'fari', step: FARI_LIT, say: 'I fari ardono: i marinai annegati salgono dal bacino, e il Nostromo carica!' } },
  // Hidden. Acqua di San Benedetto: wine drawn from the well, the cellar's monks who bless it come up round it.
  { label: 'Chiostro degli allori', at: [-530, 62], bounds: ALLORI, members: [[MONACO, -532.5, 64.5], [MONACO, -527.5, 64.5], [MONACO, -530, 58.5]], hidden: { quest: 'acqua', step: VINO, say: 'I monaci della cantina salgono al pozzo a benedire il loro vino!' } },
  // Hidden. La tela tagliata taken: the Commissario delle Arti back in the chiostro dei cipressi, where the troops slept; at half his health his granatieri.
  { label: 'Chiostro dei cipressi', at: [-483, 62], bounds: CIPRESSI, members: [[COMMISSARIO, -483, 54]], hidden: { quest: 'tela', step: 0, say: 'Nel chiostro dei cipressi qualcuno conta i quadri ad alta voce, in francese...', rest: true, also: 'drago' } }, // and for the lance's butt
  { label: 'Chiostro dei cipressi', at: [-483, 58], bounds: CIPRESSI, members: [[GRANATIERE, -497, 50], [GRANATIERE, -469, 50], [GRANATIERE, -483, 74]], hidden: { quest: 'tela', step: 0, say: 'Il Commissario delle Arti chiama i granatieri: «À moi, la garde!»', under: 0.5, also: 'drago' } },
  // Hidden. Rintocchi muti: the third clapper out, the Campanaro comes up the stair into the bell chamber, his floor between the parapets.
  { label: 'Cella campanaria', at: [-574, 116], bounds: BELL_FLOOR, members: [[CAMPANARO, -573.4, 113.6]], hidden: { quest: 'rintocchi', step: MUTE, say: 'Le campane mute tremano: il Campanaro di San Giorgio sale dalla scala a riprendersi i batacchi!' } },
  // Hidden. L'incoronazione: as the Cardinale stops under the dome, mid-nave and on the sagrato, monaci neri close on him (main.ts aims them at him, not the hero).
  { label: 'Crociera sotto la cupola', at: [-530, 102], bounds: CROCIERA, members: [[MONACO, -526, 93], [MONACO, -534, 93], [MONACO, -534, 111]], hidden: { quest: 'incoronazione', step: ONDATE[0], say: 'Dai transetti escono i monaci neri: «Nessun papa uscirà da San Giorgio!»' } },
  { label: 'Basilica di San Giorgio Maggiore', at: [-499, 102], bounds: NAVATA, members: [[MONACO, -492, 97], [MONACO, -506, 97], [MONACO, -492, 107], [MONACO, -506, 107]], hidden: { quest: 'incoronazione', step: ONDATE[1], say: 'Dalle navate laterali altri monaci neri si gettano sul Cardinale!' } },
  { label: 'Piazzale di San Giorgio', at: [-468, 102], bounds: PIAZZALE, members: [[MONACO, -461, 95], [MONACO, -461, 109], [MONACO, -470, 93], [MONACO, -470, 111]], hidden: { quest: 'incoronazione', step: ONDATE[2], say: 'Sul sagrato i monaci neri sbarrano la via al Bacino: difendi il Cardinale!' } },
];

export interface Level3 { all: Priest[]; boss: Priest; bibliotecario: Priest; nostromo: Priest; commissario: Priest; campanaro: Priest; hidden: { pack: Pack; members: Priest[] }[] }

const GONE = 1e3; // s a sleeper has lain dead: past the sink, out of sight (enemies/priests.ts)

/** Level 3's casters: the packs, then the Abate, then the hidden packs asleep, always in this order. */
export function spawnLevel3(world: World): Level3 {
  const groups = PACKS.map((p) => p.members.map(([, x, z]) => [x, z, Math.atan2(x - p.at[0], z - p.at[1])] as [number, number, number]));
  const packs = spawnPriests(world, groups, PACKS.map((p) => p.bounds), PACKS.map((p) => p.members.map(([k]) => k)));
  const [[boss]] = spawnPriests(world, [[[ABATE_AT.x, ABATE_AT.z, Math.PI]]], [ABATE_BOUNDS], [[ABATE]]);
  const hidden = PACKS.flatMap((pack, i) => (pack.hidden ? [{ pack, members: packs[i] }] : []));
  for (const { members } of hidden) lull(members);
  const all = [...packs.filter((_, i) => !PACKS[i].hidden).flat(), boss, ...hidden.flatMap((h) => h.members)];
  return { all, boss, bibliotecario: all.find((m) => m.kind === BIBLIOTECARIO)!, nostromo: all.find((m) => m.kind === NOSTROMO)!, commissario: all.find((m) => m.kind === COMMISSARIO)!, campanaro: all.find((m) => m.kind === CAMPANARO)!, hidden };
}

/**
 * A hidden pack is due to wake: its quest that far, the Abate standing, and an `under` pack only while the Commissario,
 * fighting, is under that share of his health.
 */
export function due(h: Level3['hidden'][number], l3: Level3, reached: (q: SideId, step: number) => boolean, boss3Dead: boolean): boolean {
  const H = h.pack.hidden!, c = l3.commissario;
  return !boss3Dead && (reached(H.quest, H.step) || (!!H.also && reached(H.also, 0))) && (!H.under || (c.state !== 'pray' && c.state !== 'dead' && c.state !== 'evade' && c.hp <= c.kind.hp * H.under));
}

/** A hidden pack up at its spots, whole; `fight`: and on the hero at once (else at rest, as a load finds it). */
export function rouse(members: Priest[], world: World, fight: boolean): void {
  for (const m of members) revive(m, world);
  if (fight && members.length) pull(members[0]);
}

/** A woken pack back to sleep (the granatieri, once their Commissario is back at rest): dead, out of sight, as spawned. */
export function lull(members: Priest[]): void {
  killAll(members);
  for (const m of members) m.t = GONE;
}
