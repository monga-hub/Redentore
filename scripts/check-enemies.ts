// Headless friar AI check (`npm run check`): hoeing spots sit on the orto beds and off the
// paths, aggro pulls the whole group, melee swings land on a cooldown, leash evades home at
// full health, death and respawn. Then the same for the cloister priests, plus line of sight,
// spell cooldowns, magic bolts and backpedalling inside their cloister.
import { buildLevel } from '../src/level/index.ts';
import { World } from '../src/core/physics.ts';
import { PATHS_X, PATHS_Z } from '../src/level/zones/orto.ts';
import { FRIAR, GROUPS, hurt, spawnGroups, think, type Friar, type Target } from '../src/enemies/brain.ts';
import { PRIEST, cloisterPlan, fly, hurt as casterHurt, spawnPriests, think as casterThink, type Bolt, type Priest } from '../src/enemies/caster.ts';

const fail = (why: string) => { throw new Error(why); };

// Spots: inside the orti, on the earth between the beds (not up on one), clear of walls and paved paths.
{
  const level = buildLevel();
  const orti = level.areas.find((a) => a.label === 'Orti coltivati')!;
  for (const g of GROUPS) {
    if (g.length < 2 || g.length > 3) fail(`group of ${g.length} friars`);
    for (const [x, z] of g) {
      const at = `friar spot (${x}, ${z})`;
      if (x < orti.x0 || x > orti.x1 || z < orti.z0 || z > orti.z1) fail(`${at} outside the orti`);
      if (spawnGroups(level.world, [[[x, z, 0]]])[0][0].y !== 0) fail(`${at} up on a bed`);
      if (level.world.blocked(x, z, 0, FRIAR.radius)) fail(`${at} inside a wall`);
      if (PATHS_X.some((px) => x > px - 0.5 && x < px + 3.5) || PATHS_Z.some((pz) => z > pz - 0.5 && z < pz + 3.5)) fail(`${at} on a path`);
    }
  }
}

// Brain on an empty floor.
const world = new World();
world.add(0, 0, 100, 100, -1, 0);
const [a, b] = spawnGroups(world, [[[0, 0, 0], [3, 0, 0]]])[0];
const p: Target = { x: 0, y: 0, z: 30 };
let dealt = 0, swings = 0;
const run = (s: number, follow = false) => {
  for (let t = 0; t < s; t += 1 / 60) {
    for (const f of [a, b]) {
      const was = f.state;
      dealt += think(f, p, world, 1 / 60);
      if (f.state === 'swing' && was !== 'swing') swings++;
    }
    if (follow) { p.x = a.x; p.z = a.z + 1; } // stand in a's face
  }
};
const expect = (f: Friar, s: string, why: string) => { if (f.state !== s) fail(`${why}: state ${f.state}, want ${s}`); };

run(2);
expect(a, 'hoe', 'player far away');
if (dealt) fail('damage while hoeing');

p.z = FRIAR.aggro - 1;
run(0.1);
expect(a, 'chase', 'player in aggro range');
expect(b, 'chase', 'social aggro pulls the mate');

run(10, true);
if (!dealt) fail('no melee hit landed');
if (dealt % FRIAR.damage) fail(`odd damage total ${dealt}`);
const maxSwings = 2 * Math.ceil(10 / FRIAR.cooldown) + 2;
if (swings > maxSwings) fail(`${swings} swings in 10 s ignores the cooldown`);

hurt(a, 10);
p.x = 0; p.z = FRIAR.leash + 20; // run off
run(30);
expect(a, 'hoe', 'leashed friar back at home');
if (a.hp !== FRIAR.hp) fail('evade did not heal');
if (Math.hypot(a.x - a.home.x, a.z - a.home.z) > 0.1) fail('evade stopped short of home');

if (!hurt(b, FRIAR.hp)) fail('lethal hit did not kill');
expect(b, 'dead', 'killed');
if (hurt(b, 5)) fail('killed twice');
run(FRIAR.respawn + 1);
expect(b, 'hoe', 'respawned');
if (b.hp !== FRIAR.hp) fail('respawn at full health');
console.log(`enemies ok (${dealt} damage over ${swings} swings)`);

