import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type LevelBuilder, extrude, ring, shaped } from '../builder.ts';
import { material, type Role } from '../materials.ts';
import { Z } from '../plan.ts';
import { groundPatch } from '../ground.ts';
import { Props, bench, cypress, fruitTree, rng, shrub } from '../props.ts';
import { place } from '../arredi.ts';
import { bitta, fanale, lampPost } from './giudecca.ts';
import { front, houses } from '../facades.ts';

// Level 3 (see the task's DESIGN.md): past the Tre Oci the Fondamenta San Giovanni runs on to the Punta della
// Giudecca, the island's eastern tip, where Mastro Iseppo's gondola waits at a pontile; across the water
// San Giorgio Maggiore. East is -X, north +Z (level/plan.ts). Compressed about half, buildings about 0.7.
//   fondamenta S. Giovanni x -376..-300, z 0..20, houses south (z < 0); its chain at x -302 (quest/progress.ts)
//   punta              x -404..-376, z -14..20, the Cipriani's garden wall at z -14; pontile x -417..-404, z 8..12
//   San Giorgio        x -600..-444, z -40..134 (the darsena to z 150): its west shore at x -444
//   piazzale + molo    x -478..-444, z 86..134; the approdo (landing) x -444..-433, z 98..102
//   basilica           facade x -478 (facing +X, the Giudecca), nave and aisles to x -520 (z 86..118), crossing and
//                      transepts x -520..-540 (z 80..124, dome r 9.5), presbytery and monks' choir x -540..-568 (z 92..112)
//   campanile          x -578..-570, z 112..120; darsena x -600..-562, z 124..150, its lighthouses at the mouth
//   chiostro allori    x -548..-512, z 44..80 (the south transept's door at x -530); Longhena's passage at z 62
//   chiostro cipressi  x -504..-462, z 44..80; scalone x -498..-484, z 20..44 up to the library floor LIB_F
//   biblioteca         x -508..-470, z -6..20 on a solid ground floor; antirefettorio x -536..-524, z 36..44
//   cenacolo           x -548..-512, z 4..36 (the boss's hall); giardino and teatro verde z -36..-8, the riva x -452..-444

/** The Punta's water edge, and the pontile where the gondola waits (across its end, `FERRY_A`). */
export const PUNTA_END = -404;
export const PIER = { x0: -417, x1: PUNTA_END, z0: 8, z1: 12 };
/** The approdo in front of the basilica, and its gondola berth. */
export const LANDING = { x0: -444, x1: -433, z0: 98, z1: 102 };
/**
 * Where the gondola lies at each end (its middle, on the water, and its yaw, the bow +X): across the end of each landing stage,
 * its 0.72 m half-beam 0.3 m off the stage's invisible edge (0.6 m out), the bow north at the Punta and south at San Giorgio,
 * the way each trip leaves (quest/ferry.ts rows OUT and BACK to arrive the same way, so it never swings through a stage).
 */
export const FERRY_A = { x: PIER.x0 - 1.62, z: (PIER.z0 + PIER.z1) / 2, yaw: -Math.PI / 2 };
export const FERRY_B = { x: LANDING.x1 + 1.62, z: (LANDING.z0 + LANDING.z1) / 2, yaw: Math.PI / 2 };
/** The striped paline the gondola ties up to: by each stage's outer corners, clear of the hull. */
export const PALINE: [number, number][] = [[PIER.x0 - 0.3, PIER.z0 - 0.8], [PIER.x0 - 0.3, PIER.z1 + 0.8], [LANDING.x1 + 0.3, LANDING.z0 - 0.8], [LANDING.x1 + 0.3, LANDING.z1 + 0.8]];
export const SG = { x0: -600, x1: -444, z0: -40, z1: 134 };
export const FAC = -478; // the basilica's front
/** The church's interior dress (marble floors, pilasters, niches, the dome's ribs): its own zone, kept off level 2's GPU. */
export const INTERNO = 'sangiorgio-interno';
export const LIB_F = 4.8; // the library's floor
/**
 * The library's long walnut cases, west then east, each split into eight bays counted from the door's end (z 18.8 down to
 * -4.8): where one stands to shelve a book, a metre off the case (Il libro di sabbia, quest/squero.ts).
 */
export const SCANSIE = [-505.8, -472.2].flatMap((x) => Array.from({ length: 8 }, (_, i) => ({ x, y: LIB_F, z: 18.8 - (i + 0.5) * 2.95 })));
/** The Borges labyrinth's middle, in the garden: its stone drum. */
export const LABIRINTO = { x: -496, y: 0, z: -14 };
export const CENACOLO = { x0: -548, x1: -512, z0: 4, z1: 36 };
const CEN_CEIL = 11.2; // the Cenacolo's ceiling, coffered (ceilings())
/**
 * The open stretch of the Manica lunga (convento() and dormitorio()): a vaulted corridor from the chiostro degli allori's west walk
 * (its door at z 62) between the monks' cells, two of them broken open. The rest of the range stays shut.
 */
export const DORM = { x0: -566, x1: -548, z0: 56.5, z1: 67.5, c0: 60.5, c1: 63.5 };
/** The chiostro dei cipressi's well-head, in the lawn between four cypresses. */
const POZZO2 = { x: -492, z: 57.5 };
/** The Cenacolo's two tables: their axes, set off the long walls so the monks' benches stand behind them against the wainscot. */
const TABLES = [CENACOLO.x0 + 2, CENACOLO.x1 - 2];
const SGX = -530, SGZ = 102; // the crossing, under the dome
const DOME = 9.5, RING = 20; // dome radius, top of the crossing's walls
const P = 0.6; // presbytery and choir floor
/** The aisles' minor order: its pilasters (x), and the height its arches spring from, over the capitals. */
const AISLE = [-485, -492, -499, -506, -510.4, -517.6], SPRING = 7.4;

export function buildPunta(b: LevelBuilder): void {
  b.zone('punta');
  const p = new Props(b, 97);
  b.box(PUNTA_END, -340, -1.2, 0, -40, Z.quayEdge, 'ground');
  b.area('Fondamenta San Giovanni', -376, -303, 0, Z.quayEdge); // past the chain at -302
  b.area('Punta della Giudecca', PUNTA_END, -376, -14, Z.quayEdge);
  b.area('Pontile della Punta', PIER.x0, PIER.x1, PIER.z0, PIER.z1);
  b.floor(-376, -300, 0, Z.quayEdge, 'paving');
  b.floor(PUNTA_END, -376, -14, Z.quayEdge, 'paving', 0, 0.02);
  b.box(PUNTA_END, -300, 0, 0.12, Z.quayEdge - 0.25, Z.quayEdge, 'stoneDark', { camera: false });
  b.barrier(PUNTA_END - 0.6, -300, Z.quayEdge, Z.quayEdge + 0.6);
  b.box(PUNTA_END, PUNTA_END + 0.25, 0, 0.12, -14, Z.quayEdge, 'stoneDark', { camera: false });
  b.barrier(PUNTA_END - 0.6, PUNTA_END, -14, PIER.z0);
  b.barrier(PUNTA_END - 0.6, PUNTA_END, PIER.z1, Z.quayEdge);
  for (let x = -306; x > -372; x -= 9.5) bitta(p, x, Z.quayEdge - 0.5);

  // Houses along the fondamenta past the Tre Oci, and the Cipriani's garden wall closing the Punta to the south.
  houses(b, p, -358, -340, -40, 0, 11, 's', 301);
  houses(b, p, -376, -358, -40, 0, 14, 'sw', 302, 'mass');
  for (const x of [-312, -330, -352, -370]) fanale(b, p, x, 0);
  b.wallX(-14, PUNTA_END, -376, { h: 3.4, role: 'brick', trim: true });
  groundPatch(b, PUNTA_END, -376, -40, -14.3, 'grass');
  for (const [x, z] of [[-400, -18], [-396, -24], [-388, -19], [-382, -30], [-394, -34], [-380, -21]]) cypress(p, x, z, p.rand(6, 8.5));
  for (const [x, z] of [[-390, -27], [-398, -30]]) fruitTree(p, x, z, 0xd08030, 1);

  // The campo at the tip: a capitello with its lamp, benches looking at San Giorgio, a lamp post.
  p.box(-380.6, -379.4, 0, 2.2, -12.8, -11.6, 'stone');
  p.box(-380.9, -379.1, 2.2, 3.4, -12.9, -11.5, 'stoneDark');
  p.box(-380.5, -379.5, 2.4, 3.1, -11.55, -11.45, 'azure'); // the Madonna's little picture
  p.cone(-380, 3.4, -12.2, 0.75, 0.6, 'roof');
  b.world.add(-380, -12.2, 0.6, 0.6, 0, 3.4);
  b.lights.push({ x: -380, y: 2.8, z: -11.2, kind: 'candle' });
  bench(p, -392, 16.5, Math.PI / 2);
  bench(p, -398, 4, Math.PI / 2);
  lampPost(b, p, -396, 10, 0);
  lampPost(b, p, -384, -6, 0);

  // The pontile: planks on piles, striped paline where the gondola ties up.
  b.box(PIER.x0, PIER.x1, -0.35, 0, PIER.z0, PIER.z1, 'wood', { camera: false });
  for (let x = PIER.x1 - 0.4; x > PIER.x0; x -= 1.6) for (const z of [PIER.z0 + 0.2, PIER.z1 - 0.2]) p.disc(x, -1.2, z, 0.14, 1.2, 'wood');
  b.barrier(PIER.x0, PIER.x1, PIER.z0 - 0.6, PIER.z0);
  b.barrier(PIER.x0, PIER.x1, PIER.z1, PIER.z1 + 0.6);
  b.barrier(PIER.x0 - 0.6, PIER.x0, PIER.z0, PIER.z1);
  for (const [x, z] of PALINE.slice(0, 2)) palina(p, x, z);
  lampPost(b, p, PIER.x0 + 0.6, PIER.z0 + 0.5, 0);
  p.flush();
}

/** A Venetian mooring pole, white and red rings, out of the water. */
function palina(p: Props, x: number, z: number): void {
  for (let i = 0; i < 6; i++) p.disc(x, -1.2 + i * 0.7, z, 0.13, 0.7, 'wood', i % 2 ? 0x8c1622 : 0xe8e0d0);
  p.cone(x, 3, z, 0.16, 0.3, 'iron');
}

export function buildSanGiorgio(b: LevelBuilder): void {
  b.zone('sangiorgio');
  const p = new Props(b, 113);
  shore(b, p);
  basilica(b, p);
  facade(b, p);
  campanile(b, p);
  monastery(b, p);
  library(b, p);
  cenacolo(b, p);
  dormitorio(b);
  convento(b);
  garden(b, p);
  darsena(b, p);
  lagoon(b, p);
  p.flush();
}

function shore(b: LevelBuilder, p: Props): void {
  const { x0, x1, z0, z1 } = SG;
  b.box(x0, x1, -1.2, 0, z0, z1, 'ground');
  b.area('Piazzale di San Giorgio', FAC, x1, 86, z1);
  b.area('Approdo di San Giorgio', LANDING.x0, LANDING.x1, LANDING.z0, LANDING.z1);
  b.area('Riva di San Giorgio', -452, x1, -36, 86);
  b.area('Fondamenta di San Giorgio', -568, FAC, 118, z1);
  b.floor(FAC, x1, 86, z1, 'paving');
  b.floor(-452, x1, -36, 86, 'paving');
  b.floor(-568, FAC, 118, z1, 'paving');
  // Edge stones and the invisible edge all round; the approdo's gap on the west shore.
  b.box(x1 - 0.25, x1, 0, 0.12, z0, z1, 'stoneDark', { camera: false });
  b.box(-562, x1, 0, 0.12, z1 - 0.25, z1, 'stoneDark', { camera: false });
  b.barrier(x1, x1 + 0.6, z0, LANDING.z0);
  b.barrier(x1, x1 + 0.6, LANDING.z1, z1);
  b.barrier(-562, x1 + 0.6, z1, z1 + 0.6);
  b.barrier(x0 - 0.6, x0, z0, 150);
  b.barrier(x0, x1, z0 - 0.6, z0);
  // The approdo: a wooden landing stage, the gondola's berth across its end.
  b.box(LANDING.x0, LANDING.x1, -0.35, 0, LANDING.z0, LANDING.z1, 'wood', { camera: false });
  for (let x = LANDING.x1 - 0.4; x > LANDING.x0; x -= 1.6) for (const z of [LANDING.z0 + 0.2, LANDING.z1 - 0.2]) p.disc(x, -1.2, z, 0.14, 1.2, 'wood');
  b.barrier(LANDING.x0, LANDING.x1, LANDING.z0 - 0.6, LANDING.z0);
  b.barrier(LANDING.x0, LANDING.x1, LANDING.z1, LANDING.z1 + 0.6);
  b.barrier(LANDING.x1, LANDING.x1 + 0.6, LANDING.z0, LANDING.z1);
  for (const [x, z] of PALINE.slice(2)) palina(p, x, z);
  lampPost(b, p, LANDING.x1 - 0.6, LANDING.z0 + 0.5, 0);
  for (let z = -30; z < 134; z += 9.5) if (z < 96 || z > 104) bitta(p, x1 - 0.5, z);
  for (const z of [92, 128]) lampPost(b, p, -448, z, 0);
  for (const z of [-20, 10, 40, 70]) lampPost(b, p, -446, z, 0);
  bench(p, -458, 128, 0);
  bench(p, -470, 128, 0);
}

/** A stone wall run (and the occlusion piece it makes); `doors` cut through it. */
const stone = (h: number, doors: { at: number; w?: number; h?: number; y0?: number; arch?: boolean }[] = [], y0 = 0) => ({ h, y0, t: 0.8, role: 'stone' as Role, doors, trim: true });
/** The basilica's walls: white Istrian stone inside, as Palladio's are, reading in the firelit dark. */
const white = (h: number, doors: Parameters<typeof stone>[1] = []) => ({ ...stone(h, doors), role: 'istria' as Role });

function basilica(b: LevelBuilder, p: Props): void {
  b.area('Basilica di San Giorgio Maggiore', -520, FAC, 86, 118);
  b.area('Crociera sotto la cupola', -540, -520, 80, 124);
  b.area('Presbiterio di San Giorgio', -554, -540, 92, 112);
  b.area('Coro dei monaci', -568, -554, 92, 112);
  b.floor(-519, FAC - 1, 100.6, 103.4, 'cloth', 0, 0.03); // the carpet up the nave

  // Walls: the aisles' outer walls, the transepts, presbytery and choir; the nave's upper walls on the colonnades.
  b.wallX(86, FAC, -520, white(13));
  b.wallX(118, FAC, -520, white(13));
  b.wallX(80, -540, -520, white(RING, [{ at: SGX, w: 3, h: 4.6, arch: true }])); // into the chiostro degli allori
  b.wallX(124, -540, -520, white(RING));
  for (const [z0, z1] of [[80, 86], [118, 124]]) b.wallZ(-520, z0, z1, white(RING));
  for (const [z0, z1] of [[80, 92], [112, 124]]) b.wallZ(-540, z0, z1, white(RING));
  b.wallX(92, -540, -568, white(16));
  b.wallX(112, -540, -568, white(16));
  b.wallZ(-568, 92, 112, white(16));
  for (const z of [94, 110]) {
    b.box(FAC, -520, 12.4, RING, z - 0.3, z + 0.3, 'istria', { collide: false });
    b.part(null, FAC, -520, 11.8, 12.6, z - 0.6, z + 0.6, 'istria');
    for (const x of [-485, -492, -499, -506, -513]) b.order(x, z, 0.75, 0, 11.8, 'istria');
  }
  for (const [x, z] of [[-520, 92], [-520, 112], [-540, 92], [-540, 112]]) b.box(x - 1.2, x + 1.2, 0, RING, z - 1.2, z + 1.2, 'istria'); // the crossing's piers

  // Ceilings and roofs: the aisles flat, the nave's barrel vault, the transepts and the choir flat; the dome on its drum.
  for (const [z0, z1] of [[86, 94], [110, 118]]) {
    b.box(FAC, -520, 13, 13.4, z0, z1, 'istria', { collide: false });
    b.hipRoof(FAC, -520, z0, z1, 13.4, 0.5, 0.3);
  }
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 42, 32, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), material('istria', true)); // the upper half, along X
  vault.position.set((FAC - 520) / 2, 12.6, 102);
  b.add(vault, 'istria');
  b.cameraBlockers.push(vault);
  b.hipRoof(FAC, -520, 94, 110, RING + 1); // clear of the vault's crown (RING + 0.6)
  for (const [z0, z1] of [[80, 92], [112, 124]]) b.box(-540, -520, RING, RING + 0.4, z0, z1, 'stone', { collide: false });
  b.hipRoof(-540, -520, 80, 92, RING + 0.4);
  b.hipRoof(-540, -520, 112, 124, RING + 0.4);
  b.box(-568, -540, 16, 16.4, 92, 112, 'stone', { collide: false });
  b.hipRoof(-568, -540, 92, 112, 16.4);
  const sq = new THREE.Shape([new THREE.Vector2(-540, -92), new THREE.Vector2(-520, -92), new THREE.Vector2(-520, -112), new THREE.Vector2(-540, -112)]);
  sq.holes.push(new THREE.Path().absarc(SGX, -SGZ, DOME, 0, Math.PI * 2, true));
  const ceil = new THREE.Mesh(new THREE.ExtrudeGeometry(sq, { depth: 0.8, bevelEnabled: false }), material('istria'));
  ceil.rotation.x = -Math.PI / 2;
  ceil.position.y = RING;
  b.add(ceil, 'istria');
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(DOME, DOME, 4, 40, 1, true), material('istria', true));
  drum.position.set(SGX, RING + 2.6, SGZ);
  b.add(drum, 'istria');
  const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), material('roof', true));
  dome.position.set(SGX, RING + 4.6, SGZ);
  b.add(dome, 'roof');
  const inner = new THREE.Mesh(new THREE.SphereGeometry(DOME - 0.3, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), material('istria', true));
  inner.position.set(SGX, RING + 4.6, SGZ);
  b.add(inner, 'istria');
  b.cameraBlockers.push(ceil, drum, dome);
  b.column(SGX, SGZ, 1.4, RING + 4.6 + DOME - 0.4, RING + 4.6 + DOME + 3.2, 'stone', false); // the lantern
  b.add(new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.8, 12), material('roof')), 'roof').position.set(SGX, RING + 4.6 + DOME + 4.6, SGZ);
  for (let k = 0; k < 8; k++) { // the drum's windows
    const a = (k / 8) * Math.PI * 2;
    b.part(new THREE.Matrix4().makeRotationY(a).setPosition(SGX + Math.sin(a) * (DOME + 0.05), 0, SGZ + Math.cos(a) * (DOME + 0.05)), -0.6, 0.6, RING + 1.2, RING + 3.6, -0.05, 0.05, 'lantern');
  }
  b.lights.push({ x: SGX, y: RING + 6, z: SGZ, kind: 'glow', color: 0x8fb0ff }); // moonlight through the lantern

  // Presbytery: raised, the high altar with Campagna's Evangelists bearing the globe, Tintoretto's two canvases on its walls.
  b.box(-554, -541.6, 0, P, 92.4, 111.6, 'stone');
  b.stairs('x', 94, 110, -540, -541.6, 0, P, 3, 'stone');
  b.box(-547.6, -544.4, P, P + 1.2, 98.6, 105.4, 'stoneDark');
  b.part(null, -547.4, -544.6, P + 1.2, P + 1.35, 98.8, 105.2, 'gold');
  for (const [dx, dz] of [[-0.9, -1.4], [0.9, -1.4], [-0.9, 1.4], [0.9, 1.4]]) { // the four Evangelists
    p.disc(-546 + dx, P + 1.35, SGZ + dz, 0.28, 1.5, 'gold');
    p.blob(-546 + dx, P + 3, SGZ + dz, 0.22, 0.26, 0.22, 'gold');
  }
  p.blob(-546, P + 4.2, SGZ, 1.3, 1.3, 1.3, 'gold'); // the globe
  p.disc(-546, P + 5.4, SGZ, 0.06, 1.4, 'gold'); // God the Father, as a cross over it
  p.box(-546.5, -545.5, P + 6.2, P + 6.35, SGZ - 0.06, SGZ + 0.06, 'gold');
  for (const z of [99.5, 104.5]) { p.disc(-545, P + 1.35, z, 0.05, 0.4, 'flower'); b.lights.push({ x: -545, y: P + 1.8, z, kind: 'candle' }); }
  b.lights.push({ x: -546, y: P + 3, z: SGZ, kind: 'glow', color: 0xffb060 });

  // The monks' choir behind its screen of columns: carved walnut stalls round three sides, the lectern in the middle.
  b.box(-568, -554, 0, P, 92.4, 111.6, 'stone');
  for (const z of [94.6, 98.2, 105.8, 109.4]) b.order(-554.4, z, 0.45, P, 7.4, 'istria');
  b.part(null, -555, -553.8, 7.4, 8, 93.6, 110.4, 'istria');
  // (the stalls and the lectern are Meshy pieces, interior() below: these are their colliders)
  for (const [z0, z1] of [[92.4, 93.8], [110.2, 111.6]]) b.box(-567.6, -556, P, P + 1.1, z0, z1, 'wood', { camera: false, visible: false });
  b.box(-567.6, -566.2, P, P + 1.1, 93.8, 110.2, 'wood', { camera: false, visible: false });
  b.box(-561.6, -560.4, P, P + 1.4, SGZ - 0.6, SGZ + 0.6, 'wood', { visible: false });
  for (const z of [96, 108]) b.lights.push({ x: -562, y: P + 2.6, z, kind: 'lamp' });

  // Side altars in the aisles, lamps hanging down the nave.
  for (const x of [-488, -502, -514]) for (const [z0, z1] of [[86.4, 87.8], [116.2, 117.6]]) {
    b.box(x - 1.6, x + 1.6, 0, 1.1, z0, z1, 'stoneDark', { camera: false }); // its altarpiece: interior() below
    b.lights.push({ x, y: 1.5, z: (z0 + z1) / 2, kind: 'candle' });
  }
  for (const x of [-486, -497, -508]) {
    p.rod(x, 12.6, SGZ, x, 7.5, SGZ, 0.02, 'iron');
    p.box(x - 0.3, x + 0.3, 6.9, 7.5, SGZ - 0.3, SGZ + 0.3, 'lantern');
    b.lights.push({ x, y: 7.1, z: SGZ, kind: 'lamp' });
  }
  for (const [x, z] of [[-524, 84], [-536, 84], [-524, 120], [-536, 120]]) b.lights.push({ x, y: 2.75, z: z + (z < 100 ? -3.6 : 3.6), kind: 'torch', nx: 0, nz: z < 100 ? 1 : -1 });
  interior(b);
}

