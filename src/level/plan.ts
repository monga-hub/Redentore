// Master plan of the complex, derived from reference/piantina.jpg.
//
// Scale: 1 unit = 1 metre. Calibration: the church body (nave + side chapels) is
// drawn ~235 px wide on the 1500 px-wide piantina; the real Redentore is ~26 m wide
// with a ~20 m temple front, giving ~0.12 m per piantina pixel (~0.092 m per pixel
// of the full 1950x2600 jpg). Every other block is placed with that same factor and
// then rounded to whole/half metres so corridors line up.
//
// Axes: +X east, -Z north (towards the lagoon), +Z south (Fondamenta San Giacomo).
// Origin: centre of the church facade, ground level (y=0 = fondamenta paving).
// The piantina's printed north arrow points to its lower left; the plan here follows
// the drawing's own reading order (fondamenta at the bottom = south, lagoon on top = north).

export const CHURCH_FLOOR = 2.4; // top of the 12-step scalinata

// Z lines, south -> north.
export const Z = {
  quayEdge: 20, // fondamenta drops into the canale della Giudecca
  sagrato: 10, // foot of the scalinata
  facade: 0,
  churchBack: -60, // choir back wall
  conventNorth: -86, // convent / orto separation wall
  ortoNorth: -151, // south face of the north transverse body
  nordNorth: -161, // north face of the transverse body
  lagoonEdge: -183,
  riva: -186, // water's edge on the lagoon side
} as const;

// X lines of the walled complex.
export const X = { west: -47, east: 28 } as const;

export const SPAWN = { x: 0, z: 15, yaw: 0 } as const; // on the fondamenta, facing the church
