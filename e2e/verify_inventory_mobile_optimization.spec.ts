import { test, expect } from '@playwright/test';
import { mockAuthState, mockView, bypassSplash } from './helpers';

test('Verify Inventory Mobile Optimization', async ({ page, context }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockAuthState(context, 'admin');
  await mockView(context, 'inventory');

  await page.goto('/');
  await bypassSplash(page);

  const content = page.locator('main').nth(1);
  await expect(content.getByText('INVENTARIO', { exact: false }).first()).toBeVisible({ timeout: 45000 });
  await page.screenshot({ path: 'verification_inventory_list_mobile.png' });
});
