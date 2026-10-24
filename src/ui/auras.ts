// What the nameplates (ui/plates.ts) and the hero's aura row show, WoW style, read straight off the rules' state: the
// hero's poison doses, burning, candles, fever and crowd control on a foe (abilities/grimoire.ts, enemies/control.ts),
// the spell a caster is casting (enemies/caster.ts), and the hero's own buffs (player/stats.ts, the grimoire, Fra'
// Bortolo's blessing). Nothing here changes a thing. No DOM and no three.js: `npm run check` drives it (check-plates.ts).
import { APE, PRIEST, REVERENDISSIMO, SACERDOTE, type CasterKind } from '../enemies/caster.ts';
import type { Control } from '../enemies/control.ts';
import { CODEGA, GASTALDO, GOVERNATRICE, MAESTRA, VELO, ZITELLA } from '../enemies/zitelle.ts';

/** The school colours an aura's border, WoW's debuff-type colours. */
export type School = 'poison' | 'fire' | 'frost' | 'holy' | 'shadow';
/** One icon: `icon` from ui/icons.ts, `t` s left (Infinity: while it lasts), `n` stacks or charges. */
export interface Aura { icon: string; name: string; school: School; t: number; n?: number }

/** What the grimoire keeps per foe: poison doses and Cero funebre's candles. */
export interface Marks { poisons: ReadonlyMap<object, { n: number; t: number }>; candles: ReadonlyMap<object, { t: number }> }

/** The hero's damage first, then the control: the order WoW keeps your own debuffs in. */
export function foeAuras(m: { cc?: Control }, g: Marks): Aura[] {
  const out: Aura[] = [], c = m.cc, p = g.poisons.get(m), k = g.candles.get(m);
  if (p) out.push({ icon: 'spit', name: 'Veleno', school: 'poison', t: p.t, n: p.n });
  if (c && c.burn > 0) out.push({ icon: 'pyre', name: 'In fiamme', school: 'fire', t: c.burn });
  if (k) out.push({ icon: 'cero', name: 'Cero funebre', school: 'fire', t: k.t });
  if (c && c.vuln > 0) out.push({ icon: 'fever', name: 'Febbre di palude', school: 'poison', t: c.vuln });
  if (c && c.stun > 0) out.push({ icon: 'hammer', name: 'Stordito', school: 'holy', t: c.stun });
  if (c && c.root > 0) out.push({ icon: 'font', name: 'Congelato', school: 'frost', t: c.root });
  if (c && c.slow > 0) out.push({ icon: 'frost', name: 'Rallentato', school: 'frost', t: c.slow });
  return out;
}

/** Any of `foeAuras` on `m`, without building them. */
export const marked = (m: { cc?: Control }, g: Marks) =>
  g.poisons.has(m) || g.candles.has(m) || (!!m.cc && (m.cc.burn > 0 || m.cc.vuln > 0 || m.cc.stun > 0 || m.cc.root > 0 || m.cc.slow > 0));

/** A cast bar: `t` s into `total`; a channel drains instead of filling. */
export interface Cast { name: string; icon: string; t: number; total: number; channel?: boolean }

type Spell = [name: string, icon: string];
const SHADOW: Spell = ["Dardo d'ombra", 'strike'];
const BOLT = new Map<CasterKind, Spell>([
  [PRIEST, SHADOW], [SACERDOTE, SHADOW], [REVERENDISSIMO, SHADOW],
  [CODEGA, ['Fuoco fatuo', 'wisp']], [ZITELLA, ['Filo della rocca', 'rosary']], [VELO, ['Filo della rocca', 'rosary']],
  [MAESTRA, ['Filo di merletto', 'rosary']], [GOVERNATRICE, ['Filo di merletto', 'rosary']],
]);
const NOVA = new Map<CasterKind, Spell>([
  [SACERDOTE, ["Anello d'ombra", 'nova']], [REVERENDISSIMO, ["Nova d'ombra", 'nova']], [APE, ['Sciame velenoso', 'plague']], [GASTALDO, ['Vortice del remo', 'whirl']],
]);

/** What a caster is casting now: its bolt, its nova, the Governatrice's fuso; nothing for a friar or a swing. */
export function castOf(m: { state: string; t?: number; kind?: CasterKind }): Cast | undefined {
  const k = m.kind, t = m.t ?? 0;
  if (!k) return undefined;
  if (m.state === 'cast') { const [name, icon] = BOLT.get(k) ?? SHADOW; return { name, icon, t, total: k.cast }; }
  if (m.state === 'nova' && k.nova) { const [name, icon] = NOVA.get(k) ?? ["Nova d'ombra", 'nova']; return { name, icon, t, total: k.nova.cast }; }
  if (m.state === 'spin' && k.spin) return { name: 'Il fuso', icon: 'whirl', t, total: k.spin.time, channel: true };
  return undefined;
}

/** What the hero's buffs are read from. `aureola`: the immunity is Aureola del redento's, not Patto della tomba's. */
export interface Hero {
  bless: { name: string; left: number };
  veil: number; immune: number; aureola: boolean;
  sparks: number; sparkT: number;
  wisp: number;
  /** s left of the consecrated ground the hero stands on, 0 off it. */
  hallow: number;
}

export function heroAuras(h: Hero): Aura[] {
  const out: Aura[] = [];
  if (h.bless.left > 0) out.push({ icon: 'ruta', name: h.bless.name, school: 'poison', t: h.bless.left });
  if (h.immune > 0) out.push(h.aureola ? { icon: 'bubble', name: 'Aureola del redento', school: 'holy', t: h.immune } : { icon: 'ward', name: 'Patto della tomba', school: 'holy', t: h.immune });
  if (h.veil > 0) out.push({ icon: 'veil', name: 'Velo spettrale', school: 'shadow', t: h.veil });
  if (h.sparks > 0) out.push({ icon: 'shield', name: 'Scudo di saette', school: 'frost', t: h.sparkT, n: h.sparks });
  if (h.hallow > 0) out.push({ icon: 'hallow', name: 'Terra consacrata', school: 'holy', t: h.hallow });
  if (h.wisp > 0) out.push({ icon: 'wisp', name: 'Fuoco fatuo', school: 'frost', t: h.wisp });
  return out;
}

/** WoW's timer on an icon: whole seconds, minutes from one up ("4m"). */
export const clock = (t: number) => (t === Infinity ? '' : t >= 60 ? `${Math.ceil(t / 60)}m` : `${Math.ceil(t)}`);
