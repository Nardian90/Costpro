import { test, expect } from '@playwright/test';

test('Verify Hero Mobile Responsiveness', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 });
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  const h1 = page.locator('h1').first();
  await expect(h1).toBeVisible({ timeout: 30000 });

  const overflowX = await page.evaluate(() => document.body.scrollWidth > document.body.clientWidth);
  expect(overflowX).toBe(false);

  const startButton = page.locator('button:has-text("Acceso al Sistema")').first();
  const startBox = await startButton.boundingBox();
  expect(startBox?.height).toBeGreaterThanOrEqual(44);
});
