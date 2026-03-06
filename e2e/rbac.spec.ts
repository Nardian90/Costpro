import { test, expect } from '@playwright/test';
import { mockAuthState, mockView, bypassSplash } from './helpers';

test.describe('RBAC and User Management', () => {
  test('should show register link on login page', async ({ page }) => {
    await page.goto('/login');
    const loginTrigger = page.getByRole('button', { name: /Acceso al Sistema/i });
    await expect(loginTrigger).toBeVisible({ timeout: 30000 });
    await loginTrigger.click();

    const registerLink = page.getByRole('button', { name: /Regístrate aquí/i });
    await expect(registerLink).toBeVisible();
  });

  test('should allow admin to see User Management', async ({ page, context }) => {
    await mockAuthState(context, 'admin');
    await mockView(context, 'users');

    await page.goto('/');
    await bypassSplash(page);

    const content = page.locator('main').nth(1);
    await expect(content.getByText('USUARIOS', { exact: false }).first()).toBeVisible({ timeout: 45000 });
  });
});
