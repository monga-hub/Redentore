import { CELL, type Discovery } from '../core/discovery.ts';

const FADE = 1.2; // s for a newly seen cell to clear
const FOG = [44, 48, 54]; // rgb of the mist: cool grey, lighter than the lagoon so it reads as cloud, not water

/**
 * The fog drawn over the map charts: one texel per discovery cell, alpha = how fogged it still
 * is, drawn scaled up with smoothing so the edge of what has been seen is a soft cloudy rim.
 * A fresh cell fades out over FADE instead of popping; a little per-cell noise in tone and
 * density gives the mist some texture. The texture is a few thousand texels, repainted only
 * while something is fading.
 */
export class FogLayer {
  private d: Discovery;
  private mask = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private fog: Float32Array; // shown fog per cell, 1 -> 0 as it lifts
  private grain: Uint8Array; // per-cell noise
  private snap = true; // first update: show what was loaded at once, no fade

  constructor(d: Discovery) {
    this.d = d;
    this.mask.width = d.cols;
    this.mask.height = d.rows;
    this.ctx = this.mask.getContext('2d')!;
    this.img = this.ctx.createImageData(d.cols, d.rows);
    this.fog = new Float32Array(d.cells.length).fill(1);
    this.grain = Uint8Array.from(d.cells, () => Math.random() * 255);
    this.paint();
  }

  update(dt: number): void {
    let moved = false;
    const step = this.snap ? 1 : dt / FADE;
    this.snap = false;
    for (let i = 0; i < this.fog.length; i++) {
      if (!this.d.cells[i] || this.fog[i] === 0) continue;
      this.fog[i] = Math.max(0, this.fog[i] - step);
      moved = true;
    }
    if (moved) this.paint();
  }

  private paint(): void {
    const px = this.img.data;
    for (let i = 0; i < this.fog.length; i++) {
      const g = this.grain[i] / 255, f = this.fog[i];
      const o = i * 4, t = (g - 0.5) * 10;
      px[o] = FOG[0] + t;
      px[o + 1] = FOG[1] + t;
      px[o + 2] = FOG[2] + t;
      px[o + 3] = 255 * f * f * (0.95 + 0.05 * g); // eased so the last of it melts away gently
    }
    this.ctx.putImageData(this.img, 0, 0);
  }

  /**
   * Draw the fog onto `c`, whose pixels map to world (x, z) as ((x - ox) * k, (z - oz) * k).
   * Everything beyond the grid is fogged too. `w`, `h`: the area to cover, in `c`'s units.
   */
  draw(c: CanvasRenderingContext2D, ox: number, oz: number, k: number, w: number, h: number): void {
    const x = (this.d.x0 - ox) * k, y = (this.d.z0 - oz) * k, gw = this.d.cols * CELL * k, gh = this.d.rows * CELL * k;
    c.save();
    c.fillStyle = `rgb(${FOG})`;
    c.beginPath();
    c.rect(0, 0, w, h);
    c.rect(x, y, gw, gh);
    c.fill('evenodd');
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(this.mask, x, y, gw, gh);
    c.restore();
  }
}
