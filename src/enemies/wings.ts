import * as THREE from 'three';

// The dragon's wings (enemies/serpent.ts): a bat's hand grown huge. An arm from the shoulder (humerus, forearm), a hooked
// thumb at the wrist, four long fingers fanned from it, and a membrane between them and from the last finger back down the
// flank: green going to bronze near the body, veined, torn through near its edge (the concept's). One skeleton is posed per
// frame from how far the wing is open, laid into two shared geometries (the bones in the body's scales, the membrane) drawn
// twice, the left wing a mirror of the right. Local frame: +X out, +Y up, +Z forward (towards the land), -Z back.

type V3 = [number, number, number];
const SCALE = 1.3; // the whole wing over the lengths below: a span of ~25 m tip to tip
const HUM = 2.8, FORE = 4.2, THUMB = 1;
const FINGERS = [7.4, 7, 6, 4.8];
const HIP: V3 = [0.6, -3.6, -1.8]; // where the membrane's last panel meets the flank, under the water
// Each bone's way out of its joint: folded (the arm back and up the neck, the fingers hanging down behind like a cloak), open.
const DIR: Record<string, [V3, V3]> = {
  hum: [[0.45, 0.25, -0.85], [0.85, 0.35, -0.35]],
  fore: [[0.1, 0.92, 0.35], [0.45, 0.88, -0.1]],
  thumb: [[0.05, 0.5, 0.85], [0.15, 0.6, 0.78]],
  f0: [[0.12, -0.25, -0.96], [0.5, 0.82, -0.25]],
  f1: [[0.15, -0.5, -0.85], [0.92, 0.3, -0.25]],
  f2: [[0.15, -0.72, -0.68], [0.75, -0.45, -0.45]],
  f3: [[0.12, -0.9, -0.42], [0.28, -0.88, -0.38]],
};
const CURL = new THREE.Vector3(0, -0.5, -0.6).normalize(); // the fingers bend back towards the trailing edge
const SIDES = 6; // round a bone
const SEGS = 21; // arm 2, thumb 3 (its last two the claw), 4 per finger (the last its claw)
const U = 8, W = 5, PANELS = 4; // the membrane: steps out from the wrist, across each panel

/** The membrane's skin: per panel (a quarter of the width, u along the fingers bottom to top) bronze by the arm going to sea
 * green at the edge, veins out from the wrist, darker by the bones, holes torn through near the edge and a ragged hem. */
