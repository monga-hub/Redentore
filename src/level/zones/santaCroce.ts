import * as THREE from 'three';
import { type LevelBuilder, extrude, ring, shaped } from '../builder.ts';
import { Props } from '../props.ts';
import { churchSurfaces } from './churchWear.ts';

const WHEEL = new THREE.TorusGeometry(1, 0.035, 5, 16).rotateX(Math.PI / 2);

/** A modest Giudecca sanctuary: weathered limestone, brick blind arcades and a timber roof. */
export function santaCroce(b: LevelBuilder): void {
  const finishSurfaces = churchSurfaces(b);
  b.wallX(-14, -126, -110, { h: 15, role: 'stone', t: 0.8, doors: [{ at: -118, w: 3.2, h: 4.8 }] });
  b.wallX(-40, -126, -110, { h: 15, role: 'stone', t: 0.8 });
  // Each dressed side remains one independent wall for the Diablo cutaway.
  for (const x of [-126, -110]) b.together(() => {
    b.wallZ(x, -40, -14, { h: 15, role: 'stone', t: 0.8 });
    const inward = x < -118 ? 1 : -1;
    const frame = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(x + inward * 0.46, 0, 0);
    b.part(frame, 14.5, 39.5, 0, 0.65, -0.09, 0.09, 'stoneDark');
    b.part(frame, 14.5, 39.5, 6.2, 6.42, -0.16, 0.16, 'stoneDark');
    for (const z of [-18, -24, -30, -36]) {
      const c = -z;
      // The dark brick field sits behind the projecting limestone archivolt, not a false passage.
      const panel = new THREE.Shape().moveTo(c - 2.15, 0.65).lineTo(c + 2.15, 0.65)
        .lineTo(c + 2.15, 3.5).absarc(c, 3.5, 2.15, 0, Math.PI, false).closePath();
      b.decor(shaped(extrude(panel, 0.08, 0)).applyMatrix4(frame), 'brick');
      b.decor(shaped(ring(c, 3.5, 2.15, 2.39, 0.26)).applyMatrix4(frame), 'stoneDark');
      for (const s of [-1, 1]) b.part(frame, c + s * 2.15 - 0.12, c + s * 2.15 + 0.12, 0.65, 3.55, -0.13, 0.13, 'stone');
      b.part(frame, c - 2.24, c + 2.24, 0.65, 0.79, -0.16, 0.16, 'stone');
    }
    for (const z of [-15, -21, -27, -33, -39]) {
      b.part(frame, -z - 0.3, -z + 0.3, 0.65, 6.2, -0.25, 0.25, 'stone');
      b.part(frame, -z - 0.43, -z + 0.43, 0, 0.35, -0.34, 0.34, 'stoneDark');
      b.part(frame, -z - 0.41, -z + 0.41, 3.35, 3.58, -0.31, 0.31, 'stoneDark');
      b.part(frame, -z - 0.43, -z + 0.43, 5.9, 6.2, -0.32, 0.32, 'stoneDark');
      b.world.add(x + inward * 0.46, z, 0.34, 0.43, 0, 6.2);
    }
  });
  b.band(-126, -110, -40, -14, 9.5, 9.9, 0.15);
  b.band(-126, -110, -40, -14, 14.6, 15, 0.3);
  const g = new THREE.Shape().moveTo(-126.4, 15).lineTo(-109.6, 15).lineTo(-118, 19.2).closePath();
  b.decor(shaped(extrude(g, 1, 0.05)).translate(0, 0, -14.6), 'stone');
  b.hipRoof(-126, -110, -40, -15, 15);
  for (const x of [-124.5, -111.5]) b.part(null, x - 0.5, x + 0.5, 0.4, 14.6, -14, -13.6, 'stoneDark');
  b.part(null, -120, -116, 4.8, 5.3, -14, -13.6, 'stoneDark');
  b.decor(shaped(ring(-118, 11.6, 1.1, 1.5, 0.3)).translate(0, 0, -13.85), 'stoneDark');
  b.decor(shaped(extrude(new THREE.Shape().absarc(-118, 11.6, 1.1, 0, Math.PI * 2, false), 0.1, 0)).translate(0, 0, -13.84), 'lantern');
  b.area('Santa Croce: santuario della Rinascita', -125.5, -110.5, -39.5, -14.5);
  b.floor(-125.6, -110.4, -39.6, -14.4, 'paving');
  // Worn stone processional path, framed in red brick and dark inset joints, all flush to the floor.
  const p = new Props(b, 1576);
  for (const x of [-119.65, -116.35]) b.floor(x - 0.13, x + 0.13, -34, -14.5, 'brick', 0, 0.022);
  for (let z = -15; z > -34; z -= 1.5) for (let i = 0; i < 3; i++) {
    const x = -119.45 + i * 0.98;
    p.box(x, x + 0.94, 0.014, 0.026, z - 1.43, z, 'stone', 0, new THREE.Color().setScalar(p.rand(0.69, 0.91)));
  }
  for (const z of [-17, -29.7, -33.8]) b.floor(-125.35, -110.65, z - 0.1, z + 0.1, 'brick', 0, 0.03);
  for (const x of [-122, -114]) for (const z of [-19, -22, -25, -28]) pew(b, p, x, z);

  // Timber ties are above the walking camera, with short braces and iron straps at the bearings.
  for (const z of [-18, -24, -30, -36]) {
    b.together(() => {
      b.part(null, -125.45, -110.55, 7.1, 7.38, z - 0.14, z + 0.14, 'wood');
      for (const x of [-125.2, -110.8]) {
        b.part(null, x - 0.18, x + 0.18, 6.35, 7.4, z - 0.2, z + 0.2, 'wood');
        b.part(null, x - 0.2, x + 0.2, 7.02, 7.13, z - 0.21, z + 0.21, 'iron');
      }
    });
    for (const x of [-125.3, -110.7]) b.lights.push({ x, y: 2.5, z, kind: 'torch', nx: x < -118 ? 1 : -1, nz: 0 });
  }
  altar(b, p);
  // Two iron candle wheels: wax flames use the existing FX, without extra emissive flame solids or lights.
  for (const z of [-22, -30]) {
    p.rod(-118, 7.1, z, -118, 4.7, z, 0.025, 'iron');
    p.put(WHEEL, 'iron', -118, 4.7, z, 0.72, 1, 0.72);
    for (const dx of [-0.5, 0.5]) for (const dz of [-0.5, 0.5]) {
      p.rod(-118, 4.7, z, -118 + dx, 4.7, z + dz, 0.018, 'iron');
      candle(b, p, -118 + dx, 4.7, z + dz, 0.22);
    }
    b.lights.push({ x: -118, y: 4.5, z, kind: 'lamp' });
  }
  p.flush();
  finishSurfaces();
}

