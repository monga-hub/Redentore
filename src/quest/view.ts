import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Priest } from '../enemies/caster.ts';
import { T, type Style, type Vfx } from '../abilities/vfx.ts';
import { loadModel } from '../core/models.ts';
import { playSfx } from '../audio/engine.ts';
import { Dialogue, type Entry } from '../ui/dialogue.ts';
import { ICONS } from '../ui/icons.ts';
import { BORTOLO_OBJECTIVE, DECLINE, GREET, HEADS_TITLE, OBJECTIVE, QUEST2_TITLE, QUEST_TITLE, RELIC_OBJECTIVE, RELIC_TALK, RELIC_TITLE, SPEZIALE_AGAIN, SPEZIALE_DONE, SPEZIALE_HEADS, SPEZIALE_RITE, SPEZIALE_TALK, SPEZIALE_ZITELLE, SPEZIALE_ZITELLE_AGAIN, TALK, spezialeWait, titleOf, type Talk } from './dialogue.ts';
import { Npc } from './npc.ts';
import { BLESSING, BOONS, CHEST, HEADS, NPC, QUESTS, SECOND, SPEZIALE, type Gate, type Quest, type QuestId, type Stage } from './progress.ts';
import { ITEM, QUEST_COLOR, RELIC_PRIZE } from '../loot/bag.ts';
import { ISEPPO, ISEPPO_DECLINE, ISEPPO_DONE, ISEPPO_FULL, SIDE, SIDE_BY, type SideQuest } from './squero.ts';

// What the player sees of the quest: iron grates that slide up into the wall, wooden door
// leaves that swing open, the chest on the pontile (a Meshy reliquary chest whose lid swings
// open on a burst of gold, the key rising out of it; a gold glint over it while the quest wants
// it), Fra' Zuane and his dialogue window, Fra' Bortolo in the serra, his blessing and his shop (a green
// rush of rue round the hero and a buff icon with its countdown under the player frame), the quest tracker, the "F" interaction prompt (also a
// tap target on phones), the boss's health bar and the victory banner. Its few DOM pieces are
// styled here so they stay out of the HUD's way.

const join = (t: Talk) => t.pages.join('\n\n'); // a quest's text, whole, in the list window
const pay = (id: QuestId, item?: string) => ({ xp: QUESTS[id].xp, gold: QUESTS[id].gold, item });
const OPEN_TIME = 1.6; // s for a gate to open
const SWING = { portone: -1, coro: 1, 'portone-zitelle': -1, 'coro-zitelle': 1 }; // door leaves swing into the church: -Z behind the facade, +Z off the choir and presbytery walls
const GOLD = 0xffd36a;
const LOOT = 2.2; // s of the chest's opening: lid, burst, the key rising and fading
const BANNER = 4; // s a "Missione completata" banner stays up; quests done together queue

const goldSpark: Style = { life: [0.6, 1.2], size: [0.05, 0.09], color: 0xfff0b0, color2: 0xff9a20, hdr: 4, tex: T.spark, stretch: 0.04, drag: 1.5, grav: 2 };
const goldMote: Style = { life: [1.2, 2], size: [0.08, 0.16], color: GOLD, color2: 0xff7a10, hdr: 3, tex: T.ember, drag: 0.6, grav: -0.8 };
const goldFlare: Style = { life: 0.5, size: 2.4, grow: 0.6, color: 0xfff4c8, color2: GOLD, hdr: 3, tex: T.star, fadeIn: 0.05 };
const rueLeaf: Style = { life: [1, 1.6], size: [0.08, 0.14], color: 0xb8ff9a, color2: 0x2a8a3a, hdr: 3, tex: T.ember, drag: 0.8, grav: -1.2 };
const rueFlare: Style = { life: 0.6, size: 2.2, grow: 0.8, color: 0xeaffd8, color2: 0x7adf6a, hdr: 3, tex: T.star, fadeIn: 0.05 };
const RUE = 0x8aff9a; // Fra' Bortolo's glow
const riteSmoke: Style = { life: [1.4, 2.2], size: [0.4, 0.8], grow: 1.6, color: 0x9aff8a, color2: 0x0a2a10, hdr: 1.5, drag: 1.2, grav: -0.6 };
const SQUERO = 0xffc27a; // Mastro Iseppo's, a lantern's
const goldGlow: Style = { life: [0.6, 0.9], size: [0.5, 0.8], grow: 1.8, color: GOLD, color2: 0x803000, hdr: 2, drag: 2, grav: -1.5 };

