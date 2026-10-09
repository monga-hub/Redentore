import * as THREE from 'three';
import { PAINTERS, rasterize } from './textures.ts';

// Stylized materials per semantic role. Every mesh's `userData.role` names the key it
// was built with, so later passes can still find/swap them without touching the layout.
// Textures are painted procedurally (textures.ts) and projected triplanar in world space:
// the level is made of boxes of every size whose UVs would stretch, so world metres drive
// the mapping instead and tiles stay the same size on every wall, floor and roof.
// Generated geometry (builder.ts chamferBox, columns) carries an `aShape` attribute so
// masonry roles can paint by form: dark mossy foot, lighter top, lit chamfers.

interface Spec {
  tint?: number; // multiplies the painted albedo (default white); flat colour of untextured roles
  tile?: number; // metres per texture repeat (textured roles only)
  rough?: number;
  grime?: boolean; // walls: darker, dirtier band near the ground
  macro?: number; // strength of large-scale world-space colour variation (breaks tiling)
  peel?: number; // plaster: world-space scaling threshold (lower = more brick showing)
  shape?: boolean; // paint by form (aShape): banded macro blotches, local foot/top gradient, lit chamfers
}

const SPECS = {
  stone: { tile: 2.4, rough: 0.82, grime: true, macro: 0.12, shape: true }, // pietra d'Istria (facade, church)
  stoneDark: { tile: 2.4, rough: 0.78, grime: true, macro: 0.1, shape: true }, // columns, cornices, steps
  plaster: { tile: 3.6, rough: 0.95, grime: true, macro: 0.15, peel: 0.6, shape: true }, // red intonaco of the calli and convent
  brick: { tile: 2.88, rough: 0.9, grime: true, macro: 0.18, shape: true }, // cloister walls/arches: 36×9 cm bricks, shuffled per brick
  mass: { tile: 3.6, rough: 0.95, grime: true, macro: 0.18, peel: 0.63, shape: true }, // inaccessible building volumes (ochre plaster)
  roof: { tile: 1.6, rough: 0.75, macro: 0.2, shape: true }, // coppi
  paving: { tile: 3.2, rough: 0.8, macro: 0.12, shape: true }, // trachite masegni
  ground: { tile: 6, rough: 0.95, macro: 0.15 }, // base site slab
  gravel: { tile: 2, rough: 1, macro: 0.12 }, // garden paths
  grass: { tile: 3, rough: 1, macro: 0.2 },
  soil: { tile: 2, rough: 1, macro: 0.15 }, // cultivated beds
  hedge: { tile: 1.6, rough: 0.9, macro: 0.15 },
  foliage: { tile: 2, rough: 0.9, macro: 0.15 },
  olive: { tint: 0x8fa080, rough: 0.9 }, // silvery olive leaves, lavender, sage
  flower: { tint: 0xf4ece6, rough: 0.7 }, // near white: props tint each instance (roses, lilies, lavender)
  fruit: { tint: 0xf0e4d8, rough: 0.6 }, // likewise (grapes, apples, lemons)
  trunk: { tile: 1, rough: 0.95 },
  wood: { tile: 1.5, rough: 0.8, macro: 0.1, shape: true }, // pergolas, pier, porticoes
  water: { tile: 8, rough: 0.15, macro: 0.2 },
  glass: { tint: 0xa9cdd6, rough: 0.1 },
  player: { tint: 0xe0b040, rough: 0.6 },
} satisfies Record<string, Spec>;

export type Role = keyof typeof SPECS;

