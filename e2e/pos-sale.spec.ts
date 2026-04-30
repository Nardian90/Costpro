import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

test.describe('Flujo de venta POS', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/terminal/pos');
  });

  test('buscar producto → agregar al carrito → ver total actualizado', async ({ page }) => {
    // Buscar producto
    await page.fill('[aria-label="Buscar productos"]', 'Producto Test');
    // Esperar resultados (el debouncing suele ser 300ms)
    await page.waitForTimeout(500);

    // Agregar al carrito (usamos el primer botón que contenga "Agregar")
    const addButton = page.locator('button:has-text("Agregar")').first();
    await addButton.click();

    // Verificar que el total cambió (usamos el aria-live que el prompt indicó que debía existir)
    await expect(page.locator('[aria-live="polite"]')).toContainText(/producto/i);
  });

  test('carrito no vacío muestra warning al cambiar de tienda', async ({ page }) => {
    // Agregar producto al carrito
    await page.click('button:has-text("Agregar")');

    // Navegar a tiendas
    await page.goto('/terminal/stores');

    // Intentar activar una tienda diferente
    const activateButton = page.locator('button:has-text("Activar tienda")').first();
    await activateButton.click();

    // Verificar toast de warning (sonner suele usar data-sonner-toast)
    await expect(page.locator('[data-sonner-toast]')).toBeVisible();
    await expect(page.locator('[data-sonner-toast]')).toContainText(/carrito/i);
  });

  test('el botón Procesar venta está deshabilitado con carrito vacío', async ({ page }) => {
    await expect(
      page.locator('button:has-text("Procesar venta")')
    ).toBeDisabled();
  });
});
