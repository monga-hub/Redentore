import * as THREE from 'three';
import { Emitter, loadBank, muffle, playSfx, setListener, stop, type Sound, type V3, type Voice } from './engine.ts';
import { musicState, setAmbience, setMusic, syncIntro } from './music.ts';
import { FRIAR, type Friar } from '../enemies/brain.ts';
import { APE, APETTA, REVERENDISSIMO, SACERDOTE, type Bolt, type Priest } from '../enemies/caster.ts';
import { GASTALDO, GONDOLIERE, GOVERNATRICE, MAESTRA } from '../enemies/zitelle.ts';
import { ABATE, BIBLIOTECARIO, MARINAIO, MONACO, NOSTROMO } from '../enemies/sangiorgio.ts';
import { CHARGE_MAX } from '../abilities/system.ts';
import { CHEST, type Quest } from '../quest/progress.ts';
import { surfaceAt } from '../level/ground.ts';
import type { Area } from '../level/builder.ts';
import type { PlayerController } from '../player/controller.ts';
import type { PlayerStats } from '../player/stats.ts';
import type { Forsaken } from '../abilities/forsaken.ts';
import { isDiablo } from '../core/style.ts';

// The game's sound, wired to what happens: one update a frame reads the world — mobs, the hero,
// the quest, where the listener stands — and compares it with the last frame, so the gameplay
// code needs almost no audio calls of its own (the hero's abilities and the friars' hoes make
// theirs where they happen). Combat music follows who is fighting, the ambience follows the
// area, the world fills in with gulls, owls, frogs, bells, far chant, torches, the apiary's hum.

export interface AudioWorld {
  player: PlayerController;
  stats: PlayerStats;
  kit: Forsaken;
  quest: Quest;
  friars: readonly Friar[];
  casters: readonly Priest[]; // priests, sacerdoti and the boss
  bees: readonly Priest[];
  boss: Priest;
  spent: readonly Bolt[]; // bolts that landed or fizzled this frame (priests.ts)
  fires: readonly { x: number; y: number; z: number; kind: string }[];
  areaAt(x: number, z: number): Area | undefined;
}

type Kind = 'friar' | 'priest' | 'sacerdote' | 'boss' | 'queen' | 'worker';
interface Vox { aggro: Sound; hurt: Sound; death: Sound; hit: Sound; swing?: Sound; blow?: Sound; peak?: number; height: number }
const VOX: Record<Kind, Vox> = { // `peak`: s into the swing sound where the blow lands
  friar: { aggro: 'friar_aggro', hurt: 'friar_hurt', death: 'friar_death', hit: 'hit_flesh', swing: 'friar_swing', blow: 'friar_hit', peak: 0.23, height: 1.5 },
  priest: { aggro: 'priest_aggro', hurt: 'priest_hurt', death: 'priest_death', hit: 'hit_flesh', height: 1.6 },
  sacerdote: { aggro: 'sacerdote_aggro', hurt: 'sacerdote_hurt', death: 'sacerdote_death', hit: 'hit_bone', swing: 'heavy_swing', blow: 'heavy_hit', peak: 0.28, height: 2.1 },
  boss: { aggro: 'boss_aggro', hurt: 'boss_hurt', death: 'boss_death', hit: 'hit_bone', swing: 'boss_swing', blow: 'boss_hit', peak: 0.42, height: 3.8 },
  queen: { aggro: 'bee_sting', hurt: 'bee_hurt', death: 'bee_death', hit: 'hit_bone', swing: 'bee_sting', peak: 0.45, height: 1.6 },
  worker: { aggro: 'bee_hurt', hurt: 'bee_hurt', death: 'bee_death', hit: 'hit_flesh', swing: 'bee_sting', peak: 0.45, height: 1.1 },
};
/** Level 2's kinds speak with level 1's voices: the gondolieri as friars, the elites as sacerdoti, the Governatrice as a boss. */
const VOICE = new Map<object, Kind>([[SACERDOTE, 'sacerdote'], [REVERENDISSIMO, 'boss'], [APE, 'queen'], [APETTA, 'worker'], [GONDOLIERE, 'friar'], [GASTALDO, 'sacerdote'], [MAESTRA, 'sacerdote'], [GOVERNATRICE, 'boss'],
  [MONACO, 'friar'], [MARINAIO, 'friar'], [BIBLIOTECARIO, 'sacerdote'], [NOSTROMO, 'sacerdote'], [ABATE, 'boss']]);
