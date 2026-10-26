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
import { ABILITIES, Forsaken, PLAGUE_RANGE, barOf, tune } from './abilities/forsaken.ts';
import { CHARGE, GRACE, LEAP, RANGE } from './abilities/grimoire.ts';
import { BASES, BASE_ATTACK, CARD, Levels, levelOf, offer, tuneOf, type Card } from './player/levels.ts';
import { LevelUp } from './ui/levelUp.ts';
import { ActionBar } from './ui/actionBar.ts';
import { AbilityBook } from './ui/book.ts';
import { PRIMARY, saveBar } from './abilities/system.ts';
import { PlayerStats } from './player/stats.ts';
import { Targeting, type Kind } from './ui/target.ts';
import { HeroAuras, Plates } from './ui/plates.ts';
import { heroAuras } from './ui/auras.ts';
import { Friars } from './enemies/friars.ts';
import { Priests } from './enemies/priests.ts';
import { Bees } from './enemies/bees.ts';
import { CODEGA, GASTALDO, GONDOLIERE, GOVERNATRICE, MAESTRA, VELO, ZITELLA, spawnLevel2 } from './enemies/zitelle.ts';
import { FRIAR, GROUPS, RISE } from './enemies/brain.ts';
import { APE, APETTA, PRIEST, REVERENDISSIMO, SACERDOTE, pull } from './enemies/caster.ts';
import { ABATE, AMANUENSE, BIBLIOTECARIO, DARSENA, MARINAIO, MONACO, NOSTROMO, PREPS, prepare, rouse, spawnLevel3 } from './enemies/sangiorgio.ts';
import { ANDITO, ANTIREF, APPRODO, BERTHS, BLESSING, BOONS, CHEST, CROCE, HEADS, NPC, PUNTA, QUESTS, Quest, SECOND, SPEZIALE, THIRD } from './quest/progress.ts';
import { Ferry } from './quest/ferry.ts';
import { GIVERS, SIDE, giverOf, type Foe } from './quest/squero.ts';
import { QuestView } from './quest/view.ts';
import { RELIC_OBJECTIVE, RELIC_TITLE } from './quest/dialogue.ts';
import { checkVersion } from './ui/version.ts';
import { Minimap } from './ui/minimap.ts';
import { Menu } from './ui/menu.ts';
import { Discovery } from './core/discovery.ts';
import { FogLayer } from './ui/fog.ts';
import { WorldMap } from './ui/worldMap.ts';
import { autosave, deserialize, questXpIn, serialize, setPending, startup, upcoming, type Game } from './core/save.ts';
import { BAR, install, migration, prepared } from './core/prepared.ts';
import { isDiablo, onQuality, onStyle } from './core/style.ts';
import { CameraBlend, DiabloCamera } from './camera/diabloCamera.ts';
import { DiabloControls } from './player/diabloControls.ts';
import { Occlusion } from './fx/occlusion.ts';
import { DiabloFx } from './fx/diabloFx.ts';
import { GothicDressing } from './level/gothic.ts';
import { audioReady, initAudio, tap, voices } from './audio/engine.ts';
import { Director } from './audio/director.ts';
import { Bag, ITEM, RELIC, RELIC_PRIZE } from './loot/bag.ts';
import { Drops, type Dropper } from './loot/drops.ts';
import { BagPanel } from './ui/bag.ts';
import { Equipment, SHOP2, crit, effects, shop, starter } from './loot/gear.ts';
import { SheetPanel } from './ui/sheet.ts';
import { Figure } from './ui/figure.ts';
import { VendorPanel } from './ui/vendor.ts';
import { DeathScreen } from './ui/death.ts';
import { HEROES, heroOf } from './player/heroes.ts';
import { chooseHero } from './ui/select.ts';

await checkVersion(); // before the heavy boot: a stale cached build reloads onto the deployed one

