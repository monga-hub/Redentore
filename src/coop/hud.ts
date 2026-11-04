import { Minimap } from '../ui/minimap.ts';
import { FogLayer } from '../ui/fog.ts';
import { Discovery } from '../core/discovery.ts';
import { Menu } from '../ui/menu.ts';
import { getView, setView, VIEWS } from '../core/style.ts';
import { STEPS } from '../camera/thirdPersonCamera.ts';
import { STEPS as DIABLO_STEPS } from '../camera/diabloCamera.ts';
import { Hud, Bar } from '../ui/hud.ts';
import { ActionBar } from '../ui/actionBar.ts';
import { AbilitySystem, type Ability } from '../abilities/system.ts';
import { ABILITIES, type Forsaken, tune } from '../abilities/forsaken.ts';
import { HEROES } from '../player/heroes.ts';
import { levelOf } from '../player/levels.ts';
import { arenaLayout, type CombatHero, type PlayerFrame, type Frame } from './protocol.ts';
import type { ArenaView } from './view.ts';

/** The original action bar reads its usual public ability interface; only casts cross the wire. */
class SharedAbilities extends AbilitySystem<Forsaken> {
  private state?: PlayerFrame;
  private feedback='';
  private send:(slot:number)=>void;
  constructor(ctx:Forsaken,hero:CombatHero,send:(slot:number)=>void) {
    const bar=arenaLayout(hero);
    super(ABILITIES.map(a=>({...a})),bar,ctx,bar.filter((x):x is string=>!!x));
    this.send=send;
  }
  sync(p:PlayerFrame):void {
    this.state=p;this.charge=p.charge;
    this.slots.forEach((a,i)=>{if(a)a.mana=p.slots[i].cost;});
    const c=p.casting,a=c?this.slots[c.slot]:undefined;
    this.casting=c&&a?{ability:a,t:c.t,total:c.total,channel:!!a.channel,ticks:0,pushed:0}:null;
    if(p.feedback&&p.feedback!==this.feedback)this.notices.push({kind:'error',text:p.feedback});
    this.feedback=p.feedback;
  }
  override cooldown(a:Ability<Forsaken>):number {return this.state?.slots[this.slots.indexOf(a)]?.cd??0;}
  override gcd():number {return 0;}
  override affordable(a:Ability<Forsaken>):boolean {return (this.state?.mana??0)>=(a.mana??0);}
  override charged(a:Ability<Forsaken>):boolean {return !a.special||(this.state?.charge??0)>=100;}
  override tryCast(i:number):boolean {
    if(!this.slots[i]||!this.state)return false;
    this.send(i);
    const reason=this.state.slots[i].reason;
    if(reason)this.notices.push({kind:'error',text:reason});
    return !reason;
  }
}

export class ArenaHud {
  private hud:Hud;
  private bar:ActionBar<Forsaken>;
  private abilities:SharedAbilities;
  private partner=document.createElement('div');
  private hp:Bar;
  private mp:Bar;
  private minimap:Minimap;
  private fog:FogLayer;
  private menu:Menu;
  private message='';
  private view:ArenaView;
  private slot:number;
  constructor(view:ArenaView,heroes:CombatHero[],slot:number,leave:()=>void) {
    this.view=view;this.slot=slot;
    const h=heroes[slot],other=heroes[1-slot],data=HEROES[h.hero];
    this.hud=new Hud(data.portrait,data.name);
    const lv=levelOf(h.xp);this.hud.setLevel(lv.lv,lv.into,lv.next);
    this.hud.setArea('Chiostro grande');
    Object.assign(tune,view.own.tuning);
    this.abilities=new SharedAbilities(view.own.kit,h,i=>view.controls.casts[i]++);
    this.bar=new ActionBar(this.abilities,false); // lobby owns the loadout; never persist an arena drag to the campaign
    this.partner.id='coop-partner';
    this.partner.innerHTML='<div class="name"></div><div class="res hp"></div><div class="res mp"></div>';
    this.partner.querySelector('.name')!.textContent='Compagno · '+HEROES[other.hero].name;
    this.hp=new Bar(this.partner.querySelector('.hp')!);this.mp=new Bar(this.partner.querySelector('.mp')!);
    document.body.append(this.partner);
    const discovery=new Discovery(view.environment.areas);discovery.reveal(0,0,60);
    this.fog=new FogLayer(discovery);this.fog.update(0);
    this.minimap=new Minimap(view.environment.root,this.fog,()=>{});
    const button=document.querySelector<HTMLButtonElement>('#minimap .view')!;
    const show=()=>{button.title=button.ariaLabel='Visuale: '+VIEWS[getView()];const k=[1,.72,.48][getView()];button.innerHTML=`<svg width="18" height="18" viewBox="0 0 24 24"><path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5"/><g transform="translate(12 13) scale(${k}) translate(-12 -13)"><circle cx="12" cy="7.5" r="3"/><path class="man" d="M6.5 19.5c0-4 2.4-6.5 5.5-6.5s5.5 2.5 5.5 6.5z"/></g></svg>`;};show();
    button.onclick=()=>{setView((getView()+1)%VIEWS.length);view.cam.setDist(STEPS[getView()]);view.dcam.setDist(DIABLO_STEPS[getView()]);show();};
    this.menu=new Menu({leave,opened:()=>{view.blocked=true;},closed:()=>{view.blocked=false;},arena:{automatic:()=>view.controls.auto,toggle:()=>{view.controls.auto=!view.controls.auto;}}});
    addEventListener('keydown',e=>{if(e.code==='Escape'&&!e.repeat&&!this.menu.paused)this.menu.toggle();});
  }
  notice(text:string):void {
    if(text&&text!==this.message)this.abilities.notices.push({kind:'error',text});
    this.message=text;
  }
  close():void {this.menu.close();}
  update(f:Frame):void {
    const p=f.players[this.slot],other=f.players[1-this.slot],s=this.view.own.stats;
    s.hp=p.hp;s.hpMax=p.max;s.mana=p.mana;s.manaMax=p.manaMax;
    this.hud.setStats(s);this.hp.set(other.hp,other.max);this.mp.set(other.mana,other.manaMax);
    this.abilities.sync(p);this.bar.render(.1,()=>false);
    const left=Math.max(0,Math.ceil(300-f.time)),clock=`${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}`;
    this.minimap.update(.1,p,p.yaw,document.body.classList.contains('diablo')?this.view.dcam.yaw:this.view.cam.yaw,`${clock} · Ondata ${f.stage}/5 · Vivi ${f.mobs.filter(m=>m.hp>0).length}`,f.mobs);
  }
}
