import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  // Explicit: Playwright's default would also take Vitest's `*.test.ts` files.
  testMatch: '**/*.spec.ts',
  reporter: 'list',
});
