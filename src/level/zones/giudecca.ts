import * as THREE from 'three';
import { type LevelBuilder, extrude, ring, shaped } from '../builder.ts';
import { material, type Role } from '../materials.ts';
import { Z } from '../plan.ts';
import { groundPatch } from '../ground.ts';
import { Props } from '../props.ts';

// Level 2's way out: the Fondamenta della Giudecca east of the Redentore, to the Zitelle
// (zones/zitelle.ts). Real places, compressed ~0.57 along the quay (see the task's DESIGN.md):
// Rio de la Croce and its stepped bridge, the Fondamenta de la Croce with its houses, a
// sotoportego into the Campiello de la Croce, the closed front of Santa Croce on its campo,
// the Rio del Squero with its bridge and the squero (boatyard) beside it, then the Fondamenta
// de le Zitelle to the Casa dei Tre Oci. Across the Canale della Giudecca the Zattere, the
// Salute and San Giorgio stand as dark masses on the skyline.
//   rio de la Croce   x 62..70 (water), z -40..20; bridge deck z 12.5..17.5 at y 1.6, steps x 57..61, 71..75
//   fondamenta        z 10..20 (quay edge z 20), x 60..300; houses on the south side (z < 10)
//   sotoportego       x 86..90 through the houses z -16..10, campiello x 76..100 z -30..-16
//   campo Santa Croce x 104..132, z -14..10; church front z -14, x 110..126
//   rio del Squero    x 166..172, z -40..20; bridge steps x 161..165, 173..177
//   squero            x 172..196, z -26..10 (tezon x 182..195, z -25..-13)
//   Zitelle           x 196..284 (zitelle.ts); Tre Oci x 286..298, z -40..0; quay ends at x 300

/** x where the walkable quay ends, east. */
export const QUAY_END = 300;
/** The two rii crossing the fondamenta: water x0..x1. */
export const RII = { croce: [62, 70], squero: [166, 172] } as const;
const RISE = 1.6, RUN = 4, STEPS = 8; // the bridges: deck height, run of each flight, steps per flight
const BZ0 = 12.5, BZ1 = 17.5; // bridge width across the quay

