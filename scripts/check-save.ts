// Save system check (`npm run check`): a game serialized mid-quest and laid over a freshly
// booted world comes back the same (player, charge, Fra' Zuane's quest stage, key, open gates and their colliders, the
// dead staying dead, play time, the explored map, level-up picks and XP, the bag, the gear worn and the Vigore it adds); slots, the reload handoff and the autosave survive storage and refuse junk.
import { buildLevel } from '../src/level/index.ts';
import { SPAWN } from '../src/level/plan.ts';
import { QUESTS, Quest } from '../src/quest/progress.ts';
import { spawnGroups } from '../src/enemies/brain.ts';
import { autosave, clearAutosave, deserialize, questXpIn, resume, valid, save, serialize, setPending, slots, takePending, type Game } from '../src/core/save.ts';
import { Discovery } from '../src/core/discovery.ts';
import { PlayerStats } from '../src/player/stats.ts';
import { tuneOf } from '../src/player/levels.ts';
import { Bag } from '../src/loot/bag.ts';
import { Equipment, STARTER, effects } from '../src/loot/gear.ts';

const fail = (why: string) => { throw new Error(why); };

function boot(): Game {
  const level = buildLevel(), stats = new PlayerStats(), gear = new Equipment();
  const g: Game = {
    player: { pos: { x: SPAWN.x, y: 0, z: SPAWN.z }, facing: SPAWN.yaw },
    stats,
    kit: { charge: 0 },
    levels: { xp: 0, picks: [], apply() { const t = tuneOf(this.picks), w = effects(gear.totals); stats.grow(t.hp, t.mana, w.hp, w.mana); } }, // main.ts lays the rest on the kit
    quest: new Quest(level.world),
    mobs: spawnGroups(level.world).flat(),
    time: 0,
    fog: new Discovery(level.areas),
    bag: new Bag(),
    gear,
  };
  gear.onChange = () => g.levels.apply(); // as main.ts
  return g;
}
const fogOf = (g: Game) => g.fog as Discovery;

const a = boot();
Object.assign(a.player.pos, { x: -10, y: 0, z: -90 });
a.player.facing = 1.25;
a.stats.hp = 700; a.stats.mana = 123; a.kit.charge = 60;
a.quest.accepted = true;
a.quest.takeKey();
const grata = a.quest.gates.find((g) => g.id === 'grata-nord')!;
a.quest.open(grata);
a.mobs[2].state = 'dead'; a.mobs[2].hp = 0;
a.time = 754;
a.bag.gold = 321;
a.bag.add('rosario-bosso', 3);
a.bag.add('chiodo');
a.bag.add('saio-voto');
a.gear.wear(a.bag, a.bag.items.length - 1); // the hemp robe goes into the bag
a.gear.takeOff(a.bag, 'testa');
a.stats.hp = 700; a.stats.mana = 123; // after the gear: a raise of the max fills in
// Fog: the spawn's surroundings are seen, the far north is not; standing still reveals nothing new.
const fa = fogOf(a);
if (!fa.reveal(SPAWN.x, SPAWN.z) || fa.reveal(SPAWN.x, SPAWN.z)) fail('reveal at spawn');
fa.reveal(-10, -90);
if (!fa.seen(SPAWN.x + 10, SPAWN.z) || fa.seen(SPAWN.x + 30, SPAWN.z) || fa.seen(-35, -190)) fail('sight radius wrong');
const area = (label: string) => buildLevel().areas.find((x) => x.label === label)!;
if (!fa.discovered(area('Fondamenta San Giacomo')) || fa.discovered(area('Pontile'))) fail('discovered areas wrong');
const seenCount = fa.cells.reduce((n, v) => n + v, 0);
if (seenCount === 0 || seenCount > fa.cells.length / 10) fail(`${seenCount} of ${fa.cells.length} cells seen at the start`);

