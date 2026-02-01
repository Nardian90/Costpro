import { test, expect } from '@playwright/test';

test('IPV Builder Verification', async ({ page }) => {
  // Set viewport to desktop
  await page.setViewportSize({ width: 1280, height: 800 });

  // Handle dialogs
  page.on('dialog', async dialog => {
    console.log(`Accepting dialog: ${dialog.message()}`);
    await dialog.accept();
  });

  // Login
  await page.goto('http://localhost:3000/login');

  const adminDemoButton = page.locator('button:has-text("admin@demo.com")');
  await adminDemoButton.waitFor({ state: 'visible', timeout: 15000 });
  await adminDemoButton.click();

  // Wait for redirect to home
  await expect(page).toHaveURL('http://localhost:3000/', { timeout: 15000 });

  // Navigate to IPV Builder
  const ipvNavLink = page.locator('text=IPV Builder');
  await ipvNavLink.waitFor({ state: 'visible', timeout: 15000 });
  await ipvNavLink.click();

  // Wait for IPV Builder view to load
  await expect(page.locator('h1').first()).toContainText('IPV Builder', { ignoreCase: true });

  // Go to Reglas tab and initialize
  await page.click('button[role="tab"]:has-text("Reglas")');
  const initRulesButton = page.locator('button:has-text("Inicializar Reglas")');
  if (await initRulesButton.isVisible()) {
      await initRulesButton.click();
      await page.waitForTimeout(500);
  }

  // Go to Ingesta tab
  await page.click('button[role="tab"]:has-text("Ingesta")');

  // Clear any existing data
  await page.click('button:has-text("Reiniciar Datos Banco")');
  await page.waitForTimeout(1000);

  // Load demo data
  await page.click('button:has-text("Productos Demo")');
  await page.waitForTimeout(1000);

  await page.click('button:has-text("Extracto Demo")');
  await page.waitForTimeout(1000);

  // Go to Transacciones tab
  await page.click('button[role="tab"]:has-text("Transacciones")');

  // Test sorting by Importe
  const table = page.locator('table.data-table');
  await expect(table).toBeVisible();

  // Take initial screenshot
  await page.screenshot({ path: 'ipv_initial.png', fullPage: true });

  // Run matching
  await page.click('button:has-text("Ejecutar Matching")');

  // Wait for matching to complete (toast should appear)
  await page.waitForSelector('text=Proceso completado', { timeout: 20000 });
  await page.waitForTimeout(2000); // extra wait for UI to settle

  await page.screenshot({ path: 'ipv_after_matching.png', fullPage: true });

  // Verify that some transactions are now COMPLETO
  const completoBadges = page.locator('span:has-text("COMPLETO")');
  const count = await completoBadges.count();
  console.log(`Transactions marked as COMPLETO: ${count}`);

  expect(count).toBeGreaterThan(0);

  console.log('Verification successful.');
});
