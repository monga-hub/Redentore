import * as THREE from 'three';
import { PlayerController } from '../player/controller.ts';
import { PlayerStats } from '../player/stats.ts';
import { FriarView, arenaFriarTemplate } from '../enemies/friars.ts';
import { Forsaken, ABILITIES, tune } from '../abilities/forsaken.ts';
import { control } from '../enemies/control.ts';
import { Input } from '../core/input.ts';
import { TouchControls } from '../ui/touch.ts';
import { getView, isDiablo, onStyle, onQuality } from '../core/style.ts';
import { PHONE } from '../core/device.ts';
import { ThirdPersonCamera, STEPS } from '../camera/thirdPersonCamera.ts';
import { DiabloCamera, STEPS as DIABLO_STEPS } from '../camera/diabloCamera.ts';
import { DiabloControls } from '../player/diabloControls.ts';
import { Occlusion } from '../fx/occlusion.ts';
import { Atmosphere } from '../fx/atmosphere.ts';
import { HEROES } from '../player/heroes.ts';
import { tuneOf } from '../player/levels.ts';
import { BOONS } from '../quest/progress.ts';
import { initAudio, loadBank, playSfx, setListener } from '../audio/engine.ts';
import { setAmbience, setMusic } from '../audio/music.ts';
import { type CombatHero, type Frame, type Controls, type Mode, idle, arenaLayout } from './protocol.ts';
import { DUEL_SPAWN } from '../../server/simulation.ts';
import { Targeting, type Kind } from '../ui/target.ts';
import { arenaLevel } from './environment.ts';
import type { Friar } from '../enemies/brain.ts';