// ---------------------------------------------------------------- priests (caster.ts)
// Cloister spawns: groups of three scaled by court size, clear standing spots inside the court.
{
  const level = buildLevel();
  const plan = cloisterPlan(level.world, level.areas);
  const want: Record<string, number> = { 'Chiostrino': 1, 'Chiostro ovest': 1, 'Chiostro mediano': 2, 'Chiostro grande': 3 };
  if (plan.length !== Object.keys(want).length) fail(`${plan.length} cloisters found`);
  for (const { area, groups } of plan) {
    if (groups.length !== want[area.label]) fail(`${area.label}: ${groups.length} priest groups, want ${want[area.label]}`);
    for (const g of groups) {
      if (g.length !== 3) fail(`${area.label}: group of ${g.length} priests`);
      for (const [x, z] of g) {
        const at = `priest spot (${x.toFixed(1)}, ${z.toFixed(1)}) in ${area.label}`;
        if (x < area.x0 + 3 || x > area.x1 - 3 || z < area.z0 + 3 || z > area.z1 - 3) fail(`${at} outside the court`);
        if (level.world.blocked(x, z, 0, PRIEST.radius)) fail(`${at} inside a wall`);
      }
    }
  }
}

{
  const fl = new World();
  fl.add(0, 0, 100, 100, -1, 0);
  fl.add(0, -30, 10, 0.5, 0, 6); // a wall 30 m north, for line of sight
  const box = { x0: -10, x1: 10, z0: -10, z1: 10 };
  const [c, d, e] = spawnPriests(fl, [[[0, 0, 0], [2, 0, 0], [-2, 0, 0]]], [box])[0];
  const pl: Target = { x: 0, y: 0, z: -40 }; // behind the wall
  const bolts: Bolt[] = [];
  let magic = 0, casts = 0, out = false;
  const tick = (s: number, each?: () => void) => {
    for (let t = 0; t < s; t += 1 / 60) {
      for (const f of [c, d, e]) {
        const n = bolts.length;
        casterThink(f, pl, fl, 1 / 60, bolts);
        casts += bolts.length - n;
        const b = f.bounds, m = PRIEST.margin - 1e-6;
        if (f.x < b.x0 + m || f.x > b.x1 - m || f.z < b.z0 + m || f.z > b.z1 - m) out = true;
      }
      magic += fly(bolts, pl, 1 / 60);
      each?.();
    }
  };
  const want = (f: Priest, s: string, why: string) => { if (f.state !== s) fail(`priest ${why}: state ${f.state}, want ${s}`); };

  // A priest just south of the wall ignores a player just north of it.
  const hidden = spawnPriests(fl, [[[0, -26, 0]]], [{ x0: -10, x1: 10, z0: -29, z1: -20 }])[0][0];
  for (let t = 0; t < 1; t += 1 / 60) casterThink(hidden, { x: 0, y: 0, z: -26 - 8 }, fl, 1 / 60, []);
  want(hidden, 'pray', 'through a wall');

  tick(1);
  want(c, 'pray', 'player far away');
  if (magic) fail('magic damage while praying');
  pl.z = -(PRIEST.aggro - 1); // in sight and range
  tick(0.5);
  const pulled = (f: Priest, why: string) => { if (f.state !== 'chase' && f.state !== 'cast') fail(`priest ${why}: still ${f.state}`); };
  pulled(c, 'player in sight and range');
  pulled(e, 'social aggro pulls the group');

  tick(12);
  if (!casts) fail('no spell cast');
  if (!magic) fail('no bolt landed');
  if (magic % PRIEST.damage) fail(`odd magic damage ${magic}`);
  const maxCasts = 3 * Math.ceil(12 / (PRIEST.cast + PRIEST.cooldown)) + 3;
  if (casts > maxCasts) fail(`${casts} casts in 12 s ignores the cast time and cooldown`);

  // Kiting: the player rushes in and stays on top of c; c backpedals inside its cloister.
  const before = Math.hypot(c.x - pl.x, c.z - pl.z);
  pl.x = c.x; pl.z = c.z - 2;
  const start = { x: c.x, z: c.z };
  let backed = false;
  tick(3.5, () => { if (c.move === -1) backed = true; }); // a cast in progress finishes first
  if (!backed || Math.hypot(c.x - start.x, c.z - start.z) < 1) fail(`priest did not back away (was ${before.toFixed(1)} m off)`);
  tick(15, () => { pl.x = c.x; pl.z = c.z - 2; }); // chased into a corner: keeps casting, never leaves
  if (out) fail('priest left its cloister');

  casterHurt(d, 10);
  pl.x = 0; pl.z = PRIEST.leash + 30; // run off
  tick(30);
  want(d, 'pray', 'leashed priest back at home');
  if (d.hp !== PRIEST.hp) fail('priest evade did not heal');
  if (bolts.length) fail('bolts still flying after 30 s');

  if (!casterHurt(e, PRIEST.hp)) fail('lethal hit did not kill the priest');
  want(e, 'dead', 'killed');
  tick(PRIEST.respawn + 1);
  want(e, 'pray', 'respawned');
  console.log(`priests ok (${magic} magic damage over ${casts} casts)`);
}
