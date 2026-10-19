// Quest flow check (`npm run check`): Fra' Zuane's quest from first word to the fondamenta, on the
// real level's colliders. He is reachable from the spawn and talks at every stage; the chest stays
// sealed until his quest is accepted; then key -> grate -> boss -> out of the portone, the stage
// and the tracker's objective following each step. Fra' Bortolo in the serra: reachable in peace, blesses once.
import { buildLevel } from '../src/level/index.ts';
import { SPAWN } from '../src/level/plan.ts';
import { BLESSING, BOONS, CHEST, HEADS, NPC, QUESTS, Quest, RELIC_DROP, SPEZIALE, questXp, type Stage } from '../src/quest/progress.ts';
import { BORTOLO_OBJECTIVE, OBJECTIVE, RELIC_TALK, SPEZIALE_AGAIN, SPEZIALE_DONE, SPEZIALE_HEADS, SPEZIALE_RITE, SPEZIALE_TALK, spezialeWait, SPEZIALE_ZITELLE, SPEZIALE_ZITELLE_AGAIN, TALK } from '../src/quest/dialogue.ts';
import { FRIAR, GROUPS, MORE } from '../src/enemies/brain.ts';
import { DITALE, EXVOTO, ISEPPO, LETTER_DROP, SIDE, SIDE_BY, type SideId } from '../src/quest/squero.ts';
import { Bag, ITEM } from '../src/loot/bag.ts';
import { GONDOLIERE, PACKS, spawnLevel2 } from '../src/enemies/zitelle.ts';
import { killAll, rise } from '../src/enemies/caster.ts';
import { RISE } from '../src/enemies/brain.ts';

let failed = 0;
const fail = (why: string) => { failed++; console.error(`FAIL ${why}`); };
const level = buildLevel();
const quest = new Quest(level.world);
const want = (s: Stage) => { if (quest.stage !== s) fail(`stage ${quest.stage}, want ${s}`); };
const feet = (x: number, z: number) => ({ x, y: level.world.standHeight(x, z), z });

// He stands on open fondamenta, a few steps from the spawn, and the spawn is clear of him.
if (Math.hypot(NPC.x - SPAWN.x, NPC.z - SPAWN.z) > 6) fail("Fra' Zuane is too far from the spawn");
if (level.world.blocked(SPAWN.x, SPAWN.z, 0)) fail("Fra' Zuane's collider covers the spawn");
const facing = feet(NPC.x - 1.2, NPC.z + 0.6);
if (level.world.blocked(facing.x, facing.z, facing.y)) fail("no room to stand by Fra' Zuane");

// Every stage has his lines and an objective; the first offers the quest.
for (const s of ['talk', 'key', 'grate', 'boss', 'leave', 'report', 'offer', 'route', 'ospizio', 'church', 'boss2', 'return', 'done'] as Stage[]) {
  if (!TALK[s]?.pages.length || !OBJECTIVE[s]) fail(`stage ${s} has no lines or no objective`);
  for (const p of TALK[s].pages) if (p.length > 260) fail(`a page of ${s} is ${p.length} characters, too long for the window on a phone`);
}
if (!TALK.talk.offer || !TALK.report.offer || !TALK.offer.offer || Object.entries(TALK).some(([s, t]) => !['talk', 'report', 'offer'].includes(s) && t.offer)) fail('only the first conversation, the report and the re-offer offer a quest');

// Start: talk to him; the chest is sealed, and Fra' Bortolo cannot be found for a quest not yet given.
want('talk');
if (quest.meet() || quest.found) fail("Fra' Bortolo found before Fra' Zuane asked");
const talk = quest.prompt(facing);
if (!talk?.talk || !talk.act) fail("no 'talk' prompt next to Fra' Zuane");
const sealed = quest.prompt(feet(CHEST.x, CHEST.z + 1.2));
if (!sealed || sealed.act) fail('the chest opens before the quest is accepted');
quest.accepted = true; // Accetta in the dialogue window
want('key');

