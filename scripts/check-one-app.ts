// One-app check (`npm run check`): Redentore runs inside the installable Mongames hub app, so it ships no web app
// manifest of its own, and its update path only unregisters service workers and caches that are its own.
import { existsSync, readFileSync } from 'node:fs';
import { ownCache, ownScope } from '../src/ui/version.ts';

const fail = (why: string) => { throw new Error(why); };
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
if (/rel=["']?manifest/i.test(html)) fail('index.html links a web app manifest');
if (/apple-mobile-web-app-capable|name=["']mobile-web-app-capable/i.test(html)) fail('index.html marks itself a standalone app');
if (existsSync(new URL('../public/manifest.webmanifest', import.meta.url))) fail('public/ ships a manifest');

const root = 'https://monga-hub.github.io/Redentore/';
if (!ownScope('https://monga-hub.github.io/Redentore/', root) || !ownScope('https://monga-hub.github.io/Redentore/sub/', root)) fail('own scope not matched');
if (ownScope('https://monga-hub.github.io/', root) || ownScope('https://monga-hub.github.io/Other/', root)) fail('hub or sibling scope matched');
if (ownScope('https://monga-hub.github.io/RedentoreX/', root)) fail('look-alike scope matched');
if (!ownCache('redentore-v1') || ownCache('mongames-v1') || ownCache('workbox-precache')) fail('cache filter wrong');
console.log('one app ok: no manifest, update touches only /Redentore/ workers and redentore caches');
