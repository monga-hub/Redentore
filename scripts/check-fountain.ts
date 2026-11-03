import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ load(url, context, next) {
  if (url.endsWith('/ui/icons.ts')) return { format: 'module', source: 'export const ICONS = {}', shortCircuit: true };
  return next(url, context);
} });
import * as THREE from 'three';
import { fountain, NUMBER_LIFE, projectedAnchor } from '../src/fx/fountain.ts';

// The source is exactly the live bar top. Left/right arcs mirror each other, rise, turn, and fade.
assert.equal(fountain(0, 1).x, 0);
assert.equal(fountain(0, 1).y, 0);
for (let age = 0; age <= NUMBER_LIFE; age += 0.01) {
  const a = fountain(age, 1), b = fountain(age, -1);
  assert.equal(a.x, -b.x);
  assert.equal(a.y, b.y);
  assert.ok(a.x <= 29 && a.y >= -61 && a.y <= 0);
}
assert.ok(fountain(0.2, 1).y < fountain(0.1, 1).y);
assert.ok(fountain(0.9, 1).y > fountain(0.7, 1).y);
assert.equal(fountain(NUMBER_LIFE, 1).opacity, 0);
assert.equal(projectedAnchor({ x: 1.1, y: 0, z: 0 }, 844, 390), null);
assert.equal(projectedAnchor({ x: 0, y: 0, z: 1.1 }, 844, 390), null);

// Real plate layout, including stacked neighbours, zoom, moving camera and hidden/absent bars.
class Element {
  style = {}; hidden = false; className = ''; textContent = ''; innerHTML = '';
  classList = { toggle() {} };
  append() {} prepend() {}
}
Object.assign(globalThis, { document: { createElement: () => new Element(), head: new Element(), body: new Element() }, innerWidth: 844, innerHeight: 390 });
const { Plates } = await import('../src/ui/plates.ts');
const mob = { x: 0, y: 0, z: 0, hp: 80, state: 'chase' };
const other = { ...mob, x: 0.1 };
let own = false;
const kind = { name: 'fixture', max: 100, height: 2, all: [mob, other], ready: () => true, ownBar: () => own };
const camera = new THREE.PerspectiveCamera(55, 844 / 390, 0.1, 100);
const aim = () => { camera.lookAt(0, 1, 0); camera.updateMatrixWorld(); };
camera.position.set(0, 4, 10); aim();
const plates = new Plates([kind], camera, { poisons: new Map(), candles: new Map() }, () => mob);
const hero = new THREE.Vector3(0, 0, 2);
plates.update(0.016, hero, 1);
const a = plates.combatAnchor(mob)!, b = plates.combatAnchor(other)!;
assert.ok(a && b && Math.abs(a.y - b.y) > 10, 'combat origins must use stacked bar positions');
camera.position.set(4, 5, 7); aim();
plates.update(0.016, hero, 1);
assert.notDeepEqual(plates.combatAnchor(mob), a, 'anchor must follow camera and zoom');
const on = (plates as any).on.get(mob);
assert.deepEqual(plates.combatAnchor(mob), on.anchor);
assert.ok(on.el.style.transform.includes(`translate3d(${on.anchor.x.toFixed(1)}px`));
camera.lookAt(10, 5, 20); camera.updateMatrixWorld();
plates.update(0.016, hero, 1);
assert.equal(plates.combatAnchor(mob), null, 'hidden plate must suppress labels');
own = true;
assert.equal(plates.combatAnchor(mob), undefined, 'boss without a displayed nameplate bar uses target fallback');
mob.state = 'dead'; plates.update(0.016, hero, 1);
assert.equal(plates.combatAnchor(mob), undefined, 'killing blow uses moving target fallback once bar disappears');
console.log('combat fountain trajectory and live nameplate anchoring ok');

// Exercise the real health observer and number pool without WebGL-only gore/beams.
const { DiabloFx } = await import('../src/fx/diabloFx.ts');
const fx = Object.create(DiabloFx.prototype) as any;
Object.assign(fx, { time: 1, numbers: [], lanes: new WeakMap(), layer: new Element(), p: new THREE.Vector3(), camera,
  anchor: () => ({ x: 400, y: 200 }), hit() {}, fall() {} });
const m = { x: 0, y: 0, z: 0, hp: 100, state: 'chase' };
const track = { mob: m, height: 2, hp: 100, acc: 0, t: 0, heal: 0, healT: 0, dead: false };
const step = (dt: number) => { fx.time += dt; fx.watch(track, dt); fx.placeNumbers(); };
m.hp -= 30; step(0.016);
assert.equal(fx.numbers.at(-1).el.textContent, '30');
assert.equal(fx.numbers.at(-1).el.className, 'big');
m.hp += 12; step(0.016);
assert.equal(fx.numbers.at(-1).el.textContent, '+12');
assert.equal(fx.numbers.at(-1).el.className, 'heal');
assert.equal(fx.numbers[0].lane, -fx.numbers[1].lane);
assert.ok(fx.numbers[1].delay > 0, 'bursts stagger without altering their amounts');
m.hp -= 0.5; step(0.22); m.hp -= 0.5; step(0.23);
assert.equal(fx.numbers.at(-1).el.textContent, '1');
assert.equal(fx.numbers.at(-1).el.className, 'dot');
fx.anchor = () => null; fx.placeNumbers();
assert.ok(fx.numbers.every((f: any) => f.el.style.visibility === 'hidden'));
fx.anchor = () => undefined; camera.position.set(0, 4, 10); aim();
m.hp = 0; m.state = 'dead'; step(0.1);
assert.equal(fx.numbers.at(-1).el.textContent, '81');
step(0.13);
assert.equal(fx.numbers.at(-1).el.style.visibility, 'visible', 'killing blow survives the missing plate');
const count = fx.numbers.length;
m.hp = 100; m.state = 'evade'; step(0.1);
assert.equal(fx.numbers.length, count, 'evade reset is not combat healing');
console.log('combat observer: damage, critical, periodic aggregation, heal, burst, hidden plate and killing blow ok');