const CSS = `
#quest-prompt { position: fixed; left: 50%; bottom: 26%; transform: translateX(-50%); padding: 7px 16px;
  font: 600 15px/1.2 Georgia, serif; color: #f3e6c4; border: 2px solid transparent; background: var(--panel); box-shadow: var(--panel-shadow);
  border-radius: 6px; text-shadow: 0 1px 2px #000; pointer-events: none; display: none; white-space: nowrap; z-index: 5; }
#quest-prompt.act { pointer-events: auto; cursor: pointer; }
#quest-prompt kbd { display: inline-block; min-width: 1.3em; margin-right: 8px; padding: 1px 5px; font: 700 13px/1.2 sans-serif;
  color: #1a1208; background: #e0b55a; border-radius: 3px; text-align: center; }
body.touch #quest-prompt kbd { display: none; }
#boss { position: fixed; left: 50%; top: 56px; transform: translateX(-50%); width: min(460px, 80vw); display: none;
  text-align: center; font: 700 15px/1.3 Georgia, serif; color: #f0d8ff; text-shadow: 0 1px 3px #000; pointer-events: none; z-index: 5; }
#boss .bar { position: relative; height: 14px; margin-top: 4px; overflow: hidden; border: 2px solid transparent; border-radius: 3px;
  background: linear-gradient(#1a0d14, #1a0d14) padding-box, var(--gilt) border-box; box-shadow: 0 0 0 1px #000, 0 2px 8px #000; }
#boss .bar i { position: absolute; inset: 0 auto 0 0; background: linear-gradient(#d23a3a, #7a1414); }
#boss .bar span { position: relative; font: 600 11px/14px sans-serif; color: #fff; }
#victory { position: fixed; left: 0; right: 0; top: 30%; text-align: center; pointer-events: none; display: none; z-index: 5;
  font: 700 38px/1.2 Georgia, serif; color: #ffe39a; text-shadow: 0 0 18px #a06a10, 0 2px 4px #000; }
#victory small { display: block; margin-top: 10px; font-size: 18px; color: #f3e6c4; }
#victory.show { display: block; animation: victory 8s ease forwards; }
#quest-done { position: fixed; left: 0; right: 0; top: 18%; text-align: center; pointer-events: none; display: none; z-index: 5;
  font: 700 30px/1.2 Georgia, serif; color: #ffd200; text-shadow: 0 0 14px #a06a10, 0 2px 4px #000; }
#quest-done small { display: block; margin-top: 6px; font-size: 19px; color: #f3e6c4; }
#quest-done i { display: block; margin-top: 8px; font: 600 16px/1.3 Georgia, serif; color: #d6b8ff; }
#quest-done i b { color: #ffd36a; }
#quest-done.show { display: block; animation: victory ${BANNER}s ease forwards; }
body.touch #quest-done { font-size: 24px; }
#quests { position: absolute; top: calc(100% + 34px); right: -6px; width: 230px; text-align: right; pointer-events: none;
  font: 13px/1.35 Georgia, serif; color: #f3e6c4; text-shadow: 0 1px 2px #000, 0 0 6px #000; }
#quests b { display: block; font-size: 14px; color: #ffd200; }
#quests span::before { content: '- '; }
#quests span.new { animation: quest-new 1.6s ease-out; }
@keyframes quest-new { 0% { color: #fff; text-shadow: 0 0 10px #ffd200; } }
#quests.done span, #quests span.ok { color: #7dff64; }
#quests span.heads { color: ${QUEST_COLOR}; }
#quests span.heads.ready { color: #7dff64; }
body.touch #quests { top: 0; right: calc(100% + 16px); width: 190px; font-size: 12px;
  max-height: 42dvh; overflow: hidden; -webkit-mask-image: linear-gradient(#000 85%, transparent); mask-image: linear-gradient(#000 85%, transparent); } /* several side quests: the list fades out above the buttons */
body.diablo #quests b { color: #e9d6b0; }

#buffs { position: fixed; left: calc(16px + env(safe-area-inset-left)); top: calc(96px + env(safe-area-inset-top)); display: flex; gap: 6px; pointer-events: none; z-index: 4; }
#buffs .buff { position: relative; width: 32px; text-align: center; font: bold 11px/14px system-ui, sans-serif; color: #f3e6c4; text-shadow: 1px 1px 0 #000, -1px -1px 0 #000; }
#buffs .buff .ico { width: 32px; height: 32px; box-sizing: border-box; border: 1px solid #000; border-radius: 3px;
  box-shadow: 0 0 0 1px rgba(217,173,82,.8), inset 2px 2px 0 rgba(255,240,200,.18), 0 0 10px rgba(138,255,154,.55); }
#buffs .buff.end .ico { animation: buff-end .5s ease-in-out infinite alternate; }
@keyframes buff-end { to { opacity: .35; } }
@keyframes victory { 0% { opacity: 0; } 8% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
`;

/** One gate's meshes and its opening animation. */
interface GateView { gate: Gate; root: THREE.Group; leaves: THREE.Object3D[]; p: number; solid: THREE.Mesh[] }

