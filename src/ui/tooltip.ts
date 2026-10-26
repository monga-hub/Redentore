import { RARITY, type Item } from '../loot/bag.ts';
import { SLOT, STAT, sellPrice, type Stat, type Stats } from '../loot/gear.ts';

// The item tooltip, WoW style: name in its quality's colour, slot and item level, armor, white
// stats, green "Equipaggiato:" lines, the flavour line in gold italics, the sell price; beside it
// the piece worn in that slot, and under it what wearing this one would change, in green and red.
// Shared by the bag, the character sheet and Fra' Bortolo's shop (ui/bag.ts places it).

export const TIP_CSS = `
#bag .tip { position: fixed; z-index: 16; display: flex; flex-wrap: wrap; gap: 6px; align-items: flex-start; width: max-content;
  max-width: calc(100vw - 16px); pointer-events: none; }
#bag .tip[hidden] { display: none; }
#bag .tip.stack { flex-direction: column; }
#bag .tip .box { box-sizing: border-box; width: max-content; max-width: min(250px, calc(100vw - 16px)); padding: 8px 10px;
  background: var(--tip-bg); border: 2px solid var(--tip-border); border-radius: 5px; box-shadow: 0 0 0 1px #000, inset 0 0 0 1px rgba(0,0,0,.6), 0 4px 14px #000; }
#bag .tip .box.worn { opacity: .92; }
#bag .tip .head { display: block; margin-bottom: 4px; font: bold 10px/14px system-ui, sans-serif; color: #9a9fb8; text-transform: uppercase; letter-spacing: 1px; }
#bag .tip b { display: block; font: bold 14px/18px Georgia, serif; }
#bag .tip small { display: flex; justify-content: space-between; gap: 16px; font: 11px/15px system-ui, sans-serif; color: #fff; }
#bag .tip .w, #bag .tip .g { display: block; font: 12px/16px system-ui, sans-serif; color: #f3ecd8; }
#bag .tip .g { color: #3fd84a; }
#bag .tip p { margin: 6px 0 0; font: italic 12px/1.35 Georgia, serif; color: #e8dcc0; }
#bag .tip p.lore { color: #ffd75e; }
#bag .tip .price { margin-top: 6px; color: #e8dcc0; }
#bag .tip .diff { margin-top: 6px; padding-top: 5px; border-top: 1px solid rgba(154,159,184,.35); font: 11px/15px system-ui, sans-serif; color: #c9cde0; }
#bag .tip .diff i { font-style: normal; white-space: nowrap; margin-right: 6px; }
#bag .tip .up { color: #3fd84a; } #bag .tip .down { color: #ff5a4a; }
#bag .tip .hint { display: block; margin-top: 6px; font: italic 11px/15px system-ui, sans-serif; color: #ffd75e; }
#bag .tip .hint.no { color: #ff5a4a; }
`;

const coin = (n: number) => `${n.toLocaleString('it-IT')} oro`;
const KEYS: (Stat | 'armatura')[] = ['armatura', 'vigore', 'intelletto', 'spirito', 'potenza', 'critico', 'celerita'];
const label = (k: Stat | 'armatura', v: number) => (k === 'armatura' ? `${v} Armatura` : STAT[k].green ? `${v}% ${STAT[k].name}` : `${v} ${STAT[k].name}`);

let leaf = 0; // Il libro di sabbia's page last shown: the next opening turns another

/** One item's box. `n`: how many in the stack. */
function box(it: Item, n = 1, head = ''): string {
  const r = RARITY[it.rarity], s: Stats = it.stats ?? {};
  let html = `${head ? `<span class="head">${head}</span>` : ''}<b style="color: ${r.color}">${it.name}</b>`;
  if (it.slot) {
    html += `<small><span>${SLOT.get(it.slot)!.name}</span><span>${r.name}</span></small><small><span>Livello oggetto ${it.ilvl}</span></small>`;
    for (const k of KEYS) {
      const v = s[k];
      if (!v) continue;
      const g = k !== 'armatura' && STAT[k].green;
      html += g ? `<span class="g">Equipaggiato: ${g.replace('#', String(v))}</span>` : `<span class="w">${k === 'armatura' ? '' : '+'}${label(k, v)}</span>`;
    }
    const lore = it.pages ? it.pages[leaf++ % it.pages.length] : it.lore;
    if (lore) html += `<p class="lore">«${lore}»</p>`;
  } else html += `<small><span>${r.name}${n > 1 ? ` · ${n} pezzi` : ''}</span></small><p>${it.lore}</p>`;
  return html + `<small class="price"><span>Prezzo di vendita: ${coin(sellPrice(it) * n)}</span></small>`;
}

/** What wearing `it` instead of `worn` changes, stat by stat. */
function diff(it: Item, worn?: Item): string {
  const a: Stats = it.stats ?? {}, b: Stats = worn?.stats ?? {};
  const parts = KEYS.flatMap((k) => {
    const d = (a[k] ?? 0) - (b[k] ?? 0);
    return d ? [`<i class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${label(k, Math.abs(d))}</i>`] : [];
  });
  return `<div class="diff">Se lo indossi: ${parts.join(' ') || 'nessuna differenza'}</div>`; // spaces: the line wraps between changes
}

/**
 * The tooltip's HTML. `worn`: the piece worn in that slot (compared beside, and the changes listed);
 * `price`: a shop line instead of the sell price; `hint`: what a click does (`no`: it can't).
 */
export function itemTip(it: Item, o: { n?: number; worn?: Item | null; price?: string; hint?: string; no?: boolean } = {}): string {
  let main = box(it, o.n);
  if (o.price) main = main.replace(/<small class="price">.*<\/small>$/, `<small class="price"><span>${o.price}</span></small>`);
  if (it.slot && o.worn !== null) main += diff(it, o.worn);
  if (o.hint) main += `<span class="hint${o.no ? ' no' : ''}">${o.hint}</span>`;
  return `<div class="box">${main}</div>` + (o.worn ? `<div class="box worn">${box(o.worn, 1, 'Indossato')}</div>` : '');
}
