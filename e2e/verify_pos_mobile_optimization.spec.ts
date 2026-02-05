import { test, expect } from '@playwright/test';

test('Verify POS Mobile Optimization', async ({ page }) => {
  // Set viewport to mobile
  await page.setViewportSize({ width: 375, height: 812 });

  // Add script to run before any navigation
  await page.addInitScript(() => {
    localStorage.setItem('auth-storage', JSON.stringify({
      state: {
        user: {
          id: 'test-user',
          full_name: 'Test Admin',
          role: 'admin',
          storeId: 'test-store',
          activeStoreId: 'test-store',
          memberships: [{ store_id: 'test-store', role: 'admin', status: 'active', store: { name: 'Tienda Central' } }]
        },
        token: 'mock-token',
        loading: false
      },
      version: 0
    }));
    localStorage.setItem('ui-storage', JSON.stringify({
      state: {
        currentView: 'pos',
        sidebarOpen: false
      },
      version: 0
    }));
  });

  await page.goto('http://localhost:3000/');

  // Bypass splash if it appears
  await page.waitForSelector('text=COSTPRO', { state: 'hidden', timeout: 20000 }).catch(() => {});

  // Check that the initial ActionMenu is visible (empty cart)
  // Use a more flexible selector
  const cartButton = page.locator('button:has-text("Caja")');
  await expect(cartButton).toBeVisible();

  // Take screenshot of empty state
  await page.screenshot({ path: 'pos_empty_mobile.png' });

  // Mock adding an item to the cart by clicking a product card
  // Looking for ProductCard (which is a button in variant="pos")
  const productCard = page.locator('button.rounded-2xl').first();

  if (await productCard.isVisible()) {
      await productCard.click();

      // Now the StickyCartSummary should be visible (Dynamic Switch)
      const stickySummary = page.locator('button:has-text("Total en Carrito")');
      await expect(stickySummary).toBeVisible();

      // Take screenshot of the sticky summary
      await page.screenshot({ path: 'pos_sticky_summary_mobile.png' });

      // Click to open cart drawer
      await stickySummary.click();

      // Check for Drawer content
      await page.waitForSelector('h3:has-text("Caja Registradora")', { timeout: 3000 });

      // Check for ergonomic remove button (larger hit area)
      const removeButton = page.locator('button[aria-label="Eliminar producto"]');
      await expect(removeButton).toBeVisible();

      // Check for "FINALIZAR VENTA" button with neu-pulse
      const finalizeButton = page.locator('button:has-text("FINALIZAR VENTA")');
      await expect(finalizeButton).toHaveClass(/neu-pulse/);

      await page.screenshot({ path: 'pos_cart_drawer_mobile.png' });
  }
});