function pew(b: LevelBuilder, p: Props, x: number, z: number): void {
  // Wide pegged boards, shaped end cheeks and a low kneeler; the central and side aisles stay open.
  const tint = new THREE.Color().setScalar(p.rand(0.72, 0.94));
  for (const dz of [-0.2, 0, 0.2]) p.box(x - 1.3, x + 1.3, 0.5, 0.59, z + dz - 0.085, z + dz + 0.085, 'wood', 0, tint);
  for (const y of [0.77, 1.01]) p.box(x - 1.3, x + 1.3, y, y + 0.19, z + 0.28, z + 0.37, 'wood', 0, tint);
  for (const dx of [-1.25, 1.25]) {
    p.box(x + dx - 0.085, x + dx + 0.085, 0.05, 1.24, z - 0.24, z + 0.4, 'wood', 0, tint);
    p.disc(x + dx, 1.24, z + 0.24, 0.12, 0.1, 'wood');
    p.box(x + dx - 0.14, x + dx + 0.14, 0.03, 0.13, z - 0.38, z + 0.43, 'wood');
    for (const dz of [-0.16, 0.27]) p.disc(x + dx, 0.6, z + dz, 0.025, 0.015, 'iron');
  }
  p.box(x - 1.15, x + 1.15, 0.14, 0.25, z - 0.55, z - 0.38, 'wood', 0, tint);
  b.world.add(x, z - 0.06, 1.4, 0.5, 0, 1.34);
}

function candle(b: LevelBuilder, p: Props, x: number, y: number, z: number, h: number): void {
  p.disc(x, y, z, 0.09, 0.05, 'gold');
  p.disc(x, y + 0.05, z, 0.047, h, 'flower');
  b.lights.push({ x, y: y + h + 0.06, z, kind: 'candle' });
}

function altar(b: LevelBuilder, p: Props): void {
  b.box(-120, -116, 0, 0.16, -38, -34, 'stoneDark', { camera: false });
  b.box(-119.5, -116.5, 0.16, 1.25, -37, -35.8, 'stone', { camera: false });
  b.box(-119.7, -116.3, 1.25, 1.43, -37.2, -35.6, 'stoneDark', { camera: false });
  b.part(null, -119.52, -116.48, 0.26, 1.25, -35.79, -35.74, 'cloth');
  b.part(null, -119.53, -116.47, 0.28, 0.34, -35.74, -35.72, 'gold');
  b.part(null, -118.045, -117.955, 0.45, 1.13, -35.73, -35.7, 'gold');
  b.part(null, -118.23, -117.77, 0.86, 0.94, -35.73, -35.7, 'gold');
  // A shallow arched reredos anchors the far wall; it does not enlarge the church or its sanctuary step.
  b.together(() => {
    const panel = new THREE.Shape().moveTo(-120.25, 0.16).lineTo(-115.75, 0.16)
      .lineTo(-115.75, 3.7).absarc(-118, 3.7, 2.25, 0, Math.PI, false).closePath();
    b.decor(shaped(extrude(panel, 0.22, 0.02)).translate(0, 0, -39.3), 'brick');
    b.decor(shaped(ring(-118, 3.7, 2.25, 2.48, 0.34)).translate(0, 0, -39.15), 'stone');
    for (const x of [-120.4, -115.6]) {
      b.part(null, x - 0.14, x + 0.14, 0.16, 3.75, -39.35, -38.95, 'stone');
      b.part(null, x - 0.26, x + 0.26, 3.5, 3.75, -39.4, -38.9, 'stoneDark');
    }
    b.part(null, -120.6, -115.4, 0.16, 0.42, -39.45, -38.8, 'stoneDark');
    b.part(null, -118.13, -117.87, 2.05, 5.4, -39, -38.76, 'wood');
    b.part(null, -119.03, -116.97, 4.15, 4.4, -39, -38.76, 'wood');
    const halo = new THREE.TorusGeometry(0.63, 0.035, 5, 24).toNonIndexed().translate(-118, 4.28, -39.05);
    b.decor(shaped(halo), 'gold');
    for (const s of [-1, 1]) {
      b.part(null, -118 + s * 0.64 - 0.03, -118 + s * 0.64 + 0.03, 4.2, 4.38, -39, -38.7, 'gold');
    }
  });
  for (const x of [-119, -118.65, -117.35, -117]) candle(b, p, x, 1.43, -36.5, x === -119 || x === -117 ? 0.45 : 0.29);
  b.lights.push({ x: -118, y: 3, z: -35, kind: 'glow', color: 0xffb36a });
  for (const x of [-120.7, -115.3]) b.lights.push({ x, y: 1.55, z: -35.5, kind: 'candelabrum' });
}
