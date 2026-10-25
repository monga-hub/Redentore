import * as THREE from 'three';
import { type LevelBuilder, extrude, ring, shaped } from '../builder.ts';
import { material, type Role } from '../materials.ts';
import { Z } from '../plan.ts';
import { groundPatch } from '../ground.ts';
import { Props } from '../props.ts';
import { front, houses as dress } from '../facades.ts';

// Level 2's way out: the Fondamenta della Giudecca east of the Redentore, to the Zitelle
// (zones/zitelle.ts). East is -X here (plan.ts: the facade looks north over the canal, +Z), so seen
// from the canal the route runs off to the left of the church, as on the real island.
// Real places, compressed ~0.57 along the quay (see the task's DESIGN.md):
// Rio de la Croce and its stepped bridge, the Fondamenta de la Croce with its houses, a
// sotoportego into the Campiello de la Croce, the closed front of Santa Croce on its campo,
// the Rio del Squero with its bridge and the squero (boatyard) beside it, then the Fondamenta
// de le Zitelle to the Casa dei Tre Oci. Across the Canale della Giudecca the Zattere, the
// Salute and San Giorgio stand as dark masses on the skyline.
//   rio de la Croce   x -70..-62 (water), z -40..20; bridge deck z 12.5..17.5 at y 1.6, steps x -75..-71, -61..-57
//   fondamenta        z 10..20 (quay edge z 20), x -300..-60; houses on the south side (z < 10)
//   sotoportego       x -90..-86 through the houses z -16..10, campiello x -100..-76 z -30..-16
//   campo Santa Croce x -132..-104, z -14..10; church front z -14, x -126..-110
//   rio del Squero    x -172..-166, z -40..20; bridge steps x -177..-173, -165..-161
//   squero            x -196..-172, z -26..10 (tezon x -195..-182, z -25..-13)
//   Zitelle           x -284..-196 (zitelle.ts); Tre Oci x -298..-286, z -40..0; level 2's quay ends at x -300,
//                     where level 3's chain stands (zones/sangiorgio.ts goes on to the Punta)

/** x where level 2's quay ends, east: the chain across it falls with the third quest (quest/progress.ts). */
export const QUAY_END = -300;
/** The two rii crossing the fondamenta: water x0..x1 (x0 < x1). */
export const RII = { croce: [-70, -62], squero: [-172, -166] } as const;
const RISE = 1.6, RUN = 4, STEPS = 8; // the bridges: deck height, run of each flight, steps per flight
const BZ0 = 12.5, BZ1 = 17.5; // bridge width across the quay

