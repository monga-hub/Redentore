import { CARD, counter, levelOf, ours, tuneOf, type Levels, type School } from './levels.ts';
import { fit, talents } from './talents.ts';

/** Picks are the ledger: every occurrence costs one level-up, including legacy combined upgrades. */
export const enhancement = (id: string): boolean => {
  const c = CARD.get(id);
  return !!c && (c.kind === 'mod' || c.kind === 'passive' || c.kind === 'fusion' || (c.kind === 'filler' && !!c.apply));
};
export const allocation = (picks: readonly string[]) => picks.filter(enhancement);
export const retained = (picks: readonly string[]) => picks.filter((id) => !enhancement(id));
export const earned = (xp: number) => Math.max(0, Math.floor((1 + Math.sqrt(1 + 0.4 * xp)) / 2) - 1);
export interface BuildInput { xp: number; picks: string[]; learned: string[]; banked?: number }
export function budget(b: BuildInput): number { return Math.max(0, earned(b.xp) - b.picks.length); }

/** Refuse bad ledgers; never manufacture refund credit from ignored cards or over-capped picks. `trees`: also ask the talent
 *  trees' shape, which a stored save from before them skips (the load fits it, core/save.ts). */
export function checkBuild(b: BuildInput, schools: readonly School[], trees = true): string | undefined {
  if (!Number.isFinite(b.xp) || b.xp < 0 || b.picks.length > earned(b.xp)) return 'Punti investiti superiori ai livelli guadagnati.';
  if (!Number.isSafeInteger(b.banked ?? 0) || (b.banked ?? 0) < 0 || (b.banked ?? 0) > budget(b)) return 'Saldo dei punti non valido.';
  if (b.learned.some((id) => CARD.get(id)?.kind !== 'ability' || !ours(CARD.get(id)!, schools))) return 'Abilità apprese non valide.';
  const count = counter(b.picks), owned = tuneOf(b.picks,b.learned,schools).owned;
  for (const id of new Set(b.picks)) {
    const c = CARD.get(id);
    if (!c || !ours(c,schools) || (trees && count(id) > c.max) || (c.of && !owned.includes(c.of)) || (c.needs && !c.needs(count,(a)=>owned.includes(a)))) return 'La build contiene potenziamenti o prerequisiti non validi.';
  }
  if (trees && fit(b.picks,b.learned,schools,levelOf(b.xp).lv).refunded) return 'La build non rispetta gli alberi dei talenti.';
  return undefined;
}
/** The upgrades a banked point may buy now: the open nodes of the trees, abilities apart (level-ups and tomes teach those). */
export function upgradeChoices(b: BuildInput, schools: readonly School[]) {
  const T=talents(b.picks,b.learned,schools,levelOf(b.xp).lv);
  return [0,1,2].flatMap((i)=>T.options(i).map((o)=>o.card)).filter((c)=>enhancement(c.id));
}
export function spend(b: Levels, id: string): string | undefined {
  const why=checkBuild(b,b.schools); if(why)return why;
  if (budget(b)<1 || !upgradeChoices(b,b.schools).some((c)=>c.id===id)) return 'Punti insufficienti o prerequisiti non soddisfatti.';
  b.picks=[...b.picks,id]; b.banked=Math.max(0,b.banked-1); return undefined;
}
export function reset(b: Levels): string | undefined {
  const why=checkBuild(b,b.schools);if(why)return why;
  const refund=allocation(b.picks).length;
  b.picks=retained(b.picks);b.banked+=refund;return undefined;
}
export function rankLabel(id:string,picks:readonly string[]): string {
  return `${counter(picks)(id)}/${CARD.get(id)!.max}`;
}