initAudio(); // before the intro, whose first press unlocks the sound
const swap = migration(); // once: the old saves make way for the hero ready for level 2 (core/prepared.ts)
const ahead = swap ? undefined : upcoming(); // the game this boot starts, whose hero's body loads
const fresh = !swap && (!ahead || ahead === 'new'); // a new game: its hero chosen first (ui/select.ts)
const hero = fresh ? await chooseHero() : heroOf(swap || ahead === 'new' ? undefined : ahead?.hero);
if (fresh) saveBar({ bar: barOf(HEROES[hero].kit, BASE_ATTACK[HEROES[hero].school[0]]), off: [] }); // his school's base attack and kit on the bar, before the kit reads it
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
const player = new PlayerController(level.world, SPAWN, hero);
scene.add(player.mesh);
const cam = new ThirdPersonCamera(innerWidth / innerHeight, SPAWN.yaw, level.cameraBlockers);
const dcam = new DiabloCamera(cam.camera); // "Stile Diablo": same lens object, high fixed view
const blend = new CameraBlend(); // eases style switches and the intro's hand-over
const hud = new Hud(HEROES[hero].portrait, HEROES[hero].name);
const fx = new Atmosphere(renderer, scene, cam.camera, level); // sun, torches, fog, particles, post
const playerStats = new PlayerStats(); // health/mana; enemies call playerStats.takeDamage(n)
if (swap) saveBar(BAR); // the prepared hero's bar, before the kit reads it
const kit = new Forsaken(player, playerStats, HEROES[hero].school); // abilities on 1..0 - =
scene.add(kit.vfx.root);
const questView = new QuestView(quest, kit.vfx); // gates, chest, Fra' Zuane and his dialogue, tracker
scene.add(questView.root);
const bar = new ActionBar(kit.system);
const levels = new Levels(); // XP from the dead, the cards picked; laid on the kit by `apply`
levels.learned = [...HEROES[hero].kit]; // his school's start (a load lays its own)
levels.schools = HEROES[hero].school;
let booted = false; // past the load: a base attack learnt from now on is called out
const levelUp = new LevelUp(); // the two-card window
const gear = new Equipment(); // what the hero wears: the hemp set and his own weapon at first
gear.worn = starter(HEROES[hero].weapon);
let worn = effects(gear.totals);
levels.apply = () => { // the cards, Fra' Bortolo's boon and the gear, laid on the kit and the stats
  const had = tune.owned;
  Object.assign(tune, tuneOf(levels.picks, levels.learned, levels.schools));
  BOONS.find((b) => b.id === quest.boon)?.apply(tune);
  worn = effects(gear.totals);
  playerStats.grow(tune.hp, tune.mana, worn.hp, worn.mana);
  playerStats.armor = tune.armor * (1 - worn.cut);
  playerStats.regen = tune.regen + worn.regen;
  player.speed = tune.speed;
  kit.system.chargeMul = tune.fury;
  kit.system.chargeAfter = tune.furyStart;
  kit.system.unlock(...tune.owned); // all owned before any is placed: the bar keeps its slots across a reload
  kit.system.setMain(tune.owned.includes(levels.main) ? levels.main : tune.owned[0]); // the book's choice of base attack, else his own
  if (booted) for (const id of tune.owned) if (BASES.includes(id) && !had.includes(id)) { // 3 of his secondary school's 5: its base attack
    kit.system.notices.push({ kind: 'info', text: `Hai appreso ${ABILITIES.find((a) => a.id === id)!.name}, attacco base: sceglilo nel libro delle abilità` });
    book.nudge();
  }
};
gear.onChange = () => { levels.apply(); player.model.wear(gear.worn); }; // the stats, and the hero dressed in it
gear.onChange(); // the starter set (a load lays its own again)
const friars = new Friars(level.world, kit.vfx, playerStats); // undead friars hoeing the orto
friars.rising = () => !quest.bossDead; // the vow raises the orto's dead until the Reverendissimo falls with it
scene.add(friars.root);
const priests = new Priests(level.world, kit.vfx, playerStats, level.areas); // undead priests casting in the cloisters
scene.add(priests.root);
const bees = new Bees(level.world, kit.vfx, playerStats); // the giant hornet and her workers at the apiary
scene.add(bees.root);
const l2 = spawnLevel2(level.world); // level 2: the fondamenta to the Zitelle, the Pia Casa, the Governatrice
const zitelle = new Priests(level.world, kit.vfx, playerStats, level.areas, l2, true); // its ~6 MB of bodies load with the second quest (stream)
zitelle.rising = (f) => !quest.boss2Dead && (f.kind === GONDOLIERE || f.kind === CODEGA); // the drowned and the codeghe rise again for Mastro Iseppo's quests, until the Governatrice falls
scene.add(zitelle.root);
/** Level 2's kinds: name, kind, height. */
const L2_KINDS = [['Gondoliere annegato', GONDOLIERE, 1.85, 11], ['Codega', CODEGA, 1.8, 11], ['Zitella', ZITELLA, 1.65, 12], ['Zitella del velo', VELO, 1.9, 12], ['Il Gastaldo dei gondolieri', GASTALDO, 2.7, 13, 'elite'], ['La Maestra del merletto', MAESTRA, 2.5, 14, 'elite'], ['La Governatrice', GOVERNATRICE, 4.3]] as const;
const l3 = spawnLevel3(level.world); // level 3: the Punta, the gondola, San Giorgio Maggiore, the Abate
const sangiorgio = new Priests(level.world, kit.vfx, playerStats, level.areas, l3, true); // its bodies load with the third quest (stream)
const sleepers = new Set(l3.hidden.flatMap((h) => h.members)); // the hidden packs (enemies/sangiorgio.ts), woken by their quests
sangiorgio.rising = (f) => !quest.boss3Dead && f.kind === MARINAIO && quest.side.active('marinai') && !sleepers.has(f); // the drowned rise again for Mastro Iseppo's ten, until the Abate falls
scene.add(sangiorgio.root);
/** Level 3's kinds: name, kind, height, level, rank. */
const L3_KINDS = [['Monaco nero', MONACO, 1.9, 16], ['Amanuense', AMANUENSE, 1.8, 16], ['Marinaio annegato', MARINAIO, 1.85, 16], ['Il Bibliotecario', BIBLIOTECARIO, 2.4, 18, 'elite'], ['Il Nostromo della darsena', NOSTROMO, 2.7, 18, 'elite'], ["L'Abate di San Giorgio", ABATE, 4.4]] as const;
const ofKind3 = (k: typeof L3_KINDS[number][1]) => sangiorgio.all.filter((f) => f.kind === k);
const ferry = new Ferry(); // Mastro Iseppo's gondola between the Punta and San Giorgio
const ISLAND_VIEW = { x: -545, z: 108 }; // between the dome and the campanile: what the crossing's camera looks at
scene.add(ferry.root);
/** The kinds the side quests count and loot (quest/squero.ts), and the elites whose token they lay at the body. */
const FOE = new Map<object, Foe>([[GONDOLIERE, 'gondoliere'], [CODEGA, 'codega'], [ZITELLA, 'zitella'], [GASTALDO, 'gastaldo'], [MAESTRA, 'maestra'],
  [MONACO, 'monaco'], [AMANUENSE, 'amanuense'], [MARINAIO, 'marinaio'], [NOSTROMO, 'nostromo'], [BIBLIOTECARIO, 'bibliotecario']]);
