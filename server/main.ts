import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { AwardOutbox } from './outbox.ts';
import { WebSocketServer } from 'ws';
import { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { Arena, type Winner } from './arena.ts';
import { combatHero, VERSION } from '../src/coop/protocol.ts';

const required=(k:string)=>{const v=process.env[k];if(!v)throw Error(`Missing ${k}`);return v;};
const url=required('SUPABASE_URL'),key=required('SUPABASE_PUBLISHABLE_KEY');
const origins=new Set(required('ARENA_ORIGINS').split(',').map(x=>x.trim()));
const dataDir=required('ARENA_DATA_DIR');mkdirSync(dataDir,{recursive:true,mode:0o700});
const outbox=new AwardOutbox(resolve(dataDir,'awards.sqlite'));
const pool=new Pool({connectionString:required('REFEREE_DATABASE_URL'),max:2,connectionTimeoutMillis:5000,query_timeout:5000});
pool.on('error',()=>console.warn('Arena database disconnected; queued awards retained.'));
const auth=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
async function deliver(id:string,winners:Winner[]):Promise<void> {
  const fixed=outbox.enqueue(id,winners);
  await pool.query('select public.coop_award($1::uuid,$2::jsonb)',[id,JSON.stringify(fixed)]);
  outbox.delivered(id);
}
let delivering=false;
async function recover():Promise<void> {
  if(delivering)return;delivering=true;
  try {for(const r of outbox.pending())await deliver(r.id,r.winners);}catch{console.warn('Arena award delivery pending; durable outbox retained.');}finally{delivering=false;}
}
const arena=new Arena(deliver,Math.min(16,Math.max(1,Number(process.env.ARENA_MAX_ROOMS)||1)));
const http=createServer((req,res)=>{if(req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,protocol:VERSION,pending:outbox.pending().length}));}else{res.writeHead(404);res.end();}});
const ws=new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:false});
http.on('upgrade',(req,socket,head)=>{
  if(req.url!=='/arena'||!origins.has(req.headers.origin??'')||ws.clients.size>=128){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
  ws.handleUpgrade(req,socket,head,s=>ws.emit('connection',s,req));
});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
ws.on('connection',socket=>{
  let uid='',authenticating=false,closed=false,windowAt=Date.now(),count=0;
  const deadline=setTimeout(()=>{if(!uid)socket.close(1008,'Accesso scaduto');},8000);
  socket.on('error',()=>socket.close());
  socket.on('close',()=>{closed=true;clearTimeout(deadline);if(uid)arena.disconnected(uid,socket);});
  socket.on('message',async(raw,binary)=>{
    try {
      if(binary)throw Error('Formato non valido');
      const now=Date.now();if(now-windowAt>1000){windowAt=now;count=0;}if(++count>35)throw Error('Troppi messaggi');
      const m=JSON.parse(raw.toString());
      if(uid){arena.message(uid,socket,m);return;}
      if(authenticating)throw Error('Accesso già in corso');
      if(m?.type!=='hello'||m.v!==VERSION||typeof m.token!=='string'||m.token.length>3500||!uuid.test(m.lease)|| (m.invite!==undefined&&!uuid.test(m.invite)) || !['risorto','bortolo','fosca','tizian','zanetto'].includes(m.hero))throw Error('Richiesta accesso non valida');
      authenticating=true;
      const {data,error}=await auth.auth.getUser(m.token);if(error||!data.user)throw Error('Accedi di nuovo al tuo account Mongames.');
      const endpoint=new URL('/rest/v1/saves',url);endpoint.searchParams.set('select','data');endpoint.searchParams.set('user_id','eq.'+data.user.id);endpoint.searchParams.set('game_id','eq.redentore');endpoint.searchParams.set('slot','eq.'+m.hero);
      const response=await fetch(endpoint,{headers:{apikey:key,Authorization:'Bearer '+m.token},signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw Error('Impossibile leggere il tuo salvataggio cloud.');
      const rows=await response.json();const hero=combatHero(rows[0]?.data);
      if(closed)return;
      arena.admit(data.user.id,m.lease,hero,socket,m.invite);uid=data.user.id;clearTimeout(deadline);
    }catch(e){socket.send(JSON.stringify({type:'error',message:e instanceof Error?e.message:'Connessione non riuscita'}));if(!uid)socket.close(1008,'Accesso rifiutato');}
  });
});
const timer=setInterval(()=>arena.update(),50),retry=setInterval(()=>void recover(),5000);
const scoped=await pool.query("select current_user='coop_referee' and has_function_privilege(current_user,'public.coop_award(uuid,jsonb)','EXECUTE') and not has_table_privilege(current_user,'public.saves','SELECT') and not (case when has_schema_privilege(current_user,'auth','USAGE') then has_table_privilege(current_user,'auth.users','SELECT') else false end) as ok");
if(scoped.rows[0]?.ok!==true)throw Error('Arena requires the restricted coop_referee execute-only role.');
http.listen(Number(process.env.PORT)||8787,process.env.HOST||'127.0.0.1',()=>console.log('Arena ready on configured interface.'));
void recover();
async function shutdown(){clearInterval(timer);clearInterval(retry);arena.shutdown();for(const s of ws.clients)s.close(1001,'Riavvio');http.close();await recover();await pool.end();outbox.close();process.exit(0);}
process.once('SIGTERM',()=>void shutdown());process.once('SIGINT',()=>void shutdown());
