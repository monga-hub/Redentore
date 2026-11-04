import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transpile } from 'typescript';
import { CloudSync, type Saves } from '../src/core/cloud.ts';
import { autosave, resume, type GameState } from '../src/core/save.ts';
import { nextEdit } from '../src/core/build-state.ts';
import { saveForCoop } from '../src/coop/campaign.ts';
import { lfgSnapshot } from '../src/coop/lfg.ts';
const saved={hero:'tizian',build:{xp:100,picks:[],learned:['pyre'],main:'ember',banked:2,presets:[{name:'private'}],edit:{id:'private'}},quest:{boss2Dead:true,boss3Dead:false},gear:{arma:'canna-vetraio'},bag:{gold:1000}};
let status:'ok'|'error'|'none'='ok',keeps=0,pushes=0,flushes=0;
const cloud={ready:Promise.resolve(),get status(){return status;},error:'fixture upload failure',push:()=>{pushes++;},flush:async()=>{flushes++;}};
const keep=()=>{keeps++;return true;};
assert.deepEqual(await saveForCoop(cloud,'tizian',keep,()=>saved),lfgSnapshot(saved));
assert.equal(keeps,1);assert.equal(pushes,1);assert.equal(flushes,1);
const snap=lfgSnapshot(saved);assert.equal('banked' in snap.build,false);assert.equal('presets' in snap.build,false);assert.equal('edit' in snap.build,false);assert.equal('bag' in snap,false);
await assert.rejects(()=>saveForCoop(cloud,'tizian',()=>false,()=>saved),/conservare/);assert.equal(flushes,1,'failed storage never uploads or prepares');
status='error';await assert.rejects(()=>saveForCoop(cloud,'tizian',keep,()=>saved),/fixture upload failure/,'resolved flush with error status aborts departure');
status='none';const previous=keeps;await assert.rejects(()=>saveForCoop(cloud,'tizian',keep,()=>saved),/Accedi/);assert.equal(keeps,previous);
assert.equal(saved.build.banked,2);assert.equal(saved.build.presets[0].name,'private');assert.equal(saved.bag.gold,1000);
console.log('LFG campaign PASS: truthful local save and caught-flush status gating, no departure on failure, combat whitelist excludes bank/presets/edit/bag; owner campaign unchanged.');

// Execute main's actual listener: a fake CloudSync would miss exceptions raised by its subscribers.
const listener=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8').split('\n').find(line=>line.startsWith('cloud.on(')&&line.includes('acknowledgedBuild'));
assert.ok(listener,'production acknowledgement listener must be exercised');
for(const edited of [false,true]){
  const local=new Map<string,string>(),store={getItem:(k:string)=>local.get(k)??null,setItem:(k:string,v:string)=>void local.set(k,v),removeItem:(k:string)=>void local.delete(k)} as Storage;
  const initial:GameState={v:1,hero:'tizian',player:{x:-118,y:0,z:-14,yaw:0,hp:100,mana:100,charge:0},quest:{key:true,bossDead:true,boss2Dead:true,gates:['santa-croce']},dead:[0],time:500,build:{xp:1320,lv:12,picks:['hp'],learned:['pyre'],main:'ember',...(edited?{banked:1,presets:[{id:'private',name:'Private',picks:['hp']}],edit:nextEdit(nextEdit())}:{})},gear:{arma:'canna-vetraio'},bag:{gold:987,items:[]}};
  assert.equal(autosave(initial,store,1000),true);
  const before=structuredClone(resume('tizian',store)!);
  let remote:unknown=null,down=false,uploads=0;
  const client:Saves={load:async(_game,slot)=>slot==='tizian'?structuredClone(remote):null,save:async(_game,state)=>{if(down)throw Error('fixture upload offline');remote=structuredClone(state);uploads++;return true;},remove:async()=>true,onUserChange:(cb)=>{queueMicrotask(()=>cb({id:'fixture',email:'fixture@test.invalid'}));return ()=>{};}};
  const sync=new CloudSync(store,async()=>client,0),levels={edit:structuredClone(initial.build?.edit)};
  runInNewContext(transpile(listener),{cloud:sync,levels,hero:'tizian'});
  await sync.ready;
  assert.equal(uploads,1,'first cloud adoption uploads the existing campaign');
  const keepCurrent=()=>autosave({...initial,build:{...initial.build!,...(levels.edit?{edit:structuredClone(levels.edit)}:{})}},store,1000);
  for(let attempt=0;attempt<2;attempt++){
    assert.deepEqual(await saveForCoop(sync,'tizian',keepCurrent,()=>resume('tizian',store)),lfgSnapshot(initial));
    assert.equal(sync.status,'ok');
    const current=resume('tizian',store)!;
    assert.deepEqual({...current,build:{...current.build,edit:undefined}},{...before,build:{...before.build,edit:undefined}});
    assert.equal(current.build?.edit?.id,levels.edit?.id);
    assert.deepEqual(remote,resume('tizian',store),'cloud campaign matches the conserved local campaign');
  }
  if(edited){
    assert.equal(levels.edit!.ancestors.length,0,'acknowledged modern edit compacts ancestry');
    const next=nextEdit(levels.edit);levels.edit=next;
    sync.on(()=>{if(sync.status==='sync'&&sync.acknowledgedBuild.get('tizian')!==levels.edit!.id)assert.ok(levels.edit!.ancestors.length,'pending edit retains ancestry until its own acknowledgement');});
    await saveForCoop(sync,'tizian',keepCurrent,()=>resume('tizian',store));
    assert.equal(sync.acknowledgedBuild.get('tizian'),next.id);
    assert.equal(next.ancestors.length,0);
  }else assert.equal(resume('tizian',store)?.build?.edit,undefined,'legacy adoption never invents revision metadata');
  down=true;
  keepCurrent();
  const kept=JSON.stringify(resume('tizian',store));
  await assert.rejects(()=>saveForCoop(sync,'tizian',keepCurrent,()=>resume('tizian',store)),/fixture upload offline/);
  assert.equal(JSON.stringify(resume('tizian',store)),kept,'failed upload preserves the local campaign');
  down=false;await sync.flush();assert.equal(sync.status,'ok','failed upload remains retryable');
}
console.log('LFG actual CloudSync PASS: legacy first adoption and repeat queue saves, modern revision acknowledgement, pending ancestry retained, campaign/build/gear preserved, failed uploads gated and retried.');
