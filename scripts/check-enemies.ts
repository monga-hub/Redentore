// Headless friar AI check (`npm run check`): hoeing spots sit on the orto beds and off the
// paths, aggro pulls the whole group, melee swings land on a cooldown, leash evades home at
// full health, death for good (no respawn). Then the same for the cloister priests, plus line of sight,
// spell cooldowns, magic bolts and backpedalling inside their cloister; a sacerdote and two
// priests in each lagoon garden. Then the church: two sacerdoti with two priests each and the Reverendissimo, magic plus melee, the boss's nova,
// and everyone dropping dead for good when the boss falls.
import { buildLevel } from '../src/level/index.ts';
import { World } from '../src/core/physics.ts';
import { PATHS_X, PATHS_Z } from '../src/level/zones/orto.ts';
import { CHOIR_DOOR } from '../src/quest/progress.ts';
import { FRIAR, GROUPS, hurt, spawnGroups, think, type Friar, type Target } from '../src/enemies/brain.ts';
import { PRIEST, REVERENDISSIMO, SACERDOTE, cloisterPlan, fly, gardenPlan, GARDENS, hurt as casterHurt, killAll, spawnChurch, wipe, spawnPriests, think as casterThink, type Bolt, type Priest } from '../src/enemies/caster.ts';

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
run(600);
expect(b, 'dead', 'still dead 10 minutes later (no respawn)');
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

