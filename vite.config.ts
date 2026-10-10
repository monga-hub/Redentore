import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

// Build id baked into the bundle (__BUILD__) and published as version.json next to index.html;
// src/ui/version.ts compares the two at startup to catch a phone running a cached old build.
function sha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}
const BUILD = { sha: sha(), time: Date.now() };

// GitHub Pages project site: https://monga-hub.github.io/Redentore/
export default defineConfig({
  base: '/Redentore/',
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [{
    name: 'version-json',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(BUILD) });
    },
  }],
});
