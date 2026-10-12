import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';
if (!process.env.FRONTEND_TEST_WEB_URL || !process.env.FRONTEND_TEST_SEED)
  throw new Error('Frontend browser tests require runner-owned URL and seed.');
// The runner passes the fixed case inventory as a file: the pattern for every
// story exceeds the Windows command-line limit.
const grepFile = process.env.FRONTEND_TEST_GREP_FILE;
export default defineConfig({
  testDir: './e2e/frontend-foundation',
  testMatch: '**/*.spec.ts',
  ...(grepFile ? { grep: new RegExp(readFileSync(grepFile, 'utf8')) } : {}),
  outputDir: path.join(
    process.env.FRONTEND_TEST_ARTIFACTS ??
      '../../.artifacts/frontend-foundation',
    'results',
  ),
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  ...(process.env.FRONTEND_TEST_DIAGNOSTICS === '1' ||
  process.env.FRONTEND_TEST_FAIL_FAST === '1'
    ? { maxFailures: 1 }
    : {}),
  timeout: 30000,
  expect: { timeout: 8000 },
  reporter: 'list',
  use: {
    ...(process.env.FRONTEND_TEST_BROWSER_WS
      ? { connectOptions: { wsEndpoint: process.env.FRONTEND_TEST_BROWSER_WS } }
      : {}),
    baseURL: process.env.FRONTEND_TEST_WEB_URL,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    // Local debugging only (FRONTEND_TEST_DIAGNOSTICS=1): evidence runs keep
    // traces and screenshots off so no page content lands in reports.
    trace:
      process.env.FRONTEND_TEST_DIAGNOSTICS === '1'
        ? 'retain-on-failure'
        : 'off',
    video: 'off',
    screenshot:
      process.env.FRONTEND_TEST_DIAGNOSTICS === '1' ? 'only-on-failure' : 'off',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
