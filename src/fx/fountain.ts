export const NUMBER_LIFE = 0.95;

/** Pixel offsets from the live bar top: a fast spring, a short arc, then a soft fade. */
export function fountain(age: number, lane: number) {
  const t = Math.max(0, Math.min(1, age / NUMBER_LIFE));
  return {
    x: lane * (28 * t + 4 * Math.sin(Math.PI * t)),
    y: -170 * t + 120 * t * t,
    scale: t < 0.12 ? 0.75 + t / 0.12 * 0.35 : 1.1 - 0.15 * (t - 0.12) / 0.88,
    opacity: Math.min(1, (1 - t) / 0.3),
  };
}

/** No corner clamping: a target outside the visible projection has no fallback label. */
export function projectedAnchor(p: { x: number; y: number; z: number }, w: number, h: number) {
  return Number.isFinite(p.x + p.y + p.z) && p.z >= -1 && p.z <= 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1
    ? { x: (p.x + 1) / 2 * w, y: (1 - p.y) / 2 * h } : null;
}
