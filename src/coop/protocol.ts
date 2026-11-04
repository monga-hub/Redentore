import { HEROES, HERO_IDS, type Hero } from '../player/heroes.ts';
import { BASES, levelOf, ownSchools, tuneOf } from '../player/levels.ts';
import type { GearState } from '../loot/gear.ts';

export const VERSION = 1, DURATION = 300, MAX_MOBS = 24;
export interface CombatHero { hero: Hero; xp: number; picks: string[]; learned: string[]; main: string; gear: GearState; boon: string; bar?: (string|null)[] }
export interface Controls { seq: number; x: number; z: number; casts: number[]; auto: boolean }
export const idle = (): Controls => ({ seq: 0, x: 0, z: 0, casts: Array(11).fill(0), auto: true });
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const ids = (x: unknown): x is string[] => Array.isArray(x) && x.length <= 500 && x.every(k => typeof k === 'string' && k.length <= 80);
export function combatHero(s: unknown): CombatHero {
  if (!record(s) || !HERO_IDS.includes(s.hero as Hero) || !record(s.build) || !record(s.quest)) throw Error('Salva un eroe valido nel cloud.');
  const b = s.build, xp = b.xp;
  if (typeof xp !== 'number' || !Number.isFinite(xp) || xp < 9300 || xp > 1e7 || levelOf(xp).lv < 31 || s.quest.boss3Dead !== true) throw Error('Servono livello 31 e vittoria sull’Abate del capitolo 3.');
  if (!ids(b.picks) || !ids(b.learned ?? [])) throw Error('Build non valida.');
  const hero = s.hero as Hero;
  const own = ownSchools(b.picks, b.learned as string[] ?? [], HEROES[hero].school);
  const gear = s.gear ?? {};
  if (!record(gear) || Object.keys(gear).length > 10 || Object.values(gear).some(v => typeof v !== 'string' || v.length > 160)) throw Error('Equipaggiamento non valido.');
  return { hero, xp, picks: own.picks, learned: own.learned, main: typeof b.main === 'string' ? b.main : '', gear: structuredClone(gear) as GearState, boon: typeof s.quest.boon === 'string' ? s.quest.boon : '' };
}
export function validHero(h: unknown): h is CombatHero {
  if (!record(h)) return false;
  try { combatHero({ hero: h.hero, build: { xp: h.xp, picks: h.picks, learned: h.learned, main: h.main }, quest: { boss3Dead: true, boon: h.boon }, gear: h.gear }); return true; } catch { return false; }
}
export function controls(x: unknown): Controls | undefined {
  if (!record(x) || !Number.isSafeInteger(x.seq) || Number(x.seq) < 1 || Number(x.seq) > 2147483647 || typeof x.x !== 'number' || typeof x.z !== 'number' || !Number.isFinite(x.x) || !Number.isFinite(x.z) || Math.abs(x.x) > 1 || Math.abs(x.z) > 1 || typeof x.auto !== 'boolean' || !Array.isArray(x.casts) || x.casts.length !== 11 || x.casts.some(v => !Number.isSafeInteger(v) || v < 0 || v > 2147483647)) return;
  return { seq: Number(x.seq), x: x.x, z: x.z, auto: x.auto, casts: [...x.casts] };
}
export function acceptInput(previous: Controls, next: Controls): boolean {
  return next.seq > previous.seq && next.casts.every((v, i) => v >= previous.casts[i] && v - previous.casts[i] <= 100);
}
export function validBar(h: CombatHero, value: unknown): value is (string|null)[] {
  const owned=tuneOf(h.picks,h.learned,HEROES[h.hero].school).owned;
  return Array.isArray(value)&&value.length===9&&typeof value[0]==='string'&&BASES.includes(value[0])&&owned.includes(value[0])&&value.every((id,i)=>id===null||(typeof id==='string'&&owned.includes(id)&&(i===0||!BASES.includes(id))))&&new Set(value.filter(Boolean)).size===value.filter(Boolean).length;
}
export function arenaLayout(h: CombatHero): (string | null)[] {
  if(validBar(h,h.bar))return [...h.bar,'potion','mana_potion'];
  const t = tuneOf(h.picks, h.learned, HEROES[h.hero].school);
  const main = t.owned.includes(h.main) ? h.main : t.owned[0];
  return [main, ...t.owned.filter(x => x !== main && x !== 'potion' && x !== 'mana_potion').slice(0, 8), ...Array(8).fill(null)].slice(0, 9).concat(['potion', 'mana_potion']);
}
export interface PlayerFrame { x: number; y: number; z: number; yaw: number; hp: number; max: number; mana: number; manaMax: number; charge: number; cast: number; slots: { id: string; name: string; cd: number }[] }
export interface MobFrame { id: number; x: number; y: number; z: number; yaw: number; hp: number; max: number; state: 'chase' | 'swing' | 'dead'; t: number }
export interface Frame { seq: number; time: number; stage: number; kills: number; outcome: 'fight' | 'victory' | 'defeat'; players: PlayerFrame[]; mobs: MobFrame[] }
export function frame(x: unknown): x is Frame {
  if (!record(x) || !Number.isSafeInteger(x.seq) || Number(x.seq)<0 || typeof x.time!=='number' || !Number.isFinite(x.time) || x.time<0 || x.time>DURATION || !['fight','victory','defeat'].includes(String(x.outcome)) || !Number.isInteger(x.stage) || Number(x.stage)<1 || Number(x.stage)>5 || !Number.isInteger(x.kills) || Number(x.kills)<0 || !Array.isArray(x.players) || x.players.length!==2 || !Array.isArray(x.mobs) || x.mobs.length>MAX_MOBS) return false;
  const finite = (v: unknown) => typeof v==='number' && Number.isFinite(v) && Math.abs(v)<1e9;
  return x.players.every(p => record(p) && ['x','y','z','yaw','hp','max','mana','manaMax','charge','cast'].every(k=>finite(p[k])) && Array.isArray(p.slots) && p.slots.length<=11 && p.slots.every(a=>record(a)&&typeof a.id==='string'&&a.id.length<80&&typeof a.name==='string'&&a.name.length<100&&finite(a.cd))) && x.mobs.every(m=>record(m)&&['id','x','y','z','yaw','hp','max','t'].every(k=>finite(m[k]))&&['chase','swing','dead'].includes(String(m.state)));
}
