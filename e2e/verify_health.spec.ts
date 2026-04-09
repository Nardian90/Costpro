import { test, expect } from '@playwright/test';

test('verify health module is translated and has improved visuals', async ({ page }) => {
  test.setTimeout(120000);

  // Correct URL for health view
  await page.goto('http://localhost:3000/system/health');

  await page.waitForTimeout(10000);

  // Check if we are in the loading state or actual content
  const loader = page.locator('text=CARGANDO ARTEFACTOS');
  if (await loader.isVisible()) {
      await expect(loader).not.toBeVisible({ timeout: 45000 });
  }

  // 1. Check Translations in Header
  await expect(page.locator('h1:has-text("Salud del Sistema")').first()).toBeVisible({ timeout: 15000 });

  // 2. Check Overview Tab content
  await expect(page.locator('h2:has-text("Resumen de Gobernanza")').first()).toBeVisible();
  await expect(page.locator('h4:has-text("Nivel de Integridad")').first()).toBeVisible();

  await page.screenshot({ path: 'docs/audits/screenshots/health_overview_es.png', fullPage: true });

  // 3. Check Architecture Graph
  await page.click('button:has-text("Arquitectura")');
  await page.waitForTimeout(3000);
  await expect(page.locator('h2:has-text("Sistema de Dependencias")').first()).toBeVisible();
  await expect(page.locator('h4:has-text("Tipología")').first()).toBeVisible();

  await page.screenshot({ path: 'docs/audits/screenshots/health_architecture_es.png', fullPage: true });

  // 4. Check Documentation Gallery
  await page.click('button:has-text("Documentación")');
  await page.waitForTimeout(3000);
  await expect(page.locator('h2:has-text("Guía de Usuario")').first()).toBeVisible();

  // Verify it's not raw JSON
  await expect(page.locator('input[placeholder*="Buscar ayuda"]').first()).toBeVisible();

  await page.screenshot({ path: 'docs/audits/screenshots/health_documentation_gallery_es.png', fullPage: true });
});