function membraneMap(): THREE.CanvasTexture {
  const Wd = 512, H = 256, c = document.createElement('canvas');
  c.width = Wd; c.height = H;
  const g = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const P = Wd / PANELS;
  const base = g.createLinearGradient(0, H, 0, 0);
  base.addColorStop(0, '#94703a'); base.addColorStop(0.35, '#7a7a3e'); base.addColorStop(0.7, '#467a5e'); base.addColorStop(1, '#2e5a4a');
  g.fillStyle = base;
  g.fillRect(0, 0, Wd, H);
  for (let i = 0; i < 260; i++) { // mottling
    g.fillStyle = rnd() < 0.5 ? `rgba(20,34,20,${0.08 + rnd() * 0.12})` : `rgba(150,130,70,${0.05 + rnd() * 0.08})`;
    g.beginPath(); g.ellipse(rnd() * Wd, rnd() * H, 4 + rnd() * 14, 3 + rnd() * 8, rnd() * 3, 0, Math.PI * 2); g.fill();
  }
  for (let p = 0; p < PANELS; p++) {
    const x0 = p * P;
    for (const [a, b] of [[x0, x0 + P * 0.18], [x0 + P, x0 + P * 0.82]]) { // dark along the bones
      const e = g.createLinearGradient(a, 0, b, 0);
      e.addColorStop(0, 'rgba(12,22,14,0.75)'); e.addColorStop(1, 'rgba(12,22,14,0)');
      g.fillStyle = e; g.fillRect(Math.min(a, b), 0, P * 0.18, H);
    }
    const vein = (x: number, y: number, a: number, w: number, depth: number): void => { // out from the wrist, wandering, forking
      g.beginPath(); g.moveTo(x, y);
      const n = 6 + Math.round(rnd() * 4);
      for (let i = 0; i < n && y > 0; i++) {
        a += (rnd() - 0.5) * 0.5; x += Math.sin(a) * 12; y -= Math.cos(a) * 14;
        g.lineTo(x, y);
        if (depth < 2 && rnd() < 0.18) { g.strokeStyle = 'rgba(16,26,12,0.7)'; g.lineWidth = w; g.stroke(); vein(x, y, a + (rnd() < 0.5 ? -0.6 : 0.6), w * 0.6, depth + 1); g.beginPath(); g.moveTo(x, y); }
      }
      g.strokeStyle = 'rgba(16,26,12,0.7)'; g.lineWidth = w; g.stroke();
      g.strokeStyle = 'rgba(200,180,110,0.18)'; g.lineWidth = w * 0.4; g.stroke();
    };
    for (let i = 0; i < 5; i++) vein(x0 + P * (0.15 + i * 0.17 + rnd() * 0.06), H, (rnd() - 0.5) * 0.4, 2.4, 0);
  }
  g.globalCompositeOperation = 'destination-out'; // the tears
  g.fillStyle = '#000';
  const hole = (x: number, y: number, r: number): void => {
    g.beginPath();
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, k = r * (0.5 + rnd() * 0.7); g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * k * 1.3, y + Math.sin(a) * k); }
    g.fill();
  };
  for (let p = 0; p < PANELS; p++) for (let i = 0; i < 9; i++) hole(p * P + P * (0.18 + rnd() * 0.64), H * (0.04 + rnd() * rnd() * 0.6), 3 + rnd() * 10);
  g.beginPath(); g.moveTo(0, 0); // the hem: ragged, with a few deep rips
  for (let x = 0; x <= Wd; x += 6) g.lineTo(x, 4 + rnd() * 12 + (rnd() < 0.1 ? 24 + rnd() * 40 : 0));
  g.lineTo(Wd, 0); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const ease = (k: number) => k * k * (3 - 2 * k);
const clamp01 = (k: number) => Math.min(1, Math.max(0, k));

/** Both wings: `sides` are [right, left], each a group to place at its shoulder; `pose` lays the shared skeleton. */
export class Wings {
  readonly sides: THREE.Group[] = [];
  readonly membrane: THREE.MeshStandardMaterial;
  private bones = new THREE.BufferGeometry();
  private skin = new THREE.BufferGeometry();
  private bp: THREE.BufferAttribute;
  private bn: THREE.BufferAttribute;
  private mp: THREE.BufferAttribute;
  private j = Array.from({ length: 6 }, () => new THREE.Vector3()); // S E W thumb claw-joint claw-tip
  private f = Array.from({ length: 4 }, () => [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]); // each finger: wrist, control, tip
  private a = new THREE.Vector3(); private b = new THREE.Vector3(); private c = new THREE.Vector3(); private d = new THREE.Vector3();
  private e = new THREE.Vector3(); private n = new THREE.Vector3(); private x = new THREE.Vector3(); private y = new THREE.Vector3();
  private seg = 0;