export class QuestView {
  readonly root = new THREE.Group();
  private quest: Quest;
  private gates: GateView[];
  private lid = new THREE.Group();
  private lidP = 0;
  private glint: THREE.Mesh;
  private chest = new THREE.Group();
  private inside: THREE.Mesh; // the hollow under the lid: dark wood that glows gold as it opens
  private key: THREE.Group;
  private vfx: Vfx;
  private npc = new Npc(NPC);
  private speziale = new Npc(SPEZIALE, RUE);
  private iseppo = new Npc(ISEPPO, SQUERO, 'iseppo.glb');
  private finds: { q: SideQuest; m: THREE.Mesh }[] = []; // a gold glint over each find spot while its quest wants it
  private lines = ''; // Mastro Iseppo's tracker lines as drawn
  private talk = new Dialogue();
  private news: string[] = []; // notices raised outside update (the blessing, given as his window closes)
  private buffEl = document.createElement('div');
  private buffLeft = '';
  private hero = new THREE.Vector3(); // the hero's feet at the last update
  private trackEl = document.createElement('div');
  private stage?: Stage;
  private promptEl = document.createElement('div');
  private bossEl = document.createElement('div');
  private bossFill: HTMLElement;
  private bossText: HTMLElement;
  private victoryEl = document.createElement('div');
  private doneEl = document.createElement('div');
  private paidOut = 0; // quests in quest.done whose banner and gold have been given
  private bannerT = 0;
  private side = ''; // the side quests on the tracker: 'b' Fra' Bortolo's errand, 'r' the corona to give back, then the heads (`heads`)
  private bossName?: object; // the kind the boss bar is named for
  /** The boss bar is up: the target frame and the boss's own nameplate bar give way to it. */
  bossShown = false;
  /** Fra' Bortolo's Commercia: main.ts opens the shop. */
  shop?: () => void;
  /** Mastro Iseppo's: main.ts opens his shop. */
  shop2?: () => void;
  /** A quest handed in: main.ts puts its gold in the bag. */
  reward?: (gold: number) => void;
  /** Fra' Zuane takes his corona back: main.ts swaps it in the bag for his medal and returns the medal's name. */
  relicBack?: () => string;
  /** Friars still standing (main.ts): Le teste dei frati wants no more heads than are left to take. */
  friars: () => number = () => HEADS.need;
  /** The rite's boon is picked: main.ts lays it on the kit. */
  boonTaken?: () => void;
  private shown = '';
  private tapped = false;

