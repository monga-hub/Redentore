import { frame, type CombatHero, type Frame, VERSION } from './protocol.ts';
import { ABILITIES } from '../abilities/forsaken.ts';
import { arenaLayout } from './protocol.ts';
export const NETWORK_HZ=10, LEASE_MS=2000, GRACE_MS=8000, MAX_PACKET=8192;
const round=(n:number)=>Math.round(n*100)/100;
/** No names, gear, learned lists or account IDs in the 10Hz packet. */
export function pack(f:Frame,epoch:string,paused=false,reason=''):unknown {
  return {...(f.players.every(p=>p.stats)?{s:f.players.map(p=>[p.stats!.kills,round(p.stats!.healing),round(p.stats!.survived)])}:{}),v:VERSION,e:epoch,q:f.seq,p:paused,r:reason.slice(0,120),d:[round(f.time),f.kills,['fight','victory','defeat'].indexOf(f.outcome),
    f.players.map(p=>[round(p.x),round(p.y),round(p.z),round(p.yaw),round(p.hp),p.max,round(p.mana),p.manaMax,round(p.charge),p.cast,p.slots.map(a=>[round(a.cd),a.cost,a.reason]),p.target,p.feedback,p.casting?[p.casting.slot,round(p.casting.t),round(p.casting.total)]:null]),
    f.mobs.map(m=>[m.id,round(m.x),round(m.y),round(m.z),round(m.yaw),round(m.hp),m.max,['chase','swing','dead'].indexOf(m.state),round(m.t)]),
    f.events.map(e=>[e.seq,e.player,e.slot,e.tick,e.target,round(e.x),round(e.y),round(e.z),round(e.yaw)]),round(f.countdown)]};
}
export function unpack(value:unknown,epoch:string,heroes:CombatHero[]):{frame:Frame;paused:boolean;reason:string}|undefined {
  try{
    if(!value||typeof value!=='object'||JSON.stringify(value).length>MAX_PACKET)return;
    const p=value as {v:number;e:string;q:number;p:boolean;r:string;d:unknown[];s?:unknown};
    if(p.v!==VERSION||p.e!==epoch||!Number.isSafeInteger(p.q)||p.q<0||typeof p.p!=='boolean'||typeof p.r!=='string'||p.r.length>120||!Array.isArray(p.d)||p.d.length!==7)return;
    if(p.s!==undefined&&(!Array.isArray(p.s)||p.s.length!==2||!p.s.every(a=>Array.isArray(a)&&a.length===3&&a.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0)&&Number.isSafeInteger(a[0]))))return;
    const stats=p.s as [number,number,number][]|undefined;
    const [time,kills,outcome,players,mobs,events,countdown]=p.d as [number,number,number,unknown[][],number[][],number[][],number];
    if(!Array.isArray(players)||players.length!==2||!Array.isArray(mobs)||mobs.length>24||!Array.isArray(events)||events.length>24||heroes.length!==2||![0,1,2].includes(outcome))return;
    const f:Frame={seq:p.q,countdown,time,stage:Math.min(5,1+Math.floor(time/60)),kills,outcome:(['fight','victory','defeat']as const)[outcome],players:players.map((a,i)=>{
      if(!Array.isArray(a)||a.length!==14||!Array.isArray(a[10])||a[10].length!==11)throw Error();
      const bar=arenaLayout(heroes[i]);const slots=a[10] as [number,number,string][];
      const casting=a[13] as number[]|null;
      if(casting!==null&&(!Array.isArray(casting)||casting.length!==3))throw Error();
      return {...(stats?{stats:{kills:stats[i][0],healing:stats[i][1],survived:stats[i][2]}}:{}),x:a[0] as number,y:a[1] as number,z:a[2] as number,yaw:a[3] as number,hp:a[4] as number,max:a[5] as number,mana:a[6] as number,manaMax:a[7] as number,charge:a[8] as number,cast:a[9] as number,target:a[11] as number,feedback:a[12] as string,casting:casting?{slot:casting[0],t:casting[1],total:casting[2]}:null,slots:bar.map((id,k)=>{if(!Array.isArray(slots[k])||slots[k].length!==3)throw Error();return {id:id??'',name:ABILITIES.find(x=>x.id===id)?.name??'',cd:slots[k][0],cost:slots[k][1],reason:slots[k][2]};})};}),
      mobs:mobs.map(a=>{if(!Array.isArray(a)||a.length!==9||![0,1,2].includes(a[7]))throw Error();return {id:a[0],x:a[1],y:a[2],z:a[3],yaw:a[4],hp:a[5],max:a[6],state:(['chase','swing','dead']as const)[a[7]],t:a[8]};}),
      events:events.map(a=>{if(!Array.isArray(a)||a.length!==9)throw Error();return {seq:a[0],player:a[1],slot:a[2],tick:a[3],target:a[4],x:a[5],y:a[6],z:a[7],yaw:a[8]};})};
    if(!frame(f))return;
    return {frame:f,paused:p.p,reason:p.r};
  }catch{return;}
}