  constructor(scales: THREE.MeshStandardMaterial, glow: number) {
    const bv = SEGS * 2 * (SIDES + 1), bi: number[] = [], buv = new Float32Array(bv * 2);
    for (let s = 0; s < SEGS; s++) {
      const claw = s === 3 || s === 4 || s % 4 === 0 && s > 4;
      for (let r = 0; r < 2; r++) for (let k = 0; k <= SIDES; k++) {
        const i = (s * 2 + r) * (SIDES + 1) + k;
        buv[i * 2] = claw ? 0.5 : 0.15 + (k / SIDES) * 0.7; // the claws in the scales' pale belly, horn-coloured
        buv[i * 2 + 1] = r * 0.6;
        if (r === 0 && k < SIDES) { const a = i, b = a + SIDES + 1; bi.push(a, a + 1, b, b, a + 1, b + 1); }
      }
    }
    this.bp = new THREE.BufferAttribute(new Float32Array(bv * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.bn = new THREE.BufferAttribute(new Float32Array(bv * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.bones.setAttribute('position', this.bp);
    this.bones.setAttribute('normal', this.bn);
    this.bones.setAttribute('uv', new THREE.BufferAttribute(buv, 2));
    this.bones.setIndex(bi);

    const mv = PANELS * (U + 1) * (W + 1), mi: number[] = [], muv = new Float32Array(mv * 2);
    for (let p = 0; p < PANELS; p++) for (let u = 0; u <= U; u++) for (let w = 0; w <= W; w++) {
      const i = (p * (U + 1) + u) * (W + 1) + w;
      muv[i * 2] = (p + 0.02 + (w / W) * 0.96) / PANELS; muv[i * 2 + 1] = u / U;
      if (u < U && w < W) { const b = i + W + 1; mi.push(i, b, i + 1, b, b + 1, i + 1); }
    }
    this.mp = new THREE.BufferAttribute(new Float32Array(mv * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.skin.setAttribute('position', this.mp);
    this.skin.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(mv * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.skin.setAttribute('uv', new THREE.BufferAttribute(muv, 2));
    this.skin.setIndex(mi);

    const map = membraneMap();
    this.membrane = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: new THREE.Color().setScalar(glow), side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.75, metalness: 0.05 });
    this.membrane.userData.glow = glow;
    for (const s of [1, -1]) {
      const side = new THREE.Group(), mirror = new THREE.Group();
      mirror.scale.set(s * SCALE, SCALE, SCALE);
      const bones = new THREE.Mesh(this.bones, scales), skin = new THREE.Mesh(this.skin, this.membrane);
      bones.frustumCulled = skin.frustumCulled = false; // rewritten every frame
      mirror.add(bones, skin);
      side.add(mirror);
      this.sides.push(side);
    }
  }

  /**
   * Lay the skeleton and the membrane: `open` 0 folded to 1 spread (the arm first, the fingers fanning after it), `billow`
   * the membrane's belly between the fingers (the air it holds on a stroke), `t` the time its ripple runs on.
   */
  pose(open: number, billow: number, t: number): void {
    const arm = ease(clamp01(open * 1.5)), fan = ease(clamp01(open * 1.5 - 0.5)), [S, E, Wr, Th, C1, C2] = this.j;
    S.set(0, 0, 0);
    E.copy(S).addScaledVector(this.dir('hum', arm), HUM);
    Wr.copy(E).addScaledVector(this.dir('fore', arm), FORE);
    Th.copy(Wr).addScaledVector(this.dir('thumb', arm), THUMB);
    C1.copy(Th).addScaledVector(this.dir('thumb', arm), 0.45);
    C2.copy(C1).addScaledVector(this.a.set(0, -0.55, 0.85).normalize(), 0.55); // the hook over and down
    FINGERS.forEach((len, i) => {
      const [w, c, tip] = this.f[i], d = this.dir('f' + i, fan);
      w.copy(Wr);
      c.copy(Wr).addScaledVector(d, len * 0.55);
      tip.copy(Wr).addScaledVector(d, len).addScaledVector(CURL, len * 0.14);
    });

    this.seg = 0;
    this.limb(S, E, 0.38, 0.27);
    this.limb(E, Wr, 0.27, 0.2);
    this.limb(Wr, Th, 0.2, 0.13);
    this.limb(Th, C1, 0.13, 0.08);
    this.limb(C1, C2, 0.08, 0);
    for (const fg of this.f) {
      let r = 0.18;
      this.at(fg, 0, this.b);
      for (let k = 1; k <= 3; k++) { this.at(fg, k / 3, this.c); this.limb(this.b, this.c, r, r - 0.04); r -= 0.04; this.b.copy(this.c); }
      this.d.copy(this.b).sub(this.at(fg, 0.9, this.c)).normalize().addScaledVector(CURL, 0.6).normalize(); // a claw off the tip
      this.limb(this.b, this.c.copy(this.b).addScaledVector(this.d, 0.5), r, 0);
    }
    this.bp.needsUpdate = this.bn.needsUpdate = true;

    // The membrane: each panel between two edges out of the wrist (two fingers, or the last finger and the flank), the hem
    // scalloped in between the tips, bellied by the air and rippling.
    const M = this.mp.array as Float32Array, hip = this.e.set(...HIP);
    for (let p = 0; p < PANELS; p++) {
      const A = this.f[p];
      this.n.subVectors(this.at(A, 1, this.a), Wr);
      if (p < 3) this.x.subVectors(this.at(this.f[p + 1], 1, this.b), Wr); else this.x.subVectors(hip, Wr);
      this.n.cross(this.x).normalize(); // the panel's back
      for (let u = 0; u <= U; u++) {
        const s = u / U;
        this.at(A, s, this.a);
        if (p < 3) this.at(this.f[p + 1], s, this.b);
        else this.b.copy(Wr).multiplyScalar((1 - s) * (1 - s)).addScaledVector(E, 2 * s * (1 - s)).addScaledVector(hip, s * s); // down the arm to the flank
        const span = this.a.distanceTo(this.b);
        for (let w = 0; w <= W; w++) {
          const v = w / W, arc = Math.sin(Math.PI * v), k = ((p * (U + 1) + u) * (W + 1) + w) * 3;
          this.y.lerpVectors(this.a, this.b, v).sub(Wr).multiplyScalar(1 - 0.22 * arc * s ** 3).add(Wr);
          const belly = (billow + 0.05 * Math.sin(t * 3.3 + s * 4 + p * 1.7)) * arc * Math.sin(Math.PI * Math.min(1, s * 1.1)) * span;
          this.y.addScaledVector(this.n, belly);
          M[k] = this.y.x; M[k + 1] = this.y.y; M[k + 2] = this.y.z;
        }
      }
    }
    this.mp.needsUpdate = true;
    this.skin.computeVertexNormals();
  }

  /** A bone's way out of its joint, `k` of the way from folded to open. */
  private dir(bone: string, k: number): THREE.Vector3 {
    const [f, o] = DIR[bone];
    return this.d.set(f[0] + (o[0] - f[0]) * k, f[1] + (o[1] - f[1]) * k, f[2] + (o[2] - f[2]) * k).normalize();
  }

  /** The point `s` along a finger (a quadratic from the wrist through its control to the tip). */
  private at([w, c, tip]: THREE.Vector3[], s: number, out: THREE.Vector3): THREE.Vector3 {
    const r = 1 - s;
    return out.copy(w).multiplyScalar(r * r).addScaledVector(c, 2 * s * r).addScaledVector(tip, s * s);
  }

  /** The next bone: a tapered tube from a (radius ra) to b (rb). */
  private limb(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number): void {
    const P = this.bp.array as Float32Array, Nn = this.bn.array as Float32Array, ax = this.n.subVectors(b, a).normalize();
    const p1 = this.x.set(Math.abs(ax.y) < 0.9 ? 0 : 1, Math.abs(ax.y) < 0.9 ? 1 : 0, 0).cross(ax).normalize(), p2 = this.y.crossVectors(ax, p1);
    for (let r = 0; r < 2; r++) {
      const o = r ? b : a, rad = r ? rb : ra;
      for (let k = 0; k <= SIDES; k++) {
        const ang = (k / SIDES) * Math.PI * 2, cx = Math.cos(ang), sy = Math.sin(ang), i = ((this.seg * 2 + r) * (SIDES + 1) + k) * 3;
        const nx = p1.x * cx + p2.x * sy, ny = p1.y * cx + p2.y * sy, nz = p1.z * cx + p2.z * sy;
        P[i] = o.x + nx * rad; P[i + 1] = o.y + ny * rad; P[i + 2] = o.z + nz * rad;
        Nn[i] = nx; Nn[i + 1] = ny; Nn[i + 2] = nz;
      }
    }
    this.seg++;
  }
}
