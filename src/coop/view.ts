import * as THREE from 'three';
import { UndeadModel } from '../player/undead.ts';
import { FriarView, arenaFriarTemplate } from '../enemies/friars.ts';
import { Vfx } from '../abilities/vfx.ts';
import { control } from '../enemies/control.ts';
import { Input } from '../core/input.ts';
import { TouchControls } from '../ui/touch.ts';
import { PHONE } from '../core/device.ts';
import { type CombatHero, type Frame, type Controls, idle } from './protocol.ts';
import type { Friar } from '../enemies/brain.ts';

/** Visual interpolation only. Combat, movement limits and damage are computed by the runtime. */
export class ArenaView {
  readonly renderer = new THREE.WebGLRenderer({antialias:!PHONE});
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,120);
  readonly input: Input;
  readonly controls: Controls = idle();
  private heroes: UndeadModel[]=[];
  private mobs=new Map<number,FriarView>();
  private pool:FriarView[]=[];
  private template?: Awaited<ReturnType<typeof arenaFriarTemplate>>;
  private target?:Frame;
  private vfx=new Vfx();
  private cast=[0,0];
  private hp=[0,0];
  private last=performance.now();
  private disposed=false;
  private slot=0;
  private effects: {mesh:THREE.Mesh;life:number}[]=[];
  constructor() {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,PHONE?1.25:2));this.renderer.setSize(innerWidth,innerHeight);this.renderer.domElement.id='arena-canvas';document.body.append(this.renderer.domElement);
    this.scene.background=new THREE.Color(0x111b23);this.scene.fog=new THREE.Fog(0x111b23,35,80);
    this.scene.add(new THREE.HemisphereLight(0xb8d8ff,0x483522,2.4));
    const sun=new THREE.DirectionalLight(0xffd6a4,3);sun.position.set(-6,18,10);this.scene.add(sun);
    const floor=new THREE.Mesh(new THREE.BoxGeometry(36,1,36),new THREE.MeshStandardMaterial({color:0x4b514a,roughness:.95}));floor.position.y=-.5;this.scene.add(floor);
    const grid=new THREE.GridHelper(36,18,0x8b7955,0x52564a);grid.position.y=.015;this.scene.add(grid);
    const stone=new THREE.MeshStandardMaterial({color:0x625c50,roughness:.9});
    for(const sign of [-1,1])for(const axis of ['x','z'] as const){const wall=new THREE.Mesh(new THREE.BoxGeometry(axis==='x'?1:37,1.8,axis==='z'?1:37),stone);wall.position[axis]=sign*18;wall.position.y=.9;this.scene.add(wall);}
    for(const x of [-17,17])for(const z of [-17,17]){const p=new THREE.Mesh(new THREE.CylinderGeometry(.5,.7,4,8),stone);p.position.set(x,2,z);this.scene.add(p);const light=new THREE.PointLight(0xff9e38,20,9);light.position.set(x,4,z);this.scene.add(light);}
    this.input=new Input(this.renderer.domElement);this.input.orbit=false;new TouchControls(this.renderer.domElement,this.input);
    this.scene.add(this.vfx.root);
    void arenaFriarTemplate().then(t=>{if(!this.disposed)this.template=t;}).catch(()=>{document.dispatchEvent(new CustomEvent('arena-art-error'));});
    addEventListener('resize',this.resize);
    requestAnimationFrame(this.draw);
  }
  setHeroes(heroes:CombatHero[],slot:number):void {
    this.slot=slot;
    for(let i=0;i<heroes.length;i++)if(!this.heroes[i]){const h=new UndeadModel(heroes[i].hero);h.wear(heroes[i].gear);h.root.position.x=i?2:-2;this.heroes.push(h);this.scene.add(h.root);
      const ring=new THREE.Mesh(new THREE.RingGeometry(.7,.85,32).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:i===slot?0xffd75e:0x66c9ff,side:THREE.DoubleSide}));ring.position.y=.035;h.root.add(ring);
    }
  }
  snapshot(f:Frame):void {if(!this.target||f.seq>=this.target.seq)this.target=f;}
  sample():Controls {
    this.controls.x=(this.input.down('KeyD','ArrowRight')?1:0)-(this.input.down('KeyA','ArrowLeft')?1:0)||this.input.stickX;
    this.controls.z=(this.input.down('KeyS','ArrowDown')?1:0)-(this.input.down('KeyW','ArrowUp')?1:0)||this.input.stickY;
    const codes=['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','KeyR','KeyT'];
    codes.forEach((code,i)=>{if(this.input.pressed(code))this.controls.casts[i]++;});this.input.endFrame();
    this.controls.seq++;return structuredClone(this.controls);
  }
  private resize=()=>{this.renderer.setSize(innerWidth,innerHeight);this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();};
  private draw=(now:number)=>{
    if(this.disposed)return;
    const dt=Math.min(.05,(now-this.last)/1000);this.last=now;const k=1-Math.exp(-dt*14),f=this.target;
    if(f){
      f.players.forEach((p,i)=>{const h=this.heroes[i];if(!h)return;const before=h.root.position.clone();h.root.position.lerp(new THREE.Vector3(p.x,p.y,p.z),k);const speed=before.distanceTo(h.root.position)/Math.max(dt,.001);h.root.rotation.y+=Math.atan2(Math.sin(p.yaw-h.root.rotation.y),Math.cos(p.yaw-h.root.rotation.y))*k;
        h.animate(dt,speed,p.y<.1,speed);
        if(p.hp<=0&&this.hp[i]>0)h.die();if(p.hp>0&&this.hp[i]>p.hp)h.flinch(this.hp[i]-p.hp);this.hp[i]=p.hp;
        if(p.cast>this.cast[i]){h.play('push',.15);h.fight();this.cast[i]=p.cast;const ring=new THREE.Mesh(new THREE.RingGeometry(.4,.65,32).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:i===this.slot?0xffd75e:0x73cfff,transparent:true,opacity:.8,side:THREE.DoubleSide}));ring.position.set(p.x,.06,p.z);this.effects.push({mesh:ring,life:.5});this.scene.add(ring);}
      });
      if(this.template)for(const m of f.mobs){let view=this.mobs.get(m.id);if(!view){view=this.pool.pop()??new FriarView(this.template);view.root.position.set(m.x,m.y,m.z);view.root.visible=true;this.mobs.set(m.id,view);this.scene.add(view.root);}const pos=view.root.position;const mob={...m,x:THREE.MathUtils.lerp(pos.x,m.x,k),z:THREE.MathUtils.lerp(pos.z,m.z,k),cc:control(),cd:0,struck:false,home:{x:m.x,z:m.z,yaw:0},mates:[]} as Friar;view.update(mob,dt,this.vfx,10);}
      for(const [id,v]of this.mobs)if(!f.mobs.some(m=>m.id===id)){this.scene.remove(v.root);this.mobs.delete(id);this.pool.push(v);}
    }
    for(const e of this.effects){e.life-=dt;e.mesh.scale.multiplyScalar(1+dt*5);(e.mesh.material as THREE.MeshBasicMaterial).opacity=Math.max(0,e.life*1.6);if(e.life<=0){this.scene.remove(e.mesh);e.mesh.geometry.dispose();(e.mesh.material as THREE.Material).dispose();}}this.effects=this.effects.filter(e=>e.life>0);
    this.vfx.update(dt);
    const p=this.heroes[this.slot]?.root.position??new THREE.Vector3();this.camera.position.lerp(new THREE.Vector3(p.x,p.y+19,p.z+17),1-Math.exp(-dt*5));this.camera.lookAt(p.x,0,p.z-2);
    this.renderer.render(this.scene,this.camera);requestAnimationFrame(this.draw);
  };
  dispose():void {this.disposed=true;removeEventListener('resize',this.resize);for(const h of this.heroes)h.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}
