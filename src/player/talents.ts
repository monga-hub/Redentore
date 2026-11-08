import { BASE_ATTACK, CARD, FILLERS, SPECIALS, counter, eligible, tuneOf, type Card, type School } from './levels.ts';

// The talent trees: every point a level-up or the build screen spends goes on a node of one of three trees side by side, the
// hero's primary school, the Fusioni (the cards of no school and his two schools' fusion) and his secondary school.
// A school tree hangs from its medal (given): the base attack and the three mana abilities fan out of it, their upgrades
// below; the two specials each hang from two paths, a centre node from two more, so paths merge and cross (`TEMPLATE`). A
// node opens when a parent has a rank (an ability: owned), the tree's level is reached and the rows above its tier hold enough of
// the tree's points (`GATE`); a choice node takes one of its two cards, never both. Abilities are nodes too, permanent: a
// level-up teaches them, a tome lights them for free, a reset never takes them back. Each level-up offers one card a tree,
// drawn among its open nodes (a node never taken weighs 3, another rank 1), so the offers move down the trees (`offer`).
// Saves from before the trees fit into them (`fit`): what no longer fits is refunded as points to spend again.
// No DOM and no three.js: scripts/check-talents.ts drives it in Node.

/** A node: one card (or two for a choice), its place on the tree's grid and the nodes above it that open it. */
export interface TalentNode { key: string; ids: string[]; row: number; col: number; parents: string[]; granted?: boolean }
export type TreeKind = 'primary' | 'fusion' | 'secondary';
export interface Tree { kind: TreeKind; school?: School; cols: number; level: number; nodes: TalentNode[] }

