import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { HEROES, HERO_IDS, type Hero } from '../player/heroes.ts';

export interface LfgEntry { id:string; hero:Hero; level:number; status?:string; snapshotAt?:string }
export interface LfgInspect {hero:Hero;level:number;picks:string[];learned:string[];main:string;gear:Record<string,string>;snapshotAt:string}
export interface LfgHandoff {proposal:string;ticket:string}
export interface LfgProposal {
  id:string;epoch:string;mode:'survival';capacity:2;source:'auto'|'direct';host:boolean;
  accepted:boolean;peerAccepted:boolean;prepared:boolean;peer:LfgEntry|null;expiresAt:string;
}
export interface LfgState {
  status:'idle'|'searching'|'offered'|'preparing'|'claiming'|'admitted';
  entry?:string;expiresAt?:string;notice?:string;arenaBusy?:boolean;proposal?:LfgProposal;
  entries?:LfgEntry[];inspect?:LfgInspect;handoff?:LfgHandoff;admission?:unknown;waitingForHost?:boolean;
}
const uuid=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const hero=(v:unknown):v is Hero=>HERO_IDS.includes(v as Hero);
const entry=(v:unknown):v is LfgEntry=>object(v)&&typeof v.id==='string'&&uuid.test(v.id)&&hero(v.hero)&&Number.isInteger(v.level)&&Number(v.level)>=1&&Number(v.level)<=1001;
const ids=(v:unknown):v is string[]=>Array.isArray(v)&&v.length<=500&&v.every(x=>typeof x==='string'&&x.length<=80);
/** Validate the read-only whitelist, never cast a returned save/peer packet into campaign state. */
export function lfgState(v:unknown):LfgState {
  if(!object(v)||JSON.stringify(v).length>64*1024||!['idle','searching','offered','preparing','claiming','admitted'].includes(String(v.status)))throw Error('Risposta LFG non valida.');
  if(v.entries!==undefined&&(!Array.isArray(v.entries)||v.entries.length>50||!v.entries.every(entry)))throw Error('Lista LFG non valida.');
  if(v.inspect!==undefined){const i=v.inspect;if(!object(i)||!hero(i.hero)||!Number.isInteger(i.level)||Number(i.level)<1||Number(i.level)>1001||!ids(i.picks)||!ids(i.learned)||typeof i.main!=='string'||i.main.length>80||!object(i.gear)||Object.keys(i.gear).length>10||Object.values(i.gear).some(x=>typeof x!=='string'||x.length>160)||typeof i.snapshotAt!=='string')throw Error('Ispezione LFG non valida.');}
  if(v.proposal!==undefined){const p=v.proposal;if(!object(p)||typeof p.id!=='string'||!uuid.test(p.id)||typeof p.epoch!=='string'||!uuid.test(p.epoch)||p.mode!=='survival'||p.capacity!==2||!['auto','direct'].includes(String(p.source))||['host','accepted','peerAccepted','prepared'].some(k=>typeof p[k]!=='boolean')||typeof p.expiresAt!=='string'||!Number.isFinite(Date.parse(p.expiresAt))||(p.peer!==null&&!entry(p.peer)))throw Error('Proposta LFG non valida.');}
  if(v.handoff!==undefined){const h=v.handoff;if(!object(h)||typeof h.proposal!=='string'||!uuid.test(h.proposal)||(typeof h.ticket!=='string'||!uuid.test(h.ticket)))throw Error('Passaggio LFG non valido.');}
  return v as unknown as LfgState;
}
export const LFG_HANDOFF_KEY='redentore.lfg.handoff';
/** Persist only an unclaimed, owner-bound one-use ticket across the route navigation, never a room lease. */
export function storeLfgHandoff(handoff:LfgHandoff,store?:Pick<Storage,'setItem'>):boolean {
  if(!uuid.test(handoff.proposal)||!uuid.test(handoff.ticket))return false;
  try{(store??sessionStorage).setItem(LFG_HANDOFF_KEY,JSON.stringify(handoff));return true;}catch{return false;}
}
/** Consume before using it. A cloned tab still loses the server's atomic one-use claim race. */
export function takeLfgHandoff(proposal:string|null,store?:Pick<Storage,'getItem'|'removeItem'>):LfgHandoff|undefined {
  if(!proposal||!uuid.test(proposal))return;
  try{
    const target=store??sessionStorage,raw=target.getItem(LFG_HANDOFF_KEY);target.removeItem(LFG_HANDOFF_KEY);
    if(!raw||raw.length>256)return;
    const h:unknown=JSON.parse(raw);
    if(object(h)&&h.proposal===proposal&&typeof h.ticket==='string'&&uuid.test(h.ticket))return {proposal,ticket:h.ticket};
  }catch{/* storage unavailable: no unsafe handoff */}
}
/** Existing hero identity: no email/account profile or invented player nickname. */
export const lfgCharacter=(p:Pick<LfgEntry,'hero'|'level'>)=>({name:HEROES[p.hero].name,className:HEROES[p.hero].title,level:p.level});

