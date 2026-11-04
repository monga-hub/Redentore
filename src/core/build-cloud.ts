import type { Saves } from './cloud.ts';
import { account } from '../coop/account.ts';
/** The existing authenticated account, with a Redentore-only compare-and-swap RPC. No service credentials. */
export function guardedSaves(hub:Saves):Saves {
  const busy=new Map<string,boolean>();
  const tokens=new Map<string,string|null>();
  const read=async(slot:string)=>{
    const {data,error}=await account.rpc('redentore_build_save',{op:'load',hero:slot});
    if(error)throw error;tokens.set(slot,data.token??null);busy.set(slot,data.busy===true);return data.state;
  };
  return {
    async canEditBuild(hero){await read(hero);return !busy.get(hero);},
    async load(game,slot='default'){return game==='redentore'?read(slot):hub.load(game,slot);},
    async save(game,state,slot='default'){
      if(game!=='redentore'||!(state as {build?:{edit?:unknown}})?.build?.edit)return hub.save(game,state,slot);
      if(!tokens.has(slot))throw Error('Sincronizza il salvataggio prima di modificare la build.');
      const {data,error}=await account.rpc('redentore_build_save',{op:'save',hero:slot,expected:tokens.get(slot),payload:state});
      if(error)throw error;tokens.set(slot,data.token);return true;
    },
    async remove(game,slot='default'){
      if(game!=='redentore')return hub.remove(game,slot);
      await read(slot);
      const {data,error}=await account.rpc('redentore_build_save',{op:'reset',hero:slot,expected:tokens.get(slot)});
      if(error)throw error;tokens.set(slot,data.token);return true;
    },
    onUserChange(cb){let previous='';return hub.onUserChange((u)=>{if(previous!==(u?.id??'')){tokens.clear();previous=u?.id??'';}cb(u);});},
  };
}
