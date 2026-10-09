import * as THREE from 'three';
import { type LevelBuilder, columnGeometry, extrude, ring, shaped } from '../builder.ts';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Props } from '../props.ts';
import { CHURCH_FLOOR as F } from '../plan.ts';

// Palladio's temple front for the Redentore, read as a WoW cathedral front: everything a
// size too heavy, chamfered, pale Istrian stone with darker trim and a few gilt accents.
// Two interlocked temple fronts as on the real church: the giant order on tall pedestals
// carries a full entablature and the main pediment; behind it a taller attic with its own
// gable; lower pilasters on the wings carry half pediments over the side chapels. Round-
// arched portal with stepped archivolts under a small pediment, statues in niches between
// the giant columns, the Redeemer on the apex and flaming urns on the pediment's ends.
//   wall face   z 0.5 (facade wall z -0.5..0.5, door x ±2 up to F+8, round head)
//   giant order x ±4, ±8.5: pedestals F..F+2.6, columns to E (F+17.4), entablature to PB
//   pediment    base PB (F+20.25), half-width 10.3, apex PB+4.4; attic gable behind to F+26.5
//   wings       x ±9.9..±13.6: pilasters to F+12.4, entablature to F+14, half pediments

const FZ = 0.5; // front face of the facade wall
const PED = F + 2.6, E = F + 17.4, PB = E + 2.85;
const COLS = [-8.5, -4.0, 4.0, 8.5], CR = 1.0, CZ = 0.75; // half-engaged: the shaft's back is in the wall
const V2 = THREE.Vector2;

