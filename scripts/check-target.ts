// Target picking check (`npm run check`): a click on a mob's body selects it, the closer of two
// overlapping mobs wins, empty ground, dead mobs and mobs behind the camera select nothing.
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { pick, nearest, next, resolve, type Kind, type Mob } from '../src/ui/target.ts';

const fail = (why: string) => { throw new Error(why); };
const W = 800, H = 600;
const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 100);
camera.position.set(0, 1.6, 0);
camera.lookAt(0, 1.6, -1); // looking down -Z
camera.updateMatrixWorld();

const mob = (x: number, z: number, state = 'hoe'): Mob => ({ x, y: 0, z, hp: 10, state });
const near = mob(0, -5), far = mob(0.3, -12), dead = mob(-3, -5, 'dead'), behind = mob(0, 5);
const kind: Kind = { name: 'Frate', max: 10, height: 1.75, all: [near, far, dead, behind], ready: () => true };
const at = (m: Mob, h = 1) => { const v = new THREE.Vector3(m.x, m.y + h, m.z).project(camera); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H] as const; };

if (pick([kind], camera, ...at(near), W, H)?.mob !== near) fail('click on a mob misses it');
if (pick([kind], camera, ...at(far, 1.4), W, H)?.mob !== far) fail('far mob above the near one not picked');
if (pick([kind], camera, ...at(near, 0.9), W, H)?.mob !== near) fail('overlap: the closer mob should win');
if (pick([kind], camera, ...at(dead), W, H)) fail('dead mob picked');
if (pick([kind], camera, 20, 20, W, H)) fail('empty corner picked something');
if (pick([{ ...kind, ready: () => false }], camera, ...at(near), W, H)) fail('mob without a model picked');

// A targeted cast with no living target takes the nearest foe to the hero within the cast's reach.
const hero = { x: 0, z: 0 };
if (resolve(undefined, [kind], hero, 30)?.mob !== near) fail('no target: the nearest foe should be taken');
if (resolve(undefined, [kind], hero, 4)) fail('no foe in reach: nothing should be taken');
if (resolve({ kind, mob: dead }, [kind], hero, 30)?.mob !== near) fail('dead target: the nearest living foe should be taken');
if (resolve({ kind, mob: far }, [kind], hero, 4)?.mob !== far) fail('a living target should be kept');
if (resolve(undefined, [kind], hero, 30, (m) => m !== near)?.mob !== behind) fail('a foe out of sight should be skipped');
// Mid-fight, nothing selected: the foe fighting the hero, not a nearer pack at rest (hoeing, praying), which a cast would pull.
const fighting = mob(0, 9, 'chase'), resting = mob(0, -6, 'hoe'), praying = mob(2, -6, 'pray');
const fight: Kind = { ...kind, all: [resting, praying, fighting] };
if (resolve(undefined, [fight], hero, 30)?.mob !== fighting) fail('auto-target pulled a pack at rest over the foe fighting');
fighting.state = 'evade';
if (resolve(undefined, [fight], hero, 30)?.mob !== resting) fail('nobody fighting: the nearest foe should be taken');
console.log('target picking ok');

// Fosca's base cast: the camera is screened by scenery, the hero faces away, but a foe is 4 m away
// with a clear spell ray. Camera-based ensure used to leave it unselected and report no target.
const { Targeting } = await import('../src/ui/target.ts');
const { World } = await import('../src/core/physics.ts');
const { Grimoire } = await import('../src/abilities/grimoire.ts');
const { AbilitySystem } = await import('../src/abilities/system.ts');
const { tuneOf } = await import('../src/player/levels.ts');
const world = new World();
const close = mob(0, -4), selected = mob(1, -8);
const castKind = { ...kind, all: [close, selected] };
const selection = { player: new THREE.Vector3(), kinds: [castKind], target: undefined, seen: () => false } as unknown as InstanceType<typeof Targeting>;
const host = { player: { pos: new THREE.Vector3(), facing: Math.PI, world }, aimed: () => selection.target?.mob, foes: () => castKind.all };
const magic = new Grimoire(host, tuneOf([]));
let fired: Mob | undefined;
const base = { id: 'thorn', name: 'Spina del contagio', icon: 'thorn', desc: '', cooldown: 0.3, offGcd: true, main: true,
  check: () => magic.why(), fire: () => { fired = magic.target(); } };
