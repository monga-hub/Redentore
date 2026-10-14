// Levels check (`npm run check`): the XP curve against the mobs' worth (first level after two friars, the quest
// route with the apiary, ~875 XP in scripts/balance.ts, level 9, a full clear level 11), the two-card offers over many random runs (never an owned or maxed card,
// never a mod for a locked ability, new abilities on even levels with the specials from level 6, fusions only
// with both parents), the heal when everything is taken, the replay of picks into numbers, and the bar keeping
// a slot for an ability until it is unlocked.
import { CARD, CARDS, MAX_LEVEL, SPECIALS, START, eligible, levelOf, need, offer, tuneOf, type Card } from '../src/player/levels.ts';
import { FRIAR, spawnGroups } from '../src/enemies/brain.ts';
import { APE, APETTA, PRIEST, REVERENDISSIMO, SACERDOTE } from '../src/enemies/caster.ts';
import { AbilitySystem, type Ability } from '../src/abilities/system.ts';
import { buildLevel } from '../src/level/index.ts';

const fail = (why: string) => { throw new Error(why); };

// Curve and budget. The kinds' counts are the spawn plans' (check-intro counts all 89 on the map).
if (need(1) !== 20 || need(2) !== 40) fail('curve');
const friars = spawnGroups(buildLevel().world).flat().length;
if (friars !== 32) fail(`${friars} friars`);
const full = friars * FRIAR.xp + 45 * PRIEST.xp + 7 * SACERDOTE.xp + APE.xp + 3 * APETTA.xp + REVERENDISSIMO.xp;
if (full !== 1145 || levelOf(full).lv !== 11) fail(`full clear ${full} XP is level ${levelOf(full).lv}, want 1145 / 11`);
if (levelOf(FRIAR.xp).lv !== 1 || levelOf(2 * FRIAR.xp).lv !== 2) fail('the first level must come with the second friar');
for (const [xp, lv] of [[560, 8], [720, 9], [875, 9], [900, 10], [19, 1], [20, 2], [1e9, MAX_LEVEL]]) if (levelOf(xp).lv !== lv) fail(`${xp} XP is level ${levelOf(xp).lv}, want ${lv}`);
const l = levelOf(70);
if (l.lv !== 3 || l.into !== 10 || l.next !== 60) fail(`levelOf(70) = ${JSON.stringify(l)}`);
if (CARDS.filter((c) => c.kind !== 'ability' && c.kind !== 'filler').length !== 33) fail('33 cards');

// Offers over many seeded runs, picking at random among the two, up to the cap.
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const fusionsSeen = new Set<string>();
for (let run = 0; run < 400; run++) {
  const picks: string[] = [];
  for (let n = 0; n < MAX_LEVEL - 1; n++) {
    const lv = picks.length + 2, cards = offer(picks, rnd), ok = eligible(picks), t = tuneOf(picks);
    const count = (id: string) => picks.filter((p) => p === id).length;
    const ids = cards.map((c) => c.id).join();
    if (cards.length !== 2 || cards[0] === cards[1]) fail(`level ${lv}: offer ${ids}`);
    for (const c of cards) {
      if (c.kind === 'filler') continue;
      if (!ok.includes(c)) fail(`level ${lv}: ${c.id} offered but not eligible after ${picks}`);
      if (count(c.id) >= c.max) fail(`level ${lv}: maxed ${c.id} offered`);
      if (c.kind === 'ability' && t.owned.includes(c.id)) fail(`level ${lv}: owned ${c.id} offered`);
      if (c.kind === 'mod' && c.of && !t.owned.includes(c.of)) fail(`level ${lv}: ${c.id} for locked ${c.of}`);
      if (c.kind === 'fusion') fusionsSeen.add(c.id);
    }
    const abilities = ok.filter((c) => c.kind === 'ability'), kinds = cards.map((c) => c.kind);
    if (lv % 2 === 0 && lv <= 10) {
      const open = abilities.filter((c) => c.tier === 'A' || lv >= 6);
      if (kinds.filter((k) => k === 'ability').length !== Math.min(2, open.length)) fail(`level ${lv}: ${ids} with ${open.length} abilities open`);
      if (lv < 6 && cards.some((c) => c.tier === 'B')) fail(`level ${lv}: a special before level 6`);
      if ((lv === 6 || lv === 8) && abilities.some((c) => c.tier === 'B') && !cards.some((c) => c.tier === 'B')) fail(`level ${lv}: no special offered`);
    } else {
      if (kinds.includes('ability')) fail(`level ${lv}: an ability off the ability levels`);
      if (ok.some((c) => c.kind === 'passive') && !kinds.includes('passive')) fail(`level ${lv}: no passive in ${ids}`);
      if (ok.some((c) => c.kind === 'mod' || c.kind === 'fusion') && !kinds.some((k) => k === 'mod' || k === 'fusion')) fail(`level ${lv}: no modifier in ${ids}`);
    }
    picks.push(cards[Math.floor(rnd() * 2)].id);
  }
  const t = tuneOf(picks);
  if (t.owned.length !== START.length + 5) fail(`run ${run}: ${t.owned} owned after the cap, want 5 unlocks`);
  if (t.fury === 0 && SPECIALS.some((s) => t.owned.includes(s))) fail('a special owned but the charge bar off');
}
if (fusionsSeen.size !== 3) fail(`fusions offered: ${[...fusionsSeen]}`);

