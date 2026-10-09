import * as THREE from 'three';

// The hero: a stylized Forsaken-like undead, built from low-poly primitives with flat shading.
// Gaunt, hunched, long clawed arms, ribs and jawbone showing through grey-green skin, a ragged
// purple tunic. A plain node hierarchy (hips → legs, spine → head/arms) animated by hand:
// no skinning. Faces -Z like the controller's yaw; feet at y = 0, top of head ≈ 1.7 m.

const mat = (color: number, glow = 0) => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true });
  if (glow) m.emissive.set(color).multiplyScalar(glow);
  return m;
};
const SKIN = mat(0x8c9a80, 0.05), SKIN_DARK = mat(0x5e6a55), BONE = mat(0xd6ccb0, 0.04);
const CLOTH = mat(0x3d3350), CLOTH_DARK = mat(0x2a2433), LEATHER = mat(0x4a3a2c), HAIR = mat(0x2b2a28);
const EYE = new THREE.MeshBasicMaterial({ color: 0xffe27a }); // unlit: the yellow undead glow reads at night

const THIGH = 0.44, SHIN = 0.44, FOOT = 0.06; // leg chain, hip height = sum
const HIP_Y = THIGH + SHIN + FOOT;

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

function joint(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/** Limb segment hanging down from its joint, `len` long. */
const bone = (r0: number, r1: number, len: number, m: THREE.Material) =>
  mesh(new THREE.CylinderGeometry(r0, r1, len, 6), m, 0, -len / 2, 0);

/** Open tube whose bottom edge is torn into uneven tatters (deterministic, so every load matches). */
function ragged(rTop: number, rBot: number, h: number, seed: number, thetaStart = 0, thetaLength = Math.PI * 2): THREE.BufferGeometry {
  const segs = 14;
  const g = new THREE.CylinderGeometry(rTop, rBot, h, segs, 2, true, thetaStart, thetaLength);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > -h / 2 + 1e-4) continue;
    const k = Math.round(Math.atan2(p.getX(i), p.getZ(i)) * 10) + seed; // same angle → same cut, keeps the seam closed
    const t = Math.abs(Math.sin(k * 12.9898) * 43758.5453) % 1;
    p.setY(i, p.getY(i) + t * h * 0.45);
  }
  g.computeVertexNormals();
  return g;
}

export class ForsakenModel {
  readonly root = new THREE.Group();
  private hips: THREE.Group;
  private spine: THREE.Group;
  private head: THREE.Group;
  private jaw: THREE.Group;
  private legs: { hip: THREE.Group; knee: THREE.Group }[] = [];
  private arms: { shoulder: THREE.Group; elbow: THREE.Group }[] = [];
  private phase = 0;
  private time = 0;
  private stride = 0; // 0 idle … 1 running, eased

