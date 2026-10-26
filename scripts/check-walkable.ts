// Headless layout check: `npm run check`.
// Flood-fills the level from the spawn with the same collision rules the player uses
// (step height, body radius), once per stage of the quest (quest/progress.ts): at the start
// the chiostro grande and the church must be locked and everything else (the key chest on the
// pontile included) reachable; the portone the boss's death opens must join the fondamenta to
// the nave; with every gate open every named area must be reachable. Level 2: the chains on the Ponte
// de la Croce keep the Giudecca east of the Redentore and the Zitelle shut until Fra' Zuane's second quest is
// taken; then everything there but the Zitelle's church is open, the key of the church opens it from the
// court, and the Governatrice's death opens its portone on the sagrato. Level 3: the chain past the Tre Oci keeps the
// Punta shut until the third quest is taken; San Giorgio is reached only by Mastro Iseppo's gondola (a link between the
// two berths, quest/ferry.ts); its Cenacolo opens with the Bibliotecario's key, its garden door with the Abate's death. The
// campanile's bell chamber is reached only by its stair (a link between the door at its foot and the floor up top, quest/progress.ts
// climb), and walled in: nobody walks off it.
import { buildLevel } from '../src/level/index.ts';
import { World, PLAYER } from '../src/core/physics.ts';
import { SPAWN } from '../src/level/plan.ts';
import { ANDITO, ANTIREF, APPRODO, BERTHS, CHEST, CHOIR_DOOR, CROCE, PUNTA, Quest, SPEZIALE } from '../src/quest/progress.ts';
import { BELFRY, BELLS, CAMPANILE, CENACOLO, SG } from '../src/level/zones/sangiorgio.ts';
import { ZCX, ZF } from '../src/level/zones/zitelle.ts';
import { PROCESSION } from '../src/quest/squero.ts';
import { PACKS as PACKS3 } from '../src/enemies/sangiorgio.ts';

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
const STEP = 0.5, X0 = -602, X1 = 66, Z0 = -197, Z1 = 152;
const nx = Math.round((X1 - X0) / STEP), nz = Math.round((Z1 - Z0) / STEP);
const idx = (i: number, j: number) => j * nx + i;
const toI = (x: number) => Math.round((x - X0) / STEP), toJ = (z: number) => Math.round((z - Z0) / STEP);

/**
 * Flood-fill from `from` (the spawn) with the player's step and radius: feet height per reached cell, NaN elsewhere. Once the
 * third quest is taken the gondola joins its two berths and the campanile's stair its door and its top: either end reached, the
 * fill goes on from the other.
 */
function flood(from: { x: number; z: number } = SPAWN, links = true): Float32Array {
  const feet = new Float32Array(nx * nz).fill(NaN);
  const queue: number[] = [];
  const seed = (x: number, z: number) => {
    const c = idx(toI(x), toJ(z));
    if (!Number.isNaN(feet[c])) return false;
    feet[c] = world.standHeight(x, z);
    queue.push(c);
    return true;
  };
  seed(from.x, from.z);
  const pairs = [[BERTHS.punta, BERTHS.sangiorgio], [CAMPANILE.door, CAMPANILE.top]];
  for (;;) {
    fill(feet, queue);
    if (!quest.accepted3 || !links) break;
    let more = false;
    for (const [a, b] of pairs) more = (at(feet, a.x, a.z) && seed(b.x, b.z)) || (at(feet, b.x, b.z) && seed(a.x, a.z)) || more;
    if (!more) break;
  }
  return feet;
}
function fill(feet: Float32Array, queue: number[]): void {
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
const level3 = (a: { zone: string }) => a.zone === 'punta' || a.zone === 'sangiorgio';
const zChurch = (a: { label: string }) => /^Le Zitelle:|^Altar maggiore delle Zitelle/.test(a.label);
const locked = (a: { zone: string; label: string }) => a.zone === 'chiesa' || a.label === 'Chiostro grande' || level2(a) || level3(a);
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
  if (level3(a) && cells(road, a)) fail(`${a.zone.padEnd(11)} ${a.label} reachable before the third quest`);
  if (!level2(a)) continue;
  const hit = cells(road, a), shut = zChurch(a);
  if (shut ? hit > 0 : !hit) fail(`${a.zone.padEnd(11)} ${a.label}: ${hit} cells reached, want ${shut ? 'none (locked)' : 'some'}`);
  else console.log(`ok   ${a.zone.padEnd(11)} ${a.label} (${shut ? 'locked' : `${hit} cells`})`);
}
if (quest.checkpoint() !== CROCE || !at(road, CROCE.x, CROCE.z)) fail('quest      past the chains a death should wake at the foot of the Ponte de la Croce, on open ground');
// Level 2 runs east, -X (level/plan.ts): nothing walkable past its quay's end or south of the Zitelle's orto, nor past the fondamenta's +X end.
let east = Infinity, south = Infinity, west = -Infinity;
for (let n = 0; n < road.length; n++) if (!Number.isNaN(road[n])) { const i = n % nx, j = (n - i) / nx, x = X0 + i * STEP; west = Math.max(west, x); if (x < -60) { east = Math.min(east, x); south = Math.min(south, Z0 + j * STEP); } }
if (east < -302 || south < -104.5 || west > 60.5) { // the chain past the Tre Oci stands at -302
  fail(`level 2 leaks: walkable as far as x ${east}..${west}, z ${south}`);
  for (let n = 0; n < road.length; n += 1) if (!Number.isNaN(road[n])) { const i = n % nx, j = (n - i) / nx, x = X0 + i * STEP, z = Z0 + j * STEP; if ((x < -302 || x > 60.5 || (x < -60 && z < -104.5)) && (i + j) % 40 === 0) console.log('  leak at', x, z); }
}
quest.takeKey2();
quest.open(quest.gate('coro-zitelle'));
const nave = flood();
if (quest.checkpoint() !== ANDITO || !at(nave, ANDITO.x, ANDITO.z)) fail('quest      with the Zitelle\'s back door open a death should wake in the andito, on open ground');
for (const [x, z] of [[ZCX, -22], [ZCX, -10], [ZCX, -2]]) if (!at(nave, x, z)) fail(`zitelle     hall point (${x}, ${z}) unreachable through the back door`);
quest.win2();
const won2 = flood();
if (!at(won2, ZCX, 1.5) || Math.abs(won2[idx(toI(ZCX), toJ(-2))] - ZF) > 0.05) fail('quest      the open portone of the Zitelle does not join the sagrato to the hall');