type VisualMob = Friar & {id:number; max:number; kind:{hp:number;radius:number}};
/** Interpolated presentation of authoritative results. Cosmetic kits cannot write back to the session. */
export class ArenaView {
  readonly renderer = new THREE.WebGLRenderer({antialias:!PHONE});
  readonly scene = new THREE.Scene();
  private level = arenaLevel();
  readonly cam = new ThirdPersonCamera(innerWidth/innerHeight,0,this.level.cameraBlockers);
  readonly camera = this.cam.camera;
  readonly dcam = new DiabloCamera(this.camera);
  private dctl?:DiabloControls;
  private occlusion?:Occlusion;
  blocked=false;
  get environment() { return this.level; }
  readonly input: Input;
  readonly controls: Controls = idle();
  private heroes: {player:PlayerController; stats:PlayerStats; kit:Forsaken; tuning:ReturnType<typeof tuneOf>}[]=[];
  private mobs=new Map<number,{view:FriarView;mob:VisualMob}>();
  /** Duel: each hero as the other's aim, under the host's ids (1001, 1002), so replayed casts face the right way. */
  private bodies:VisualMob[]=[];
  private aim=(id:number)=>this.mobs.get(id)?.mob??this.bodies[id-1001];
  private pool:FriarView[]=[];
  private template?: Awaited<ReturnType<typeof arenaFriarTemplate>>;
  private target?:Frame;
  private hp=[0,0];
  private last=performance.now();
  private disposed=false;
  private paused=false;
  private slot=0;
  private seenEvent=0;
  private fx:Atmosphere;
  private kinds:Kind[]=[];
  private targeting?:Targeting;
  private syncingTarget=false;
  get own() { return this.heroes[this.slot]; }
  constructor() {
    initAudio();loadBank('core');loadBank('arcane');loadBank('mobs');
    setAmbience('chiostro');setMusic('combat');
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,PHONE?1.25:2));this.renderer.setSize(innerWidth,innerHeight);this.renderer.domElement.id='arena-canvas';document.body.append(this.renderer.domElement);
    this.scene.add(this.level.root);
    this.cam.setDist(STEPS[getView()],true);this.dcam.setDist(DIABLO_STEPS[getView()],true);
    this.input=new Input(this.renderer.domElement);new TouchControls(this.renderer.domElement,this.input);
    this.fx=new Atmosphere(this.renderer,this.scene,this.camera,this.level);
    onQuality(q=>{if(!this.disposed)this.fx.setQuality(q);});
    void arenaFriarTemplate().then(t=>{if(!this.disposed)this.template=t;}).catch(()=>{document.dispatchEvent(new CustomEvent('arena-art-error'));});
    addEventListener('resize',this.resize);
    requestAnimationFrame(this.draw);
  }
  setHeroes(heroes:CombatHero[],slot:number,mode:Mode='survival'):void {
    this.slot=slot;
    heroes.forEach((h,i)=>{
      const player=new PlayerController(this.level.world,mode==='duel'?DUEL_SPAWN[i]:{x:i?2:-2,z:0,yaw:0},h.hero);
      if(mode==='duel')this.bodies[i]={id:1001+i,x:player.pos.x,y:0,z:player.pos.z,yaw:0,hp:1,max:1,kind:{hp:1,radius:.4},state:'chase',t:0,cd:0,struck:false,home:{x:0,z:0,yaw:0},mates:[],cc:control()};
      player.model.wear(h.gear);this.scene.add(player.mesh);
      const stats=new PlayerStats(), tuning=tuneOf(h.picks,h.learned,HEROES[h.hero].school);
      BOONS.find(b=>b.id===h.boon)?.apply(tuning);Object.assign(tune,tuning);
      const kit=new Forsaken(player,stats,HEROES[h.hero].school,{bar:arenaLayout(h),off:[]});
      // These are disposable copies of replicated mobs: all combat writes stay cosmetic.
      kit.foes=()=>[...this.mobs.values()].map(x=>x.mob);
      kit.aimed=()=>this.aim(this.target?.players[i].target??0);
      kit.hurt=()=>{};this.scene.add(kit.vfx.root);
      this.heroes.push({player,stats,kit,tuning});
      const ring=new THREE.Mesh(new THREE.RingGeometry(.55,.63,32).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:i===slot?0xffd75e:mode==='duel'?0xff4a3a:0x66c9ff,side:THREE.DoubleSide}));ring.position.y=.05;player.mesh.add(ring);
    });
    this.targeting=new Targeting(this.renderer.domElement,this.camera,this.scene,this.level.cameraBlockers,this.kinds,(m)=>this.level.world.sees(this.own.player.pos,m));
    this.targeting.onSelect=t=>{if(!this.syncingTarget)this.controls.target=(t?.mob as VisualMob|undefined)?.id??0;};
    this.dctl=new DiabloControls(this.renderer.domElement,this.camera,this.scene,this.own.player,this.targeting,()=>[...this.mobs.values()].map(e=>e.mob));
    this.dctl.swing=()=>{this.controls.casts[0]++;return true;};
    this.occlusion=new Occlusion([this.level.root],this.level,heroes.map((_,i)=>[this.heroes[i].player.mesh,1.8]));
    onStyle(diablo=>{
      if(this.disposed)return;
      this.input.orbit=!diablo;this.dctl!.enabled=diablo;this.dctl!.stop();this.occlusion!.enabled=diablo;
      this.targeting!.eye=diablo?()=>this.own.player.pos.clone().add(new THREE.Vector3(0,1.6,0)):undefined;
      this.fx.setStyle(diablo);document.body.classList.toggle('diablo',diablo);this.dcam.snap();
    });
  }
  snapshot(f:Frame,paused=false):void {
    this.paused=paused;
    if(this.target&&f.seq<this.target.seq)return;
    this.target=f;
    for(const m of f.mobs){let entry=this.mobs.get(m.id);if(!entry&&this.template){const view=this.pool.pop()??new FriarView(this.template);view.root.position.set(m.x,m.y,m.z);view.root.visible=true;this.scene.add(view.root);entry={view,mob:{...m,cc:control(),cd:0,struck:false,home:{x:m.x,z:m.z,yaw:0},mates:[],kind:{hp:m.max,radius:.4}} as VisualMob};this.mobs.set(m.id,entry);}if(entry)Object.assign(entry.mob,m);}
    for(const max of new Set(f.mobs.map(m=>m.max)))if(!this.kinds.some(k=>k.max===max))this.kinds.push({name:'Frate risorto',max,height:1.8,all:[],ready:()=>true,lv:31});
    for(const kind of this.kinds)kind.all=[...this.mobs.values()].filter(e=>e.mob.max===kind.max&&f.mobs.some(m=>m.id===e.mob.id)).map(e=>e.mob);
    const selected=this.mobs.get(f.players[this.slot].target)?.mob,kind=this.kinds.find(k=>k.all.includes(selected!));
    this.syncingTarget=true;if(this.targeting)this.targeting.target=selected&&kind?{kind,mob:selected}:undefined;this.syncingTarget=false;
    for(const e of f.events)if(e.seq>this.seenEvent){
      this.seenEvent=e.seq;const h=this.heroes[e.player],a=ABILITIES.find(a=>a.id===f.players[e.player].slots[e.slot]?.id);if(!h||!a)continue;
      Object.assign(tune,h.tuning);h.player.pos.set(e.x,e.y,e.z);h.player.facing=e.yaw;
      const aimed=h.kit.aimed;h.kit.aimed=()=>this.aim(e.target);
      a.fire(h.kit,e.tick);h.kit.aimed=aimed;
    }
  }
  sample():Controls {
    if(this.blocked){this.controls.x=this.controls.z=0;this.controls.jump=false;this.input.endFrame();this.controls.seq++;return structuredClone(this.controls);}
    let x=(this.input.down('KeyD','ArrowRight')?1:0)-(this.input.down('KeyA','ArrowLeft')?1:0)||this.input.stickX;
    let z=(this.input.down('KeyS','ArrowDown')?1:0)-(this.input.down('KeyW','ArrowUp')?1:0)||this.input.stickY;
    // The original controller receives camera-relative stick motion; the wire carries world motion.
    const length=Math.max(1,Math.hypot(x,z));x/=length;z/=length;
    const c=Math.cos(isDiablo()?this.dcam.yaw:this.cam.yaw),s=Math.sin(isDiablo()?this.dcam.yaw:this.cam.yaw);
    this.controls.x=Math.max(-1,Math.min(1,x*c+z*s));this.controls.z=Math.max(-1,Math.min(1,z*c-x*s));
    const codes=['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','KeyR','KeyT'];
    codes.forEach((code,i)=>{if(this.input.pressed(code))this.controls.casts[i]++;});
    if(!x&&!z&&isDiablo()&&this.dctl){this.controls.x=this.dctl.steer.x;this.controls.z=this.dctl.steer.z;}
    this.controls.jump=this.input.down('Space');this.input.endFrame();
    this.controls.seq++;return structuredClone(this.controls);
  }
  private resize=()=>{this.renderer.setSize(innerWidth,innerHeight);this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.fx.setSize(innerWidth,innerHeight);};
  private draw=(now:number)=>{
    if(this.disposed)return;
    const dt=Math.min(.05,(now-this.last)/1000);this.last=now;const step=this.paused?0:dt;const k=1-Math.exp(-dt*14),f=this.target;
    if(f){
      this.heroes.forEach((h,i)=>{const p=f.players[i],player=h.player;Object.assign(tune,h.tuning);
        const before=player.mesh.position.clone();player.pos.lerp(new THREE.Vector3(p.x,p.y,p.z),k);player.mesh.position.copy(player.pos);
        const speed=before.distanceTo(player.pos)/Math.max(dt,.001);player.facing=p.yaw;player.mesh.rotation.y+=Math.atan2(Math.sin(p.yaw-player.mesh.rotation.y),Math.cos(p.yaw-player.mesh.rotation.y))*k;
        player.model.animate(step,speed,p.y<.5,speed);
        if(p.hp<=0&&this.hp[i]>0){player.model.die();playSfx('player_death',player.pos);}
        if(p.hp>0&&this.hp[i]>p.hp){player.model.flinch(this.hp[i]-p.hp);playSfx('hit_player',player.pos);}
        const body=this.bodies[i];if(body)Object.assign(body,{x:player.pos.x,y:player.pos.y,z:player.pos.z,hp:p.hp,max:p.max,state:p.hp>0?'chase':'dead'});
        this.hp[i]=p.hp;h.stats.update(step);h.stats.hp=p.hp;h.stats.hpMax=p.max;h.stats.mana=p.mana;h.stats.manaMax=p.manaMax;
        h.kit.update(step,()=>false,false);
        if(p.casting){const a=ABILITIES.find(a=>a.id===p.slots[p.casting!.slot]?.id);a?.during?.(h.kit,p.casting.t/p.casting.total,step);}
        h.kit.vfx.update(step);
      });
      const vfx=this.heroes[0]?.kit.vfx;
      if(vfx)for(const [id,e]of this.mobs){const m=f.mobs.find(m=>m.id===id);if(!m){this.scene.remove(e.view.root);this.mobs.delete(id);this.pool.push(e.view);continue;}const pos=e.view.root.position;const display={...e.mob,x:THREE.MathUtils.lerp(pos.x,m.x,k),z:THREE.MathUtils.lerp(pos.z,m.z,k)};e.view.update(display,step,vfx,10);}

    }
    const p=this.heroes[this.slot]?.player.pos??new THREE.Vector3();if(!this.blocked)this.dctl?.update(dt,this.input);else this.dctl?.stop();if(isDiablo())this.dcam.update(dt,this.input,p);else this.cam.update(dt,this.input,p);this.occlusion?.update(dt,p,this.camera);this.syncingTarget=true;this.targeting?.update(dt,p);this.syncingTarget=false;setListener(p,-Math.sin(isDiablo()?this.dcam.yaw:this.cam.yaw),-Math.cos(isDiablo()?this.dcam.yaw:this.cam.yaw));this.fx.update(dt,p);this.fx.render();requestAnimationFrame(this.draw);
  };
  dispose():void {this.disposed=true;removeEventListener('resize',this.resize);for(const h of this.heroes)h.player.model.dispose();setMusic('none');setAmbience(null);this.fx.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();}
}
