import * as THREE from 'three';
import { buildLevel } from './level/index.ts';
import { SPAWN } from './level/plan.ts';
import { Input } from './core/input.ts';
import { PlayerController } from './player/controller.ts';
import { ThirdPersonCamera } from './camera/thirdPersonCamera.ts';
import { Hud } from './ui/hud.ts';
import { Atmosphere } from './fx/atmosphere.ts';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const level = buildLevel();
scene.add(level.root);

const input = new Input(renderer.domElement);
const player = new PlayerController(level.world, SPAWN);
scene.add(player.mesh);
const cam = new ThirdPersonCamera(innerWidth / innerHeight, SPAWN.yaw, level.cameraBlockers);
const hud = new Hud();
const fx = new Atmosphere(renderer, scene, cam.camera, level); // sun, torches, fog, particles, post

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  fx.setSize(innerWidth, innerHeight);
  cam.camera.aspect = innerWidth / innerHeight;
  cam.camera.updateProjectionMatrix();
});

// Debug hooks for later ships and for poking around in the console.
Object.assign(window, { scene, level, player, cam, fx });

const timer = new THREE.Timer();
renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  player.update(dt, input, cam.yaw, (input.buttons & 2) !== 0);
  cam.update(dt, input, player.pos);
  hud.setArea(level.areaAt(player.pos.x, player.pos.z)?.label);
  fx.update(dt, player.pos);
  fx.render();
});