const kindOf = (m: Friar | Priest): Kind => !('kind' in m) ? 'friar' : VOICE.get(m.kind) ?? 'priest';
const FIGHTING = new Set(['chase', 'cast', 'swing', 'nova', 'spin', 'pour']);
const CAST_LEN = 1.6; // s of priest_cast at rate 1

/** Per-area ambience: the bed, how loud, an indoor low-pass, and random one-shots [sound, every min..max s, placed?]. */
type Shot = [Sound, number, number, 'near' | 'flat' | V3];
interface Place { bed: 'laguna' | 'orto' | 'chiostro' | 'chiesa'; level: number; lowpass: number; shots: Shot[] }
const VASCA = { x: -13.5, y: 0.4, z: -117.5 }; // the ninfee basin: its frogs
const HIVES = { x: 0, y: 1, z: -130 };
const PLACES: Record<string, Place> = {
  laguna: { bed: 'laguna', level: 1, lowpass: 20000, shots: [['gull', 5, 13, 'near'], ['bell_far', 30, 60, 'flat']] },
  interno: { bed: 'laguna', level: 0.55, lowpass: 650, shots: [['creak', 25, 45, 'near']] },
  orto: { bed: 'orto', level: 1, lowpass: 20000, shots: [['owl', 18, 35, 'near'], ['frog', 8, 20, VASCA], ['gull', 20, 40, 'near']] },
  chiostro: { bed: 'chiostro', level: 1, lowpass: 20000, shots: [['chant_far', 20, 40, 'flat'], ['bell_far', 45, 80, 'flat'], ['owl', 30, 60, 'near']] },
  chiesa: { bed: 'chiesa', level: 1, lowpass: 20000, shots: [['chant_far', 25, 45, 'flat'], ['creak', 15, 30, 'near']] },
};
const placeOf = (zone: string | undefined, label = ''): Place =>
  zone === 'orto' || zone === 'giardini' || label === 'Orto delle Zitelle' || /^Giardino di San|^Teatro Verde/.test(label) ? PLACES.orto
    : zone === 'convento' || label === 'Cortile delle Zitelle' || /^Chiostro d/.test(label) ? PLACES.chiostro
    : zone === 'chiesa' || /^Le Zitelle:|^Altar maggiore delle|^Basilica di San|^Crociera|^Presbiterio di San|^Coro dei monaci|^Cenacolo|^Antirefettorio|^Biblioteca del|^Scalone del/.test(label) ? PLACES.chiesa : zone === 'corpo-nord' || (zone === 'zitelle' && !/^Sagrato/.test(label)) ? PLACES.interno : PLACES.laguna;

interface Seen { state: string; hp: number; struck: boolean; cast?: Voice; x: number; z: number }

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const STEP_OFFSET = 0.12; // gait phase of a footfall past each half cycle (tune by ear against the clips)

export class Director {
  private w: AudioWorld;
  private seen = new Map<object, Seen>();
  private ready = false;
  private ear = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private shots = new Map<Sound, number>();
  private place?: Place;
  private engaged = 99; // s since the last mob was fighting the hero
  private bossT = 20; // s to the boss's next taunt
  private bossWalk = 0;
  private bossPhase = 0;
  private marks = 0; // the boss's marks on the floor last frame
  private gait = -1;
  private air = 0;
  private grounded = true;
  private hp = 0;
  private dead = false;
  private charge = 0;
  private wisp = 0;
  private casting: string | null = null;
  private castVoice?: Voice;
  private chest = false;
  private gates = new Map<object, { open: boolean; p: number }>();
  private won = 0; // bosses fallen: a new one plays the victory
  private paused = false;
  private fires = [new Emitter('fire'), new Emitter('fire'), new Emitter('fire')];
  private prayers = [new Emitter('pray'), new Emitter('pray')];
  private bees: Emitter[];
  private wispE = new Emitter('wisp_loop');
  private glint = new Emitter('glint');
  private hives = new Emitter('hives');
  private groups: Priest[][];

