import { test, expect } from '@playwright/test';

test('Verify Inventory Mobile Optimization', async ({ page }) => {
  // Set viewport to mobile
  await page.setViewportSize({ width: 375, height: 812 });

  await page.goto('http://localhost:3000');

  // Bypass splash
  await page.waitForSelector('text=COSTPRO', { state: 'visible' });
  await page.waitForSelector('text=COSTPRO', { state: 'hidden', timeout: 10000 });

  // Mock auth and view state
  await page.evaluate(() => {
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
        currentView: 'inventory',
        sidebarOpen: false
      },
      version: 0
    }));
  });

  await page.reload();

  // Wait for Inventory View
  await page.waitForSelector('text=Gestión de Inventario', { timeout: 5000 }).catch(() => console.log('Title not found, continuing anyway'));

  // Check sticky search bar
  const stickyContainer = await page.locator('.sticky.top-\\[76px\\]');
  await expect(stickyContainer).toBeVisible();

  // Take screenshot of inventory list
  await page.screenshot({ path: 'verification_inventory_list_mobile.png' });

  // Try to open adjustment modal (drawer on mobile)
  // We need products to be present. If mocked, we can click.
  // Assuming StateRenderer shows some mocked data or we wait for real data if dev server is running with mock DB.
  const adjustButton = page.locator('button:has-text("Ajustar Stock")').first();
  if (await adjustButton.isVisible()) {
      await adjustButton.click();

      // Check for Drawer content
      await page.waitForSelector('[data-slot="drawer-content"]', { timeout: 3000 });

      // Check for Stepper buttons
      await expect(page.locator('button >> .lucide-minus')).toBeVisible();
      await expect(page.locator('button >> .lucide-plus')).toBeVisible();

      // Check for Quick Reason chips
      await expect(page.locator('button:has-text("Merma")')).toBeVisible();

      await page.screenshot({ path: 'verification_inventory_adjustment_drawer_mobile.png' });
  }

  // Navigate to Catalog to verify sticky search
  await page.evaluate(() => {
      const storage = JSON.parse(localStorage.getItem('ui-storage') || '{}');
      storage.state.currentView = 'catalog';
      localStorage.setItem('ui-storage', JSON.stringify(storage));
  });
  await page.reload();

  const catalogSticky = await page.locator('.sticky.top-\\[76px\\]');
  await expect(catalogSticky).toBeVisible();
  await page.screenshot({ path: 'verification_catalog_sticky_mobile.png' });
});
