import { test, expect } from '@playwright/test';

test('IPV Simulation UI check', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'admin@demo.com');
  await page.fill('input[type="password"]', 'demo123');
  await page.click('button[type="submit"]');

  // Wait for navigation
  await page.waitForSelector('text=Panel de Control', { timeout: 15000 });

  // Navigate to IPV Builder
  await page.click('text=IPV Builder');

  // Once in IPV, go to Simulacion
  await page.click('button:has-text("SIMULACIÓN")');

  // Check for the new reset button in Global Goal card
  await page.waitForSelector('text=Objetivo Global (Mes)');

  // Scroll down to see the simulation cards
  await page.evaluate(() => window.scrollTo(0, 500));

  // There should be two RotateCcw icons now, one in Unitaria and one in Global
  const rotateIcons = page.locator('.lucide-rotate-ccw');
  await expect(rotateIcons).toHaveCount(2);

  // Check for the "Distribuir y Aplicar" button
  await expect(page.locator('button:has-text("Distribuir y Aplicar")')).toBeVisible();

  await page.screenshot({ path: 'ipv_verification_scrolled.png' });
});
