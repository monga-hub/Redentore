import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { LfgClient, type LfgHandoff } from './lfg.ts';
import { Survival } from '../../server/simulation.ts';
import { combatHero, controls, acceptInput, idle, validBar, type CombatHero, type Controls, type Frame, type Mode } from './protocol.ts';
import { pack, unpack, NETWORK_HZ, LEASE_MS, GRACE_MS, MAX_PACKET } from './packets.ts';

export interface PartyState {ending?:'exit';mode?:Mode;room:string;invite:string;epoch:string;slot:number;phase:'lobby'|'fight'|'ended';reason:string;paused:boolean;members:{hero:CombatHero;ready:boolean;connected:boolean}[];frame?:Frame}
/** The end line both browsers show; the duel names no winner here, the recap does from the final frame. */
export const outcomeLine=(mode:Mode,outcome:Frame['outcome'])=>mode==='duel'?(outcome==='victory'?'Duello concluso. Nessuna ricompensa persistente.':'Pareggio. Nessuna ricompensa persistente.'):(outcome==='victory'?'Cinque minuti superati! Beta senza ricompense persistenti.':'Entrambi gli eroi sono caduti. Nessuna ricompensa.');
interface Row {room:string;invite:string;epoch:string;slot:0|1;phase:PartyState['phase'];reason:string;members:({snapshot:unknown;bar:unknown;ready:boolean}|null)[]}
export class BetaSession {
  readonly lease=crypto.randomUUID(); // per page, never cloned through sessionStorage to another tab
  /** Set by the server's LFG claim: the arena queue admits a duel, everything else is the co-op siege. */
  mode:Mode='survival';
  state?:PartyState;
  private client:SupabaseClient;
  private channels:RealtimeChannel[]=[];
  private joined=false;
  private entering=false;
  private lfg=false;
  private advancing=false;
  private stopped=false;
  private polling=false;
  private changing=false;
  private retrying=false;
  private retries=0;
  private sim?:Survival;
  private lastTick=0;
  private guestAt=0;
  private hostAt=0;
  private startedAt=0;
  private input=idle();
  private sendSeq=0;
  private lastSnapshot=-1;
  private loop?:ReturnType<typeof setInterval>;
  private broadcast?:ReturnType<typeof setInterval>;
  private heartbeat?:ReturnType<typeof setInterval>;
  private inFlight=false;
  private nonce=0;
  private emit:(s:PartyState)=>void;
  private sample:()=>Controls;
  private error:(s:string)=>void;
  constructor(client:SupabaseClient,emit:BetaSession['emit'],sample:BetaSession['sample'],error:BetaSession['error']) {this.client=client;this.emit=emit;this.sample=sample;this.error=error;}
  private beginEntry():void {
    if(this.stopped||this.entering||this.state)throw Error('Sessione già aperta o chiusa.');
    this.entering=true;
  }
  async enter(hero:string,invite?:string):Promise<void>{
    this.beginEntry();
    const {data,error}=await this.client.rpc('coop_beta',{op:invite?'join':'create',lease:this.lease,hero,...(invite?{invite}:{})});
    if(error)throw Error(error.message);
    await this.open(data);
  }
  /** Canonical, account-bound claim only. Never accept a caller-supplied room/snapshot or a copied lease. */
  async enterLfg(handoff:LfgHandoff):Promise<void>{
    this.beginEntry();this.lfg=true;
    const claim=new LfgClient(this.client,()=>{},this.error,this.lease),deadline=performance.now()+30_000;
    try {
      while(!this.stopped){
        const next=await claim.claim(handoff);
        if(this.stopped)return;
        if(next.status==='admitted'){if(next.mode==='duel')this.mode='duel';await this.open(next.admission);return;}
        if(!next.waitingForHost||performance.now()>=deadline)throw Error('Passaggio LFG scaduto. Torna alla campagna e cerca di nuovo.');
        await new Promise(r=>setTimeout(r,500));
      }
    }catch(e){await this.close(true);throw e;}finally{await claim.stop();}
  }
  private async open(row:unknown):Promise<void>{
    try{this.acceptRow(row);await this.subscribe();}catch(e){await this.close(true);throw e;}
    if(this.stopped)return;
    this.heartbeat=setInterval(()=>void this.poll(),LEASE_MS);
    this.loop=setInterval(()=>this.tick(),50);
    this.broadcast=setInterval(()=>void this.exchange(),1000/NETWORK_HZ);
    await this.advanceLfg();
  }
  private async advanceLfg():Promise<void>{
    if(!this.lfg||this.advancing||this.stopped||!this.joined||this.changing||this.state?.phase!=='lobby')return;
    this.advancing=true;
    try{
      if(!this.state.members[this.state.slot].ready)await this.action('ready');
      if(!this.stopped&&this.state.phase==='lobby'&&this.state.slot===0&&this.state.members.length===2&&this.state.members.every(m=>m.ready))await this.action('start');
    }catch(e){this.end('Avvio cooperativa non riuscito: '+(e as Error).message);}finally{this.advancing=false;}
  }
  async action(op:'ready'|'start'|'equip',payload?:unknown):Promise<void>{
    if(!this.state||this.stopped||this.changing)return;
    if(!this.joined)throw Error('Attendi la connessione ai canali privati.');
    if(op==='equip'&&!validBar(this.state.members[this.state.slot].hero,payload))throw Error('Scegli abilità apprese e slot senza duplicati.');
    this.changing=true;
    try{const {data,error}=await this.client.rpc('coop_beta',{op,lease:this.lease,room:this.state.room,...(payload?{payload}:{})});if(error)throw Error(error.message);this.acceptRow(data);}finally{this.changing=false;}
  }
  private acceptRow(raw:unknown):void{
    if(this.stopped)return; // A lobby response already in flight must not reopen a closed encounter.
    const r=raw as Row;
    if(!r||typeof r.room!=='string'||typeof r.epoch!=='string'||![0,1].includes(r.slot)||!['lobby','fight','ended'].includes(r.phase)||!Array.isArray(r.members)||r.members.length!==2)throw Error('Risposta lobby non valida.');
    if(this.state&&(r.room!==this.state.room||r.epoch!==this.state.epoch))throw Error('Stanza cambiata: crea un nuovo invito.');
    const members=r.phase==='ended'&&this.state?this.state.members.map((m,i)=>({...m,connected:!!r.members[i]})):r.members.filter((m):m is NonNullable<typeof m>=>!!m).map(m=>{const hero=combatHero(m.snapshot);if(validBar(hero,m.bar))hero.bar=[...m.bar];return {hero,ready:m.ready===true,connected:true};});
    this.state={mode:this.mode,room:r.room,invite:r.invite,epoch:r.epoch,slot:r.slot,phase:r.phase,reason:r.reason||this.state?.reason||'',members,paused:this.state?.paused??false,frame:r.phase==='ended'&&this.sim?this.sim.snapshot():this.state?.frame};
    if(r.phase==='fight'&&r.slot===0&&!this.sim){if(members.length!==2)throw Error('Manca il compagno.');this.sim=new Survival(members.map(m=>m.hero)as[CombatHero,CombatHero],this.mode);this.startedAt=performance.now();this.lastTick=this.startedAt;this.guestAt=0;}
    this.emit(this.state);
    if(r.phase==='ended')void this.close(false);
    else void this.advanceLfg();
  }
  private async poll():Promise<void>{
    if(this.stopped||!this.state||this.polling)return;this.polling=true;
    try{const {data,error}=await this.client.rpc('coop_beta',{op:'poll',lease:this.lease,room:this.state.room});if(error)throw Error(error.message);this.acceptRow(data);}catch(e){this.end((e as Error).message||'Stanza non disponibile.');}finally{this.polling=false;}
  }
  private async subscribe():Promise<void>{
    if(!this.state||this.stopped)return;
    const nonce=++this.nonce;
    this.joined=false;
    const {data}=await this.client.auth.getSession();if(!data.session)throw Error('Accedi di nuovo al tuo account.');
    await this.client.realtime.setAuth(data.session.access_token);
    const prefix=`coop-beta:${this.state.room}:${this.state.epoch}`;
    const state=this.client.channel(prefix+':state',{config:{private:true,broadcast:{self:false,ack:false}}});
    const input=this.client.channel(prefix+':input',{config:{private:true,broadcast:{self:false,ack:false}}});
    const presence=this.client.channel(prefix+':presence',{config:{private:true,presence:{key:this.lease}}});
    this.channels=[state,input,presence];
    state.on('broadcast',{event:'frame'},({payload})=>{
      if(this.stopped||nonce!==this.nonce||!this.state||this.state.slot!==1)return;
      const next=unpack(payload,this.state.epoch,this.state.members.map(m=>m.hero));
      if(!next||next.frame.seq<this.lastSnapshot)return;
      // Equal sequence is only a paused keepalive, not another simulation/damage step.
      if(next.frame.seq===this.lastSnapshot&&!next.paused&&next.frame.outcome==='fight')return;
      this.lastSnapshot=next.frame.seq;this.hostAt=performance.now();
      this.state.frame=next.frame;this.state.paused=next.paused;this.state.reason=next.reason;this.emit(this.state);
      if(next.frame.outcome!=='fight')this.end(outcomeLine(this.mode,next.frame.outcome));
    });
    input.on('broadcast',{event:'input'},({payload})=>{
      if(this.stopped||nonce!==this.nonce||!this.state||this.state.slot!==0||!payload||payload.e!==this.state.epoch||JSON.stringify(payload).length>1024)return;
      const c=controls(payload.i);if(c&&acceptInput(this.input,c)){this.input=c;this.guestAt=performance.now();this.sim?.input(1,c);}
    });
    // Presence is a connection hint only, never identity, simulation time or readiness authority.
    presence.on('presence',{event:'sync'},()=>{});
    try{
      await Promise.all(this.channels.map(c=>new Promise<void>((resolve,reject)=>{let settled=false;const timeout=setTimeout(()=>{if(!settled){settled=true;reject(Error('Canale privato non disponibile.'));}},6000);c.subscribe(status=>{
        if(nonce!==this.nonce)return;
        if(status==='SUBSCRIBED'){if(!settled){settled=true;clearTimeout(timeout);resolve();}}
        else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){if(!settled){settled=true;clearTimeout(timeout);reject(Error('Connessione Realtime privata non riuscita.'));}else if(!this.stopped)void this.reconnect();}
      });})));
      if(nonce!==this.nonce||this.stopped)return;
      this.joined=true;this.retries=0;this.hostAt=performance.now();
      await presence.track({online:true});
    }catch(e){await this.removeChannels();throw e;}
  }
  private async reconnect():Promise<void>{
    if(this.stopped||this.retrying)return;this.retrying=true;this.joined=false;
    const since=performance.now();
    try{while(!this.stopped&&this.retries<3&&performance.now()-since<GRACE_MS){this.retries++;this.error('Realtime interrotto: partita in pausa, riconnessione…');await this.removeChannels();await new Promise(r=>setTimeout(r,700));try{await this.subscribe();return;}catch{/* bounded retry */}}this.end('Connessione persa. Crea una nuova stanza.');}
    finally{this.retrying=false;}
  }
  private tick():void{
    if(this.stopped||!this.state||this.state.phase!=='fight')return;
    const now=performance.now();
    if(this.state.slot===0&&this.sim){
      const elapsed=now-this.lastTick;this.lastTick=now;
      // A one-off hitch (shader compile, GC, a busy machine) only loses its time; a host stalled past the grace ends it.
      if(elapsed>GRACE_MS){this.end('Browser host sospeso: partita interrotta senza ricompense.');return;}
      const age=this.guestAt?now-this.guestAt:now-this.startedAt;
      if(age>GRACE_MS){this.drop(1);this.end('Ospite disconnesso per oltre8 secondi.');return;}
      this.state.paused=!this.joined||!this.guestAt||age>1000;
      if(this.state.paused){this.state.reason='In attesa del compagno: simulazione in pausa (massimo8s).';return;}
      this.state.reason='Host connesso · beta sperimentale';this.sim.input(0,this.sample());
      let left=Math.min(elapsed,500)/1000;while(left>1e-6&&this.sim.outcome==='fight'){const dt=Math.min(.05,left);this.sim.step(dt);left-=dt;}
    }else if(this.state.slot===1){
      const age=now-this.hostAt;
      if(age>GRACE_MS){this.drop(0);this.end('Browser host non raggiungibile. Nessuna migrazione o ricompensa.');return;}
      if(age>1000&&!this.state.paused){this.state.paused=true;this.state.reason='Host non raggiungibile: simulazione in pausa.';this.emit(this.state);}
    }
  }
  private async exchange():Promise<void>{
    if(this.stopped||!this.joined||!this.state||this.state.phase!=='fight'||this.inFlight)return;
    this.inFlight=true;
    try{
      if(this.state.slot===0&&this.sim){const f=this.sim.snapshot();this.state.frame=f;this.emit(this.state);const payload=pack(f,this.state.epoch,this.state.paused,this.state.reason);if(JSON.stringify(payload).length>MAX_PACKET)throw Error('Stato arena troppo grande.');if(await this.channels[0].send({type:'broadcast',event:'frame',payload})!=='ok')throw Error('Invio Realtime non riuscito.');if(f.outcome!=='fight')this.end(outcomeLine(this.mode,f.outcome));}
      else if(this.state.slot===1&&performance.now()-this.hostAt<=1000){const i=this.sample();i.seq=++this.sendSeq;if(await this.channels[1].send({type:'broadcast',event:'input',payload:{e:this.state.epoch,i}})!=='ok')throw Error('Invio Realtime non riuscito.');}
    }catch{void this.reconnect();}finally{this.inFlight=false;}
  }
  /** Arena: the silent side is the one that left, so the results name the other hero the winner by forfeit. */
  private drop(slot:number):void{const m=this.state?.members[slot];if(this.mode==='duel'&&m)m.connected=false;}
  private end(reason:string,ending?:'exit'):void{if(this.stopped)return;if(this.state){if(this.sim)this.state.frame=this.sim.snapshot();this.state.ending=ending;this.state.phase='ended';this.state.paused=true;this.state.reason=reason;this.emit(this.state);}void this.close(true);}
  async leave():Promise<void>{this.end('Hai lasciato l’arena.', 'exit');}
  private async removeChannels():Promise<void>{this.joined=false;++this.nonce;const channels=this.channels;this.channels=[];await Promise.allSettled(channels.map(c=>this.client.removeChannel(c)));}
  private async close(release:boolean):Promise<void>{
    if(this.stopped)return;this.stopped=true;
    clearInterval(this.loop);clearInterval(this.broadcast);clearInterval(this.heartbeat);
    if(release&&this.state)void this.client.rpc('coop_beta',{op:this.state.slot===0&&this.sim&&this.sim.outcome!=='fight'?'finish':'leave',lease:this.lease,room:this.state.room});
    await this.removeChannels();this.sim?.dispose();
  }
}
