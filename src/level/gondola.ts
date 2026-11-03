import * as THREE from 'three';
import { extrude } from './builder.ts';

/** The transport gondola, in metres: bow +X, water at -1.2, keel at -1.52. Each instance owns its resources. */
export const HULL = { half: 5.4, port: 0.72, starboard: 0.6, bow: 5.75 } as const;
export const DECK = -1.05;

/** The gondola's line in plan at height `y` share of its sheer: the hull's half-beam at x (boat frame), port and starboard. */
export function beam(x: number): number {
  const s = x / HULL.half;
  return Math.max(0.03, Math.pow(Math.max(0, 1 - s * s), 0.55));
}
/** Top of the gunwale at x: low amidships, rising to the bow (+X) and the stern. */
export function sheer(x: number): number {
  const s = x / HULL.half, e = Math.max(0, (Math.abs(s) - 0.42) / 0.58);
  return -0.82 + 0.2 * s * s + (s > 0 ? 1.0 : 0.82) * Math.pow(e, 2.2);
}
/** The keel at x: a flat bottom that sweeps up into the slender raised necks of bow and stern. */
export function keel(x: number): number {
  const s = x / HULL.half, e = Math.pow(Math.max(0, (Math.abs(s) - 0.45) / 0.55), 1.6);
  return THREE.MathUtils.lerp(-1.5 + 0.1 * s * s, sheer(x) - 0.28, e);
}

/** The lofted hull: stations bow to stern, each a U from the port gunwale down to the keel and up to the starboard one; the decked ends capped. */
function hullGeometry(): { hull: THREE.BufferGeometry; floor: THREE.BufferGeometry } {
  const SEC = [[1, 1], [0.97, 0.6], [0.82, 0.25], [0.45, 0.05]]; // share of the half-beam, share of the depth over the keel
  const N = 40, ring = SEC.length * 2 + 1;
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const x = -HULL.half + (2 * HULL.half * i) / N, b = beam(x), top = sheer(x), bot = keel(x);
    const side = (k: number, w: number) => { const [bw, h] = SEC[k]; return [x, bot + (top - bot) * h, w * b * bw]; };
    for (let k = 0; k < SEC.length; k++) pos.push(...side(k, -HULL.port));
    pos.push(x, bot - 0.02, 0);
    for (let k = SEC.length - 1; k >= 0; k--) pos.push(...side(k, HULL.starboard));
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < ring - 1; j++) {
    const a = i * ring + j, b = a + ring;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  // The decks over bow and stern, gunwale to gunwale; the floorboards amidships carry the hero.
  for (let i = 0; i < N; i++) {
    const x = -HULL.half + (2 * HULL.half * (i + 0.5)) / N;
    if (x > -HULL.half * 0.58 && x < HULL.half * 0.5) continue;
    const a = i * ring, b = a + ring;
    idx.push(a, a + ring - 1, b, b, a + ring - 1, b + ring - 1);
  }
  // The ends: the last stations' U closed.
  for (const i of [0, N]) for (let j = 1; j < ring - 1; j++) idx.push(i * ring, i * ring + j, i * ring + j + 1);
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hull.setIndex(idx);
  hull.computeVertexNormals();
  const plan = new THREE.Shape();
  const xs = Array.from({ length: 25 }, (_, i) => -3.2 + (6.0 * i) / 24);
  xs.forEach((x, i) => (i ? plan.lineTo(x, 0.86 * HULL.port * beam(x)) : plan.moveTo(x, 0.86 * HULL.port * beam(x))));
  for (const x of [...xs].reverse()) plan.lineTo(x, -0.86 * HULL.starboard * beam(x));
  const floor = extrude(plan, 0.04, 0).rotateX(-Math.PI / 2).translate(0, DECK - 0.02, 0); // the shape's +y to the port side (-Z)
  return { hull, floor };
}