export function buildFacciata(b: LevelBuilder): void {
  const p = new Props(b, 29);
  const part = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, role: 'stone' | 'stoneDark' | 'gold' | 'cloth', cam = false) => b.part(null, x0, x1, y0, y1, z0, z1, role, cam);
  const mirror = (f: (s: number) => void) => { f(-1); f(1); };

  // Attic behind the main pediment, with the nave's own gable rising over it.
  b.box(-9.9, 9.9, F + 14, F + 21.6, -0.5, 0.5, 'stone');
  gable(b, 9.9, 5.0, 0.6, F + 21.6, -0.5, FZ + 0.1, 1, true);

  // Podium dado along the whole front, broken by the portal; giant pedestals stand proud of it.
  mirror((s) => {
    const [a, c] = [2.75 * s, 13.6 * s].sort((u, v) => u - v);
    part(a, c, F, PED, FZ, FZ + 0.35, 'stone');
    part(a, c, F, F + 0.35, FZ, FZ + 0.5, 'stoneDark');
    part(a, c, PED - 0.3, PED, FZ, FZ + 0.52, 'stoneDark');
  });
  for (const x of COLS) {
    part(x - 1.35, x + 1.35, F, PED, FZ, 2.2, 'stone', true);
    part(x - 1.5, x + 1.5, F, F + 0.4, FZ, 2.35, 'stoneDark');
    part(x - 1.52, x + 1.52, PED - 0.35, PED, FZ, 2.37, 'stoneDark');
    part(x - 0.95, x + 0.95, F + 0.75, PED - 0.6, 2.2, 2.28, 'stoneDark'); // raised panel
    b.world.add(x, (FZ + 2.35) / 2, 1.5, (2.35 - FZ) / 2, F, PED);
    p.put(columnGeometry(CR, E - PED), 'stone', x, PED, CZ, 1, 1, 1);
    b.world.add(x, CZ, CR, CR, PED, E);
    p.put(COLLAR, 'gold', x, E - 0.98 * CR, CZ, CR * 0.9, CR * 0.9, CR * 0.9); // gilt necking under the capital
  }

  // Entablature: architrave in two fasciae, frieze with gilt roundels, dentils, two-tier cornice.
  const X = 9.9;
  part(-X, X, E, E + 0.45, FZ, 1.88, 'stone', true);
  part(-X, X, E + 0.45, E + 0.95, FZ, 1.98, 'stone', true);
  part(-X - 0.05, X + 0.05, E + 0.95, E + 1.07, FZ, 2.04, 'stoneDark');
  part(-X, X, E + 1.07, E + 2.0, FZ, 1.95, 'stone', true);
  for (const x of [-6.25, 0, 6.25]) p.put(ROUNDEL, 'gold', x, E + 1.53, 1.95, 0.34, 0.34, 0.12);
  for (const x of COLS) for (const d of [-0.55, 0.55]) p.put(ROUNDEL, 'gold', x + d, E + 1.53, 1.95, 0.16, 0.16, 0.08);
  for (let x = -X + 0.25; x <= X - 0.2; x += 0.5) p.box(x - 0.13, x + 0.13, E + 1.8, E + 2.08, 1.95, 2.22, 'stoneDark');
  part(-X - 0.15, X + 0.15, E + 2.0, E + 2.35, FZ, 2.35, 'stoneDark', true);
  part(-X - 0.3, X + 0.3, E + 2.35, PB, FZ, 2.7, 'stoneDark', true);

  // Main pediment: recessed tympanum inside a deep raking cornice, a crimson and gold stemma.
  gable(b, 10.3, 4.5, 0.85, PB, FZ, 2.7, 1.7 - FZ, false);
  const sy = PB + 1.55;
  p.put(WREATH, 'gold', 0, sy, 1.78, 1.05, 1.05, 1.05);
  b.decor(shaped(extrude(shield(0.78), 0.18, 0.04)).translate(0, sy - 0.05, 1.82), 'gold');
  b.decor(shaped(extrude(shield(0.66), 0.14, 0.03)).translate(0, sy - 0.03, 1.92), 'cloth');
  part(-0.09, 0.09, sy - 0.62, sy + 0.5, 1.92, 2.08, 'gold');
  part(-0.38, 0.38, sy + 0.04, sy + 0.2, 1.92, 2.08, 'gold');
  p.put(GEM, 'gold', 0, sy + 1.12, 1.95, 0.2, 0.28, 0.12); // crest

  // Acroteria: the Redeemer blessing from the apex, flaming urns on the two ends.
  const apex = PB + 4.5;
  part(-0.85, 0.85, apex - 0.6, apex + 0.55, 1.0, 2.5, 'stoneDark');
  statue(p, 0, apex + 0.55, 1.75, 3.4, true);
  mirror((s) => {
    const x = 9.6 * s;
    part(x - 0.7, x + 0.7, PB, PB + 1.0, 1.1, 2.6, 'stoneDark');
    p.put(URN, 'stone', x, PB + 1.0, 1.85, 0.9, 0.9, 0.9);
    p.put(GEM, 'gold', x, PB + 2.25, 1.85, 0.3, 0.55, 0.3);
    p.put(GEM, 'gold', x, PB + 2.8, 1.85, 0.16, 0.32, 0.16, 0, 0.6);
  });

  // Niches with saints between the giant columns, a framed panel above each.
  mirror((s) => {
    const x = 6.25 * s, n0 = F + 3.3, r = 0.78, spring = F + 8.1;
    const arched = (path: THREE.Path, rr: number, y: number) => path.moveTo(x - rr, y).lineTo(x + rr, y).lineTo(x + rr, spring).absarc(x, spring, rr, 0, Math.PI, false).lineTo(x - rr, y);
    const frame = arched(new THREE.Shape(), r + 0.32, n0 - 0.1) as THREE.Shape;
    frame.holes.push(arched(new THREE.Path(), r, n0));
    b.decor(shaped(extrude(frame, 0.5, 0.04), n0, spring - n0).translate(0, 0, FZ + 0.25), 'stoneDark');
    b.decor(shaped(extrude(arched(new THREE.Shape(), r, n0) as THREE.Shape, 0.06, 0), n0, spring - n0).translate(0, 0, FZ + 0.03), 'stoneDark');
    b.decor(shaped(ring(x, spring, r - 0.02, r + 0.06, 0.56)).translate(0, 0, FZ + 0.28), 'gold');
    part(x - r - 0.45, x + r + 0.45, n0 - 0.45, n0, FZ, FZ + 1.0, 'stoneDark'); // sill on a corbel
    part(x - 0.5, x + 0.5, n0 - 1.0, n0 - 0.45, FZ, FZ + 0.55, 'stoneDark');
    part(x - 0.2, x + 0.2, spring + r - 0.05, spring + r + 0.6, FZ, FZ + 0.72, 'stoneDark'); // keystone
    statue(p, x, n0, FZ + 0.65, 3.5, false);
    const [y0, y1, hw, t] = [F + 10.6, F + 16.3, 0.95, 0.2];
    part(x - hw, x + hw, y0, y0 + t, FZ, FZ + 0.22, 'stoneDark');
    part(x - hw, x + hw, y1 - t, y1, FZ, FZ + 0.22, 'stoneDark');
    part(x - hw, x - hw + t, y0 + t, y1 - t, FZ, FZ + 0.22, 'stoneDark');
    part(x + hw - t, x + hw, y0 + t, y1 - t, FZ, FZ + 0.22, 'stoneDark');
    p.put(ROUNDEL, 'gold', x, (y0 + y1) / 2, FZ + 0.06, 0.4, 0.4, 0.12);
  });

  // Wings: lower pilaster order, entablature level with the wall top, half pediments.
  mirror((s) => {
    const xs = [11 * s, 12.9 * s];
    for (const x of xs) {
      part(x - 0.75, x + 0.75, F, PED, FZ, 1.15, 'stone');
      part(x - 0.85, x + 0.85, PED - 0.3, PED, FZ, 1.22, 'stoneDark');
      part(x - 0.5, x + 0.5, PED, F + 11.6, FZ, FZ + 0.38, 'stone');
      part(x - 0.62, x + 0.62, PED, PED + 0.4, FZ, FZ + 0.5, 'stoneDark');
      part(x - 0.55, x + 0.55, F + 11.45, F + 11.6, FZ, FZ + 0.45, 'gold');
      part(x - 0.68, x + 0.68, F + 11.6, F + 12.4, FZ, FZ + 0.55, 'stoneDark');
      b.world.add(x, (FZ + 1.22) / 2, 0.85, (1.22 - FZ) / 2, F, PED);
    }
    const [a, c] = [9.9 * s, 13.7 * s].sort((u, v) => u - v);
    part(a, c, F + 12.4, F + 13.45, FZ, FZ + 0.5, 'stone', true);
    part(a, c, F + 13.45, F + 14, FZ, FZ + 0.8, 'stoneDark', true);
    // Half pediment rising from the wing's outer corner to the giant order.
    const rise = 2.4, pt = (x: number, y: number) => new V2(x * s, y); // extrusion re-winds mirrored outlines
    const wedge = new THREE.Shape([pt(9.9, F + 14), pt(13.8, F + 14), pt(9.9, F + 14 + rise)]);
    const rake = new THREE.Shape([pt(9.9, F + 14 + rise - 0.1), pt(13.95, F + 13.95), pt(13.95, F + 14.4), pt(9.9, F + 14.4 + rise)]);
    b.decor(shaped(extrude(wedge, 1.2, 0.03), F + 14, rise).translate(0, 0, 0.1), 'stone', true);
    b.decor(shaped(extrude(rake, 1.4, 0.04), F + 14, rise + 0.4).translate(0, 0, 0.3), 'stoneDark', true);
  });

  portal(b, p);
  p.flush();
}

