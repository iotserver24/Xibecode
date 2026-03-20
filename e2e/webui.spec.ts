import { test, expect } from '@playwright/test';

/**
 * E2E tests for XibeCode WebUI
 */

test.describe('WebUI', () => {
  // Skip if WebUI server is not running
  test.beforeEach(() => {
    test.skip(process.env.SKIP_WEBUI_TESTS === 'true', 'WebUI tests skipped');
  });

  test('should load WebUI homepage', async ({ page }) => {
    // This test requires the WebUI server to be running on port 3847.
    await page.goto('http://localhost:3847');

    // Welcome screen heading (React UI)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('XibeCode');
  });

  test('should have chat input', async ({ page }) => {
    await page.goto('http://localhost:3847');

    // Chat input is disabled until the WebSocket connection is established.
    const input = page.getByPlaceholder('Ask a follow-up...');
    await expect(input).toBeVisible();
    await expect(input).toBeEnabled({ timeout: 20000 });
  });
});