// Level 3: the third quest taken, the chain past the Tre Oci falls; the gondola crosses; the Cenacolo stays shut until its key.
quest.reported2 = true;
quest.accept3();
const isle = flood();
console.log('-- level 3: the chain past the Tre Oci fallen, the gondola running');
const cenacolo = (a: { label: string }) => a.label === 'Cenacolo palladiano';
for (const a of level.areas) {
  if (!level3(a)) continue;
  const hit = cells(isle, a), shut = cenacolo(a);
  if (shut ? hit > 0 : !hit) fail(`${a.zone.padEnd(11)} ${a.label}: ${hit} cells reached, want ${shut ? 'none (locked)' : 'some'}`);
  else console.log(`ok   ${a.zone.padEnd(11)} ${a.label} (${shut ? 'locked' : `${hit} cells`})`);
}
for (const [name, b] of Object.entries(BERTHS)) if (!at(isle, b.x, b.z)) fail(`quest      the gondola's ${name} berth is out of reach`);
// L'incoronazione: the hero can walk at the Cardinale's side the whole way (past the altar where he stands), and reach every monaco of its waves.
{
  const walk = PROCESSION.slice(1), waves = PACKS3.filter((p) => p.hidden?.quest === 'incoronazione').flatMap((p) => p.members.map(([, x, z]) => ({ x, z })));
  const off = [...walk, ...waves].filter((p) => !at(isle, p.x, p.z));
  if (off.length || waves.length !== 11) fail(`sangiorgio  the procession is out of the hero's reach at ${off.map((p) => `(${p.x}, ${p.z})`).join(' ')}`);
  else console.log(`ok   sangiorgio  la processione: ${walk.length} points from the altar to the Bacino, ${waves.length} monaci of its waves`);
}
if (quest.checkpoint() !== PUNTA || !at(isle, PUNTA.x, PUNTA.z)) fail('quest      past the chain a death should wake on the Punta, on open ground');
quest.landed = true;
if (quest.checkpoint() !== APPRODO || !at(isle, APPRODO.x, APPRODO.z)) fail("quest      once ashore a death should wake on San Giorgio's approdo, on open ground");
// Nothing walkable past the island or the Punta: the water all round, the darsena's basin.
let leaks = 0;
for (let n = 0; n < isle.length; n++) if (!Number.isNaN(isle[n])) {
  const i = n % nx, j = (n - i) / nx, x = X0 + i * STEP, z = Z0 + j * STEP;
  const sg = x <= SG.x1 + 11.5 && x >= SG.x0 && z >= SG.z0 && z <= 150.5, punta = x > -417.5 && x < -60 && z <= 20.5 && z >= -40;
  if (x < -300 && !sg && !punta && leaks++ < 5) console.log('  level 3 leak at', x, z);
}
if (leaks) fail(`level 3 leaks: ${leaks} cells walkable off the island and the Punta`);
// The bell chamber on its own, from where the stair lands: all of it at the chamber's floor and inside the shaft's top, under every
// bell and by the hatch, and nothing off it (a gap in the parapet would drop the fill 44 m onto the campo).
{
  const top = flood(CAMPANILE.top, false), { x0, x1, z0, z1, y } = BELFRY;
  let n = 0, off = 0;
  for (let c = 0; c < top.length; c++) if (!Number.isNaN(top[c])) {
    const i = c % nx, j = (c - i) / nx, x = X0 + i * STEP, z = Z0 + j * STEP;
    n++;
    if (x < x0 || x > x1 || z < z0 || z > z1 || Math.abs(top[c] - y) > 0.05) { if (off++ < 5) console.log('  off the bell chamber at', x, z, top[c]); }
  }
  if (off) fail(`sangiorgio  the bell chamber leaks: ${off} cells off its floor`);
  for (const { at: b, label } of [...BELLS, { at: CAMPANILE.hatch, label: 'the hatch' }]) if (!at(top, b.x, b.z)) fail(`sangiorgio  no floor under ${label} in the bell chamber`);
  if (n < 120) fail(`sangiorgio  the bell chamber has only ${n} cells of floor`);
  else console.log(`ok   sangiorgio  Cella campanaria: ${n} cells at ${y} m, walled in`);
}
quest.takeKey3();
quest.open(quest.gate('cenacolo'));
const hall = flood();
if (quest.checkpoint() !== ANTIREF || !at(hall, ANTIREF.x, ANTIREF.z)) fail('quest      with the Cenacolo open a death should wake in the antirefettorio, on open ground');
for (const z of [30, 20, 10]) if (!at(hall, (CENACOLO.x0 + CENACOLO.x1) / 2, z)) fail(`sangiorgio  Cenacolo point z ${z} unreachable through its door`);
quest.win3();

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
