// Talent trees check (`npm run check`): every card of a hero's two schools and of no school on exactly one of his three trees;
// a node opens on a parent's rank, the tree's level and its tier's points in the rows above, a choice node takes one side; the
// level-up's three cards one a tree, the kit's abilities first on the early even levels; the build screen spends only open
// nodes; an older save fits into the trees with every point that no longer fits handed back, never lost, and fits once.
import assert from 'node:assert/strict';
import { CARD, CARDS, Levels, ours, type School } from '../src/player/levels.ts';
import { FUSION, fit, offer, talents, treeMax, treeOf, treesOf } from '../src/player/talents.ts';
import { budget, checkBuild, spend } from '../src/player/build.ts';
import { HEROES, HERO_IDS } from '../src/player/heroes.ts';

const RIS: School[] = ['bone', 'shadow'];
let seed = 5;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const open = (picks: string[], id: string, lv = 20, learned: string[] = [], sc: readonly School[] = RIS) => {
  const T = talents(picks, learned, sc, lv);
  return [0, 1, 2].some((i) => T.options(i).some((o) => o.card.id === id));
};

// Placement: each hero's cards, once each, on his trees; the root and the heal given; his fusion the Fusioni's capstone.
for (const id of HERO_IDS) {
  const sc = HEROES[id].school, placed = treesOf(sc).flatMap((t) => t.nodes.flatMap((n) => n.ids));
  const want = CARDS.filter((c) => c.kind !== 'filler' && ours(c, sc) && (c.kind !== 'fusion' || c.id === FUSION[sc.join('+')])).map((c) => c.id);
  assert.deepEqual(want.filter((c) => !placed.includes(c)), [], `${id}: cards on no tree`);
  assert.equal(new Set(placed).size, placed.length, `${id}: a card on two nodes`);
  assert.ok(treesOf(sc).every((t) => treeMax(t) > 20 && t.nodes.every((n) => n.parents.every((p) => t.nodes.some((k) => k.key === p && k.row < n.row)))), `${id}: parents below their children`);
}

// Prerequisites: a node needs a parent with a rank (an ability: owned), the Fusioni level 3, the rows above a tier its points.
assert.ok(open([], 'fall_dmg', 2) && !open([], 'fall_third', 20), 'the third blow waits for the damage above it');
assert.ok(!open([], 'leap_big') && open(['leap'], 'leap_big'), 'an upgrade hangs from its ability');
assert.ok(open(['leap', 'fall_dmg'], 'fall_third') && !open(['fall_dmg'], 'fall_third'), 'tier II: two points in the rows above');
assert.ok(!open(['fall_dmg', 'leap'], 'strike', 5) && open(['fall_dmg', 'leap'], 'strike', 6), 'a special at level 6, on its tier');
assert.ok(open(['fall_dmg', 'leap'], 'strike') && !open(['fall_dmg', 'whirl', 'leap'], 'nova'), "Lamento hangs from Turbine's or Colpo di grazia's damage, not Caduta's");
assert.ok(open(['whirl', 'whirl_dmg'], 'nova'), 'two paths merge on a special');
assert.ok(!open([], 'dmg', 2) && open([], 'dmg', 3) && !open([], 'hp') && open(['dmg'], 'hp'), 'the Fusioni from level 3, from its root down');
// Tier III: six points in rows 1-5 of the tree.
const five = ['leap', 'leap_big', 'fall_dmg', 'fall_dmg', 'strike'];
assert.ok(!open(five, 'strike_dmg') && open([...five, 'fall_third'], 'strike_dmg'), 'tier III: six points above');
// A choice node: either side, never both; a reset frees it.
const choice = ['leap', 'fall_dmg', 'fall_third'];
assert.ok(open(choice, 'fall_reach') && open(choice, 'fall_mana'), 'either side of a choice');
assert.ok(!open([...choice, 'fall_reach'], 'fall_mana') && open([...choice, 'fall_reach'], 'fall_reach'), 'one side shuts the other');
// Caps: a full node is closed.
assert.ok(open(['dmg', 'dmg'], 'dmg') && !open(['dmg', 'dmg', 'dmg'], 'dmg'), 'Ossa più dure stops at 3');

