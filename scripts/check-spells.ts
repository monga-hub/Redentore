// Spells check (`npm run check`): crowd control on the mobs (enemies/control.ts) and its diminishing returns, the
// boss's resistance, what a stun, a root and a chill do to a friar's and a priest's brain, and the rules of the
// fire, frost and lightning spells and the new blows (abilities/grimoire.ts): bolts homing and landing, splash
// and burning, the chill, the frozen shattering, the chain's jumps, the thunderbolt's delay, the leap's travel,
// the execute's scaling, Miasma elettrico, Frantumazione, the whirl's parry; the rest of the five a school (poison doses,
// the untore, the miasma, the fever and its cap on the bosses, the drain, the pillar, the candle, the furnace, the
// blizzard, the orb, the lightning shield, the rod, the squall's knockback, the judgment, the consecrated ground, the
// hammer's stun on the boss, their fusions); and walls: bolts (the hero's and the priests') burst on them, a hidden
// target refuses the cast, the chain, the novas, the orb and the knockback don't pass them.
import { World } from '../src/core/physics.ts';
import { FRIAR, think as friarThink, type Friar } from '../src/enemies/brain.ts';
import { PRIEST, REVERENDISSIMO, fly as casterFly, think as casterThink, spawnPriests, type Bolt as Shadow } from '../src/enemies/caster.ts';
import { control, chill, root, stun, pace, tick, exposed } from '../src/enemies/control.ts';
import { Grimoire, maxHp } from '../src/abilities/grimoire.ts';
import { tuneOf } from '../src/player/levels.ts';
import type { Mob } from '../src/ui/target.ts';
import { GUARD_CUT, PlayerStats } from '../src/player/stats.ts';

const fail = (why: string) => { throw new Error(why); };
const near = (a: number, b: number, why: string, e = 1e-6) => { if (Math.abs(a - b) > e) fail(`${why}: ${a} want ${b}`); };

// --- control: durations, diminishing returns, resist ---
const c = control();
near(stun(c, 2), 2, 'first stun full');
near(stun(c, 2), 1, 'second stun halved');
near(stun(c, 2), 0.5, 'third quartered');
near(stun(c, 2), 0, 'fourth shrugged off');
tick(c, 16);
near(root(c, 4), 4, 'diminishing returns reset after 15 s');
const boss = control(REVERENDISSIMO.resist);
near(stun(boss, 2.5), 2.5 * 0.35, 'the boss shakes a stun off sooner');
chill(boss, 6, 0.5);
if (!(boss.slowK > 0.8)) fail(`the boss is barely slowed: ${boss.slowK}`);
const slowed = control();
chill(slowed, 6, 0.3);
near(pace(slowed), 0.3, 'chilled pace');
tick(slowed, 6.1);
near(pace(slowed), 1, 'the chill wears off');

// --- brains: a stunned friar loses its swing, a rooted one stands, a stunned priest loses its cast ---
const world = new World();
world.add(0, 0, 200, 200, -1, 0); // a floor
const friar = (x: number, z: number): Friar => ({ x, y: 0, z, yaw: 0, hp: FRIAR.hp, state: 'chase', t: 0, cd: 0, struck: false, home: { x, z, yaw: 0 }, mates: [], cc: control() });
const f = friar(0, 1);
f.mates.push(f);
const you = { x: 0, y: 0, z: 0 };
friarThink(f, you, world, 0.05);
if (f.state !== 'swing') fail('a friar in reach swings');
stun(f.cc, 1);
let dealt = 0;
for (let t = 0; t < 1.5; t += 0.05) dealt += friarThink(f, you, world, 0.05);
if (dealt || f.state === 'swing' && f.t > FRIAR.windup) fail('a stunned friar lost its swing');
const g = friar(0, 8);
g.mates.push(g);
root(g.cc, 2);
for (let t = 0; t < 1; t += 0.05) friarThink(g, you, world, 0.05);
near(g.z, 8, 'a rooted friar stays put');
const [p] = spawnPriests(world, [[[0, 10, 0]]], [{ x0: -50, x1: 50, z0: -50, z1: 50 }])[0];
p.state = 'cast'; p.t = 0; p.los = { ok: true, t: 9 };
const bolts: Shadow[] = [];
stun(p.cc, 1);
casterThink(p, you, world, 0.05, bolts);
if ((p.state as string) !== 'chase' || bolts.length) fail('a stun interrupts a priest\'s cast');
if (PRIEST.resist !== undefined && PRIEST.resist !== 1) fail('priests take control in full');

