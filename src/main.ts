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
import { PHONE } from './core/device.ts';
import { ABILITIES, Forsaken, tune } from './abilities/forsaken.ts';
import { CARD, Levels, levelOf, offer, tuneOf, type Card } from './player/levels.ts';
import { LevelUp } from './ui/levelUp.ts';
import { ActionBar } from './ui/actionBar.ts';
import { PlayerStats } from './player/stats.ts';
import { Targeting } from './ui/target.ts';
import { Friars } from './enemies/friars.ts';
import { Priests } from './enemies/priests.ts';
import { Bees } from './enemies/bees.ts';
import { CODEGA, GASTALDO, GONDOLIERE, GOVERNATRICE, MAESTRA, VELO, ZITELLA, spawnLevel2 } from './enemies/zitelle.ts';
import { FRIAR, GROUPS } from './enemies/brain.ts';
import { APE, APETTA, PRIEST, REVERENDISSIMO, SACERDOTE } from './enemies/caster.ts';
import { ANDITO, CHEST, CROCE, NPC, Quest } from './quest/progress.ts';
import { QuestView } from './quest/view.ts';
import { checkVersion } from './ui/version.ts';
import { Minimap } from './ui/minimap.ts';
import { Menu } from './ui/menu.ts';
import { Discovery } from './core/discovery.ts';
import { FogLayer } from './ui/fog.ts';
import { WorldMap } from './ui/worldMap.ts';
import { autosave, deserialize, resume, serialize, takePending, type Game } from './core/save.ts';
import { isDiablo, onStyle } from './core/style.ts';
import { CameraBlend, DiabloCamera } from './camera/diabloCamera.ts';
import { DiabloControls } from './player/diabloControls.ts';
import { Occlusion } from './fx/occlusion.ts';
import { DiabloFx } from './fx/diabloFx.ts';
import { GothicDressing } from './level/gothic.ts';
import { audioReady, initAudio, tap, voices } from './audio/engine.ts';
import { Director } from './audio/director.ts';
import { Bag } from './loot/bag.ts';
import { Drops, type Dropper } from './loot/drops.ts';
import { BagPanel } from './ui/bag.ts';
import { Equipment, crit, effects } from './loot/gear.ts';
import { SheetPanel } from './ui/sheet.ts';
import { VendorPanel } from './ui/vendor.ts';

await checkVersion(); // before the heavy boot: a stale cached build reloads onto the deployed one

