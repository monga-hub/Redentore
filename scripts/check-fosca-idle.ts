import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { relaxFoscaHands } from '../src/player/fosca-idle.ts';

const root = new THREE.Group();
const head = new THREE.Bone(); head.name = 'Head'; root.add(head);
const spine = new THREE.Bone(); spine.name = 'Spine'; spine.position.y = .5; root.add(spine);
for (const side of ['Left', 'Right']) {
  const arm = new THREE.Bone(), hand = new THREE.Bone();
  arm.name = `${side}ForeArm`; hand.name = `${side}Hand`;
  hand.position.set(side === 'Left' ? .1 : -.1, -.3, .02);
  arm.position.set(side === 'Left' ? .3 : -.3, .3, 0); root.add(arm); arm.add(hand);
}
const track = (bone: string) => new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, [0, 1], [0, 0, 0, 1, .1, 0, 0, Math.sqrt(.99)]);
const clips = ['Idle_Breathe', 'Idle_Combat', 'Run_Charge', 'Right_Hand_Sword_Slash'].map(name => new THREE.AnimationClip(name, 1, [track('LeftForeArm'), track('RightForeArm'), track('Head')]));
const before = clips.map(c => c.tracks.map(t => Array.from(t.values)));
relaxFoscaHands(root, clips);
for (let c = 0; c < clips.length; c++) for (let t = 0; t < clips[c].tracks.length; t++) {
  const values = clips[c].tracks[t].values;
  if (c > 0 || t === 2) { assert.deepEqual(Array.from(values), before[c][t]); continue; }
  assert.notDeepEqual(Array.from(values), before[c][t]);
  const hand = root.getObjectByName(t === 0 ? 'LeftHand' : 'RightHand')!;
  for (let i = 0; i < values.length; i += 4) {
    const old = new THREE.Quaternion().fromArray(before[c][t], i), next = new THREE.Quaternion().fromArray(values, i);
    assert(Math.abs(next.length() - 1) < 1e-6);
    assert(hand.position.clone().applyQuaternion(old).distanceTo(hand.position.clone().applyQuaternion(next)) < 1e-6, 'idle twist must not move the wrist');
  }
}
const mixer = new THREE.AnimationMixer(root);
mixer.clipAction(clips[0]).play();
for (const time of [0, .25, .5, .75, .999]) {
  mixer.setTime(time); root.updateMatrixWorld(true);
  for (const side of ['Left', 'Right']) {
    const hand = root.getObjectByName(`${side}Hand`)!, forearm = root.getObjectByName(`${side}ForeArm`)!;
    const wrist = hand.getWorldPosition(new THREE.Vector3());
    const axis = wrist.clone().sub(forearm.getWorldPosition(new THREE.Vector3())).normalize();
    const palm = (side === 'Left' ? new THREE.Vector3(.917, 0, .398) : new THREE.Vector3(-.926, 0, .377)).transformDirection(hand.matrixWorld).projectOnPlane(axis).normalize();
    const inward = spine.getWorldPosition(new THREE.Vector3()).sub(wrist).setY(0).projectOnPlane(axis).normalize();
    assert(palm.dot(inward) > .99, 'palms must face the body throughout the idle');
  }
}
mixer.stopAllAction();
assert.match(fs.readFileSync('src/player/undead.ts', 'utf8'), /if \(!native && hero === 'fosca'\) relaxFoscaHands\(model, gltf.animations\)/);
console.log('Fosca idle: palms use forearm twist; wrist positions, other tracks/clips and other heroes preserved.');
