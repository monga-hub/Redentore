import { GAME } from './cloud.ts';
import { add, type Note } from './notes.ts';

/** The submission slice of the hub's /hub/notes.js API. */
export interface NotesClient {
  submit(gameId: string, note: {
    category: Note['category']; text: string; zone: string; level: number;
    hero: string; position: { x: number; z: number }; gameVersion: string; createdAt: string;
  }): Promise<boolean>;
}

async function connect(): Promise<NotesClient> {
  const url = '/hub/notes.js'; // served by the hub, as with /hub/saves.js
  return await import(/* @vite-ignore */ url) as NotesClient;
}

export type Delivery = 'sent' | 'out' | 'error';

async function send(note: Note, client: () => Promise<NotesClient>): Promise<Delivery> {
  try {
    const hub = await client();
    return await hub.submit(GAME, {
      category: note.category, text: note.text, zone: note.area, level: note.level,
      hero: note.hero, position: { x: note.x, z: note.z }, gameVersion: note.version,
      createdAt: new Date(note.at).toISOString(),
    }) === true ? 'sent' : 'out';
  } catch { return 'error'; }
}

/** Keep locally first; attempt only this new note once, without changing its local copy. */
export function saveAndSubmit(input: Omit<Note, 'id' | 'at'>, store: Storage = localStorage,
  client: () => Promise<NotesClient> = connect, now = Date.now(),
): { note: Note; delivery: Promise<Delivery> } | undefined {
  const note = add(input, store, now);
  return note ? { note, delivery: send(note, client) } : undefined;
}