type Role = 'ROOT' | 'BASE' | 'Bd' | 'Bt' | 'BC' | 'A1' | 'A1a' | 'A1b' | 'A2' | 'A2a' | 'A2b' | 'A3' | 'A3a' | 'A3b' | 'S1' | 'S1a' | 'S1b' | 'S2' | 'S2a' | 'S2b' | 'X' | 'Y';
/** A school tree's grid: [slot, row, column, the slots above it]. Rows 1-3 open, 4-5 and 6-7 behind `GATE`. */
const TEMPLATE: [Role, number, number, Role[]][] = [
  ['ROOT', 1, 4, []],
  ['BASE', 2, 1, ['ROOT']], ['A1', 2, 3, ['ROOT']], ['A2', 2, 5, ['ROOT']], ['A3', 2, 7, ['ROOT']],
  ['Bd', 3, 1, ['BASE']], ['A1a', 3, 3, ['A1']], ['A2a', 3, 5, ['A2']], ['A3a', 3, 7, ['A3']],
  ['Bt', 4, 1, ['Bd']], ['S1', 4, 2, ['Bd', 'A1a']], ['A1b', 4, 3, ['A1a']], ['A2b', 4, 5, ['A2a']], ['S2', 4, 6, ['A2a', 'A3a']], ['A3b', 4, 7, ['A3a']],
  ['BC', 5, 1, ['Bt']], ['X', 5, 4, ['A1b', 'A2b']],
  ['S1a', 6, 2, ['S1']], ['Y', 6, 4, ['X']], ['S2a', 6, 6, ['S2']],
  ['S1b', 7, 2, ['S1a']], ['S2b', 7, 6, ['S2a']],
];
const base = (s: School): Partial<Record<Role, string | string[]>> => {
  const b = BASE_ATTACK[s];
  return { BASE: b, Bd: `${b}_dmg`, Bt: `${b}_third`, BC: b === 'fall' ? ['fall_reach', 'fall_mana'] : [`${b}_split`, `${b}_mana`] };
};
/** Each school's cards in the template's slots; an empty slot hands its parents down to its children. */
const ROLES: Record<School, Partial<Record<Role, string | string[]>>> = {
  bone: { ...base('bone'), A1: 'leap', A1a: 'leap_big', A1b: 'leap_cd', A2: 'whirl', A2a: 'whirl_dmg', A2b: 'whirl_long', A3: 'grace', A3a: 'grace_mul', A3b: 'grace_cd', S1: 'strike', S1a: 'strike_dmg', S2: 'nova', S2a: 'nova_big' },
  shadow: { ...base('shadow'), A1: 'step', A1a: 'step_dmg', A1b: 'step_cd', A2: 'charge', A2a: 'charge_stun', A2b: 'charge_cd', A3: 'drain', A3a: 'drain_deep', S1: 'veil', S1a: 'veil_long', S1b: 'veil_heal', S2: 'ward', S2a: 'ward_long' },
  frost: { ...base('frost'), A1: 'frost', A1a: 'frost_deep', A1b: 'frost_fast', A2: 'caligo', A2a: 'caligo_big', A2b: 'caligo_freeze', A3: 'blizzard', A3a: 'blizzard_big', S1: 'font', S1a: 'font_cd', S1b: 'font_long', S2: 'orb', S2a: 'orb_slow' },
  storm: { ...base('storm'), A1: 'chain', A1a: 'chain_long', A1b: 'chain_fast', A2: 'toll', A2a: 'toll_big', A2b: 'toll_long', A3: 'shield', A3a: 'shield_more', S1: 'rod', S1a: 'rod_long', S2: 'squall', S2a: 'squall_big' },
  plague: { ...base('plague'), A1: 'spit', A1a: 'spit_twin', A2: 'plague', A2a: 'plague_dps', A2b: 'plague_size', X: 'plague_long', Y: 'plague_cd', A3: 'untore', A3a: 'untore_far', S1: 'miasma', S1a: 'miasma_more', S2: 'fever', S2a: 'fever_deep' },
  fire: { ...base('fire'), A1: 'pyre', A1a: 'pyre_big', A1b: 'pyre_fast', A2: 'wisp', A2a: 'wisp_dps', A2b: 'wisp_still', X: 'wisp_fast', A3: 'cero', A3a: 'cero_chain', S1: 'pillar', S1a: 'pillar_big', S2: 'furnace', S2a: 'furnace_hot' },
  holy: { ...base('holy'), A1: 'judge', A1a: 'judge_dmg', A2: 'mend', A3: 'hallow', A3a: 'hallow_big', S1: 'hammer', S1a: 'hammer_cd', S2: 'bubble', S2a: 'bubble_cd' },
};
/** The root of a school tree: its medal, given with the school. */
export const ROOT = (s: School) => `root_${s}`;
function schoolTree(s: School, kind: TreeKind): Tree {
  const roles: Partial<Record<Role, string | string[]>> = { ...ROLES[s], ROOT: ROOT(s) }, slot = new Map(TEMPLATE.map((t) => [t[0], t]));
  const resolve = (r: Role): Role[] => (roles[r] !== undefined ? [r] : slot.get(r)![3].flatMap(resolve));
  const nodes = TEMPLATE.filter(([r]) => roles[r] !== undefined).map(([r, row, col, ps]): TalentNode => {
    const v = roles[r]!, ids = Array.isArray(v) ? v : [v];
    return { key: `${s}:${r}`, ids, row, col, parents: [...new Set(ps.flatMap(resolve))].map((p) => `${s}:${p}`), granted: r === 'ROOT' || ids[0] === 'mend' };
  });
  return { kind, school: s, cols: 7, level: 2, nodes };
}
/** The fusion of a hero's two schools: the Fusioni tree's capstone. */
export const FUSION: Record<string, string> = {
  'bone+shadow': 'fx_stepbone', 'frost+storm': 'fx_frostchain', 'plague+holy': 'fx_venomcloud', 'fire+holy': 'fx_holyfire', 'storm+bone': 'fx_stormwhirl',
};
function fusionTree(schools: readonly School[]): Tree {
  const n = (key: string, ids: string[], row: number, col: number, parents: string[]): TalentNode => ({ key: `fusion:${key}`, ids, row, col, parents: parents.map((p) => `fusion:${p}`) });
  const fx = FUSION[`${schools[0]}+${schools[1]}`];
  return { kind: 'fusion', cols: 3, level: 3, nodes: [
    n('dmg', ['dmg'], 1, 2, []),
    n('hp', ['hp'], 2, 1, ['dmg']), n('speed', ['speed'], 2, 2, ['dmg']), n('mana', ['mana'], 2, 3, ['dmg']),
    n('hpb', ['health_potion_big'], 3, 1, ['hp']), n('cdr', ['cdr'], 3, 2, ['speed']), n('mpb', ['mana_potion_big'], 3, 3, ['mana']),
    n('tough', ['armor', 'leech'], 4, 1, ['hpb', 'cdr']), n('fury', ['fury'], 4, 2, ['cdr']), n('regen', ['regen'], 4, 3, ['mpb', 'cdr']),
    n('hpc', ['health_potion_cd'], 5, 1, ['tough']), n('rancore', ['fury_start'], 5, 2, ['fury']), n('mpc', ['mana_potion_cd'], 5, 3, ['regen']),
    ...(fx ? [n('fusion', [fx], 6, 2, ['hpc', 'rancore', 'mpc'])] : []),
  ] };
}
const cache = new Map<string, Tree[]>();
/** A hero's three trees: primary school, Fusioni, secondary school. */
export function treesOf(schools: readonly School[]): Tree[] {
  const k = schools.join('+');
  if (!cache.has(k)) cache.set(k, [schoolTree(schools[0], 'primary'), fusionTree(schools), schoolTree(schools[1], 'secondary')]);
  return cache.get(k)!;
}
/** Points a tier asks of the rows above it: a school tree's rows 4-5 two, 6-7 six; the Fusioni's 4-5 two, its capstone five. */
export const GATE = { school: [[4, 2], [6, 6]], fusion: [[4, 2], [6, 5]] } as const;
const gateOf = (t: Tree, row: number): [number, number] => {
  const g = (t.kind === 'fusion' ? GATE.fusion : GATE.school).filter(([r]) => row >= r).at(-1);
  return g ? [g[0], g[1]] : [1, 0];
};
/** The legacy potion ranks a node's count folds in (levels.ts `counter`), dropped after the node's own when it is over. */
const LEGACY: Record<string, string> = { health_potion_big: 'potion_big', mana_potion_big: 'potion_big', health_potion_cd: 'potion_cd', mana_potion_cd: 'potion_cd' };

