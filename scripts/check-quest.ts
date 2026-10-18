// Quest flow check (`npm run check`): Fra' Zuane's quest from first word to the fondamenta, on the
// real level's colliders. He is reachable from the spawn and talks at every stage; the chest stays
// sealed until his quest is accepted; then key -> grate -> boss -> out of the portone, the stage
// and the tracker's objective following each step. Fra' Bortolo in the serra: reachable in peace, blesses once.
import { buildLevel } from '../src/level/index.ts';
import { SPAWN } from '../src/level/plan.ts';
import { BLESSING, CHEST, NPC, Quest, SPEZIALE, type Stage } from '../src/quest/progress.ts';
import { OBJECTIVE, SPEZIALE_AGAIN, SPEZIALE_DONE, SPEZIALE_TALK, TALK } from '../src/quest/dialogue.ts';
import { FRIAR, GROUPS, MORE } from '../src/enemies/brain.ts';

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
for (const s of ['talk', 'key', 'grate', 'boss', 'leave', 'done'] as Stage[]) {
  if (!TALK[s]?.pages.length || !OBJECTIVE[s]) fail(`stage ${s} has no lines or no objective`);
  for (const p of TALK[s].pages) if (p.length > 260) fail(`a page of ${s} is ${p.length} characters, too long for the window on a phone`);
}
if (!TALK.talk.offer || Object.entries(TALK).some(([s, t]) => s !== 'talk' && t.offer)) fail('only the first conversation offers the quest');

// Start: talk to him; the chest is sealed.
want('talk');
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
want('done');
if (!quest.prompt(facing)?.talk) fail("Fra' Zuane has nothing to say once it is over");

// Fra' Bortolo in the serra: out of every friar's pull, talks at any time, blesses once.
const bortolo = feet(SPEZIALE.x, SPEZIALE.z - 1.2);
if (level.world.blocked(bortolo.x, bortolo.z, bortolo.y)) fail("no room to stand by Fra' Bortolo");
if (quest.prompt(bortolo)?.talk !== 'speziale') fail("no 'talk' prompt next to Fra' Bortolo");
for (const [x, z] of [...GROUPS, ...MORE].flat()) if (Math.hypot(x - bortolo.x, z - bortolo.z) < FRIAR.aggro + 1) fail(`a friar at (${x}, ${z}) hoes within reach of Fra' Bortolo`);
for (const t of [SPEZIALE_TALK, SPEZIALE_AGAIN, SPEZIALE_DONE]) for (const p of t.pages) if (p.length > 260) fail(`a page of Fra' Bortolo is ${p.length} characters, too long for the window on a phone`);
if (quest.castMul !== 1 || quest.dmgMul !== 1) fail('blessed before talking to Fra\' Bortolo');
if (!quest.bless() || quest.castMul !== BLESSING.cast || quest.dmgMul !== BLESSING.dmg) fail('the blessing does not quicken casts and harden blows');
if (quest.bless()) fail('the blessing was given twice');
quest.blessLeft = 0;
if (quest.castMul !== 1 || quest.dmgMul !== 1) fail('the blessing outlived its time');

console.log(`quest ok: talk -> key -> grate -> boss -> leave -> done, Fra' Bortolo blesses once`);
if (failed) {
  console.error(`${failed} quest check(s) failed`);
  process.exit(1);
}
