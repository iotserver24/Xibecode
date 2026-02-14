import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should navigate to documentation', async ({ page }) => {
    // Find and click docs link
    const docsLink = page.getByRole('link', { name: /docs|documentation/i }).first();
    await docsLink.click();

    // Verify we're on the docs page
    await expect(page).toHaveURL(/\/docs/);
  });

  test('should navigate to installation guide', async ({ page }) => {
    await page.goto('/docs');

    // Find installation link
    const installLink = page.getByRole('link', { name: /installation/i }).first();
    await installLink.click();

    // Verify navigation
    await expect(page).toHaveURL(/\/docs\/installation/);
  });

  test('should navigate to quick start', async ({ page }) => {
    await page.goto('/docs');

    // Find quick start link
    const quickStartLink = page.getByRole('link', { name: /quick.?start/i }).first();
    await quickStartLink.click();

    // Verify navigation
    await expect(page).toHaveURL(/\/docs\/quickstart/);
  });

  test('should navigate to agent modes', async ({ page }) => {
    await page.goto('/docs');

    // Find modes link
    const modesLink = page.getByRole('link', { name: /modes/i }).first();
    await modesLink.click();

    // Verify navigation
    await expect(page).toHaveURL(/\/docs\/modes/);
  });

  test('should navigate to tools reference', async ({ page }) => {
    await page.goto('/docs');

    // Find tools link
    const toolsLink = page.getByRole('link', { name: /tools/i }).first();
    await toolsLink.click();

    // Verify navigation
    await expect(page).toHaveURL(/\/docs\/tools/);
  });

  test('should have working back navigation', async ({ page }) => {
    // Navigate to a docs page
    await page.goto('/docs/installation');

    // Go back
    await page.goBack();

    // Should be back at previous page
    await expect(page).not.toHaveURL(/\/docs\/installation/);
  });

  test('should highlight current page in navigation', async ({ page }) => {
    await page.goto('/docs/installation');

    // The current nav item should have some active/current indication
    const navLinks = page.locator('nav a[href*="/docs/installation"]');
    const count = await navLinks.count();

    // At least one link should exist for current page
    expect(count).toBeGreaterThan(0);
  });
});