  constructor(quest: Quest, vfx: Vfx) {
    this.quest = quest;
    this.vfx = vfx;
    const iron = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.55, metalness: 0.75 });
    this.gates = quest.gates.map((g) => this.gate(g, iron));

    // The chest (public/models/baule.glb, 1.1 m wide, front +Z toward the riva): body and lid, the
    // lid's origin on its hinge. Under the lid, the hollow; over it, the glint; in it, the key.
    const chest = this.chest;
    chest.position.set(CHEST.x, CHEST.y, CHEST.z);
    loadModel('baule.glb').then((gltf) => {
      const body = gltf.scene.getObjectByName('body')!, lid = gltf.scene.getObjectByName('lid')!;
      this.lid.position.copy(lid.position);
      lid.position.set(0, 0, 0);
      this.lid.add(lid);
      chest.add(body);
      chest.traverse((o) => { o.castShadow = true; });
      this.inside.position.y = this.lid.position.y - 0.04;
    });
    this.inside = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.66).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x120a05 }));
    this.inside.position.z = -0.04;
    this.glint = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(3), fog: false }));
    this.glint.position.y = CHEST.h + 0.45;
    this.key = key();
    this.key.visible = false;
    chest.add(this.lid, this.inside, this.glint, this.key);
    this.root.add(chest, this.npc.root, this.speziale.root, this.iseppo.root);
    for (const q of SIDE) {
      if (q.want.kind !== 'find') continue;
      const m = new THREE.Mesh(this.glint.geometry, this.glint.material);
      m.position.set(q.want.at.x, q.want.at.y + 0.45, q.want.at.z);
      m.visible = false;
      this.finds.push({ q, m });
      this.root.add(m);
    }

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.promptEl.id = 'quest-prompt';
    this.promptEl.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.tapped = true; });
    this.bossEl.id = 'boss';
    this.bossEl.innerHTML = 'Il Reverendissimo<div class="bar"><i></i><span></span></div>';
    this.bossFill = this.bossEl.querySelector('i')!;
    this.bossText = this.bossEl.querySelector('span')!;
    this.victoryEl.id = 'victory';
    this.victoryEl.innerHTML = 'Il Reverendissimo è caduto<small>Le porte della chiesa si aprono sulla fondamenta</small>';
    this.trackEl.id = 'quests';
    this.buffEl.id = 'buffs';
    this.doneEl.id = 'quest-done';
    document.body.append(this.promptEl, this.bossEl, this.victoryEl, this.doneEl, this.buffEl);
    (document.getElementById('minimap') ?? document.body).append(this.trackEl); // under the minimap, like WoW's tracker
    this.talk.onClose = () => {
      this.npc.talking = false;
      if (this.speziale.talking && (this.quest.bless() || (this.quest.accepted2 && this.quest.bless2()))) this.blessed(); // he gives it as he says goodbye
      this.speziale.talking = false;
      this.iseppo.talking = false;
    };
  }

  /** The next quest done and not yet paid: its gold into the bag and WoW's "Missione completata" (its XP is main.ts's, from quest.done). */
  private payout(dt: number): void {
    if ((this.bannerT -= dt) > 0 || this.paidOut >= this.quest.done.length) return;
    const r = QUESTS[this.quest.done[this.paidOut++]];
    this.reward?.(r.gold);
    this.doneEl.innerHTML = `Missione completata<small>${r.title}</small><i>+${r.xp} esperienza · <b>+${r.gold} oro</b></i>`;
    this.doneEl.classList.remove('show');
    void this.doneEl.offsetWidth; // replay the fade
    this.doneEl.classList.add('show');
    playSfx('quest', null, { rate: 0.84, gain: 1.3 });
    this.vfx.burst(goldMote, this.hero.x, this.hero.y + 0.6, this.hero.z, 24, 0.5, 1, 1.5);
    this.bannerT = BANNER;
  }

  /** Fra' Zuane has his corona back: his medal, once (its XP and gold are payout's). */
  private thanked(): void {
    if (!this.quest.returnRelic()) return;
    const medal = this.relicBack?.();
    if (medal) this.news.push(`Ricompensa: ${medal}`);
  }

  /** Fra' Bortolo's blessing lands on the hero: a rush of rue and gold round them, a chime, a notice. */
  private blessed(): void {
    const at = this.hero;
    playSfx('potion');
    playSfx('quest', null, { rate: 1.2 });
    this.vfx.spawn(rueFlare, at.x, at.y + 1.1, at.z);
    this.vfx.burst(rueLeaf, at.x, at.y + 0.3, at.z, 50, 0.6, 1.6, 2.2);
    this.vfx.burst(goldMote, at.x, at.y + 0.6, at.z, 20, 0.5, 1, 1.5);
    this.vfx.pulse(at.x, at.y + 1, at.z, RUE, 30);
    this.news.push(`${BLESSING.name}: lanci ${Math.round((1 - BLESSING.cast) * 100)}% più rapidi e +${Math.round((BLESSING.dmg - 1) * 100)}% ai danni per ${BLESSING.time / 60} minuti`);
  }

  /** The blessing's icon under the player frame, with the time it has left. */
  private buff(): void {
    const s = Math.ceil(this.quest.blessLeft), text = s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '';
    if (text === this.buffLeft) return;
    if (!this.buffLeft) this.buffEl.innerHTML = `<div class="buff" title="${BLESSING.name}: lanci più rapidi, danni più alti">${ICONS.ruta}<span></span></div>`;
    this.buffLeft = text;
    if (!text) { this.buffEl.innerHTML = ''; return; }
    this.buffEl.querySelector('span')!.textContent = text;
    this.buffEl.firstElementChild!.classList.toggle('end', s <= 10);
  }

  /** A speaker's window is up: the game holds still behind it, but he keeps talking. */
  get talking(): boolean {
    return this.talk.open;
  }

  /** While the world is paused for the dialogue (main.ts): only the speaker moves. */
  idle(dt: number, player: THREE.Vector3): void {
    this.marks(dt, player);
  }

  /** The three of them, each under his "!" or "?" (Quest.marks). */
  private marks(dt: number, player: THREE.Vector3): void {
    const m = this.quest.marks(this.friars());
    this.npc.update(dt, player, m.zuane);
    this.speziale.update(dt, player, m.speziale);
    this.iseppo.update(dt, player, m.iseppo);
  }

  /** The quest givers with a "!" or "?" up, for the maps: `state` is the Mark. */
  pins(): { x: number; z: number; state: string }[] {
    const m = this.quest.marks(this.friars());
    return ([[NPC, m.zuane], [SPEZIALE, m.speziale], [ISEPPO, m.iseppo]] as const).flatMap(([at, k]) => (k ? [{ x: at.x, z: at.z, state: k }] : []));
  }

  /** He has Le teste dei frati to give: not yet taken and friars still about. */
  private asking(): boolean {
    const q = this.quest;
    return !q.asked && !q.bossDead && this.friars() > 0;
  }

  /** Fra' Zuane's list: the corona to give back, and his quest as it stands. */
  private zuaneEntries(): Entry[] {
    const q = this.quest, s = q.stage, out: Entry[] = [];
    if (q.relic && !q.relicBack) out.push({ title: RELIC_TITLE, state: 'ready', text: join(RELIC_TALK), reward: pay('relic', ITEM.get(RELIC_PRIZE)?.name), act: () => this.thanked() });
    if (s === 'talk') out.push({ title: QUEST_TITLE, state: 'offer', text: join(TALK.talk), objective: OBJECTIVE.key, reward: pay('reverendissimo'), decline: DECLINE, act: () => { q.accepted = true; } });
    else if (s === 'report') out.push({ title: QUEST_TITLE, state: 'ready', text: TALK.report.pages[0], reward: pay('reverendissimo'), act: () => { q.report(); } });
    else if (s === 'offer') out.push({ title: QUEST2_TITLE, state: 'offer', text: TALK.report.pages.slice(1).join('\n\n'), objective: OBJECTIVE.route, reward: pay('zitelle'), decline: TALK.offer.decline, act: () => q.accept2() }); // the lore of the Zitelle that came with the report
    else if (s === 'return') out.push({ title: QUEST2_TITLE, state: 'ready', text: join(TALK.return), reward: pay('zitelle'), act: () => { q.report2(); } });
    else if (s === 'done') out.push({ title: 'Parla', state: 'talk', text: join(TALK.done) });
    else out.push({ title: titleOf(s), state: 'busy', text: join(TALK[s]), objective: OBJECTIVE[s], reward: pay(SECOND.includes(s) ? 'zitelle' : 'reverendissimo') });
    return out;
  }

  /** Fra' Bortolo's list: his talk (the errand handed in on it), and Le teste dei frati. */
  private spezialeEntries(): Entry[] {
    const q = this.quest, alive = this.friars();
    const t = q.accepted2 && !q.boss2Dead ? (q.blessed2 ? SPEZIALE_ZITELLE_AGAIN : SPEZIALE_ZITELLE) : q.bossDead ? SPEZIALE_DONE : q.blessed ? SPEZIALE_AGAIN : SPEZIALE_TALK;
    const out: Entry[] = [q.accepted && !q.found
      ? { title: QUESTS.bortolo.title, state: 'ready', text: join(t), reward: pay('bortolo'), act: () => { q.meet(); } } // found, as Fra' Zuane asked
      : { title: 'Parla', state: 'talk', text: join(t) }];
    const heads = { title: HEADS_TITLE, objective: `Teste di frate ${q.heads}/${q.headsNeed(alive)}`, reward: pay('teste') };
    if (q.headsReady(alive)) out.push({ ...heads, state: 'ready', text: join(SPEZIALE_RITE), choices: SPEZIALE_RITE.choices, act: (id) => { if (id && q.rite(id)) this.rite(id); } });
    else if (q.asked && !q.boon && !q.bossDead) out.push({ ...heads, state: 'busy', text: join(spezialeWait(q.heads, q.headsNeed(alive))) });
    else if (this.asking()) out.push({ ...heads, state: 'offer', text: join(SPEZIALE_HEADS), objective: `Porta ${HEADS.need} teste di frate a Fra' Bortolo`, decline: SPEZIALE_HEADS.decline,
      act: () => { q.asked = true; this.news.push(`Missione accettata: ${QUESTS.teste.title}`); } });
    return out;
  }

  /** Mastro Iseppo's list: what is ready to hand in, then on offer, then running. */
  private iseppoEntries(): Entry[] {
    const s = this.quest.side, over = this.quest.boss2Dead, open = s.open(), rank = { ready: 0, offer: 1, busy: 2, talk: 3 };
    return SIDE.flatMap((sq): Entry[] => {
      const base = { title: QUESTS[sq.id].title, objective: sq.line(s.progress(sq)), reward: pay(sq.id, ITEM.get(sq.reward)?.name) };
      if (s.ready(sq, over)) return [{ ...base, state: 'ready', text: sq.done.join('\n\n'), act: () => { // paid at once: its items out, the epic in (the XP, gold and banner are payout's)
        if (!s.handIn(sq)) return ISEPPO_FULL;
        this.news.push(`Ricompensa: ${ITEM.get(sq.reward)!.name}`);
      } }];
      if (s.active(sq.id)) return [{ ...base, state: 'busy', text: sq.busy }];
      if (open.includes(sq)) return [{ ...base, state: 'offer', text: sq.offer.join('\n\n'), decline: ISEPPO_DECLINE, act: () => {
        if (!s.taken.includes(sq.id)) s.taken.push(sq.id);
        playSfx('quest');
        this.news.push(`Missione accettata: ${base.title}`);
      } }];
      return [];
    }).sort((a, b) => rank[a.state] - rank[b.state]);
  }

  /** The rite of the rue: the heads go into the earth, a green pall and a gold rush rise round the hero, the boon is theirs (the XP and gold are payout's). */
  private rite(id: string): void {
    const at = this.hero, b = BOONS.find((x) => x.id === id)!;
    playSfx('ward');
    this.vfx.spawn(rueFlare, SPEZIALE.x, 1.2, SPEZIALE.z);
    this.vfx.burst(riteSmoke, SPEZIALE.x, 0.3, SPEZIALE.z, 24, 0.8, 0.6, 1);
    this.vfx.burst(rueLeaf, at.x, at.y + 0.3, at.z, 80, 0.8, 2, 3);
    this.vfx.burst(goldMote, at.x, at.y + 0.6, at.z, 40, 0.6, 1.4, 2);
    this.vfx.pulse(at.x, at.y + 1, at.z, RUE, 50);
    this.vfx.shake(0.2);
    this.boonTaken?.();
    this.news.push(`Rito della ruta: ${b.text}, per sempre`);
  }

  /** A head picked up off a friar (main.ts, from the drops). */
  head(): void {
    const q = this.quest;
    q.heads++;
    if (q.headsReady(this.friars())) this.news.push("Hai le teste: torna da Fra' Bortolo, nella serra");
  }

  /** The tracker's Le teste dei frati key while it is on: the count, or ready to hand in. */
  private heads(): string {
    const q = this.quest, alive = this.friars();
    return !q.asked || q.boon ? '' : q.headsReady(alive) ? 'T' : `t${q.heads}/${q.headsNeed(alive)}`;
  }

  /** The tracker's lines: the quest's, then Fra' Bortolo's errand while it is open; `fresh` flashes the objective as new. */
  private track(stage: Stage, fresh: boolean): void {
    this.trackEl.classList.toggle('done', stage === 'done');
    const sides = (this.side.includes('b') ? `<b>${QUESTS.bortolo.title}</b><span class="${fresh ? 'new' : ''}">${BORTOLO_OBJECTIVE}</span>` : '')
      + (this.side.includes('r') ? `<b>${RELIC_TITLE}</b><span>${RELIC_OBJECTIVE}</span>` : '')
      + (this.side.includes('T') ? `<b>${QUESTS.teste.title}</b><span class="heads ready">Torna da Fra' Bortolo, nella serra</span>`
        : this.side.includes('t') ? `<b>${QUESTS.teste.title}</b><span class="heads">Teste di frate ${this.side.slice(this.side.indexOf('t') + 1)}</span>` : '');
    this.trackEl.innerHTML = `<b>${titleOf(stage)}</b><span class="${fresh ? 'new' : ''}">${OBJECTIVE[stage]}</span>${sides}${this.lines}`;
  }

  /** The quests running, as the tracker lists them, for the world map's quest log (main.ts adds where each points). */
  log(): { id: 'main' | 'bortolo' | 'relic' | 'teste' | SideQuest['id']; title: string; line: string; ready: boolean }[] {
    const q = this.quest, s = q.stage, alive = this.friars(), out: ReturnType<QuestView['log']> = [];
    if (s !== 'done') out.push({ id: 'main', title: titleOf(s), line: OBJECTIVE[s], ready: s === 'report' || s === 'return' });
    if (q.accepted && !q.found) out.push({ id: 'bortolo', title: QUESTS.bortolo.title, line: BORTOLO_OBJECTIVE, ready: false });
    if (q.relic && !q.relicBack) out.push({ id: 'relic', title: RELIC_TITLE, line: RELIC_OBJECTIVE, ready: true });
    if (q.asked && !q.boon) {
      const ok = q.headsReady(alive);
      out.push({ id: 'teste', title: QUESTS.teste.title, line: ok ? "Torna da Fra' Bortolo, nella serra" : `Teste di frate ${q.heads}/${q.headsNeed(alive)}`, ready: ok });
    }
    for (const id of q.side.taken) {
      const sq = SIDE_BY.get(id)!, ok = q.side.ready(sq, q.boss2Dead);
      out.push({ id, title: QUESTS[id].title, line: ok ? `Torna da ${ISEPPO.name}, nello squero` : sq.line(q.side.progress(sq)), ready: ok });
    }
    return out;
  }

  /** Mastro Iseppo's quests running, for the tracker: their counts, green once ready to hand in. */
  private sideLines(): string {
    const q = this.quest, s = q.side;
    return s.taken.map((id) => {
      const sq = SIDE_BY.get(id)!, ok = s.ready(sq, q.boss2Dead);
      return `<b>${QUESTS[id].title}</b><span class="${ok ? 'ok' : ''}">${ok ? `Torna da ${ISEPPO.name}, nello squero` : sq.line(s.progress(sq))}</span>`;
    }).join('');
  }

  private gate(g: Gate, iron: THREE.Material): GateView {
    const root = new THREE.Group();
    const c = this.quest.centre(g);
    root.position.set(c.x, g.y0, c.z);
    root.rotation.y = g.axis === 'x' ? 0 : Math.PI / 2; // local X runs along the wall
    const leaves: THREE.Object3D[] = [], solid: THREE.Mesh[] = [];
    if (g.kind === 'chain') { // the vow's chains, gone to lace: three sagging strands of pale glowing links between two iron posts
      const links: THREE.BufferGeometry[] = [], link = new THREE.TorusGeometry(0.09, 0.025, 4, 8);
      for (const y of [0.9, 1.6, 2.3]) {
        for (let i = 0, n = Math.round(g.w / 0.16); i <= n; i++) {
          const x = -g.w / 2 + (g.w * i) / n, sag = 0.45 * (1 - (2 * x / g.w) ** 2);
          links.push(link.clone().rotateY(i % 2 ? Math.PI / 2 : 0).rotateZ(Math.PI / 2).translate(x, y - sag, 0));
        }
      }
      const chain = new THREE.Mesh(mergeGeometries(links), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdff4ff).multiplyScalar(1.6), transparent: true, fog: false }));
      root.add(chain);
      for (const x of [-g.w / 2, g.w / 2]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, g.h, 8), iron);
        post.position.set(x, g.h / 2, 0);
        root.add(post);
      }
      leaves.push(chain);
    } else if (g.kind === 'grate') {
      const bars: THREE.BufferGeometry[] = [];
      const n = Math.round(g.w / 0.22);
      for (let i = 0; i <= n; i++) bars.push(new THREE.CylinderGeometry(0.025, 0.025, g.h, 6).translate(-g.w / 2 + (g.w * i) / n, g.h / 2, 0));
      for (const y of [0.15, g.h * 0.5, g.h - 0.15]) bars.push(new THREE.BoxGeometry(g.w, 0.07, 0.05).translate(0, y, 0));
      const grate = new THREE.Mesh(mergeGeometries(bars), iron);
      grate.castShadow = true;
      root.add(grate);
      leaves.push(grate);
    } else {
      const wood = new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.8 });
      for (const s of [-1, 1]) {
        const hinge = new THREE.Group();
        hinge.position.x = (s * g.w) / 2;
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(g.w / 2 - 0.02, g.h, 0.12), wood);
        leaf.position.set((-s * g.w) / 4, g.h / 2, 0);
        for (const y of [0.25, 0.5, 0.75]) { // iron straps
          const strap = new THREE.Mesh(new THREE.BoxGeometry(g.w / 2 - 0.1, 0.08, 0.14), iron);
          strap.position.set((-s * g.w) / 4, g.h * y, 0);
          hinge.add(strap);
        }
        hinge.add(leaf);
        solid.push(leaf);
        hinge.userData.side = s;
        root.add(hinge);
        leaves.push(hinge);
      }
    }
    this.root.add(root);
    return { gate: g, root, leaves, p: 0, solid };
  }

  /**
   * The follow camera and the targeting rays stop on shut door leaves (`blockers` is the level's list they test):
   * without them the camera behind a hero in front of a barred portone backs out through its arch.
   */
  blockDoors(blockers: THREE.Object3D[]): void {
    this.blockers = blockers;
    for (const v of this.gates) if (!v.gate.open) blockers.push(...v.solid);
  }
  private blockers: THREE.Object3D[] = [];

  /** `pressed('KeyF')` (or a tap on the prompt) uses whatever is at hand; returns a notice to show, if any. */
  update(dt: number, player: THREE.Vector3, pressed: (code: string) => boolean, boss: Priest): string[] {
    const notices = this.news.splice(0);
    this.hero.copy(player);
    const pr = this.quest.prompt(player);
    if ((pressed('KeyF') || this.tapped) && pr?.act) {
      const n = pr.act();
      if (n) notices.push(n);
      if (pr.talk === 'zuane') {
        this.npc.talking = true;
        this.talk.show({ name: NPC.name, portrait: `${import.meta.env.BASE_URL}models/zuane.webp` }, GREET.zuane, () => this.zuaneEntries());
      } else if (pr.talk === 'speziale') {
        this.speziale.talking = true;
        this.talk.show({ name: SPEZIALE.name, portrait: `${import.meta.env.BASE_URL}models/zuane.webp`, tint: 'hue-rotate(-75deg) saturate(1.3)' }, GREET.speziale, () => this.spezialeEntries(), () => this.shop?.());
      } else if (pr.talk === 'iseppo') {
        this.iseppo.talking = true;
        const s = this.quest.side, all = s.done.length === SIDE.length;
        this.talk.show({ name: ISEPPO.name, portrait: `${import.meta.env.BASE_URL}models/iseppo.webp` }, all ? ISEPPO_DONE : GREET.iseppo, () => this.iseppoEntries(), () => this.shop2?.());
      }
      if (this.quest.chestOpen && this.lidP === 0) this.loot();
    }
    this.tapped = false;
    this.quest.update(player);
    const q = this.quest, stage = q.stage, side = (q.accepted && !q.found ? 'b' : '') + (q.relic && !q.relicBack ? 'r' : '') + this.heads();
    if (stage !== this.stage) {
      const was = this.stage, done = was === 'report' || was === 'return'; // complete: its banner and chime are payout's
      if (was === 'talk') notices.push(`Missione accettata: ${QUEST_TITLE}`);
      else if (stage === 'route') notices.push(`Missione accettata: ${QUEST2_TITLE}`);
      else if (was && !done) notices.push(OBJECTIVE[stage]);
      if (was && !done) playSfx('quest');
      this.side = side;
      this.lines = this.sideLines();
      this.track(stage, !!this.stage);
      this.stage = stage;
    } else if (side !== this.side || this.sideLines() !== this.lines) { // a side quest taken, counted, ready or handed in
      this.side = side;
      this.lines = this.sideLines();
      this.track(stage, false);
    }
    this.payout(dt);
    this.marks(dt, player);
    const spots = this.quest.side.spots();
    for (const f of this.finds) {
      f.m.visible = spots.some((s) => s.q === f.q);
      f.m.rotation.y = this.glint.rotation.y;
      f.m.position.y = f.q.want.kind === 'find' ? f.q.want.at.y + 0.45 + Math.sin(performance.now() * 0.003) * 0.08 : 0;
    }
    this.quest.blessLeft = Math.max(0, this.quest.blessLeft - dt);
    this.buff();
    const now = this.quest.prompt(player);
    const html = now ? (now.act ? `<kbd>F</kbd>${now.text}` : now.text) : '';
    if (html !== this.shown) {
      this.shown = html;
      this.promptEl.innerHTML = html;
      this.promptEl.style.display = html ? 'block' : 'none';
      this.promptEl.classList.toggle('act', !!now?.act);
    }

    for (const v of this.gates) {
      if (!v.gate.open || v.p >= 1) continue;
      if (v.p === 0) for (const m of v.solid) { const i = this.blockers.indexOf(m); if (i >= 0) this.blockers.splice(i, 1); } // open: the camera may pass
      v.p = Math.min(1, v.p + dt / OPEN_TIME);
      this.pose(v);
    }

    if (this.quest.chestOpen && this.lidP < LOOT) {
      this.lidP = Math.min(LOOT, this.lidP + dt);
      this.opening(this.lidP, dt);
    }
    this.glint.visible = this.quest.accepted && !this.quest.chestOpen; // the key shines once someone is looking for it
    this.glint.rotation.y += dt * 2;
    this.glint.position.y = CHEST.h + 0.45 + Math.sin(performance.now() * 0.003) * 0.08;

    const fighting = (this.bossShown = boss.state !== 'pray' && boss.state !== 'dead' && boss.state !== 'evade');
    this.bossEl.style.display = fighting ? 'block' : 'none';
    if (fighting && this.bossName !== boss.kind) { // whose bar: the Reverendissimo's, then the Governatrice's
      this.bossName = boss.kind;
      this.bossEl.firstChild!.textContent = boss.kind.phases?.marks ? 'Il Reverendissimo' : 'La Governatrice';
    }
    if (fighting) {
      this.bossFill.style.width = `${(boss.hp / boss.kind.hp) * 100}%`;
      this.bossText.textContent = `${Math.ceil(boss.hp)} / ${boss.kind.hp}`;
    }
    return notices;
  }

  /** The lid is thrown open: a flash and a fountain of gold out of the chest. */
  private loot(): void {
    const { x, y, z } = this.chest.position, top = y + this.lid.position.y;
    playSfx('chest_open', { x, y: top, z });
    this.vfx.spawn(goldFlare, x, top + 0.2, z);
    this.vfx.burst(goldSpark, x, top, z, 40, 0.3, 4.5, 3);
    this.vfx.burst(goldGlow, x, top, z, 10, 0.3, 0.6, 0.8);
    this.vfx.pulse(x, top + 0.6, z, GOLD, 40);
    this.vfx.shake(0.15);
  }

  /** `t` s into the opening: the lid swings up and back, the hollow glows, the key rises out spinning and fades into the hero's hands. */
  private opening(t: number, dt = 0): void {
    const p = Math.min(1, t / 0.6), e = 1 - (1 - p) ** 3; // fast, then settling
    this.lid.rotation.x = -e * 1.9 - Math.sin(p * Math.PI) * 0.12; // a little overshoot as it is flung
    const glow = Math.max(0, 1 - Math.abs(t - 0.5) / 1.4);
    (this.inside.material as THREE.MeshBasicMaterial).color.setHex(0x120a05).lerp(new THREE.Color(GOLD).multiplyScalar(2), glow);
    const k = this.key, r = THREE.MathUtils.clamp((t - 0.25) / 1.2, 0, 1);
    k.visible = t > 0.25 && t < LOOT;
    k.position.y = this.lid.position.y + 0.1 + r * 0.9;
    k.rotation.y = t * 5;
    k.scale.setScalar(1.6 * (t < LOOT - 0.5 ? 1 : (LOOT - t) / 0.5));
    if (t > 0.25 && t < 1.6) {
      const { x, z } = this.chest.position;
      for (let i = this.vfx.count(30, dt); i > 0; i--) this.vfx.spawn(goldMote, x + (Math.random() - 0.5) * 0.8, k.position.y - 0.2, z + (Math.random() - 0.5) * 0.5, 0, 0.6, 0);
    }
    if (t === LOOT) {
      playSfx('key');
    }
  }

  private pose(v: GateView, p = v.p): void {
    const e = p * p * (3 - 2 * p);
    if (v.gate.kind === 'chain') { // the strands thin to nothing and drop
      const c = v.leaves[0] as THREE.Mesh;
      (c.material as THREE.MeshBasicMaterial).opacity = 1 - e;
      c.position.y = -e * 0.6;
      c.visible = e < 1;
    } else if (v.gate.kind === 'grate') v.leaves[0].position.y = e * (v.gate.h - 0.1); // up into the wall above
    else for (const l of v.leaves) l.rotation.y = l.userData.side * SWING[v.gate.id as keyof typeof SWING] * e * 1.75;
  }

  /** A loaded game: gates already open and the chest already emptied, without playing the openings. */
  settle(): void {
    this.paidOut = this.quest.done.length; // paid when they were done
    for (const v of this.gates) if (v.gate.open) { v.p = 1; this.pose(v); for (const m of v.solid) { const i = this.blockers.indexOf(m); if (i >= 0) this.blockers.splice(i, 1); } }
    if (this.quest.chestOpen) { this.lidP = LOOT; this.opening(LOOT); }
  }

  /**
   * The intro's camera (camera/intro.ts) flies through shut gates: each one opens as `eye` comes
   * near and shuts again behind it, for show only, the quest's state untouched. null puts them back.
   */
  peek(eye: THREE.Vector3 | null): void {
    for (const v of this.gates) {
      if (v.gate.open) continue;
      const c = this.quest.centre(v.gate);
      this.pose(v, eye ? 1 - THREE.MathUtils.smoothstep(Math.hypot(eye.x - c.x, eye.z - c.z), 4, 12) : v.p);
    }
  }

  /** The banner: the Reverendissimo's fall, or (`second`) the Governatrice's. */
  victory(second = false): void {
    if (second) this.victoryEl.innerHTML = 'La Governatrice è caduta<small>Il velo si scioglie: il portone delle Zitelle si apre sulla fondamenta</small>';
    this.victoryEl.classList.remove('show');
    void this.victoryEl.offsetWidth; // replay the fade
    this.victoryEl.classList.add('show');
  }
}

/** The key of the chiostro grande: old gold, a ring bow with a cross in it, a long shank, a toothed bit; glowing. */
function key(): THREE.Group {
  const gold = new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(1.6), fog: false });
  const g = new THREE.Group();
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.016, 8, 20), gold);
  bow.position.y = 0.17;
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.1, 0.012), gold), bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.012), gold);
  cross.position.y = bar.position.y = 0.17;
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.26, 8), gold);
  shank.position.y = 0.0;
  const bit = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.014), gold);
  bit.position.set(0.035, -0.09, 0);
  g.add(bow, cross, bar, shank, bit);
  return g;
}
