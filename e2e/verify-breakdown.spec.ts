import { test, expect } from '@playwright/test';

test('Verify Reset and Randomize buttons in Transaction Breakdown', async ({ page }) => {
  // 1. Navigate to login
  await page.goto('http://localhost:3000/login');

  // 2. Click the demo admin button
  await page.click('text=admin@demo.com');

  // 3. Wait for navigation to dashboard
  await expect(page).toHaveURL('http://localhost:3000/', { timeout: 15000 });

  // 4. Navigate to IPV Builder from sidebar
  await page.click('text=IPV Builder');

  // 5. Wait for IPV Builder content to be visible
  await expect(page.locator('h1:has-text("IPV Builder")')).toBeVisible({ timeout: 15000 });

  // 6. Navigate to Breakdown section
  // Clicking the card in the dashboard
  // Using a more specific selector for the card
  await page.click('h3:has-text("Desglose")');

  // 7. Verify we are in the Breakdown tab
  // TransactionBreakdown.tsx has a heading "Análisis de Desglose"
  await expect(page.locator('h3:has-text("Análisis de Desglose")')).toBeVisible({ timeout: 15000 });

  // 8. Check for the new buttons
  const resetBtn = page.locator('button:has-text("Reset Efectivo")');
  const randomizeBtn = page.locator('button:has-text("Reacomodar Fechas")');

  await expect(resetBtn).toBeVisible();
  await expect(randomizeBtn).toBeVisible();

  await page.screenshot({ path: 'breakdown-verify.png', fullPage: true });
});
