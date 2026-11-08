import { CARD, type Levels, type School } from '../player/levels.ts';
import { allocation, budget, enhancement } from '../player/build.ts';
import { GATE, nameOf, talents, treeMax, type TalentNode, type Tree } from '../player/talents.ts';
import { SCHOOL_NAME } from './book.ts';
import { ICONS } from './icons.ts';

// "Build del personaggio": the hero's three talent trees side by side (on a phone one at a time, by tabs), primary school,
// Fusioni, secondary school (player/talents.ts). Square nodes are abilities, round ones upgrades, octagons a choice of two;
// gold is taken, a green ring open now, grey locked; the dashed lines are the tier gates. Tapping a node opens the strip
// below with its text, what it still needs and "Potenzia · 1 punto" for a banked point. Redistribuisci and the presets stay.
export type BuildOperation = 'spend'|'reset'|'save'|'rename'|'load';
const esc=(s:string)=>s.replace(/[&<>"']/g,(c)=>`&#${c.charCodeAt(0)};`);
const CSS=`
#build-panel{position:fixed;inset:0;z-index:23;background:#080706cf;display:none;align-items:center;justify-content:center;padding:10px;box-sizing:border-box;color:#ead8b3;font:15px/1.4 Georgia,serif}
#build-panel.show{display:flex}#build-panel .page{position:relative;background:var(--panel);border:3px solid #9e7a3f;border-radius:6px;padding:16px;width:min(1180px,100%);max-height:calc(100dvh - 24px);box-sizing:border-box;overflow:auto}
#build-panel h2{color:#ffd777;margin:0 44px 6px 0}#build-panel h3{color:#e8c88c;margin:16px 0 5px}#build-panel p{margin:6px 0}#build-panel .close{position:absolute;right:8px;top:8px}#build-panel button{min-height:44px;padding:8px 12px;background:#3c2415;color:#ffe0a1;border:1px solid #967440;border-radius:4px;font:inherit;cursor:pointer}#build-panel button:disabled{opacity:.5;cursor:default}
#build-panel article{border:1px solid #665237;padding:10px;background:#0d0906aa}#build-panel article small{display:block;color:#bfae90}#build-panel article button{margin-top:8px}#build-panel .status{color:#ffcb91}#build-panel .confirm{padding:14px;border:1px solid #a8874c}#build-panel .toolbar{display:flex;gap:8px;flex-wrap:wrap}#build-panel .toolbar button{min-width:0;max-width:100%;overflow-wrap:anywhere}#build-panel .toolbar input{min-width:0;max-width:100%;min-height:44px;box-sizing:border-box}
#build-panel .tabs{display:none;gap:4px;margin-top:10px}#build-panel .tabs button{flex:1;padding:6px 4px}#build-panel .tabs button[aria-pressed=true]{background:#6b4421;border-color:#ffd777}
#build-panel .trees{display:flex;margin-top:10px;border:1px solid #3a2f24;background:radial-gradient(ellipse at 50% 0,#2a1a10,#120d0a 70%)}
#build-panel .tree{min-width:0;padding:0 8px 10px;border-right:1px solid #3a2f24}#build-panel .tree:last-child{border-right:0}#build-panel .tree.fusion{background:#0000002e}
#build-panel .tree header{padding:8px 0 6px;border-bottom:1px solid #3a2f24;margin-bottom:6px;font:12px/1.5 system-ui,sans-serif;color:#9fb9d8}#build-panel .tree header b{color:#fff}#build-panel .tree h3{margin:0;font:bold 16px Georgia,serif;color:#fff}#build-panel .tree h3 em{font:normal 12px system-ui;color:#a8936f}
#build-panel .canvas{--ns:40px;position:relative}#build-panel .canvas svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
#build-panel line{stroke:#4a4038;stroke-width:2;vector-effect:non-scaling-stroke}#build-panel line.open{stroke:#8a8070}#build-panel line.gold{stroke:#d9a92c;stroke-width:3}#build-panel line.gate{stroke:#7a5b2c;stroke-width:1;stroke-dasharray:4 4}
#build-panel .gt{position:absolute;right:0;z-index:1;transform:translateY(-50%);padding:0 4px;border-radius:3px;background:#120d0a;font:10px/12px system-ui;color:#c79a52}#build-panel .gt.met{color:#9ccf6a}
#build-panel button.nd{position:absolute;width:var(--ns);height:var(--ns);min-height:0;padding:0;border:0;background:none;border-radius:0}
#build-panel .nd .ic{position:absolute;inset:0;display:flex;overflow:hidden;border:2px solid #555;background:#000;box-sizing:border-box}#build-panel .nd .ic>span{position:relative;flex:1;overflow:hidden}#build-panel .nd .ic .ico{position:absolute;inset:0}
#build-panel .nd.rd .ic{border-radius:50%}#build-panel .nd.sq .ic{border-radius:6px}#build-panel .nd.choice .ic{clip-path:polygon(30% 0,70% 0,100% 30%,100% 70%,70% 100%,30% 100%,0 70%,0 30%);border:0;padding:2px;gap:2px;background:#555}#build-panel .nd.choice .ic .ico{width:200%;left:-50%}
#build-panel .nd.own .ic{border-color:#f5c542;box-shadow:0 0 8px #f5c54288}#build-panel .nd.choice.own .ic{background:#f5c542}#build-panel .nd.lit .ic{border-color:#9ccf6a}#build-panel .nd.choice.lit .ic{background:#9ccf6a}#build-panel .nd.off .ic .ico{filter:grayscale(1) brightness(.55)}
#build-panel .nd.sel{outline:2px solid #fff;outline-offset:3px;border-radius:4px}
#build-panel .nd b{position:absolute;right:-12px;bottom:-6px;font:bold 11px/1 system-ui;color:#fff;background:#000c;padding:1px 3px;border-radius:3px}#build-panel .nd.own b{color:#f5c542}#build-panel .nd.off b{color:#888}
#build-panel .detail{position:sticky;bottom:-16px;z-index:1;margin:10px -16px 0;padding:10px 16px;background:#140e0a;border-top:1px solid #9e7a3f;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px}
@media (max-width:760px){#build-panel .tabs{display:flex}#build-panel .tree{display:none;flex:1!important;border:0}#build-panel .tree.on{display:block}#build-panel .canvas{--ns:34px}#build-panel .nd b{right:-8px}}
`;
const iconOf=(id:string)=>id.startsWith('root_')?'medal':CARD.get(id)?.icon??id;
export class BuildPanel {
  readonly el=document.createElement('div');
  opened?:()=>void;
  private levels:Levels;
  private identity:()=>{name:string;title:string;schools:readonly School[];names:Record<string,string>};
  private change:(op:BuildOperation,id?:string,name?:string)=>string|undefined|Promise<string|undefined>;
  private guard:()=>string|undefined;
  private message='';
  private confirming=false;
  private selected?:string;
  private node?:string; // the tapped node's key
  private tab=0; // the tree shown on a phone
  constructor(levels:Levels,identity:BuildPanel['identity'],guard:BuildPanel['guard'],change:BuildPanel['change']) {
    this.levels=levels;this.identity=identity;this.guard=guard;this.change=change;
    const style=document.createElement('style');style.textContent=CSS;document.head.append(style);
    this.el.id='build-panel';this.el.setAttribute('role','dialog');this.el.setAttribute('aria-modal','true');this.el.setAttribute('aria-label','Build del personaggio');
    this.el.addEventListener('click',async(e)=>{
      const b=(e.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b)return;
      if(b.dataset.do==='close'){this.close();return;}
      if(b.dataset.do==='reset'){this.confirming=true;this.message='';this.render();return;}
      if(b.dataset.do==='cancel'){this.confirming=false;this.render();return;}
      if(b.dataset.view){this.selected=b.dataset.view;this.message='';this.render();return;}
      if(b.dataset.node){this.node=b.dataset.node;this.render();return;}
      if(b.dataset.tab){this.tab=+b.dataset.tab;this.node=undefined;this.render();return;}
      const name=this.el.querySelector<HTMLInputElement>('[data-preset-name]')?.value??'';
      const why=this.guard();
      if(why){this.message=why;this.render();return;}
      b.disabled=true;
      if(b.dataset.do==='confirm'){this.message=await this.change('reset')??'Punti restituiti. Le abilità apprese restano tue.';this.confirming=false;}
      else if(b.dataset.do==='save'){this.message=await this.change('save',undefined,name)??'Configurazione salvata.';}
      else if(b.dataset.do==='rename'){this.message=await this.change('rename',this.selected,name)??'Nome aggiornato.';}
      else if(b.dataset.do==='load'){this.message=await this.change('load',this.selected)??'Configurazione caricata.';}
      else if(b.dataset.id){this.message=await this.change('spend',b.dataset.id)??'Potenziamento applicato.';}
      this.render();
    });
    for(const t of ['pointerdown','pointerup','pointermove','wheel'])this.el.addEventListener(t,(e)=>e.stopPropagation());
    addEventListener('keydown',(e)=>{if(!this.open)return;e.stopPropagation();if(e.code==='Escape'){e.preventDefault();this.close();}},true);
    document.body.append(this.el);
  }
  get open(){return this.el.classList.contains('show');}
  show(reset=false){this.message='';this.confirming=reset;this.el.classList.add('show');this.opened?.();this.render();if(document.pointerLockElement)document.exitPointerLock();}
  close(){this.el.classList.remove('show');}
  private render(){
    const b=this.levels,who=this.identity(),T=talents(b.picks,b.learned,b.schools,b.lv),why=this.guard(),points=budget(b);
    const name=(id:string)=>who.names[id]??nameOf(id);
    const title=(t:Tree)=>t.school?`${esc(SCHOOL_NAME.get(t.school)??t.school)} <em>${t.kind==='primary'?'primaria':'secondaria'}</em>`:'Fusioni';
    const ability=(n:TalentNode)=>!!n.granted||T.ability(n.ids[0]);
    const max=(n:TalentNode)=>ability(n)?1:CARD.get(n.ids.find((id)=>T.count(id))??n.ids[0])!.max;
    const tree=(t:Tree,ti:number)=>{
      const rows=Math.max(...t.nodes.map((n)=>n.row)),byKey=new Map(t.nodes.map((n)=>[n.key,n]));
      let lines='',gates='',nodes='';
      for(const n of t.nodes)for(const k of n.parents){const p=byKey.get(k)!;lines+=`<line x1="${p.col-.5}" y1="${p.row-.5}" x2="${n.col-.5}" y2="${n.row-.5}" class="${T.rank(p)&&T.rank(n)?'gold':T.rank(p)?'open':''}"/>`;}
      for(const [r,need] of t.kind==='fusion'?GATE.fusion:GATE.school)if(r<=rows){lines+=`<line x1="0" x2="${t.cols}" y1="${r-1}" y2="${r-1}" class="gate"/>`;gates+=`<span class="gt${T.spent(t,r)>=need?' met':''}" style="top:${(r-1)/rows*100}%">${need} punti</span>`;}
      for(const n of t.nodes){
        const r=T.rank(n),state=r?'own':n.ids.some((id)=>T.open(t,n,id))?'lit':'off',shape=n.ids.length>1?'choice':ability(n)?'sq':'rd';
        nodes+=`<button class="nd ${shape} ${state}${this.node===n.key?' sel':''}" data-node="${n.key}" style="left:calc(${(n.col-.5)/t.cols*100}% - var(--ns)/2);top:calc(${(n.row-.5)/rows*100}% - var(--ns)/2)" title="${esc(n.ids.map(name).join(' / '))}" aria-label="${esc(`${n.ids.map(name).join(' o ')}, ${n.granted?'data':`${r}/${max(n)}`}`)}"><span class="ic">${n.ids.map((id)=>`<span>${ICONS[iconOf(id)]??''}</span>`).join('')}</span><b>${n.granted?'✓':`${r}/${max(n)}`}</b></button>`;
      }
      return `<section class="tree ${t.kind}${this.tab===ti?' on':''}" style="flex:${t.cols}"><header><h3>${title(t)}</h3>Punti spesi <b>${T.spent(t)} / ${treeMax(t,b.learned)}</b> · Livello richiesto <b>${t.level}</b></header><div class="canvas" style="height:${rows*66}px"><svg viewBox="0 0 ${t.cols} ${rows}" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${gates}${nodes}</div></section>`;
    };
    const ti=T.trees.findIndex((t)=>t.nodes.some((n)=>n.key===this.node)),t=T.trees[ti],n=t?.nodes.find((k)=>k.key===this.node);
    const detail=!t||!n?'<p>Tocca un nodo per vederne effetto, rango e requisiti.</p>':n.ids.map((id)=>{
      const c=CARD.get(id),rank=n.granted?1:T.ability(id)?(T.owns(id)?1:0):T.count(id),cap=n.granted||T.ability(id)?1:c!.max;
      const state=n.granted?'Data con la scuola.':T.ability(id)?(rank?'Abilità appresa: resta tua anche dopo Redistribuisci.':T.blocked(t,n,id)||'Si impara salendo di livello o con un tomo.'):rank>=cap?'Potenziamento completo.':T.open(t,n,id)?'Requisiti soddisfatti.':T.blocked(t,n,id)||`Richiede: ${c!.prerequisite??'abilità o potenziamenti collegati'}`;
      const text=c?.text??(id.startsWith('root_')?'Radice della scuola: data con la scuola, gratis.':'Abilità di partenza o attacco base: data, gratis.');
      return `<article><b>${esc(name(id))}</b>${n.ids.length>1?' <small>scelta: l’uno o l’altro effetto</small>':''}<small>Rango ${rank}/${cap}</small><p>${esc(text)}</p><small>${esc(state)}</small>${enhancement(id)?`<button data-id="${id}" ${why||!T.open(t,n,id)||points<1?'disabled':''}>Potenzia · 1 punto</button>`:''}</article>`;
    }).join('');
    const preset=b.presets.find((p)=>p.id===this.selected);
    const presets=`<h3>Configurazioni salvate</h3><div class="toolbar"><input data-preset-name maxlength="80" aria-label="Nome configurazione" placeholder="Nome configurazione" value="${esc(preset?.name??'')}"><button data-do="save" ${why?'disabled':''}>Salva configurazione attuale</button></div><div class="toolbar">${b.presets.map((p)=>`<button data-view="${esc(p.id)}" aria-pressed="${p.id===this.selected}">${esc(p.name)} · ${p.picks.length} punti</button>`).join('')}</div>${preset?`<article><b>${esc(preset.name)}</b><p>${[...new Set(preset.picks)].map((id)=>`${esc(CARD.get(id)?.name??id)} ×${preset.picks.filter((p)=>p===id).length}`).join(' · ')||'Nessun potenziamento'}</p><div class="toolbar"><button data-do="rename" ${why?'disabled':''}>Rinomina</button><button data-do="load" ${why?'disabled':''}>Carica configurazione</button></div><small>Il caricamento verifica abilità, prerequisiti, alberi e punti disponibili adesso.</small></article>`:''}`;
    this.el.innerHTML=`<div class="page"><button class="close" data-do="close" aria-label="Chiudi build">✕</button><h2>Build del personaggio</h2><p>${esc(who.name)} · ${esc(who.title)} · livello ${b.lv} · <b>${points} ${points===1?'punto disponibile':'punti disponibili'}</b></p><p class="status" role="status">${esc(this.message||why||'Ogni punto si spende su un nodo aperto degli alberi: serve un nodo sopra con un rango, il livello dell’albero e i punti della sua fascia.')}</p>${this.confirming?`<div class="confirm"><h3>Redistribuisci i miei punti</h3><p>Riceverai esattamente <b>${allocation(b.picks).length} punti</b>. Tutti i potenziamenti permanenti tornano alla base. Abilità apprese, classe, livello, esperienza, equipaggiamento e missioni restano tuoi.</p><div class="toolbar"><button data-do="confirm" ${why?'disabled':''}>Conferma · gratuito</button><button data-do="cancel">Annulla</button></div></div>`:''}<div class="tabs">${T.trees.map((k,i)=>`<button data-tab="${i}" aria-pressed="${this.tab===i}">${k.school?esc(SCHOOL_NAME.get(k.school)??k.school):'Fusioni'}</button>`).join('')}</div><div class="trees">${T.trees.map(tree).join('')}</div><div class="detail" aria-live="polite">${detail}</div>${presets}</div>`;
  }
}
