// The mix sheet: how loud each sound plays, on which bus, how much it varies, how many may
// overlap and how far it carries. Every file is peak-normalised at -1 dBFS by the build, so
// `gain` is the whole balance. Edit here, no rebuild needed.

export type Bus = 'music' | 'sfx' | 'ambience' | 'voice';

export interface Mix {
  bus: Bus;
  gain: number; // dB
  pitch: number; // ± semitones at random per play
  vol: number; // ± dB at random per play
  max: number; // voices of this sound at once (the oldest is stolen)
  gap: number; // s: a new start this soon after the last is dropped
  ref: number; // m: full level within this distance, then inverse falloff
  far: number; // m: silent (and never started) beyond this
  duck: number; // dB the music dips under it while it plays (0: none)
}

const BASE: Mix = { bus: 'sfx', gain: -8, pitch: 0.8, vol: 1.5, max: 4, gap: 0.03, ref: 3, far: 45, duck: 0 };
const VOICE: Partial<Mix> = { bus: 'voice', pitch: 0.6, vol: 1, max: 2, gap: 0.25 };
const BOSS: Partial<Mix> = { ...VOICE, ref: 8, far: 90, max: 1 };
const WORLD: Partial<Mix> = { bus: 'ambience', pitch: 1, vol: 2, max: 2 };

