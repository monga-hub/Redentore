// Boss soak (`npm run soak`; not in `npm run check`: it needs Chrome and plays for minutes). The real
// game, served by Vite, in headless Chrome emulating an iPhone (390×844 at DPR 3, touch), fights the
// Reverendissimo with every ability on the bar, the church's sacerdoti and priests alive, through all
// three acts and the berserk, then down the quality ladder one rung at a time mid-fight (the ultra-light ones too) and back to the
// top, then the kill. It asserts what got the fight's tab killed on iPhones (iOS reloads a tab past its
// memory budget, GPU buffers included): no page errors or lost context, no programs, geometries or
// textures piling up as the fight goes on, the GPU buffers of the phone profile within budget, each rung
// down giving memory back instead of adding a second set on top, and the climb back holding no more than
// the start. A WebGL hook tallies the buffers (bytes the page asks for).
//
//   npm run soak                       ~2 minutes of fight
//   SOAK_SECONDS=600 npm run soak      a longer one
//   SOAK_LEVEL=2 npm run soak           the Governatrice under the Zitelle's dome instead (level 2's bodies, lace and fuso)
//   CHROME=/path/to/chrome npm run soak
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const SECONDS = Number(process.env.SOAK_SECONDS ?? 120);
const LEVEL = Number(process.env.SOAK_LEVEL ?? 1);
const BUDGET = 200; // MB of GPU buffers the phone profile may hold (it held ~380 before the phone tier)
const SLACK = { prog: 4, geo: 12, tex: 4 }; // first uses that may still come late (a loot beam, a death's effects)
const CHROME = process.env.CHROME ?? (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');

let failed = 0;
const fail = (why: string) => { failed++; console.error(`FAIL ${why}`); };

/** In the page before anything else: the bytes of every texture, renderbuffer and buffer the GL context holds. */
function track(): void {
  const live = new Map<object, number>(), unit = new WeakMap<object, { u: number; tex: Record<string, object>; rb?: object; buf: Record<number, object> }>();
  const S = (gl: object) => { let s = unit.get(gl); if (!s) unit.set(gl, (s = { u: 0, tex: {}, buf: {} })); return s; };
  const BPP: Record<number, number> = { 0x881a: 8, 0x8814: 16, 0x81a5: 2, 0x81a6: 4, 0x88f0: 4, 0x8cad: 8, 0x8229: 1, 0x822b: 2, 0x822e: 4, 0x8230: 8, 0x8d62: 2, 0x8056: 2, 0x8051: 3 };
  const bpp = (f: number) => BPP[f] ?? 4;
  const P = WebGL2RenderingContext.prototype as unknown as Record<string, (...a: any[]) => unknown>;
  const wrap = (name: string, f: (gl: object, a: any[]) => void) => { const o = P[name]; P[name] = function (this: object, ...a: any[]) { const r = o.apply(this, a); try { f(this, a); } catch { /* tally only */ } return r; }; };
  const bound = (gl: object, target: number) => S(gl).tex[`${S(gl).u}:${target >= 0x8515 && target <= 0x851a ? 0x8513 : target}`];
  wrap('activeTexture', (gl, [u]) => { S(gl).u = u; });
  wrap('bindTexture', (gl, [t, x]) => { S(gl).tex[`${S(gl).u}:${t}`] = x; });
  wrap('texStorage2D', (gl, [t, lv, f, w, h]) => { const x = bound(gl, t); if (x) live.set(x, w * h * bpp(f) * (lv > 1 ? 4 / 3 : 1) * (t === 0x8513 ? 6 : 1)); });
  wrap('texStorage3D', (gl, [t, lv, f, w, h, d]) => { const x = bound(gl, t); if (x) live.set(x, w * h * d * bpp(f) * (lv > 1 ? 4 / 3 : 1)); });
  wrap('texImage2D', (gl, a) => {
    if (a[1] !== 0) return;
    const x = bound(gl, a[0]), src = a[5], [w, h] = a.length >= 8 ? [a[3], a[4]] : [src.width ?? src.videoWidth, src.height ?? src.videoHeight];
    if (x) live.set(x, w * h * bpp(a[2]) * (a[0] >= 0x8515 && a[0] <= 0x851a ? 6 : 1));
  });
  wrap('deleteTexture', (_gl, [x]) => { live.delete(x); });
  wrap('bindRenderbuffer', (gl, [, x]) => { S(gl).rb = x; });
  wrap('renderbufferStorage', (gl, [, f, w, h]) => { const x = S(gl).rb; if (x) live.set(x, w * h * bpp(f)); });
  wrap('renderbufferStorageMultisample', (gl, [, n, f, w, h]) => { const x = S(gl).rb; if (x) live.set(x, w * h * bpp(f) * Math.max(1, n)); });
  wrap('deleteRenderbuffer', (_gl, [x]) => { live.delete(x); });
  wrap('bindBuffer', (gl, [t, x]) => { S(gl).buf[t] = x; });
  wrap('bufferData', (gl, [t, d]) => { const x = S(gl).buf[t]; if (x) live.set(x, typeof d === 'number' ? d : d.byteLength); });
  wrap('deleteBuffer', (_gl, [x]) => { live.delete(x); });
  const w = window as any;
  w.SOAK = { errors: [] as string[], gpuMB: () => [...live.values()].reduce((s, b) => s + b, 0) / 1048576 };
  addEventListener('error', (e) => w.SOAK.errors.push(`error: ${e.message}`));
  addEventListener('unhandledrejection', (e) => w.SOAK.errors.push(`unhandled rejection: ${e.reason?.stack ?? e.reason}`));
  addEventListener('webglcontextlost', () => w.SOAK.errors.push('WebGL context lost'), true);
}

/** In the page once it has loaded: the church set for the boss, every ability on the bar, a bot that fights him. */
function fight(seconds: number, level: number): void {
  const w = window as any, { quest, priests, zitelle, player, playerStats, levels, kit, targeting, fx } = w;
  const boss = level === 2 ? zitelle.boss : priests.boss, BERSERK = boss.kind.phases.berserk;
  quest.accepted = true;
  quest.takeKey();
  for (const g of quest.gates) if (g.needs === 'key') quest.open(g);
  if (level === 2) { // the Reverendissimo dead, the second quest taken, the Zitelle's back door open
    quest.win(); quest.out = true; quest.report(); quest.accept2(); quest.arrived = true; quest.takeKey2();
    quest.open(quest.gates.find((g: { id: string }) => g.id === 'coro-zitelle'));
  }
  levels.picks.push('plague_dps', 'step', 'veil', 'wisp', 'strike', 'nova', 'ward', 'pyre', 'frost', 'font', 'lance', 'chain', 'toll', 'leap', 'whirl', 'grace', 'charge', 'fx_storm', 'fx_shatter');
  levels.apply();
  player.respawn(level === 2 ? { x: -240, z: -2, yaw: 0 } : { x: 0, z: -28, yaw: 0 });
  const floor = level === 2 ? -1.5 : -27.5; // the dodge stays this side of the hall's door
  const t0 = performance.now(), info = w.fx.renderer.info, samples: object[] = (w.SOAK.samples = []);
  let next = 0, raged = false;
  const RUNGS = [[0.4, 1], [0.48, 2], [0.56, 3], [0.64, 4], [0.72, 5], [0.82, 0]]; // fraction of the fight, rung
  fx.auto = false; // the ladder walked by hand: swiftshader's frame rate would walk it on its own
  fx.setStep(0, 'soak');
  const tick = () => {
    const t = (performance.now() - t0) / 1000;
    if (boss.state === 'dead' && t > seconds) { w.SOAK.done = true; w.SOAK.won = level === 2 ? quest.boss2Dead : quest.bossDead; return; }
    requestAnimationFrame(tick);
    playerStats.hp = playerStats.hpMax; // the fight, not the hero, is under test
    playerStats.mana = playerStats.manaMax;
    if (boss.state !== 'dead') boss.hp = t < seconds ? Math.max(boss.hp, boss.kind.hp * 0.03 + 1) : Math.min(boss.hp, boss.kind.hp * 0.03); // kept up through every act until the end, then brought down (an evade heals him)
    while (RUNGS.length && t > seconds * RUNGS[0][0]) fx.setStep(RUNGS.shift()![1], 'soak');
    if (!raged && t > seconds * 0.3) { raged = true; boss.fight = Math.max(boss.fight, BERSERK - 5); } // the berserk without four minutes of waiting
    if (Math.hypot(boss.x - player.pos.x, boss.z - player.pos.z) > 10) player.respawn({ x: boss.x, z: Math.max(boss.z + 4, floor), yaw: 0 }); // a dash through him (Passo d'ombra) left the hero behind the altar: back in front, before he evades
    const dx = boss.x - player.pos.x, dz = boss.z - player.pos.z, d = Math.hypot(dx, dz) || 1;
    player.facing = Math.atan2(-dx, -dz);
    targeting.target = { kind: targeting.kinds.find((k: { all: object[] }) => k.all.includes(boss)), mob: boss };
    if ((boss.state === 'nova' || boss.marks.length) && player.pos.z - (dz / d) * 0.25 < floor) { player.pos.x -= (dx / d) * 0.25; player.pos.z -= (dz / d) * 0.25; } // dodge: out of the nova, off the brands
    for (let i = 0; i < 12; i++) kit.system.tryCast(i);
    if (t >= next) {
      next = t + 1;
      samples.push({ t, step: fx.step, prog: info.programs.length, geo: info.memory.geometries, tex: info.memory.textures, gpu: w.SOAK.gpuMB(), phase: boss.phase, rage: boss.fight >= BERSERK, state: boss.state, lost: w.fx.renderer.getContext().isContextLost() });
    }
  };
  requestAnimationFrame(tick);
}

// --- the game, served
const server = await createServer({ logLevel: 'error', server: { port: 0 } });
await server.listen();
const url = server.resolvedUrls!.local[0];

// --- Chrome, over the DevTools protocol
const profile = mkdtempSync(join(tmpdir(), 'soak-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise<string>((ok, no) => {
  let err = '';
  chrome.stderr.on('data', (d) => { err += d; const m = err.match(/DevTools listening on (ws:\S+)/); if (m) ok(m[1]); });
  chrome.on('exit', () => no(new Error(`Chrome exited: ${err.slice(-400)}`)));
  chrome.on('error', no);
});
const ws = new WebSocket(wsUrl);
await new Promise((ok) => ws.addEventListener('open', ok, { once: true }));
let ids = 0;
const waiting = new Map<number, { ok: (r: any) => void; no: (e: Error) => void }>();
const events: ((m: any) => void)[] = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(String(e.data));
  if (m.id === undefined) { for (const f of events) f(m); return; }
  const w = waiting.get(m.id)!;
  waiting.delete(m.id);
  if (m.error) w.no(new Error(m.error.message)); else w.ok(m.result);
});
let session: string | undefined;
const send = (method: string, params: object = {}): Promise<any> => new Promise((ok, no) => {
  const id = ++ids;
  waiting.set(id, { ok, no });
  ws.send(JSON.stringify({ id, method, params, sessionId: session }));
});
const evaluate = async (expression: string) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