/** Queue service belongs to solo boot, not its modal. Uses the existing Supabase client/socket.
 * A new page may supply its BetaSession lease for a one-use claim; do not persist a live lease.
 */
export class LfgClient {
  readonly lease:string;
  state:LfgState={status:'idle'};
  private client:SupabaseClient;
  private emit:(state:LfgState)=>void;
  private error:(message:string)=>void;
  private channel?:RealtimeChannel;
  private timer?:ReturnType<typeof setTimeout>;
  private hint?:ReturnType<typeof setTimeout>;
  private reconnectTimer?:ReturnType<typeof setTimeout>;
  private unsubscribe?:()=>void;
  private user='';
  private retries=0;
  private generation=0;
  private active=false;
  private serial:Promise<unknown>=Promise.resolve();
  constructor(client:SupabaseClient,emit:(s:LfgState)=>void,error:(message:string)=>void,lease=crypto.randomUUID()) {
    this.client=client;this.emit=emit;this.error=error;this.lease=lease;
  }
  private run(op:string,args:Record<string,unknown>={}):Promise<LfgState>{
    const generation=this.generation;
    const task=this.serial.then(async()=>{
      if(generation!==this.generation)throw Error('Richiesta LFG annullata.');
      const {data,error}=await this.client.rpc('coop_lfg',{op,lease:this.lease,...args});
      if(error)throw Error(error.message);
      const next=lfgState(data);
      if(generation!==this.generation)throw Error('Risposta LFG scaduta.');
      this.state=next;this.emit(next);this.schedule();return next;
    });
    this.serial=task.catch(()=>{});return task;
  }
  async join(hero:Hero):Promise<LfgState>{
    const generation=this.generation;
    const {data}=await this.client.auth.getSession();
    if(generation!==this.generation)throw Error('Ricerca LFG annullata.');
    if(!data.session)throw Error('Accedi al tuo account Mongames.');
    if(this.user&&this.user!==data.session.user.id)throw Error('Account cambiato: cerca di nuovo.');
    this.user=data.session.user.id;
    const next=await this.run('join',{hero});this.active=true;this.schedule();
    if(!this.unsubscribe){const {data:{subscription}}=this.client.auth.onAuthStateChange((_event,session)=>{
      if(!session||session.user.id!==this.user){
        const stopped=this.stop(),generation=this.generation;
        void stopped.then(()=>{if(generation===this.generation){this.state={status:'idle',notice:'Account disconnesso o cambiato: cerca di nuovo.'};this.emit(this.state);}});
      }
      else void this.client.realtime.setAuth(session.access_token);
    });this.unsubscribe=()=>subscription.unsubscribe();}
    try{await this.subscribe(data.session.access_token);}catch(e){if(generation===this.generation){this.error((e as Error).message);this.retry();}}
    return next;
  }
  list():Promise<LfgState>{return this.run('list');}
  inspect(target:string):Promise<LfgState>{return this.run('inspect',{target});}
  invite(target:string):Promise<LfgState>{return this.run('invite',{target});}
  respond(proposal:string,accept:boolean):Promise<LfgState>{return this.run(accept?'accept':'reject',{proposal});}
  prepare(proposal:string,saved:boolean):Promise<LfgState>{return this.run('prepare',{proposal,payload:{saved}});}
  /** Claim after navigation with this page's fresh BetaSession lease. Guest retries when host not yet claimed. */
  async claim(handoff:LfgHandoff):Promise<LfgState>{
    const next=await this.run('claim',{proposal:handoff.proposal,payload:{ticket:handoff.ticket}});
    if(next.status==='admitted')await this.stop();return next;
  }
  async leave():Promise<void>{
    try{await this.run('leave');}finally{await this.stop();this.state={status:'idle'};this.emit(this.state);}
  }
  private schedule():void{
    clearTimeout(this.timer);
    if(!this.active||this.state.status==='idle'||this.state.status==='admitted')return;
    this.timer=setTimeout(()=>void this.run('heartbeat').catch(e=>{
      this.error((e as Error).message);
      if(this.state.expiresAt&&Date.parse(this.state.expiresAt)<=Date.now()){const stopped=this.stop(),generation=this.generation;void stopped.then(()=>{if(generation===this.generation){this.state={status:'idle',notice:'Disponibilità scaduta: cerca di nuovo.'};this.emit(this.state);}});}
      else this.schedule();
    }),this.state.status==='searching'?10_000:2_000);
  }
  private async subscribe(token:string):Promise<void>{
    if(!this.active||this.channel)return;
    const generation=this.generation;
    await this.client.realtime.setAuth(token);
    if(generation!==this.generation||!this.active)return;
    const c=this.client.channel('coop-lfg:'+this.user,{config:{private:true,broadcast:{self:false,ack:false}}});this.channel=c;
    c.on('broadcast',{event:'changed'},()=>{
      if(this.hint||generation!==this.generation||this.channel!==c||!this.active)return;
      this.hint=setTimeout(()=>{this.hint=undefined;if(this.active)void this.run('heartbeat').catch(e=>this.error((e as Error).message));},250);
    });
    await new Promise<void>((resolve,reject)=>{
      let settled=false;
      const timeout=setTimeout(()=>{if(!settled){settled=true;reject(Error('Notifiche LFG non disponibili; ricerca ancora attiva.'));}},6000);
      c.subscribe(status=>{
        if(generation!==this.generation||this.channel!==c){if(!settled){settled=true;clearTimeout(timeout);reject(Error('Canale LFG annullato.'));}return;}
        if(status==='SUBSCRIBED'){this.retries=0;if(!settled){settled=true;clearTimeout(timeout);resolve();}}
        else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){
          if(!settled){settled=true;clearTimeout(timeout);reject(Error('Notifiche LFG interrotte; recupero tramite coda.'));}
          else this.retry();
        }
      });
    });
  }
  private retry():void{
    if(!this.active||this.reconnectTimer||this.retries>=3)return;
    const old=this.channel;this.channel=undefined;
    if(old)void this.client.removeChannel(old);
    this.retries++;
    this.reconnectTimer=setTimeout(()=>{
      this.reconnectTimer=undefined;
      void this.client.auth.getSession().then(async({data})=>{if(data.session)await this.subscribe(data.session.access_token);})
        .catch(e=>{this.error((e as Error).message);this.retry();});
    },700*this.retries);
  }
  /** Dispose timers/channels without changing the room or publishing queue leave (handoff/logout). */
  async stop():Promise<void>{
    this.active=false;this.user='';++this.generation;clearTimeout(this.timer);clearTimeout(this.hint);clearTimeout(this.reconnectTimer);
    this.timer=this.hint=this.reconnectTimer=undefined;this.unsubscribe?.();this.unsubscribe=undefined;
    const c=this.channel;this.channel=undefined;if(c)await this.client.removeChannel(c);
  }
}
