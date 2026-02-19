import { test, expect } from '@playwright/test';

test('verify templates section', async ({ page }) => {
  // Go directly to the cost sheets page
  await page.goto('http://localhost:3000/cost-sheets');

  // Wait for the app to load
  await page.waitForTimeout(5000);

  // Look for the "Plantillas" button in the nav
  // The button might have a label or just an icon.
  // In CostSheetNav, it has the label "Plantillas"
  const templatesButton = page.getByRole('button', { name: /plantillas/i });

  // If not visible, maybe it's under "Menú"
  if (!(await templatesButton.isVisible())) {
     const menuButton = page.getByRole('button', { name: /menú/i });
     if (await menuButton.isVisible()) {
        await menuButton.click();
        await page.waitForTimeout(1000);
     }
  }

  await expect(templatesButton).toBeVisible({ timeout: 10000 });
  await templatesButton.click();

  // Verify the Templates Explorer is shown
  await expect(page.getByText(/Explorador de Plantillas/i)).toBeVisible();

  // Verify tabs
  await expect(page.getByRole('button', { name: /Sistema/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Privadas/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Públicas/i })).toBeVisible();

  // Take a screenshot
  await page.screenshot({ path: 'templates-explorer.png', fullPage: true });
});
