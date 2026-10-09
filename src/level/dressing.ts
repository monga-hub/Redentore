import * as THREE from 'three';
import type { LevelBuilder } from './builder.ts';
import { CHURCH_FLOOR as F } from './plan.ts';
import { groundPatch } from './ground.ts';
import { BASIN, PATHS_X, PATHS_Z } from './zones/orto.ts';
import { Props, olive, fruitTree, cypress, shrub, vineCanopy, climber, walkPergola, pergolaPosts, bench, wellTop } from './props.ts';

// Set dressing over the walkable skeleton: vegetation, the orto's covered walks,
// essential furniture. Runs after every zone is built and reads coordinates from
// the zone files (or from the meshes they made), so the layout stays the source of
// truth. Rule for colliders: thin posts, trunks and furniture only, never across a
// path; `npm run check` must stay green.

const E = Math.PI / 2; // bench rot: facing +x = -E, -x = +E, +z = PI, -z = 0

export function dressLevel(b: LevelBuilder): void {
  dressChiesa(b);
  dressConvento(b);
  dressOrto(b);
  dressGiardini(b);
}

/** Invisible slab under a leafy roof so the follow camera stays below it. */
function canopyStop(b: LevelBuilder, x0: number, x1: number, z0: number, z1: number, y: number): void {
  b.box(x0, x1, y, y + 0.1, z0, z1, 'foliage', { collide: false, visible: false, camera: true });
}

// ---------------------------------------------------------------- chiesa

function dressChiesa(b: LevelBuilder): void {
  b.zone('chiesa');
  const p = new Props(b, 11);

  // Pews: two blocks either side of the central aisle, facing the altar (-z).
  for (const [x0, x1] of [[-5.9, -1.4], [1.4, 5.9]]) {
    for (let z = -9; z >= -26; z -= 1.15) {
      p.box(x0, x1, F + 0.4, F + 0.46, z - 0.2, z + 0.2, 'wood'); // seat
      p.box(x0, x1, F + 0.46, F + 0.95, z + 0.2, z + 0.26, 'wood'); // back
      p.box(x0, x1, F + 0.1, F + 0.18, z - 0.5, z - 0.32, 'wood'); // kneeler
      for (const x of [x0, x1]) p.box(x - 0.04, x + 0.04, F, F + 1, z - 0.25, z + 0.28, 'wood');
    }
    b.world.add((x0 + x1) / 2, -17.6, (x1 - x0) / 2, 9.1, F, F + 1);
  }

  // Side chapels: an altar against each outer wall, retable above it.
  for (const s of [-1, 1]) {
    for (const cz of [-4.75, -14, -23.75]) {
      const xi = 11 * s, xo = 12 * s;
      p.box(xi, xo, F, F + 0.95, cz - 1.2, cz + 1.2, 'stoneDark');
      p.box(xi - 0.1 * s, xo, F + 0.95, F + 1.05, cz - 1.35, cz + 1.35, 'stone');
      p.box(xo - 0.15 * s, xo, F + 1.05, F + 5.8, cz - 1.6, cz + 1.6, 'stoneDark'); // retable
      p.box(xo - 0.2 * s, xo - 0.15 * s, F + 1.6, F + 4.8, cz - 1.1, cz + 1.1, 'plaster'); // altarpiece
      for (const dz of [-1.4, 1.4]) p.box(xo - 0.4 * s, xo, F + 1.05, F + 5.4, cz + dz - 0.17, cz + dz + 0.17, 'stone');
      p.box(xo - 0.5 * s, xo, F + 5.4, F + 5.8, cz - 1.8, cz + 1.8, 'stone'); // cornice
      b.world.add((xi + xo) / 2, cz, 0.5, 1.2, F, F + 1.05);
      for (const dz of [-0.8, 0.8]) candle(p, (xi + xo) / 2, F + 1.05, cz + dz);
    }
  }

  // High altar: tabernacle, crucifix, six candlesticks.
  const top = F + 1.6;
  p.box(-0.45, 0.45, top, top + 0.9, -50.2, -49.6, 'stone');
  p.put(new THREE.ConeGeometry(0.5, 0.5, 4), 'stoneDark', 0, top + 1.15, -49.9, 1, 1, 1, 0, Math.PI / 4, 0);
  p.box(-0.04, 0.04, top + 1.4, top + 2.4, -49.95, -49.85, 'stoneDark');
  p.box(-0.3, 0.3, top + 2.05, top + 2.13, -49.95, -49.85, 'stoneDark');
  for (const x of [-1.4, -1, -0.65, 0.65, 1, 1.4]) candle(p, x, top, -49.9);

  // Friars' choir: stalls along both side walls on the raised floor.
  const cf = F + 0.6;
  for (const s of [-1, 1]) {
    const xi = 5.8 * s, xo = 7 * s, z0 = -59.5, z1 = -54.6;
    p.box(xi, xo, cf, cf + 0.45, z0, z1, 'wood');
    p.box(xo - 0.12 * s, xo, cf + 0.45, cf + 2.3, z0, z1, 'wood'); // high back
    p.box(xo - 0.45 * s, xo, cf + 2.3, cf + 2.45, z0, z1, 'wood'); // canopy
    for (let z = z0; z <= z1 + 0.01; z += 0.83) p.box(xi, xo, cf + 0.45, cf + 1.05, z - 0.04, z + 0.04, 'wood'); // armrests
    b.world.add((xi + xo) / 2, (z0 + z1) / 2, 0.6, 2.5, cf, cf + 1.05);
  }
  p.flush();
}