  constructor(w: AudioWorld) {
    this.w = w;
    this.bees = w.bees.map((b) => new Emitter(b.kind === APE ? 'bee_queen' : 'bee_worker'));
    this.groups = [...new Set(w.casters.map((p) => p.mates))];
    for (const b of ['core', 'arcane', 'world'] as const) loadBank(b);
    // Menu clicks and hovers (the action bar and the map have their own sounds or none).
    addEventListener('click', (e) => { if ((e.target as HTMLElement).closest?.('#menu button, #menu-btn')) playSfx('ui_click', null, { ui: true }); }, true);
    addEventListener('pointerover', (e) => {
      const b = e.pointerType === 'mouse' && (e.target as HTMLElement).closest?.('#menu .btn');
      if (b && !b.contains(e.relatedTarget as Node | null)) playSfx('ui_hover', null, { ui: true }); // entering the button, not its label
    }, true);
  }

  /**
   * Once a frame, after the world has moved. `intro`: the flythrough while it runs (its clock);
   * `paused`: the menu or the map is up; `pressed`: this frame's key presses.
   */
  update(dt: number, camera: THREE.Camera, intro: { time: number } | undefined, paused: boolean, pressed: (code: string) => boolean): void {
    const w = this.w, p = w.player.pos;
    if (paused !== this.paused) { // the menu or the map: muffle the world, turn a page
      this.paused = paused;
      muffle(paused);
      playSfx(paused ? 'ui_open' : 'ui_close', null, { ui: true });
    }
    if (paused) return;

    // The listener: the lens during the intro, the hero's head after, facing where the camera looks.
    camera.getWorldDirection(this.dir);
    if (intro) this.ear.copy(camera.position);
    else this.ear.set(p.x, p.y + 1.6, p.z);
    setListener(this.ear, this.dir.x, this.dir.z);

    this.ambience(dt);
    this.emitters();
    if (intro) {
      if (intro.time > 0) { setMusic('intro'); syncIntro(intro.time); }
      this.peek();
      return;
    }
    if (!this.ready) this.prime();
    this.hero(dt);
    this.mobs(dt);
    this.questSounds(pressed);
    this.score(dt);
  }

  /** First frame of play: take the world as it is (a loaded game's dead stay quiet). */
  private prime(): void {
    const w = this.w;
    for (const m of [...w.friars, ...w.casters, ...w.bees]) this.seen.set(m, { state: m.state, hp: m.hp, struck: m.struck, x: m.x, z: m.z });
    this.hp = w.stats.hp;
    this.charge = w.kit.system.charge;
    this.chest = w.quest.chestOpen;
    this.won = +w.quest.bossDead + +w.quest.boss2Dead + +w.quest.boss3Dead;
    for (const g of w.quest.gates) this.gates.set(g, { open: g.open, p: 0 });
    this.grounded = w.player.grounded;
    this.ready = true;
    loadBank('mobs');
  }

  // ---------------------------------------------------------------- the world around

  private ambience(dt: number): void {
    const area = this.w.areaAt(this.ear.x, this.ear.z);
    const pl = placeOf(area?.zone, area?.label);
    if (pl !== this.place) {
      this.place = pl;
      for (const [s, a, b] of pl.shots) if (!this.shots.has(s) || this.shots.get(s)! > b) this.shots.set(s, rnd(a * 0.3, b * 0.6));
      if (pl.bed === 'chiesa') loadBank('boss');
    }
    setAmbience(pl.bed, pl.level, pl.lowpass);
    for (const [s, a, b, where] of pl.shots) {
      const t = (this.shots.get(s) ?? 0) - dt;
      if (t > 0) { this.shots.set(s, t); continue; }
      this.shots.set(s, rnd(a, b));
      if (where === 'flat') playSfx(s);
      else if (where === 'near') {
        const ang = Math.random() * Math.PI * 2, r = s === 'gull' ? rnd(15, 35) : rnd(10, 25);
        playSfx(s, { x: this.ear.x + Math.cos(ang) * r, y: this.ear.y + (s === 'gull' ? rnd(6, 14) : rnd(1, 5)), z: this.ear.z + Math.sin(ang) * r });
      } else playSfx(s, { x: where.x + rnd(-3, 3), y: where.y, z: where.z + rnd(-3, 3) });
    }
  }

