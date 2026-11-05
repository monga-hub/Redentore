import * as THREE from 'three';

/** Preserve this newly generated character's own neutral reference pose, including its native arm/hand orientation. */
export function poseNativeFosca(scene: THREE.Group): void {
  let skin: THREE.SkinnedMesh | undefined;
  scene.traverse(o => { if (o instanceof THREE.SkinnedMesh && !o.userData.aura) skin ??= o; });
  if (!skin) return;
  scene.updateWorldMatrix(true, true);
  const bind = new Map<THREE.Object3D, THREE.Matrix4>();
  for (let i = 0; i < skin.skeleton.bones.length; i++) {
    bind.set(skin.skeleton.bones[i], skin.skeleton.boneInverses[i].clone().invert().premultiply(scene.matrixWorld));
  }
  for (const bone of skin.skeleton.bones) {
    // Include the Armature group too: Skeleton.pose() assumes an untransformed root parent.
    const parent = bind.get(bone.parent!) ?? bone.parent!.matrixWorld;
    parent.clone().invert().multiply(bind.get(bone)!).decompose(bone.position, bone.quaternion, bone.scale);
  }
  scene.updateMatrixWorld(true);
}
