import * as THREE from 'three';
import { loadModel, stand } from '../core/models.ts';
import type { Mark } from './progress.ts';

// Fra' Zuane on the fondamenta (see quest/dialogue.ts for who he is): a Meshy ghost of an old
// Capuchin porter, rigged with Meshy and animated from its library. He breathes in place, turns
// to whoever talks to him and talks with his hands, and wears WoW's gold "!" while a quest is
// on offer, its gold "?" while one is ready to hand in. Not a mob: no collider beyond his own small box (quest/progress.ts), no health, and
// nothing in the game targets or hurts him. Fra' Bortolo in the serra is the same ghost glowing
// green, and Mastro Iseppo in the squero a Meshy boatwright glowing like a lantern: `Npc` takes where it stands, the tint and the body.
// A body with no talking clips (an enemy's, like the Fanalista's drowned sailor) talks with its Pray and Idle instead.
// He stands wherever his spot is (the Cardinale's moves with his procession, quest/escort.ts), and `cheer` has him gesture
// to the world a while, facing his own way (the Cardinale crowned on the Bacino).

const HEIGHT = 1.75;
const FADE = 0.4; // s between idle and talking
const TURN = 4; // rad/s toward the player while talking
const GHOST = 0x8fdcff; // Fra' Zuane's self-glow

/** The gold `ch` ("!" or "?") over a quest giver's head, drawn on a canvas. */
function marker(ch: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d')!;
  g.font = 'bold 112px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = '#1a0d00';
  g.strokeText(ch, 32, 68);
  const grad = g.createLinearGradient(0, 16, 0, 120);
  grad.addColorStop(0, '#fff3a0'); grad.addColorStop(0.5, '#ffd200'); grad.addColorStop(1, '#c07a00');
  g.fillStyle = grad;
  g.fillText(ch, 32, 68);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), fog: false, depthWrite: false }));
  s.material.map!.colorSpace = THREE.SRGBColorSpace;
  // WoW-sized; nearer than 6 m it shrinks with the distance so a close camera keeps it at the same screen size (one frame late)
  const at = new THREE.Vector3();
  s.scale.set(0.6, 1.2, 1);
  s.onBeforeRender = (_r, _s, cam) => {
    const k = Math.min(1, cam.position.distanceTo(s.getWorldPosition(at)) / 6);
    s.scale.set(0.6 * k, 1.2 * k, 1);
  };
  return s;
}

/** Where an NPC stands and faces at rest (`y`: his floor, when raised). */
export interface Spot { x: number; y?: number; z: number; yaw: number }

export class Npc {
  readonly root = new THREE.Group();
  private at: Spot;
  private mixer?: THREE.AnimationMixer;
  private idle?: THREE.AnimationAction;
  private talks: THREE.AnimationAction[] = [];
  private current?: THREE.AnimationAction;
  private marks = { offer: marker('!'), ready: marker('?') };
  private time = 0;
  talking = false;
  /** s left of gesturing to the world, not to the hero. */
  cheer = 0;

  /** `tint`: the colour his body glows; `model`: his body (public/models), with Idle, Talk_Open and Talk_Right clips (else Pray and Idle). */
  constructor(at: Spot, tint = GHOST, model = 'zuane.glb') {
    this.at = at;
    this.root.position.set(at.x, at.y ?? 0, at.z);
    this.root.rotation.y = at.yaw;
    for (const m of Object.values(this.marks)) this.root.add(m);
    loadModel(model).then((gltf) => {
      const model = gltf.scene;
      stand(model, HEIGHT);
      model.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const m = o.material as THREE.MeshStandardMaterial;
        m.emissive.setHex(tint); // the colour map glows: a ghost at night
        m.emissiveIntensity = 0.75; // the Meshy bodies' maps are pale: more and their faces wash out
      });
      this.root.add(model);
      this.mixer = new THREE.AnimationMixer(model);
      const act = (...names: string[]) => this.mixer!.clipAction(names.map((n) => THREE.AnimationClip.findByName(gltf.animations, n)).find((c) => c) ?? gltf.animations[0]);
      this.idle = act('Idle');
      this.talks = [act('Talk_Open', 'Pray', 'Idle'), act('Talk_Right', 'Idle')];
      this.play(this.idle);
    });
  }

  private play(a: THREE.AnimationAction): void {
    if (a === this.current) return;
    a.reset().play();
    if (this.current) a.crossFadeFrom(this.current, FADE, false);
    this.current = a;
  }

  /** `player`: the hero's feet; `mark`: the "!" or "?" over his head (Quest.marks). */
  update(dt: number, player: THREE.Vector3, mark: Mark): void {
    const at = this.at;
    this.time += dt;
    this.cheer = Math.max(0, this.cheer - dt);
    this.root.position.set(at.x, at.y ?? 0, at.z);
    for (const [k, m] of Object.entries(this.marks)) {
      m.visible = k === mark && !this.talking;
      m.position.y = HEIGHT + 0.85 + Math.sin(this.time * 2.5) * 0.06;
    }
    const want = this.talking ? Math.atan2(-(player.x - at.x), -(player.z - at.z)) : at.yaw;
    const d = Math.atan2(Math.sin(want - this.root.rotation.y), Math.cos(want - this.root.rotation.y));
    this.root.rotation.y += Math.sign(d) * Math.min(Math.abs(d), TURN * dt);
    if (!this.mixer || !this.idle) return;
    // Talking: one gesture clip after another, alternating, until the window closes.
    const busy = this.talking || this.cheer > 0;
    if (busy && (this.current === this.idle || this.current!.time > this.current!.getClip().duration - FADE)) {
      this.play(this.talks[this.current === this.talks[0] ? 1 : 0]);
    } else if (!busy) this.play(this.idle);
    this.mixer.update(dt);
  }
}