function candle(p: Props, x: number, y: number, z: number): void {
  p.rod(x, y, z, x, y + 0.45, z, 0.03, 'stoneDark');
  p.rod(x, y + 0.45, z, x, y + 0.6, z, 0.025, 'flower');
  p.b.lights.push({ x, y: y + 0.6, z, kind: 'candle' });
}

// ---------------------------------------------------------------- convento

function dressConvento(b: LevelBuilder): void {
  b.zone('convento');
  const p = new Props(b, 23);

  // Cortile degli ulivi: three old olives, staggered so the court reads open; each shades a bench or a corner.
  for (const [x, z, s] of [[-35.4, -29, 1.15], [-28.2, -39.5, 1.05], [-28.6, -24, 0.9]]) olive(p, x, z, s);
  bench(p, -34.2, -31.5, -E);
  bench(p, -29.8, -36.5, E);
  for (const x of [-36.3, -26.7]) for (let z = -42; z <= -22; z += 3.4) if (p.r() < 0.75) shrub(p, x, z + p.rand(-0.4, 0.4), 0.45, 'olive'); // sage along the walls

  wellTop(p, -29.5, -48.5, 0.7, 0.9, false); // chiostrino
  for (const [x, z] of [[-33.8, -46.8], [-25.2, -46.8], [-33.8, -50.2], [-25.2, -50.2]]) pot(p, x, z, 0.35);

  // Chiostro grande: lawn quartered by gravel walks through the well and to the church stairs.
  const court = { lift: 0.03, skirt: true }; // over the cloister's paving, strays in the walk's joints
  groundPatch(b, -14, 10, -83, -63, 'grass', court)
    .paint(2.5, 5.5, -83, -63, 'gravel')
    .paint(-14, 10, -76.5, -73.5, 'gravel')
    .paint(-1.5, 1.5, -73.5, -63, 'gravel');
  wellTop(p, 4, -75, 0.9, 0.9, true);
  olive(p, -7.5, -69, 1.2); // two olives, off-diagonal, so the lawn and the well read
  olive(p, 8, -80.5, 0.95);
  for (const [x, z] of [[-13.2, -63.8], [9.2, -63.8], [-13.2, -82.2], [9.2, -82.2]]) shrub(p, x, z, 0.6, 'hedge', true);
  bench(p, -3.5, -77.3, Math.PI);
  bench(p, 7.5, -72.6, 0);

  // Chiostro mediano and ovest: small lawns with an olive and box shrubs.
  groundPatch(b, -28.5, -19.5, -77.5, -58.5, 'grass', court);
  olive(p, -24, -68, 1.1);
  for (const [x, z] of [[-27.6, -59.4], [-20.4, -59.4], [-27.6, -76.6], [-20.4, -76.6]]) shrub(p, x, z, 0.5, 'hedge', true);
  groundPatch(b, -44.5, -39.5, -77.5, -62.5, 'grass', court);
  cypress(p, -42, -66, 6);
  cypress(p, -42, -74, 6);
  p.flush();
}

