import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only run .test.ts files in tests/ directory
    include: ['tests/**/*.test.ts'],
    // Exclude e2e tests (handled by Playwright)
    exclude: ['e2e/**', 'node_modules/**'],
    // Setup file for vitest
    setupFiles: ['tests/setup.ts'],
    // Environment
    environment: 'node',
    // Globals
    globals: true,
  },
});