const TABLE: Record<string, Partial<Mix>> = {
  // interface (never positioned, never muffled)
  ui_click: { gain: -22, pitch: 0.5, max: 2 }, ui_hover: { gain: -30, max: 1, gap: 0.05 },
  ui_open: { gain: -12 }, ui_close: { gain: -12 }, ui_page: { gain: -12 }, ui_error: { gain: -13, gap: 0.4 },
  quest: { gain: 0, gap: 1 },
  // the hero
  step_stone: { gain: -15, pitch: 1.5, vol: 2, max: 3, ref: 2, far: 25 }, step_gravel: { gain: -10, pitch: 1.5, vol: 2, max: 3, ref: 2, far: 25 },
  step_grass: { gain: -14, pitch: 1.5, vol: 2, max: 3, ref: 2, far: 25 }, step_wood: { gain: -13, pitch: 1.5, vol: 2, max: 3, ref: 2, far: 25 },
  land: { gain: -7, ref: 2 }, jump: { gain: -15 },
  swing: { gain: -9, pitch: 1, max: 3 },
  hit_flesh: { gain: -6, pitch: 1.2 }, hit_bone: { gain: -6, pitch: 1.2 }, hit_big: { gain: -8, max: 2 }, hit_player: { gain: -8 },
  player_hurt: { ...VOICE, gain: -9, gap: 0.6, max: 1 }, player_death: { ...VOICE, gain: -4 }, player_revive: { gain: -10 },
  // abilities
  plague_cast: { gain: -5 }, plague_hit: { gain: -6 }, plague_cloud: { gain: -10, max: 3, far: 30 },
  wisp_cast: { gain: -8 }, wisp_summon: { gain: -6 }, wisp_loop: { gain: -26, ref: 2, far: 20, max: 1 }, wisp_end: { gain: -10 },
  veil: { gain: -10 }, blink: { gain: -6 }, strike_cast: { gain: -6 }, strike_hit: { gain: -6, duck: 4 },
  nova: { gain: -5, duck: 5 }, ward: { gain: -5 }, potion: { gain: -1 }, charge_ready: { gain: -12, gap: 1 },
  loot: { gain: -4, ref: 4, max: 3 },
  // fire, frost, lightning and the new blows (forsaken.ts)
  fire_cast: { gain: -7 }, fire_hit: { gain: -4, duck: 4, ref: 5, far: 60 }, frost_cast: { gain: -9 }, frost_hit: { gain: -8, max: 3 },
  ice_shatter: { gain: -5, duck: 3 }, frost_nova: { gain: -4, duck: 4 }, zap: { gain: -7, max: 3 }, thunder: { gain: -2, duck: 7, ref: 8, far: 90, pitch: 0.4 },
  toll_bell: { gain: -8, ref: 6, far: 60, pitch: 0.3 }, whirl: { gain: -10, max: 2 }, leap_land: { gain: -6, duck: 3 }, charge_hit: { gain: -6 }, execute: { gain: -6 },
  // quest
  chest_open: { gain: -4, ref: 4, duck: 4 }, key: { gain: -1, duck: 4 },
  grate_open: { gain: -6, ref: 5, far: 50 }, grate_close: { gain: -2, ref: 5, far: 50 },
  door_open: { gain: -4, ref: 6, far: 60 }, door_close: { gain: 0, ref: 8, far: 80, duck: 6 }, locked: { gain: -8, gap: 1 },
  // friars
  friar_aggro: { ...VOICE, gain: -8, ref: 4, far: 40 }, friar_hurt: { ...VOICE, gain: -12, gap: 0.2 }, friar_death: { ...VOICE, gain: -7, max: 3 },
  friar_swing: { gain: -12 }, friar_hit: { gain: -8 }, hoe: { gain: -21, ref: 2, far: 14, max: 2, gap: 0.35, pitch: 1.5 },
  // priests and sacerdoti
  priest_aggro: { ...VOICE, gain: -6, gap: 0.4 }, priest_cast: { gain: -12, max: 3 }, bolt_cast: { gain: -10, max: 3 },
  bolt_hit: { gain: -6 }, bolt_fizzle: { gain: -14 }, priest_hurt: { ...VOICE, gain: -8, gap: 0.2 }, priest_death: { ...VOICE, gain: -8 },
  pray: { ...WORLD, gain: -7, ref: 3, far: 18, pitch: 0 },
  sacerdote_aggro: { ...VOICE, gain: -5, ref: 6, far: 60 }, heavy_swing: { gain: -9 }, heavy_hit: { gain: -6 },
  sacerdote_hurt: { ...VOICE, gain: -10, gap: 0.4 }, sacerdote_death: { ...VOICE, gain: -5, ref: 6 },
  // the apiary
  bee_queen: { gain: -13, ref: 3, far: 30, max: 1, pitch: 0 }, bee_worker: { gain: -20, ref: 2, far: 18, max: 3, pitch: 0 },
  bee_sting: { gain: -8 }, bee_swarm_cast: { gain: -6 }, bee_swarm: { gain: -8, duck: 3 }, bee_hurt: { gain: -6, gap: 0.15 }, bee_death: { gain: -2 },
  // il Reverendissimo
  boss_aggro: { ...BOSS, gain: 0, duck: 8 }, boss_line: { ...BOSS, gain: -7, duck: 7 }, boss_roar: { ...BOSS, gain: -3, duck: 4 },
  boss_hurt: { ...BOSS, gain: -12, gap: 2.5, ref: 6 }, boss_laugh: { ...BOSS, gain: -7, duck: 6 }, boss_death: { ...BOSS, gain: -1, duck: 10, far: 120 },
  boss_nova_cast: { gain: -1, ref: 8, far: 60 }, boss_nova: { gain: -1, ref: 8, far: 60, duck: 6 },
  boss_swing: { gain: -6, ref: 6 }, boss_hit: { gain: -3, ref: 6 }, boss_step: { gain: -7, ref: 5, far: 40, max: 2, pitch: 1.5 },
  // the world around
  gull: { ...WORLD, gain: -14, ref: 10, far: 90 }, bell_far: { ...WORLD, gain: -15, max: 1, pitch: 0.3 }, owl: { ...WORLD, gain: -11, ref: 8, far: 60 },
  frog: { ...WORLD, gain: -22, ref: 4, far: 30, pitch: 2 }, chant_far: { ...WORLD, gain: -16, max: 1, pitch: 0.3 },
  creak: { ...WORLD, gain: -17, ref: 6, far: 40 }, fire: { ...WORLD, gain: -23, ref: 1.5, far: 10, max: 3, pitch: 0 },
  hives: { ...WORLD, gain: -14, ref: 3, far: 22, max: 1, pitch: 0 }, glint: { gain: -10, ref: 2, far: 14, max: 1, pitch: 0 },
};

const cache = new Map<string, Mix>();
/** The resolved mix line of a sound. */
export function MIX(name: string): Mix {
  let m = cache.get(name);
  if (!m) cache.set(name, (m = { ...BASE, ...TABLE[name] }));
  return m;
}
