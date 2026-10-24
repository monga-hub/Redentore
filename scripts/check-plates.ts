// Nameplate check (`npm run check`): the icons over a foe come off the grimoire and its control in WoW's order (the hero's
// damage, then the control) with the poison's doses; a caster's bar names its spell and drains for the fuso; the hero's
// buffs tell Aureola from Patto della tomba; the timers read like WoW's.
import { castOf, clock, foeAuras, heroAuras, marked } from '../src/ui/auras.ts';
import { control, chill, expose, root } from '../src/enemies/control.ts';
import { PRIEST, REVERENDISSIMO } from '../src/enemies/caster.ts';
import { GOVERNATRICE } from '../src/enemies/zitelle.ts';

const fail = (why: string) => { throw new Error(why); };
const foe = { cc: control() }, other = { cc: control() };
const g = { poisons: new Map([[foe, { n: 3, t: 6.2 }]]), candles: new Map([[foe, { t: 2 }]]) };
foe.cc.burn = 4;
expose(foe.cc, 12, 0.2);
root(foe.cc, 3);
chill(foe.cc, 6, 0.5);
const a = foeAuras(foe, g);
if (a.map((x) => x.icon).join() !== 'spit,pyre,cero,fever,font,frost') fail(`foe auras in the wrong order: ${a.map((x) => x.icon)}`);
if (a[0].n !== 3 || a[0].t !== 6.2) fail('poison doses and time lost');
if (foeAuras(other, g).length || marked(other, g) || !marked(foe, g)) fail('a clean foe shows auras');

if (castOf({ state: 'cast', t: 0.4, kind: PRIEST })?.name !== "Dardo d'ombra") fail('priest bolt unnamed');
if (castOf({ state: 'nova', t: 1, kind: REVERENDISSIMO })?.total !== REVERENDISSIMO.nova!.cast) fail('nova bar length');
if (!castOf({ state: 'spin', t: 1, kind: GOVERNATRICE })?.channel) fail('the fuso is a channel');
if (castOf({ state: 'swing', t: 0.2, kind: PRIEST }) || castOf({ state: 'chase', t: 0 })) fail('a cast bar with nothing cast');

const hero = { bless: { name: 'B', left: 0 }, veil: 0, immune: 4, aureola: true, sparks: 2, sparkT: 15, wisp: 0, hallow: 0 };
if (heroAuras(hero).map((x) => x.icon).join() !== 'bubble,shield' || heroAuras(hero)[1].n !== 2) fail('hero buffs');
if (heroAuras({ ...hero, aureola: false })[0].icon !== 'ward') fail('Patto della tomba shown as Aureola');
if (clock(5.2) !== '6' || clock(240) !== '4m' || clock(Infinity) !== '') fail('timer text');
console.log('nameplates ok');
