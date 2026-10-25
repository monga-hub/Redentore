import * as THREE from 'three';
import { type LevelBuilder, extrude, ring, shaped } from '../builder.ts';
import { material } from '../materials.ts';
import { groundPatch } from '../ground.ts';
import { Props, cypress, fruitTree, shrub, wellTop } from '../props.ts';
import { front } from '../facades.ts';

// Santa Maria della Presentazione, "le Zitelle", and the Pia Casa that wraps it (see the task's
// DESIGN.md): a white stucco front in two orders under a pediment with a great thermal window,
// two small bell towers, a dome with its lantern; inside, a square hall with chamfered corners
// under the dome, the high altar in a barrel-vaulted presbytery lit from the court. The ospizio
// is a horseshoe of brick wings round it: the west wing holds the portineria, a refettorio and
// the long lace hall; the east wing the infermeria and the girls' dormitory; the court lies
// behind the apse, the orto behind the back wing. Floors at 0 except the church's (ZF). East is -X
// (level/plan.ts): the west wing is the one towards the Redentore.
//   church      x -250..-230, z 0..-20 (hall inner -249..-231, corners cut), presbytery x -245..-235 z -20..-30
//   west wing   x -230..-198: refettorio x -210..-198 z -12..0, portineria x -230..-210 z -12..0, sala del merletto z -36..-12
//   east wing   x -282..-250: infermeria z -12..0, dormitorio z -36..-12
//   andito      x -245..-235, z -36..-30 (the church's back door at z -30, steps down to the court)
//   court       x -282..-198, z -62..-36; back wing z -74..-62 with the androne x -244..-236; orto z -104..-74

export const ZF = 0.8; // the church floor: four steps up from the sagrato
export const ZCX = -240, ZCZ = -10; // centre of the hall, under the dome
const H = 6; // ospizio ground floor's ceiling
const DOME = 7.5, RING = ZF + 15; // dome radius, top of the hall's walls

export function buildZitelle(b: LevelBuilder): void {
  b.zone('zitelle');
  const p = new Props(b, 83);
  b.area('Sagrato delle Zitelle', -284, -196, 0, 10);
  church(b, p);
  ospizio(b, p);
  court(b, p);
  orto(b, p);
  p.flush();
}

