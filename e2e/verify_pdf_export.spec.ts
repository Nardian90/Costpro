import { test, expect } from '@playwright/test';

test('Export PDF button should trigger generation', async ({ page }) => {
  // Mock the reports API to avoid actual storage upload issues in sandbox if any
  await page.route('**/api/reports/generate', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, url: 'https://example.com/mock.pdf' }),
    });
  });

  await page.goto('http://localhost:3000/cost-sheets');

  // Wait for the page to load and the 'Ejemplo' button to be visible
  const exampleBtn = page.locator('button:has-text("Ejemplo")');
  await exampleBtn.waitFor();
  await exampleBtn.click();

  // Click 'Ver Resultado' to see the PDF button
  const verBtn = page.locator('button:has-text("Ver Resultado")');
  await verBtn.waitFor();
  await verBtn.click();

  // Find the PDF button and click it
  const pdfBtn = page.locator('button:has-text("PDF")');
  await pdfBtn.waitFor();
  await pdfBtn.click();

  // Check for the loading toast
  await expect(page.locator('text=Generando PDF profesional')).toBeVisible();

  // Check for the success toast (mocked)
  await expect(page.locator('text=PDF generado con éxito')).toBeVisible();
});
