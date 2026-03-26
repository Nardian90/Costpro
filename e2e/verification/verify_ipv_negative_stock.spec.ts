import { test, expect } from '@playwright/test';

test('Verify IPV negative stock card and collapsible functionality', async ({ page }) => {
  // Use the login flow from capture_ipv.spec.ts
  await page.goto('http://localhost:3000');

  // Login (adjusting if necessary to skip if already logged in or use demo creds)
  try {
      const loginButton = page.getByRole('button', { name: /ACCESO/i });
      if (await loginButton.isVisible()) {
          await loginButton.click();
          await page.fill('input[type="email"], input[name="email"]', 'admin');
          await page.fill('input[type="password"]', 'demo1234');
          await page.click('button:has-text("ENTRAR"), button:has-text("Acceso")');
      }
  } catch (e) {
      console.log("Already logged in or login failed, continuing...");
  }

  // Navigate to IPV (assuming /terminal/ipv or similar)
  // Let's try direct navigation if possible, otherwise use the module clicks
  await page.goto('http://localhost:3000/terminal'); // Base terminal path

  // Wait for the IPVView to load (it might be the default tab or we might need to click it)
  // Based on capture_ipv.spec.ts, we look for h1:has-text("IPV")
  await page.waitForSelector('h1:has-text("IPV")', { timeout: 15000 });

  // Initially cards should be collapsed (not visible)
  const statsGrid = page.locator('.grid.lg\\:grid-cols-6');
  await expect(statsGrid).not.toBeVisible();

  // Check the expand button exists and click it
  const expandBtn = page.getByRole('button', { name: /Ver Detalles/i });
  await expect(expandBtn).toBeVisible();

  await page.screenshot({ path: 'verification/ipv_collapsed.png' });

  await expandBtn.click();

  // Now the stats grid should be visible
  await expect(statsGrid).toBeVisible();
  await page.screenshot({ path: 'verification/ipv_expanded.png' });

  // Verify the "Stock Negativo" card exists if there's negative stock
  // Since we might not have negative stock in the demo data, we might not see it.
  // But we can check if it's there.
  const negativeStockCard = page.locator('text=Stock Negativo');
  if (await negativeStockCard.isVisible()) {
      console.log("Negative Stock Card is visible");
      // Verify style (soft red)
      await expect(negativeStockCard.locator('..').locator('..').locator('..')).toHaveClass(/bg-red-500\/5/);

      // Click on it to see if it redirects to catalog
      await negativeStockCard.click();

      // Should be in catalog tab
      const catalogHeader = page.locator('h2:has-text("Catálogo")'); // Adjust based on actual header
      // Or just check for CatalogTable elements
      await expect(page.locator('button:has-text("Negativo")')).toBeVisible();

      // Verify the "Negativo" filter button has the active class
      const negativeFilterBtn = page.locator('button:has-text("Negativo")');
      await expect(negativeFilterBtn).toHaveClass(/bg-background text-primary shadow-sm/);

      await page.screenshot({ path: 'verification/ipv_catalog_filtered.png' });
  } else {
      console.log("Negative Stock Card is not visible (value likely 0)");
  }

  // Click "Ocultar" to collapse again
  await page.getByRole('button', { name: /Ocultar/i }).click();
  await expect(statsGrid).not.toBeVisible();
});
