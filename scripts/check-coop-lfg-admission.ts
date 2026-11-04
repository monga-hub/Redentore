import assert from 'node:assert/strict';
import { combatHero } from '../src/coop/protocol.ts';
const low={hero:'tizian',build:{xp:100,picks:[],learned:['pyre','cero']},quest:{boss2Dead:true,boss3Dead:false},gear:{}};
assert.doesNotThrow(()=>combatHero(low),'boss2 victory admits below31 without boss3');
import { setTimeout as wait } from 'node:timers/promises';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BetaSession, type PartyState } from '../src/coop/session.ts';
import { idle, validHero } from '../src/coop/protocol.ts';
import { LFG_HANDOFF_KEY, storeLfgHandoff, takeLfgHandoff } from '../src/coop/lfg.ts';
assert.equal(combatHero({...low,build:{...low.build,xp:0}}).xp,0);
assert.throws(()=>combatHero({...low,quest:{boss2Dead:false,boss3Dead:true}}),/Governatrice/);
assert.throws(()=>combatHero({...low,quest:{boss3Dead:true,accepted2:true}}),/Governatrice/);
assert.throws(()=>combatHero({...low,build:{...low.build,xp:Infinity}}),/Progressione/);
assert.throws(()=>combatHero({...low,build:{...low.build,xp:-1}}),/Progressione/);
assert(validHero(combatHero(low)),'transport shape validation does not require fabricated quest flags');
const memory=new Map<string,string>(),store={getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>{memory.set(k,v);},removeItem:(k:string)=>{memory.delete(k);}};
const proposal=crypto.randomUUID(),tickets=[crypto.randomUUID(),crypto.randomUUID()];
const handoff={proposal,ticket:tickets[0]};
assert(storeLfgHandoff(handoff,store));assert.equal(memory.get(LFG_HANDOFF_KEY)?.includes('lease'),false);
assert.deepEqual(takeLfgHandoff(proposal,store),handoff);assert.equal(takeLfgHandoff(proposal,store),undefined,'page consumes ticket once');
assert.equal(storeLfgHandoff(handoff,{setItem:()=>{throw Error('storage full');}}),false);
assert.equal(takeLfgHandoff(proposal,{getItem:()=>{throw Error('blocked');},removeItem:()=>{}}),undefined);
assert.equal(storeLfgHandoff(handoff),false,'missing browser sessionStorage fails safely');
memory.set(LFG_HANDOFF_KEY,'bad json');assert.equal(takeLfgHandoff(proposal,store),undefined);assert.equal(memory.has(LFG_HANDOFF_KEY),false);

