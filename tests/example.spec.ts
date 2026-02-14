import { test, expect } from '@playwright/test';

/**
 * Example Playwright test file for XibeCode
 *
 * This demonstrates how to write E2E tests that can be run by the
 * XibeCode agent using the `run_playwright_test` tool.
 *
 * Run with: npx playwright test tests/example.spec.ts
 */

test.describe('Example Tests', () => {
  test('should load a test page', async ({ page }) => {
    // Navigate to Playwright test page
    await page.goto('https://playwright.dev/');

    // Check the title
    await expect(page).toHaveTitle(/Playwright/);
  });

  test('should handle navigation', async ({ page }) => {
    await page.goto('https://playwright.dev/');

    // Click on docs link
    await page.getByRole('link', { name: 'Docs' }).click();

    // Verify navigation
    await expect(page).toHaveURL(/docs/);
  });

  test('should capture screenshots', async ({ page }) => {
    await page.goto('https://playwright.dev/');

    // Take a screenshot
    await page.screenshot({ path: 'test-results/example-screenshot.png' });

    // Verify the page loaded
    await expect(page.locator('body')).toBeVisible();
  });

  test('should measure page load performance', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('https://playwright.dev/');

    const loadTime = Date.now() - startTime;

    // Page should load in reasonable time (5 seconds)
    expect(loadTime).toBeLessThan(5000);

    console.log(`Page loaded in ${loadTime}ms`);
  });

  test('should check for console errors', async ({ page }) => {
    const errors: string[] = [];

    // Listen for console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('https://playwright.dev/');

    // Wait for page to settle
    await page.waitForTimeout(1000);

    // Should have no console errors
    expect(errors).toHaveLength(0);
  });
});
