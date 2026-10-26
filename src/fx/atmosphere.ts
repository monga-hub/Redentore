import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Level } from '../level/index.ts';
import { Z } from '../level/plan.ts';
import { Torches, DOT } from './torches.ts';
import { PHONE, weakness } from '../core/device.ts';

// Lighting and mood on top of the dressed level: a full-moon night over the lagoon.
// A cold moon is the only shadow-casting light; a starry sky dome with drifting clouds
// carries the moon itself, damp blue fog thickens towards the lagoon and mist crawls
// over the water. Torches and braziers stay as the only warm light. A single `indoor`
// factor, eased from the HUD areas, blends fog, ambient, exposure and grading so walking
// through a door feels like eyes adapting to the dark.
//
// Quality: a ladder walked one rung at a time on the smoothed frame rate, down after a few seconds
// under ~28 fps, back up after longer over ~50 (see QUALITY), after a boot test has put it on the rung
// this device calls for (see BENCH). Each rung gives back what it stops
// using; torches, lamps, the hero's light and emissive glow stay on every rung, so the night never
// goes flat, and the moon's shadows on all but the two "ultra-light" ones at the bottom, for weak
// Android phones. `?fx=low` and the menu's "Grafica" pin a rung. Phones start lean (`PHONE`): iOS
// kills a tab whose memory, GPU buffers included, outgrows a budget of about a gigabyte, and reloads
// it, so their buffers are sized down from the start; a weak phone (`weakness`) starts the test lighter.

/** 0 = open air, 1 = closed interior; covered cloister walks sit in between. */
function indoorness(zone: string | undefined, label: string | undefined): number {
  if (zone === 'chiesa' || zone === 'corpo-nord') return 1;
  if (label === 'Ingresso al convento' || label === 'Corridoio del convento' || label === 'Segreteria') return 1;
  if (label?.startsWith('Chiostr') || label === 'Cortile delle Zitelle') return 0.45;
  if (zone === 'zitelle' && !/^(Sagrato|Orto|Androne)/.test(label ?? '')) return 1; // the Zitelle's church and the Pia Casa's rooms
  return 0;
}

// Low in the east-south-east: rakes the facade and throws long shadows across the sagrato.
const MOON_DIR = new THREE.Vector3(0.75, 0.5, 0.35).normalize();
const MOON = 2.4;

// Outdoor -> indoor endpoints of everything the indoor factor drives.
const FOG_OUT = new THREE.Color(0x1a2332), FOG_IN = new THREE.Color(0x0c0d11);
const MOOD = {
  hemi: [0.5, 0.15],
  fog: [0.016, 0.028],
  exposure: [1.0, 1.15],
  cool: [0.7, 0.3],
  vignette: [0.35, 0.55],
  dust: [0.12, 0.45],
} as const;
// "Stile Diablo": a darker gothic night. Less fill light, so the torches and the light the hero
// carries make the pools of warmth; the grade desaturates, splits cold shadows from warm lights,
// adds contrast and closes in a heavy vignette.
const DIABLO_MOOD: Record<keyof typeof MOOD, readonly [number, number]> = {
  ...MOOD,
  hemi: [0.3, 0.09],
  exposure: [1.0, 1.1],
  cool: [0.35, 0.15],
  vignette: [0.62, 0.72],
};
// Out in the open (orto, gardens, laguna) that night still has to read: more fill and exposure, a
// brighter moon, a lighter vignette, less crushed shadows and the hero's light up to match. Added to
// DIABLO_MOOD's outdoor end, scaled by `open`, which fades out by the cloister walks (indoor 0.45):
// the church and the cloisters keep their dark.
const DIABLO_OPEN = { hemi: 0.7, moon: 0.9, exposure: 0.35, vignette: -0.25, contrast: -0.1, hero: 0.6 };
const GRADE = { wow: { sat: 1, contrast: 1, split: 0 }, diablo: { sat: 0.68, contrast: 1.16, split: 0.55 } };
const HERO_LIGHT = { color: 0xffa860, intensity: 14, distance: 12, decay: 1.5, height: 2.6 }; // the hero's light radius
const LIGHT_BOOST = { torch: 1.35, brazier: 1.1, lamp: 0.45, glow: 0.55 }; // pools of firelight, less lamplight
const DUST_OUT = new THREE.Color(0xb8c8e0), DUST_IN = new THREE.Color(0xffd6a0);
const LAGOON_FOG = 0.02; // extra density at the riva
const ALOFT = { y0: 20, y1: 40, clear: 0.9 }; // m: up San Giorgio's campanile the haze thins to show the lagoon (zones/sangiorgio.ts lagoon)
const BACINO = { x0: -452, x1: -385, z0: 0, z1: 100, clear: 0.82 }; // the Punta's pier and the gondola's crossing: a clear night over the water, San Giorgio's front and campanile in sight
/**
 * Rungs, best first: 0 everything; 1 fewer pixels (the pixel ratio x0.7, at least 1); 2 half the moon's
 * shadow map; 3 (`post`) no post chain (bloom, grade), straight to the canvas; 4 (`lite`) ultra-light: no
 * moon shadows (the shadow pass drew as much again as the view), `lights` of the torch pool, a sky without
 * clouds, no mist or motes, `sparks` of the spell particles; 5 the pixel ratio down to `tiny`, under the
 * screen's own pixels. Down after `down.after` s under `down.fps`, up after `up.after` s over `up.fps`; a
 * rung given up again after climbing back to it is not tried a third time, so the ladder settles instead
 * of see-sawing.
 */
