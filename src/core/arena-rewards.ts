import { Bag } from '../loot/bag.ts';
import { HERO_IDS, type Hero } from '../player/heroes.ts';
import { isLegendaryComponentReward } from '../loot/gear.ts';
import type { GameState } from './save.ts';

export interface ArenaRewards { receipts: {id:string;item:string}[]; received:string[] }
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function metadata(s: GameState): ArenaRewards {
  const a=s.arenaRewards;
  const hero=HERO_IDS.includes(s.hero as Hero)?s.hero as Hero:undefined;
  if(!hero||!a||!Array.isArray(a.receipts)||!Array.isArray(a.received))return {receipts:[],received:[]};
  const receipts=a.receipts.slice(0,4096).filter(r=>r&&uuid.test(r.id)&&typeof r.item==='string'&&isLegendaryComponentReward(r.item,hero));
  return {receipts,received:a.received.filter(id=>receipts.some(r=>r.id===id))};
}
/** Carry earned receipts across the existing gameplay winner/loser merge. A full bag defers delivery. */
export function mergeArenaRewards(winner: GameState, donor?: GameState): GameState {
  const own=metadata(winner),other=donor&&donor.hero===winner.hero?metadata(donor):{receipts:[],received:[]};
  const receipts=[...new Map([...other.receipts,...own.receipts].map(r=>[r.id,r])).values()];
  if(!receipts.length)return winner;
  const bag=new Bag();bag.hero=winner.hero as Hero;if(winner.bag)bag.decode(winner.bag);
  const received=new Set(own.received);
  for(const r of receipts)if(!received.has(r.id)&&bag.add(r.item))received.add(r.id);
  return {...winner,bag:bag.encode(),arenaRewards:{receipts,received:[...received]}};
}
