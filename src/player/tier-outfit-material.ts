import * as THREE from 'three';
import type { Finish } from './hero-outfit-key.ts';

/** One Fosca garment: restrained cloth, embroidered regalia, then engraved reliquary vestments. */
export function finishFoscaTierMaterial(material: THREE.MeshStandardMaterial, finish: Finish): void {
  const sober = finish === 'green', epic = finish === 'epic';
  material.metalness = sober ? .18 : epic ? .72 : .48;
  material.roughness = sober ? 1 : epic ? .76 : .9;
  material.normalScale.multiplyScalar(sober ? .6 : epic ? 1.2 : .95);
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aBoot;\nattribute vec3 aTierRest;\nvarying float vTierBoot;\nvarying vec3 vTierRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTierBoot = aBoot;\nvTierRest = aTierRest;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTierBoot;\nvarying vec3 vTierRest;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        ${sober ? `
        #ifdef USE_MAP
          // A coarser weave hides the source's fine brocade in the sober finish, preserving mask and glass.
          float tierClothOnly = 1.0 - smoothstep(1.40, 1.53, vTierRest.y);
          float tierGlassKeep = smoothstep(.01, .05, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));
          diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(map, vMapUv, 2.0).rgb, tierClothOnly * (1.0 - tierGlassKeep) * .75);
        #endif` : ''}
      `)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 tierBase = diffuseColor.rgb;
        float tierLight = dot(tierBase, vec3(.2126, .7152, .0722));
        float tierGold = smoothstep(.025, .10, tierBase.g - tierBase.b) * smoothstep(.03, .15, tierBase.r);
        float tierWine = smoothstep(.008, .045, tierBase.r - tierBase.g) * (1.0 - tierGold);
        float tierOrnament = 0.0;
        float tierRune = 0.0;
        ${sober ? `
          diffuseColor.rgb = mix(tierBase, tierBase * vec3(.82, .75, .61), tierGold * .85);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.82, .70, .62) * tierLight, tierWine * .55);
          diffuseColor.rgb = max(diffuseColor.rgb, vec3(.023, .018, .027) * (1.0 - smoothstep(1.40, 1.53, vTierRest.y)));
        ` : `
          ${epic ? `
            diffuseColor.rgb = mix(tierBase, tierBase * vec3(1.38, 1.19, .96), tierGold * .75);
          ` : `
            diffuseColor.rgb = mix(tierBase, vec3(.13, .28, .48) * (.12 + tierLight * 1.6), tierWine * .86);
            diffuseColor.rgb = mix(diffuseColor.rgb, tierBase * vec3(1.10, 1.06, .98), tierGold * .45);
            vec3 tierBoot = mix(vec3(.025, .075, .16), vec3(.80, .82, .74), smoothstep(.035, .20, tierLight) * .8);
            diffuseColor.rgb = mix(diffuseColor.rgb, tierBoot * (.35 + tierLight * 2.0), vTierBoot);
          `}
          // Rest-space tailoring follows the skinned surface without changing its geometry or adding draws.
          float tierY = vTierRest.y;
          float tierFront = smoothstep(.04, .12, vTierRest.z);
          float tierGlass = smoothstep(.01, .05, tierBase.g - max(tierBase.r, tierBase.b));
          float tierFabric = max(tierWine, 1.0 - smoothstep(.06, .16, tierLight)) * (1.0 - tierGlass) * (1.0 - tierGold * .85);
          float tierPanel = smoothstep(.20, .26, tierY) * (1.0 - smoothstep(1.28, 1.36, tierY)) * tierFront * tierFabric;
          float tierBand = abs(vTierRest.x) - (.105 + .085 * (1.0 - tierY / 1.4));
          float tierAA = max(fwidth(tierBand), .001);
          float tierPiping = 1.0 - smoothstep(.002, .002 + tierAA, abs(abs(tierBand) - ${epic ? '.031' : '.019'}));
          float tierRepeat = mod(tierY, ${epic ? '.145' : '.095'}) - ${epic ? '.0725' : '.0475'};
          float tierDiamond = abs(abs(tierBand) + abs(tierRepeat) * .55 - ${epic ? '.023' : '.012'});
          float tierStitch = 1.0 - smoothstep(.0015, .0015 + tierAA, tierDiamond);
          tierOrnament = max(tierPiping, tierStitch) * tierPanel;
          ${epic ? `
            float tierStem = max(abs(tierBand) - .0018, abs(tierRepeat) - .045);
            float tierWard = max(abs(tierBand) - .015, abs(abs(tierRepeat) - .022) - .0015);
            tierRune = (1.0 - smoothstep(0.0, tierAA, min(tierStem, tierWard))) * tierPanel;
            tierOrnament = max(tierOrnament, tierRune);
          ` : ''}
          diffuseColor.rgb = mix(diffuseColor.rgb, ${epic ? 'vec3(.69, .42, .12)' : 'vec3(.48, .44, .31)'}, tierOrnament * .9);
        `}
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = ${sober ? 'max(roughnessFactor, .86)' : 'mix(roughnessFactor, .32, tierOrnament)'};`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, .7, tierOrnament);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance = diffuseColor.rgb * ${sober ? '.12' : epic ? '.23' : '.18'};\ntotalEmissiveRadiance += vec3(.18, .28, .07) * tierRune * .65;`)
      .replace('* uGlow;', `* uGlow * ${sober ? '0.0' : epic ? '1.2' : '.06'};`);
  };
  material.customProgramCacheKey = () => `${previousKey}:fosca-tier:${finish}`;
}
