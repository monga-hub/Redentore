import * as THREE from 'three';
import type { LevelBuilder } from '../builder.ts';
import { material } from '../materials.ts';
import { CHURCH_FLOOR as F, Z } from '../plan.ts';

// Chiesa del Redentore (Palladio). Single nave with three side chapels per side,
// domed crossing with apsidal arms, raised presbytery, friars' choir behind a
// colonnade. Whole church sits on a 2.4 m podium reached by the scalinata.
//   nave        x ±7.5   z 0 .. -29   (h 20)
//   chapels     x ±7.5..±12.5          (h 14)
//   crossing    x ±8     z -29 .. -45, apses r 4.5, drum + dome r 8
//   presbytery  x ±7.5   z -45 .. -53.5 (+0.6 m)
//   choir       x ±7.5   z -53.5 .. -60, back door down into the chiostro grande

const CX = -37; // crossing centre z

export function buildChiesa(b: LevelBuilder): void {
  b.zone('chiesa');
  b.area('Chiesa del Redentore: navata', -7.5, 7.5, -29, Z.facade);
  b.area('Cappelle laterali', -12.5, -7.5, -29, Z.facade);
  b.area('Cappelle laterali', 7.5, 12.5, -29, Z.facade);
  b.area('Crociera e cupola', -12.5, 12.5, -45, -29);
  b.area('Presbiterio', -7.5, 7.5, -53.5, -45);
  b.area('Coro dei frati', -7.5, 7.5, Z.churchBack, -53.5);

  const stone = { y0: F, t: 1, role: 'stone' as const };
  b.box(-13, 13, 0, F, Z.churchBack, Z.facade, 'stone'); // podium / floor

  // Facade: temple front over the main door, raised central attic, pediment.
  b.wallX(Z.facade, -13, 13, { ...stone, h: F + 14, doors: [{ at: 0, w: 4, h: 8, y0: F }] });
  b.box(-8.5, 8.5, F + 14, F + 22, -0.5, 0.5, 'stone');
  b.box(-9.5, 9.5, F + 20.5, F + 22, -0.5, 1.3, 'stoneDark', { collide: false });
  b.add(prism(19, 4.5, 1.8, 'stoneDark'), 'stoneDark').position.set(0, F + 22, -0.5);
  for (const x of [-7.6, -3.2, 3.2, 7.6]) b.order(x, 0.7, 0.7, F, F + 20.5, 'stoneDark');

  // Nave + chapels.
  const chapels = [-4.75, -14, -23.25].map((at) => ({ at, w: 6, h: 11, y0: F }));
  for (const s of [-1, 1]) {
    b.wallZ(7.5 * s, 0, -29, { ...stone, h: F + 20, doors: chapels });
    b.wallZ(12.5 * s, 0, -29, { ...stone, h: F + 14 });
    for (const z of [-9.5, -18.5, -29]) b.wallX(z, 7.5 * s, 12.5 * s, { ...stone, h: F + 14 });
    b.box(7.5 * s, 13 * s, F + 14, F + 14.6, -29.5, 0, 'roof');
    hip(b, 7.8 * s, 13 * s, -29.5, 0, F + 14.6); // eave stops short of the nave's inner face
  }
  b.box(-8, 8, F + 20, F + 20.8, -29, -0.5, 'stone');
  b.add(prism(17, 5, 29, 'roof'), 'roof').position.set(0, F + 20.8, -29);

  // Crossing: piers with apsidal arms east and west.
  for (const s of [-1, 1]) {
    b.wallZ(8 * s, -29, -45, { ...stone, h: F + 20, doors: [{ at: CX, w: 7, h: 14, y0: F }] });
    const r = 4.5, seg = 8;
    for (let k = 0; k < seg; k++) {
      const a0 = -Math.PI / 2 + (Math.PI * k) / seg, a1 = -Math.PI / 2 + (Math.PI * (k + 1)) / seg;
      const p0x = 8 * s + s * (r + 0.5) * Math.cos(a0), p0z = CX + (r + 0.5) * Math.sin(a0);
      const p1x = 8 * s + s * (r + 0.5) * Math.cos(a1), p1z = CX + (r + 0.5) * Math.sin(a1);
      const dx = p1x - p0x, dz = p1z - p0z;
      b.obox((p0x + p1x) / 2, (p0z + p1z) / 2, Math.hypot(dx, dz) + 0.4, 1, F, F + 14, Math.atan2(-dz, dx), 'stone');
    }
    b.box(8 * s, 13 * s, F + 14, F + 14.6, CX - 5.5, CX + 5.5, 'roof');
    hip(b, 8 * s, 13 * s, CX - 5.5, CX + 5.5, F + 14.6);
  }
  // Ceiling ring around the drum opening, drum, dome, lantern.
  const ring = new THREE.Shape([new THREE.Vector2(-8.5, 28.5), new THREE.Vector2(8.5, 28.5), new THREE.Vector2(8.5, 45.5), new THREE.Vector2(-8.5, 45.5)]);
  ring.holes.push(new THREE.Path().absarc(0, -CX, 8, 0, Math.PI * 2, true));
  const ringMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: 0.8, bevelEnabled: false }), material('stone'));
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.y = F + 20;
  b.add(ringMesh, 'stone');
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 6, 40, 1, true), material('stone', true));
  drum.position.set(0, F + 23.8, CX);
  b.add(drum, 'stone');
  const dome = new THREE.Mesh(new THREE.SphereGeometry(8, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), material('stone', true));
  dome.position.set(0, F + 26.8, CX);
  b.add(dome, 'stone');
  b.cameraBlockers.push(ringMesh, drum, dome);
  b.column(0, CX, 1.4, F + 34.6, F + 38, 'stone', false);
  b.add(cone(1.8, 3, 'roof'), 'roof').position.set(0, F + 39.5, CX);

  // Presbytery and choir.
  for (const s of [-1, 1]) {
    b.wallZ(7.5 * s, -45, Z.churchBack, { ...stone, h: F + 20 });
    b.box(8 * s, 13 * s, F, F + 12, -45.5, Z.churchBack, 'stone'); // sacristies (closed)
    hip(b, 8 * s, 13 * s, Z.churchBack, -45.5, F + 12); // the bell tower rises through its ridge
    b.column(10.5 * s, -48, 1.4, F + 12, F + 32, 'stone', false); // twin bell towers
    b.add(cone(1.8, 4, 'roof'), 'roof').position.set(10.5 * s, F + 34, -48);
  }
  b.wallX(Z.churchBack, -7.5, 7.5, { ...stone, h: F + 20, doors: [{ at: 0, w: 2.4, h: 3.4, y0: F + 0.6 }] });
  b.stairs('z', -7, 7, -45, -46.2, F, F + 0.6, 3, 'stone');
  b.box(-7, 7, F, F + 0.6, -46.2, Z.churchBack + 0.5, 'stone');
  b.box(-1.6, 1.6, F + 0.6, F + 1.6, -50.5, -49.3, 'stoneDark'); // high altar
  for (const x of [-5, -2.5, 0, 2.5, 5]) b.order(x, -53.5, 0.45, F + 0.6, F + 12, 'stoneDark');
  b.box(-7, 7, F + 12, F + 13, -54, -53, 'stoneDark', { collide: false });
  b.box(-8, 8, F + 20, F + 20.8, Z.churchBack - 0.5, -45, 'stone');
  b.add(prism(17, 5, 15.5, 'roof'), 'roof').position.set(0, F + 20.8, Z.churchBack - 0.5);

  // Back door: landing + 15 steps down into the chiostro grande (ground 0).
  const sill = F + 0.6;
  b.box(-2, 2, 0, sill, -61.5, Z.churchBack - 0.5, 'stone');
  b.stairs('z', -1.5, 1.5, -66.75, -61.5, 0, sill, 15, 'stone');
}

/** Hipped roof over the side band between x `a` and `b` (either sign), eaves at y. */
function hip(lb: LevelBuilder, a: number, b: number, z0: number, z1: number, y: number): void {
  lb.hipRoof(Math.min(a, b), Math.max(a, b), z0, z1, y);
}

/** Triangular prism (gable roof / pediment) of base `w`, height `h`, extruded `depth` along +z from its origin. */
function prism(w: number, h: number, depth: number, role: 'roof' | 'stoneDark'): THREE.Mesh {
  const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
  return new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }), material(role));
}

function cone(r: number, h: number, role: 'roof'): THREE.Mesh {
  return new THREE.Mesh(new THREE.ConeGeometry(r, h, 16), material(role));
}