// --- the grimoire ---
const tune = tuneOf([]);
const foe = (x: number, z: number, hp = 1000): Mob & { kind: { hp: number; radius: number } } => ({ x, y: 0, z, hp, state: 'chase', cc: control(), kind: { hp: 1000, radius: 0.4 } });
let foes: (Mob & { kind: { hp: number; radius: number } })[] = [];
const hits = new Map<Mob, number>();
const host = {
  player: { pos: { x: 0, y: 0, z: 0 }, facing: 0, world },
  hurt: (inside: (x: number, z: number, m: Mob) => boolean, n: number) => { for (const m of foes) if (inside(m.x, m.z, m)) { hits.set(m, (hits.get(m) ?? 0) + n); m.hp -= n; } },
  aimed: () => foes[0],
  foes: () => foes,
  clouded: (x: number, z: number) => Math.hypot(x - 0, z + 20) < 3,
  stats: new PlayerStats(),
};
const book = new Grimoire(host, tune);
const run = (t: number) => { for (let s = 0; s < t; s += 1 / 30) book.update(1 / 30); };
const dmg = (m: Mob) => hits.get(m) ?? 0;

foes = [foe(0, -10), foe(1.5, -10), foe(6, -10)];
book.shoot('pyre', { x: 0, y: 1.3, z: 0 });
run(1.2);
if (!book.events.some((e) => e.type === 'pyre')) fail('the fireball lands');
if (dmg(foes[1]) < tune.pyreDmg * 0.5) fail('the fireball splashes its neighbour');
if (dmg(foes[2]) > 0) fail('the fireball misses a foe 6 m off');
if (!(foes[0].cc!.burn > 0) || !book.fires.length) fail('the fireball sets its mark and the floor burning');

hits.clear(); book.reset(); book.events.length = 0;
foes = [foe(0, -8)];
book.shoot('frost', { x: 0, y: 1.3, z: 0 });
run(1);
near(dmg(foes[0]), tune.frostDmg, 'frostbolt damage');
near(pace(foes[0].cc!), tune.frostSlow, 'frostbolt chills');
hits.clear();
book.shoot('lance', { x: 0, y: 1.3, z: 0 });
run(0.5);
near(dmg(foes[0]), tune.lanceDmg, 'the stiletto on a chilled foe');
foes = [foe(0, -3)];
book.font();
if (!(foes[0].cc!.root > 0)) fail('Acquasantiera gelata freezes');
hits.clear();
book.shoot('lance', { x: 0, y: 1.3, z: 0 });
run(0.5);
near(dmg(foes[0]), tune.lanceDmg * 3, 'the stiletto shatters the frozen for triple');

// the chain: the target, then jumps of 8 m at most, 4 of them, each weaker
hits.clear();
foes = [0, 1, 2, 3, 4, 5].map((i) => foe(0, -5 - i * 5));
book.chain({ x: 0, y: 1.3, z: 0 });
const struck = foes.filter((m) => dmg(m) > 0);
if (struck.length !== 1 + tune.chainHops) fail(`the chain struck ${struck.length}, want ${1 + tune.chainHops}`);
near(dmg(foes[1]), tune.chainDmg * 0.75, 'each jump keeps three quarters');
hits.clear();
foes = [foe(0, -5), foe(0, -30)];
book.chain({ x: 0, y: 1.3, z: 0 });
if (dmg(foes[1])) fail('the chain jumps at most 8 m');

// Miasma elettrico: the clouded take +50%
const stormy = new Grimoire(host, tuneOf(['chain', 'fx_storm']));
hits.clear();
foes = [foe(0, -20)];
stormy.chain({ x: 0, y: 1.3, z: 0 });
near(dmg(foes[0]), tune.chainDmg * 1.5, 'Miasma elettrico on the clouded');

// the thunderbolt falls a beat after the call, and stuns
hits.clear();
foes = [foe(0, -6)];
book.toll();
run(0.3);
if (dmg(foes[0])) fail('the thunderbolt waits for its toll');
run(0.5);
near(dmg(foes[0]), tune.tollDmg, 'the thunderbolt strikes');
if (!(foes[0].cc!.stun > 0)) fail('the thunderbolt stuns');

