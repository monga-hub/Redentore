import * as THREE from 'three';
import { UPPER, loadModel, over, stand } from '../core/models.ts';
import type { GearState } from '../loot/gear.ts';
import { Outfit } from './outfit.ts';
import { HEROES, type Hero } from './heroes.ts';

// The hero: a Forsaken-style undead warrior generated, auto-rigged and animated with Meshy AI
// (see ATTRIBUTION.md), every clip merged into one meshopt/WebP GLB (each hero, player/heroes.ts, on the same rig with
// his own idle, walk, run, jump, roll, swings, cast, flinches and death from Meshy's library, retimed onto the clip names
// and the moments below, so a move hits, loops and ends the same on each), dressed in what it wears (player/outfit.ts:
// the pieces, the dyes, the weapon in the right fist, his own to start). Loaded async; `root` stays empty until the GLB
// arrives.
//
// Locomotion: a hunched, heavy-breathing idle that now and then twirls the club, a crouched guard
// for a few seconds after any fight, a walk and a charging run whose stride is matched to the
// ground speed (each body's own paces, measured from the planted foot, so the feet don't skate: the
// stride builds up as he pushes off and winds down as he brakes, player/controller.ts), a running jump
// from his own clip's takeoff that lands with its own touchdown. The base clips share one weight,
// each fading in or out at the pace of the switch, so nothing pops however quickly they change.
// Moves (the combo's three swings, a cast per kind of spell, hit reactions, a roll) are layered
// over it: the upper body always, the legs only while standing still, so running keeps its stride
// underneath. A death clip takes the whole body. A fresnel shell (the aura) glows over the body
// for Velo spettrale and Patto della tomba, and flashes red on a hit.

const LOCO = { idle: 'Idle_Breathe', combat: 'Idle_Combat', fidget: 'Idle', walk: 'Walking', run: 'Run_Charge', air: 'Jump_Run' } as const;
type Loco = keyof typeof LOCO;
type State = Loco | 'land';
/**
 * Each body's clips: m/s its walk and run cover at rate 1 (a planted foot's speed under the hips, measured on the clips),
 * and its running jump's takeoff and touchdown (s into Jump_Run, where the feet leave the floor and find it again).
 */
const GAIT: Record<Hero, { walk: number; run: number; up: number; down: number }> = {
  risorto: { walk: 1.55, run: 4.52, up: 0.58, down: 0.96 },
  bortolo: { walk: 1.6, run: 4.14, up: 0.79, down: 1.12 },
  fosca: { walk: 1.55, run: 4.2, up: 0.6, down: 0.93 },
  tizian: { walk: 1.5, run: 3.16, up: 0.64, down: 0.9 },
  zanetto: { walk: 1.62, run: 3.78, up: 0.77, down: 0.99 },
};
// s each switch of the base clip takes: from standing into the stride and back, the calm stances, the takeoff, out of a landing.
const FADE = 0.22, START = 0.16, STOP = 0.3, STANCE_FADE = 0.45, TAKEOFF = 0.1, LANDED = 0.2;
const RUN_AT: [number, number] = [3.2, 3.8]; // m/s asked for: below, the walk; above, the run (between: as it was)
// Airborne: the jump's flight from takeoff to just short of touchdown over FLIGHT s (a jump's air time), held there on a longer
// fall; on the floor again, the touchdown and what follows, LAND s standing (a beat while running).
const FLIGHT = 0.6, LAND = [0.34, 0.14];
const COMBAT = 6; // s the guard lasts after a blow, a cast or a hit
const FIDGET: [number, number] = [9, 16]; // s of calm standing between two club twirls

/**
 * A move: played from `from` (s into the clip) fast enough that its blow (`hit`) lands when the
 * caller says, then on at `post` × speed to `stop`; `in`/`out` fade times. `whole`: the legs
 * follow even on the move (the roll, the death).
 */
