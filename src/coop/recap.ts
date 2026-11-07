import { HEROES } from '../player/heroes.ts';
import type { PartyState } from './session.ts';
export const matchTime=(seconds:number)=>{const t=Math.floor(seconds);return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;};
/** Duel winner from the final frame: the hero standing, or the larger share of health at the bell; -1 for a draw or no result. */
export function duelWinner(s:PartyState):number{
  const f=s.frame;if(!f||f.outcome!=='victory')return -1;
  const share=f.players.map(p=>p.max>0?p.hp/p.max:0);return share[0]>share[1]?0:1;
}
export function duelRecap(s:PartyState){
  const f=s.frame,w=duelWinner(s),other=s.members[1-s.slot];
  const title=f?.outcome==='victory'?(w===s.slot?'Vittoria':'Sconfitta'):f?.outcome==='defeat'?'Pareggio':s.ending==='exit'?'Ti sei ritirato':other&&!other.connected?'Avversario ritirato':'Partita interrotta';
  return {title,duration:f?matchTime(f.time):undefined,
    players:s.members.map((m,i)=>({portrait:HEROES[m.hero.hero].portrait,name:HEROES[m.hero.hero].name,self:i===s.slot,
      status:s.ending==='exit'&&i===s.slot?'Ritirato':!m.connected?'Disconnesso':w===i||w<0&&f?.outcome==='fight'&&s.ending!=='exit'&&s.members.some(o=>!o.connected)?'Vincitore':w>=0?'Sconfitto':f?.outcome==='defeat'?'Pareggio':'Presente',
      stats:f?.players[i]?.stats}))};
}
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
  if(s.mode==='duel'){renderDuel(panel,s,back);return;}
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
/** Arena results: one row per hero, damage dealt, healing done and damage taken, then back to the campaign. */
function renderDuel(panel:HTMLElement,s:PartyState,back:()=>void){
  const r=duelRecap(s);panel.replaceChildren();panel.classList.add('recap');panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Risultati dell’arena');
  const title=document.createElement('h1');title.textContent=r.title;panel.append(title);
  const stats=document.createElement('dl');
  for(const [label,value]of [['Arena','1 contro 1'],['Durata',r.duration]]){if(value===undefined)continue;const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=String(label);dd.textContent=String(value);const metric=document.createElement('div');metric.append(dt,dd);stats.append(metric);}
  panel.append(stats);
  if(s.reason){const why=document.createElement('p');why.className='muted';why.textContent=s.reason;panel.append(why);}
  const table=document.createElement('table');table.innerHTML='<thead><tr><th scope="col">Sfidante</th><th scope="col">Danni inflitti</th><th scope="col">Cure</th><th scope="col">Danni subiti</th></tr></thead>';
  const body=document.createElement('tbody');
  for(const p of r.players){
    const row=document.createElement('tr'),name=document.createElement('th');name.scope='row';name.textContent=p.name+(p.self?' · Tu':'');
    const portrait=document.createElement('img');portrait.src=import.meta.env.BASE_URL+'models/'+p.portrait;portrait.alt='';name.prepend(portrait);
    const status=document.createElement('small');status.textContent=p.status;name.append(status);row.append(name);
    for(const value of [p.stats?.dealt,p.stats?.healing,p.stats?.taken]){const td=document.createElement('td');td.textContent=value===undefined?'—':String(Math.round(value));row.append(td);}body.append(row);
  }table.append(body);panel.append(table);
  const button=document.createElement('button');button.textContent='Torna al gioco';button.onclick=back;panel.append(button);button.focus({preventScroll:true});
}
