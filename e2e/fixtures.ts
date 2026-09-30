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

/**
 * SEC-TS-10: reparación defensiva del active_store del admin (1 vez por
 * worker, cacheada). Causa raíz del cluster UI tardío: specs previos que
 * borran su tienda de prueba SIN restaurar el perfil dejan
 * profiles.active_store_id apuntando a una tienda INEXISTENTE → la app
 * muestra el interstitial "SELECCIONAR TIENDA" → dashboards/vistas que
 * dependen del store activo nunca renderizan → timeouts en cascada
 * (store-switching, stores-crud, fc-*, accounts-payable, multi-store 12.x).
 * Si el active_store actual es inválido (no existe o archivado), se
 * restaura al PILOT STORE A del entorno E2E (SEC-TS-08 — NUNCA una tienda
 * operativa). Los specs que switchean stores a propósito siguen
 * funcionando: la reparación solo actúa sobre estado huérfano.
 */
let activeStoreVerified = false;
export async function ensureValidActiveStore(userId: string): Promise<void> {
  if (activeStoreVerified || !userId) return;
  activeStoreVerified = true;
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!SUPABASE_URL || !SERVICE_KEY) return;
  try {
    const profRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=active_store_id&id=eq.${userId}`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    );
    const prof = (await profRes.json())?.[0];
    const current = prof?.active_store_id as string | null;
    if (current) {
      const storeRes = await fetch(
        `${SUPABASE_URL}/rest/v1/stores?select=id&is_archived=eq.false&id=eq.${current}`,
        { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
      );
      const store = (await storeRes.json())?.[0];
      if (store?.id) return; // válido — nada que reparar
    }
    // Huérfano o nulo → restaurar a PILOT A (entorno E2E dedicado)
    const pilotA = process.env.E2E_PILOT_STORE_A;
    if (!pilotA) return;
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ active_store_id: pilotA }),
    });
  } catch {
    // best-effort: los tests individuales reportarán si algo falta
  }
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
    // SEC-TS-10: el token del global-setup muere a mitad de corrida completa
    // cuando un spec UI dispara el signOut GLOBAL de useSessionManager
    // (src/hooks/logic/useSessionManager.ts — profile fetch fallido →
    // supabase.auth.signOut() revoca TODAS las sesiones del usuario).
    // Fix: sesión FRESCA por página (password grant directo), con
    // refresh_token REAL para que supabase-js auto-sane en el browser.
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const userId = process.env.E2E_TEST_ADMIN_ID;
    const email = process.env.E2E_ADMIN_EMAIL || 'admin@costpro.com';
    const pass = process.env.E2E_ADMIN_PASS || 'costpro123';

    if (!SUPABASE_URL || !ANON_KEY) {
      throw new Error('authedPage: faltan NEXT_PUBLIC_SUPABASE_URL / ANON_KEY');
    }

    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    }).catch(() => null);

    let token: string | undefined;
    let refreshToken: string | undefined;
    let uid: string | undefined;
    if (res && res.ok) {
      const data = await res.json();
      token = data.access_token;
      refreshToken = data.refresh_token;
      uid = data.user?.id;
    }
    // Fallback al token del global-setup si el sign-in falla transitoriamente
    token = token || process.env.E2E_TEST_ADMIN_TOKEN;
    uid = uid || userId;
    if (!token || !uid) {
      throw new Error(
        'authedPage: no hay sesión admin disponible (sign-in falló y E2E_TEST_ADMIN_TOKEN no definido)',
      );
    }

    // SEC-TS-10: garantizar active_store válido (evita el interstitial
    // "SELECCIONAR TIENDA" cuando un spec previo dejó el perfil huérfano)
    await ensureValidActiveStore(uid);

    const projectRef = SUPABASE_URL.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] || '';
    const storageKey = `sb-${projectRef}-auth-token`;
    const sessionData = JSON.stringify({
      access_token: token,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: refreshToken || 'mock-refresh',
      user: { id: uid, email },
    });
    // SEC-TS-10: pre-sembrar consentimiento de cookies — evita que el banner
    // GDPR renderice e interfiera con selectores de modales / clicks.
    const consentData = JSON.stringify({
      essential: true,
      analytics: false,
      functional: true,
      marketing: false,
      timestamp: new Date().toISOString(),
      version: '1.0',
    });

    await page.addInitScript(([key, val, ck, cv]) => {
      window.localStorage.setItem(key, val);
      window.localStorage.setItem(ck, cv);
    }, [storageKey, sessionData, 'costpro_cookie_consent', consentData]);

    await use(page);
  },
});

export { expect };