// the leap carries the hero to the foe and lands with a blow
hits.clear();
foes = [foe(0, -10)];
book.go('leap');
if (!book.dashing) fail('the leap carries the hero');
run(0.3);
if (!(host.player.pos.y > 1)) fail('the leap rises');
run(0.5);
if (book.dashing || Math.abs(host.player.pos.z + 8.8) > 0.3) fail(`the leap lands short of the foe: z ${host.player.pos.z}`);
near(dmg(foes[0]), tune.leapDmg, 'the leap lands');
// a charge slides past a hive in its way and still reaches the foe
host.player.pos.x = 0; host.player.pos.y = 0; host.player.pos.z = 0;
const hive = world.add(0.3, -3, 0.5, 0.5, 0, 1.2);
foes = [foe(0, -14)];
book.go('charge');
run(1.2);
if (book.dashing || host.player.pos.z > -11.5) fail(`the charge stopped at the hive: z ${host.player.pos.z}`);
world.boxes.splice(world.boxes.indexOf(hive), 1);
// the charge needs room
host.player.pos.x = 0; host.player.pos.z = 0;
foes = [foe(0, -2)];
if (!book.reach('charge')) fail('no charge at point blank');
foes = [foe(0, -12)];
if (book.reach('charge')) fail('a charge at 12 m');

// Colpo di grazia scales with the wounds
hits.clear();
host.player.pos.z = 0;
foes = [foe(0, -1.5, 1000), foe(0.8, -1.5, 100)];
book.grace();
near(dmg(foes[0]), tune.graceDmg, 'unhurt: the base blow');
near(dmg(foes[1]), tune.graceDmg * (1 + tune.graceMul * 0.9), 'near death: nearly triple');
near(maxHp(foes[1]), 1000, 'max hp from the kind');

// Frantumazione: fire on the chilled
const shatter = new Grimoire(host, tuneOf(['pyre', 'frost', 'fx_shatter']));
hits.clear();
foes = [foe(0, -8)];
chill(foes[0].cc!, 6, 0.5);
shatter.shoot('pyre', { x: 0, y: 1.3, z: 0 });
for (let s = 0; s < 1; s += 1 / 30) shatter.update(1 / 30);
if (!(dmg(foes[0]) >= tuneOf([]).pyreDmg * 1.6) || foes[0].cc!.slow > 0) fail('Frantumazione: +60% and the ice gone');

