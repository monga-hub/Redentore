import * as THREE from 'three';
import { buildLevel } from './level/index.ts';
import { SPAWN } from './level/plan.ts';
import { Input } from './core/input.ts';
import { PlayerController } from './player/controller.ts';
import { EYE, ThirdPersonCamera } from './camera/thirdPersonCamera.ts';
import { Intro } from './camera/intro.ts';
import { Hud } from './ui/hud.ts';
import { TouchControls } from './ui/touch.ts';
import { Atmosphere } from './fx/atmosphere.ts';
import { Forsaken } from './abilities/forsaken.ts';
import { ActionBar } from './ui/actionBar.ts';
import { PlayerStats } from './player/stats.ts';
import { Targeting } from './ui/target.ts';
import { Friars } from './enemies/friars.ts';
import { Priests } from './enemies/priests.ts';
import { Bees } from './enemies/bees.ts';
import { FRIAR, GROUPS } from './enemies/brain.ts';
import { APE, APETTA, PRIEST, REVERENDISSIMO, SACERDOTE } from './enemies/caster.ts';
import { CHEST, Quest } from './quest/progress.ts';
import { QuestView } from './quest/view.ts';
import { checkVersion } from './ui/version.ts';
import { Minimap } from './ui/minimap.ts';
import { Menu } from './ui/menu.ts';
import { Discovery } from './core/discovery.ts';
import { FogLayer } from './ui/fog.ts';
import { WorldMap } from './ui/worldMap.ts';
import { deserialize, serialize, takePending, type Game } from './core/save.ts';
import { isDiablo, onStyle } from './core/style.ts';
import { CameraBlend, DiabloCamera } from './camera/diabloCamera.ts';
import { DiabloControls } from './player/diabloControls.ts';
import { Occlusion } from './fx/occlusion.ts';
import { DiabloFx } from './fx/diabloFx.ts';
import { GothicDressing } from './level/gothic.ts';

await checkVersion(); // before the heavy boot: a stale cached build reloads onto the deployed one

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const level = buildLevel();
scene.add(level.root);
const discovery = new Discovery(level.areas); // fog of war: what the player has seen
const fog = new FogLayer(discovery);
const minimap = new Minimap(level.root, fog, () => openMap()); // top-down chart of the level, top right
const worldMap = new WorldMap(discovery, fog, minimap, level.areas); // M: the whole map
const quest = new Quest(level.world); // church shut, key in the chest on the pontile
const questView = new QuestView(quest);
scene.add(questView.root);

