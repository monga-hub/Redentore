import { HERO_IDS, type Hero } from '../player/heroes.ts';
import { resume } from '../core/save.ts';
import { LFG_HANDOFF_KEY } from './lfg.ts';

const KEY='redentore.arena.return';
/** Tab-local navigation intent only: the campaign stays in its existing save, never in arena data. */
export function rememberArenaReturn(hero:Hero,user:string,store:Storage=sessionStorage):boolean {
  try{store.setItem(KEY,JSON.stringify({hero,user}));return true;}catch{return false;}
}
export function arenaReturnHero(user:string|undefined,store:Storage=sessionStorage):Hero|undefined {
  try{const r=JSON.parse(store.getItem(KEY)??'null');return user&&r?.user===user&&HERO_IDS.includes(r.hero)?r.hero:undefined;}catch{return;}
}
export function clearArenaReturn(store:Storage=sessionStorage):void {
  try{store.removeItem(KEY);store.removeItem(LFG_HANDOFF_KEY);}catch{/* navigation remains available */}
}
export function adventureUrl(path:string):string {return path+'?adventure';}
/** Consume the intent even when no save/session survives: ordinary hero selection is the safe fallback. */
export function takeArenaReturn(user:string|undefined,store:Storage=sessionStorage,local:Storage=localStorage):Hero|undefined {
  const hero=arenaReturnHero(user,store);clearArenaReturn(store);
  return hero&&resume(hero,local)?hero:undefined;
}