interface Move { clip: string; from: number; hit: number; stop: number; post?: number; in: number; out: number; whole?: boolean }
const MOVES = {
  // Caduta d'ossa, a three-step combo: a forehand slash, a backhand, an overhead smash.
  slash1: { clip: 'Right_Hand_Sword_Slash', from: 0.38, hit: 0.52, stop: 1.0, post: 1.2, in: 0.05, out: 0.2 },
  slash2: { clip: 'Slash_Back', from: 0.46, hit: 0.65, stop: 1.12, post: 1.2, in: 0.05, out: 0.22 },
  slash3: { clip: 'Smash', from: 0.86, hit: 1.07, stop: 1.65, in: 0.06, out: 0.3 },
  judgment: { clip: 'Judgment', from: 0.8, hit: 1.0, stop: 1.8, in: 0.06, out: 0.35 }, // Sentenza del sepolcro: a leaping smash
  throw: { clip: 'Cast_Throw', from: 0.5, hit: 0.8, stop: 1.45, in: 0.08, out: 0.25 }, // Nube di peste: the left hand flings it
  spread: { clip: 'Cast_Spread', from: 1.1, hit: 1.6, stop: 2.3, in: 0.1, out: 0.3 }, // Velo spettrale: arms flung wide
  slam: { clip: 'Ground_Slam', from: 1.5, hit: 1.72, stop: 2.55, in: 0.06, out: 0.35 }, // Lamento della cripta
  scream: { clip: 'Scream', from: 0.55, hit: 1.0, stop: 1.95, in: 0.1, out: 0.35 }, // Patto della tomba
  roll: { clip: 'Roll', from: 1.12, hit: 1.3, stop: 1.8, in: 0.03, out: 0.25, whole: true }, // out of Passo d'ombra
  push: { clip: 'Cast_Push', from: 0.75, hit: 1.2, stop: 2.0, in: 0.06, out: 0.3 }, // a bolt leaves the hands: fire, frost, lightning
  raise: { clip: 'Cast_Raise', from: 1.45, hit: 1.9, stop: 2.55, in: 0.08, out: 0.3 }, // Rintocco: the club called up to the bell tower
  execute: { clip: 'Execute', from: 0.6, hit: 1.1, stop: 1.9, in: 0.06, out: 0.3 }, // Colpo di grazia: a two-handed cleave
  leap: { clip: 'Leap', from: 1.45, hit: 1.95, stop: 2.3, in: 0.05, out: 0.15, whole: true }, // Balzo del sepolcro, in the air
  victory: { clip: 'Victory', from: 0.05, hit: 0.4, stop: 1.5, in: 0.15, out: 0.3 },
  hitLight: { clip: 'Hit_Light', from: 0.12, hit: 0.3, stop: 0.8, in: 0.05, out: 0.2 },
  hitHeavy: { clip: 'Hit_Heavy', from: 0.45, hit: 0.8, stop: 1.4, in: 0.06, out: 0.3 },
} satisfies Record<string, Move>;
export type MoveName = keyof typeof MOVES;
/** Poses held while something lasts, looped: Fuoco fatuo's raised arms, a fireball gathered between the hands, the whirl, the charge. */
const HOLDS = { channel: 'Cast_Channel', gather: 'Cast_Gather', spin: 'Spin', rush: 'Rush' } as const;
export type Hold = keyof typeof HOLDS;
const SPIN = 13; // rad/s the whirl turns the body
const DEATH = 'Death';
const HEAVY = 50; // damage that doubles the hero over instead of a flinch
/**
 * Clips stood up, each bone turned by a world rotation vector (rad; +X tips him back, +Y swings his left shoulder back):
 * the Risorto's breath bowed his head into his ribs and rolled his shoulders in, and the helm and the pauldrons went with
 * them. His walk and run keep their shamble.
 */
export const UPRIGHT: Partial<Record<Hero, { clips: string[]; bones: Record<string, [number, number, number]> }>> = {
  risorto: {
    clips: ['Idle_Breathe', 'Idle_Combat'],
    bones: { Spine01: [0.09, 0, 0], Spine: [0.05, 0, 0], neck: [0.12, 0, 0], Head: [0.14, 0, 0], LeftShoulder: [0, 0.25, -0.1], RightShoulder: [0, -0.25, 0.1] },
  },
};

/** `up`'s bones turned through its clips: each world rotation in the bone's parent's frame at rest. */
function upright(model: THREE.Object3D, clips: THREE.AnimationClip[], up: NonNullable<(typeof UPRIGHT)[Hero]>): void {
  model.updateMatrixWorld(true);
  const pq = new THREE.Quaternion(), turn = new THREE.Quaternion(), q = new THREE.Quaternion();
  for (const [name, rot] of Object.entries(up.bones)) {
    const bone = model.getObjectByName(name), axis = new THREE.Vector3(...rot), rad = axis.length();
    if (!bone?.parent || !rad) continue;
    turn.setFromAxisAngle(axis.divideScalar(rad).applyQuaternion(bone.parent.getWorldQuaternion(pq).invert()), rad);
    for (const c of clips) {
      if (!up.clips.includes(c.name)) continue;
      const v = c.tracks.find((t) => t.name === `${name}.quaternion`)?.values;
      for (let i = 0; v && i < v.length; i += 4) q.fromArray(v, i).premultiply(turn).toArray(v, i);
    }
  }
}