export function buildGiudecca(b: LevelBuilder): void {
  b.zone('giudecca');
  const p = new Props(b, 71);

  // Island ground east of the Redentore's: cut by the two rii, whose water runs from the houses out to the canal.
  b.box(RII.croce[0], RII.croce[1], -1.2, 0, Z.riva, -40, 'ground');
  b.box(RII.squero[1], RII.croce[0], -1.2, 0, Z.riva, Z.quayEdge, 'ground');
  b.box(RII.squero[0], RII.squero[1], -1.2, 0, Z.riva, -40, 'ground');
  b.box(-340, RII.squero[0], -1.2, 0, Z.riva, Z.quayEdge, 'ground');

  // The quay: masegni paving, Istrian edge stones, the invisible edge; none over the rii, open to the water under the bridges.
  b.area('Fondamenta de la Croce', -166, -70, 10, Z.quayEdge);
  b.area('Fondamenta de le Zitelle', QUAY_END, -172, 10, Z.quayEdge);
  b.floor(QUAY_END, -196, 0, 10, 'paving'); // the sagrato of the Zitelle and the quay past them, wider
  for (const [x0, x1] of [[RII.croce[1], -60], [RII.squero[1], RII.croce[0]], [QUAY_END, RII.squero[0]]]) {
    b.floor(x0, x1, 10, Z.quayEdge, 'paving');
    b.box(x0, x1, 0, 0.12, Z.quayEdge - 0.25, Z.quayEdge, 'stoneDark', { camera: false });
    b.barrier(x0, x1, Z.quayEdge, Z.quayEdge + 0.6);
  }
  for (let x = -74; x > QUAY_END; x -= 9.5) if (x > -160 || x < -178) bitta(p, x, Z.quayEdge - 0.5); // mooring posts

  // The two rii: stone banks down to the water, the edges barred where the quay meets them, and a bridge each.
  for (const [name, [x0, x1]] of [['Ponte de la Croce', RII.croce], ['Ponte del Squero', RII.squero]] as const) {
    for (const x of [x0, x1]) {
      const s = x === x0 ? -1 : 1;
      b.box(x - 0.35 * -s, x, -1.2, 0.05, -40, Z.quayEdge, 'stoneDark', { camera: false }); // bank facing
      b.barrier(Math.min(x, x + 0.4 * s), Math.max(x, x + 0.4 * s), 10, BZ0);
      b.barrier(Math.min(x, x + 0.4 * s), Math.max(x, x + 0.4 * s), BZ1, Z.quayEdge);
    }
    bridge(b, p, x0, x1);
    b.area(name, x0 - RUN - 1, x1 + RUN + 1, BZ0, BZ1);
  }
  // The rio del Squero's west bank south of the quay is a narrow fondamenta of the squero's neighbours: walled off.
  b.barrier(RII.squero[1], RII.squero[1] + 0.4, -40, 10);

  // Houses along the quay, south side, round the campo and the campiello: blocks of three or four storeys, a Venetian
  // front (facades.ts) on each face onto the quay, a campo or a rio (those in the water with water doors).
  const houses: [number, number, number, number, number, Role, string, string?][] = [
    [RII.croce[1], -60, -40, 10, 12, 'plaster', 'sw', 'w'], // the Redentore's neighbours, down to the rio
    [-86, RII.croce[0], -16, 10, 11, 'plaster', 'sne', 'e'],
    [-104, -90, -16, 10, 13, 'mass', 'swn'],
    [-76, -70, -40, -16, 10, 'mass', 'we', 'e'], [-104, -100, -40, -16, 10, 'plaster', 'e'], [-100, -76, -40, -30, 9, 'plaster', 's'], // round the campiello
    [-110, -104, -40, -14, 12, 'plaster', 's'], [-132, -126, -40, -14, 12, 'plaster', 's'], // flanking Santa Croce
    [-148, -132, -30, 10, 12, 'mass', 'se'], [RII.squero[1], -148, -30, 10, 14, 'plaster', 'sw', 'w'],
    [-197, RII.squero[0], -60, -26, 10, 'mass', 's'], // behind the squero
    [-286, -282, -40, 0, 11, 'plaster', 's'], // between the Zitelle and the Tre Oci
    [-340, -298, -40, 0, 12, 'plaster', 's'], // past the Tre Oci
  ];
  houses.forEach(([x0, x1, z0, z1, h, role, sides, water], i) => dress(b, p, x0, x1, z0, z1, h, sides, 200 + 17 * i, role, {}, water));

  // Sotoportego de la Croce: a covered passage through the houses, beams overhead, into the campiello.
  b.area('Sotoportego de la Croce', -90, -86, -16, 10);
  b.together(() => {
    b.box(-90, -86, 3.4, 13, -16, 10, 'plaster');
    for (const side of ['s', 'n'] as const) front(b, p, -90, -86, -16, 10, side, 12.8, side === 's' ? 61 : 62, { y0: 3.4, cornice: true, ends: false });
  });
  for (let z = -15; z < 10; z += 2.5) p.box(-90, -86, 3.15, 3.4, z - 0.12, z + 0.12, 'wood');
  b.floor(-90, -86, -16, 10, 'paving', 0, 0.02);
  b.area('Campiello de la Croce', -100, -76, -30, -16);
  b.floor(-100, -76, -30, -16, 'paving', 0, 0.02);
  b.well(-88, -23, 0.9, 0.9);

  // Campo de Santa Croce: the convent church's closed front (now a prison: no way in), a well, benches.
  b.area('Campo de Santa Croce', -132, -104, -14, 10);
  b.floor(-132, -104, -14, 10, 'paving', 0, 0.02);
  santaCroce(b);
  b.well(-118, -2, 1, 0.9);

  // The squero: a gravel yard on the rio, a slipway into it, the tezon (open shed) and a gondola on trestles.
  b.area('Squero', -196, RII.squero[0], -26, 10);
  groundPatch(b, -196, RII.squero[0], -26, 10, 'dirt').paint(-196, RII.squero[0], 4, 10, 'gravel').paint(-196, -181, -26, -12, 'paving');
  b.barrier(RII.squero[0] - 0.4, RII.squero[0], -26, 10); // the slipway's edge on the rio
  b.wallZ(-197, -26, 0, { h: 3.2, role: 'brick', trim: true });
  squero(b, p);

  // Lanterns: iron fanali on brackets along the house fronts and on the bridges' crowns.
  for (const x of [-78, -96, -114, -138, -156, -186]) fanale(b, p, x, x === -114 ? -14 : x === -186 ? -26 : 10);
  for (const [x0, x1] of [RII.croce, RII.squero]) for (const z of [BZ0, BZ1]) lampPost(b, p, (x0 + x1) / 2, z, RISE);

  // The Casa dei Tre Oci (1913): a neo-gothic front with its three great windows on the canal.
  treOci(b, p);

  // Across the canal: the Zattere, the Salute and the Dogana as a dark skyline (San Giorgio is level 3, zones/sangiorgio.ts).
  skyline(b);
  p.flush();
}

