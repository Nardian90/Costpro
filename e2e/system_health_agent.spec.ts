import { test, expect } from '@playwright/test';
import { VIEW_REGISTRY } from '../src/config/viewRegistry';

/**
 * AI System Observer & Health Agent
 * This script crawls through all views defined in viewRegistry,
 * takes screenshots, and reports any immediate UI errors.
 */
test.describe('AI System Observer & Health Agent', () => {
  test('should crawl all views and capture health status', async ({ page }) => {
    // 1. Authentication
    await page.goto('/');

    // Skip splash
    await page.waitForSelector('text=PROTEGE TUS COSTOS Y PRECIOS', { state: 'hidden', timeout: 15000 });

    const loginTrigger = page.getByRole('button', { name: /ACCESO AL SISTEMA/i });
    if (await loginTrigger.isVisible()) {
      await loginTrigger.click();
      await page.getByPlaceholder('tu@email.com').fill('admin');
      await page.getByPlaceholder('••••••••').fill('demo1234');
      await page.getByRole('button', { name: /Iniciar Sesión/i }).click();
    }

    // Wait for initial dashboard load
    await page.waitForURL(/\/terminal/);
    await expect(page).toHaveURL(/\/terminal/);

    const findings = [];

    // 2. Iterate through views
    for (const view of VIEW_REGISTRY) {
      console.log(`Checking view: ${view.id} (${view.route})`);

      try {
        await page.goto(view.route);
        // Wait for network idle or a specific content selector
        await page.waitForLoadState('networkidle', { timeout: 10000 });

        // Take screenshot
        const screenshotPath = `screenshots/health_${view.id}.png`;
        await page.screenshot({ path: `public/${screenshotPath}` });

        // Basic error detection (check for "Error", "404", "Not Found", or broken UI indicators)
        const bodyText = await page.innerText('body');
        let status = 'ok';
        let description = 'Vista cargada correctamente.';
        let priority = 'low';

        if (bodyText.includes('error') || bodyText.includes('Error') || bodyText.includes('No se pudo cargar')) {
          status = 'warning';
          description = 'Se detectaron posibles errores o mensajes de advertencia en la vista.';
          priority = 'medium';
        }

        // Check if main content area is empty (possible blank page)
        const contentArea = await page.locator('main');
        const contentText = await contentArea.innerText().catch(() => '');
        if (contentText.trim().length < 50) {
           status = 'error';
           description = 'La vista parece estar vacía o no cargó el contenido principal.';
           priority = 'high';
        }

        findings.push({
          view_name: view.id,
          status,
          description,
          screenshot_url: `/${screenshotPath}`,
          priority,
          context: {
             url: page.url(),
             actions: view.actions
          }
        });

      } catch (error) {
        console.error(`Failed to check view ${view.id}:`, error);
        findings.push({
          view_name: view.id,
          status: 'critical',
          description: `Error crítico al intentar cargar la vista: ${error.message}`,
          priority: 'high',
          context: { error: error.stack }
        });
      }
    }

    // 3. Log results to stdout (to be captured by the tool handler)
    console.log('---HEALTH_FINDINGS_START---');
    console.log(JSON.stringify(findings));
    console.log('---HEALTH_FINDINGS_END---');
  });
});