const QUALITY = { rungs: 5, post: 3, lite: 4, down: { fps: 28, after: 4 }, up: { fps: 50, after: 8 }, settle: 3, pixels: 0.7, tiny: 0.75, lights: 3, sparks: 0.5 };
/**
 * The boot test: the real scene (the intro's flight, or the game) timed from `from` to `to` s after the models are in
 * (`loaded`), past the shader compiles of their first frames, on the rung the GPU's name and the memory point to.
 * Under the ladder's down mark (never otherwise: a phone the ladder would leave alone keeps its look), the median frame,
 * scaled by what each rung roughly `cost`s against the top one, picks the best rung expected to hold `fps` (between the
 * ladder's down and up marks, so it stays put), at once rather than a rung every few seconds. The
 * rung is remembered for this build (`KEY`) and moved with the ladder, so the next boot starts there without a test; a
 * new build, or "Grafica: Auto" picked again, tests anew. It only ever lightens: the ladder climbs if there is room.
 * ponytail: `cost` is a guess from a software GPU (rung 1 ~0.7, rung 5 ~0.2 of the top's frame); retune on real phones.
 */
const BENCH = { from: 1.5, to: 4, frames: 10, fps: 40, cost: [1, 0.75, 0.7, 0.55, 0.35, 0.22] };
const KEY = 'redentore.fx';
declare const __BUILD__: { sha: string; time: number };
const SHADOW = PHONE ? 1024 : 2048;
/** Without the post chain the grade is gone: a lower exposure and a CSS vignette over the canvas (free to composite) keep the dark. */
const BARE = { exposure: 0.8, vignette: 0.75 };

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return v;
  }`;

// Sky dome around the camera: night gradient, stars, the moon (HDR, so bloom gives it
// its glow) and fbm clouds that drift past and veil it, silver-lit near the moon.
const skyMaterial = () => new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    uTime: { value: 0 },
    uMoonDir: { value: MOON_DIR },
    uHorizon: { value: FOG_OUT.clone() },
    uZenith: { value: new THREE.Color(0x03060f) },
  },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uMoonDir, uHorizon, uZenith;
    varying vec3 vDir;
    ${NOISE}
    void main() {
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 c = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.65, h), 0.55));
      #ifndef LITE

      // Stars: one candidate per cell of a direction grid, faded towards the hazy horizon.
      vec3 sp = d * 220.0, cell = floor(sp);
      float r = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      float star = step(0.9965, r) * smoothstep(0.5, 0.1, length(fract(sp) - 0.5)) * (0.5 + 0.5 * sin(uTime * 2.0 + r * 80.0));
      c += star * smoothstep(0.08, 0.4, h) * vec3(0.7, 0.8, 1.0) * 1.4;

      // Moon: oversized disc with soft limb and grey maria, plus a two-stage halo.
      float cosA = dot(d, uMoonDir), ang = acos(clamp(cosA, -1.0, 1.0));
      const float R = 0.042;
      vec3 tu = normalize(cross(uMoonDir, vec3(0, 1, 0))), tv = cross(tu, uMoonDir);
      vec2 mp = vec2(dot(d, tu), dot(d, tv)) / R;
      float maria = smoothstep(0.45, 0.75, fbm(mp * 2.2 + 3.0));
      float disc = smoothstep(R, R * 0.93, ang);
      vec3 moon = vec3(1.0, 0.98, 0.92) * (2.4 - 1.1 * maria - 0.5 * dot(mp, mp)) * disc;
      float halo = exp(-ang * 9.0) * 0.16 + exp(-ang * 35.0) * 0.35;
      vec3 haloCol = vec3(0.55, 0.68, 0.9) * halo;

      // Clouds on a virtual ceiling: drifting fbm, thinning towards the horizon.
      vec2 cp = d.xz / (h + 0.18) * 1.4 + vec2(uTime * 0.012, uTime * 0.004);
      float n = fbm(cp + 0.6 * fbm(cp * 0.5 - uTime * 0.003));
      float cover = smoothstep(0.48, 0.82, n) * smoothstep(-0.02, 0.25, h);
      float lit = exp(-ang * 4.0);
      vec3 cloud = mix(vec3(0.05, 0.07, 0.11), vec3(0.42, 0.48, 0.6), lit) + vec3(0.6, 0.65, 0.75) * pow(lit, 6.0) * (1.0 - cover);

      c = mix(c + moon + haloCol, cloud, cover * 0.88);
      c += haloCol * cover * 0.6; // halo scatters through thin cloud
      #else // ultra-light: the gradient and a plain moon disc with its halo, no fbm
      float ang = acos(clamp(dot(d, uMoonDir), -1.0, 1.0));
      c += vec3(1.0, 0.98, 0.92) * 2.0 * smoothstep(0.042, 0.039, ang) + vec3(0.55, 0.68, 0.9) * (exp(-ang * 9.0) * 0.16 + exp(-ang * 35.0) * 0.35);
      #endif
      gl_FragColor = vec4(c, 1.0);
    }`,
});