const input = new Input(renderer.domElement);
new TouchControls(renderer.domElement, input);
const player = new PlayerController(level.world, SPAWN);
scene.add(player.mesh);
const cam = new ThirdPersonCamera(innerWidth / innerHeight, SPAWN.yaw, level.cameraBlockers);
const dcam = new DiabloCamera(cam.camera); // "Stile Diablo": same lens object, high fixed view
const blend = new CameraBlend(); // eases style switches and the intro's hand-over
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
const bees = new Bees(level.world, kit.vfx, playerStats); // the giant hornet and her workers at the apiary
scene.add(bees.root);
const targeting = new Targeting(renderer.domElement, cam.camera, scene, level.cameraBlockers, [ // click/tap an enemy, Tab for the nearest
  { name: 'Frate non-morto', max: FRIAR.hp, height: 1.75, all: friars.all, ready: () => friars.root.children.length > 0 },
  { name: 'Prete non-morto', max: PRIEST.hp, height: 1.85, all: priests.all.filter((f) => f.kind === PRIEST), ready: () => priests.root.children.length > 0 },
  { name: 'Sacerdote non-morto', max: SACERDOTE.hp, height: 2.5, all: priests.all.filter((f) => f.kind === SACERDOTE), ready: () => priests.root.children.length > 0 },
  { name: 'Il Reverendissimo', max: REVERENDISSIMO.hp, height: 4.6, all: [priests.boss], ready: () => priests.root.children.length > 0, ownBar: () => questView.bossShown },
  { name: 'Ape gigante', max: APE.hp, height: Bees.HEIGHT.queen, all: [bees.queen], ready: () => bees.root.children.length > 0 },
  { name: 'Ape operaia', max: APETTA.hp, height: Bees.HEIGHT.worker, all: bees.all.filter((f) => f.kind === APETTA), ready: () => bees.root.children.length > 0 },
]);
const FALLEN = 2.6; // s the hero lies dead before waking
let dying = 0;
playerStats.onDeath = () => { // the hero falls; the fight is over at once, the wake-up follows
  kit.system.cancel();
  dctl.stop();
  friars.wipe(); // a wipe: whoever was fighting, the boss too, evades home at full health
  priests.wipe();
  bees.wipe();
  player.model.die();
  dying = FALLEN;
};
playerStats.onHurt = (n) => player.model.flinch(n);
/** ponytail: wake at the last checkpoint at full health; a death screen can come later. */
function wake(): void {
  const at = quest.checkpoint();
  player.respawn(at);
  playerStats.revive();
  player.model.revive();
  kit.system.notices.push({ kind: 'error', text: at === SPAWN ? 'Sei caduto. Ti risvegli sulla fondamenta.' : 'Sei caduto. Ti risvegli alla porta del coro.' });
}
kit.hurt = (inside, n) => { friars.hurtWhere(inside, n); priests.hurtWhere(inside, n); bees.hurtWhere(inside, n); };
kit.aimed = () => targeting.target?.mob;
const foes = [...friars.all, ...priests.all, ...bees.all];
kit.foes = () => foes;
const dctl = new DiabloControls(renderer.domElement, cam.camera, scene, player, targeting, () => foes); // click to move and attack
const MAIN = kit.system.slots[0]!; // Caduta d'ossa, the swing a click-attack repeats
dctl.swing = () => kit.system.cooldown(MAIN) === 0 && kit.system.tryCast(0);
const AIMED = new Set(['fall', 'step', 'plague', 'strike']); // casts that go where the hero faces
kit.system.aim = (a) => { if (AIMED.has(a.id)) dctl.aim(); };
const occlusion = new Occlusion([level.root, fx.torches.root], level, [ // walls drop, roofs and props in the way fade out, Diablo view
  [player.mesh, 0xffc46b], [friars.root, 0xff3b2e], [priests.root, 0xff3b2e], [bees.root, 0xff3b2e], // x-ray silhouettes behind what still hides them
]);
const head = new THREE.Vector3();
// Saved games index the mobs: the original friars and every priest first, as before the new friar groups and the bees, which follow.
const old = GROUPS.flat().length;
const mobs = [...friars.all.slice(0, old), ...priests.all, ...friars.all.slice(old), ...bees.all];
const game: Game = { player, stats: playerStats, kit: kit.system, quest, mobs, time: 0, fog: discovery };
const loaded = takePending(); // a slot picked in the menu, carried across the reload
if (loaded) {
  deserialize(game, loaded);
  cam.yaw = player.facing;
  questView.settle();
  kit.system.notices.push({ kind: 'info', text: 'Partita caricata' });
} else kit.system.notices.push({ kind: 'info', text: 'Il portone della chiesa è sbarrato: entra nel convento dalla calle' });
// A new game opens on the flythrough, landing on the follow camera behind the player; a loaded one starts straight away.
cam.update(0, input, player.pos);
const intro = loaded ? undefined : new Intro(cam.camera, cam.camera.position.clone(), player.pos.clone().setY(player.pos.y + EYE));
const menu = new Menu({
  snapshot: () => serialize(game),
  where: () => level.areaAt(player.pos.x, player.pos.z)?.label ?? '',
  opened: () => { kit.system.cancel(); input.consume(); worldMap.close(); dctl.stop(); },
});
const dfx = new DiabloFx([ // damage numbers, gore, loot beams (after a load, so its dead don't fall again)
  { all: friars.all, height: 1.75 },
  { all: priests.all.filter((f) => f.kind === PRIEST), height: 1.85 },
  { all: priests.all.filter((f) => f.kind === SACERDOTE), height: 2.5 },
  { all: [priests.boss], height: 4.6 },
  { all: [bees.queen], height: Bees.HEIGHT.queen },
  { all: bees.all.filter((f) => f.kind === APETTA), height: Bees.HEIGHT.worker },
], kit.vfx, cam.camera, CHEST);
scene.add(dfx.root);
const gothic = new GothicDressing(level.world, fx.torches.braziers, fx.torches.brazierIron); // Meshy skulls, tombs, braziers
level.root.add(gothic.root);
const beams: THREE.Object3D[] = [];
level.root.traverse((o) => { if (o.userData.beam) beams.push(o); });
// Programs for spell effects, the hero's aura and the casters' glows are compiled up front (fx.warm), textures uploaded and a first draw made:
// once everyone has loaded, and on a style switch, as the Diablo hero light changes the light count.
const warm = () => {
  kit.setGhost(true); // Velo spettrale's see-through variant of the hero's materials
  fx.warm();
  kit.setGhost(false);
  fx.warm();
  for (const t of kit.vfx.textures) renderer.initTexture(t); // the effects' atlases, painted on canvases
  kit.prime(); // and a first real draw of each, at nothing
};
let warmed = false;
fx.onDegrade = () => { if (warmed) warm(); };
/** The Diablo view on or off: camera, controls, cuts, look, HUD. The intro keeps its own look and gets it at the hand-over. */
function applyStyle(diablo: boolean): void {
  input.orbit = !diablo;
  dctl.enabled = diablo;
  dctl.stop();
  occlusion.enabled = diablo;
  dfx.enabled = diablo;
  gothic.show(diablo);
  targeting.eye = diablo ? () => head.set(player.pos.x, player.pos.y + EYE, player.pos.z) : undefined; // over the roofs, sight is the hero's
  fx.setStyle(diablo);
  for (const b of beams) b.visible = !diablo;
  document.body.classList.toggle('diablo', diablo);
  warm();
  if (!diablo) cam.yaw = player.facing; // back behind the hero
  dcam.snap();
}
const flying = () => !!intro && !intro.done;
onStyle((diablo) => { // the menu's "Stile Diablo" switch, applied mid-game with an eased camera
  if (flying()) return;
  applyStyle(diablo);
  blend.start(cam.camera);
});
const goal = () => (!quest.key ? CHEST : !quest.bossDead ? priests.boss : undefined); // the key, then the Reverendissimo
function openMap(): void {
  if (menu.paused) return;
  kit.system.cancel();
  input.consume();
  worldMap.show({ x: player.pos.x, z: player.pos.z, facing: player.facing, area: level.areaAt(player.pos.x, player.pos.z)?.label, goal: goal() });
}
const pressed = (code: string) => input.pressed(code);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  fx.setSize(innerWidth, innerHeight);
  cam.camera.aspect = innerWidth / innerHeight;
  cam.camera.updateProjectionMatrix();
});