function church(b: LevelBuilder, p: Props): void {
  b.area('Le Zitelle: aula sotto la cupola', -250, -230, -20, 0);
  b.area('Altar maggiore delle Zitelle', -245, -235, -30, -20);
  const stone = { t: 1, role: 'stone' as const };
  b.box(-250, -230, 0, ZF, -30.5, 0.5, 'stone'); // floor
  b.stairs('z', -246.5, -233.5, 2.7, 0.5, 0, ZF, 4, 'stone');

  // Front: the wall with its arched door, the two orders, the pediment and the thermal window.
  b.wallX(0, -250.5, -229.5, { ...stone, h: RING, doors: [{ at: ZCX, w: 3.4, h: 6, y0: ZF, arch: true }] });
  facade(b, p);

  // Hall: side walls with the grated choirs high up, corners cut on the diagonal.
  for (const x of [-250, -230]) b.wallZ(x, 0, -20, { ...stone, h: RING });
  b.wallX(-20, -250, -230, { ...stone, h: RING, doors: [{ at: ZCX, w: 9.4, h: 10, y0: ZF, arch: true }] });
  for (const [cx, cz] of [[-248.4, -1.6], [-231.6, -1.6], [-248.4, -18.4], [-231.6, -18.4]]) {
    b.obox(cx, cz, 3.2, 1, ZF, RING, -Math.PI / 4, 'stone');
  }
  for (const s of [-1, 1]) choir(b, p, ZCX + s * 9.45, s);

  // Dome on its drum over the hall, lantern on top; the ceiling ring round its foot.
  const ring0 = new THREE.Shape([new THREE.Vector2(-250.5, -0.5), new THREE.Vector2(-229.5, -0.5), new THREE.Vector2(-229.5, 20.5), new THREE.Vector2(-250.5, 20.5)]);
  ring0.holes.push(new THREE.Path().absarc(ZCX, -ZCZ, DOME, 0, Math.PI * 2, true));
  const ceil = new THREE.Mesh(new THREE.ExtrudeGeometry(ring0, { depth: 0.8, bevelEnabled: false }), material('stone'));
  ceil.rotation.x = -Math.PI / 2;
  ceil.position.y = RING;
  b.add(ceil, 'stone');
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(DOME, DOME, 3.2, 40, 1, true), material('stone', true));
  drum.position.set(ZCX, RING + 2.4, ZCZ);
  b.add(drum, 'stone');
  const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), material('roof', true));
  dome.position.set(ZCX, RING + 4, ZCZ);
  b.add(dome, 'roof');
  const inner = new THREE.Mesh(new THREE.SphereGeometry(DOME - 0.3, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), material('azure', true));
  inner.position.set(ZCX, RING + 4, ZCZ);
  b.add(inner, 'azure');
  b.cameraBlockers.push(ceil, drum, dome);
  b.column(ZCX, ZCZ, 1.3, RING + 4 + DOME - 0.4, RING + 4 + DOME + 3, 'stone', false);
  b.add(new THREE.Mesh(new THREE.ConeGeometry(1.7, 2.6, 12), material('roof')), 'roof').position.set(ZCX, RING + 4 + DOME + 4.3, ZCZ);
  b.lights.push({ x: ZCX, y: RING + 6, z: ZCZ, kind: 'glow', color: 0x8fb0ff }); // moonlight falling through the lantern

  // Presbytery: the barrel vault, the high altar with Bassano's Presentation, the back door to the court.
  for (const x of [-245, -235]) b.wallZ(x, -20, -30, { ...stone, h: ZF + 11 });
  b.wallX(-30, -245, -235, { ...stone, h: ZF + 11, doors: [{ at: ZCX, w: 2.4, h: 3.2, y0: ZF }] });
  b.box(-245.5, -234.5, ZF + 11, ZF + 11.4, -30.5, -19.5, 'roof');
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 11, 20, 1, false, 0, Math.PI), material('roof'));
  vault.rotation.set(Math.PI / 2, Math.PI / 2, 0);
  vault.position.set(ZCX, ZF + 11.4, -25);
  b.add(vault, 'roof');
  b.box(-242.2, -237.8, ZF, ZF + 1.1, -26.6, -25.2, 'stoneDark'); // high altar, clear of the back door
  b.part(null, -241.8, -238.2, ZF + 1.1, ZF + 1.25, -26.4, -25.4, 'gold');
  for (const x of [-243.4, -236.6]) b.order(x, -28.8, 0.35, ZF, ZF + 7, 'stoneDark');
  b.part(null, -242.6, -237.4, ZF + 2, ZF + 6.6, -29.45, -29.3, 'gold'); // the painting's frame
  b.part(null, -242.3, -237.7, ZF + 2.3, ZF + 6.3, -29.3, -29.25, 'azure'); // the Presentation, dark with age
  b.part(null, -244, -236, ZF + 7, ZF + 7.6, -29.5, -28.2, 'stoneDark');
  for (const x of [-241.6, -240.6, -239.4, -238.4]) { p.disc(x, ZF + 1.25, -25.9, 0.05, 0.35, 'flower'); b.lights.push({ x, y: ZF + 1.62, z: -25.9, kind: 'candle' }); }
  b.lights.push({ x: ZCX, y: ZF + 2.4, z: -25, kind: 'glow', color: 0xffa860 });
  // Sacristies either side, closed; steps down from the back door into the andito.
  b.box(-250, -245.5, 0, ZF + 11, -36, -20.5, 'mass');
  b.box(-234.5, -230, 0, ZF + 11, -36, -20.5, 'mass');
  b.stairs('z', -241.5, -238.5, -34.1, -30.5, 0, ZF, 4, 'stone');
  b.area('Andito della sagrestia', -245, -235, -36, -30);

  // The carpet down the middle (no pews: the girls heard Mass from the choirs), lamps hanging under the dome.
  b.floor(-241.4, -238.6, -19, -0.5, 'cloth', ZF, 0.02);
  for (const [x, z] of [[-245, -5], [-235, -5], [-245, -15], [-235, -15]]) {
    p.rod(x, RING, z, x, ZF + 6.5, z, 0.02, 'iron');
    p.box(x - 0.25, x + 0.25, ZF + 5.9, ZF + 6.5, z - 0.25, z + 0.25, 'lantern');
    b.lights.push({ x, y: ZF + 6, z, kind: 'lamp' });
  }
}

