import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Level } from '../level/index.ts';
import { Torches, DOT } from './torches.ts';

// Lighting and mood on top of the dressed level: soft hazy Venetian daylight outside,
// torch-lit "Scarlet" interiors (crimson shadows, gold highlights) inside. A single
// `indoor` factor, eased from the HUD areas, blends fog, ambient, exposure and grading
// so walking through a door feels like eyes adapting to the dark.
//
// Quality: `?fx=low` (or a sustained slow frame rate) drops the sun shadows and the
// post chain; torches, fog and particles stay.

/** 0 = open air, 1 = closed interior; covered cloister walks sit in between. */
function indoorness(zone: string | undefined, label: string | undefined): number {
  if (zone === 'chiesa' || zone === 'corpo-nord') return 1;
  if (label === 'Ingresso al convento' || label === 'Corridoio del convento' || label === 'Segreteria') return 1;
  if (label?.startsWith('Chiostr')) return 0.45;
  return 0;
}

// Outdoor -> indoor endpoints of everything the indoor factor drives.
const SKY = new THREE.Color(0xb9cbd6);
const FOG_OUT = new THREE.Color(0xc4c3b6), FOG_IN = new THREE.Color(0x1e0907);
const MOOD = {
  hemi: [1.15, 0.22],
  fog: [0.0055, 0.024],
  exposure: [0.95, 1.12],
  warm: [0.15, 0.45],
  vignette: [0.2, 0.55],
  dust: [0.18, 0.55],
} as const;

// Split toning in linear HDR, before ACES: shadows towards crimson, highlights towards gold.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uWarm: { value: 0 }, uVignette: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uWarm, uVignette;
    varying vec2 vUv;
    const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
    void main() {
      vec4 t = texture2D(tDiffuse, vUv);
      vec3 c = t.rgb;
      float l = dot(c, LUMA);
      vec3 tint = mix(vec3(0.62, 0.16, 0.12), vec3(1.0, 0.74, 0.4), smoothstep(0.02, 0.7, l));
      vec3 graded = c * tint / dot(tint, LUMA);
      c = mix(c, mix(c, graded, 0.6), uWarm);
      c = mix(vec3(dot(c, LUMA)), c, 1.0 + 0.15 * uWarm); // a touch richer
      vec2 d = vUv - 0.5;
      c *= clamp(1.0 - dot(d, d) * uVignette * 2.4, 0.0, 1.0);
      gl_FragColor = vec4(c, t.a);
    }`,
};

const lerp = (r: readonly [number, number], k: number) => r[0] + (r[1] - r[0]) * k;

export class Atmosphere {
  indoor = 0;
  private low = new URLSearchParams(location.search).get('fx') === 'low';
  private readonly fog = new THREE.FogExp2(FOG_OUT.getHex(), MOOD.fog[0]);
  private readonly hemi = new THREE.HemisphereLight(0xc7dbe8, 0x6e5a48, MOOD.hemi[0]);
  private readonly sun = new THREE.DirectionalLight(0xffe6c4, 2.6);
  private readonly sunOffset = new THREE.Vector3(-55, 110, 75);
  private readonly torches = new Torches();
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    scene.background = SKY;
    scene.fog = this.fog;
    scene.add(this.hemi, this.sun, this.sun.target, this.torches.root);

    // Sun: soft afternoon from the south-west, shadow box following the player.
    this.sun.castShadow = true;
    const s = this.sun.shadow;
    s.mapSize.set(2048, 2048);
    Object.assign(s.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 320 });
    s.bias = -0.0004;
    s.normalBias = 0.04;
    s.radius = 3;
    level.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const mat = o.material as THREE.Material;
      o.receiveShadow = true;
      // Flat floor overlays and see-through glass/water only receive.
      o.castShadow = !mat.transparent && !(o.geometry instanceof THREE.PlaneGeometry);
    });

    // Dust motes: a box of points wrapped around the player, warm and soft.
    const N = 900, pos = new Float32Array(N * 3);
    for (let i = 0; i < N * 3; i++) pos[i] = (Math.random() - 0.5) * (i % 3 === 1 ? 10 : 30);
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.dustMat = new THREE.PointsMaterial({ size: 0.045, map: DOT, color: 0xffd6a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: MOOD.dust[0] });
    this.dust = new THREE.Points(geo, this.dustMat);
    this.dust.frustumCulled = false;
    scene.add(this.dust);

    // Post: HDR scene (MSAA) -> bloom on the flames -> Scarlet grading -> ACES + sRGB.
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.55, 1.05));
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

    this.hemi.intensity = lerp(MOOD.hemi, k);
    this.fog.density = lerp(MOOD.fog, k);
    this.fog.color.lerpColors(FOG_OUT, FOG_IN, k);
    this.renderer.toneMappingExposure = lerp(MOOD.exposure, k);
    this.grade.uniforms.uWarm.value = lerp(MOOD.warm, k);
    this.grade.uniforms.uVignette.value = lerp(MOOD.vignette, k);
    this.dustMat.opacity = lerp(MOOD.dust, k);

    // ponytail: shadow box re-centres every frame without texel snapping; snap to the
    // shadow-map grid if the edge shimmer while walking ever bothers anyone.
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).add(this.sunOffset);

    this.torches.update(this.t, dt, focus);

    // Drift the dust and wrap it into the box around the player.
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

  render(): void {
    if (this.low) this.renderer.render(this.scene, this.camera);
    else this.composer.render();
  }

  private degrade(why: string): void {
    this.low = true;
    this.sun.castShadow = false; // light state change recompiles programs without shadows
    console.info(`[fx] low quality: ${why}`);
  }
}

/** Wrap v into [-size/2, size/2). */
function wrap(v: number, size: number): number {
  return v - size * Math.floor(v / size + 0.5);
}
