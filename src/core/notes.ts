// Zone notes: the player's comments tied to where they stood (the minimap's quill, ui/notes.ts). No backend: they
// live in localStorage on this device and leave it as a Markdown or JSON file, or the clipboard, for whoever fixes the game.

export const CATEGORIES = ['bug', 'nome', 'grafica', 'altro'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Note {
  id: string;
  text: string;
  category: Category;
  area: string; // the zone's name, '' in the open (the lagoon, a street with no name)
  level: number; // the quest's level, 1..3
  lv: number; // the hero's level
  hero: string;
  x: number;
  z: number;
  version: string; // the build's sha
  at: number; // ms since the epoch
}

export const KEY = 'redentore-notes';
export const NO_AREA = 'Senza nome';

const valid = (n: Partial<Note>): n is Note => typeof n?.id === 'string' && typeof n.text === 'string' && n.text.trim() !== ''
  && CATEGORIES.includes(n.category as Category) && typeof n.area === 'string' && typeof n.at === 'number' && Number.isFinite(n.x) && Number.isFinite(n.z);

export function load(store: Storage = localStorage): Note[] {
  try {
    const raw = JSON.parse(store.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter(valid) : [];
  } catch { return []; } // blocked storage or junk
}

function keep(notes: Note[], store: Storage): boolean {
  try { store.setItem(KEY, JSON.stringify(notes)); return true; } catch { return false; }
}

/** Saves a new note; the id and time are filled in. False if the text is blank or storage refused it. */
export function add(n: Omit<Note, 'id' | 'at'>, store: Storage = localStorage, now = Date.now()): Note | undefined {
  const note: Note = { ...n, text: n.text.trim(), id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`, at: now };
  if (!valid(note)) return undefined;
  return keep([...load(store), note], store) ? note : undefined;
}

export function remove(id: string, store: Storage = localStorage): void {
  keep(load(store).filter((n) => n.id !== id), store);
}

/** The list the panel shows: `zone` given, only its notes; otherwise the notes of `here` first, then the rest, newest first in each. */
export function list(notes: Note[], here: string, zone?: string): Note[] {
  const pick = zone === undefined ? notes : notes.filter((n) => n.area === zone);
  return [...pick].sort((a, b) => Number(b.area === here) - Number(a.area === here) || b.at - a.at);
}

/** Zones with notes, the one at hand first, then by name. */
export const zones = (notes: Note[], here: string): string[] => [...new Set(notes.map((n) => n.area))].sort((a, b) => Number(b === here) - Number(a === here) || a.localeCompare(b, 'it'));

const when = (ms: number) => new Date(ms).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });

/** A readable report: one section per zone, each note with where, who and when. */
export function markdown(notes: Note[]): string {
  const out = ['# Redentore Dungeon — note sulle zone', '', `${notes.length} note, esportate il ${when(Date.now())}.`, ''];
  for (const z of zones(notes, '')) {
    out.push(`## ${z || NO_AREA}`, '');
    for (const n of list(notes, '', z).reverse()) {
      out.push(`- **[${n.category}]** ${n.text.replace(/\s*\n\s*/g, ' ')}`,
        `  _livello ${n.level} · ${n.hero} (lv ${n.lv}) · x ${n.x.toFixed(1)}, z ${n.z.toFixed(1)} · v ${n.version} · ${when(n.at)}_`);
    }
    out.push('');
  }
  return out.join('\n');
}

export const json = (notes: Note[]) => JSON.stringify(notes, null, 2);
