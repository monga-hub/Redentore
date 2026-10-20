/** A touch-first device: a phone or a tablet, short on memory (iOS reloads a tab past ~1 GB, GPU buffers included). */
export const PHONE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/**
 * A phone with little memory, Android only (Safari reports no `deviceMemory`, so iPhones never are):
 * older and budget Samsungs and the like. fx/atmosphere.ts starts it without the post chain.
 */
export const WEAK = PHONE && ((navigator as { deviceMemory?: number }).deviceMemory ?? Infinity) <= 4;
