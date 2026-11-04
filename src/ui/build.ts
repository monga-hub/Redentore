import { CARD, CARDS, counter, ours, tuneOf, type Levels, type School } from '../player/levels.ts';
import { allocation, budget, enhancement, rankLabel, upgradeChoices } from '../player/build.ts';
import { SCHOOL_NAME } from './book.ts';
export type BuildOperation = 'spend'|'reset'|'save'|'rename'|'load';
const esc=(s:string)=>s.replace(/[&<>"']/g,(c)=>`&#${c.charCodeAt(0)};`);
const CSS=`
#build-panel{position:fixed;inset:0;z-index:23;background:#080706cf;display:none;align-items:center;justify-content:center;padding:10px;box-sizing:border-box;color:#ead8b3;font:15px/1.4 Georgia,serif}
#build-panel.show{display:flex}#build-panel .page{position:relative;background:var(--panel);border:3px solid #9e7a3f;border-radius:6px;padding:16px;width:min(820px,100%);max-height:calc(100dvh - 24px);box-sizing:border-box;overflow:auto}
#build-panel h2{color:#ffd777;margin:0 44px 6px 0}#build-panel h3{color:#e8c88c;margin:16px 0 5px}#build-panel p{margin:6px 0}#build-panel .close{position:absolute;right:8px;top:8px}#build-panel button{min-height:44px;padding:8px 12px;background:#3c2415;color:#ffe0a1;border:1px solid #967440;border-radius:4px;font:inherit;cursor:pointer}#build-panel button:disabled{opacity:.5;cursor:default}
#build-panel .choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:8px}#build-panel article{border:1px solid #665237;padding:10px;background:#0d0906aa}#build-panel article small{display:block;color:#bfae90}#build-panel article button{margin-top:8px}#build-panel .status{color:#ffcb91}#build-panel .confirm{padding:14px;border:1px solid #a8874c}#build-panel .skills{display:flex;flex-wrap:wrap;gap:6px 14px}#build-panel .toolbar{display:flex;gap:8px;flex-wrap:wrap}
`;
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
    const b=this.levels,who=this.identity(),owned=tuneOf(b.picks,b.learned,b.schools).owned,count=counter(b.picks),ok=new Set(upgradeChoices(b,b.schools).map((c)=>c.id));
    const why=this.guard();
    const preset=b.presets.find((p)=>p.id===this.selected);
    const presets=`<h3>Configurazioni salvate</h3><div class="toolbar"><input data-preset-name maxlength="80" aria-label="Nome configurazione" placeholder="Nome configurazione" value="${esc(preset?.name??'')}"><button data-do="save" ${why?'disabled':''}>Salva configurazione attuale</button></div><div class="toolbar">${b.presets.map((p)=>`<button data-view="${esc(p.id)}" aria-pressed="${p.id===this.selected}">${esc(p.name)} · ${p.picks.length} punti</button>`).join('')}</div>${preset?`<article><b>${esc(preset.name)}</b><p>${[...new Set(preset.picks)].map((id)=>`${esc(CARD.get(id)?.name??id)} ×${preset.picks.filter((p)=>p===id).length}`).join(' · ')||'Nessun potenziamento'}</p><div class="toolbar"><button data-do="rename" ${why?'disabled':''}>Rinomina</button><button data-do="load" ${why?'disabled':''}>Carica configurazione</button></div><small>Il caricamento verifica abilità, prerequisiti e punti disponibili adesso.</small></article>`:''}`;
    const skills=owned.filter((id)=>CARD.get(id)?.kind==='ability'||!CARD.has(id)).map((id)=>{const n=who.names[id]??CARD.get(id)?.name??id;const rank=1+b.picks.filter((p)=>{const c=CARD.get(p);return c?.kind==='mod'&&c.of===id||c?.kind==='fusion'&&(c.icon===id||c.text.toLowerCase().includes(n.toLowerCase()));}).length;return `<span>${esc(n)} · rango ${rank}</span>`;}).join('');
    const choices=CARDS.filter((c)=>enhancement(c.id)&&c.kind!=='filler'&&ours(c,b.schools)).map((c)=>{
      const eligible=ok.has(c.id),needs=eligible?'Prerequisiti soddisfatti':c.of&&!owned.includes(c.of)?`Richiede l’abilità ${who.names[c.of]??CARD.get(c.of)?.name??c.of}`:count(c.id)>=c.max?'Potenziamento completo':'Richiede abilità o potenziamenti collegati';
      return `<article><b>${esc(c.name)}</b><small>Rank ${rankLabel(c.id,b.picks)} · costo: 1 punto</small><p>${esc(c.text)}</p><small>${esc(needs)}</small><button data-id="${c.id}" ${why||!eligible||budget(b)<1?'disabled':''}>Potenzia · 1 punto</button></article>`;
    }).join('');
    this.el.innerHTML=`<div class="page"><button class="close" data-do="close" aria-label="Chiudi build">✕</button><h2>Build del personaggio</h2><p>${esc(who.name)} · ${esc(who.title)} · livello ${b.lv}</p><p>${who.schools.map((s)=>SCHOOL_NAME.get(s)).join(' · ')} · <b>${budget(b)} punti disponibili</b></p><p class="status" role="status">${esc(this.message||why||'Ogni potenziamento costa una scelta guadagnata salendo di livello.')}</p>${this.confirming?`<div class="confirm"><h3>Redistribuisci i miei punti</h3><p>Riceverai esattamente <b>${allocation(b.picks).length} punti</b>. Tutti i potenziamenti permanenti tornano alla base. Abilità apprese, classe, livello, esperienza, equipaggiamento e missioni restano tuoi.</p><div class="toolbar"><button data-do="confirm" ${why?'disabled':''}>Conferma · gratuito</button><button data-do="cancel">Annulla</button></div></div>`:''}${presets}<h3>Abilità possedute</h3><div class="skills">${skills}</div><h3>Potenziamenti</h3><div class="choices">${choices}</div></div>`;
  }
}
