import { defineConfig } from 'vitest/config';

// Unit checks only: Vitest's default include would also take Playwright's `*.spec.ts` files.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
