
import { test, expect } from '@playwright/test';

test('Audit Cost Sheet', async ({ page }) => {
  await page.goto('http://localhost:3000/cost-sheets');

  // Load example data
  await page.click('button:has-text("Ejemplo")');

  // Click the "Modo Experto" button to ensure the correct view is active
  await page.click('button:has-text("Modo Experto")');

  // Click the "Tabla Principal" button to display the main table
  await page.click('button:has-text("Tabla Principal")');

  // Wait for the interactive table to be visible
  await page.waitForSelector('[data-testid="cost-sheet-interactive-table"]');

  // Get the main table content
  const table = page.locator('[data-testid="cost-sheet-interactive-table"]');

  // Helper function to get the row by its label
  const getRowByLabel = (label: string) => {
    return table.locator('div.flex.justify-between.items-center').filter({ hasText: label });
  };

  // 1. Assert "Gasto Material" (Row 1) total
  await expect(getRowByLabel('Gasto Material')).toContainText('1,290,045.11');

  // 2. Assert "Salario Directo" (Row 2) total
  await expect(getRowByLabel('Salario Directo')).toContainText('50,243.69');

  // 3. Assert "Otros Gastos Directos" (Row 3) total
  await expect(getRowByLabel('Otros Gastos Directos')).toContainText('134,916.69');

  // 4. Assert "Gastos Asociados Prod." (Row 4) total
  await expect(getRowByLabel('Gastos Asociados Prod.')).toContainText('25,000.00');

  // 5. Assert "COSTO TOTAL (1+2+3+4)" (Row 5) total
  await expect(getRowByLabel('COSTO TOTAL (1+2+3+4)')).toContainText('1,500,205.49');

  // 6. Assert "Gastos Tributarios" (Row 10) total
  await expect(getRowByLabel('Gastos Tributarios')).toContainText('13,500.85');

  // 7. Assert "TOTAL COSTOS Y GASTOS (5+11)" (Row 12) total
  await expect(getRowByLabel('TOTAL COSTOS Y GASTOS (5+11)')).toContainText('1,543,706.34');

  // 8. Assert "Precio o Tarifa Final" (Row 14) total
  await expect(getRowByLabel('Precio o Tarifa Final')).toContainText('1,543,706.34');
});
