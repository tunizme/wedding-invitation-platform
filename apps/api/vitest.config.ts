import { defineConfig } from 'vitest/config';

const shared = {
  globals: true,
  setupFiles: ['./test/setup.ts'],
};

export default defineConfig({
  test: {
    projects: [
      { test: { ...shared, name: 'unit', include: ['test/unit/**/*.spec.ts'] } },
      {
        test: {
          ...shared,
          name: 'integration',
          include: ['test/integration/**/*.spec.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
