// Save system check (`npm run check`): a game serialized mid-quest and laid over a freshly
// booted world comes back the same (player, charge, Fra' Zuane's quest stage, key, open gates and their colliders, the
// dead staying dead, play time, the explored map, level-up picks and XP, the bag, the gear worn and the Vigore it adds); slots, the reload handoff and the autosave survive storage and refuse junk.
import { SIDE_BY } from '../src/quest/squero.ts';
import { buildLevel } from '../src/level/index.ts';
import { SPAWN } from '../src/level/plan.ts';
import { ANDITO, QUESTS, Quest } from '../src/quest/progress.ts';
import { spawnGroups } from '../src/enemies/brain.ts';
import { autosave, clearAutosave, deserialize, questXpIn, resume, valid, save, serialize, setPending, slots, startup, takePending, upcoming, type Game } from '../src/core/save.ts';
import { Discovery } from '../src/core/discovery.ts';
import { PlayerStats } from '../src/player/stats.ts';
import { tuneOf } from '../src/player/levels.ts';
import { HEROES, type Hero } from '../src/player/heroes.ts';
import { Bag } from '../src/loot/bag.ts';
import { Equipment, GEAR, SLOTS as GEAR_SLOTS, STARTER, effects } from '../src/loot/gear.ts';
import { eligible, levelOf as lvOf } from '../src/player/levels.ts';
import { BAR, PICKS, install, migration, prepared } from '../src/core/prepared.ts';

const fail = (why: string) => { throw new Error(why); };

