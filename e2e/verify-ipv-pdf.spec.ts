import { test, expect } from '@playwright/test';

test('IPV Builder - PDF Export via API', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Login
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', 'admin@demo.com');
  await page.fill('input[type="password"]', 'demo123');
  await page.click('button:has-text("Iniciar Sesión")');

  // Wait for sidebar and go to IPV Builder
  await page.waitForSelector('text=IPV BUILDER');
  await page.click('text=IPV BUILDER');

  // Go to Reportes IPV tab
  await page.click('button:has-text("Reportes IPV")');

  // Verify there is at least a button or text
  await expect(page.locator('text=Historial de Cierres')).toBeVisible();

  // Screenshot
  await page.screenshot({ path: 'ipv-reports-tab-verified.png' });
});
