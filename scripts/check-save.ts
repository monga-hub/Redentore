// Save system check (`npm run check`): a game serialized mid-quest and laid over a freshly
// booted world comes back the same (player, charge, key, open gates and their colliders, the
// dead staying dead, play time); slots and the reload handoff survive storage and refuse junk.
import { buildLevel } from '../src/level/index.ts';
import { SPAWN } from '../src/level/plan.ts';
import { Quest } from '../src/quest/progress.ts';
import { spawnGroups } from '../src/enemies/brain.ts';
import { deserialize, save, serialize, setPending, slots, takePending, type Game } from '../src/core/save.ts';

const fail = (why: string) => { throw new Error(why); };

function boot(): Game {
  const level = buildLevel();
  return {
    player: { pos: { x: SPAWN.x, y: 0, z: SPAWN.z }, facing: SPAWN.yaw },
    stats: { hp: 1280, mana: 400, hpMax: 1280, manaMax: 400 },
    kit: { charge: 0 },
    quest: new Quest(level.world),
    mobs: spawnGroups(level.world).flat(),
    time: 0,
  };
}

const a = boot();
Object.assign(a.player.pos, { x: -10, y: 0, z: -90 });
a.player.facing = 1.25;
a.stats.hp = 700; a.stats.mana = 123; a.kit.charge = 60;
a.quest.takeKey();
const grata = a.quest.gates.find((g) => g.id === 'grata-nord')!;
a.quest.open(grata);
a.mobs[2].state = 'dead'; a.mobs[2].hp = 0;
a.time = 754;

const s = JSON.parse(JSON.stringify(serialize(a)));
const b = boot();
deserialize(b, s);
if (b.player.pos.x !== -10 || b.player.pos.z !== -90 || b.player.facing !== 1.25) fail('player position not restored');
if (b.stats.hp !== 700 || b.stats.mana !== 123 || b.kit.charge !== 60) fail('player stats not restored');
if (!b.quest.key || !b.quest.chestOpen || b.quest.bossDead) fail('quest flags not restored');
const open = b.quest.gates.filter((g) => g.open).map((g) => g.id);
if (open.join() !== 'grata-nord') fail(`open gates ${open}`);
if (b.quest.gates.some((g) => g.open && b.quest['world'].boxes.includes(g.box))) fail('an opened gate still blocks');
if (b.mobs[2].state !== 'dead' || b.mobs.filter((m) => m.state === 'dead').length !== 1) fail('dead mobs not restored');
if (b.time !== 754) fail('play time not restored');

// The boss's fall carries the portone with it; a saved corpse player wakes alive.
const c = boot();
deserialize(c, { ...s, player: { ...s.player, hp: 0 }, quest: { ...s.quest, bossDead: true } });
if (!c.quest.gates.find((g) => g.id === 'portone')!.open) fail('boss dead but portone shut');
if (c.stats.hp <= 0) fail('loaded a dead player');

// Storage: three slots, empty ones undefined, junk refused; the pending handoff is taken once.
const mem = new Map<string, string>();
const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } as Storage;
if (!save(1, { label: 'Orti', savedAt: 1, state: s }, store)) fail('save failed');
mem.set('redentore.save.2', '{"label":"x","savedAt":1,"state":{"v":1}}');
const list = slots(store);
if (list.length !== 3 || list[0] || list[1]?.label !== 'Orti' || list[2]) fail('slots misread');
setPending(s, store);
if (!takePending(store) || takePending(store)) fail('pending state not taken exactly once');
console.log('save system ok');
