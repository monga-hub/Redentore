import * as THREE from 'three';
import type { LevelBuilder } from '../builder.ts';

const FINISHES = new Set(['stone', 'stoneDark', 'brick', 'paving', 'cloth']);
const cache = new Map<THREE.Material, THREE.MeshStandardMaterial>();

/** Flush at the room boundaries so its material variants never leak into neighbouring batched buildings. */
export function churchSurfaces(b: LevelBuilder): () => void {
  b.flush();
  const previous = new Set<THREE.Object3D>();
  b.root.traverse(o => previous.add(o));
  return () => {
    b.flush();
    b.root.traverse(o => {
      if (!(o instanceof THREE.Mesh) || previous.has(o) || !FINISHES.has(o.userData.role)) return;
      const original = o.material as THREE.MeshStandardMaterial;
      let aged = cache.get(original);
      if (!aged) {
        const compile = original.onBeforeCompile, program = original.customProgramCacheKey();
        aged = original.clone();
        Object.assign(aged, { defaultAttributeValues: (original as unknown as { defaultAttributeValues: object }).defaultAttributeValues });
        aged.name = `church-worn-${o.userData.role}`;
        aged.defines = { ...original.defines, [`CHURCH_${o.userData.role.toUpperCase()}`]: '' };
        aged.onBeforeCompile = (shader, renderer) => {
          compile.call(original, shader, renderer);
          shader.vertexShader = 'varying vec3 vChurchPos; varying vec3 vChurchNormal;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
#ifdef USE_INSTANCING
  vChurchPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  vChurchNormal = mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal;
#else
  vChurchPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vChurchNormal = mat3(modelMatrix) * objectNormal;
#endif`);
          shader.fragmentShader = DECL + shader.fragmentShader.replace('diffuseColor *= tex;', 'churchStoneHeight = dot(tex.rgb, vec3(.3,.5,.2)); diffuseColor *= tex;').replace('#include <roughnessmap_fragment>', AGE + '\n#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + churchRough, 0.5, 1.0);')
            .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  if (churchRelief != 0.0) {
    vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
    vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
    float det = dot(sx, r1) * faceDirection;
    normal = normalize(abs(det) * normal - sign(det) * (dFdx(churchRelief) * r1 + dFdy(churchRelief) * r2));
  }`).replace('vec2 dh = vec2(dFdx(bH), dFdy(bH)) * 0.015;', 'vec2 dh = vec2(dFdx(bH), dFdy(bH)) * 0.024;');
        };
        aged.customProgramCacheKey = () => `${program}-church-wear-1`;
        cache.set(original, aged);
      }
      o.material = aged;
    });
  };
}

const DECL = `float churchStoneHeight = 1.0;
varying vec3 vChurchPos; varying vec3 vChurchNormal;
float churchHash(vec2 p) { vec3 q = fract(p.xyx * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float churchNoise(vec2 p) { vec2 a = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(churchHash(a),churchHash(a+vec2(1,0)),f.x),mix(churchHash(a+vec2(0,1)),churchHash(a+1.0),f.x),f.y); }
`;

// All marks have a cause: damp at the masonry foot, soot above flames, grit at edges and cracks, polish on the path.
const AGE = `
  vec3 cp = vChurchPos;
  bool zitelle = cp.x < -200.0;
  float floorY = zitelle ? 0.8 : 0.0;
  float cy = cp.y - floorY;
  vec2 room = cp.xz - (zitelle ? vec2(-240.0,-10.0) : vec2(-118.0,-27.0));
  float up = smoothstep(0.65,0.95,normalize(vChurchNormal).y);
  float floorFace = up * (1.0-smoothstep(0.08,0.22,abs(cy)));
  float wall = 1.0-up;
  vec2 wp = vec2(cp.x+cp.z,cy);
  float grain = churchNoise(wp*9.0);
  float churchRough = 0.0;
  float churchRelief = 0.0;
  if (wall > .5) {
  float dampTop = 0.65 + 0.65*churchNoise(vec2(wp.x*.7,1.0));
  float damp = (1.0-smoothstep(dampTop-.18,dampTop+.12,cy))*wall;
  float tide = (1.0-smoothstep(.035,.13,abs(cy-dampTop)))*wall;
  float streak = smoothstep(.5,.78,churchNoise(vec2(wp.x*3.0,cy*.22)));
  // Drips and salt cling to the base and joints, rather than tinting every wall uniformly.
  diffuseColor.rgb *= 1.0 - damp*(.16+.24*streak) - tide*.12;
  diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.36,.33,.27),damp*smoothstep(.64,.8,grain)*.2);
  float torchZ = abs(mod(cp.z+18.0+3.0,6.0)-3.0);
  float torchWall = smoothstep(6.2,7.1,abs(room.x));
  float soot = zitelle ? 0.0 : torchWall*exp(-torchZ*torchZ*3.0)*smoothstep(2.5,3.05,cy)*(1.0-smoothstep(3.2,5.6,cy));
  float altarZ = zitelle ? -29.3 : -39.2;
  float altarSmoke = exp(-abs(cp.z-altarZ)*4.0)*exp(-room.x*room.x*.18)*smoothstep(1.8,2.8,cy)*(1.0-smoothstep(3.4,6.0,cy));
  diffuseColor.rgb *= 1.0-wall*(soot*.46+altarSmoke*.25);
  churchRough += damp*.1;
  }
  if (floorFace > .5) {
    float wallEdge = zitelle ? min(abs(abs(room.x)-9.4),abs(room.y+19.5)) : min(abs(abs(room.x)-7.5),abs(room.y+12.5));
    float dirtEdge = exp(-wallEdge*1.9);
    diffuseColor.rgb *= 1.0-dirtEdge*(.25+.18*churchNoise(cp.xz*4.0));
    churchRough += dirtEdge*.12;
  }
#ifdef CHURCH_BRICK
  // Recessed mortar and chipped clay reuse the existing brick height texture.
  float mortar = 1.0-smoothstep(.32,.64,bH);
  diffuseColor.rgb *= 1.0-mortar*.25;
  churchRough += .08 + mortar*.12 - .08*smoothstep(.65,.9,grain);
#endif
#if defined(CHURCH_STONE) || defined(CHURCH_STONEDARK) || defined(CHURCH_PAVING)
  if (wall > .5) {
    // Recover the painted stone joints, then nibble their borders: pockets hold dirt, intact faces stay pale.
    float seam = 1.0-smoothstep(.23,.43,churchStoneHeight);
    float spall = smoothstep(.48,.72,churchNoise(wp*vec2(14.0,19.0)));
    float broken = seam*(.25+.75*spall);
    diffuseColor.rgb *= 1.0-broken*.38;
    churchRelief += (1.0-broken)*.012;
    churchRough += broken*.18;
    float leak = smoothstep(.6,.78,churchNoise(vec2(wp.x*2.2,cy*.15)));
    diffuseColor.rgb *= 1.0-leak*(1.0-smoothstep(1.2,3.3,cy))*.16;
  }
  // Hairline fractures follow individual slabs; sparse intersections, not an all-over noise overlay.
  vec2 block = floor(cp.xz*vec2(.9,.7));
  vec2 bf = fract(cp.xz*vec2(.9,.7));
  float seed = churchHash(block);
  float fissure = abs(bf.x-(.12+.63*bf.y+.025*sin(bf.y*37.0+seed*19.0)));
  float crack = (1.0-smoothstep(.002,.009,fissure))*step(zitelle ? .92 : .85,seed);
  diffuseColor.rgb *= 1.0-crack*floorFace*.5;
  churchRelief -= crack*floorFace*.012;
  churchRough += crack*floorFace*.15;
  if (!zitelle && floorFace>.5 && abs(room.x)<1.5 && cp.z < -14.9 && cp.z > -34.5) {
    vec2 tile = vec2((cp.x+119.45)/.98,(-cp.z-15.0)/1.5);
    vec2 f = fract(tile)*vec2(.98,1.5);
    float id = churchHash(floor(tile));
    float edge = min(min(f.x,.94-f.x),min(f.y,1.43-f.y));
    float bite = smoothstep(.53,.78,churchNoise(cp.xz*17.0+id))*mix(.015,.07,step(.72,id));
    if (edge < bite) discard;
    float rim = 1.0-smoothstep(.025,.13,edge);
    float dust = rim*(.25+.28*churchNoise(cp.xz*5.0));
    // The middle of each slab is rubbed smooth by feet; its broken rim retains earth and wax.
    vec3 limestone = mix(vec3(.25,.225,.19),vec3(.49,.45,.375),id);
    limestone *= .86+.18*churchNoise(cp.xz*2.0);
    diffuseColor.rgb = mix(diffuseColor.rgb,limestone,.65);
    diffuseColor.rgb *= 1.0-dust-crack*.45;
    churchRough += rim*.18-(1.0-rim)*.13;
    churchRelief += (1.0-rim)*.006-crack*.012;
  }
  if (zitelle && floorFace>.5) {
    // The old Istrian floor is dull at its joints and corners, burnished along the processional route.
    float traffic = exp(-room.x*room.x*.22);
    diffuseColor.rgb *= .78+.12*traffic;
    diffuseColor.rgb *= 1.0-.16*smoothstep(.5,.77,churchNoise(cp.xz*.8))* (1.0-traffic*.65);
    churchRough += .12-traffic*.23;
  }
#endif
#ifdef CHURCH_CLOTH
  float selvage = smoothstep(1.0,1.37,abs(room.x));
  float path = exp(-room.x*room.x*1.4);
  float nap = churchNoise(cp.xz*vec2(13.0,2.0));
  diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.095,.033,.018),path*(.18+.26*nap));
  diffuseColor.rgb *= 1.0-selvage*(.25+.25*nap);
  if (abs(room.x) > 1.32 + .08*churchNoise(cp.xz*vec2(22.0,5.0))) discard;
  churchRough += .05;
#endif
`;
