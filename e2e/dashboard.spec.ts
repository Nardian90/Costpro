import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsWarehouse } from './helpers/auth';

test.describe('Dashboard consolidado', () => {
  test('admin ve tablero multi-tienda con KPIs de todas las tiendas', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/terminal/dashboard');

    await expect(page.locator('h2', { hasText: 'Tablero Consolidado' })).toBeVisible();
    // Debería haber al menos un KPI de tienda
    await expect(page.locator('text=Ventas hoy').first()).toBeVisible();
  });

  test('rol warehouse NO ve el dashboard consolidado — ve el de su tienda', async ({ page }) => {
    await loginAsWarehouse(page);
    await page.goto('/terminal/dashboard');

    await expect(page.locator('h2', { hasText: 'Tablero Consolidado' })).not.toBeVisible();
    // El dashboard de tienda única suele tener "Resumen de Inventario" o similar
    await expect(page.locator('h2', { hasText: 'Dashboard' })).toBeVisible();
  });
});
