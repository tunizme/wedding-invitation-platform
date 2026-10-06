import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const artifacts = process.env.BUILDER_TEST_ARTIFACTS
  ? path.resolve(process.env.BUILDER_TEST_ARTIFACTS)
  : path.resolve('../../.artifacts/builder/browser');

export default defineConfig({
  testDir: './e2e/invitation-builder',
  outputDir: path.join(artifacts, 'results'),
  snapshotPathTemplate: path.join(
    artifacts,
    'snapshots',
    '{projectName}',
    '{testFilePath}',
    '{arg}{ext}',
  ),
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  maxFailures: 1,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(artifacts, 'results.json') }],
  ],
  use: {
    baseURL: process.env.BUILDER_TEST_WEB_URL,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    reducedMotion: 'reduce',
    trace: 'off',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
    ...(process.env.BUILDER_TEST_BROWSER_WS
      ? { connectOptions: { wsEndpoint: process.env.BUILDER_TEST_BROWSER_WS } }
      : {}),
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
