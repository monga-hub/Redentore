// Headless layout check: `npm run check`.
// Flood-fills the level from the spawn with the same collision rules the player uses
// (step height, body radius), once per stage of the quest (quest/progress.ts): at the start
// the chiostro grande and the church must be locked and everything else (the key chest on the
// pontile included) reachable; the portone the boss's death opens must join the fondamenta to
// the nave; with every gate open every named area must be reachable. Level 2: the chains on the Ponte
// de la Croce keep the Giudecca east of the Redentore and the Zitelle shut until Fra' Zuane's second quest is
// taken; then everything there but the Zitelle's church is open, the key of the church opens it from the
// court, and the Governatrice's death opens its portone on the sagrato.
import { buildLevel } from '../src/level/index.ts';
import { World, PLAYER } from '../src/core/physics.ts';
import { SPAWN } from '../src/level/plan.ts';
import { ANDITO, CHEST, CHOIR_DOOR, CROCE, Quest, SPEZIALE } from '../src/quest/progress.ts';
import { ZCX, ZF } from '../src/level/zones/zitelle.ts';

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
const STEP = 0.5, X0 = -62, X1 = 302, Z0 = -197, Z1 = 22;
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
const level2 = (a: { zone: string }) => a.zone === 'giudecca' || a.zone === 'zitelle';
const zChurch = (a: { label: string }) => /^Le Zitelle:|^Altar maggiore delle Zitelle/.test(a.label);
const locked = (a: { zone: string; label: string }) => a.zone === 'chiesa' || a.label === 'Chiostro grande' || level2(a);
const start = flood();
const near = [[0, 0.8], [-0.8, 0], [0.8, 0], [0, -0.8]].some(([dx, dz]) => at(start, CHEST.x + dx * 1.2, CHEST.z + dz * 1.2));
if (!near) fail('quest      the key chest on the pontile is out of reach');
if (![[0, -1.2], [0.8, -1], [-0.8, -1]].some(([dx, dz]) => at(start, SPEZIALE.x + dx, SPEZIALE.z + dz))) fail("serra      no room to talk to Fra' Bortolo");
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

if (quest.checkpoint() !== SPAWN) fail('quest      a death before the choir door is open should wake on the fondamenta');

// The portone alone (what the boss's death opens) joins the fondamenta to the nave.
quest.win();
const portone = flood();
if (!at(portone, 0, -2)) fail('quest      the open portone does not lead from the fondamenta into the nave');

// Key taken, grates and the choir door opened too: the whole complex is walkable, and the
// church aisle runs from the portone to the foot of the high altar.
quest.takeKey();
for (const g of quest.gates) if (g.needs === 'key') quest.open(g);
const done1 = flood(), choirWake = quest.checkpoint();
for (const a of level.areas) if (level2(a) && cells(done1, a)) fail(`${a.zone.padEnd(11)} ${a.label} reachable before the second quest`);

// Level 2: the second quest taken, the chains fall; the Zitelle's church stays shut until its key opens the back door.
quest.out = true;
quest.accept2();
const road = flood();
console.log('-- level 2: the chains on the Ponte de la Croce fallen');
for (const a of level.areas) {
  if (!level2(a)) continue;
  const hit = cells(road, a), shut = zChurch(a);
  if (shut ? hit > 0 : !hit) fail(`${a.zone.padEnd(11)} ${a.label}: ${hit} cells reached, want ${shut ? 'none (locked)' : 'some'}`);
  else console.log(`ok   ${a.zone.padEnd(11)} ${a.label} (${shut ? 'locked' : `${hit} cells`})`);
}
if (quest.checkpoint() !== CROCE || !at(road, CROCE.x, CROCE.z)) fail('quest      past the chains a death should wake at the foot of the Ponte de la Croce, on open ground');
let east = -Infinity, south = Infinity;
for (let n = 0; n < road.length; n++) if (!Number.isNaN(road[n])) { const i = n % nx, j = (n - i) / nx; if (X0 + i * STEP > 60) { east = Math.max(east, X0 + i * STEP); south = Math.min(south, Z0 + j * STEP); } }
if (east > 300.5 || south < -104.5) {
  fail(`level 2 leaks: walkable as far as x ${east}, z ${south}`);
  for (let n = 0; n < road.length; n += 1) if (!Number.isNaN(road[n])) { const i = n % nx, j = (n - i) / nx, x = X0 + i * STEP, z = Z0 + j * STEP; if (x > 60 && (x > 300.5 || z < -104.5) && (i + j) % 40 === 0) console.log('  leak at', x, z); }
}
quest.takeKey2();
quest.open(quest.gate('coro-zitelle'));
const nave = flood();
if (quest.checkpoint() !== ANDITO || !at(nave, ANDITO.x, ANDITO.z)) fail('quest      with the Zitelle\'s back door open a death should wake in the andito, on open ground');
for (const [x, z] of [[ZCX, -22], [ZCX, -10], [ZCX, -2]]) if (!at(nave, x, z)) fail(`zitelle     hall point (${x}, ${z}) unreachable through the back door`);
quest.win2();
const won2 = flood();
if (!at(won2, ZCX, 1.5) || Math.abs(won2[idx(toI(ZCX), toJ(-2))] - ZF) > 0.05) fail('quest      the open portone of the Zitelle does not join the sagrato to the hall');

const won = flood();
console.log('-- every gate open');
for (const [x, z] of [[0, -2], [0, -20], [0, -37], [0, -48.5]]) if (!at(won, x, z)) fail(`chiesa      aisle point (${x}, ${z}) unreachable`);
if (choirWake !== CHOIR_DOOR) fail('quest      with the choir door open a death should wake at the choir door');
if (!at(won, CHOIR_DOOR.x, CHOIR_DOOR.z) || world.blocked(CHOIR_DOOR.x, CHOIR_DOOR.z, world.standHeight(CHOIR_DOOR.x, CHOIR_DOOR.z))) fail('quest      the choir-door checkpoint is not open ground');
for (const a of level.areas) if (!cells(won, a)) fail(`${a.zone.padEnd(11)} ${a.label} unreachable`);
let reached = 0;
for (let n = 0; n < won.length; n++) if (!Number.isNaN(won[n])) reached++;
console.log(`${reached} walkable cells reached, ${world.boxes.length} colliders, ${(performance.now() - t0).toFixed(0)} ms`);
if (failed) {
  console.error(`${failed} walkability check(s) failed`);
  process.exit(1);
}