function pot(p: Props, x: number, z: number, r: number): void {
  p.disc(x, 0, z, r, r * 1.3, 'brick');
  shrub(p, x, z, r * 1.3, 'foliage', false, r * 1.2);
  p.b.world.add(x, z, r * 0.8, r * 0.8, 0, r * 1.3);
}

// ---------------------------------------------------------------- orto

function dressOrto(b: LevelBuilder): void {
  b.zone('orto');
  const p = new Props(b, 37);
  const GRAPE = 0x5a3a6e;

  // Pergola delle viti (west strip, built by the skeleton): vines over it.
  vineCanopy(p, -45.8, -38.2, -149.3, -87.7, 2.95, GRAPE);
  canopyStop(b, -45.8, -38.2, -149.3, -87.7, 2.85);
  for (let i = 0; i <= 20; i += 2) for (const x of [-45.5, -38.5]) climber(p, x + 0.2, -149 + (61 * i) / 20, 2.6);
  bench(p, -44.8, -105, -E);
  bench(p, -44.8, -130, -E);

  // The paved paths are covered walks: the same pole pergola, vines on top.
  const posts = new Map<string, [number, number]>();
  const zs = -139.5, ze = -87.3, xs = -36.7, xe = 3.7; // north end stops at the androne front
  for (const x of PATHS_X) {
    walkPergola(p, 'z', zs, ze, x, x + 3, PATHS_Z.map((z) => [z, z + 3]), posts);
    vineCanopy(p, x - 0.3, x + 3.3, zs, ze, 2.95, GRAPE);
    canopyStop(b, x - 0.3, x + 3.3, zs, ze, 2.85);
  }
  for (const z of PATHS_Z) {
    walkPergola(p, 'x', xs, xe, z, z + 3, PATHS_X.map((x) => [x, x + 3]), posts);
    vineCanopy(p, xs, xe, z - 0.3, z + 3.3, 2.95, GRAPE);
    canopyStop(b, xs, xe, z - 0.3, z + 3.3, 2.85);
  }
  pergolaPosts(p, posts);

  // Orti: each raised bed (soil boxes from the skeleton) gets one crop in rows.
  const beds = b.zones.get('orto')!.children.filter((o) => o.userData.role === 'soil');
  beds.forEach((bed, i) => crops(p, bed.position.x, bed.position.z, bed.userData.size[0], bed.userData.size[2], i % 5));

  // Vasca delle ninfee: pads and flowers on the water, box balls at the corners, benches.
  const { x: bx, z: bz } = BASIN, wy = 0.41;
  for (let i = 0; i < 16; i++) {
    const a = p.rand(0, Math.PI * 2), rr = p.rand(0.3, 1.75);
    const x = bx + Math.cos(a) * rr, z = bz + Math.sin(a) * rr, r = p.rand(0.22, 0.38);
    p.disc(x, wy, z, r, 0.03, 'foliage', p.vary(0.25));
    if (i % 3 === 0) p.blob(x, wy + 0.07, z, 0.11, 0.07, 0.11, 'flower', i % 2 ? 0xf0a0c0 : 0xfaf4f0, true);
  }
  for (const [x, z] of [[-17.3, -121.3], [-9.7, -121.3], [-17.3, -113.7], [-9.7, -113.7]]) shrub(p, x, z, 0.45, 'hedge', true);
  bench(p, -16.8, -117.5, -E);
  bench(p, -10.2, -117.5, E);

  // Frutteto: two aligned rows of fruit trees 7 m apart, clear of the covered walks and the apiary.
  const fruits = [0xc8402e, 0xe8c840, 0xe88a3a];
  let k = 0;
  for (let tz = -146; tz <= -93; tz += 7) {
    if (tz > -134.5 && tz < -125.5) continue;
    if (PATHS_Z.some((z) => tz > z - 1.6 && tz < z + 4.6)) continue;
    for (const tx of [-2.8, 1.6]) fruitTree(p, tx + p.rand(-0.15, 0.15), tz + p.rand(-0.15, 0.15), fruits[k++ % 3], p.rand(0.9, 1.1));
  }
  // Lavender hedge along the frutteto's west edge (low, walk-through).
  for (let z = -149.5; z <= -92; z += 0.8) {
    if (PATHS_Z.some((pz) => z > pz - 0.4 && z < pz + 3.4)) continue;
    shrub(p, -4.6, z, 0.32, 'olive');
    if (p.r() < 0.7) p.blob(-4.6 + p.rand(-0.15, 0.15), 0.5, z, 0.09, 0.14, 0.09, 'flower', 0x8f6fc8, true);
  }

  // Apiario: hive stands, stacked boxes and roofs over the skeleton's hive blocks.
  for (let hx = -3.5; hx <= 2.6; hx += 1.5) {
    p.box(hx - 0.32, hx + 0.32, 0.3, 0.34, -130.32, -129.68, 'stoneDark'); // band between supers
    p.box(hx - 0.36, hx + 0.36, 0.7, 0.8, -130.36, -129.64, 'roof');
    p.box(hx - 0.12, hx + 0.12, 0.04, 0.08, -129.72, -129.6, 'wood'); // entrance board
  }
  for (const x of [-4, 3.2]) for (const z of [-132.4, -127.6]) shrub(p, x, z, 0.4, 'olive');

  // Uliveto: quincunx of olives on a 7.5 m pitch (two staggered rows), a few missing as in
  // an old grove; cypresses against the east wing.
  for (const [tx, z0] of [[7.5, -146], [13.5, -142.25]]) {
    for (let tz = z0; tz <= -89; tz += 7.5) if (p.r() > 0.12) olive(p, tx + p.rand(-0.3, 0.3), tz + p.rand(-0.3, 0.3), p.rand(1, 1.25));
  }
  for (const z of [-100, -124, -144]) cypress(p, 17.9, z, p.rand(6.5, 8));

  // Serra: potting benches inside, wooden glazing bars outside.
  for (const [x0, x1] of [[-4.6, -3.6], [1.7, 2.6]]) {
    p.box(x0, x1, 0.8, 0.86, -90.5, -86.6, 'wood');
    for (const x of [x0 + 0.08, x1 - 0.08]) for (const z of [-90.4, -86.7]) p.box(x - 0.04, x + 0.04, 0, 0.8, z - 0.04, z + 0.04, 'wood');
    b.world.add((x0 + x1) / 2, -88.55, (x1 - x0) / 2, 1.95, 0, 0.86);
    for (let z = -90.2; z <= -86.8; z += 0.55) {
      const x = (x0 + x1) / 2 + p.rand(-0.2, 0.2);
      p.disc(x, 0.86, z, 0.14, 0.18, 'brick');
      p.blob(x, 1.15, z, 0.2, 0.18, 0.2, 'foliage', p.vary());
      if (p.r() < 0.4) p.blob(x, 1.3, z, 0.07, 0.07, 0.07, 'flower', 0xe85a6a, true);
    }
  }
  for (let z = -90.7; z <= -86.3; z += 1.1) for (const x of [-5.33, 3.33]) p.box(x - 0.04, x + 0.04, 0, 3, z - 0.05, z + 0.05, 'wood');
  for (let x = -4.7; x <= 2.7; x += 1) if (x < -2.1 || x > 0.1) p.box(x - 0.05, x + 0.05, 0, 3, -91.34, -91.26, 'wood');
  for (const y of [1, 3]) {
    p.box(-5.36, -5.3, y - 0.05, y + 0.05, -91.3, -86.3, 'wood');
    p.box(3.3, 3.36, y - 0.05, y + 0.05, -91.3, -86.3, 'wood');
  }
  p.flush();
}

