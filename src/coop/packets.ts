import { frame, type CombatHero, type Frame, VERSION } from './protocol.ts';
import { ABILITIES } from '../abilities/forsaken.ts';
import { arenaLayout } from './protocol.ts';
export const NETWORK_HZ=10, LEASE_MS=2000, GRACE_MS=8000, MAX_PACKET=8192;
const round=(n:number)=>Math.round(n*100)/100;
/** No names, gear, learned lists or account IDs in the 10Hz packet. */
export function pack(f:Frame,epoch:string,paused=false,reason=''):unknown {
  return {v:VERSION,e:epoch,q:f.seq,p:paused,r:reason.slice(0,120),d:[round(f.time),f.kills,['fight','victory','defeat'].indexOf(f.outcome),
    f.players.map(p=>[round(p.x),round(p.y),round(p.z),round(p.yaw),round(p.hp),p.max,round(p.mana),p.manaMax,round(p.charge),p.cast,p.slots.map(a=>round(a.cd))]),
    f.mobs.map(m=>[m.id,round(m.x),round(m.y),round(m.z),round(m.yaw),round(m.hp),m.max,['chase','swing','dead'].indexOf(m.state),round(m.t)])]};
}
export function unpack(value:unknown,epoch:string,heroes:CombatHero[]):{frame:Frame;paused:boolean;reason:string}|undefined {
  try{
    if(!value||typeof value!=='object'||JSON.stringify(value).length>MAX_PACKET)return;
    const p=value as {v:number;e:string;q:number;p:boolean;r:string;d:unknown[]};
    if(p.v!==VERSION||p.e!==epoch||!Number.isSafeInteger(p.q)||p.q<0||typeof p.p!=='boolean'||typeof p.r!=='string'||p.r.length>120||!Array.isArray(p.d)||p.d.length!==5)return;
    const [time,kills,outcome,players,mobs]=p.d as [number,number,number,number[][],number[][]];
    if(!Array.isArray(players)||players.length!==2||!Array.isArray(mobs)||mobs.length>24||heroes.length!==2||![0,1,2].includes(outcome))return;
    const f:Frame={seq:p.q,time,stage:Math.min(5,1+Math.floor(time/60)),kills,outcome:(['fight','victory','defeat']as const)[outcome],players:players.map((a,i)=>{
      if(!Array.isArray(a)||a.length!==11||!Array.isArray(a[10])||a[10].length!==11)throw Error();
      const bar=arenaLayout(heroes[i]);const cds=a[10] as unknown as number[];
      return {x:a[0],y:a[1],z:a[2],yaw:a[3],hp:a[4],max:a[5],mana:a[6],manaMax:a[7],charge:a[8],cast:a[9],slots:bar.map((id,k)=>({id:id??'',name:ABILITIES.find(x=>x.id===id)?.name??'',cd:cds[k]}))};}),
      mobs:mobs.map(a=>{if(!Array.isArray(a)||a.length!==9||![0,1,2].includes(a[7]))throw Error();return {id:a[0],x:a[1],y:a[2],z:a[3],yaw:a[4],hp:a[5],max:a[6],state:(['chase','swing','dead']as const)[a[7]],t:a[8]};})};
    if(!frame(f))return;
    return {frame:f,paused:p.p,reason:p.r};
  }catch{return;}
}
