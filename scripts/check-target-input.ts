// Concurrent pointer regression at the DOM-handler boundary; native touchscreen synthesis is a browser check.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Targeting, type Kind } from '../src/ui/target.ts';
import { registerHooks } from 'node:module';
const hooks = registerHooks({ load(url, context, next) {
  if (url.endsWith('/ui/icons.ts')) return { format: 'module', source: 'export const ICONS = {}', shortCircuit: true };
  return next(url, context);
} });
const { TouchControls } = await import('../src/ui/touch.ts');
hooks.deregister();
import { Input } from '../src/core/input.ts';

class Element extends EventTarget {
  style: Record<string, string> = {};
  innerHTML = '';
  textContent = '';
  hidden = false;
  offsetWidth = 120;
  classList = { add() {}, remove() {}, toggle() {} };
  children = new Map<string, Element>();
  querySelector(key: string): Element {
    if (!this.children.has(key)) this.children.set(key, new Element());
    return this.children.get(key)!;
  }
  querySelectorAll(): Element[] { return [new Element(), new Element()]; }
  setPointerCapture() {}
  remove() {}
}
const elements = new Map<string, Element>();
const get = (id: string) => {
  if (!elements.has(id)) elements.set(id, new Element());
  return elements.get(id)!;
};
const win = new EventTarget();
Object.assign(globalThis, {
  document: { getElementById: get, body: get('body'), fullscreenEnabled: false },
  addEventListener: win.addEventListener.bind(win),
  matchMedia: () => ({ matches: true }), innerWidth: 844,
});
const canvas = new Element() as unknown as HTMLElement;
const input = new Input(canvas);
new TouchControls(canvas, input);
const mobs = [4, 8, 12].map((z) => ({ x: 0, y: 0, z: -z, hp: 10, state: 'hoe' }));
const kind: Kind = { name: 'Frate', max: 10, height: 1.75, all: mobs, ready: () => true };
const targeting = new Targeting(canvas, new THREE.PerspectiveCamera(), new THREE.Scene(), [], [kind], () => true);
let actions = 0;
for (const method of ['nearest', 'cycle'] as const) {
  const original = targeting[method].bind(targeting);
  targeting[method] = (...args) => { actions++; original(...args); };
}
const send = (el: EventTarget, type: string, id: number, x = 100, y = 250, primary = id === 1, pointerType = 'touch') => {
  const e = Object.assign(new Event(type, { cancelable: true }), {
    pointerId: id, pointerType, isPrimary: primary, clientX: x, clientY: y,
    movementX: 0, movementY: 0, button: 0, detail: type === 'click' ? 1 : 0,
  });
  el.dispatchEvent(e);
  if (el !== win) win.dispatchEvent(e);
  return e;
};
const start = () => { send(canvas, 'pointerdown', 1); send(canvas, 'pointermove', 1, 160); assert.equal(input.stickX, 1); };
const end = (type = 'pointerup') => { send(canvas, type, 1, 160); assert.equal(input.stickX, 0); };
const tap = (id: string, primary = false, click = false) => {
  const button = get(id), before = actions;
  send(button, 'pointerdown', 2, 700, 250, primary);
  assert.equal(actions, before + 1, 'touch selects immediately, even as non-primary second finger');
  send(button, 'pointerup', 2, 700, 250, primary);
  if (click) send(button, 'click', 2, 700, 250, primary);
  assert.equal(actions, before + 1, 'release/compatibility click must not select twice');
};
start();
tap('target-nearest'); assert.equal(targeting.target?.mob, mobs[0]);
for (const expected of [mobs[1], mobs[2], mobs[0]]) {
  tap('target-cycle'); assert.equal(targeting.target?.mob, expected); assert.equal(input.stickX, 1);
}
end();
// Single primary touch may generate a click; that click must not double-cycle.
tap('target-cycle', true, true); assert.equal(targeting.target?.mob, mobs[1]);
// Reverse finger order, cancellation and subsequent presses have no held target state.
send(get('target-nearest'), 'pointerdown', 2, 700, 250, true);
start();
send(get('target-nearest'), 'pointercancel', 2, 700, 250, true);
assert.equal(input.stickX, 1); tap('target-cycle'); end('pointercancel');
start(); tap('target-nearest'); end();
assert.deepEqual(input.consume(), { dx: 0, dy: 0, wheel: 0, zoom: 1 }, 'target touches never orbit or zoom');
assert.equal(input.down('Space', 'Digit1', 'KeyR', 'KeyT'), false);
// Mouse click and keyboard activation retain their existing click path.
let before = actions;
send(get('target-cycle'), 'pointerdown', 3, 700, 250, true, 'mouse');
assert.equal(actions, before);
send(get('target-cycle'), 'click', 3, 700, 250, true, 'mouse');
assert.equal(actions, ++before);
get('target-cycle').dispatchEvent(new Event('click')); assert.equal(actions, ++before);
win.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { code: 'Tab', repeat: false }));
assert.equal(actions, ++before);
console.log('target touch input: concurrent joystick, one action, repeated/reversed/cancelled touches, mouse and keyboard ok');