/** Everything the trees ask of a build: picks (abilities and ranks), the abilities learnt free (kit and tomes), the level. */
export function talents(picks: readonly string[], learned: readonly string[], schools: readonly School[], lv: number) {
  const trees = treesOf(schools), count = counter(picks), owned = tuneOf(picks, learned, schools).owned, owns = (a: string) => owned.includes(a);
  const byKey = new Map(trees.flatMap((t) => t.nodes.map((n) => [n.key, n] as const)));
  const ok = new Set(eligible(picks, learned, schools).map((c) => c.id));
  const ability = (id: string) => !CARD.has(id) || CARD.get(id)!.kind === 'ability'; // the base attacks and the heal have no card
  /** A node's rank: given 1, an ability 1 if owned (picked, learnt or a base attack come), else the picks of its card(s). */
  const rank = (n: TalentNode) => (n.granted ? 1 : n.ids.reduce((a, id) => a + (ability(id) ? (owns(id) ? 1 : 0) : count(id)), 0));
  /** Points spent in tree `t` (on rows above `row`): its picks only, the kit and the tomes are free. */
  const spent = (t: Tree, row = Infinity) => t.nodes.reduce((a, n) => a + (n.row < row ? n.ids.reduce((b, id) => b + (ability(id) ? (picks.includes(id) ? 1 : 0) : count(id)), 0) : 0), 0);
  /** Why node `n` of tree `t` can't hold `id` now (its place: level, tier, parents, the choice), or '' if it can. */
  const blocked = (t: Tree, n: TalentNode, id: string): string => {
    if (lv < t.level) return `Livello ${t.level}`;
    const [r, need] = gateOf(t, n.row);
    if (spent(t, r) < need) return `${need} punti nelle righe sopra`;
    if (n.parents.length && !n.parents.some((p) => rank(byKey.get(p)!) > 0)) return `Prima: ${n.parents.map((p) => byKey.get(p)!.ids.map(nameOf).join(' o ')).join(' o ')}`;
    if (n.ids.length > 1 && n.ids.some((o) => o !== id && count(o) > 0)) return 'Hai scelto l’altro effetto';
    if (SPECIALS.includes(id) && lv < 6) return 'Livello 6';
    return '';
  };
  /** Can `id` on node `n` take a point now? */
  const open = (t: Tree, n: TalentNode, id: string) => !n.granted && ok.has(id) && !blocked(t, n, id);
  /** Every card open now, with its tree's index. */
  const options = (ti: number) => trees[ti].nodes.flatMap((n) => n.ids.filter((id) => open(trees[ti], n, id)).map((id) => ({ tree: ti, card: CARD.get(id)! })));
  return { trees, count, owns, rank, spent, blocked, open, options, ability };
}
/** A node card's name, the base attacks and the heal (no cards) too. */
export const nameOf = (id: string) => CARD.get(id)?.name ?? ({ fall: "Caduta d'ossa", lance: 'Stiletto di ghiaccio', thorn: 'Spina di peste', umbra: "Strale d'ombra", ember: 'Tizzone', spark: 'Folgore', smite: 'Castigo', mend: 'Preghiera di suffragio' } as Record<string, string>)[id] ?? id;

