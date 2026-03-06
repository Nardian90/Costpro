import { test, expect } from '@playwright/test';
import { mockAuthState, mockView, bypassSplash } from './helpers';

test('Verify Reset and Randomize buttons in Transaction Breakdown', async ({ page, context }) => {
  await mockAuthState(context, 'admin');
  await mockView(context, 'ipv');

  await page.goto('/');
  await bypassSplash(page);

  const breakdownItem = page.locator('button:has-text("Desglose")').first();
  await expect(breakdownItem).toBeVisible({ timeout: 45000 });
  await breakdownItem.click();

  const content = page.locator('main').nth(1);
  await expect(content.locator('h3:has-text("Análisis de Desglose")')).toBeVisible({ timeout: 30000 });

  const resetBtn = page.locator('button:has-text("Reset Efectivo")').first();
  const randomizeBtn = page.locator('button:has-text("Reacomodar Fechas")').first();

  await expect(resetBtn).toBeVisible({ timeout: 30000 });
  await expect(randomizeBtn).toBeVisible({ timeout: 30000 });
});
