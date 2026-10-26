// Quest flow check (`npm run check`): Fra' Zuane's quest from first word to the fondamenta, on the
// real level's colliders. He is reachable from the spawn and talks at every stage; the chest stays
// sealed until his quest is accepted; then key -> grate -> boss -> out of the portone, the stage
// and the tracker's objective following each step. Fra' Bortolo in the serra: reachable in peace, blesses once.
import { buildLevel } from '../src/level/index.ts';
import { SPAWN } from '../src/level/plan.ts';
import { BERTHS, BLESSING, BOONS, CHEST, HEADS, NPC, QUESTS, Quest, RELIC_DROP, SPEZIALE, questXp, type Stage } from '../src/quest/progress.ts';
import { BORTOLO_OBJECTIVE, OBJECTIVE, RELIC_TALK, SPEZIALE_AGAIN, SPEZIALE_DONE, SPEZIALE_HEADS, SPEZIALE_RITE, SPEZIALE_TALK, spezialeWait, SPEZIALE_SANGIORGIO, SPEZIALE_SANGIORGIO_AGAIN, SPEZIALE_ZITELLE, SPEZIALE_ZITELLE_AGAIN, TALK } from '../src/quest/dialogue.ts';
import { FRIAR, GROUPS, MORE } from '../src/enemies/brain.ts';
import { CARDINALE, DITALE, EXVOTO, SCHEDA, FARI, FARI_LIT, GIVERS, LAVABI, MUTE, POZZO, STRUMENTI, TELA, VINO, ISEPPO, LETTER_DROP, SIDE as ALL_SIDE, SIDE_BY, giverOf, type Giver, type SideId } from '../src/quest/squero.ts';
import { ABATE, CAMPANARO, COMMISSARIO, GRANATIERE, PACKS as PACKS3, due, prepare, spawnLevel3 } from '../src/enemies/sangiorgio.ts';
import { BELFRY, BELLS, CAMPANILE } from '../src/level/zones/sangiorgio.ts';
import { SHOP } from '../src/loot/gear.ts';
import { roll } from '../src/loot/bag.ts';
import { Bag, ITEM } from '../src/loot/bag.ts';
import { GONDOLIERE, PACKS, spawnLevel2 } from '../src/enemies/zitelle.ts';
import { killAll, rise } from '../src/enemies/caster.ts';
import { RISE } from '../src/enemies/brain.ts';

const SIDE = ALL_SIDE.filter((q) => giverOf(q) === 'iseppo'); // Mastro Iseppo's in the squero; San Giorgio's below
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
for (const s of ['talk', 'key', 'grate', 'boss', 'leave', 'report', 'offer', 'route', 'ospizio', 'church', 'boss2', 'return', 'offer3', 'route3', 'biblioteca', 'veronese', 'cenacolo', 'boss3', 'return3', 'done'] as Stage[]) {
  if (!TALK[s]?.pages.length || !OBJECTIVE[s]) fail(`stage ${s} has no lines or no objective`);
  for (const p of TALK[s].pages) if (p.length > 260) fail(`a page of ${s} is ${p.length} characters, too long for the window on a phone`);
}
if (!TALK.talk.offer || !TALK.report.offer || !TALK.offer.offer || !TALK.offer3.offer || Object.entries(TALK).some(([s, t]) => !['talk', 'report', 'offer', 'offer3'].includes(s) && t.offer)) fail('only the first conversation, the report, the re-offer and the third offer offer a quest');

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
want('offer3');