// World-space triplanar projection of `map`, plus large-scale colour drift and wall grime.
const VERT_DECL = 'attribute vec3 aShape;\nvarying vec3 vShape;\nvarying vec3 vTriPos;\nvarying vec3 vTriNrm;\n';
const VERT_BODY = `#include <project_vertex>
vShape = aShape;
#ifdef USE_INSTANCING
vTriPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
vTriNrm = mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal;
#else
vTriPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vTriNrm = mat3(modelMatrix) * objectNormal;
#endif`;
const FRAG_DECL = `varying vec3 vShape;
varying vec3 vTriPos;
varying vec3 vTriNrm;
uniform float uTile;
uniform float uMacro;
float triHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float triNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(triHash(i), triHash(i + vec2(1, 0)), u.x), mix(triHash(i + vec2(0, 1)), triHash(i + vec2(1, 1)), u.x), u.y);
}
`;
// After three's sampler declaration (needs `map`).
const FRAG_BRICK = `#include <map_pars_fragment>
#if defined(TRI_BRICK) || defined(TRI_PEEL)
// The brick map is a pool of 8×32 half-bond bricks (textures.ts agedBrick). Rebuild that grid in
// world space and give every world brick a random pool cell, so the wall never repeats.
float bH = 0.0; // height (map alpha), read back by the bump below
float brickHash(vec2 p) { // stable for large cell indices, unlike the sin hash
  vec3 p3 = fract(p.xyx * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec4 brickTap(sampler2D tx, float tile, vec2 w) {
  const vec2 POOL = vec2(8.0, 32.0);
  vec2 q = w * POOL / tile; // brick units
  float row = floor(q.y);
  vec2 cell = vec2(floor(q.x + 0.5 * mod(row, 2.0)), row);
  vec2 f = vec2(q.x + 0.5 * mod(row, 2.0), q.y) - cell;
  vec2 tc = floor(vec2(brickHash(cell), brickHash(cell + 71.3)) * POOL);
  vec2 uv = (tc + f - vec2(0.5 * mod(tc.y, 2.0), 0.0)) / POOL;
  vec4 t = textureGrad(tx, uv, dFdx(q) / POOL, dFdy(q) / POOL); // grads of q: no seams at jumps
  float face = smoothstep(0.3, 0.6, t.a);
  t.rgb *= mix(1.0, 0.86 + 0.28 * brickHash(cell + 13.7), face); // extra per-brick value shift
  return t;
}
#endif
#ifdef TRI_PEEL
uniform sampler2D uBrick;
uniform float uBrickTile;
uniform float uPeel;
#endif
`;
const FRAG_MAP = `{
  vec3 n = normalize(vTriNrm);
  vec3 w = pow(abs(n), vec3(8.0));
  w /= w.x + w.y + w.z;
#ifdef TRI_BRICK
  vec4 tex = brickTap(map, uTile, vTriPos.zy) * w.x + brickTap(map, uTile, vTriPos.xz) * w.y + brickTap(map, uTile, vTriPos.xy) * w.z;
  bH = tex.a;
  tex.a = 1.0;
  {
    // world-space wear on top of the bricks: lime render scraps, rain streaks, salt bloom
    vec2 wp = vec2(vTriPos.x + vTriPos.z, vTriPos.y);
    float face = smoothstep(0.3, 0.6, bH);
    float pr = triNoise(wp * vec2(0.8, 1.2)) * 0.6 + triNoise(wp * 3.1 + 7.0) * 0.28 + triNoise(wp * 12.0) * 0.12;
    float cover = smoothstep(0.69, 0.71, pr), smear = smoothstep(0.55, 0.69, pr) * (1.0 - face);
    vec3 lime = vec3(0.7, 0.65, 0.57) * (0.8 + 0.25 * triNoise(wp * 4.0));
    tex.rgb = mix(tex.rgb, lime, max(smear * 0.6, 0.0));
    tex.rgb *= 1.0 - 0.3 * smoothstep(0.65, 0.69, pr) * (1.0 - cover); // shadow under the render lip
    tex.rgb = mix(tex.rgb, lime, cover);
    bH = mix(bH, 1.0, cover);
    float streak = smoothstep(0.55, 0.85, triNoise(vec2(wp.x * 2.6, wp.y * 0.22)) * 0.75 + triNoise(wp * 5.0) * 0.25);
    tex.rgb *= 1.0 - 0.28 * streak;
    // dirt: broad dark halos, thin drips, dust settling in the joints and greying the faces
    float halo = smoothstep(0.45, 0.85, triNoise(wp * 0.45 + 19.0) * 0.6 + triNoise(wp * 1.7) * 0.4);
    tex.rgb *= 1.0 - 0.22 * halo;
    tex.rgb *= 1.0 - 0.16 * smoothstep(0.62, 0.9, triNoise(vec2(wp.x * 11.0, wp.y * 0.6)));
    float dust = triNoise(wp * 2.3 + 5.0);
    tex.rgb = mix(tex.rgb, vec3(dot(tex.rgb, vec3(0.3, 0.5, 0.2))) * vec3(1.0, 0.95, 0.88), 0.25 * dust);
    tex.rgb *= mix(0.78 + 0.15 * dust, 1.0, face);
    float band = smoothstep(0.1, 0.4, vTriPos.y) * (1.0 - smoothstep(0.9, 1.6, vTriPos.y));
    float salt = smoothstep(0.5, 0.72, triNoise(wp * vec2(1.6, 2.4)) * 0.7 + triNoise(wp * 7.0) * 0.3) * band * (1.0 - w.y);
    tex.rgb = mix(tex.rgb, vec3(0.86, 0.84, 0.79), salt * 0.5);
  }
#else
  vec3 p = vTriPos / uTile;
  vec4 tex = texture2D(map, p.zy) * w.x + texture2D(map, p.xz) * w.y + texture2D(map, p.xy) * w.z;
#endif
#ifdef TRI_PEEL
  {
    // Scrostato: plaster scaled off in domain-warped world-space blotches, never repeating;
    // more of it near the ground where rising damp and salt push it off.
    vec2 wp = vec2(vTriPos.x + vTriPos.z, vTriPos.y);
    wp += vec2(triNoise(wp * 0.6 + 3.0), triNoise(wp * 0.6 + 11.0)) * 1.2;
    float pr = triNoise(wp * 0.32) * 0.5 + triNoise(wp * 1.1 + 5.0) * 0.3 + triNoise(wp * 4.0) * 0.13 + triNoise(wp * 13.0) * 0.07;
    float thr = uPeel - 0.07 * (1.0 - smoothstep(0.0, 2.2, vTriPos.y));
    vec4 br = brickTap(uBrick, uBrickTile, vTriPos.zy) * w.x + brickTap(uBrick, uBrickTile, vTriPos.xz) * w.y + brickTap(uBrick, uBrickTile, vTriPos.xy) * w.z;
    float rim = smoothstep(thr, thr + 0.02, pr);
    vec3 plas = tex.rgb * (1.0 - 0.25 * smoothstep(thr - 0.04, thr, pr) * (1.0 - rim)); // lip shadow
    vec3 edge = tex.rgb * 1.25 + 0.06; // bright broken edge
    tex.rgb = mix(plas, mix(edge, br.rgb * 0.85, smoothstep(thr + 0.008, thr + 0.03, pr)), rim);
    bH = mix(1.0, br.a * 0.6, rim);
  }
#endif
  vec2 q = vTriPos.xz + vTriPos.y * 0.6;
#ifdef TRI_SHAPE
  {
    // Painted, not photographed: value and warm/cool drift at ~10 m and ~3 m, then hard-edged
    // blotches (sun-washed / damp) cut at sharp thresholds like brush strokes.
    float k = uMacro / 0.15;
    float m1 = triNoise(q * 0.09 + 31.0), m2 = triNoise(q * 0.33 + 5.0);
    tex.rgb *= 1.0 + k * ((m1 - 0.5) * 0.45 + (m2 - 0.5) * 0.22);
    tex.rgb *= mix(vec3(1.0), mix(vec3(0.94, 0.98, 1.05), vec3(1.06, 1.0, 0.9), m1), min(k, 1.0));
    float m3 = triNoise(q * 0.45 + triNoise(q * 0.17 + 9.0) * 1.6 + 17.0);
    float lum = dot(tex.rgb, vec3(0.3, 0.5, 0.2));
    tex.rgb = mix(tex.rgb, mix(tex.rgb, vec3(lum) * vec3(1.05, 1.01, 0.94), 0.35) * 1.14, smoothstep(0.66, 0.68, m3) * min(k, 1.0) * 0.8);
    tex.rgb *= 1.0 - 0.16 * min(k, 1.0) * (1.0 - smoothstep(0.3, 0.32, m3));
    // Height inside the object, not world y: walls on the raised church floor, lintels and
    // steps all get their own foot and top. Meshes without aShape fall back to world y.
    float H = vShape.y, y = H > 0.0 ? vShape.x : vTriPos.y;
    if (H > 0.0) tex.rgb *= mix(0.86, 1.08, smoothstep(0.0, H, y));
#ifdef TRI_GRIME
    float foot = (1.0 - smoothstep(0.0, H > 0.0 ? min(1.4, 0.5 * H) : 1.4, y)) * (1.0 - w.y);
    float dry = smoothstep(0.48, 0.52, triNoise(vTriPos.xz * 0.9 + vTriPos.y * 1.5 + 41.0) + 0.35 * (1.0 - foot));
    tex.rgb *= mix(vec3(1.0), mix(vec3(0.58, 0.66, 0.44), vec3(0.7, 0.68, 0.62), dry), foot); // moss patches, dust above
#endif
    // Chamfers: the painted arris of hand-painted kits. Warm and bright facing up, a light
    // line on vertical arrises, dark facing down.
    float up = clamp(n.y * 1.414, -1.0, 1.0);
    vec3 lit = tex.rgb * vec3(1.36, 1.27, 1.1) + vec3(0.035, 0.028, 0.012);
    tex.rgb = mix(tex.rgb, lit, vShape.z * clamp(0.35 + 0.65 * up, 0.0, 1.0));
    tex.rgb *= 1.0 - vShape.z * 0.4 * clamp(-up, 0.0, 1.0);
  }
#else
  float m = triNoise(q * 0.13) * 0.65 + triNoise(q * 0.41) * 0.35;
  tex.rgb *= 1.0 + (m - 0.5) * 2.0 * uMacro;
#ifdef TRI_GRIME
  float g = (1.0 - smoothstep(0.0, 1.4, vTriPos.y)) * (1.0 - w.y);
  tex.rgb *= mix(vec3(1.0), vec3(0.7, 0.68, 0.62), g);
#endif
#endif
  diffuseColor *= tex;
}`;
// Bump from the brick height (mortar ~1.5 cm deep), three's perturbNormalArb inlined.
const FRAG_BUMP = `#include <normal_fragment_maps>
#if defined(TRI_BRICK) || defined(TRI_PEEL)
{
  vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
  vec2 dh = vec2(dFdx(bH), dFdy(bH)) * 0.015;
  vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
  float det = dot(sx, r1) * faceDirection;
  normal = normalize(abs(det) * normal - sign(det) * (dh.x * r1 + dh.y * r2));
}
#endif`;

