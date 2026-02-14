import { test, expect } from '@playwright/test';

test.describe('Documentation Pages', () => {
  test('docs index should load correctly', async ({ page }) => {
    await page.goto('/docs');

    // Should have documentation heading
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();

    // Should have links to main sections
    await expect(page.getByRole('link', { name: /installation/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /quick.?start/i })).toBeVisible();
  });

  test('installation page should have setup instructions', async ({ page }) => {
    await page.goto('/docs/installation');

    // Check for heading
    const heading = page.locator('h1');
    await expect(heading).toContainText(/installation/i);

    // Should contain npm install command
    const codeBlocks = page.locator('pre, code');
    const codeText = await codeBlocks.allTextContents();
    const hasInstallCommand = codeText.some(
      (text) => text.includes('npm') || text.includes('pnpm') || text.includes('npx')
    );
    expect(hasInstallCommand).toBeTruthy();
  });

  test('quick start page should have usage examples', async ({ page }) => {
    await page.goto('/docs/quickstart');

    // Check for heading
    const heading = page.locator('h1');
    await expect(heading).toContainText(/quick.?start/i);

    // Should have code examples
    const codeBlocks = page.locator('pre, code');
    const count = await codeBlocks.count();
    expect(count).toBeGreaterThan(0);
  });

  test('agent modes page should list all modes', async ({ page }) => {
    await page.goto('/docs/modes');

    // Check for heading
    const heading = page.locator('h1');
    await expect(heading).toContainText(/modes/i);

    // Should mention key modes
    const pageContent = await page.textContent('body');
    expect(pageContent).toContain('agent');
    expect(pageContent).toContain('plan');
    expect(pageContent).toContain('debugger');
  });

  test('tools page should document available tools', async ({ page }) => {
    await page.goto('/docs/tools');

    // Check for heading
    const heading = page.locator('h1');
    await expect(heading).toContainText(/tools/i);

    // Should mention key tools
    const pageContent = await page.textContent('body');
    expect(pageContent).toContain('read_file');
    expect(pageContent).toContain('write_file');
    expect(pageContent).toContain('run_command');
  });

  test('configuration page should have config options', async ({ page }) => {
    await page.goto('/docs/configuration');

    // Check for heading
    const heading = page.locator('h1');
    await expect(heading).toContainText(/configuration/i);

    // Should have JSON config examples
    const codeBlocks = page.locator('pre, code');
    const count = await codeBlocks.count();
    expect(count).toBeGreaterThan(0);
  });

  test('examples page should have practical examples', async ({ page }) => {
    await page.goto('/docs/examples');

    // Check for heading
    const heading = page.locator('h1');
    await expect(heading).toContainText(/example/i);

    // Should have multiple example sections
    const headings = page.locator('h2, h3');
    const count = await headings.count();
    expect(count).toBeGreaterThan(2);
  });

  test('MCP page should explain MCP integration', async ({ page }) => {
    await page.goto('/docs/mcp');

    // Check for heading
    const heading = page.locator('h1');
    await expect(heading).toContainText(/mcp/i);

    // Should mention Model Context Protocol
    const pageContent = await page.textContent('body');
    expect(pageContent?.toLowerCase()).toContain('model context protocol');
  });

  test('plugins page should have plugin development guide', async ({ page }) => {
    await page.goto('/docs/plugins');

    // Check for heading
    const heading = page.locator('h1');
    await expect(heading).toContainText(/plugin/i);

    // Should have code examples
    const codeBlocks = page.locator('pre, code');
    const count = await codeBlocks.count();
    expect(count).toBeGreaterThan(0);
  });

  test('all doc pages should have proper headings', async ({ page }) => {
    const docPages = [
      '/docs',
      '/docs/installation',
      '/docs/quickstart',
      '/docs/modes',
      '/docs/tools',
      '/docs/configuration',
      '/docs/examples',
      '/docs/mcp',
      '/docs/plugins',
    ];

    for (const pagePath of docPages) {
      await page.goto(pagePath);
      const h1 = page.locator('h1');
      await expect(h1).toBeVisible();
    }
  });
});
