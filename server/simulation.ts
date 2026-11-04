import { World } from '../src/core/physics.ts';
import { PlayerController } from '../src/player/controller.ts';
import { PlayerStats } from '../src/player/stats.ts';
import { Forsaken, tune } from '../src/abilities/forsaken.ts';
import { ownSchools, tuneOf } from '../src/player/levels.ts';
import { HEROES } from '../src/player/heroes.ts';
import { Equipment, effects, crit, damageMultiplier } from '../src/loot/gear.ts';
import { BOONS } from '../src/quest/progress.ts';
import { FRIAR, hurt, separate, type Friar } from '../src/enemies/brain.ts';
import { control, pace, tick } from '../src/enemies/control.ts';
import { DURATION, MAX_MOBS, arenaLayout, idle, type CombatHero, type Controls, type Frame } from '../src/coop/protocol.ts';

export function arenaWorld(): World {
  const w = new World(); w.add(0, 0, 20, 20, -1, 0);
  for (const side of [-1, 1]) { w.add(side * 18, 0, .5, 19, 0, 4); w.add(0, side * 18, 19, .5, 0, 4); }
  return w;
}
export class Survival {
  readonly world = arenaWorld();
  readonly players;
  mobs: (Friar & { id: number; max: number })[] = [];
  time = 0; kills = 0; seq = 0;
  outcome: Frame['outcome'] = 'fight';
  private spawnIn = 0;
  private nextMob = 0;
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
      kit.system.unlock(...tuning.owned); kit.system.setMain(tuning.owned.includes(h.main) ? h.main : tuning.owned[0]);
      kit.system.chargeMul = tuning.fury; kit.system.chargeAfter = tuning.furyStart; kit.system.castMul = 1 / worn.haste;
      stats.onHurt = n => { kit.system.pushback(); player.model.flinch(n); };
      kit.foes = () => this.mobs;
      kit.aimed = () => this.mobs.filter(m => m.hp > 0).sort((a,b) => Math.hypot(a.x-player.pos.x,a.z-player.pos.z)-Math.hypot(b.x-player.pos.x,b.z-player.pos.z))[0];
      kit.system.aim = () => { const m = kit.aimed?.(); if (m) player.facing = Math.atan2(player.pos.x-m.x, player.pos.z-m.z); };
      kit.hurt = (inside,n,kind) => {
        for (const m of this.mobs) if (m.hp > 0 && inside(m.x,m.z,m)) {
          if (hurt(m,crit(n * tuning.dmg * damageMultiplier(worn,kind),worn.crit))) {
            this.kills++; if (tuning.leech) stats.heal(stats.hpMax * tuning.leech);
          }
        }
      };
      return { hero: h, player, stats, kit, tuning, input: idle(), consumed: Array(11).fill(0) as number[], cast: 0 };
    });
  }
  step(dt: number): void {
    if (this.outcome !== 'fight') return;
    dt = Math.min(.05, Math.max(0, dt)); this.time = Math.min(DURATION, this.time + dt);
    const stage = Math.min(5, 1 + Math.floor(this.time / 60));
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.mobs.filter(m=>m.hp>0).length < MAX_MOBS) {
      this.mobs = this.mobs.filter(m=>m.hp>0 || m.t<1);
      if (this.mobs.length < MAX_MOBS) {
        const angle = Math.random()*Math.PI*2, x=Math.sin(angle)*16, z=Math.cos(angle)*16;
        const max = 300 + stage * 160;
        this.mobs.push({ id: ++this.nextMob, max, x,y:0,z,yaw:0,hp:max,state:'chase',t:0,cd:0,struck:false,home:{x,z,yaw:0},mates:[],cc:control() });
      }
      this.spawnIn = Math.max(.25, 1.15-stage*.15);
    }
    for (const p of this.players) {
      Object.assign(tune,p.tuning); // All delayed callbacks and Grimoire updates run within the owner scope.
      const c = p.input, len = Math.max(1,Math.hypot(c.x,c.z));
      p.player.frozen = p.stats.dead;
      p.player.update(dt,{down:()=>false,buttons:0,stickX:c.x/len,stickY:c.z/len},0,false);
      p.stats.update(dt);
      p.player.mesh.updateMatrixWorld(true);
      if (!p.stats.dead) {
        p.kit.update(dt,()=>false);
        const candidates = p.kit.system.slots.map((a,i)=>({a,i}));
        for (const {a,i} of candidates) {
          const manual = c.casts[i] > p.consumed[i]; p.consumed[i] = c.casts[i];
          const auto = c.auto && i<9 && (a?.id !== 'mend' || p.stats.hp<p.stats.hpMax*.5) && !!p.kit.aimed?.();
          if (a && (manual || auto) && p.kit.system.tryCast(i)) p.cast++;
        }
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
    if(this.players.every(p=>p.stats.dead)) this.outcome='defeat';
    else if(this.time>=DURATION) this.outcome='victory';
    this.seq++;
  }
  input(slot: number,c: Controls): void { this.players[slot].input=c; }
  snapshot(): Frame {
    return {seq:this.seq,time:this.time,stage:Math.min(5,1+Math.floor(this.time/60)),kills:this.kills,outcome:this.outcome,
      players:this.players.map(p=>{Object.assign(tune,p.tuning);return {x:p.player.pos.x,y:p.player.pos.y,z:p.player.pos.z,yaw:p.player.facing,hp:p.stats.hp,max:p.stats.hpMax,mana:p.stats.mana,manaMax:p.stats.manaMax,charge:p.kit.system.charge,cast:p.cast,slots:p.kit.system.slots.map(a=>a?{id:a.id,name:a.name,cd:Math.max(p.kit.system.cooldown(a),p.kit.system.gcd(a))}:{id:'',name:'',cd:0})};}),
      mobs:this.mobs.map(m=>({id:m.id,x:m.x,y:m.y,z:m.z,yaw:m.yaw,hp:m.hp,max:m.max,state:m.hp<=0?'dead':m.state==='swing'?'swing':'chase',t:m.t}))};
  }
  dispose(): void { for(const p of this.players) {p.player.model.dispose();} }
}
