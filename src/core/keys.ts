// Rebindable keys (the menu's "Comandi"): movement and the action bar's ten slots. The game keeps reading its
// default codes (KeyW, Digit1, ...); core/input.ts runs each physical key through `translate` first, so a key the
// player bound stands in for its action's first default, and a default the player moved away does nothing.
// System keys (Esc, Tab, Invio, M, B, C, K, F) are never taken. Persisted in localStorage like the style;
// no DOM here, so `npm run check` exercises it in Node (scripts/check-keys.ts).

export interface Action { id: string; name: string; keys: readonly string[] }

/** Each action and its default keys; the first is the code the game reads, the others alternatives. */
export const ACTIONS: readonly Action[] = [
  { id: 'avanti', name: 'Avanti', keys: ['KeyW', 'ArrowUp'] },
  { id: 'indietro', name: 'Indietro', keys: ['KeyS', 'ArrowDown'] },
  { id: 'sinistra', name: 'Sinistra', keys: ['KeyA', 'ArrowLeft'] },
  { id: 'destra', name: 'Destra', keys: ['KeyD', 'ArrowRight'] },
  { id: 'gira-sx', name: 'Gira la camera a sinistra', keys: ['KeyQ'] },
  { id: 'gira-dx', name: 'Gira la camera a destra', keys: ['KeyE'] },
  { id: 'salta', name: 'Salta', keys: ['Space'] },
  { id: 'cammina', name: 'Cammina (tieni premuto)', keys: ['ShiftLeft', 'ShiftRight'] },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ id: `barra${n}`, name: n === 1 ? 'Barra 1 · attacco primario' : `Barra ${n}`, keys: [`Digit${n}`] })),
  { id: 'pozione', name: 'Barra · pozione', keys: ['KeyR'] },
];
/** The action of each action-bar slot, as abilities/system.ts KEYS. */
export const SLOT_ACTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `barra${n}`).concat('pozione');
/** Keys the menus, the panels and the quests read as they are: never bound. Backspace and Canc clear a key in the menu. */
export const RESERVED = new Set(['Escape', 'Tab', 'Enter', 'NumpadEnter', 'KeyM', 'KeyB', 'KeyC', 'KeyK', 'KeyF', 'Backspace', 'Delete']);

/** action id -> its keys, one per default ('' = none). */
export type Bindings = Record<string, string[]>;

const STORE = 'redentore.keys';
const ALL_DEFAULTS = new Set(ACTIONS.flatMap((a) => a.keys));

export const defaults = (): Bindings => Object.fromEntries(ACTIONS.map((a) => [a.id, [...a.keys]]));

/** The stored bindings if sound (each action its count of keys, none reserved, no key twice), otherwise the defaults. */
export function load(store?: Storage): Bindings {
  let raw: unknown;
  try { raw = JSON.parse((store ?? localStorage).getItem(STORE) ?? 'null'); } catch { /* blocked storage or junk */ }
  const b = defaults();
  if (!raw || typeof raw !== 'object') return b;
  for (const a of ACTIONS) {
    const k = (raw as Record<string, unknown>)[a.id];
    if (Array.isArray(k) && k.length === a.keys.length && k.every((c) => typeof c === 'string' && !RESERVED.has(c))) b[a.id] = k;
  }
  const used = Object.values(b).flat().filter(Boolean);
  return new Set(used).size === used.length ? b : defaults();
}

export function save(b: Bindings, store?: Storage): void {
  try { (store ?? localStorage).setItem(STORE, JSON.stringify(b)); } catch { /* not persisted, still applied */ }
}

/** Where `code` is bound, if anywhere. */
export function find(b: Bindings, code: string): { id: string; slot: number } | undefined {
  for (const a of ACTIONS) { const slot = b[a.id].indexOf(code); if (code && slot >= 0) return { id: a.id, slot }; }
  return undefined;
}

/**
 * `code` on action `id`'s `slot` ('' clears it). A key another action holds swaps over: that one takes this slot's old key.
 * Returns the new bindings and a line for the player (a refusal leaves `b` as it was).
 */
export function rebind(b: Bindings, id: string, slot: number, code: string): { b: Bindings; note: string } {
  if (RESERVED.has(code)) return { b, note: `${label(code)} è riservato al gioco: scegli un altro tasto.` };
  const next: Bindings = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, [...v]]));
  const old = next[id][slot], at = find(b, code);
  next[id][slot] = code;
  if (at && (at.id !== id || at.slot !== slot)) {
    next[at.id][at.slot] = old;
    const other = ACTIONS.find((a) => a.id === at.id)!.name;
    return { b: next, note: old ? `${label(code)} era su «${other}»: ora quello usa ${label(old)}.` : `${label(code)} tolto da «${other}», che resta senza tasto.` };
  }
  return { b: next, note: '' };
}

/** The game's code for a physical key: its action's first default, the key itself if unbound, '' for a default moved away. */
export function translate(b: Bindings, code: string): string {
  const at = find(b, code);
  if (at) return ACTIONS.find((a) => a.id === at.id)!.keys[0];
  return ALL_DEFAULTS.has(code) ? '' : code;
}

// The live bindings: input.ts translates with them, the bar and the book label with them.
let current = load(undefined);
const subs: (() => void)[] = [];
export const bindings = (): Bindings => current;
export function setBindings(b: Bindings): void {
  current = b;
  save(b);
  for (const f of subs) f();
}
export function onKeys(f: () => void): void { subs.push(f); }
/** The key the player presses for action `id` now ('' if none). */
export const keyOf = (id: string): string => current[id]?.find(Boolean) ?? '';
/** The label shown on action-bar slot `i`. */
export const slotLabel = (i: number): string => { const k = keyOf(SLOT_ACTIONS[i]); return k ? label(k) : ''; };

// Labels: the keyboard's own where the browser tells (on an Italian keyboard Minus is '), otherwise a name.
let layout: Map<string, string> | undefined;
(globalThis.navigator as Navigator & { keyboard?: { getLayoutMap(): Promise<Map<string, string>> } } | undefined)?.keyboard
  ?.getLayoutMap().then((m) => { layout = m; for (const f of subs) f(); }).catch(() => {});
const NAMES: Record<string, string> = {
  Space: 'Spazio', ShiftLeft: 'Maiusc sx', ShiftRight: 'Maiusc dx', ControlLeft: 'Ctrl sx', ControlRight: 'Ctrl dx',
  AltLeft: 'Alt sx', AltRight: 'Alt dx', MetaLeft: 'Cmd sx', MetaRight: 'Cmd dx', CapsLock: 'Bloc Maiusc',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Enter: 'Invio', Backspace: 'Backspace', Delete: 'Canc',
};
export function label(code: string): string {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  const k = layout?.get(code);
  if (k && k.trim()) return k.toUpperCase();
  return code.replace(/^(Digit|Key)/, '').replace(/^Numpad/, 'Tn ');
}
