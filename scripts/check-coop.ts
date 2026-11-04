import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AwardOutbox } from '../server/outbox.ts';
import { Arena, type Socket, type Winner } from '../server/arena.ts';
import { Survival } from '../server/simulation.ts';
import { combatHero, controls, idle, validBar, frame, DURATION, MAX_MOBS, type CombatHero } from '../src/coop/protocol.ts';
import { tune } from '../src/abilities/forsaken.ts';
import { control } from '../src/enemies/control.ts';
import { CARD } from '../src/player/levels.ts';
import { mergeArenaRewards } from '../src/core/arena-rewards.ts';
import { merge, type Saves } from '../src/core/cloud.ts';
import { autosave, resume, type GameState } from '../src/core/save.ts';
import { componentId } from '../src/loot/gear.ts';
import { Bag, ITEM } from '../src/loot/bag.ts';

const base:GameState={v:1,hero:'tizian',player:{x:0,y:0,z:0,yaw:0,hp:1280,mana:400,charge:0},quest:{key:true,gates:[],bossDead:true,boss3Dead:true},dead:[],time:400,build:{xp:9300,lv:31,picks:[],learned:['pyre','cero']},bag:{gold:123,items:[]},at:10};
const h=combatHero(base);
assert.throws(()=>combatHero({...base,build:{...base.build,xp:9299,lv:99}}));assert.throws(()=>combatHero({...base,quest:{...base.quest,boss3Dead:false,accepted3:true}}));assert.throws(()=>combatHero({...base,build:{...base.build,xp:Infinity}}));
assert.equal(controls({...idle(),seq:1,x:Infinity}),undefined);assert.equal(controls({...idle(),seq:1,casts:[1]}),undefined);
assert(!validBar(h,['fall',...Array(8).fill(null)]));assert(validBar(h,['ember','pyre','cero',...Array(6).fill(null)]));
const frozen=JSON.stringify(base);new Survival([h,h]).dispose();assert.equal(JSON.stringify(base),frozen,'campaign snapshot immutable');

// Real loopback WebSockets, separate clients, explicit test fixture identities (not real Auth).
const awards:{match:string;winners:Winner[]}[]=[];
const arena=new Arena(async(match,winners)=>{awards.push({match,winners});});
const http=createServer();const wss=new WebSocketServer({server:http,maxPayload:4096});
const leases=[randomUUID(),randomUUID(),randomUUID()];const users=[randomUUID(),randomUUID(),randomUUID()];
wss.on('connection',s=>{let user='';s.on('message',raw=>{try{const m=JSON.parse(raw.toString());if(m.type==='fixture'){user=users[m.client];arena.admit(user,leases[m.client],h,s,m.invite,1000);}else arena.message(user,s,m,1000);}catch(e){s.send(JSON.stringify({type:'error',message:(e as Error).message}));}});s.on('close',()=>arena.disconnected(user,s,1000));});
http.listen(0,'127.0.0.1');await once(http,'listening');const port=(http.address()as{port:number}).port;
async function client(){const ws=new WebSocket(`ws://127.0.0.1:${port}`);await once(ws,'open');return ws;}
const a=await client(),b=await client(),third=await client();
const packet=(ws:WebSocket)=>new Promise<any>(resolve=>ws.once('message',raw=>resolve(JSON.parse(raw.toString()))));
let p=packet(a);a.send(JSON.stringify({type:'fixture',client:0}));const lobby=await p;
p=packet(b);b.send(JSON.stringify({type:'fixture',client:1,invite:lobby.invite}));assert.equal((await p).members.length,2);
p=packet(third);third.send(JSON.stringify({type:'fixture',client:2,invite:lobby.invite}));assert.match((await p).message,/piena/);
p=packet(a);a.send(JSON.stringify({type:'start'}));assert.match((await p).message,/pronti/);
a.send(JSON.stringify({type:'ready'}));await new Promise(r=>setTimeout(r,10));b.send(JSON.stringify({type:'ready'}));await new Promise(r=>setTimeout(r,10));
p=packet(a);a.send(JSON.stringify({type:'start'}));const started=await p;assert.equal(started.phase,'fight');assert(frame(started.frame));
const r=arena.rooms.get(lobby.room)!;
const input={...idle(),seq:2,x:1,casts:Array(11).fill(0)};arena.message(users[0],r.members[0].socket!,{type:'input',input},1000);
arena.message(users[0],r.members[0].socket!,{type:'input',input:{...input,seq:1,x:-1}},1000);assert.equal(r.members[0].input.x,1,'out-of-order ignored');
arena.message(users[0],r.members[0].socket!,{type:'input',input:{...input,x:-1}},1000);assert.equal(r.members[0].input.x,1,'duplicate ignored');
assert.throws(()=>arena.message(users[0],r.members[0].socket!,{type:'input',input:{...input,seq:3,x:5}},1000));
const stranger:Socket={bufferedAmount:0,send(){},close(){}};assert.throws(()=>arena.message(users[0],stranger,{type:'leave'},1000));
assert.throws(()=>arena.admit(users[0],leases[0],h,stranger,undefined,1000),/già presente/);
const lost=r.members[1].socket!;arena.disconnected(users[1],lost,1000);const before=r.sim!.time;arena.update(1050);assert.equal(r.sim!.time,before,'disconnected simulation paused');
arena.admit(users[1],leases[1],h,lost,undefined,1100);arena.message(users[0],r.members[0].socket!,{type:'ping'},1100);arena.update(1100);assert(r.sim!.time>before,'same lease resumes slot');
arena.update(9200);assert.equal(r.phase,'ended');assert.equal(awards.length,0,'disconnect awards nothing');
a.close();b.close();third.close();wss.close();http.close();await once(http,'close');
console.log('coop network ok: two actual loopback WebSocket clients, third refused, ready/start, duplicate/out-of-order/invalid input, account/room isolation, disconnect/rejoin/timeout. Fixture identities only.');

