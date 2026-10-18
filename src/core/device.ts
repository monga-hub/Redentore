/** A touch-first device: a phone or a tablet, short on memory (iOS reloads a tab past ~1 GB, GPU buffers included). */
export const PHONE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
