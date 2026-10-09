import * as THREE from 'three';

// Greybox palette: flat tints per semantic role so volumes read apart.
// Later ships swap these for real materials by role, without touching the layout:
// every mesh's `userData.role` names the key it was built with.
const TINTS = {
  stone: 0xd9d4c7, // pietra d'Istria (facade, church)
  stoneDark: 0xb4ad9f, // columns, cornices, steps
  plaster: 0xb8695a, // red plaster of the calli and convent
  brick: 0xa8735d, // cloister walls/arches
  mass: 0x9d958a, // inaccessible building volumes
  roof: 0x8f5544, // coppi
  paving: 0x7d7872, // trachite
  ground: 0x8e887d, // base site slab
  gravel: 0xbfb39b, // garden paths
  grass: 0x84a062,
  soil: 0x7a5c43, // cultivated beds
  hedge: 0x5b7a45,
  foliage: 0x6f8f4f,
  trunk: 0x6b5340,
  wood: 0x8a6545, // pergolas, pier
  water: 0x4a7790,
  glass: 0xa9cdd6,
  player: 0xe0b040,
} as const;

export type Role = keyof typeof TINTS;

const cache = new Map<string, THREE.Material>();

/** Shared flat material for a role; `doubleSide` for shells seen from inside (dome, drum). */
export function material(role: Role, doubleSide = false): THREE.Material {
  const key = role + (doubleSide ? ':2' : '');
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: TINTS[role], side: doubleSide ? THREE.DoubleSide : THREE.FrontSide });
    if (role === 'glass') Object.assign(m, { transparent: true, opacity: 0.55 });
    if (role === 'water') Object.assign(m, { transparent: true, opacity: 0.85 });
    cache.set(key, m);
  }
  return m;
}