  private emitters(): void {
    const w = this.w, e = this.ear;
    // Torches and braziers: the three nearest crackle.
    const near = w.fires.filter((f) => f.kind === 'torch' || f.kind === 'brazier')
      .map((f) => ({ f, d: (f.x - e.x) ** 2 + (f.z - e.z) ** 2 })).filter((o) => o.d < 100).sort((a, b) => a.d - b.d);
    this.fires.forEach((em, i) => { const o = near[i]; em.set(o ? o.f : null, o ? (o.f.kind === 'brazier' ? 1 : 0.6) : 0); });
    // Praying groups murmur their psalm.
    const pray = this.groups.map((g) => {
      const live = g.filter((m) => m.state === 'pray');
      if (!live.length) return null;
      const x = live.reduce((s, m) => s + m.x, 0) / live.length, z = live.reduce((s, m) => s + m.z, 0) / live.length;
      return { x, y: live[0].y + 1.5, z, d: (x - e.x) ** 2 + (z - e.z) ** 2, n: live.length };
    }).filter((o) => o && o.d < 400).sort((a, b) => a!.d - b!.d);
    this.prayers.forEach((em, i) => { const o = pray[i]; em.set(o ?? null, o ? Math.min(1, 0.4 + o.n * 0.2) : 0); });
    // The bees' wings, the hives, the chest's glint, the wisp.
    w.bees.forEach((b, i) => this.bees[i].set({ x: b.x, y: b.y + (b.kind === APE ? 1.25 : 1.1), z: b.z }, b.state === 'dead' ? 0 : FIGHTING.has(b.state) ? 1 : 0.6));
    this.hives.set(HIVES, 1);
    this.glint.set({ x: CHEST.x, y: CHEST.y + 1, z: CHEST.z }, w.quest.accepted && !w.quest.chestOpen ? 1 : 0); // shines once the key is sought
    const k = w.kit;
    this.wispE.set(k.wispAt, k.wisp > 0 ? 1 : 0);
  }

  // ---------------------------------------------------------------- the hero

  private hero(dt: number): void {
    const w = this.w, pl = w.player, p = pl.pos, s = w.stats, k = w.kit;
    // Footfalls on the gait's half cycles, on what lies underfoot.
    const g = pl.model.gait, half = (x: number) => Math.floor(((x - STEP_OFFSET + 1) % 1) * 2);
    if (g >= 0 && pl.grounded && this.gait >= 0 && half(g) !== half(this.gait)) this.step(p, 1);
    this.gait = g;
    if (!pl.grounded) this.air += dt;
    if (pl.grounded !== this.grounded) {
      if (!pl.grounded && !s.dead) playSfx('jump');
      else if (this.air > 0.3) { playSfx('land', p); this.step(p, 1.3); }
      this.air = 0;
      this.grounded = pl.grounded;
    }
    // Hurt, death, waking up.
    if (s.hp < this.hp && !s.dead) {
      const n = this.hp - s.hp;
      if (n > 40 || Math.random() < 0.6) playSfx('player_hurt', null, { gain: Math.min(1, 0.6 + n / 150) });
    }
    if (s.dead !== this.dead) {
      this.dead = s.dead;
      if (s.dead) {
        playSfx('player_death');
        setMusic('death');
        if ((FIGHTING.has(w.boss.state) || w.boss.state === 'evade') && Math.hypot(w.boss.x - p.x, w.boss.z - p.z) < 40) playSfx('boss_laugh', this.at(w.boss, 'boss'), { delay: 1.2 });
      } else playSfx('player_revive');
    }
    this.hp = s.hp;
    // The fury bar fills: the specials are ready.
    const c = k.system.charge;
    if (c >= CHARGE_MAX && this.charge < CHARGE_MAX) playSfx('charge_ready');
    this.charge = c;
    // Fuoco fatuo's and the prayer's cast bar (stopped if it breaks) and the wisp's end.
    const cast = k.system.casting?.ability.id ?? null;
    if (cast !== this.casting) {
      if ((this.casting === 'wisp' && !(k.wisp > 59)) || this.casting === 'mend') stop(this.castVoice, 0.15);
      if (cast === 'wisp' || cast === 'mend') this.castVoice = playSfx('wisp_cast', p); // the prayer gathers like the wisp
      this.casting = cast;
    }
    if (this.wisp > 0 && k.wisp <= 0) playSfx('wisp_end', k.wispAt);
    this.wisp = k.wisp;
    if (k.system.notices.some((n) => n.kind === 'error')) playSfx('ui_error', null, { ui: true });
  }

