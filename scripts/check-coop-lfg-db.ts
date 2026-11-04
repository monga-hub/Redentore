import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const sql=async(name:string)=>readFile(new URL('../supabase/'+name,import.meta.url),'utf8');
await db.exec(`create role anon;create role authenticated;create schema auth;create schema realtime;
grant usage on schema auth,realtime to authenticated,anon;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function realtime.topic() returns text language sql as $$select current_setting('realtime.topic',true)$$;
create table auth.users(id uuid primary key);
create table public.saves(user_id uuid,game_id text,slot text,data jsonb,primary key(user_id,game_id,slot));
alter table public.saves enable row level security;grant select,insert,update on public.saves to authenticated;
create policy own on public.saves to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create table realtime.messages(extension text);alter table realtime.messages enable row level security;
grant select,insert on realtime.messages to authenticated;
create policy broad_read on realtime.messages for select to authenticated using(true);
create policy broad_write on realtime.messages for insert to authenticated with check(true);
create table public.notifications(topic text,payload jsonb);
create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as $$insert into public.notifications values(topic,payload)$$;`);
await db.exec(await sql('coop-beta.sql'));
// Optional operator metadata replay: no hosted connection, only this in-memory database.
const preflightPath=process.env.COOP_LFG_PREFLIGHT;
if(preflightPath){
 const live=JSON.parse(await readFile(preflightPath,'utf8')) as {
  functions:{proname:string;definition:string;owner:string;proacl:string[];security_definer:boolean}[];
  policies:{schemaname:string;tablename:string;policyname:string;permissive:string;cmd:string;roles:string[];qual:string|null;with_check:string|null}[];
  tables:{nspname:string;relname:string;relrowsecurity:boolean}[];
 };
 assert(live.tables.filter(t=>t.relname==='saves'||t.relname==='coop_beta_room').every(t=>t.relrowsecurity));
 await db.exec('create role service_role bypassrls;grant usage on schema auth,realtime to service_role');
 for(const f of live.functions){
  assert(['coop_beta','coop_beta_topic'].includes(f.proname));assert.equal(f.owner,'postgres');assert(f.security_definer);
  await db.exec(f.definition);
  const signature=f.proname==='coop_beta'?'text,uuid,uuid,uuid,text,jsonb':'text,boolean,text';
  await db.exec(`revoke all on function public.${f.proname}(${signature}) from public,anon;grant execute on function public.${f.proname}(${signature}) to authenticated,service_role`);
 }
 await db.exec('drop policy own on public.saves');
 const quote=(v:string)=>'"'+v.replaceAll('"','""')+'"';
 for(const p of live.policies){
  await db.exec(`drop policy if exists ${quote(p.policyname)} on ${quote(p.schemaname)}.${quote(p.tablename)}`);
  await db.exec(`create policy ${quote(p.policyname)} on ${quote(p.schemaname)}.${quote(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(quote).join(',')}${p.qual?' using('+p.qual+')':''}${p.with_check?' with check('+p.with_check+')':''}`);
 }
 // Live broad table privileges and Supabase default privileges must not expose new raw tables/helpers.
 await db.exec('grant all on public.saves to authenticated,service_role;grant all on public.coop_beta_room to service_role;grant select,insert,update on realtime.messages to anon,authenticated,service_role;alter default privileges grant all on tables to authenticated,service_role;alter default privileges grant execute on functions to anon,authenticated,service_role');
}
const originalSavePolicies=(await db.query("select * from pg_policies where tablename='saves' order by policyname")).rows;
const originalSaveAccess=(await db.query("select relacl::text,relrowsecurity from pg_class where oid='public.saves'::regclass")).rows;
await db.exec(await sql('coop-eligibility.sql'));
await db.exec(await sql('coop-lfg.sql'));
const users=[1,2,3,4].map(n=>`${n}`.repeat(8)+'-'+`${n}`.repeat(4)+'-4'+`${n}`.repeat(3)+'-8'+`${n}`.repeat(3)+'-'+`${n}`.repeat(12));
const leases=[1,2,3,4].map(n=>`${n+4}`.repeat(8)+'-'+`${n+4}`.repeat(4)+'-4'+`${n+4}`.repeat(3)+'-8'+`${n+4}`.repeat(3)+'-'+`${n+4}`.repeat(12));
const newLeases=[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()];
const save={hero:'tizian',build:{xp:100,picks:['pyre_hot','pyre_hot'],learned:['pyre'],main:'ember',lv:99,private:'SECRET'},quest:{boss2Dead:true,boss3Dead:false,secret:'SECRET'},gear:{arma:'canna-vetraio'},bag:{gold:9999,items:['SECRET']},email:'SECRET',player:{x:123},fog:'SECRET'};
for(const user of users){await db.query('insert into auth.users values($1)',[user]);await db.query("insert into public.saves values($1,'redentore','tizian',$2)",[user,save]);}
const admin=()=>db.exec('reset role');
async function who(i:number){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${users[i]}',false)`);}
async function rpc(i:number,op:string,options:{proposal?:string;target?:string;payload?:unknown;lease?:string;hero?:string}={}){
 await who(i);return (await db.query<{value:any}>('select public.coop_lfg($1,$2,$3,$4,$5,$6) value',[op,options.lease??leases[i],options.proposal??null,options.target??null,options.hero??'tizian',options.payload??null])).rows[0].value;
}
async function beta(i:number,op:string,options:{room?:string;invite?:string;lease?:string}={}){
 await who(i);return (await db.query<{value:any}>('select public.coop_beta($1,$2,$3,$4,$5) value',[op,options.lease??leases[i],options.room??null,options.invite??null,'tizian'])).rows[0].value;
}
async function expireOffer(){await admin();await db.exec("update public.coop_lfg_offer set expires_at=now()-interval '1 second'");}
async function clear(){await admin();await db.exec('delete from public.coop_lfg_offer;delete from public.coop_lfg_queue;delete from public.coop_beta_room');}
const before=(await db.query('select * from public.saves order by user_id')).rows;
// Legacy admission accepts boss2 without level31/boss3. Raw access stays owner-only.
let room=await beta(0,'create');assert.equal(room.members[0].snapshot.quest.boss2Dead,true);assert.equal(room.members[0].snapshot.quest.boss3Dead,false);
await who(1);await assert.rejects(()=>db.query('select * from public.coop_beta_room'));
await assert.rejects(()=>db.query("select public.coop_beta_admit('create',$1)",[leases[1]]),/permission denied/);
await assert.rejects(()=>db.query('select public.coop_lfg_projection($1,$2)',[users[0],'tizian']),/permission denied/);
await clear();
await admin();await db.query("update public.saves set data=$1 where user_id=$2",[{...save,build:{...save.build,xp:100000},quest:{boss2Dead:false,boss3Dead:true,accepted2:true}},users[3]]);
await assert.rejects(()=>rpc(3,'join'),/Governatrice/);await assert.rejects(()=>beta(3,'create'),/Governatrice/);
await admin();await db.query('update public.saves set data=$1 where user_id=$2',[save,users[3]]);
// Join consent exposes only a whitelist; projection level derives from XP not saved lv.
let a=await rpc(0,'join');assert.equal(a.status,'searching');
await assert.rejects(()=>rpc(0,'join',{lease:newLeases[0]}),/scheda/);
await assert.rejects(()=>rpc(1,'inspect',{target:a.entry}),/Coda scaduta/);
let b=await rpc(1,'join');assert.equal(b.status,'offered');assert.equal(b.proposal.accepted,false);assert.equal(b.proposal.peerAccepted,false);
const proposal=b.proposal.id;
let inspect=(await rpc(1,'inspect',{target:a.entry})).inspect;
assert.equal(inspect.level,3);assert.equal(JSON.stringify(inspect).includes('SECRET'),false);assert.equal(inspect.bag,undefined);assert.equal(inspect.xp,undefined);
await who(0);await assert.rejects(()=>db.query('select * from public.coop_lfg_queue'));await assert.rejects(()=>db.query("update public.saves set data='{}' where user_id=$1 returning *",[users[1]]).then(r=>assert.equal(r.rows.length,1)),/0 !== 1/);
// Restrictive policies defeat broad hub read/write policies. Clients never publish LFG hints.
await db.query("select set_config('realtime.topic',$1,false)",['coop-lfg:'+users[0]]);
await assert.rejects(()=>db.query("insert into realtime.messages values('broadcast')"),/row-level security/);
await admin();await db.exec("insert into realtime.messages values('broadcast')");await who(0);
assert.equal((await db.query('select * from realtime.messages')).rows.length,1);
await db.query("select set_config('realtime.topic',$1,false)",['coop-lfg:'+users[1]]);assert.equal((await db.query('select * from realtime.messages')).rows.length,0);
await who(2);await assert.rejects(()=>rpc(2,'accept',{proposal}),/Coda scaduta/);
await rpc(2,'join');await assert.rejects(()=>rpc(2,'accept',{proposal}),/Proposta scaduta/);
await assert.rejects(()=>beta(2,'create'),/riservata/);
await assert.rejects(()=>rpc(0,'prepare',{proposal,payload:{saved:true}}),/due accettazioni/);
a=await rpc(0,'accept',{proposal});assert.equal(a.status,'offered');assert.equal(a.proposal.peerAccepted,false);
await assert.rejects(()=>rpc(0,'claim',{proposal,payload:{ticket:crypto.randomUUID()},lease:newLeases[0]}),/Proposta non disponibile/);
b=await rpc(1,'accept',{proposal});assert.equal(b.status,'preparing');
await assert.rejects(()=>rpc(0,'prepare',{proposal,payload:{saved:false}}),/Conserva/);
await rpc(0,'prepare',{proposal,payload:{saved:true}});b=await rpc(1,'prepare',{proposal,payload:{saved:true}});assert.equal(b.status,'claiming');
a=await rpc(0,'heartbeat');assert(a.handoff.ticket);assert.notEqual(a.handoff.ticket,b.handoff.ticket);
const hostIndex=a.proposal.host?0:1,guestIndex=hostIndex===0?1:0;
const host=a.proposal.host?a:b,guest=a.proposal.host?b:a;
assert.equal((await rpc(guestIndex,'claim',{proposal,payload:{ticket:guest.handoff.ticket},lease:newLeases[guestIndex]})).waitingForHost,true);
await assert.rejects(()=>rpc(2,'claim',{proposal,payload:{ticket:host.handoff.ticket},lease:newLeases[2]}),/Proposta non disponibile/);
let admitted=await rpc(hostIndex,'claim',{proposal,payload:{ticket:host.handoff.ticket},lease:newLeases[hostIndex]});room=admitted.admission;
await assert.rejects(()=>beta(2,'join',{invite:room.invite}),/riservata/);
await assert.rejects(()=>rpc(hostIndex,'claim',{proposal,payload:{ticket:host.handoff.ticket},lease:crypto.randomUUID()}),/già usato/);
assert.equal((await rpc(hostIndex,'claim',{proposal,lease:newLeases[hostIndex]})).admission.room,room.room);
await assert.rejects(()=>beta(hostIndex,'start',{room:room.room,lease:newLeases[hostIndex]}),/consenso/);
await rpc(guestIndex,'claim',{proposal,payload:{ticket:guest.handoff.ticket},lease:newLeases[guestIndex]});
await beta(hostIndex,'ready',{room:room.room,lease:newLeases[hostIndex]});await beta(guestIndex,'ready',{room:room.room,lease:newLeases[guestIndex]});
assert.equal((await beta(hostIndex,'start',{room:room.room,lease:newLeases[hostIndex]})).phase,'fight');
await assert.rejects(()=>rpc(hostIndex,'join'),/arena/);
await admin();await assert.rejects(async()=>db.exec(await sql('coop-lfg-rollback.sql')),/Arena attiva/);await db.exec('rollback');
// Rejected and expired offers keep both available, avoid immediate repeat, explicit leave removes only owner.
await clear();a=await rpc(0,'join');b=await rpc(1,'join');await rpc(0,'reject',{proposal:b.proposal.id});
a=await rpc(0,'heartbeat');b=await rpc(1,'heartbeat');assert.equal(a.status,'searching');assert.equal(b.status,'searching');
await assert.rejects(()=>rpc(0,'accept',{proposal}),/Proposta scaduta/);
await assert.rejects(()=>rpc(0,'invite',{target:b.entry}),/non disponibile/);
await admin();await db.exec("update public.coop_lfg_queue set avoid_until=now()-interval '1 second'");
a=await rpc(0,'heartbeat');assert.equal(a.status,'offered');await expireOffer();a=await rpc(0,'heartbeat');assert.equal(a.status,'searching');assert.match(a.notice,/scaduto/);
await rpc(0,'leave');assert.equal((await rpc(1,'list')).entries.length,1);await assert.rejects(()=>rpc(1,'inspect',{target:a.entry}),/non disponibile/);
// Offline lease cleanup and same-page reconnect vs fresh-page takeover.
await clear();a=await rpc(0,'join');assert.equal((await rpc(0,'heartbeat')).entry,a.entry);
await admin();await db.exec("update public.coop_lfg_queue set expires_at=now()-interval '1 second'");
a=await rpc(0,'join',{lease:newLeases[0]});assert.notEqual(a.entry,undefined);await assert.rejects(()=>rpc(0,'leave'),/scheda/);
// Offline peer cancels a pending proposal; live participant remains searching.
await clear();a=await rpc(0,'join');b=await rpc(1,'join');await admin();await db.query("update public.coop_lfg_queue set expires_at=now()-interval '1 second' where user_id=$1",[users[0]]);
b=await rpc(1,'heartbeat');assert.equal(b.status,'searching');assert.equal((await rpc(1,'list')).entries.length,1);
// Missing/malformed eligibility and payloads fail closed, with no alternate threshold.
await clear();await admin();await db.query('update public.saves set data=$1 where user_id=$2',[{...save,quest:{boss3Dead:true}},users[3]]);
await assert.rejects(()=>rpc(3,'join'),/Governatrice/);
await admin();await db.query('update public.saves set data=$1 where user_id=$2',[{...save,build:{...save.build,xp:-1}},users[3]]);
await assert.rejects(()=>rpc(3,'join'),/XP/);
await admin();await db.query('update public.saves set data=$1 where user_id=$2',[{...save,build:{...save.build,xp:0}},users[3]]);
assert.equal((await rpc(3,'join')).status,'searching');await rpc(3,'leave');
await admin();await db.query('update public.saves set data=$1 where user_id=$2',[save,users[3]]);
await assert.rejects(()=>rpc(0,'join',{payload:{blob:'x'.repeat(1025)}}),/troppo grande/);
await db.exec('reset role;set role anon');await assert.rejects(()=>db.query("select public.coop_lfg('join',$1)",[leases[0]]),/permission denied/);
// Direct invite uses exactly the same bilateral consent/reservation path.
await clear();room=await beta(3,'create');a=await rpc(0,'join');b=await rpc(1,'join');assert.equal(b.arenaBusy,true);assert.equal(b.status,'searching');
await assert.rejects(()=>rpc(0,'invite',{target:b.entry}),/occupata/);
await admin();await db.exec('delete from public.coop_beta_room');a=await rpc(0,'invite',{target:b.entry});assert.equal(a.proposal.source,'direct');assert.equal(a.proposal.accepted,false);assert.equal(a.proposal.peerAccepted,false);
await assert.rejects(()=>rpc(0,'invite',{target:b.entry}),/riservata/);await assert.rejects(()=>rpc(1,'invite',{target:a.entry}),/riservata/);
await rpc(0,'leave');assert.equal((await rpc(1,'heartbeat')).status,'searching');
// No mutation to campaign rows, policies or grants; rollback restores legacy beta, keeps boss2.
await clear();await admin();assert.deepEqual((await db.query('select * from public.saves order by user_id')).rows,before);
const notifications=(await db.query<{payload:any}>('select payload from public.notifications')).rows;
assert(notifications.length>0);assert(notifications.every(n=>JSON.stringify(n.payload)==='{"changed":true}'));
await db.exec(await sql('coop-lfg-rollback.sql'));
room=await beta(0,'create');assert.equal(room.members[0].snapshot.quest.boss2Dead,true);
await admin();assert.deepEqual((await db.query('select * from public.saves order by user_id')).rows,before);
assert.deepEqual((await db.query("select * from pg_policies where tablename='saves' order by policyname")).rows,originalSavePolicies);
assert.deepEqual((await db.query("select relacl::text,relrowsecurity from pg_class where oid='public.saves'::regclass")).rows,originalSaveAccess);
await db.close();
if(preflightPath)console.log('Live metadata replay PASS: exported beta function definitions, production saves policies/grants plus hostile broad hub/default grants; no hosted execution.');
console.log('LFG SQL PASS: boss2-only/low-level, owner RLS/privacy, reserved singleton, auto/direct bilateral consent, prepare/claim/replay/duplicate tabs, reject/expiry/leave/reconnect, guarded rollback and unchanged saves. Sequential PGlite; no actual concurrent transactions or hosted service claimed.');