/** Round-arched portal on the door (x ±2, F..F+8): jambs, stepped archivolts, keystone, pedimented hood. */
function portal(b: LevelBuilder, p: Props): void {
  const part = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, role: 'stone' | 'stoneDark' | 'gold') => b.part(null, x0, x1, y0, y1, z0, z1, role);
  const spring = F + 6, at = (g: THREE.BufferGeometry, z0: number, z1: number) => shaped(g, F, 8).translate(0, 0, (z0 + z1) / 2);
  for (const s of [-1, 1]) {
    const [a, c] = [2.0 * s, 2.75 * s].sort((u, v) => u - v);
    part(a, c, F, spring - 0.35, FZ, FZ + 0.55, 'stoneDark');
    part(a - 0.1, c + 0.1, F, F + 0.5, FZ, FZ + 0.7, 'stoneDark');
    part(a - 0.08, c + 0.08, spring - 0.35, spring, FZ, FZ + 0.72, 'stoneDark'); // impost
    const [g0, g1] = [1.94 * s, 2.06 * s].sort((u, v) => u - v);
    part(g0, g1, F + 0.5, spring - 0.35, FZ, FZ + 0.6, 'gold');
  }
  b.decor(at(ring(0, spring, 2.0, 2.45, 0.62), FZ, FZ + 0.62), 'stoneDark');
  b.decor(at(ring(0, spring, 2.45, 2.85, 0.36), FZ, FZ + 0.36), 'stone');
  b.decor(at(ring(0, spring, 1.94, 2.06, 0.66), FZ, FZ + 0.66), 'gold');
  part(-0.38, 0.38, F + 7.7, F + 8.95, FZ, FZ + 0.85, 'stoneDark'); // keystone
  p.put(GEM, 'gold', 0, F + 8.3, FZ + 0.88, 0.2, 0.26, 0.1);
  // Hood: frieze and cornice, then a small pediment with a gilt boss.
  part(-2.95, 2.95, F + 9.0, F + 9.5, FZ, FZ + 0.65, 'stone');
  part(-3.05, 3.05, F + 9.5, F + 9.9, FZ, FZ + 0.9, 'stoneDark');
  gable(b, 3.05, 1.3, 0.35, F + 9.9, FZ, FZ + 0.9, 0.45, false);
  p.put(ROUNDEL, 'gold', 0, F + 10.45, FZ + 0.48, 0.22, 0.22, 0.1);
}