interface Layer { upper: THREE.AnimationAction; lower: THREE.AnimationAction }
interface Shot { layer: Layer; move: Move; t: number; end: number; rate: number; hitAt: number; flinch: boolean }

const AURA_VERT = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>
  uniform float uPush;
  attribute vec3 aHat;
  attribute vec3 aBeak;
  uniform float uHat;
  uniform float uBeak;
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    transformed += aHat * uHat + aBeak * uBeak; // his own hat (and a mask's beak) folded away under a helm, as on him (player/outfit.ts)
    #include <skinning_vertex>
    vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
    vN = normalize(normalMatrix * objectNormal);
    mv.xyz += vN * uPush;
    vV = normalize(-mv.xyz);
    vY = (modelMatrix * vec4(transformed, 1.0)).y;
    gl_Position = projectionMatrix * mv;
  }`;
const AURA_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uK;
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    float rim = pow(max(1.0 - abs(dot(normalize(vN), vV)), 0.0), 2.2);
    float bands = 0.7 + 0.3 * sin(vY * 9.0 - uTime * 5.0);
    gl_FragColor = vec4(uColor * (rim * 1.8 + 0.1) * bands, uK);
  }`;

/** The glowing shell over the body: callers ask for a colour and strength every frame; it eases. */
export class Aura {
  readonly material = new THREE.ShaderMaterial({
    vertexShader: AURA_VERT, fragmentShader: AURA_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color() }, uK: { value: 0 }, uTime: { value: 0 }, uPush: { value: 0.025 }, uHat: { value: 0 }, uBeak: { value: 0 } },
  });
  private want = 0;
  private color = new THREE.Color();
  private k = 0;
  private hit = 0;

  /** Glow `k` (0..1) of `color` this frame; the strongest request wins. */
  set(color: number, k: number): void {
    if (k < this.want) return;
    this.want = k;
    this.color.setHex(color);
  }

  flash(): void {
    this.hit = 1;
  }

  /** Eases toward this frame's requests; returns whether the shell shows. */
  update(dt: number): boolean {
    this.k += (this.want - this.k) * Math.min(1, dt * 8);
    this.hit = Math.max(0, this.hit - dt * 5);
    const u = this.material.uniforms;
    const c = u.uColor.value as THREE.Color, h = this.hit * 1.3;
    c.copy(this.color).multiplyScalar(this.k * 1.4);
    c.r += RED.r * h; c.g += RED.g * h; c.b += RED.b * h;
    u.uK.value = 1;
    u.uTime.value += dt;
    this.want = 0;
    return this.k > 0.01 || this.hit > 0.01;
  }
}
const RED = new THREE.Color(0xff2a10);

export class UndeadModel {
  readonly root = new THREE.Group();
  readonly aura = new Aura();
  private mixer?: THREE.AnimationMixer;
  private actions = {} as Record<Loco, THREE.AnimationAction>;
  private state?: State;
  private weight = { idle: 0, combat: 0, fidget: 0, walk: 0, run: 0, air: 0 } as Record<Loco, number>;
  private fade = FADE; // s the switch under way takes
  private gaitClip: 'walk' | 'run' = 'run';
  private airT = 0;
  private landT = 0;
  private deadK = 0;
  private readonly pace: (typeof GAIT)[Hero];
  private layers = new Map<string, Layer>();
  private playing?: Shot;
  private holdK = new Map<Hold, number>();
  private holdOn = new Set<Hold>();
  private spin = 0;
  private still = 1; // 0..1, eased: how much of the legs a move takes over
  private combatT = 0;
  private calm = 0; // s standing calm, toward the next fidget
  private nextFidget = 12;
  private dying?: THREE.AnimationAction;
  private dead = false;
  private shells: THREE.Object3D[] = [];
  /** Frames left drawing the aura at nothing, so its first veil doesn't hitch (see Vfx.prime). */
  priming = 0;
  private club?: THREE.Object3D;
  private tip?: THREE.Object3D;
  private leftHand?: THREE.Object3D;
  private outfit?: Outfit;
  private worn: GearState = {};

