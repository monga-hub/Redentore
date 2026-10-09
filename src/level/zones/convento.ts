import type { LevelBuilder } from '../builder.ts';
import { X, Z } from '../plan.ts';
import { groundPatch } from '../ground.ts';

// Capuchin convent. Public route (dashed on the piantina): calle -> ingresso (west)
// -> cortile degli ulivi -> chiostrino -> long corridor -> door in the separation
// wall into the Orto. The church's back door gives a second way in through the
// chiostro grande, which also opens onto the Orto.
//   ingresso         x -26..-16  z -21..-17
//   cortile ulivi    x -37..-26  z -43..-17   (open)
//   chiostrino       x -37..-22  z -54..-43
//   corridoio        x -37..-31  z -86..-54
//   chiostro ovest   x -47..-37  z -80..-60
//   chiostro mediano x -31..-17  z -80..-56
//   chiostro grande  x -17..13   z -86..-60
// Everything else in the band is closed building mass.

export function buildConvento(b: LevelBuilder): void {
  b.zone('convento');

  // Closed building masses filling the convent block, hipped roofs over the cloister walls.
  const mass = (x0: number, x1: number, z0: number, z1: number) => b.block(x0, x1, z0, z1, 9);
  mass(X.west, -37, -54, -17); // west range
  mass(-26, -13, -43, -21); // between cortile and church
  mass(-22, -13, -54, -43);
  mass(X.west, -37, -60, -54);
  mass(X.west, -37, Z.conventNorth, -80);
  mass(-31, -17, -56, -54);
  mass(-31, -17, Z.conventNorth, -80);
  mass(-17, -13, Z.churchBack, -54);
  mass(13, 19, Z.conventNorth, -54);

  b.area('Ingresso al convento', -26, -16, -21, -17);
  b.room(-26, -16, -21, -17, { h: 4.5, trim: true, e: [{ at: -19, w: 2.6, arch: true }], w: [{ at: -19, w: 2.6, arch: true }], floor: 'paving' });

  b.area('Cortile degli ulivi', -37, -26, -43, -17);
  groundPatch(b, -37, -26, -43, -17, 'grass', { lift: 0.01 })
    .paint(-33.5, -30.5, -43, -17, 'gravel')
    .paint(-37, -26, -20.5, -17.5, 'gravel');
  b.curb(-37, -33.5, -43, -20.5);
  b.curb(-30.5, -26, -43, -20.5);

  b.area('Chiostrino', -37, -22, -54, -43);
  b.room(-37, -22, -54, -43, { h: 7, roof: false, role: 'brick', trim: true, n: [{ at: -34, arch: true }], s: [{ at: -32, arch: true }], floor: 'paving' });
  b.well(-29.5, -48.5, 0.7, 0.9);

  b.area('Corridoio del convento', -37, -31, Z.conventNorth, -54);
  b.room(-37, -31, Z.conventNorth, -54, {
    h: 6, s: false, floor: 'paving', trim: true,
    n: [{ at: -34, arch: true }], // passage through the separation wall into the Orto
    w: [{ at: -70, arch: true }], e: [{ at: -68, arch: true }],
  });

  b.area('Chiostro ovest', X.west, -37, -80, -60);
  b.room(X.west, -37, -80, -60, { h: 8, roof: false, role: 'brick', trim: true, e: false, floor: 'paving' });
  b.curb(-44.5, -39.5, -77.5, -62.5);

  b.area('Chiostro mediano', -31, -17, -80, -56);
  b.room(-31, -17, -80, -56, { h: 8, roof: false, role: 'brick', trim: true, w: false, e: false, floor: 'paving' });
  b.curb(-28.5, -19.5, -77.5, -58.5);

  b.area('Chiostro grande', -17, 13, Z.conventNorth, Z.churchBack);
  b.room(-17, 13, Z.conventNorth, Z.churchBack, {
    h: 9, roof: false, role: 'brick', s: false, floor: 'paving', trim: true,
    w: [{ at: -70, arch: true }], n: [{ at: -7.5, w: 3, arch: true }],
  });
  // Lawn quarters around the gravel walks (dressing.ts), framed by curbs; well at the crossing.
  for (const [x0, x1, z0, z1] of [[-14, 2.5, -83, -76.5], [5.5, 10, -83, -76.5], [-14, -1.5, -73.5, -63], [1.5, 2.5, -73.5, -63], [5.5, 10, -73.5, -63]]) b.curb(x0, x1, z0, z1);
  b.well(4, -75, 0.9, 0.9); // piantina: "convento" marker

  // Arcades last: they read the perimeter wall tops from the colliders.
  b.arcade(-37, -22, -54, -43, 2.5, 4.2, { gaps: [[-34, -54], [-32, -43]], upper: 'nesw' });
  b.arcade(X.west, -37, -80, -60, 2.5, 4, { gaps: [[-37, -70]], upper: 'nws' });
  b.arcade(-31, -17, -80, -56, 2.5, 4, { gaps: [[-31, -68], [-17, -70]], upper: 'nse' });
  b.arcade(-17, 13, Z.conventNorth, Z.churchBack, 3, 5, {
    gaps: [[-17, -70], [-7.5, -86], [-14, -75], [10, -75], [4, -83], [4, -63]], // doors, garden walks
    clear: [[0, -63]], // church back stairs
    upper: 'nwe',
  });
}
