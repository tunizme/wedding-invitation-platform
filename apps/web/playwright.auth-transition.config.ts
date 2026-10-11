import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// Playwright AI failure snapshots include entered passwords. Keep failures
// textual and let the evidence reporter retain only case/status metadata.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';

/**
 * Feature 006 IAM browser suite (quickstart B1–B15, A5).
 * Every test gets a fresh browser context (empty cookie jar and IndexedDB).
 * No trace, HAR, video or screenshots: artifacts must never hold cookies,
 * tokens or proofs.
 */
const artifacts = process.env.AUTH_TRANSITION_ARTIFACTS
  ? path.resolve(process.env.AUTH_TRANSITION_ARTIFACTS)
  : path.resolve('../../.artifacts/auth-transition/browser');

/** Removes navigator.locks before any page script runs (FR-008 variant). */
const disableWebLocks = `Object.defineProperty(Navigator.prototype, 'locks', { get: () => undefined, configurable: true });`;

export default defineConfig({
  testDir: './tests/auth-transition',
  testMatch: '**/*.spec.ts',
  outputDir: path.join(artifacts, 'results'),
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  maxFailures: process.env.AUTH_TRANSITION_FAIL_FAST === '1' ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(artifacts, 'results.json') }],
  ],
  use: {
    ...(process.env.AUTH_TRANSITION_BROWSER_WS
      ? {
          connectOptions: {
            wsEndpoint: process.env.AUTH_TRANSITION_BROWSER_WS,
          },
        }
      : {}),
    baseURL: process.env.AUTH_TRANSITION_WEB_URL,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    {
      name: 'chromium-no-web-locks',
      use: { ...devices['Desktop Chrome'] },
      metadata: { initScript: disableWebLocks },
    },
  ],
});

export { disableWebLocks };
