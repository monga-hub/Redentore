import assert from 'node:assert/strict';
import { rememberArenaReturn, arenaReturnHero, takeArenaReturn, adventureUrl } from '../src/coop/return.ts';
import { autosave, resume, type GameState } from '../src/core/save.ts';
import { Survival } from '../server/simulation.ts';
import { combatHero, frame } from '../src/coop/protocol.ts';
import { pack, unpack } from '../src/coop/packets.ts';
import { recap } from '../src/coop/recap.ts';
import type { PartyState } from '../src/coop/session.ts';
class Store {data=new Map<string,string>();getItem(k:string){return this.data.get(k)??null;}setItem(k:string,v:string){this.data.set(k,v);}removeItem(k:string){this.data.delete(k);}}
const tab=new Store() as unknown as Storage,local=new Store() as unknown as Storage;
const checkpoint:GameState={v:1,hero:'tizian',player:{x:-545,y:21,z:108,yaw:1.3,hp:713,mana:126,charge:27},quest:{key:true,gates:['portone'],bossDead:true,boss2Dead:true,accepted3:true,blessLeft:117},dead:[1,3],time:1000,build:{xp:1320,lv:12,picks:['hp'],learned:['pyre'],banked:7},bag:{gold:987,items:[]},gear:{},fog:'checkpoint'};
autosave(checkpoint,local,123);const before=JSON.stringify(resume('tizian',local));
for(const ending of ['exit','victory','defeat','peer-loss','expired','reload']){
  assert(rememberArenaReturn('tizian','owner',tab));tab.setItem('redentore.lfg.handoff','stale-ticket');
  assert.equal(arenaReturnHero('other-account',tab),undefined);assert.equal(arenaReturnHero('owner',tab),'tizian');
  assert.equal(takeArenaReturn('owner',tab,local),'tizian',ending);
  assert.equal(tab.getItem('redentore.lfg.handoff'),null);assert.equal(takeArenaReturn('owner',tab,local),undefined,'one-shot');
  assert.equal(JSON.stringify(resume('tizian',local)),before,'never writes arena into campaign');
}
rememberArenaReturn('tizian','owner',tab);assert.equal(takeArenaReturn('other-account',tab,local),undefined);
rememberArenaReturn('bortolo','owner',tab);assert.equal(takeArenaReturn('owner',tab,local),undefined,'no checkpoint: normal selection');
assert(!rememberArenaReturn('tizian','owner',{setItem(){throw Error('full');}} as unknown as Storage));
assert.equal(adventureUrl('/Redentore/'),'/Redentore/?adventure','no coop, invite or LFG on return');

const heroes=['tizian','bortolo'].map(hero=>combatHero({...checkpoint,hero,build:{xp:1320,picks:[],learned:[]}}));
const sim=new Survival([heroes[0],heroes[1]]);
for(let i=0;i<200;i++)sim.step(.05);
assert.equal(sim.time,0);assert(sim.snapshot().players.every(p=>p.stats?.survived===0),'countdown excluded');
sim.players.forEach(p=>{p.stats.immune=1e6;});sim.step(.05);
const p=sim.players[0],other=sim.players[1];p.stats.hp-=100;
assert.equal(p.stats.heal(400),100);assert.equal(p.stats.heal(400),0);
assert.equal(sim.snapshot().players[0].stats!.healing,100,'effective healing excludes overheal');
p.kit.hurt!(()=>true,1e9,'physical');other.kit.hurt!(()=>true,1e9,'physical');
assert.equal(sim.kills,1);assert.deepEqual(sim.snapshot().players.map(p=>p.stats!.kills),[1,0],'only lethal owner counts the shared kill');
p.stats.immune=0;p.stats.takeDamage(1e9);const deathAt=sim.time;
for(let i=0;i<100;i++)sim.step(.05);
assert.equal(sim.snapshot().players[0].stats!.survived,deathAt);assert.equal(sim.snapshot().players[1].stats!.survived,sim.time);
const f=sim.snapshot(),payload=pack(f,'epoch') as any,decoded=unpack(payload,'epoch',heroes)!;
assert(decoded);assert.equal(decoded.frame.players[0].stats!.healing,100);assert.equal(decoded.frame.players[0].stats!.kills,1);
const legacy={...payload};delete legacy.s;assert(unpack(legacy,'epoch',heroes));assert.equal(unpack(legacy,'epoch',heroes)!.frame.players[0].stats,undefined);
assert(!unpack({...payload,s:[[1,-1,0],[0,0,0]]},'epoch',heroes));assert(!unpack({...payload,s:[[1,1,999],[0,0,0]]},'epoch',heroes));
assert(!frame({...f,players:f.players.map(p=>({...p,stats:{kills:-1,healing:0,survived:0}}))}));
const state:PartyState={room:'r',invite:'i',epoch:'epoch',slot:0,phase:'ended',reason:'technical beta prose',paused:true,members:heroes.map(hero=>({hero,ready:true,connected:true})),frame:decoded.frame};
for(const [outcome,title]of [['victory','Vittoria'],['defeat','Sconfitta']] as const){state.frame!.outcome=outcome;assert.equal(recap(state).title,title);}
state.frame!.outcome='fight';assert.equal(recap(state).title,'Partita interrotta');state.ending='exit';assert.equal(recap(state).title,'Uscita');assert.equal(recap(state).players[0].status,'Uscito');
assert.equal(recap({...state,frame:undefined}).kills,undefined,'missing data never becomes fictional zero');
sim.dispose();console.log('Arena return checkpoint/account/one-use/no-write and real host kills/effective healing/survival/compatible packets/recap: ok');
