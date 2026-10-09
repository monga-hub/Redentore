import type { LevelBuilder } from '../builder.ts';
import { X, Z } from '../plan.ts';

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

  // Closed building masses filling the convent block.
  const mass = (x0: number, x1: number, z0: number, z1: number) => b.box(x0, x1, 0, 9, z0, z1, 'mass');
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
  b.room(-26, -16, -21, -17, { h: 4.5, e: [{ at: -19, w: 2.6 }], w: [{ at: -19, w: 2.6 }], floor: 'paving' });

  b.area('Cortile degli ulivi', -37, -26, -43, -17);
  b.floor(-37, -26, -43, -17, 'grass');
  b.floor(-33.5, -30.5, -43, -17, 'gravel', 0, 0.02);
  b.floor(-37, -26, -20.5, -17.5, 'gravel', 0, 0.02);

  b.area('Chiostrino', -37, -22, -54, -43);
  b.room(-37, -22, -54, -43, { h: 7, roof: false, role: 'brick', n: [{ at: -34 }], s: [{ at: -32 }], floor: 'paving' });
  b.portico(-37, -22, -54, -43, 2.5, 3.8, [[-34, -54], [-32, -43]]);
  b.column(-29.5, -48.5, 0.7, 0, 0.9, 'stoneDark'); // well-head

  b.area('Corridoio del convento', -37, -31, Z.conventNorth, -54);
  b.room(-37, -31, Z.conventNorth, -54, {
    h: 6, s: false, floor: 'paving',
    n: [{ at: -34 }], // passage through the separation wall into the Orto
    w: [{ at: -70 }], e: [{ at: -68 }],
  });

  b.area('Chiostro ovest', X.west, -37, -80, -60);
  b.room(X.west, -37, -80, -60, { h: 8, roof: false, role: 'brick', e: false, floor: 'paving' });
  b.portico(X.west, -37, -80, -60, 2.5, 4, [[-37, -70]]);

  b.area('Chiostro mediano', -31, -17, -80, -56);
  b.room(-31, -17, -80, -56, { h: 8, roof: false, role: 'brick', w: false, e: false, floor: 'paving' });
  b.portico(-31, -17, -80, -56, 2.5, 4, [[-31, -68], [-17, -70]]);

  b.area('Chiostro grande', -17, 13, Z.conventNorth, Z.churchBack);
  b.room(-17, 13, Z.conventNorth, Z.churchBack, {
    h: 9, roof: false, role: 'brick', s: false, floor: 'paving',
    w: [{ at: -70 }], n: [{ at: -7.5, w: 3 }],
  });
  b.portico(-17, 13, Z.conventNorth, Z.churchBack, 3, 5, [[-17, -70], [-7.5, -86], [0, -63], [0, -66]]);
  b.column(4, -75, 0.9, 0, 0.9, 'stoneDark'); // well-head (piantina: "convento" marker)
}