  constructor(hero: Hero) {
    this.pace = GAIT[hero];
    loadModel(HEROES[hero].file).then((gltf) => {
      const model = gltf.scene;
      stand(model, HEROES[hero].height);
      const head = model.getObjectByName('Head');
      if (head) head.userData.crown = HEROES[hero].height - head.getWorldPosition(new THREE.Vector3()).y; // m from the joint to his crown (ui/figure.ts)
      let body: THREE.SkinnedMesh | undefined;
      model.traverse((o) => { if (o instanceof THREE.SkinnedMesh) body ??= o; });
      const up = UPRIGHT[hero];
      if (up) upright(model, gltf.animations, up);
      const outfit = (this.outfit = new Outfit(model, body!, hero));
      this.aura.material.uniforms.uHat = outfit.uniforms.uHat;
      this.aura.material.uniforms.uBeak = outfit.uniforms.uBeak;
      outfit.onWeapon = (top) => { this.tip = top; this.club = top?.parent ?? undefined; };
      outfit.wear(this.worn);
      this.leftHand = model.getObjectByName('LeftHand');
      const mixer = (this.mixer = new THREE.AnimationMixer(model));
      const clip = (name: string) => THREE.AnimationClip.findByName(gltf.animations, name);
      for (const [s, name] of Object.entries(LOCO) as [Loco, string][]) {
        const c = clip(name);
        if (c) this.actions[s] = mixer.clipAction(c).setEffectiveWeight(0).play();
      }
      for (const s of ['air', 'fidget'] as const) {
        this.actions[s].setLoop(THREE.LoopOnce, 1);
        this.actions[s].clampWhenFinished = true;
      }
      const held: string[] = Object.values(HOLDS);
      for (const name of [...new Set(Object.values(MOVES).map((m) => m.clip)), ...held]) {
        const c = clip(name);
        if (!c) continue;
        const layer = (part: string, keep: boolean) => {
          const a = mixer.clipAction(new THREE.AnimationClip(`${c.name}_${part}`, c.duration, c.tracks.filter((t) => UPPER.test(t.name) === keep)));
          if (!held.includes(name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
          else if (name === HOLDS.gather || name === HOLDS.spin) a.setLoop(THREE.LoopPingPong, Infinity); // cut from longer clips: swayed to and fro
          return a;
        };
        this.layers.set(name, { upper: layer('upper', true), lower: layer('lower', false) });
      }
      const death = clip(DEATH);
      if (death) { this.dying = mixer.clipAction(death); this.dying.setLoop(THREE.LoopOnce, 1); this.dying.clampWhenFinished = true; }
      const bodies: THREE.SkinnedMesh[] = [];
      model.traverse((o) => { if (o instanceof THREE.SkinnedMesh && o.parent) bodies.push(o); });
      for (const o of bodies) { // the aura: a skinned copy of each body mesh, sharing the skeleton
        const shell = o.clone();
        shell.material = this.aura.material;
        shell.castShadow = shell.receiveShadow = false;
        shell.userData.aura = true;
        shell.renderOrder = 2;
        o.parent!.add(shell);
        this.shells.push(shell);
      }
      this.root.add(model);
    }, (e) => console.error('player model failed to load', e));
  }

  /** Dress the hero in `worn` (now, or once the body has loaded). */
  wear(worn: GearState): void {
    this.worn = { ...worn };
    this.outfit?.wear(this.worn);
  }

  /** Play a move over whatever the legs are doing, its blow landing `after` s from now. */
  play(name: MoveName, after = 0.1): void {
    const m: Move = MOVES[name], layer = this.layers.get(m.clip);
    if (!layer) return;
    if (this.playing && this.playing.layer !== layer) { this.playing.layer.upper.stop(); this.playing.layer.lower.stop(); }
    const rate = (m.hit - m.from) / Math.max(after, 0.02), post = m.post ?? 1;
    for (const a of [layer.upper, layer.lower]) {
      a.reset().setEffectiveWeight(0).play();
      a.time = m.from;
      a.timeScale = rate;
    }
    this.playing = { layer, move: m, t: 0, rate, hitAt: after, end: after + (m.stop - m.hit) / post, flinch: name === 'hitLight' || name === 'hitHeavy' };
  }

  /** A held pose (Fuoco fatuo's raised arms by default), on while `on`. */
  channel(on: boolean, which: Hold = 'channel'): void {
    if (on) this.holdOn.add(which);
    else this.holdOn.delete(which);
  }

  private get channelOn(): boolean {
    return this.holdOn.size > 0;
  }

  /** The hero took `damage`: a flinch (unless a move is under way) and a red flash. */
  flinch(damage: number): void {
    this.aura.flash();
    this.fight();
    if (!this.dead && (!this.playing || this.playing.flinch) && !this.channelOn) this.play(damage >= HEAVY ? 'hitHeavy' : 'hitLight', damage >= HEAVY ? 0.3 : 0.15);
  }

  /** Back in the guard for a while. */
  fight(): void {
    this.combatT = COMBAT;
  }

  die(): void {
    if (!this.dying) return;
    this.dead = true;
    this.playing?.layer.upper.stop();
    this.playing?.layer.lower.stop();
    this.playing = undefined;
    this.holdOn.clear();
    this.dying.reset().setEffectiveWeight(0).play();
    this.deadK = 0;
  }

  revive(): void {
    this.dead = false;
    this.dying?.stop();
    this.state = undefined;
    for (const k of Object.keys(this.weight) as Loco[]) this.weight[k] = 0;
    this.combatT = 0;
  }

  /** The club's head (`base`, a third up) and tip in world space, for its trail; false until loaded. */
  edges(base: THREE.Vector3, tip: THREE.Vector3): boolean {
    if (!this.tip || !this.club) return false;
    this.tip.getWorldPosition(tip);
    this.club.getWorldPosition(base);
    base.lerp(tip, 0.35);
    return true;
  }

  /** The left (casting) hand in world space, the root's chest before the model loads. */
  hand(v: THREE.Vector3): THREE.Vector3 {
    if (this.leftHand) return this.leftHand.getWorldPosition(v);
    return this.root.getWorldPosition(v).setY(v.y + 1.1);
  }

  /** Where the walk or run cycle is, 0..1 (a footfall each half), or -1 when not striding: the footsteps follow it. */
  get gait(): number {
    const a = (this.state === 'walk' || this.state === 'run') && this.actions[this.state];
    return a ? (a.time / a.getClip().duration) % 1 : -1;
  }

  /** `speed`: horizontal m/s this frame; `grounded`: feet on the floor; `want`: m/s the keys or the stick ask for (0: none, or not his to choose). */
  animate(dt: number, speed: number, grounded: boolean, want = 0): void {
    if (!this.mixer) return;
    this.outfit?.update(dt);
    const showAura = this.aura.update(dt) || this.priming-- > 0;
    for (const s of this.shells) s.visible = showAura;
    if (this.dead) { // the fall takes the whole body over 0.2 s
      this.deadK = Math.min(1, this.deadK + dt / 0.2);
      this.dying?.setEffectiveWeight(this.deadK);
      for (const k of Object.keys(this.weight) as Loco[]) this.actions[k].setEffectiveWeight(this.weight[k] * (1 - this.deadK));
      this.mixer.update(dt);
      this.outfit?.clear(dt, 0);
      return;
    }
    this.combatT = Math.max(0, this.combatT - dt);
    const standing = grounded && speed < 0.3;
    this.calm = standing && this.combatT === 0 && this.state !== 'fidget' ? this.calm + dt : 0;
    // The stride asked for (the run from the first push, not after a walk's worth of speeding up); braking keeps the one he is in.
    if (want > RUN_AT[1]) this.gaitClip = 'run';
    else if (want > 0 && want < RUN_AT[0]) this.gaitClip = 'walk';
    else if (!want && this.state !== 'walk' && this.state !== 'run') this.gaitClip = speed < 4 ? 'walk' : 'run';
    const air = this.actions.air, P = this.pace;
    if (!grounded) this.airT += dt;
    else if (this.state === 'air') { // touchdown: his own landing from the clip, if he was up long enough to need one
      if (this.airT > 0.2) {
        this.landT = LAND[want > 0 ? 1 : 0];
        air.time = Math.max(air.time, P.down);
        air.timeScale = 1;
      }
      this.airT = 0;
    }
    if (grounded) this.landT = Math.max(0, this.landT - dt);
    let next: State = !grounded ? 'air' : this.landT > 0 ? 'land' : !standing ? this.gaitClip : this.combatT > 0 ? 'combat' : 'idle';
    if (this.state === 'fidget' && next === 'idle' && this.actions.fidget.time < this.actions.fidget.getClip().duration - 0.45) next = 'fidget'; // let the twirl finish
    else if (next === 'idle' && this.calm > this.nextFidget && !this.playing) {
      next = 'fidget';
      this.nextFidget = FIDGET[0] + Math.random() * (FIDGET[1] - FIDGET[0]);
    }
    if (next !== this.state) {
      const was = this.state, calm = (x?: State) => x === 'idle' || x === 'combat' || x === 'fidget', key = next === 'land' ? 'air' : next;
      const to = this.actions[key];
      if (next === 'air') { // the takeoff, from his clip's own
        to.reset();
        to.time = P.up;
        to.timeScale = (P.down - 0.03 - P.up) / FLIGHT;
      } else if (next !== 'land' && this.weight[key] < 0.05) { // a clip faded out starts over; one still showing carries on
        to.reset();
        if (calm(next) && next !== 'fidget') to.time = Math.random() * to.getClip().duration * 0.5;
      }
      this.fade = next === 'air' ? TAKEOFF : was === 'land' ? LANDED : calm(next) && calm(was) ? STANCE_FADE : calm(was) && !calm(next) ? START : calm(next) ? STOP : FADE;
      this.state = next;
    }
    if (next === 'air' && air.time >= P.down - 0.03) { air.time = P.down - 0.03; air.timeScale = 0; } // a long fall holds the last of the flight
    // The base clips: the one in play fades in, the rest out, at the switch's pace; together they always weigh 1.
    const on: Loco = next === 'land' ? 'air' : next;
    let sum = 0;
    for (const k of Object.keys(this.weight) as Loco[]) sum += this.weight[k] = Math.max(0, Math.min(1, this.weight[k] + (k === on ? 1 : -1) * dt / this.fade));
    for (const k of Object.keys(this.weight) as Loco[]) { this.weight[k] /= sum || 1; this.actions[k].setEffectiveWeight(this.weight[k]); }
    // stride matched to the ground speed, so the planted foot stays planted (and slows with him as he brakes)
    this.actions.walk.timeScale = speed / P.walk;
    this.actions.run.timeScale = speed / P.run;
    this.still += ((standing ? 1 : 0) - this.still) * Math.min(1, dt / FADE);

    let busy = 0; // how much of the upper body a move or a held pose has: a staff comes down from upright for it (not for the charge, a sprint)
    // Held poses, under any move; the whirl and the charge take the legs too.
    for (const h of Object.keys(HOLDS) as Hold[]) {
      const ch = this.layers.get(HOLDS[h]);
      const k = Math.max(0, Math.min(1, (this.holdK.get(h) ?? 0) + (this.holdOn.has(h) ? dt / 0.15 : -dt / 0.25)));
      this.holdK.set(h, k);
      if (!ch) continue;
      if (h !== 'rush') busy = Math.max(busy, k);
      if (k > 0 && !ch.upper.isRunning()) { ch.upper.reset().play(); ch.lower.reset().play(); }
      if (k === 0 && ch.upper.isRunning()) { ch.upper.stop(); ch.lower.stop(); }
      if (h === 'rush') ch.upper.timeScale = ch.lower.timeScale = Math.max(1, speed / 8); // a head-down sprint
      ch.upper.setEffectiveWeight(over(k));
      ch.lower.setEffectiveWeight(over(k * (h === 'spin' || h === 'rush' ? 1 : this.still)));
    }
    // The whirl turns the whole body round; after it, back to facing ahead the short way.
    if (this.holdOn.has('spin')) this.spin = (this.spin + dt * SPIN) % (Math.PI * 2);
    else if (this.spin) { const d = Math.atan2(Math.sin(-this.spin), Math.cos(-this.spin)); this.spin = Math.abs(d) < 0.05 ? 0 : this.spin + d * Math.min(1, dt * 10); }
    this.root.rotation.y = this.spin;

    const s = this.playing;
    if (s) {
      const t = (s.t += dt);
      if (t >= s.hitAt && s.layer.upper.timeScale === s.rate) for (const a of [s.layer.upper, s.layer.lower]) a.timeScale = s.move.post ?? 1; // past the blow: the follow-through at its own pace
      if (t >= s.end) {
        s.layer.upper.stop();
        s.layer.lower.stop();
        this.playing = undefined;
      } else {
        const k = Math.max(0, Math.min(1, t / s.move.in, (s.end - t) / s.move.out)); // fade in, hold, fade out
        busy = Math.max(busy, k);
        s.layer.upper.setEffectiveWeight(over(k));
        s.layer.lower.setEffectiveWeight(over(k * (s.move.whole ? 1 : this.still)));
      }
    }
    this.mixer.update(dt);
    this.outfit?.clear(dt, 1 - busy); // the weapon kept out of him, whatever the clip did
  }
}
