import * as THREE from 'three';
import type { PlayerController } from '../player/controller.ts';
import type { PlayerStats } from '../player/stats.ts';
import { AbilitySystem, type Ability } from './system.ts';
import { Vfx, type Puff } from './vfx.ts';

// The Forsaken kit: eight abilities plus a potion that read without enemies (movement, light, VFX).
// Names are our own; flavour after the undead racials and shadow/plague classes.

const VIOLET = 0xa45cff, SHADOW = 0x1a0f24, PLAGUE = 0x7dff3a, BILE = 0x1f2e0c, WISP = 0x8dffe0;
const BLOOD = 0xff2a3a, GHOST = 0x9fc4ff, GRAVE = 0x58ff9a, BONE = 0xefe6d2;

const PLAGUE_DPS = 12, STEP_DAMAGE = 25, WISP_DPS = 15;
const MELEE_DAMAGE = 10, MELEE_RANGE = 2.6, MELEE_ARC = Math.cos(1.1); // ~125° cone in front
const WISP_RADIUS = 1.6, WISP_MOVING = 0.6; // m, m/s: the wisp only scorches while it drifts

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** Emit `rate`/s on average this frame. */
const every = (rate: number, dt: number, f: () => void) => {
  for (let n = rate * dt + Math.random(); n >= 1; n--) f();
};

interface Cloud { x: number; y: number; z: number; t: number }

export class Forsaken {
  readonly vfx = new Vfx();
  readonly system: AbilitySystem<Forsaken>;
  readonly player: PlayerController;
  readonly stats: PlayerStats;
  veil = 0; // s left
  wisp = 0;
  private clouds: Cloud[] = [];
  private hidden = 0; // Passo d'ombra: model hidden for a blink
  private waveT = -1;
  private columnT = -1;
  private time = 0;
  private wispVel = new THREE.Vector3();
  /** Damage dealer, wired to the enemies by main.ts: hurts whatever stands where `inside` holds. */
  hurt?: (inside: (x: number, z: number) => boolean, n: number) => void;

  readonly spawn: { x: number; z: number; yaw: number };

  constructor(player: PlayerController, spawn: { x: number; z: number; yaw: number }, stats: PlayerStats) {
    this.player = player;
    this.spawn = spawn;
    this.stats = stats;
    this.system = new AbilitySystem(ABILITIES, BAR, this);
    this.system.pool = stats;
    this.system.onStart = (a) => { if (a.id !== 'veil' && (!a.offGcd || a.id === 'fall') && this.veil > 0) this.endVeil(); };
  }

