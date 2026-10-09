import { test, expect } from '@playwright/test';
import { getAuthHeaders, freshAuthHeaders } from './fixtures/auth.fixture';
import { waitStoreBudget, sweepStaleTestStores, freeActiveTestQuota, deleteTestStore as robustDelete } from './fixtures/session.fixture';

// ============================================================================
// ⛔ DESHABILITADO POR EL PROPIETARIO (2026-10-09) — NO ELIMINAR ESTE BLOQUE
// ----------------------------------------------------------------------------
// Este spec CREA tiendas de prueba para ciclos de vida (crear/archivar/reset) en el proyecto Supabase COMPARTIDO (wthkddeleylijmonclxg)
// y fue causa directa de la contaminación de datos del 2026-10-09
// (48 tiendas + 26 usuarios + 6 tenants de prueba; evidencia completa en
// docs/audits/e2e-contamination-cleanup-20261009.md).
//
// Permanece COMENTADO/omitido por defecto. Solo se ejecuta si el propietario
// lo pide EXPLÍCITAMENTE. Para habilitarlo puntualmente:
//   1. Comentar la línea `test.skip(true, ...)` de abajo.
//   2. Ejecutar con E2E_ISOLATION=1 (provisiona entorno aislado efímero con
//      teardown reconciliado) — NUNCA contra tiendas de negocio.
//   3. Verificar net-zero al terminar: node e2e/scripts/data-hygiene-guard.cjs
// ============================================================================
test.skip(true, 'Deshabilitado por el propietario (2026-10-09): crea tiendas. Habilitar solo bajo petición explícita (ver banner).');

/**
 * E2E: Full store lifecycle — create → archive → restore — STRICT ASSERTIONS.
 *
 * REWRITE (2026-07-13): The previous version accepted 500 as valid for
 * create/archive/restore (`expect([200, 400, 403, 500]).toContain(status())`).
 * Now each step asserts the specific expected status, and the test FAILS
 * if the API crashes (500) — which was the original anti-pattern.
 *
 * Flow:
 *   1. Create store via POST /api/stores → 201, captures storeId
 *   2. Archive store via POST /api/stores/[id]/archive → 200
 *   3. Verify archived store does NOT appear in GET /api/stores
 *   4. Restore store via POST /api/stores/[id]/restore → 200
 *   5. Verify restored store appears in GET /api/stores
 *   6. Cleanup: delete the test store
 *
 * Requires E2E_TEST_ADMIN_TOKEN.
 */

