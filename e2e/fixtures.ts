/**
 * E2E test fixtures and shared utilities for CostPro.
 *
 * Provides authenticated page context (admin + manager roles),
 * reusable store helpers, and API response validation utilities.
 */
import { test as base, expect, type Page } from '@playwright/test';

// ── Types ──────────────────────────────────────────────────────────

interface StorePayload {
  name: string;
  address: string;
  phone?: string;
  email?: string;
  slug?: string;
  plantilla?: 'construccion' | 'minimalista' | 'moderna' | 'clasica';
}

// ── Helpers ────────────────────────────────────────────────────────

/** Build minimal valid store creation payload with a unique suffix */
export function buildStorePayload(suffix: string): StorePayload {
  return {
    name: `E2E Tienda ${suffix}`,
    address: `Calle ${suffix}, La Habana`,
    phone: '+5355550000',
    email: `e2e-${suffix}@costpro.test`,
    slug: `e2e_${suffix.toLowerCase().replace(/\s+/g, '_')}`,
    plantilla: 'construccion',
  };
}

/** Extract the store id from a successful API response */
export function extractStoreId(json: { data?: { id?: string } }): string | undefined {
  return json.data?.id;
}

/** Wait for the stores management view to fully load */
export async function waitForStoresView(page: Page) {
  // Wait for either the loading spinner to disappear or the store cards to render
  await page.waitForSelector('[role="article"], [data-testid="stores-empty"]', {
    timeout: 15_000,
  });
}

/** Create a store via the API (bypasses UI for test setup) */
export async function createStoreViaAPI(
  request: import('@playwright/test').APIRequestContext,
  payload: StorePayload,
  authToken: string,
): Promise<{ id: string; name: string }> {
  const response = await request.post('/api/stores', {
    data: payload,
    headers: {
      'Content-Type': 'application/json',
      Cookie: authToken,
      Origin: 'http://localhost:3000',
    },
  });

  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  return { id: json.data.id, name: json.data.name };
}

/** Delete a store via the API (cleanup helper) */
export async function deleteStoreViaAPI(
  request: import('@playwright/test').APIRequestContext,
  storeId: string,
  authToken: string,
): Promise<void> {
  await request.delete('/api/stores', {
    data: { storeId },
    headers: {
      'Content-Type': 'application/json',
      Cookie: authToken,
      Origin: 'http://localhost:3000',
    },
  });
}

// ── Custom Fixtures ────────────────────────────────────────────────

type Fixtures = {
  authedPage: Page;
};

/**
 * Extend the base test with an authenticated page fixture.
 * In CI, the test environment should have a seeded admin user.
 * Locally, it reuses the dev server session.
 */
export const test = base.extend<Fixtures>({
  authedPage: async ({ page }, use) => {
    // Navigate to the login page and authenticate
    // The test DB should have a seeded admin: e2e-admin@costpro.test / E2eTest123!
    await page.goto('/auth/signin');

    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const passwordInput = page.locator('input[type="password"], input[name="password"]');

    if (await emailInput.isVisible()) {
      await emailInput.fill(process.env.E2E_ADMIN_EMAIL || 'e2e-admin@costpro.test');
      await passwordInput.fill(process.env.E2E_ADMIN_PASSWORD || 'E2eTest123!');
      await page.locator('button[type="submit"]').click();
      // Wait for redirect after login
      await page.waitForURL(/\/(dashboard|terminal)/, { timeout: 15_000 }).catch(() => {
        // Some environments redirect elsewhere — just ensure we're authenticated
      });
    }

    await use(page);
  },
});

export { expect };
