import { HEROES, type Hero } from '../player/heroes.ts';
import { CARD, counter, ownSchools, tuneOf } from '../player/levels.ts';
import { ABILITIES } from '../abilities/forsaken.ts';
import { ITEM } from '../loot/bag.ts';
import { SLOT } from '../loot/gear.ts';
import { buildOf } from '../loot/builds.ts';
import { itemTip } from '../ui/tooltip.ts';
import { lfgCharacter, type LfgClient, type LfgEntry, type LfgInspect, type LfgState } from './lfg.ts';

const esc=(s:string)=>s.replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`);
const availability=(status?:string)=>({searching:'Disponibile',offered:'Proposta in corso',preparing:'Partita confermata',claiming:'Ingresso in arena'}[status??'']??'Disponibile');
/** Existing effective cards, not a new talent/rank system. No writes to Equipment, Levels or the save. */
export function lfgBuild(p:LfgInspect){
  const schools=HEROES[p.hero].school,own=ownSchools(p.picks,p.learned,schools),count=counter(own.picks);
  const cards=[...CARD.values()].flatMap(c=>{const n=Math.min(count(c.id),c.max);return n>0?[{id:c.id,name:c.name,kind:c.kind,rank:n,text:c.text,of:c.of,icon:c.icon}]:[];});
  const skills=tuneOf(own.picks,own.learned,schools).owned.map(id=>{
    const name=ABILITIES.find(a=>a.id===id)?.name??id;
    const upgrades=cards.filter(c=>(c.kind==='mod'&&c.of===id)||(c.kind==='fusion'&&(c.icon===id||c.text.toLowerCase().includes(name.toLowerCase()))));
    return {id,name,rank:1+upgrades.reduce((n,c)=>n+c.rank,0),main:id===p.main};
  });
  const outfit=ITEM.get(p.gear.abito??''),build=outfit?.hero===p.hero?buildOf(outfit.build):undefined;
  return {skills,cards,build:build?.name??'Combinazione personale',talents:cards.filter(c=>c.kind==='passive'||c.kind==='fusion')};
}
export function lfgInspectHtml(p:LfgInspect):string {
  const model=lfgBuild(p),who=lfgCharacter(p),at=Date.parse(p.snapshotAt);
  const buildCards=model.cards.filter(c=>c.kind!=='passive'&&c.kind!=='fusion');
  const gear=[...SLOT.values()].filter(s=>p.gear[s.id]).map(s=>{
    const id=p.gear[s.id],it=ITEM.get(id);
    return it?`<details class="gear"><summary>${esc(s.name)} · ${esc(it.name)}</summary>${itemTip(it,{worn:null})}</details>`:`<p>${esc(s.name)} · ${esc(id)}</p>`;
  }).join('');
  return `<h3>${esc(who.name)}</h3><p>${esc(who.className)} · livello ${p.level}</p><p class="small">${Number.isFinite(at)?'Build condivisa alle '+esc(new Date(at).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})):'Build condivisa'} · sola lettura</p>
  <h4>Equipaggiamento</h4>${gear||'<p>Nessun equipaggiamento condiviso.</p>'}<h4>Build</h4><p>${esc(model.build)}</p>
  <h4>Abilità e rank</h4><ul>${model.skills.map(a=>`<li>${esc(a.name)} · rango ${a.rank}${a.main?' · attacco principale':''}</li>`).join('')}</ul>
  <h4>Scelte della build</h4><ul>${buildCards.map(c=>`<li><b>${esc(c.name)} · ${c.rank}</b><span>${esc(c.text)}</span></li>`).join('')||'<li>Nessuna carta selezionata.</li>'}</ul>
  <h4>Talenti · passive e fusioni</h4><ul>${model.talents.map(c=>`<li><b>${esc(c.name)} · ${c.rank}</b><span>${esc(c.text)}</span></li>`).join('')||'<li>Nessuna passiva o fusione selezionata.</li>'}</ul>`;
}

const CSS=`
#coop-lfg[hidden],#coop-lfg-notice[hidden],#coop-lfg-badge[hidden]{display:none!important}
#coop-lfg{position:fixed;inset:0;z-index:21;display:grid;place-items:center;padding:12px;box-sizing:border-box;background:#0009;color:#f3e2b0;font:14px/1.35 Georgia,serif;touch-action:auto}
#coop-lfg .panel{position:relative;box-sizing:border-box;width:min(820px,100%);max-height:calc(100dvh - 24px);display:flex;flex-direction:column;padding:20px 14px 12px;border:3px solid transparent;border-radius:8px;background:var(--panel,#241b12);box-shadow:var(--panel-shadow,0 8px 40px #000)}
#coop-lfg h2{margin:0 42px 8px 0;color:#ffd75e;font:bold 18px Georgia}#coop-lfg p{margin:5px 0}#coop-lfg .small{font:12px/1.4 system-ui;color:#c9b48a}
#coop-lfg button,#coop-lfg-badge,#coop-lfg-notice button{min-height:44px;padding:7px 12px;font:bold 14px Georgia;color:#ffd75e;text-shadow:0 1px 2px #000;border:2px solid transparent;border-radius:4px;background:linear-gradient(#9a2216,#520c07 55%,#2e0503) padding-box,var(--gilt,linear-gradient(#c9a45c,#644720)) border-box;cursor:pointer;touch-action:manipulation}
#coop-lfg button:disabled,#coop-lfg-notice button:disabled{opacity:.55;cursor:default}#coop-lfg button:focus-visible,#coop-lfg-notice button:focus-visible,#coop-lfg-badge:focus-visible{outline:2px solid #ffd75e;outline-offset:2px}
#coop-lfg .quiet,#coop-lfg-notice .quiet{background:linear-gradient(#4a3a26,#1c140c) padding-box,var(--gilt,linear-gradient(#c9a45c,#644720)) border-box}
#coop-lfg .x{position:absolute;right:6px;top:6px;width:44px;padding:0}#coop-lfg .actions,#coop-lfg-notice .actions{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
#coop-lfg .columns{display:grid;grid-template-columns:minmax(220px,38%) minmax(0,1fr);gap:12px;min-height:0;overflow:hidden;margin-top:8px}
#coop-lfg .players,#coop-lfg .inspect{min-height:0;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;padding:4px}
#coop-lfg .players button{display:flex;gap:8px;align-items:center;width:100%;text-align:left;background:#0004;border:1px solid #c9a45c55;margin-bottom:5px;font:14px Georgia}
#coop-lfg .players button[aria-pressed=true]{border-color:#ffd75e;background:#ffd75e22}#coop-lfg .players img{width:42px;height:42px;border-radius:50%;object-fit:cover}#coop-lfg .players b,#coop-lfg .players small{display:block}#coop-lfg .players small{font:11px/1.4 system-ui;color:#c9b48a}
#coop-lfg .inspect{padding:12px;background:radial-gradient(ellipse at 50% 40%,#f3e6c2,#dcc58e 75%,#b99a5c);color:#2a1a0c;border:1px solid #6b4a1e;border-radius:4px}
#coop-lfg .inspect .small{color:#6b4a1e}#coop-lfg .inspect h3{margin:0;font:bold 19px Georgia}#coop-lfg h4{margin:13px 0 5px;font:bold 13px Georgia}#coop-lfg ul{padding-left:18px;margin:5px 0}#coop-lfg li{margin:5px 0;font:12px/1.4 system-ui}#coop-lfg li span{display:block}
#coop-lfg .gear{margin:5px 0}#coop-lfg summary{cursor:pointer;min-height:32px;padding:3px 0;font:13px/1.4 Georgia}
#coop-lfg .box{padding:9px;background:var(--tip-bg,#111520);color:#f3ecd8;border:1px solid var(--tip-border,#9a9fb8);border-radius:4px;font:12px/1.4 system-ui}#coop-lfg .box b,#coop-lfg .box .w,#coop-lfg .box .g{display:block}#coop-lfg .box small{display:flex;justify-content:space-between;gap:10px}#coop-lfg .box .g{color:#3fd84a}#coop-lfg .box .lore{color:#ffd75e}
#coop-lfg .note{min-height:18px;color:#ffb27a;font:12px/1.4 system-ui}#coop-lfg .offer{padding:8px;border:1px solid #c9a45c;background:#0004;margin:6px 0}
#coop-lfg-notice{position:fixed;z-index:25;top:12px;left:50%;transform:translateX(-50%);box-sizing:border-box;width:min(320px,calc(100vw - 500px));padding:9px 12px;color:#f3e2b0;border:2px solid #c9a45c;border-radius:6px;background:var(--panel,#241b12);box-shadow:var(--panel-shadow,0 8px 30px #000);font:13px/1.4 Georgia}
#coop-lfg-notice .peer,#coop-lfg .offer .peer{min-height:28px;padding:0;border:0;background:none;color:inherit;font:13px Georgia;text-decoration:underline;text-align:left}#coop-lfg-notice b{color:#ffd75e}#coop-lfg-notice p{margin:5px 0}#coop-lfg-notice .actions{margin-bottom:0}#coop-lfg-notice button{flex:1;padding:7px 8px}
#coop-lfg-badge{position:fixed;z-index:22;left:50%;transform:translateX(-50%);top:12px;min-height:32px!important;font-size:12px!important}
@media(max-height:500px){#coop-lfg{padding:6px}#coop-lfg .panel{padding:12px 10px 6px;max-height:calc(100dvh - 12px)}#coop-lfg h2{font-size:16px;margin-bottom:4px}#coop-lfg .actions{margin:4px 0}#coop-lfg .columns{margin-top:4px}#coop-lfg .disclosure{font-size:11px;line-height:1.3}#coop-lfg .offer{padding:5px;margin:3px 0}}
@media(max-width:600px){#coop-lfg .columns{grid-template-columns:1fr;overflow-y:auto}#coop-lfg .players{max-height:160px;overflow-y:auto;flex-shrink:0}#coop-lfg .inspect{min-height:180px;overflow:visible}#coop-lfg-notice{left:8px;right:8px;top:auto;bottom:100px;transform:none;width:auto}#coop-lfg-badge{top:auto;bottom:100px}}
`;

type Service=Pick<LfgClient,'join'|'list'|'inspect'|'invite'|'respond'|'leave'>;
/** UI lifetime is independent of queue lifetime. Owner calls update() for canonical service notifications. */
export class LfgUi {
  opened=false;
  private state:LfgState={status:'idle'};
  private client:Service;private hero:()=>Hero;private beforeSearch?:()=>Promise<void>;
  private el:HTMLElement;private banner:HTMLElement;private badge:HTMLButtonElement;private style:HTMLStyleElement;
  private players:HTMLElement;private inspect:HTMLElement;private inline:HTMLElement;private note:HTMLElement;
  private selected?:string;private inspection?:LfgInspect;private entries:LfgEntry[]=[];
  private busy=false;private refreshing=false;private message='';private listKey='';private offerKey='';private inspectKey='';private previous?:HTMLElement;
  private refreshTimer?:ReturnType<typeof setInterval>;private timer:ReturnType<typeof setInterval>;private disposed=false;
  constructor(client:Service,hero:()=>Hero,beforeSearch?:()=>Promise<void>){
    this.client=client;this.hero=hero;this.beforeSearch=beforeSearch;
    this.style=document.createElement('style');this.style.textContent=CSS;document.head.append(this.style);
    this.el=document.createElement('section');this.el.id='coop-lfg';this.el.hidden=true;this.el.setAttribute('role','dialog');this.el.setAttribute('aria-modal','true');this.el.setAttribute('aria-labelledby','coop-lfg-title');
    this.el.innerHTML=`<div class="panel"><h2 id="coop-lfg-title">Avventura cooperativa</h2><button class="x quiet" data-action="close" aria-label="Chiudi ricerca gruppo">×</button><p class="small disclosure">Cercando condividi nome del personaggio, classe, livello, equipaggiamento, abilità e scelte della build. Puoi chiudere e continuare a giocare. Nessuna ricompensa persistente.</p><div class="actions"><button data-action="search">Cerca gruppo</button><button class="quiet" data-action="leave" hidden>Esci dalla coda</button></div><p class="note" role="status" aria-live="polite"></p><div class="offer" hidden></div><div class="columns"><div class="players" aria-label="Giocatori disponibili"></div><div class="inspect"><p>Seleziona un personaggio per esaminare la sua build.</p></div></div></div>`;
    this.players=this.el.querySelector('.players')!;this.inspect=this.el.querySelector('.inspect')!;this.inline=this.el.querySelector('.offer')!;this.note=this.el.querySelector('.note')!;
    this.banner=document.createElement('aside');this.banner.id='coop-lfg-notice';this.banner.hidden=true;this.banner.setAttribute('role','status');this.banner.setAttribute('aria-live','polite');
    this.badge=document.createElement('button');this.badge.id='coop-lfg-badge';this.badge.hidden=true;this.badge.dataset.action='open';this.badge.textContent='Gruppo · in ricerca';
    for(const element of [this.el,this.banner,this.badge]){
      element.addEventListener('click',this.click);
      for(const name of ['pointerdown','pointerup','pointermove','wheel'])element.addEventListener(name,e=>e.stopPropagation());
    }
    addEventListener('keydown',this.key,true);document.body.append(this.el,this.banner,this.badge);
    this.timer=setInterval(()=>this.countdown(),1000);
  }
  private click=(event:Event)=>{
    if(event.target===this.el){this.close();return;}
    const button=(event.target as Element).closest<HTMLButtonElement>('button');if(!button||button.disabled)return;
    const action=button.dataset.action;if(action==='close'){this.close();return;}if(action==='open'){this.open();return;}
    if(button.dataset.entry){void this.select(button.dataset.entry);return;}
    if(this.busy)return;
    if(action==='search')void this.perform(async()=>{await this.beforeSearch?.();return this.client.join(this.hero());});
    else if(action==='leave')void this.perform(async()=>{await this.client.leave();return {status:'idle'};});
    else if(action==='invite'&&this.selected)void this.perform(()=>this.client.invite(this.selected!));
    else if((action==='accept'||action==='reject')&&this.state.proposal&&button.dataset.proposal===this.state.proposal.id){const id=this.state.proposal.id;void this.perform(()=>this.client.respond(id,action==='accept'));}
  };
  private key=(event:KeyboardEvent)=>{
    if(!this.opened&&!this.banner.contains(document.activeElement))return;
    event.stopImmediatePropagation();
    if(event.code==='Escape'&&this.opened){event.preventDefault();this.close();}
    if(event.code==='Tab'&&this.opened){const items=[...this.el.querySelectorAll<HTMLElement>('button:not(:disabled):not([hidden]),summary')],first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  };
  open():void {
    if(this.disposed||this.opened)return;
    this.previous=document.activeElement instanceof HTMLElement?document.activeElement:undefined;this.opened=true;this.el.hidden=false;
    if(document.pointerLockElement)void document.exitPointerLock();this.render();this.el.querySelector<HTMLButtonElement>('[data-action=close]')!.focus();
    void this.refresh();this.refreshTimer=setInterval(()=>void this.refresh(),5000);
  }
  close():void{if(this.state.status==='preparing'||this.state.status==='claiming')return;this.opened=false;this.el.hidden=true;clearInterval(this.refreshTimer);this.render();if(this.previous?.isConnected)this.previous.focus();}
  update(state:LfgState):void {
    if(this.disposed)return;this.state=state;this.message=state.notice??'';
    if(state.entries)this.entries=state.entries.filter(p=>p.id!==state.entry);
    if(state.status==='idle'){this.entries=[];this.selected=undefined;this.inspection=undefined;}
    if(this.selected&&!this.entries.some(e=>e.id===this.selected)){this.selected=undefined;this.inspection=undefined;}
    this.render();
  }
  error(message:string):void{this.message=message;this.render();}
  private async perform(task:()=>Promise<LfgState>):Promise<void>{
    this.busy=true;this.message='';this.render();
    try{this.update(await task());if(this.opened)await this.refresh();}catch(e){this.error((e as Error).message);}finally{this.busy=false;this.render();}
  }
  private async refresh():Promise<void>{
    if(this.disposed||!this.opened||this.state.status==='idle'||this.refreshing)return;this.refreshing=true;
    try{this.update(await this.client.list());}catch(e){this.error((e as Error).message);}finally{this.refreshing=false;}
  }
  private async select(id:string):Promise<void>{
    this.selected=id;this.inspection=undefined;this.render();
    try{const state=await this.client.inspect(id);if(!this.disposed&&this.selected===id){this.inspection=state.inspect;this.render();}}catch(e){if(this.selected===id)this.error((e as Error).message);}
  }
  private render():void {
    if(this.disposed)return;
    this.el.querySelector<HTMLButtonElement>('[data-action=close]')!.disabled=this.state.status==='preparing'||this.state.status==='claiming';
    const active=this.state.status!=='idle',p=this.state.proposal,pending=!!p&&['offered','preparing','claiming'].includes(this.state.status);
    this.el.querySelector<HTMLButtonElement>('[data-action=search]')!.hidden=active;this.el.querySelector<HTMLElement>('.disclosure')!.hidden=active;
    const leave=this.el.querySelector<HTMLButtonElement>('[data-action=leave]')!;leave.hidden=!active;
    this.note.textContent=this.message||(active?(this.state.arenaBusy?'Arena occupata. Rimani in ricerca e continua la campagna.':'Sei disponibile. Chiudi la finestra per continuare a giocare.'):'Serve la vittoria sulla Governatrice, salvata nel cloud. Nessun livello minimo.');
    this.badge.hidden=!active||this.opened||pending;this.banner.hidden=!pending||this.opened;this.inline.hidden=!pending;
    const key=JSON.stringify([this.state.status,p?.id,p?.accepted,p?.peerAccepted,p?.peer?.hero,p?.peer?.level]);
    if(key!==this.offerKey){
      this.offerKey=key;
      const html=pending&&p?`<b>${this.state.status==='offered'?'PARTITA TROVATA':'Partita confermata'}</b><p><button class="peer" data-action="open">${p.peer?esc(lfgCharacter(p.peer).name)+' · livello '+p.peer.level:'Compagno in connessione'} · Esamina</button> · <span data-countdown aria-live="off"></span></p><p class="small">${p.accepted&&!p.peerAccepted?'Hai accettato. Attendi il compagno.':this.state.status==='preparing'?'Conservazione della campagna…':this.state.status==='claiming'?'Ingresso in arena…':'Entrambi devono accettare.'}</p><div class="actions">${this.state.status==='offered'?`<button data-action="accept" data-proposal="${esc(p.id)}"${p.accepted?' disabled':''}>${p.accepted?'ACCETTATO':'ACCETTA'}</button><button class="quiet" data-action="reject" data-proposal="${esc(p.id)}">RIFIUTA</button>`:''}</div>`:'';
      this.banner.innerHTML=html;this.inline.innerHTML=html;
    }
    const listKey=JSON.stringify([this.entries,this.selected]);if(listKey!==this.listKey){
      this.listKey=listKey;this.players.replaceChildren(...this.entries.map(p=>{const button=document.createElement('button'),img=document.createElement('img'),text=document.createElement('span'),name=document.createElement('b'),detail=document.createElement('small'),who=lfgCharacter(p);button.dataset.entry=p.id;button.setAttribute('aria-pressed',String(this.selected===p.id));img.src=import.meta.env.BASE_URL+'models/'+HEROES[p.hero].portrait;img.alt='';name.textContent=who.name;detail.textContent=`${who.className} · liv. ${who.level} · ${availability(p.status)}`;text.append(name,detail);button.append(img,text);return button;}));
      if(!this.entries.length)this.players.textContent=active?'Nessun altro personaggio disponibile.':'Premi Cerca gruppo per renderti disponibile.';
    }
    const inspectKey=JSON.stringify([this.inspection,this.selected,!!this.state.proposal,this.entries.find(e=>e.id===this.selected)?.status]);
    if(inspectKey!==this.inspectKey){
      this.inspectKey=inspectKey;
      this.inspect.innerHTML=this.inspection?lfgInspectHtml(this.inspection):this.selected?'<p>Caricamento della build…</p>':'<p>Seleziona un personaggio per esaminare la sua build.</p>';
      if(this.selected&&this.inspection){const button=document.createElement('button');button.dataset.action='invite';button.textContent='INVITA';this.inspect.prepend(button);}
    }
    const invite=this.inspect.querySelector<HTMLButtonElement>('[data-action=invite]');if(invite)invite.disabled=this.busy||!!this.state.proposal||this.entries.find(e=>e.id===this.selected)?.status!=='searching';
    for(const element of [this.el,this.banner])for(const button of element.querySelectorAll<HTMLButtonElement>('button[data-action=search],button[data-action=leave],button[data-action=accept],button[data-action=reject]'))button.disabled=this.busy||(button.dataset.action==='accept'&&p?.accepted===true);
    this.countdown();
  }
  private countdown():void{const expiry=this.state.proposal?.expiresAt;const left=expiry?Math.max(0,Math.ceil((Date.parse(expiry)-Date.now())/1000)):0;for(const root of [this.el,this.banner])for(const node of root.querySelectorAll('[data-countdown]'))node.textContent=`${left}s`;}
  dispose():void{if(this.disposed)return;this.disposed=true;clearInterval(this.timer);clearInterval(this.refreshTimer);removeEventListener('keydown',this.key,true);this.el.remove();this.banner.remove();this.badge.remove();this.style.remove();}
}
