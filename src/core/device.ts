/** A touch-first device: a phone or a tablet, short on memory (iOS reloads a tab past ~1 GB, GPU buffers included). */
export const PHONE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

// Mobile GPUs known to choke on the full look at a phone's resolution, by the renderer string Chrome on Android gives
// (bare, "Mali-G52 MC2", or through ANGLE, "ANGLE (ARM, Mali-G52 MC2, OpenGL ES 3.2)"). Safari says "Apple GPU": never weak.
// ponytail: a short list of families; fx/atmosphere.ts's boot test catches what it misses.
const CRAWL = /Mali-(4\d\d|T\d|G31|G51|G52)\b|Adreno \(TM\) ([34]\d\d|50\d)\b|PowerVR (SGX|Rogue GE)|Vivante|VideoCore/i; // budget and old: ultra-light
const SLOW = /Mali-(G57|G68|G71|G72)\b|Adreno \(TM\) (5[1-4]\d|61\d)\b|PowerVR|IMG BXM/i; // older and lower mid-range: no post chain

/**
 * How weak this phone looks before a frame is timed, from the GPU's name and, on Android (Safari reports no
 * `deviceMemory`), little memory or few cores: 0 fine, 1 weak (older and budget Samsungs and the like), 2 very weak.
 * fx/atmosphere.ts starts the boot test on a lighter rung for each.
 */
export function weakness(gl: WebGLRenderingContext | WebGL2RenderingContext): { level: 0 | 1 | 2; gpu: string } {
  let gpu = '';
  try { gpu = String(gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)); } catch { /* unnamed: the other hints */ }
  const mem = (navigator as { deviceMemory?: number }).deviceMemory;
  if (!PHONE) return { level: 0, gpu };
  if (CRAWL.test(gpu)) return { level: 2, gpu };
  return { level: SLOW.test(gpu) || (mem !== undefined && (mem <= 4 || navigator.hardwareConcurrency <= 4)) ? 1 : 0, gpu };
}