const maps = new Map<string, THREE.DataTexture>();

function texture(role: string): THREE.DataTexture {
  const cached = maps.get(role);
  if (cached) return cached;
  const { paint, size } = PAINTERS[role];
  const t = new THREE.DataTexture(rasterize(paint, size), size, size);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8; // clamped to the GPU's maximum by three
  t.needsUpdate = true;
  maps.set(role, t);
  return t;
}

function build(role: Role, side: THREE.Side): THREE.MeshStandardMaterial {
  const s: Spec = SPECS[role];
  const m = new THREE.MeshStandardMaterial({ color: s.tint ?? 0xffffff, roughness: s.rough ?? 0.9, metalness: 0, side });
  if (role === 'glass') Object.assign(m, { transparent: true, opacity: 0.55 });
  if (role === 'water') Object.assign(m, { transparent: true, opacity: 0.85 });
  if (!s.tile) return m;
  m.map = texture(role);
  m.defines = {};
  if (s.grime) m.defines.TRI_GRIME = '';
  if (role === 'brick') m.defines.TRI_BRICK = '';
  if (s.peel) m.defines.TRI_PEEL = '';
  if (s.shape) m.defines.TRI_SHAPE = '';
  // aShape for meshes that lack it (props, floors): height 0 = fall back to world y.
  Object.assign(m, { defaultAttributeValues: { aShape: [0, 0, 0] } });
  const peel = s.peel ?? 0;
  const tile = s.tile, macro = s.macro ?? 0;
  m.onBeforeCompile = shader => {
    shader.uniforms.uTile = { value: tile };
    shader.uniforms.uMacro = { value: macro };
    shader.uniforms.uPeel = { value: peel };
    shader.uniforms.uBrick = { value: peel ? texture('brick') : null };
    shader.uniforms.uBrickTile = { value: SPECS.brick.tile };
    shader.vertexShader = VERT_DECL + shader.vertexShader.replace('#include <project_vertex>', VERT_BODY);
    shader.fragmentShader = FRAG_DECL + shader.fragmentShader.replace('#include <map_pars_fragment>', FRAG_BRICK).replace('#include <map_fragment>', FRAG_MAP).replace('#include <normal_fragment_maps>', FRAG_BUMP);
  };
  m.customProgramCacheKey = () => 'triplanar';
  return m;
}

const cache = new Map<string, THREE.Material>();

/** Shared material for a role; `doubleSide` for shells seen from inside (dome, drum). */
export function material(role: Role, doubleSide = false): THREE.Material {
  const key = role + (doubleSide ? ':2' : '');
  let m = cache.get(key);
  if (!m) {
    m = build(role, doubleSide ? THREE.DoubleSide : THREE.FrontSide);
    cache.set(key, m);
  }
  return m;
}