// Low mist over the canal and the lagoon: a slow noise sheet just under quay level, so
// it only shows where there is water. Fogged like everything else.
const mistMaterial = () => new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  fog: true,
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x5b6d88) } }]),
  vertexShader: /* glsl */ `
    #include <fog_pars_vertex>
    varying vec2 vXZ;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vXZ = wp.xz;
      vec4 mvPosition = viewMatrix * wp;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor;
    varying vec2 vXZ;
    #include <fog_pars_fragment>
    ${NOISE}
    void main() {
      vec2 p = vXZ * 0.045;
      float n = fbm(p + vec2(uTime * 0.02, -uTime * 0.012) + fbm(p * 0.7 - uTime * 0.01));
      gl_FragColor = vec4(uColor, smoothstep(0.3, 0.75, n) * 0.7);
      #include <fog_fragment>
    }`,
});

// Night grade in linear HDR, before ACES: shadows and mids drift to moonlit blue and lose
// some saturation (night vision); bright values keep their hue, so flames stay warm.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uCool: { value: 0 }, uVignette: { value: 0 }, uSat: { value: 1 }, uContrast: { value: 1 }, uSplit: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uCool, uVignette, uSat, uContrast, uSplit;
    varying vec2 vUv;
    const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
    void main() {
      vec4 t = texture2D(tDiffuse, vUv);
      vec3 c = t.rgb;
      float l = dot(c, LUMA), k = uCool * (1.0 - smoothstep(0.25, 1.5, l));
      vec3 night = l * vec3(0.62, 0.8, 1.22);
      c = mix(c, mix(c, night, 0.55), k);
      if (uSplit > 0.0) { // Diablo grade: desaturate, cold shadows / warm lights, contrast about mid grey
        l = dot(c, LUMA);
        c = mix(vec3(l), c, uSat);
        c *= mix(vec3(1.0), mix(vec3(0.8, 0.9, 1.1), vec3(1.2, 0.97, 0.76), smoothstep(0.03, 0.45, l)), uSplit);
        c = pow(max(c, 0.0) / 0.18, vec3(uContrast)) * 0.18;
      }
      vec2 d = vUv - 0.5;
      c *= clamp(1.0 - dot(d, d) * uVignette * 2.4, 0.0, 1.0);
      gl_FragColor = vec4(c, t.a);
    }`,
};

const lerp = (r: readonly [number, number], k: number) => r[0] + (r[1] - r[0]) * k;

export class Atmosphere {
  indoor = 0;
  private mood: Record<keyof typeof MOOD, readonly [number, number]> = MOOD;
  private readonly hero = new THREE.PointLight(HERO_LIGHT.color, HERO_LIGHT.intensity, HERO_LIGHT.distance, HERO_LIGHT.decay);
  /** The rung of QUALITY the renderer stands on: 0 best, QUALITY.rungs the lightest. */
  step = 0;
  /** Walk the ladder on the frame rate; off when the menu or `?fx=low` pins a rung. */
  auto = true;
  private best = 0; // the best rung the ladder may still climb back to
  private climbed = false; // the current rung was reached going up
  private readonly pixelRatio: number;
  private readonly fog = new THREE.FogExp2(FOG_OUT.getHex(), MOOD.fog[0]);
  private readonly hemi = new THREE.HemisphereLight(0x5a74a0, 0x15130f, MOOD.hemi[0]);
  private readonly moon = new THREE.DirectionalLight(0xa9c2f0, MOON);
  private readonly moonOffset = MOON_DIR.clone().multiplyScalar(150);
  private readonly sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), skyMaterial());
  private readonly mist = new THREE.Mesh(new THREE.PlaneGeometry(1100, 800).rotateX(-Math.PI / 2), mistMaterial());
  readonly torches: Torches;
  private readonly dust: THREE.Points;
  private readonly dustMat: THREE.PointsMaterial;
  private readonly composer: EffectComposer;
  private readonly grade = new ShaderPass(GradeShader);
  private readonly vignette = document.createElement('div');
  private t = 0;
  private slowFor = 0;
  private fastFor = 0;
  private settle = 0; // s before the frame rate counts: shader compiles and model loads at boot, buffers after a step
  private avgDt = 1 / 60;
  private readonly hint: number; // the rung the boot test starts on
  private readonly gpu: string;
  private bench?: { at: number; frames: number[] }; // the boot test under way: its first frame (ms), the frames timed
  private last = 0; // ms, the last update

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;
  private readonly level: Level;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, level: Level) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.level = level;
    this.pixelRatio = renderer.getPixelRatio();
    this.torches = new Torches(level.lights);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    scene.background = FOG_OUT;
    scene.fog = this.fog;
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.mist.position.set(-200, -0.75, -80); // over the water plane (y -1.2), under the quays (y 0), out to San Giorgio
    this.mist.renderOrder = 1;
    scene.add(this.sky, this.mist, this.hemi, this.moon, this.moon.target, this.torches.root);

    // Moon: crisp cold key light, shadow box following the player.
    this.moon.castShadow = true;
    const s = this.moon.shadow;
    s.mapSize.setScalar(SHADOW);
    Object.assign(s.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 320 });
    s.bias = -0.0004;
    s.normalBias = 0.04;
    s.radius = 2;
    level.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const mat = o.material as THREE.Material;
      o.receiveShadow = true;
      // Flat floor overlays, see-through glass/water and grass cards only receive.
      o.castShadow = !mat.transparent && !(o.geometry instanceof THREE.PlaneGeometry) && o.userData.castShadow !== false;
    });

    // Motes: a box of points wrapped around the player; damp and pale outside, warm dust inside.
    const N = 900, pos = new Float32Array(N * 3);
    for (let i = 0; i < N * 3; i++) pos[i] = (Math.random() - 0.5) * (i % 3 === 1 ? 10 : 30);
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.dustMat = new THREE.PointsMaterial({ size: 0.045, map: DOT, color: DUST_OUT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: MOOD.dust[0] });
    this.dust = new THREE.Points(geo, this.dustMat);
    this.dust.frustumCulled = false;
    scene.add(this.dust);

    // Post: HDR scene (MSAA) -> bloom on moon and flames -> night grading -> ACES + sRGB.
    // The composer keeps two of these (the passes ping-pong), each a multisampled half-float colour and depth buffer.
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: PHONE ? 2 : 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.6, 1.0));
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.setSize(innerWidth, innerHeight);
    this.vignette.style.cssText = 'position:fixed;inset:0;pointer-events:none;display:none;background:radial-gradient(ellipse at center, transparent 35%, #000 105%)';
    renderer.domElement.after(this.vignette); // under the HUD, which comes later
    const weak = weakness(renderer.getContext());
    this.gpu = weak.gpu;
    this.hint = weak.level ? QUALITY.post + weak.level - 1 : 0;
    const kept = recall();
    if (kept === undefined) this.test();
    else this.setStep(kept, 'kept from the last boot');
    this.settle = 5;
  }

  /** Start the boot test (BENCH) on the rung the hints point to. */
  private test(): void {
    this.setStep(this.hint, this.hint ? `weak phone (${this.gpu || 'GPU unnamed'})` : 'boot test');
    this.bench = { at: -1, frames: [] };
  }

  /** The boot test's verdict: this rung if it holds the ladder's mark, else the best expected to hold BENCH.fps. */
  private judge(frames: number[]): void {
    this.bench = undefined;
    const ms = frames.sort((a, b) => a - b)[frames.length >> 1], { cost } = BENCH;
    let n = this.step;
    if (1000 / ms < QUALITY.down.fps) while (n < QUALITY.rungs && (ms * cost[n]) / cost[this.step] > 1000 / BENCH.fps) n++;
    console.info(`[fx] boot test: ${(1000 / ms).toFixed(0)} fps on rung ${this.step} (${this.gpu || 'GPU unnamed'}), rung ${n} called for`);
    this.setStep(n, 'boot test');
    remember(n);
  }

  /** No post chain: straight to the canvas. */
  private get low(): boolean {
    return this.step >= QUALITY.post;
  }

  /** Ultra-light (main.ts thins the spell particles to `sparks`). */
  get lite(): boolean {
    return this.step >= QUALITY.lite;
  }

  /** Share of the spell particles drawn on this rung. */
  get sparks(): number {
    return this.lite ? QUALITY.sparks : 1;
  }

  setSize(w: number, h: number): void {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.t += dt;
    const a = this.level.areaAt(focus.x, focus.z);
    this.indoor += (indoorness(a?.zone, a?.label) - this.indoor) * (1 - Math.exp(-dt * 1.8));
    const k = this.indoor;
    // Damp lagoon air: fog thickens from the orto's north edge to the riva.
    const lagoon = THREE.MathUtils.smoothstep(-focus.z, -Z.ortoNorth, -Z.riva);

    const mood = this.mood, u = this.grade.uniforms;
    const open = mood === DIABLO_MOOD ? 1 - Math.min(k / 0.45, 1) : 0;
    this.hemi.intensity = lerp(mood.hemi, k) + DIABLO_OPEN.hemi * open;
    this.moon.intensity = (MOON + DIABLO_OPEN.moon * open) * (this.lite ? 1 - k : 1); // without shadows no roof stops it: indoors it goes
    const B = BACINO, ss = THREE.MathUtils.smoothstep, bacino = ss(focus.z, B.z0, B.z0 + 8) * (1 - ss(focus.z, B.z1 - 8, B.z1)) * ss(focus.x, B.x0, B.x0 + 6) * (1 - ss(focus.x, B.x1 - 15, B.x1));
    this.fog.density = (lerp(mood.fog, k) + LAGOON_FOG * lagoon * (1 - k)) * (1 - B.clear * bacino * (1 - k)) * (1 - ALOFT.clear * ss(focus.y, ALOFT.y0, ALOFT.y1));
    this.fog.color.lerpColors(FOG_OUT, FOG_IN, k);
    this.renderer.toneMappingExposure = (lerp(mood.exposure, k) + DIABLO_OPEN.exposure * open) * (this.low ? BARE.exposure : 1);
    u.uCool.value = lerp(mood.cool, k);
    u.uVignette.value = lerp(mood.vignette, k) + DIABLO_OPEN.vignette * open;
    if (this.low) this.vignette.style.opacity = (u.uVignette.value * BARE.vignette).toFixed(2);
    u.uContrast.value = (mood === DIABLO_MOOD ? GRADE.diablo : GRADE.wow).contrast + DIABLO_OPEN.contrast * open;
    this.dustMat.opacity = lerp(mood.dust, k);
    this.hero.position.set(focus.x, focus.y + HERO_LIGHT.height, focus.z);
    this.hero.intensity = HERO_LIGHT.intensity * (1 + DIABLO_OPEN.hero * open) * (0.94 + 0.06 * Math.sin(this.t * 7.3) * Math.sin(this.t * 2.9));
    this.dustMat.color.lerpColors(DUST_OUT, DUST_IN, k);

    this.sky.position.copy(this.camera.position);
    (this.sky.material as THREE.ShaderMaterial).uniforms.uTime.value = this.t;
    (this.mist.material as THREE.ShaderMaterial).uniforms.uTime.value = this.t;

    // ponytail: shadow box re-centres every frame without texel snapping; snap to the
    // shadow-map grid if the edge shimmer while walking ever bothers anyone.
    this.moon.target.position.copy(focus);
    this.moon.position.copy(focus).add(this.moonOffset);

    this.torches.update(this.t, dt, focus);

    // Drift the motes and wrap them into the box around the player.
    const p = this.dust.geometry.attributes.position as THREE.BufferAttribute, arr = p.array as Float32Array;
    for (let i = 0; this.dust.visible && i < arr.length; i += 3) {
      arr[i] = wrap(arr[i] + Math.sin(this.t * 0.3 + i) * 0.05 * dt - focus.x, 30) + focus.x;
      arr[i + 1] = wrap(arr[i + 1] + 0.04 * dt - focus.y - 3, 10) + focus.y + 3;
      arr[i + 2] = wrap(arr[i + 2] + Math.cos(this.t * 0.27 + i) * 0.05 * dt - focus.z, 30) + focus.z;
    }
    p.needsUpdate = this.dust.visible;

    // The boot test, on real time (dt is capped), then the quality ladder, on the smoothed frame rate.
    const now = performance.now(), b = this.bench;
    if (b && this.auto) {
      if (b.at < 0) { if (this.loaded()) b.at = now; }
      else if (now - b.at > BENCH.to * 1000) {
        if (b.frames.length >= BENCH.frames) this.judge(b.frames);
        else this.bench = { at: -1, frames: [] }; // held up (the menu, a hidden tab): again
      } else if (now - b.at > BENCH.from * 1000) b.frames.push(now - this.last);
    }
    this.last = now;
    this.avgDt += (dt - this.avgDt) * 0.05;
    this.settle -= dt;
    const fps = 1 / this.avgDt, { down, up } = QUALITY, walk = this.auto && !this.bench && this.settle < 0;
    this.slowFor = walk && fps < down.fps ? this.slowFor + dt : 0;
    this.fastFor = walk && fps > up.fps ? this.fastFor + dt : 0;
    if (this.slowFor > down.after && this.step < QUALITY.rungs) {
      if (this.climbed) this.best = this.step + 1; // it failed here once already
      this.setStep(this.step + 1, `slow frames (${fps.toFixed(0)} fps)`);
      remember(this.step);
    } else if (this.fastFor > up.after && this.step > this.best) {
      this.setStep(this.step - 1, `fast frames (${fps.toFixed(0)} fps)`);
      this.climbed = true;
      remember(this.step);
    }
  }

  /** The menu's "Grafica": Auto walks the ladder (picked again, from a pinned rung, it tests the device anew), Alta and Bassa pin its ends. */
  setQuality(q: 'auto' | 'alta' | 'bassa'): void {
    const pinned = !this.auto;
    this.auto = q === 'auto';
    this.best = 0;
    if (q !== 'auto') {
      this.bench = undefined;
      this.setStep(q === 'alta' ? 0 : QUALITY.rungs, `set to ${q}`);
    } else if (pinned) this.test();
  }

  /** "Stile Diablo" on or off: mood and grade, brighter torches, and a warm light that follows the hero (one more light: programs recompile once). */
  setStyle(diablo: boolean): void {
    this.mood = diablo ? DIABLO_MOOD : MOOD;
    const g = diablo ? GRADE.diablo : GRADE.wow, u = this.grade.uniforms;
    u.uSat.value = g.sat;
    u.uSplit.value = g.split; // uContrast: per frame, with the open air
    this.torches.boost = diablo ? LIGHT_BOOST : {};
    this.torches.brazierFlame = diablo ? 0.55 : 1;
    this.torches.brazierLift = diablo ? 1.8 : 0.5;
    if (diablo) this.scene.add(this.hero);
    else this.scene.remove(this.hero);
  }

  /** Whether the models are in: the boot test waits for it (frames spent loading them would time the loading, not the scene). */
  loaded = () => true;

  /** Called after the post chain or the ultra-light rungs come or go (programs are keyed on the target they draw into, the lights and the shadows): main.ts warms them again. */
  onRebuild?: () => void;

  /**
   * Compile every material in the scene now, for both targets it may be drawn into (the HDR
   * buffer, and the canvas in low quality: colour space and tone mapping are part of a program's
   * key), rather than on first use mid-fight, a hitch of up to half a second for a new spell effect.
   */
  warm(): void {
    const r = this.renderer, was = r.getRenderTarget();
    for (const target of this.low ? [null] : [this.composer.readBuffer, null]) { // in low quality the HDR buffer is gone: binding it would allocate it again
      r.setRenderTarget(target);
      r.compileAsync(this.scene, this.camera).catch(() => undefined); // its compile() runs now, under this target
    }
    r.setRenderTarget(was);
  }

  render(): void {
    if (this.low) this.renderer.render(this.scene, this.camera);
    else this.composer.render();
  }

  /**
   * Stand on rung `n` of QUALITY, giving back what the rungs below it stop using, never holding two sets at
   * once (iOS kills a tab past its memory budget, the peak that once came from a one-shot fallback piling
   * a low-quality set on the high one). Fewer pixels and a smaller shadow map resize their buffers in
   * place, without new programs. Without the post chain its buffers go (on a phone the biggest allocation
   * of the game), and so does every program built for the HDR buffer: three keeps a material's old
   * programs next to the new ones until the material is disposed. Coming back, the composer and its
   * passes, which dispose only their GPU side, allocate again on their next draw. The ultra-light rungs
   * change every lit program (fewer lights, no shadow), so going in or out of them disposes the materials
   * too; the shadow map goes with the shadows, and is freed at once when it changes size.
   */
  setStep(n: number, why: string): void {
    n = THREE.MathUtils.clamp(n, 0, QUALITY.rungs);
    if (n === this.step) return;
    const post = this.low, lite = this.lite;
    this.step = n;
    this.climbed = false;
    this.slowFor = this.fastFor = 0;
    this.settle = QUALITY.settle;
    this.renderer.setPixelRatio(n >= 5 ? Math.min(QUALITY.tiny, this.pixelRatio) : n >= 1 ? Math.max(1, this.pixelRatio * QUALITY.pixels) : this.pixelRatio);
    this.setSize(innerWidth, innerHeight);
    const shadow = this.moon.shadow, size = n >= 2 ? SHADOW / 2 : SHADOW;
    if (shadow.mapSize.x !== size || this.lite !== lite) {
      shadow.dispose(); // now, rather than on the next shadow pass
      shadow.map = null; // three allocates it again on that pass, at the new size
      shadow.mapSize.setScalar(size);
    }
    if (this.low && !post) {
      for (const p of this.composer.passes) p.dispose();
      this.composer.dispose();
    }
    if (this.lite !== lite) {
      this.moon.castShadow = !this.lite;
      this.torches.setPool(this.lite ? QUALITY.lights : Torches.POOL);
      if (this.lite) this.sky.material.defines.LITE = '';
      else delete this.sky.material.defines.LITE;
      this.mist.visible = this.dust.visible = !this.lite;
    }
    if ((this.low && !post) || this.lite !== lite) {
      this.scene.traverse((o) => { // only the GPU side goes: three builds a disposed material again on its next draw
        const m = (o as THREE.Mesh).material;
        if (m) for (const x of Array.isArray(m) ? m : [m]) x.dispose();
      });
    }
    console.info(`[fx] quality ${n}/${QUALITY.rungs}: ${why}`);
    this.vignette.style.display = this.low ? '' : 'none';
    if (this.low !== post || this.lite !== lite) this.onRebuild?.();
  }
}

/** The rung kept for this build, if any (KEY: "<build time> <rung>"). */
function recall(): number | undefined {
  try {
    const [build, step] = (localStorage.getItem(KEY) ?? '').split(' '), n = Number(step);
    return build === String(__BUILD__.time) && Number.isInteger(n) && n >= 0 && n <= QUALITY.rungs ? n : undefined;
  } catch { return undefined; } // blocked storage: test every boot
}

function remember(step: number): void {
  try { localStorage.setItem(KEY, `${__BUILD__.time} ${step}`); } catch { /* not kept: the next boot tests again */ }
}

/** Wrap v into [-size/2, size/2). */
function wrap(v: number, size: number): number {
  return v - size * Math.floor(v / size + 0.5);
}
