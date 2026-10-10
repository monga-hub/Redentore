// Target picking check (`npm run check`): a click on a mob's body selects it, the closer of two
// overlapping mobs wins, empty ground, dead mobs and mobs behind the camera select nothing.
import * as THREE from 'three';
import { pick, type Kind, type Mob } from '../src/ui/target.ts';

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
console.log('target picking ok');
