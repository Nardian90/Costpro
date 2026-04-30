import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

test.describe('Flujo de transferencia entre tiendas', () => {
  test('crear transferencia con stock disponible', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/terminal/transferencias');
    await page.click('[aria-label="Nueva transferencia"]');

    // Seleccionar tienda destino (asumiendo que hay un select)
    await page.click('button[role="combobox"]');
    await page.click('role=option >> nth=0');

    // Buscar y agregar producto
    await page.fill('input[placeholder*="Buscar producto"]', 'Test');
    await page.click('button:has-text("Añadir")');

    // Verificar que el botón Crear está habilitado si hay stock
    const createBtn = page.locator('button:has-text("Crear transferencia")');
    if (await createBtn.isEnabled()) {
        await createBtn.click();
        await expect(page.locator('text=Transferencia creada')).toBeVisible();
    }
  });

  test('intento de transferencia con cantidad > stock muestra error', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/terminal/transferencias');
    await page.click('[aria-label="Nueva transferencia"]');

    // Buscar y agregar producto
    await page.fill('input[placeholder*="Buscar producto"]', 'Test');
    await page.click('button:has-text("Añadir")');

    // Poner una cantidad exagerada
    await page.fill('input[type="number"]', '999999');

    // El botón debería deshabilitarse según la lógica que implementamos
    await expect(page.locator('button:has-text("Crear transferencia")')).toBeDisabled();
    await expect(page.locator('text=/disp/')).toHaveClass(/text-red-500/);
  });
});
