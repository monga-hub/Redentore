// Intro flythrough check (`npm run check`): the opening take (camera/intro.ts) flies its whole
// path without the lens touching or crossing any visible mesh of the level, passes over or
// around every mob instead of through it, visits the places it is meant to in order, and comes
// to rest exactly on the follow camera's pose behind the player at the spawn.
import * as THREE from 'three';
import { buildLevel } from '../src/level/index.ts';
import { SPAWN } from '../src/level/plan.ts';
import { introPath } from '../src/camera/intro.ts';
import { EYE, ThirdPersonCamera } from '../src/camera/thirdPersonCamera.ts';
import type { Input } from '../src/core/input.ts';
import { spawnGroups } from '../src/enemies/brain.ts';
import { APE, cloisterPlan, gardenPlan, lagoonPlan, spawnApiary, spawnChurch } from '../src/enemies/caster.ts';

const t0 = performance.now();
let failed = 0;
const fail = (why: string) => { failed++; console.error(`FAIL ${why}`); };

const level = buildLevel();
level.root.updateMatrixWorld(true);
const meshes: THREE.Object3D[] = [];
level.root.traverseVisible((o) => { // solid meshes; additive glows (the moonlight shafts in the church) are air
  const m = (o as THREE.Mesh).material as THREE.Material | undefined;
  if ((o as THREE.Mesh).isMesh && !(m?.blending === THREE.AdditiveBlending && !m.depthWrite)) meshes.push(o);
});

// Where the game hands the camera back: the follow camera at rest behind the player at the spawn.
const feet = new THREE.Vector3(SPAWN.x, level.world.standHeight(SPAWN.x, SPAWN.z), SPAWN.z);
const cam = new ThirdPersonCamera(1, SPAWN.yaw, level.cameraBlockers);
cam.update(0, { consume: () => ({ dx: 0, dy: 0, wheel: 0, zoom: 1 }), down: () => false } as unknown as Input, feet);
const endAt = cam.camera.position.clone(), endLook = feet.clone().setY(feet.y + EYE);
const path = introPath(endAt, endLook);

// Mobs where they stand at the start: [x, z, feet y, top y].
const { world } = level;
const mob = (x: number, z: number, h: number) => [x, z, world.standHeight(x, z), world.standHeight(x, z) + h] as const;
const church = spawnChurch(world);
const mobs = [
  ...spawnGroups(world).flat().map((f) => mob(f.x, f.z, 1.9)),
  ...cloisterPlan(world, level.areas).flatMap((c) => c.groups.flat()).map(([x, z]) => mob(x, z, 2.7)),
  ...gardenPlan(world, level.areas).flatMap((g) => g.group).map(([x, z]) => mob(x, z, 2.7)),
  ...lagoonPlan(level.areas).flatMap((g) => g.group).map(([x, z]) => mob(x, z, 2.7)),
  ...church.all.map((p) => mob(p.x, p.z, p === church.boss ? 4.9 : 2.7)),
  ...spawnApiary(world).all.map((b) => mob(b.x, b.z, b.kind === APE ? 3.8 : 2)), // flying: up to the giant's rise in the swarm
];

// Every visible triangle of the level in world space, bucketed on a 4 m grid in plan.
const CLEAR = 0.2; // m around the lens (near plane 0.1)
const CELL = 4;
const tris: THREE.Triangle[] = [], owner: THREE.Object3D[] = [];
const grid = new Map<number, number[]>();
const cell = (i: number, j: number) => (i + 1000) * 4000 + j + 1000;
{
  const m = new THREE.Matrix4(), inst = new THREE.Matrix4();
  for (const o of meshes as THREE.Mesh[]) {
    const pos = o.geometry.attributes.position, idx = o.geometry.index;
    const n = idx ? idx.count : pos.count, count = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1;
    for (let c = 0; c < count; c++) {
      m.copy(o.matrixWorld);
      if (count > 1 || (o as THREE.InstancedMesh).isInstancedMesh) m.multiply((o as THREE.InstancedMesh).getMatrixAt(c, inst) as THREE.Matrix4);
      for (let k = 0; k < n; k += 3) {
        const v = [0, 1, 2].map((q) => new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(k + q) : k + q).applyMatrix4(m));
        const tri = new THREE.Triangle(...v);
        const id = tris.push(tri) - 1;
        owner.push(o);
        const i0 = Math.floor(Math.min(v[0].x, v[1].x, v[2].x) / CELL), i1 = Math.floor(Math.max(v[0].x, v[1].x, v[2].x) / CELL);
        const j0 = Math.floor(Math.min(v[0].z, v[1].z, v[2].z) / CELL), j1 = Math.floor(Math.max(v[0].z, v[1].z, v[2].z) / CELL);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
          const key = cell(i, j);
          let b = grid.get(key);
          if (!b) grid.set(key, b = []);
          b.push(id);
        }
      }
    }
  }
}
/** Triangle ids in the cells around a point, `r` m either way. */
function near(p: THREE.Vector3, r: number): Set<number> {
  const out = new Set<number>();
  for (let i = Math.floor((p.x - r) / CELL); i <= Math.floor((p.x + r) / CELL); i++) {
    for (let j = Math.floor((p.z - r) / CELL); j <= Math.floor((p.z + r) / CELL); j++) for (const id of grid.get(cell(i, j)) ?? []) out.add(id);
  }
  return out;
}