/** The white front: pilasters of two orders, a cornice, the pediment, the thermal window, the door's own little temple front. */
function facade(b: LevelBuilder, p: Props): void {
  const f = 0.5;
  const part = (x0: number, x1: number, y0: number, y1: number, d: number, role: 'stone' | 'stoneDark' | 'gold' = 'stone') => b.part(null, x0, x1, y0, y1, f, f + d, role);
  for (const x of [-249.8, -245.5, -234.5, -230.2]) {
    part(x - 0.55, x + 0.55, ZF, ZF + 8, 0.35); // lower order
    part(x - 0.45, x + 0.45, ZF + 9, RING - 0.6, 0.3); // upper order
    part(x - 0.7, x + 0.7, ZF + 7.6, ZF + 8.1, 0.45, 'stoneDark'); // capitals
  }
  part(-250.5, -229.5, ZF + 8, ZF + 9, 0.55, 'stoneDark'); // entablature between the orders
  part(-250.7, -229.3, RING - 0.6, RING, 0.6, 'stoneDark'); // top cornice
  const ped = new THREE.Shape().moveTo(-250.7, RING).lineTo(-229.3, RING).lineTo(ZCX, RING + 4.6).closePath();
  const hole = new THREE.Path().moveTo(-248.7, RING + 0.4).lineTo(-231.3, RING + 0.4).lineTo(ZCX, RING + 3.8).closePath();
  ped.holes.push(hole);
  b.decor(shaped(extrude(ped, 1, 0.05)).translate(0, 0, 0.3), 'stoneDark', true);
  b.decor(shaped(extrude(new THREE.Shape().moveTo(-248.7, RING + 0.4).lineTo(-231.3, RING + 0.4).lineTo(ZCX, RING + 3.8).closePath(), 0.6, 0)).translate(0, 0, 0.1), 'stone', true);
  // Thermal window: a half wheel of glass with two mullions, lit from within.
  const win = new THREE.Shape().moveTo(ZCX - 3.6, ZF + 9.6).lineTo(ZCX + 3.6, ZF + 9.6).absarc(ZCX, ZF + 9.6, 3.6, 0, Math.PI, false).closePath();
  b.decor(shaped(extrude(win, 0.1, 0)).translate(0, 0, f + 0.02), 'lantern');
  b.decor(shaped(ring(ZCX, ZF + 9.6, 3.6, 4.1, 0.5)).translate(0, 0, f + 0.15), 'stoneDark');
  for (const x of [ZCX - 1.2, ZCX + 1.2]) part(x - 0.12, x + 0.12, ZF + 9.6, ZF + 13, 0.2, 'stoneDark');
  b.lights.push({ x: ZCX, y: ZF + 11, z: 2.5, kind: 'glow', color: 0xffc070 });
  // The door's frame: pilasters and a small pediment.
  for (const x of [ZCX - 2.5, ZCX + 2.5]) part(x - 0.35, x + 0.35, ZF, ZF + 6.4, 0.45);
  part(ZCX - 3, ZCX + 3, ZF + 6.4, ZF + 7, 0.6, 'stoneDark');
  // The two bell towers rising from the wings' roofs behind the front, belfries open, pyramid caps.
  for (const x of [-252.5, -227.5]) {
    b.box(x - 1.6, x + 1.6, 13, 21, -5.6, -2.4, 'stone', { collide: false });
    for (const [dx, dz] of [[-1.6, 0], [1.6, 0], [0, -1.6], [0, 1.6]]) p.box(x + dx * 0.9 - 0.5, x + dx * 0.9 + 0.5, 18.4, 20.2, -4 + dz * 0.9 - 0.5, -4 + dz * 0.9 + 0.5, 'iron');
    b.add(new THREE.Mesh(new THREE.ConeGeometry(2.4, 3.4, 4), material('roof')), 'roof').position.set(x, 22.7, -4);
    b.part(null, x - 1.8, x + 1.8, 21, 21.3, -5.8, -2.2, 'stoneDark');
  }
}