// --- the five a school ---
const home = () => { host.player.pos.x = 0; host.player.pos.y = 0; host.player.pos.z = 0; host.player.facing = 0; };
const fresh = () => { hits.clear(); book.reset(); book.events.length = 0; home(); };
const within = (a: number, b: number, why: string, k = 0.06) => { if (Math.abs(a - b) > Math.abs(b) * k + 1e-6) fail(`${why}: ${a} want ${b}`); };
// poison: doses stack to the cap and tick per dose; Sputo di bile lands one
fresh();
foes = [foe(0, -8), foe(2, -8), foe(0, -20)];
for (let i = 0; i < 8; i++) book.envenom(foes[0], 1);
near(book.venom(foes[0]), tune.venomMax, 'poison doses cap');
run(2);
within(dmg(foes[0]), 2 * tune.venomMax * tune.venomDps, 'poison ticks per dose');
if (!(foes[0].cc!.poison > 0)) fail('the poisoned show it');
hits.clear();
book.shoot('venom', { x: 0, y: 1.3, z: 0 });
run(0.6);
if (!book.events.some((e) => e.type === 'venom') || dmg(foes[0]) < tune.spitDmg) fail('Sputo di bile lands');
// Unguento dell'untore: the target's doses pass to those within untoreR, no further
fresh();
foes = [foe(0, -8), foe(3, -8), foe(0, -20)];
book.envenom(foes[0], 4);
book.untore({ x: 0, y: 1.3, z: 0 });
if (book.venom(foes[1]) !== 4 || book.venom(foes[2])) fail(`the untore spreads: ${book.venom(foes[1])}, ${book.venom(foes[2])}`);
fresh();
foes = [foe(0, -8), foe(3, -8)];
book.untore({ x: 0, y: 1.3, z: 0 });
if (book.venom(foes[0]) !== 2 || book.venom(foes[1]) !== 2) fail('the untore passes two doses at least');
// Fiato della fossa: a ring of doses round the hero
fresh();
foes = [foe(0, -3), foe(4, 4), foe(0, -12)];
book.miasma();
if (book.venom(foes[0]) !== tune.miasmaStacks || book.venom(foes[1]) !== tune.miasmaStacks || book.venom(foes[2]) || dmg(foes[0]) !== tune.miasmaDmg) fail('the miasma nova');
// Febbre di palude: +20% on everything near the target, half that at most on the boss
fresh();
foes = [foe(0, -8), foe(2, -9), foe(0, -20)];
book.fever();
near(exposed(foes[1].cc, 100), 100 * (1 + tune.feverK), 'the fever exposes');
near(exposed(foes[2].cc, 100), 100, 'the fever stays near its target');
const feverish = { ...foe(0, -8), cc: control(REVERENDISSIMO.resist) };
foes = [feverish];
book.fever();
near(exposed(feverish.cc, 100), 100 * (1 + tune.feverK * 0.5), 'the boss takes half the fever');
tick(feverish.cc!, 12.1);
near(exposed(feverish.cc, 100), 100, 'the fever breaks');
// Risucchio d'anima: hurts the target, heals the hero; nothing with no target
fresh();
host.stats.hp = 500;
foes = [foe(0, -10)];
if (!book.drain({ x: 0, y: 1.3, z: 0 }) || dmg(foes[0]) !== tune.drainDmg) fail('the drain hurts');
near(host.stats.hp, 500 + host.stats.hpMax * tune.drainHeal, 'the drain heals');
foes = [];
if (book.drain({ x: 0, y: 1.3, z: 0 })) fail('a drain with no target');
// Colonna di fiamme: falls a beat later, burns those in it and the floor
fresh();
foes = [foe(0, -8), foe(2, -8), foe(0, -14)];
book.pillar();
run(0.3);
if (dmg(foes[0])) fail('the pillar waits');
run(0.4);
if (dmg(foes[0]) < tune.pillarDmg || dmg(foes[1]) < tune.pillarDmg || dmg(foes[2]) || !(foes[1].cc!.burn > 0) || !book.fires.length) fail('the pillar of fire');
// Cero funebre: burns its mark, then bursts on its neighbours; bursts at once if the mark dies
fresh();
foes = [foe(0, -8), foe(2, -8)];
book.cero({ x: 0, y: 1.3, z: 0 });
run(2);
if (!dmg(foes[0]) || dmg(foes[1])) fail('the candle burns its mark only');
run(2.2);
if (dmg(foes[1]) !== tune.ceroDmg || book.candles.size) fail(`the candle bursts: ${dmg(foes[1])}`);
fresh();
foes = [foe(0, -8), foe(2, -8)];
book.cero({ x: 0, y: 1.3, z: 0 });
foes[0].state = 'dead';
run(0.1);
if (dmg(foes[1]) !== tune.ceroDmg) fail('the candle bursts when its mark dies');
const procession = new Grimoire(host, tuneOf(['cero', 'cero_chain']));
hits.clear();
foes = [foe(0, -8), foe(2, -8), foe(-2, -8), foe(0, -10)];
procession.cero({ x: 0, y: 1.3, z: 0 });
for (let s = 0; s < 4.2; s += 1 / 30) procession.update(1 / 30);
if (procession.candles.size !== 2 || [...procession.candles.values()].some((c) => !c.child)) fail('Processione lights two more, which do not spread');
// Fornace di Murano: a cone ahead burns and stuns; behind, nothing
fresh();
foes = [foe(0, -5), foe(0, 5), foe(0, -12)];
book.furnace();
if (dmg(foes[0]) !== tune.furnaceDmg || !(foes[0].cc!.stun > 0) || !(foes[0].cc!.burn > 0) || dmg(foes[1]) || dmg(foes[2])) fail('the furnace cone');
// Bufera di bora: blows where it was called, hurting and chilling
fresh();
foes = [foe(0, -10), foe(3, -10), foe(0, -20)];
book.blizzardStart();
book.blizzard();
if (dmg(foes[0]) !== tune.blizzardDmg || dmg(foes[1]) !== tune.blizzardDmg || dmg(foes[2]) || !(foes[0].cc!.slow > 0)) fail('the blizzard');
// Globo di brina: rolls, striking those it passes, and bursts at the end
fresh();
foes = [foe(0, -6), foe(0, -40)];
book.orb();
run(1.5);
if (!dmg(foes[0]) || !(foes[0].cc!.slow > 0) || !book.orbs.length) fail('the orb strikes as it rolls');
run(3);
if (book.orbs.length || !book.events.some((e) => e.type === 'orb') || dmg(foes[1])) fail('the orb bursts after 15 m');
// Scudo di saette: a charge a second on a foe within 3 m, until they are spent
fresh();
foes = [foe(0, -2), foe(0, -6)];
book.shield();
run(0.1);
if (dmg(foes[0]) !== tune.shieldDmg || dmg(foes[1]) || book.sparks !== tune.shieldOrbs - 1) fail('the shield zaps');
run(5);
if (dmg(foes[0]) !== tune.shieldDmg * tune.shieldOrbs || book.sparks) fail('the shield spends its charges, one a second');
// Parafulmine: strikes the nearest within 9 m every rodEvery s, until it is gone
fresh();
foes = [foe(0, -7), foe(0, -12)];
book.rod();
run(3);
if (!dmg(foes[0]) || dmg(foes[1])) fail('the rod');
run(tune.rodTime);
const rodHits = dmg(foes[0]);
run(2);
if (book.rods.length || dmg(foes[0]) !== rodHits) fail('the rod goes');
// Burrasca: throws foes back 5 m, the boss barely
fresh();
foes = [foe(0, -3), { ...foe(3, 0), cc: control(REVERENDISSIMO.resist) }];
book.squall();
if (dmg(foes[0]) !== tune.squallDmg || Math.abs(foes[0].z + 8) > 0.3) fail(`the squall throws back: z ${foes[0].z}`);
if (!(foes[1].x < 5.5 && foes[1].x > 3.5)) fail(`the boss barely budges: x ${foes[1].x}`);
// Giudizio del Redentore; Giudizio ardente sets alight and burns brighter on the burning
fresh();
foes = [foe(0, -8)];
book.shoot('judge', { x: 0, y: 1.3, z: 0 });
run(0.6);
if (dmg(foes[0]) !== tune.judgeDmg || foes[0].cc!.burn > 0) fail('the judgment');
const ardent = new Grimoire(host, tuneOf(['judge', 'cero', 'fx_holyfire']));
hits.clear();
foes = [foe(0, -8)];
ardent.shoot('judge', { x: 0, y: 1.3, z: 0 });
for (let s = 0; s < 0.6; s += 1 / 30) ardent.update(1 / 30);
if (!(foes[0].cc!.burn > 0)) fail('Giudizio ardente sets alight');
hits.clear();
ardent.shoot('judge', { x: 0, y: 1.3, z: 0 });
for (let s = 0; s < 0.5; s += 1 / 30) ardent.update(1 / 30);
if (dmg(foes[0]) < tune.judgeDmg * 1.5) fail('Giudizio ardente on the burning');
// Martello della penitenza: a long stun, a third of it on the boss
fresh();
foes = [foe(0, -8)];
book.shoot('hammer', { x: 0, y: 1.3, z: 0 });
run(0.5);
near(foes[0].cc!.stun, tune.hammerStun, 'the hammer stuns', 0.05);
foes = [{ ...foe(0, -8), cc: control(REVERENDISSIMO.resist) }];
book.shoot('hammer', { x: 0, y: 1.3, z: 0 });
run(0.5);
if (foes[0].cc!.stun > tune.hammerStun * 0.36) fail(`the hammer on the boss: ${foes[0].cc!.stun} s`);
// Terra consacrata: hurts those on it and heals the hero standing on it
fresh();
host.stats.hp = 500;
foes = [foe(0, -2), foe(0, -9)];
book.hallow();
run(2);
within(dmg(foes[0]), 2 * tune.hallowDps, 'the consecrated ground burns');
if (dmg(foes[1]) || !(host.stats.hp > 500 + host.stats.hpMax * 0.015)) fail('the consecrated ground heals the hero on it');
// Miasma velenoso: a dose a second in the plague
const seep = new Grimoire(host, tuneOf(['spit', 'fx_venomcloud']));
foes = [foe(0, -20), foe(0, -8)];
for (let s = 0; s < 2.1; s += 1 / 30) seep.update(1 / 30);
if (seep.venom(foes[0]) !== 2 || seep.venom(foes[1])) fail('Miasma velenoso');
fresh();

