import { test, expect } from '@playwright/test';

test('Verify Catalog View Hardening', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });

  await page.goto('http://localhost:3000');

  // Wait for splash screen to disappear
  await page.waitForSelector('text=COSTPRO', { state: 'visible' });
  await page.waitForSelector('text=COSTPRO', { state: 'hidden', timeout: 10000 });

  // Mock store and navigate
  await page.evaluate(() => {
    localStorage.setItem('auth-storage', JSON.stringify({
      state: {
        user: {
          id: 'test-user',
          full_name: 'Test Admin',
          role: 'admin',
          storeId: 'test-store',
          activeStoreId: 'test-store',
          memberships: [{ store_id: 'test-store', role: 'admin', status: 'active' }]
        },
        token: 'mock-token',
        loading: false
      },
      version: 0
    }));
    localStorage.setItem('ui-storage', JSON.stringify({
      state: {
        currentView: 'catalog',
        sidebarOpen: false
      },
      version: 0
    }));
  });

  await page.reload();
  await page.waitForTimeout(5000);

  // Take screenshot of the new layout
  await page.screenshot({ path: 'verification_catalog_mobile.png', fullPage: true });

  // Verify atomic components exist in DOM (even if data is empty)
  // SearchInput should have placeholder "BUSCAR PRODUCTOS..."
  const searchInput = page.locator('input[placeholder="BUSCAR PRODUCTOS..."]');
  await expect(searchInput).toBeVisible();

  // PrimaryButton "Nuevo Producto" should be visible in column layout
  const newProductBtn = page.locator('button:has-text("Nuevo Producto")');
  await expect(newProductBtn).toBeVisible();

  // Verify it has min-height 44px
  const box = await newProductBtn.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
});