/** One crop per bed, rows along the bed's long side. */
function crops(p: Props, cx: number, cz: number, w: number, d: number, kind: number): void {
  const y = 0.3, alongZ = d > w;
  const len = (alongZ ? d : w) - 0.6, wid = (alongZ ? w : d) - 0.5;
  const rows = Math.max(1, Math.round(wid / 0.6));
  for (let r = 0; r < rows; r++) {
    const off = -wid / 2 + (wid * (r + 0.5)) / rows;
    for (let t = -len / 2; t <= len / 2; t += kind === 4 ? 0.7 : 0.5) {
      const x = cx + (alongZ ? off : t), z = cz + (alongZ ? t : off);
      if (kind === 0) p.blob(x, y + 0.1, z, 0.2, 0.14, 0.2, 'foliage', p.vary(0.3)); // lettuce
      else if (kind === 1) p.blob(x, y + 0.14, z, 0.26, 0.2, 0.26, 'olive', p.vary(0.2)); // cabbage
      else if (kind === 2) p.cone(x, y, z, 0.09, p.rand(0.5, 0.8), 'hedge', p.vary()); // leeks, fennel
      else if (kind === 3) { p.blob(x, y + 0.2, z, 0.18, 0.22, 0.18, 'foliage', p.vary()); if (p.r() < 0.4) p.blob(x, y + 0.38, z, 0.07, 0.07, 0.07, 'flower', 0xf0d040, true); }
      else { // staked tomatoes
        p.rod(x, y, z, x, y + 1.5, z, 0.02, 'wood');
        p.blob(x, y + 0.55, z, 0.2, 0.35, 0.2, 'foliage', p.vary());
        p.blob(x, y + 1.05, z, 0.16, 0.28, 0.16, 'foliage', p.vary());
        p.blob(x + 0.1, y + 0.75, z, 0.07, 0.07, 0.07, 'fruit', 0xd03020, true);
      }
    }
  }
}

