import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    alias: {
      'server-only': resolve(import.meta.dirname, 'tests/server-only.ts'),
    },
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    exclude: [
      ...configDefaults.exclude,
      'e2e/**',
      'tests/fixtures/**',
      // Playwright browser suite for 006; runs via playwright.auth-transition.config.ts.
      'tests/auth-transition/**/*.spec.ts',
    ],
  },
});
