import * as THREE from 'three';

/** Gloves retain original bind vertices and weights, even when their UVs are repacked. */
export function copyFist(body: THREE.BufferGeometry, glove: THREE.BufferGeometry): number {
  const source = body.getAttribute('aFist'), original = body.getAttribute('position'), position = glove.getAttribute('position');
  const offsets = new Float32Array(position.count * 3);
  glove.setAttribute('aFist', new THREE.BufferAttribute(offsets, 3));
  if (!source) return 0;
  const weights = (g: THREE.BufferGeometry, i: number) => {
    const j = g.getAttribute('skinIndex'), w = g.getAttribute('skinWeight'), values = new Map<number, number>();
    for (let k = 0; k < 4; k++) values.set(j.getComponent(i, k), (values.get(j.getComponent(i, k)) ?? 0) + w.getComponent(i, k));
    return values;
  };
  const cell = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const vertices = new Map<string, number[]>(), rigs = Array.from({ length: original.count }, (_, i) => weights(body, i));
  for (let i = 0; i < original.count; i++) {
    const key = cell(...[0, 1, 2].map((k) => Math.round(original.getComponent(i, k) * 1e5)) as [number, number, number]);
    const found = vertices.get(key);
    if (found) found.push(i); else vertices.set(key, [i]);
  }
  let matched = 0;
  for (let i = 0; i < position.count; i++) {
    const p = [position.getX(i), position.getY(i), position.getZ(i)], xyz = p.map((v) => Math.round(v * 1e5)), rig = weights(glove, i);
    let from: number | undefined;
    // Float export can cross a cell boundary; only coincident vertices with matching weights qualify.
    search: for (const dx of [0, -1, 1]) for (const dy of [0, -1, 1]) for (const dz of [0, -1, 1]) {
      for (const candidate of vertices.get(cell(xyz[0] + dx, xyz[1] + dy, xyz[2] + dz)) ?? []) {
        if (p.some((v, k) => Math.abs(v - original.getComponent(candidate, k)) > 1e-6)) continue;
        const prior = rigs[candidate];
        if ([...new Set([...rig.keys(), ...prior.keys()])].some((bone) => Math.abs((rig.get(bone) ?? 0) - (prior.get(bone) ?? 0)) > 1e-5)) continue;
        from = candidate; break search;
      }
    }
    if (from === undefined) continue;
    for (let k = 0; k < 3; k++) offsets[i * 3 + k] = source.getComponent(from, k);
    matched++;
  }
  return matched;
}
