import { account } from './account.ts';
import { HEROES, HERO_IDS, type Hero } from '../player/heroes.ts';
import { arenaLayout, combatHero, idle, type CombatHero, type Frame } from './protocol.ts';
import { BetaSession, type PartyState } from './session.ts';
import { ArenaView } from './view.ts';
import { BASES, tuneOf, levelOf } from '../player/levels.ts';
import { checkVersion } from '../ui/version.ts';
import { ABILITIES } from '../abilities/forsaken.ts';

await checkVersion();
document.body.classList.add('coop');
const css=document.createElement('style');css.textContent=`
body.coop {background:#111820;color:#e8dab9;font:16px Georgia,serif;overflow:hidden}
body.coop #unit,body.coop #zone,body.coop #minimap,body.coop #target-controls,body.coop #jump {display:none!important}
#arena-canvas{position:fixed;inset:0;touch-action:none}
#arena{position:fixed;inset:0;z-index:10;display:grid;place-items:center;pointer-events:none;padding:12px;box-sizing:border-box}
#arena .panel{pointer-events:auto;max-width:640px;width:100%;max-height:calc(100dvh - 28px);overflow:auto;box-sizing:border-box;padding:24px;background:linear-gradient(130deg,#28251fee,#100d0aef);border:1px solid #9d8248;border-radius:8px;box-shadow:0 12px 55px #000a}
#arena h1{color:#ffd75e;font-size:28px;margin:0 0 12px}#arena p{line-height:1.45;margin:10px 0}#arena .muted{color:#bcb39f;font:13px/1.5 system-ui}
#arena button,#arena select,#arena input,#arena a.button{font:16px Georgia;min-height:44px;padding:10px;border:1px solid #9d8248;background:#241c13;color:#f6dea3;border-radius:4px;box-sizing:border-box}#arena button{cursor:pointer}#arena button:disabled{opacity:.45;cursor:default}#arena input:not([type=checkbox]){width:100%;font-family:monospace}#arena input[type=checkbox]{width:18px;height:18px;min-height:0;padding:0;vertical-align:middle}#arena select{width:100%}#arena .actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}#arena a{color:#ffd75e}#arena .status{color:#ffce80;min-height:24px;font:14px system-ui;overflow-wrap:anywhere}#arena .party{display:flex;gap:12px}.party>div{flex:1;background:#ffffff08;padding:12px;border:1px solid #736140}.party img{width:52px;height:52px;object-fit:cover;float:left;margin-right:10px;border-radius:50%}
#arena .hud{position:absolute;top:10px;left:10px;right:10px;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;pointer-events:none;font:14px system-ui}#arena .hud>div{background:#100c09dc;border:1px solid #8e743e;padding:8px;border-radius:5px}#arena .hud button{pointer-events:auto;font-size:13px;min-height:36px}#arena .skills{position:absolute;right:10px;bottom:12px;max-width:58vw;display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;pointer-events:auto}#arena .skills button{font:12px system-ui;max-width:130px;min-height:48px;background:#171c25ed}#arena .bar{height:7px;background:#3b1515;margin-top:5px}.bar>i{display:block;height:100%;background:#9abf59}
#arena .fighting{display:none}body.coop-fight #arena .panel{display:none}body.coop-fight #arena .fighting{display:flex}
@media(max-height:500px){#arena .panel{padding:12px 18px}#arena h1{font-size:22px}#arena p{margin:6px 0}#arena .skills button{min-height:40px;padding:6px}.party>div{padding:6px}}
`;document.head.append(css);
const root=document.createElement('main');root.id='arena';root.innerHTML=`<section class="panel"><h1>L’assedio dei cinque minuti</h1><p>Beta cooperativa sperimentale: due eroi contro cinque ondate sempre più forti, per 5 minuti. Nessuna ricompensa persistente: niente XP, oro o oggetti.</p><p class="muted">Servono livello 31+ e vittoria sull’Abate del capitolo 3, salvati nel cloud. Usi abilità apprese, build ed equipaggiamento: nessun amico può ferirti. Il browser host gestisce la partita e deve restare in primo piano. Una sola stanza beta alla volta.</p><div class="setup"><label>Eroe dal tuo account<select id="coop-hero"></select></label><p class="eligibility muted"></p><label>Codice invito<input id="coop-code" autocomplete="off" spellcheck="false" placeholder="Incolla il codice o il link privato"></label><div class="actions"><button id="coop-create">Crea stanza privata</button><button id="coop-join">Entra con invito</button></div></div><div class="lobby" hidden><div class="party"></div><p class="invite muted"></p><details class="book"><summary>Abilità dell’arena · modifica gli 8 slot</summary><div class="loadout"></div><p class="muted">Scegli tra tutte le abilità apprese. La barra della campagna resta invariata.</p></details><div class="actions"><button id="coop-copy">Copia link invito</button><button id="coop-ready">Sono pronto</button><button id="coop-start">Inizia assedio</button><button id="coop-leave">Lascia stanza</button></div><p class="muted">WASD / frecce o levetta touch per muoverti. Le abilità equipaggiate si lanciano automaticamente sul nemico più vicino; puoi usarle anche con i pulsanti o 1–9. R/T: pozioni. Per lanciare magie con tempo di lancio fermati. Benedizioni temporanee della campagna escluse.</p></div><p class="status" role="status" aria-live="polite"></p><div class="actions"><a class="button" href="${location.pathname}">Torna alla campagna</a><a id="coop-login" class="button">Accedi a Mongames</a></div></section><div class="hud fighting"><div class="health"></div><div><b class="clock">05:00</b><span class="stage"></span><br><label><input id="coop-auto" type="checkbox" checked> Abilità automatiche</label> <button id="coop-exit-fight">Esci</button><p class="connection"></p></div></div><div class="skills fighting"></div>`;document.body.append(root);
const el=<T extends HTMLElement>(q:string)=>root.querySelector<T>(q)!;
const status=(s:string)=>{el('.status').textContent=s;el('.connection').textContent=s;};
const heroSelect=el<HTMLSelectElement>('#coop-hero'),code=el<HTMLInputElement>('#coop-code');
el<HTMLAnchorElement>('#coop-login').href='/accedi.html?next='+encodeURIComponent(location.pathname+location.search);
let saves=new Map<Hero,unknown>(),selected:Hero='risorto',session:BetaSession|undefined,view:ArenaView|undefined,room=false,connecting=false,slot=0,latest:Frame|undefined,phase='setup';
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
    if(phase==='fight'&&m.frame){
      if(!view){view=new ArenaView();view.setHeroes(m.members.map((p:{hero:CombatHero})=>p.hero),slot);}
      if(!latest||m.frame.seq>=latest.seq){latest=m.frame;view.snapshot(m.frame);drawHud(m.frame);}
      document.body.classList.add('coop-fight');status(m.paused?m.reason:(slot===0?'Browser host attivo · beta senza premi':'Connesso al browser host · beta senza premi'));
    }else if(phase==='ended'){
      document.body.classList.remove('coop-fight');room=false;status(String(m.reason).slice(0,250)+(m.frame?` · ${m.frame.time.toFixed(1)}s · ${m.frame.kills} nemici`:''));buttons();
    }else status(m.members.length===2?'Entrambi presenti: confermate di essere pronti.':'In attesa del secondo giocatore…');
}
function drawHud(f:Frame){
  const left=Math.max(0,Math.ceil(300-f.time));el('.clock').textContent=`${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}`;el('.stage').textContent=` · Ondata ${f.stage}/5 · ${f.kills} nemici`;
  el('.health').replaceChildren(...f.players.map((p,i)=>{const row=document.createElement('div');row.textContent=`${i===slot?'Tu':'Compagno'}: ${Math.ceil(p.hp)}/${Math.ceil(p.max)} PV · ${Math.ceil(p.mana)} mana`;const bar=document.createElement('div');bar.className='bar';const fill=document.createElement('i');fill.style.width=100*Math.max(0,p.hp/p.max)+'%';bar.append(fill);row.append(bar);return row;}));
  const slots=f.players[slot].slots;
  let keys=[...el('.skills').querySelectorAll<HTMLButtonElement>('button')];
  if(keys.length!==slots.length){el('.skills').replaceChildren(...slots.map((_,i)=>{const b=document.createElement('button');b.type='button';b.onclick=e=>{e.preventDefault();if(view)view.controls.casts[i]++;};return b;}));keys=[...el('.skills').querySelectorAll<HTMLButtonElement>('button')];}
  slots.forEach((s,i)=>{keys[i].hidden=!s.id;keys[i].textContent=`${i<9?i+1:i===9?'R':'T'} · ${s.name}${s.cd>.1?' · '+s.cd.toFixed(1)+'s':''}`;keys[i].disabled=s.cd>.1||f.players[slot].hp<=0;});
}
el<HTMLButtonElement>('#coop-create').onclick=()=>void connect();el<HTMLButtonElement>('#coop-join').onclick=()=>{const invite=inviteOf(code.value);if(!invite){status('Incolla un codice invito valido o il link ricevuto.');return;}void connect(invite);};
el<HTMLButtonElement>('#coop-ready').onclick=()=>send({type:'ready'});el<HTMLButtonElement>('#coop-start').onclick=()=>send({type:'start'});el<HTMLButtonElement>('#coop-leave').onclick=leave;el<HTMLButtonElement>('#coop-exit-fight').onclick=leave;
el<HTMLInputElement>('#coop-auto').onchange=e=>{if(view)view.controls.auto=(e.target as HTMLInputElement).checked;};
addEventListener('pagehide',()=>{void session?.leave();});addEventListener('visibilitychange',()=>{if(document.hidden&&room&&phase==='fight')leave();});
document.addEventListener('arena-art-error',()=>status('Caricamento modelli non riuscito. Esci e riprova con una connessione stabile.'));
buttons();void loadHeroes();