/** A stepped Venetian bridge over the rio x0..x1: two flights, a deck, the arch under it, parapets. Colliders: steps, deck, side barriers. */
function bridge(b: LevelBuilder, p: Props, x0: number, x1: number): void {
  const a = x0 - 1, c = x1 + 1;
  b.stairs('x', BZ0, BZ1, a - RUN, a, 0, RISE, STEPS, 'stone');
  b.stairs('x', BZ0, BZ1, c + RUN, c, 0, RISE, STEPS, 'stone');
  b.box(a, c, RISE - 0.4, RISE, BZ0, BZ1, 'stone', { camera: false });
  // The arch: a slab with a round-headed hole down to the water, its ghiera in darker stone.
  const span = (x1 - x0) / 2, cx = (x0 + x1) / 2, sp = -0.6;
  const s = new THREE.Shape().moveTo(a, -1.2).lineTo(c, -1.2).lineTo(c, RISE - 0.4).lineTo(a, RISE - 0.4).closePath();
  s.holes.push(new THREE.Path().moveTo(x0, -1.2).lineTo(x0, sp).absarc(cx, sp, span, Math.PI, 0, true).lineTo(x1, -1.2).closePath());
  for (const z of [BZ0 + 0.3, BZ1 - 0.3]) {
    b.decor(shaped(extrude(s, 0.6, 0.03)).translate(0, 0, z), 'stone');
    b.decor(shaped(ring(cx, sp, span - 0.05, span + 0.3, 0.7)).translate(0, 0, z), 'stoneDark');
  }
  // Parapets, sloped with the flights: a stone band on little piers, as on the city's bridges.
  const par = new THREE.Shape().moveTo(a - RUN, 0).lineTo(a, RISE).lineTo(c, RISE).lineTo(c + RUN, 0)
    .lineTo(c + RUN, 0.9).lineTo(c, RISE + 0.95).lineTo(a, RISE + 0.95).lineTo(a - RUN, 0.9).closePath();
  for (const z of [BZ0 + 0.15, BZ1 - 0.15]) {
    b.decor(shaped(extrude(par, 0.3, 0.04)).translate(0, 0, z), 'stone', true);
    b.box(a - RUN, c + RUN, 0, RISE + 0.95, z - 0.15, z + 0.15, 'mass', { visible: false, camera: false });
  }
  p.box(a - RUN - 0.3, a - RUN + 0.3, 0, 1.1, BZ0, BZ0 + 0.35, 'stoneDark'); // newel stones at the feet
  p.box(a - RUN - 0.3, a - RUN + 0.3, 0, 1.1, BZ1 - 0.35, BZ1, 'stoneDark');
  p.box(c + RUN - 0.3, c + RUN + 0.3, 0, 1.1, BZ0, BZ0 + 0.35, 'stoneDark');
  p.box(c + RUN - 0.3, c + RUN + 0.3, 0, 1.1, BZ1 - 0.35, BZ1, 'stoneDark');
}