const at = new THREE.Vector3(), look = new THREE.Vector3(), prev = new THREE.Vector3(), d = new THREE.Vector3(), q = new THREE.Vector3();
const ray = new THREE.Ray();
const visited: string[] = [];
const fmt = (v: THREE.Vector3) => `(${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)})`;
const hitName = (id: number) => `${owner[id].userData.role ?? 'mesh'} in ${owner[id].parent?.name ?? '?'}`;
const DT = 0.04;
let reported = 0; // one line per stretch of trouble, not one per frame
for (let t = 0; t <= path.duration; t += DT) {
  path.sample(t, at, look);
  if (!Number.isFinite(at.x + at.y + at.z + look.x + look.y + look.z)) { fail(`t ${t.toFixed(2)} s: path not finite`); break; }
  const where = level.areaAt(at.x, at.z)?.label;
  if (where && visited.at(-1) !== where) visited.push(where);
  const len = t > 0 ? at.distanceTo(prev) : 0;
  let trouble = '';
  for (const id of near(at, len + CLEAR)) {
    const tri = tris[id];
    if (len > 0) { // the lens never crosses a surface between two frames
      ray.set(prev, d.subVectors(at, prev).normalize());
      if (ray.intersectTriangle(tri.a, tri.b, tri.c, false, q) && q.distanceTo(prev) <= len) { trouble = `goes through ${hitName(id)} at ${fmt(q)}`; break; }
    }
    if (tri.closestPointToPoint(at, q).distanceTo(at) < CLEAR) { trouble = `within ${CLEAR} m of ${hitName(id)}`; break; } // nor brushes one
  }
  for (const [x, z, y0, y1] of mobs) {
    if (Math.hypot(at.x - x, at.z - z) < 1.3 && at.y > y0 - 0.5 && at.y < y1 + 0.4) trouble ||= `inside the mob at (${x.toFixed(1)}, ${z.toFixed(1)})`;
  }
  if (trouble && t - reported > 0.5) fail(`t ${t.toFixed(2)} s: lens at ${fmt(at)} ${trouble}`);
  if (trouble) reported = t;
  prev.copy(at);
}

const ROUTE = ['Pontile', 'Riva sulla laguna', 'Sale espositive (antiche officine)', 'Orti coltivati', 'Corridoio del convento', 'Chiostro mediano',
  'Chiostro grande', 'Coro dei frati', 'Crociera e cupola', 'Chiesa del Redentore: navata', 'Sagrato e scalinata', 'Fondamenta San Giacomo'];
let i = 0;
for (const v of visited) if (v === ROUTE[i]) i++;
if (i < ROUTE.length) fail(`route: never reaches "${ROUTE[i]}" in order; visited ${visited.join(' > ')}`);

path.sample(path.duration, at, look);
if (at.distanceTo(endAt) > 1e-3 || look.distanceTo(endLook) > 1e-3) fail(`the take ends at ${fmt(at)} looking at ${fmt(look)}, not on the follow camera ${fmt(endAt)} -> ${fmt(endLook)}`);

console.log(`intro: ${path.duration.toFixed(1)} s, ${visited.length} areas crossed, ${mobs.length} mobs cleared, ${(performance.now() - t0).toFixed(0)} ms`);
if (failed) {
  console.error(`${failed} intro check(s) failed`);
  process.exit(1);
}
