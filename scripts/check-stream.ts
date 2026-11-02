// Streaming check (`npm run check`): walking the quays from the Redentore's sagrato to the Punta's pier (z 15: the Fondamenta
// San Giacomo, de la Croce, de le Zitelle, San Giovanni), every level's zones (level/stream.ts bands) are drawn before the hero
// comes within SIGHT of their nearest piece on the quay side (north of the facades' line), both ways along the route: the Ponte
// de la Croce and the Giudecca from the spawn on, the Punta and San Giorgio short of the quay's end, the Redentore again on the
// way back. Zone notes once had the bridge come in 7 m short of its steps.
import * as THREE from 'three';
import { buildLevel } from '../src/level/index.ts';
import { SPAWN, Z } from '../src/level/plan.ts';
import { bands } from '../src/level/stream.ts';

let failed = 0;
const fail = (why: string) => { failed++; console.error(`FAIL ${why}`); };

const SIGHT = 50; // m: out of doors the fog (density 0.016, fx/atmosphere.ts) still lets half of what stands there through
const WALK = { x0: -417, x1: 60, z: 15, step: 0.5 }; // the Punta's pier to the Fondamenta San Giacomo's west end
const level = buildLevel();
level.root.updateMatrixWorld(true);
const GROUPS = {
  one: ['chiesa', 'convento', 'orto', 'corpo-nord', 'giardini', 'laguna', 'calle'],
  two: ['giudecca', 'zitelle'],
  three: ['punta', 'sangiorgio'],
} as const;

/** The world boxes of a zone's pieces reaching the quay's side of the facades, in front of the walker. */
function quaySide(zone: string): THREE.Box3[] {
  const out: THREE.Box3[] = [];
  level.zones.get(zone)!.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const b = new THREE.Box3().setFromObject(o);
    if (!b.isEmpty() && b.max.z > Z.facade && b.min.z < Z.quayEdge) out.push(b);
  });
  return out; // none for the complex's inner zones: the facades hide them
}
const away = (b: THREE.Box3, x: number, z: number) => Math.hypot(Math.max(b.min.x - x, 0, x - b.max.x), Math.max(b.min.z - z, 0, z - b.max.z));

const leads: string[] = [];
for (const [band, zones] of Object.entries(GROUPS) as [keyof typeof GROUPS, readonly string[]][]) {
  for (const zone of zones) {
    const boxes = quaySide(zone);
    if (!boxes.length) continue;
    let late: number | undefined, closest = Infinity;
    for (let x = WALK.x1; x >= WALK.x0; x -= WALK.step) {
      if (bands(x, WALK.z)[band]) continue;
      const d = Math.min(...boxes.map((b) => away(b, x, WALK.z)));
      closest = Math.min(closest, d);
      if (d < SIGHT && late === undefined) late = x;
    }
    if (late !== undefined) fail(`${zone} (level ${band}) is not drawn at x ${late} on the quay, ${closest.toFixed(1)} m from its nearest piece`);
    leads.push(`${zone} ${closest === Infinity ? 'always' : `${closest.toFixed(0)} m`}`);
  }
}

// The zone note's walk: the Ponte de la Croce in sight from the spawn, and still in at the note's spot by its steps.
for (const [what, x, z] of [['the spawn', SPAWN.x, SPAWN.z], ['the Fondamenta San Giacomo\'s west end', 60, 15], ['the note\'s spot', -49.4, 14.8]] as const) {
  if (!bands(x, z).two) fail(`the Giudecca (and the Ponte de la Croce) is not drawn from ${what}`);
}
// Inside the complex the walls hide it: never drawn from the church or the cloisters.
for (const [what, x, z] of [['the dome', 0, -37], ['the chiostro grande', -2, -73]] as const) {
  if (bands(x, z).two) fail(`the Giudecca is drawn from ${what}, behind the walls`);
}

if (failed) process.exit(1);
console.log(`stream ok (along the quays, the nearest piece of a zone still out: ${leads.join(', ')})`);