/** A mooring post (bitta) on the quay edge. */
export function bitta(p: Props, x: number, z: number): void {
  p.disc(x, 0, z, 0.22, 0.75, 'stoneDark');
  p.disc(x, 0.75, z, 0.27, 0.12, 'stoneDark');
}

/** An iron fanale on a bracket on the wall face at (x, z), facing +Z; lit by the torch pool. */
export function fanale(b: LevelBuilder, p: Props, x: number, z: number): void {
  const zz = z + 0.05, y = 3.6;
  p.box(x - 0.04, x + 0.04, y + 0.35, y + 0.45, zz, zz + 0.9, 'iron'); // arm
  p.box(x - 0.02, x + 0.02, y - 0.2, y + 0.45, zz, zz + 0.04, 'iron');
  p.box(x - 0.2, x + 0.2, y - 0.25, y + 0.3, zz + 0.65, zz + 1.05, 'lantern');
  p.cone(x, y + 0.3, zz + 0.85, 0.3, 0.3, 'iron');
  b.lights.push({ x, y, z: zz + 0.85, kind: 'lamp' });
}

/** A lamp post on a bridge's crown. */
export function lampPost(b: LevelBuilder, p: Props, x: number, z: number, y0: number): void {
  p.disc(x, y0 + 0.95, z, 0.08, 1.6, 'iron');
  p.box(x - 0.18, x + 0.18, y0 + 2.5, y0 + 2.95, z - 0.18, z + 0.18, 'lantern');
  p.cone(x, y0 + 2.95, z, 0.26, 0.28, 'iron');
  b.lights.push({ x, y: y0 + 2.7, z, kind: 'lamp' });
}

/** Santa Croce: a plain stone front with a pediment and a shut door, the convent's blind walls either side. */
function santaCroce(b: LevelBuilder): void {
  b.together(() => {
    b.box(-126, -110, 0, 15, -40, -14, 'stone');
    b.band(-126, -110, -40, -14, 9.5, 9.9, 0.15);
    b.band(-126, -110, -40, -14, 14.6, 15, 0.3);
    const g = new THREE.Shape().moveTo(-126.4, 15).lineTo(-109.6, 15).lineTo(-118, 19.2).closePath();
    b.decor(shaped(extrude(g, 1, 0.05)).translate(0, 0, -14.6), 'stone');
    b.hipRoof(-126, -110, -40, -15, 15);
  });
  for (const x of [-124.5, -111.5]) b.part(null, x - 0.5, x + 0.5, 0.4, 14.6, -14, -13.6, 'stoneDark'); // pilasters
  b.part(null, -119.6, -116.4, 0, 4.8, -14, -13.85, 'wood'); // the shut door
  b.part(null, -120, -116, 4.8, 5.3, -14, -13.6, 'stoneDark');
  b.decor(shaped(ring(-118, 11.6, 1.1, 1.5, 0.3)).translate(0, 0, -13.85), 'stoneDark'); // oculus
  b.decor(shaped(extrude(new THREE.Shape().absarc(-118, 11.6, 1.1, 0, Math.PI * 2, false), 0.1, 0)).translate(0, 0, -13.84), 'lantern');
}