// The key, the grate, the boss, the way out.
const open = quest.prompt(feet(CHEST.x, CHEST.z + 1.2));
if (!open?.act) fail('the chest does not open once the quest is accepted');
open?.act?.();
if (!quest.key) fail('opening the chest gave no key');
if (quest.bonusXp !== questXp('chiave') || quest.done.join() !== 'chiave') fail('the key out of the chest is not a quest done');
// Fra' Bortolo, sought since Fra' Zuane's first quest: found once, paid once.
if (!BORTOLO_OBJECTIVE || !quest.meet() || quest.meet() || quest.bonusXp !== questXp('chiave') + questXp('bortolo')) fail("finding Fra' Bortolo does not pay its reward exactly once");
want('grate');
const grate = quest.gates.find((g) => g.id === 'grata-nord')!, c = quest.centre(grate);
const at = quest.prompt(feet(c.x, c.z + 1.2));
if (!at?.act) fail('the key does not open the grate of the chiostro grande');
at?.act?.();
want('boss');
for (const g of quest.gates) if (g.needs === 'key') quest.open(g);
quest.win();
want('leave');
if (quest.update(feet(0, -20))) fail('the quest ended inside the church');
want('leave');
if (!quest.update(feet(0, 12))) fail('walking out of the portone did not end the quest');
want('report');
if (!quest.prompt(facing)?.talk) fail("Fra' Zuane has nothing to say once the Reverendissimo is dead");

// Level 2: the report pays once; declining leaves the offer open; accepting drops the chains.
const xp0 = quest.bonusXp;
if (!quest.report() || quest.report() || quest.bonusXp !== xp0 + questXp('reverendissimo')) fail('the report to Fra\' Zuane does not pay its reward exactly once');
want('offer');
const chains = quest.gate('catene');
if (chains.open || quest.prompt(feet(-55, 15))?.act) fail('the chains on the Ponte de la Croce open before the second quest');
quest.accept2();
if (!chains.open) fail('accepting La dote delle Zitelle did not drop the chains');
want('route');
if (quest.update(feet(-150, 15))) fail('arrived at the Zitelle halfway along the fondamenta');
if (!quest.update(feet(-220, 5))) fail('reaching the sagrato of the Zitelle did not count');
want('ospizio');
const back = quest.gate('coro-zitelle'), bc = quest.centre(back);
const shut = quest.prompt({ x: bc.x, y: 0.8, z: bc.z + 1.2 });
if (!shut || shut.act) fail("the Zitelle's back door opens without the Maestra's key");
quest.takeKey2();
want('church');
const opening = quest.prompt({ x: bc.x, y: 0.8, z: bc.z - 1.2 });
if (!opening?.act) fail("the Maestra's key does not open the Zitelle's back door");
opening?.act?.();
want('boss2');
if (quest.gate('portone-zitelle').open) fail("the Zitelle's portone opened before the Governatrice fell");
quest.win2();
if (!quest.gate('portone-zitelle').open) fail("the Governatrice's death did not open the Zitelle's portone");
want('return');
if (!quest.report2() || quest.report2() || quest.bonusXp !== xp0 + questXp('reverendissimo') + questXp('zitelle')) fail('the second report does not pay its reward exactly once');
want('done');
if (quest.done.join() !== 'chiave,bortolo,reverendissimo,zitelle') fail(`quests done ${quest.done}`);
// Every quest is worth most of a level where it lands, and a boss handed in more than one (player/levels.ts need: 20 × level).
for (const [id, lv] of [['chiave', 5], ['bortolo', 5], ['teste', 7], ['relic', 8], ['reverendissimo', 10], ['zitelle', 14]] as const) {
  if (QUESTS[id].xp < 0.6 * 20 * lv || QUESTS[id].gold <= 0) fail(`${id} pays ${QUESTS[id].xp} XP, under most of level ${lv}`);
}
if (!quest.prompt(facing)?.talk) fail("Fra' Zuane has nothing to say once it is over");

