import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Level } from '../level/index.ts';
import { Z } from '../level/plan.ts';
import { Torches, DOT } from './torches.ts';
import { PHONE } from '../core/device.ts';

// Lighting and mood on top of the dressed level: a full-moon night over the lagoon.
// A cold moon is the only shadow-casting light; a starry sky dome with drifting clouds
// carries the moon itself, damp blue fog thickens towards the lagoon and mist crawls
// over the water. Torches and braziers stay as the only warm light. A single `indoor`
// factor, eased from the HUD areas, blends fog, ambient, exposure and grading so walking
// through a door feels like eyes adapting to the dark.
//
// Quality: `?fx=low` (or a sustained slow frame rate) drops the moon shadows and the
// post chain, freeing their buffers; sky, torches, fog and particles stay. Phones start lean
// (`PHONE`): iOS kills a tab whose memory, GPU buffers included, outgrows a budget of about a
// gigabyte, and reloads it, so their buffers are sized down from the start.

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
  private low = new URLSearchParams(location.search).get('fx') === 'low';
  private readonly fog = new THREE.FogExp2(FOG_OUT.getHex(), MOOD.fog[0]);
  private readonly hemi = new THREE.HemisphereLight(0x5a74a0, 0x15130f, MOOD.hemi[0]);
  private readonly moon = new THREE.DirectionalLight(0xa9c2f0, MOON);
  private readonly moonOffset = MOON_DIR.clone().multiplyScalar(150);
  private readonly sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), skyMaterial());
  private readonly mist = new THREE.Mesh(new THREE.PlaneGeometry(700, 800).rotateX(-Math.PI / 2), mistMaterial());
  readonly torches: Torches;
  private readonly dust: THREE.Points;
  private readonly dustMat: THREE.PointsMaterial;
  private readonly composer: EffectComposer;
  private readonly grade = new ShaderPass(GradeShader);
  private t = 0;
  private slowFor = 0;
  private avgDt = 1 / 60;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;
  private readonly level: Level;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, level: Level) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.level = level;
    this.torches = new Torches(level.lights);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    scene.background = FOG_OUT;
    scene.fog = this.fog;
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.mist.position.set(0, -0.75, -80); // over the water plane (y -1.2), under the quays (y 0)
    this.mist.renderOrder = 1;
    scene.add(this.sky, this.mist, this.hemi, this.moon, this.moon.target, this.torches.root);

    // Moon: crisp cold key light, shadow box following the player.
    this.moon.castShadow = true;
    const s = this.moon.shadow;
    s.mapSize.setScalar(PHONE ? 1024 : 2048);
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
    if (this.low) this.degrade('requested with ?fx=low');
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
    this.moon.intensity = MOON + DIABLO_OPEN.moon * open;
    this.fog.density = lerp(mood.fog, k) + LAGOON_FOG * lagoon * (1 - k);
    this.fog.color.lerpColors(FOG_OUT, FOG_IN, k);
    this.renderer.toneMappingExposure = lerp(mood.exposure, k) + DIABLO_OPEN.exposure * open;
    u.uCool.value = lerp(mood.cool, k);
    u.uVignette.value = lerp(mood.vignette, k) + DIABLO_OPEN.vignette * open;
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
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] = wrap(arr[i] + Math.sin(this.t * 0.3 + i) * 0.05 * dt - focus.x, 30) + focus.x;
      arr[i + 1] = wrap(arr[i + 1] + 0.04 * dt - focus.y - 3, 10) + focus.y + 3;
      arr[i + 2] = wrap(arr[i + 2] + Math.cos(this.t * 0.27 + i) * 0.05 * dt - focus.z, 30) + focus.z;
    }
    p.needsUpdate = true;

    // Auto fallback: ~4 s under ~25 fps (after a warm-up for shader compiles).
    this.avgDt += (dt - this.avgDt) * 0.05;
    this.slowFor = this.t > 5 && this.avgDt > 0.04 ? this.slowFor + dt : 0;
    if (!this.low && this.slowFor > 4) this.degrade(`slow frames (${(1 / this.avgDt).toFixed(0)} fps)`);
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

  /** Called after dropping to low quality (its light state rebuilds every program): main.ts warms them again. */
  onDegrade?: () => void;

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
   * Drop to low quality, giving back what high quality held: the post chain's buffers (on a phone the
   * biggest allocation of the game), the shadow map, and every program built for shadows or the HDR
   * buffer. Three keeps a material's old programs next to the new ones until the material is disposed,
   * so without that the fallback, which a heavy fight on a phone triggers, piled a second set of programs
   * and buffers on top of the first, the peak that got the tab killed.
   */
  private degrade(why: string): void {
    this.low = true;
    this.moon.castShadow = false; // light state change recompiles programs without shadows
    this.moon.shadow.map?.dispose();
    this.moon.shadow.map = null;
    for (const p of this.composer.passes) p.dispose();
    this.composer.dispose();
    this.scene.traverse((o) => { // only the GPU side goes: three builds a disposed material again on its next draw
      const m = (o as THREE.Mesh).material;
      if (m) for (const x of Array.isArray(m) ? m : [m]) x.dispose();
    });
    console.info(`[fx] low quality: ${why}`);
    this.onDegrade?.();
  }
}

/** Wrap v into [-size/2, size/2). */
function wrap(v: number, size: number): number {
  return v - size * Math.floor(v / size + 0.5);
}
