import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BetaSession, type PartyState } from '../src/coop/session.ts';
import { pack, unpack, MAX_PACKET } from '../src/coop/packets.ts';
import { combatHero, idle, type Controls } from '../src/coop/protocol.ts';
import { Survival } from '../server/simulation.ts';
const snapshots=['tizian','bortolo'].map(hero=>({hero,build:{xp:9300,picks:[],learned:hero==='tizian'?['pyre','cero']:['frost','caligo']},quest:{boss2Dead:true,boss3Dead:false},gear:{}}));
const heroes=snapshots.map(combatHero);
assert.equal(combatHero({...snapshots[0],build:{...snapshots[0].build,xp:100,lv:99}}).xp,100);
assert.throws(()=>combatHero({...snapshots[0],quest:{boss2Dead:false,boss3Dead:true,accepted2:true}}));
const sim=new Survival([heroes[0],heroes[1]]);sim.players.forEach(p=>{p.stats.immune=1e9;});
const stages=new Set<number>();for(let i=0;i<6201&&sim.outcome==='fight';i++){sim.step(.05);stages.add(sim.snapshot().stage);assert(sim.mobs.length<=24);}
assert.equal(sim.outcome,'victory');assert.deepEqual([...stages],[1,2,3,4,5]);
assert(sim.players.every(p=>p.cast===0),'default inputs remain manual through all five stages');
const payload=pack(sim.snapshot(),'test-epoch'),decoded=unpack(payload,'test-epoch',heroes)!;
assert(decoded);assert.equal(decoded.frame.time,300);assert.equal(decoded.frame.mobs.length,sim.mobs.length);assert.equal(JSON.stringify(pack(decoded.frame,'test-epoch')),JSON.stringify(payload));
assert(JSON.stringify(payload).length<MAX_PACKET);assert(!JSON.stringify(payload).includes('gear'));assert(!JSON.stringify(payload).includes('learned'));assert(!unpack(payload,'other-room',heroes));assert(!unpack({...payload as object,d:[]},'test-epoch',heroes));
sim.dispose();