const ELITE: Partial<Record<Foe, { x: number; y: number; z: number; state: string; t: number }>> = { gastaldo: l2.gastaldo, maestra: l2.maestra, nostromo: l3.nostromo, bibliotecario: l3.bibliotecario };
const ofKind = (k: typeof L2_KINDS[number][1]) => zitelle.all.filter((f) => f.kind === k);
const kinds: Kind[] = [ // the levels are only shown, on the nameplates
  { name: 'Frate non-morto', max: FRIAR.hp, height: 1.95, all: friars.all, ready: () => friars.root.children.length > 0, lv: 3 },
  { name: 'Prete non-morto', max: PRIEST.hp, height: 1.85, all: priests.all.filter((f) => f.kind === PRIEST), ready: () => priests.root.children.length > 0, lv: 4 },
  { name: 'Sacerdote non-morto', max: SACERDOTE.hp, height: 2.5, all: priests.all.filter((f) => f.kind === SACERDOTE), ready: () => priests.root.children.length > 0, lv: 7, rank: 'elite' },
  { name: 'Il Reverendissimo', max: REVERENDISSIMO.hp, height: 4.6, all: [priests.boss], ready: () => priests.root.children.length > 0, ownBar: () => questView.bossShown },
  { name: 'Ape gigante', max: APE.hp, height: Bees.HEIGHT.queen, all: [bees.queen], ready: () => bees.root.children.length > 0, lv: 8, rank: 'elite' },
  { name: 'Ape operaia', max: APETTA.hp, height: Bees.HEIGHT.worker, all: bees.all.filter((f) => f.kind === APETTA), ready: () => bees.root.children.length > 0, lv: 5 },
  ...L2_KINDS.map(([name, kind, height, lv, rank]) => ({ name, max: kind.hp, height, all: ofKind(kind), ready: () => zitelle.root.children.length > 0, lv, rank, ...(kind === GOVERNATRICE ? { ownBar: () => questView.bossShown } : {}) })),
  ...L3_KINDS.map(([name, kind, height, lv, rank]) => ({ name, max: kind.hp, height, all: ofKind3(kind), ready: () => sangiorgio.root.children.length > 0, lv, rank, ...(kind === ABATE ? { ownBar: () => questView.bossShown } : {}) })),
];
const targeting = new Targeting(renderer.domElement, cam.camera, scene, level.cameraBlockers, kinds); // click/tap an enemy, Tab for the nearest
const FALLEN = 3.6; // s the hero lies dead before waking
const SLOW = 0.3, SLOW_FOR = 1.4; // the world's speed as the hero falls, easing back to 1 over SLOW_FOR s
let dying = 0;
const deathScreen = new DeathScreen(renderer.domElement);
playerStats.onDeath = () => { // the hero falls; the fight is over at once, the wake-up follows
  kit.system.cancel();
  kit.magic.reset(); // bolts in flight, burning floors, a leap: gone with the hero
  dctl.stop();
  friars.wipe(); // a wipe: whoever was fighting, the boss too, evades home at full health
  priests.wipe();
  bees.wipe();
  zitelle.wipe();
  sangiorgio.wipe();
  ferry.abort(player);
  player.model.die();
  deathScreen.show();
  dying = FALLEN;
};
playerStats.onHurt = (n) => { player.model.flinch(n); kit.system.pushback(); }; // a hit sets a cast bar back
/** Wake at the last checkpoint at full health; the grey fades back out. */
function wake(): void {
  deathScreen.hide();
  const at = quest.checkpoint();
  player.respawn(at);
  playerStats.revive();
  player.model.revive();
  const where = at === SPAWN ? 'sulla fondamenta' : at === CROCE ? 'oltre il Ponte de la Croce' : at === ANDITO ? "nell'andito delle Zitelle"
    : at === PUNTA ? 'alla Punta della Giudecca' : at === APPRODO ? "sull'approdo di San Giorgio" : at === ANTIREF ? "nell'antirefettorio di San Giorgio" : 'alla porta del coro';
  kit.system.notices.push({ kind: 'error', text: `Sei caduto. Ti risvegli ${where}.` });
}
const plates = new Plates(kinds, cam.camera, kit.magic, () => targeting.target?.mob); // WoW nameplates: the hero's debuffs, health, level, casts
const heroBuffs = new HeroAuras(); // under the player frame
const BUBBLE = ABILITIES.find((a) => a.id === 'bubble')!;
const buffs = () => {
  const p = player.pos, m = kit.magic, bubbleCd = kit.system.cooldown(BUBBLE);
  return heroAuras({
    bless: { name: BLESSING.name, left: quest.blessLeft },
    veil: playerStats.veil, immune: playerStats.immune, aureola: bubbleCd > 0 && BUBBLE.cooldown - bubbleCd <= 5.05, // cast in its 5 s: the immunity is Aureola's, not Patto della tomba's
    sparks: m.sparks, sparkT: m.sparkT, wisp: kit.wisp,
    hallow: m.hallows.reduce((t, z) => (Math.hypot(p.x - z.x, p.z - z.z) < z.r && Math.abs(p.y - z.y) < 1.5 ? Math.max(t, z.t) : t), 0),
  });
};
kit.hurt = (inside, n) => { n = crit(n * tune.dmg * quest.dmgMul * worn.dmg, worn.crit); friars.hurtWhere(inside, n); priests.hurtWhere(inside, n); bees.hurtWhere(inside, n); zitelle.hurtWhere(inside, n); sangiorgio.hurtWhere(inside, n); };
kit.aimed = () => targeting.target?.mob;
const foes = [...friars.all, ...priests.all, ...bees.all, ...zitelle.all, ...sangiorgio.all];
kit.foes = () => foes;
const dctl = new DiabloControls(renderer.domElement, cam.camera, scene, player, targeting, () => foes); // click to move and attack
dctl.swing = () => { const a = kit.system.slots[PRIMARY]; return !!a && kit.system.cooldown(a) === 0 && kit.system.tryCast(PRIMARY); }; // the base attack a click-attack repeats
const AIMED = new Set([...BASES, 'step', 'plague', 'strike', 'pyre', 'frost', 'chain', 'toll', 'leap', 'grace', 'charge', 'spit', 'untore', 'fever', 'drain', 'pillar', 'cero', 'furnace', 'blizzard', 'orb', 'judge', 'hammer', 'caligo']); // casts that go where the hero faces
// No living target: the nearest foe in sight within the cast's reach becomes the target, as if tapped (iPhone taps rarely land on a mob).
const REACH: Record<string, () => number> = { fall: () => tune.fallRange, grace: () => GRACE.range, step: () => 8, leap: () => LEAP.range, charge: () => CHARGE.max, plague: () => PLAGUE_RANGE, drain: () => 25 }; // the rest: RANGE
kit.system.aim = (a) => { if (AIMED.has(a.id)) { targeting.ensure(REACH[a.id]?.() ?? RANGE); dctl.aim(); } };
const occlusion = new Occlusion([level.root, fx.torches.root], level, [ // walls drop, roofs and props in the way fade out, Diablo view
  [player.mesh, 0xffc46b], [friars.root, 0xff3b2e], [priests.root, 0xff3b2e], [bees.root, 0xff3b2e], [zitelle.root, 0xff3b2e], [sangiorgio.root, 0xff3b2e], // x-ray silhouettes behind what still hides them
]);
const head = new THREE.Vector3();
// Saved games index the mobs: the original friars and every priest first, as before the new friar groups and the bees, which follow.
const old = GROUPS.flat().length;
const mobs = [...friars.all.slice(0, old), ...priests.all, ...friars.all.slice(old), ...bees.all, ...zitelle.all, ...sangiorgio.all]; // level 2's, then level 3's last
const bag = new Bag(); // gold and items picked up off the dead
quest.side.bag = bag; // Mastro Iseppo's quest items go in and out of it
const game: Game = { hero, player, stats: playerStats, kit: kit.system, quest, mobs, time: 0, fog: discovery, levels, bag, gear };
const worth = mobs.map((m) => ('kind' in m ? m.kind.xp : FRIAR.xp)); // XP each mob is worth dead
const worthOf = (i: number) => ((mobs[i] as { again?: boolean }).again ? Math.ceil(worth[i] * RISE.xp) : worth[i]); // a risen friar, a quarter
const levelTwo = prepared(serialize(game), mobs.length - zitelle.all.length - sangiorgio.all.length, level.areas); // the hero ready for level 2, off this fresh boot (level 1's mobs come first)
if (swap) install(levelTwo); // resumed just below
const { state: loaded, queued: pending } = startup(); // a slot picked in the menu, carried across the reload, or the run in progress: a tab iOS killed for memory and reloaded, the home-screen app relaunched
if (loaded) {
  deserialize(game, loaded);
  cam.yaw = player.facing;
  questView.settle();
  kit.system.notices.push({ kind: 'info', text: pending ? 'Partita caricata' : 'Partita ripresa' });
} else kit.system.notices.push({ kind: 'info', text: "Il portone della chiesa è sbarrato. Parla con Fra' Zuane" });
/**
 * Level 3's hidden packs (enemies/sangiorgio.ts): up once their side quest gets that far, on the hero; a load finds the
 * ones it saved alive at rest. The Fanalista's wave brings the Nostromo out onto the quays after the hero.
 */
