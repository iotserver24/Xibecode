import { test, expect } from '@playwright/test';

/**
 * E2E tests for XibeCode WebUI
 */

test.describe('WebUI', () => {
  // Skip if WebUI server is not running
  test.beforeEach(async ({ page }) => {
    test.skip(process.env.SKIP_WEBUI_TESTS === 'true', 'WebUI tests skipped');
  });

  test('should load WebUI homepage', async ({ page }) => {
    // This test requires the WebUI server to be running on port 3847
    await page.goto('http://localhost:3847');

    // Check for XibeCode branding
    await expect(page.locator('h1')).toContainText('XibeCode');
  });

  test('should display project info', async ({ page }) => {
    await page.goto('http://localhost:3847');

    // Wait for project info to load
    await page.waitForSelector('#project-info');

    // Check that project info is displayed
    const projectInfo = page.locator('#project-info');
    await expect(projectInfo).toBeVisible();
  });

  test('should have chat input', async ({ page }) => {
    await page.goto('http://localhost:3847');

    // Check for chat input
    const input = page.locator('#user-input');
    await expect(input).toBeVisible();
    await expect(input).toBeEnabled();
  });

  test('should have tab navigation', async ({ page }) => {
    await page.goto('http://localhost:3847');

    // Check tabs exist
    await expect(page.locator('.tab').first()).toBeVisible();

    // Click on Visual Diff tab
    await page.click('.tab:nth-child(2)');

    // Check that diff panel is visible
    await expect(page.locator('#tab-diff')).toBeVisible();
  });
});
