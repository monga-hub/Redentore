import type { Levels } from './levels.ts';
import { allocation,checkBuild,enhancement,retained } from './build.ts';
export interface BuildPreset { id:string;name:string;picks:string[] }
export const presetValid=(p:unknown):p is BuildPreset=>{
  const x=p as BuildPreset;
  return !!x&&typeof x.id==='string'&&x.id.length>0&&x.id.length<=80&&typeof x.name==='string'&&x.name.trim().length>0&&x.name.length<=80&&Array.isArray(x.picks)&&x.picks.length<=10000&&x.picks.every((id)=>typeof id==='string'&&enhancement(id));
};
const nameOf=(name:string)=>name.trim().slice(0,80);
export function savePreset(b:Levels,name:string):string|undefined {
  const why=checkBuild(b,b.schools);if(why)return why;
  if(!nameOf(name))return 'Dai un nome alla configurazione.';
  if(b.presets.length>=128)return 'Archivio configurazioni pieno.';
  b.presets=[...b.presets,{id:crypto.randomUUID(),name:nameOf(name),picks:allocation(b.picks)}];return undefined;
}
export function renamePreset(b:Levels,id:string,name:string):string|undefined {
  if(!nameOf(name))return 'Dai un nome alla configurazione.';
  if(!b.presets.some((p)=>p.id===id))return 'Configurazione non trovata.';
  b.presets=b.presets.map((p)=>p.id===id?{...p,name:nameOf(name)}:p);return undefined;
}
export function loadPreset(b:Levels,id:string):string|undefined {
  const why=checkBuild(b,b.schools);if(why)return why;
  const p=b.presets.find((p)=>p.id===id);if(!presetValid(p))return 'Configurazione non valida.';
  const picks=[...retained(b.picks),...p.picks],banked=Math.max(0,b.banked+allocation(b.picks).length-p.picks.length);
  const problem=checkBuild({...b,picks,banked},b.schools);if(problem)return problem;
  b.picks=picks;b.banked=banked;return undefined;
}
