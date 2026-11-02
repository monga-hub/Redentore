import { Z } from './plan.ts';

/**
 * Zone streaming (main.ts `stream`): which level's zones are drawn, by where the hero stands. Bands on x (east is -X):
 * past the Ponte de la Croce the Redentore's complex is skipped, level 2 on the church's side of it and on San Giorgio,
 * level 3 short of the Tre Oci. Out on the open quay (north of the facades' line, z > 0) nothing stands between the hero
 * and the Giudecca, so its zones are in from the whole Fondamenta San Giacomo and its sagrato: the Ponte de la Croce is
 * in sight from the spawn on, never popping up a few steps short of it. Inside the complex (z < 0) the walls hide it and
 * it stays out (no draws behind them). scripts/check-stream.ts walks the quay. ponytail: bands, not per-zone bounds;
 * those if a level ever doubles back.
 */
export function bands(x: number, z: number): { one: boolean; two: boolean; three: boolean } {
  return { one: x > -100, two: x > -430 && (x < -50 || z > Z.facade), three: x < -250 };
}
