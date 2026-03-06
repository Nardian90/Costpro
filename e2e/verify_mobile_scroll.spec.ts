import { test, expect } from '@playwright/test';
import { mockAuthState, mockView, bypassSplash } from './helpers';

test('verify mobile menu scroll and arrows', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockAuthState(context, 'admin');
    await mockView(context, 'ipv');

    await page.goto('/');
    await bypassSplash(page);

    const content = page.locator('main').nth(1);
    await expect(content.getByText('VENTA TOTAL', { exact: false }).first()).toBeVisible({ timeout: 45000 });

    const menu = page.locator('.neu-card').first();
    await menu.scrollIntoViewIfNeeded();

    await page.screenshot({ path: 'verification_mobile_menu_start.png' });
});
