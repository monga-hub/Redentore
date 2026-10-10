import * as THREE from 'three';
import { buildLevel } from './level/index.ts';
import { SPAWN } from './level/plan.ts';
import { Input } from './core/input.ts';
import { PlayerController } from './player/controller.ts';
import { ThirdPersonCamera } from './camera/thirdPersonCamera.ts';
import { Hud } from './ui/hud.ts';
import { TouchControls } from './ui/touch.ts';
import { Atmosphere } from './fx/atmosphere.ts';
import { Forsaken } from './abilities/forsaken.ts';
import { ActionBar } from './ui/actionBar.ts';
import { PlayerStats } from './player/stats.ts';
import { Targeting } from './ui/target.ts';
import { Friars } from './enemies/friars.ts';
import { Priests } from './enemies/priests.ts';
import { FRIAR } from './enemies/brain.ts';
import { PRIEST, REVERENDISSIMO, SACERDOTE } from './enemies/caster.ts';
import { Quest } from './quest/progress.ts';
import { QuestView } from './quest/view.ts';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const level = buildLevel();
scene.add(level.root);
const quest = new Quest(level.world); // church shut, key in the chest on the pontile
const questView = new QuestView(quest);
scene.add(questView.root);

const input = new Input(renderer.domElement);
new TouchControls(renderer.domElement, input);
const player = new PlayerController(level.world, SPAWN);
scene.add(player.mesh);
const cam = new ThirdPersonCamera(innerWidth / innerHeight, SPAWN.yaw, level.cameraBlockers);
const hud = new Hud();
const fx = new Atmosphere(renderer, scene, cam.camera, level); // sun, torches, fog, particles, post
const playerStats = new PlayerStats(); // health/mana; enemies call playerStats.takeDamage(n)
const kit = new Forsaken(player, SPAWN, playerStats); // abilities on 1..0 - =
playerStats.onDeath = () => { // ponytail: back to the crypt at full health; a death screen can come with enemies
  kit.system.cancel();
  player.respawn(SPAWN);
  playerStats.revive();
  kit.system.notices.push({ kind: 'error', text: 'Sei caduto. Ti risvegli nella cripta.' });
};
scene.add(kit.vfx.root);
const bar = new ActionBar(kit.system);
const friars = new Friars(level.world, kit.vfx, playerStats); // undead friars hoeing the orto
scene.add(friars.root);
const priests = new Priests(level.world, kit.vfx, playerStats, level.areas); // undead priests casting in the cloisters
scene.add(priests.root);
const targeting = new Targeting(renderer.domElement, cam.camera, scene, level.cameraBlockers, [ // click/tap an enemy, Tab for the nearest
  { name: 'Frate non-morto', max: FRIAR.hp, height: 1.75, all: friars.all, ready: () => friars.root.children.length > 0 },
  { name: 'Prete non-morto', max: PRIEST.hp, height: 1.85, all: priests.all.filter((f) => f.kind === PRIEST), ready: () => priests.root.children.length > 0 },
  { name: 'Sacerdote non-morto', max: SACERDOTE.hp, height: 2.5, all: priests.all.filter((f) => f.kind === SACERDOTE), ready: () => priests.root.children.length > 0 },
  { name: 'Il Reverendissimo', max: REVERENDISSIMO.hp, height: 4.6, all: [priests.boss], ready: () => priests.root.children.length > 0 },
]);
kit.hurt = (inside, n) => { friars.hurtWhere(inside, n); priests.hurtWhere(inside, n); };
kit.system.notices.push({ kind: 'info', text: 'Il portone della chiesa è sbarrato: entra nel convento dalla calle' });
const pressed = (code: string) => input.pressed(code);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  fx.setSize(innerWidth, innerHeight);
  cam.camera.aspect = innerWidth / innerHeight;
  cam.camera.updateProjectionMatrix();
});

// Debug hooks for later ships and for poking around in the console.
Object.assign(window, { scene, level, player, cam, fx, kit, playerStats, friars, priests, targeting, quest });

const timer = new THREE.Timer();
renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  if (input.pressed('Escape')) kit.system.cancel();
  playerStats.update(dt);
  kit.update(dt, pressed); // before the player moves: casts see last frame's motion
  player.update(dt, input, cam.yaw, (input.buttons & 2) !== 0);
  friars.update(dt, player.pos);
  priests.update(dt, player.pos);
  const notice = questView.update(dt, player.pos, pressed, priests.boss);
  if (notice) kit.system.notices.push({ kind: 'info', text: notice });
  if (!quest.bossDead && priests.boss.state === 'dead') { // victory: everyone falls, the portone opens
    quest.win();
    friars.killAll();
    priests.killAll();
    questView.victory();
  }
  cam.update(dt, input, player.pos);
  targeting.update(dt, player.pos);
  hud.setArea(level.areaAt(player.pos.x, player.pos.z)?.label);
  hud.setStats(playerStats);
  fx.update(dt, player.pos);
  fx.render();
  bar.render(dt, pressed);
  input.endFrame();
});