/**
 * The church as a ruin of its grandeur (level/arredi.ts draws and breaks the furniture): pilasters, arches and the cornice on
 * the aisles' walls, saints in niches, ribs and cornices in the dome, torn banners off the colonnades, the choir's windows; then
 * pews in two blocks either side of the carpet, chairs strewn and knocked over, lecterns, candelabra, wrecked pews and heaps of
 * fallen marble. The carpet, the procession's way (quest/squero.ts PROCESSION), the transept's door, every pack's spot and the
 * quest items stay clear; colliders only on what stands (pews, chairs, lecterns), all under a metre.
 */
function interior(b: LevelBuilder): void {
  b.zone(INTERNO); // shown only past the Punta (main.ts stream): level 2's ground, which sees the island, never uploads it
  const r = rng(137);
  b.floor(-540, FAC, 86, 118, 'marble', 0, 0.02); // the red, cream and ochre slabs on the diagonal, worn and cracked
  b.floor(-540, -520, 80, 124, 'marble', 0, 0.02);
  b.floor(-568, -541.6, 92.4, 111.6, 'marble', P, 0.02); // presbytery and choir, on their raised floor
  // Aisle walls, after the real nave: a minor order of pilasters with Corinthian capitals carries a blind arch in every bay over
  // a darker recess (a side altar or a saint in a niche inside it); over the capitals the pilasters run on as flat lesenes to the
  // cornice under the vault.
  for (const [w, s] of [[86.4, 1], [117.6, -1]]) {
    const face = (d: number) => [Math.min(w, w + s * d), Math.max(w, w + s * d)] as const;
    for (const x of AISLE) {
      b.part(null, x - 0.55, x + 0.55, 0, 0.7, ...face(0.36), 'stoneDark');
      b.part(null, x - 0.42, x + 0.42, 0.7, SPRING - 0.6, ...face(0.26), 'istria');
      b.part(null, x - 0.36, x + 0.36, SPRING, 11.5, ...face(0.14), 'istria'); // the lesene
    }
    for (let k = 0; k < AISLE.length + 1; k++) {
      const x0 = k < AISLE.length ? AISLE[k] + 0.42 : -519.6, x1 = k ? AISLE[k - 1] - 0.42 : FAC - 0.4, c = (x0 + x1) / 2, r = (x1 - x0) / 2; // x0 < x1
      b.part(null, x0, x1, 0.7, SPRING, ...face(0.03), 'volta'); // the recess, warm as if the fires reached it, the white order standing out on it
      b.decor(shaped(lunette(c, SPRING, r - 0.3, w + s * 0.035, s)), 'stone');
      b.decor(shaped(arch(c, SPRING, r - 0.3, r, 0.22)).translate(0, 0, w + s * 0.11), 'istria'); // the arch
      b.part(null, c - 0.2, c + 0.2, SPRING + r - 0.34, SPRING + r + 0.1, ...face(0.3), 'istria'); // its keystone
    }
    b.part(null, FAC - 0.4, -519.6, 11.5, 12.1, ...face(0.5), 'istria');
    b.part(null, FAC - 0.4, -519.6, 12.1, 12.4, ...face(0.65), 'istria');
    for (const x of [-495.5, -508.2]) niche(b, x, w, s, 0.9, 'x');
  }
  // The nave's upper walls over the colonnades: a lunette window in each bay, moonlight in it.
  for (const [z, f] of [[94.3, 0], [109.7, -0.2]] as const) for (const c of [-481.5, -488.5, -495.5, -502.5, -509.5, -516.5]) {
    b.decor(shaped(arch(c, 15.2, 1.45, 1.8, 0.2)).translate(0, 0, z + f + 0.1), 'istria');
    b.part(null, c - 1.45, c + 1.45, 15.05, 15.25, z + f, z + f + 0.2, 'istria'); // its sill
    b.decor(shaped(lunette(c, 15.2, 1.45, z + (f ? -0.02 : 0.02), f ? -1 : 1)), 'glass');
  }
  // The transepts' ends either side of their doors, the choir's walls above the stalls and its back wall.
  for (const x of [-524.5, -535.5]) { niche(b, x, 80.4, 1, 0.9, 'x'); niche(b, x, 123.6, -1, 0.9, 'x'); }
  for (const x of [-565, -561, -557]) { niche(b, x, 92.4, 1, P + 4.2, 'x'); niche(b, x, 111.6, -1, P + 4.2, 'x'); }
  for (const z of [98, 106]) niche(b, -567.6, z, 1, P + 4.2, 'z');
  for (const x of [-563, -559]) for (const z of [92.38, 111.62]) b.part(null, x - 0.7, x + 0.7, 9.2, 13.4, z - 0.05, z + 0.05, 'glass');
  b.part(null, -567.65, -567.55, 9.2, 13.4, SGZ - 0.8, SGZ + 0.8, 'glass');
  b.part(null, -567.6, -540.4, 8.6, 9, 92.4, 92.9, 'istria'); // the choir's cornice over the niches
  b.part(null, -567.6, -540.4, 8.6, 9, 111.1, 111.6, 'istria');
  // The dome: a cornice where it springs and one at the drum's foot, sixteen ribs, a gilt ring under the lantern.
  const torus = (y: number, r0: number, t: number, role: Role) => b.decor(shaped(new THREE.TorusGeometry(r0, t, 6, 48).toNonIndexed().rotateX(Math.PI / 2).translate(SGX, y, SGZ)), role);
  torus(RING + 0.2, DOME - 0.15, 0.35, 'istria');
  torus(RING + 4.5, DOME - 0.35, 0.3, 'istria');
  torus(RING + 4.6 + DOME - 1.5, 1.6, 0.18, 'gold');
  for (let k = 0; k < 8; k++) b.decor(shaped(arch(0, 0, DOME - 0.75, DOME - 0.35, 0.3)).rotateY((k * Math.PI) / 8).translate(SGX, RING + 4.6, SGZ), 'istria');
  ceilings(b);
  // The canvases in their carved gilt frames (frames() below): Tintoretto's Ultima Cena (south) and Raccolta della manna
  // (north) on the presbytery's walls, his Deposizione and Bassano's Adorazione dei pastori over the aisles' altars, turn and
  // turn about.
  const quads: THREE.BufferGeometry[] = [], hung: Hung[] = [];
  const canvas = (x: number, y: number, z: number, s: number, w: number, h: number, [px, py, pw, ph]: readonly number[]) => {
    const g = new THREE.PlaneGeometry(w, h), uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (px + uv.getX(i) * pw) / 512, 1 - (py + (1 - uv.getY(i)) * ph) / 432);
    quads.push((s < 0 ? g.rotateY(Math.PI) : g).translate(x, y, z + s * 0.02));
    hung.push([x, y, z, s, w, h]);
  };
  for (const [z, s, art] of [[92.4, 1, CANVAS.cena], [111.6, -1, CANVAS.manna]] as const) canvas(-547, 5.7, z, s, 8.4, 5.4, art);
  for (const [k, x] of [-488, -502, -514].entries()) {
    canvas(x, 3.9, 86.45, 1, 2.6, 3.2, k % 2 ? CANVAS.pastori : CANVAS.deposizione);
    canvas(x, 3.9, 117.55, -1, 2.6, 3.2, k % 2 ? CANVAS.deposizione : CANVAS.pastori);
  }
  b.add(new THREE.Mesh(mergeGeometries(quads)!, CANVASES));
  frames(b, hung);
  walls(b);
  // Corinthian capitals: the colonnades' and the choir screen's over each column's own, the aisles' pilasters' set into the wall.
  capitals(b, [
    ...[94, 110].flatMap((z) => [-485, -492, -499, -506, -513].map((x): [number, number, number, number] => [x, 11.8, z, 0.75])),
    ...[94.6, 98.2, 105.8, 109.4].map((z): [number, number, number, number] => [-554.4, 7.4, z, 0.45]),
    ...[86.4, 117.6].flatMap((w) => AISLE.map((x): [number, number, number, number] => [x, SPRING, w, 0.4])),
  ]);
  // Banners hung off the colonnades into the nave, some torn short.
  for (const x of [-488.5, -495.5, -502.5, -509.5]) for (const z of [94.75, 109.25]) {
    const low = 6.6 + r() * 2.6;
    b.part(null, x - 0.7, x + 0.7, low, 11.6, z - 0.04, z + 0.04, 'cloth');
    b.part(null, x - 0.8, x + 0.8, 11.5, 11.7, z - 0.07, z + 0.07, 'gold');
  }

  // Braziers lit among the ruins (fx/torches.ts, iron and fire, no collider) at the colonnades' feet, in the transepts and the
  // crossing's corners: pools of warm light in the dark nave. Braziers, not candelabra: fuoco.glb's brazier is already on the
  // GPU on level 2 (the Zitelle's pair), a lit candelabrum would put a new prop there. The furniture's candelabra stay cold, and can break.
  for (const x of [-490.5, -504.5]) for (const z of [95.4, 108.6]) b.lights.push({ x, y: 1.1, z, kind: 'brazier' });
  for (const z of [84.6, 119.4]) b.lights.push({ x: -530, y: 1.1, z, kind: 'brazier' });
  // Warm light high up (no flame, no mesh: the pooled lights take the nearest) so the arches, the cornices, the vault and the
  // dome read over the firelit floor.
  for (const x of [-489, -503, -515]) b.lights.push({ x, y: 10, z: SGZ, kind: 'glow', color: 0xffb46a });
  // and low along the aisles, raking the pilasters so their capitals' leaves and the blind arches over them model
  for (const x of [-488.5, -502.5, -514]) for (const z of [88.8, 115.2]) b.lights.push({ x, y: 5, z, kind: 'glow', color: 0xffb46a });
  b.lights.push({ x: SGX, y: 9, z: SGZ, kind: 'glow', color: 0xffb46a }, { x: -561, y: 7.5, z: SGZ, kind: 'glow', color: 0xffb46a });
  // Pews: two blocks between the colonnades and the carpet, facing the altar (-X), a few knocked askew or wrecked; no row
  // within reach of the monks the Cardinale's procession wakes at x -492 and -506.
  const rows = [-481.5, -483.8, -486.1, -488.4, -495.5, -497.8, -500.1, -502.4, -509.6, -511.9, -514.2];
  for (const x of rows) for (const z of [97.6, 106.4]) {
    const roll = r();
    if (roll < 0.14) place(b, 'rotta', x, 0, z, -Math.PI / 2 + (r() - 0.5) * 0.6, 0.62);
    else if (roll < 0.2) place(b, 'panca', x - 0.3, 0, z, -Math.PI / 2 + 0.2, 1.05, { tilt: Math.PI / 2 * (r() < 0.5 ? 1 : -1), stretch: 2.4 }); // on its back
    else place(b, 'panca', x, 0, z, -Math.PI / 2 + (roll > 0.85 ? (r() - 0.5) * 0.5 : 0), 1.05, { solid: true, stretch: 2.4 });
  }
  // Chairs strewn in the aisles and the transepts' ends, many knocked over.
  const chairs: [number, number][] = [[-482, 89], [-483.5, 90.6], [-497, 89.8], [-504, 91], [-511, 89.5], [-517, 92], [-482.5, 114.6], [-490, 113], [-497.5, 115], [-504.5, 113.5], [-511.5, 114.8], [-517.5, 112],
    [-523, 85], [-525.6, 86.4], [-534.4, 85.4], [-537.4, 87], [-523.4, 118.8], [-526, 120.4], [-533.4, 118.2], [-537, 116.8]];
  for (const [x, z] of chairs) {
    const yaw = -Math.PI / 2 + (r() - 0.5) * 1.6;
    if (r() < 0.4) place(b, 'sedia', x, 0, z, yaw, 0.95, { tilt: Math.PI / 2 * (r() < 0.5 ? 1 : -1) });
    else place(b, 'sedia', x, 0, z, yaw, 0.95, { solid: true });
  }
  // Lecterns before the presbytery's steps and in the transepts, the choir's great one; candelabra by the side altars and
  // the crossing's corners, one or two thrown down.
  place(b, 'leggio', -537.6, 0, 97.4, -Math.PI / 2, 1.35, { solid: true });
  place(b, 'leggio', -537.6, 0, 106.6, -Math.PI / 2 + 0.3, 1.35, { solid: true });
  place(b, 'leggio', -527.5, 0, 85.5, Math.PI, 1.35, { tilt: Math.PI / 2 });
  place(b, 'leggio', -561, P, SGZ, Math.PI / 2, 2.1, { fixed: true });
  for (const x of [-488, -502, -514]) for (const z of [88.6, 115.4]) for (const d of [-2.1, 2.1]) {
    if (r() < 0.25) place(b, 'candelabro', x + d, 0, z + (z < 100 ? 0.4 : -0.4), r() * 6, 1.6, { tilt: Math.PI / 2 });
    else place(b, 'candelabro', x + d, 0, z, r() * 6, 1.6);
  }
  for (const [x, z] of [[-522.4, 90.4], [-537.6, 90.4], [-522.4, 113.6], [-537.6, 113.6]]) b.lights.push({ x, y: 1.1, z, kind: 'brazier' }); // the crossing's corners, lit
  // The monks' carved stalls round the choir, facing in.
  for (let x = -565.9; x < -556; x += 2.08) { place(b, 'stallo', x, P, 92.84, 0, 2.6); place(b, 'stallo', x, P, 111.16, Math.PI, 2.6); }
  for (let z = 95; z < 110; z += 2.08) place(b, 'stallo', -567.16, P, z, Math.PI / 2, 2.6);
  // Fallen marble: off cornices and the vault, in the aisles' corners and the transepts.
  for (const [x, z, s] of [[-516.8, 89.8, 0.24], [-489.5, 115.2, 0.2], [-536, 120.6, 0.22], [-523.2, 82.8, 0.16], [-480.6, 88.4, 0.14], [-510, 116.3, 0.12], [-525.4, 97, 0.13], [-534.8, 98.4, 0.1]]) place(b, 'macerie', x, 0.01, z, r() * 6, s);
  place(b, 'rotta', -524.6, 0, 107.6, 0.4, 0.62); // a pew dragged under the dome and smashed
  // Under the dome: what fell from the drum and the cornice, pews and chairs dragged there and thrown down, a candelabrum
  // overturned; the procession's line (z 102) and the transept's door (x -530) stay clear.
  for (const [x, z, s] of [[-526, 93.6, 0.2], [-535.4, 110.6, 0.18], [-531.6, 95.2, 0.09], [-527.4, 110, 0.08], [-536.6, 106.2, 0.07]]) place(b, 'macerie', x, 0.01, z, r() * 6, s);
  place(b, 'rotta', -536, 94.2, 0, 2.6, 0.62);
  place(b, 'panca', -524.2, 0, 96, 0.5, 1.05, { tilt: Math.PI / 2, stretch: 2.4 });
  place(b, 'panca', -534.6, 0, 113.8, -0.3, 1.05, { solid: true, stretch: 2.4 });
  for (const [x, z, down] of [[-529, 93.4, 1], [-533.6, 96.8, 0], [-523.2, 99.2, 1], [-528.2, 111.6, 0], [-531.4, 113, 1], [-525.6, 115, 0], [-537.2, 99, 1]] as const)
    place(b, 'sedia', x, 0, z, r() * 6, 0.95, down ? { tilt: Math.PI / 2 * (r() < 0.5 ? 1 : -1) } : { solid: true });
  place(b, 'candelabro', -532.8, 0, 91.6, 1.3, 1.6, { tilt: Math.PI / 2 });
  place(b, 'sedia', -527.8, 0, 96.2, 1.1, 0.95, { tilt: Math.PI / 2 });
  place(b, 'sedia', -533.2, 0, 107.4, -2.2, 0.95, { solid: true });
  b.zone('sangiorgio');
}