// Auth/RPC/private-channel fixture only. Backend atomic consent/ownership is independently tested in PGlite.
class Fixture {
 room=crypto.randomUUID();epoch=crypto.randomUUID();invite=crypto.randomUUID();
 snapshots=[low,{...low,hero:'bortolo',build:{xp:150,picks:[],learned:['frost','caligo']}}];
 claims:(string|null)[]=[null,null];ready=[false,false];phase='lobby';channels=new Set<Channel>();
 calls:{id:number;name:string;op:string}[]=[];holdGuest=true;tracks=0;
 client(id:number):SupabaseClient{return {
  auth:{getSession:async()=>({data:{session:{access_token:'fixture-'+id}}})},realtime:{setAuth:async()=>{}},
  rpc:async(name:string,p:any)=>{this.calls.push({id,name,op:p.op});try{return {data:this.rpc(id,name,p),error:null};}catch(e){return {data:null,error:{message:(e as Error).message}};}},
  channel:(topic:string,options:any)=>{assert.equal(options.config.private,true);return new Channel(this,id,topic);},
  removeChannel:async(c:Channel)=>{this.channels.delete(c);},
 } as unknown as SupabaseClient;}
 row(id:number){return {room:this.room,epoch:this.epoch,invite:this.invite,slot:id,phase:this.phase,reason:'',members:this.claims.map((lease,i)=>lease?{snapshot:this.snapshots[i],bar:null,ready:this.ready[i]}:null)};}
 rpc(id:number,name:string,p:any):unknown {
  if(name==='coop_lfg'){
   assert.equal(p.op,'claim');if(p.proposal!==proposal||p.payload.ticket!==tickets[id])throw Error('Ticket non valido');
   if(this.claims[id]&&this.claims[id]!==p.lease)throw Error('Ticket già usato');
   if(id===1&&!this.claims[0])return {status:'claiming',waitingForHost:true};
   this.claims[id]=p.lease;return {status:'admitted',admission:this.row(id)};
  }
  assert.equal(name,'coop_beta','no save/reward RPC');
  if(this.claims[id]!==p.lease||p.room!==this.room)throw Error('Identità non valida');
  if(p.op==='ready')this.ready[id]=true;
  if(p.op==='start'){assert.equal(id,0);assert(this.ready.every(Boolean));this.phase='fight';}
  if(p.op==='leave'||p.op==='finish')this.phase='ended';
  return this.row(id);
 }
 releaseGuest(){this.holdGuest=false;for(const c of this.channels)if(c.id===1)c.subscribed?.('SUBSCRIBED');}
}
class Channel {
 fixture:Fixture;id:number;topic:string;handlers:{event:string;fn:(m:any)=>void}[]=[];subscribed?:(s:string)=>void;
 constructor(fixture:Fixture,id:number,topic:string){this.fixture=fixture;this.id=id;this.topic=topic;}
 on(_type:string,filter:{event:string},fn:(m:any)=>void){this.handlers.push({event:filter.event,fn});return this;}
 subscribe(fn:(s:string)=>void){this.subscribed=fn;this.fixture.channels.add(this);if(this.id!==1||!this.fixture.holdGuest)fn('SUBSCRIBED');return this;}
 async track(){this.fixture.tracks++;}
 async send(m:any){
  if(this.topic.endsWith(':state'))assert.equal(this.id,0);if(this.topic.endsWith(':input'))assert.equal(this.id,1);
  for(const c of this.fixture.channels)if(c!==this&&c.topic===this.topic)for(const h of c.handlers)if(h.event===m.event)setTimeout(()=>h.fn({payload:structuredClone(m.payload)}),0);
  return 'ok';
 }
}
const fixture=new Fixture();let host:PartyState|undefined,guest:PartyState|undefined;
const errors:string[]=[];
const a=new BetaSession(fixture.client(0),s=>{host=s;},idle,e=>errors.push(e));
const b=new BetaSession(fixture.client(1),s=>{guest=s;},idle,e=>errors.push(e));
const guestEntry=b.enterLfg({proposal,ticket:tickets[1]});await wait(30);
await a.enterLfg(handoff);assert.equal(fixture.ready[0],true);assert.equal(fixture.phase,'lobby');
await wait(2250);assert.equal(fixture.claims[1],b.lease);assert.equal(fixture.ready[1],false,'claim alone does not mark an unsubscribed guest ready');assert.equal(fixture.phase,'lobby','no start before both private subscriptions');
const duplicate=new BetaSession(fixture.client(0),()=>{},idle,e=>errors.push(e));await assert.rejects(()=>duplicate.enterLfg(handoff),/già usato/);
fixture.releaseGuest();await guestEntry;
const deadline=Date.now()+5000;while((!host?.frame||!guest?.frame)&&Date.now()<deadline)await wait(50);
assert.equal(host?.phase,'fight');assert.equal(guest?.phase,'fight');assert(host?.frame&&guest?.frame,JSON.stringify({host:host?.phase,hostFrame:!!host?.frame,guest:guest?.phase,guestFrame:!!guest?.frame,calls:fixture.calls}));
assert(host.frame.countdown>0&&guest.frame.countdown>0);assert.equal(host.frame.time,0);assert.equal(guest.frame.time,0);assert.equal(host.frame.mobs.length,0);
assert(host.frame.players.every(p=>p.cast===0));assert(guest.frame.players.every(p=>p.cast===0));
assert.equal(fixture.tracks,2,'existing three-channel transport only; Presence tracked once');
assert.equal(fixture.calls.filter(c=>c.name==='coop_beta'&&c.op==='create').length,0,'LFG never creates an unrelated second room');
assert.equal(fixture.calls.filter(c=>c.op==='start').length,1,'host starts exactly once after both ready');
await assert.rejects(()=>a.enterLfg(handoff),/già aperta/);
await a.leave();await b.leave();assert.equal(fixture.channels.size,0);assert.deepEqual(errors,[]);
const cancelledFixture=new Fixture();const cancelled=new BetaSession(cancelledFixture.client(1),()=>{},idle,e=>errors.push(e));
const pendingEntry=cancelled.enterLfg({proposal,ticket:tickets[1]});await wait(30);await cancelled.leave();await pendingEntry;
assert.equal(cancelledFixture.channels.size,0);assert.equal(cancelledFixture.calls.length,1,'leaving a guest-first claim stops retries before any arena exists');
assert.equal(cancelledFixture.calls.filter(c=>c.op==='start').length,0);
console.log('LFG admission PASS: boss2-only/XP0, shape validation, safe consumed ticket storage, fresh BetaSession leases, guest-first claim/retry, duplicate replay denial, private-subscription readiness before one start, native synchronized countdown/manual inputs and cleanup. Fixture transport only.');
