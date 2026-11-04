import type { GameState } from './save.ts';
export interface BuildEdit { lineage: string; id: string; ancestors: string[] }
export const editValid=(x:unknown):x is BuildEdit=>{const e=x as BuildEdit;return !!e&&typeof e.lineage==='string'&&e.lineage.length>0&&e.lineage.length<=80&&typeof e.id==='string'&&e.id.length>0&&e.id.length<=80&&Array.isArray(e.ancestors)&&e.ancestors.length<=256&&e.ancestors.every((a)=>typeof a==='string'&&a.length<=80);};
export function nextEdit(previous?:BuildEdit):BuildEdit {
  const history=previous?[...previous.ancestors,previous.id]:[];
  // Keep the last sync base plus recent ancestors; a missing intermediate branch fails closed, never merges points.
  const ancestors=history.length>256?[history[0],...history.slice(-255)]:history;
  return {lineage:previous?.lineage??crypto.randomUUID(),id:crypto.randomUUID(),ancestors};
}
/** Never merge point balances or ranks. A stale world copy may contribute XP, never resurrect an older build. */
export function reconcileBuild(winner:GameState,other?:GameState):GameState {
  const a=winner.build?.edit,b=other?.build?.edit;if(!b)return winner;
  let take=false;
  if(!a)take=true;
  else if(a.lineage!==b.lineage)throw Error('Salvataggi di partite differenti: copie conservate, riprendi la partita sincronizzata.');
  else if(a.id===b.id)return winner;
  else if(a.ancestors.includes(b.id))return winner;
  else if(b.ancestors.includes(a.id))take=true;
  else throw Error('Build modificate su due dispositivi: copie conservate. Riprendi dalla copia sincronizzata.');
  if(!take||!other?.build)return winner;
  return {...winner,build:{...other.build,xp:Math.max(winner.build?.xp??0,other.build.xp),lv:Math.max(winner.build?.lv??1,other.build.lv)}};
}
