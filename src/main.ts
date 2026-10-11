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
import { CHEST, Quest } from './quest/progress.ts';
import { QuestView } from './quest/view.ts';
import { checkVersion } from './ui/version.ts';
import { Minimap } from './ui/minimap.ts';
import { Menu } from './ui/menu.ts';
import { deserialize, serialize, takePending, type Game } from './core/save.ts';

await checkVersion(); // before the heavy boot: a stale cached build reloads onto the deployed one

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const level = buildLevel();
scene.add(level.root);
const minimap = new Minimap(level.root); // top-down chart of the level, top right
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
const kit = new Forsaken(player, playerStats); // abilities on 1..0 - =
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
playerStats.onDeath = () => { // ponytail: wake at the last checkpoint at full health; a death screen can come later
  kit.system.cancel();
  friars.wipe(); // a wipe: whoever was fighting, the boss too, evades home at full health
  priests.wipe();
  const at = quest.checkpoint();
  player.respawn(at);
  playerStats.revive();
  kit.system.notices.push({ kind: 'error', text: at === SPAWN ? 'Sei caduto. Ti risvegli sulla fondamenta.' : 'Sei caduto. Ti risvegli alla porta del coro.' });
};
kit.hurt = (inside, n) => { friars.hurtWhere(inside, n); priests.hurtWhere(inside, n); };
kit.aimed = () => targeting.target?.mob;
const foes = [...friars.all, ...priests.all];
kit.foes = () => foes;
const game: Game = { player, stats: playerStats, kit: kit.system, quest, mobs: foes, time: 0 };
const loaded = takePending(); // a slot picked in the menu, carried across the reload
if (loaded) {
  deserialize(game, loaded);
  cam.yaw = player.facing;
  questView.settle();
  kit.system.notices.push({ kind: 'info', text: 'Partita caricata' });
} else kit.system.notices.push({ kind: 'info', text: 'Il portone della chiesa è sbarrato: entra nel convento dalla calle' });
const menu = new Menu({
  snapshot: () => serialize(game),
  where: () => level.areaAt(player.pos.x, player.pos.z)?.label ?? '',
  opened: () => { kit.system.cancel(); input.consume(); },
});
const pressed = (code: string) => input.pressed(code);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  fx.setSize(innerWidth, innerHeight);
  cam.camera.aspect = innerWidth / innerHeight;
  cam.camera.updateProjectionMatrix();
});

// Debug hooks for later ships and for poking around in the console.
Object.assign(window, { scene, level, player, cam, fx, kit, playerStats, friars, priests, targeting, quest, menu, game });

const timer = new THREE.Timer();
renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  if (menu.paused) { // the world holds still behind the menu; drags and wheel turns made meanwhile are dropped
    input.consume();
    input.endFrame();
    fx.render();
    return;
  }
  if (input.pressed('Escape')) { // WoW: Esc interrupts a cast first, otherwise opens the menu
    if (kit.system.casting) kit.system.cancel();
    else menu.toggle();
  }
  game.time += dt;
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
  const area = level.areaAt(player.pos.x, player.pos.z)?.label;
  hud.setArea(area);
  const goal = !quest.key ? CHEST : !quest.bossDead ? priests.boss : undefined; // the key, then the Reverendissimo
  minimap.update(dt, player.pos, player.facing, area, foes, goal);
  hud.setStats(playerStats);
  fx.update(dt, player.pos);
  fx.render();
  bar.render(dt, pressed);
  input.endFrame();
});
