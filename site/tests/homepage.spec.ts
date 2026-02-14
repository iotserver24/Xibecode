import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the main heading', async ({ page }) => {
    // Check for the main XibeCode title
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).toContainText('XibeCode');
  });

  test('should have a working Get Started button', async ({ page }) => {
    // Look for primary CTA button
    const getStartedButton = page.getByRole('link', { name: /get started|documentation/i });
    await expect(getStartedButton).toBeVisible();

    // Click and verify navigation
    await getStartedButton.click();
    await expect(page).toHaveURL(/\/docs/);
  });

  test('should display feature highlights', async ({ page }) => {
    // Check that feature sections are visible
    const features = page.locator('section, .feature, [class*="feature"]');
    const count = await features.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should have proper page title', async ({ page }) => {
    await expect(page).toHaveTitle(/XibeCode/i);
  });

  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Page should still be functional
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
  });
});
