import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/content/**/*.test.ts', 'tests/motion/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    maxWorkers: 2,
  },
});