/** A grated choir high on the hall's side wall, its face at x (`s`: -1 the -X wall, 1 the +X one): the girls heard Mass unseen. */
function choir(b: LevelBuilder, p: Props, x: number, s: number): void {
  const y0 = ZF + 7.2, y1 = ZF + 10.4, z0 = -13.5, z1 = -6.5;
  b.part(null, x - s * 0.05, x + s * 0.25, y0 - 0.3, y0, z0 - 0.3, z1 + 0.3, 'stoneDark');
  b.part(null, Math.min(x, x + s * 0.3), Math.max(x, x + s * 0.3), y0, y1, z0, z0 + 0.25, 'gold');
  b.part(null, Math.min(x, x + s * 0.3), Math.max(x, x + s * 0.3), y0, y1, z1 - 0.25, z1, 'gold');
  for (let z = z0 + 0.5; z < z1 - 0.3; z += 0.4) p.box(x - 0.03, x + 0.03, y0, y1, z - 0.03, z + 0.03, 'iron');
  b.lights.push({ x: x - s * 0.6, y: (y0 + y1) / 2, z: (z0 + z1) / 2, kind: 'glow', color: 0xb8c8ff });
}

function ospizio(b: LevelBuilder, p: Props): void {
  const brick = (doors = [] as { at: number; w?: number; h?: number; arch?: boolean }[]) => ({ h: H, role: 'brick' as const, doors, trim: true });
  const plaster = (doors = [] as { at: number; w?: number; h?: number }[]) => ({ h: H, role: 'plaster' as const, doors });
  // West wing.
  b.area('Portineria dell\'ospizio', -229.5, -210, -12, 0);
  b.area('Refettorio', -210, -198, -12, 0);
  b.area('Sala del merletto', -229.5, -198, -36, -12);
  b.wallX(0, -229.5, -198, brick([{ at: -219, w: 2.6, h: 3.6, arch: true }]));
  b.wallZ(-198, 0, -36, brick());
  b.wallZ(-210, 0, -12, plaster([{ at: -6, w: 2.2, h: 3 }]));
  b.wallX(-12, -229.5, -198, plaster([{ at: -219, w: 2.4, h: 3.2 }]));
  b.wallX(-36, -229.5, -198, brick([{ at: -214, w: 2.6, h: 3.4, arch: true }]));
  b.wallZ(-229.7, -20, -36, plaster());
  // East wing.
  b.area('Infermeria', -282, -250.5, -12, 0);
  b.area('Dormitorio delle zitelle', -282, -250.5, -36, -12);
  b.wallX(0, -282, -250.5, brick());
  b.wallZ(-282, 0, -36, brick());
  b.wallX(-12, -282, -250.5, plaster([{ at: -266, w: 2.4, h: 3.2 }]));
  b.wallX(-36, -282, -250.5, brick([{ at: -266, w: 2.6, h: 3.4, arch: true }]));
  b.wallZ(-250.3, -20, -36, plaster());
  for (const [x0, x1] of [[-230, -198], [-282, -250]]) {
    b.together(() => {
      b.box(x0 - 0.3, x1 + 0.3, H, H + 0.4, -36.3, 0.3, 'wood'); // beamed ceiling
      b.box(x0 - 0.3, x1 + 0.3, H + 0.4, 13, -36.3, 0.3, 'brick');
      b.band(x0 - 0.3, x1 + 0.3, -36.3, 0.3, H + 0.4, H + 0.7, 0.12);
      b.band(x0 - 0.3, x1 + 0.3, -36.3, 0.3, 12.6, 13, 0.3);
      b.hipRoof(x0 - 0.3, x1 + 0.3, -36.3, 0.3, 13);
    });
    for (let x = x0 + 2.5; x < x1 - 1; x += 3.5) for (const y of [7.8, 10.6]) b.part(null, x - 0.5, x + 0.5, y, y + 1.5, -36.37, -36.32, (Math.round(x + y) % 7) ? 'stoneDark' : 'lantern'); // upper windows on the court
    for (let x = x0 + 3; x < x1 - 2; x += 4) b.part(null, x - 0.45, x + 0.45, 2.6, 4, -36.37, -36.32, 'stoneDark'); // barred ground windows
  }
  // The wings' fronts on the sagrato and the quay (and the west one's flank on the squero): pale plaster, stone-framed windows (facades.ts).
  front(b, p, -282, -250.5, -36.3, 0.3, 's', 12.6, 91, { convent: true, roof: 13, openings: [{ at: -266, w: 2.8, h: 3.4 }] });
  front(b, p, -229.5, -198, -36.3, 0.3, 's', 12.6, 92, { convent: true, roof: 13, openings: [{ at: -219, w: 2.6, h: 3.6 }] });
  front(b, p, -229.5, -197.7, -36.3, 0.3, 'e', 12.6, 93, { convent: true, roof: 13 });
  b.part(null, -267.4, -264.6, 0, 3.4, 0.3, 0.42, 'wood'); // the east wing's street door, long shut

  // Furniture: the lace hall's long tables with pillows and bobbins, benches; the refettorio's board; the beds.
  for (const z of [-30, -24, -18]) {
    b.box(-215, -201, 0, 0.85, z - 0.6, z + 0.6, 'wood', { camera: false });
    for (let x = -202; x > -214.5; x -= 1.6) p.blob(x, 0.95, z, 0.32, 0.14, 0.28, 'cloth', 0xd8d0c0);
    for (const dz of [-1.2, 1.2]) b.box(-215, -201, 0, 0.45, z + dz - 0.2, z + dz + 0.2, 'wood', { camera: false });
  }
  b.box(-227, -220, 0, 1.1, -33, -31, 'wood'); // the mistress's desk
  for (let i = 0; i < 12; i++) p.blob(p.rand(-228, -201), 0.05, p.rand(-35, -13), 0.12, 0.03, 0.12, 'flower', 0xf4f0e6); // lace scraps on the floor
  b.box(-208, -200, 0, 0.8, -7, -5, 'wood', { camera: false });
  for (const z of [-34, -30, -26, -22, -18, -14]) for (const x of [-279, -253]) {
    b.box(x - 1, x + 1, 0, 0.55, z - 0.9, z + 0.9, 'wood', { camera: false });
    p.box(x - 0.95, x + 0.95, 0.55, 0.7, z - 0.85, z + 0.85, 'cloth', 0xc8c0b0);
  }
  for (const z of [-9, -4]) for (const x of [-277, -270, -262, -255]) {
    b.box(x - 1.8, x + 1.8, 0, 0.6, z - 0.7, z + 0.7, 'wood', { camera: false });
    p.box(x - 1.75, x + 1.75, 0.6, 0.72, z - 0.65, z + 0.65, 'cloth', 0xe0dcd0);
  }
  // Torches on the walls.
  const torch = (x: number, z: number, nx: number, nz: number) => b.lights.push({ x: x + nx * 0.32, y: 2.75, z: z + nz * 0.32, kind: 'torch', nx, nz });
  torch(-212, -0.3, 0, -1); torch(-227, -0.3, 0, -1);
  torch(-198.3, -20, -1, 0); torch(-198.3, -30, -1, 0); torch(-229.4, -26, 1, 0); torch(-206, -11.7, 0, 1); torch(-222, -11.7, 0, 1);
  torch(-281.7, -20, 1, 0); torch(-281.7, -30, 1, 0); torch(-250.6, -26, -1, 0); torch(-258, -11.7, 0, 1); torch(-274, -11.7, 0, 1);
  torch(-281.7, -6, 1, 0); torch(-250.8, -6, -1, 0); torch(-198.3, -6, -1, 0);
}