const sys = new AbilitySystem([base], ['thorn'], host);
const reset = () => { sys.update(1, () => false); sys.notices.length = 0; fired = undefined; };
sys.aim = () => Targeting.prototype.ensure.call(selection, 30);
assert.equal(sys.tryCast(0), false);
assert.equal(sys.notices.at(-1)?.text, 'Nessun bersaglio.');
sys.aim = () => Targeting.prototype.ensure.call(selection, 30, (m) => world.sees(host.player.pos, m));
reset();
assert.equal(sys.tryCast(0), true);
assert.equal(fired, close);
assert.equal(selection.target?.mob, close);
assert.equal(sys.tryCast(0), false, 'cooldown still applies');
selection.target = { kind: castKind, mob: selected }; reset();
assert.equal(sys.tryCast(0), true);
assert.equal(fired, selected, 'manual selection is kept over the nearer foe');
selected.z = -40; reset();
assert.equal(sys.tryCast(0), false);
assert.equal(sys.notices.at(-1)?.text, 'Bersaglio fuori portata.');
assert.equal(selection.target?.mob, selected, 'out-of-range manual selection is not silently replaced');
selected.z = -8;
world.add(0, -2, 20, 0.5, 0, 4); reset();
assert.equal(sys.tryCast(0), false);
assert.equal(sys.notices.at(-1)?.text, 'Bersaglio non in vista.');
selection.target = undefined; reset();
assert.equal(sys.tryCast(0), false, 'auto-target never crosses a physical wall');
assert.equal(selection.target, undefined);
console.log('base cast auto-target: hero LOS, facing away, manual choice, range, walls and cooldown ok');

// Explicit controls use hero distance and hero LOS, not the camera ray or facing.
const third = mob(2, -10), zero = mob(0, -1), evading = mob(0, -2, 'evade'), distant = mob(0, -41);
zero.hp = 0;
const controlsKind = { ...kind, all: [far, dead, near, third, zero, evading, distant] };
const controls = [controlsKind], visible = () => true;
assert.equal(nearest(controls, { x: 2, z: -11 }, 40)?.mob, third, 'nearest is relative to hero, not camera');
assert.equal(next(undefined, controls, hero, visible)?.mob, near);
assert.equal(next({ kind: controlsKind, mob: near }, controls, hero, visible)?.mob, third);
assert.equal(next({ kind: controlsKind, mob: third }, controls, hero, visible)?.mob, far);
assert.equal(next({ kind: controlsKind, mob: far }, controls, hero, visible)?.mob, near, 'wrap all three');
assert.equal(next({ kind: controlsKind, mob: dead }, controls, hero, visible)?.mob, near);
assert.equal(next({ kind, mob: behind }, controls, hero, visible)?.mob, near, 'removed target restarts cycle');
assert.equal(next(undefined, controls, hero, () => false), undefined);
assert.equal(next(undefined, [{ ...controlsKind, ready: () => false }], hero, visible), undefined);
assert.equal(next(undefined, [], hero, visible), undefined);
assert.equal(nearest([], hero, 40), undefined);
assert.equal(resolve({ kind, mob: behind }, controls, hero, 40)?.mob, near, 'removed current target is cleared');
Object.assign(selection, { kinds: [castKind], target: undefined });
const chosen = () => selection.target?.mob;

Targeting.prototype.nearest.call(selection, (m) => new World().sees(host.player.pos, m));
assert.equal(chosen(), close, 'camera occlusion does not exclude HUD nearest');
host.player.world = new World();
reset(); assert.equal(sys.tryCast(0), true, 'HUD selected target is usable by base ability');
Targeting.prototype.cycle.call(selection, () => true);
assert.equal(chosen(), selected);
selected.state = 'dead';
Targeting.prototype.cycle.call(selection, () => true);
assert.equal(chosen(), close, 'dead current skipped');
close.state = 'dead';
Targeting.prototype.nearest.call(selection, () => true);
assert.equal(selection.target, undefined, 'no candidates clears stale selection');
console.log('HUD nearest/cycle: hero distance, complete wrap, eligibility, removed/dead/empty targets and camera occlusion ok');

const single = { ...kind, all: [near] };
assert.equal(next({ kind: single, mob: near }, [single], hero, visible)?.mob, near, 'one candidate wraps to itself');
assert.equal(next(undefined, [{ ...kind, all: [mob(0, -40)] }], hero, visible), undefined, '40 m boundary stays exclusive');
const tie = mob(0, 5), tied = { ...kind, all: [near, tie] };
assert.equal(next({ kind: tied, mob: near }, [tied], hero, visible)?.mob, tie, 'ties retain registry order');
const staleFrame = { hidden: false }, staleRing = { visible: true };
Object.assign(selection, { target: { kind: castKind, mob: close }, frame: staleFrame, ring: staleRing });
Targeting.prototype.update.call(selection, 0, new THREE.Vector3());
assert.equal(selection.target, undefined);
assert.equal(staleFrame.hidden, true);
assert.equal(staleRing.visible, false);
Object.assign(selection, { target: { kind, mob: behind } });
Targeting.prototype.update.call(selection, 0, new THREE.Vector3());
assert.equal(selection.target, undefined, 'removed target clears without a button press');

await import("./check-target-input.ts");
