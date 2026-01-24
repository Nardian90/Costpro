import { test, expect } from '@playwright/test';

test('Audit Catalog View on Mobile', async ({ page }) => {
  // Set viewport to mobile
  await page.setViewportSize({ width: 375, height: 812 });

  await page.goto('http://localhost:3000');

  // Wait for splash screen to disappear
  // The memory says it has text 'COSTPRO' and takes ~3.5s
  await page.waitForSelector('text=COSTPRO', { state: 'visible' });
  await page.waitForSelector('text=COSTPRO', { state: 'hidden', timeout: 10000 });

  // Mock the auth store to bypass login if possible
  // We need to do this after the page has loaded some JS
  await page.evaluate(() => {
    // Attempt to mock zustand store if it's accessible globally or via some window hook
    // Usually we'd need to have exported it to window or use a different approach.
    // If we can't mock it, we'll try to navigate to /terminal or /catalog and see what happens.
    // Given the task, I might need to just see the login page if I can't bypass.
    // But I want to see the CatalogView.
  });

  // If there's a login page, we might be stuck unless we have credentials.
  // Let's see what's on the page.
  await page.screenshot({ path: 'audit_initial.png' });

  // Try to navigate to catalog directly
  // In many Next.js apps with Zustand, the state might be persisted in localStorage.
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
  await page.waitForTimeout(5000); // Wait for potential redirects and data loading

  await page.screenshot({ path: 'audit_catalog_mobile.png', fullPage: true });
});
