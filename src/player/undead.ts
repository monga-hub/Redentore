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

export class UndeadModel {
  readonly root = new THREE.Group();
  private mixer?: THREE.AnimationMixer;
  private actions = {} as Record<State, THREE.AnimationAction>;
  private state?: State;

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
      this.root.add(model);
    }, undefined, (e) => console.error('player model failed to load', e));
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
    this.mixer.update(dt);
  }
}
