import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Priest } from '../enemies/caster.ts';
import { T, type Style, type Vfx } from '../abilities/vfx.ts';
import { loadModel } from '../core/models.ts';
import { playSfx } from '../audio/engine.ts';
import { Dialogue } from '../ui/dialogue.ts';
import { OBJECTIVE, QUEST_TITLE } from './dialogue.ts';
import { Npc } from './npc.ts';
import { CHEST, NPC, type Gate, type Quest, type Stage } from './progress.ts';

// What the player sees of the quest: iron grates that slide up into the wall, wooden door
// leaves that swing open, the chest on the pontile (a Meshy reliquary chest whose lid swings
// open on a burst of gold, the key rising out of it; a gold glint over it while the quest wants
// it), Fra' Zuane and his dialogue window, the quest tracker, the "F" interaction prompt (also a
// tap target on phones), the boss's health bar and the victory banner. Its few DOM pieces are
// styled here so they stay out of the HUD's way.

const OPEN_TIME = 1.6; // s for a gate to open
const SWING = { portone: -1, coro: 1 }; // door leaves swing into the church: -Z behind the facade, +Z off the choir wall
const GOLD = 0xffd36a;
const LOOT = 2.2; // s of the chest's opening: lid, burst, the key rising and fading

const goldSpark: Style = { life: [0.6, 1.2], size: [0.05, 0.09], color: 0xfff0b0, color2: 0xff9a20, hdr: 4, tex: T.spark, stretch: 0.04, drag: 1.5, grav: 2 };
const goldMote: Style = { life: [1.2, 2], size: [0.08, 0.16], color: GOLD, color2: 0xff7a10, hdr: 3, tex: T.ember, drag: 0.6, grav: -0.8 };
const goldFlare: Style = { life: 0.5, size: 2.4, grow: 0.6, color: 0xfff4c8, color2: GOLD, hdr: 3, tex: T.star, fadeIn: 0.05 };
const goldGlow: Style = { life: [0.6, 0.9], size: [0.5, 0.8], grow: 1.8, color: GOLD, color2: 0x803000, hdr: 2, drag: 2, grav: -1.5 };

const CSS = `
#quest-prompt { position: fixed; left: 50%; bottom: 26%; transform: translateX(-50%); padding: 7px 16px;
  font: 600 15px/1.2 Georgia, serif; color: #f3e6c4; background: rgba(12, 8, 6, .78); border: 1px solid #8a6a3a;
  border-radius: 6px; text-shadow: 0 1px 2px #000; pointer-events: none; display: none; white-space: nowrap; z-index: 5; }
#quest-prompt.act { pointer-events: auto; cursor: pointer; border-color: #e0b55a; }
#quest-prompt kbd { display: inline-block; min-width: 1.3em; margin-right: 8px; padding: 1px 5px; font: 700 13px/1.2 sans-serif;
  color: #1a1208; background: #e0b55a; border-radius: 3px; text-align: center; }
body.touch #quest-prompt kbd { display: none; }
#boss { position: fixed; left: 50%; top: 56px; transform: translateX(-50%); width: min(460px, 80vw); display: none;
  text-align: center; font: 700 15px/1.3 Georgia, serif; color: #f0d8ff; text-shadow: 0 1px 3px #000; pointer-events: none; z-index: 5; }
#boss .bar { position: relative; height: 14px; margin-top: 4px; background: #1a0d14; border: 1px solid #6a3c8a; border-radius: 3px; overflow: hidden; }
#boss .bar i { position: absolute; inset: 0 auto 0 0; background: linear-gradient(#d23a3a, #7a1414); }
#boss .bar span { position: relative; font: 600 11px/14px sans-serif; color: #fff; }
#victory { position: fixed; left: 0; right: 0; top: 30%; text-align: center; pointer-events: none; display: none; z-index: 5;
  font: 700 38px/1.2 Georgia, serif; color: #ffe39a; text-shadow: 0 0 18px #a06a10, 0 2px 4px #000; }
#victory small { display: block; margin-top: 10px; font-size: 18px; color: #f3e6c4; }
#victory.show { display: block; animation: victory 8s ease forwards; }
#quests { position: absolute; top: calc(100% + 34px); right: -6px; width: 230px; text-align: right; pointer-events: none;
  font: 13px/1.35 Georgia, serif; color: #f3e6c4; text-shadow: 0 1px 2px #000, 0 0 6px #000; }
#quests b { display: block; font-size: 14px; color: #ffd200; }
#quests span::before { content: '- '; }
#quests span.new { animation: quest-new 1.6s ease-out; }
@keyframes quest-new { 0% { color: #fff; text-shadow: 0 0 10px #ffd200; } }
#quests.done span { color: #7dff64; }
body.touch #quests { top: 0; right: calc(100% + 16px); width: 190px; font-size: 12px; }
body.diablo #quests b { color: #e9d6b0; }

@keyframes victory { 0% { opacity: 0; } 8% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
`;

