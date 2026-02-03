import { test, expect } from '@playwright/test';

test('verify cost sheet changes', async ({ page }) => {
  await page.goto('http://localhost:3000/auth/login');
  await page.fill('input[name="email"]', 'admin@demo.com');
  await page.fill('input[name="password"]', 'demo123');
  await page.click('button[type="submit"]');
  await page.waitForURL('http://localhost:3000/dashboard');

  // Scroll the sidebar to find COSTOS
  const sidebar = page.locator('aside');
  await sidebar.hover();
  await page.mouse.wheel(0, 500);

  // Find and click COSTOS
  const costosLink = page.getByRole('link', { name: /COSTOS/i });
  await costosLink.scrollIntoViewIfNeeded();
  await costosLink.click();

  await page.waitForURL(**/terminal/cost-sheet**);
  await page.waitForSelector('text=FICHA DE COSTOS');

  // Check Annex II
  await page.click('button:has-text("Anexos")');
  await page.click('button:has-text("Anexo II")');

  // Verify Description column in Annex II doesn't have datalist
  const annexIIDescription = page.locator('table >> tr >> td >> input').first();
  const listAttr = await annexIIDescription.getAttribute('list');
  console.log('Annex II Description list attribute:', listAttr);

  // Take screenshot of Annex II
  await page.screenshot({ path: '/home/jules/verification/annex_ii.png', fullPage: true });

  // Check Annex IV suggestions
  await page.click('button:has-text("Anexo IV")');
  await page.screenshot({ path: '/home/jules/verification/annex_iv.png', fullPage: true });

  // Go back to Main Table
  await page.click('button:has-text("Tabla Principal")');
  await page.screenshot({ path: '/home/jules/verification/main_table.png', fullPage: true });
});
