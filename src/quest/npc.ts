import * as THREE from 'three';
import { loadModel, stand } from '../core/models.ts';
import { NPC, type Stage } from './progress.ts';

// Fra' Zuane on the fondamenta (see quest/dialogue.ts for who he is): a Meshy ghost of an old
// Capuchin porter, rigged with Meshy and animated from its library. He breathes in place, turns
// to whoever talks to him and talks with his hands, and wears WoW's gold "!" while his quest is
// on offer. Not a mob: no collider beyond his own small box (quest/progress.ts), no health, and
// nothing in the game targets or hurts him.

const HEIGHT = 1.75;
const FADE = 0.4; // s between idle and talking
const TURN = 4; // rad/s toward the player while talking
const GHOST = new THREE.Color(0x8fdcff); // the self-glow's tint

/** The gold "!" over a quest giver's head, drawn on a canvas. */
function marker(): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d')!;
  g.font = 'bold 112px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = '#1a0d00';
  g.strokeText('!', 32, 68);
  const grad = g.createLinearGradient(0, 16, 0, 120);
  grad.addColorStop(0, '#fff3a0'); grad.addColorStop(0.5, '#ffd200'); grad.addColorStop(1, '#c07a00');
  g.fillStyle = grad;
  g.fillText('!', 32, 68);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), fog: false, depthWrite: false }));
  s.material.map!.colorSpace = THREE.SRGBColorSpace;
  s.scale.set(0.3, 0.6, 1);
  return s;
}

export class Npc {
  readonly root = new THREE.Group();
  private mixer?: THREE.AnimationMixer;
  private idle?: THREE.AnimationAction;
  private talks: THREE.AnimationAction[] = [];
  private current?: THREE.AnimationAction;
  private mark = marker();
  private time = 0;
  talking = false;

  constructor() {
    this.root.position.set(NPC.x, 0, NPC.z);
    this.root.rotation.y = NPC.yaw;
    this.mark.position.y = HEIGHT + 0.55;
    this.root.add(this.mark);
    loadModel('zuane.glb').then((gltf) => {
      const model = gltf.scene;
      stand(model, HEIGHT);
      model.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const m = o.material as THREE.MeshStandardMaterial;
        m.emissive.copy(GHOST); // the colour map glows pale cyan: a ghost at night
        m.emissiveIntensity = 1.8;
      });
      this.root.add(model);
      this.mixer = new THREE.AnimationMixer(model);
      const act = (n: string) => this.mixer!.clipAction(THREE.AnimationClip.findByName(gltf.animations, n)!);
      this.idle = act('Idle');
      this.talks = ['Talk_Open', 'Talk_Right'].map(act);
      this.play(this.idle);
    });
  }

  private play(a: THREE.AnimationAction): void {
    if (a === this.current) return;
    a.reset().play();
    if (this.current) a.crossFadeFrom(this.current, FADE, false);
    this.current = a;
  }

  /** `player`: the hero's feet; `stage` decides the "!". */
  update(dt: number, player: THREE.Vector3, stage: Stage): void {
    this.time += dt;
    this.mark.visible = stage === 'talk' && !this.talking;
    this.mark.position.y = HEIGHT + 0.55 + Math.sin(this.time * 2.5) * 0.06;
    const want = this.talking ? Math.atan2(-(player.x - NPC.x), -(player.z - NPC.z)) : NPC.yaw;
    const d = Math.atan2(Math.sin(want - this.root.rotation.y), Math.cos(want - this.root.rotation.y));
    this.root.rotation.y += Math.sign(d) * Math.min(Math.abs(d), TURN * dt);
    if (!this.mixer || !this.idle) return;
    // Talking: one gesture clip after another, alternating, until the window closes.
    if (this.talking && (this.current === this.idle || this.current!.time > this.current!.getClip().duration - FADE)) {
      this.play(this.talks[this.current === this.talks[0] ? 1 : 0]);
    } else if (!this.talking) this.play(this.idle);
    this.mixer.update(dt);
  }
}
