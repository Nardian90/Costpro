import { test, expect } from '@playwright/test';

test.describe('Customer Catalog Audit - Mobile First', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('full customer workflow', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Login
    await page.fill('input[type="email"], input[name="email"]', 'admin');
    await page.fill('input[type="password"]', 'demo1234');
    await page.click('button:has-text("ENTRAR"), button:has-text("Acceso")');

    // Wait for sidebar and navigate to IPV
    await page.waitForSelector('[data-testid="sidebar-container"]', { timeout: 10000 });
    const ipvModule = page.locator('[data-testid="module-point_of_sale"], [data-testid="module-ipv"]');
    await ipvModule.click();
    await page.click('a[href*="/terminal/ipv"], button:has-text("IPV")');

    // Wait for IPV View
    await page.waitForSelector('h1:has-text("IPV"), h2:has-text("IPV")', { timeout: 10000 });

    // Open Clientes tab
    const clientsTab = page.locator('button:has-text("Clientes"), [data-testid="tab-customers"]');
    await clientsTab.click();

    // 1. Verify table is visible
    await expect(page.locator('table')).toBeVisible();

    // 2. Try to Edit a customer (if exists)
    const editButton = page.locator('button[title="Editar Cliente"]').first();
    if (await editButton.isVisible()) {
      await editButton.click();
      await page.waitForSelector('text=Editar Cliente');

      // Update name
      const nameInput = page.locator('input[placeholder="Nombre completo"]');
      const originalName = await nameInput.inputValue();
      await nameInput.fill(originalName + ' MODIFIED');

      await page.click('button:has-text("Guardar")');

      // Check for success toast or closure
      await expect(page.locator('text=Cliente actualizado')).toBeVisible();
    }

    // 3. View Details and Transaction History
    const detailsButton = page.locator('button[title="Ver Detalles"]').first();
    if (await detailsButton.isVisible()) {
      await detailsButton.click();
      await page.waitForSelector('text=Historial de Transacciones');

      // Verify transactions table in modal
      const modalTable = page.locator('div[role="dialog"] table');
      await expect(modalTable).toBeVisible();

      await page.keyboard.press('Escape');
    }

    // 4. Check for Sorting (Expect it to fail or be missing before fix)
    const statsHeader = page.locator('th:has-text("Estadísticas")');
    await expect(statsHeader).toBeVisible();
  });
});