/** The ferro: the bow's polished iron, six teeth forward for the sestieri, one back for the Giudecca, the doge's cap on top. */
function ferroGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape().moveTo(-0.06, 0).lineTo(0.1, 0);
  for (let k = 0; k < 6; k++) { const y = 0.1 + k * 0.075; s.lineTo(0.1, y).lineTo(0.24, y + 0.02).lineTo(0.24, y + 0.045).lineTo(0.1, y + 0.06); }
  s.lineTo(0.12, 0.58).quadraticCurveTo(0.32, 0.66, 0.22, 0.86).quadraticCurveTo(0.08, 0.98, -0.12, 0.9)
    .quadraticCurveTo(-0.02, 0.84, -0.05, 0.7).quadraticCurveTo(-0.1, 0.52, -0.06, 0.4)
    .lineTo(-0.2, 0.36).lineTo(-0.2, 0.32).lineTo(-0.07, 0.3).quadraticCurveTo(-0.12, 0.15, -0.06, 0);
  return extrude(s, 0.035, 0).scale(0.8, 0.8, 1);
}

/** The forcola: the walnut oar-lock on the starboard gunwale, its notch cradling the oar. */
function forcolaGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape().moveTo(-0.11, 0).lineTo(0.11, 0).quadraticCurveTo(0.03, 0.25, 0.08, 0.42).quadraticCurveTo(0.2, 0.55, 0.17, 0.66)
    .quadraticCurveTo(0.13, 0.7, 0.09, 0.6).quadraticCurveTo(0, 0.5, -0.09, 0.6).quadraticCurveTo(-0.14, 0.74, -0.17, 0.66)
    .quadraticCurveTo(-0.13, 0.45, -0.06, 0.3).quadraticCurveTo(-0.03, 0.15, -0.11, 0);
  return extrude(s, 0.09, 0.015).scale(1, 1.12, 1);
}

/** The hull, furniture, ferro and forcola shared by the ferry and the squero's boat. */
export function gondola(): THREE.Group {
  const lacquer = new THREE.MeshStandardMaterial({ color: 0x0d0d10, roughness: 0.22, metalness: 0.15, side: THREE.DoubleSide });
  const boards = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.85 });
  const walnut = new THREE.MeshStandardMaterial({ color: 0x5b3b22, roughness: 0.55 });
  const velvet = new THREE.MeshStandardMaterial({ color: 0x7a1622, roughness: 0.9 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc89a48, roughness: 0.32, metalness: 0.85, emissive: 0x3a2a10 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xe2e6ea, roughness: 0.3, metalness: 0.45, emissive: 0x4a4e54 }); // polished: it must read against the night water
  const { hull, floor } = hullGeometry();
  const parts: THREE.Mesh[] = [new THREE.Mesh(hull, lacquer), new THREE.Mesh(floor, boards)];
  const at = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => parts.push(new THREE.Mesh(g.translate(x, y, z), m));
  // The ferro on the bow's neck, a brass curl on the stern's.
  at(ferroGeometry(), steel, HULL.half - 0.1, sheer(HULL.half) - 0.12, 0);
  at(new THREE.TorusGeometry(0.1, 0.025, 6, 14, Math.PI * 1.4).rotateZ(Math.PI / 2), brass, -HULL.half - 0.02, sheer(-HULL.half) + 0.08, 0);
  // The passengers' seat (sentar) facing the bow, its back black with brass sea-horses; a stool ahead.
  at(new THREE.BoxGeometry(0.55, 0.14, 1.05), velvet, -1.95, -0.86, -0.04);
  at(new THREE.BoxGeometry(0.1, 0.5, 1.1), lacquer, -2.28, -0.66, -0.04);
  for (const z of [-0.6, 0.5]) at(new THREE.TorusGeometry(0.1, 0.022, 6, 12, Math.PI * 1.3).rotateY(Math.PI / 2), brass, -2.25, -0.38, z);
  at(new THREE.BoxGeometry(0.4, 0.1, 0.8), velvet, 1.9, -0.9, -0.04);
  // The forcola on the starboard gunwale, the oar in its notch.
  at(forcolaGeometry(), walnut, -3, sheer(-3) - 0.04, HULL.starboard * beam(-3) - 0.04);
  const root = new THREE.Group();
  for (const m of parts) m.castShadow = true;
  root.add(...parts);
  return root;
}