test.describe('Store Lifecycle: Create → Archive → Restore — Strict', () => {
  test.skip(!process.env.E2E_TEST_ADMIN_TOKEN, 'E2E_TEST_ADMIN_TOKEN not configured');

  let headers: Record<string, string>;
  let createdStoreId: string | null = null;
  const ts = Date.now();
  const storeName = `E2E Test Store ${ts}`;
  const storeSlug = `e2e-test-store-${ts}`;
  // SEC-TS-10 (TEST OBSOLETO): reeup/nit fijos alfabéticos ('E2E-REEUP'/'E2E-NIT')
  // rompían la validación Zod actual (REEUP 11 dígitos / NIT solo dígitos) → 400.
  // Valores válidos y únicos por corrida (derivados del timestamp).
  const storeReeup = String(ts % 100_000_000_000).padStart(11, '0');
  const storeNit = String(ts % 10_000_000_000);

  test.beforeAll(async () => {
    // SEC-TS-10: sesión fresca (inmune a revocación de token a mitad de corrida)
    headers = (await freshAuthHeaders('admin')) || getAuthHeaders('admin')!;
  });

  test.afterAll(async ({ request }) => {
    // Cleanup: force-delete the test store if it still exists
    if (createdStoreId) {
      // SEC-TS-10: cleanup robusto (rate-limit-aware + fallback de archivado)
      await robustDelete(request, getAuthHeaders('admin')?.Authorization?.replace('Bearer ', '') || '', createdStoreId);
    }
  });

  test('1. create store via POST /api/stores → 201', async ({ request }) => {
    // SEC-TS-10: sweep de huérfanas >10 min (libera cuota activa) + pacear
    // creación (API: 5/min). Timeout extendido: sweep + pacing + posible
    // retry de cuota pueden superar los 60 s por defecto.
    test.setTimeout(180_000);
    await sweepStaleTestStores();
    await waitStoreBudget('create');
    let response = await request.post('/api/stores', {
      headers,
      data: {
        name: storeName,
        address: 'E2E Test Address',
        slug: storeSlug,
        reeup: storeReeup,
        nit: storeNit,
        bank_account: 'E2E-BANK',
      },
    });
    if (response.status() === 403) {
      // SEC-TS-10 (cuota llena): liberar test-stores activas antiguas
      // (>60 s; pilotos protegidos por nombre) y reintentar 1× vía API real.
      await freeActiveTestQuota([], 60_000);
      await waitStoreBudget('create');
      response = await request.post('/api/stores', {
        headers,
        data: {
          name: storeName,
          address: 'E2E Test Address',
          slug: storeSlug,
          reeup: storeReeup,
          nit: storeNit,
          bank_account: 'E2E-BANK',
        },
      });
    }

    // STRICT: must be exactly 201. 500 = RPC broken = test fails.
    // 403 = plan limit reached = test fails (need to upgrade plan or cleanup)
    expect(response.status()).toBe(201);

    const body = await response.json();
    // SEC-TS-10 (BUG LATENTE): la respuesta real de POST /api/stores es
    // { data: { success, store_id, tenant_id } } — la extracción antigua
    // (body.data?.id || body.id) devolvía undefined → el test fallaba PERO
    // la tienda quedaba creada y sin trackear → cuota activa filtrada.
    // Espejo de la extracción tolerante de session.fixture/multi-store.
    createdStoreId = body?.data?.store_id ?? body?.data?.id ?? body?.store_id;
    // STRICT: id must be a valid UUID
    expect(createdStoreId).toBeDefined();
    expect(createdStoreId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  test('2. archive store via POST /api/stores/[id]/archive → 200', async ({ request }) => {
    test.skip(!createdStoreId, 'Store was not created in step 1');

    const response = await request.post(`/api/stores/${createdStoreId}/archive`, {
      headers,
      data: { reason: 'E2E test archiving' },
    });

    // STRICT: must be 200 (success). 404 = store not found, 403 = no perms, 500 = crash.
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test('3. archived store does NOT appear in GET /api/stores', async ({ request }) => {
    test.skip(!createdStoreId, 'Store was not created');

    const response = await request.get('/api/stores', { headers });
    expect(response.status()).toBe(200);

    const body = await response.json();
    const storeIds = body.data?.map((s: any) => s.id) || [];
    expect(storeIds).not.toContain(createdStoreId);
  });

  test('4. restore store via POST /api/stores/[id]/restore → 200', async ({ request }) => {
    test.skip(!createdStoreId, 'Store was not created');

    const response = await request.post(`/api/stores/${createdStoreId}/restore`, {
      headers,
    });

    // STRICT: must be 200. 500 = restore RPC broken.
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test('5. restored store appears in GET /api/stores', async ({ request }) => {
    test.skip(!createdStoreId, 'Store was not created');

    const response = await request.get('/api/stores', { headers });
    expect(response.status()).toBe(200);

    const body = await response.json();
    const storeIds = body.data?.map((s: any) => s.id) || [];
    expect(storeIds).toContain(createdStoreId);
  });

  test('6. cannot archive already-archived store → 400 or 409', async ({ request }) => {
    test.skip(!createdStoreId, 'Store was not created');

    // SEC-TS-10 (FIX LÓGICA DEL TEST): el test 4 RESTAURÓ la tienda → está
    // ACTIVA al llegar aquí. La primera llamada de archivado es legítima
    // (200); el caso de conflicto es la SEGUNDA sobre la tienda ya
    // archivada. Antes este test pasaba VACUO (skip por setup fallido del
    // test 1) y nunca ejercitó esta secuencia.
    const first = await request.post(`/api/stores/${createdStoreId}/archive`, {
      headers,
      data: { reason: 'Double archive test — primera llamada (activa)' },
    });
    expect(first.status()).toBe(200);

    const second = await request.post(`/api/stores/${createdStoreId}/archive`, {
      headers,
      data: { reason: 'Double archive test — segunda llamada (ya archivada)' },
    });

    // STRICT: must NOT be 200 (already archived). Either 400 (bad request) or 409 (conflict).
    expect(second.status()).not.toBe(200);
    expect([400, 409]).toContain(second.status());
  });
});