// Fra' Bortolo in the serra: out of every friar's pull, talks at any time, blesses once.
const bortolo = feet(SPEZIALE.x, SPEZIALE.z - 1.2);
if (level.world.blocked(bortolo.x, bortolo.z, bortolo.y)) fail("no room to stand by Fra' Bortolo");
if (quest.prompt(bortolo)?.talk !== 'speziale') fail("no 'talk' prompt next to Fra' Bortolo");
for (const [x, z] of [...GROUPS, ...MORE].flat()) if (Math.hypot(x - bortolo.x, z - bortolo.z) < FRIAR.aggro + 1) fail(`a friar at (${x}, ${z}) hoes within reach of Fra' Bortolo`);
for (const t of [SPEZIALE_HEADS, SPEZIALE_RITE, spezialeWait(11, 12), SPEZIALE_TALK, SPEZIALE_AGAIN, SPEZIALE_DONE, SPEZIALE_ZITELLE, SPEZIALE_ZITELLE_AGAIN]) for (const p of t.pages) if (p.length > 260) fail(`a page of Fra' Bortolo is ${p.length} characters, too long for the window on a phone`);
if (quest.castMul !== 1 || quest.dmgMul !== 1) fail('blessed before talking to Fra\' Bortolo');
if (!quest.bless() || quest.castMul !== BLESSING.cast || quest.dmgMul !== BLESSING.dmg) fail('the blessing does not quicken casts and harden blows');
if (quest.bless()) fail('the blessing was given twice');
quest.blessLeft = 0;
if (quest.castMul !== 1 || quest.dmgMul !== 1) fail('the blessing outlived its time');

// Fra' Zuane's corona: rarer than nothing at first, more likely with each kill, sure with the key in hand; never once found.
const unlucky = new Quest(buildLevel().world), never = () => 0.999999;
let kills = 0;
while (!unlucky.rollRelic(never) && kills < 1000) kills++;
if (kills !== Math.ceil((1 - RELIC_DROP.base) / RELIC_DROP.ramp)) fail(`the corona's bad-luck ramp ends after ${kills} kills`);
const keyed = new Quest(buildLevel().world);
keyed.takeKey();
if (!keyed.rollRelic(never)) fail('the corona is not sure once the key is in hand');
let runs = 0;
for (let r = 0, s = 7; r < 1000; r++) { // seeded: how many runs have it by the 20th kill
  const q = new Quest(level.world), rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 20; k++) if (q.rollRelic(rnd)) { runs++; break; }
}
if (runs < 850 || runs > 970) fail(`the corona falls by the 20th kill in ${runs / 10}% of runs`);
keyed.relic = true;
if (keyed.rollRelic(never)) fail('the corona dropped twice');
const xp1 = keyed.bonusXp;
if (!keyed.returnRelic() || keyed.returnRelic() || keyed.bonusXp !== xp1 + questXp('relic')) fail('giving the corona back does not pay exactly once');
for (const p of RELIC_TALK.pages) if (p.length > 260) fail(`a page of the corona is ${p.length} characters, too long for the window on a phone`);

// Le teste dei frati: no heads before he asks; 12 out of the orto's friars, the last ones always paying; the rite once, for its XP.
const h = new Quest(buildLevel().world), friars = [...GROUPS, ...MORE].flat().length;
if (friars < HEADS.need * 2) fail(`only ${friars} friars in the orto for ${HEADS.need} heads`);
if (h.headDrop(friars - 1, 0, () => 0)) fail('a head dropped before Fra\' Bortolo asked');
h.asked = true;
for (let alive = friars - 1; alive >= 0; alive--) if (h.headDrop(alive, 0, () => 0.99)) h.heads++; // the worst luck there is
if (h.heads !== HEADS.need) fail(`the worst luck brought ${h.heads} heads, not ${HEADS.need}`);
if (h.headDrop(5, 0, () => 0)) fail('a head dropped past the need');
const hxp = h.bonusXp;
if (h.rite('nope') || !h.rite(BOONS[0].id) || h.rite(BOONS[1].id) || h.boon !== BOONS[0].id || h.bonusXp !== hxp + questXp('teste') || h.headsReady(0)) fail('the rite does not grant one boon and its XP exactly once');
const h2 = new Quest(buildLevel().world);
h2.asked = true; h2.heads = 3;
if (h2.headsNeed(friars) !== HEADS.need || h2.headsNeed(0) !== 3 || !h2.headsReady(0)) fail('with the friars gone, the heads in hand do not do');


