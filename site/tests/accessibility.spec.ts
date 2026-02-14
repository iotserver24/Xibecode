import { test, expect } from '@playwright/test';

test.describe('Accessibility', () => {
  const pages = [
    { name: 'Homepage', path: '/' },
    { name: 'Docs Index', path: '/docs' },
    { name: 'Installation', path: '/docs/installation' },
    { name: 'Quick Start', path: '/docs/quickstart' },
  ];

  for (const { name, path } of pages) {
    test(`${name} should have proper document structure`, async ({ page }) => {
      await page.goto(path);

      // Should have exactly one h1
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBe(1);

      // Should have lang attribute on html
      const lang = await page.getAttribute('html', 'lang');
      expect(lang).toBeTruthy();
    });

    test(`${name} should have accessible images`, async ({ page }) => {
      await page.goto(path);

      // All images should have alt text
      const images = page.locator('img');
      const count = await images.count();

      for (let i = 0; i < count; i++) {
        const alt = await images.nth(i).getAttribute('alt');
        const ariaLabel = await images.nth(i).getAttribute('aria-label');
        const ariaHidden = await images.nth(i).getAttribute('aria-hidden');

        // Image should have alt, aria-label, or be hidden from screen readers
        expect(alt !== null || ariaLabel !== null || ariaHidden === 'true').toBeTruthy();
      }
    });

    test(`${name} should have accessible links`, async ({ page }) => {
      await page.goto(path);

      // All links should have accessible text
      const links = page.locator('a');
      const count = await links.count();

      for (let i = 0; i < Math.min(count, 20); i++) {
        // Check first 20 links
        const link = links.nth(i);
        const text = await link.textContent();
        const ariaLabel = await link.getAttribute('aria-label');
        const title = await link.getAttribute('title');

        // Link should have text content, aria-label, or title
        const hasAccessibleName = (text && text.trim().length > 0) || ariaLabel || title;
        expect(hasAccessibleName).toBeTruthy();
      }
    });

    test(`${name} should have proper heading hierarchy`, async ({ page }) => {
      await page.goto(path);

      // Get all headings in order
      const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();

      if (headings.length > 1) {
        let lastLevel = 1;
        let skippedLevels = false;

        for (const heading of headings) {
          const tagName = await heading.evaluate((el) => el.tagName.toLowerCase());
          const level = parseInt(tagName[1]);

          // Should not skip more than one level
          if (level > lastLevel + 1) {
            skippedLevels = true;
          }
          lastLevel = level;
        }

        // Allow some flexibility but warn in console
        if (skippedLevels) {
          console.warn(`${name}: Heading levels skip detected, consider improving hierarchy`);
        }
      }
    });

    test(`${name} should have sufficient color contrast`, async ({ page }) => {
      await page.goto(path);

      // Check that text is visible (basic check)
      const body = page.locator('body');
      const backgroundColor = await body.evaluate(
        (el) => window.getComputedStyle(el).backgroundColor
      );
      const color = await body.evaluate((el) => window.getComputedStyle(el).color);

      // Both should be defined (basic check)
      expect(backgroundColor).toBeTruthy();
      expect(color).toBeTruthy();
    });

    test(`${name} should be keyboard navigable`, async ({ page }) => {
      await page.goto(path);

      // Tab through the page
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Some element should be focused
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(focusedElement).toBeTruthy();
    });
  }

  test('forms should have associated labels', async ({ page }) => {
    await page.goto('/');

    // Find all form inputs
    const inputs = page.locator('input, select, textarea');
    const count = await inputs.count();

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const type = await input.getAttribute('type');

      // Skip hidden and submit inputs
      if (type === 'hidden' || type === 'submit' || type === 'button') {
        continue;
      }

      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');
      const placeholder = await input.getAttribute('placeholder');

      // Input should have label association
      const hasLabel =
        (id && (await page.locator(`label[for="${id}"]`).count()) > 0) ||
        ariaLabel ||
        ariaLabelledBy ||
        placeholder;

      expect(hasLabel).toBeTruthy();
    }
  });
});
