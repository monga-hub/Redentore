import * as THREE from 'three';
import type { LevelBuilder } from '../builder.ts';
import { material } from '../materials.ts';
import { X, Z } from '../plan.ts';
import { groundPatch } from '../ground.ts';

// North transverse body (z -161..-151) with the central androne projecting both ways
// (x -22..-9, z -168..-140), then the gardens and the lagoon front.
//   cappella di meditazione x -47..-39 | sale espositive -39..-30 | caffè -30..-22
//   androne (passage)       x -22..-9  | laboratori -9..5        | frantoio/smielatura 5..19
//   giardini dei pitosfori  x -47..-22 (rose pergola on the west wall)
//   giardino del pozzo      x -22..4
//   prato nord-est          x 4..28
//   riva + pontile on the lagoon, z -186

export function buildNord(b: LevelBuilder): void {
  b.zone('corpo-nord');
  const n = Z.nordNorth, s = Z.ortoNorth, h = 7, trim = 4.4, arch = true;

  b.area('Cappella di meditazione', X.west, -39, n, s);
  b.room(X.west, -39, n, s, { h, trim, e: false, s: [{ at: -43, arch }], floor: 'paving' });
  b.box(-45.5, -44.5, 0, 1, -157, -155, 'stoneDark'); // altar block

  b.area('Sale espositive (antiche officine)', -39, -30, n, s);
  b.room(-39, -30, n, s, { h, trim, e: false, w: [{ at: -156, arch }], s: [{ at: -34.5, arch }], n: [{ at: -34.5, arch }], floor: 'paving' });

  b.area('Caffè', -30, -22, n, s);
  b.room(-30, -22, n, s, { h, trim, e: false, w: [{ at: -156, arch }], s: [{ at: -26, arch }], n: [{ at: -26, arch }], floor: 'paving' });

  b.area('Androne di passaggio', -22, -9, -168, -140);
  b.room(-22, -9, -168, -140, { h: 8, trim: 4.9, n: [{ at: -15.5, w: 4, h: 4, arch }], s: [{ at: -15.5, w: 4, h: 4, arch }], floor: 'paving' });

  b.area('Laboratori', -9, 5, n, s);
  b.room(-9, 5, n, s, { h, trim, w: false, e: false, s: [{ at: -2, arch }], n: [{ at: -2, arch }], floor: 'paving' });

  b.area('Frantoio e sala di smielatura', 5, 19, n, s);
  b.room(5, 19, n, s, { h, trim, w: [{ at: -156, arch }], s: [{ at: 12, arch }], floor: 'paving' });
  b.box(10, 12, 0, 1.1, -158, -154, 'stoneDark'); // press placeholder
  // One hipped roof over the transverse body, a taller one over the androne crossing it.
  b.hipRoof(X.west, 19, n, s, h + 0.4);
  b.hipRoof(-22, -9, -168, -140, 8.4);

  b.zone('giardini');
  b.area('Giardino dei pitosfori', X.west, -22, Z.lagoonEdge, n);
  groundPatch(b, X.west, X.east, Z.lagoonEdge, n, 'grass') // all three gardens
    .paint(-41, -22, -166, n, 'gravel')
    .paint(-33.5, -30.5, Z.lagoonEdge, -166, 'gravel')
    .paint(-17.5, -13.5, -176, -168, 'gravel')
    .paint(-22, 4, -177.5, -174.5, 'gravel')
    .hole(-22, -9, -168, n); // androne floor
  b.wallZ(X.west, Z.lagoonEdge, n, { h: 3, role: 'brick' });
  for (const [x0, x1] of [[-40, -34], [-30, -23.5]]) {
    for (const [z0, z1] of [[-181, -175], [-172, -167]]) b.box(x0, x1, 0, 1.1, z0, z1, 'hedge', { camera: false });
  }
  b.area('Pergola di rose', X.west, -42, Z.lagoonEdge, n);
  b.pergola(-46, -43, -182, -162, true);
  b.wallZ(-22, Z.lagoonEdge, -168, { h: 3, role: 'brick', doors: [{ at: -176, w: 2.5 }] });

  b.area('Giardino del pozzo', -22, 4, Z.lagoonEdge, n);
  b.well(-3, -176, 1, 1); // pozzo
  b.wallZ(4, Z.lagoonEdge, n, { h: 2.5, role: 'brick', doors: [{ at: -172, w: 2.5 }] });

  b.area('Prato nord-est', 4, X.east, Z.lagoonEdge, n);
  b.wallZ(X.east, Z.riva, -168, { h: 3, role: 'brick' });

  b.zone('laguna');
  b.area('Riva sulla laguna', X.west, X.east, Z.riva, Z.lagoonEdge);
  b.floor(X.west, X.east, Z.riva, Z.lagoonEdge, 'paving', 0, 0.02);
  b.box(X.west, X.east, 0, 0.12, Z.riva, Z.riva + 0.25, 'stoneDark', { camera: false });
  b.barrier(X.west, -38, Z.riva - 0.6, Z.riva);
  b.barrier(-32, X.east, Z.riva - 0.6, Z.riva);
  b.barrier(X.west - 0.6, X.west, Z.riva, Z.lagoonEdge);

  b.area('Pontile', -38, -32, -194, Z.riva);
  b.box(-38, -32, -0.4, 0, -194, Z.riva, 'wood');
  b.barrier(-38.6, -38, -194.6, Z.riva);
  b.barrier(-32, -31.4, -194.6, Z.riva);
  b.barrier(-38, -32, -194.6, -194);
  for (let z = -194; z <= Z.riva; z += 2) for (const x of [-37.9, -32.1]) b.column(x, z, 0.08, 0, 1, 'wood', false);
  const boat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 5), material('wood'));
  boat.position.set(-41, -0.95, -190.5);
  b.add(boat, 'wood');
}