const woken = new Set<(typeof l3.hidden)[number]>();
const rouseHidden = (h: (typeof l3.hidden)[number], fight: boolean, alive: (m: typeof h.members[number]) => boolean = () => true) => {
  woken.add(h);
  rouse(h.members.filter(alive), level.world, fight);
  if (h.pack.hidden!.quest !== 'fari') return;
  l3.nostromo.bounds = DARSENA;
  if (fight && l3.nostromo.state !== 'dead') pull(l3.nostromo);
};
const due = (h: (typeof l3.hidden)[number]) => !woken.has(h) && !quest.boss3Dead && quest.side.reached(h.pack.hidden!.quest, h.pack.hidden!.step);
const saved = new Set(loaded?.dead ?? []);
for (const h of l3.hidden) if (due(h)) rouseHidden(h, false, (m) => !saved.has(mobs.indexOf(m)));
booted = true;
let bossAct = 0, bossRage = false, lastBoss = priests.boss, wed = false; // wed: the Abate's rite begun (his pull line said)
/** A boss's new act, called out: the Reverendissimo's, the Governatrice's, the Abate's; and the end of its patience. */
const ACTS = [
  ['Il Reverendissimo marchia il pavimento: esci dai cerchi!', 'Il Reverendissimo è furibondo: colpisce sempre più spesso!'],
  ['La Governatrice chiama le sue figlie: finché vivono, il velo la protegge!', 'Altre due zitelle accorrono al velo: abbattile!', 'La Governatrice gira il fuso: stai fuori dai fili!'],
  ["Suonano le campane di San Giorgio: salta i rintocchi quando ti raggiungono!", "Sale l'acqua alta: corri sulle isole di luce!", "L'Abate è furibondo: colpisce sempre più spesso!"],
];
const RAGE = ['La pazienza del Reverendissimo è finita: ora ogni colpo è mortale!', 'La pazienza della Governatrice è finita: ora ogni colpo è mortale!', "Le nozze non aspettano più: ora ogni colpo dell'Abate è mortale!"];
const actsOf = (k: object) => (k === ABATE ? 2 : k === GOVERNATRICE ? 1 : 0);
// XP is what the hero killed plus the quests' rewards. The dead of a load were counted into its saved XP (a save from
// before the levels: the worth of its dead, short of a won fight's), and a victory's dead are worth nothing.
const fell = mobs.map((m) => m.state === 'dead');
let slain = loaded?.build ? loaded.build.xp - questXpIn(loaded) : quest.bossDead ? 0 : worth.reduce((s, w, i) => s + (fell[i] && !sleepers.has(mobs[i] as typeof l3.boss) ? w : 0), 0); // the hidden packs lie dead asleep, worth nothing yet
const sweep = () => mobs.forEach((m, i) => { if (m.state === 'dead') fell[i] = true; }); // after a victory: its dead count for nothing
let shownLv = 1 + levels.picks.length; // a save from before the levels flashes its level once
const picked = (id: string) => levels.picks.filter((p) => p === id).length;
/** The next level-up's two cards; the world holds still until one is picked. */
function openLevelUp(): void {
  kit.system.cancel();
  input.consume();
  dctl.stop();
  levelUp.show(levels.picks.length + 2, offer(levels.picks, Math.random, levels.learned, levels.schools), picked, (c: Card) => {
    levels.picks.push(c.id);
    if (c.kind === 'ability') { // onto the first free slot, even if an earlier run took it off the bar
      kit.system.learn(c.id);
      saveBar(kit.system.layout());
      book.nudge();
    }
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
  player, stats: playerStats, kit, quest, friars: friars.all, casters: [...priests.all, ...zitelle.all, ...sangiorgio.all], bees: bees.all,
  get boss() { return quest.boss2Dead ? sangiorgio.boss : quest.bossDead ? zitelle.boss : priests.boss; }, // whichever boss is still to come
  get spent() { return zitelle.spent.length || sangiorgio.spent.length ? [...priests.spent, ...zitelle.spent, ...sangiorgio.spent] : priests.spent; }, fires: fx.torches.em, areaAt: (x, z) => level.areaAt(x, z),
});
const menu = new Menu({
  snapshot: () => serialize(game),
  where: () => level.areaAt(player.pos.x, player.pos.z)?.label ?? '',
  opened: () => { kit.system.cancel(); input.consume(); worldMap.close(); dctl.stop(); },
  book: () => book.show(),
  levelTwo: () => { saveBar(BAR); if (setPending(levelTwo)) location.reload(); },
});
const dfx = new DiabloFx([ // damage numbers, gore, loot beams (after a load, so its dead don't fall again)
  { all: friars.all, height: 1.95 },
  { all: priests.all.filter((f) => f.kind === PRIEST), height: 1.85 },
  { all: priests.all.filter((f) => f.kind === SACERDOTE), height: 2.5 },
  { all: [priests.boss], height: 4.6 },
  { all: [bees.queen], height: Bees.HEIGHT.queen },
  { all: bees.all.filter((f) => f.kind === APETTA), height: Bees.HEIGHT.worker },
  ...L2_KINDS.map(([, kind, height]) => ({ all: ofKind(kind), height })),
  ...L3_KINDS.map(([, kind, height]) => ({ all: ofKind3(kind), height })),
], kit.vfx, cam.camera, CHEST);
scene.add(dfx.root);
const standing = () => friars.all.reduce((n, f) => n + (f.state === 'dead' ? 0 : 1), 0); // friars left to give a head
questView.friars = standing;
const ground = (id: string) => drops.loose.filter((l) => l.id === id).length; // one quest item lying loose
const drops: Drops = new Drops([ // gold and items out of the dead, walked over into the bag (after a load, so its dead drop nothing)
  { all: friars.all, tier: 'friar', quest: () => (quest.headDrop(standing(), drops.loose.filter((l) => l.id === HEADS.item).length) ? HEADS.item : undefined) }, // Fra' Bortolo's heads
  { all: priests.all.filter((f) => f.kind === PRIEST), tier: 'priest' },
  { all: priests.all.filter((f) => f.kind === SACERDOTE), tier: 'elite' },
  { all: [priests.boss], tier: 'boss' },
  { all: [bees.queen], tier: 'elite' },
  { all: bees.all.filter((f) => f.kind === APETTA), tier: 'worker' },
].map((d) => ({ ...d, quiet: () => quest.bossDead }) as Dropper).concat(([[GONDOLIERE, 'friar'], [CODEGA, 'priest'], [ZITELLA, 'priest'], [VELO, 'priest'], [GASTALDO, 'elite'], [MAESTRA, 'elite'], [GOVERNATRICE, 'boss']] as const).map(([kind, tier]) => ({ all: ofKind(kind), tier, level: 2, quiet: () => quest.boss2Dead, quest: FOE.has(kind) ? () => quest.side.loot(FOE.get(kind)!, ground, quest.key2) : undefined })))
  .concat(([[MONACO, 'priest'], [AMANUENSE, 'priest'], [MARINAIO, 'priest'], [BIBLIOTECARIO, 'elite'], [NOSTROMO, 'elite'], [ABATE, 'boss']] as const).map(([kind, tier]) => ({ all: ofKind3(kind), tier, level: 3, quiet: () => quest.boss3Dead, quest: FOE.has(kind) ? () => quest.side.loot(FOE.get(kind)!, ground, quest.key2) : undefined }))), level.world, bag, cam.camera); // the side quests' items, Marieta's letter
scene.add(drops.root);
drops.extra = () => (!drops.loose.some((l) => l.id === RELIC) && quest.rollRelic() ? RELIC : undefined); // Fra' Zuane's corona, once a run (one on the ground at a time)
drops.collect = (id) => id === HEADS.item && (questView.head(), true); // Fra' Bortolo's heads are counted, not bagged
const bagPanel = new BagPanel(bag, gear); // B or the satchel button
bagPanel.opened = () => { kit.system.cancel(); input.consume(); worldMap.close(); dctl.stop(); };
const sheet = new SheetPanel(bagPanel, bag, gear, () => ({ // C or the figure button: the paper doll
  name: HEROES[hero].name, lv: levels.lv, hp: playerStats.hpMax, mana: playerStats.manaMax, armor: gear.totals.armatura, cut: 1 - playerStats.armor,
  dmg: tune.dmg * worn.dmg, crit: worn.crit, haste: worn.haste / quest.castMul, regen: playerStats.regen,
}));
const figure = new Figure(renderer, scene, player.mesh, sheet.stage); // the sheet's hero, as dressed, while it is open
sheet.el.addEventListener('hidden', () => figure.free());
const vendor = new VendorPanel(bagPanel, bag, gear, { // Fra' Bortolo's Commercia, Mastro Iseppo's; their tomes teach a school
  owned: () => tune.owned,
  learn: (ids) => {
    levels.learned.push(...ids);
    for (const id of ids) kit.system.learn(id);
    levels.apply();
    saveBar(kit.system.layout());
    book.nudge();
    kit.ascend();
  },
});
const mains = [BASE_ATTACK[HEROES[hero].school[0]], BASE_ATTACK[HEROES[hero].school[1]]]; // his base attack, and his secondary school's
const book = new AbilityBook(kit.system, ABILITIES.filter((a) => !a.main || mains.includes(a.id)), () => levels.picks, (id) => { levels.main = id; kit.system.setMain(id); }); // K, the book button or the menu: the ability book
book.opened = () => { kit.system.cancel(); input.consume(); worldMap.close(); dctl.stop(); bagPanel.close(); };
bagPanel.keys.KeyK = () => book.show();
questView.shop = () => vendor.open({ name: "Fra' Bortolo", sub: 'Speziale · reliquie e paramenti dei morti', goods: () => shop(quest.accepted3) }); // San Giorgio's purple pieces once the third quest is taken
questView.board = (c) => { kit.system.cancel(); dctl.stop(); ferry.board(c, player); };
questView.shop2 = () => vendor.open({ name: 'Mastro Iseppo', sub: 'Proto dello squero · il corredo della Pia Casa', goods: () => SHOP2 });
questView.reward = (gold) => { bag.gold += gold; };
questView.relicBack = () => { bag.remove(RELIC); return bag.add(RELIC_PRIZE) ? ITEM.get(RELIC_PRIZE)!.name : ''; }; // the corona's slot makes room for the medal
questView.boonTaken = () => levels.apply();
questView.blockDoors(level.cameraBlockers); // shut doors stop the camera and the targeting rays
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
/** Level 2's and 3's bodies load with their quests, after the first warm-up: bit 1 and 2 once each roster is in (streamed out or not: a warm-up compiles the whole scene). */
const later = () => (zitelle.root.children.length ? 1 : 0) | (sangiorgio.root.children.length ? 2 : 0);
let warmedLater = 0;
fx.onRebuild = () => { if (warmed) warm(); };
const bodiesIn = () => !!(friars.root.children.length && priests.root.children.length && bees.root.children.length && player.model.root.children.length); // everyone's bodies in
fx.loaded = bodiesIn; // the boot test times the scene, not the loading
onQuality((q) => fx.setQuality(new URLSearchParams(location.search).get('fx') === 'low' ? 'bassa' : q)); // the menu's "Grafica"; `?fx=low` pins the bottom rung
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
/**
 * The objective's pin: Fra' Zuane, the key, the Reverendissimo; then Fra' Zuane, the Zitelle, the Maestra, the church's back door, the
 * Governatrice, Fra' Zuane; then the gondola at the Punta, the Bibliotecario, the Cenacolo's door, the Abate, the gondola home and Fra' Zuane.
 */
const ZITELLE_AT = { x: -219, z: 3 }, BACK_DOOR = { x: -240, z: -31 }, CENACOLO_DOOR = { x: -530, z: 37 };
const onIsland = () => player.pos.x < -425; // San Giorgio's side of the channel
const goal = () => {
  switch (quest.stage) {
    case 'talk': case 'report': case 'offer': case 'return': case 'offer3': return NPC;
    case 'route3': return BERTHS.punta;
    case 'biblioteca': return l3.bibliotecario;
    case 'cenacolo': return CENACOLO_DOOR;
    case 'boss3': return sangiorgio.boss;
    case 'return3': return onIsland() ? BERTHS.sangiorgio : NPC;
    case 'key': return CHEST;
    case 'grate': case 'boss': return priests.boss;
    case 'route': return ZITELLE_AT;
    case 'ospizio': return l2.maestra;
    case 'church': return BACK_DOOR;
    case 'boss2': return zitelle.boss;
    default: return undefined;
  }
};
/**
 * The side quests' pins: Fra' Zuane while his corona is in the bag; the giver with a quest to hand in, a find spot or a use-point,
 * the elite a token is wanted off (or the token at its body), the nearest of the kind a collect or kill quest wants.
 */
const sidePins = () => {
  const pins: { x: number; z: number }[] = quest.relic && !quest.relicBack ? [NPC] : [];
  for (const q of SIDE) if (quest.side.active(q.id)) { const at = sidePin(q); if (at) pins.push(at); }
  return pins;
};
const sidePin = (q: (typeof SIDE)[number]): { x: number; z: number } | undefined => {
  const w = quest.side.want(q), giver = GIVERS[giverOf(q)].at;
  if (quest.side.ready(q)) return giver;
  if (w.kind === 'find' || w.kind === 'use') return w.at;
  if (w.kind === 'token') return drops.loose.find((l) => l.id === w.item) ?? ELITE[w.from];
  if (w.kind === 'collect' || w.kind === 'kill') {
    return [...zitelle.all, ...sangiorgio.all].filter((m) => FOE.get(m.kind) === w.from && m.state !== 'dead').sort((a, b) => Math.hypot(a.x - player.pos.x, a.z - player.pos.z) - Math.hypot(b.x - player.pos.x, b.z - player.pos.z))[0];
  }
  return giver; // the letter: hand it in
};
/** The world map's quest log: the tracker's quests, each with the spot it points at (the objective, else its giver). */
const questLog = () => questView.log().map((e) => ({
  ...e,
  at: e.id === 'main' ? goal() : e.id === 'relic' ? NPC : e.id === 'bortolo' || e.id === 'teste' ? SPEZIALE : sidePin(SIDE.find((q) => q.id === e.id)!),
}));
function openMap(): void {
  if (menu.paused) return;
  kit.system.cancel();
  input.consume();
  worldMap.show({ x: player.pos.x, z: player.pos.z, facing: player.facing, view: isDiablo() ? dcam.yaw : cam.yaw, area: level.areaAt(player.pos.x, player.pos.z)?.label, goal: goal(), npcs: questView.pins(), quests: questLog(), level: THIRD.includes(quest.stage) && quest.stage !== 'offer3' ? 3 : SECOND.includes(quest.stage) && quest.stage !== 'offer' ? 2 : 1 });
}
const pressed = (code: string) => input.pressed(code);
/**
 * Zone streaming, by the hero's x: past the Ponte de la Croce (-X) the Redentore's complex and its dead are skipped
 * (frustum culling already drops their draw calls, this spares the scene walk: ~1 ms a frame on a laptop, more on
 * a phone), level 2 on the church's side of it and on San Giorgio, level 3 short of the Tre Oci. ponytail: bands on one
 * axis; per-zone bounds if a level ever doubles back.
 */
const LEVEL1 = ['chiesa', 'convento', 'orto', 'corpo-nord', 'giardini', 'laguna', 'calle'].map((z) => level.zones.get(z)!), LEVEL2 = ['giudecca', 'zitelle'].map((z) => level.zones.get(z)!);
const LEVEL3 = ['punta', 'sangiorgio'].map((z) => level.zones.get(z)!);
function stream(x: number): void {
  const one = x > -100, two = x < -50 && x > -430, three = x < -250;
  for (const g of LEVEL1) g.visible = one;
  friars.root.visible = priests.root.visible = bees.root.visible = one;
  for (const g of LEVEL2) g.visible = two;
  zitelle.root.visible = two;
  for (const g of LEVEL3) g.visible = three;
  sangiorgio.root.visible = three;
  if (quest.accepted2) zitelle.load(); // a no-op once started
  if (quest.accepted3) sangiorgio.load();
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  fx.setSize(innerWidth, innerHeight);
  cam.camera.aspect = innerWidth / innerHeight;
  cam.camera.updateProjectionMatrix();
});

