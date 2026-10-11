import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'test/fixtures/invitation-builder/responsive-browser-seed.spec.ts',
    ],
    setupFiles: ['test/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    passWithNoTests: false,
  },
});
