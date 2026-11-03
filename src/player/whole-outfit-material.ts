import * as THREE from 'three';
import type { OutfitSelection } from './whole-outfit-key.ts';

// Cloth and metal keep a build's palette through chapter and rarity progression.
const PALETTES: Record<string, [string, string]> = {
  'risorto-fossore': ['#492d28', '#b9a887'],
  'risorto-divoratore': ['#211b2d', '#776781'],
  'risorto-predatore': ['#291c26', '#77404a'],
  'bortolo-custode-laguna': ['#173d43', '#b6c6bd'],
  'bortolo-barcaiolo-tempesta': ['#171f37', '#71645a'],
  'bortolo-navigatore-bora': ['#273d40', '#6d9e9d'],
  'fosca-untora': ['#343b20', '#a7a280'],
  'fosca-custode-suffragio': ['#282522', '#e2d8b8'],
  'fosca-penitente-contagio': ['#3a2830', '#9a8382'],
  'tizian-maestro-fornace': ['#30241c', '#ac7851'],
  'tizian-frate-vetro': ['#343c38', '#d5c9a4'],
  'tizian-penitente-braci': ['#3c1a23', '#9d5850'],
  'zanetto-araldo-temporale': ['#242538', '#74788c'],
  'zanetto-batacchio-sepolcro': ['#3c3128', '#b3a17d'],
  'zanetto-rintocco-guerra': ['#302332', '#88677d'],
};
export function wholeMaterialKey(finish: string, selection?: OutfitSelection): string {
  return selection && !selection.legacy ? `${finish}:${selection.build}:${selection.chapter}:${selection.rarity}` : finish;
}
export function finishWholeMaterial(material: THREE.MeshStandardMaterial, selection: OutfitSelection): void {
  const palette = PALETTES[selection.build];
  if (!palette) return;
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey();
  const rgb = (hex: string) => new THREE.Color(hex).toArray().map(v => v.toFixed(5)).join(',');
  const common = selection.rarity === 'comune', epic = selection.rarity === 'epico' || selection.rarity === 'leggendario';
  // Later chapters refine the same garment rather than substituting another build's silhouette.
  const relief = (common ? .55 : epic ? 1 : .8) + (selection.chapter - 1) * .035;
  material.normalScale.multiplyScalar(relief);
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float outfitLight = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
      vec3 outfitCloth = mix(vec3(${rgb(palette[0])}), vec3(${rgb(palette[1])}), smoothstep(.035, .65, outfitLight));
      float outfitMetal = 0.0;
      #ifdef USE_METALNESSMAP
        outfitMetal = texture2D(metalnessMap, vMetalnessMapUv).b;
      #endif
      diffuseColor.rgb = mix(diffuseColor.rgb, outfitCloth, .72 * (1.0 - outfitMetal));
      ${common ? 'diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(.2126, .7152, .0722))), diffuseColor.rgb, .58);' : ''}
    `).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + ${common ? '.16' : epic ? '-.04' : '.02'} - ${((selection.chapter - 1) * .015).toFixed(4)}, .28, 1.0);`);
  };
  material.customProgramCacheKey = () => `${previousKey}:whole:${selection.build}:${selection.chapter}:${selection.rarity}`;
}