initAudio(); // before the intro, whose first press unlocks the sound
// Phones: a 1.5 pixel ratio (a third of DPR 3's pixels on an iPhone) and no MSAA on the canvas, which the post chain draws one quad into.
const renderer = new THREE.WebGLRenderer({ antialias: !PHONE });
renderer.setPixelRatio(Math.min(devicePixelRatio, PHONE ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const level = buildLevel();
scene.add(level.root);
const discovery = new Discovery(level.areas); // fog of war: what the player has seen
const fog = new FogLayer(discovery);
const minimap = new Minimap(level.root, fog, () => openMap()); // top-down chart of the level, top right
const worldMap = new WorldMap(discovery, fog, minimap, level.areas); // M: the whole map
const quest = new Quest(level.world); // church shut, key in the chest on the pontile, Fra' Zuane on the fondamenta

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
const questView = new QuestView(quest, kit.vfx); // gates, chest, Fra' Zuane and his dialogue, tracker
scene.add(questView.root);
const bar = new ActionBar(kit.system);
const levels = new Levels(); // XP from the dead, the cards picked; laid on the kit by `apply`
const levelUp = new LevelUp(); // the two-card window
const gear = new Equipment(); // what the hero wears: the hemp set and the bone club at first
let worn = effects(gear.totals);
levels.apply = () => { // the cards and the gear, laid on the kit and the stats
  Object.assign(tune, tuneOf(levels.picks));
  worn = effects(gear.totals);
  playerStats.grow(tune.hp, tune.mana, worn.hp, worn.mana);
  playerStats.armor = tune.armor * (1 - worn.cut);
  playerStats.regen = tune.regen + worn.regen;
  player.speed = tune.speed;
  kit.system.chargeMul = tune.fury;
  kit.system.chargeAfter = tune.furyStart;
  for (const id of tune.owned) kit.system.unlock(id);
};
gear.onChange = () => levels.apply();
levels.apply(); // the starter set's stats (a load lays its own again)
const friars = new Friars(level.world, kit.vfx, playerStats); // undead friars hoeing the orto
scene.add(friars.root);
const priests = new Priests(level.world, kit.vfx, playerStats, level.areas); // undead priests casting in the cloisters
scene.add(priests.root);
const bees = new Bees(level.world, kit.vfx, playerStats); // the giant hornet and her workers at the apiary
scene.add(bees.root);
const l2 = spawnLevel2(level.world); // level 2: the fondamenta to the Zitelle, the Pia Casa, the Governatrice
const zitelle = new Priests(level.world, kit.vfx, playerStats, level.areas, l2, true); // its ~6 MB of bodies load with the second quest (stream)
scene.add(zitelle.root);
/** Level 2's kinds: name, kind, height. */
const L2_KINDS = [['Gondoliere annegato', GONDOLIERE, 1.85], ['Codega', CODEGA, 1.8], ['Zitella', ZITELLA, 1.65], ['Zitella del velo', VELO, 1.65], ['Il Gastaldo dei gondolieri', GASTALDO, 2.5], ['La Maestra del merletto', MAESTRA, 2.3], ['La Governatrice', GOVERNATRICE, 4.3]] as const;
const ofKind = (k: typeof L2_KINDS[number][1]) => zitelle.all.filter((f) => f.kind === k);
const targeting = new Targeting(renderer.domElement, cam.camera, scene, level.cameraBlockers, [ // click/tap an enemy, Tab for the nearest
  { name: 'Frate non-morto', max: FRIAR.hp, height: 1.75, all: friars.all, ready: () => friars.root.children.length > 0 },
  { name: 'Prete non-morto', max: PRIEST.hp, height: 1.85, all: priests.all.filter((f) => f.kind === PRIEST), ready: () => priests.root.children.length > 0 },
  { name: 'Sacerdote non-morto', max: SACERDOTE.hp, height: 2.5, all: priests.all.filter((f) => f.kind === SACERDOTE), ready: () => priests.root.children.length > 0 },
  { name: 'Il Reverendissimo', max: REVERENDISSIMO.hp, height: 4.6, all: [priests.boss], ready: () => priests.root.children.length > 0, ownBar: () => questView.bossShown },
  { name: 'Ape gigante', max: APE.hp, height: Bees.HEIGHT.queen, all: [bees.queen], ready: () => bees.root.children.length > 0 },
  { name: 'Ape operaia', max: APETTA.hp, height: Bees.HEIGHT.worker, all: bees.all.filter((f) => f.kind === APETTA), ready: () => bees.root.children.length > 0 },
  ...L2_KINDS.map(([name, kind, height]) => ({ name, max: kind.hp, height, all: ofKind(kind), ready: () => zitelle.root.children.length > 0, ...(kind === GOVERNATRICE ? { ownBar: () => questView.bossShown } : {}) })),
]);
const FALLEN = 2.6; // s the hero lies dead before waking
let dying = 0;
playerStats.onDeath = () => { // the hero falls; the fight is over at once, the wake-up follows
  kit.system.cancel();
  kit.magic.reset(); // bolts in flight, burning floors, a leap: gone with the hero
  dctl.stop();
  friars.wipe(); // a wipe: whoever was fighting, the boss too, evades home at full health
  priests.wipe();
  bees.wipe();
  zitelle.wipe();
  player.model.die();
  dying = FALLEN;
};
playerStats.onHurt = (n) => { player.model.flinch(n); kit.system.pushback(); }; // a hit sets a cast bar back
/** ponytail: wake at the last checkpoint at full health; a death screen can come later. */
function wake(): void {
  const at = quest.checkpoint();
  player.respawn(at);
  playerStats.revive();
  player.model.revive();
  const where = at === SPAWN ? 'sulla fondamenta' : at === CROCE ? 'oltre il Ponte de la Croce' : at === ANDITO ? "nell'andito delle Zitelle" : 'alla porta del coro';
  kit.system.notices.push({ kind: 'error', text: `Sei caduto. Ti risvegli ${where}.` });
}
kit.hurt = (inside, n) => { n = crit(n * tune.dmg * quest.dmgMul * worn.dmg, worn.crit); friars.hurtWhere(inside, n); priests.hurtWhere(inside, n); bees.hurtWhere(inside, n); zitelle.hurtWhere(inside, n); };
kit.aimed = () => targeting.target?.mob;
const foes = [...friars.all, ...priests.all, ...bees.all, ...zitelle.all];
kit.foes = () => foes;
const dctl = new DiabloControls(renderer.domElement, cam.camera, scene, player, targeting, () => foes); // click to move and attack
const MAIN = ABILITIES.find((a) => a.id === 'fall')!; // Caduta d'ossa, the swing a click-attack repeats, wherever it sits on the bar
dctl.swing = () => kit.system.cooldown(MAIN) === 0 && kit.system.tryCast(kit.system.slots.indexOf(MAIN));
const AIMED = new Set(['fall', 'step', 'plague', 'strike', 'pyre', 'frost', 'lance', 'chain', 'toll', 'leap', 'grace', 'charge']); // casts that go where the hero faces
kit.system.aim = (a) => { if (AIMED.has(a.id)) dctl.aim(); };
const occlusion = new Occlusion([level.root, fx.torches.root], level, [ // walls drop, roofs and props in the way fade out, Diablo view
  [player.mesh, 0xffc46b], [friars.root, 0xff3b2e], [priests.root, 0xff3b2e], [bees.root, 0xff3b2e], [zitelle.root, 0xff3b2e], // x-ray silhouettes behind what still hides them
]);
const head = new THREE.Vector3();
// Saved games index the mobs: the original friars and every priest first, as before the new friar groups and the bees, which follow.
const old = GROUPS.flat().length;
const mobs = [...friars.all.slice(0, old), ...priests.all, ...friars.all.slice(old), ...bees.all, ...zitelle.all]; // level 2's last
const bag = new Bag(); // gold and items picked up off the dead
const game: Game = { player, stats: playerStats, kit: kit.system, quest, mobs, time: 0, fog: discovery, levels, bag, gear };
const worth = mobs.map((m) => ('kind' in m ? m.kind.xp : FRIAR.xp)); // XP each mob is worth dead
const pending = takePending(); // a slot picked in the menu, carried across the reload
const loaded = pending ?? resume(); // or the run in progress: a tab iOS killed for memory and reloaded, the home-screen app relaunched
if (loaded) {
  deserialize(game, loaded);
  cam.yaw = player.facing;
  questView.settle();
  kit.system.notices.push({ kind: 'info', text: pending ? 'Partita caricata' : 'Partita ripresa' });
} else kit.system.notices.push({ kind: 'info', text: "Il portone della chiesa è sbarrato. Parla con Fra' Zuane" });
let bossAct = 0, bossRage = false, lastBoss = priests.boss;
/** A boss's new act, called out: the Reverendissimo's, the Governatrice's. */
const ACTS = [
  ['Il Reverendissimo marchia il pavimento: esci dai cerchi!', 'Il Reverendissimo è furibondo: colpisce sempre più spesso!'],
  ['La Governatrice chiama le sue figlie: finché vivono, il velo la protegge!', 'Altre due zitelle accorrono al velo: abbattile!', 'La Governatrice gira il fuso: stai fuori dai fili!'],
];
// XP is what the hero killed plus Fra' Zuane's rewards. The dead of a load were counted into its saved XP (a save from
// before the levels: the worth of its dead, short of a won fight's), and a victory's dead are worth nothing.
const fell = mobs.map((m) => m.state === 'dead');
let slain = loaded?.build ? loaded.build.xp - quest.bonusXp : quest.bossDead ? 0 : worth.reduce((s, w, i) => s + (fell[i] ? w : 0), 0);
const sweep = () => mobs.forEach((m, i) => { if (m.state === 'dead') fell[i] = true; }); // after a victory: its dead count for nothing
let shownLv = 1 + levels.picks.length; // a save from before the levels flashes its level once
const picked = (id: string) => levels.picks.filter((p) => p === id).length;
/** The next level-up's two cards; the world holds still until one is picked. */
function openLevelUp(): void {
  kit.system.cancel();
  input.consume();
  dctl.stop();
  levelUp.show(levels.picks.length + 2, offer(levels.picks), picked, (c: Card) => {
    levels.picks.push(c.id);
    levels.apply();
    if (c.id === 'linfa') {
      const h = playerStats.heal(playerStats.hpMax * 0.3);
      playerStats.restoreMana(playerStats.manaMax * 0.3);
      if (h > 0) kit.system.notices.push({ kind: 'heal', text: `+${Math.round(h)}` });
    }
    kit.ascend();
    kit.system.notices.push({ kind: 'info', text: c.kind === 'ability' ? `Nuova abilità: ${c.name}` : c.name });
  });
}
// A new game opens on the flythrough, landing on the follow camera behind the player; a loaded one starts straight away.
cam.update(0, input, player.pos);
const intro = loaded ? undefined : new Intro(cam.camera, cam.camera.position.clone(), player.pos.clone().setY(player.pos.y + EYE), audioReady);
const audio = new Director({ // sound and music, read off the world every frame
  player, stats: playerStats, kit, quest, friars: friars.all, casters: [...priests.all, ...zitelle.all], bees: bees.all,
  get boss() { return quest.bossDead ? zitelle.boss : priests.boss; }, // whichever boss is still to come
  get spent() { return zitelle.spent.length ? [...priests.spent, ...zitelle.spent] : priests.spent; }, fires: fx.torches.em, areaAt: (x, z) => level.areaAt(x, z),
});
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
  ...L2_KINDS.map(([, kind, height]) => ({ all: ofKind(kind), height })),
], kit.vfx, cam.camera, CHEST);
scene.add(dfx.root);
const drops = new Drops([ // gold and items out of the dead, walked over into the bag (after a load, so its dead drop nothing)
  { all: friars.all, tier: 'friar' },
  { all: priests.all.filter((f) => f.kind === PRIEST), tier: 'priest' },
  { all: priests.all.filter((f) => f.kind === SACERDOTE), tier: 'elite' },
  { all: [priests.boss], tier: 'boss' },
  { all: [bees.queen], tier: 'elite' },
  { all: bees.all.filter((f) => f.kind === APETTA), tier: 'worker' },
].map((d) => ({ ...d, quiet: () => quest.bossDead }) as Dropper).concat(([[GONDOLIERE, 'friar'], [CODEGA, 'priest'], [ZITELLA, 'priest'], [VELO, 'priest'], [GASTALDO, 'elite'], [MAESTRA, 'elite'], [GOVERNATRICE, 'boss']] as const).map(([kind, tier]) => ({ all: ofKind(kind), tier, level: 2, quiet: () => quest.boss2Dead }))), level.world, bag, cam.camera);
scene.add(drops.root);
const bagPanel = new BagPanel(bag, gear); // B or the satchel button
bagPanel.opened = () => { kit.system.cancel(); input.consume(); worldMap.close(); dctl.stop(); };
const sheet = new SheetPanel(bagPanel, bag, gear, () => ({ // C or the figure button: the paper doll
  lv: levels.lv, hp: playerStats.hpMax, mana: playerStats.manaMax, armor: gear.totals.armatura, cut: 1 - playerStats.armor,
  dmg: tune.dmg * worn.dmg, crit: worn.crit, haste: worn.haste / quest.castMul, regen: playerStats.regen,
}));
const vendor = new VendorPanel(bagPanel, bag, gear); // Fra' Bortolo's Commercia
questView.shop = () => vendor.open();
questView.reward = (gold) => { bag.gold += gold; };
questView.blockDoors(level.cameraBlockers); // shut doors stop the camera and the targeting rays
vendor.level2 = () => quest.accepted2; // level 2's epics on the road to the Zitelle
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
/** The objective's pin: Fra' Zuane, the key, the Reverendissimo; then Fra' Zuane, the Zitelle, the Maestra, the church's back door, the Governatrice, Fra' Zuane. */
const ZITELLE_AT = { x: 219, z: 3 }, BACK_DOOR = { x: 240, z: -31 };
const goal = () => {
  switch (quest.stage) {
    case 'talk': case 'report': case 'offer': case 'return': return NPC;
    case 'key': return CHEST;
    case 'grate': case 'boss': return priests.boss;
    case 'route': return ZITELLE_AT;
    case 'ospizio': return l2.maestra;
    case 'church': return BACK_DOOR;
    case 'boss2': return zitelle.boss;
    default: return undefined;
  }
};
function openMap(): void {
  if (menu.paused) return;
  kit.system.cancel();
  input.consume();
  worldMap.show({ x: player.pos.x, z: player.pos.z, facing: player.facing, area: level.areaAt(player.pos.x, player.pos.z)?.label, goal: goal() });
}
const pressed = (code: string) => input.pressed(code);
/**
 * Zone streaming, by the hero's x: past the Ponte de la Croce the Redentore's complex and its dead are skipped
 * (frustum culling already drops their draw calls, this spares the scene walk: ~1 ms a frame on a laptop, more on
 * a phone), and level 2 west of it. ponytail: two halves on one axis; per-zone bounds if a third level comes.
 */
