import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

/** The Punta's water edge, and the pontile where the gondola waits (its north side, `FERRY_A`). */
export const PUNTA_END = -404;
export const PIER = { x0: -417, x1: PUNTA_END, z0: 8, z1: 12 };
/** The approdo in front of the basilica, and its gondola berth. */
export const LANDING = { x0: -444, x1: -433, z0: 98, z1: 102 };
/** Where the gondola lies at each end (its middle, on the water), and the way between them (quest/ferry.ts). */
export const FERRY_A = { x: -412, z: 13.8 }, FERRY_B = { x: -438.5, z: 103.8 };
export const CROSSING: [number, number][] = [[FERRY_A.x, FERRY_A.z], [-418, 26], [-428, 56], [-434, 84], [FERRY_B.x, FERRY_B.z]];
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
  for (const x of [-409, -415.5]) palina(p, x, PIER.z1 + 0.8);
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
  // The approdo: a wooden landing stage, the gondola's berth on its north side.
  b.box(LANDING.x0, LANDING.x1, -0.35, 0, LANDING.z0, LANDING.z1, 'wood', { camera: false });
  for (let x = LANDING.x1 - 0.4; x > LANDING.x0; x -= 1.6) for (const z of [LANDING.z0 + 0.2, LANDING.z1 - 0.2]) p.disc(x, -1.2, z, 0.14, 1.2, 'wood');
  b.barrier(LANDING.x0, LANDING.x1, LANDING.z0 - 0.6, LANDING.z0);
  b.barrier(LANDING.x0, LANDING.x1, LANDING.z1, LANDING.z1 + 0.6);
  b.barrier(LANDING.x1, LANDING.x1 + 0.6, LANDING.z0, LANDING.z1);
  for (const x of [-436, -441]) palina(p, x, LANDING.z1 + 0.8);
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
      b.part(null, x0, x1, 0.7, SPRING, ...face(0.03), 'stone'); // the recess, plain stone without the order's glow: it sits back
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
  // The canvases in their gilt frames: Tintoretto's Ultima Cena (south) and Raccolta della manna (north) on the presbytery's
  // walls, his Deposizione and Bassano's Adorazione dei pastori over the aisles' altars, turn and turn about.
  const quads: THREE.BufferGeometry[] = [];
  const canvas = (x: number, y: number, z: number, s: number, w: number, h: number, [px, py, pw, ph]: readonly number[]) => {
    const g = new THREE.PlaneGeometry(w, h), uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (px + uv.getX(i) * pw) / 512, 1 - (py + (1 - uv.getY(i)) * ph) / 432);
    quads.push((s < 0 ? g.rotateY(Math.PI) : g).translate(x, y, z + s * 0.04));
    const d = (a: number) => [Math.min(z, z + s * a), Math.max(z, z + s * a)] as const, t = 0.22;
    for (const [x0, x1, y0, y1] of [[-t, w + t, -t, 0], [-t, w + t, h, h + t], [-t, 0, 0, h], [w, w + t, 0, h]]) slab(b, null, x - w / 2 + x0, x - w / 2 + x1, y - h / 2 + y0, y - h / 2 + y1, ...d(0.14), 'doratura');
  };
  for (const [z, s, art] of [[92.4, 1, CANVAS.cena], [111.6, -1, CANVAS.manna]] as const) canvas(-547, 5.7, z, s, 8.4, 5.4, art);
  for (const [k, x] of [-488, -502, -514].entries()) {
    canvas(x, 3.9, 86.45, 1, 2.6, 3.2, k % 2 ? CANVAS.pastori : CANVAS.deposizione);
    canvas(x, 3.9, 117.55, -1, 2.6, 3.2, k % 2 ? CANVAS.deposizione : CANVAS.pastori);
  }
  b.add(new THREE.Mesh(mergeGeometries(quads)!, CANVASES));
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
    [-600, -548, -8, 80, 12, 'brick', 'n'], // the Manica lunga and the dormitories
    [-568, -540, 80, 92, 11, 'brick'], [-600, -578, 80, 124, 12, 'brick', 's'], [-578, -568, 80, 112, 10, 'brick'], // round the choir
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
  b.room(-548, -512, 44, 80, { h: 9, roof: false, role: 'brick', trim: true, floor: 'paving', n: [{ at: SGX, arch: true }], s: false, e: [{ at: 62, arch: true }] });
  b.wallX(80, -548, -540, { h: 9, role: 'brick', trim: true });
  b.wallX(80, -520, -512, { h: 9, role: 'brick', trim: true });
  b.area('Chiostro dei cipressi', -504, -462, 44, 80);
  b.room(-504, -462, 44, 80, { h: 9, roof: false, role: 'brick', trim: true, floor: 'paving', n: [{ at: -491, w: 3, arch: true }], w: [{ at: 62, arch: true }] });
  const a = groundPatch(b, -545, -515, 47, 77, 'paving', { skirt: true }).paint(-542, -518, 50, 74, 'grass').paint(-531.5, -528.5, 47, 77, 'gravel').paint(-545, -515, 60.5, 63.5, 'gravel');
  void a;
  b.curb(-542, -531.5, 50, 60.5); b.curb(-528.5, -518, 50, 60.5); b.curb(-542, -531.5, 63.5, 74); b.curb(-528.5, -518, 63.5, 74);
  b.well(SGX, 62, 0.9, 0.9);
  for (const [x, z] of [[-538, 55], [-522, 55], [-538, 69], [-522, 69], [-536, 72], [-524, 52]]) shrub(p, x, z, 1.1, 'hedge', true); // the laurels
  groundPatch(b, -501, -465, 47, 77, 'paving', { skirt: true }).paint(-498, -468, 50, 74, 'grass').paint(-484.5, -481.5, 47, 77, 'gravel');
  b.curb(-498, -484.5, 50, 74); b.curb(-481.5, -468, 50, 74);
  for (const x of [-496, -488, -478, -470]) for (const z of [53, 62, 71]) cypress(p, x, z, p.rand(7, 9));
  // A lamp post or two in each garden (pooled lights, no shadows): the arcade torches alone leave the middle dark on a phone.
  for (const [x, z] of [[-533, 59], [-527, 65], [-486, 57.5], [-480, 66.5]]) lampPost(b, p, x, z, 0);
  b.arcade(-548, -512, 44, 80, 3, 4.6, { gaps: [[SGX, 44], [SGX, 80], [-512, 62]], upper: 'nesw' });
  b.arcade(-504, -462, 44, 80, 3, 4.6, { gaps: [[-491, 44], [-504, 62]], upper: 'nsw' });
  for (const [x, z, nx, nz] of [[-547.6, 54, 1, 0], [-547.6, 70, 1, 0], [-512.4, 54, -1, 0], [-503.6, 72, 1, 0], [-462.4, 54, -1, 0], [-462.4, 70, -1, 0]] as const) b.lights.push({ x: x + nx * 0.32, y: 2.75, z: z + nz * 0.32, kind: 'torch', nx, nz });

  // Antirefettorio: Palladio's vestibule with its two lavabi, between the allori and the cenacolo.
  b.area('Antirefettorio', -536, -524, 36, 44);
  b.wallZ(-536, 36, 44, { h: 6, role: 'stone' });
  b.wallZ(-524, 36, 44, { h: 6, role: 'stone' });
  b.box(-536, -524, 6, 6.4, 36, 44, 'roof');
  b.box(-536, -524, 6.4, 12, 36, 44, 'plaster', { collide: false });
  b.floor(-536, -524, 36, 44, 'stone', 0, 0.02);
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
  b.room(x0, x1, z0, z1, { h: 12, role: 'plaster', trim: 6, floor: 'stone', n: [{ at: SGX, w: 2.4, h: 3.6, arch: true }], s: [{ at: SGX, w: 2.4, h: 3.6, arch: true }] });
  b.hipRoof(x0, x1, z0, z1, 12.4);
  for (let x = x0 + 3; x < x1 - 1; x += 3) b.part(null, x - 0.2, x + 0.2, 11.4, 12, z0, z1, 'wood'); // the ceiling's beams
  // The monks' tables along the long walls, their benches; the empty frame of the Nozze di Cana on the end wall.
  for (const x of [x0 + 1.2, x1 - 1.2]) {
    b.box(x - 0.6, x + 0.6, 0, 0.85, z0 + 4, z1 - 3, 'wood', { camera: false });
    p.box(x - 0.55, x + 0.55, 0.85, 0.88, z0 + 4, z1 - 3, 'cloth', 0, 0xe8e0d0);
    for (let z = z0 + 5; z < z1 - 3; z += 3.5) p.disc(x, 0.88, z, 0.12, 0.18, 'gold'); // chalices
  }
  b.part(null, -541, -519, 4.2, 11.2, z0 + 0.3, z0 + 0.55, 'gold'); // over the garden door
  b.part(null, -540.4, -519.6, 4.8, 10.6, z0 + 0.3, z0 + 0.62, 'stoneDark');
  for (let i = 0; i < 14; i++) { const x = p.rand(-540, -520.5); p.box(x, x + 0.4, 4.8, p.rand(5.2, 6.2), z0 + 0.62, z0 + 0.66, 'cloth', 0, 0xb89870); } // the cut canvas's ragged edge
  b.lights.push({ x: SGX, y: 6, z: z0 + 2, kind: 'glow', color: 0x80d8c0 }); // the frame still glows where the wedding hung
  for (const x of [x0 + 0.32, x1 - 0.32]) for (const z of [12, 20, 28]) b.lights.push({ x, y: 2.75, z, kind: 'torch', nx: x < SGX ? 1 : -1, nz: 0 });
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
