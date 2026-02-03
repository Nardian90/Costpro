import { test, expect } from '@playwright/test';

test('verify cost sheet changes', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[id="email"]', 'admin@demo.com');
  await page.fill('input[id="password"]', 'demo123');
  await page.click('button[type="submit"]');

  await page.waitForURL('**/', { timeout: 15000 });
  await page.waitForSelector('aside');

  const costosLink = page.locator('[data-testid="nav-cost-sheets"]');
  await costosLink.scrollIntoViewIfNeeded();
  await costosLink.click({ force: true });

  await page.waitForSelector('text=Panel de Control', { timeout: 15000 });

  // Ensure example data is loaded
  console.log('Loading example data...');
  await page.click('button:has-text("Más Acciones")', { force: true });
  await page.getByRole('button', { name: /Ejemplo/i }).click({ force: true });
  await page.waitForTimeout(2000);

  // Helper to navigate to an annex
  const navigateToAnnex = async (id: string) => {
    console.log(`Navigating to Anexo ${id}...`);
    await page.click('button:has-text("Anexos")', { force: true });
    // Use a more specific selector for the sidebar item
    const annexBtn = page.locator(`button:has-text("ANEXO ${id}")`).first();
    await annexBtn.scrollIntoViewIfNeeded();
    await annexBtn.click({ force: true });
    await page.waitForTimeout(1000);
  };

  // --- Verify Annex II ---
  await navigateToAnnex('II');

  // Check if there are rows, if not add one
  if (!(await page.locator('table tbody tr').first().isVisible())) {
      console.log('Annex II empty, adding row...');
      await page.click('button:has-text("Añadir Fila")', { force: true });
      await page.waitForTimeout(500);
  }

  const descriptionInput = page.locator('table tbody tr').first().locator('td').nth(1).locator('input');
  await descriptionInput.waitFor({ state: 'visible' });
  const listAttr = await descriptionInput.getAttribute('list');
  console.log('Annex II Description input list attribute:', listAttr);

  if (listAttr) {
    throw new Error(`Annex II Description input should NOT have a list attribute, but found: ${listAttr}`);
  }
  await page.screenshot({ path: '/home/jules/verification/annex_ii_verified.png' });

  // --- Verify Annex IV Suggestions ---
  await navigateToAnnex('IV');
  if (!(await page.locator('table tbody tr').first().isVisible())) {
      await page.click('button:has-text("Añadir Fila")', { force: true });
      await page.waitForTimeout(500);
  }
  const annexIVClassificationInput = page.locator('table tbody tr').first().locator('td').nth(0).locator('input');
  await annexIVClassificationInput.waitFor({ state: 'visible' });
  const listAttrIV = await annexIVClassificationInput.getAttribute('list');
  console.log('Annex IV Classification input list attribute:', listAttrIV);

  if (listAttrIV !== 'suggestions-s3') {
     throw new Error(`Annex IV Classification input should have list="suggestions-s3", but found: ${listAttrIV}`);
  }
  await page.screenshot({ path: '/home/jules/verification/annex_iv_verified.png' });

  // --- Verify Annex V Suggestions ---
  await navigateToAnnex('V');
  if (!(await page.locator('table tbody tr').first().isVisible())) {
      await page.click('button:has-text("Añadir Fila")', { force: true });
      await page.waitForTimeout(500);
  }
  const annexVClassificationInput = page.locator('table tbody tr').first().locator('td').nth(0).locator('input');
  await annexVClassificationInput.waitFor({ state: 'visible' });
  const listAttrV = await annexVClassificationInput.getAttribute('list');
  console.log('Annex V Classification input list attribute:', listAttrV);

  if (listAttrV !== 'suggestions-s3') {
     throw new Error(`Annex V Classification input should have list="suggestions-s3", but found: ${listAttrV}`);
  }
  await page.screenshot({ path: '/home/jules/verification/annex_v_verified.png' });
});