const pageErrors: string[] = [];
events.push((m) => {
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') pageErrors.push(`console.error: ${m.params.args.map((a: any) => a.value ?? a.description).join(' ')}`);
  if (m.method === 'Inspector.targetCrashed') pageErrors.push('the page crashed');
});

try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  ({ sessionId: session } = await send('Target.attachToTarget', { targetId, flatten: true }));
  await send('Runtime.enable');
  await send('Inspector.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${track})()` });
  await send('Page.navigate', { url });
  const t0 = Date.now();
  while (!(await evaluate('!!(window.priests?.root.children.length && window.friars?.root.children.length && window.bees?.root.children.length && window.player?.model.root.children.length)').catch(() => false))) {
    if (Date.now() - t0 > 180e3) throw new Error('the game never finished loading');
    await sleep(500);
  }
  if (!(await evaluate("matchMedia('(pointer: coarse)').matches"))) fail('the emulated phone is not taken for a phone');
  for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); // skip the intro
  await sleep(3000);
  await evaluate(`(${fight})(${SECONDS}, ${LEVEL})`);
  if (LEVEL === 2) { // level 2's bodies load with its quest
    while (!(await evaluate('window.zitelle.root.children.length > 0'))) { if (Date.now() - t0 > 240e3) throw new Error("level 2's bodies never loaded"); await sleep(500); }
  }
  while (!(await evaluate('!!window.SOAK.done'))) {
    if ((await evaluate('performance.now()')) > (SECONDS + 300) * 1000) throw new Error(`the boss never fell: ${await evaluate("SOAK.samples.filter((x, i, a) => x.state !== a[i - 1]?.state || x.step !== a[i - 1]?.step).map((x) => `${x.t.toFixed(0)}s ${x.state} p${x.phase} r${x.step}`).join(', ')")} (hero ${await evaluate('JSON.stringify(player.pos)')})`);
    await sleep(2000);
  }
  type Sample = { t: number; step: number; prog: number; geo: number; tex: number; gpu: number; phase: number; rage: boolean; state: string; lost: boolean };
  const r: { samples: Sample[]; errors: string[]; won: boolean } = await evaluate('({ samples: SOAK.samples, errors: SOAK.errors, won: SOAK.won })');
  const s = r.samples;

  for (const e of [...pageErrors, ...r.errors]) fail(`page: ${e.slice(0, 300)}`);
  if (s.some((x) => x.lost)) fail('WebGL context lost');
  if (Math.max(...s.map((x) => x.phase)) < 2 || !s.some((x) => x.rage)) fail('the fight never reached the third act and the berserk');
  if (!r.won) fail('the boss fell but the quest missed it');
  // The fight in runs, one per stay on a rung: the top, rungs 1..5 down, the top again.
  const runs: Sample[][] = [];
  for (const x of s) { if (runs.at(-1)?.[0].step !== x.step) runs.push([]); runs.at(-1)!.push(x); }
  if (runs.map((run) => run[0].step).join() !== '0,1,2,3,4,5,0') fail(`the ladder went ${runs.map((run) => run[0].step).join(' -> ')}`);
  // Steady state: past the first seconds' first uses (or a rung's change), nothing piles up on any rung.
  runs.forEach((run, i) => {
    const steady = run.slice(i ? 3 : 8);
    for (const k of ['prog', 'geo', 'tex'] as const) {
      const lo = Math.min(...steady.map((x) => x[k])), hi = Math.max(...steady.map((x) => x[k]));
      if (hi - lo > SLACK[k]) fail(`${k} grew ${lo} -> ${hi} on rung ${run[0].step}`);
    }
  });
  const peak = (run: Sample[] | undefined, k: 'gpu' | 'prog') => Math.max(...(run ?? []).map((x) => x[k]));
  const top = runs[0], gpu = runs.map((run) => peak(run, 'gpu')), prog = runs.map((run) => peak(run, 'prog'));
  if (gpu[0] > BUDGET) fail(`the phone profile holds ${gpu[0].toFixed(0)} MB of GPU buffers, over the ${BUDGET} MB budget`);
  for (let i = 1; i <= 5; i++) {
    if (i === 5 ? gpu[i] > gpu[i - 1] : gpu[i] >= gpu[i - 1]) fail(`rung ${i} kept the buffers of rung ${i - 1}: ${gpu[i - 1].toFixed(0)} -> ${gpu[i].toFixed(0)} MB`); // rung 5 shrinks only the canvas, which the hook doesn't see
    if (prog[i] > prog[0]) fail(`rung ${i} piled up programs: ${prog[0]} -> ${prog[i]}`);
  }
  if (gpu[6] > gpu[0] * 1.02) fail(`back on the top rung the buffers grew: ${gpu[0].toFixed(0)} -> ${gpu[6].toFixed(0)} MB`);
  if (prog[6] > prog[0] + SLACK.prog) fail(`back on the top rung the programs grew: ${prog[0]} -> ${prog[6]}`);
  console.log(`${LEVEL === 2 ? 'Governatrice' : 'boss'} soak: ${s.at(-1)!.t.toFixed(0)} s of fight, phases to ${Math.max(...s.map((x) => x.phase))}, berserk, the kill; GPU by rung ${gpu.map((g) => g.toFixed(0)).join(' -> ')} MB; programs ${prog.join(' -> ')}; top rung ${top.length} s`);
} catch (e) {
  fail(String((e as Error).message));
} finally {
  ws.close();
  await new Promise((ok) => { chrome.once('exit', ok); chrome.kill(); }); // gone before its profile is
  await server.close();
  rmSync(profile, { recursive: true, force: true });
}
if (failed) process.exit(1);
console.log('boss soak ok');
