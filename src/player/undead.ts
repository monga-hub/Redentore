import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PLAYER } from '../core/physics.ts';

// The hero: KayKit "Skeleton Rogue" (CC0, see ATTRIBUTION.md), a hooded undead with its own
// skinned animation set. Loaded async; `root` stays empty until the GLB arrives.
// The model faces +Z with feet at y = 0; the controller's yaw 0 faces -Z, so it is turned round.

const URL = `${import.meta.env.BASE_URL}models/skeleton_rogue.glb`; // public/, under Vite's base
const CLIPS = { idle: 'Idle', walk: 'Walking_A', run: 'Running_A', air: 'Jump_Idle' } as const;
type State = keyof typeof CLIPS;
const FADE = 0.2;

// Caduta d'ossa: the horizontal slice, entered past its windup so the blade crosses the body
// ~0.1 s after the key press (the damage and the bone crescent are instant) and fully recovered
// at ~0.7 s, inside the 1 s swing rate. Hand speed peaks at 0.27 s into the authored clip.
const ATTACK = { clip: '1H_Melee_Attack_Slice_Horizontal', from: 0.12, rate: 1.4, in: 0.06, out: 0.18 };
// Bones above the hips (track names lose their dots: "upperarm.l" -> "upperarml").
const UPPER = /^(spine|chest|head|upperarm|lowerarm|wrist|hand|elbowIK)/;
/** Weight that gives an action share `k` of a track the locomotion (total weight 1) also drives. */
const over = (k: number) => k / (1 - Math.min(k, 0.99));

export class UndeadModel {
  readonly root = new THREE.Group();
  private mixer?: THREE.AnimationMixer;
  private actions = {} as Record<State, THREE.AnimationAction>;
  private state?: State;
  // The attack plays as two layers over locomotion: the upper body always, the legs only while
  // standing still, so running keeps its stride under the swing instead of skating.
  private upper?: THREE.AnimationAction;
  private lower?: THREE.AnimationAction;
  private attackT = -1; // s into the swing, -1 = not swinging
  private still = 1; // 0..1, eased: how much of the legs the swing takes over

  constructor() {
    new GLTFLoader().load(URL, (gltf) => {
      const model = gltf.scene;
      model.rotation.y = Math.PI;
      const h = new THREE.Box3().setFromObject(model).max.y; // bind-pose height (hood tip)
      model.scale.setScalar(PLAYER.height / h);
      model.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        o.castShadow = true;
        o.frustumCulled = false; // skinned: the bind-pose bounds don't follow the animation
      });
      this.mixer = new THREE.AnimationMixer(model);
      for (const [k, name] of Object.entries(CLIPS) as [State, string][]) {
        const clip = THREE.AnimationClip.findByName(gltf.animations, name);
        if (clip) this.actions[k] = this.mixer.clipAction(clip);
      }
      const swing = THREE.AnimationClip.findByName(gltf.animations, ATTACK.clip);
      if (swing) {
        const layer = (name: string, keep: boolean) => {
          const a = this.mixer!.clipAction(new THREE.AnimationClip(`${swing.name}_${name}`, swing.duration,
            swing.tracks.filter((t) => UPPER.test(t.name) === keep)));
          a.setLoop(THREE.LoopOnce, 1);
          a.clampWhenFinished = true;
          return a;
        };
        this.upper = layer('upper', true);
        this.lower = layer('lower', false);
      }
      this.root.add(model);
    }, undefined, (e) => console.error('player model failed to load', e));
  }

  /** Play the main-attack swing once over whatever the legs are doing. */
  attack(): void {
    if (!this.upper || !this.lower) return;
    for (const a of [this.upper, this.lower]) {
      a.reset().setEffectiveWeight(0).play();
      a.time = ATTACK.from;
      a.timeScale = ATTACK.rate;
    }
    this.attackT = 0;
  }

  /** `speed`: horizontal m/s this frame; `grounded`: feet on the floor. */
  animate(dt: number, speed: number, grounded: boolean): void {
    if (!this.mixer) return;
    const next: State = !grounded ? 'air' : speed < 0.3 ? 'idle' : speed < 4 ? 'walk' : 'run';
    if (next !== this.state) {
      const from = this.state && this.actions[this.state], to = this.actions[next];
      to.reset().play();
      if (from) to.crossFadeFrom(from, FADE, false);
      this.state = next;
    }
    // ponytail: stride matched by timeScale against the clips' authored pace (≈2.5 / 6 m/s)
    if (next === 'walk') this.actions.walk.timeScale = speed / 2.5;
    if (next === 'run') this.actions.run.timeScale = speed / 6;
    this.still += ((next === 'idle' ? 1 : 0) - this.still) * Math.min(1, dt / FADE);
    if (this.attackT >= 0 && this.upper && this.lower) {
      const t = (this.attackT += dt), end = (this.upper.getClip().duration - ATTACK.from) / ATTACK.rate;
      if (t >= end) {
        this.upper.stop();
        this.lower.stop();
        this.attackT = -1;
      } else {
        const k = Math.max(0, Math.min(1, t / ATTACK.in, (end - t) / ATTACK.out)); // fade in, hold, fade out
        this.upper.setEffectiveWeight(over(k));
        this.lower.setEffectiveWeight(over(k * this.still));
      }
    }
    this.mixer.update(dt);
  }
}
