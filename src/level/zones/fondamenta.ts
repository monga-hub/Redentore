import * as THREE from 'three';
import type { LevelBuilder } from '../builder.ts';
import { material } from '../materials.ts';
import { CHURCH_FLOOR, X, Z } from '../plan.ts';

/** Site base (water, ground slabs), Fondamenta San Giacomo, sagrato + scalinata, calle dell'ingresso. */
export function buildFondamenta(b: LevelBuilder): void {
  b.zone('site');
  const water = new THREE.Mesh(new THREE.PlaneGeometry(700, 800), material('water'));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -1.2, -80);
  b.add(water, 'water');
  // Island ground: the fondamenta, the walled complex and the neighbouring land seen over the walls.
  b.box(-120, 120, -1.2, 0, Z.riva, Z.quayEdge, 'ground');

  b.zone('fondamenta');
  b.area('Fondamenta San Giacomo', -60, 60, Z.sagrato, Z.quayEdge);
  b.floor(-60, 60, Z.sagrato, Z.quayEdge, 'paving');
  b.box(-60, 60, 0, 0.12, Z.quayEdge - 0.25, Z.quayEdge, 'stoneDark', { camera: false }); // quay edge stones
  b.barrier(-60, 60, Z.quayEdge, Z.quayEdge + 0.6);
  b.barrier(-60.6, -60, Z.sagrato, Z.quayEdge);
  b.barrier(60, 60.6, Z.sagrato, Z.quayEdge);
  // Neighbouring houses along the fondamenta (outside the complex).
  b.box(-60, X.west, -1.2, 11, -20, Z.sagrato, 'plaster');
  b.box(X.east, 60, -1.2, 11, -60, Z.sagrato, 'plaster');
  b.hipRoof(-60, X.west, -20, Z.sagrato, 11);
  b.hipRoof(X.east, 60, -60, Z.sagrato, 11);
  // Convent/houses flanking the church.
  b.box(X.west, -16, 0, 10, -17, Z.sagrato, 'plaster');
  b.box(13, X.east, 0, 10, -54, Z.sagrato, 'plaster');
  b.hipRoof(X.west, -16, -17, Z.sagrato, 10);
  b.hipRoof(13, X.east, -54, Z.sagrato, 10);

  b.zone('sagrato');
  b.area('Sagrato e scalinata', -13, 13, Z.facade, Z.sagrato);
  // Palladio's scalinata: 12 steps of 0.2 m up to the pronaos landing.
  b.stairs('z', -13, 13, Z.sagrato, 4.4, 0, CHURCH_FLOOR, 12, 'stone');
  b.box(-13, 13, 0, CHURCH_FLOOR, Z.facade, 4.4, 'stone');

  b.zone('calle');
  b.area("Calle dell'ingresso", -16, -13, -21, Z.sagrato);
  b.floor(-16, -13, -21, Z.sagrato, 'paving', 0, 0.02);
}