/** The tree (0 primary, 1 Fusioni, 2 secondary) holding card `id` for a hero of `schools`, or -1. */
export const treeOf = (id: string, schools: readonly School[]) => treesOf(schools).findIndex((t) => t.nodes.some((n) => n.ids.includes(id)));
/** The most points tree `t` takes, the kit's abilities apart. */
export const treeMax = (t: Tree, kit: readonly string[] = []) => t.nodes.reduce((a, n) => a + (n.granted || !n.ids.some((id) => CARD.has(id)) || kit.includes(n.ids[0]) ? 0 : Math.max(...n.ids.map((id) => CARD.get(id)!.max))), 0);

/**
 * The three cards of level-up `lv`: one a tree, drawn among the nodes open there (a node never taken weighs 3, another rank
 * 1). On the even levels up to 10 a school tree's card is a new ability if it has one open (at 6 and 8 the primary's a special
 * when one is), the kit's pace. A tree with nothing open hands its card to the others, and the heal fills in past them.
 */
export function offer(picks: readonly string[], rnd: () => number = Math.random, learned: readonly string[] = [], schools: readonly School[], lv = picks.length + 2): Card[] {
  const T = talents(picks, learned, schools, lv), out: Card[] = [];
  const draw = (from: Card[]) => {
    const left = from.filter((c) => !out.includes(c));
    if (!left.length) return false;
    const w = left.map((c) => (T.count(c.id) ? 1 : 3));
    let r = rnd() * w.reduce((a, b) => a + b, 0), i = 0;
    while (i < left.length - 1 && (r -= w[i]) >= 0) i++;
    out.push(left[i]);
    return true;
  };
  const all = [0, 1, 2].map((ti) => T.options(ti).map((o) => o.card));
  for (const ti of [0, 1, 2]) {
    let pool = all[ti];
    if (ti !== 1 && lv % 2 === 0 && lv <= 10) {
      const ab = pool.filter((c) => c.kind === 'ability'), sp = ab.filter((c) => c.tier === 'B');
      pool = ti === 0 && (lv === 6 || lv === 8) && sp.length ? sp : ab.length ? ab : pool;
    }
    if (!draw(pool) && !draw(all.filter((_, k) => k !== ti).flat())) draw(FILLERS);
  }
  return out;
}

/**
 * A save's picks fitted into the trees (`learned`: kit and tomes, `lv` its level): ranks past a card's cap, the lesser side of
 * a choice taken both ways (on a tie the later), then, deepest first, a rank whose node lost its parents or its tier's points
 * (or an upgrade on no tree of his) are dropped, each a point refunded to spend again. Abilities and the fillers always stay. Order is kept;
 * a fitted build fits unchanged.
 */
export function fit(picks: readonly string[], learned: readonly string[], schools: readonly School[], lv: number): { picks: string[]; refunded: number } {
  const kept = [...picks];
  let refunded = 0;
  const drop = (id: string) => {
    const i = kept.lastIndexOf(kept.includes(id) ? id : LEGACY[id]);
    if (i < 0) return false;
    kept.splice(i, 1);
    refunded++;
    return true;
  };
  for (let guard = picks.length + 1; guard-- > 0;) {
    const T = talents(kept, learned, schools, lv), placed = new Set(T.trees.flatMap((t) => t.nodes.flatMap((n) => n.ids)));
    const stray = kept.find((id) => CARD.has(id) && !T.ability(id) && CARD.get(id)!.kind !== 'filler' && !placed.has(id));
    if (stray && drop(stray)) continue;
    let worst: { id: string; row: number } | undefined, fixed = false;
    for (const t of T.trees) for (const n of t.nodes) {
      if (fixed || n.granted) continue;
      const held = n.ids.filter((id) => !T.ability(id) && T.count(id) > 0);
      const over = held.find((id) => T.count(id) > CARD.get(id)!.max);
      if (over) { fixed = drop(over); continue; }
      if (held.length > 1) { // both sides of a choice: the one with fewer ranks goes, on a tie the one picked later
        const [a, b] = held, lose = T.count(a) !== T.count(b) ? (T.count(a) < T.count(b) ? a : b) : (kept.indexOf(a) > kept.indexOf(b) ? a : b);
        fixed = drop(lose);
        continue;
      }
      for (const id of held) {
        const c = CARD.get(id)!, bad = T.blocked(t, n, id) || (c.of && !T.owns(c.of)) || (c.needs && !c.needs(T.count, T.owns));
        if (bad && (!worst || n.row > worst.row)) worst = { id, row: n.row };
      }
    }
    if (fixed) continue;
    if (!worst || !drop(worst.id)) break;
  }
  return { picks: kept, refunded };
}
