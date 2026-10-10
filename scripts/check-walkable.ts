// Headless layout check: `npm run check`.
// Flood-fills the level from the spawn with the same collision rules the player uses
// (step height, body radius), once per stage of the quest (quest/progress.ts): at the start
// the chiostro grande and the church must be locked and everything else (the key chest on the
// pontile included) reachable; the portone the boss's death opens must join the fondamenta to
// the nave; with every gate open every named area must be reachable.
import { buildLevel } from '../src/level/index.ts';
import { World, PLAYER } from '../src/core/physics.ts';
import { SPAWN } from '../src/level/plan.ts';
import { CHEST, Quest } from '../src/quest/progress.ts';

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
const quest = new Quest(world); // shut gates and the key chest, as at the start of a game
const STEP = 0.5, X0 = -62, X1 = 62, Z0 = -197, Z1 = 22;
const nx = Math.round((X1 - X0) / STEP), nz = Math.round((Z1 - Z0) / STEP);
const idx = (i: number, j: number) => j * nx + i;
const toI = (x: number) => Math.round((x - X0) / STEP), toJ = (z: number) => Math.round((z - Z0) / STEP);

/** Flood-fill from the spawn with the player's step and radius: feet height per reached cell, NaN elsewhere. */
function flood(): Float32Array {
  const feet = new Float32Array(nx * nz).fill(NaN);
  const queue: number[] = [];
  const si = toI(SPAWN.x), sj = toJ(SPAWN.z);
  feet[idx(si, sj)] = world.groundAt(SPAWN.x, SPAWN.z, 0);
  queue.push(idx(si, sj));
  while (queue.length) {
    const c = queue.pop()!;
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
  return feet;
}
const at = (feet: Float32Array, x: number, z: number) => !Number.isNaN(feet[idx(toI(x), toJ(z))]);
/** Reached cells inside the area's rectangle. */
function cells(feet: Float32Array, a: { x0: number; x1: number; z0: number; z1: number }): number {
  let hit = 0;
  for (let i = toI(a.x0); i <= toI(a.x1); i++) for (let j = toJ(a.z0); j <= toJ(a.z1); j++) {
    if (i >= 0 && j >= 0 && i < nx && j < nz && !Number.isNaN(feet[idx(i, j)])) hit++;
  }
  return hit;
}

let failed = 0;
const fail = (why: string) => { failed++; console.log(`FAIL ${why}`); };
const t0 = performance.now();

// Start of the game: the grates and both church doors are shut. Everything but the chiostro
// grande and the church is reachable, the chest with the key among it; those two are not.
const locked = (a: { zone: string; label: string }) => a.zone === 'chiesa' || a.label === 'Chiostro grande';
const start = flood();
const near = [[0, 0.8], [-0.8, 0], [0.8, 0], [0, -0.8]].some(([dx, dz]) => at(start, CHEST.x + dx * 1.2, CHEST.z + dz * 1.2));
if (!near) fail('quest      the key chest on the pontile is out of reach');
console.log('-- gates shut (start of the game)');
const seen = new Set<string>();
for (const a of level.areas) {
  const key = `${a.label}@${a.x0},${a.z0}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const hit = cells(start, a), shut = locked(a);
  if (shut ? hit > 0 : !hit) fail(`${a.zone.padEnd(11)} ${a.label}: ${hit} cells reached, want ${shut ? 'none (locked)' : 'some'}`);
  else console.log(`ok   ${a.zone.padEnd(11)} ${a.label} (${shut ? 'locked' : `${hit} cells`})`);
}

// The portone alone (what the boss's death opens) joins the fondamenta to the nave.
quest.win();
const portone = flood();
if (!at(portone, 0, -2)) fail('quest      the open portone does not lead from the fondamenta into the nave');

// Key taken, grates and the choir door opened too: the whole complex is walkable, and the
// church aisle runs from the portone to the foot of the high altar.
quest.takeKey();
for (const g of quest.gates) if (g.needs === 'key') quest.open(g);
const won = flood();
console.log('-- every gate open');
for (const [x, z] of [[0, -2], [0, -20], [0, -37], [0, -48.5]]) if (!at(won, x, z)) fail(`chiesa      aisle point (${x}, ${z}) unreachable`);
for (const a of level.areas) if (!cells(won, a)) fail(`${a.zone.padEnd(11)} ${a.label} unreachable`);
let reached = 0;
for (let n = 0; n < won.length; n++) if (!Number.isNaN(won[n])) reached++;
console.log(`${reached} walkable cells reached, ${world.boxes.length} colliders, ${(performance.now() - t0).toFixed(0)} ms`);
if (failed) {
  console.error(`${failed} walkability check(s) failed`);
  process.exit(1);
}
