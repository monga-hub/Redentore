import { account } from './account.ts';
import { HEROES, HERO_IDS, type Hero } from '../player/heroes.ts';
import { arenaLayout, combatHero, idle, type CombatHero, type Frame } from './protocol.ts';
import { BetaSession, type PartyState } from './session.ts';
import { ArenaView } from './view.ts';
import { ArenaHud } from './hud.ts';
import { initAudio } from '../audio/engine.ts';
import { BASES, tuneOf, levelOf } from '../player/levels.ts';
import { checkVersion } from '../ui/version.ts';
import { ABILITIES } from '../abilities/forsaken.ts';

await checkVersion();
document.body.classList.add('coop');
initAudio();
const css=document.createElement('style');css.textContent=`
body.coop {background:#111820;color:#e8dab9;font:16px Georgia,serif;overflow:hidden}
body.coop #minimap :is(.wmap,.note){display:none!important}
body.coop:not(.coop-fight) :is(#unit,#zone,#target-controls,#jump,.actionbar,#coop-partner,.errors,.tooltip,#minimap,#menu-btn,#menu){display:none!important}
body.coop .actionbar,body.coop #unit,body.coop #target-controls,body.coop #minimap,body.coop #stick,body.coop #jump,body.coop #fullscreen{z-index:11}
#coop-partner{position:fixed;left:calc(16px + env(safe-area-inset-left));top:102px;width:190px;pointer-events:none;z-index:11;background:var(--panel);border:2px solid transparent;box-shadow:var(--panel-shadow);padding:5px 8px;border-radius:4px}
#coop-partner .name{font:bold 11px Georgia;color:#82d7ff;margin-bottom:4px}#coop-partner .res{width:100%;margin-top:3px}
body.touch #coop-partner{top:76px;transform:scale(var(--k));transform-origin:0 0}

#arena-canvas{position:fixed;inset:0;touch-action:none}
#arena{position:fixed;inset:0;z-index:10;display:grid;place-items:center;pointer-events:none;padding:12px;box-sizing:border-box}
#arena .panel{pointer-events:auto;max-width:640px;width:100%;max-height:calc(100dvh - 28px);overflow:auto;box-sizing:border-box;padding:24px;background:linear-gradient(130deg,#28251fee,#100d0aef);border:1px solid #9d8248;border-radius:8px;box-shadow:0 12px 55px #000a}
#arena h1{color:#ffd75e;font-size:28px;margin:0 0 12px}#arena p{line-height:1.45;margin:10px 0}#arena .muted{color:#bcb39f;font:13px/1.5 system-ui}
#arena button,#arena select,#arena input,#arena a.button{font:16px Georgia;min-height:44px;padding:10px;border:1px solid #9d8248;background:#241c13;color:#f6dea3;border-radius:4px;box-sizing:border-box}#arena button{cursor:pointer}#arena button:disabled{opacity:.45;cursor:default}#arena input:not([type=checkbox]){width:100%;font-family:monospace}#arena input[type=checkbox]{width:18px;height:18px;min-height:0;padding:0;vertical-align:middle}#arena select{width:100%}#arena .actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}#arena a{color:#ffd75e}#arena .status{color:#ffce80;min-height:24px;font:14px system-ui;overflow-wrap:anywhere}#arena .party{display:flex;gap:12px}.party>div{flex:1;background:#ffffff08;padding:12px;border:1px solid #736140}.party img{width:52px;height:52px;object-fit:cover;float:left;margin-right:10px;border-radius:50%}
#arena .fighting{display:none}body.coop-fight #arena .panel{display:none}body.coop-fight #arena .fighting{display:flex}
@media(max-height:500px){#arena .panel{padding:12px 18px}#arena h1{font-size:22px}#arena p{margin:6px 0}.party>div{padding:6px}}
`;document.head.append(css);
const root=document.createElement('main');root.id='arena';root.innerHTML=`<section class="panel"><h1>L’assedio dei cinque minuti</h1><p>Beta cooperativa sperimentale: due eroi contro cinque ondate sempre più forti, per 5 minuti. Nessuna ricompensa persistente: niente XP, oro o oggetti.</p><p class="muted">Servono livello 31+ e vittoria sull’Abate del capitolo 3, salvati nel cloud. Usi abilità apprese, build ed equipaggiamento: nessun amico può ferirti. Il browser host gestisce la partita e deve restare in primo piano. Una sola stanza beta alla volta.</p><div class="setup"><label>Eroe dal tuo account<select id="coop-hero"></select></label><p class="eligibility muted"></p><label>Codice invito<input id="coop-code" autocomplete="off" spellcheck="false" placeholder="Incolla il codice o il link privato"></label><div class="actions"><button id="coop-create">Crea stanza privata</button><button id="coop-join">Entra con invito</button></div></div><div class="lobby" hidden><div class="party"></div><p class="invite muted"></p><details class="book"><summary>Abilità dell’arena · modifica gli 8 slot</summary><div class="loadout"></div><p class="muted">Scegli tra tutte le abilità apprese. La barra della campagna resta invariata.</p></details><div class="actions"><button id="coop-copy">Copia link invito</button><button id="coop-ready">Sono pronto</button><button id="coop-start">Inizia assedio</button><button id="coop-leave">Lascia stanza</button></div><p class="muted">WASD / frecce o levetta touch per muoverti. Lancia le abilità equipaggiate con i pulsanti o 1–9, sul bersaglio selezionato, altrimenti sul più vicino. R/T: pozioni. Trascina sul lato destro per ruotare la camera, pizzica per lo zoom. Usa i controlli bersaglio del gioco. Nel menu puoi attivare le abilità automatiche per il tuo eroe, solo per questa arena. Per le magie con tempo di lancio fermati; abilità istantanee e pozioni funzionano in movimento. Benedizioni temporanee della campagna escluse.</p></div><p class="status" role="status" aria-live="polite"></p><div class="actions"><a class="button" href="${location.pathname}">Torna alla campagna</a><a id="coop-login" class="button">Accedi a Mongames</a></div></section>`;document.body.append(root);
const el=<T extends HTMLElement>(q:string)=>root.querySelector<T>(q)!;
const status=(s:string)=>{el('.status').textContent=s;if(phase==='fight')hud?.notice(s);};
const heroSelect=el<HTMLSelectElement>('#coop-hero'),code=el<HTMLInputElement>('#coop-code');
el<HTMLAnchorElement>('#coop-login').href='/accedi.html?next='+encodeURIComponent(location.pathname+location.search);
let saves=new Map<Hero,unknown>(),selected:Hero='risorto',session:BetaSession|undefined,view:ArenaView|undefined,hud:ArenaHud|undefined,room=false,connecting=false,slot=0,latest:Frame|undefined,phase='setup';
let shownLoadout='';
const buttons=()=>{let eligible=false;try{combatHero(saves.get(selected));eligible=true;}catch{}el<HTMLButtonElement>('#coop-create').disabled=!eligible||connecting||room;el<HTMLButtonElement>('#coop-join').disabled=!eligible||connecting||room;};
heroSelect.onchange=()=>{selected=heroSelect.value as Hero;try{const h=combatHero(saves.get(selected));el('.eligibility').textContent=`${HEROES[h.hero].name} · livello ${levelOf(h.xp).lv} · capitolo 3 superato`;}catch(e){el('.eligibility').textContent=(e as Error).message;}buttons();};
async function loadHeroes(){
  const {data}=await account.auth.getSession();el('#coop-login').hidden=!!data.session;
  if(!data.session){status('Accedi con il tuo account Mongames per la beta privata.');buttons();return;}
  const result=await account.from('saves').select('slot,data').eq('game_id','redentore').eq('user_id',data.session.user.id);
  if(result.error){status('Salvataggi cloud non disponibili. La campagna sul dispositivo resta al sicuro.');return;}
  saves=new Map((result.data??[]).filter(r=>HERO_IDS.includes(r.slot as Hero)).map(r=>[r.slot as Hero,r.data]));
  heroSelect.replaceChildren(...HERO_IDS.map(h=>{const o=document.createElement('option');o.value=h;o.textContent=HEROES[h].name;return o;}));
  try{const last=localStorage.getItem('redentore.last') as Hero;if(HERO_IDS.includes(last))selected=last;}catch{/* first hero */}heroSelect.value=selected;heroSelect.onchange!(new Event('change'));
  status('Beta privata senza premi. Crea una stanza o entra con un invito; l’host deve restare in primo piano.');
}
const urlInvite=new URLSearchParams(location.search).get('invite');if(urlInvite)code.value=urlInvite;
function inviteOf(value:string):string|undefined{let v=value.trim();try{if(v.includes('://'))v=new URL(v).searchParams.get('invite')??'';}catch{return;}return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)?v:undefined;}
function send(m:{type:string;bar?:unknown}){if(m.type==='ready'||m.type==='start'||m.type==='equip')void session?.action(m.type,m.bar).catch(e=>status((e as Error).message));}
function leave(){void session?.leave();}
async function connect(invite?:string){
  if(connecting||room)return;
  connecting=true;buttons();status('Connessione alla lobby privata…');
  session=new BetaSession(account,handle,()=>view?.sample()??idle(),status);
  try{await session.enter(selected,invite);}catch(e){await session.leave();room=false;status('Arena non disponibile: '+(e as Error).message);}
  finally{connecting=false;buttons();}
}
function handle(m:PartyState){
    connecting=false;room=m.phase!=='ended';slot=m.slot;phase=m.phase;
    el<HTMLElement>('.setup').hidden=true;el<HTMLElement>('.lobby').hidden=false;el<HTMLButtonElement>('#coop-ready').disabled=m.members[slot]?.ready||phase!=='lobby';el<HTMLButtonElement>('#coop-start').hidden=slot!==0;el<HTMLButtonElement>('#coop-start').disabled=m.members.length!==2||m.members.some((p:{ready:boolean})=>!p.ready)||phase!=='lobby';
    el('.party').replaceChildren(...m.members.map((p:{hero:CombatHero;ready:boolean;connected:boolean},i:number)=>{const div=document.createElement('div'),img=document.createElement('img');img.src=import.meta.env.BASE_URL+'models/'+HEROES[p.hero.hero].portrait;img.alt='';div.append(img,document.createTextNode(`${i===slot?'Tu: ':''}${HEROES[p.hero.hero].name} · liv. ${levelOf(p.hero.xp).lv} · ${p.connected?(p.ready?'Pronto':'In attesa'):'Riconnessione'}`));return div;}));
    const mine=m.members[slot].hero as CombatHero;
    const loadoutKey=JSON.stringify(mine);
    el<HTMLElement>('.book').hidden=phase!=='lobby';
    if(phase==='lobby'&&shownLoadout!==loadoutKey){
      shownLoadout=loadoutKey;const bar=arenaLayout(mine).slice(0,9),owned=tuneOf(mine.picks,mine.learned,HEROES[mine.hero].school).owned;
      el('.loadout').replaceChildren(...bar.map((id,i)=>{const label=document.createElement('label');label.textContent=i===0?'Attacco base':`Slot ${i+1}`;const select=document.createElement('select');const choices=i===0?owned.filter(a=>BASES.includes(a)):['',...owned.filter(a=>!BASES.includes(a))];
        for(const a of choices){const option=document.createElement('option');option.value=a;option.textContent=a?ABILITIES.find(x=>x.id===a)?.name??a:'Vuoto';option.selected=a===(id??'');select.append(option);}
        select.onchange=()=>{const all=[...el('.loadout').querySelectorAll('select')].map(s=>s.value||null);send({type:'equip',bar:all});};label.append(select);return label;}));
    }
    const share=new URL(location.pathname,location.origin);share.searchParams.set('coop','');share.searchParams.set('invite',m.invite);el('.invite').textContent='Codice privato: '+m.invite;
    el<HTMLButtonElement>('#coop-copy').onclick=()=>{void navigator.clipboard.writeText(share.href).then(()=>status('Link copiato. Invialo solo al tuo compagno.')).catch(()=>{code.value=share.href;el<HTMLElement>('.setup').hidden=false;code.focus();code.select();status('Copia il link dal campo invito.');});};
    if(phase==='lobby'&&m.members.length===2&&!view){view=new ArenaView();view.setHeroes(m.members.map(p=>p.hero),slot);}
    if(phase==='fight'&&m.frame){
      if(!view){view=new ArenaView();view.setHeroes(m.members.map((p:{hero:CombatHero})=>p.hero),slot);}
      if(!hud)hud=new ArenaHud(view,m.members.map(p=>p.hero),slot,leave);
      if(!latest||m.frame.seq>=latest.seq){latest=m.frame;view.snapshot(m.frame,m.paused);drawHud(m.frame);}
      document.body.classList.add('coop-fight');status(m.paused?m.reason:'');
    }else if(phase==='ended'){
      document.body.classList.remove('coop-fight');hud?.close();view?.dispose();view=undefined;latest=undefined;room=false;status(String(m.reason).slice(0,250)+(m.frame?` · ${m.frame.time.toFixed(1)}s · ${m.frame.kills} uccisioni`:''));buttons();
    }else status(m.members.length===2?'Entrambi presenti: confermate di essere pronti.':'In attesa del secondo giocatore…');
}
function drawHud(f:Frame){hud?.update(f);}
el<HTMLButtonElement>('#coop-create').onclick=()=>void connect();el<HTMLButtonElement>('#coop-join').onclick=()=>{const invite=inviteOf(code.value);if(!invite){status('Incolla un codice invito valido o il link ricevuto.');return;}void connect(invite);};
el<HTMLButtonElement>('#coop-ready').onclick=()=>send({type:'ready'});el<HTMLButtonElement>('#coop-start').onclick=()=>send({type:'start'});el<HTMLButtonElement>('#coop-leave').onclick=leave;
addEventListener('pagehide',()=>{void session?.leave();});addEventListener('visibilitychange',()=>{if(document.hidden&&room&&phase==='fight')leave();});
document.addEventListener('arena-art-error',()=>status('Caricamento modelli non riuscito. Esci e riprova con una connessione stabile.'));
buttons();void loadHeroes();