// Level 3: the third offer drops the chain past the Tre Oci; the gondola is boarded at the Punta, sets the hero on San
// Giorgio, the Bibliotecario's key and the Nozze back from the Veronese open the Cenacolo (neither alone does), the Abate's
// death its garden door, and the report pays once.
const chain3 = quest.gate('catene-punta');
if (chain3.open || quest.ferry(feet(BERTHS.punta.x, BERTHS.punta.z))) fail('the chain past the Tre Oci or the gondola open before the third quest');
quest.accept3();
if (!chain3.open) fail('accepting Le nozze di San Giorgio did not drop the chain');
want('route3');
const out = quest.prompt(feet(BERTHS.punta.x, BERTHS.punta.z));
if (out?.ferry !== 'out' || !out.act) fail("no gondola to San Giorgio at the Punta's berth");
if (quest.update(feet(-400, 10))) fail('landed on San Giorgio from the Punta');
if (!quest.update(feet(-437.5, 100))) fail("the gondola's landing on the approdo did not count");
want('biblioteca');
if (quest.prompt(feet(BERTHS.sangiorgio.x, BERTHS.sangiorgio.z))?.ferry !== 'back') fail('no gondola back to the Punta before the Abate falls');
const cen = quest.gate('cenacolo'), cc = quest.centre(cen);
const shut3 = quest.prompt({ x: cc.x, y: 0, z: cc.z + 1.2 });
if (!shut3 || shut3.act) fail('the Cenacolo opens without the Bibliotecario\'s key');
quest.takeKey3();
want('veronese');
const keyed3 = quest.prompt({ x: cc.x, y: 0, z: cc.z + 1.2 });
if (!keyed3 || keyed3.act) fail('the Cenacolo opens with the key but without the Nozze di Cana back');
quest.side.done.push('tela'); // La tela tagliata handed in (played below, on its own Quest)
want('cenacolo');
const opening3 = quest.prompt({ x: cc.x, y: 0, z: cc.z + 1.2 });
if (!opening3?.act) fail("the Bibliotecario's key does not open the Cenacolo");
opening3?.act?.();
want('boss3');
if (quest.gate('cenacolo-orto').open) fail("the Cenacolo's garden door opened before the Abate fell");
quest.win3();
if (!quest.gate('cenacolo-orto').open) fail("the Abate's death did not open the garden door");
want('return3');
if (quest.prompt(feet(BERTHS.sangiorgio.x, BERTHS.sangiorgio.z))?.ferry !== 'home') fail('the gondola does not row home once the Abate is dead');
const xp3 = quest.bonusXp;
if (!quest.report3() || quest.report3() || quest.bonusXp !== xp3 + questXp('sangiorgio')) fail('the third report does not pay its reward exactly once');
want('done');
if (quest.done.join() !== 'chiave,bortolo,reverendissimo,zitelle,sangiorgio') fail(`quests done ${quest.done}`);
{ // A game saved past the Cenacolo's door before the Veronese's chain existed: its door stays open, the Abate is next.
  const old = new Quest(level.world);
  old.accepted = old.key = old.bossDead = old.out = old.reported = old.accepted2 = old.arrived = old.key2 = old.boss2Dead = old.reported2 = old.accepted3 = old.landed = old.key3 = true;
  for (const g of old.gates) if (g.needs !== 'boss3') old.open(g);
  if (old.stage !== 'boss3' || old.checkpoint() !== quest.checkpoint()) fail(`a save past the Cenacolo's door without the canvas is at ${old.stage}`);
  const fresh = new Quest(level.world);
  fresh.side.done.push('tela');
  if (fresh.canvas !== true || new Quest(level.world).canvas) fail('the Nozze are not back exactly when La tela tagliata is handed in');
}
// Every quest is worth most of a level where it lands, and a boss handed in more than one (player/levels.ts need: 20 × level).
for (const [id, lv] of [['chiave', 5], ['bortolo', 5], ['teste', 7], ['relic', 8], ['reverendissimo', 10], ['zitelle', 14], ['sangiorgio', 17]] as const) {
  if (QUESTS[id].xp < 0.6 * 20 * lv || QUESTS[id].gold <= 0) fail(`${id} pays ${QUESTS[id].xp} XP, under most of level ${lv}`);
}
if (!quest.prompt(facing)?.talk) fail("Fra' Zuane has nothing to say once it is over");

