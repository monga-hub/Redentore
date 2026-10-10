// Headless friar AI check (`npm run check`): hoeing spots sit on the orto beds and off the
// paths, aggro pulls the whole group, melee swings land on a cooldown, leash evades home at
// full health, death and respawn.
import { buildLevel } from '../src/level/index.ts';
import { World } from '../src/core/physics.ts';
import { PATHS_X, PATHS_Z } from '../src/level/zones/orto.ts';
import { FRIAR, GROUPS, hurt, spawnGroups, think, type Friar, type Target } from '../src/enemies/brain.ts';

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