const LEVEL1 = ['chiesa', 'convento', 'orto', 'corpo-nord', 'giardini', 'laguna', 'calle'].map((z) => level.zones.get(z)!), LEVEL2 = ['giudecca', 'zitelle'].map((z) => level.zones.get(z)!);
function stream(x: number): void {
  const one = x < 100, two = x > 50;
  for (const g of LEVEL1) g.visible = one;
  friars.root.visible = priests.root.visible = bees.root.visible = one;
  for (const g of LEVEL2) g.visible = two;
  zitelle.root.visible = two;
  if (quest.accepted2) zitelle.load(); // a no-op once started
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  fx.setSize(innerWidth, innerHeight);
  cam.camera.aspect = innerWidth / innerHeight;
  cam.camera.updateProjectionMatrix();
});

// Debug hooks for later ships and for poking around in the console.
Object.assign(window, { zitelle, l2, bag, gear, sheet, vendor, drops, bagPanel, levels, levelUp, CARD, intro, audio, sound: { tap, voices }, scene, level, player, cam, dcam, occlusion, dctl, dfx, gothic, fx, kit, playerStats, friars, priests, bees, targeting, quest, questView, menu, game, discovery, worldMap });

// The autosave (core/save.ts): every few seconds and when the tab is hidden (iOS may kill it then), only
// while nobody is fighting and the hero stands, so a resume lands before the pull, never mid-fight.
const FIGHTING = new Set(['chase', 'cast', 'swing', 'nova']);
const KEEP = 5; // s
let kept = KEEP;
const keep = () => { if (!flying() && dying <= 0 && !playerStats.dead && !mobs.some((m) => FIGHTING.has(m.state))) autosave(serialize(game)); };
addEventListener('visibilitychange', () => { if (document.hidden) keep(); });

