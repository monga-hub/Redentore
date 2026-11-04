import assert from 'node:assert/strict';
import { buildLevel } from '../src/level/index.ts';
import { Quest } from '../src/quest/progress.ts';
import { SANCTUARY } from '../src/quest/sanctuary.ts';
const level = buildLevel(), q = new Quest(level.world), gate = q.gate('santa-croce');
assert.equal(level.world.blocked(-118,-14,0), true);
assert.equal(q.prompt({x:-118,y:0,z:-12})?.act, undefined);
q.accept2(); assert.equal(gate.open, false);
assert.equal(q.prompt({x:-122,y:0,z:-30})?.service, undefined);
q.win2(); assert.equal(gate.open, true);
for(let z=-12;z>=-34;z-=0.5) assert.equal(level.world.blocked(-118,z,0),false,`aisle ${z}`);
assert.equal(level.world.blocked(-126,-24,0),true);
assert.equal(level.world.blocked(-110,-24,0),true);
assert.equal(level.world.blocked(-118,-40,0),true);
for(const [id,npc] of Object.entries(SANCTUARY)) {
  assert.equal(level.world.blocked(npc.x,npc.z+1.5,0),false);
  assert.equal(q.prompt({x:npc.x,y:0,z:npc.z+1.5})?.service,id);
}
const boxes=level.world.boxes.length;q.win2();assert.equal(level.world.boxes.length,boxes);
q.accept3();q.win3();assert.equal(gate.open,true);
console.log('sanctuary ok: boss2 permanent gate, sealed shell, clear aisle and both normal service prompts');