// Isolated auth/Realtime boundary. Identity comes from the client instance, never message userId.
class Service {
  room:any;
  channels=new Set<Channel>();
  dropFrames=false;offline=new Set<number>();
  rpcCalls:string[]=[];events=0;frames=0;inputs=0;tracks=0;bytes=0;
  client(id:number):SupabaseClient{
    return {auth:{getSession:async()=>({data:{session:{access_token:'fixture-'+id}}})},realtime:{setAuth:async()=>{}},
      rpc:async(name:string,p:any)=>{this.rpcCalls.push(name);assert.equal(name,'coop_beta','no reward/save RPC');try{return {data:this.rpc(id,p),error:null};}catch(e){return {data:null,error:{message:(e as Error).message}};}},
      channel:(topic:string)=>new Channel(this,id,topic),removeChannel:async(c:Channel)=>{this.channels.delete(c);c.status?.('CLOSED');return 'ok';}}as unknown as SupabaseClient;
  }
  rpc(id:number,p:any):unknown{
    const r=this.room;
    if(p.op==='create'||p.op==='join'){
      if(r&&r.ids.includes(id)){if(r.leases[r.ids.indexOf(id)]!==p.lease)throw Error('Account già presente in un’altra scheda');}
      else if(p.op==='create'){if(r)throw Error('Arena occupata');this.room={room:'room-fixture',invite:'invite-fixture',epoch:'epoch-fixture',phase:'lobby',reason:'',ids:[id],leases:[p.lease],members:[{snapshot:snapshots[id],bar:null,ready:false},null]};}
      else {if(!r||p.invite!==r.invite||r.phase!=='lobby')throw Error('Invito non valido');if(r.ids.length===2)throw Error('Stanza piena');r.ids.push(id);r.leases.push(p.lease);r.members[1]={snapshot:snapshots[id],bar:null,ready:false};}
    }
    const x=this.room;const slot=x?.ids.indexOf(id);if(!x||slot<0||x.leases[slot]!==p.lease)throw Error('Non appartieni alla stanza');
    if(p.op==='ready')x.members[slot].ready=true;
    if(p.op==='equip'){x.members[slot].bar=p.payload;x.members[slot].ready=false;}
    if(p.op==='start'){if(slot!==0||!x.members[1]||!x.members.every((m:any)=>m.ready))throw Error('Entrambi pronti');x.phase='fight';}
    if(p.op==='leave'||p.op==='finish')x.phase='ended';
    return structuredClone({...x,slot});
  }
}
class Channel {
  handlers:{kind:string;event:string;fn:(x:any)=>void}[]=[];status?: (s:any)=>void;
  readonly service:Service;readonly id:number;readonly topic:string;
  constructor(service:Service,id:number,topic:string){this.service=service;this.id=id;this.topic=topic;}
  on(kind:string,filter:any,fn:(x:any)=>void){this.handlers.push({kind,event:filter.event,fn});return this;}
  subscribe(fn:(s:any)=>void){this.status=fn;this.service.channels.add(this);queueMicrotask(()=>fn(this.service.offline.has(this.id)?'CHANNEL_ERROR':'SUBSCRIBED'));return this;}
  async track(){this.service.tracks++;return 'ok';}
  async send(m:any){
    const r=this.service.room;
    if(!r.ids.includes(this.id))throw Error('outside room');
    if(this.topic.endsWith(':state')&&r.ids[0]!==this.id)throw Error('guest forged state');
    if(this.topic.endsWith(':input')&&r.ids[1]!==this.id)throw Error('host forged input');
    this.service.events+=2;this.service.bytes+=JSON.stringify(m.payload).length;
    if(m.event==='frame')this.service.frames++;else this.service.inputs++;
    for(const c of this.service.channels)if(c!==this&&c.topic===this.topic&&!(m.event==='frame'&&this.service.dropFrames))for(const h of c.handlers)if(h.event===m.event)setTimeout(()=>h.fn({payload:structuredClone(m.payload)}),20);
    return 'ok';
  }
}
const service=new Service();let host:PartyState|undefined,guest:PartyState|undefined;
let move:Controls={...idle(),x:.6};
const a=new BetaSession(service.client(0),s=>{host=structuredClone(s);},()=>structuredClone(move),()=>{});
const b=new BetaSession(service.client(1),s=>{guest=structuredClone(s);},()=>idle(),()=>{});
await a.enter('tizian');const dupe=new BetaSession(service.client(0),()=>{},()=>idle(),()=>{});await assert.rejects(()=>dupe.enter('tizian'),/altra scheda|altr/);
await b.enter('bortolo','invite-fixture');const third=new BetaSession(service.client(2),()=>{},()=>idle(),()=>{});await assert.rejects(()=>third.enter('tizian','invite-fixture'),/piena/);
await assert.rejects(()=>a.action('start'));await a.action('ready');await b.action('ready');await a.action('start');await wait(2600);
assert(host?.frame&&guest?.frame);assert(host.frame.countdown>0&&guest.frame.countdown>0,'both sessions show authoritative countdown');
assert.equal(host.frame.time,0);assert.equal(guest.frame.time,0);assert.equal(host.frame.mobs.length,0);assert.equal(guest.frame.mobs.length,0);
await wait(10000);
assert.equal(host?.phase,'fight');assert.equal(guest?.phase,'fight');assert(host?.frame&&guest?.frame);assert(host!.frame!.players[0].x>-2,'local host movement actually simulated');
assert(host!.frame!.players.every(p=>p.cast===0),'shipping host and guest sessions default to manual');
const forged=new Channel(service,1,'coop-beta:room-fixture:epoch-fixture:state');await assert.rejects(()=>forged.send({event:'frame',payload:{userId:0}}),/forged/);
assert(service.frames>0&&service.inputs>0);assert.equal(service.tracks,2,'Presence only tracked once/member, not10Hz');assert(service.events<600,'single-room average event budget');
assert(service.rpcCalls.every(x=>x==='coop_beta'));
service.dropFrames=true;await wait(2600);assert(guest?.paused&&host?.paused,'one-way host-state loss stops guest commands and pauses host');const pausedTime=host!.frame!.time;await wait(250);assert.equal(host!.frame!.time,pausedTime,'no phantom simulation during one-way loss');
service.dropFrames=false;await wait(400);assert(host!.frame!.time>pausedTime,'latest paused snapshot resumes commands and simulation');
const guestChannel=[...service.channels].find(c=>c.id===1&&c.topic.endsWith(':input'))!;guestChannel.status!('CHANNEL_ERROR');await wait(1000);assert.equal(service.tracks,3,'bounded reconnect tracks Presence only once again');assert(guest?.phase==='fight');
assert(host!.frame!.players.every(p=>p.cast===0),'reconnect never silently enables automatic skills');
service.offline.add(0);const hostChannel=[...service.channels].find(c=>c.id===0)!;hostChannel.status!('CHANNEL_ERROR');await wait(4400);assert.equal(host?.phase,'ended','host connection failure ends without migration');
move=idle();await a.leave();await b.leave();assert.equal(host?.phase,'ended');assert.equal(guest?.phase,'ended');assert.equal(service.channels.size,0,'leave releases every channel');
console.log(`coop beta ok: real kit300s/five stages, compact packet ${JSON.stringify(payload).length}B, two browser-session state machines through fixture transport, guest forged state/duplicate/third refused, host movement, ${service.frames} frames/${service.inputs} controls, no reward/save calls, unsubscribe.`);
