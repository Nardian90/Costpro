import { test, expect } from '@playwright/test';

test('Audit Cost Sheet', async ({ page }) => {
  await page.goto('/login');

  await page.evaluate(() => {
    const authState = {
      state: {
        user: {
          id: 'admin-id',
          fullName: 'Admin User',
          role: 'admin',
          email: 'admin@demo.com',
          activeStoreId: 'store-1',
          memberships: [{ store_id: 'store-1', role: 'admin', status: 'active', store: { name: 'Demo Store' } }]
        },
        token: 'mock-token',
        status: 'authenticated_valid',
        loading: false,
        isMocked: true
      },
      version: 0
    };
    localStorage.setItem('auth-storage', JSON.stringify(authState));
    localStorage.setItem('ui-storage', JSON.stringify({
      state: { currentView: 'cost-sheets', sidebarOpen: true },
      version: 0
    }));
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Wait for Costs view content
  await expect(page.locator('body')).toContainText('COSTOS', { timeout: 45000 });

  // Open Actions Panel
  const menuBtn = page.locator('button[title="Panel de Control"]');
  await expect(menuBtn).toBeVisible({ timeout: 20000 });
  await menuBtn.click();

  // Wait for actions to load
  await page.waitForTimeout(2000);

  // Click Cargar Ejemplo
  const exampleBtn = page.getByRole('button', { name: /cargar ejemplo/i });
  await expect(exampleBtn).toBeVisible();
  await exampleBtn.click();

  // Click Modo Completo
  const fullModeBtn = page.getByRole('button', { name: /completo/i });
  await expect(fullModeBtn).toBeVisible();
  await fullModeBtn.click();

  // Verify table
  await expect(page.locator('table')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('GASTO MATERIAL')).toBeVisible();
});
