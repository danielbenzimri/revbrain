import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load test environment variables from .env.test
dotenv.config({ path: path.resolve(__dirname, '.env.test') });

/**
 * Playwright Configuration
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',

  // Global teardown - cleanup test data after all tests
  globalTeardown: './e2e/global-teardown.ts',

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry flaky tests (login race conditions can cause intermittent failures)
  retries: process.env.CI ? 2 : 1,

  // Limit parallel workers to avoid login race conditions
  // All tests share the same credentials, so too many parallel logins can fail
  workers: process.env.CI ? 1 : 4,

  // Reporter to use
  reporter: [['html', { open: 'never' }], ['list']],

  // Shared settings for all projects
  use: {
    // Base URL for navigation
    baseURL: 'http://localhost:5173',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'performance',
      testMatch: /performance\.spec\.ts/,
      retries: 0, // Flaky perf = real signal, don't retry
      use: {
        ...devices['Desktop Chrome'],
        screenshot: 'off',
        video: 'off',
        trace: 'off',
        launchOptions: {
          args: [
            '--disable-extensions',
            '--disable-background-networking',
            '--enable-precise-memory-info', // Required for performance.memory API
          ],
        },
      },
    },
  ],

  // Run your local dev server before starting the tests
  webServer: {
    command: 'pnpm --filter client dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
