import { crx } from '@crxjs/vite-plugin';
import { defineConfig } from 'vite';
import manifest from './manifest.config.ts';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // The what's-new page, which no manifest key names; the plugin adds the manifest's pages beside it.
    rolldownOptions: { input: { 'whats-new': 'whats-new.html' } },
    // Chrome preloads modules itself; Vite's polyfill for browsers that cannot would ship a `fetch` call (R6).
    modulePreload: { polyfill: false },
  },
});
