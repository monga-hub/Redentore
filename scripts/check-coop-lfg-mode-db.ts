import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
// Arena 1v1 queue mode (supabase/coop-lfg-mode.sql) on an in-memory PGlite: same-mode pairing only, idempotent install,
// the whole co-op LFG check still passing on top of it, and a guarded rollback to the original coop_lfg.
const sql=async(name:string)=>readFile(new URL('../supabase/'+name,import.meta.url),'utf8');
const bundle=(await Promise.all(['coop-eligibility.sql','coop-lfg.sql','coop-lfg-build.sql','coop-lfg-mode.sql'].map(sql))).join('\n');
const dir=await mkdtemp(join(tmpdir(),'lfg-mode-'));await writeFile(join(dir,'bundle.sql'),bundle);
execFileSync(process.execPath,[fileURLToPath(new URL('./check-coop-lfg-db.ts',import.meta.url))],{env:{...process.env,COOP_LFG_BUNDLE:join(dir,'bundle.sql')},stdio:'pipe'});

const db=new PGlite();
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
create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as $$select$$;`);
await db.exec(await sql('coop-beta.sql'));await db.exec(await sql('build-state.sql'));
for(const f of ['coop-eligibility.sql','coop-lfg.sql','coop-lfg-build.sql'])await db.exec(await sql(f));
const originalBody=(await db.query<{b:string}>("select md5(prosrc) b from pg_proc where proname='coop_lfg'")).rows[0].b;
await db.exec(await sql('coop-lfg-mode.sql'));await db.exec(await sql('coop-lfg-mode.sql')); // idempotent
const users=[0,1,2,3].map(()=>crypto.randomUUID()),leases=users.map(()=>crypto.randomUUID()),claims=users.map(()=>crypto.randomUUID());
const save={hero:'tizian',build:{xp:100,picks:[],learned:['pyre'],main:'ember'},quest:{boss2Dead:true},gear:{}};
for(const u of users){await db.query('insert into auth.users values($1)',[u]);await db.query("insert into public.saves values($1,'redentore','tizian',$2)",[u,save]);}
const expected={hero:'tizian',build:{xp:100,picks:[],learned:['pyre'],main:'ember'},gear:{},quest:{boss2Dead:true,boon:''}};
async function rpc(i:number,op:string,o:{proposal?:string;target?:string;payload?:unknown;lease?:string}={}){
  await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${users[i]}',false)`);
  return (await db.query<{v:any}>('select public.coop_lfg($1,$2,$3,$4,$5,$6) v',[op,o.lease??leases[i],o.proposal??null,o.target??null,'tizian',o.payload??null])).rows[0].v;
}
const duel={mode:'duel'};
let a=await rpc(0,'join',{payload:duel});assert.equal(a.mode,'duel');assert.equal(a.status,'searching');
let c=await rpc(1,'join');assert.equal(c.mode,'survival','no payload stays co-op');assert.equal(c.status,'searching','co-op never pairs with arena');
assert.deepEqual((await rpc(1,'list')).entries.map((e:{id:string})=>e.id),[c.entry],'co-op list hides arena players');
await assert.rejects(()=>rpc(1,'inspect',{target:a.entry}),/non disponibile/);
await assert.rejects(()=>rpc(1,'invite',{target:a.entry}),/non disponibile/,'no cross-mode direct invite');
let b=await rpc(2,'join',{payload:duel});assert.equal(b.status,'offered');assert.equal(b.proposal.mode,'duel');
a=await rpc(0,'heartbeat');assert.equal(a.proposal.mode,'duel');assert.equal(a.proposal.id,b.proposal.id);
c=await rpc(1,'heartbeat');assert.equal(c.status,'searching');assert.equal(c.proposal,undefined);
const proposal=a.proposal.id;
await rpc(0,'accept',{proposal});await rpc(2,'accept',{proposal});
await rpc(0,'prepare',{proposal,payload:{saved:true,expected}});b=await rpc(2,'prepare',{proposal,payload:{saved:true,expected}});
a=await rpc(0,'heartbeat');const host=a.proposal.host?0:2,guest=host?0:2,tickets={[0]:a.handoff.ticket,[2]:b.handoff.ticket} as Record<number,string>;
let admitted=await rpc(host,'claim',{proposal,payload:{ticket:tickets[host]},lease:claims[host]});assert.equal(admitted.mode,'duel','claim tells the page it is an arena');
admitted=await rpc(guest,'claim',{proposal,payload:{ticket:tickets[guest]},lease:claims[guest]});assert.equal(admitted.mode,'duel');assert.equal(admitted.admission.members.length,2);
await db.exec('reset role');await assert.rejects(async()=>db.exec(await sql('coop-lfg-mode-rollback.sql')),/arena attiva/);await db.exec('rollback');
await db.exec('delete from public.coop_lfg_offer;delete from public.coop_beta_room');
await db.exec(await sql('coop-lfg-mode-rollback.sql'));
assert.equal((await db.query<{b:string}>("select md5(prosrc) b from pg_proc where proname='coop_lfg'")).rows[0].b,originalBody,'rollback restores the original coop_lfg');
assert.equal((await db.query("select 1 from information_schema.columns where column_name='mode' and table_name like 'coop_lfg%'")).rows.length,0);
assert.equal((await rpc(3,'join',{payload:duel})).proposal?.mode,'survival','old function ignores the mode: the remaining co-op player pairs');
await db.close();
console.log('LFG mode SQL PASS: idempotent install, co-op/arena never cross-pair, list/inspect/invite stay in mode, claim returns duel, full co-op LFG check on top of the migration, guarded rollback restores coop_lfg.');
