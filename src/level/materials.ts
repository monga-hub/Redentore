import * as THREE from 'three';
import { PAINTERS, rasterize } from './textures.ts';

// Stylized materials per semantic role. Every mesh's `userData.role` names the key it
// was built with, so later passes can still find/swap them without touching the layout.
// Textures are painted procedurally (textures.ts) and projected triplanar in world space:
// the level is made of scaled unit boxes whose UVs would stretch, so world metres drive
// the mapping instead and tiles stay the same size on every wall, floor and roof.

interface Spec {
  tint?: number; // multiplies the painted albedo (default white); flat colour of untextured roles
  tile?: number; // metres per texture repeat (textured roles only)
  rough?: number;
  grime?: boolean; // walls: darker, dirtier band near the ground
  macro?: number; // strength of large-scale world-space colour variation (breaks tiling)
}

const SPECS = {
  stone: { tile: 2.4, rough: 0.82, grime: true, macro: 0.12 }, // pietra d'Istria (facade, church)
  stoneDark: { tile: 2.4, rough: 0.78, grime: true, macro: 0.1 }, // columns, cornices, steps
  plaster: { tile: 3.6, rough: 0.95, grime: true, macro: 0.15 }, // red intonaco of the calli and convent
  brick: { tile: 1.2, rough: 0.9, grime: true, macro: 0.15 }, // cloister walls/arches
  mass: { tile: 3.6, rough: 0.95, grime: true, macro: 0.18 }, // inaccessible building volumes (ochre plaster)
  roof: { tile: 1.6, rough: 0.75, macro: 0.2 }, // coppi
  paving: { tile: 3.2, rough: 0.8, macro: 0.12 }, // trachite masegni
  ground: { tile: 6, rough: 0.95, macro: 0.15 }, // base site slab
  gravel: { tile: 2, rough: 1, macro: 0.12 }, // garden paths
  grass: { tile: 3, rough: 1, macro: 0.2 },
  soil: { tile: 2, rough: 1, macro: 0.15 }, // cultivated beds
  hedge: { tile: 1.6, rough: 0.9, macro: 0.15 },
  foliage: { tile: 2, rough: 0.9, macro: 0.15 },
  trunk: { tile: 1, rough: 0.95 },
  wood: { tile: 1.5, rough: 0.8, macro: 0.1 }, // pergolas, pier, porticoes
  water: { tile: 8, rough: 0.15, macro: 0.2 },
  glass: { tint: 0xa9cdd6, rough: 0.1 },
  player: { tint: 0xe0b040, rough: 0.6 },
} satisfies Record<string, Spec>;

export type Role = keyof typeof SPECS;

// World-space triplanar projection of `map`, plus large-scale colour drift and wall grime.
const VERT_DECL = 'varying vec3 vTriPos;\nvarying vec3 vTriNrm;\n';
const VERT_BODY = `#include <project_vertex>
vTriPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vTriNrm = mat3(modelMatrix) * objectNormal;`;
const FRAG_DECL = `varying vec3 vTriPos;
varying vec3 vTriNrm;
uniform float uTile;
uniform float uMacro;
float triHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float triNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(triHash(i), triHash(i + vec2(1, 0)), u.x), mix(triHash(i + vec2(0, 1)), triHash(i + vec2(1, 1)), u.x), u.y);
}
`;
const FRAG_MAP = `{
  vec3 n = normalize(vTriNrm);
  vec3 w = pow(abs(n), vec3(8.0));
  w /= w.x + w.y + w.z;
  vec3 p = vTriPos / uTile;
  vec4 tex = texture2D(map, p.zy) * w.x + texture2D(map, p.xz) * w.y + texture2D(map, p.xy) * w.z;
  vec2 q = vTriPos.xz + vTriPos.y * 0.6;
  float m = triNoise(q * 0.13) * 0.65 + triNoise(q * 0.41) * 0.35;
  tex.rgb *= 1.0 + (m - 0.5) * 2.0 * uMacro;
#ifdef TRI_GRIME
  float g = (1.0 - smoothstep(0.0, 1.4, vTriPos.y)) * (1.0 - w.y);
  tex.rgb *= mix(vec3(1.0), vec3(0.7, 0.68, 0.62), g);
#endif
  diffuseColor *= tex;
}`;

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
  if (s.grime) m.defines = { TRI_GRIME: '' };
  const tile = s.tile, macro = s.macro ?? 0;
  m.onBeforeCompile = shader => {
    shader.uniforms.uTile = { value: tile };
    shader.uniforms.uMacro = { value: macro };
    shader.vertexShader = VERT_DECL + shader.vertexShader.replace('#include <project_vertex>', VERT_BODY);
    shader.fragmentShader = FRAG_DECL + shader.fragmentShader.replace('#include <map_fragment>', FRAG_MAP);
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
