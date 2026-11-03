import * as THREE from 'three';

/** Keep Fosca's palms towards her sides throughout the calm idle, including its wrist movement. */
export function relaxFoscaHands(model: THREE.Object3D, clips: THREE.AnimationClip[]): void {
  const idle = clips.find((clip) => clip.name === 'Idle_Breathe'), spine = model.getObjectByName('Spine');
  if (!idle || !spine) return;
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(idle.clone()).setLoop(THREE.LoopOnce, 1).play();
  const edits: { track: THREE.KeyframeTrack; values: Float32Array }[] = [];
  // Palm surface normals measured in the original Fosca hand frames; these are not the rig's conventional -Z.
  for (const [side, normal] of [['Left', [.917, 0, .398]], ['Right', [-.926, 0, .377]]] as const) {
    const forearm = model.getObjectByName(`${side}ForeArm`), hand = model.getObjectByName(`${side}Hand`);
    const track = idle.tracks.find((t) => t.name === `${side}ForeArm.quaternion`);
    if (!forearm || !hand || !track) continue;
    const values = new Float32Array(track.values), localAxis = hand.position.clone().normalize();
    const axis = new THREE.Vector3(), palm = new THREE.Vector3(), inward = new THREE.Vector3(), wrist = new THREE.Vector3(), elbow = new THREE.Vector3();
    const q = new THREE.Quaternion(), turn = new THREE.Quaternion(), cross = new THREE.Vector3();
    for (let i = 0; i < track.times.length; i++) {
      // Keep the sampler active at the last key so both arms are sampled from the clip.
      mixer.setTime(Math.min(track.times[i], idle.duration - 1e-6));
      model.updateMatrixWorld(true);
      hand.getWorldPosition(wrist);
      axis.copy(wrist).sub(forearm.getWorldPosition(elbow)).normalize();
      palm.set(normal[0], normal[1], normal[2]).transformDirection(hand.matrixWorld).projectOnPlane(axis).normalize();
      inward.copy(spine.getWorldPosition(inward)).sub(wrist).setY(0).projectOnPlane(axis).normalize();
      const angle = Math.atan2(axis.dot(cross.crossVectors(palm, inward)), palm.dot(inward));
      // Twisting about the elbow–wrist axis leaves the wrist in place; sleeve, hand and held weapon follow together.
      turn.setFromAxisAngle(localAxis, angle);
      q.fromArray(track.values, i * 4).multiply(turn).normalize().toArray(values, i * 4);
    }
    edits.push({ track, values });
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(model);
  for (const { track, values } of edits) track.values.set(values);
  model.updateMatrixWorld(true);
}