// ---------------------------------------------------------------- giardini (north)

function dressGiardini(b: LevelBuilder): void {
  b.zone('giardini');
  const p = new Props(b, 51);

  // Pitosfori: the skeleton's clipped hedge blocks get rounded crowns, plus corner bushes.
  for (const [x0, x1] of [[-40, -34], [-30, -23.5]]) {
    for (const [z0, z1] of [[-181, -175], [-172, -167]]) {
      for (let x = x0 + 0.5; x <= x1 - 0.4; x += 1.1) for (let z = z0 + 0.5; z <= z1 - 0.4; z += 1.1) {
        p.crown(x, 1.1, z, 0.75, 0.45, 0.75, 'hedge', p.vary(0.2));
      }
    }
  }
  for (const [x, z] of [[-23.3, -182.1], [-40.8, -182.1]]) shrub(p, x, z, 0.9, 'hedge', true);
  bench(p, -38.5, -162, 0);
  bench(p, -29.5, -162, 0);

  // Pergola di rose (skeleton posts along the west wall): roses climbing and blooming on top.
  vineCanopy(p, -46.3, -42.7, -182.3, -161.7, 2.95, 0xc8344a, true);
  for (let i = 0; i < 40; i++) p.blob(p.rand(-46.2, -42.8), 2.9, p.rand(-182, -162), 0.13, 0.13, 0.13, 'flower', 0xf090a8, true);
  canopyStop(b, -46.3, -42.7, -182.3, -161.7, 2.85);
  for (let i = 0; i <= 7; i++) for (const x of [-46, -43]) {
    const z = -182 + (20 * i) / 7;
    climber(p, x + 0.2, z, 2.6);
    p.blob(x + 0.2, p.rand(1, 2.2), z, 0.12, 0.12, 0.12, 'flower', 0xc8344a, true);
  }

  // Giardino del pozzo.
  wellTop(p, -3, -176, 1, 1, true);
  bench(p, -3, -179.6, Math.PI);
  bench(p, -3, -172.4, 0);
  for (const [x, z] of [[-19, -181], [-8, -181], [-8, -170.5], [2, -181]]) shrub(p, x, z, 0.7, 'olive', true);

  // Prato nord-est: olives on the lawn, cypresses against the east wall.
  for (const [x, z] of [[10, -166], [16, -172], [22, -177], [9, -179]]) olive(p, x, z, 1.25);
  for (const z of [-165, -171, -180]) cypress(p, 26.2, z, p.rand(7, 8.5));
  p.flush();
}
