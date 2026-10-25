import * as THREE from 'three';
import type { LevelBuilder } from '../builder.ts';
import { material } from '../materials.ts';
import { CHURCH_FLOOR, X, Z } from '../plan.ts';
import { RII } from './giudecca.ts';
import { Props } from '../props.ts';
import { type Side, front } from '../facades.ts';

/** Site base (water, ground slabs), Fondamenta San Giacomo, sagrato + scalinata, calle dell'ingresso. */
export function buildFondamenta(b: LevelBuilder): void {
  b.zone('site');
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1300, 1000), material('water'));
  water.rotation.x = -Math.PI / 2;
  water.position.set(-230, -1.2, -80); // the lagoon, the canal, the rii of level 2 (zones/giudecca.ts) and San Giorgio's water (level 3)
  b.add(water, 'water');
  // Island ground: the fondamenta, the walled complex and the neighbouring land seen over the walls.
  b.box(RII.croce[1], 120, -1.2, 0, Z.riva, Z.quayEdge, 'ground'); // past it (-X) the rio de la Croce, then zones/giudecca.ts

  b.zone('fondamenta');
  b.area('Fondamenta San Giacomo', -60, 60, Z.sagrato, Z.quayEdge);
  b.floor(-60, 60, Z.sagrato, Z.quayEdge, 'paving');
  b.box(-60, 60, 0, 0.12, Z.quayEdge - 0.25, Z.quayEdge, 'stoneDark', { camera: false }); // quay edge stones
  b.barrier(-60, 60, Z.quayEdge, Z.quayEdge + 0.6);
  b.barrier(60, 60.6, Z.sagrato, Z.quayEdge);
  // The -X end (east, plan.ts): the chains across the Ponte de la Croce (quest/progress.ts) until level 2 opens it.
  // Neighbouring houses along the fondamenta (outside the complex), then the convent's and the houses flanking the
  // church: Venetian fronts on the quay and down the calle dell'ingresso (facades.ts).
  const p = new Props(b, 17);
  const row = (x0: number, x1: number, z0: number, y0: number, h: number, sides: Side[], seed: number) => b.together(() => {
    b.box(x0, x1, y0, h, z0, Z.sagrato, 'plaster');
    b.hipRoof(x0, x1, z0, Z.sagrato, h);
    for (const side of sides) front(b, p, x0, x1, z0, Z.sagrato, side, h - 0.2, seed + side.charCodeAt(0), { roof: h, cornice: true });
  });
  row(-60, X.west, -20, -1.2, 11, ['s'], 1);
  row(X.east, 60, -60, -1.2, 11, ['s'], 2);
  row(X.west, -16, -17, 0, 10, ['s', 'e'], 3);
  row(13, X.east, -54, 0, 10, ['s'], 4);
  p.flush();

  b.zone('sagrato');
  b.area('Sagrato e scalinata', -13, 13, Z.facade, Z.sagrato);
  // Palladio's scalinata: 12 steps of 0.2 m up to the pronaos landing.
  b.stairs('z', -13, 13, Z.sagrato, 4.4, 0, CHURCH_FLOOR, 12, 'stone');
  b.box(-13, 13, 0, CHURCH_FLOOR, Z.facade, 4.4, 'stone');

  b.zone('calle');
  b.area("Calle dell'ingresso", -16, -13, -21, Z.sagrato);
  b.floor(-16, -13, -21, Z.sagrato, 'paving', 0, 0.02);
}
