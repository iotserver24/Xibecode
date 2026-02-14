import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Test Configuration for XibeCode Documentation Site
 *
 * Run E2E tests against the documentation site:
 * - Homepage tests
 * - Navigation tests
 * - Documentation page tests
 * - Responsive design tests
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // Directory containing test files
  testDir: './tests',

  // Run tests in parallel
  fullyParallel: true,

  // Fail on CI if test.only is left in code
  forbidOnly: !!process.env.CI,

  // Retry on CI
  retries: process.env.CI ? 2 : 0,

  // Workers
  workers: process.env.CI ? 1 : undefined,

  // Reporter
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],

  // Shared settings
  use: {
    // Base URL for the site
    baseURL: 'http://localhost:3000',

    // Collect trace on retry
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',
  },

  // Browser projects
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // Mobile
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'] },
    },
  ],

  // Timeout
  timeout: 30000,

  // Output directory
  outputDir: 'test-results/',

  // Start dev server before tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