function court(b: LevelBuilder, p: Props): void {
  b.area('Cortile delle Zitelle', -282, -198, -62, -36);
  b.wallZ(-198, -36, -62, { h: 8, role: 'brick', trim: true });
  b.wallZ(-282, -36, -62, { h: 8, role: 'brick', trim: true });
  groundPatch(b, -282, -198, -62, -36, 'paving', { skirt: true }).paint(-250, -230, -55, -43, 'grass').paint(-222, -204, -58, -40, 'grass').paint(-276, -258, -58, -40, 'grass');
  b.curb(-250, -230, -55, -43);
  b.well(ZCX, -49, 1.1, 0.95);
  wellTop(p, ZCX, -49, 1.1, 0.95, true);
  for (const [x, z] of [[-208, -44], [-218, -56], [-262, -44], [-272, -56]]) fruitTree(p, x, z, 0xe8c040, 0.9);
  for (const x of [-276, -258, -222, -204]) shrub(p, x, -60, 0.8, 'hedge', true);
  // Back wing: the horseshoe closes on the court; the androne under it leads to the orto.
  b.area('Androne dell\'orto', -244, -236, -74, -62);
  b.block(-236, -198, -74, -62, 12, 'brick');
  b.block(-282, -244, -74, -62, 12, 'brick');
  b.box(-244, -236, 4, 12, -74, -62, 'brick');
  b.floor(-244, -236, -74, -62, 'paving', 0, 0.02);
  for (let z = -73; z < -62; z += 2.2) p.box(-244, -236, 3.75, 4, z - 0.12, z + 0.12, 'wood');
  for (let x = -202; x > -280; x -= 3.4) if (Math.abs(x - ZCX) > 6) for (const y of [2.6, 6.4, 9.4]) b.part(null, x - 0.45, x + 0.45, y, y + 1.4, -62.05, -61.98, (Math.round(x * 3 + y) % 8) ? 'stoneDark' : 'lantern');
  const torch = (x: number, z: number, nx: number, nz: number) => b.lights.push({ x: x + nx * 0.32, y: 2.75, z: z + nz * 0.32, kind: 'torch', nx, nz });
  torch(-232, -61.7, 0, 1); torch(-248, -61.7, 0, 1); torch(-212, -36.3, 0, -1); torch(-268, -36.3, 0, -1);
  b.lights.push({ x: ZCX + 2, y: 1.2, z: -49, kind: 'brazier' }, { x: ZCX - 2, y: 1.2, z: -49, kind: 'brazier' });
}

