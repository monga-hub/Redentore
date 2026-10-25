import { LevelBuilder } from './builder.ts';
import { buildFondamenta } from './zones/fondamenta.ts';
import { buildChiesa } from './zones/chiesa.ts';
import { buildConvento } from './zones/convento.ts';
import { buildOrto } from './zones/orto.ts';
import { buildNord } from './zones/nord.ts';
import { buildGiudecca } from './zones/giudecca.ts';
import { buildZitelle } from './zones/zitelle.ts';
import { buildPunta, buildSanGiorgio } from './zones/sangiorgio.ts';
import { dressLevel } from './dressing.ts';
import { finishGround } from './ground.ts';

export type Level = LevelBuilder;

/**
 * Builds the whole complex, south to north. Returns the builder, which exposes:
 *  - root: THREE.Group with one child group per zone (`zone:<id>`)
 *  - zones: Map<id, Group>  (site, fondamenta, sagrato, calle, chiesa, convento, orto, corpo-nord, giardini, laguna; level 2: giudecca, zitelle; level 3: punta, sangiorgio)
 *  - areas: named sub-areas (HUD labels, walkability check)
 *  - world: collision boxes; cameraBlockers: meshes the camera avoids
 * Every mesh carries userData.role (see materials.ts) for later material passes.
 */
export function buildLevel(): Level {
  const b = new LevelBuilder();
  buildFondamenta(b);
  buildChiesa(b);
  buildConvento(b);
  buildOrto(b);
  buildNord(b);
  buildGiudecca(b); // level 2: east along the fondamenta
  buildZitelle(b);
  buildPunta(b); // level 3: on to the Punta, and across the water San Giorgio Maggiore
  buildSanGiorgio(b);
  dressLevel(b); // vegetation, covered walks, furniture
  finishGround(b); // ground masks, grass tufts, pebbles (needs the dressing's trunks and benches)
  b.flush(); // merge trims, arches and roofs per zone and role
  return b;
}
