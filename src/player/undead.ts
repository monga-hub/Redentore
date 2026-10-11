import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { PLAYER } from '../core/physics.ts';

// The hero: a Forsaken-style undead warrior generated and auto-rigged with Meshy AI (see
// ATTRIBUTION.md), its Walking and Running clips merged into one meshopt/WebP GLB.
// Loaded async; `root` stays empty until the GLB arrives.
// The model faces +Z; the controller's yaw 0 faces -Z, so it is turned round.

const URL = `${import.meta.env.BASE_URL}models/reietto.glb`; // public/, under Vite's base
// ponytail: the export has only Walking and Running, so idle and air are frames of those held
// still (`at`: s into the clip). Swap in Meshy's Idle and Jump clips once exported.
const CLIPS: Record<'idle' | 'walk' | 'run' | 'air', { name: string; at?: number }> = {
  idle: { name: 'Walking', at: 0.05 }, // passing frame, feet together
  walk: { name: 'Walking' },
  run: { name: 'Running' },
  air: { name: 'Running', at: 0.25 },
};
type State = keyof typeof CLIPS;
const FADE = 0.2;

// Caduta d'ossa. ponytail: no attack clip in the export yet, so the swing is a keyed torso twist
// and right-arm chop played additively over locomotion: wound up at 0.06 s, through the body by
// 0.12 s, recovered at 0.7 s (inside the 1 s swing rate). Replace with Meshy's attack clip.
const SWING_T = [0, 0.06, 0.12, 0.25, 0.7];
const SWING: [bone: string, axis: THREE.Vector3, angles: number[]][] = [
  ['mixamorigSpine1', new THREE.Vector3(0, 1, 0), [0, 0.45, -0.2, -0.5, 0]],
  ['mixamorigSpine2', new THREE.Vector3(0, 1, 0), [0, 0.3, -0.15, -0.35, 0]],
  ['mixamorigRightArm', new THREE.Vector3(1, 0, 0), [0, -1.6, -0.9, 0.2, 0]],
  ['mixamorigRightForeArm', new THREE.Vector3(1, 0, 0), [0, -0.9, -0.2, 0, 0]],
];

const swingClip = () => new THREE.AnimationClip('Swing', SWING_T.at(-1), SWING.map(([bone, axis, angles]) =>
  new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, SWING_T,
    angles.flatMap((a) => new THREE.Quaternion().setFromAxisAngle(axis, a).toArray()))));

export class UndeadModel {
  readonly root = new THREE.Group();
  private mixer?: THREE.AnimationMixer;
  private actions = {} as Record<State, THREE.AnimationAction>;
  private state?: State;
  private swing?: THREE.AnimationAction;

  constructor() {
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(URL, (gltf) => {
      const model = gltf.scene;
      model.rotation.y = Math.PI;
      const box = new THREE.Box3().setFromObject(model); // bind pose
      const k = PLAYER.height / (box.max.y - box.min.y);
      model.scale.setScalar(k);
      model.position.y = -box.min.y * k; // feet on y = 0
      model.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        o.castShadow = true;
        o.frustumCulled = false; // skinned: the bind-pose bounds don't follow the animation
      });
      this.mixer = new THREE.AnimationMixer(model);
      for (const [s, c] of Object.entries(CLIPS) as [State, (typeof CLIPS)[State]][]) {
        const clip = THREE.AnimationClip.findByName(gltf.animations, c.name);
        if (!clip) continue;
        // a held frame needs its own action: clipAction() would hand back the moving one
        const a = this.mixer.clipAction(c.at === undefined ? clip : clip.clone());
        if (c.at !== undefined) { a.time = c.at; a.timeScale = 0; }
        this.actions[s] = a;
      }
      this.swing = this.mixer.clipAction(swingClip(), undefined, THREE.AdditiveAnimationBlendMode);
      this.swing.setLoop(THREE.LoopOnce, 1);
      this.root.add(model);
    }, undefined, (e) => console.error('player model failed to load', e));
  }

  /** Play the main-attack swing once over whatever the legs are doing. */
  attack(): void {
    this.swing?.reset().play();
  }

  /** `speed`: horizontal m/s this frame; `grounded`: feet on the floor. */
  animate(dt: number, speed: number, grounded: boolean): void {
    if (!this.mixer) return;
    const next: State = !grounded ? 'air' : speed < 0.3 ? 'idle' : speed < 4 ? 'walk' : 'run';
    if (next !== this.state) {
      const from = this.state && this.actions[this.state], to = this.actions[next];
      to.reset().play();
      to.time = CLIPS[next].at ?? 0; // reset() rewinds a held frame too
      if (from) to.crossFadeFrom(from, FADE, false);
      this.state = next;
    }
    // ponytail: stride matched by timeScale against the clips' authored pace (≈2.5 / 6 m/s)
    if (next === 'walk') this.actions.walk.timeScale = speed / 2.5;
    if (next === 'run') this.actions.run.timeScale = speed / 6;
    this.mixer.update(dt);
  }
}
