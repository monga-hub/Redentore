// Fog of war: which parts of the map the player has seen. A coarse grid over the level's named
// areas (plus a wide margin of lagoon, so the map never shows an edge), one byte per cell; cells
// within sight of the player become seen and stay seen. Plain data, no DOM: saves carry it as a
// compact base64 bitset and `npm run check` drives it in Node.

export const CELL = 3; // m per cell
export const SIGHT = 16; // m: how far around the player the fog lifts
const MARGIN = 40; // m of open water around the areas, as the minimap's chart has

interface Rect { x0: number; x1: number; z0: number; z1: number }

export class Discovery {
  readonly x0: number; // world x/z of the grid's north-west corner
  readonly z0: number;
  readonly cols: number;
  readonly rows: number;
  readonly cells: Uint8Array; // 1 = seen, row-major from the north-west
  private last = -1; // cell the player stood in at the last reveal: standing still costs nothing

  /** `areas`: the level's named areas; the grid covers them all. */
  constructor(areas: readonly Rect[]) {
    const x0 = Math.min(...areas.map((a) => a.x0)) - MARGIN, x1 = Math.max(...areas.map((a) => a.x1)) + MARGIN;
    const z0 = Math.min(...areas.map((a) => a.z0)) - MARGIN, z1 = Math.max(...areas.map((a) => a.z1)) + MARGIN;
    this.x0 = Math.floor(x0 / CELL) * CELL;
    this.z0 = Math.floor(z0 / CELL) * CELL;
    this.cols = Math.ceil((x1 - this.x0) / CELL);
    this.rows = Math.ceil((z1 - this.z0) / CELL);
    this.cells = new Uint8Array(this.cols * this.rows);
  }

  /** Index of the cell holding (x, z), or -1 off the grid. */
  index(x: number, z: number): number {
    const c = Math.floor((x - this.x0) / CELL), r = Math.floor((z - this.z0) / CELL);
    return c < 0 || r < 0 || c >= this.cols || r >= this.rows ? -1 : r * this.cols + c;
  }

  seen(x: number, z: number): boolean {
    return this.cells[this.index(x, z)] === 1;
  }

  /** Lift the fog within `r` m of (x, z). True when any cell was seen for the first time. */
  reveal(x: number, z: number, r = SIGHT): boolean {
    const here = this.index(x, z);
    if (here === this.last) return false;
    this.last = here;
    let fresh = false;
    const c0 = Math.max(0, Math.floor((x - r - this.x0) / CELL)), c1 = Math.min(this.cols - 1, Math.floor((x + r - this.x0) / CELL));
    const r0 = Math.max(0, Math.floor((z - r - this.z0) / CELL)), r1 = Math.min(this.rows - 1, Math.floor((z + r - this.z0) / CELL));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const i = row * this.cols + col;
        if (this.cells[i]) continue;
        // a cell counts as in sight when its centre is
        if (Math.hypot(this.x0 + (col + 0.5) * CELL - x, this.z0 + (row + 0.5) * CELL - z) > r) continue;
        this.cells[i] = 1;
        fresh = true;
      }
    }
    return fresh;
  }

  /** An area is discovered once its middle has been seen, or a good share of it (long thin ones walked along an edge). */
  discovered(a: Rect): boolean {
    if (this.seen((a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2)) return true;
    let seen = 0, all = 0;
    for (let z = a.z0 + CELL / 2; z < a.z1; z += CELL) {
      for (let x = a.x0 + CELL / 2; x < a.x1; x += CELL) { all++; if (this.seen(x, z)) seen++; }
    }
    return all > 0 && seen >= all * 0.4;
  }

  /** `<cols>x<rows>:<base64 bitset>`. */
  encode(): string {
    const bits = new Uint8Array(Math.ceil(this.cells.length / 8));
    this.cells.forEach((v, i) => { if (v) bits[i >> 3] |= 1 << (i & 7); });
    let bin = '';
    for (const b of bits) bin += String.fromCharCode(b);
    return `${this.cols}x${this.rows}:${btoa(bin)}`;
  }

  /** Restore an `encode`d grid. False (and nothing changed) when it is junk or from a level of another size. */
  decode(s: string): boolean {
    const m = /^(\d+)x(\d+):([A-Za-z0-9+/=]*)$/.exec(s);
    if (!m || +m[1] !== this.cols || +m[2] !== this.rows) return false;
    let bin: string;
    try { bin = atob(m[3]); } catch { return false; }
    if (bin.length !== Math.ceil(this.cells.length / 8)) return false;
    this.cells.forEach((_, i) => { this.cells[i] = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1; });
    this.last = -1;
    return true;
  }
}