const timer = new THREE.Timer();
renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  if (menu.paused || worldMap.open || bagPanel.open || questView.talking || levelUp.open) { // the world holds still behind the menu, map, bag, dialogue or level-up; drags and wheel turns made meanwhile are dropped
    if (questView.talking && !menu.paused) questView.idle(dt, player.pos); // but the speaker talks on
    if (levelUp.open && !menu.paused) levelUp.update(dt);
    input.consume();
    input.endFrame();
    audio.update(dt, cam.camera, undefined, menu.paused || worldMap.open || bagPanel.open, pressed); // the dialogue window ducks the music itself
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
      zitelle.update(dt, unseen);
      questView.idle(dt, player.pos);
      questView.peek(eye);
      audio.update(dt, cam.camera, intro, false, pressed);
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
  if (input.pressed('KeyB')) bagPanel.toggle();
  if (input.pressed('KeyC')) sheet.toggle();
  game.time += dt;
  playerStats.update(dt);
  if (dying > 0 && (dying -= dt) <= 0) wake();
  player.frozen = dying > 0;
  const diablo = isDiablo();
  if (!player.frozen) dctl.update(dt, input); // click-to-move steering, click-attack swings
  kit.system.castMul = quest.castMul / worn.haste; // Fra' Bortolo's blessing, while it lasts, and Celerità
  kit.update(dt, player.frozen ? () => false : pressed); // before the player moves: casts see last frame's motion
  player.update(dt, input, diablo ? dcam.yaw : cam.yaw, !diablo && (input.buttons & 2) !== 0, dctl.steer);
  friars.update(dt, player.pos);
  priests.update(dt, player.pos);
  bees.update(dt, player.pos);
  zitelle.update(dt, player.pos);
  dfx.update(dt, quest.accepted && !quest.key);
  for (const text of drops.update(dt, player.pos)) kit.system.notices.push({ kind: 'error', text }); // before the victory: the boss drops, those he takes with him don't
  bagPanel.update();
  const boss = quest.bossDead ? zitelle.boss : priests.boss, rage = boss.fight >= boss.kind.phases!.berserk; // the boss's acts and berserk, called out as they come
  for (const text of questView.update(dt, player.pos, pressed, boss)) kit.system.notices.push({ kind: 'info', text });
  if (boss !== lastBoss) { lastBoss = boss; bossAct = boss.phase; bossRage = rage; } // the Reverendissimo's acts are not the Governatrice's
  if (boss.phase > bossAct) kit.system.notices.push({ kind: 'error', text: ACTS[boss.kind === GOVERNATRICE ? 1 : 0][boss.phase - 1] });
  if (rage && !bossRage) kit.system.notices.push({ kind: 'error', text: boss.kind === GOVERNATRICE ? 'La pazienza della Governatrice è finita: ora ogni colpo è mortale!' : 'La pazienza del Reverendissimo è finita: ora ogni colpo è mortale!' });
  bossAct = boss.phase;
  bossRage = rage;
  if (!quest.key2 && l2.maestra.state === 'dead') { // her key, off her belt
    quest.takeKey2();
    kit.system.notices.push({ kind: 'info', text: 'Hai preso la chiave della chiesa delle Zitelle' });
  }
  if (quest.bossDead && !quest.boss2Dead && zitelle.boss.state === 'dead') { // the Governatrice falls: her girls with her, the portone opens
    quest.win2();
    zitelle.killAll();
    questView.victory(true);
    player.model.play('victory', 0.4);
    sweep();
  }
  if (!quest.bossDead && priests.boss.state === 'dead') { // victory: everyone falls, the portone opens
    quest.win();
    friars.killAll();
    priests.killAll();
    bees.killAll();
    questView.victory();
    player.model.play('victory', 0.4);
    sweep();
  }
  { // the worth of the newly dead (Sete d'anime heals on each), and the rewards
    let fresh = 0;
    mobs.forEach((m, i) => { if (m.state === 'dead' && !fell[i]) { fell[i] = true; slain += worth[i]; fresh++; } });
    if (fresh && tune.leech) playerStats.heal(playerStats.hpMax * tune.leech * fresh);
    levels.xp = slain + quest.bonusXp;
    if (levels.lv > shownLv) levelUp.flash((shownLv = levels.lv));
    if (levels.pending > 0 && dying <= 0 && !playerStats.dead) openLevelUp();
  }
  const lv = levelOf(levels.xp);
  hud.setLevel(lv.lv, lv.into, lv.next);
  if (diablo) dcam.update(dt, input, player.pos);
  else cam.update(dt, input, player.pos);
  blend.apply(cam.camera, dt);
  kit.vfx.applyShake(cam.camera, dt); // big hits shake the lens; trails face it
  occlusion.update(dt, player.pos, cam.camera);
  targeting.update(dt, player.pos);
  stream(player.pos.x);
  const area = level.areaAt(player.pos.x, player.pos.z)?.label;
  hud.setArea(area);
  discovery.reveal(player.pos.x, player.pos.z);
  fog.update(dt);
  minimap.update(dt, player.pos, player.facing, area, foes, goal());
  hud.setStats(playerStats);
  fx.update(dt, player.pos);
  audio.update(dt, cam.camera, undefined, false, pressed); // before the bar drains this frame's notices
  fx.render();
  bar.render(dt, pressed);
  input.endFrame();
  if ((kept -= dt) <= 0) { kept = KEEP; keep(); }
});