// Lagoon gardens: one sacerdote and two priests standing clear in each garden.
{
  const level = buildLevel();
  const plan = gardenPlan(level.world, level.areas);
  if (plan.length !== GARDENS.length || plan.some((g) => !g.area)) fail('a lagoon garden is missing from the level');
  for (const { area, group } of plan) {
    if (area.zone !== 'giardini') fail(`${area.label}: not in the giardini zone`);
    if (group.length !== 3) fail(`${area.label}: group of ${group.length}`);
    for (const [x, z] of group) {
      const at = `garden spot (${x.toFixed(1)}, ${z.toFixed(1)}) in ${area.label}`;
      if (x < area.x0 + 3 || x > area.x1 - 3 || z < area.z0 + 3 || z > area.z1 - 3) fail(`${at} outside the garden`);
      if (level.world.blocked(x, z, 0, SACERDOTE.radius)) fail(`${at} inside a wall or hedge`);
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
  tick(600);
  want(e, 'dead', 'still dead 10 minutes later (no respawn)');
  console.log(`priests ok (${magic} magic damage over ${casts} casts)`);
}

// ---------------------------------------------------------------- the church (sacerdoti, boss)
{
  const level = buildLevel();
  const { all, boss } = spawnChurch(level.world);
  const count = (k: unknown) => all.filter((f) => f.kind === k).length;
  if (count(SACERDOTE) !== 2 || count(PRIEST) !== 4 || count(REVERENDISSIMO) !== 1 || boss.kind !== REVERENDISSIMO) fail('church: want 2 sacerdoti, 4 priests and the boss');
  for (const g of new Set(all.map((f) => f.mates))) {
    if (g.length !== 1 && (g.length !== 3 || g.filter((f) => f.kind === SACERDOTE).length !== 1)) fail('church: a sacerdote leads two priests');
  }
  for (const f of all) {
    const at = `church spot (${f.x}, ${f.z})`;
    if (f.y < 2.3) fail(`${at} not on the church floor (y ${f.y})`);
    if (level.world.blocked(f.x, f.z, f.y, f.kind.radius)) fail(`${at} inside a wall`);
  }
  if (Math.hypot(boss.x, boss.z + 37) > 0.1) fail('the boss is not under the dome');
  if (SACERDOTE.hp <= PRIEST.hp || REVERENDISSIMO.hp <= SACERDOTE.hp) fail('hp should rise priest < sacerdote < boss');

  // The player kites the boss round the church: into the pews, an apse, round the high
  // altar. It keeps to the crossing and the presbytery steps (BOSS_BOUNDS) and fights on from
  // their edge. It used to walk straight at the player, wedge on a pew end, the steps or between
  // two columns, out of sight, and evade at full health after REVERENDISSIMO.blind s: the
  // mid-fight reset. (Out of its sight, in the choir or a side chapel, it still leashes after
  // REVERENDISSIMO.blind s, as if the player had left the church.)
  for (const f of all) if (f !== boss) f.state = 'dead';
  const bolts: Bolt[] = [];
  const pl: Target = { x: 0, y: 0, z: 0 };
  let magic = 0;
  for (const [x, z, y] of [[0, -14, 0], [6.4, -20, 0], [3.6, -22, 1], [10.5, -37, 0], [-6.2, -36, 0], [5, -51, 0.6]]) {
    pl.x = x; pl.z = z; pl.y = 2.4 + y; // nave aisle, side aisle, up on a pew, an apse, crossing, by the high altar
    Object.assign(boss, { x: boss.home.x, y: 2.4, z: boss.home.z, hp: REVERENDISSIMO.hp - 100, state: 'chase', blind: 0, cd: 0 }); // pulled under the dome
    const hp = boss.hp;
    for (let t = 0; t < REVERENDISSIMO.blind + 10; t += 1 / 60) {
      casterThink(boss, pl, level.world, 1 / 60, bolts);
      magic += fly(bolts, pl, 1 / 60);
    }
    if (boss.state === 'evade' || boss.state === 'pray' || boss.hp !== hp) fail(`boss: reset (${boss.state}, ${boss.hp} hp) with the player at (${x}, ${z})`);
    if (level.world.blocked(boss.x, boss.z, boss.y, boss.kind.radius)) fail('boss: inside a wall');
  }
  if (!magic) fail('boss: no bolt reached the kiting player');

  // A death wakes the player at the choir door: no cloister priest below can pull them there.
  const door = { ...CHOIR_DOOR, y: level.world.standHeight(CHOIR_DOOR.x, CHOIR_DOOR.z) };
  for (const f of spawnPriests(level.world, cloisterPlan(level.world, level.areas).flatMap((c) => c.groups), []).flat()) {
    if (Math.hypot(f.x - door.x, f.z - door.z) < f.kind.aggro && Math.abs(f.y - door.y) < 2.5) fail(`checkpoint: in reach of the priest at (${f.x}, ${f.z})`);
  }

  // The player dies: a wipe sends the boss home at full health, and only then.
  wipe([boss]);
  for (let t = 0; t < 30; t += 1 / 60) casterThink(boss, { x: 0, y: 0, z: 15 }, level.world, 1 / 60, bolts);
  if (boss.state !== 'pray' || boss.hp !== REVERENDISSIMO.hp || Math.hypot(boss.x - boss.home.x, boss.z - boss.home.z) > 0.1) fail(`boss: wipe left it ${boss.state} at ${boss.hp} hp`);
}

{
  const fl = new World();
  fl.add(0, 0, 100, 100, -1, 0);
  const box = { x0: -40, x1: 40, z0: -40, z1: 40 };
  const [sac] = spawnPriests(fl, [[[0, 0, 0]]], [box], [[SACERDOTE]])[0];
  const pl: Target = { x: 0, y: 0, z: -12 };
  const bolts: Bolt[] = [];
  let melee = 0, magic = 0;
  const tick = (f: Priest, s: number, each?: () => void) => {
    for (let t = 0; t < s; t += 1 / 60) {
      melee += casterThink(f, pl, fl, 1 / 60, bolts);
      magic += fly(bolts, pl, 1 / 60);
      each?.();
    }
  };
  tick(sac, 4); // in sight at range: it casts
  if (!magic) fail('sacerdote: no bolt landed at range');
  if (magic % SACERDOTE.damage) fail(`sacerdote: odd magic damage ${magic}`);
  tick(sac, 8, () => { pl.x = sac.x; pl.z = sac.z - 1.5; }); // toe to toe
  if (!melee) fail('sacerdote: no melee hit landed up close');
  if (melee % SACERDOTE.melee!.damage) fail(`sacerdote: odd melee damage ${melee}`);

  const [boss] = spawnPriests(fl, [[[20, 20, 0]]], [box], [[REVERENDISSIMO]])[0];
  const n = REVERENDISSIMO.nova!;
  pl.x = 20; pl.z = 17;
  let novas = 0, was = boss.state;
  melee = 0;
  tick(boss, n.every + n.cast + 2, () => { if (boss.state === 'nova' && was !== 'nova') novas++; was = boss.state; });
  if (!novas) fail('boss: no nova in melee range');
  if (melee < n.damage) fail(`boss: the nova did not land (${melee} melee damage)`);

  // The boss falls: everyone dies and stays dead.
  const crowd = [sac, ...spawnGroups(fl, [[[5, 5, 0]]])[0]];
  casterHurt(boss, boss.hp);
  if (boss.state !== 'dead') fail('boss: lethal hit did not kill');
  killAll(crowd);
  for (let t = 0; t < 600; t += 0.5) { casterThink(sac, pl, fl, 0.5, bolts); think(crowd[1] as Friar, pl, fl, 0.5); }
  if (crowd.some((f) => f.state !== 'dead')) fail('killAll: someone got up again');
  console.log(`church ok (sacerdote ${magic} magic + melee, boss nova ${n.damage})`);
}
