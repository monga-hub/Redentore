import assert from 'node:assert/strict';
import { buildLevel } from '../src/level/index.ts';
import { GROUPS, MORE } from '../src/enemies/brain.ts';
import { spawnCasters, spawnApiary, PRIEST, SACERDOTE, type CasterKind } from '../src/enemies/caster.ts';
import { spawnLevel2, GONDOLIERE, GASTALDO, MAESTRA } from '../src/enemies/zitelle.ts';
import { spawnLevel3, BIBLIOTECARIO, NOSTROMO, COMMISSARIO, CAMPANARO } from '../src/enemies/sangiorgio.ts';
import { Bag, ITEM, rollComponents, COMPONENT_TABLES, TABLES, type Tier, type Rarity } from '../src/loot/bag.ts';
import { QUESTS } from '../src/quest/progress.ts';

let seed = 47471;
const rnd = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
const quantile = (v: number[], q: number) => [...v].sort((a,b) => a-b)[Math.floor((v.length - 1) * q)];
const summary = (v: number[]) => ({ p50: quantile(v, .5), p90: quantile(v, .9), p99: quantile(v, .99) });
const level = buildLevel();
const c1 = spawnCasters(level.world, level.areas), bees = spawnApiary(level.world);
const c2 = spawnLevel2(level.world), c3 = spawnLevel3(level.world);
const tier2 = (kind: CasterKind): Tier => kind === GONDOLIERE ? 'friar' : [GASTALDO, MAESTRA].includes(kind) ? 'elite' : 'priest';
const tier3 = (kind: CasterKind): Tier => [BIBLIOTECARIO, NOSTROMO, COMMISSARIO, CAMPANARO].includes(kind) ? 'elite' : 'priest';
const rosters: Tier[][] = [
  [...[...GROUPS, ...MORE].flat().map((): Tier => 'friar'), ...c1.all.filter(m => m !== c1.boss && (m.kind === PRIEST || m.kind === SACERDOTE)).map(m => m.kind === SACERDOTE ? 'elite' as const : 'priest' as const), ...bees.all.map(m => m === bees.queen ? 'elite' as const : 'worker' as const), 'boss'],
  [...c2.all.filter(m => m !== c2.boss).map(m => tier2(m.kind)), 'boss'],
  [...c3.all.filter(m => m !== c3.boss).map(m => tier3(m.kind)), 'boss'],
];
// Source-defined ambient C3 subset; excludes side-quest hidden packs, not a measured main route.
const hidden3 = new Set(c3.hidden.flatMap(h => h.members));
rosters.push([...c3.all.filter(m => m !== c3.boss && !hidden3.has(m)).map(m => tier3(m.kind)), 'boss']);
const rarities = ['comune', 'noncomune', 'raro', 'epico'] as const;
const report: object[] = [];
for (let index = 0; index < rosters.length; index++) {
  const chapter = Math.min(index + 1, 3) as 1 | 2 | 3, roster = rosters[index];
  const counts = Object.fromEntries(Object.keys(TABLES).map(t => [t, roster.filter(x => x === t).length]));
  const deaths = roster.length;
  const components = Object.fromEntries(rarities.map(r => [r, roster.reduce((n, t) => n + COMPONENT_TABLES[t].chances.reduce((a,b) => a+b,0) * (COMPONENT_TABLES[t].weights[r] ?? 0)/100,0)])) as Record<Rarity, number>;
  const total = Object.values(components).reduce((a,b) => a+b,0);
  const percentile: Record<string, object> = {};
  const gold = roster.reduce((s,t) => s + TABLES[t].piles * (TABLES[t].gold[0] + TABLES[t].gold[1])/2 * [1,1.6,2.2][chapter - 1],0);
  const runs = 10000, complete = Object.fromEntries(rarities.map(r => [r,0])) as Record<Rarity,number>;
  const completion: Record<string, number[]> = Object.fromEntries(rarities.map(r => [r, []]));
  const slots: number[] = [], duplicate: number[] = [], commonDuplicates: number[] = [], epicUnique: number[] = [];
  const epicDrops: number[] = [];
  for (let run = 0; run < runs; run++) {
    const found = new Map<string, Set<string>>(rarities.map(r => [r,new Set()]));
    const bag = new Bag(); bag.hero = 'risorto';
    let dups = 0, commonDups = 0, epics = 0;
    // Fresh chapter once; every subsequent eligible kill is worker, never another boss/elite.
    for (let kill = 0; kill < 12000; kill++) {
      if (kill === deaths - 1) {
        // Compare a fresh clear with its one boss; continue farming on the unspent pre-boss bag.
        const fresh = new Map([...found].map(([r, parts]) => [r, new Set(parts)]));
        for (const id of rollComponents('boss', rnd, chapter, 'risorto', { count: id => fresh.get(ITEM.get(id)!.rarity)!.has(ITEM.get(id)!.component!) ? 1 : 0 })) {
          const it = ITEM.get(id)!;
          if (it.rarity === 'epico') epics++;
          if (fresh.get(it.rarity)!.has(it.component!)) { dups++; if (it.rarity === 'comune') commonDups++; }
          fresh.get(it.rarity)!.add(it.component!); assert(bag.add(id));
        }
        for (const rarity of rarities) if (fresh.get(rarity)!.size === 6) complete[rarity]++;
        slots.push(bag.items.length); duplicate.push(dups);
        commonDuplicates.push(commonDups); epicUnique.push(fresh.get('epico')!.size); epicDrops.push(epics);
      }
      for (const id of rollComponents(kill < deaths - 1 ? roster[kill] : 'worker', rnd, chapter, 'risorto', { count: id => found.get(ITEM.get(id)!.rarity)!.has(ITEM.get(id)!.component!) ? 1 : 0 })) {
        const it = ITEM.get(id)!;
        const group = found.get(it.rarity)!;
        if (it.rarity === 'epico') epics++;
        if (group.has(it.component!)) { dups++; if (it.rarity === 'comune') commonDups++; }
        group.add(it.component!);
        if (kill < deaths - 1) assert(bag.add(id), 'one chapter component-only inventory overflow');
      }
      for (const rarity of rarities) if (found.get(rarity)!.size === 6 && completion[rarity].length === run) {
        completion[rarity].push(kill+1);
      }
      if (kill >= deaths - 1 && rarities.every(r => completion[r].length > run)) break;
    }
    assert(rarities.every(r => completion[r].length > run));
  }
  for (const rarity of rarities) percentile[rarity] = {
    kills: summary(completion[rarity]), chapterEquivalentKills: Object.fromEntries(Object.entries(summary(completion[rarity])).map(([k,v]) => [k, +(v/deaths).toFixed(2)])),
    completeInFreshChapterPct: +(100*complete[rarity]/runs).toFixed(2),
  };
  report.push({chapter, scenario:index < 3 ? 'optimistic-full-clear' : 'ambient-without-hidden-side-quest-packs', counts, deaths, goldBeforeJunkQuests:gold, expectedComponents:components,
    rarityPctOfComponents: Object.fromEntries(rarities.map(r => [r, +(components[r]/total*100).toFixed(3)])),
    expectedComponentsPer100Deaths: Object.fromEntries(rarities.map(r => [r, +(components[r]/deaths*100).toFixed(3)])),
    completionBeforeBossThenWorker:percentile, componentOnlySlots:summary(slots), duplicatesPerFreshChapter:summary(duplicate), commonDuplicatesPerFreshChapter:summary(commonDuplicates),
    epicUniqueFresh:{p10:quantile(epicUnique,.1), ...summary(epicUnique)}, epicDropsFresh:{mean:epicDrops.reduce((a,b)=>a+b,0)/runs, p10:quantile(epicDrops,.1), ...summary(epicDrops)}});
}
const workerCompletion: Record<string, object> = {};
for (const rarity of ['comune','raro','epico'] as const) {
  const kills: number[] = [], sameRarityDrops: number[] = [];
  for (let run=0;run<10000;run++) {
    const parts = new Set(), seen: string[] = [];
    const owned = {count:(id:string) => parts.has(ITEM.get(id)!.component) && ITEM.get(id)!.rarity === rarity ? 1 : 0};
    let k=0;
    while (parts.size < 6) { k++; for (const id of rollComponents('worker',rnd,2,'risorto',owned)) if (ITEM.get(id)!.rarity === rarity) { parts.add(ITEM.get(id)!.component); seen.push(id); } }
    kills.push(k); sameRarityDrops.push(seen.length);
  }
  workerCompletion[rarity] = { kills: summary(kills), sameRarityDrops: summary(sameRarityDrops), duplicateDrops: summary(sameRarityDrops.map(n => n-6)) };
}
console.log(JSON.stringify({seed:47471, runsPerChapter:10000, policy:COMPONENT_TABLES, chapters:report, workerOnly:workerCompletion,
  assumptions:'Configured roster including optional/hidden packs and boss wards; Fresh chapter distribution includes one boss. Completion-kill trajectories exclude boss loot and switch to worker repeats after all nonboss; boss must remain alive for repeats. Fresh completion chance/slots separately clone pre-boss bag and add one boss. Optional/hidden/ward rosters are optimistic maximum, not a required route. Chapter-equivalent kills do NOT mean replayable chapter clears. Minutes hypothetical kills/4 or kills/8, neither measured play time. 24 distinct current-chapter component stacks maximum before >20 duplicates; bag30 must also hold other items, selling/crafting required. Part selected uniformly among missing parts of won rarity (otherwise duplicate uniform); immediate pickup assumption, no rarity pity. Worker-only model retains target rarity, sells other rarity duplicates. Incoming ground drops are not reservations; delayed pickup can create duplicates.',
  questGold:Object.fromEntries(Object.entries(QUESTS).map(([id,q])=>[id,q.gold]))},null,2));
