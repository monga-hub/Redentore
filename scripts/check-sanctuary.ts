import * as THREE from 'three';
import assert from 'node:assert/strict';
import { buildLevel } from '../src/level/index.ts';
import { Quest } from '../src/quest/progress.ts';
import { SANCTUARY } from '../src/quest/sanctuary.ts';
const level = buildLevel(), q = new Quest(level.world), gate = q.gate('santa-croce');
assert.equal(level.world.blocked(-118,-14,0), true);
assert.equal(q.prompt({x:-118,y:0,z:-12})?.act, undefined);
q.accept2(); assert.equal(gate.open, false);
assert.equal(q.prompt({x:-122,y:0,z:-30})?.service, undefined);
q.win2(); assert.equal(gate.open, true);
for(let z=-12;z>=-34;z-=0.5) assert.equal(level.world.blocked(-118,z,0),false,`aisle ${z}`);
assert.equal(level.world.blocked(-126,-24,0),true);
assert.equal(level.world.blocked(-110,-24,0),true);
assert.equal(level.world.blocked(-118,-40,0),true);
for(const [id,npc] of Object.entries(SANCTUARY)) {
  assert.equal(level.world.blocked(npc.x,npc.z+1.5,0),false);
  assert.equal(q.prompt({x:npc.x,y:0,z:npc.z+1.5})?.service,id);
}
const boxes=level.world.boxes.length;q.win2();assert.equal(level.world.boxes.length,boxes);
q.accept3();q.win3();assert.equal(gate.open,true);
console.log('sanctuary ok: boss2 permanent gate, sealed shell, clear aisle and both normal service prompts');

// The pews must be drawn as well as collidable (an unflushed Props batch used to leave invisible furniture).
let pewDrawn=false;const matrix=new THREE.Matrix4(),position=new THREE.Vector3();
level.root.traverse((o)=>{if(o instanceof THREE.InstancedMesh&&o.userData.role==='wood')for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);if(Math.abs(position.x+122)<0.01&&Math.abs(position.z+19)<0.2&&position.y<1)pewDrawn=true;}});
assert.equal(pewDrawn,true,'sanctuary pew geometry is missing');

// Independent walls can fade between the Diablo camera and the hero inside this room.
const side=level.cameraBlockers.find((m)=>Math.abs(m.position.x+126)<0.01&&Math.abs(m.position.z+27)<0.01);
const back=level.cameraBlockers.find((m)=>Math.abs(m.position.x+118)<0.01&&Math.abs(m.position.z+40)<0.01);
assert.ok(side&&back);assert.notEqual(side.userData.piece,back.userData.piece,'sanctuary shell is one opaque occlusion piece');

// The wider pews leave a continuous central aisle, side aisles and both service approaches.
for (const x of [-124.4, -118, -111.6]) for (let z = -16; z >= -33.5; z -= 0.25)
  assert.equal(level.world.blocked(x, z, 0), false, `sanctuary walking lane ${x},${z}`);
for (const z of [-20.5, -23.5, -26.5, -29.5, -30.5, -33.5]) for (let x = -124.4; x <= -111.6; x += 0.25)
  assert.equal(level.world.blocked(x, z, 0), false, `sanctuary cross aisle ${x},${z}`);
for (const x of [-122, -114]) for (const z of [-19, -22, -25, -28]) {
  assert.equal(level.world.blocked(x, z, 0), true, 'pew collider missing');
  const at = { x, z }; level.world.resolve(at, 0);
  assert.equal(level.world.blocked(at.x, at.z, 0), false, 'pew traps the hero');
}
assert.equal(level.world.blocked(-125.3, -27, 0), true, 'projecting pier has no collider');
// Candle FX reuse the existing budget: no new lamp/torch/glow sources or texture assets.
const churchLights = level.lights.filter(l => l.x > -126 && l.x < -110 && l.z < -14 && l.z > -40);
assert.equal(churchLights.filter(l => l.kind !== 'candle').length, 13);
assert.ok(churchLights.length <= 25);
console.log('sanctuary art ok: side/cross aisles, pew escape, pier collisions and bounded lighting');

// Weathering must stay local even though the builder normally merges a whole zone per role.
level.root.updateMatrixWorld(true);
const aged = new Set<THREE.Material>();
let croceWorn = false, zitelleWorn = false, outsideStone = false;
level.root.traverse(o => {
  if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
  if (o.material.name.startsWith('church-worn-')) {
    aged.add(o.material);
    o.geometry.computeBoundingBox();
    const bounds = o.geometry.boundingBox!.clone().applyMatrix4(o.matrixWorld);
    // Merged decor uses world coordinates; instanced meshes retain unit geometry.
    if (o instanceof THREE.InstancedMesh) { o.computeBoundingBox(); bounds.copy(o.boundingBox!); }
    const center = bounds.getCenter(new THREE.Vector3());
    assert.ok(center.x > -255 && center.x < -109, 'worn church material escaped to another building');
    if (center.x > -130) croceWorn = true;
    if (center.x < -225) zitelleWorn = true;
  } else if (o.userData.role === 'stone' && o.position.x > -100) outsideStone = true;
});
assert.ok(croceWorn && zitelleWorn && outsideStone);
assert.ok(aged.size <= 6, 'church material variants exceeded their budget');
console.log('church materials ok: both churches aged, neighbouring stone unchanged, at most six shared variants');