function boot(hero: Hero = 'risorto'): Game {
  const level = buildLevel(), stats = new PlayerStats(), gear = new Equipment();
  const g: Game = {
    hero,
    player: { pos: { x: SPAWN.x, y: 0, z: SPAWN.z }, facing: SPAWN.yaw },
    stats,
    kit: { charge: 0 },
    levels: { xp: 0, picks: [], learned: [], main: '', apply() { const t = tuneOf(this.picks, this.learned, HEROES[g.hero].school), w = effects(gear.totals); stats.grow(t.hp, t.mana, w.hp, w.mana); } }, // main.ts lays the rest on the kit
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
// Level 3: its flags round-trip, the chain past the Tre Oci and the Cenacolo's doors with them; a level-2 save loads at the third offer.
const l3a = boot();
deserialize(l3a, { ...zs, quest: { ...zs.quest, boss2Dead: true } });
l3a.quest.report2();
l3a.quest.accept3();
l3a.quest.landed = true;
l3a.quest.takeKey3();
l3a.quest.open(l3a.quest.gate('cenacolo'));
l3a.quest.bless3();
const s3 = JSON.parse(JSON.stringify(serialize(l3a))), l3b = boot();
deserialize(l3b, s3);
if (l3b.quest.stage !== 'boss3' || !l3b.quest.gate('catene-punta').open || !l3b.quest.gate('cenacolo').open || l3b.quest.gate('cenacolo-orto').open || !l3b.quest.blessed3 || !l3b.quest.landed) fail(`level 3 restored at ${l3b.quest.stage}`);
const l3w = boot();
deserialize(l3w, { ...s3, quest: { ...s3.quest, boss3Dead: true } });
if (!l3w.quest.gate('cenacolo-orto').open || l3w.quest.stage !== 'return3') fail("the Abate dead but the Cenacolo's garden door shut");
const l3o = boot();
deserialize(l3o, { ...zs, quest: { ...zs.quest, boss2Dead: true, reported2: true, gates: [...zs.quest.gates, 'portone-zitelle'] } });
if (l3o.quest.stage !== 'offer3' || l3o.quest.gate('catene-punta').open) fail(`a finished level-2 save loads at ${l3o.quest.stage}`);
if (valid({ ...s3, quest: { ...s3.quest, key3: 'yes' } })) fail('level 3 flag validation');
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
// Mastro Iseppo's quests: taken, handed in and counted survive a save, his quest items with the bag; a save from before him loads with none.
z.quest.side.taken.push('lumi', 'ditale');
z.quest.side.done.push('ferri');
z.quest.complete('ferri');
z.quest.side.kills.lumi = 4;
z.bag.add('ditale-marieta');
z.quest.side.taken.push('fari'); // San Giorgio's Fanalista, a quest in steps: the west lamp lit, two ampolle left for the east
z.quest.side.steps.fari = 2;
z.bag.add('ampolla-faro', 2);
const ss = JSON.parse(JSON.stringify(serialize(z))), sb = boot();
deserialize(sb, ss);
if (sb.quest.side.taken.join() !== 'lumi,ditale,fari' || sb.quest.side.done.join() !== 'ferri' || sb.quest.side.kills.lumi !== 4 || sb.quest.side.steps.fari !== 2 || sb.bag.count('ampolla-faro') !== 2 || !sb.bag.count('ditale-marieta')) fail(`side quests restored as ${JSON.stringify(sb.quest.side.encode())}`);
if (sb.quest.bonusXp !== z.quest.bonusXp || questXpIn(ss) !== z.quest.bonusXp) fail("a load does not count Mastro Iseppo's XP as before");
if (old.quest.side.taken.length || old.quest.side.done.length || !valid((({ side: _s, ...o }) => o)(ss))) fail('a save from before Mastro Iseppo loads with his quests');
if (valid({ ...ss, side: { taken: [1], done: [] } }) || valid({ ...ss, side: { taken: [], done: [], kills: { lumi: 'x' } } }) || valid({ ...ss, side: { taken: [], done: [], steps: { fari: 'x' } } })) fail('side quest field validation');
if (!valid({ ...ss, side: (({ steps: _st, ...o }) => o)(ss.side) })) fail('a save from before the quests in steps is refused');
// Il drago di Carpaccio (the statue of San Giorgio's): the lance raised, the dragon to kill, its pieces in the bag, survive a save, and so does
// the dragon dead (ready); once handed in, the lance in the bag; a save from before it loads without it.
if (sb.quest.side.taken.includes('drago') || sb.quest.side.done.includes('drago')) fail('a save from before the dragon loads with its quest');
z.quest.side.taken.push('drago');
z.quest.side.steps.drago = 4;
for (const id of ['lancia-punta', 'lancia-asta', 'lancia-calcio']) z.bag.add(id);
const ds = JSON.parse(JSON.stringify(serialize(z))), db = boot();
db.quest.side.bag = db.bag;
deserialize(db, ds);
if (!db.quest.side.active('drago') || db.quest.side.step(SIDE_BY.get('drago')!) !== 4 || !db.bag.count('lancia-calcio') || db.quest.side.ready(SIDE_BY.get('drago')!)) fail(`the dragon's quest restored as ${JSON.stringify(db.quest.side.encode())}`);
z.quest.side.kills.drago = 1;
const dk = JSON.parse(JSON.stringify(serialize(z))), dd = boot();
dd.quest.side.bag = dd.bag;
deserialize(dd, dk);
if (!dd.quest.side.ready(SIDE_BY.get('drago')!)) fail('the dragon dead does not survive a save');
// A fog grid round-trips by its origin; one from before (no origin: level 2 at +X, x 60..300) keeps level 1's cells
// where they were and lays level 2's on its new side, -X (level/plan.ts).
const wide = fogOf(boot());
const legacy1 = buildLevel().areas.filter((x) => !['giudecca', 'zitelle', 'punta', 'sangiorgio'].includes(x.zone));
const narrow = new Discovery([...legacy1, { x0: 60, x1: 300, z0: -104, z1: 20 }]);
narrow.reveal(SPAWN.x, SPAWN.z);
narrow.reveal(78, 15); // the old Fondamenta de la Croce
if (narrow.x0 !== -102 || narrow.z0 !== wide.z0 || !wide.decode(narrow.encode().replace(/@-?\d+/, '')) || !wide.seen(SPAWN.x, SPAWN.z) || !wide.seen(-78, 15) || wide.seen(78, 15) || wide.seen(SPAWN.x + 30, SPAWN.z)) fail('an old fog grid lost its place');
const round = fogOf(boot());
if (!round.decode(wide.encode()) || round.cells.join('') !== wide.cells.join('')) fail('a fog grid does not round-trip');
// A save from when level 2 lay at +X wakes its hero at the checkpoint, not out on the open ground there.
const moved = boot();
deserialize(moved, { ...zs, player: { ...zs.player, x: 150, z: 15 } });
if (moved.player.pos.x !== ANDITO.x || moved.player.pos.z !== ANDITO.z) fail(`an old level-2 save woke at (${moved.player.pos.x}, ${moved.player.pos.z})`);

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
// The menu's handoffs across the reload win over the autosave the old page makes on its way out (the reload's
// visibilitychange): "Nuova partita" boots afresh and stays fresh, a load becomes the run in progress, a cold boot resumes.
autosave(s, store);
clearAutosave(store); setPending('new', store); // "Nuova partita"
autosave(s, store); // the old page, hidden by its reload
if (upcoming(store, store) !== 'new' || upcoming(store, store) !== 'new') fail('the boot did not see the new game coming (or the peek took it)');
let up = startup(store, store);
if (up.state || !up.queued || resume(store)) fail('"Nuova partita" resumed the old run');
if (startup(store, store).state) fail('the old run came back on the next cold boot');
autosave(s, store);
setPending(zs, store); // "Carica"
autosave(s, store);
if (JSON.stringify(upcoming(store, store)) !== JSON.stringify(zs)) fail('the boot did not see the load coming');
up = startup(store, store);
if (JSON.stringify(up.state) !== JSON.stringify(zs) || JSON.stringify(resume(store)) !== JSON.stringify(zs)) fail('a load left the old run as the one in progress');
up = startup(store, store); // iOS killed it: the cold boot resumes the loaded run
if (up.queued || JSON.stringify(up.state) !== JSON.stringify(zs) || JSON.stringify(upcoming(store, store)) !== JSON.stringify(zs)) fail('cold boot after a load did not resume it');
clearAutosave(store);
if (upcoming(store, store) !== undefined) fail('a first launch saw a game coming');
// Level 2 through the autosave: the second quest's stage, its open doors and its checkpoint come back.
autosave(zs, store);
const zr = boot();
deserialize(zr, resume(store)!);
if (zr.quest.stage !== 'boss2' || !zr.quest.gate('coro-zitelle').open || zr.quest.checkpoint() !== ANDITO) fail(`level 2 resumed at ${zr.quest.stage}`);
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
// The tomes' abilities round-trip; a save from before the tomes loads with none; a card that is no ability is dropped; junk is refused.
const tl = boot();
tl.levels.learned = ['pyre', 'wisp'];
const ts = JSON.parse(JSON.stringify(serialize(tl))), tb = boot();
deserialize(tb, ts);
if (tb.levels.learned.join() !== 'pyre,wisp' || !tuneOf(tb.levels.picks, tb.levels.learned).owned.includes('pyre')) fail(`tomes' abilities after load: ${tb.levels.learned}`);
const tOld = boot();
deserialize(tOld, ls);
if (tOld.levels.learned.length) fail('a save from before the tomes loads with abilities learnt');
const tOdd = boot();
deserialize(tOdd, { ...ts, build: { ...ts.build, learned: ['pyre', 'hp', 'from_the_future'] } });
if (tOdd.levels.learned.join() !== 'pyre') fail(`tomes' junk kept: ${tOdd.levels.learned}`);
if (!valid(ls) || !valid({ ...ls, build: { ...ls.build, learned: undefined } }) || valid({ ...ts, build: { ...ts.build, learned: [3] } }) || valid({ ...ts, build: { ...ts.build, learned: 'pyre' } })) fail('learned field validation');
// The hero chosen round-trips with his kit; a save from before the choice is the Risorto's, given back the Nube di peste
// he started with then; another build's hero is the Risorto; junk is refused.
const hg = boot('bortolo');
hg.levels.learned = ['frost', 'caligo'];
hg.levels.main = 'spark';
const hgs = JSON.parse(JSON.stringify(serialize(hg))), hgb = boot();
deserialize(hgb, hgs);
if (hgb.hero !== 'bortolo' || hgb.levels.learned.join() !== 'frost,caligo' || hgb.levels.main !== 'spark' || tuneOf(hgb.levels.picks, hgb.levels.learned).owned.includes('plague')) fail(`hero after load: ${hgb.hero} ${hgb.levels.learned} ${hgb.levels.main}`);
// Stiletto di ghiaccio became the Gelo's base attack, Caligo gelato took its place: an older Bortolo, who started with
// it, has it as his base attack, the fog in its place and keeps its upgrades; an older Risorto who learnt or picked it
// has the fog, and the fog's upgrades for the stiletto's. Absent, the big button's choice is the hero's own.
const older = (hero: string, picks: string[], learned: string[]) => { const g = boot(); deserialize(g, { ...hgs, hero, build: { xp: 400, lv: 6, picks, learned } }); return g; };
const ob = older('bortolo', ['lance_dmg', 'lance_split', 'hp'], ['frost', 'lance']), obt = tuneOf(ob.levels.picks, ob.levels.learned, HEROES.bortolo.school);
if (ob.levels.learned.join() !== 'frost,caligo' || ob.levels.picks.join() !== 'lance_dmg,lance_split,hp' || obt.owned[0] !== 'lance' || !obt.owned.includes('caligo') || obt.prim.lance.dmg !== 11 || !obt.prim.lance.split || ob.levels.main) fail(`an older Bortolo: ${ob.levels.learned} ${ob.levels.picks} ${obt.owned}`);
const or = older('risorto', ['lance', 'lance_dmg', 'lance_split', 'hp'], ['lance']);
if (or.levels.learned.join() !== 'caligo' || or.levels.picks.join() !== 'caligo,caligo_big,caligo_freeze,hp' || or.levels.picks.length !== 4) fail(`an older Risorto with the stiletto: ${or.levels.learned} ${or.levels.picks}`);
const hf = boot('fosca'); // Suor Fosca keeps her Nube di peste and Sputo di bile
hf.levels.learned = ['plague', 'spit'];
const hfb = boot();
deserialize(hfb, JSON.parse(JSON.stringify(serialize(hf))));
if (hfb.hero !== 'fosca' || hfb.levels.learned.join() !== 'plague,spit') fail(`Suor Fosca after load: ${hfb.hero} ${hfb.levels.learned}`);
const ht = boot('tizian'); // Fra' Tizian keeps his Rogo dell'eretico and Cero funebre
ht.levels.learned = ['pyre', 'cero'];
const htb = boot();
deserialize(htb, JSON.parse(JSON.stringify(serialize(ht))));
if (htb.hero !== 'tizian' || htb.levels.learned.join() !== 'pyre,cero') fail(`Fra' Tizian after load: ${htb.hero} ${htb.levels.learned}`);
const hz = boot('zanetto'); // Zanetto keeps his Catena di saette and Rintocco del campanile
hz.levels.learned = ['chain', 'toll'];
const hzb = boot();
deserialize(hzb, JSON.parse(JSON.stringify(serialize(hz))));
if (hzb.hero !== 'zanetto' || hzb.levels.learned.join() !== 'chain,toll') fail(`Zanetto after load: ${hzb.hero} ${hzb.levels.learned}`);
const hgOld = boot('bortolo');
deserialize(hgOld, (({ hero: _h, ...o }) => o)(hgs));
if (hgOld.hero !== 'risorto' || !tuneOf(hgOld.levels.picks, hgOld.levels.learned).owned.includes('plague')) fail('a save from before the choice is not the Risorto with his plague');
const hgOdd = boot();
deserialize(hgOdd, { ...hgs, hero: 'anzola' });
if (hgOdd.hero !== 'risorto' || hgOdd.levels.learned.includes('plague') || valid({ ...hgs, hero: 3 }) || !valid((({ hero: _h, ...o }) => o)(hgs))) fail('hero field validation');
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
// The hero ready for level 2: loads at Fra' Zuane's offer, level 12 with every card as `offer` would deal it, level 1's
// purple on every slot, at full health; the migration swaps every old save for it once, and never again.
const pg = boot('bortolo'); // whoever was chosen on this boot, the prepared hero is the Risorto
const ps = JSON.parse(JSON.stringify(prepared(serialize(pg), pg.mobs.length, buildLevel().areas)));
if (!valid(ps)) fail('the prepared save is refused');
const pb = boot();
deserialize(pb, ps);
if (pb.hero !== 'risorto' || !pb.levels.learned.includes('plague') || pb.quest.stage !== 'offer' || !pb.quest.found || pb.quest.boon !== 'vigore' || !pb.quest.relicBack || pb.quest.bonusXp !== questXpIn(ps)) fail(`prepared save at ${pb.quest.stage}`);
if (lvOf(pb.levels.xp).lv !== 12 || pb.levels.picks.join() !== PICKS.join() || pb.levels.picks.length !== 11) fail(`prepared level ${lvOf(pb.levels.xp).lv}, picks ${pb.levels.picks}`);
PICKS.forEach((id, i) => {
  const c = eligible(PICKS.slice(0, i), ['plague']).find((k) => k.id === id), lv = i + 2;
  if (!c || (c.kind === 'ability') !== (lv % 2 === 0 && lv <= 10)) fail(`card ${id} could not be dealt at level ${lv}`);
});
if (GEAR_SLOTS.some((sl) => GEAR.find((g) => g.id === pb.gear.worn[sl.id])?.rarity !== 'epico' || GEAR.find((g) => g.id === pb.gear.worn[sl.id])?.l2)) fail(`prepared gear ${JSON.stringify(pb.gear.worn)}`);
if (pb.stats.hp !== pb.stats.hpMax || pb.stats.mana !== pb.stats.manaMax || pb.mobs.some((m) => m.state !== 'dead')) fail('prepared hero not full, or level 1 not cleared');
if (!fogOf(pb).seen(SPAWN.x, SPAWN.z) || !fogOf(pb).seen(-35, -190) || fogOf(pb).seen(-240, -20)) fail('prepared map not level 1 seen');
const owned = new Set(['fall', 'plague', 'mend', 'potion', ...PICKS.filter((id) => ['step', 'frost', 'nova', 'caligo', 'font'].includes(id))]);
if (BAR.bar.filter((x) => x).length !== owned.size || BAR.bar.some((x) => x && !owned.has(x)) || BAR.bar[0] !== 'fall' || BAR.bar[9] !== 'potion') fail(`prepared bar ${BAR.bar}`);
mem.clear();
if (migration(store) || migration(store)) fail('a first launch with nothing saved lost its fresh game');
mem.clear();
save(0, { label: 'old', savedAt: 1, state: s }, store);
save(2, { label: 'old', savedAt: 1, state: s }, store);
autosave(s, store);
if (!migration(store)) fail('migration did not run');
install(ps, store);
const after = slots(store);
if (after[0]?.label !== 'Pronto per il livello 2' || after[1] || after[2] || resume(store)?.build?.xp !== ps.build.xp || !mem.get('redentore.bar')) fail('migration did not swap the saves');
save(1, { label: 'later', savedAt: 2, state: s }, store);
if (migration(store)) fail('migration ran twice');
console.log('save system ok');