  update(dt: number, pressed: (code: string) => boolean): void {
    this.time += dt;
    this.system.update(dt, pressed);
    const p = this.player.pos, v = this.vfx;

    if (this.hidden > 0 && (this.hidden -= dt) <= 0) this.player.mesh.visible = true;

    if (this.veil > 0) {
      every(30, dt, () => v.puff({ x: p.x + rnd(-0.3, 0.3), y: p.y + rnd(0.1, 1.7), z: p.z + rnd(-0.3, 0.3), vy: 0.3, life: 1.1, size: 0.18, grow: 0.2, color: GHOST, hdr: 1.4, alpha: 0.6 }));
      if ((this.veil -= dt) <= 0) this.endVeil();
    }

    for (const c of this.clouds) {
      c.t -= dt;
      this.hurt?.((x, z) => Math.hypot(x - c.x, z - c.z) < 2.2, PLAGUE_DPS * dt);
      const r = 2.2 * Math.min(1, (8 - c.t) * 2); // swells in over half a second
      every(60, dt, () => {
        const a = rnd(0, Math.PI * 2), d = Math.sqrt(Math.random()) * r;
        v.puff({ x: c.x + Math.cos(a) * d, y: c.y + rnd(0, 0.5), z: c.z + Math.sin(a) * d, vy: rnd(0.2, 0.7), life: rnd(1.4, 2.2), size: rnd(0.1, 0.2), color: PLAGUE, hdr: 2.2, drag: 0.4 });
      });
      every(14, dt, () => {
        const a = rnd(0, Math.PI * 2), d = Math.sqrt(Math.random()) * r;
        v.puff({ x: c.x + Math.cos(a) * d, y: c.y + rnd(0.2, 0.9), z: c.z + Math.sin(a) * d, vx: rnd(-0.2, 0.2), vy: 0.15, vz: rnd(-0.2, 0.2), life: 2.6, size: rnd(1.3, 2), grow: 1.5, color: BILE, alpha: 0.45, normal: true });
        v.puff({ x: c.x + Math.cos(a) * d * 0.7, y: c.y + rnd(0.3, 1), z: c.z + Math.sin(a) * d * 0.7, vy: 0.1, life: 2.4, size: rnd(1.2, 1.8), grow: 1.4, color: PLAGUE, hdr: 0.6, alpha: 0.5 }); // sickly glow
      });
    }
    this.clouds = this.clouds.filter((c) => c.t > 0);

    if (this.wisp > 0) {
      // Hovers off the right shoulder, lagging behind like something alive.
      const f = this.player.facing, w = v.wisp.position;
      const tx = p.x + Math.cos(f) * 0.8 + Math.sin(f) * 0.5, tz = p.z - Math.sin(f) * 0.8 + Math.cos(f) * 0.5;
      const ty = p.y + 2.1 + Math.sin(this.time * 2.3) * 0.15;
      this.wispVel.set(tx - w.x, ty - w.y, tz - w.z).multiplyScalar(4);
      w.addScaledVector(this.wispVel, Math.min(dt, 0.1));
      every(40, dt, () => v.puff({ x: w.x + rnd(-0.05, 0.05), y: w.y + rnd(-0.05, 0.05), z: w.z + rnd(-0.05, 0.05), vy: 0.25, life: 0.8, size: 0.09, color: WISP, hdr: 2.5 }));
      if (this.wispVel.length() > WISP_MOVING) {
        // On the move it sheds a scorching trail: everything it brushes past burns.
        this.hurt?.((x, z) => Math.hypot(x - w.x, z - w.z) < WISP_RADIUS, WISP_DPS * dt);
        every(50, dt, () => {
          const a = rnd(0, Math.PI * 2), d = rnd(0.2, WISP_RADIUS * 0.6);
          v.puff({ x: w.x + Math.cos(a) * d, y: w.y + rnd(-0.6, 0.2), z: w.z + Math.sin(a) * d, vy: -0.2, life: 0.6, size: 0.06, color: WISP, hdr: 2, drag: 1.5 });
        });
      }
      if ((this.wisp -= dt) <= 0) {
        v.wisp.visible = false;
        v.burst(w.x, w.y, w.z, 30, 0.2, { life: 0.9, size: 0.08, color: WISP, hdr: 3, drag: 2 }, 1.5);
      }
    }

    if (this.waveT >= 0) {
      const t = (this.waveT += dt) / 0.7;
      v.wave.position.set(p.x, p.y + 0.05, p.z);
      v.wave.scale.setScalar(0.3 + t * 6);
      v.wave.material.color.setHex(VIOLET).multiplyScalar(3 * (1 - t));
      if (t >= 1) { this.waveT = -1; v.wave.visible = false; }
    }

    if (this.columnT >= 0) {
      const t = (this.columnT += dt) / 1.2;
      v.column.material.opacity = 1 - t;
      v.column.scale.set(1 - t * 0.7, 1, 1 - t * 0.7);
      if (t >= 1) { this.columnT = -1; v.column.visible = false; }
    }

    v.update(dt, this.wisp > 0);
  }

  // --- helpers the ability table uses ---

  startWave(): void {
    this.waveT = 0;
    this.vfx.wave.visible = true;
  }

  startColumn(x: number, y: number, z: number): void {
    const c = this.vfx.column;
    c.position.set(x, y, z);
    c.scale.setScalar(1);
    c.visible = true;
    this.columnT = 0;
  }

  plague(): void {
    const p = this.player.pos, f = this.player.facing;
    const x = p.x - Math.sin(f) * 3.5, z = p.z - Math.cos(f) * 3.5, g = this.player.world.groundAt(x, z, p.y + 1.5);
    this.clouds.push({ x, y: g > -Infinity ? g : p.y, z, t: 8 }); // settles on stairs and ledges
  }

