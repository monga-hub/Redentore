import type { CloudSync } from '../core/cloud.ts';
import type { Hero } from '../player/heroes.ts';
import { lfgSnapshot } from './lfg.ts';
/** Flush catches errors, so resolving the Promise alone is never proof of a usable current snapshot. */
export async function saveForCoop(cloud:Pick<CloudSync,'ready'|'status'|'error'|'push'|'flush'>,hero:Hero,keep:()=>boolean,current:()=>unknown){
  await cloud.ready;
  if(cloud.status==='none'||cloud.status==='out')throw Error('Accedi a Mongames prima di cercare un gruppo. La campagna resta sul dispositivo.');
  if(!keep())throw Error('Impossibile conservare la campagna in questo momento. Nessuna partenza: riprova fuori dai viaggi.');
  cloud.push(hero);await cloud.flush();
  if(cloud.status!=='ok')throw Error('Campagna conservata sul dispositivo. Sincronizzazione non riuscita: '+(cloud.error||'riprova prima di entrare in arena.'));
  return lfgSnapshot(current());
}