// Fra' Bortolo in the serra: out of every friar's pull, talks at any time, blesses once.
const bortolo = feet(SPEZIALE.x, SPEZIALE.z - 1.2);
if (level.world.blocked(bortolo.x, bortolo.z, bortolo.y)) fail("no room to stand by Fra' Bortolo");
if (quest.prompt(bortolo)?.talk !== 'speziale') fail("no 'talk' prompt next to Fra' Bortolo");
for (const [x, z] of [...GROUPS, ...MORE].flat()) if (Math.hypot(x - bortolo.x, z - bortolo.z) < FRIAR.aggro + 1) fail(`a friar at (${x}, ${z}) hoes within reach of Fra' Bortolo`);
for (const t of [SPEZIALE_HEADS, SPEZIALE_RITE, spezialeWait(11, 12), SPEZIALE_TALK, SPEZIALE_AGAIN, SPEZIALE_DONE, SPEZIALE_ZITELLE, SPEZIALE_ZITELLE_AGAIN, SPEZIALE_SANGIORGIO, SPEZIALE_SANGIORGIO_AGAIN]) for (const p of t.pages) if (p.length > 260) fail(`a page of Fra' Bortolo is ${p.length} characters, too long for the window on a phone`);
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
  if (!ITEM.get(q.reward!)?.slot || ITEM.get(q.reward!)!.rarity !== 'epico' || !ITEM.get(q.reward!)!.l2 || !QUESTS[q.id]) fail(`${q.id} does not reward one of level 2's epics`);
  if ('item' in q.want && !ITEM.get(q.want.item)?.quest) fail(`${q.id} wants ${q.want.item}, not a quest item`);
}
if (new Set(SIDE.map((q) => q.reward)).size !== SIDE.length) fail('two of his quests give the same epic');
const spot = (at: { x: number; y: number; z: number }, dx = -1) => { const f = { x: at.x + dx, y: level.world.standHeight(at.x + dx, at.z), z: at.z }; if (level.world.blocked(f.x, f.z, f.y) || Math.abs(f.y - at.y) > 0.5) fail(`no room to stand by the find spot (${at.x}, ${at.z})`); return f; };
const ditale = spot(DITALE, 1), exvoto = spot(EXVOTO); // the thimble under a bed by the dormitory's -X wall, from the room's side
if (sq.prompt(ditale)?.act) fail("Marieta's thimble can be picked up before its quest");
const take = () => { const t = side.talk(); if (!t.accept) fail(`he offers nothing: ${t.talk.pages[0].slice(0, 40)}`); t.accept?.(); return t.talk.title; };
const hand = (id: SideId) => { const xp = sq.bonusXp, t = side.talk(); if (t.paid?.id !== id) fail(`${id} is not handed in (${t.paid?.id})`); else if (sq.bonusXp !== xp + QUESTS[id].xp || !sq.done.includes(id) || !bag.count(t.paid.reward!)) fail(`${id} does not pay its XP and its epic through Quest.complete`); };
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