const s = JSON.parse(JSON.stringify(serialize(a)));
const b = boot();
deserialize(b, s);
if (b.player.pos.x !== -10 || b.player.pos.z !== -90 || b.player.facing !== 1.25) fail('player position not restored');
if (b.stats.hp !== 700 || b.stats.mana !== 123 || b.kit.charge !== 60) fail('player stats not restored');
if (!b.quest.key || !b.quest.chestOpen || b.quest.bossDead) fail('quest flags not restored');
if (b.quest.stage !== 'boss') fail(`quest stage ${b.quest.stage} after load, want boss`);
// A fresh game saved before talking to Fra' Zuane loads before his quest; a save from before him loads with it taken.
const fresh = boot(), early = boot();
deserialize(early, JSON.parse(JSON.stringify(serialize(fresh))));
if (early.quest.stage !== 'talk') fail(`a save before the quest loads at ${early.quest.stage}`);
const before = boot();
const { accepted: _a, out: _o, ...oldQuest } = s.quest;
deserialize(before, { ...s, quest: { ...oldQuest, key: false, gates: [] } });
if (before.quest.stage !== 'key') fail(`a save from before Fra' Zuane loads at ${before.quest.stage}, want key`);
if (!valid({ ...s, quest: oldQuest }) || valid({ ...s, quest: { ...s.quest, accepted: 'yes' } })) fail('quest stage field validation');
const open = b.quest.gates.filter((g) => g.open).map((g) => g.id);
if (open.join() !== 'grata-nord') fail(`open gates ${open}`);
if (b.quest.gates.some((g) => g.open && b.quest['world'].boxes.includes(g.box))) fail('an opened gate still blocks');
if (b.mobs[2].state !== 'dead' || b.mobs.filter((m) => m.state === 'dead').length !== 1) fail('dead mobs not restored');
if (b.time !== 754) fail('play time not restored');
if (fogOf(b).cells.join('') !== fa.cells.join('')) fail('explored map not restored');
if (b.gear.worn.torso !== 'saio-voto' || b.gear.worn.testa || b.gear.worn.arma !== 'clava-osso' || b.stats.hpMax !== a.stats.hpMax) fail(`gear restored as ${JSON.stringify(b.gear.encode())}, ${b.stats.hpMax} hp max`);
if (b.bag.count('canapa-torso') !== 1 || b.bag.count('canapa-testa') !== 1) fail('the pieces taken off are not in the bag');
if (b.bag.gold !== 321 || b.bag.count('rosario-bosso') !== 3 || b.bag.count('chiodo') !== 1) fail(`bag restored as ${JSON.stringify(b.bag.encode())}`);

// A save from before the fog loads fully fogged; a grid of another size or junk is refused untouched.
const old = boot();
const { fog: _, ...legacy } = s;
deserialize(old, legacy);
if (fogOf(old).cells.some((v) => v)) fail('legacy save not fogged');
if (old.fog.decode('3x3:AA==') || old.fog.decode('junk') || old.fog.decode(s.fog.replace(/:.*/, ':!!'))) fail('bad fog grid accepted');
if (!valid(legacy) || valid({ ...s, fog: 5 })) fail('fog field validation');
// A save from before the loot loads with an empty bag; a malformed bag is refused.
const poor = boot();
deserialize(poor, (({ bag: _g, ...o }) => o)(s));
if (poor.bag.gold || poor.bag.items.length || !valid((({ bag: _g, ...o }) => o)(s))) fail('a save from before the loot loads with loot');
const plain = boot();
deserialize(plain, (({ gear: _g, ...o }) => o)(s));
if (JSON.stringify(plain.gear.encode()) !== JSON.stringify(STARTER) || !valid((({ gear: _g, ...o }) => o)(s)) || valid({ ...s, gear: { torso: 3 } })) fail('a save from before the gear does not load in the starter set');
if (valid({ ...s, bag: { gold: 'x', items: [] } }) || valid({ ...s, bag: { gold: 1, items: [[3, 1]] } })) fail('bag field validation');

// The boss's fall carries the portone with it; a saved corpse player wakes alive.
const c = boot();
deserialize(c, { ...s, player: { ...s.player, hp: 0 }, quest: { ...s.quest, bossDead: true } });
if (!c.quest.gates.find((g) => g.id === 'portone')!.open) fail('boss dead but portone shut');
if (c.stats.hp <= 0) fail('loaded a dead player');

