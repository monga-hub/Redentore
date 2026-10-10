import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { material } from '../level/materials.ts';
import type { Priest } from '../enemies/caster.ts';
import { CHEST, type Gate, type Quest } from './progress.ts';

// What the player sees of the quest: iron grates that slide up into the wall, wooden door
// leaves that swing open, the chest on the pontile (a gold glint until it is opened), the
// "F" interaction prompt (also a tap target on phones), the boss's health bar and the victory
// banner. Its few DOM pieces are styled here so they stay out of the HUD's way.

const OPEN_TIME = 1.6; // s for a gate to open
const SWING = { portone: -1, coro: 1 }; // door leaves swing into the church: -Z behind the facade, +Z off the choir wall
const GOLD = 0xffd36a;

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
  private promptEl = document.createElement('div');
  private bossEl = document.createElement('div');
  private bossFill: HTMLElement;
  private bossText: HTMLElement;
  private victoryEl = document.createElement('div');
  private shown = '';
  private tapped = false;

  constructor(quest: Quest) {
    this.quest = quest;
    const iron = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.55, metalness: 0.75 });
    this.gates = quest.gates.map((g) => this.gate(g, iron));

    // The chest: a wooden box with iron bands and a hinged lid; a key glints inside.
    const chest = new THREE.Group();
    chest.position.set(CHEST.x, CHEST.y, CHEST.z);
    const wood = material('wood');
    const body = new THREE.Mesh(new THREE.BoxGeometry(CHEST.w, CHEST.h * 0.62, CHEST.d), wood);
    body.position.y = CHEST.h * 0.31;
    for (const x of [-0.35, 0.35]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.06, CHEST.h * 0.64, CHEST.d + 0.03), iron);
      band.position.set(x * CHEST.w, CHEST.h * 0.31, 0);
      chest.add(band);
    }
    const top = new THREE.Mesh(new THREE.CylinderGeometry(CHEST.d / 2, CHEST.d / 2, CHEST.w, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), wood);
    top.position.z = CHEST.d / 2; // the lid hinges on its back edge
    this.lid.add(top);
    this.lid.position.set(0, CHEST.h * 0.62, -CHEST.d / 2);
    this.glint = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(3), fog: false }));
    this.glint.position.y = CHEST.h + 0.45;
    chest.add(body, this.lid, this.glint);
    chest.traverse((o) => { o.castShadow = true; });
    this.root.add(chest);

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
    document.body.append(this.promptEl, this.bossEl, this.victoryEl);
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
  update(dt: number, player: { x: number; y: number; z: number }, pressed: (code: string) => boolean, boss: Priest): string | undefined {
    let notice: string | undefined;
    const pr = this.quest.prompt(player);
    if ((pressed('KeyF') || this.tapped) && pr?.act) notice = pr.act() || undefined;
    this.tapped = false;
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
      const e = v.p * v.p * (3 - 2 * v.p);
      if (v.gate.kind === 'grate') v.leaves[0].position.y = e * (v.gate.h - 0.1); // up into the wall above
      else for (const l of v.leaves) l.rotation.y = l.userData.side * SWING[v.gate.id as keyof typeof SWING] * e * 1.75;
    }

    if (this.quest.chestOpen && this.lidP < 1) this.lidP = Math.min(1, this.lidP + dt * 1.5);
    this.lid.rotation.x = -this.lidP * 1.9;
    this.glint.visible = !this.quest.chestOpen;
    this.glint.rotation.y += dt * 2;
    this.glint.position.y = CHEST.h + 0.45 + Math.sin(performance.now() * 0.003) * 0.08;

    const fighting = boss.state !== 'pray' && boss.state !== 'dead' && boss.state !== 'evade';
    this.bossEl.style.display = fighting ? 'block' : 'none';
    if (fighting) {
      this.bossFill.style.width = `${(boss.hp / boss.kind.hp) * 100}%`;
      this.bossText.textContent = `${Math.ceil(boss.hp)} / ${boss.kind.hp}`;
    }
    return notice;
  }

  victory(): void {
    this.victoryEl.classList.add('show');
  }
}
