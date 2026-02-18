import { test, expect } from '@playwright/test';

test('verify modal has date/time toggle', async ({ page }) => {
  // 1. Login
  await page.goto('http://localhost:3000');
  // Use a more specific selector
  const loginButton = page.getByRole('button', { name: 'Acceso al Sistema' });
  await loginButton.click();

  // Wait for login modal
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.locator('input[type="email"]').fill('admin');
  await page.locator('input[type="password"]').fill('demo1234');
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click();

  // 2. Navigate to Cost Sheets
  await page.waitForURL('**/terminal', { timeout: 15000 });

  // Expand Admin module if needed
  const adminModule = page.locator('[data-testid="module-admin"]');
  await adminModule.click();

  // Click on "Fichas de Costo"
  await page.getByRole('button', { name: 'Fichas de Costo' }).click();

  // 3. Open a cost sheet (using a more generic selector if possible)
  // Wait for any cost sheet card or row
  await page.waitForSelector('text=Ficha', { timeout: 10000 });
  // Click the first element that looks like a cost sheet
  await page.locator('text=Ejemplo de Ficha').first().click();

  // 4. Click Export button
  // Sometimes the button is an icon or has specific classes
  await page.waitForSelector('button:has-text("Exportar")', { timeout: 10000 });
  await page.click('button:has-text("Exportar")');

  // 5. Check for "Mostrar Fecha y Hora" toggle
  await expect(page.getByText('Mostrar Fecha y Hora')).toBeVisible();
});
