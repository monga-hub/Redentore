import * as THREE from 'three';

export interface SelectArea { left: number; right: number; top: number; bottom: number }

/** Every rectangle inside `bounds` whose edges run along the obstacles' (kept `gap` away) and that touches none of them. */
export function freeAreas(bounds: SelectArea, obstacles: readonly SelectArea[], gap: number): SelectArea[] {
  const solid = obstacles.filter(o => o.right > o.left && o.bottom > o.top);
  const rights = [bounds.right, ...solid.map(o => o.left - gap)], tops = [bounds.top, ...solid.map(o => o.bottom + gap)];
  const bottoms = [bounds.bottom, ...solid.map(o => o.top - gap)], out: SelectArea[] = [];
  for (const right of rights) for (const top of tops) for (const bottom of bottoms) {
    const a = { left: bounds.left, right: Math.min(right, bounds.right), top: Math.max(top, bounds.top), bottom: Math.min(bottom, bounds.bottom) };
    if (a.right > a.left && a.bottom > a.top && !solid.some(o => a.left < o.right && a.right > o.left && a.top < o.bottom && a.bottom > o.top)) out.push(a);
  }
  return out;
}

/** Each element within `eps`: a turn's float noise is no change of shape. */
const near = (a: THREE.Matrix4, b: THREE.Matrix4, eps = 1e-6) => a.elements.every((v, i) => Math.abs(v - b.elements[i]) < eps);

/** Under the fist's `held` group (core/models.ts `arm`): the weapon, not him. */
const held = (o: THREE.Object3D | null) => { for (; o; o = o.parent) if (o.name === 'held') return true; return false; };

/** Fit the still, dressed selector pose, including skinned hands and late equipment, as large as the roomiest free area allows,
 * never nearer than `distance`. Only his body sizes him, so every hero stands as tall: a weapon may reach out sideways, kept
 * inside the area too when there is room for it. The hero turns about his own upright axis (the middle of his feet), stood on his parent's origin,
 * and a turn is no change of shape: the lens holds still and a drag spins him in place. Moves the actor only onto that axis;
 * never scales him. */
export class SelectFraming {
  private meshes: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = [];
  private dirty = true;
  private readonly axis = new THREE.Vector3(); // his upright axis, in his own frame

  invalidate(): void { this.dirty = true; }

  fit(root: THREE.Object3D, camera: THREE.PerspectiveCamera, width: number, height: number, areas: SelectArea | readonly SelectArea[], distance: number): void {
    // updateMatrixWorld, not updateWorldMatrix, below him: only it keeps a skin's bind inverse in step once he has moved.
    root.updateWorldMatrix(true, false); root.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    root.traverseVisible(o => { if (o instanceof THREE.Mesh && !o.userData.aura) meshes.push(o); });
    // Shapes in his own frame: a turn of him or of his stage changes none of them.
    const own = root.matrixWorld.clone().invert(), local = meshes.map(mesh => own.clone().multiply(mesh.matrixWorld));
    const same = !this.dirty && meshes.length === this.meshes.length && meshes.every((mesh, i) => {
      const old = this.meshes[i];
      return mesh === old.mesh && mesh.geometry === old.geometry && near(local[i], old.matrix);
    });
    const points: THREE.Vector3[] = [], weapon: boolean[] = [];
    if (!same) {
      this.meshes = meshes.map((mesh, i) => ({ mesh, geometry: mesh.geometry, matrix: local[i] }));
      this.dirty = false;
      meshes.forEach((mesh, m) => { const w = held(mesh); for (let i = 0; i < mesh.geometry.attributes.position.count; i++) { points.push(mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(local[m])); weapon.push(w); } });
      // His axis: the middle of what stands on the ground.
      const bottom = Math.min(...points.map(p => p.y)), top = Math.max(...points.map(p => p.y)), feet = new THREE.Box3();
      for (const p of points) if (p.y <= bottom + (top - bottom) * .08) feet.expandByPoint(p);
      if (!feet.isEmpty()) feet.getCenter(this.axis).setY(0);
    }
    // His axis over his parent's origin, whichever way he faces.
    const offset = this.axis.clone().applyQuaternion(root.quaternion);
    root.position.x = -offset.x; root.position.z = -offset.z;
    root.updateMatrixWorld(true);
    if (same) return;
    const box = new THREE.Box3(), all = new THREE.Box3(), inverse = camera.quaternion.clone().invert();
    points.forEach((p, i) => { p.applyMatrix4(root.matrixWorld).applyQuaternion(inverse); all.expandByPoint(p); if (!weapon[i]) box.expandByPoint(p); });
    if (box.isEmpty()) box.copy(all);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanX = tanY * camera.aspect;
    // Include depth: a hand closer to the lens projects wider than the body's centre plane.
    const halfWidth = (box.max.x - box.min.x) / 2, halfHeight = (box.max.y - box.min.y) / 2, depth = box.max.z - center.z;
    // The nearest lens (the largest hero) any free area takes.
    let area: SelectArea | undefined, d = Infinity;
    for (const a of [areas].flat()) {
      if (a.right <= a.left || a.bottom <= a.top) continue;
      const fit = Math.max(distance, depth + halfWidth / (tanX * (a.right - a.left) / width), depth + halfHeight / (tanY * (a.bottom - a.top) / height));
      if (fit < d) { d = fit; area = a; }
    }
    if (!area) return;
    const projectedWidth = halfWidth / ((d - depth) * tanX) * width;
    const projectedHeight = halfHeight / ((d - depth) * tanY) * height;
    // Keep the established low, slightly rightward composition wherever the usable area permits it.
    // The weapon too, sideways, if the area has room for him and it: the nearest of it projects the widest.
    const reach = width / (2 * tanX * Math.max(d - (all.max.z - center.z), .1)), lo = (all.min.x - center.x) * reach, hi = (all.max.x - center.x) * reach;
    const [left, right] = hi - lo <= area.right - area.left ? [area.left - lo, area.right - hi] : [area.left + projectedWidth / 2, area.right - projectedWidth / 2];
    const x = THREE.MathUtils.clamp(width * (width < height ? .5 : .6), left, right);
    const y = THREE.MathUtils.clamp(height * .52, area.top + projectedHeight / 2, area.bottom - projectedHeight / 2);
    camera.position.copy(center).add(new THREE.Vector3(0, 0, d)).applyQuaternion(camera.quaternion);
    camera.setViewOffset(width, height, width / 2 - x, height / 2 - y, width, height);
    camera.updateMatrixWorld(true);
  }
}
