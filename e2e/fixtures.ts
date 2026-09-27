/**
 * E2E test fixtures and shared utilities for CostPro.
 *
 * Provides authenticated page context (admin role),
 * reusable store helpers, and API response validation utilities.
 */
/* eslint-disable react-hooks/rules-of-hooks -- Playwright's `use()` fixture function is not a React hook */
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
 * FIX (FASE E2E-80): el fixture original navegaba a /auth/signin (ruta que
 * NO existe — la app es SPA con login en /?login=1) e intentaba loguear a
 * e2e-admin@costpro.test (usuario inexistente, ver
 * audit-evidence/FASE-F0/03-E2E-ANALYSIS.md) → 87 tests UI fallaban.
 *
 * Patrón nuevo (validado en reverse-duplicate-ui.spec.ts): inyectar la sesión
 * real de Supabase en localStorage `sb-<ref>-auth-token`. El token y el user
 * id provienen del global-setup (e2e/global-setup.ts), que autentica al admin
 * real antes de lanzar los workers.
 */
export const test = base.extend<Fixtures>({
  authedPage: async ({ page }, use) => {
    const token = process.env.E2E_TEST_ADMIN_TOKEN;
    const userId = process.env.E2E_TEST_ADMIN_ID;
    const email = process.env.E2E_ADMIN_EMAIL || 'admin@costpro.com';

    if (!token || !userId) {
      throw new Error(
        'authedPage: E2E_TEST_ADMIN_TOKEN/E2E_TEST_ADMIN_ID no definidos — ¿se ejecutó global-setup?',
      );
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const projectRef = SUPABASE_URL.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] || '';
    const storageKey = `sb-${projectRef}-auth-token`;
    const sessionData = JSON.stringify({
      access_token: token,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'mock-refresh',
      user: { id: userId, email },
    });

    await page.addInitScript(([key, val]) => {
      window.localStorage.setItem(key, val);
    }, [storageKey, sessionData]);

    await use(page);
  },
});

export { expect };
