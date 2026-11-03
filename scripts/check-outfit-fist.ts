import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { copyFist } from '../src/player/hero-outfit-fist.ts';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register((parser) => ({ name: 'test-without-images', beforeRoot() {
  parser.json.materials = parser.json.materials?.map(() => ({}));
  return null;
} }));
for (const hero of ['fosca', 'bortolo', 'tizian', 'zanetto']) {
  const bytes = fs.readFileSync(`public/models/${hero}.glb`);
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  let mesh: THREE.SkinnedMesh | undefined;
  gltf.scene.traverse((o) => { if (o instanceof THREE.SkinnedMesh) mesh ??= o; });
  const body = mesh!.geometry, count = body.getAttribute('position').count;
  const fist = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) fist.set([i / count, -i / count, .123], i * 3);
  body.setAttribute('aFist', new THREE.BufferAttribute(fist, 3));
  const glove = new THREE.BufferGeometry();
  for (const name of ['position', 'skinIndex', 'skinWeight']) {
    const source = body.getAttribute(name), data = new Float32Array(source.count * source.itemSize);
    for (let i = 0; i < source.count; i++) for (let k = 0; k < source.itemSize; k++) data[i * source.itemSize + k] = source.getComponent(i, k);
    glove.setAttribute(name, new THREE.BufferAttribute(data, source.itemSize));
  }
  // Repacked UVs and float export must not disconnect the fist. Seams can share the same bind vertex.
  glove.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2).fill(.73), 2));
  assert.equal(copyFist(body, glove), count, `${hero}: all original bind vertices match after float export`);
  const first = glove.getAttribute('aFist').getZ(0);
  assert(Math.abs(first - .123) < 1e-6);
  const weights = glove.getAttribute('skinWeight');
  for (let k = 0; k < 4; k++) weights.setComponent(0, k, k === 0 ? .5 : 1 / 6);
  assert.equal(copyFist(body, glove), count - 1, 'different skin weights must not inherit another surface’s fist');
  assert.equal(glove.getAttribute('aFist').getZ(0), 0);
  console.log(`${hero}: ${count} original vertices retain fist deformation through float export and new UVs`);
}