/**
 * The church's canvases, one atlas (public/models/dipinti.webp, ATTRIBUTION.md: public-domain works that hang in San Giorgio):
 * [x, y, w, h] in its 512 × 432 px, from the top left.
 */
const CANVAS = { cena: [0, 0, 336, 216], manna: [0, 216, 336, 216], deposizione: [336, 0, 176, 216], pastori: [336, 216, 176, 216] } as const;
/** Lit by the church and glowing a little of their own colour, like the Cenacolo's Nozze; black until the atlas is in. */
const CANVASES = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.85, emissive: 0x000000 });
let hung = false;
/** Loads the canvases: once, when level 3 comes into view (main.ts stream), so levels 1 and 2 never hold them. */
export function hangCanvases(): void {
  if (hung || typeof document === 'undefined') return;
  hung = true;
  new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}models/dipinti.webp`, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = false; // ponytail: no mip chain (a third more) while level 3 sits at the phone's 200 MB; mips if it ever shimmers
    t.minFilter = THREE.LinearFilter;
    CANVASES.map = CANVASES.emissiveMap = t;
    CANVASES.color.setHex(0xffffff);
    CANVASES.emissive.setScalar(0.32);
    CANVASES.needsUpdate = true;
  });
}

/**
 * The coffered ceilings, after Palladio's: the nave's barrel vault ribbed by a transverse arch over each pair of columns and
 * coffered between, a modillioned cornice where it springs; the presbytery's, choir's and transepts' flat ceilings coffered;
 * in the dome, its drum's arched windows with the moon in them between pilasters over a balustrade, and three rings of
 * coffers between the ribs. Each coffer a moulded frame, its sunk panel and a gilt rosette (three instanced meshes for all of
 * them), warm against the dark, the panels in shadow. Each ceiling one occlusion piece with its dress, so the Diablo view lifts
 * it whole.
 */
function ceilings(b: LevelBuilder): void {
  const R = 8, VY = 12.6; // the nave's vault (basilica() above): radius, the height of its axis
  const at: THREE.Matrix4[] = [], pieces: number[] = [];
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Zv = new THREE.Vector3(), O = new THREE.Vector3();
  /** A coffer w × d centred at `o`, `x` along its width, `y` out of the room; flat, so set in by its sag on a curved one. */
  const coffer = (piece: number, o: THREE.Vector3, x: THREE.Vector3, y: THREE.Vector3, w: number, d: number) => {
    at.push(new THREE.Matrix4().makeBasis(x, y, Zv.crossVectors(x, y)).scale(new THREE.Vector3(w, 1, d)).setPosition(o));
    pieces.push(piece);
  };
  // The nave: seven transverse arches (against the front, over each pair of columns, into the crossing), three coffers a bay
  // along it and nine across, the cornice and its modillions both sides.
  b.together((piece) => {
    const ribs = [FAC - 0.8, -485, -492, -499, -506, -513, -519.6];
    for (const x of ribs) b.decor(shaped(arch(0, 0, R - 0.65, R - 0.02, 0.8, 16)).rotateY(Math.PI / 2).translate(x, VY, SGZ), 'volta');
    const n = 9, a0 = (25 * Math.PI) / 180, da = ((130 * Math.PI) / 180) / n, cell = R * da, sag = R * (1 - Math.cos(da * 0.46)) + 0.02;
    for (let k = 1; k < ribs.length; k++) {
      const x0 = ribs[k - 1] - 0.4, x1 = ribs[k] + 0.4, len = (x0 - x1) / 3;
      for (let i = 0; i < 3; i++) for (let j = 0; j < n; j++) {
        const a = a0 + (j + 0.5) * da;
        coffer(piece, O.set(x0 - (i + 0.5) * len, VY + (R - sag) * Math.sin(a), SGZ + (R - sag) * Math.cos(a)), X.set(1, 0, 0), Y.set(0, Math.sin(a), Math.cos(a)), len * 0.9, cell * 0.9);
      }
    }
    const mods: THREE.Matrix4[] = []; // the cornice's modillions
    for (const [z, s] of [[94, 1], [110, -1]] as const) {
      slab(b, null, FAC - 0.4, -519.6, VY, VY + 0.35, Math.min(z, z + s * 1.05), Math.max(z, z + s * 1.05), 'volta');
      for (let x = FAC - 0.9; x > -519.4; x -= 0.7) mods.push(new THREE.Matrix4().makeTranslation(x, VY - 0.11, z + s * 0.78));
    }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.22, 0.35), material('volta'), mods.length);
    mods.forEach((m, i) => im.setMatrixAt(i, m));
    im.computeBoundingSphere();
    im.userData.pieces = new Array(mods.length).fill(piece);
    b.add(im, 'volta');
  });
  slab(b, null, -540.4, -539.6, 16, RING, 92, 112, 'istria'); // the crossing's wall over the presbytery's opening, up to its ceiling
  // The flat ceilings: the presbytery and the choir under 16 m, the transepts under the crossing's 20.
  for (const [x0, x1, z0, z1, y, nx, nz] of [[-567.4, -540.6, 92.6, 111.4, 16, 12, 8], [-539.4, -520.6, 80.6, 91.6, RING, 8, 5], [-539.4, -520.6, 112.4, 123.4, RING, 8, 5]]) {
    b.together((piece) => {
      const w = (x1 - x0) / nx, d = (z1 - z0) / nz;
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) coffer(piece, O.set(x0 + (i + 0.5) * w, y, z0 + (j + 0.5) * d), X.set(1, 0, 0), Y.set(0, 1, 0), w * 0.88, d * 0.88);
      slab(b, null, x0 - 0.4, x1 + 0.4, y - 0.3, y, z0 - 0.4, z0, 'volta'); // the cornice round it, where the walls meet it
      slab(b, null, x0 - 0.4, x1 + 0.4, y - 0.3, y, z1, z1 + 0.4, 'volta');
    });
  }
  // The Cenacolo's (refettorio() dresses the hall under it): a coffered ceiling on a cornice round all four walls, the warm ground
  // between the coffers lit as the church's are, so its height reads over the Abate's fight.
  b.together((piece) => {
    const i0 = CENACOLO.x0 + 0.3, i1 = CENACOLO.x1 - 0.3, j0 = CENACOLO.z0 + 0.3, j1 = CENACOLO.z1 - 0.3, nx = 12, nz = 10, w = (i1 - i0) / nx, d = (j1 - j0) / nz;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) coffer(piece, O.set(i0 + (i + 0.5) * w, CEN_CEIL, j0 + (j + 0.5) * d), X.set(1, 0, 0), Y.set(0, 1, 0), w * 0.86, d * 0.86);
    slab(b, null, i0, i1, CEN_CEIL, CEN_CEIL + 0.12, j0, j1, 'volta');
    for (const [a, c, e, f] of [[i0, i1, j0, j0 + 0.45], [i0, i1, j1 - 0.45, j1], [i0, i0 + 0.45, j0, j1], [i1 - 0.45, i1, j0, j1]]) slab(b, null, a, c, CEN_CEIL - 0.35, CEN_CEIL, e, f, 'volta');
  });
  // The drum and the dome.
  b.together((piece) => {
    const Rd = DOME - 0.3, C = new THREE.Vector3(SGX, RING + 4.6, SGZ); // the inner shell
    for (const [e0, e1] of [[5, 25], [25, 43], [43, 58]]) {
      const lo = (e0 * Math.PI) / 180, hi = (e1 * Math.PI) / 180, e = (lo + hi) / 2;
      const w = Rd * Math.cos(e) * (Math.PI / 8) * 0.78, d = Rd * (hi - lo) * 0.84, sag = Rd * (1 - Math.cos(Math.hypot(w, d) / 2 / Rd)) + 0.03;
      for (let k = 0; k < 16; k++) {
        const a = ((k + 0.5) * Math.PI) / 8;
        Y.set(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
        coffer(piece, O.copy(Y).multiplyScalar(Rd - sag).add(C), X.set(Math.cos(a), 0, -Math.sin(a)), Y, w, d);
      }
    }
    // the drum's windows, inside (its shell is DOME round): a pane under a lunette, its arch, jambs and sill; pilasters between
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, m = new THREE.Matrix4().makeRotationY(a).setPosition(SGX + Math.sin(a) * (DOME - 0.02), 0, SGZ + Math.cos(a) * (DOME - 0.02));
      if (k % 2) { slab(b, m, -0.3, 0.3, RING + 1.25, RING + 4.3, -0.22, 0, 'volta'); continue; }
      slab(b, m, -0.62, 0.62, RING + 1.5, RING + 3.4, -0.04, -0.01, 'luna');
      b.decor(shaped(lunette(0, RING + 3.4, 0.62, -0.03, -1).applyMatrix4(m)), 'luna');
      b.decor(shaped(arch(0, RING + 3.4, 0.62, 0.84, 0.2).translate(0, 0, -0.1).applyMatrix4(m)), 'volta');
      for (const s of [-1, 1]) slab(b, m, s * 0.62, s * 0.84, RING + 1.5, RING + 3.4, -0.2, 0, 'volta');
      slab(b, m, -0.9, 0.9, RING + 1.36, RING + 1.5, -0.32, 0, 'volta');
    }
    // the balustrade on the drum's foot: a rail over 64 balusters
    const rail = new THREE.TorusGeometry(DOME - 0.45, 0.08, 4, 64).toNonIndexed().rotateX(Math.PI / 2).translate(SGX, RING + 1.08, SGZ);
    b.decor(shaped(rail), 'volta');
    const vase = new THREE.LatheGeometry([[0.07, 0], [0.07, 0.06], [0.04, 0.12], [0.1, 0.3], [0.04, 0.5], [0.06, 0.6], [0.06, 0.65]].map(([r, y]) => new THREE.Vector2(r, y)), 6);
    const bal = new THREE.InstancedMesh(vase, material('volta'), 64), m = new THREE.Matrix4();
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      bal.setMatrixAt(k, m.makeTranslation(SGX + Math.sin(a) * (DOME - 0.45), RING + 0.4, SGZ + Math.cos(a) * (DOME - 0.45)));
    }
    bal.computeBoundingSphere();
    bal.userData.pieces = new Array(64).fill(piece); // occlusion: they go with the dome
    b.add(bal, 'volta');
  });
  // Every coffer: the frame (an outer moulding and a stepped inner one), the sunk panel, the rosette in its middle; for a
  // 1 × 1 cell, its back on y = 0, hanging down (-y) into the room.
  const bars = (o: number, t: number, depth: number) => [
    new THREE.BoxGeometry(1 - 2 * o, depth, t).translate(0, -depth / 2, 0.5 - o - t / 2), new THREE.BoxGeometry(1 - 2 * o, depth, t).translate(0, -depth / 2, -0.5 + o + t / 2),
    new THREE.BoxGeometry(t, depth, 1 - 2 * o - 2 * t).translate(0.5 - o - t / 2, -depth / 2, 0), new THREE.BoxGeometry(t, depth, 1 - 2 * o - 2 * t).translate(-0.5 + o + t / 2, -depth / 2, 0),
  ];
  const kinds: [THREE.BufferGeometry, THREE.Material, Role][] = [
    [mergeGeometries([...bars(0, 0.1, 0.2), ...bars(0.1, 0.06, 0.1)].map((g) => g.toNonIndexed()))!, material('volta'), 'volta'],
    [new THREE.PlaneGeometry(0.8, 0.8).rotateX(Math.PI / 2).translate(0, -0.01, 0), material('lacunare'), 'lacunare'],
    [new THREE.SphereGeometry(0.09, 8, 4).scale(1, 0.5, 1).translate(0, -0.03, 0), material('gold'), 'gold'],
  ];
  for (const [g, mat, role] of kinds) {
    const im = new THREE.InstancedMesh(g, mat, at.length);
    at.forEach((m, i) => im.setMatrixAt(i, m));
    im.computeBoundingSphere();
    im.userData.pieces = pieces; // occlusion: each coffer goes with its ceiling
    b.add(im, role);
  }
}

/** A canvas on a wall: its middle (x, y) on the wall at z, facing `s` (+z 1, -z -1), w × h. */
type Hung = [number, number, number, number, number, number];

/**
 * Carved gilt frames, Venetian baroque, round every canvas: four instanced pieces for all of them. A moulding run along each
 * side (a lip on the canvas, a beaded astragal, a flat frieze, a fat torus, the outer cavetto), a cartouche over each corner
 * (a cushion, acanthus breaking out past the corner and lying along the rails, a rosette), a shell crest over the top and a
 * smaller one hanging under, one midway up each side of the wide ones, pearls along the bead. Dark gold in the hollows and
 * bright on the ridges (vertex colours), so the fires' light runs along the carving. Each frame one occlusion piece.
 */
function frames(b: LevelBuilder, list: Hung[]): void {
  const shade = (g: THREE.BufferGeometry, top: number) => { // hollows dark, ridges bright: by how far out of the wall
    const pos = g.getAttribute('position'), c = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const k = Math.min(1, Math.max(0, pos.getZ(i) / top));
      c.set([0.34 + 0.95 * k, 0.31 + 0.95 * k, 0.24 + 0.85 * k], i * 3);
    }
    return g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  };
  const blob = (sx: number, sy: number, sz: number, a: number, x: number, y: number, z: number) => new THREE.SphereGeometry(1, 8, 5).scale(sx, sy, sz).rotateZ(a).translate(x, y, z);
  const leaf = (a: number, r: number, len: number, z: number) => blob(len / 2, len * 0.17, 0.09, a, Math.cos(a) * (r + len / 2), Math.sin(a) * (r + len / 2), z);
  // the moulding for t = 1: (u, v) across it from the canvas out and out of the wall, run along x -0.5..0.5
  const P = [[0, 0], [0, 0.1], [0.05, 0.16], [0.1, 0.17], [0.13, 0.24], [0.19, 0.28], [0.25, 0.24], [0.28, 0.18], [0.34, 0.17], [0.58, 0.17], [0.62, 0.25], [0.7, 0.35], [0.8, 0.37], [0.88, 0.31], [0.93, 0.21], [0.97, 0.15], [1, 0.08], [1, 0]];
  let rail: THREE.BufferGeometry = new THREE.ExtrudeGeometry(new THREE.Shape(P.map(([u, v]) => new THREE.Vector2(u, v))), { depth: 1, bevelEnabled: false });
  rail.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, -0.5, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1)); // (u, v, along) -> (along, u, v)
  rail.deleteAttribute('normal');
  rail.deleteAttribute('uv');
  rail = mergeVertices(rail); // smooth: the gilding's highlights roll over the mouldings
  rail.computeVertexNormals();
  const corner = mergeGeometries([ // over the corner square, its outer corner up and right
    new THREE.SphereGeometry(0.5, 10, 6).scale(1.05, 1.05, 0.6).translate(0, 0, 0.12), // the cushion
    ...[-0.8, 0, 0.8].map((d) => leaf(Math.PI / 4 + d, 0.18, d ? 0.62 : 0.8, 0.26)), // acanthus out past the corner
    leaf(Math.PI, 0.3, 0.7, 0.26), leaf(-Math.PI / 2, 0.3, 0.7, 0.26), // and along the rails' friezes
    new THREE.SphereGeometry(0.16, 8, 5).scale(1, 1, 0.7).translate(0, 0, 0.42), // the rosette
  ])!;
  const crest = mergeGeometries([ // on the moulding's outer edge, rising up
    blob(0.42, 0.34, 0.14, 0, 0, 0.3, 0.2), // the cartouche
    ...Array.from({ length: 9 }, (_, i) => { const a = (Math.PI * (i + 0.5)) / 9; return blob(0.34, 0.07, 0.06, a, Math.cos(a) * 0.62, 0.3 + Math.sin(a) * 0.62, 0.12); }), // the shell's ribs
    ...[-1, 1].map((s) => new THREE.TorusGeometry(0.2, 0.06, 5, 10, Math.PI * 1.5).rotateZ(s > 0 ? -Math.PI / 4 : Math.PI * 0.75).translate(s * 0.58, 0.12, 0.14)), // C-scrolls at its foot
  ])!;
  const kinds = [shade(rail, 0.37), shade(corner, 0.5), shade(crest, 0.32), new THREE.SphereGeometry(1, 6, 4)]; // rails, corners, crests, pearls
  const at: THREE.Matrix4[][] = kinds.map(() => []), pieces: number[][] = kinds.map(() => []);
  const T = new THREE.Matrix4(), R = new THREE.Matrix4(), S = new THREE.Matrix4();
  for (const [x, y, z, s, w, h] of list) {
    const t = w > 5 ? 0.56 : 0.36, W = w / 2 - 0.03, H = h / 2 - 0.03, piece = b.pieceId(); // the moulding's width; it laps the canvas 3 cm
    const F = new THREE.Matrix4().makeRotationY(s < 0 ? Math.PI : 0).setPosition(x, y, z);
    const put = (k: number, a: number, px: number, py: number, pz: number, sx: number, sy: number, sz: number) => {
      at[k].push(F.clone().multiply(T.makeTranslation(px, py, pz)).multiply(R.makeRotationZ(a)).multiply(S.makeScale(sx, sy, sz)));
      pieces[k].push(piece);
    };
    for (const [a, px, py, len] of [[0, 0, H, 2 * W], [Math.PI, 0, -H, 2 * W], [Math.PI / 2, -W, 0, 2 * H], [-Math.PI / 2, W, 0, 2 * H]]) put(0, a, px, py, 0, len, t, t);
    for (const [a, sx, sy] of [[0, 1, 1], [Math.PI / 2, -1, 1], [Math.PI, -1, -1], [-Math.PI / 2, 1, -1]]) put(1, a, sx * (W + t / 2), sy * (H + t / 2), 0, t * 1.45, t * 1.45, t * 1.2);
    put(2, 0, 0, H + t * 0.9, 0, t * 2.2, t * 2.2, t * 1.3);
    put(2, Math.PI, 0, -H - t * 0.9, 0, t * 1.5, t * 1.5, t);
    if (w > 5) for (const sx of [-1, 1]) put(2, -sx * Math.PI / 2, sx * (W + t * 0.9), 0, 0, t * 1.4, t * 1.4, t);
    const r = 0.045 * t, gap = 0.16 * t, u = 0.19 * t; // the pearls, on the bead
    for (const [px, py, dx, dy, n] of [[-W, H + u, 1, 0, 2 * W], [-W, -H - u, 1, 0, 2 * W], [-W - u, -H, 0, 1, 2 * H], [W + u, -H, 0, 1, 2 * H]])
      for (let d = gap / 2; d < n; d += gap) put(3, 0, px + dx * d, py + dy * d, 0.25 * t, r, r, r * 0.8);
  }
  kinds.forEach((g, k) => {
    const im = new THREE.InstancedMesh(g, material('doratura'), at[k].length);
    at[k].forEach((m, i) => im.setMatrixAt(i, m));
    im.computeBoundingSphere();
    im.userData.pieces = pieces[k];
    b.add(im, 'doratura');
  });
}

/**
 * The church's walls dressed, after the real nave's: a wainscot of white stone round the aisles, the presbytery and the
 * transepts' ends (a plinth, moulded frames round inlaid panels of red, green and yellow marble, a capping); memorial tablets
 * of black stone in white frames, gilt lettering, a pediment, between the niches and by the doors; iron sconces, a candle
 * burning in each, flanking the canvases and the tablets; on the transepts' ends a string course, a great tablet over it and
 * tall moulded panels above, torn banners either side; moulded panels over the presbytery's cornice; wall torches either side
 * of the Tintorettos, whose frames catch their light. One instanced unit box per role for all of it (a tint per box), so the
 * hundreds of pieces cost a matrix each; the stone's stains and the acqua alta's tide line are its material's (materials.ts).
 */
function walls(b: LevelBuilder): void {
  const at = new Map<Role, [THREE.Matrix4, number, number][]>();
  let piece = 0; // each wall's dress one occlusion piece
  /** A box on the wall along x at z = w, the room on its `s` side: x0..x1, y0..y1, d0..d1 out of it; turned `a` in the wall's plane. */
  const box = (role: Role, x0: number, x1: number, y0: number, y1: number, w: number, s: number, d0: number, d1: number, tint = 0xffffff, a = 0) => {
    let l = at.get(role);
    if (!l) at.set(role, (l = []));
    l.push([new THREE.Matrix4().makeRotationZ(a).scale(new THREE.Vector3(x1 - x0, y1 - y0, d1 - d0)).setPosition((x0 + x1) / 2, (y0 + y1) / 2, w + (s * (d0 + d1)) / 2), tint, piece]);
  };
  const MARBLE = [0xffb4a0, 0xa8d4b4, 0xffe2a0]; // over the floor's marble: rosso di Verona, verde antico, giallo di Siena
  /** A wainscot along x0..x1 standing on y0, h tall, in panels of about 2 m. */
  const wainscot = (x0: number, x1: number, w: number, s: number, y0: number, h: number) => {
    box('stoneDark', x0, x1, y0, y0 + 0.24, w, s, 0, 0.12); // the plinth
    box('istria', x0, x1, y0 + 0.24, y0 + h - 0.14, w, s, 0, 0.05); // the field
    box('istria', x0 - 0.02, x1 + 0.02, y0 + h - 0.14, y0 + h, w, s, 0, 0.13); // the capping, its lip under it
    box('istria', x0, x1, y0 + h - 0.2, y0 + h - 0.14, w, s, 0, 0.08);
    const n = Math.max(1, Math.round((x1 - x0) / 2)), pw = (x1 - x0) / n, lo = y0 + 0.38, hi = y0 + h - 0.32;
    for (let i = 0; i < n; i++) {
      const a = x0 + i * pw + 0.14, c = a + pw - 0.28;
      box('marble', a + 0.07, c - 0.07, lo + 0.07, hi - 0.07, w, s, 0.05, 0.065, MARBLE[Math.abs(Math.round(a)) % 3]);
      riquadro(a, c, lo, hi, w, s, 0.07);
    }
  };
  /** A moulded frame of white stone, f wide, on the wall. */
  const riquadro = (x0: number, x1: number, y0: number, y1: number, w: number, s: number, f: number) => {
    box('istria', x0, x1, y0, y0 + f, w, s, 0.03, 0.09);
    box('istria', x0, x1, y1 - f, y1, w, s, 0.03, 0.09);
    box('istria', x0, x0 + f, y0 + f, y1 - f, w, s, 0.03, 0.09);
    box('istria', x1 - f, x1, y0 + f, y1 - f, w, s, 0.03, 0.09);
  };
  /** A memorial tablet centred (x, y), tw × th: black stone in a white frame, gilt lines of lettering, a pediment over it, a corbel under. */
  const tablet = (x: number, y: number, tw: number, th: number, w: number, s: number) => {
    const W = tw / 2, H = th / 2, f = 0.09, top = y + H + f + 0.1, run = W + 0.16, rise = 0.22 * tw, a = Math.atan2(rise, run), len = Math.hypot(run, rise);
    box('stoneDark', x - W, x + W, y - H, y + H, w, s, 0, 0.06, 0x6a605a);
    riquadro(x - W - f, x + W + f, y - H - f, y + H + f, w, s, f);
    box('istria', x - W - 0.16, x + W + 0.16, y + H + f, top, w, s, 0, 0.16); // its cornice
    for (const k of [-1, 1]) box('istria', x + (k * run) / 2 - len / 2, x + (k * run) / 2 + len / 2, top + rise / 2 - 0.05, top + rise / 2 + 0.05, w, s, 0, 0.14, 0xffffff, -k * a);
    box('istria', x - W * 0.6, x + W * 0.6, y - H - f - 0.14, y - H - f, w, s, 0, 0.16); // the corbel
    for (let i = 0; i < 6; i++) { const lw = W * (i % 2 ? 0.6 : 0.8) * (i ? 1 : 0.7), ly = y + H - 0.12 - i * ((th - 0.2) / 6); box('gold', x - lw, x + lw, ly - 0.035 * (i ? 1 : 1.4), ly, w, s, 0.06, 0.07); }
  };
  /** An iron sconce at (x, y) on the wall: back plate, arm, a gilt drip pan, a candle burning. */
  const sconce = (x: number, y: number, w: number, s: number) => {
    box('iron', x - 0.06, x + 0.06, y - 0.24, y + 0.1, w, s, 0, 0.03);
    box('iron', x - 0.02, x + 0.02, y - 0.16, y - 0.12, w, s, 0.03, 0.3);
    box('iron', x - 0.02, x + 0.02, y - 0.16, y, w, s, 0.26, 0.3);
    box('gold', x - 0.08, x + 0.08, y, y + 0.03, w, s, 0.2, 0.36);
    box('flower', x - 0.028, x + 0.028, y + 0.03, y + 0.3, w, s, 0.25, 0.31, 0xf0e6cf); // the candle
    b.lights.push({ x, y: y + 0.3, z: w + s * 0.28, kind: 'candle' });
  };
  /** A banner on a gilt rod at y1, len long, torn: a swallow tail, one side hanging lower; a gilt band and cross on it. */
  const banner = (x: number, y1: number, len: number, w: number, s: number, role: Role) => {
    box('gold', x - 0.8, x + 0.8, y1 - 0.06, y1, w, s, 0.14, 0.22);
    box(role, x - 0.6, x + 0.6, y1 - len, y1 - 0.06, w, s, 0.16, 0.18);
    box(role, x - 0.6, x - 0.08, y1 - len - 0.7, y1 - len, w, s, 0.16, 0.18);
    box(role, x + 0.12, x + 0.6, y1 - len - 0.35, y1 - len, w, s, 0.16, 0.18);
    box('gold', x - 0.6, x + 0.6, y1 - 0.42, y1 - 0.36, w, s, 0.18, 0.19);
    box('gold', x - 0.05, x + 0.05, y1 - len * 0.75, y1 - 0.7, w, s, 0.18, 0.19);
    box('gold', x - 0.3, x + 0.3, y1 - 1.25, y1 - 1.15, w, s, 0.18, 0.19);
  };

  // The aisles: the wainscot between the pilasters (round the niches), sconces either side of the altarpieces, tablets either
  // side of the wide bay's saint, a great one by the door.
  for (const [w, s] of [[86.4, 1], [117.6, -1]]) {
    piece = b.pieceId();
    for (let k = 0; k < AISLE.length + 1; k++) {
      const x0 = k < AISLE.length ? AISLE[k] + 0.42 : -519.6, x1 = k ? AISLE[k - 1] - 0.42 : FAC - 0.4;
      const cut = [-495.5, -508.2].find((c) => c > x0 && c < x1);
      if (cut) { wainscot(x0, cut - 1, w, s, 0, 1.3); wainscot(cut + 1, x1, w, s, 0, 1.3); } else wainscot(x0, x1, w, s, 0, 1.3);
    }
    for (const x of [-488, -502, -514]) for (const d of [-2.15, 2.15]) sconce(x + d, 3, w, s);
    for (const d of [-2.1, 2.1]) tablet(-495.5 + d, 2.3, 0.7, 0.9, w, s);
    for (const d of [-1.45, 1.45]) sconce(-508.2 + d, 2.6, w, s);
    tablet(-481.5, 2.8, 1.4, 1.0, w, s);
    for (const d of [-1.5, 1.5]) sconce(-481.5 + d, 2.5, w, s);
  }
  // The presbytery: the wainscot under the Tintorettos, wall torches either side, moulded panels over the cornice.
  for (const [w, s] of [[92.4, 1], [111.6, -1]]) {
    piece = b.pieceId();
    wainscot(-553.9, -540.6, w, s, P, 1.7);
    for (const x of [-553.1, -540.9]) b.lights.push({ x, y: P + 2.75, z: w + s * 0.32, kind: 'torch', nx: 0, nz: s });
    for (const [x0, x1] of [[-553.6, -549.6], [-549.1, -544.9], [-544.4, -540.6]]) riquadro(x0, x1, 9.8, 15, w, s, 0.14);
  }
  // The transepts' ends: the wainscot round the niches and the door, a string course, the great tablet, banners, tall panels.
  for (const [w, s] of [[80.4, 1], [123.6, -1]]) {
    piece = b.pieceId();
    const runs = s > 0 ? [[-539.6, -536.5], [-534.5, -531.7], [-528.3, -525.5], [-523.5, -520.4]] : [[-539.6, -536.5], [-534.5, -525.5], [-523.5, -520.4]];
    for (const [x0, x1] of runs) wainscot(x0, x1, w, s, 0, 1.3);
    box('istria', -539.6, -520.4, 5.1, 5.4, w, s, 0, 0.28);
    box('istria', -539.6, -520.4, 4.98, 5.1, w, s, 0, 0.16);
    tablet(-530, 7.2, 2.6, 1.5, w, s);
    banner(-525.2, 11.4, 3.4, w, s, 'cloth');
    banner(-534.8, 11.4, 2.6, w, s, 'azure');
    for (const [x0, x1] of [[-538.8, -533], [-532, -528], [-527, -521.2]]) riquadro(x0, x1, 12.4, 18.8, w, s, 0.16);
    for (const [x0, x1] of [[-539, -536.6], [-523.4, -521]]) riquadro(x0, x1, 6, 11, w, s, 0.12);
    b.lights.push({ x: -530, y: 9, z: w + s * 2.5, kind: 'glow', color: 0xffb46a }); // up the wall: the tablet and the banners in the fires' light
  }

  const unit = new THREE.BoxGeometry(1, 1, 1), c = new THREE.Color();
  for (const [role, l] of at) {
    const im = new THREE.InstancedMesh(unit, material(role), l.length);
    l.forEach(([m], i) => im.setMatrixAt(i, m));
    if (l.some(([, t]) => t !== 0xffffff)) l.forEach(([, t], i) => im.setColorAt(i, c.setHex(t)));
    im.computeBoundingSphere();
    im.userData.pieces = l.map(([, , p]) => p);
    b.add(im, role);
  }
}

/** A plain box by extents in frame `m` (null = world), batched through decor(): part() without its chamfers (a fifth of the bytes), for trims seen from afar. */
function slab(b: LevelBuilder, m: THREE.Matrix4 | null, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, role: Role): void {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)).toNonIndexed().translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  b.decor(shaped(m ? g.applyMatrix4(m) : g), role);
}

/** A light arch ring (no bevel, few segments: dozens of them stay cheap on level 3's GPU), springing at (cx, cy), `depth` thick about z 0. */
function arch(cx: number, cy: number, r0: number, r1: number, depth: number, seg = 6): THREE.BufferGeometry {
  const sh = new THREE.Shape().moveTo(cx + r1, cy).absarc(cx, cy, r1, 0, Math.PI, false).lineTo(cx - r0, cy).absarc(cx, cy, r0, Math.PI, 0, true).closePath();
  return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: seg }).translate(0, 0, -depth / 2);
}

/** A flat half-disc of radius r over (cx, cy) at z, facing +z (`s` 1) or -z (-1): an arch's lunette, a window's pane. */
function lunette(cx: number, cy: number, r: number, z: number, s: number): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(r, 8, 0, Math.PI).toNonIndexed();
  return (s < 0 ? g.rotateY(Math.PI) : g).translate(cx, cy, z);
}

/**
 * Corinthian capitals, procedural (white Istrian stone), one instanced mesh: each the bell over a column of radius r whose top is
 * at `top`, two rows of eight acanthus leaves curling out, a volute at each corner under the abacus, the abacus a little wider than
 * the column's own. A pilaster's is the same capital set into its wall, half buried. [x, top, z, r] each.
 */
function capitals(b: LevelBuilder, at: [number, number, number, number][]): void {
  const h = 1.5, parts: THREE.BufferGeometry[] = []; // for r = 1, the top at y = 0
  parts.push(new THREE.LatheGeometry([new THREE.Vector2(0.86, 0), new THREE.Vector2(0.9, 0.4 * h), new THREE.Vector2(1.05, 0.82 * h), new THREE.Vector2(0, 0.82 * h)], 12).translate(0, -h, 0));
  for (const [row, lift] of [[0, 0.02], [1, 0.3]] as const) for (let k = 0; k < 8; k++) {
    const a = ((k + row * 0.5) / 8) * Math.PI * 2;
    // a leaf: a flattened half-ellipsoid standing on the bell, its tip leaning out and curling over
    const leaf = new THREE.SphereGeometry(1, 6, 4, 0, Math.PI).scale(0.3, 0.42 * h, 0.12).rotateX(-0.35).translate(0, 0, 0.88);
    parts.push(leaf.rotateY(a).translate(0, -h + (lift + 0.42) * h * 0.95, 0));
  }
  for (let k = 0; k < 4; k++) { // the volutes, scrolled under the abacus's corners
    const v = new THREE.TorusGeometry(0.17, 0.06, 5, 10).rotateY(Math.PI / 2).translate(0, 0, 1.12);
    parts.push(v.rotateY(Math.PI / 4 + (k * Math.PI) / 2).translate(0, -0.2 * h, 0));
  }
  parts.push(new THREE.BoxGeometry(2.8, 0.16 * h, 2.8).translate(0, -0.08 * h, 0)); // the abacus
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
  const im = new THREE.InstancedMesh(g, material('istria'), at.length), m = new THREE.Matrix4();
  at.forEach(([x, top, z, r], i) => im.setMatrixAt(i, m.makeScale(r, r, r).setPosition(x, top, z)));
  im.computeBoundingSphere();
  b.add(im, 'istria');
}

/** A niche `w` along the wall (axis 'x': a wall at z = w, room on the `s` side; 'z': a wall at x = w), its saint standing at y0. */
function niche(b: LevelBuilder, a: number, w: number, s: number, y0: number, axis: 'x' | 'z'): void {
  const m = axis === 'x' ? null : new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(w, 0, a);
  const [c, d0, d1] = axis === 'x' ? [a, Math.min(w, w + s * 0.06), Math.max(w, w + s * 0.06)] : [0, -0.03, 0.03];
  b.part(m, c - 0.75, c + 0.75, y0, y0 + 2.6, d0, d1, 'stoneDark'); // the recess, painted dark
  const ar = shaped(arch(c, y0 + 2.6, 0.75, 1.0, 0.24));
  b.decor(axis === 'x' ? ar.translate(0, 0, w + s * 0.12) : ar.rotateY(Math.PI / 2).translate(w + 0.12, 0, a), 'istria');
  if (axis === 'x') b.part(null, c - 0.95, c + 0.95, y0 - 0.25, y0, Math.min(w, w + s * 0.45), Math.max(w, w + s * 0.45), 'istria'); // the ledge
  else b.part(null, w, w + 0.45, y0 - 0.25, y0, a - 0.95, a + 0.95, 'istria');
  const yaw = axis === 'x' ? (s > 0 ? 0 : Math.PI) : Math.PI / 2;
  place(b, 'statua', axis === 'x' ? a : w + 0.28, y0, axis === 'x' ? w + s * 0.28 : a, yaw, 2.1);
}

/** Palladio's white front, facing the Giudecca (+X): the giant order on its plinths under the pediment, the aisles' half pediments. */
function facade(b: LevelBuilder, p: Props): void {
  const f = (z0: number, z1: number, y0: number, y1: number, d: number, role: Role = 'stone') => b.part(null, FAC, FAC + d, y0, y1, z0, z1, role);
  b.wallZ(FAC, 86, 118, stone(13, [{ at: SGZ, w: 3.6, h: 7, arch: true }]));
  b.box(FAC - 0.4, FAC + 0.4, 13, RING + 1.2, 94, 110, 'stone', { camera: true });
  f(85.6, 118.4, 0, 0.8, 0.4, 'stoneDark');
  for (const z of [86.7, 93.3, 110.7, 117.3]) f(z - 0.5, z + 0.5, 0.8, 11, 0.3); // the lower order's pilasters
  f(85.6, 118.4, 11, 12.2, 0.55, 'stoneDark');
  for (const [a, c] of [[86, 94.4], [118, 109.6]]) { // the half pediments over the aisles
    const s = new THREE.Shape().moveTo(a, 12.2).lineTo(c, 12.2).lineTo(c, 15.4).closePath();
    b.decor(shaped(extrude(s, 0.5, 0.04)).rotateY(-Math.PI / 2).translate(FAC + 0.5, 0, 0), 'stone');
  }
  for (const z of [95.6, 98.6, 105.4, 108.4]) { // the giant order on its high plinths
    b.box(FAC, FAC + 1.5, 0, 4, z - 0.95, z + 0.95, 'stone');
    b.order(FAC + 0.75, z, 0.62, 4, 18.6, 'stone');
  }
  f(94.4, 109.6, 18.6, 20, 0.95, 'stoneDark');
  const ped = new THREE.Shape().moveTo(94.2, 20).lineTo(109.8, 20).lineTo(SGZ, 24.2).closePath();
  ped.holes.push(new THREE.Path().moveTo(95.6, 20.35).lineTo(108.4, 20.35).lineTo(SGZ, 23.4).closePath());
  b.decor(shaped(extrude(ped, 1, 0.05)).rotateY(-Math.PI / 2).translate(FAC + 1, 0, 0), 'stoneDark', true);
  b.decor(shaped(extrude(new THREE.Shape().moveTo(95.6, 20.35).lineTo(108.4, 20.35).lineTo(SGZ, 23.4).closePath(), 0.4, 0)).rotateY(-Math.PI / 2).translate(FAC + 0.4, 0, 0), 'stone', true);
  b.decor(shaped(ring(SGZ, 21.6, 0.7, 0.95, 0.3)).rotateY(-Math.PI / 2).translate(FAC + 0.7, 0, 0), 'gold'); // the oculus
  for (const z of [97.1, 106.9]) { // San Giorgio and Santo Stefano in their niches
    f(z - 0.7, z + 0.7, 7, 11.4, 0.08, 'stoneDark');
    p.disc(FAC + 0.4, 7.2, z, 0.34, 2.6, 'stone');
    p.blob(FAC + 0.4, 10.1, z, 0.22, 0.27, 0.22, 'stone');
  }
  for (const z of [90, 114]) { // the two doges' busts on the aisles
    b.decor(shaped(ring(z, 7.6, 0.9, 1.15, 0.25)).rotateY(-Math.PI / 2).translate(FAC + 0.25, 0, 0), 'stoneDark');
    p.blob(FAC + 0.35, 7.5, z, 0.32, 0.42, 0.32, 'stone');
  }
  // The door's own frame and pediment.
  for (const z of [SGZ - 2.2, SGZ + 2.2]) f(z - 0.3, z + 0.3, 0, 7.6, 0.5);
  f(SGZ - 2.6, SGZ + 2.6, 7.6, 8.3, 0.7, 'stoneDark');
  b.decor(shaped(extrude(new THREE.Shape().moveTo(SGZ - 2.8, 8.3).lineTo(SGZ + 2.8, 8.3).lineTo(SGZ, 9.6).closePath(), 0.6, 0.03)).rotateY(-Math.PI / 2).translate(FAC + 0.6, 0, 0), 'stoneDark');
  b.lights.push({ x: FAC + 7, y: 13, z: SGZ, kind: 'glow', color: 0xd0dcff }); // the white front under the moon
  for (const z of [91, 113]) b.lights.push({ x: FAC + 0.4, y: 2.75, z, kind: 'torch', nx: 1, nz: 0 });
}

/** The campanile's shaft, and its bell chamber on top: the floor between the four piers, walled in by a parapet (Rintocchi muti, quest/squero.ts). */
export const BELFRY = { x0: -578, x1: -570, z0: 112, z1: 120, y: 44 } as const;
/**
 * The way up and down (quest/progress.ts `climb`): the door at the shaft's foot on the campo, the stair's hatch in the chamber's
 * floor, and where each lands the hero (`yaw`: facing out of the door, onto the campo; up top, north over the Bacino to San Marco).
 */
export const CAMPANILE = {
  door: { x: -568.8, z: 116, yaw: -Math.PI / 2 },
  hatch: { x: -571.8, z: 113.8 },
  top: { x: -573.2, z: 115.2, yaw: Math.PI },
} as const;
/** Its three bells, hung high between the piers (over the boss's head): where each clapper is pulled from the floor. */
export const BELLS = [
  { at: { x: -574, y: BELFRY.y, z: 117.6 }, r: 1.05, label: 'la campana maggiore', of: 'della campana maggiore' },
  { at: { x: -576.4, y: BELFRY.y, z: 114.6 }, r: 0.8, label: 'la mezzana', of: 'della mezzana' },
  { at: { x: -571.6, y: BELFRY.y, z: 118 }, r: 0.6, label: 'la piccola', of: 'della piccola' },
] as const;
/** A bell's mouth over the chamber's floor: clear of a 2.8 m Campanaro, and of the hero's jump. */
export const BELL_MOUTH = 3.2;

function campanile(b: LevelBuilder, p: Props): void {
  const { x0, x1, z0, z1, y: H } = BELFRY, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, PIER = 0.8, IN = 3.2; // piers' half width; their inner faces off the middle
  b.area('Campo del campanile', -568, -540, 112, 124);
  b.area('Cella campanaria', x0, x1, z0, z1);
  b.together(() => {
    b.box(x0, x1, 0, H, z0, z1, 'brick');
    b.band(x0, x1, z0, z1, 0, 1, 0.12);
    b.band(x0, x1, z0, z1, H - 0.4, H, 0.3);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(cx + dx * 4 - PIER, cx + dx * 4 + PIER, H, H + 6, cz + dz * 4 - PIER, cz + dz * 4 + PIER, 'stone');
  });
  b.part(null, x0 - 0.3, x1 + 0.3, H + 6, H + 7, z0 - 0.3, z1 + 0.3, 'stoneDark'); // the cornice, a piece of its own: a roof the Diablo view fades over the chamber
  // The chamber: a stone floor, a parapet between the piers and the invisible rest up to the cornice (nobody falls 44 m),
  // the stair's iron hatch. The parapet never stops the camera: in this box the follow camera is held short (main.ts).
  b.floor(x0, x1, z0, z1, 'stone', H);
  for (const [ax, az, bx, bz] of [[cx - IN, z0, cx + IN, z0 + 0.3], [cx - IN, z1 - 0.3, cx + IN, z1], [x0, cz - IN, x0 + 0.3, cz + IN], [x1 - 0.3, cz - IN, x1, cz + IN]]) {
    b.box(ax, bx, H, H + 1, az, bz, 'stoneDark', { camera: false });
    b.box(ax, bx, H + 1, H + 6, az, bz, 'mass', { visible: false });
  }
  p.box(CAMPANILE.hatch.x - 0.7, CAMPANILE.hatch.x + 0.7, H, H + 0.05, CAMPANILE.hatch.z - 0.7, CAMPANILE.hatch.z + 0.7, 'iron');
  // The bells on oak headstocks under the cornice, bronze; their clappers are quest/view.ts's (they go once pulled).
  for (const { at, r } of BELLS) {
    const y = H + BELL_MOUTH, h = r * 1.5;
    p.disc(at.x, y, at.z, r * 1.08, 0.12, 'gold', 0x7a5a2a); // the lip
    p.cone(at.x, y, at.z, r, h, 'gold', 0x7a5a2a);
    p.blob(at.x, y + h * 0.7, at.z, r * 0.62, r * 0.45, r * 0.62, 'gold', 0x7a5a2a); // the shoulder
    p.box(at.x - 0.12, at.x + 0.12, y + h * 0.8, H + 6, at.z - 0.12, at.z + 0.12, 'wood');
  }
  p.box(x0 + 0.4, x1 - 0.4, H + 5.6, H + 6, cz - 0.15 + 1.6, cz + 0.15 + 1.6, 'wood'); // the beam they hang from
  p.box(x0 + 0.4, x1 - 0.4, H + 5.6, H + 6, cz - 0.15 - 1.4, cz + 0.15 - 1.4, 'wood');
  // The door at the foot, onto the campo.
  b.box(x1, x1 + 0.12, 0, 2.7, cz - 0.9, cz + 0.9, 'wood', { collide: false, camera: false });
  b.part(null, x1, x1 + 0.25, 2.7, 3.1, cz - 1.15, cz + 1.15, 'stone');
  for (const z of [cz - 1.05, cz + 1.05]) b.part(null, x1, x1 + 0.25, 0, 2.7, z - 0.15, z + 0.15, 'stone');
  b.lights.push({ x: x1 + 0.6, y: 2.9, z: cz, kind: 'torch', nx: 1, nz: 0 });
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 3, 16), material('stone'));
  drum.position.set(cx, H + 8.5, cz);
  b.add(drum, 'stone');
  b.add(new THREE.Mesh(new THREE.ConeGeometry(3, 7, 16), material('roof')), 'roof').position.set(cx, H + 13.5, cz);
  p.blob(cx, H + 17.6, cz, 0.4, 0.8, 0.4, 'gold'); // the angel
  b.lights.push({ x: cx, y: H + 4.5, z: cz, kind: 'glow', color: 0x9fb8ff });
}

/**
 * What the bell chamber looks out on, past where any level walks (the fog hides it from the ground; up there it lifts, fx/atmosphere.ts):
 * across the Bacino to the north San Marco, the Palazzo Ducale and the Riva degli Schiavoni running east to the Arsenale; the Lido, a
 * long low strip of trees far to the east. Masses in the night, a few windows lit.
 */
function lagoon(b: LevelBuilder, p: Props): void {
  const far = (x0: number, x1: number, z0: number, z1: number, h: number, role: Role = 'mass') => b.box(x0, x1, -1.2, h, z0, z1, role, { collide: false, camera: false });
  const lit = (x0: number, x1: number, z: number, y: number, seed: number) => { for (let x = x0, i = seed; x > x1; x -= 3.4, i++) if ((i * 7) % 5 < 2) p.box(x - 0.5, x, y, y + 1.1, z - 0.1, z, 'lantern'); };
  // The Piazzetta: the Libreria, the two columns, the Palazzo Ducale; the basilica's domes and the campanile behind.
  far(-262, -286, 300, 330, 12); // la Libreria
  far(-298, -334, 300, 326, 16, 'stone'); // il Palazzo Ducale
  lit(-299, -333, 299.9, 7, 1);
  for (const x of [-288, -296]) b.column(x, 298, 0.7, 0, 11, 'stone', false);
  for (const [x, z, r] of [[-322, 340, 6], [-314, 334, 4.5], [-330, 334, 4.5], [-322, 328, 4.5]]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), material('stone'));
    m.position.set(x, 18, z);
    b.add(m, 'stone');
  }
  far(-312, -332, 326, 346, 18); // the basilica under them
  far(-283, -290, 320, 327, 52, 'brick'); // il campanile di San Marco
  far(-282.5, -290.5, 319.5, 327.5, 60, 'stone');
  p.cone(-286.5, 60, 323.5, 4.2, 9, 'gold', 0x6a8a70); // its green-gold spire
  // The Riva degli Schiavoni, house fronts east to the Arsenale's towers.
  for (let x = -336, i = 0; x > -520; x -= 16, i++) { far(x, x - 15, 300, 318, 10 + ((i * 29) % 7)); lit(x - 1, x - 14, 299.9, 4 + (i % 3) * 2.5, i); }
  for (const x of [-528, -540]) far(x, x - 6, 300, 306, 22, 'brick');
  // The Lido, out to the east past the lagoon.
  far(-845, -870, -260, 400, 3, 'grass');
  for (let z = -240, i = 0; z < 390; z += 18, i++) p.blob(-852 - (i % 3) * 4, 5, z, 6, 4, 7, 'hedge');
}

function monastery(b: LevelBuilder, p: Props): void {
  // Closed ranges round the two cloisters and between the church and the water; the faces onto the piazzale, the riva,
  // the garden and the darsena get a convent's front (facades.ts): rows of stone-framed windows, string courses, quoins.
  const blocks: [number, number, number, number, number, Role, string?][] = [
    [-512, -452, 80, 86, 12, 'plaster', 'se'], // between the cloisters and the church, its front on the piazzale
    [-462, -452, 44, 80, 7, 'plaster', 'e'], // the water front, low: from the gondola the dome and the campanile rise over it
    [-512, -504, 44, 60, 13, 'plaster'], [-512, -504, 64, 80, 13, 'plaster'], // Longhena's wing, the passage between
    [-548, -536, 36, 44, 12, 'plaster'], [-524, -498, 36, 44, 12, 'plaster'], [-484, -452, 36, 44, 8, 'plaster', 'e'], // the south range
    [-512, -498, 20, 36, 12, 'brick'], [-484, -470, 20, 36, 12, 'brick'], [-512, -508, 4, 20, 10, 'brick', 'n'], [-470, -452, -8, 36, 7, 'plaster', 'ne'],
    [-600, -548, -8, DORM.z0, 12, 'brick', 'n'], // the Manica lunga and the dormitories, its front on the garden (dormitorio() opens a stretch of them)
    [-568, -540, 80, 92, 11, 'brick'], [-600, -578, 80, 124, 12, 'brick', 's'], [-578, -568, 80, 112, 10, 'brick'], // round the choir
    [-600, -548, DORM.z1, 80, 12, 'brick'], [-600, DORM.x0, DORM.z0, DORM.z1, 12, 'brick'], // the rest of the Manica lunga, round the open stretch
  ];
  blocks.forEach(([x0, x1, z0, z1, h, role, sides], i) => {
    if (sides) houses(b, p, x0, x1, z0, z1, h, sides, 400 + 13 * i, role, { convent: true, brick: role === 'brick', tint: 0xf2dcb8 });
    else b.block(x0, x1, z0, z1, h, role);
  });
  b.box(-512, -504, 4.2, 13, 60, 64, 'plaster');
  b.floor(-512, -504, 60, 64, 'paving', 0, 0.02);
  for (const x of [-511, -505]) b.lights.push({ x, y: 2.75, z: 62, kind: 'torch', nx: x < -508 ? 1 : -1, nz: 0 });
  b.area('Passaggio del Longhena', -512, -504, 60, 64);

  // Chiostro degli allori (Buora's, by the church) and chiostro dei cipressi (Palladio's, towards the water).
  b.area('Chiostro degli allori', -548, -512, 44, 80);
  b.room(-548, -512, 44, 80, { h: 9, roof: false, role: 'brick', trim: true, floor: 'paving', n: [{ at: SGX, arch: true }], s: false, e: [{ at: 62, arch: true }], w: [{ at: 62, w: 1.8, h: 3, arch: true }] }); // west: the dormitory's door
  b.wallX(80, -548, -540, { h: 9, role: 'brick', trim: true });
  b.wallX(80, -520, -512, { h: 9, role: 'brick', trim: true });
  b.area('Chiostro dei cipressi', -504, -462, 44, 80);
  b.room(-504, -462, 44, 80, { h: 9, roof: false, role: 'brick', trim: true, floor: 'paving', n: [{ at: -491, w: 3, arch: true }], w: [{ at: 62, arch: true }] });
  const a = groundPatch(b, -545, -515, 47, 77, 'paving', { skirt: true }).paint(-542, -518, 50, 74, 'grass').paint(-531.5, -528.5, 47, 77, 'gravel').paint(-545, -515, 60.5, 63.5, 'gravel');
  void a;
  b.curb(-542, -531.5, 50, 60.5); b.curb(-528.5, -518, 50, 60.5); b.curb(-542, -531.5, 63.5, 74); b.curb(-528.5, -518, 63.5, 74);
  b.well(SGX, 62, 0.9, 0.9);
  for (const [x, z] of [[-538, 55], [-522, 55], [-538, 69], [-522, 69], [-536, 72], [-524, 52]]) shrub(p, x, z, 1.1, 'hedge', true); // the laurels
  groundPatch(b, -501, -465, 47, 77, 'paving', { skirt: true }).paint(-498, -468, 50, 74, 'grass').paint(-484.5, -481.5, 47, 77, 'gravel').paint(POZZO2.x - 1.8, POZZO2.x + 1.8, POZZO2.z - 1.8, POZZO2.z + 1.8, 'gravel');
  b.curb(-498, -484.5, 50, 74); b.curb(-481.5, -468, 50, 74);
  b.well(POZZO2.x, POZZO2.z, 0.8, 0.85); // the cypresses' own well-head, in the lawn between them (convento() dresses both wells)
  for (const x of [-496, -488, -478, -470]) for (const z of [53, 62, 71]) cypress(p, x, z, p.rand(7, 9));
  // A lamp post or two in each garden (pooled lights, no shadows): the arcade torches alone leave the middle dark on a phone.
  for (const [x, z] of [[-533, 59], [-527, 65], [-486, 57.5], [-480, 66.5]]) lampPost(b, p, x, z, 0);
  b.arcade(-548, -512, 44, 80, 3, 4.6, { gaps: [[SGX, 44], [SGX, 80], [-512, 62]], upper: 'nesw' });
  b.arcade(-504, -462, 44, 80, 3, 4.6, { gaps: [[-491, 44], [-504, 62]], upper: 'nsw' });
  // Torches round every walk, its far corners too: each paints its pool on the paving even when the pooled lights are elsewhere.
  for (const [x, z, nx, nz] of [
    [-547.6, 54, 1, 0], [-547.6, 70, 1, 0], [-512.4, 54, -1, 0], [-512.4, 72, -1, 0], [-541, 44.4, 0, 1], [-519, 44.4, 0, 1], [-541, 79.6, 0, -1], [-519, 79.6, 0, -1],
    [-503.6, 72, 1, 0], [-503.6, 52, 1, 0], [-462.4, 54, -1, 0], [-462.4, 70, -1, 0], [-497, 44.4, 0, 1], [-470, 44.4, 0, 1], [-497, 79.6, 0, -1], [-483, 79.6, 0, -1], [-470, 79.6, 0, -1],
  ] as const) b.lights.push({ x: x + nx * 0.32, y: 2.75, z: z + nz * 0.32, kind: 'torch', nx, nz });
  for (const x of [-530, -483]) b.lights.push({ x, y: 8, z: 62, kind: 'glow', color: 0x9fb8ff }); // the moon over each garth

  // Antirefettorio: Palladio's vestibule with its two lavabi, between the allori and the cenacolo.
  b.area('Antirefettorio', -536, -524, 36, 44);
  b.wallZ(-536, 36, 44, { h: 6, role: 'stone' });
  b.wallZ(-524, 36, 44, { h: 6, role: 'stone' });
  b.box(-536, -524, 6, 6.4, 36, 44, 'roof');
  b.box(-536, -524, 6.4, 12, 36, 44, 'plaster', { collide: false });
  for (const x of [-535.2, -524.8]) {
    b.box(x - 0.5, x + 0.5, 0, 1, 39, 41, 'stoneDark', { camera: false });
    p.box(x - 0.4, x + 0.4, 1, 1.05, 39.2, 40.8, 'water', 0, 0x445566);
  }
  b.lights.push({ x: SGX, y: 4.6, z: 40, kind: 'lamp' });
}

function library(b: LevelBuilder, p: Props): void {
  // Scalone del Longhena: one grand flight up from the cloister to the library's landing, statues at its foot.
  b.area('Scalone del Longhena', -498, -484, 20, 44);
  b.wallZ(-498, 20, 44, stone(13));
  b.wallZ(-484, 20, 44, stone(13));
  b.box(-498, -484, 13, 13.4, 20, 44, 'roof');
  b.hipRoof(-498, -484, 20, 44, 13.4);
  b.stairs('z', -497.6, -484.4, 42, 26, 0, LIB_F, 16, 'stone');
  b.box(-497.6, -484.4, 0, LIB_F, 19.9, 26, 'stone'); // under the library door too: no crack at its sill
  for (const x of [-496.8, -485.2]) {
    p.box(x - 0.45, x + 0.45, 0, 1.2, 42.2, 43.2, 'stoneDark');
    p.disc(x, 1.2, 42.7, 0.3, 1.7, 'stone');
    p.blob(x, 3.1, 42.7, 0.2, 0.25, 0.2, 'stone');
  }
  b.part(null, -491.3, -490.7, 0, LIB_F + 1, 41.9, 42.2, 'stoneDark'); // the balustrade's newel down the middle
  b.lights.push({ x: -491, y: 9, z: 32, kind: 'glow', color: 0xb8c8ff }, { x: -491, y: LIB_F + 2.6, z: 23, kind: 'lamp' });

  // The library: walnut cases floor to cornice, reading tables, two globes. On its solid ground floor (the lower rooms are shut).
  b.area('Biblioteca del Longhena', -508, -470, -6, 20);
  b.box(-508, -470, 0, LIB_F, -6, 20, 'plaster');
  b.room(-508, -470, -6, 20, { h: LIB_F + 7, y0: LIB_F, role: 'plaster', trim: true, floor: 'wood', s: [{ at: -491, w: 2.8, h: 3.4, y0: LIB_F, arch: true }] });
  front(b, p, -508, -470, -6.3, 20, 'n', LIB_F + 6.7, 451, { convent: true, roof: LIB_F + 7.4, tint: 0xf6e6cc }); // its back on the garden
  b.hipRoof(-508, -470, -6, 20, LIB_F + 7.4);
  const shelf = (x0: number, x1: number, z0: number, z1: number) => {
    b.box(x0, x1, LIB_F, LIB_F + 4.4, z0, z1, 'wood', { camera: false });
    const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    for (let y = LIB_F + 0.4; y < LIB_F + 4.2; y += 0.7) {
      const tint = [0x7a2a1a, 0x2a3a5a, 0x5a4a20, 0x3a2a1a][Math.round(y * 3) % 4];
      if (along) p.box(x0 + 0.2, x1 - 0.2, y, y + 0.45, Math.min(z0, z1) - 0.03, Math.max(z0, z1) + 0.03, 'cloth', 0, tint);
      else p.box(Math.min(x0, x1) - 0.03, Math.max(x0, x1) + 0.03, y, y + 0.45, z0 + 0.2, z1 - 0.2, 'cloth', 0, tint);
    }
  };
  shelf(-507.6, -506.8, -5.6, 19.6); shelf(-471.2, -470.4, -5.6, 19.6);
  for (const x of [-506.8, -471.2]) for (let i = 0; i <= 8; i++) { const z = 18.8 - i * 2.95; p.box(x - 0.12, x + 0.12, LIB_F, LIB_F + 4.4, z - 0.08, z + 0.08, 'wood', 0, 0x9a6a38); } // the uprights between bays, paler than the books: there to be counted
  shelf(-506.8, -495, -5.6, -4.8); shelf(-487, -471.2, -5.6, -4.8);
  shelf(-506.8, -494, 18.8, 19.6); shelf(-488, -471.2, 18.8, 19.6);
  for (const x of [-499, -483]) for (const z of [2, 11]) {
    b.box(x - 1.6, x + 1.6, LIB_F, LIB_F + 0.85, z - 0.7, z + 0.7, 'wood', { camera: false });
    p.box(x - 0.6, x + 0.2, LIB_F + 0.85, LIB_F + 1, z - 0.3, z + 0.3, 'cloth', 0, 0xd8ccb0); // an open book
    b.lights.push({ x: x + 1, y: LIB_F + 1.2, z, kind: 'candle' });
  }
  for (const [x, z] of [[-504, 7], [-474, 7]]) {
    p.disc(x, LIB_F, z, 0.18, 0.9, 'wood');
    p.blob(x, LIB_F + 1.4, z, 0.55, 0.55, 0.55, 'azure');
    b.world.add(x, z, 0.5, 0.5, LIB_F, LIB_F + 1.9);
  }
  for (const [x, z] of [[-499, -1], [-483, -1], [-499, 15], [-483, 15]]) b.lights.push({ x, y: LIB_F + 5, z, kind: 'lamp' });
  for (const [x, z] of [[-505.5, 1], [-505.5, 13], [-472.5, 1], [-472.5, 13]]) b.lights.push({ x, y: LIB_F + 4.6, z, kind: 'lamp' }); // over the long cases: their bays are counted by eye
}

function cenacolo(b: LevelBuilder, p: Props): void {
  const { x0, x1, z0, z1 } = CENACOLO;
  b.area('Cenacolo palladiano', x0, x1, z0, z1);
  b.room(x0, x1, z0, z1, { h: 12, role: 'plaster', trim: 6, n: [{ at: SGX, w: 2.4, h: 3.6, arch: true }], s: [{ at: SGX, w: 2.4, h: 3.6, arch: true }] }); // its floor, skin and dress: refettorio()
  b.hipRoof(x0, x1, z0, z1, 12.4);
  // The monks' tables along the long walls (refettorio() draws them): their colliders.
  for (const x of TABLES) b.box(x - 0.5, x + 0.5, 0, 0.85, z0 + 4, z1 - 3, 'wood', { visible: false, camera: false });
  p.mute(() => { for (let i = 0; i < TABLES.length; i++) for (let z = z0 + 5; z < z1 - 3; z += 3.5) p.disc(0, 0, 0, 1, 1, 'gold'); }); // the chalices that stood here: their dice, so the garden's trees stay put
  // The empty frame of the Nozze di Cana on the end wall, over the garden door (refettorio() gilds it).
  b.part(null, -540.4, -519.6, 4.8, 10.6, z0 + 0.3, z0 + 0.62, 'stoneDark');
  for (let i = 0; i < 14; i++) { const x = p.rand(-540, -520.5); p.box(x, x + 0.4, 4.8, p.rand(5.2, 6.2), z0 + 0.62, z0 + 0.66, 'cloth', 0, 0xb89870); } // the cut canvas's ragged edge
  b.lights.push({ x: SGX, y: 6, z: z0 + 2, kind: 'glow', color: 0x80d8c0 }); // the frame still glows where the wedding hung
  for (const x of [x0 + 0.32, x1 - 0.32]) for (const z of [12, 20, 28]) if (x < SGX || z !== 20) b.lights.push({ x, y: 2.75, z, kind: 'torch', nx: x < SGX ? 1 : -1, nz: 0 }); // not under the pulpit
}

/** The dormitory's two cells broken open (their doors' x): one off each side of the corridor. */
const CELLS = { n: -555, s: -559 };

/**
 * The open stretch of the Manica lunga, its shell (convento() dresses it): a vaulted corridor in from the chiostro degli allori's
 * west walk between two rows of cells, shut but for one each side, broken open; the range's mass over it to the eaves, and its
 * own hipped roof between the rest's.
 */
function dormitorio(b: LevelBuilder): void {
  const { x0, x1, z0, z1, c0, c1 } = DORM, H = 3.6; // the cells' ceilings: the corridor's vault springs a little under them
  b.area('Dormitorio dei monaci', x0, x1, z0, z1);
  b.together(() => {
    b.box(x0, x1, H, 12, z0, c0 - 0.15, 'brick');
    b.box(x0, x1, H, 12, c1 + 0.15, z1, 'brick');
    b.box(x0, x1, 4.7, 12, c0 - 0.15, c1 + 0.15, 'brick');
    b.hipRoof(x0, x1, z0, z1, 12);
  });
  const wall = { h: H, t: 0.3, role: 'stone' as Role }; // limewashed stone, grimed
  b.wallX(c0, x0, x1, { ...wall, doors: [{ at: CELLS.s, w: 1.4, h: 2.3 }] });
  b.wallX(c1, x0, x1, { ...wall, doors: [{ at: CELLS.n, w: 1.4, h: 2.3 }] });
  for (const d of [-2.25, 2.25]) { b.wallZ(CELLS.s + d, z0, c0, wall); b.wallZ(CELLS.n + d, c1, z1, wall); }
  for (const [x, z] of [[-561.5, c0 + 0.3], [-552.5, c1 - 0.3]]) b.lights.push({ x, y: 1.9, z, kind: 'candle' }); // a candle on a bracket either wall
  b.lights.push({ x: x0 + 0.8, y: 2.4, z: (c0 + c1) / 2, kind: 'glow', color: 0x8fb0ff }); // the moon in the window at its end
  b.lights.push({ x: CELLS.n + 1.2, y: 1.1, z: z1 - 0.8, kind: 'candle' }, { x: CELLS.s - 1.4, y: 1.1, z: z0 + 0.9, kind: 'candle' });
  b.lights.push({ x: CELLS.n, y: 2.6, z: z1 - 1.8, kind: 'glow', color: 0xffa868 }, { x: CELLS.s, y: 2.6, z: z0 + 1.8, kind: 'glow', color: 0xffa868 }); // the candles' warmth on the whitewash
}

/** A wall's frame: x along it, y up, z out of its face into the room (axis 'x': the face at z = w, the room on its `s` side; 'z': at x = w). */
interface Face { m: THREE.Matrix4; yaw: number; u: (a: number) => number; at: (u: number, d: number) => [number, number] }
function face(axis: 'x' | 'z', w: number, s: number): Face {
  const yaw = axis === 'x' ? (s > 0 ? 0 : Math.PI) : s > 0 ? Math.PI / 2 : -Math.PI / 2;
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(axis === 'x' ? 0 : w, 0, axis === 'x' ? w : 0);
  const k = axis === 'x' ? s : -s, v = new THREE.Vector3();
  return { m, yaw, u: (a) => k * a, at: (u, d) => { v.set(u, 0, d).applyMatrix4(m); return [v.x, v.z]; } };
}

/** An instanced box by extents in a wall's frame (its turns are right angles: it stays a box). */
function fbox(q: Props, f: Face, u0: number, u1: number, y0: number, y1: number, d0: number, d1: number, role: Role, tint?: number): void {
  const [ax, az] = f.at(u0, d0), [bx, bz] = f.at(u1, d1);
  q.box(Math.min(ax, bx), Math.max(ax, bx), y0, y1, Math.min(az, bz), Math.max(az, bz), role, 0, tint);
}

/** A board `w` long (along its own x before the turn), `t` thick, `h` tall, standing centred at (x, z) turned `yaw`; `y0` its foot. */
function board(q: Props, x: number, z: number, w: number, t: number, y0: number, h: number, yaw: number, role: Role, tint?: number): void {
  q.box(x - w / 2, x + w / 2, y0, y0 + h, z - t / 2, z + t / 2, role, yaw, tint);
}

const WALNUT = 0x5a3a24, DARK = 0x3a2616, PEWTER = 0x9a968c, LINEN = 0xd8cfbc, STRAW = 0xb89a62, SOOT = 0x141110;

/**
 * A cell's door in a wall at `a` (world, along it): its stone frame, the dark of the cell behind, and the door shut (with its
 * grille), swung open, or kicked in (the lower half on the floor, splinters).
 */
function cellDoor(q: Props, f: Face, a: number, state: 'shut' | 'ajar' | 'broken', r: () => number, y = 0): void {
  const u = f.u(a), W = 0.55;
  fbox(q, f, u - W - 0.2, u - W, y, y + 2.3, 0, 0.12, 'stoneDark');
  fbox(q, f, u + W, u + W + 0.2, y, y + 2.3, 0, 0.12, 'stoneDark');
  fbox(q, f, u - W - 0.28, u + W + 0.28, y + 2.3, y + 2.55, 0, 0.16, 'stoneDark');
  fbox(q, f, u - W, u + W, y, y + 2.3, 0, 0.015, 'iron', SOOT);
  if (state === 'shut') {
    fbox(q, f, u - W + 0.02, u + W - 0.02, y + 0.02, y + 2.28, 0.015, 0.07, 'wood', DARK);
    for (const yy of [0.5, 1.9]) fbox(q, f, u - W + 0.05, u + W - 0.05, y + yy, y + yy + 0.08, 0.07, 0.09, 'iron'); // its bands
    fbox(q, f, u - 0.15, u + 0.15, y + 1.45, y + 1.7, 0.07, 0.1, 'iron', SOOT); // the grille
    return;
  }
  const th = state === 'ajar' ? 1 + r() * 0.5 : 0.35, len = state === 'ajar' ? 1.06 : 0.9;
  const [hx, hz] = f.at(u - W + (len / 2) * Math.cos(th), 0.05 + (len / 2) * Math.sin(th));
  if (state === 'ajar') { board(q, hx, hz, len, 0.06, y + 0.04, 2.22, f.yaw - th, 'wood', DARK); return; }
  board(q, hx, hz, len, 0.06, y + 1.3, 0.96, f.yaw - th, 'wood', DARK); // the top half, hanging off its upper hinge
  const [lx, lz] = f.at(u + 0.3, 0.9 + r() * 0.4);
  q.put(FLAT, 'wood', lx, y + 0.04, lz, 1.0, 0.06, 1.2, 0, f.yaw + (r() - 0.5) * 1.2, 0.08, DARK); // the bottom, kicked in and out again
  splinters(q, r, ...f.at(u, 0.5), y, 5, DARK);
}

const FLAT = new THREE.BoxGeometry(1, 1, 1);

/** `n` splinters and planks strewn round (x, z) on floor y. */
function splinters(q: Props, r: () => number, x: number, z: number, y: number, n: number, tint = WALNUT): void {
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, d = 0.2 + r() * 0.9;
    q.put(FLAT, 'wood', x + Math.cos(a) * d, y + 0.025, z + Math.sin(a) * d, 0.05 + r() * 0.05, 0.04, 0.25 + r() * 0.5, 0, r() * 6.28, 0, tint);
  }
}

/** Fallen coppi and plaster on a floor: `n` shards round (x, z). */
function shards(q: Props, r: () => number, x: number, z: number, y: number, n: number, spread = 1.2): void {
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, d = r() * spread, s = 0.08 + r() * 0.16;
    q.put(FLAT, r() < 0.6 ? 'roof' : 'stone', x + Math.cos(a) * d, y + 0.03, z + Math.sin(a) * d, s, 0.05, s * (0.6 + r()), r() * 0.3, r() * 6.28, r() * 0.3);
  }
}

/** A crack wandering off (u, y) over a wall's face, in a few dark strokes. */
function crack(q: Props, f: Face, u: number, y: number, r: () => number): void {
  let a = r() * 6.28;
  for (let k = 0; k < 5; k++) {
    const len = 0.25 + r() * 0.45, du = Math.cos(a) * len, dy = Math.sin(a) * len;
    const [x, z] = f.at(u + du / 2, 0.05);
    q.put(FLAT, 'iron', x, y + dy / 2, z, len, 0.025, 0.012, 0, f.yaw, Math.atan2(dy, du), SOOT);
    u += du; y += dy; a += (r() - 0.5) * 1.6;
  }
}

/** A memorial slab let into the wall at `a`: a dark frame, the pale stone, its lines of lettering. */
function lapide(q: Props, f: Face, a: number, y: number): void {
  const u = f.u(a);
  fbox(q, f, u - 0.6, u + 0.6, y, y + 0.85, 0, 0.05, 'stoneDark');
  fbox(q, f, u - 0.5, u + 0.5, y + 0.08, y + 0.77, 0.05, 0.07, 'stone', 0xd8d0c0);
  for (let k = 0; k < 4; k++) fbox(q, f, u - 0.38 + (k % 2) * 0.06, u + 0.38 - (k % 2) * 0.06, y + 0.6 - k * 0.12, y + 0.63 - k * 0.12, 0.07, 0.075, 'iron', SOOT);
}

/** A book open or shut, `s` its size, lying on y. */
function book(q: Props, r: () => number, x: number, z: number, y: number, s = 1, open = false): void {
  const tint = [0x6a2418, 0x23304a, 0x4a3c1a, 0x2e2216][Math.floor(r() * 4)], yaw = r() * 6.28;
  if (open) { q.box(x - 0.2 * s, x + 0.2 * s, y, y + 0.03 * s, z - 0.14 * s, z + 0.14 * s, 'cloth', yaw, LINEN); return; }
  q.put(FLAT, 'cloth', x, y + 0.04 * s, z, 0.22 * s, 0.08 * s, 0.3 * s, 0, yaw, r() < 0.3 ? 0.2 : 0, tint);
}

/**
 * The cloisters' walks dressed as the convent left them: along a wall's face from a0 to a1 (world, along it), one thing per bay,
 * nothing within 2 m of `keep` (its doors, its torches, the walks' gaps): cells' doors (shut, open, kicked in) where the range
 * behind has cells, benches against the wall (some smashed), memorial slabs, candelabra, lecterns, chairs thrown about, heaps of
 * fallen plaster, and coppi shards off the arcade's roof everywhere. What stands collides (under a metre); a walk keeps 1.5 m clear.
 */
function walk(b: LevelBuilder, q: Props, r: () => number, f: Face, a0: number, a1: number, keep: number[], doors: boolean): void {
  const n = Math.max(1, Math.round(Math.abs(a1 - a0) / 3.3)), at = (a: number, d: number) => f.at(f.u(a), d);
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * (i + 0.5)) / n;
    shards(q, r, ...at(a + (r() - 0.5) * 2, 1 + r()), 0, 2 + Math.floor(r() * 4));
    if (keep.some((k) => Math.abs(k - a) < 2)) continue;
    const roll = r(), yaw = f.yaw;
    if (doors && roll < 0.3) {
      cellDoor(q, f, a, roll < 0.16 ? 'shut' : roll < 0.24 ? 'ajar' : 'broken', r);
      if (r() < 0.5) place(b, 'sedia', ...xyz(at(a + 1.2, 0.5)), yaw + (r() - 0.5) * 2, 0.95, { tilt: Math.PI / 2 });
    } else if (roll < 0.5) {
      if (r() < 0.25) place(b, 'rotta', ...xyz(at(a, 0.6)), yaw + (r() - 0.5) * 0.4, 0.6);
      else place(b, 'panca', ...xyz(at(a, 0.28)), yaw, 1.05, { solid: true, stretch: 1.9 });
      if (r() < 0.4) place(b, 'sedia', ...xyz(at(a + 1.6, 0.5)), r() * 6, 0.95, { tilt: Math.PI / 2 * (r() < 0.5 ? 1 : -1) });
    } else if (roll < 0.64) {
      lapide(q, f, a, 1.25);
      if (r() < 0.6) place(b, 'candelabro', ...xyz(at(a + 0.9, 0.35)), r() * 6, 1.6, { solid: true });
      else place(b, 'candelabro', ...xyz(at(a, 0.5)), yaw + Math.PI / 2, 1.6, { tilt: Math.PI / 2 });
    } else if (roll < 0.74) {
      const down = r() < 0.4;
      place(b, 'leggio', ...xyz(at(a, down ? 0.6 : 0.45)), yaw + (r() - 0.5) * 0.6, 1.3, down ? { tilt: Math.PI / 2 } : { solid: true });
      book(q, r, ...at(a + 0.8, 0.9), 0, 1.4, r() < 0.5);
    } else if (roll < 0.88) {
      place(b, 'macerie', ...xyz(at(a, 0.7)), r() * 6, 0.06 + r() * 0.05);
      shards(q, r, ...at(a, 0.9), 0, 6, 1.6);
    } else {
      place(b, 'sedia', ...xyz(at(a - 0.5, 0.45)), yaw + (r() - 0.5) * 0.8, 0.95, { solid: true });
      place(b, 'sedia', ...xyz(at(a + 0.7, 0.8)), r() * 6, 0.95, { tilt: Math.PI / 2 * (r() < 0.5 ? 1 : -1) });
    }
  }
}
/** (x, z) on the floor: place()'s x, y, z. */
const xyz = ([x, z]: [number, number], y = 0): [number, number, number] => [x, y, z];

/**
 * San Giorgio's convent as a ruin of its grandeur, in the interior's zone (never on level 2's GPU), with the church's furniture
 * (level/arredi.ts: what is wood or iron breaks): the Cenacolo, the antirefettorio, the two cloisters' walks and well-heads, the
 * dormitory's corridor and its two broken cells, the library thrown about. The Abate's floor (enemies/sangiorgio.ts ABATE_BOUNDS)
 * keeps only what lies down, without colliders; the packs, the quest's givers and their spots, the doors and the walks stay clear.
 */
function convento(b: LevelBuilder): void {
  b.zone(INTERNO);
  const q = new Props(b, 223), r = rng(229);
  refettorio(b, q, r);
  // The antirefettorio: the church's marble, a candelabrum by each lavabo (one thrown down), what fell off its vault. The
  // Veronese's corner (north-east), the checkpoint before the Cenacolo's door and the lavabi themselves stay clear.
  b.floor(-536, -524, 36, 44, 'marble', 0, 0.02);
  place(b, 'candelabro', -534.9, 0, 37.1, 0.4, 1.6, { solid: true });
  place(b, 'candelabro', -525.4, 0, 37.6, 1.2, 1.6, { tilt: Math.PI / 2 });
  place(b, 'macerie', -534.6, 0.01, 43.1, 2, 0.07);
  shards(q, r, -533.6, 42.4, 0, 8, 1.4);
  const anti = face('x', 36.3, 1);
  lapide(q, anti, -533.2, 1.4);
  // The cloisters' walks: their back walls' faces, from corner to corner.
  const allori = { w: face('z', -547.7, 1), e: face('z', -512.3, -1), s: face('x', 44.3, 1), n: face('x', 79.7, -1) };
  walk(b, q, r, allori.w, 45.8, 78.2, [54, 62, 70], false); // the dormitory's door between the torches: the cells are behind it
  walk(b, q, r, allori.e, 45.8, 78.2, [54, 62], true);
  walk(b, q, r, allori.s, -546.2, -513.8, [SGX], true);
  walk(b, q, r, allori.n, -546.2, -513.8, [SGX], false); // the transept's white wall: no cells
  const cipressi = { w: face('z', -503.7, 1), e: face('z', -462.3, -1), s: face('x', 44.3, 1), n: face('x', 79.7, -1) };
  walk(b, q, r, cipressi.w, 45.8, 78.2, [62, 72], true);
  walk(b, q, r, cipressi.e, 45.8, 78.2, [54, 70], true);
  walk(b, q, r, cipressi.s, -502.2, -463.8, [-491, -488.5, -493.5], true);
  walk(b, q, r, cipressi.n, -502.2, -463.8, [], true);
  // Both well-heads under their iron: two uprights off the rim, an arch, the pulley, a rope down and the bucket left on the rim.
  for (const [x, z, rr, h] of [[SGX, 62, 0.9, 0.9], [POZZO2.x, POZZO2.z, 0.8, 0.85]] as const) {
    const top = h + 0.26, R = rr + 0.1;
    for (const s of [-1, 1]) q.rod(x + s * R, top, z, x + s * R, top + 1.7, z, 0.035, 'iron');
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * Math.PI, a1 = ((k + 1) / 6) * Math.PI;
      q.rod(x + Math.cos(a0) * R, top + 1.7 + Math.sin(a0) * R * 0.5, z, x + Math.cos(a1) * R, top + 1.7 + Math.sin(a1) * R * 0.5, z, 0.03, 'iron');
    }
    q.put(PULLEY, 'iron', x, top + 1.7 + R * 0.5 - 0.12, z, 0.16, 0.05, 0.16, Math.PI / 2, 0, 0);
    q.rod(x + 0.16, top + 1.7 + R * 0.5 - 0.12, z, x + 0.16, top + 0.3, z, 0.012, 'wood'); // the rope
    q.put(PULLEY, 'wood', x - rr + 0.05, top + 0.12, z + 0.2, 0.17, 0.24, 0.17, 0.2, 0, 0.1, WALNUT); // the bucket
    shards(q, r, x + 1.4, z - 0.8, 0, 3, 0.6);
  }
  library3(b, q, r);
  cells(b, q, r);
  q.flush();
  b.zone('sangiorgio');
}
const PULLEY = new THREE.CylinderGeometry(1, 1, 1, 10);

/**
 * The Cenacolo palladiano, the Abate's hall, dressed (cenacolo() is its shell): the church's marble on the floor, Palladio's white
 * hall inside the convent's brick (a skin of Istrian stone over a walnut wainscot, pilasters between the high windows with the moon
 * in them, a cornice, a boarded ceiling on its beams, a Diocletian window over the antirefettorio's door); the long walnut tables on
 * their trestles, the cloths dragged half off, pewter, bread, chalices thrown down, one table's end collapsed; the monks' benches
 * behind them against the wainscot; the reader's pulpit up on the east wall under its sounding board; the gilt frame of the Nozze
 * di Cana on the end wall between pilasters; fallen plaster, a beam down, chairs flung about the floor.
 */
function refettorio(b: LevelBuilder, q: Props, r: () => number): void {
  const { x0, x1, z0, z1 } = CENACOLO, T0 = z0 + 4, T1 = z1 - 3, CEIL = CEN_CEIL, IN = 0.3;
  b.floor(x0, x1, z0, z1, 'marble', 0, 0.02);
  const walls = [face('z', x0 + IN, 1), face('z', x1 - IN, -1)];
  for (const f of walls) {
    const [ua, ub] = [f.u(z0 + IN), f.u(z1 - IN)].sort((p, s) => p - s);
    b.part(f.m, ua, ub, 2.66, CEIL, 0, 0.04, 'stone'); // the field, grimed: the order over it in white
    b.part(f.m, ua, ub, 0, 2.5, 0, 0.1, 'wood'); // the wainscot
    b.part(f.m, ua, ub, 2.5, 2.66, 0, 0.18, 'wood');
    for (let z = z0 + 1.2; z < z1 - 0.8; z += 1.6) fbox(q, f, f.u(z) - 0.06, f.u(z) + 0.06, 0.12, 2.5, 0.1, 0.14, 'wood', DARK); // its stiles
    b.part(f.m, ua, ub, 9.4, 9.8, 0, 0.42, 'istria'); // the cornice
    b.part(f.m, ua, ub, 9.8, 10.0, 0, 0.58, 'istria');
    for (let i = 0; i < 7; i++) { // the skin come away in patches, the brick behind it; cracks running off them
      const z = z0 + 2 + r() * (z1 - z0 - 4), y = 3.2 + r() * 5.4, w = 0.5 + r() * 1.4, h = 0.4 + r() * 1.1;
      fbox(q, f, f.u(z) - w / 2, f.u(z) + w / 2, y, y + h, 0.02, 0.05, 'brick');
      fbox(q, f, f.u(z) - w / 2 - 0.25, f.u(z) - w / 2 + 0.3, y + h * 0.3, y + h * 0.7, 0.02, 0.048, 'brick');
      crack(q, f, f.u(z) + w / 2, y + h * 0.5, r);
    }
    for (const z of [8, 14, 26, 32]) { // pilasters between the windows (the pulpit's bay keeps its wall)
      b.part(f.m, f.u(z) - 0.38, f.u(z) + 0.38, 2.66, 9.0, 0.04, 0.2, 'istria');
      b.part(f.m, f.u(z) - 0.48, f.u(z) + 0.48, 9.0, 9.4, 0.04, 0.3, 'istria');
    }
    for (const z of [11, 17, 23, 29]) { // the high windows, the moon in them
      const u = f.u(z), sp = 8.1, w = 0.8;
      b.part(f.m, u - w, u + w, 6.3, sp, 0.04, 0.06, 'luna');
      b.decor(shaped(lunette(u, sp, w, 0.06, 1)).applyMatrix4(f.m), 'luna');
      b.decor(shaped(arch(u, sp, w, w + 0.24, 0.16)).translate(0, 0, 0.12).applyMatrix4(f.m), 'istria');
      b.part(f.m, u - w - 0.24, u - w, 6.3, sp, 0.04, 0.2, 'istria');
      b.part(f.m, u + w, u + w + 0.24, 6.3, sp, 0.04, 0.2, 'istria');
      b.part(f.m, u - w - 0.35, u + w + 0.35, 6.12, 6.3, 0.04, 0.3, 'istria'); // its sill on the marcapiano
    }
  }
  // The end walls: the south one (the garden's door, the Nozze's frame), the north (the antirefettorio's door, the Diocletian window over it).
  for (const [z, s] of [[z0 + IN, 1], [z1 - IN, -1]] as const) {
    const f = face('x', z, s), [ua, ub] = [f.u(x0 + IN), f.u(x1 - IN)].sort((p, t) => p - t), d0 = f.u(SGX) - 1.2, d1 = f.u(SGX) + 1.2;
    const gap = s > 0 ? 13.2 : 3.75; // the cornice breaks for the Nozze's frame and pilasters, and for the window
    b.part(f.m, ua, d0 - 0.3, 0, CEIL, 0, 0.04, 'stone');
    b.part(f.m, d1 + 0.3, ub, 0, CEIL, 0, 0.04, 'stone');
    b.part(f.m, d0 - 0.3, d1 + 0.3, 4.25, CEIL, 0, 0.04, 'stone');
    for (const [a, c] of [[ua, d0 - 0.3], [d1 + 0.3, ub]]) b.part(f.m, a, c, 0, 0.5, 0, 0.1, 'stoneDark');
    for (const [a, c] of [[ua, f.u(SGX) - gap], [f.u(SGX) + gap, ub]]) {
      b.part(f.m, a, c, 9.4, 9.8, 0, 0.42, 'istria');
      b.part(f.m, a, c, 9.8, 10.0, 0, 0.58, 'istria');
    }
    for (const u of [d0 - 0.3, d1]) b.part(f.m, u, u + 0.3, 0, 3.6, 0, 0.16, 'istria'); // the door's jambs
    b.part(f.m, d0 - 0.5, d1 + 0.5, 3.6, 4.0, 0, 0.24, 'istria'); // its lintel
    b.part(f.m, d0 - 0.7, d1 + 0.7, 4.0, 4.25, 0, 0.36, 'istria'); // its cornice
  }
  // The Nozze's gilt frame, in mouldings, between two pilasters (the canvas, quest/view.ts, hangs inside the lip at z0 + 0.7).
  const S = face('x', z0 + IN, 1);
  const gild = (x0g: number, x1g: number, y0: number, y1: number, d: number) => {
    for (const [a, c, e, g] of [[x0g, x1g, y0 - 0.3, y0], [x0g, x1g, y1, y1 + 0.3], [x0g, x0g + 0.3, y0, y1], [x1g - 0.3, x1g, y0, y1]]) b.part(S.m, S.u(a), S.u(c), e, g, 0.02, d, 'doratura');
  };
  gild(-540.7, -519.3, 4.8, 10.6, 0.38);
  gild(-541.2, -518.8, 4.5, 10.9, 0.24);
  for (const x of [-542.6, -517.4]) { b.part(S.m, S.u(x) - 0.45, S.u(x) + 0.45, 0.5, 9.0, 0.04, 0.3, 'istria'); b.part(S.m, S.u(x) - 0.58, S.u(x) + 0.58, 9.0, 9.4, 0.04, 0.4, 'istria'); }
  // The Diocletian window over the north door: a half wheel of moonlit glass split by two mullions, its Istrian ring.
  const N = face('x', z1 - IN, -1), cu = N.u(SGX);
  b.decor(shaped(lunette(cu, 6.4, 3.2, 0.06, 1)).applyMatrix4(N.m), 'luna');
  b.decor(shaped(arch(cu, 6.4, 3.2, 3.6, 0.3)).translate(0, 0, 0.16).applyMatrix4(N.m), 'istria');
  for (const du of [-1.07, 1.07]) b.part(N.m, cu + du - 0.12, cu + du + 0.12, 6.4, 6.4 + Math.sqrt(3.2 ** 2 - du ** 2), 0.04, 0.24, 'istria');
  b.part(N.m, cu - 3.8, cu + 3.8, 6.2, 6.42, 0.04, 0.34, 'istria');
  // The ceiling over it: ceilings(), coffered with the church's.

  // The tables: walnut tops on trestles, the cloths dragged half off, pewter and bread, chalices thrown down; the west one's north
  // end collapsed, its top sloping to the floor.
  TABLES.forEach((c, k) => {
    const hall = k ? -1 : 1, broke = k ? T1 : T1 - 4.2; // the hall's side of it; where its top ends
    q.box(c - 0.55, c + 0.55, 0.76, 0.86, T0, broke, 'wood', 0, WALNUT);
    for (let z = T0 + 0.4; z < broke; z += 2.4) {
      q.box(c - 0.42, c + 0.42, 0, 0.76, z - 0.07, z + 0.07, 'wood', 0, DARK); // the trestle
      q.box(c - 0.5, c + 0.5, 0, 0.08, z - 0.12, z + 0.12, 'wood', 0, DARK);
    }
    q.box(c - 0.05, c + 0.05, 0.22, 0.32, T0, broke, 'wood', 0, DARK); // the stretcher
    for (let z = T0 + 0.6; z < broke - 1; z += 3.4 + r() * 2) { // cloths, one end pulled over the hall's edge
      const len = 1.6 + r() * 1.6;
      q.box(c - 0.5, c + 0.5, 0.86, 0.875, z, Math.min(z + len, broke - 0.2), 'cloth', 0, LINEN);
      if (r() < 0.6) q.box(c + hall * 0.5, c + hall * 0.52, 0.2 + r() * 0.3, 0.87, z, Math.min(z + len, broke - 0.2), 'cloth', 0, LINEN);
    }
    for (let z = T0 + 0.8; z < broke - 0.4; z += 1.1) { // a place laid for every monk: pewter plate, a cup, some bread
      if (r() < 0.25) continue;
      const pz = z + (r() - 0.5) * 0.3, side = c - hall * 0.15;
      q.disc(side, 0.875, pz, 0.14, 0.015, 'iron', PEWTER);
      if (r() < 0.5) q.disc(side + hall * 0.3, 0.875, pz + 0.25, 0.04, 0.12, r() < 0.3 ? 'gold' : 'iron', PEWTER);
      if (r() < 0.4) q.blob(side + (r() - 0.5) * 0.1, 0.92, pz, 0.08, 0.05, 0.06, 'wood', 0xb08850);
      if (r() < 0.2) q.put(PULLEY, 'gold', side + hall * 0.35, 0.91, pz - 0.2, 0.045, 0.14, 0.045, Math.PI / 2, r() * 6, 0); // a chalice, knocked over
    }
    for (let z = T0 + 3; z < broke; z += 6) b.lights.push({ x: c, y: 1.15, z, kind: 'candle' });
    for (let z = T0 + 3; z < broke; z += 6) q.disc(c, 0.875, z, 0.035, 0.22, 'flower', 0xf0e6cc);
    if (broke < T1) { // the collapsed end: its top tipped down to the floor, a trestle on its side, pewter all over the marble
      const m = new THREE.Matrix4().makeRotationX(Math.atan2(0.82, T1 - broke)).setPosition(c, 0.86, broke);
      b.part(m, -0.55, 0.55, -0.1, 0, 0, Math.hypot(0.82, T1 - broke), 'wood');
      q.box(c - 0.42, c + 0.42, 0, 0.14, broke + 1.2, broke + 2, 'wood', 0.3, DARK);
      for (let i = 0; i < 9; i++) q.disc(c + hall * (0.4 + r() * 1.4), 0.02, broke + r() * 4, 0.14, 0.015, 'iron', PEWTER);
      splinters(q, r, c + hall * 0.6, broke + 0.4, 0, 6, DARK);
    }
  });
  // The monks' benches behind the tables against the wainscot, facing in: a few smashed, one gone, one tipped on its back.
  for (const [x, yaw] of [[x0 + IN + 0.32, Math.PI / 2], [x1 - IN - 0.32, -Math.PI / 2]] as const) for (let z = T0 + 1.05; z < T1 - 0.5; z += 2.15) {
    const roll = r();
    if (roll < 0.12) continue;
    if (roll < 0.26) place(b, 'rotta', x + Math.sign(yaw) * 0.25, 0, z, yaw + (r() - 0.5) * 0.4, 0.6);
    else if (roll < 0.34) place(b, 'panca', x + Math.sign(yaw) * 0.3, 0, z, yaw + 0.15, 1.05, { tilt: Math.PI / 2 * (r() < 0.5 ? 1 : -1), stretch: 2 });
    else place(b, 'panca', x, 0, z, yaw, 1.05, { solid: true, stretch: 2 });
  }
  // On the hall's side of the tables, chairs: a few still standing at the tables (out of the Abate's floor), the rest thrown across it.
  for (const [c, hall] of [[TABLES[0], 1], [TABLES[1], -1]] as const) for (let z = T0 + 1.5; z < T1 - 1; z += 2.6 + r() * 1.5) {
    if (r() < 0.35) place(b, 'sedia', c + hall * 0.95, 0, z, -hall * Math.PI / 2 + (r() - 0.5) * 0.5, 0.95, { solid: true });
    else place(b, 'sedia', c + hall * (1.2 + r() * 4), 0, z + (r() - 0.5) * 2, r() * 6, 0.95, { tilt: Math.PI / 2 * (r() < 0.5 ? 1 : -1) });
  }
  // The reader's pulpit, up on the east wall over the table: a corbel of Istrian stone, its floor, a walnut parapet with a gilt
  // cross, the great lectern on it, the sounding board over it, the little door it was reached by.
  const pf = walls[1], pu = pf.u(20);
  b.together(() => {
    b.part(pf.m, pu - 0.6, pu + 0.6, 1.9, 2.25, 0.04, 0.5, 'istria');
    b.part(pf.m, pu - 0.85, pu + 0.85, 2.25, 2.55, 0.04, 0.95, 'istria');
    b.part(pf.m, pu - 1.05, pu + 1.05, 2.55, 2.72, 0.04, 1.4, 'istria');
    b.part(pf.m, pu - 1.0, pu + 1.0, 2.72, 3.75, 1.28, 1.36, 'wood'); // the parapet, front and sides
    for (const s of [-1, 1]) b.part(pf.m, pu + s * 0.96 - 0.04, pu + s * 0.96 + 0.04, 2.72, 3.75, 0.04, 1.36, 'wood');
    b.part(pf.m, pu - 1.06, pu + 1.06, 3.75, 3.86, 0.04, 1.42, 'wood');
    b.part(pf.m, pu - 0.05, pu + 0.05, 2.9, 3.6, 1.36, 1.4, 'doratura');
    b.part(pf.m, pu - 0.25, pu + 0.25, 3.3, 3.38, 1.36, 1.4, 'doratura');
    b.part(pf.m, pu - 0.9, pu + 0.9, 3.86, 5.8, 0.04, 0.1, 'wood'); // its back
    b.part(pf.m, pu - 1.15, pu + 1.15, 5.8, 6.0, 0.04, 1.55, 'wood'); // the sounding board
    b.part(pf.m, pu - 1.2, pu + 1.2, 6.0, 6.12, 0.04, 1.6, 'doratura');
  });
  const [px, pz] = pf.at(pu, 0.8);
  place(b, 'leggio', px, 2.72, pz, pf.yaw, 1.05, { fixed: true });
  b.lights.push({ x: px - 0.4, y: 4.1, z: pz, kind: 'candle' });
  fbox(q, pf, pu + 1.3, pu + 2.2, 2.72, 4.9, 0, 0.03, 'iron', SOOT); // the stair's door in the wall, its frame
  fbox(q, pf, pu + 1.2, pu + 2.3, 4.9, 5.05, 0, 0.1, 'istria');
  // What fell: plaster and stone heaps in the corners and along the walls, one in the hall; a ceiling beam down across the
  // west table's broken end; candelabra by the frame wall, one thrown down; a lectern on its side by the north door.
  for (const [x, z, s] of [[-545.4, 34.6, 0.11], [-514.8, 34.8, 0.12], [-546.4, 5.6, 0.09], [-513.6, 5.4, 0.1], [-538.2, 34.9, 0.07], [-521.6, 35, 0.08], [-533.4, 24.6, 0.05]] as const) {
    place(b, 'macerie', x, 0.01, z, r() * 6, s);
    shards(q, r, x, z, 0, 7, 1.8);
  }
  const fall = new THREE.Matrix4().makeRotationY(0.5).multiply(new THREE.Matrix4().makeRotationZ(0.22)).setPosition(-543.6, 0.55, 31.6);
  b.part(fall, -3.4, 3.4, -0.2, 0.2, -0.2, 0.2, 'wood');
  place(b, 'candelabro', -536.2, 0, 5.6, 0.3, 1.6, { solid: true });
  place(b, 'candelabro', -523.8, 0, 5.6, 1.1, 1.6, { solid: true });
  place(b, 'candelabro', -527.5, 0, 6.4, 2.2, 1.6, { tilt: Math.PI / 2 });
  place(b, 'leggio', -526.3, 0, 34.7, Math.PI, 1.3, { tilt: Math.PI / 2 });
  for (let i = 0; i < 10; i++) q.disc(-542 + r() * 24, 0.02, 8 + r() * 25, 0.14, 0.015, 'iron', PEWTER); // pewter flung over the floor
  for (let i = 0; i < 6; i++) book(q, r, -541 + r() * 22, 9 + r() * 22, 0.02, 1.3);
  for (const x of [-536, -524]) b.lights.push({ x, y: 8.6, z: 20, kind: 'glow', color: 0xffb46a }); // warm light up on the walls and ceiling
  for (const [k, c] of TABLES.entries()) for (const z of [13, 26]) b.lights.push({ x: c + (k ? -1.6 : 1.6), y: 3, z, kind: 'glow', color: 0xffa860 }); // and low over the tables and benches
}

/**
 * The library thrown about (library() is its shell): books pulled off the cases and strewn, chairs at the reading tables and
 * knocked over, a lectern, candelabra by the globes, fallen plaster. Clear of the cases' bays (SCANSIE) and the aisle.
 */
function library3(b: LevelBuilder, q: Props, r: () => number): void {
  const Y = LIB_F;
  for (const x of [-499, -483]) for (const z of [2, 11]) {
    place(b, 'sedia', x - 0.8, Y, z - 1.15, 0.1, 0.95, { solid: true });
    place(b, 'sedia', x + 0.9, Y, z + 1.3, Math.PI + 0.5, 0.95, { tilt: Math.PI / 2 });
    for (let i = 0; i < 3; i++) book(q, r, x + (r() - 0.5) * 3, z + (r() < 0.5 ? -1.3 : 1.3) + (r() - 0.5) * 0.6, Y, 1.4, r() < 0.3);
  }
  for (const x of [-505.4, -472.6]) for (let z = -3.6; z < 18; z += 1.2 + r() * 1.6) for (let i = 0; i < 2; i++) book(q, r, x + (x < -490 ? 1 : -1) * r() * 1.4, z + r() * 0.6, Y, 1.4, r() < 0.15); // off the cases
  place(b, 'leggio', -500.5, Y, 16.8, Math.PI - 0.4, 1.3, { solid: true }); // off the aisle from the door
  place(b, 'candelabro', -504, Y, 9.2, 0.4, 1.6, { solid: true });
  place(b, 'candelabro', -474, Y, 9.4, 1.9, 1.6, { tilt: Math.PI / 2 });
  for (const [x, z, s] of [[-506, -4.4, 0.08], [-472, 18.2, 0.07]] as const) { place(b, 'macerie', x, Y + 0.01, z, r() * 6, s); shards(q, r, x, z, Y, 6); }
}

/**
 * The dormitory's dress (dormitorio() is its shell): the corridor's vault and marble, the shut cells' doors down both walls, a
 * bench, a lectern, a candelabrum thrown down, the moonlit window at its end; the two broken cells: a plank bed with its straw
 * mattress (one collapsed), a prie-dieu, a chest, a crucifix, a stool, the monk's books, the plaster come down.
 */
function cells(b: LevelBuilder, q: Props, r: () => number): void {
  const { x0, x1, z0, z1, c0, c1 } = DORM, cz = (c0 + c1) / 2, R = (c1 - c0 - 0.3) / 2;
  b.floor(x0, x1, c0 + 0.15, c1 - 0.15, 'marble', 0, 0.02);
  b.floor(CELLS.n - 2.1, CELLS.n + 2.1, c1 + 0.15, z1, 'wood', 0, 0.02);
  b.floor(CELLS.s - 2.1, CELLS.s + 2.1, z0, c0 - 0.15, 'wood', 0, 0.02);
  b.together(() => {
    const vault = new THREE.Mesh(new THREE.CylinderGeometry(R, R, x1 - x0, 16, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), material('stone', true));
    vault.position.set((x0 + x1) / 2, 3.1, cz);
    b.add(vault, 'stone');
    for (const z of [c0 + 0.15, c1 - 0.15]) b.part(null, x0, x1, 2.95, 3.12, z - (z < cz ? 0 : 0.12), z + (z < cz ? 0.12 : 0), 'istria'); // where it springs
    for (const x of [-561, -553]) { // transverse ribs
      const g = shaped(arch(0, 3.1, R - 0.05, R + 0.05, 0.3)).rotateY(Math.PI / 2).translate(x, 0, cz);
      b.decor(g, 'istria');
    }
  });
  for (const z of [c0 + 0.15, c1 - 0.15]) b.part(null, x0, x1, 0, 0.35, z - (z < cz ? 0 : 0.06), z + (z < cz ? 0.06 : 0), 'stoneDark'); // the skirting
  const S = face('x', c0 + 0.15, 1), N = face('x', c1 - 0.15, -1), W = face('z', x0, 1);
  for (const x of [-563.5, -553.5, -550.5]) cellDoor(q, S, x, x === -553.5 ? 'ajar' : 'shut', r);
  for (const x of [-563.5, -559.5, -551]) cellDoor(q, N, x, x === -563.5 ? 'broken' : 'shut', r);
  // the window at its end
  const wu = W.u(cz);
  b.part(W.m, wu - 0.55, wu + 0.55, 1.2, 2.3, 0, 0.03, 'luna');
  b.decor(shaped(lunette(wu, 2.3, 0.55, 0.03, 1)).applyMatrix4(W.m), 'luna');
  b.decor(shaped(arch(wu, 2.3, 0.55, 0.75, 0.14)).translate(0, 0, 0.08).applyMatrix4(W.m), 'istria');
  b.part(W.m, wu - 0.8, wu + 0.8, 1.05, 1.2, 0, 0.25, 'istria');
  place(b, 'panca', -557.2, 0, c0 + 0.5, 0, 1.05, { solid: true, stretch: 1.6 });
  place(b, 'leggio', -565.2, 0, cz + 0.7, Math.PI / 2 + 0.3, 1.3, { solid: true });
  place(b, 'candelabro', -552, 0, cz + 0.4, 0.8, 1.6, { tilt: Math.PI / 2 });
  place(b, 'sedia', -561.8, 0, c1 - 0.6, 2.4, 0.95, { tilt: -Math.PI / 2 });
  place(b, 'macerie', -564.6, 0.01, c0 + 0.7, 1.3, 0.07);
  shards(q, r, -560, cz, 0, 10, 1.3);
  shards(q, r, -553, cz - 0.4, 0, 6, 1.2);
  book(q, r, -556.4, cz + 0.6, 0.02, 1.4, true);
  // The two cells, each against its back wall: the bed, the prie-dieu under the crucifix, the chest, a stool.
  for (const [cx, back, s] of [[CELLS.n, z1, -1], [CELLS.s, z0, 1]] as const) {
    const f = face('x', back, s), u = f.u(cx), broken = s > 0;
    const at = (du: number, d: number) => f.at(u + du, d);
    // the bed: a plank frame on legs along the back wall, the straw mattress, a blanket half on the floor
    const [bx, bz] = at(-0.6, 0.5);
    b.world.add(bx, bz, 1.0, 0.45, 0, 0.5, 0);
    if (broken) { // its legs gone at one end: the frame and the mattress slope to the floor
      q.put(FLAT, 'wood', bx, 0.27, bz, 2.0, 0.1, 0.9, 0, f.yaw, 0.16, WALNUT);
      q.put(FLAT, 'cloth', bx, 0.4, bz, 1.9, 0.15, 0.8, 0, f.yaw, 0.16, STRAW);
      splinters(q, r, bx + 0.6, bz, 0, 4, WALNUT);
    } else {
      fbox(q, f, u - 1.6, u + 0.4, 0.34, 0.44, 0.05, 0.95, 'wood', WALNUT);
      for (const du of [-1.5, 0.3]) for (const d of [0.12, 0.88]) fbox(q, f, u + du - 0.05, u + du + 0.05, 0, 0.34, d - 0.05, d + 0.05, 'wood', DARK);
      fbox(q, f, u - 1.55, u + 0.35, 0.44, 0.6, 0.1, 0.9, 'cloth', STRAW);
      fbox(q, f, u - 1.55, u - 0.6, 0.6, 0.64, 0.12, 0.88, 'cloth', 0x4a3e30);
      fbox(q, f, u - 0.9, u - 0.3, 0.02, 0.06, 1.0, 1.7, 'cloth', 0x4a3e30); // the blanket pulled down
    }
    // the crucifix and the prie-dieu under it
    fbox(q, f, u + 1.18, u + 1.26, 1.5, 2.4, 0, 0.05, 'wood', DARK);
    fbox(q, f, u + 1.0, u + 1.44, 2.05, 2.12, 0, 0.05, 'wood', DARK);
    fbox(q, f, u + 0.95, u + 1.5, 0, 0.18, 0.4, 0.7, 'wood', WALNUT);
    fbox(q, f, u + 0.95, u + 1.5, 0, 0.85, 0.05, 0.18, 'wood', WALNUT);
    fbox(q, f, u + 0.92, u + 1.53, 0.85, 0.9, 0.0, 0.3, 'wood', DARK);
    // the chest by the door, its lid thrown open; a stool; books and papers
    const [kx, kz] = at(1.4, 1.9);
    b.world.add(kx, kz, 0.4, 0.3, 0, 0.5, f.yaw);
    board(q, kx, kz, 0.8, 0.55, 0, 0.45, f.yaw, 'wood', WALNUT);
    const [lx, lz] = at(1.4, 1.6);
    q.put(FLAT, 'wood', lx, 0.65, lz, 0.82, 0.05, 0.4, -1.1, f.yaw, 0, DARK); // its lid, thrown open
    place(b, 'sedia', ...xyz(at(-0.4, 1.9)), f.yaw + (r() - 0.5) * 2, 0.95, broken ? { tilt: Math.PI / 2 } : { solid: true });
    for (let i = 0; i < 4; i++) book(q, r, ...at((r() - 0.5) * 2.6, 1.1 + r() * 1.4), 0.02, 1.2, r() < 0.4);
    for (let i = 0; i < 6; i++) { const [x, z] = at((r() - 0.5) * 3, 0.9 + r() * 2); q.box(x - 0.1, x + 0.1, 0.02, 0.025, z - 0.14, z + 0.14, 'cloth', r() * 6, 0xe2d8c0); } // loose pages
    if (broken) { place(b, 'macerie', ...xyz(at(0.6, 2.4), 0.01), r() * 6, 0.07); shards(q, r, ...at(0.4, 2), 0, 8, 1.2); }
    fbox(q, f, u - 2.1, u + 2.1, 3.48, 3.6, 0, 3.8, 'wood', DARK); // its boarded ceiling
  }
}

function garden(b: LevelBuilder, p: Props): void {
  b.area('Giardino di San Giorgio', -548, -452, -36, 4);
  b.area('Teatro Verde', -600, -548, -36, -8);
  const g = groundPatch(b, -600, -452, -36, 4, 'grass');
  g.paint(-548, -452, -26, -22, 'gravel').paint(-512, -508, -26, 4, 'gravel').paint(-536, -524, -22, 4, 'gravel').paint(-470, -452, -36, -8, 'gravel');
  // The Teatro Verde: tiers of grass on stone risers in a half ring facing the lagoon, the stage at its foot.
  const cx = -574, cz = -34, n = 12;
  for (let k = 0; k < 4; k++) {
    const r0 = 8 + k * 3, r1 = r0 + 3, top = 0.4 * (k + 1), rm = (r0 + r1) / 2;
    const tread = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 32, 1, 0, Math.PI), material('grass'));
    tread.rotation.x = -Math.PI / 2;
    tread.rotation.z = Math.PI;
    tread.position.set(cx, top + 0.01, cz);
    b.add(tread, 'grass');
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0, top, 32, 1, true, -Math.PI / 2, Math.PI), material('stone', true));
    riser.position.set(cx, top / 2, cz);
    b.add(riser, 'stone');
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * Math.PI, x = cx + Math.cos(a) * rm, z = cz + Math.sin(a) * rm;
      b.obox(x, z, rm * (Math.PI / n) * 1.12, 3, 0, top, -a + Math.PI / 2, 'grass', { visible: false, camera: false });
    }
  }
  b.box(cx - 7, cx + 7, 0, 0.5, -39.6, cz + 1, 'stone', { camera: false });
  b.box(cx - 2, cx + 2, 0, 0.25, cz + 1, cz + 1.9, 'stone', { camera: false }); // a step up to it, in the middle
  for (const x of [cx - 9, cx + 9]) cypress(p, x, -37, 8);
  // Cypresses and laurels round the lawns, a little labyrinth of box after Borges, benches.
  for (const [x, z] of [[-546, -30], [-546, -14], [-546, 0], [-500, -32], [-480, -32], [-460, -32], [-458, -14], [-458, -2]]) cypress(p, x, z, p.rand(6.5, 8.5));
  for (const [x, z] of [[-540, -6], [-516, -12], [-484, -18], [-476, -14]]) fruitTree(p, x, z, 0xf0d040, 0.9); // none in the labyrinth: its middle is walked to (Il libro di sabbia)
  const hedge = (x0: number, x1: number, z0: number, z1: number) => b.box(x0, x1, 0, 1.3, z0, z1, 'hedge', { camera: false });
  const { x: lx, z: lz } = LABIRINTO;
  for (const [r, gap] of [[2.5, 1], [5, -1], [7.5, 1]] as const) {
    hedge(lx - r, lx + r, lz - r - 0.35, lz - r + 0.35);
    hedge(lx - r, lx + r, lz + r - 0.35, lz + r + 0.35);
    if (gap > 0) { hedge(lx - r - 0.35, lx - r + 0.35, lz - r, lz - 0.8); hedge(lx - r - 0.35, lx - r + 0.35, lz + 0.8, lz + r); hedge(lx + r - 0.35, lx + r + 0.35, lz - r, lz + r); }
    else { hedge(lx + r - 0.35, lx + r + 0.35, lz - r, lz - 0.8); hedge(lx + r - 0.35, lx + r + 0.35, lz + 0.8, lz + r); hedge(lx - r - 0.35, lx - r + 0.35, lz - r, lz + r); }
  }
  p.disc(lx, 0, lz, 0.5, 0.9, 'stoneDark');
  bench(p, -520, -24, 0);
  bench(p, -470, -20, Math.PI / 2);
  for (const [x, z] of [[-530, -4], [-470, -30], [-560, -14]]) lampPost(b, p, x, z, 0);
}

function darsena(b: LevelBuilder, p: Props): void {
  const z1 = 150;
  b.area('Darsena di San Giorgio', -600, -562, 124, z1);
  for (const [x0, x1] of [[-600, -592], [-570, -562]]) {
    b.box(x0, x1, -1.2, 0, SG.z1, z1, 'ground');
    b.floor(x0, x1, SG.z1, z1, 'paving');
    b.barrier(x0, x1, z1, z1 + 0.6);
  }
  b.floor(-600, -562, 124, SG.z1, 'paving');
  b.barrier(-592, -591.4, SG.z1, z1);
  b.barrier(-570.6, -570, SG.z1, z1);
  b.barrier(-562, -561.4, SG.z1, z1);
  b.barrier(-592, -570, SG.z1 - 0.6, SG.z1);
  b.box(-592.25, -592, 0, 0.12, SG.z1, z1, 'stoneDark', { camera: false });
  b.box(-570, -569.75, 0, 0.12, SG.z1, z1, 'stoneDark', { camera: false });
  b.box(-592, -570, 0, 0.12, SG.z1 - 0.25, SG.z1, 'stoneDark', { camera: false });
  // The two lighthouses at the mouth: round white towers with a lantern, lit.
  for (const x of [-596, -566]) {
    b.column(x, z1 - 3, 1.6, 0, 9, 'stone');
    b.part(null, x - 1.9, x + 1.9, 9, 9.4, z1 - 4.9, z1 - 1.1, 'stoneDark');
    p.box(x - 0.9, x + 0.9, 9.4, 11, z1 - 3.9, z1 - 2.1, 'lantern');
    p.cone(x, 11, z1 - 3, 1.3, 1.4, 'iron');
    b.lights.push({ x, y: 10.2, z: z1 - 3, kind: 'lamp' });
  }
  // The squeri: an open boat shed on the east quay, a sandolo drawn up, oars, ropes.
  b.together(() => {
    for (const z of [128, 140]) for (const x of [-599.6, -592.6]) b.box(x - 0.2, x + 0.2, 0, 4, z - 0.2, z + 0.2, 'wood', { camera: false });
    b.hipRoof(-600, -592.2, 127.6, 140.4, 4, 0.5, 0.35);
  });
  p.box(-598, -594, 0, 0.6, 132, 133.4, 'iron');
  b.box(-598, -594, 0, 0.7, 132, 133.4, 'mass', { visible: false });
  for (let i = 0; i < 4; i++) p.rod(-599.4, 0, 136 + i * 0.6, -599, 3.4, 136.2 + i * 0.6, 0.05, 'wood');
  for (const [x, z] of [[-580, 127], [-556, 127]]) fanale(b, p, x, z - 3);
}