// San Giorgio's givers (quest/squero.ts GIVERS): Iseppo on the approdo and the Fanalista, each with room by him out of
// every pack's pull, shown once the third quest is taken; I marinai della Riva counted to ten (and not stranded once the
// Abate is dead), I fari della darsena in its steps (oil, two lamps that burn it, the Nostromo's snuffer), its wave asleep
// after the Abate in the saved order, its weakening laid on the Abate, both rewards unique; all of it saved mid-step. Padre
// Archivista's Acqua di San Benedetto: wine at the well wakes the cellar's monks (only they count), water drawn again, one
// jug a lavabo in order, ready once poured (saved past the last step), the Calice weakened. The Veronese's chain: the four
// instruments in any order, each by its pack, then the Commissario woken at rest by La tela tagliata and his granatieri at
// half his health, the canvas off his body, the Nozze back.
{
  const l3 = spawnLevel3(level.world), q = new Quest(level.world), s = q.side, b = new Bag();
  s.bag = b;
  for (const g of ['riva', 'fanalista', 'archivista', 'veronese', 'cardinale'] as Giver[]) {
    const at = GIVERS[g].at, by = feet(at.x + Math.sin(at.yaw) * -1.2, at.z + Math.cos(at.yaw) * -1.2); // a step in front of him
    if (level.world.blocked(by.x, by.z, by.y) || q.prompt(by)?.talk !== g) fail(`no room to talk to ${g} in front of him`);
    for (const pk of PACKS3) if (!pk.hidden) for (const [k, x, z] of pk.members) if (Math.hypot(x - at.x, z - at.z) < k.aggro + 0.5) fail(`a mob at (${x}, ${z}) is within its pull of ${g}`);
    if (q.marks(0)[g]) fail(`${g} shows a marker before the third quest`);
  }
  for (const at of [BERTHS.sangiorgio]) if (q.prompt({ ...at, y: 0 })?.talk) fail('a giver takes the gondola\'s prompt at the San Giorgio berth');
  const lamps = FARI.map((at) => { const f = feet(at.x, at.z); if (level.world.blocked(f.x, f.z, f.y) || Math.abs(f.y - at.y) > 0.5) fail(`no room by the lamp (${at.x}, ${at.z})`); return f; });
  const well = feet(POZZO.x + 1.6, POZZO.z), basins = LAVABI.map((at) => feet(at.x + Math.sign(-530 - at.x) * 1.6, at.z)); // by the well's rim, before each basin
  for (const f of [well, ...basins]) if (level.world.blocked(f.x, f.z, f.y)) fail(`no room by the well or a lavabo (${f.x}, ${f.z})`);
  const hidden = l3.hidden.flatMap((h) => h.members), awake = l3.all.filter((m) => !hidden.includes(m));
  if (!hidden.length || hidden.some((m) => m.state !== 'dead') || l3.all.indexOf(l3.boss) !== awake.length - 1 || l3.all.slice(-hidden.length).some((m) => !hidden.includes(m))) fail('the hidden packs are not asleep after the Abate, at the end of the saved order');
  q.accepted3 = true;
  if (q.marks(0).riva !== 'offer' || q.marks(0).fanalista !== 'offer') fail('San Giorgio\'s givers show no "!" once the third quest is taken');
  const take = (g: Giver) => { const t = s.talk(g); if (!t.accept) fail(`${g} offers nothing`); t.accept?.(); };
  const hand = (g: Giver, id: SideId) => { const xp = q.bonusXp, t = s.talk(g); if (t.paid?.id !== id || q.bonusXp !== xp + QUESTS[id].xp || (t.paid.reward && !b.count(t.paid.reward))) fail(`${id} is not handed in to ${g} with its XP and reward`); };
  take('riva');
  for (let i = 0; i < 9; i++) s.killed('marinaio');
  s.killed('monaco');
  if (s.ready(SIDE_BY.get('marinai')!)) fail('nine marinai were enough for ten');
  q.boss3Dead = true;
  if (!s.ready(SIDE_BY.get('marinai')!)) fail('I marinai della Riva is stranded once the Abate is dead');
  q.boss3Dead = false;
  s.killed('marinaio');
  hand('riva', 'marinai');
  take('fanalista');
  if (q.prompt(lamps[0])?.act) fail('the west lamp can be lit before the oil is in hand');
  for (let i = 0; i < 100 && b.count('ampolla-faro') < 5; i++) { const it = s.loot('marinaio', () => 0, false, () => 0); if (it) b.add(it); }
  if (b.count('ampolla-faro') !== 5 || s.loot('marinaio', () => 0, false, () => 0)) fail('the drowned do not drop exactly the five ampolle wanted');
  s.update();
  if (q.prompt(lamps[1])?.act) fail('the east lamp can be lit before the west one');
  const copy = new Quest(level.world);
  q.prompt(lamps[0])?.act?.();
  if (b.count('ampolla-faro') !== 2 || s.reached('fari', FARI_LIT)) fail(`the west lamp burnt ${5 - b.count('ampolla-faro')} ampolle, want 3`);
  copy.side.decode(JSON.parse(JSON.stringify(s.encode())));
  if (copy.side.step(SIDE_BY.get('fari')!) !== 2) fail('a quest in steps does not keep its step across a save');
  copy.side.decode({ taken: ['fari'], done: [], steps: { fari: 9, nope: 1 } });
  if (Object.keys(copy.side.steps).length) fail('a saved step past the last, or of a quest unknown, is kept');
  q.prompt(lamps[1])?.act?.();
  if (b.count('ampolla-faro') || !s.reached('fari', FARI_LIT) || s.tokens().map((t) => t.from).join() !== 'nostromo') fail("both lamps lit do not wake the wave and want the Nostromo's snuffer");
  if (s.ready(SIDE_BY.get('fari')!)) fail('I fari della darsena is ready before the Nostromo');
  b.add('spegnimoccolo');
  if (q.preps().length) fail('the Abate is weakened before the Fanalista is paid');
  hand('fanalista', 'fari');
  if (b.count('spegnimoccolo') || q.preps().join() !== 'faro') fail('the Fanalista keeps no snuffer or gives no weakening');
  prepare(q.preps());
  const isles = ABATE.tide!.n;
  prepare([]);
  if (isles !== ABATE.tide!.n + 1) fail(`the lantern leaves ${isles} islands, ${ABATE.tide!.n} without it`);
  if (q.marks(0).riva || q.marks(0).fanalista) fail("San Giorgio's givers still have something once their quests are done");
  take('archivista');
  if (q.prompt(basins[0])?.act) fail('a lavabo takes water before the well is drawn');
  q.prompt(well)?.act?.();
  if (!s.reached('acqua', VINO) || !l3.hidden.some((h) => h.pack.hidden!.quest === 'acqua' && h.pack.hidden!.step === VINO && h.members.length === 3)) fail('wine drawn does not wake the three cellar monks');
  for (let i = 0; i < 3; i++) s.killed('monaco');
  s.update();
  if (s.step(SIDE_BY.get('acqua')!) !== VINO) fail('monks off other packs count for the cellar three');
  for (let i = 0; i < 3; i++) s.killed('monaco', 'acqua');
  s.update();
  if (q.prompt(basins[0])?.act) fail('a lavabo takes water before the well is drawn again');
  q.prompt(well)?.act?.();
  if (b.count('acqua-allori') !== 2) fail(`the well gave ${b.count('acqua-allori')} jugs, want 2`);
  if (q.prompt(basins[1])?.act) fail('the east lavabo takes water before the west one');
  q.prompt(basins[0])?.act?.();
  q.prompt(basins[1])?.act?.();
  const acqua = SIDE_BY.get('acqua')!;
  if (b.count('acqua-allori') || !s.ready(acqua) || s.spots().length) fail('both lavabi filled do not make Acqua di San Benedetto ready');
  copy.side.decode(JSON.parse(JSON.stringify(s.encode())));
  if (!copy.side.ready(acqua)) fail('Acqua di San Benedetto is not ready after a save past its last lavabo');
  copy.side.decode({ taken: ['acqua'], done: [], steps: { acqua: 6 } });
  if (Object.keys(copy.side.steps).length) fail('a saved step past Acqua di San Benedetto\'s end is kept');
  hand('archivista', 'acqua');
  if (q.preps().join() !== 'faro,calice') fail(`the weakenings earned are ${q.preps()}, want faro,calice`);
  prepare(['calice']);
  const cup = ABATE.pour!.damage;
  prepare([]);
  if (cup !== Math.round(ABATE.pour!.damage * 0.6)) fail(`the Calice pours ${cup} with the ampolle, ${ABATE.pour!.damage} without`);
  if (q.marks(0).archivista !== 'offer') fail('Padre Archivista offers nothing once Acqua di San Benedetto is done (Rintocchi muti follows it)');
  // Rintocchi muti: the stair up and down, the three clappers in order (saved mid-way), then the Campanaro woken on the chamber's
  // floor (only he counts), the Abate's bells a ring short once it is handed in.
  const door = feet(CAMPANILE.door.x, CAMPANILE.door.z), hatch = feet(CAMPANILE.hatch.x, CAMPANILE.hatch.z), up = feet(CAMPANILE.top.x, CAMPANILE.top.z);
  if (new Quest(level.world).prompt(door)?.climb) fail('the campanile opens before the third quest is taken');
  if (Math.abs(up.y - BELFRY.y) > 0.05 || Math.abs(hatch.y - BELFRY.y) > 0.05 || door.y > 0.5) fail(`the stair lands at ${up.y} m up and ${door.y} m down, want ${BELFRY.y} and the campo`);
  if (q.prompt(door)?.climb !== CAMPANILE.top || q.prompt(hatch)?.climb !== CAMPANILE.door || q.prompt(up)?.climb) fail('the campanile\'s door does not lead up and its hatch down (or the landing is on the hatch)');
  const bells = BELLS.map((bl) => { const f = feet(bl.at.x, bl.at.z); if (level.world.blocked(f.x, f.z, f.y) || Math.abs(f.y - BELFRY.y) > 0.05) fail(`no room under ${bl.label}`); return f; });
  const rintocchi = SIDE_BY.get('rintocchi')!, ring = l3.hidden.find((h) => h.pack.hidden!.quest === 'rintocchi');
  if (!ring || ring.members.length !== 1 || ring.members[0] !== l3.campanaro || l3.campanaro.kind !== CAMPANARO || ring.pack.hidden!.step !== MUTE || ring.pack.hidden!.rest) fail('the Campanaro is not the hidden pack of Rintocchi muti, on the hero at its third clapper');
  if (Math.abs(l3.campanaro.y - BELFRY.y) > 0.05 || [l3.campanaro.bounds.x0, l3.campanaro.bounds.x1].some((x) => x < BELFRY.x0 || x > BELFRY.x1) || [l3.campanaro.bounds.z0, l3.campanaro.bounds.z1].some((z) => z < BELFRY.z0 || z > BELFRY.z1)) fail('the Campanaro does not keep to the bell chamber\'s floor');
  if (CAMPANARO.hp < 4500 || CAMPANARO.hp > 5500 || !CAMPANARO.toll || !CAMPANARO.nova || CAMPANARO.nova.radius > 4) fail('the Campanaro is not the miniboss of the plan (about 5000, the Rintocchi, a nova a tight floor can be left)');
  if (q.prompt(bells[0])?.act) fail('a clapper can be pulled before Rintocchi muti is taken');
  take('archivista');
  const rung = (id: SideId, st: number) => s.reached(id, st);
  if (q.prompt(bells[1])?.act || due(ring!, l3, rung, false)) fail('the mezzana gives up its clapper before the maggiore, or the Campanaro is up at once');
  q.prompt(bells[0])?.act?.();
  q.prompt(bells[1])?.act?.();
  copy.side.decode(JSON.parse(JSON.stringify(s.encode())));
  if (copy.side.step(rintocchi) !== 2 || due(ring!, l3, rung, false)) fail('two clappers out are not saved, or wake the Campanaro');
  q.prompt(bells[2])?.act?.();
  if (!due(ring!, l3, rung, false) || due(ring!, l3, rung, true)) fail('the third clapper does not wake the Campanaro, or he wakes after the Abate');
  s.killed('campanaro');
  if (s.ready(rintocchi)) fail('a Campanaro off his pack counts for Rintocchi muti');
  s.killed('campanaro', 'rintocchi');
  if (!s.ready(rintocchi) || q.marks(0).archivista !== 'ready') fail('the Campanaro dead does not make Rintocchi muti ready');
  if (QUESTS.rintocchi.xp !== 300 || QUESTS.rintocchi.gold !== 120 || rintocchi.reward !== 'batacchio-sangiorgio') fail('Rintocchi muti does not pay 300 XP, 120 gold and the Batacchio di San Giorgio');
  hand('archivista', 'rintocchi');
  prepare(['rintocchi']);
  const peal = ABATE.toll!.n;
  prepare([]);
  if (!q.preps().includes('rintocchi') || peal !== 2 || ABATE.toll!.n !== 3) fail(`the Batacchio leaves the Abate ${peal} rings, ${ABATE.toll!.n} without it, want 2 and 3`);
  if (q.marks(0).archivista) fail('Padre Archivista still has something once his quests are done');
  // I musici di Cana: four spots, each standable, each within a pack's pull, picked up in any order, not before the quest.
  const by = STRUMENTI.map((f) => { const at = feet(f.at.x + 1, f.at.z); if (level.world.blocked(at.x, at.z, at.y) || Math.abs(at.y - f.at.y) > 0.5) fail(`no room by ${f.label} (${f.at.x}, ${f.at.z})`); return at; });
  STRUMENTI.forEach((f) => { if (!PACKS3.some((pk) => !pk.hidden && pk.members.some(([k, x, z]) => Math.hypot(x - f.at.x, z - f.at.z) < k.aggro))) fail(`no pack guards ${f.label}`); if (!ITEM.get(f.item)?.quest) fail(`${f.item} is not a quest item`); });
  if (q.prompt(by[0])?.act) fail('an instrument can be picked up before I musici di Cana');
  if (q.marks(0).veronese !== 'offer') fail('the Veronese shows no "!" with his first quest to give');
  take('veronese');
  if (s.open('veronese').length) fail('La tela tagliata is offered before I musici di Cana is done');
  const musici = SIDE_BY.get('musici')!;
  for (const i of [3, 1, 0]) q.prompt(by[i])?.act?.();
  if (s.progress(musici) !== 3 || s.ready(musici) || s.spots().length !== 1 || s.spots()[0].at !== STRUMENTI[2].at) fail(`three instruments out of order leave ${s.spots().length} spots, progress ${s.progress(musici)}`);
  copy.side.bag = b;
  copy.side.decode(JSON.parse(JSON.stringify(s.encode())));
  if (copy.side.progress(musici) !== 3) fail('the instruments found do not survive a save');
  q.prompt(by[2])?.act?.();
  if (!s.ready(musici) || q.marks(0).veronese !== 'ready') fail('the four instruments do not make I musici di Cana ready');
  hand('veronese', 'musici');
  if (STRUMENTI.some((f) => b.count(f.item))) fail('the instruments stay in the bag once handed in');
  // La tela tagliata: the Commissario asleep after the Abate until it is taken, then at rest; his granatieri only at his half.
  const [com, gra] = ['tela', 'tela'].map((id, i) => l3.hidden.filter((h) => h.pack.hidden!.quest === id)[i]);
  if (!com || !gra || com.members[0] !== l3.commissario || com.members[0].kind !== COMMISSARIO || !com.pack.hidden!.rest || gra.members.length !== 3 || gra.members.some((m) => m.kind !== GRANATIERE) || gra.pack.hidden!.under !== 0.5) fail('the Commissario and his three granatieri are not hidden packs of La tela tagliata');
  const reach = (id: SideId, step: number) => s.reached(id, step);
  if (due(com!, l3, reach, false)) fail('the Commissario wakes before La tela tagliata is taken');
  take('veronese');
  if (!due(com!, l3, reach, false) || due(com!, l3, reach, true)) fail('the Commissario does not wake with La tela tagliata, or wakes after the Abate');
  const c = l3.commissario;
  c.state = 'pray'; c.hp = COMMISSARIO.hp;
  if (due(gra!, l3, reach, false)) fail('the granatieri wake with the Commissario at rest');
  c.state = 'chase'; c.hp = COMMISSARIO.hp * 0.6;
  if (due(gra!, l3, reach, false)) fail('the granatieri wake above his half');
  c.hp = COMMISSARIO.hp * 0.45;
  if (!due(gra!, l3, reach, false)) fail('the granatieri do not wake under his half');
  if (COMMISSARIO.resist !== 0.5 || COMMISSARIO.hp < 6000 || COMMISSARIO.hp > 8000 || !COMMISSARIO.pour || !COMMISSARIO.phases?.marks) fail('the Commissario is not the miniboss of the plan (about 7000, resist 0.5, Squarcio, Inventario)');
  if (s.tokens().map((t) => `${t.from}:${t.item}`).join() !== `commissario:${TELA}`) fail('the canvas is not wanted off the Commissario');
  if (q.canvas) fail('the Nozze are back before the canvas is handed in');
  b.add(TELA);
  hand('veronese', 'tela');
  if (b.count(TELA) || !q.canvas || q.marks(0).veronese) fail('the canvas handed in does not hang the Nozze, or the Veronese still has something');
  // Le schede del conclave: the Cardinale on the presbytery's floor, eight slips off the amanuensi only while it runs, its gold and XP with no
  // epic, saved half counted, and his "!" gone once it is handed in (until the tiara follows it).
  if (Math.abs(level.world.standHeight(CARDINALE.x + 0.6, CARDINALE.z) - CARDINALE.y) > 0.05) fail('the Cardinale does not stand on the presbytery floor');
  if (s.loot('amanuense', () => 0, false, () => 0) === SCHEDA) fail('a slip drops before Le schede del conclave is taken');
  if (q.marks(0).cardinale !== 'offer') fail('the Cardinale shows no "!" with his quest to give');
  take('cardinale');
  const schede = SIDE_BY.get('schede')!, xp = q.bonusXp;
  if (QUESTS.schede.xp !== 150 || QUESTS.schede.gold !== 50 || schede.reward) fail('Le schede del conclave does not pay 150 XP and 50 gold, with no epic');
  if (s.loot('monaco', () => 0, false, () => 0)) fail('a monk drops a slip');
  for (let i = 0; i < 4; i++) b.add(s.loot('amanuense', () => 0, false, () => 0)!);
  copy.side.decode(JSON.parse(JSON.stringify(s.encode())));
  if (copy.side.progress(schede) !== 4 || s.ready(schede)) fail('four slips are not saved as half of eight');
  for (let i = 0; i < 4; i++) b.add(s.loot('amanuense', () => 0, false, () => 0)!);
  if (b.count(SCHEDA) !== 8 || s.loot('amanuense', () => 0, false, () => 0) || q.marks(0).cardinale !== 'ready') fail('the amanuensi do not drop exactly the eight slips wanted');
  if (s.talk('cardinale').paid?.id !== 'schede' || b.count(SCHEDA) || q.bonusXp !== xp + 150 || q.marks(0).cardinale) fail('the slips are not handed in for 150 XP, or the Cardinale still has something');
  const unique = ['remo-marieta', 'lanterna-faro', 'ampolle-benedetto', 'mantello-caliari', 'sciabola-commissario', 'batacchio-sangiorgio'];
  if (SHOP.some((g) => unique.includes(g.id))) fail('a side quest reward is on sale');
  for (let i = 0; i < 3000; i++) if (roll(i % 2 ? 'boss' : 'elite', Math.random, 3).items.some((id) => unique.includes(id))) { fail('a side quest reward dropped off the dead'); break; }
}