// Fusions need both parents; charge cards a special.
const has = (picks: string[], id: string) => eligible(picks).some((c) => c.id === id);
if (has(['wisp'], 'fx_wispplague') !== true || has([], 'fx_wispplague') || has(['step'], 'fx_wispplague')) fail('Fuoco pestilente needs the wisp');
if (has([], 'fx_fallplague') || !has(['plague_dps'], 'fx_fallplague')) fail('Ossa appestate needs Peste virulenta');
if (has(['step'], 'fury') || has(['step'], 'fury_start') || !has(['nova'], 'fury')) fail('charge cards need a special');
if (has([], 'wisp_dps') || !has(['wisp'], 'wisp_dps') || !has([], 'potion_big')) fail('mods need their ability (the potion is owned)');

// Everything taken: the heal alone is offered.
const all = CARDS.flatMap((c: Card) => (c.kind === 'filler' ? [] : Array(c.max).fill(c.id)));
if (eligible(all).length) fail('cards left after taking everything');
if (offer(all).map((c) => c.id).join() !== 'linfa') fail(`exhausted offer ${offer(all).map((c) => c.id)}`);

// Replay: numbers from picks, stacks past max and unknown ids ignored, order-free, survives JSON.
const t = tuneOf(['dmg', 'dmg', 'dmg', 'dmg', 'hp', 'plague_size', 'junk', 'nova', 'wisp_fast']);
if (Math.abs(t.dmg - 1.24) > 1e-9 || t.hp !== 1.15 || Math.abs(t.plagueR - 2.75) > 1e-9 || t.wispCast !== 0) fail(`tune ${JSON.stringify(t)}`);
if (t.owned.join() !== 'fall,plague,potion,nova' || t.fury !== 1) fail('owned / fury');
if (tuneOf([]).fury !== 0 || tuneOf([]).owned.join() !== START.join()) fail('the start');
const picks = ['veil', 'armor', 'strike', 'fury', 'ward', 'ward_long'];
if (JSON.stringify(tuneOf(JSON.parse(JSON.stringify(picks)))) !== JSON.stringify(tuneOf(picks))) fail('replay after JSON');
if (!CARD.get('linfa') || CARD.get('linfa')!.kind !== 'filler') fail('filler');

// The bar: a locked ability's slot stays its own, an unlock lands there even after the bar was rearranged.
const ab = (id: string): Ability => ({ id, name: id, icon: '', desc: '', cooldown: 1, fire: () => {} });
const sys = new AbilitySystem(['fall', 'plague', 'wisp', 'step'].map(ab), ['fall', 'plague', 'wisp', 'step'], { player: { pos: { x: 0, y: 0, z: 0 } } }, ['fall', 'plague']);
if (sys.slots[2] || sys.slots[3] || !sys.slots[0] || sys.tryCast(3)) fail('locked abilities shown');
sys.swap(0, 3); // fall dragged onto step's (empty-looking) slot
if (sys.slots[3]?.id !== 'fall' || sys.slots[0]) fail('drag onto a locked slot');
sys.unlock('step');
if (sys.slots[0]?.id !== 'step' || sys.slots[3]?.id !== 'fall' || sys.slots[1]?.id !== 'plague') fail(`unlock moved the bar: ${sys.layout()}`);
console.log(`levels ok (full clear ${full} XP = level ${levelOf(full).lv}, 400 runs offered cleanly)`);
