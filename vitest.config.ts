import { defineConfig } from 'vitest/config';

// Unit checks only: Vitest's default include would also take Playwright's `*.spec.ts` files. Stylesheets
// are processed, not blanked, so a check can read one's text (`?raw`).
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], css: { include: [/\.css(?:$|\?)/] } },
});
