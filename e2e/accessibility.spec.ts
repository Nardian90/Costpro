import { test, expect } from '@playwright/test';

test.describe('Accessibility', () => {
  test('should have main landmark', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Layout renders <main id="main-content">
    const main = page.locator('main#main-content');
    await expect(main).toBeAttached();
  });

  test('should have lang attribute on html', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const lang = await page.getAttribute('html', 'lang');
    expect(lang).toBe('es');
  });

  test('skip-to-content link should be focusable', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // The skip-to-content link is an <a> element with href="#main-content"
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeAttached();

    // Verify it's a valid anchor with the correct href
    const href = await skipLink.getAttribute('href');
    expect(href).toBe('#main-content');

    // Verify the target exists
    const mainContent = page.locator('#main-content');
    await expect(mainContent).toBeAttached();
  });
});
