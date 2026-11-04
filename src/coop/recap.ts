import { HEROES } from '../player/heroes.ts';
import type { PartyState } from './session.ts';
export const matchTime=(seconds:number)=>{const t=Math.floor(seconds);return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;};
export function recap(s:PartyState){
  const f=s.frame;
  const outcome=f?.outcome;
  const title=outcome==='victory'?'Vittoria':outcome==='defeat'?'Sconfitta':s.ending==='exit'?'Uscita':'Partita interrotta';
  return {title,duration:f?matchTime(f.time):undefined,kills:f?.kills,stage:f?.stage,
    players:s.members.map((m,i)=>({portrait:HEROES[m.hero.hero].portrait,name:HEROES[m.hero.hero].name,self:i===s.slot,
      status:s.ending==='exit'&&i===s.slot?'Uscito':!m.connected?'Disconnesso':!f?'Presente':f.players[i]?.hp>0?'In piedi':'Caduto',stats:f?.players[i]?.stats}))};
}
/** Text nodes keep even future participant display names out of HTML. */
export function renderRecap(panel:HTMLElement,s:PartyState,back:()=>void){
  const r=recap(s);panel.replaceChildren();panel.classList.add('recap');panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Riepilogo partita');
  const title=document.createElement('h1');title.textContent=r.title;panel.append(title);
  const stats=document.createElement('dl');
  for(const [label,value]of [['Durata',r.duration],['Mostri uccisi',r.kills],['Ondata',r.stage===undefined?undefined:`${r.stage} / 5`]]){
    if(value===undefined)continue;const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=String(label);dd.textContent=String(value);const metric=document.createElement('div');metric.append(dt,dd);stats.append(metric);
  }panel.append(stats);
  const table=document.createElement('table');table.innerHTML='<thead><tr><th scope="col">Compagno</th><th scope="col">Uccisioni</th><th scope="col">Cure</th><th scope="col">Resistenza</th></tr></thead>';
  const body=document.createElement('tbody');
  for(const p of r.players){
    const row=document.createElement('tr'),name=document.createElement('th');name.scope='row';name.textContent=p.name+(p.self?' · Tu':'');
    const portrait=document.createElement('img');portrait.src=import.meta.env.BASE_URL+'models/'+p.portrait;portrait.alt='';name.prepend(portrait);
    const status=document.createElement('small');status.textContent=p.status;name.append(status);row.append(name);
    for(const value of [p.stats?.kills,p.stats?Math.round(p.stats.healing):undefined,p.stats?matchTime(p.stats.survived):undefined]){const td=document.createElement('td');td.textContent=value===undefined?'—':String(value);row.append(td);}body.append(row);
  }table.append(body);panel.append(table);
  const button=document.createElement('button');button.textContent='Torna all’avventura';button.onclick=back;panel.append(button);button.focus({preventScroll:true});
}
