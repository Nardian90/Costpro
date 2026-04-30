import { Page } from '@playwright/test';

const TEST_ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL || 'admin@test.costpro.com',
  password: process.env.E2E_ADMIN_PASSWORD || 'admin123',
};

const TEST_WAREHOUSE = {
  email: process.env.E2E_WAREHOUSE_EMAIL || 'warehouse@test.costpro.com',
  password: process.env.E2E_WAREHOUSE_PASSWORD || 'warehouse123',
};

export async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.fill('[data-testid="email-input"]', TEST_ADMIN.email);
  await page.fill('[data-testid="password-input"]', TEST_ADMIN.password);
  await page.click('[data-testid="login-button"]');
  await page.waitForURL('**/terminal/**', { timeout: 10_000 });
}

export async function loginAsWarehouse(page: Page) {
  await page.goto('/login');
  await page.fill('[data-testid="email-input"]', TEST_WAREHOUSE.email);
  await page.fill('[data-testid="password-input"]', TEST_WAREHOUSE.password);
  await page.click('[data-testid="login-button"]');
  await page.waitForURL('**/terminal/**', { timeout: 10_000 });
}
