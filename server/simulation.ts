import { quietSfx } from '../src/audio/engine.ts';
import { arenaLevel, COURT } from '../src/coop/environment.ts';
import { PlayerController } from '../src/player/controller.ts';
import { PlayerStats } from '../src/player/stats.ts';
import { Forsaken, tune } from '../src/abilities/forsaken.ts';
import { ownSchools, tuneOf } from '../src/player/levels.ts';
import { HEROES } from '../src/player/heroes.ts';
import { Equipment, effects, crit, damageMultiplier } from '../src/loot/gear.ts';
import { BOONS } from '../src/quest/progress.ts';
import { FRIAR, hurt, separate, type Friar } from '../src/enemies/brain.ts';
import { control, pace, tick } from '../src/enemies/control.ts';
import { COUNTDOWN, DURATION, MAX_MOBS, arenaLayout, idle, type CombatHero, type Controls, type Frame } from '../src/coop/protocol.ts';

export function arenaWorld() { return arenaLevel().world; }
export class Survival {
  readonly world = arenaWorld();
  readonly players;
  mobs: (Friar & { id: number; max: number; kind: { hp: number; radius: number } })[] = [];
  time = 0; kills = 0; seq = 0;
  countdown = COUNTDOWN;
  outcome: Frame['outcome'] = 'fight';
  private spawnIn = 0;
  private nextMob = 0;
  private eventSeq = 0;
  private events: import('../src/coop/protocol.ts').CastEvent[] = [];
  constructor(heroes: [CombatHero, CombatHero]) {
    this.players = heroes.map((h, i) => {
      const own = ownSchools(h.picks, h.learned, HEROES[h.hero].school);
      const tuning = tuneOf(own.picks, own.learned, HEROES[h.hero].school);
      BOONS.find(b => b.id === h.boon)?.apply(tuning);
      Object.assign(tune, tuning);
      const player = new PlayerController(this.world, { x: i ? 2 : -2, z: 0, yaw: 0 }, h.hero, false);
      const stats = new PlayerStats(); const equipment = new Equipment(h.hero); equipment.decode(h.gear);
      const worn = effects(equipment.totals);
      stats.grow(tuning.hp, tuning.mana, worn.hp, worn.mana); stats.armor = tuning.armor * (1 - worn.cut); stats.regen = tuning.regen + worn.regen;
      player.speed = tuning.speed;
      const bar=arenaLayout(h);
      const kit = new Forsaken(player, stats, HEROES[h.hero].school, { bar, off: tuning.owned.filter(id=>!bar.includes(id)) });
      kit.system.unlock(...tuning.owned); kit.system.setMain(bar[0] ?? tuning.owned[0]);
      kit.system.chargeMul = tuning.fury; kit.system.chargeAfter = tuning.furyStart; kit.system.castMul = 1 / worn.haste;
      stats.onHurt = n => { kit.system.pushback(); player.model.flinch(n); };
      kit.foes = () => this.mobs;
      kit.aimed = () => this.mobs.find(m=>m.id===state.input.target&&m.hp>0) ?? this.mobs.filter(m => m.hp > 0).sort((a,b) => Math.hypot(a.x-player.pos.x,a.z-player.pos.z)-Math.hypot(b.x-player.pos.x,b.z-player.pos.z))[0];
      kit.system.aim = () => { const m = kit.aimed?.(); if (m) player.facing = Math.atan2(player.pos.x-m.x, player.pos.z-m.z); };
      kit.hurt = (inside,n,kind) => {
        for (const m of this.mobs) if (m.hp > 0 && inside(m.x,m.z,m)) {
          if (hurt(m,crit(n * tuning.dmg * damageMultiplier(worn,kind),worn.crit))) {
            this.kills++; if (tuning.leech) stats.heal(stats.hpMax * tuning.leech);
          }
        }
      };
      const state = { hero: h, player, stats, kit, tuning, input: idle(), consumed: Array(11).fill(0) as number[], cast: 0, feedback: '', feedbackUntil: 0 };
      kit.system.fired = (a,tick) => {
        const pos=player.pos;
        this.events.push({seq:++this.eventSeq,player:i,slot:kit.system.slots.indexOf(a),tick,target:(kit.aimed?.() as Friar & {id:number} | undefined)?.id??0,x:pos.x,y:pos.y,z:pos.z,yaw:player.facing});
        this.events=this.events.slice(-24);
      };
      return state;
    });
  }
  step(dt: number): void { quietSfx(() => this.advance(dt)); }
  private advance(dt: number): void {
    if (this.outcome !== 'fight') return;
    dt = Math.min(.05, Math.max(0, dt));
    if(this.countdown>0){
      this.countdown=Math.max(0,Math.round((this.countdown-dt)*1e9)/1e9);
      // Discard warmup presses, so no skill is queued or paid for before combat.
      for(const p of this.players)p.consumed=[...p.input.casts];
      this.seq++;return;
    }
    this.time = Math.min(DURATION, this.time + dt);
    const stage = Math.min(5, 1 + Math.floor(this.time / 60));
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.mobs.filter(m=>m.hp>0).length < MAX_MOBS) {
      this.mobs = this.mobs.filter(m=>m.hp>0 || m.t<1);
      if (this.mobs.length < MAX_MOBS) {
        let x=0,z=0;
        for(let tries=0;tries<40;tries++) {
          const edge=Math.floor(Math.random()*4), t=Math.random()*2-1;
          x=edge<2?(edge===0?-1:1)*(COURT.hx-1.5):t*(COURT.hx-1.5);
          z=edge>=2?(edge===2?-1:1)*(COURT.hz-1.5):t*(COURT.hz-1.5);
          if(!this.world.blocked(x,z,0,.6)&&Number.isFinite(this.world.groundAt(x,z,0)))break;
        }
        if(this.world.blocked(x,z,0,.6)) { this.spawnIn=.1; return; }
        const max = 300 + stage * 160;
        this.mobs.push({ id: ++this.nextMob, max, kind:{hp:max,radius:FRIAR.radius}, x,y:0,z,yaw:0,hp:max,state:'chase',t:0,cd:0,struck:false,home:{x,z,yaw:0},mates:[],cc:control() });
      }
      this.spawnIn = Math.max(.25, 1.15-stage*.15);
    }
    for (const p of this.players) {
      Object.assign(tune,p.tuning); // All delayed callbacks and Grimoire updates run within the owner scope.
      const c = p.input, len = Math.max(1,Math.hypot(c.x,c.z));
      p.player.frozen = p.stats.dead;
      p.player.update(dt,{down:(code:string)=>code==='Space'&&c.jump,buttons:0,stickX:c.x/len,stickY:c.z/len},0,false);
      p.stats.update(dt);
      p.player.mesh.updateMatrixWorld(true);
      if (!p.stats.dead) {
        p.kit.update(dt,()=>false);
        let manualNotice = p.kit.system.notices.filter(n=>n.kind==='error'||n.kind==='fail').at(-1)?.text??'';
        p.kit.system.notices.length=0;
        const manualRequested=c.casts.some((n,i)=>n>p.consumed[i]);
        const candidates = p.kit.system.slots.map((a,i)=>({a,i}));
        for (const {a,i} of candidates) {
          const manual = c.casts[i] > p.consumed[i]; p.consumed[i] = c.casts[i];
          const auto = c.auto && !manualRequested && i<9 && (a?.id !== 'mend' || p.stats.hp<p.stats.hpMax*.5) && !!p.kit.aimed?.();
          if (a && (manual || auto)) {
            const accepted=p.kit.system.tryCast(i);if(accepted)p.cast++;
            if(manual&&!accepted)manualNotice=p.kit.system.notices.filter(n=>n.kind==='error').at(-1)?.text??p.kit.system.unavailable(i);
            p.kit.system.notices.length=0;
          }
        }
        if(manualNotice){p.feedback=manualNotice.slice(0,100);p.feedbackUntil=this.time+2;}
        p.kit.system.notices.length = 0;
      }
      p.kit.vfx.update(dt);
      if (p.stats.dead) p.player.model.die();
    }
    for (const m of this.mobs) {
      m.t+=dt; if (m.hp<=0) continue;
      tick(m.cc,dt); m.cd-=dt;
      const alive=this.players.filter(p=>!p.stats.dead);
      const p=alive.sort((a,b)=>a.player.pos.distanceToSquared({x:m.x,y:m.y,z:m.z})-b.player.pos.distanceToSquared({x:m.x,y:m.y,z:m.z}))[0];
      if (!p) continue;
      const dx=p.player.pos.x-m.x,dz=p.player.pos.z-m.z,d=Math.hypot(dx,dz);
      m.yaw=Math.atan2(-dx,-dz);
      if (m.cc.stun>0) { m.state='chase'; m.t=0; continue; }
      if (m.state==='swing') {
        if (!m.struck && m.t>=FRIAR.windup) { m.struck=true; if(d<FRIAR.hit && p.player.pos.y<1.5) p.stats.takeDamage(65+stage*30); }
        if(m.t>=FRIAR.swing) { m.state='chase';m.t=0;m.cd=FRIAR.cooldown; }
      } else if(d<FRIAR.reach && m.cd<=0) {m.state='swing';m.t=0;m.struck=false;}
      else if(d>0) {const step=Math.min(d,(2.4+stage*.25)*pace(m.cc)*dt);m.x+=dx/d*step;m.z+=dz/d*step;}
    }
    separate(this.mobs,this.world);
    for(const m of this.mobs) {
      m.x=Math.max(-COURT.hx+.7,Math.min(COURT.hx-.7,m.x));
      m.z=Math.max(-COURT.hz+.7,Math.min(COURT.hz-.7,m.z));
      m.y=this.world.groundAt(m.x,m.z,m.y);
    }
    if(this.players.every(p=>p.stats.dead)) this.outcome='defeat';
    else if(this.time>=DURATION) this.outcome='victory';
    this.seq++;
  }
  input(slot: number,c: Controls): void { this.players[slot].input=c; }
  snapshot(): Frame {
    return {events:[...this.events],seq:this.seq,countdown:this.countdown,time:this.time,stage:Math.min(5,1+Math.floor(this.time/60)),kills:this.kills,outcome:this.outcome,
      players:this.players.map(p=>{Object.assign(tune,p.tuning);return {x:p.player.pos.x,y:p.player.pos.y,z:p.player.pos.z,yaw:p.player.facing,hp:p.stats.hp,max:p.stats.hpMax,mana:p.stats.mana,manaMax:p.stats.manaMax,charge:p.kit.system.charge,cast:p.cast,target:(p.kit.aimed?.() as Friar & {id:number}|undefined)?.id??0,feedback:this.time<p.feedbackUntil?p.feedback:'',casting:p.kit.system.casting?{slot:p.kit.system.slots.indexOf(p.kit.system.casting.ability),t:p.kit.system.casting.t,total:p.kit.system.casting.total}:null,slots:p.kit.system.slots.map(a=>a?{id:a.id,name:a.name,cost:a.mana??0,reason:p.stats.dead?'Eroe caduto':p.kit.system.unavailable(p.kit.system.slots.indexOf(a)),cd:Math.max(p.kit.system.cooldown(a),p.kit.system.gcd(a))}:{id:'',name:'',cd:0,cost:0,reason:'Slot vuoto'})};}),
      mobs:this.mobs.map(m=>({id:m.id,x:m.x,y:m.y,z:m.z,yaw:m.yaw,hp:m.hp,max:m.max,state:m.hp<=0?'dead':m.state==='swing'?'swing':'chase',t:m.t}))};
  }
  dispose(): void { for(const p of this.players) {p.player.model.dispose();} }
}