// Debug hooks for later ships and for poking around in the console.
Object.assign(window, { zitelle, l2, sangiorgio, l3, ferry, bag, gear, sheet, book, vendor, drops, bagPanel, levels, levelUp, CARD, intro, audio, sound: { tap, voices }, scene, level, player, cam, dcam, occlusion, dctl, dfx, gothic, fx, kit, playerStats, friars, priests, bees, targeting, quest, questView, menu, game, discovery, worldMap });

// The autosave (core/save.ts): every few seconds and when the tab is hidden (iOS may kill it then), only
// while nobody is fighting and the hero stands, so a resume lands before the pull, never mid-fight.
const FIGHTING = new Set(['chase', 'cast', 'swing', 'nova', 'spin', 'pour']); // 'spin': the Governatrice's fuso; 'pour': the Abate's Calice
const KEEP = 5; // s
let kept = KEEP;
const keep = () => { if (!flying() && dying <= 0 && !playerStats.dead && !ferry.trip && !mobs.some((m) => FIGHTING.has(m.state))) autosave(serialize(game)); }; // never afloat
addEventListener('visibilitychange', () => { if (document.hidden) keep(); });

const timer = new THREE.Timer();
renderer.setAnimationLoop(() => {
  timer.update();
  const real = Math.min(timer.getDelta(), 0.05);
  const since = FALLEN - dying; // s since the hero fell, while dying
  const dt = dying > 0 && since < SLOW_FOR ? real * (SLOW + (1 - SLOW) * since / SLOW_FOR) : real; // slow motion as the hero falls
  if (menu.paused || worldMap.open || bagPanel.open || book.open || questView.talking || levelUp.open) { // the world holds still behind the menu, map, bag, book, dialogue or level-up; drags and wheel turns made meanwhile are dropped
    if (questView.talking && !menu.paused) questView.idle(dt, player.pos); // but the speaker talks on
    if (levelUp.open && !menu.paused) levelUp.update(dt);
    if (sheet.shown) { player.model.animate(dt, 0, true); figure.draw(); } // he idles on the sheet (and in the world behind it)
    input.consume();
    input.endFrame();
    audio.update(dt, cam.camera, undefined, menu.paused || worldMap.open || bagPanel.open || book.open, pressed); // the dialogue window ducks the music itself
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
      sangiorgio.update(dt, unseen);
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
  if (!warmed && bodiesIn()) { warmed = true; warm(); }
  if (warmed && later() & ~warmedLater) { warmedLater |= later(); warm(); } // their programs now, not when the first of them comes into view mid-fight
  if (input.pressed('Escape')) { // WoW: Esc interrupts a cast first, otherwise opens the menu
    if (kit.system.casting) kit.system.cancel();
    else menu.toggle();
  }
  if (input.pressed('KeyM')) openMap();
  if (input.pressed('KeyB')) bagPanel.toggle();
  if (input.pressed('KeyC')) sheet.toggle();
  if (input.pressed('KeyK')) book.toggle();
  game.time += dt;
  playerStats.update(dt);
  if (dying > 0 && (dying -= real) <= 0) wake();
  player.frozen = dying > 0;
  const diablo = isDiablo(), afloat = !!ferry.trip; // in the gondola: no steering, no casts
  if (!player.frozen && !afloat) dctl.update(dt, input); // click-to-move steering, click-attack swings
  kit.system.castMul = quest.castMul / worn.haste; // Fra' Bortolo's blessing, while it lasts, and Celerità
  kit.update(dt, player.frozen || afloat ? () => false : pressed); // before the player moves: casts see last frame's motion
  player.update(dt, input, diablo ? dcam.yaw : cam.yaw, !diablo && (input.buttons & 2) !== 0, dctl.steer);
  ferry.update(dt, player, quest.accepted3); // moored, or rowing the hero across
  friars.update(dt, player.pos);
  priests.update(dt, player.pos);
  bees.update(dt, player.pos);
  zitelle.update(dt, player.pos);
  sangiorgio.update(dt, player.pos);
  dfx.update(dt, quest.accepted && !quest.key);
  for (const text of drops.update(dt, player.pos)) kit.system.notices.push({ kind: 'error', text }); // before the victory: the boss drops, those he takes with him don't
  bagPanel.update();
  if (!quest.relic && bag.count(RELIC)) { // Fra' Zuane's corona picked up: the side quest starts
    quest.relic = true;
    kit.system.notices.push({ kind: 'info', text: `Missione: ${RELIC_TITLE}. ${RELIC_OBJECTIVE}` });
  }
  const letter = quest.side.update(); // Marieta's letter picked up: its quest starts
  if (letter) kit.system.notices.push({ kind: 'info', text: `Missione: ${QUESTS.lettera.title}. ${quest.side.line(letter)}` });
  for (const t of quest.side.tokens()) { // a head, the shears, the snuffer a quest wants: at the elite's body once it is dead, until picked up
    const e = ELITE[t.from];
    if (e && e.state === 'dead' && e.t > 1 && !ground(t.item)) drops.spawn(e.x, e.y, e.z, 0, t.item, 1.2);
  }
  for (const h of l3.hidden) if (due(h)) { // the second lamp lit: the drowned out of the basin, the Nostromo after them
    rouseHidden(h, true);
    kit.system.notices.push({ kind: 'error', text: 'I fari ardono: i marinai annegati salgono dal bacino, e il Nostromo carica!' });
  }
  const boss = quest.boss2Dead ? sangiorgio.boss : quest.bossDead ? zitelle.boss : priests.boss, rage = boss.fight >= boss.kind.phases!.berserk; // the boss's acts and berserk, called out as they come
  for (const text of questView.update(dt, player.pos, pressed, boss)) kit.system.notices.push({ kind: 'info', text });
  if (boss !== lastBoss) { lastBoss = boss; bossAct = boss.phase; bossRage = rage; } // the Reverendissimo's acts are not the Governatrice's
  if (boss.kind === ABATE && wed !== (boss.state !== 'pray' && boss.state !== 'dead')) { // pulled: the doge's words at the Sensa, turned on the hero
    wed = !wed;
    if (wed) {
      kit.system.notices.push({ kind: 'error', text: "L'Abate di San Giorgio: «Desponsamus te, mare!» Le nozze cominciano." });
      prepare(quest.preps()); // the side quests' weakenings, on this fight's Abate
      for (const id of quest.preps()) kit.system.notices.push({ kind: 'info', text: PREPS[id].text });
    }
  }
  if (boss.phase > bossAct) kit.system.notices.push({ kind: 'error', text: ACTS[actsOf(boss.kind)][boss.phase - 1] });
  if (rage && !bossRage) kit.system.notices.push({ kind: 'error', text: RAGE[actsOf(boss.kind)] });
  bossAct = boss.phase;
  bossRage = rage;
  if (!quest.key2 && l2.maestra.state === 'dead') { // her key, off her belt
    quest.takeKey2();
    kit.system.notices.push({ kind: 'info', text: 'Hai preso la chiave della chiesa delle Zitelle' });
  }
  if (!quest.key3 && l3.bibliotecario.state === 'dead') { // the key of the Cenacolo, off his girdle
    quest.takeKey3();
    kit.system.notices.push({ kind: 'info', text: 'Hai preso la chiave del Cenacolo' });
  }
  if (quest.boss2Dead && !quest.boss3Dead && sangiorgio.boss.state === 'dead') { // the Abate falls: the island's dead with him, the garden door opens
    quest.win3();
    sangiorgio.killAll();
    questView.victory(3);
    player.model.play('victory', 0.4);
    sweep();
  }
  if (quest.bossDead && !quest.boss2Dead && zitelle.boss.state === 'dead') { // the Governatrice falls: her girls with her, the portone opens
    quest.win2();
    zitelle.killAll();
    questView.victory(2);
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
    mobs.forEach((m, i) => {
      if (m.state !== 'dead') fell[i] = false; // risen again: its next death counts
      else if (!fell[i]) {
        fell[i] = true; slain += worthOf(i); fresh++;
        const f = FOE.get((m as { kind?: object }).kind ?? FOE);
        if (f) quest.side.killed(f); // Mastro Iseppo's kill quests
      }
    });
    if (fresh && tune.leech) playerStats.heal(playerStats.hpMax * tune.leech * fresh);
    levels.xp = slain + quest.bonusXp;
    if (levels.lv > shownLv) levelUp.flash((shownLv = levels.lv));
    if (levels.pending > 0 && dying <= 0 && !playerStats.dead && !questView.talking) openLevelUp(); // not over a quest-giver handing in its reward: once the window closes
  }
  const lv = levelOf(levels.xp);
  hud.setLevel(lv.lv, lv.into, lv.next);
  if (afloat && !diablo) { // in the gondola the lens swings round: out to the basilica's dome and campanile rising over the water, back ahead over the prow
    const k = 1 - Math.exp(-dt * 1.4), want = ferry.trip === 'out' ? Math.atan2(player.pos.x - ISLAND_VIEW.x, player.pos.z - ISLAND_VIEW.z) : player.facing;
    cam.yaw += Math.atan2(Math.sin(want - cam.yaw), Math.cos(want - cam.yaw)) * k;
    cam.pitch += ((ferry.trip === 'out' ? 0.08 : 0.25) - cam.pitch) * k;
  }
  if (diablo) dcam.update(dt, input, player.pos);
  else cam.update(dt, input, player.pos);
  blend.apply(cam.camera, dt);
  kit.vfx.applyShake(cam.camera, dt); // big hits shake the lens; trails face it
  occlusion.update(dt, player.pos, cam.camera);
  targeting.update(dt, player.pos);
  plates.update(dt, player.pos, lv.lv);
  heroBuffs.update(dt, buffs);
  stream(player.pos.x);
  const area = level.areaAt(player.pos.x, player.pos.z)?.label;
  hud.setArea(area);
  discovery.reveal(player.pos.x, player.pos.z);
  fog.update(dt);
  minimap.update(dt, player.pos, player.facing, diablo ? dcam.yaw : cam.yaw, area, foes, goal(), sidePins(), questView.pins()); // and the side quests'
  hud.setStats(playerStats);
  fx.update(dt, player.pos);
  kit.vfx.density = fx.sparks;
  audio.update(dt, cam.camera, undefined, false, pressed); // before the bar drains this frame's notices
  fx.render();
  bar.render(dt, pressed);
  input.endFrame();
  if ((kept -= dt) <= 0) { kept = KEEP; keep(); }
});