// Offers: one card a tree, the school cards abilities on the even levels to 10 when one is open; the Fusioni's card goes
// elsewhere at level 2 (not open yet); the heal only when every tree is shut.
for (let i = 0; i < 300; i++) {
  const o = offer(['step'], rnd, [], RIS, 3);
  assert.equal(o.length, 3);
  assert.deepEqual(o.map((c) => treeOf(c.id, RIS)), [0, 1, 2], `level 3: ${o.map((c) => c.id)}`);
  const e = offer([], rnd, [], RIS, 2);
  assert.ok(e[0].kind === 'ability' && e[2].kind === 'ability' && treeOf(e[1].id, RIS) !== 1, `level 2: ${e.map((c) => c.id)}`);
}
// New nodes weigh three times another rank: with Schegge affilate at rank 1 next to the new Balzo del sepolcro, the new one comes up more.
{
  let fresh = 0, again = 0;
  for (let i = 0; i < 6000; i++) { const c = offer(['fall_dmg'], rnd, [], RIS, 3)[0].id; if (c === 'leap') fresh++; if (c === 'fall_dmg') again++; }
  assert.ok(fresh > 2.4 * again && fresh < 3.6 * again, `new ${fresh} against another rank ${again}`);
}

// The build screen: a banked point buys an open node only, never an ability, and a whole build must fit the trees.
{
  const b = new Levels();
  b.xp = 1320; b.picks = ['leap', 'dmg']; b.banked = 2;
  assert.ok(spend(b, 'fall_third'), 'a closed node bought');
  assert.ok(spend(b, 'step'), 'an ability bought with a point');
  assert.equal(spend(b, 'fall_dmg'), undefined);
  assert.equal(spend(b, 'hp'), undefined);
  assert.deepEqual([b.picks, b.banked, budget(b)], [['leap', 'dmg', 'fall_dmg', 'hp'], 0, 7]);
  assert.ok(checkBuild({ ...b, picks: ['hp'] }, RIS), 'a build off the trees passes');
  assert.equal(checkBuild({ ...b, picks: ['hp'] }, RIS, false), undefined, 'a stored save is checked loosely: the load fits it');
}

// Migration: an older save fits, every point that no longer fits handed back; abilities and fillers stay; a fitted build fits unchanged.
{
  const old = ['fall_third', 'fall_third', 'fall_dmg', 'dmg', 'dmg', 'dmg', 'dmg', 'nova', 'potion_big', 'hp', 'health_potion_big', 'fall_reach', 'fall_mana', 'linfa', 'ossa_eterne', 'fx_shatter'];
  const f = fit(old, [], RIS, 20);
  assert.equal(f.picks.length + f.refunded, old.length, 'a point lost or made up');
  // the old Fiala capiente counts on both vials: with no Pozzo d'anime above the mana one it goes back too
  assert.deepEqual(f.picks, ['fall_dmg', 'dmg', 'dmg', 'dmg', 'nova', 'hp', 'health_potion_big', 'linfa', 'ossa_eterne']);
  assert.deepEqual(fit(f.picks, [], RIS, 20), { picks: f.picks, refunded: 0 }, 'fitting twice moved something');
  // a choice taken both ways keeps the side with more ranks
  assert.deepEqual(fit(['leap', 'fall_dmg', 'fall_third', 'fall_mana', 'fall_reach', 'fall_reach'], [], RIS, 20).picks, ['leap', 'fall_dmg', 'fall_third', 'fall_reach', 'fall_reach']);
  // every hero's random run, fitted, keeps everything (the offers only deal what fits)
  for (const id of HERO_IDS) {
    const h = HEROES[id], picks: string[] = [];
    for (let lv = 2; lv <= 40; lv++) { const o = offer(picks, rnd, h.kit, h.school, lv); if (o[0].id !== 'linfa') picks.push(o[Math.floor(rnd() * o.length)].id); }
    assert.equal(fit(picks, h.kit, h.school, 40).refunded, 0, `${id}'s dealt run does not fit`);
    assert.ok(picks.every((p) => CARD.get(p)!.kind === 'filler' || treeOf(p, h.school) >= 0), `${id} dealt a card off his trees`);
  }
}
console.log('talents ok: every card on one tree, parents, levels, tier points and choices gate the nodes, one card a tree with the kit pace, banked points buy open nodes only, older saves fitted with every point handed back');