/**
 * Pediment of half-width w and height h on the line y: a triangular raking cornice `t` thick
 * from z0 to z1 around a tympanum `tymp` deep from z0 (or a solid gable when `solid`).
 */
function gable(b: LevelBuilder, w: number, h: number, t: number, y: number, z0: number, z1: number, tymp: number, solid: boolean): void {
  const k = 1 - t * Math.hypot(1 / w, 1 / h), yb = 0.3; // inner triangle: sides offset by t, base raised by yb
  const outer = () => new THREE.Shape([new V2(-w, y), new V2(w, y), new V2(0, y + h)]);
  const iw = w * (k - yb / h), inner = [new V2(-iw, y + yb), new V2(iw, y + yb), new V2(0, y + h * k)];
  const frame = outer();
  frame.holes.push(new THREE.Path([...inner].reverse()));
  b.decor(shaped(extrude(frame, z1 - z0, 0.05), y, h).translate(0, 0, (z0 + z1) / 2), 'stoneDark', true);
  const fill = solid ? outer() : new THREE.Shape(inner);
  b.decor(shaped(extrude(fill, tymp, 0.03), y, h).translate(0, 0, z0 + tymp / 2), 'stone', true);
}

/** Heater shield `s` wide for the stemma, centred on its middle. */
function shield(s: number): THREE.Shape {
  const h = s * 1.25;
  return new THREE.Shape()
    .moveTo(-s / 2, h / 2).lineTo(s / 2, h / 2).lineTo(s / 2, 0)
    .quadraticCurveTo(s / 2, -h * 0.32, 0, -h / 2)
    .quadraticCurveTo(-s / 2, -h * 0.32, -s / 2, 0).closePath();
}

/** Robed figure `h` tall standing on y; `blessing`: halo and a gilt processional cross. */
function statue(p: Props, x: number, y: number, z: number, h: number, blessing: boolean): void {
  p.put(FIGURE, 'stone', x, y, z, h, h, h, 0, blessing ? 0 : -0.25 * Math.sign(x));
  if (!blessing) return;
  p.put(HALO, 'gold', x, y + 0.87 * h, z - 0.1 * h, 0.15 * h, 0.15 * h, 0.15 * h);
  p.rod(x + 0.2 * h, y + 0.05 * h, z + 0.08 * h, x + 0.2 * h, y + 1.08 * h, z + 0.08 * h, 0.035 * h, 'gold');
  p.rod(x + 0.11 * h, y + 0.98 * h, z + 0.08 * h, x + 0.29 * h, y + 0.98 * h, z + 0.08 * h, 0.03 * h, 'gold');
}

// Shared instanced shapes (unit size, feet on y = 0 where it matters).
const ROUNDEL = new THREE.CylinderGeometry(1, 0.85, 1, 12).rotateX(Math.PI / 2); // disc facing +z
const COLLAR = new THREE.TorusGeometry(1.02, 0.07, 6, 20).rotateX(Math.PI / 2);
const WREATH = new THREE.TorusGeometry(1, 0.12, 6, 20);
const HALO = new THREE.TorusGeometry(1, 0.1, 5, 20);
const GEM = new THREE.OctahedronGeometry(1, 0);

/** Faceted robed figure, 1 tall: flared hem, belted waist, broad shoulders, cowled head. */
const FIGURE = (() => {
  const robe = new THREE.LatheGeometry([[0, 0], [0.2, 0], [0.21, 0.04], [0.15, 0.42], [0.13, 0.48], [0.15, 0.52], [0.17, 0.72], [0.15, 0.77], [0.07, 0.8], [0, 0.8]].map(([r, y]) => new V2(r, y)), 8);
  const head = new THREE.IcosahedronGeometry(0.085, 0).translate(0, 0.88, 0.01);
  const cowl = new THREE.ConeGeometry(0.11, 0.2, 7).translate(0, 0.9, -0.025);
  const arms = new THREE.BoxGeometry(0.34, 0.09, 0.14).translate(0, 0.6, 0.1); // folded over the chest
  const parts = [robe, head, cowl, arms].map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of parts) { g.deleteAttribute('uv'); g.deleteAttribute('normal'); }
  const out = mergeGeometries(parts)!;
  out.computeVertexNormals(); // flat: faceted, so each plane catches its own light
  return out;
})();

/** Urn on a short foot, 1.25 tall. */
const URN = new THREE.LatheGeometry([[0, 0], [0.42, 0], [0.42, 0.1], [0.22, 0.2], [0.2, 0.3], [0.45, 0.55], [0.5, 0.75], [0.4, 0.95], [0.25, 1.05], [0.32, 1.12], [0.32, 1.22], [0, 1.25]].map(([r, y]) => new V2(r, y)), 10);
