import { Matrix4 } from 'three';
import { LevelBuilder, dropFlat } from '../level/builder.ts';
import { buildConvento } from '../level/zones/convento.ts';
import { dressConvento } from '../level/dressing.ts';
import { finishGround } from '../level/ground.ts';

// The campaign's Chiostro grande, centred on the encounter's local coordinates.
export const COURT = { x: -2, z: -73, hx: 14, hz: 12 };
let level: LevelBuilder | undefined;
export function arenaLevel(): LevelBuilder {
  if (level) return level;
  const b = new LevelBuilder();
  // Convento floor overlays sit on the island slab built by buildFondamenta in solo.
  b.world.add(-2, -52, 48, 40, -1.2, 0);
  buildConvento(b);
  dressConvento(b);
  finishGround(b);
  b.flush();
  dropFlat(b.root);
  b.root.position.set(-COURT.x, 0, -COURT.z);
  for (const box of b.world.boxes) { box.cx -= COURT.x; box.cz -= COURT.z; }
  for (const light of b.lights) { light.x -= COURT.x; light.z -= COURT.z; }
  for (const area of b.areas) { area.x0 -= COURT.x; area.x1 -= COURT.x; area.z0 -= COURT.z; area.z1 -= COURT.z; }
  // Seal the campaign exits for this encounter only. Existing walls/props stay solid.
  for (const side of [-1, 1]) {
    b.world.add(side * COURT.hx, 0, .25, COURT.hz + 1, 0, 15);
    b.world.add(0, side * COURT.hz, COURT.hx + 1, .25, 0, 15);
  }
  for(const [,matrix] of b.solids)matrix.premultiply(new Matrix4().makeTranslation(-COURT.x,0,-COURT.z));
  b.root.updateMatrixWorld(true);
  return level = b;
}
