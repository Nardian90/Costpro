import { test, expect } from '@playwright/test';
import { mockAuthState, mockView, bypassSplash } from './helpers';

test.describe('Roles and Permissions Management', () => {
  test('should allow admin to manage roles', async ({ page, context }) => {
    await mockAuthState(context, 'admin');
    await mockView(context, 'roles');

    await page.goto('/');
    await bypassSplash(page);

    const content = page.locator('main').nth(1);
    await expect(content.getByText('ROLES', { exact: false }).first()).toBeVisible({ timeout: 45000 });
  });
});