// Mastro Iseppo in the squero: room to stand by him out of every pack's pull, his find spots standable, the chain and the letter
// paid once each with their epic, kill and collect quests not stranded once the Governatrice is dead, his state saved.
const iseppo = feet(ISEPPO.x, ISEPPO.z + 1.2);
if (level.world.blocked(iseppo.x, iseppo.z, iseppo.y) || level.areaAt(ISEPPO.x, ISEPPO.z)?.label !== 'Squero') fail('no room to stand by Mastro Iseppo in the squero');
for (const pk of PACKS) for (const [k, x, z] of pk.members) if (Math.hypot(x - iseppo.x, z - iseppo.z) < k.aggro + 0.5) fail(`a mob at (${x}, ${z}) is within its pull of Mastro Iseppo`);
const sq = new Quest(level.world), side = sq.side, bag = new Bag();
side.bag = bag;
if (sq.prompt(iseppo)?.talk !== 'iseppo') fail("no 'talk' prompt next to Mastro Iseppo");
for (const q of SIDE) {
  for (const p of [...q.offer, q.busy, ...q.done]) if (p.length > 260) fail(`a page of ${q.id} is ${p.length} characters, too long for the window on a phone`);
  if (QUESTS[q.id].xp < 0.6 * 20 * 11) fail(`${q.id} pays ${QUESTS[q.id].xp} XP, under most of level 11`);
  if (!ITEM.get(q.reward)?.slot || ITEM.get(q.reward)!.rarity !== 'epico' || !ITEM.get(q.reward)!.l2 || !QUESTS[q.id]) fail(`${q.id} does not reward one of level 2's epics`);
  if ('item' in q.want && !ITEM.get(q.want.item)?.quest) fail(`${q.id} wants ${q.want.item}, not a quest item`);
}
if (new Set(SIDE.map((q) => q.reward)).size !== SIDE.length) fail('two of his quests give the same epic');
const spot = (at: { x: number; y: number; z: number }, dx = -1) => { const f = { x: at.x + dx, y: level.world.standHeight(at.x + dx, at.z), z: at.z }; if (level.world.blocked(f.x, f.z, f.y) || Math.abs(f.y - at.y) > 0.5) fail(`no room to stand by the find spot (${at.x}, ${at.z})`); return f; };
const ditale = spot(DITALE, 1), exvoto = spot(EXVOTO); // the thimble under a bed by the dormitory's -X wall, from the room's side
if (sq.prompt(ditale)?.act) fail("Marieta's thimble can be picked up before its quest");
const take = () => { const t = side.talk(); if (!t.accept) fail(`he offers nothing: ${t.talk.pages[0].slice(0, 40)}`); t.accept?.(); return t.talk.title; };
const hand = (id: SideId) => { const xp = sq.bonusXp, t = side.talk(); if (t.paid?.id !== id) fail(`${id} is not handed in (${t.paid?.id})`); else if (sq.bonusXp !== xp + QUESTS[id].xp || !sq.done.includes(id) || !bag.count(t.paid.reward)) fail(`${id} does not pay its XP and its epic through Quest.complete`); };
const order: string[] = [];
order.push(take()!, take()!); // the two openers at once
if (side.open().length) fail('a quest further down the chain is offered before its first step is done');
for (let i = 0; i < 100 && bag.count('ferro-iseppo') < 6; i++) { const it = side.loot('gondoliere', () => 0, false, () => 0); if (it) bag.add(it); }
if (bag.count('ferro-iseppo') !== 6 || side.loot('gondoliere', () => 0, false, () => 0)) fail('the drowned do not drop exactly the six ferri wanted');
hand('ferri');
for (let i = 0; i < 5; i++) side.killed('codega');
if (side.ready(SIDE_BY.get('lumi')!)) fail('five codeghe were enough for six');
if (!side.ready(SIDE_BY.get('lumi')!, true)) fail('the codeghe quest is stranded once the Governatrice is dead');
side.killed('codega');
const room = bag.items.length;
for (let i = room; i < Bag.SLOTS; i++) bag.items.push({ id: 'canapa-testa', n: 1 }); // a full bag: no room for the epic
if (side.talk().paid || !side.active('lumi')) fail('a quest was handed in with no room for its reward');
bag.items.length = room;
hand('lumi');
order.push(take()!, take()!);
if (side.tokens().map((t) => t.from).join() !== 'gastaldo') fail("the Gastaldo's head is not wanted off his body");
bag.add('testa-gastaldo');
hand('gastaldo');
const pick = sq.prompt(ditale);
if (!pick?.act) fail("no prompt to pick up Marieta's thimble under her bed");
pick?.act?.();
hand('ditale');
order.push(take()!, take()!);
bag.add('forbici-maestra');
hand('maestra');
if (sq.prompt(exvoto)?.act?.() !== "Hai trovato l'ex voto di Mastro Iseppo") fail('the ex voto cannot be picked up in the Redentore');
hand('exvoto');
if (side.open().length || side.handInReady() || sq.marks(0).iseppo) fail('he still has something once the chain is done');
let zk = 0;
while (!side.loot('zitella', () => 0, false, never) && zk < 1000) zk++;
if (zk !== Math.ceil((1 - LETTER_DROP.base) / LETTER_DROP.ramp)) fail(`the letter's bad-luck ramp ends after ${zk} kills`);
if (side.loot('zitella', () => 1, true, never)) fail('a second letter falls while one lies on the ground');
bag.add('lettera-marieta');
if (side.update()?.id !== 'lettera' || side.update()) fail('picking up the letter does not start its quest once');
hand('lettera');
const total = SIDE.reduce((n, q) => n + QUESTS[q.id].xp, 0);
if (sq.bonusXp !== total) fail(`his quests pay ${sq.bonusXp} XP, want ${total}`);
const copy = new Quest(level.world);
copy.side.decode(JSON.parse(JSON.stringify(side.encode())));
if (copy.side.done.length !== SIDE.length || copy.side.taken.length) fail("his quests don't survive a save");
copy.side.decode({ taken: ['lumi', 'nope'], done: ['ferri', 'lumi'], kills: { lumi: 3, nope: 2 } });
if (copy.side.taken.length || copy.side.done.join() !== 'ferri,lumi' || Object.keys(copy.side.kills).length) fail('a saved side state from another build is not cleaned');

