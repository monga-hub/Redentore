import assert from 'node:assert/strict';
import { HERO_IDS } from '../src/player/heroes.ts';
import { ARMOR_SLOTS, GEAR, componentId, isLegacyArmor, shop2 } from '../src/loot/gear.ts';
import { createServer } from 'vite';
import { Vector3 } from 'three';
import { Quest } from '../src/quest/progress.ts';
import { GIVERS } from '../src/quest/squero.ts';
import { World } from '../src/core/physics.ts';
import type { QuestView as View } from '../src/quest/view.ts';
import type { Priest } from '../src/enemies/caster.ts';

// Vite supplies import.meta.env for the real dialogue caller, without rendering WebGL.
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { QuestView } = await vite.ssrLoadModule('/src/quest/view.ts') as typeof import('../src/quest/view.ts');

  // Iseppo's two placements must select their own chapter for every hero.
  for (const hero of HERO_IDS) for (const chapter of [2, 3, 2] as const) for (const unlocked3 of [false, true]) {
    const q = new Quest(new World());
    q.accepted2 = true; q.accepted3 = unlocked3;
    const giver = chapter === 3 ? 'riva' : 'iseppo', at = GIVERS[giver].at;
    const player = new Vector3(at.x, 0, at.z + 1);
    assert.equal(q.prompt(player)?.talk, giver);
    let selected: 2 | 3 = 2;
    const shown = new Error('dialogue shown');
    const view = Object.assign(Object.create(QuestView.prototype), {
      quest: q, news: [], hero: new Vector3(), givers: { iseppo: {}, riva: {} },
      shop2: (chapter: 2 | 3 = 2) => { selected = chapter; },
      // Activate the actual Commercia callback; stop before unrelated rendering updates.
      talk: { show: (_speaker: unknown, _greeting: unknown, _entries: unknown, trade?: () => void) => { trade?.(); throw shown; } },
    }) as View;
    assert.throws(() => view.update(0, player, code => code === 'KeyF', {} as Priest), err => err === shown);
    assert.equal(selected, chapter, `${giver}: stock follows placement even with accepted3=${unlocked3}`);
    const goods = shop2(hero, selected);
    const components = goods.filter(it => it.component);
    assert.deepEqual(components.map(it => it.id).sort(),
      (['comune', 'noncomune', 'raro'] as const).flatMap(rarity =>
        ARMOR_SLOTS.map(part => componentId(hero, chapter, rarity, part))).sort(), `${hero}: chapter ${chapter} components`);
    assert(goods.every(it => !isLegacyArmor(it) && it.slot !== 'abito'));
    const equipment = goods.filter(it => it.slot);
    const expected = GEAR.filter(it => it.slot && !isLegacyArmor(it) && it.slot !== 'abito'
      && it.rarity === 'epico' && !it.unique && (chapter === 3 ? !it.l2 : it.l2));
    assert.deepEqual(equipment, expected, `${hero}: chapter ${chapter} equipment and stats`);
    assert(equipment.length > 0);
    // No sticky third-chapter stock on reopening the squero after a trip to San Giorgio.
    assert.deepEqual(shop2(hero), shop2(hero, 2));
  }
} finally { await vite.close(); }
console.log('Iseppo stock ok: actual prompt/dialogue trade route, both chapters and back, unlocked3 false/true, all five heroes, 18 owned non-epic components each, original equipment/stats/prices');
