/**
 * V2.4.5 — Tests E2E Playwright UI para reversión y duplicación.
 *
 * Cubre el flujo completo: login → navegar a vista → click botón → validar modal.
 *
 * Requiere:
 *   - Servidor Next.js corriendo en localhost:3000
 *   - Credenciales: admin@costpro.com / costpro123
 *
 * Ejecutar: npx playwright test e2e/reverse-duplicate-ui.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ADMIN_EMAIL = process.env.E2E_TEST_ADMIN_EMAIL || 'admin@costpro.com';
const ADMIN_PASS = process.env.E2E_TEST_ADMIN_PASS || 'costpro123';

let adminToken: string;
let adminUserId: string;

test.beforeAll(async () => {
  const authClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await authClient.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASS,
  });
  if (error || !data?.session?.access_token) {
    throw new Error(`Login failed: ${error?.message || 'no token'}`);
  }
  adminToken = data.session.access_token;
  adminUserId = data.user.id;
});

// Helper: inyecta la sesión de Supabase en localStorage antes de cargar la página
async function injectSupabaseSession(page: Page) {
  const projectRef = SUPABASE_URL.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] || '';
  const storageKey = `sb-${projectRef}-auth-token`;
  const sessionData = JSON.stringify({
    access_token: adminToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'mock-refresh',
    user: { id: adminUserId, email: ADMIN_EMAIL },
  });

  await page.addInitScript(([key, val]) => {
    window.localStorage.setItem(key, val);
  }, [storageKey, sessionData]);
}

// ═══════════════════════════════════════════════════════════════════════
// UI: Modal de Reversión aparece y pide motivo
// ═══════════════════════════════════════════════════════════════════════

test.describe('V2.4.5 UI: Modal de Reversión', () => {
  test('modal ReverseDocumentModal se abre al click en botón Revertir (vista ventas)', async ({ page }) => {
    await injectSupabaseSession(page);
    await page.goto('/terminal?view=sales_history');
    await page.waitForLoadState('networkidle');

    // Esperar a que cargue la lista de ventas
    await page.waitForTimeout(3000);

    // Buscar cualquier botón con aria-label="Revertir venta"
    const reverseBtn = page.locator('[aria-label="Revertir venta"]').first();
    const btnCount = await reverseBtn.count();

    if (btnCount === 0) {
      test.skip(true, 'No hay ventas revertibles en la BD de test');
      return;
    }

    await reverseBtn.click();

    // Validar que el modal aparece
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Revertir esta venta/i)).toBeVisible();

    // Validar que pide motivo
    await expect(page.getByLabel(/Motivo de la reversión/i)).toBeVisible();

    // Validar que el botón Revertir está deshabilitado sin motivo
    const confirmBtn = page.getByRole('button', { name: /^Revertir$/i });
    await expect(confirmBtn).toBeDisabled();

    // Escribir motivo
    await page.getByLabel(/Motivo de la reversión/i).fill('Test E2E Playwright');

    // Ahora el botón debería estar habilitado
    await expect(confirmBtn).toBeEnabled();

    // Cancelar (no destruimos datos)
    await page.getByRole('button', { name: /Cancelar/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('modal ReverseDocumentModal se abre en vista transferencias', async ({ page }) => {
    await injectSupabaseSession(page);
    await page.goto('/terminal?view=transfers');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const reverseBtn = page.locator('[aria-label="Revertir transferencia"]').first();
    const btnCount = await reverseBtn.count();

    if (btnCount === 0) {
      test.skip(true, 'No hay transferencias revertibles');
      return;
    }

    await reverseBtn.click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Revertir esta transferencia/i)).toBeVisible();

    // Cancelar
    await page.getByRole('button', { name: /Cancelar/i }).click();
  });

  test('modal ReverseDocumentModal se abre en vista devoluciones', async ({ page }) => {
    await injectSupabaseSession(page);
    await page.goto('/terminal?view=devolutions');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const reverseBtn = page.locator('[aria-label="Revertir devolución"]').first();
    const btnCount = await reverseBtn.count();

    if (btnCount === 0) {
      test.skip(true, 'No hay devoluciones revertibles');
      return;
    }

    await reverseBtn.click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Revertir esta devolución/i)).toBeVisible();

    await page.getByRole('button', { name: /Cancelar/i }).click();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// UI: Modal de Duplicación aparece y muestra advertencia correcta
// ═══════════════════════════════════════════════════════════════════════

test.describe('V2.4.5 UI: Modal de Duplicación', () => {
  test('modal DuplicateDocumentModal se abre al click en Duplicar (vista transferencias)', async ({ page }) => {
    await injectSupabaseSession(page);
    await page.goto('/terminal?view=transfers');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const dupBtn = page.locator('[aria-label="Duplicar transferencia"]').first();
    const btnCount = await dupBtn.count();

    if (btnCount === 0) {
      test.skip(true, 'No hay transferencias para duplicar');
      return;
    }

    await dupBtn.click();

    // Validar modal
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Duplicar esta transferencia/i)).toBeVisible();

    // Validar advertencia "Sin efecto inmediato en stock" (transfer = pending)
    await expect(page.getByText(/Sin efecto inmediato en stock/i)).toBeVisible();

    await page.getByRole('button', { name: /Cancelar/i }).click();
  });

  test('modal DuplicateDocumentModal muestra "Efecto inmediato" para devoluciones', async ({ page }) => {
    await injectSupabaseSession(page);
    await page.goto('/terminal?view=devolutions');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const dupBtn = page.locator('button:has-text("Duplicar")').first();
    const btnCount = await dupBtn.count();

    if (btnCount === 0) {
      test.skip(true, 'No hay devoluciones para duplicar');
      return;
    }

    await dupBtn.click();

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Duplicar esta devolución/i)).toBeVisible();

    // Validar advertencia "Efecto inmediato en stock" (devolution = immediate)
    await expect(page.getByText(/Efecto inmediato en stock/i)).toBeVisible();

    await page.getByRole('button', { name: /Cancelar/i }).click();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// UI: DocumentStatusBadge muestra estados nuevos (reversed, REVERSADA)
// ═══════════════════════════════════════════════════════════════════════

test.describe('V2.4.5 UI: DocumentStatusBadge muestra estados nuevos', () => {
  test('vista ventas muestra badge "Revertida" para tx reversed', async ({ page }) => {
    await injectSupabaseSession(page);
    await page.goto('/terminal?view=sales_history');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Buscar cualquier elemento con texto "Revertida" (badge morado)
    const reversedBadge = page.locator('text=Revertida').first();
    const count = await reversedBadge.count();

    // Si no hay tx reversed, skip
    if (count === 0) {
      test.skip(true, 'No hay ventas reversed en la BD');
      return;
    }

    await expect(reversedBadge).toBeVisible();
  });

  test('vista transferencias muestra badge "Revertida" para transfers REVERSADA', async ({ page }) => {
    await injectSupabaseSession(page);
    await page.goto('/terminal?view=transfers');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const reversedBadge = page.locator('text=Revertida').first();
    const count = await reversedBadge.count();

    if (count === 0) {
      test.skip(true, 'No hay transferencias REVERSADA');
      return;
    }

    await expect(reversedBadge).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// API: Tests negativos (sin necesidad de browser, rate-limit safe)
// ═══════════════════════════════════════════════════════════════════════

test.describe('V2.4.5 API: Tests negativos', () => {
  test.describe.configure({ mode: 'serial' });

  test('sin Authorization → 401', async ({ request }) => {
    const res = await request.post('/api/reverse', {
      headers: { 'Content-Type': 'application/json' },
      data: { type: 'transaction', id: '00000000-0000-0000-0000-000000000000', reason: 'test' },
    });
    expect(res.status()).toBe(401);
  });

  test('origin == destination en transfer → 400', async ({ request }) => {
    const res = await request.post('/api/transfers', {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        origin_store_id: 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
        destination_store_id: 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
        items: [{ product_id: '00000000-0000-0000-0000-000000000000', quantity: 1, unit_cost: 1 }],
      },
    });
    expect(res.status()).toBe(400);
  });

  test('items vacíos en transfer → 400', async ({ request }) => {
    const res = await request.post('/api/transfers', {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        origin_store_id: 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
        destination_store_id: '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1',
        items: [],
      },
    });
    expect(res.status()).toBe(400);
  });

  test('UUID inválido en /api/inventory/adjustments/duplicate → 400', async ({ request }) => {
    const res = await request.post('/api/inventory/adjustments/duplicate', {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      data: { original_id: 'not-a-uuid' },
    });
    expect(res.status()).toBe(400);
  });

  test('adjustment original inexistente → 404', async ({ request }) => {
    const res = await request.post('/api/inventory/adjustments/duplicate', {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      data: { original_id: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.status()).toBe(404);
  });
});
