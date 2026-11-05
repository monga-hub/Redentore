import * as THREE from 'three';

export interface SelectArea { left: number; right: number; top: number; bottom: number }

/** Fit the still, dressed selector pose, including skinned hands and late equipment. Never scale the actor. */
export class SelectFraming {
  private meshes: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = [];
  private dirty = true;

  invalidate(): void { this.dirty = true; }

  fit(root: THREE.Object3D, camera: THREE.PerspectiveCamera, width: number, height: number, area: SelectArea, distance: number): void {
    root.updateWorldMatrix(true, true);
    const meshes: THREE.Mesh[] = [];
    root.traverseVisible(o => { if (o instanceof THREE.Mesh && !o.userData.aura) meshes.push(o); });
    if (!this.dirty && meshes.length === this.meshes.length && meshes.every((mesh, i) => {
      const old = this.meshes[i];
      return mesh === old.mesh && mesh.geometry === old.geometry && mesh.matrixWorld.equals(old.matrix);
    })) return;
    this.meshes = meshes.map(mesh => ({ mesh, geometry: mesh.geometry, matrix: mesh.matrixWorld.clone() }));
    this.dirty = false;
    const box = new THREE.Box3(), point = new THREE.Vector3(), inverse = camera.quaternion.clone().invert();
    for (const mesh of meshes) {
      for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).applyQuaternion(inverse);
        box.expandByPoint(point);
      }
    }
    if (box.isEmpty() || area.right <= area.left || area.bottom <= area.top) return;
    const center = box.getCenter(new THREE.Vector3());
    const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanX = tanY * camera.aspect;
    // Include depth: a hand closer to the lens projects wider than the body's centre plane.
    const halfWidth = (box.max.x - box.min.x) / 2, halfHeight = (box.max.y - box.min.y) / 2, depth = box.max.z - center.z;
    const d = Math.max(distance, depth + halfWidth / (tanX * (area.right - area.left) / width), depth + halfHeight / (tanY * (area.bottom - area.top) / height));
    const projectedWidth = halfWidth / ((d - depth) * tanX) * width;
    const projectedHeight = halfHeight / ((d - depth) * tanY) * height;
    // Keep the established low, slightly rightward composition wherever the usable area permits it.
    const x = THREE.MathUtils.clamp(width * (width < height ? .5 : .6), area.left + projectedWidth / 2, area.right - projectedWidth / 2);
    const y = THREE.MathUtils.clamp(height * .52, area.top + projectedHeight / 2, area.bottom - projectedHeight / 2);
    camera.position.copy(center).add(new THREE.Vector3(0, 0, d)).applyQuaternion(camera.quaternion);
    camera.setViewOffset(width, height, width / 2 - x, height / 2 - y, width, height);
    camera.updateMatrixWorld(true);
  }
}
