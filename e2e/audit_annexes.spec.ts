
import { test, expect } from '@playwright/test';

test('Audit Annexes', async ({ page }) => {
  await page.goto('http://localhost:3000/cost-sheets');

  // Load example data
  await page.click('button:has-text("Ejemplo")');

  // Click the "Modo Experto" button
  await page.click('button:has-text("Modo Experto")');

  const annexes = ['Anexo I', 'Anexo II', 'Anexo III', 'Anexo IV', 'Anexo V'];

  for (const annex of annexes) {
    // Click the annex tab
    await page.click(`button:has-text("${annex}")`);

    // Wait for the annex editor to be visible
    await page.waitForSelector('[data-testid="cost-sheet-annex-editor"]');

    // Get the annex editor
    const annexEditor = page.locator('[data-testid="cost-sheet-annex-editor"]');

    // Define expected totals for each annex
    const expectedTotals: { [key: string]: string } = {
      'Anexo I': '1,142,400.67',
      'Anexo II': '46,057.10',
      'Anexo III': '71,000.00',
      'Anexo IV': '38,366.69',
      'Anexo V': '25,550.00',
    };

    // Find the total row and assert its value
    const totalRow = annexEditor.locator('div.font-bold').filter({ hasText: 'Total' });
    await expect(totalRow).toContainText(expectedTotals[annex]);
  }
});