// Level 2: its flags round-trip, the chains and the Zitelle's doors with them; a save from before it loads at the report to Fra' Zuane.
const z = boot();
Object.assign(z.quest, { accepted: true, out: true });
z.quest.takeKey();
for (const g of z.quest.gates) if (g.needs === 'key') z.quest.open(g);
z.quest.win();
z.quest.report();
z.quest.accept2();
z.quest.arrived = true;
z.quest.takeKey2();
z.quest.open(z.quest.gate('coro-zitelle'));
z.quest.bless2();
const zs = JSON.parse(JSON.stringify(serialize(z))), zb = boot();
deserialize(zb, zs);
if (zb.quest.stage !== 'boss2' || !zb.quest.gate('catene').open || !zb.quest.gate('coro-zitelle').open || zb.quest.gate('portone-zitelle').open || !zb.quest.blessed2) fail(`level 2 restored at ${zb.quest.stage}`);
if (zb.quest['world'].boxes.includes(zb.quest.gate('catene').box)) fail('the fallen chains still block the bridge');
const zw = boot();
deserialize(zw, { ...zs, quest: { ...zs.quest, boss2Dead: true } });
if (!zw.quest.gate('portone-zitelle').open || zw.quest.stage !== 'return') fail('the Governatrice dead but her portone shut');
const l1 = boot();
deserialize(l1, (({ quest: { reported: _r, accepted2: _a2, arrived: _ar, key2: _k, boss2Dead: _b, reported2: _r2, blessed2: _b2, ...q }, ...o }) => ({ ...o, quest: { ...q, gates: ['grata-nord', 'coro', 'portone'] } }))(zs));
if (l1.quest.stage !== 'report' || l1.quest.gate('catene').open) fail(`a finished level-1 save loads at ${l1.quest.stage}`);
if (valid({ ...zs, quest: { ...zs.quest, key2: 1 } })) fail('level 2 flag validation');
// Fra' Zuane's corona: found and given back survive a save; a save from before it loads with it still lost.
const rz = boot();
deserialize(rz, { ...zs, quest: { ...zs.quest, relic: true, relicBack: true } });
const rs = JSON.parse(JSON.stringify(serialize(rz)));
if (!rz.quest.relic || !rz.quest.relicBack || !rs.quest.relic || !rs.quest.relicBack) fail('the corona\'s flags do not survive a save');
if (old.quest.relic || old.quest.relicBack) fail('a save from before the corona loads with it found');
// The quests done round-trip and their XP is what the save counted; a save from before them is rebuilt from its flags,
// with only Fra' Zuane's old report reward counted in its XP (the rest is paid on load); an unknown quest is dropped.
z.quest.meet();
const qs = JSON.parse(JSON.stringify(serialize(z))), qb = boot();
deserialize(qb, qs);
if (qb.quest.done.join() !== 'chiave,reverendissimo,bortolo' || !qb.quest.found || questXpIn(qs) !== qb.quest.bonusXp) fail(`quests done restored as ${qb.quest.done}`);
const { found: _f, done: _d, ...oldQ } = qs.quest;
let qo = boot();
deserialize(qo, { ...qs, quest: { ...oldQ, blessed: true } });
if (qo.quest.done.join() !== 'chiave,bortolo,reverendissimo' || questXpIn({ ...qs, quest: oldQ }) !== 150) fail(`an old save's quests rebuilt as ${qo.quest.done}`);
deserialize((qo = boot(), qo), { ...qs, quest: { ...qs.quest, done: ['chiave', 'from_the_future'] } });
if (qo.quest.done.join() !== 'chiave') fail('unknown quest kept');
if (!valid({ ...qs, quest: oldQ }) || valid({ ...qs, quest: { ...qs.quest, done: [1] } }) || valid({ ...qs, quest: { ...qs.quest, found: 'yes' } })) fail('quests done validation');
// A fog grid from before the level grew east keeps its cells where they were.
const narrow = (() => { const f = new Discovery(buildLevel().areas.filter((x) => x.zone !== 'giudecca' && x.zone !== 'zitelle')); f.reveal(SPAWN.x, SPAWN.z); return f; })();
const wide = fogOf(boot());
if (narrow.x0 !== wide.x0 || narrow.z0 !== wide.z0 || narrow.rows !== wide.rows || !wide.decode(narrow.encode()) || !wide.seen(SPAWN.x, SPAWN.z) || wide.seen(SPAWN.x + 30, SPAWN.z)) fail('an old fog grid lost its place');

