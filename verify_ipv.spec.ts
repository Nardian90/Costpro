import { test, expect } from '@playwright/test';

test('IPV page loads and menu is visible', async ({ page }) => {
  await page.goto('/terminal?tab=ipv');
  // Check for the title
  await expect(page.locator('h1')).toContainText('IPV Builder');
  // Check for some menu items
  await expect(page.getByText('Ejecutar Matching', { exact: true })).toBeVisible();

  // Take a screenshot
  await page.screenshot({ path: 'ipv_dashboard.png' });
});