// Debug hooks for later ships and for poking around in the console.
Object.assign(window, { intro, scene, level, player, cam, dcam, occlusion, dctl, dfx, gothic, fx, kit, playerStats, friars, priests, bees, targeting, quest, menu, game, discovery, worldMap });

const timer = new THREE.Timer();
renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  if (menu.paused || worldMap.open) { // the world holds still behind the menu or map; drags and wheel turns made meanwhile are dropped
    input.consume();
    input.endFrame();
    fx.render();
    return;
  }
  if (intro && !intro.done) {
    if (intro.update(dt)) { // the world plays on for the camera: no HUD, nobody aggroes, gates open for it alone
      const eye = cam.camera.position, unseen = { x: eye.x, y: eye.y + 1000, z: eye.z }; // never level with a mob, so never pulled
      input.consume();
      player.update(dt, input, cam.yaw, false); // idle at the spawn: the intro swallows keys and presses
      friars.update(dt, unseen);
      priests.update(dt, unseen);
      bees.update(dt, unseen);
      questView.peek(eye);
      fx.update(dt, eye);
      fx.render();
      input.endFrame();
      return;
    }
    questView.peek(null);
    if (isDiablo()) { // the flythrough ends behind the hero: ease up into the Diablo view
      applyStyle(true);
      blend.start(cam.camera);
    }
  }
  if (!warmed && friars.root.children.length && priests.root.children.length && bees.root.children.length && player.model.root.children.length) { warmed = true; warm(); } // everyone loaded
  if (input.pressed('Escape')) { // WoW: Esc interrupts a cast first, otherwise opens the menu
    if (kit.system.casting) kit.system.cancel();
    else menu.toggle();
  }
  if (input.pressed('KeyM')) openMap();
  game.time += dt;
  playerStats.update(dt);
  if (dying > 0 && (dying -= dt) <= 0) wake();
  player.frozen = dying > 0;
  const diablo = isDiablo();
  if (!player.frozen) dctl.update(dt, input); // click-to-move steering, click-attack swings
  kit.update(dt, player.frozen ? () => false : pressed); // before the player moves: casts see last frame's motion
  player.update(dt, input, diablo ? dcam.yaw : cam.yaw, !diablo && (input.buttons & 2) !== 0, dctl.steer);
  friars.update(dt, player.pos);
  priests.update(dt, player.pos);
  bees.update(dt, player.pos);
  dfx.update(dt, !quest.key);
  const notice = questView.update(dt, player.pos, pressed, priests.boss);
  if (notice) kit.system.notices.push({ kind: 'info', text: notice });
  if (!quest.bossDead && priests.boss.state === 'dead') { // victory: everyone falls, the portone opens
    quest.win();
    friars.killAll();
    priests.killAll();
    bees.killAll();
    questView.victory();
    player.model.play('victory', 0.4);
  }
  if (diablo) dcam.update(dt, input, player.pos);
  else cam.update(dt, input, player.pos);
  blend.apply(cam.camera, dt);
  kit.vfx.applyShake(cam.camera, dt); // big hits shake the lens; trails face it
  occlusion.update(dt, player.pos, cam.camera);
  targeting.update(dt, player.pos);
  const area = level.areaAt(player.pos.x, player.pos.z)?.label;
  hud.setArea(area);
  discovery.reveal(player.pos.x, player.pos.z);
  fog.update(dt);
  minimap.update(dt, player.pos, player.facing, area, foes, goal());
  hud.setStats(playerStats);
  fx.update(dt, player.pos);
  fx.render();
  bar.render(dt, pressed);
  input.endFrame();
});