  private step(p: V3, gain: number): void {
    const area = this.w.areaAt(p.x, p.z);
    const layer = area?.label === 'Pontile' ? 'wood' : surfaceAt(p.x, p.z);
    const name: Sound = layer === 'wood' ? 'step_wood' : layer === 'grass' ? 'step_grass' : layer === 'gravel' || layer === 'dirt' ? 'step_gravel' : 'step_stone';
    playSfx(name, { x: p.x, y: p.y + 0.1, z: p.z }, { gain });
  }

  // ---------------------------------------------------------------- mobs

  private at(m: { x: number; y: number; z: number }, k: Kind, up = 0.6): V3 {
    return { x: m.x, y: m.y + VOX[k].height * up, z: m.z };
  }

  private mobs(dt: number): void {
    const w = this.w, p = w.player.pos;
    const victory = +w.quest.bossDead + +w.quest.boss2Dead + +w.quest.boss3Dead > this.won; // everyone falls at once: only the boss gets the scream
    const diablo = isDiablo();
    for (const m of [...w.friars, ...w.casters, ...w.bees]) {
      const s = this.seen.get(m)!, k = kindOf(m), v = VOX[k];
      const dist = Math.hypot(p.x - m.x, p.z - m.z), level = Math.abs(p.y - m.y) < 2.5;
      if (m.state !== s.state) {
        const was = s.state, now = m.state;
        if ((was === 'hoe' || was === 'pray') && now === 'chase') playSfx(v.aggro, this.at(m, k, 0.9));
        if (now === 'swing' && v.swing) {
          const windup = 'kind' in m ? m.kind.melee!.windup : FRIAR.windup;
          playSfx(v.swing, this.at(m, k), { delay: Math.max(0, windup - v.peak!) });
        }
        if (now === 'cast' && 'kind' in m) s.cast = playSfx('priest_cast', this.at(m, k, 0.8), { rate: CAST_LEN / m.kind.cast });
        if (was === 'cast' && 'kind' in m) {
          if (m.cd > m.kind.cooldown - 0.1) playSfx('bolt_cast', this.at(m, k, 0.8));
          else stop(s.cast, 0.1);
          s.cast = undefined;
        }
        if (now === 'nova') playSfx(k === 'queen' ? 'bee_swarm_cast' : 'boss_nova_cast', this.at(m, k), k === 'boss' ? {} : { rate: 1.2, gain: 0.7 });
        if (was === 'nova' && now !== 'dead') playSfx(k === 'queen' ? 'bee_swarm' : 'boss_nova', this.at(m, k, 0.3), k === 'boss' ? {} : { rate: 1.2, gain: 0.7 });
        if (now === 'dead' && (!victory || k === 'boss')) {
          stop(s.cast, 0.1);
          playSfx(v.death, this.at(m, k, 0.8));
          if (diablo && !victory) playSfx('loot', this.at(m, k, 0), { delay: 0.35 });
        }
        if (now === 'chase' && k === 'boss' && was === 'pray') this.bossT = rnd(12, 18);
        s.state = now;
      }
      // A melee blow lands (friar hoes, staffs; the bees' sting is in their swing sound).
      if (m.state === 'swing' && m.struck && !s.struck && v.blow) {
        const reach = 'kind' in m ? m.kind.melee!.hit + m.kind.radius : FRIAR.hit;
        if (dist <= reach && level) playSfx(v.blow, { x: p.x, y: p.y + 1.2, z: p.z });
      }
      s.struck = m.struck;
      // The hero's blows land: flesh or bone, and a grunt now and then.
      const d = s.hp - m.hp;
      if (d >= 1 && m.state !== 'evade') {
        playSfx(v.hit, this.at(m, k), { gain: k === 'worker' ? 0.6 : 1 });
        if (d >= 60) playSfx('hit_big', this.at(m, k, 0.2));
        if (m.state !== 'dead' && Math.random() < (k === 'boss' ? 0.35 : 0.5)) playSfx(v.hurt, this.at(m, k, 0.9), { delay: 0.05 });
      }
      s.hp = m.hp;
      // The Reverendissimo's tread.
      if (k === 'boss' && m.state !== 'dead') {
        this.bossWalk += Math.hypot(m.x - s.x, m.z - s.z);
        if (this.bossWalk > 2.4) { this.bossWalk = 0; playSfx('boss_step', this.at(m, k, 0)); }
      }
      s.x = m.x; s.z = m.z;
    }
    // His taunts through the fight, a laugh at each new act, and his marks: branded with a hiss, erupting with a roar.
    const b = w.boss;
    if (FIGHTING.has(b.state) && b.state !== 'nova') {
      if ((this.bossT -= dt) <= 0) { playSfx('boss_line', this.at(b, 'boss', 0.9)); this.bossT = rnd(16, 26); }
    }
    if (b.phase > this.bossPhase) playSfx('boss_laugh', this.at(b, 'boss', 0.9));
    this.bossPhase = b.phase;
    const marks = b.marks.length;
    if (marks > this.marks) playSfx('boss_nova_cast', b.marks[0], { rate: 1.5, gain: 0.6 });
    else if (marks < this.marks && FIGHTING.has(b.state)) playSfx('boss_nova', p, { rate: 1.4, gain: 0.7 });
    this.marks = marks;
    // Shadow bolts striking or fizzling.
    for (const bolt of w.spent) playSfx(bolt.hit ? 'bolt_hit' : 'bolt_fizzle', bolt);
  }