  blinkHide(): void {
    this.hidden = 0.12;
    this.player.mesh.visible = false;
  }

  setGhost(on: boolean): void {
    this.player.mesh.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of [o.material].flat() as THREE.Material[]) {
        m.transparent = on;
        m.opacity = on ? 0.32 : 1;
        m.depthWrite = !on;
      }
      o.castShadow = !on;
    });
  }

  private endVeil(): void {
    this.veil = 0;
    this.player.speedMul = 1;
    this.setGhost(false);
  }
}

/** Distance from (x,z) to the segment a-b. */
const segDist = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};

const num = (n: number) => n.toLocaleString('it');
const chest = (k: Forsaken) => ({ x: k.player.pos.x, y: k.player.pos.y + 1, z: k.player.pos.z });
const smoke = (color: number, size: number, alpha: number): Omit<Puff, 'x' | 'y' | 'z'> =>
  ({ life: 1.1, size, grow: 2, color, alpha, normal: true, drag: 3 });

export const ABILITIES: Ability<Forsaken>[] = [
  {
    id: 'step', name: "Passo d'ombra", icon: 'step', cooldown: 12, mana: 40,
    desc: `Ti dissolvi nell'ombra e riappari fino a 8 m più avanti, infliggendo ${STEP_DAMAGE} danni a chi attraversi. I muri ti fermano.`,
    fire(k) {
      const a = chest(k), v = k.vfx;
      v.burst(a.x, a.y, a.z, 26, 0.5, smoke(SHADOW, 0.6, 0.8), 1.4);
      v.burst(a.x, a.y, a.z, 30, 0.4, { life: 0.7, size: 0.1, color: VIOLET, hdr: 3, drag: 3 }, 3);
      const d = k.player.blink(8), b = chest(k);
      k.hurt?.((x, z) => segDist(x, z, a.x, a.z, b.x, b.z) < 1.2, STEP_DAMAGE);
      for (let s = 0; s <= d; s += 0.35) {
        const t = s / Math.max(d, 1e-3);
        v.puff({ x: a.x + (b.x - a.x) * t, y: a.y + rnd(-0.3, 0.5), z: a.z + (b.z - a.z) * t, life: rnd(0.4, 0.8), size: 0.25, grow: 0.2, color: VIOLET, hdr: 1.8, alpha: 0.7 });
      }
      v.burst(b.x, b.y, b.z, 22, 0.5, smoke(SHADOW, 0.55, 0.7), 1.1);
      v.pulse(b.x, b.y + 0.5, b.z, VIOLET, 40);
      k.blinkHide();
    },
  },
  {
    id: 'plague', name: 'Nube di peste', icon: 'plague', cooldown: 20, mana: 80,
    desc: `Getta davanti a te una nube pestilenziale che ristagna per 8 s e corrode chi vi resta dentro (${PLAGUE_DPS} danni al secondo).`,
    fire(k) {
      k.plague();
      const a = chest(k);
      k.vfx.burst(a.x, a.y + 0.3, a.z, 20, 0.3, { life: 0.6, size: 0.1, color: PLAGUE, hdr: 3, drag: 4 }, 2.5);
    },
  },
  {
    id: 'wisp', name: 'Fuoco fatuo', icon: 'wisp', cooldown: 30, cast: 1.5, mana: 60,
    desc: `Evoca un fuoco fatuo che ti segue per 60 s e rischiara il buio. Mentre si sposta brucia chi sfiora (${WISP_DPS} danni al secondo entro ${WISP_RADIUS} m).`,
    during(k, _p, dt) {
      const p = k.player.pos, f = k.player.facing, v = k.vfx;
      const hx = p.x - Math.sin(f) * 0.5, hz = p.z - Math.cos(f) * 0.5;
      every(50, dt, () => {
        const a = rnd(0, Math.PI * 2), r = rnd(0.5, 0.9);
        v.puff({ x: hx + Math.cos(a) * r, y: p.y + 1.2 + rnd(-0.3, 0.4), z: hz + Math.sin(a) * r, vx: -Math.cos(a) * r * 1.6, vz: -Math.sin(a) * r * 1.6, life: 0.6, size: 0.07, color: WISP, hdr: 2.5 });
      });
    },
    fire(k) {
      const p = k.player.pos, f = k.player.facing, w = k.vfx.wisp;
      w.position.set(p.x - Math.sin(f) * 0.5, p.y + 1.3, p.z - Math.cos(f) * 0.5);
      w.visible = true;
      k.wisp = 60;
      k.vfx.burst(w.position.x, w.position.y, w.position.z, 30, 0.1, { life: 0.8, size: 0.09, color: WISP, hdr: 3, drag: 2.5 }, 2.2);
      k.vfx.pulse(w.position.x, w.position.y, w.position.z, WISP, 35);
    },
    active: (k) => k.wisp > 0,
  },
  {
    id: 'feast', name: 'Banchetto macabro', icon: 'feast', cooldown: 120, channel: { duration: 10, tick: 2 },
    desc: 'Per 10 s ti nutri dei resti e recuperi il 7% della salute ogni 2 s. Muoverti la interrompe.',
    during(k, _p, dt) {
      const p = k.player.pos, v = k.vfx;
      every(40, dt, () => {
        const a = rnd(0, Math.PI * 2), r = rnd(0.5, 0.8), up = rnd(0.6, 1.2);
        // tangential + upward start: the pool's straight-line motion reads as a rising spiral
        v.puff({ x: p.x + Math.cos(a) * r, y: p.y + rnd(0, 0.4), z: p.z + Math.sin(a) * r, vx: -Math.sin(a) * 1.2 - Math.cos(a) * 0.3, vy: up, vz: Math.cos(a) * 1.2 - Math.sin(a) * 0.3, life: 1.2, size: 0.11, color: BLOOD, hdr: 1.8, drag: 0.8 });
      });
    },
    fire(k) {
      const a = chest(k);
      k.vfx.burst(a.x, a.y, a.z, 24, 0.6, { life: 0.8, size: 0.12, color: BLOOD, hdr: 2.6, drag: 2, vy: 1 }, 0.8);
      k.vfx.pulse(a.x, a.y, a.z, BLOOD, 18);
      const h = k.stats.heal(k.stats.hpMax * 0.07);
      k.system.notices.push({ kind: 'heal', text: `+${Math.round(h)}` });
    },
  },
  {
    id: 'will', name: 'Volontà del Risorto', icon: 'will', cooldown: 120, offGcd: true,
    desc: 'Fuori dal tempo di recupero globale. Spezza paura, charme e sonno: la tua volontà è tua.',
    fire(k) {
      const p = k.player.pos;
      k.startWave();
      k.vfx.burst(p.x, p.y + 0.9, p.z, 50, 0.6, { life: 1, size: 0.1, color: VIOLET, hdr: 3, vy: 1.5, drag: 1.5 }, 1.8);
      k.vfx.pulse(p.x, p.y + 1, p.z, VIOLET, 45);
      k.system.notices.push({ kind: 'info', text: 'Immune a paura e charme' });
    },
  },
  {
    id: 'veil', name: 'Velo spettrale', icon: 'veil', cooldown: 30, mana: 50,
    desc: "Per 10 s diventi un'ombra semitrasparente e ti muovi il 30% più veloce. Usare un'altra abilità lo dissolve.",
    fire(k) {
      k.veil = 10;
      k.player.speedMul = 1.3;
      k.setGhost(true);
      const a = chest(k);
      k.vfx.burst(a.x, a.y, a.z, 40, 0.7, { life: 1, size: 0.14, color: GHOST, hdr: 2, drag: 2 }, 1.2);
    },
    active: (k) => k.veil > 0,
  },
  {
    // The main attack: off the GCD so the 1 s recovery is the real swing rate, WoW auto-attack style.
    id: 'fall', name: "Caduta d'ossa", icon: 'fall', cooldown: 1, offGcd: true,
    desc: `Un fendente di schegge d'ossa davanti a te: ${MELEE_DAMAGE} danni a tutti i nemici entro ${num(MELEE_RANGE)} m.`,
    fire(k) {
      const p = k.player.pos, f = k.player.facing, fx = -Math.sin(f), fz = -Math.cos(f), v = k.vfx;
      k.player.attack();
      k.hurt?.((x, z) => {
        const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
        return d < MELEE_RANGE && (d < 0.6 || (dx * fx + dz * fz) / d > MELEE_ARC);
      }, MELEE_DAMAGE);
      // A crescent of bone shards swept right to left, then a puff of grave dust at the tip.
      for (let s = -1; s <= 1; s += 0.08) {
        const g = f - s * 1.1, dx = -Math.sin(g), dz = -Math.cos(g), r = rnd(1.1, MELEE_RANGE - 0.3);
        v.puff({ x: p.x + dx * r, y: p.y + 1 + s * 0.25, z: p.z + dz * r, vx: dx * 2.5, vy: rnd(-0.3, 0.3), vz: dz * 2.5, life: rnd(0.25, 0.4), size: rnd(0.08, 0.13), color: BONE, hdr: 2.2, drag: 5 });
      }
      v.burst(p.x + fx * 1.6, p.y + 0.9, p.z + fz * 1.6, 10, 0.5, smoke(SHADOW, 0.35, 0.5), 0.8);
    },
  },
  {
    id: 'hearth', name: 'Ritorno alla cripta', icon: 'hearth', cooldown: 60, cast: 10,
    desc: 'Lancio di 10 s: un cerchio di rune ti riporta al punto di partenza. Muoverti lo interrompe.',
    during(k, p, dt) {
      const f = k.player.pos, v = k.vfx;
      v.runes.visible = true;
      v.runes.position.set(f.x, f.y + 0.04, f.z);
      v.runes.rotation.y += dt * 0.6;
      v.runes.material.color.setHex(GRAVE).multiplyScalar(0.3 + p * 2.5);
      every(10 + p * 70, dt, () => {
        const a = rnd(0, Math.PI * 2), r = rnd(0.6, 1.4);
        v.puff({ x: f.x + Math.cos(a) * r, y: f.y + 0.1, z: f.z + Math.sin(a) * r, vy: rnd(1, 2.5 + p * 3), life: 1.2, size: 0.07, color: GRAVE, hdr: 2.4 });
      });
      v.column.visible = p > 0.85; // the beam gathers over the last 1.5 s
      v.column.position.set(f.x, f.y, f.z);
      v.column.scale.setScalar(1);
      v.column.material.opacity = (p - 0.85) / 0.15;
    },
    fire(k) {
      const a = chest(k);
      k.vfx.burst(a.x, a.y, a.z, 40, 0.6, { life: 1, size: 0.1, color: GRAVE, hdr: 3, vy: 2, drag: 1.5 }, 2);
      k.player.respawn(k.spawn);
      const b = chest(k);
      k.startColumn(b.x, b.y - 1, b.z);
      k.vfx.burst(b.x, b.y, b.z, 40, 0.6, { life: 1.1, size: 0.1, color: GRAVE, hdr: 3, drag: 1.5 }, 2.5);
      k.vfx.pulse(b.x, b.y + 1, b.z, GRAVE, 40);
    },
    end(k, ok) {
      k.vfx.runes.visible = false;
      if (!ok) k.vfx.column.visible = false;
    },
  },
  {
    id: 'potion', name: 'Fiala di linfa tombale', icon: 'potion', cooldown: 30, offGcd: true,
    desc: 'Fuori dal tempo di recupero globale. Ripristina il 30% della salute e il 30% del mana.',
    fire(k) {
      const s = k.stats, h = s.heal(s.hpMax * 0.3);
      s.restoreMana(s.manaMax * 0.3);
      const a = chest(k);
      k.vfx.burst(a.x, a.y, a.z, 24, 0.4, { life: 0.8, size: 0.09, color: GRAVE, hdr: 2.4, vy: 1.2, drag: 2 }, 1);
      k.system.notices.push({ kind: 'heal', text: `+${Math.round(h)}` });
    },
  },
];

/** Slot order on the bar; 0 - = stay free for later items. */
export const BAR: (string | null)[] = ['fall', 'plague', 'wisp', 'feast', 'will', 'veil', 'step', 'hearth', 'potion', null, null, null];