  constructor() {
    this.hips = joint(this.root, 0, HIP_Y, 0);
    this.hips.add(
      mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.16, 7), LEATHER, 0, 0.02, 0), // pelvis / belt
      mesh(ragged(0.17, 0.24, 0.34, 3), CLOTH_DARK, 0, -0.15, 0), // tattered loin skirt
      mesh(new THREE.TorusGeometry(0.155, 0.025, 4, 10).rotateX(Math.PI / 2), LEATHER, 0, 0.08, 0),
    );

    for (const s of [-1, 1]) {
      const hip = joint(this.hips, s * 0.1, 0, 0);
      hip.add(bone(0.065, 0.05, THIGH, SKIN_DARK));
      const knee = joint(hip, 0, -THIGH, 0);
      knee.add(
        mesh(new THREE.SphereGeometry(0.055, 5, 4), BONE, 0, 0, -0.02), // knobbly knee
        bone(0.05, 0.035, SHIN, SKIN),
        mesh(ragged(0.06, 0.075, 0.2, 7 + s), LEATHER, 0, -SHIN + 0.12, 0), // rag wrapping
        mesh(new THREE.BoxGeometry(0.09, FOOT, 0.22), SKIN_DARK, 0, -SHIN - FOOT / 2, -0.05), // bony foot
      );
      this.legs.push({ hip, knee });
    }

    // Spine pivots at the waist and leans forward: the Forsaken hunch.
    this.spine = joint(this.hips, 0, 0.1, 0);
    this.spine.rotation.x = -0.38;
    const chest = joint(this.spine, 0, 0.26, 0);
    chest.add(
      mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.22, 7), SKIN_DARK, 0, -0.18, 0), // sunken belly
      mesh(new THREE.CylinderGeometry(0.2, 0.13, 0.36, 8).scale(1, 1, 0.75), SKIN, 0, 0.05, 0), // ribcage
      // Tunic torn open down the front: the ribs show through the gap.
      mesh(ragged(0.215, 0.17, 0.5, 11, Math.PI * 1.22, Math.PI * 1.56).scale(1, 1, 0.8), CLOTH, 0, 0.0, 0),
      mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.1, 8).scale(1, 1, 0.8), CLOTH_DARK, 0, 0.22, 0), // collar mantle
    );
    for (let i = 0; i < 4; i++) { // exposed ribs: bone arcs across the open front, hugging the ribcage taper
      const y = 0.14 - i * 0.07, r = 0.13 + (0.2 - 0.13) * (y + 0.13) / 0.36 + 0.008;
      const arc = new THREE.TorusGeometry(r, 0.014, 3, 8, Math.PI * 0.75).rotateX(Math.PI / 2).rotateY(Math.PI * 0.875); // centred on -Z
      chest.add(mesh(arc.scale(1, 1, 0.78), BONE, 0, y, 0));
    }
    chest.add(mesh(new THREE.BoxGeometry(0.03, 0.26, 0.03), BONE, 0, 0.04, -0.135)); // sternum
    for (let i = 0; i < 4; i++) chest.add(mesh(new THREE.BoxGeometry(0.04, 0.035, 0.04), BONE, 0, 0.16 - i * 0.08, 0.135)); // spine knobs

    // Neck juts forward from the hunch; the head tilts back up to look ahead.
    const neck = joint(chest, 0, 0.24, -0.04);
    neck.rotation.x = -0.3;
    neck.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.16, 6), SKIN_DARK, 0, 0.07, 0));
    this.head = joint(neck, 0, 0.16, 0);
    this.head.rotation.x = 0.55;
    this.head.add(
      mesh(new THREE.IcosahedronGeometry(0.12, 1).scale(0.85, 1.05, 1), SKIN, 0, 0.06, 0.01), // gaunt skull
      mesh(new THREE.BoxGeometry(0.15, 0.025, 0.05), SKIN, 0, 0.09, -0.085), // heavy brow
      mesh(new THREE.ConeGeometry(0.018, 0.06, 4).rotateX(-Math.PI / 2 - 0.4), SKIN_DARK, 0, 0.04, -0.12), // nose stub
    );
    for (const s of [-1, 1]) {
      this.head.add(
        mesh(new THREE.SphereGeometry(0.03, 6, 4), CLOTH_DARK, s * 0.045, 0.06, -0.08), // sunken socket
        mesh(new THREE.SphereGeometry(0.02, 6, 4), EYE, s * 0.045, 0.06, -0.105),
        mesh(new THREE.BoxGeometry(0.02, 0.05, 0.05), BONE, s * 0.085, -0.01, -0.06), // cheekbone
      );
    }
    for (let i = 0; i < 6; i++) { // a few lank strands of hair down the back
      const a = (i / 5 - 0.5) * 1.6;
      const strand = mesh(new THREE.ConeGeometry(0.012, 0.22, 3), HAIR, Math.sin(a) * 0.09, 0.02, 0.06 + Math.cos(a) * 0.04);
      strand.rotation.set(2.6 + (i % 2) * 0.2, 0, a * 0.3);
      this.head.add(strand);
    }
    // Bare jawbone, hinged under the ears, hanging a little open.
    this.jaw = joint(this.head, 0, -0.01, 0.0);
    this.jaw.add(mesh(new THREE.BoxGeometry(0.12, 0.03, 0.12), BONE, 0, -0.035, -0.06));
    for (let i = 0; i < 5; i++) this.jaw.add(mesh(new THREE.BoxGeometry(0.012, 0.025, 0.012), BONE, (i - 2) * 0.022, -0.012, -0.11));

    for (const s of [-1, 1]) {
      // Long thin arms, clawed hands reaching to the knees.
      const shoulder = joint(chest, s * 0.22, 0.18, 0);
      shoulder.add(
        mesh(new THREE.SphereGeometry(0.075, 6, 4).scale(1.1, 0.8, 1), CLOTH_DARK, 0, 0.02, 0), // ragged shoulder pad
        mesh(ragged(0.06, 0.075, 0.18, 5 - s), CLOTH, 0, -0.07, 0), // torn sleeve
        bone(0.045, 0.035, 0.34, SKIN),
      );
      shoulder.rotation.z = s * 0.12;
      const elbow = joint(shoulder, 0, -0.34, 0);
      elbow.add(
        mesh(new THREE.SphereGeometry(0.04, 5, 4), BONE, 0, 0, 0.02),
        bone(0.035, 0.028, 0.32, SKIN),
        mesh(new THREE.BoxGeometry(0.075, 0.09, 0.04), SKIN_DARK, 0, -0.36, 0), // hand
      );
      for (let f = 0; f < 3; f++) { // claws, curled forward
        const claw = mesh(new THREE.ConeGeometry(0.011, 0.1, 4), BONE, (f - 1) * 0.024, -0.43, -0.015);
        claw.rotation.x = Math.PI + 0.35;
        elbow.add(claw);
      }
      this.arms.push({ shoulder, elbow });
    }
  }

  /** `speed`: horizontal m/s this frame; `grounded`: feet on the floor. */
  animate(dt: number, speed: number, grounded: boolean): void {
    this.time += dt;
    const target = grounded ? Math.min(1, speed / 6) : 0.3;
    this.stride += (target - this.stride) * Math.min(1, dt * 8);
    const s = this.stride;
    if (grounded) this.phase += dt * (speed * 1.7 + 0.001); // ~one step per 1.85 m
    const t = this.time, ph = this.phase;

    const swing = Math.sin(ph) * (0.12 + 0.38 * s) * (s > 0.02 ? 1 : 0);
    for (let i = 0; i < 2; i++) {
      const sign = i ? -1 : 1, a = swing * sign;
      this.legs[i].hip.rotation.x = a;
      // the leg swinging forward lifts its foot; the planted one stays almost straight
      this.legs[i].knee.rotation.x = -Math.max(0, Math.cos(ph) * sign) * (0.9 * s) - 0.08; // knees bend backwards (+Z)
      this.arms[i].shoulder.rotation.x = 0.55 + 0.1 * s - a * 0.8 + Math.sin(t * 1.3 + i) * 0.04 * (1 - s); // cancels the hunch, dangles forward
      this.arms[i].elbow.rotation.x = 0.35 + 0.3 * s + Math.sin(ph + i * Math.PI) * 0.15 * s;
    }
    if (!grounded) for (const l of this.legs) { l.hip.rotation.x = 0.5; l.knee.rotation.x = -0.9; }

    // Planted leg straight under the swing angle: drop the hips so the feet stay on the floor.
    const legLen = THIGH + SHIN;
    const breathe = Math.sin(t * 1.6) * 0.008 * (1 - s);
    this.hips.position.y = HIP_Y - legLen * (1 - Math.cos(swing)) - Math.abs(Math.sin(ph)) * 0.03 * s + breathe;
    this.hips.rotation.y = swing * 0.25; // shamble
    this.spine.rotation.x = -0.38 - 0.12 * s + Math.sin(t * 1.6) * 0.02 * (1 - s);
    this.spine.rotation.z = Math.cos(ph) * 0.05 * s;
    this.head.rotation.x = 0.55 + 0.1 * s + Math.sin(ph * 2) * 0.04 * s;
    this.head.rotation.z = Math.sin(t * 0.7) * 0.06 * (1 - s); // idle twitchy loll
    this.jaw.rotation.x = -0.18 - Math.max(0, Math.sin(t * 0.9)) * 0.12; // hangs open
  }
}
