import assert from 'node:assert/strict';
import { mock } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LfgClient, lfgState, lfgCharacter, type LfgState } from '../src/coop/lfg.ts';
const user=crypto.randomUUID(),id=crypto.randomUUID();
const calls:{name:string;args:Record<string,unknown>}[]=[],channels:Channel[]=[];
let response:LfgState={status:'searching',entry:id,expiresAt:new Date(Date.now()+35_000).toISOString()};
let authChanged:((event:string,session:unknown)=>void)|undefined;
let pending:((v:unknown)=>void)|undefined;
let hold=false,removed=0,unsubscribed=0;
class Channel {
 topic:string;options:unknown;event?:()=>void;status?:(s:string)=>void;
 constructor(topic:string,options:unknown){this.topic=topic;this.options=options;}
 on(_type:string,_filter:unknown,fn:()=>void){this.event=fn;return this;}
 subscribe(fn:(s:string)=>void){this.status=fn;fn('SUBSCRIBED');return this;}
}
const fake={
 rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});if(hold)return await new Promise(resolve=>{pending=resolve;});return {data:structuredClone(response),error:null};},
 auth:{getSession:async()=>({data:{session:{user:{id:user},access_token:'fixture-token'}}}),onAuthStateChange:(fn:typeof authChanged)=>{authChanged=fn;return {data:{subscription:{unsubscribe:()=>{unsubscribed++;}}}};}},
 realtime:{setAuth:async()=>{}},
 channel:(topic:string,options:unknown)=>{const c=new Channel(topic,options);channels.push(c);return c;},
 removeChannel:async(c:Channel)=>{removed++;c.status?.('CLOSED');},
} as unknown as SupabaseClient;
const states:LfgState[]=[],errors:string[]=[];
const client=new LfgClient(fake,s=>states.push(s),e=>errors.push(e));
mock.timers.enable({apis:['setTimeout']});
const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
await client.join('tizian');assert.equal(channels.length,1);assert.equal(channels[0].topic,'coop-lfg:'+user);assert.deepEqual(channels[0].options,{config:{private:true,broadcast:{self:false,ack:false}}});
assert.equal(lfgCharacter({hero:'tizian',level:3}).name,'Fra’ Tizian');
assert.equal(calls[0].args.lease,client.lease);
// No panel exists: service heartbeat stays active independently of UI visibility/pause.
mock.timers.tick(10_000);await drain();assert.equal(calls.at(-1)?.args.op,'heartbeat');
const baseline=calls.length;channels[0].event?.();channels[0].event?.();mock.timers.tick(250);await drain();assert.equal(calls.length,baseline+1,'coalesce duplicate hints; canonical RPC only');
// A private notification cannot accept or start a match.
assert(calls.every(c=>c.name==='coop_lfg'));assert(calls.every(c=>!['accept','prepare','claim','start'].includes(String(c.args.op))));
response={status:'offered',entry:id,expiresAt:new Date(Date.now()+35_000).toISOString(),proposal:{id:crypto.randomUUID(),epoch:crypto.randomUUID(),mode:'survival',capacity:2,source:'auto',host:true,accepted:false,peerAccepted:false,prepared:false,peer:{id:crypto.randomUUID(),hero:'bortolo',level:4},expiresAt:new Date(Date.now()+30_000).toISOString()}};
await client.list();mock.timers.tick(2_000);await drain();assert.equal(client.state.status,'offered');
await client.respond(response.proposal!.id,true);assert.equal(calls.at(-1)?.args.op,'accept');
await client.prepare(response.proposal!.id,true);assert.deepEqual(calls.at(-1)?.args.payload,{saved:true});
channels[0].status?.('CHANNEL_ERROR');await drain();mock.timers.tick(700);await drain();assert.equal(channels.length,2);assert.equal(removed,1);assert.equal(calls[0].args.lease,client.lease,'reconnect retains same page lease');
const beforeStale=calls.length;channels[0].event?.();mock.timers.tick(250);await drain();assert.equal(calls.length,beforeStale,'old channel cannot trigger polling');
// An in-flight response after disposal cannot reopen the queue or schedule another heartbeat.
hold=true;const late=client.list();await drain();assert(pending);await client.stop();pending!({data:response,error:null});await assert.rejects(()=>late,/scaduta/);hold=false;const stoppedCount=calls.length;mock.timers.tick(40_000);await drain();assert.equal(calls.length,stoppedCount);assert.equal(unsubscribed,1);
// New-page one-use claim uses supplied fresh arena lease; only an admission result stops polling.
const arenaLease=crypto.randomUUID();const claimant=new LfgClient(fake,s=>states.push(s),e=>errors.push(e),arenaLease);
response={status:'admitted',admission:{room:crypto.randomUUID()}};
await claimant.claim({proposal:crypto.randomUUID(),ticket:crypto.randomUUID()});assert.equal(calls.at(-1)?.args.lease,arenaLease);assert.equal(calls.at(-1)?.args.op,'claim');
response={status:'searching',entry:id};const other=new LfgClient(fake,s=>states.push(s),e=>errors.push(e));await other.join('bortolo');response={status:'idle'};await other.leave();assert.equal(calls.at(-1)?.args.op,'leave');assert.equal(other.state.status,'idle');
const logged=new LfgClient(fake,s=>states.push(s),e=>errors.push(e));response={status:'searching',entry:id};await logged.join('tizian');authChanged?.('SIGNED_OUT',null);await drain();const loggedCount=calls.length;mock.timers.tick(40_000);await drain();assert.equal(calls.length,loggedCount,'logout stops availability renewal');
assert.throws(()=>lfgState({status:'fake'}));assert.throws(()=>lfgState({status:'searching',entries:[{id,hero:'private-email',level:1}]}));
assert.throws(()=>lfgState({status:'claiming',handoff:{proposal:id,ticket:null}}));
assert.equal(errors.length,0);mock.timers.reset();
console.log('LFG client PASS: persistent queue heartbeat, private owner hints/canonical RPC, explicit consent only, bounded channel reconnect, stale callback/response disposal, new-lease claim, leave/logout and projection validation. Mock SDK; no hosted service.');
