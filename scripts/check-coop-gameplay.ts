import assert from 'node:assert/strict';
import { Survival } from '../server/simulation.ts';
import { arenaLevel, COURT } from '../src/coop/environment.ts';
import { combatHero, controls, idle } from '../src/coop/protocol.ts';
import { pack, unpack, MAX_PACKET } from '../src/coop/packets.ts';

const heroes=['tizian','bortolo'].map(hero=>combatHero({hero,build:{xp:9300,picks:[],learned:hero==='tizian'?['pyre','cero']:['frost','caligo']},quest:{boss3Dead:true}}));
const level=arenaLevel();
assert(level.root.children.length>0,'real campaign environment');
for(let x=-COURT.hx+1;x<COURT.hx;x+=1)for(let z=-COURT.hz+1;z<COURT.hz;z+=1){
  if(!level.world.blocked(x,z,0))assert(Number.isFinite(level.world.groundAt(x,z,0)),'every open court position has the island slab');
}
assert(level.world.blocked(COURT.hx,0,0),'campaign exit sealed only in arena world');
assert(!controls({...idle(),seq:1,target:-1}));assert(!controls({...idle(),seq:1,jump:'yes'}));
const sim=new Survival([heroes[0],heroes[1]]);
assert(sim.players.every(p=>!p.input.auto),'host and guest enter with manual abilities');
for(let n=0;n<45;n++)sim.step(.05);
assert(sim.mobs.length>=2);
assert(sim.players.every(p=>p.cast===0),'neither peer activates skills without manual input');
assert.equal(sim.snapshot().events.length,0,'no default automatic skill events');
for(let i=0;i<2;i++){
  const c={...idle(),seq:1,x:.8,target:sim.mobs[i].id};c.casts[10]=1;sim.input(i,c);
}
sim.step(.05);
let f=sim.snapshot();assert.notEqual(f.players[0].target,f.players[1].target,'independent authoritative targets');
assert.equal(f.events.filter(e=>e.slot===10).length,2,'both moving heroes resolve manual potions');
assert(f.players.every(p=>p.slots[10].cd>0));
const fire=sim.players[0].kit.system.slots.findIndex(a=>a?.id==='pyre');assert(fire>0);
sim.players[0].input.casts[fire]++;sim.step(.05);f=sim.snapshot();
assert.match(f.players[0].feedback,/muovi/,'moving cast-time failure is visible, not silently discarded');
assert(!f.events.some(e=>e.player===0&&e.slot===fire));
sim.players[0].input.x=0;
for(let n=0;n<10;n++)sim.step(.05);
sim.players[0].input.casts[fire]++;sim.step(.05);
assert(sim.snapshot().players[0].casting,'stationary manual cast starts through same ability system');
for(let n=0;n<70;n++)sim.step(.05);
f=sim.snapshot();assert(f.events.some(e=>e.player===0&&e.slot===fire),'completed spell produces a bounded replicated fire');
const payload=pack(f,'gameplay');assert(JSON.stringify(payload).length<MAX_PACKET);
const decoded=unpack(payload,'gameplay',heroes);assert(decoded);assert.deepEqual(pack(decoded.frame,'gameplay'),payload);
const bad=structuredClone(payload) as {d:any[]};bad.d[5][0][2]=11;assert(!unpack(bad,'gameplay',heroes),'untrusted event cannot select outside the equipped slots');
assert(f.mobs.every(m=>Number.isFinite(m.y)&&Math.abs(m.x)<COURT.hx&&Math.abs(m.z)<COURT.hz));
sim.dispose();
const optional=new Survival([heroes[0],heroes[1]]);
optional.players.forEach(p=>{p.stats.immune=1e9;});
for(const slot of [0,1]){
  optional.players[slot].input.auto=true;
  const before=optional.players.map(p=>p.cast);
  for(let n=0;n<80;n++)optional.step(.05);
  assert(optional.players[slot].cast>before[slot],'explicit opt-in enables own automatic skills');
  assert.equal(optional.players[1-slot].cast,before[1-slot],'opt-in does not enable the other peer');
  optional.players[slot].input.auto=false;
  const stopped=optional.players.map(p=>p.cast);
  for(let n=0;n<80;n++)optional.step(.05);
  assert.deepEqual(optional.players.map(p=>p.cast),stopped,'turning auto off stops new activations');
}
optional.dispose();
const next=new Survival([heroes[0],heroes[1]]);
assert(next.players.every(p=>!p.input.auto),'new simulation never inherits either peer’s opt-in');
assert.equal(idle().auto,false,'view, session and absent-view fallback start manual');
assert(!controls({...idle(),seq:1,auto:undefined}),'missing auto is rejected rather than enabled');
next.dispose();
console.log(`coop gameplay ok: real court floors/bounds, independent targets, both moving potions, truthful moving-cast rejection, stationary spell completion and compact event roundtrip (${JSON.stringify(payload).length}B).`);