// Distinct builds with delayed pyre impacts: no other hero tuning may leak into a callback.
const damageCard=[...CARD.values()].find(c=>c.id==='pyre_big');
assert(damageCard);
const weak:CombatHero={...h,bar:['ember','pyre',...Array(7).fill(null)]};const strong={...weak,picks:Array(6).fill(damageCard.id)};
const sim=new Survival([weak,strong]);
sim.players.forEach((p,i)=>{p.player.respawn({x:i?7:-7,z:0,yaw:0});p.input.auto=false;p.stats.immune=999;p.tuning.pyreCast=0;});
for(const [i,x]of [-7,7].entries())sim.mobs.push({id:i+1,max:1e6,x,y:0,z:-5,yaw:0,hp:1e6,state:'chase',t:0,cd:0,struck:false,home:{x,z:-5,yaw:0},mates:[],cc:{...control(),root:999}});
for(const p of sim.players){Object.assign(tune,p.tuning);assert(p.kit.system.tryCast(1));}
for(let i=0;i<30;i++)sim.step(.05);
const damages=sim.mobs.slice(0,2).map(m=>1e6-m.hp);assert(damages[0]>0&&damages[1]>damages[0]*1.5,`distinct delayed spell damage: ${damages}`);
assert(sim.players.every(p=>p.stats.hp>0));assert(frame(sim.snapshot()));sim.dispose();

// Exact 300s simulation, five escalation stages, bounded entities, no fake client victory command.
const survive=new Survival([h,h]);survive.players.forEach(p=>{p.stats.immune=1e9;p.input.auto=false;});
const stages=new Set<number>();for(let i=0;i<6001&&survive.outcome==='fight';i++){survive.step(.05);stages.add(survive.snapshot().stage);assert(survive.mobs.length<=MAX_MOBS);}
assert.equal(survive.time,DURATION);assert.equal(survive.outcome,'victory');assert.deepEqual([...stages],[1,2,3,4,5]);survive.dispose();
const defeat=new Survival([h,h]);defeat.players.forEach(p=>p.stats.hp=0);defeat.step(.05);assert.equal(defeat.outcome,'defeat');defeat.dispose();
console.log('coop combat ok: original kit, both-owner delayed impacts, immutable campaign, 300 simulated seconds / five stages /24 mob cap, victory and defeat. Timer advanced by simulation test, not real-time internet play.');

