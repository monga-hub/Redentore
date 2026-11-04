/** Pointer ownership only: inventory transactions and drop targets belong to BagPanel. */
export class BagDrag {
  private gesture?: { id: number; cell: HTMLElement; x: number; y: number; active: boolean; moved: boolean; timer: number };
  private ghost?: HTMLElement;
  private suppressUntil = 0;

  private readonly host: HTMLElement;
  private readonly enabled: () => boolean;
  private readonly start: (cell: HTMLElement) => boolean;
  private readonly drop: (target: Element | null) => void;

  constructor(host: HTMLElement, enabled: () => boolean,
    start: (cell: HTMLElement) => boolean, drop: (target: Element | null) => void) {
    this.host = host;
    this.enabled = enabled;
    this.start = start;
    this.drop = drop;
    host.addEventListener('pointerdown', e => {
      if (this.gesture) { this.cancel(); return; }
      const cell = (e.target as Element).closest<HTMLElement>('[data-k^="b:"]');
      if (!cell || !e.isPrimary || e.button !== 0 || !enabled()) return;
      const g = { id: e.pointerId, cell, x: e.clientX, y: e.clientY, active: false, moved: false, timer: 0 };
      this.gesture = g;
      if (e.pointerType !== 'mouse') g.timer = window.setTimeout(() => this.activate(), 400);
    });
    host.addEventListener('pointermove', e => {
      const g = this.gesture;
      if (!g || e.pointerId !== g.id) return;
      const moved = Math.hypot(e.clientX - g.x, e.clientY - g.y) > 8;
      if (!g.active && moved) {
        if (e.pointerType === 'mouse') this.activate();
        else { this.cancel(); return; } // movement before the hold belongs to native scrolling
      }
      if (!g.active) return;
      g.moved ||= moved;
      e.preventDefault();
      this.position(e.clientX, e.clientY);
    });
    host.addEventListener('pointerup', e => {
      const g = this.gesture;
      if (!g || e.pointerId !== g.id) return;
      const commit = g.active && g.moved && enabled();
      const target = commit ? document.elementFromPoint(e.clientX, e.clientY) : null;
      this.cancel();
      if (commit) { e.preventDefault(); this.drop(target); }
    });
    host.addEventListener('pointercancel', () => this.cancel());
    host.addEventListener('lostpointercapture', () => this.cancel());
    // Keep native scroll before the hold; after it, prevent the browser taking over the drag.
    host.addEventListener('touchmove', e => { if (this.gesture?.active) e.preventDefault(); }, { passive: false });
    host.addEventListener('contextmenu', e => { if (this.gesture) e.preventDefault(); });
    host.addEventListener('dragstart', e => e.preventDefault());
    host.addEventListener('click', e => {
      if (e.detail && performance.now() < this.suppressUntil) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    addEventListener('blur', () => this.cancel());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.cancel(); });
  }

  get active(): boolean { return !!this.gesture?.active; }

  cancel(): void {
    const g = this.gesture;
    this.gesture = undefined;
    if (!g) return;
    clearTimeout(g.timer);
    if (g.active) this.suppressUntil = performance.now() + 500;
    this.ghost?.remove();
    this.ghost = undefined;
    if (g.cell.hasPointerCapture(g.id)) g.cell.releasePointerCapture(g.id);
  }

  private activate(): void {
    const g = this.gesture;
    if (!g || !g.cell.isConnected || !this.enabled() || !this.start(g.cell)) return this.cancel();
    g.active = true;
    g.cell.setPointerCapture(g.id);
    const rect = g.cell.getBoundingClientRect();
    this.ghost = g.cell.cloneNode(true) as HTMLElement;
    this.ghost.removeAttribute('data-k');
    this.ghost.removeAttribute('data-bag-index');
    this.ghost.tabIndex = -1;
    this.ghost.setAttribute('aria-hidden', 'true');
    this.ghost.classList.add('drag-ghost');
    this.ghost.style.width = `${rect.width}px`;
    this.ghost.style.height = `${rect.height}px`;
    this.host.append(this.ghost);
    this.position(g.x, g.y);
  }

  private position(x: number, y: number): void {
    if (this.ghost) { this.ghost.style.left = `${x}px`; this.ghost.style.top = `${y}px`; }
  }
}
