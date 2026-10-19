// Master plan of the complex, derived from reference/piantina.jpg.
//
// Scale: 1 unit = 1 metre. Calibration: the church body (nave + side chapels) is
// drawn ~235 px wide on the 1500 px-wide piantina; the real Redentore is ~26 m wide
// with a ~20 m temple front, giving ~0.12 m per piantina pixel (~0.092 m per pixel
// of the full 1950x2600 jpg). Every other block is placed with that same factor and
// then rounded to whole/half metres so corridors line up.
//
// Axes: +Z towards the Fondamenta San Giacomo and the canal, -Z towards the lagoon.
// Origin: centre of the church facade, ground level (y=0 = fondamenta paving).
// The plan follows the drawing's own reading order (fondamenta at the bottom, lagoon on top),
// and its names (X.west/east, "north" for the lagoon side) are that reading's. The real compass
// is the other way round: the piantina's printed north arrow points to its lower left, the facade
// looks north over the canal, so +Z is north and -X east, where the Zitelle are (level 2,
// zones/giudecca.ts): seen from the canal, on the church's left. The maps show the real north up.

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
