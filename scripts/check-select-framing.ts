import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SelectFraming, freeAreas, type SelectArea } from '../src/ui/selectFraming.ts';

const root = new THREE.Group(), bone = new THREE.Bone();
const geometry = new THREE.BoxGeometry(1.36, 2, .42).translate(0, 1, 0), n = geometry.attributes.position.count;
geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
const weights = new Float32Array(n * 4); for (let i = 0; i < n; i++) weights[i * 4] = 1;
geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
const body = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
body.add(bone); body.bind(new THREE.Skeleton([bone])); root.add(body);
// Posed bounds must include skinning, not the exported geometry's bind bounds.
bone.position.x = .21;
const hidden = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100)); hidden.visible = false; root.add(hidden);
const aura = hidden.clone(); aura.visible = true; aura.userData.aura = true; root.add(aura);
const framing = new SelectFraming(), camera = new THREE.PerspectiveCamera(35, 1, .1, 200);
function check(width: number, height: number, area: SelectArea, reset = true, areas: SelectArea | SelectArea[] = area) {
  if (reset) {
    camera.aspect = width / height; camera.fov = width < height ? 43.75 : 35;
    camera.position.set(0, 1.3, 4.3); camera.lookAt(0, 1.02, 0); camera.clearViewOffset();
    framing.invalidate();
  }
  framing.fit(root, camera, width, height, areas, 1.5);
  const point = new THREE.Vector3();
  root.traverseVisible(o => {
    if (!(o instanceof THREE.Mesh) || o.userData.aura) return;
    for (let i = 0; i < o.geometry.attributes.position.count; i++) {
      o.getVertexPosition(i, point).applyMatrix4(o.matrixWorld).project(camera);
      const x = (point.x + 1) * width / 2, y = (1 - point.y) * height / 2;
      assert.ok(x >= area.left - 1e-7 && x <= area.right + 1e-7, `x=${x} in ${width}x${height}`);
      assert.ok(y >= area.top - 1e-7 && y <= area.bottom + 1e-7, `y=${y} in ${width}x${height}`);
    }
  });
  const position = camera.position.clone(), projection = camera.projectionMatrix.clone();
  for (let i = 0; i < 120; i++) framing.fit(root, camera, width, height, areas, 1.5);
  assert.ok(camera.position.equals(position) && camera.projectionMatrix.equals(projection), 'Still frames never breathe');
  assert.ok(root.scale.equals(new THREE.Vector3(1, 1, 1)), 'Only the selector camera changes');
  assert.ok(camera.position.distanceTo(root.position) < 15, 'Invisible shells do not force a tiny hero');
}
for (const [width, height, left, bottom] of [[320,740,12,528], [390,844,12,652], [844,390,308,289], [1440,900,416,752]]) {
  const area = { left, right: width - 12, top: width < height ? 190 : 48, bottom };
  for (const yaw of [-.35, 0, .65, Math.PI / 2, Math.PI]) { root.rotation.y = yaw; check(width,height,area); }
  // Equipment arriving after the initial body and then an atomic replacement on the same actor.
  const prop = new THREE.Mesh(new THREE.BoxGeometry(.2, 2.5, .2)); prop.position.set(-1.1, 1.4, .7); bone.add(prop);
  check(width,height,area,false);
  bone.remove(prop); root.remove(body);
  const replacement = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.25, .8).translate(.1,1.125,0)); root.add(replacement);
  check(width,height,area,false);
  root.remove(replacement); root.add(body);
}
// The free areas around a top-right title and a bottom-right foot: none touches either, and the hero takes the roomiest.
const title = { left: 600, right: 830, top: 8, bottom: 42 }, lore = { left: 560, right: 830, top: 300, bottom: 330 }, acts = { left: 420, right: 830, top: 337, bottom: 378 };
const bounds = { left: 293, right: 832, top: 12, bottom: 378 }, free = freeAreas(bounds, [title, lore, acts], 12);
assert.ok(free.length > 1, 'Several shapes of free room');
for (const a of free) for (const o of [title, lore, acts]) assert.ok(a.right + 12 <= o.left || a.left >= o.right + 12 || a.bottom + 12 <= o.top || a.top >= o.bottom + 12, 'Free areas keep clear of the HUD');
assert.ok(free.some(a => a.top === 12 && a.bottom === 325 && a.right === 548), 'The tall column beside the title and the lore');
root.rotation.y = 0;
const size = () => { // the projected height of what shows
  let lo = Infinity, hi = -Infinity; const p = new THREE.Vector3();
  root.traverseVisible(o => { if (o instanceof THREE.Mesh && !o.userData.aura) for (let i = 0; i < o.geometry.attributes.position.count; i++) {
    const y = o.getVertexPosition(i, p).applyMatrix4(o.matrixWorld).project(camera).y; lo = Math.min(lo, y); hi = Math.max(hi, y); } });
  return hi - lo;
};
const sizes = free.map(a => { camera.clearViewOffset(); framing.invalidate(); framing.fit(root, camera, 844, 390, a, 1.5); return size(); }), roomiest = free[sizes.findIndex(v => v > Math.max(...sizes) - 1e-9)];
check(844, 390, roomiest, true, free); // every vertex inside the roomiest area, and as large as it alone allows
assert.ok(Math.abs(size() - Math.max(...sizes)) < 1e-6, 'The hero takes the roomiest free area');
assert.ok(roomiest.bottom - roomiest.top > 378 - 42 - 24 - 50, 'Taller than the band between title and foot');
console.log('selector framing: free areas around the HUD, the roomiest taken, posed skin/props, hidden/aura exclusion, portrait/landscape/desktop, rotation, late equipment, swaps, resize and still frames');