// Reward merge replay, full bag, normal cloud return and stale other-device upload.
const reward=componentId('tizian',3,'leggendario','testa');
// Before equipment branch integration, assert canonical catalogue exists in combined branch.
assert(ITEM.has(reward),'merge legendary catalogue before combined validation');
const receipt={id:randomUUID(),item:reward};
const granted={...base,at:20,bag:{gold:123,items:[[reward,1] as [string,number]]},arenaRewards:{receipts:[receipt],received:[receipt.id]}};
const stale={...base,time:500,build:{...base.build!,xp:10000}};
const carried=mergeArenaRewards(stale,granted);assert.deepEqual(carried.bag!.items,[[reward,1]]);assert.deepEqual(mergeArenaRewards(carried,granted).bag,carried.bag,'repeated merge no duplicate');
const consumed={...carried,bag:{gold:123,items:[]}};assert.deepEqual(mergeArenaRewards(consumed,granted).bag!.items,[],'spent item not regranted when receipt is already received');
const full={...stale,bag:{gold:123,items:Array.from({length:Bag.SLOTS},(_,i)=>['old-'+i,1] as[string,number])}};
const pending=mergeArenaRewards(full,granted);assert.equal(pending.arenaRewards!.received.length,0);assert.equal(pending.bag!.items.length,30);pending.bag!.items.pop();assert.equal(mergeArenaRewards(pending).arenaRewards!.received.length,1,'full bag delivery deferred and recoverable');
const map=new Map<string,string>();const storage={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);},removeItem:(k:string)=>{map.delete(k);}}as Storage;
let remote:GameState=granted;const cloud:Saves={load:async(_g,slot)=>slot==='tizian'?structuredClone(remote):null,save:async(_g,s,slot)=>{if(slot==='tizian')remote=structuredClone(s)as GameState;return true;},remove:async()=>true,onUserChange:()=>()=>{}};
autosave(base,storage,10);await merge(cloud,storage);assert.deepEqual(resume('tizian',storage)!.bag!.items,[[reward,1]],'normal claim->solo return pulls reward');
autosave(stale,storage,30);await merge(cloud,storage);assert.deepEqual(remote.bag!.items,[[reward,1]],'stale more-XP session cannot erase receipt/item');assert.deepEqual(resume('tizian',storage)!.bag!.items,[[reward,1]],'upload reconciliation updates local storage for next solo keep');
await merge(cloud,storage);assert.deepEqual(remote.bag!.items,[[reward,1]]);
console.log('coop reward merge ok: cloud/local return, stale higher-XP upload, duplicate merge, consumed marker, full-bag deferred delivery.');

const temp=await mkdtemp(join(tmpdir(),'redentore-coop-outbox-'));
const outId=randomUUID(),outWinners=[{user:randomUUID(),hero:'tizian',item:reward}];
let out=new AwardOutbox(join(temp,'awards.sqlite'));out.enqueue(outId,outWinners);out.close();
out=new AwardOutbox(join(temp,'awards.sqlite'));assert.deepEqual(out.pending(),[{id:outId,winners:outWinners}]);
assert.deepEqual(out.enqueue(outId,[]),outWinners,'restart/retry fixes original winner/item');out.delivered(outId);assert.equal(out.pending().length,0);out.close();await rm(temp,{recursive:true,force:true});
console.log('coop outbox ok: durable reopen after undelivered win, fixed retry payload, delivered cleanup.');

const victoryAwards:Winner[][]=[];const both=new Arena(async(_id,w)=>{victoryAwards.push(w);});
const sock=()=>({bufferedAmount:0,send(){},close(){}});const s0=sock(),s1=sock(),u0=randomUUID(),u1=randomUUID();
const joined=both.admit(u0,randomUUID(),h,s0,undefined,1000);const vr=both.rooms.get(joined.room)!;
both.admit(u1,randomUUID(),h,s1,vr.invite,1000);both.message(u0,s0,{type:'ready'},1000);both.message(u1,s1,{type:'ready'},1000);both.message(u0,s0,{type:'start'},1000);
vr.sim!.time=299.99;vr.sim!.players[1].stats.hp=0;vr.sim!.players[0].stats.immune=999;
both.update(1050);await new Promise(r=>setTimeout(r,0));assert.equal(victoryAwards[0].length,2,'shared victory awards both admitted players, including dead spectator');assert.equal(vr.phase,'ended');
both.update(1100);assert.equal(victoryAwards.length,1,'terminal updates do not repeat award');
console.log('coop shared victory ok: one survivor, both eligible teammates awarded exactly once.');

remote=stale;autosave(granted,storage,20);await merge(cloud,storage);assert.deepEqual(resume('tizian',storage)!.bag!.items,[[reward,1]],'newer cloud gameplay must retain local reward receipts');assert.deepEqual(remote.bag!.items,[[reward,1]],'merged receipt must be carried back to cloud too');

const jitter=new Arena(async()=>{});const ja=sock(),jb=sock(),ju=randomUUID(),jv=randomUUID();const jid=jitter.admit(ju,randomUUID(),h,ja,undefined,1000);const jr=jitter.rooms.get(jid.room)!;jitter.admit(jv,randomUUID(),h,jb,jr.invite,1000);jitter.message(ju,ja,{type:'ready'},1000);jitter.message(jv,jb,{type:'ready'},1000);jitter.message(ju,ja,{type:'start'},1000);jitter.update(1050);jitter.update(1160);assert(Math.abs(jr.sim!.time-.16)<1e-8,'bounded timer jitter is subdivided, not dropped');jitter.update(2000);assert.equal(jr.phase,'ended','long server stall ends instead of phantom catch-up');