// Storage: three slots, empty ones undefined, junk refused; the pending handoff is taken once.
const mem = new Map<string, string>();
const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } as Storage;
if (!save(1, { label: 'Orti', savedAt: 1, state: s }, store)) fail('save failed');
mem.set('redentore.save.2', '{"label":"x","savedAt":1,"state":{"v":1}}');
const list = slots(store);
if (list.length !== 3 || list[0] || list[1]?.label !== 'Orti' || list[2]) fail('slots misread');
setPending(s, store);
if (!takePending(store) || takePending(store)) fail('pending state not taken exactly once');
// The autosave: every cold boot resumes it (an iOS tab reloaded after a kill), junk is refused, "Nuova partita" clears it.
if (resume(store)) fail('resumed a run never kept');
if (!autosave(s, store)) fail('autosave failed');
if (resume(store)?.time !== s.time || resume(store)?.time !== s.time) fail('autosave not resumed on every boot');
mem.set('redentore.auto', '{"v":1,"player":{}}');
if (resume(store)) fail('junk autosave resumed');
autosave(s, store);
clearAutosave(store);
if (resume(store)) fail('autosave survived a new game');
// Level 2 through the autosave: the second quest's stage, its open doors and its checkpoint come back.
autosave(zs, store);
const zr = boot();
deserialize(zr, resume(store)!);
if (zr.quest.stage !== 'boss2' || !zr.quest.gate('coro-zitelle').open || zr.quest.checkpoint().x !== 240) fail(`level 2 resumed at ${zr.quest.stage}`);
clearAutosave(store);
// Levels: picks and XP round-trip; an hp pick's raised max is in place before the saved hp is clamped to it.
const lv = boot();
lv.levels.picks = ['step', 'hp', 'dmg'];
lv.levels.xp = 200;
lv.levels.apply();
lv.stats.hp = 1450;
const ls = JSON.parse(JSON.stringify(serialize(lv)));
if (ls.build.lv !== 5 || ls.build.picks.join() !== 'step,hp,dmg') fail(`build saved as ${JSON.stringify(ls.build)}`);
const lb = boot();
deserialize(lb, ls);
if (lb.levels.picks.join() !== 'step,hp,dmg' || lb.levels.xp !== 200) fail('picks or XP not restored');
const want = 1472 + effects(lb.gear.totals).hp; // the hp card, then the starter set's Vigore
if (lb.stats.hpMax !== want || lb.stats.hp !== 1450) fail(`hp ${lb.stats.hp} / ${lb.stats.hpMax} after load, want 1450 / ${want}`);
// A save from before the levels loads at level 1 with the starting kit (main.ts then offers what its dead earned);
// a card id this build doesn't know is dropped; a malformed build is refused.
const pre = boot();
deserialize(pre, s.build ? (({ build: _b, ...o }) => o)(s) : s);
if (pre.levels.picks.length || pre.levels.xp || pre.stats.hpMax !== 1280 + effects(pre.gear.totals).hp) fail('a save from before the levels loads with a build');
const odd = boot();
deserialize(odd, { ...ls, build: { ...ls.build, picks: ['hp', 'from_the_future'] } });
if (odd.levels.picks.join() !== 'hp') fail('unknown card kept');
if (!valid({ ...s, build: undefined }) || valid({ ...s, build: { xp: 1, lv: 1, picks: [3] } }) || valid({ ...s, build: { xp: '1', lv: 1, picks: [] } })) fail('build field validation');
// Le teste dei frati: asked, the heads in hand and the boon round-trip; a save from before it loads with it not taken; junk is refused.
const hq = boot();
Object.assign(hq.quest, { asked: true, heads: 7 });
hq.mobs[4].again = true; // a friar risen again keeps its lesser worth
const hs = JSON.parse(JSON.stringify(serialize(hq))), hb = boot();
deserialize(hb, hs);
if (!hb.quest.asked || hb.quest.heads !== 7 || hb.quest.boon) fail(`the heads restored as ${hb.quest.heads}`);
if (!hb.mobs[4].again || hb.mobs.filter((m) => m.again).length !== 1 || valid({ ...hs, again: ['x'] })) fail('risen friars not restored');
const done = boot();
deserialize(done, { ...hs, quest: { ...hs.quest, heads: 0, boon: 'fiala', done: ['teste'] } });
if (done.quest.boon !== 'fiala' || done.quest.bonusXp !== QUESTS.teste.xp) fail('the rite\'s boon or its XP not restored');
const before2 = boot();
deserialize(before2, (({ quest: { asked: _as, heads: _h, boon: _bo, ...q }, ...o }) => ({ ...o, quest: q }))(hs));
if (before2.quest.asked || before2.quest.heads || before2.quest.boon) fail('a save from before the heads loads with them');
const odd2 = boot();
deserialize(odd2, { ...hs, quest: { ...hs.quest, boon: 'from_the_future' } });
if (odd2.quest.boon || valid({ ...hs, quest: { ...hs.quest, heads: 'x' } }) || valid({ ...hs, quest: { ...hs.quest, asked: 1 } }) || valid({ ...hs, quest: { ...hs.quest, boon: 3 } })) fail('heads field validation');
console.log('save system ok');