// The drowned rise again like the orto's friars: late, out of the hero's way, at their spot, worth less.
const l2 = spawnLevel2(level.world), g0 = l2.all.find((m) => m.kind === GONDOLIERE)!;
// The markers (Quest.marks): "!" on offer, "?" ready to hand in, "?" over "!", none when idle.
{
  const q = new Quest(level.world), m = () => q.marks(1), is = (who: 'zuane' | 'speziale' | 'iseppo', w: string | undefined, why: string) => { if (m()[who] !== w) fail(`${who} shows ${m()[who]}, want ${w}: ${why}`); };
  is('zuane', 'offer', 'his first quest'); is('speziale', 'offer', 'his blessing'); is('iseppo', 'offer', 'his first quest');
  q.accepted = q.blessed = true;
  is('zuane', undefined, 'quest running'); is('speziale', 'ready', 'found, as Fra\' Zuane asked');
  q.found = true; q.asked = true; q.heads = HEADS.need;
  is('speziale', 'ready', 'the heads in hand');
  q.boon = 'vigore';
  is('speziale', undefined, 'nothing left for him');
  q.relic = true;
  is('zuane', 'ready', 'the corona in hand');
  q.relicBack = q.key = q.bossDead = q.out = true;
  for (const g of q.gates) q.open(g);
  is('zuane', 'ready', 'the first quest to report');
  q.reported = true;
  is('zuane', 'offer', 'the second quest');
  const b = new Bag(); q.side.bag = b; q.side.taken.push('lumi'); q.side.kills.lumi = 99;
  is('iseppo', 'ready', '"?" over "!" with a quest done and another on offer');
}
const far = { x: g0.home.x + RISE.away + 5, y: 0, z: g0.home.z }, near = { x: g0.home.x + 5, y: 0, z: g0.home.z };
g0.x += 3;
killAll([g0]);
if (rise(g0, far, level.world, () => 0)) fail('a gondoliere rose at once');
g0.t = RISE.after[0] + 1;
if (rise(g0, near, level.world)) fail("a gondoliere rose in the hero's way");
if (!rise(g0, far, level.world) || g0.state !== 'pray' || g0.hp !== GONDOLIERE.hp || g0.x !== g0.home.x || !g0.again) fail('a dead gondoliere did not rise at his spot, marked as risen');

console.log(`quest ok: corona by kill 20 in ${runs / 10}% of runs; `
  + `Mastro Iseppo's ${SIDE.length} quests (${order.join(', ')}, La lettera di Marieta) for ${total} XP; `
  + `talk -> key -> grate -> boss -> leave -> report -> offer -> route -> ospizio -> church -> boss2 -> return -> done, Fra' Bortolo blesses once and takes ${HEADS.need} heads`);
if (failed) {
  console.error(`${failed} quest check(s) failed`);
  process.exit(1);
}
