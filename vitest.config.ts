import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // Bound memory and avoid Windows child-process startup/teardown stalls.
    pool: 'threads',
    maxWorkers: 2,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['dist/**', 'e2e/**'],
    },
  },
});