/** The squero: slipway boards into the rio, the tezon on posts, a gondola on trestles, oars and planks. */
function squero(b: LevelBuilder, p: Props): void {
  const x0 = RII.squero[0];
  for (let z = -20; z < 2; z += 0.5) p.box(x0 - 4, x0, -0.05, 0.03, z, z + 0.42, 'wood'); // slipway planks
  // Tezon: posts, beams, a lean-to roof of coppi.
  b.together(() => {
    for (const x of [-195, -188.5, -182]) for (const z of [-25, -13]) b.box(x - 0.18, x + 0.18, 0, 4.4, z - 0.18, z + 0.18, 'wood', { camera: false });
    b.box(-195.4, -181.6, 4.4, 4.7, -25.3, -12.7, 'wood', { collide: false });
    b.hipRoof(-195, -182, -25, -13, 4.7, 0.6, 0.35);
  });
  // A gondola on trestles, black, its ferro at the prow (east, away from the rio).
  const hull = new THREE.Shape().moveTo(-5.5, 1.1).quadraticCurveTo(-3, 0, 0, 0).quadraticCurveTo(3, 0, 5.5, 1.3).lineTo(5.2, 1.35).quadraticCurveTo(2.5, 0.55, 0, 0.55).quadraticCurveTo(-2.5, 0.55, -5.2, 1.15).closePath();
  const g = shaped(extrude(hull, 1.4, 0.06)).translate(0, 0.9, -0.7).rotateY(Math.PI - 0.3).translate(-184, 0, -3.3);
  b.decor(g, 'iron', true);
  b.box(-186.5, -181.5, 0, 1.05, -5.2, -2.8, 'mass', { visible: false }); // its bulk, for walking round it
  for (const dx of [-3, 0, 3]) p.box(-184 - dx - 0.6, -184 - dx + 0.6, 0, 0.9, -4.2 + dx * 0.3, -3.8 + dx * 0.3, 'wood');
  p.box(-189.8, -189.6, 1.3, 2.4, -2.6, -2.4, 'iron'); // the ferro
  // Oars leaning on the shed, planks stacked.
  for (let i = 0; i < 5; i++) p.rod(-194.6, 0, -16 + i * 0.6, -194.2, 3.6, -16.2 + i * 0.6, 0.05, 'wood');
  for (let i = 0; i < 6; i++) p.box(-192, -184, i * 0.12, i * 0.12 + 0.1, -22 + i * 0.05, -21.4 + i * 0.05, 'wood');
}

/** Casa dei Tre Oci: brick, white Istrian trim, three tall pointed windows over the quay, a crenellated top. */
function treOci(b: LevelBuilder, p: Props): void {
  b.together(() => {
    b.box(-298, -286, 0, 14, -40, 0, 'brick');
    b.band(-298, -286, -40, 0, 0, 0.8, 0.1);
    b.band(-298, -286, -40, 0, 13.6, 14, 0.25);
  });
  for (const x of [-295, -292, -289]) {
    const w = new THREE.Shape().moveTo(x - 1.1, 6.5).lineTo(x + 1.1, 6.5).lineTo(x + 1.1, 10).quadraticCurveTo(x + 1.1, 11.3, x, 12).quadraticCurveTo(x - 1.1, 11.3, x - 1.1, 10).closePath();
    b.decor(shaped(extrude(w, 0.1, 0)).translate(0, 0, 0.06), 'lantern');
    p.box(x - 1.3, x + 1.3, 6.3, 6.5, 0, 0.3, 'stone');
  }
  for (let x = -286.4; x > -298; x -= 1.6) p.box(x - 0.8, x, 14, 14.7, -0.3, 0.2, 'stone'); // merlons
  p.box(-292.5, -291.5, 0, 3, 0, 0.12, 'wood');
  b.lights.push({ x: -292, y: 9, z: 1.5, kind: 'glow', color: 0xffb060 });
}

/** The far shore across the Canale della Giudecca, low-poly masses lost in the night. */
function skyline(b: LevelBuilder): void {
  const far = (x0: number, x1: number, z0: number, z1: number, h: number) => b.box(x0, x1, -1.2, h, z0, z1, 'mass', { collide: false, camera: false });
  for (let x = 260, i = 0; x > -160; x -= 22, i++) far(x - 20, x, 300, 316, 12 + ((i * 37) % 9)); // Zattere fronts
  far(-200, -160, 296, 316, 9); // Dogana
  const dome = (x: number, z: number, r: number, y: number) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), material('stone'));
    m.position.set(x, y, z);
    b.add(m, 'stone');
  };
  far(-150, -120, 318, 348, 24); // la Salute
  dome(-135, 333, 13, 24);
  b.column(-135, 333, 2, 37, 42, 'stone', false);
}
