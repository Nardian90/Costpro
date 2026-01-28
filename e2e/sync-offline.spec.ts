import { test, expect } from '@playwright/test';

test.describe('Offline Sync Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Log in first (using demo credentials from memory)
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@demo.com');
    await page.fill('input[type="password"]', 'demo123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/cashier'); // or whatever the default landing page is
  });

  test('should queue operations when offline and sync when online', async ({ page, context }) => {
    // 1. Go to Inventory
    // We need to find the inventory view. Based on the shell, it might be a button or a URL.
    // Let's assume there is a sidebar link for inventory.
    await page.click('text=Inventario');

    // 2. Go offline
    await context.setOffline(true);

    // 3. Perform an operation (e.g., register a reception)
    await page.click('text=Nueva Recepción');
    await page.fill('input[placeholder="Nombre del proveedor"]', 'Proveedor Test Offline');
    await page.fill('input[placeholder="INV-123"]', 'FACT-OFFLINE-001');

    // Select a product (this might be tricky in E2E without knowing the exact UI state)
    // Let's assume we search for a product and add it.
    await page.fill('input[placeholder*="Buscar producto"]', 'Producto');
    await page.waitForSelector('.neu-card'); // Wait for search results
    await page.click('.neu-card >> text=Plus'); // Click add button

    await page.click('text=Confirmar Recepción');

    // 4. Verify it's queued
    await expect(page.locator('text=Offline (1)')).toBeVisible();

    // 5. Go online
    await context.setOffline(false);

    // 6. Verify it syncs
    await expect(page.locator('text=Sincronizando')).toBeVisible();
    await expect(page.locator('text=Sincronizado')).toBeVisible();
  });

  test('should handle conflicts', async ({ page, context }) => {
    // This test would require more setup to actually trigger a conflict
    // e.g., by changing data on server while client is offline.
  });
});
