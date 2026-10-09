// Headless layout check: `npm run check`.
// Flood-fills the level from the spawn with the same collision rules the player uses
// (step height, body radius) and fails if any named area is unreachable — i.e. the
// route Fondamenta -> chiesa -> convento -> orto -> corpo nord -> laguna is continuous.
import { buildLevel } from '../src/level/index.ts';
import { World, PLAYER } from '../src/core/physics.ts';
import { SPAWN } from '../src/level/plan.ts';

// Physics sanity: a rotated wall pushes the player out along its normal.
{
  const w = new World();
  w.add(0, 0, 2, 0.5, 0, 3, Math.PI / 4);
  const p = { x: 0.3, z: 0.3 };
  w.resolve(p, 0);
  if (w.blocked(p.x, p.z, 0)) throw new Error('resolve left the player inside a rotated wall');
  w.add(5, 5, 1, 1, 0, 0.3);
  if (w.groundAt(5, 5, 0) !== 0.3) throw new Error('could not step onto a 0.3 m box');
  if (w.groundAt(5, 5, -0.5) !== -Infinity) throw new Error('climbed higher than PLAYER.step');
}

const level = buildLevel();
const { world } = level;
const STEP = 0.5, X0 = -62, X1 = 62, Z0 = -197, Z1 = 22;
const nx = Math.round((X1 - X0) / STEP), nz = Math.round((Z1 - Z0) / STEP);
const feet = new Float32Array(nx * nz).fill(NaN);
const idx = (i: number, j: number) => j * nx + i;
const toI = (x: number) => Math.round((x - X0) / STEP), toJ = (z: number) => Math.round((z - Z0) / STEP);

const t0 = performance.now();
const queue: number[] = [];
const si = toI(SPAWN.x), sj = toJ(SPAWN.z);
feet[idx(si, sj)] = world.groundAt(SPAWN.x, SPAWN.z, 0);
queue.push(idx(si, sj));
let reached = 0;
while (queue.length) {
  const c = queue.pop()!;
  reached++;
  const i = c % nx, j = (c - i) / nx, f = feet[c];
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ni = i + di, nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
    const n = idx(ni, nj);
    if (!Number.isNaN(feet[n])) continue;
    const x = X0 + ni * STEP, z = Z0 + nj * STEP;
    const g = world.groundAt(x, z, f);
    if (g === -Infinity || g < -1 || world.blocked(x, z, g, PLAYER.radius)) continue;
    feet[n] = g;
    queue.push(n);
  }
}

let failed = 0;
const seen = new Set<string>();
for (const a of level.areas) {
  let hit = 0;
  for (let i = toI(a.x0); i <= toI(a.x1); i++) for (let j = toJ(a.z0); j <= toJ(a.z1); j++) {
    if (i >= 0 && j >= 0 && i < nx && j < nz && !Number.isNaN(feet[idx(i, j)])) hit++;
  }
  const key = `${a.label}@${a.x0},${a.z0}`;
  if (seen.has(key)) continue;
  seen.add(key);
  if (!hit) failed++;
  console.log(`${hit ? 'ok  ' : 'FAIL'} ${a.zone.padEnd(11)} ${a.label} (${hit} cells)`);
}
console.log(`${reached} walkable cells reached, ${world.boxes.length} colliders, ${(performance.now() - t0).toFixed(0)} ms`);
if (failed) {
  console.error(`${failed} area(s) unreachable from the spawn`);
  process.exit(1);
}