  // ---------------------------------------------------------------- quest

  private questSounds(pressed: (code: string) => boolean): void {
    const q = this.w.quest, p = this.w.player.pos;
    if (q.chestOpen && !this.chest) loadBank('boss'); // the chest and key sound from quest/view.ts
    this.chest = q.chestOpen;
    for (const g of q.gates) {
      const s = this.gates.get(g)!;
      if (g.open && !s.open) {
        const c = q.centre(g);
        playSfx(g.kind === 'grate' ? 'grate_open' : 'door_open', { x: c.x, y: g.y0 + 1.5, z: c.z }, { rate: g.id === 'portone' ? 0.85 : 1 });
      }
      s.open = g.open;
    }
    if (pressed('KeyF')) { const pr = q.prompt(p); if (pr && !pr.act) playSfx('locked', { x: p.x, y: p.y + 1, z: p.z }); }
  }

  /** The intro's lens opens the shut gates as it nears them and lets them shut behind it (quest/view.ts peek). */
  private peek(): void {
    const q = this.w.quest, e = this.ear;
    for (const g of q.gates) {
      if (g.open) continue;
      let s = this.gates.get(g);
      if (!s) this.gates.set(g, (s = { open: false, p: 0 }));
      const c = q.centre(g), d = Math.hypot(e.x - c.x, e.z - c.z);
      const p = 1 - THREE.MathUtils.smoothstep(d, 4, 12);
      const at = { x: c.x, y: g.y0 + 1.5, z: c.z };
      if (p > 0.05 && s.p <= 0.05 && p > s.p) playSfx(g.kind === 'grate' ? 'grate_open' : 'door_open', at, { rate: g.id === 'portone' ? 0.85 : 1 });
      if (p < 0.25 && s.p >= 0.25 && p < s.p) playSfx(g.kind === 'grate' ? 'grate_close' : 'door_close', at, { rate: g.id === 'portone' ? 0.8 : 1 });
      s.p = p;
    }
  }

  // ---------------------------------------------------------------- the score

  private score(dt: number): void {
    const w = this.w, p = w.player.pos;
    const won = +w.quest.bossDead + +w.quest.boss2Dead + +w.quest.boss3Dead;
    if (won > this.won) { this.won = won; setMusic('victory'); return; }
    if (w.stats.dead) return; // the death sting plays on
    const fighting = (m: Friar | Priest) => FIGHTING.has(m.state) && Math.hypot(m.x - p.x, m.z - p.z) < 35;
    const boss = fighting(w.boss);
    if (boss || w.friars.some(fighting) || w.casters.some(fighting) || w.bees.some(fighting)) this.engaged = 0;
    else this.engaged += dt;
    const want = boss ? 'boss' : this.engaged < 5 ? 'combat' : 'explore';
    const now = musicState();
    if ((now === 'victory' || now === 'death') && want === 'explore') return; // a sting hands back by itself
    setMusic(want);
  }
}