function orto(b: LevelBuilder, p: Props): void {
  b.area('Orto delle Zitelle', -282, -198, -104, -74);
  b.wallX(-104, -282, -198, { h: 3.4, role: 'brick', trim: true });
  b.wallZ(-198, -74, -104, { h: 3.4, role: 'brick', trim: true });
  b.wallZ(-282, -74, -104, { h: 3.4, role: 'brick', trim: true });
  const g = groundPatch(b, -282, -198, -104, -74, 'grass');
  g.paint(-243, -237, -104, -74, 'gravel').paint(-282, -198, -91, -87, 'gravel');
  for (const [x0, x1] of [[-234, -202], [-278, -246]]) for (const [z0, z1] of [[-100, -93], [-85, -78]]) {
    g.paint(x0, x1, z0, z1, 'dirt');
    for (let x = x0 + 1; x < x1 - 0.5; x += 1.4) for (let z = z0 + 1; z < z1 - 0.5; z += 1.6) p.blob(x, 0.18, z, 0.28, 0.2, 0.28, 'foliage', p.vary(0.25));
  }
  b.pergola(-243, -237, -86, -76, true);
  for (const z of [-80, -96]) for (const x of [-279.5, -200.5]) cypress(p, x, z, p.rand(6.5, 8));
  for (const [x, z] of [[-250, -89], [-230, -89]]) fruitTree(p, x, z, 0xd04030, 1.1);
}

/** Nothing walks through the dome: the hall's inner faces, for the boss's floor (enemies/zitelle.ts). */
export const HALL = { x0: -249, x1: -231, z0: -19.5, z1: -0.5 };
