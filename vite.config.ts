import { defineConfig, Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Writes dist/sw.js with a precache list of every built file (offline PWA, no extra deps). */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'hm-sw',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const files: string[] = [];
      const walk = (d: string) => {
        for (const f of readdirSync(d)) {
          const p = join(d, f);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(relative(outDir, p).replace(/\\/g, '/'));
        }
      };
      walk(outDir);
      const assets = files.filter((f) => f !== 'sw.js' && !f.endsWith('.map'));
      const hash = createHash('sha256');
      for (const f of assets) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const src = readFileSync('src/sw-template.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__ASSETS__', JSON.stringify(['./', ...assets.map((a) => './' + a)]));
      writeFileSync(join(outDir, 'sw.js'), src);
    },
  };
}

export default defineConfig({
  base: './',
  // Prefresh (fast refresh) injects window-only HMR code into shared modules, which breaks the AudioWorklet in dev.
  plugins: [preact({ prefreshEnabled: false }), serviceWorker()],
  worker: { format: 'es' },
  build: { target: 'es2020', assetsInlineLimit: 0, sourcemap: false },
  server: { port: 5173 },
});
