// Ferry check (`npm run check`): Mastro Iseppo's gondola (quest/ferry.ts) docks clean at both landing stages. Moored at each
// berth, and at every step of every trip (out to San Giorgio, back to the Punta, home), the hull, its ferro and the oar's blade at
// both ends of the stroke clear every solid of the level standing out of the water (the stages' decks and their invisible edges,
// the shores) and the paline; each trip leaves a berth exactly as the gondola lay moored there and arrives exactly as it will
// lie, so nothing snaps or swings through a stage; it never turns faster than the gondolier can swing it; it lies across the
// stage's end within a step of the boarding spot; each trip sets the hero down on the stage, and takes the time the quest
// route's balance (scripts/balance.ts) counts for it.
import { buildLevel } from '../src/level/index.ts';
import { FERRY_A, FERRY_B, LANDING, PALINE, PIER } from '../src/level/zones/sangiorgio.ts';
import { BACK, HULL, OUT, footprint, type Route } from '../src/quest/ferry.ts';
import { BERTHS } from '../src/quest/progress.ts';

let failed = 0;
const fail = (why: string) => { failed++; console.error(`FAIL ${why}`); };

const { world } = buildLevel();
const WATER = -1.2, TOP = 1.2; // the hull's span in y, the ferro's top above the sheer
const solids = world.boxes.filter((b) => b.y1 > WATER + 0.05 && b.y0 < TOP);
const CLEAR = 0.1; // m kept from any solid
const PALINA = 0.13 + 0.1; // a palina's radius and the same clearance
const plan = footprint();

/** The first solid or palina the gondola touches lying at (x, z, yaw), described; '' if clear. */
function hit(x: number, z: number, yaw: number): string {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (const [px, pz] of plan) {
    const wx = x + px * c + pz * s, wz = z - px * s + pz * c; // three.js rotation about Y
    for (const b of solids) {
      const dx = wx - b.cx, dz = wz - b.cz;
      if (Math.abs(b.cos * dx - b.sin * dz) < b.hx + CLEAR && Math.abs(b.sin * dx + b.cos * dz) < b.hz + CLEAR) return `(${px.toFixed(2)}, ${pz.toFixed(2)}) of the hull at (${wx.toFixed(2)}, ${wz.toFixed(2)}) in the box at (${b.cx.toFixed(1)}, ${b.cz.toFixed(1)}) top ${b.y1}`;
    }
    for (const [qx, qz] of PALINE) if (Math.hypot(wx - qx, wz - qz) < PALINA) return `(${px.toFixed(2)}, ${pz.toFixed(2)}) of the hull on the palina at (${qx}, ${qz})`;
  }
  return '';
}

const near = (a: number, b: number, eps: number) => Math.abs(a - b) < eps;
const angle = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// Moored: across each stage's end, clear of it, within reach of the boarding spot.
for (const [name, at, stage, berth, tip] of [['Punta', FERRY_A, PIER, BERTHS.punta, PIER.x0], ['San Giorgio', FERRY_B, LANDING, BERTHS.sangiorgio, LANDING.x1]] as const) {
  const why = hit(at.x, at.z, at.yaw);
  if (why) fail(`moored at the ${name} berth: ${why}`);
  if (!near(Math.abs(Math.cos(at.yaw)), 0, 1e-6)) fail(`moored at the ${name} berth the hull is not across the stage's end (yaw ${at.yaw.toFixed(2)})`);
  if (at.z - HULL.half > stage.z0 - 1 || at.z + HULL.half < stage.z1 + 1) fail(`moored at the ${name} berth the hull does not span the stage's end`);
  const gap = Math.abs(at.x - tip) - Math.max(HULL.port, HULL.starboard);
  if (gap < 0.6 || gap > 1.2) fail(`moored at the ${name} berth the hull lies ${gap.toFixed(2)} m off the stage's end`);
  if (Math.hypot(berth.x - at.x, berth.z - at.z) > 3.2) fail(`the ${name} boarding spot is ${Math.hypot(berth.x - at.x, berth.z - at.z).toFixed(1)} m from the gondola`);
}

// The trips: each step clear, the ends as moored, the turns within the gondolier's swing, the time.
const ARRIVALS = { out: { x: -437.5, z: 100 }, back: { x: -413, z: 10 } };
for (const [name, r, from, to, ashore] of [['out', OUT, FERRY_A, FERRY_B, ARRIVALS.out], ['back', BACK, FERRY_B, FERRY_A, ARRIVALS.back]] as [string, Route, typeof FERRY_A, typeof FERRY_A, { x: number; z: number }][]) {
  const a = r.pose(0), b = r.pose(r.len);
  if (!near(a.x, from.x, 0.01) || !near(a.z, from.z, 0.01) || angle(a.yaw, from.yaw) > 0.01) fail(`${name}: leaves at (${a.x.toFixed(2)}, ${a.z.toFixed(2)}) yaw ${a.yaw.toFixed(3)}, not as moored`);
  if (!near(b.x, to.x, 0.01) || !near(b.z, to.z, 0.01) || angle(b.yaw, to.yaw) > 0.01) fail(`${name}: arrives at (${b.x.toFixed(2)}, ${b.z.toFixed(2)}) yaw ${b.yaw.toFixed(3)}, not as it will lie moored`);
  let first = '';
  for (let d = 0; d <= r.len; d += 0.1) {
    const p = r.pose(d), why = hit(p.x, p.z, p.yaw);
    if (why && !first) first = `${name}: ${d.toFixed(1)} m along, ${why}`;
  }
  if (first) fail(first);
  // Rowed as Ferry.update rows it, at 60 fps.
  let d = 0, t = 0, yaw = a.yaw, spin = 0;
  while (d < r.len && t < 60) {
    const dt = 1 / 60;
    d = Math.min(r.len, d + r.speed(d) * dt);
    t += dt;
    const y = r.pose(d).yaw;
    spin = Math.max(spin, angle(y, yaw) / dt);
    yaw = y;
  }
  if (spin > 1.3) fail(`${name}: the hull swings at ${spin.toFixed(2)} rad/s`);
  if (t < 9 || t > 20) fail(`${name}: the crossing takes ${t.toFixed(1)} s`);
  if (Math.abs(world.standHeight(ashore.x, ashore.z)) > 0.05) fail(`${name}: the hero is set down at (${ashore.x}, ${ashore.z}) off the stage`);
  console.log(`  ${name}: ${r.len.toFixed(0)} m in ${t.toFixed(1)} s, turning at most ${spin.toFixed(2)} rad/s`);
}

if (failed) { console.error(`check-ferry: ${failed} failure(s)`); process.exit(1); }
console.log('check-ferry: ok');
