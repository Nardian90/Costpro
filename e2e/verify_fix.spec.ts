import { test, expect } from '@playwright/test';

test('app loads without immediate crash', async ({ page }) => {
  await page.goto('http://localhost:3000/login');
  await expect(page).toHaveTitle(/Login/i);
});
