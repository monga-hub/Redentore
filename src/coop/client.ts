import { account } from './account.ts';
import { HEROES, HERO_IDS, type Hero } from '../player/heroes.ts';
import { arenaLayout, combatHero, frame, validHero, VERSION, type CombatHero, type Frame } from './protocol.ts';
import { resume, autosave, valid, ahead } from '../core/save.ts';
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
#arena button,#arena select,#arena input,#arena a.button{font:16px Georgia;min-height:44px;padding:10px;border:1px solid #9d8248;background:#241c13;color:#f6dea3;border-radius:4px;box-sizing:border-box}#arena button{cursor:pointer}#arena button:disabled{opacity:.45;cursor:default}#arena input{width:100%;font-family:monospace}#arena select{width:100%}#arena .actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}#arena a{color:#ffd75e}#arena .status{color:#ffce80;min-height:24px;font:14px system-ui;overflow-wrap:anywhere}#arena .party{display:flex;gap:12px}.party>div{flex:1;background:#ffffff08;padding:12px;border:1px solid #736140}.party img{width:52px;height:52px;object-fit:cover;float:left;margin-right:10px;border-radius:50%}
#arena .hud{position:absolute;top:10px;left:10px;right:10px;display:flex;justify-content:space-between;gap:8px;pointer-events:none;font:14px system-ui}#arena .hud>div{background:#100c09dc;border:1px solid #8e743e;padding:8px;border-radius:5px}#arena .hud button{pointer-events:auto;font-size:13px;min-height:36px}#arena .skills{position:absolute;right:10px;bottom:12px;max-width:58vw;display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;pointer-events:auto}#arena .skills button{font:12px system-ui;max-width:130px;min-height:48px;background:#171c25ed}#arena .bar{height:7px;background:#3b1515;margin-top:5px}.bar>i{display:block;height:100%;background:#9abf59}
#arena .fighting{display:none}body.coop-fight #arena .panel{display:none}body.coop-fight #arena .fighting{display:flex}
@media(max-height:500px){#arena .panel{padding:12px 18px}#arena h1{font-size:22px}#arena p{margin:6px 0}#arena .skills button{min-height:40px;padding:6px}.party>div{padding:6px}}
`;document.head.append(css);
const root=document.createElement('main');root.id='arena';root.innerHTML=`<section class="panel"><h1>L’assedio dei cinque minuti</h1><p>Due eroi contro cinque ondate sempre più forti. Sopravvivi per 5 minuti: ogni eroe ancora vivo riceve un componente leggendario personale.</p><p class="muted">Servono livello 31+ e vittoria sull’Abate del capitolo 3, salvati nel cloud. Usi abilità apprese, build ed equipaggiamento: nessun amico può ferirti. Sei pezzi diversi dello stesso eroe compongono un abito leggendario nella borsa.</p><div class="setup"><label>Eroe dal tuo account<select id="coop-hero"></select></label><p class="eligibility muted"></p><label>Codice invito<input id="coop-code" autocomplete="off" spellcheck="false" placeholder="Incolla il codice o il link privato"></label><div class="actions"><button id="coop-create">Crea stanza privata</button><button id="coop-join">Entra con invito</button></div></div><div class="lobby" hidden><div class="party"></div><p class="invite muted"></p><details class="book"><summary>Abilità dell’arena · modifica gli 8 slot</summary><div class="loadout"></div><p class="muted">Scegli tra tutte le abilità apprese. La barra della campagna resta invariata.</p></details><div class="actions"><button id="coop-copy">Copia link invito</button><button id="coop-ready">Sono pronto</button><button id="coop-start">Inizia assedio</button><button id="coop-leave">Lascia stanza</button></div><p class="muted">WASD / frecce o levetta touch per muoverti. Le abilità equipaggiate si lanciano automaticamente sul nemico più vicino; puoi usarle anche con i pulsanti o 1–9. R/T: pozioni. Per lanciare magie con tempo di lancio fermati. Benedizioni temporanee della campagna escluse.</p></div><p class="status" role="status" aria-live="polite"></p><div class="actions"><button id="coop-rewards">Premi custoditi</button><a class="button" href="${location.pathname}">Torna alla campagna</a><a id="coop-login" class="button">Accedi a Mongames</a></div><div class="rewards"></div></section><div class="hud fighting"><div class="health"></div><div><b class="clock">05:00</b><span class="stage"></span><br><label><input id="coop-auto" type="checkbox" checked> Abilità automatiche</label> <button id="coop-exit-fight">Esci</button><p class="connection"></p></div></div><div class="skills fighting"></div>`;document.body.append(root);
const el=<T extends HTMLElement>(q:string)=>root.querySelector<T>(q)!;
const status=(s:string)=>{el('.status').textContent=s;el('.connection').textContent=s;};
const heroSelect=el<HTMLSelectElement>('#coop-hero'),code=el<HTMLInputElement>('#coop-code');
el<HTMLAnchorElement>('#coop-login').href='/accedi.html?next='+encodeURIComponent(location.pathname+'?coop');
const endpoint=import.meta.env.VITE_COOP_URL as string|undefined;
const available=!!endpoint&&(/^wss:\/\//.test(endpoint)||(/^ws:\/\/localhost[:/]/.test(endpoint)&&location.hostname==='localhost'));
let saves=new Map<Hero,unknown>(),selected:Hero='risorto',socket:WebSocket|undefined,view:ArenaView|undefined,room=false,connecting=false,stopped=false,slot=0,latest:Frame|undefined,lastPacket=0,phase='setup',retries=0,activeInvite:string|undefined;
let shownLoadout='';
let lease:string=crypto.randomUUID();try{lease=sessionStorage.getItem('redentore.coop.lease')??lease;sessionStorage.setItem('redentore.coop.lease',lease);}catch{/* current-page reconnect only */}
const buttons=()=>{let eligible=false;try{combatHero(saves.get(selected));eligible=true;}catch{}el<HTMLButtonElement>('#coop-create').disabled=!eligible||!available||connecting||room;el<HTMLButtonElement>('#coop-join').disabled=!eligible||!available||connecting||room;};
heroSelect.onchange=()=>{selected=heroSelect.value as Hero;try{const h=combatHero(saves.get(selected));el('.eligibility').textContent=`${HEROES[h.hero].name} · livello ${levelOf(h.xp).lv} · capitolo 3 superato`;}catch(e){el('.eligibility').textContent=(e as Error).message;}buttons();};
async function loadHeroes(){
  const {data}=await account.auth.getSession();el('#coop-login').hidden=!!data.session;
  if(!data.session){status('Accedi con il tuo account Mongames. Non vengono creati account automaticamente.');buttons();return;}
  const result=await account.from('saves').select('slot,data').eq('game_id','redentore').eq('user_id',data.session.user.id);
  if(result.error){status('Salvataggi cloud non disponibili. La campagna sul dispositivo resta al sicuro.');return;}
  saves=new Map((result.data??[]).filter(r=>HERO_IDS.includes(r.slot as Hero)).map(r=>[r.slot as Hero,r.data]));
  heroSelect.replaceChildren(...HERO_IDS.map(h=>{const o=document.createElement('option');o.value=h;o.textContent=HEROES[h].name;return o;}));
  try{const last=localStorage.getItem('redentore.last') as Hero;if(HERO_IDS.includes(last))selected=last;}catch{/* first hero */}heroSelect.value=selected;heroSelect.onchange!(new Event('change'));
  status(available?'Crea una stanza e invia il link al tuo compagno.':'Arena online non ancora configurata: il server deve essere attivato. La campagna resta disponibile.');
}
const urlInvite=new URLSearchParams(location.search).get('invite');if(urlInvite)code.value=urlInvite;
function inviteOf(value:string):string|undefined{let v=value.trim();try{if(v.includes('://'))v=new URL(v).searchParams.get('invite')??'';}catch{return;}return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)?v:undefined;}
function send(m:unknown){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(m));}
function leave(){stopped=true;send({type:'leave'});socket?.close();socket=undefined;room=false;connecting=false;document.body.classList.remove('coop-fight');phase='ended';status('Hai lasciato l’arena. Il salvataggio della campagna non è cambiato.');buttons();}
async function connect(invite?:string){
  if(connecting||!available)return;
  const {data}=await account.auth.getSession();if(!data.session){status('Accedi di nuovo per entrare.');return;}
  connecting=true;stopped=false;activeInvite=invite;buttons();status(retries?'Riconnessione… La simulazione resta ferma.':'Connessione al server…');
  const ws=new WebSocket(endpoint!);socket=ws;
  const timeout=setTimeout(()=>{if(!room)ws.close();},8000);
  ws.onopen=()=>ws.send(JSON.stringify({type:'hello',v:VERSION,token:data.session!.access_token,lease,hero:selected,...(invite?{invite}:{})}));
  ws.onerror=()=>status('Server non raggiungibile. Controlla la connessione.');
  ws.onmessage=event=>{
    if(typeof event.data!=='string'||event.data.length>65536){ws.close();return;}
    let m;try{m=JSON.parse(event.data);}catch{return;}
    if(m.type==='error'){status(String(m.message).slice(0,240));stopped=true;connecting=false;buttons();return;}
    if(m.type!=='state'||m.v!==VERSION||![0,1].includes(m.slot)||!['lobby','fight','ended'].includes(m.phase)||!Array.isArray(m.members)||m.members.length>2||m.members.some((p:{hero:unknown})=>!validHero(p.hero)))return;
    clearTimeout(timeout);lastPacket=Date.now();retries=0;connecting=false;room=true;slot=m.slot;phase=m.phase;activeInvite=m.invite;
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
    if(phase==='fight'&&m.frame&&frame(m.frame)){
      if(!view){view=new ArenaView();view.setHeroes(m.members.map((p:{hero:CombatHero})=>p.hero),slot);}
      if(!latest||m.frame.seq>=latest.seq){latest=m.frame;view.snapshot(m.frame);drawHud(m.frame);}
      document.body.classList.add('coop-fight');status(m.members.some((p:{connected:boolean})=>!p.connected)?'Compagno disconnesso: partita in pausa (8 s).':'Connessi · server attivo');
    }else if(phase==='ended'){
      document.body.classList.remove('coop-fight');stopped=true;room=false;status(String(m.reason).slice(0,250));buttons();void rewards();
    }else status(m.members.length===2?'Entrambi presenti: confermate di essere pronti.':'In attesa del secondo giocatore…');
  };
  ws.onclose=()=>{clearTimeout(timeout);connecting=false;if(socket!==ws)return;socket=undefined;
    if(!stopped&&room&&retries<4){retries++;status('Connessione interrotta: riconnessione entro 8 secondi…');setTimeout(()=>void connect(activeInvite),700);}else if(!stopped){room=false;status('Connessione terminata. Torna alla campagna e riapri l’arena.');document.body.classList.remove('coop-fight');buttons();}
  };
}
function drawHud(f:Frame){
  const left=Math.max(0,Math.ceil(300-f.time));el('.clock').textContent=`${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}`;el('.stage').textContent=` · Ondata ${f.stage}/5 · ${f.kills} nemici`;
  el('.health').replaceChildren(...f.players.map((p,i)=>{const row=document.createElement('div');row.textContent=`${i===slot?'Tu':'Compagno'}: ${Math.ceil(p.hp)}/${Math.ceil(p.max)} PV · ${Math.ceil(p.mana)} mana`;const bar=document.createElement('div');bar.className='bar';const fill=document.createElement('i');fill.style.width=100*Math.max(0,p.hp/p.max)+'%';bar.append(fill);row.append(bar);return row;}));
  const slots=f.players[slot].slots;
  let keys=[...el('.skills').querySelectorAll<HTMLButtonElement>('button')];
  if(keys.length!==slots.length){el('.skills').replaceChildren(...slots.map((_,i)=>{const b=document.createElement('button');b.type='button';b.onpointerdown=e=>{e.preventDefault();if(view)view.controls.casts[i]++;};return b;}));keys=[...el('.skills').querySelectorAll<HTMLButtonElement>('button')];}
  slots.forEach((s,i)=>{keys[i].hidden=!s.id;keys[i].textContent=`${i<9?i+1:i===9?'R':'T'} · ${s.name}${s.cd>.1?' · '+s.cd.toFixed(1)+'s':''}`;keys[i].disabled=s.cd>.1||f.players[slot].hp<=0;});
}
async function rewards(){
  if(phase==='fight'){status('I premi si ritirano fuori dal combattimento.');return;}
  const result=await account.from('coop_rewards').select('match,hero,item,claimed').order('created',{ascending:true}).limit(30);
  const box=el('.rewards');box.replaceChildren();
  if(result.error){const p=document.createElement('p');p.className='muted';p.textContent='Registro premi non disponibile: configurazione server/database ancora necessaria.';box.append(p);return;}
  if(!result.data?.length){box.textContent='Nessun premio custodito.';return;}
  const note=document.createElement('p');note.className='muted';note.textContent='Chiudi la campagna sugli altri dispositivi prima di ritirare. La borsa piena lascia il premio custodito, senza perderlo.';box.append(note);
  for(const r of result.data){const b=document.createElement('button');b.textContent=`${r.claimed?'Verifica ritiro':'Ritira'} · ${HEROES[r.hero as Hero]?.name??r.hero} · ${String(r.item).split('-').at(-1)}`;b.onclick=()=>void claim(r.match,r.hero as Hero,b);box.append(b);}
}
async function claim(match:string,hero:Hero,b:HTMLButtonElement){
  b.disabled=true;
  try{
    const {data,error}=await account.from('saves').select('data').eq('game_id','redentore').eq('slot',hero).single();if(error||!valid(data?.data))throw Error('Salvataggio cloud non disponibile.');
    const cloud=data.data,local=resume(hero);
    if(local&&(ahead(local,cloud)<0||(local.at??0)>(cloud.at??0)))throw Error('La campagna sul dispositivo è più recente: aprila e attendi la sincronizzazione prima di ritirare.');
    const expectedLocal=JSON.stringify(local);
    const result=await account.rpc('coop_claim',{match_id:match,expected_at:cloud.at??0});if(result.error)throw result.error;
    if(!valid(result.data?.save)||result.data.hero!==hero)throw Error('Risposta premio non valida.');
    if(JSON.stringify(resume(hero))===expectedLocal) {
      if(!autosave(result.data.save,localStorage,result.data.save.at))status('Premio nel cloud. Spazio sul dispositivo insufficiente: riapri dopo aver liberato spazio.');
      else status('Componente ritirato nella borsa del tuo eroe. Sei pezzi diversi permettono l’unione.');
    }else status('Premio nel cloud; la partita locale è cambiata durante il ritiro. Riapri la campagna per sincronizzare.');
    await rewards();
  }catch(e){status((e as Error).message??'Ritiro non riuscito. Il premio resta custodito.');b.disabled=false;}
}
el<HTMLButtonElement>('#coop-create').onclick=()=>void connect();el<HTMLButtonElement>('#coop-join').onclick=()=>{const invite=inviteOf(code.value);if(!invite){status('Incolla un codice invito valido o il link ricevuto.');return;}void connect(invite);};
el<HTMLButtonElement>('#coop-ready').onclick=()=>send({type:'ready'});el<HTMLButtonElement>('#coop-start').onclick=()=>send({type:'start'});el<HTMLButtonElement>('#coop-leave').onclick=leave;el<HTMLButtonElement>('#coop-exit-fight').onclick=leave;el<HTMLButtonElement>('#coop-rewards').onclick=()=>void rewards();
el<HTMLInputElement>('#coop-auto').onchange=e=>{if(view)view.controls.auto=(e.target as HTMLInputElement).checked;};
addEventListener('pagehide',()=>{send({type:'leave'});socket?.close();});addEventListener('visibilitychange',()=>{if(document.hidden&&room)leave();});
document.addEventListener('arena-art-error',()=>status('Caricamento modelli non riuscito. Esci e riprova con una connessione stabile.'));
setInterval(()=>{if(socket?.readyState===WebSocket.OPEN){if(view&&phase==='fight')send({type:'input',input:view.sample()});else send({type:'ping'});if(lastPacket&&Date.now()-lastPacket>5000){status('Nessun aggiornamento dal server: riconnessione…');socket.close();}}},100);
buttons();void loadHeroes();