// The drowned rise again like the orto's friars: late, out of the hero's way, at their spot, worth less.
const l2 = spawnLevel2(level.world), g0 = l2.all.find((m) => m.kind === GONDOLIERE)!;
// The markers (Quest.marks): "!" on offer, "?" ready to hand in, "?" over "!", none when idle.
{
  const q = new Quest(level.world), m = () => q.marks(1), is = (who: 'zuane' | 'speziale' | 'iseppo', w: string | undefined, why: string) => { if (m()[who] !== w) fail(`${who} shows ${m()[who]}, want ${w}: ${why}`); };
  is('zuane', 'offer', 'his first quest'); is('speziale', 'offer', 'his blessing'); is('iseppo', undefined, 'level 2 still shut');
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
  q.accepted2 = true;
  is('iseppo', 'offer', 'his first quest, the chains down');
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
  + `Mastro Iseppo's ${SIDE.length} quests (${order.join(', ')}, La lettera di Marieta) for ${total} XP; San Giorgio's ${ALL_SIDE.length - SIDE.length} (I marinai della Riva, I fari della darsena in 4 steps, Acqua di San Benedetto in 5, Rintocchi muti up the campanile in 4, I musici di Cana in any order, La tela tagliata, Le schede del conclave); `
  + `talk -> key -> grate -> boss -> leave -> report -> offer -> route -> ospizio -> church -> boss2 -> return -> offer3 -> route3 -> biblioteca -> veronese -> cenacolo -> boss3 -> return3 -> done, Fra' Bortolo blesses once and takes ${HEADS.need} heads`);
if (failed) {
  console.error(`${failed} quest check(s) failed`);
  process.exit(1);
}
