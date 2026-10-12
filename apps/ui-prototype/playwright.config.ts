import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:3300',
    browserName: 'chromium',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
  reporter: [['list']],
  outputDir: '../../.artifacts/ui-prototype/test-results',
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:3300',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
