/** Startup version check. GitHub Pages serves index.html with max-age=600 and phones hold on to it far
 * longer, so a player can boot an old bundle. vite.config.ts bakes __BUILD__ into the bundle and
 * publishes the same object as version.json; if the deployed one is newer we reload once onto a
 * cache-busting URL, and if that still lands on the old build we ask instead of looping. */
declare const __BUILD__: { sha: string; time: number };
type Build = typeof __BUILD__;

const RELOADED = 'version-reloaded-for';

async function remote(): Promise<Build | undefined> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return undefined;
    const b = (await res.json()) as Build;
    return typeof b.time === 'number' ? b : undefined;
  } catch {
    return undefined; // offline or slow network: play what we have
  }
}

/** Drop Cache Storage and any service worker (none today, but one left by an old deploy would pin it), then reload past the HTTP cache. */
async function hardReload(b: Build): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    if ('caches' in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch { /* best effort: the URL below still bypasses the HTTP cache */ }
  const url = new URL(location.href);
  url.searchParams.set('v', `${b.sha}-${b.time}`); // new URL, so neither browser nor CDN has it cached
  location.replace(url);
}

function offerReload(b: Build): void {
  if (document.getElementById('update')) return;
  const el = document.createElement('div');
  el.id = 'update';
  el.innerHTML = '<span>È disponibile una nuova versione</span><button type="button">Ricarica</button>';
  el.querySelector('button')!.onclick = () => void hardReload(b);
  document.body.appendChild(el);
}

/** Resolves once the game may start; never resolves when it is reloading onto a newer build. */
export async function checkVersion(): Promise<void> {
  const label = document.createElement('div');
  label.id = 'version';
  label.textContent = `v ${__BUILD__.sha} · ${new Date(__BUILD__.time).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}`;
  document.body.appendChild(label);
  console.info(`Redentore Dungeon build ${__BUILD__.sha} (${new Date(__BUILD__.time).toISOString()})`);
  if (import.meta.env.DEV) return; // the dev server has no version.json

  // Back from a tab left open for days: ask, never reload mid-fight.
  addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    const b = await remote();
    if (b && b.time > __BUILD__.time) offerReload(b);
  });

  const b = await remote();
  if (!b || b.time <= __BUILD__.time) return; // up to date (or a CDN edge still on the old version.json)
  let tried = false;
  try {
    tried = sessionStorage.getItem(RELOADED) === String(b.time);
    sessionStorage.setItem(RELOADED, String(b.time));
  } catch { tried = true; } // no storage, no loop guard: ask instead of reloading
  if (tried) return offerReload(b);
  await hardReload(b);
  return new Promise(() => {}); // page is navigating away
}
