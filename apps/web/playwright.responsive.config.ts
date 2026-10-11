import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const suites: Record<string, string> = {
  capture: 'responsive-capture.spec.ts',
  smoke: 'responsive-host.spec.ts',
  prototype: 'responsive-prototype.spec.ts',
  renderer: 'responsive-renderer.spec.ts',
  customer: 'responsive-customer.spec.ts',
  publication: 'responsive-publication.spec.ts',
  authoring: 'responsive-authoring.spec.ts',
};
const suite = process.env.RESPONSIVE_SUITE;
if (!suite || !suites[suite] || !process.env.RESPONSIVE_HOST_URL)
  throw new Error(
    'Use the responsive runner with an owned URL and supported suite.',
  );
export default defineConfig({
  testDir: './e2e/invitation-builder',
  testMatch: suites[suite],
  outputDir: resolve(
    process.env.RESPONSIVE_ARTIFACTS ?? '../../.artifacts/responsive/browser',
    'results',
  ),
  fullyParallel: false,
  forbidOnly: true,
  workers: 1,
  retries: 0,
  timeout: 30000,
  expect: { timeout: 8000 },
  reporter: 'list',
  use: {
    actionTimeout: 15000,
    baseURL: process.env.RESPONSIVE_HOST_URL,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    serviceWorkers: 'block',
    ...(process.env.RESPONSIVE_BROWSER_WS
      ? { connectOptions: { wsEndpoint: process.env.RESPONSIVE_BROWSER_WS } }
      : {}),
  },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'firefox', use: devices['Desktop Firefox'] },
    { name: 'webkit', use: devices['Desktop Safari'] },
  ],
});