/** One gate's meshes and its opening animation. */
interface GateView { gate: Gate; root: THREE.Group; leaves: THREE.Object3D[]; p: number }

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
  private npc = new Npc();
  private talk = new Dialogue({ name: NPC.name, portrait: `${import.meta.env.BASE_URL}models/zuane.webp` });
  private trackEl = document.createElement('div');
  private stage?: Stage;
  private promptEl = document.createElement('div');
  private bossEl = document.createElement('div');
  private bossFill: HTMLElement;
  private bossText: HTMLElement;
  private victoryEl = document.createElement('div');
  /** The boss bar is up: the target frame and the boss's own nameplate bar give way to it. */
  bossShown = false;
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
    this.root.add(chest, this.npc.root);

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
    document.body.append(this.promptEl, this.bossEl, this.victoryEl);
    (document.getElementById('minimap') ?? document.body).append(this.trackEl); // under the minimap, like WoW's tracker
    this.talk.onClose = () => { this.npc.talking = false; };
  }

  /** Fra' Zuane's window is up: the game holds still behind it, but he keeps talking. */
  get talking(): boolean {
    return this.talk.open;
  }

  /** While the world is paused for the dialogue (main.ts): only the speaker moves. */
  idle(dt: number, player: THREE.Vector3): void {
    this.npc.update(dt, player, this.quest.stage);
  }

  /** The tracker's lines; `fresh` flashes the objective as new. */
  private track(stage: Stage, fresh: boolean): void {
    this.trackEl.classList.toggle('done', stage === 'done');
    this.trackEl.innerHTML = `<b>${QUEST_TITLE}</b><span class="${fresh ? 'new' : ''}">${OBJECTIVE[stage]}</span>`;
  }

  private gate(g: Gate, iron: THREE.Material): GateView {
    const root = new THREE.Group();
    const c = this.quest.centre(g);
    root.position.set(c.x, g.y0, c.z);
    root.rotation.y = g.axis === 'x' ? 0 : Math.PI / 2; // local X runs along the wall
    const leaves: THREE.Object3D[] = [];
    if (g.kind === 'grate') {
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
        hinge.userData.side = s;
        root.add(hinge);
        leaves.push(hinge);
      }
    }
    this.root.add(root);
    return { gate: g, root, leaves, p: 0 };
  }

  /** `pressed('KeyF')` (or a tap on the prompt) uses whatever is at hand; returns a notice to show, if any. */
  update(dt: number, player: THREE.Vector3, pressed: (code: string) => boolean, boss: Priest): string[] {
    const notices: string[] = [];
    const pr = this.quest.prompt(player);
    if ((pressed('KeyF') || this.tapped) && pr?.act) {
      const n = pr.act();
      if (n) notices.push(n);
      if (pr.talk) {
        this.npc.talking = true;
        this.talk.show(this.quest.stage, () => this.quest.accepted = true);
      }
      if (this.quest.chestOpen && this.lidP === 0) this.loot();
    }
    this.tapped = false;
    this.quest.update(player);
    const stage = this.quest.stage;
    if (stage !== this.stage) {
      if (this.stage) notices.push(this.stage === 'talk' ? `Missione accettata: ${QUEST_TITLE}` : stage === 'done' ? `Missione compiuta: ${QUEST_TITLE}` : OBJECTIVE[stage]);
      if (this.stage) playSfx('quest', null, stage === 'done' ? { rate: 0.84, gain: 1.3 } : {}); // complete: lower and fuller
      this.track(stage, !!this.stage);
      this.stage = stage;
    }
    this.npc.update(dt, player, stage);
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
    if (v.gate.kind === 'grate') v.leaves[0].position.y = e * (v.gate.h - 0.1); // up into the wall above
    else for (const l of v.leaves) l.rotation.y = l.userData.side * SWING[v.gate.id as keyof typeof SWING] * e * 1.75;
  }

  /** A loaded game: gates already open and the chest already emptied, without playing the openings. */
  settle(): void {
    for (const v of this.gates) if (v.gate.open) { v.p = 1; this.pose(v); }
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

  victory(): void {
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
