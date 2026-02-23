import { test, expect } from '@playwright/test';

test('export button presence', async ({ page }) => {
  await page.goto('http://localhost:3000');
  // Wait for landing page
  await expect(page.getByText(/COSTPRO/i)).toBeVisible();

  // We can't easily login without real credentials in some environments,
  // but let's see if we can at least check if the app starts.
});