// Walls: spells never pass through them (the captain's rule). A wall 6 m north of the hero, 2.5 m tall.
host.player.pos.x = 0; host.player.pos.y = 0; host.player.pos.z = 0; host.player.facing = 0;
const wall = world.add(0, -6, 6, 0.25, 0, 2.5);
near(world.ray(0, 1.2, 0, 0, 1.2, -12), (6 - 0.25) / 12, 'the ray stops at the wall face', 1e-6);
if (world.sees({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -12 }) || !world.sees({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 4 })) fail('line of sight');
hits.clear(); book.reset(); book.events.length = 0;
foes = [foe(0, -10)];
if (book.target() || book.why() !== 'Bersaglio non in vista.') fail(`a target behind a wall: ${book.why()}`); // the cast is refused before mana or cooldown
book.bolts.push({ kind: 'pyre', x: 0, y: 1.3, z: 0, to: foes[0], speed: 14, t: 0, dmg: 100 }); // a bolt already flying when the foe stepped behind it
run(1.5);
if (dmg(foes[0]) || !book.events.some((e) => e.type === 'wall') || book.bolts.length) fail('a bolt must burst on the wall');
foes = [foe(0, -4), foe(0, -9)]; // the chain can't jump through
book.chain({ x: 0, y: 1.3, z: 0 });
if (!dmg(foes[0]) || dmg(foes[1])) fail('the chain jumped through a wall');
hits.clear();
foes = [foe(0, -4.5), foe(0, -7.5)];
host.player.pos.z = -2;
book.font(); // 5 m frost nova: the foe past the wall stays free
if (!foes[0].cc!.root || foes[1].cc!.root || dmg(foes[1])) fail('the frost nova went through a wall');
const bolts2: Shadow[] = [{ x: 0, y: 1.6, z: -10, dmg: 50, speed: 13, life: 4, t: 0, hit: false }];
let through = 0;
for (let t = 0; t < 2; t += 1 / 60) through += casterFly(bolts2, { x: 0, y: 0, z: 0 }, 1 / 60, [], world);
if (through || bolts2.length) fail('a priest\'s bolt went through a wall');
// friars: a hoeing one doesn't hear the hero through the wall; one pinned chasing behind it gives up
const hoer = friar(0, -9); hoer.state = 'hoe'; hoer.mates.push(hoer);
friarThink(hoer, { x: 0, y: 0, z: -2 }, world, 0.05);
if (hoer.state !== 'hoe') fail('a friar pulled through a wall');
const pinned = friar(0, -7); pinned.mates.push(pinned);
let gaveUp = false;
for (let t = 0; t < FRIAR.blind + 0.5; t += 0.05) { friarThink(pinned, { x: 0, y: 0, z: -2 }, world, 0.05); gaveUp ||= pinned.state === 'evade'; }
if (!gaveUp) fail('a friar pinned behind a wall should give up');
// the orb bursts on the wall, the squall can't throw a foe through it, the miasma stops at it
hits.clear(); book.reset(); book.events.length = 0;
foes = [foe(0, -9)];
book.orb();
run(2);
if (book.orbs.length || dmg(foes[0]) || !book.events.some((e) => e.type === 'orb')) fail('the orb rolled through a wall');
foes = [foe(0, -4.5)];
host.player.pos.z = -2;
book.squall();
if (foes[0].z < -5.75 - 0.01) fail(`the squall threw a foe through a wall: z ${foes[0].z}`);
foes = [foe(0, -7)];
book.miasma();
if (book.venom(foes[0])) fail('the miasma went through a wall');
world.boxes.splice(world.boxes.indexOf(wall), 1);
host.player.pos.z = 0;

// Turbine d'ossa's parry takes its share off every blow while it whirls
const me = new PlayerStats();
me.guard = 0.1;
near(me.takeDamage(100), 100 * (1 - GUARD_CUT), 'the whirl parries');
me.update(0.2);
near(me.takeDamage(100), 100, 'the parry ends with the whirl');

console.log('spells ok (control, diminishing returns, boss resist, brains, bolts, chain, thunderbolt, leap, execute, poison, fever, drain, pillar, candle, furnace, blizzard, orb, shield, rod, squall, judgment, hammer, consecrated ground, fusions, walls, parry)');
