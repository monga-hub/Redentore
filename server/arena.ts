import { randomUUID, randomInt } from 'node:crypto';
import { Survival } from './simulation.ts';
import { acceptInput, controls, idle, validBar, VERSION, type CombatHero, type Controls } from '../src/coop/protocol.ts';
import { ARMOR_SLOTS, componentId, isLegendaryComponentReward } from '../src/loot/gear.ts';

export interface Socket { send(data: string): void; close(code?: number,reason?: string): void; readonly bufferedAmount: number }
export interface Winner { user: string; hero: string; item: string }
interface Member { uid: string; lease: string; hero: CombatHero; socket?: Socket; seen: number; ready: boolean; input: Controls }
interface Room { id: string; invite: string; members: Member[]; phase: 'lobby'|'fight'|'ended'; reason: string; sim?: Survival; born: number; result?: 'victory'|'defeat'; awarding?: boolean; retryAt?: number; awarded: boolean }
export class Arena {
  readonly rooms = new Map<string,Room>();
  private users = new Map<string,Room>();
  private tick = 0;
  private last = 0;
  readonly award: (match: string,winners: Winner[])=>Promise<void>;
  readonly maxRooms: number;
  constructor(award: Arena['award'], maxRooms = 1) { this.award=award;this.maxRooms=maxRooms; }
  admit(uid:string,lease:string,hero:CombatHero,socket:Socket,invite?:string,now=Date.now()): {room: string;slot:number} {
    const old=this.users.get(uid);
    if(old) {
      const m=old.members.find(x=>x.uid===uid)!;
      if(m.lease===lease && !m.socket && now-m.seen<8000 && old.phase!=='ended') {m.socket=socket;m.seen=now;this.broadcast(old);return {room:old.id,slot:old.members.indexOf(m)};}
      if(old.phase==='ended') this.users.delete(uid);
      else throw Error('Account già presente: chiudi l’altra scheda o attendi la fine della stanza.');
    }
    if(this.rooms.size>=this.maxRooms+32){
      const expired=[...this.rooms.values()].find(r=>r.phase==='ended'&&!r.awarding);
      if(!expired)throw Error('Arena occupata: riprova tra poco.');
      expired.sim?.dispose();this.rooms.delete(expired.id);for(const m of expired.members)if(this.users.get(m.uid)===expired)this.users.delete(m.uid);
    }
    let r:Room;
    if(invite) {
      const found=[...this.rooms.values()].find(x=>x.invite===invite);
      if(!found || found.phase!=='lobby' || now-found.born>600000) throw Error('Invito scaduto, non valido o partita già iniziata.');
      if(found.members.length>=2) throw Error('Stanza piena: massimo due giocatori.');
      if(found.members.some(m=>!m.socket || now-m.seen>8000)) throw Error('Stanza disconnessa.');
      r=found;
    } else {
      if([...this.rooms.values()].filter(r=>r.phase!=='ended').length>=this.maxRooms) throw Error('Arena occupata: riprova tra poco.');
      r={id:randomUUID(),invite:randomUUID(),members:[],phase:'lobby',reason:'',born:now,awarded:false};this.rooms.set(r.id,r);
    }
    r.members.push({uid,lease,hero:structuredClone(hero),socket,seen:now,ready:false,input:idle()});this.users.set(uid,r);this.broadcast(r);
    return {room:r.id,slot:r.members.length-1};
  }
  message(uid:string,socket:Socket,msg:unknown,now=Date.now()):void {
    const r=this.users.get(uid),m=r?.members.find(x=>x.uid===uid&&x.socket===socket);
    if(!r||!m||!msg||typeof msg!=='object') throw Error('Sessione arena non valida.');
    m.seen=now;
    const x=msg as Record<string,unknown>;
    if(x.type==='ping') {socket.send(JSON.stringify({type:'pong'}));return;}
    if(x.type==='leave') {this.end(r,'Un giocatore ha lasciato o sospeso la partita.');return;}
    if(r.phase==='ended') return;
    if(x.type==='equip'&&r.phase==='lobby') {
      if(!validBar(m.hero,x.bar))throw Error('Puoi equipaggiare solo le abilità apprese dal tuo eroe.');
      m.hero.bar=[...x.bar];m.ready=false;this.broadcast(r);return;
    }
    if(x.type==='ready'&&r.phase==='lobby') {m.ready=true;this.broadcast(r);return;}
    if(x.type==='start'&&r.phase==='lobby') {
      if(r.members[0]!==m||r.members.length!==2||r.members.some(p=>!p.ready||!p.socket)) throw Error('Entrambi devono essere pronti.');
      r.sim=new Survival(r.members.map(p=>p.hero) as [CombatHero,CombatHero]);r.phase='fight';this.broadcast(r);return;
    }
    if(x.type==='input'&&r.phase==='fight') {
      const c=controls(x.input);
      if(!c) throw Error('Pacchetto di movimento non valido.');
      if(acceptInput(m.input,c)) {m.input=c;r.sim!.input(r.members.indexOf(m),c);}
      return;
    }
    throw Error('Operazione arena non valida.');
  }
  disconnected(uid:string,socket:Socket,now=Date.now()):void {
    const r=this.users.get(uid),m=r?.members.find(x=>x.uid===uid&&x.socket===socket);
    if(m) {m.socket=undefined;m.seen=now;}
  }
  update(now=Date.now()):void {
    const elapsed=this.last ? now-this.last : 50;this.last=now;this.tick++;
    for(const r of this.rooms.values()) {
      if(r.phase==='ended') {if(now-r.born>900000&&!r.awarding) {r.sim?.dispose();this.rooms.delete(r.id);for(const m of r.members) if(this.users.get(m.uid)===r)this.users.delete(m.uid);}continue;}
      if(r.members.some(m=>now-m.seen>8000)) {this.end(r,'Connessione persa per oltre 8 secondi. Nessun premio.');continue;}
      if(r.phase==='lobby'&&now-r.born>600000) {this.end(r,'Invito scaduto. Crea una nuova stanza.');continue;}
      if(r.phase==='fight'&&r.sim) {
        if(elapsed>500) {this.end(r,'Il server è stato sospeso. Partita interrotta senza premio.');continue;}
        // Reconnect grace pauses the entire simulation. It never advances while a peer is absent.
        if(r.members.every(m=>m.socket)) {
          let remaining=elapsed/1000;
          while(remaining>1e-6&&r.sim.outcome==='fight'){const step=Math.min(remaining,.05);r.sim.step(step);remaining-=step;}
        }
        if(r.sim.outcome!=='fight') {
          r.result=r.sim.outcome;
          if(r.result==='victory') {if(!r.retryAt||now>=r.retryAt)void this.finish(r,now);}
          else this.end(r,'Entrambi gli eroi sono caduti.');
        }
        if(this.tick%2===0)this.broadcast(r);
      }
    }
  }
  private async finish(r:Room,now:number):Promise<void> {
    if(r.awarding)return;r.awarding=true;
    const winners=r.members.map(m=>({user:m.uid,hero:m.hero.hero,item:componentId(m.hero.hero,3,'leggendario',ARMOR_SLOTS[randomInt(ARMOR_SLOTS.length)])}));
    if(winners.some(w=>!isLegendaryComponentReward(w.item,w.hero as CombatHero['hero'])))throw Error('Invalid legendary catalogue reward');
    try {await this.award(r.id,winners);r.awarded=true;r.awarding=false;this.end(r,'Cinque minuti superati! Premio personale custodito: ritiralo dalla schermata arena.');}
    catch {r.reason='Vittoria verificata; registro premi temporaneamente non disponibile. Riprovo.';r.awarding=false;r.retryAt=now+5000;}
  }
  private end(r:Room,reason:string):void {r.phase='ended';r.reason=reason;this.broadcast(r);}
  private broadcast(r:Room):void {
    for(const [slot,m] of r.members.entries()) {
      if(!m.socket)continue;
      if(m.socket.bufferedAmount>65536){m.socket.close(1013,'Connessione lenta');m.socket=undefined;continue;}
      m.socket.send(JSON.stringify({type:'state',v:VERSION,room:r.id,invite:r.invite,slot,phase:r.phase,reason:r.reason,awarded:r.awarded,members:r.members.map(p=>({hero:p.hero,ready:p.ready,connected:!!p.socket})),frame:r.sim?.snapshot()}));
    }
  }
  shutdown():void {for(const r of this.rooms.values())if(r.phase!=='ended')this.end(r,'Server in riavvio. Nessun premio per le partite interrotte.');}
}
