import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { PLAYER } from '../core/physics.ts';

// The hero: a Forsaken-style undead warrior generated, auto-rigged and animated with Meshy AI
// (see ATTRIBUTION.md), every clip merged into one meshopt/WebP GLB.
// Loaded async; `root` stays empty until the GLB arrives.
// The model faces +Z; the controller's yaw 0 faces -Z, so it is turned round.

const URL = `${import.meta.env.BASE_URL}models/reietto.glb`; // public/, under Vite's base
const CLIPS = { idle: 'Idle', walk: 'Walking', run: 'Running', air: 'Jump_Run' } as const;
type State = keyof typeof CLIPS;
const FADE = 0.2;
// Airborne: the running jump's flight, from takeoff (s into the clip) at a slow rate so a fall
// of any length stays in the air pose.
const AIR = { from: 0.55, rate: 0.6 };

// One-shots layered over locomotion: the upper body always, the legs only while standing still,
// so running keeps its stride under the swing instead of skating. Times are s into the clip:
// played from `from`, its blow at `hit`, cut at `stop`; `in`/`out`: fade times.
// Caduta d'ossa: the right-hand slash, entered past its windup so the blow crosses the body
// 0.1 s after the key press (the damage is instant) and recovered by ~0.7 s, inside the 1 s rate.
const SLASH = { clip: 'Right_Hand_Sword_Slash', from: 0.4, hit: 0.55, stop: 1.5, in: 0.06, out: 0.18 };
// Spells: the charged cast, timed so the two-hand thrust lands as the spell goes off: the whole
// charge-up for a cast bar, only the thrust for an instant spell.
const SPELL = { clip: 'Charged_Spell_Cast_1', from: 0.3, quick: 1.5, hit: 1.95, stop: 3, in: 0.15, out: 0.3 };
// Bones above the hips.
const UPPER = /^(Spine|neck|Head|head|Left(Shoulder|Arm|ForeArm|Hand)|Right(Shoulder|Arm|ForeArm|Hand))/;
/** Weight that gives an action share `k` of a track the locomotion (total weight 1) also drives. */
const over = (k: number) => k / (1 - Math.min(k, 0.99));

interface Shot { upper: THREE.AnimationAction; lower: THREE.AnimationAction; in: number; out: number; t: number; end: number }

export class UndeadModel {
  readonly root = new THREE.Group();
  private mixer?: THREE.AnimationMixer;
  private actions = {} as Record<State, THREE.AnimationAction>;
  private state?: State;
  private shots = new Map<string, Shot>();
  private playing?: Shot;
  private still = 1; // 0..1, eased: how much of the legs a one-shot takes over

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
      for (const [s, name] of Object.entries(CLIPS) as [State, string][]) {
        const clip = THREE.AnimationClip.findByName(gltf.animations, name);
        if (clip) this.actions[s] = this.mixer.clipAction(clip);
      }
      this.actions.air.setLoop(THREE.LoopOnce, 1);
      this.actions.air.clampWhenFinished = true;
      for (const c of [SLASH, SPELL]) {
        const clip = THREE.AnimationClip.findByName(gltf.animations, c.clip);
        if (!clip) continue;
        const layer = (part: string, keep: boolean) => {
          const a = this.mixer!.clipAction(new THREE.AnimationClip(`${clip.name}_${part}`, clip.duration,
            clip.tracks.filter((t) => UPPER.test(t.name) === keep)));
          a.setLoop(THREE.LoopOnce, 1);
          a.clampWhenFinished = true;
          return a;
        };
        this.shots.set(c.clip, { upper: layer('upper', true), lower: layer('lower', false), in: c.in, out: c.out, t: -1, end: 0 });
      }
      this.root.add(model);
    }, undefined, (e) => console.error('player model failed to load', e));
  }

  /** Play the main-attack swing once over whatever the legs are doing. */
  attack(): void {
    this.fire(SLASH.clip, SLASH.from, 0.1, SLASH.hit, SLASH.stop);
  }

  /** The spell-cast pose, its thrust landing `seconds` from now (a cast bar's length, or a few
   * tenths for an instant spell). Repeat calls while it plays are ignored; `0` cuts it short. */
  cast(seconds: number): void {
    const s = this.shots.get(SPELL.clip);
    if (!s) return;
    if (seconds <= 0) { if (this.playing === s) s.end = Math.min(s.end, s.t + s.out); return; }
    if (this.playing !== s) this.fire(SPELL.clip, seconds > 1 ? SPELL.from : SPELL.quick, seconds, SPELL.hit, SPELL.stop);
  }

  /** Start a one-shot at clip time `from` so its `hit` comes `after` s from now; it ends at `stop`. */
  private fire(clip: string, from: number, after: number, hit: number, stop: number): void {
    const s = this.shots.get(clip);
    if (!s) return;
    if (this.playing && this.playing !== s) { this.playing.upper.stop(); this.playing.lower.stop(); }
    const rate = (hit - from) / after;
    for (const a of [s.upper, s.lower]) {
      a.reset().setEffectiveWeight(0).play();
      a.time = from;
      a.timeScale = rate;
    }
    s.t = 0;
    s.end = (stop - from) / rate;
    this.playing = s;
  }

  /** `speed`: horizontal m/s this frame; `grounded`: feet on the floor. */
  animate(dt: number, speed: number, grounded: boolean): void {
    if (!this.mixer) return;
    const next: State = !grounded ? 'air' : speed < 0.3 ? 'idle' : speed < 4 ? 'walk' : 'run';
    if (next !== this.state) {
      const from = this.state && this.actions[this.state], to = this.actions[next];
      to.reset().play();
      if (next === 'air') { to.time = AIR.from; to.timeScale = AIR.rate; }
      if (from) to.crossFadeFrom(from, FADE, false);
      this.state = next;
    }
    // stride matched by timeScale against the clips' pace (a planted foot's speed: 1.6 / 5.5 m/s)
    if (next === 'walk') this.actions.walk.timeScale = speed / 1.6;
    if (next === 'run') this.actions.run.timeScale = speed / 5.5;
    this.still += ((next === 'idle' ? 1 : 0) - this.still) * Math.min(1, dt / FADE);
    const s = this.playing;
    if (s) {
      const t = (s.t += dt);
      if (t >= s.end) {
        s.upper.stop();
        s.lower.stop();
        this.playing = undefined;
      } else {
        const k = Math.max(0, Math.min(1, t / s.in, (s.end - t) / s.out)); // fade in, hold, fade out
        s.upper.setEffectiveWeight(over(k));
        s.lower.setEffectiveWeight(over(k * this.still));
      }
    }
    this.mixer.update(dt);
  }
}
