import type { LevelBuilder } from '../builder.ts';
import { X, Z } from '../plan.ts';

// Orto dei Frati: walled garden between the convent (south) and the north body.
// Layout only (ground tints, raised beds, basin, walls); vegetation, the covered
// walks over the paved paths and furniture are added by ../dressing.ts.
//   pergola viti  x -47..-37 (strip along the west wall)
//   orti          x -36..-9  grid of raised beds around the cross of paths
//   vasca         x -18..-9  z -122..-113 (ninfee basin at the crossing)
//   frutteto      x -5..4    apiario inside it (z -133..-127)
//   uliveto       x 4..19
//   serra         x -5..3    z -91..-86 (against the convent wall)
//   ala est       x 19..28   segreteria room, the rest closed

export const BASIN = { x: -13.5, z: -117.5, r: 2.5 };
/** Paved 3 m paths: west edges of the N-S ones, north edges of the E-W ones. */
export const PATHS_X = [-21, -9];
export const PATHS_Z = [-125, -113];

export function buildOrto(b: LevelBuilder): void {
  b.zone('orto');
  b.floor(X.west, 19, Z.ortoNorth, Z.conventNorth, 'gravel');
  b.wallZ(X.west, Z.ortoNorth, Z.conventNorth, { h: 4, role: 'brick' });

  b.area('Pergola delle viti', X.west, -37, Z.ortoNorth, Z.conventNorth);
  b.floor(-46.5, -37.5, -150, -87, 'grass', 0, 0.02);
  b.pergola(-45.5, -38.5, -149, -88, true);

  // Brick-paved cross of paths (piantina: brown bands).
  b.area('Orti coltivati', -36, -9, -139, -88);
  for (const x of PATHS_X) b.floor(x, x + 3, -149, -87, 'paving', 0, 0.03);
  for (const z of PATHS_Z) b.floor(-37, 4, z, z + 3, 'paving', 0, 0.03);

  const blocksX = [[-35, -22], [-17.5, -9.5]];
  const blocksZ = [[-138, -126], [-121, -114], [-109, -89]];
  for (const [x0, x1] of blocksX) {
    for (const [z0, z1] of blocksZ) {
      if (x0 === -17.5 && z0 === -121) continue; // basin square
      beds(b, x0, x1, z0, z1);
    }
  }

  b.area('Vasca delle ninfee', -18, -9, -122, -113);
  b.floor(-18, -9, -122, -113, 'stoneDark', 0, 0.035);
  const { x, z, r } = BASIN;
  b.box(x - r, x + r, 0, 0.6, z - r, z - r + 0.4, 'stone');
  b.box(x - r, x + r, 0, 0.6, z + r - 0.4, z + r, 'stone');
  b.box(x - r, x - r + 0.4, 0, 0.6, z - r + 0.4, z + r - 0.4, 'stone');
  b.box(x + r - 0.4, x + r, 0, 0.6, z - r + 0.4, z + r - 0.4, 'stone');
  b.floor(x - r + 0.4, x + r - 0.4, z - r + 0.4, z + r - 0.4, 'water', 0, 0.4);

  b.area('Frutteto', -5, 4, -150, -91);
  b.floor(-5, 4, -150, -91, 'grass', 0, 0.02);
  b.area('Apiario', -5, 4, -133, -127);
  for (let hx = -3.5; hx <= 2.6; hx += 1.5) b.box(hx - 0.3, hx + 0.3, 0, 0.7, -130.3, -129.7, 'wood');

  b.area('Uliveto', 4, 19, Z.ortoNorth, Z.conventNorth);
  b.floor(4, 18.7, -150.5, -86.5, 'grass', 0, 0.02);

  b.area('Serra', -5, 3, -91, Z.conventNorth);
  b.room(-5, 3, -91, Z.conventNorth, { h: 3, role: 'glass', roofRole: 'glass', s: false, n: [{ at: -1, w: 2 }], floor: 'paving' });

  // East wing along the orto: segreteria open, the rest closed.
  b.box(19, X.east, 0, 9, -98, -54, 'mass');
  b.box(19, X.east, 0, 9, -168, -112, 'mass');
  b.area('Segreteria', 19, X.east, -112, -98);
  b.room(19, X.east, -112, -98, { h: 6, w: [{ at: -105 }], floor: 'paving' });
  b.box(19, X.east, 6.4, 9, -112, -98, 'mass', { collide: false });
}

/** Grid of raised beds (0.3 m, steppable) filling a block with 1.2 m walks between. */
function beds(b: LevelBuilder, x0: number, x1: number, z0: number, z1: number): void {
  const gap = 1.2, cw = 3.6, cd = 4;
  const nx = Math.max(1, Math.floor((x1 - x0 + gap) / (cw + gap)));
  const nz = Math.max(1, Math.floor((z1 - z0 + gap) / (cd + gap)));
  const w = (x1 - x0 - gap * (nx - 1)) / nx, d = (z1 - z0 - gap * (nz - 1)) / nz;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const bx = x0 + i * (w + gap), bz = z0 + j * (d + gap);
      b.box(bx, bx + w, 0, 0.3, bz, bz + d, 'soil', { camera: false });
    }
  }
}