export function buildGiudecca(b: LevelBuilder): void {
  b.zone('giudecca');
  const p = new Props(b, 71);

  // Island ground east of the Redentore's: cut by the two rii, which show the water beneath.
  b.box(RII.croce[0], RII.croce[1], -1.2, 0, Z.riva, -40, 'ground');
  b.box(RII.croce[1], RII.squero[0], -1.2, 0, Z.riva, Z.quayEdge, 'ground');
  b.box(RII.squero[0], RII.squero[1], -1.2, 0, Z.riva, -40, 'ground');
  b.box(RII.squero[1], 340, -1.2, 0, Z.riva, Z.quayEdge, 'ground');

  // The quay: masegni paving, Istrian edge stones, the invisible edge.
  b.area('Fondamenta de la Croce', 70, 166, 10, Z.quayEdge);
  b.area('Fondamenta de le Zitelle', 172, QUAY_END, 10, Z.quayEdge);
  b.floor(60, QUAY_END, 10, Z.quayEdge, 'paving');
  b.floor(196, QUAY_END, 0, 10, 'paving'); // the sagrato of the Zitelle and the quay past them, wider
  for (const [x0, x1] of [[60, RII.croce[0]], [RII.croce[1], RII.squero[0]], [RII.squero[1], QUAY_END]]) {
    b.box(x0, x1, 0, 0.12, Z.quayEdge - 0.25, Z.quayEdge, 'stoneDark', { camera: false });
    b.barrier(x0, x1, Z.quayEdge, Z.quayEdge + 0.6);
  }
  b.barrier(QUAY_END, QUAY_END + 0.6, 0, Z.quayEdge);
  for (let x = 74; x < QUAY_END; x += 9.5) if (x < 160 || x > 178) bitta(p, x, Z.quayEdge - 0.5); // mooring posts

  // The two rii: stone banks into the water, the edges barred where the quay meets them, and a bridge each.
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
  b.barrier(RII.squero[0] - 0.4, RII.squero[0], -40, 10);

  // Houses along the quay, south side: plastered blocks of three or four storeys with shutters and chimneys.
  const houses: [number, number, number, number, number, Role][] = [
    [60, RII.croce[0], -40, 10, 12, 'plaster'], // the Redentore's neighbours, down to the rio
    [RII.croce[1], 86, -16, 10, 11, 'plaster'],
    [90, 104, -16, 10, 13, 'mass'],
    [70, 76, -40, -16, 10, 'mass'], [100, 104, -40, -16, 10, 'plaster'], [76, 100, -40, -30, 9, 'plaster'], // round the campiello
    [104, 110, -40, -14, 12, 'plaster'], [126, 132, -40, -14, 12, 'plaster'], // flanking Santa Croce
    [132, 148, -30, 10, 12, 'mass'], [148, RII.squero[0], -30, 10, 14, 'plaster'],
    [RII.squero[1], 197, -60, -26, 10, 'mass'], // behind the squero
    [282, 286, -40, 0, 11, 'plaster'], // between the Zitelle and the Tre Oci
    [298, 340, -40, 0, 12, 'plaster'], // past the Tre Oci
  ];
  for (const [x0, x1, z0, z1, h, role] of houses) {
    b.block(x0, x1, z0, z1, h, role);
    if (z1 === 10 || z1 === 0) windows(b, x0, x1, z1, h);
  }
  p.box(RII.croce[1] + 2, RII.croce[1] + 2.8, 11, 13.5, -12, -11.2, 'brick'); // chimneys
  p.box(140, 140.8, 12, 14, -4, -3.2, 'brick');
  p.box(156, 156.8, 14, 16.5, 2, 2.8, 'brick');

  // Sotoportego de la Croce: a covered passage through the houses, beams overhead, into the campiello.
  b.area('Sotoportego de la Croce', 86, 90, -16, 10);
  b.box(86, 90, 3.4, 13, -16, 10, 'plaster');
  for (let z = -15; z < 10; z += 2.5) p.box(86, 90, 3.15, 3.4, z - 0.12, z + 0.12, 'wood');
  b.floor(86, 90, -16, 10, 'paving', 0, 0.02);
  b.area('Campiello de la Croce', 76, 100, -30, -16);
  b.floor(76, 100, -30, -16, 'paving', 0, 0.02);
  b.well(88, -23, 0.9, 0.9);
  windows(b, 76, 100, -30, 9);

  // Campo de Santa Croce: the convent church's closed front (now a prison: no way in), a well, benches.
  b.area('Campo de Santa Croce', 104, 132, -14, 10);
  b.floor(104, 132, -14, 10, 'paving', 0, 0.02);
  santaCroce(b);
  b.well(118, -2, 1, 0.9);

  // The squero: a gravel yard on the rio, a slipway into it, the tezon (open shed) and a gondola on trestles.
  b.area('Squero', RII.squero[1], 196, -26, 10);
  groundPatch(b, RII.squero[1], 196, -26, 10, 'dirt').paint(RII.squero[1], 196, 4, 10, 'gravel').paint(181, 196, -26, -12, 'paving');
  b.barrier(RII.squero[1], RII.squero[1] + 0.4, -26, 10); // the slipway's edge on the rio
  b.wallZ(197, -26, 0, { h: 3.2, role: 'brick', trim: true });
  squero(b, p);

  // Lanterns: iron fanali on brackets along the house fronts and on the bridges' crowns.
  for (const x of [78, 96, 114, 138, 156, 186]) fanale(b, p, x, x === 114 ? -14 : x === 186 ? -26 : 10);
  for (const x of [RII.croce[0] + 4, RII.squero[0] + 3]) for (const z of [BZ0, BZ1]) lampPost(b, p, x, z, RISE);

  // The Casa dei Tre Oci (1913): a neo-gothic front with its three great windows on the canal.
  treOci(b, p);

  // Across the canal: the Zattere, the Salute, the Dogana and San Giorgio as a dark skyline.
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

/** Shuttered windows on a house front at z, facing +Z, two or three rows. */
function windows(b: LevelBuilder, x0: number, x1: number, z: number, h: number): void {
  const s = 1, f = z + 0.02, rows = h > 11 ? [4.2, 7.4, 10.4] : [4, 7.2];
  for (let x = x0 + 2.2; x < x1 - 1.4; x += 3.6) {
    for (const y of rows) {
      const lit = (Math.round(x * 7 + y) % 9) === 0; // now and then a lamp still burns behind the glass
      b.part(null, x - 0.55, x + 0.55, y, y + 1.6, f, f + s * 0.06, lit ? 'lantern' : 'stoneDark');
      b.part(null, x - 0.7, x + 0.7, y - 0.12, y, f, f + s * 0.18, 'stone'); // sill
      for (const d of [-1, 1]) b.part(null, x + d * 0.55, x + d * 1.05, y, y + 1.6, f, f + s * 0.08, 'wood'); // shutters
    }
    if (h > 9.5 && (Math.round(x) % 3) === 0) b.part(null, x - 0.6, x + 0.6, 0, 2.4, f, f + s * 0.1, 'wood'); // street doors
  }
}

/** A mooring post (bitta) on the quay edge. */
function bitta(p: Props, x: number, z: number): void {
  p.disc(x, 0, z, 0.22, 0.75, 'stoneDark');
  p.disc(x, 0.75, z, 0.27, 0.12, 'stoneDark');
}

/** An iron fanale on a bracket on the wall face at (x, z), facing +Z; lit by the torch pool. */
function fanale(b: LevelBuilder, p: Props, x: number, z: number): void {
  const zz = z + 0.05, y = 3.6;
  p.box(x - 0.04, x + 0.04, y + 0.35, y + 0.45, zz, zz + 0.9, 'iron'); // arm
  p.box(x - 0.02, x + 0.02, y - 0.2, y + 0.45, zz, zz + 0.04, 'iron');
  p.box(x - 0.2, x + 0.2, y - 0.25, y + 0.3, zz + 0.65, zz + 1.05, 'lantern');
  p.cone(x, y + 0.3, zz + 0.85, 0.3, 0.3, 'iron');
  b.lights.push({ x, y, z: zz + 0.85, kind: 'lamp' });
}

/** A lamp post on a bridge's crown. */
function lampPost(b: LevelBuilder, p: Props, x: number, z: number, y0: number): void {
  p.disc(x, y0 + 0.95, z, 0.08, 1.6, 'iron');
  p.box(x - 0.18, x + 0.18, y0 + 2.5, y0 + 2.95, z - 0.18, z + 0.18, 'lantern');
  p.cone(x, y0 + 2.95, z, 0.26, 0.28, 'iron');
  b.lights.push({ x, y: y0 + 2.7, z, kind: 'lamp' });
}

/** Santa Croce: a plain stone front with a pediment and a shut door, the convent's blind walls either side. */
function santaCroce(b: LevelBuilder): void {
  b.together(() => {
    b.box(110, 126, 0, 15, -40, -14, 'stone');
    b.band(110, 126, -40, -14, 9.5, 9.9, 0.15);
    b.band(110, 126, -40, -14, 14.6, 15, 0.3);
    const g = new THREE.Shape().moveTo(109.6, 15).lineTo(126.4, 15).lineTo(118, 19.2).closePath();
    b.decor(shaped(extrude(g, 1, 0.05)).translate(0, 0, -14.6), 'stone');
    b.hipRoof(110, 126, -40, -15, 15);
  });
  for (const x of [111.5, 124.5]) b.part(null, x - 0.5, x + 0.5, 0.4, 14.6, -14, -13.6, 'stoneDark'); // pilasters
  b.part(null, 116.4, 119.6, 0, 4.8, -14, -13.85, 'wood'); // the shut door
  b.part(null, 116, 120, 4.8, 5.3, -14, -13.6, 'stoneDark');
  b.decor(shaped(ring(118, 11.6, 1.1, 1.5, 0.3)).translate(0, 0, -13.85), 'stoneDark'); // oculus
  b.decor(shaped(extrude(new THREE.Shape().absarc(118, 11.6, 1.1, 0, Math.PI * 2, false), 0.1, 0)).translate(0, 0, -13.84), 'lantern');
}

/** The squero: slipway boards into the rio, the tezon on posts, a gondola on trestles, oars and planks. */
function squero(b: LevelBuilder, p: Props): void {
  const x0 = RII.squero[1];
  for (let z = -20; z < 2; z += 0.5) p.box(x0, x0 + 4, -0.05, 0.03, z, z + 0.42, 'wood'); // slipway planks
  // Tezon: posts, beams, a lean-to roof of coppi.
  b.together(() => {
    for (const x of [182, 188.5, 195]) for (const z of [-25, -13]) b.box(x - 0.18, x + 0.18, 0, 4.4, z - 0.18, z + 0.18, 'wood', { camera: false });
    b.box(181.6, 195.4, 4.4, 4.7, -25.3, -12.7, 'wood', { collide: false });
    b.hipRoof(182, 195, -25, -13, 4.7, 0.6, 0.35);
  });
  // A gondola on trestles, black, its ferro at the prow.
  const hull = new THREE.Shape().moveTo(-5.5, 1.1).quadraticCurveTo(-3, 0, 0, 0).quadraticCurveTo(3, 0, 5.5, 1.3).lineTo(5.2, 1.35).quadraticCurveTo(2.5, 0.55, 0, 0.55).quadraticCurveTo(-2.5, 0.55, -5.2, 1.15).closePath();
  const g = shaped(extrude(hull, 1.4, 0.06)).translate(0, 0.9, 0).rotateY(0.3).translate(184, 0, -4);
  b.decor(g, 'iron', true);
  b.box(181.5, 186.5, 0, 1.05, -5.2, -2.8, 'mass', { visible: false }); // its bulk, for walking round it
  for (const dx of [-3, 0, 3]) p.box(184 + dx - 0.6, 184 + dx + 0.6, 0, 0.9, -4.2 + dx * 0.3, -3.8 + dx * 0.3, 'wood');
  p.box(189.6, 189.8, 1.3, 2.4, -2.6, -2.4, 'iron'); // the ferro
  // Oars leaning on the shed, planks stacked.
  for (let i = 0; i < 5; i++) p.rod(194.6, 0, -16 + i * 0.6, 194.2, 3.6, -16.2 + i * 0.6, 0.05, 'wood');
  for (let i = 0; i < 6; i++) p.box(184, 192, i * 0.12, i * 0.12 + 0.1, -22 + i * 0.05, -21.4 + i * 0.05, 'wood');
}

/** Casa dei Tre Oci: brick, white Istrian trim, three tall pointed windows over the quay, a crenellated top. */
function treOci(b: LevelBuilder, p: Props): void {
  b.together(() => {
    b.box(286, 298, 0, 14, -40, 0, 'brick');
    b.band(286, 298, -40, 0, 0, 0.8, 0.1);
    b.band(286, 298, -40, 0, 13.6, 14, 0.25);
  });
  for (const x of [289, 292, 295]) {
    const w = new THREE.Shape().moveTo(x - 1.1, 6.5).lineTo(x + 1.1, 6.5).lineTo(x + 1.1, 10).quadraticCurveTo(x + 1.1, 11.3, x, 12).quadraticCurveTo(x - 1.1, 11.3, x - 1.1, 10).closePath();
    b.decor(shaped(extrude(w, 0.1, 0)).translate(0, 0, 0.06), 'lantern');
    p.box(x - 1.3, x + 1.3, 6.3, 6.5, 0, 0.3, 'stone');
  }
  for (let x = 286.4; x < 298; x += 1.6) p.box(x, x + 0.8, 14, 14.7, -0.3, 0.2, 'stone'); // merlons
  p.box(291.5, 292.5, 0, 3, 0, 0.12, 'wood');
  b.lights.push({ x: 292, y: 9, z: 1.5, kind: 'glow', color: 0xffb060 });
}

/** The far shore across the Canale della Giudecca, low-poly masses lost in the night. */
function skyline(b: LevelBuilder): void {
  const far = (x0: number, x1: number, z0: number, z1: number, h: number) => b.box(x0, x1, -1.2, h, z0, z1, 'mass', { collide: false, camera: false });
  for (let x = -260, i = 0; x < 160; x += 22, i++) far(x, x + 20, 300, 316, 12 + ((i * 37) % 9)); // Zattere fronts
  far(160, 200, 296, 316, 9); // Dogana
  const dome = (x: number, z: number, r: number, y: number) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), material('stone'));
    m.position.set(x, y, z);
    b.add(m, 'stone');
  };
  far(120, 150, 318, 348, 24); // la Salute
  dome(135, 333, 13, 24);
  b.column(135, 333, 2, 37, 42, 'stone', false);
  far(330, 372, 250, 290, 22); // San Giorgio Maggiore
  dome(351, 274, 9, 22);
  b.column(372, 292, 3, -1.2, 56, 'brick', false); // its campanile
  b.add(new THREE.Mesh(new THREE.ConeGeometry(3.5, 8, 4), material('roof')), 'roof').position.set(372, 60, 292);
}
