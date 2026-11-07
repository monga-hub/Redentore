import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Survival, DUEL_SPAWN, PVP } from '../server/simulation.ts';
import { PREP, combatHero, idle, frame } from '../src/coop/protocol.ts';
import { pack, unpack } from '../src/coop/packets.ts';
import { duelRecap, duelWinner, recap } from '../src/coop/recap.ts';
import { outcomeLine, type PartyState } from '../src/coop/session.ts';
import { LfgClient, lfgState, type LfgState } from '../src/coop/lfg.ts';
// Arena 1v1 on the host simulation: frozen 15 s prep on opposite sides, PvP only in the duel, a winner, results, LFG fallback.
const heroes=['tizian','bortolo'].map(hero=>combatHero({hero,build:{xp:9300,picks:[],learned:[]},quest:{boss2Dead:true}}));
const duel=new Survival([heroes[0],heroes[1]],'duel');
assert.equal(duel.countdown,PREP);
const start=duel.snapshot();
assert(start.players.every((p,i)=>p.x===DUEL_SPAWN[i].x&&p.z===DUEL_SPAWN[i].z),'heroes start at the two ends');
assert(Math.hypot(start.players[0].x-start.players[1].x,start.players[0].z-start.players[1].z)>20,'opposite sides of the court');
assert(start.players.every(p=>p.hp===p.max&&p.mana===p.manaMax&&p.slots.every(s=>s.cd===0)),'fair start: full health and mana, no cooldowns');
const seq=[0,0],press=(i:number,slot:number,move={x:0,z:0})=>{const c={...idle(),seq:++seq[i],...move,casts:[...duel.players[i].input.casts]};c.casts[slot]++;duel.input(i,c);};
for(let n=0;n<Math.round(PREP/.05)-1;n++){
  press(0,0,{x:1,z:0});press(1,10,{x:-1,z:0});duel.step(.05);
  const f=duel.snapshot();assert(frame(f),'prep frames pass the wire validator');
  assert.deepEqual(f.players,start.players,'no movement, casting, damage or exit during the preparation');
  assert(unpack(pack(f,'duel'),'duel',heroes),'guest decodes the long countdown');
}
assert(duel.countdown>0);duel.step(.05);assert.equal(duel.countdown,0);
for(let n=0;n<200;n++)duel.step(.05);
assert.equal(duel.mobs.length,0,'the arena has no monsters');
// Face to face: the base attack lands on the other hero, scaled for PvP, counted as dealt and taken.
const [a,b]=duel.players;a.player.pos.set(-1,0,0);b.player.pos.set(.3,0,0);a.player.facing=-Math.PI/2;
const before=b.stats.hp;
for(let n=0;n<40;n++){if(n%10===0)press(0,0);duel.step(.05);}
const hit=before-b.stats.hp;assert(hit>0,'PvP on in the duel');
assert(Math.abs(duel.snapshot().players[0].stats!.dealt!-hit)<1e-6&&Math.abs(duel.snapshot().players[1].stats!.taken!-hit)<1e-6,'damage dealt equals damage taken');
assert(PVP<1);
b.stats.hp=1;for(let n=0;n<40&&duel.outcome==='fight';n++){if(n%10===0)press(0,0);duel.step(.05);}
assert.equal(duel.outcome,'victory','a fallen hero ends the duel');
const last=duel.snapshot(),payload=pack(last,'duel');assert.deepEqual(pack(unpack(payload,'duel',heroes)!.frame,'duel'),payload,'results cross the wire');
const party=(slot:number,f=last):PartyState=>({mode:'duel',room:'r',invite:'i',epoch:'e',slot,phase:'ended',reason:outcomeLine('duel',f.outcome),paused:true,members:heroes.map(hero=>({hero,ready:true,connected:true})),frame:f});
assert.equal(duelWinner(party(0)),0);
assert.equal(duelRecap(party(0)).title,'Vittoria');assert.equal(duelRecap(party(1)).title,'Sconfitta');
assert.deepEqual(duelRecap(party(1)).players.map(p=>p.status),['Vincitore','Sconfitto']);
assert(duelRecap(party(0)).players.every(p=>p.stats&&['dealt','healing','taken'].every(k=>Number.isFinite((p.stats as Record<string,number>)[k]))));
assert.equal(duelRecap({...party(1),frame:{...last,outcome:'fight'},members:[{hero:heroes[0],ready:true,connected:false},{hero:heroes[1],ready:true,connected:true}]}).title,'Avversario ritirato');
assert.equal(duelRecap({...party(0),frame:{...last,outcome:'fight'},ending:'exit'}).title,'Ti sei ritirato');
assert.equal(duelRecap({...party(0),frame:{...last,outcome:'defeat'}}).title,'Pareggio');
assert.equal(recap({...party(0),mode:'survival'}).title,'Vittoria','co-op recap unchanged');
duel.dispose();
// Co-op keeps friendly fire off: the same blow in the siege never touches the partner.
const coop=new Survival([heroes[0],heroes[1]]);coop.countdown=0;
coop.players[0].player.pos.set(-1,0,0);coop.players[1].player.pos.set(.3,0,0);coop.players[0].player.facing=-Math.PI/2;
for(let n=0;n<20;n++){if(n%10===0){const c={...idle(),seq:n+1,casts:[...coop.players[0].input.casts]};c.casts[0]++;coop.input(0,c);}coop.step(.05);}
assert.equal(coop.players[1].stats.hp,coop.players[1].stats.hpMax,'no friendly fire in co-op');
assert.equal(coop.snapshot().players[0].stats!.dealt,0);coop.dispose();
// LFG: duel proposals validate, unknown modes fail closed, and a server without the mode migration never queues an arena.
const proposal={id:crypto.randomUUID(),epoch:crypto.randomUUID(),mode:'duel',capacity:2,source:'auto',host:true,accepted:false,peerAccepted:false,prepared:false,peer:null,expiresAt:new Date().toISOString()};
assert.equal(lfgState({status:'offered',mode:'duel',proposal}).proposal?.mode,'duel');
assert.throws(()=>lfgState({status:'offered',proposal:{...proposal,mode:'ranked'}}));assert.throws(()=>lfgState({status:'idle',mode:'ranked'}));
const ops:unknown[]=[];let answer:LfgState={status:'searching',entry:crypto.randomUUID()};
const fake={rpc:async(_n:string,args:Record<string,unknown>)=>{ops.push(args);return {data:structuredClone(answer),error:null};},
  auth:{getSession:async()=>({data:{session:{user:{id:'u'},access_token:'t'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  realtime:{setAuth:async()=>{}},channel:()=>({on(){return this;},subscribe(fn:(s:string)=>void){fn('SUBSCRIBED');return this;}}),removeChannel:async()=>{}} as unknown as SupabaseClient;
const states:LfgState[]=[];const lfg=new LfgClient(fake,s=>states.push(s),()=>{});
await assert.rejects(()=>lfg.join('tizian','duel'),/non ancora attiva/);
assert.deepEqual(ops.map(o=>(o as {op:string}).op),['join','leave'],'old server: leave at once');assert.deepEqual((ops[0] as {payload:unknown}).payload,{mode:'duel'});assert.equal(states.at(-1)?.status,'idle');
ops.length=0;await lfg.join('tizian');assert.equal((ops[0] as {payload?:unknown}).payload,undefined,'co-op join sends exactly what it sent before');await lfg.stop();
answer={...answer,mode:'duel'};ops.length=0;assert.equal((await new LfgClient(fake,()=>{},()=>{}).join('tizian','duel')).mode,'duel');
console.log('Duel PASS: 15 s frozen prep on opposite ends, full resources, PvP only in the arena, winner/draw/forfeit results with dealt/healing/taken, co-op friendly fire off, LFG mode validation and old-server fallback.');
process.exit(0);
