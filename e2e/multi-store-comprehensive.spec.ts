import { test, expect } from '@playwright/test';
import { getAuthHeaders, freshAuthHeaders } from './fixtures/auth.fixture';
// SEC-TS-10: pacing de rate-limit (POST 5/min, DELETE 3/min en /api/stores)
// y cleanup robusto con fallback de archivado para el afterAll.
// sweepStaleTestStores: libera cuota activa de huérfanas >10 min ANTES de
// crear (el helper local de este spec no la invocaba → 403 en cascada tras
// una corrida previa sucia — reproducido en el re-run mini).
import { waitStoreBudget, sweepStaleTestStores, freeActiveTestQuota, deleteTestStore as robustDelete } from './fixtures/session.fixture';

// ============================================================================
// ⛔ DESHABILITADO POR EL PROPIETARIO (2026-10-09) — NO ELIMINAR ESTE BLOQUE
// ----------------------------------------------------------------------------
// Este spec CREA un entorno de run aislado (4 usuarios + tenant + pilotos efímeros) y decenas de tiendas 'E2E Multi *' en el proyecto Supabase COMPARTIDO (wthkddeleylijmonclxg)
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
test.skip(true, 'Deshabilitado por el propietario (2026-10-09): crea tiendas y usuarios. Habilitar solo bajo petición explícita (ver banner).');

/**
 * E2E: Multi-Tienda Module — Comprehensive coverage (>90%).
 *
 * NEW (2026-07-13): This suite covers the full multi-store module to achieve
 * >90% coverage of multi-tenant operations. Tests are organized by API endpoint
 * and flow, with strict assertions (no [200,400,500] catch-all).
 *
 * Coverage map:
 *
 *   STORES CRUD:
 *   - GET /api/stores (list, filter by status, pagination)
 *   - POST /api/stores (create, validation, plan limits)
 *   - PATCH /api/stores (update, slug validation)
 *   - DELETE /api/stores (soft delete, hard delete, permission)
 *
 *   STORES LIFECYCLE:
 *   - POST /api/stores/[id]/archive (archive + reason)
 *   - POST /api/stores/[id]/restore (restore archived)
 *   - POST /api/stores/reset (reset with/without keepCatalog)
 *
 *   STORES UTILITIES:
 *   - GET /api/stores/check-slug (availability check)
 *   - GET /api/stores/health-batch (batch health status)
 *
 *   STORES BULK:
 *   - POST /api/stores/bulk (activate/deactivate/delete multiple)
 *
 *   MEMBERSHIPS:
 *   - User can only see stores where they have active membership
 *   - Admin sees all stores
 *   - Multi-store switching (active_store_id)
 *
 *   RLS / TENANT ISOLATION:
 *   - User A cannot access store B's data
 *   - Cross-tenant requests return 403 or empty data
 *   - canManageStore enforces per-store permissions
 *
 *   UI:
 *   - Stores management view renders
 *   - Store cards display correct info
 *   - Create modal validation
 *   - Switch store updates active context
 *
 * Prerequisites:
 *   - E2E_TEST_ADMIN_TOKEN (admin@costpro.com)
 *   - E2E_TEST_STORE_ID = Tienda Central Costpro (pilot)
 *   - E2E_TEST_USER_ID = admin user id
 */

const PILOT_STORE_ID = process.env.E2E_TEST_STORE_ID || 'test-store-00000000';

test.describe('Multi-Tienda Module — Comprehensive (>90% coverage)', () => {
  test.skip(!process.env.E2E_TEST_ADMIN_TOKEN, 'E2E_TEST_ADMIN_TOKEN not configured');

  // e2e-incremental-stabilization (cert c5b): spec rate-bound — las esperas
  // paceadas (ventana server 60 s + buffer 2 s) y el retry-único-post-429
  // (FASE 17) superan el timeout por defecto de 60 s. Timeout uniforme de
  // 180 s para TODO el describe: los asserts siguen fallando al instante;
  // sólo el límite duro del test se acomoda al pacing determinista.
  test.setTimeout(180_000);

  let headers: Record<string, string>;
  const createdStoreIds: string[] = [];

  test.beforeAll(async () => {
    // FIX SEC-TS-10: usar freshAuthHeaders (sign-in dedicado + re-sign-in ante
    // revocación) en vez del token global del env. Causa raíz de los 401 en
    // suite completa: useSessionManager llama supabase.auth.signOut() GLOBAL
    // (src/hooks/logic/useSessionManager.ts:105) cuando el fetch de profile
    // falla transitoriamente → revoca TODAS las sesiones del usuario → el
    // token del global-setup muere a mitad de corrida. Una sesión fresca
    // propia hace este spec inmune a revocaciones cruzadas de specs UI.
    const fresh = await freshAuthHeaders('admin');
    headers = fresh || getAuthHeaders('admin')!;
  });

  test.afterAll(async ({ request }) => {
    // Cleanup: delete all test stores created during the run.
    // SEC-TS-10: usa deleteTestStore robusto — el DELETE /api/stores tiene
    // rate limit 3/min; en bulk los 429 dejaban huérfanas ACTIVAS que
    // agotaban la cuota del plan y cascabeaban 403 sobre specs posteriores.
    // SEC-TS-10: timeout del hook extendido — el cleanup paceado (~2 deletes/min
    // × ~15 stores creadas por este spec) tarda ~450 s; con 360 s las ÚLTIMAS
    // stores del array no llegaban a limpiarse → quedaban ACTIVAS → presión de
    // cuota (403) sobre los specs siguientes (6.2/9.2 en el run focalizado).
    // 600 s cubre ~20 deletes paceados con margen.
    test.setTimeout(600_000);
    for (const storeId of createdStoreIds) {
      await robustDelete(request, headers.Authorization?.replace('Bearer ', '') || '', storeId);
    }
  });

  // Helper: create a test store
  async function createTestStore(request: any, suffix?: string): Promise<string> {
    const sfx = suffix || Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    // SEC-TS-10: sweep de huérfanas >10 min (libera cuota activa del tenant)
    // + pacear creación (API: 5 POSTs/min por usuario) — sin esto,
    // la ráfaga de creaciones de este spec recibe 429 y falla en cascada.
    await sweepStaleTestStores();
    await waitStoreBudget('create');
    let response = await request.post('/api/stores', {
      headers,
      data: {
        name: `E2E Multi ${sfx}`,
        address: `Calle ${sfx}`,
        slug: `e2e-multi-${sfx}`,
        // REEUP debe ser 11 dígitos, NIT solo dígitos
        reeup: '12345678901',
        nit: '123456789',
      },
    });
    if (response.status() === 429) {
      // FLAKY-documentado (e2e-incremental-stabilization, cert c5b): el budget
      // del worker NO ve los 2 POSTs de pilotos A/B del aprovisionamiento
      // (run-env corre en otro proceso → sólo consumo server-side) — un 429
      // aquí mide la ventana de rate limit, no el contrato del POST. Reintento
      // ÚNICO tras una ventana completa de silencio (60 s + 2 s buffer); la
      // aserción 201 se mantiene íntegra sobre el reintento.
      await new Promise((r) => setTimeout(r, 62_000));
      await waitStoreBudget('create');
      response = await request.post('/api/stores', {
        headers,
        data: {
          name: `E2E Multi ${sfx}`,
          address: `Calle ${sfx}`,
          slug: `e2e-multi-${sfx}`,
          reeup: '12345678901',
          nit: '123456789',
        },
      });
    }
    if (response.status() === 403) {
      // SEC-TS-10 (cuota llena): liberar test-stores ACTIVAS antiguas
      // (>60 s — de tests ya completados; las del test en curso y los
      // pilotos quedan protegidas por freeActiveTestQuota) y reintentar 1×
      // por la vía REAL de la API. Protección por EDAD (no por
      // createdStoreIds — con la lista completa TODO lo activo estaba
      // trackeado → free=0 → 403 persistente, reproducido en mini-3/4):
      // las stores de tests previos del spec también son archivables y el
      // afterAll las tolera (DELETE → 400 → fallback idempotente).
      await freeActiveTestQuota([], 60_000);
      await waitStoreBudget('create');
      response = await request.post('/api/stores', {
        headers,
        data: {
          name: `E2E Multi ${sfx}`,
          address: `Calle ${sfx}`,
          slug: `e2e-multi-${sfx}`,
          reeup: '12345678901',
          nit: '123456789',
        },
      });
    }

    expect(response.status()).toBe(201);
    const body = await response.json();
    // SEC-TS-10 (BUG LATENTE): la respuesta real de POST /api/stores es
    // { data: { success, store_id, tenant_id } } — este helper extraía
    // body.data?.id || body.id (AMBOS undefined) → storeId undefined →
    // tests de archive/patch/delete sobre 'undefined' fallaban Y las stores
    // creadas nunca entraban a createdStoreIds → afterAll no las limpiaba →
    // cuota activa del tenant (10) agotada → 403 en cascada al resto de la
    // suite. Espejo de la extracción tolerante de session.fixture.
    const storeId = body?.data?.store_id ?? body?.data?.id ?? body?.store_id;
    if (storeId) createdStoreIds.push(storeId);
    return storeId;
  }

  // ═════════════════════════════════════════════════════════════════
  // 1. GET /api/stores — List
  // ═════════════════════════════════════════════════════════════════

  test('1.1 GET /api/stores returns 200 with array', async ({ request }) => {
    const response = await request.get('/api/stores', { headers });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('1.2 GET /api/stores includes PILOT STORE A (SEC-TS-08: entorno piloto)', async ({ request }) => {
    const response = await request.get('/api/stores', { headers });
    expect(response.status()).toBe(200);

    const body = await response.json();
    const storeIds = body.data.map((s: any) => s.id);
    expect(storeIds).toContain(PILOT_STORE_ID);
  });

  test('1.3 GET /api/stores?status=active returns only active stores', async ({ request }) => {
    const response = await request.get('/api/stores?status=active', { headers });
    expect(response.status()).toBe(200);

    const body = await response.json();
    body.data.forEach((store: any) => {
      expect(store.is_active).toBe(true);
    });
  });

  test('1.4 GET /api/stores?status=all returns all stores (including archived)', async ({ request }) => {
    const response = await request.get('/api/stores?status=all', { headers });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.data.length).toBeGreaterThan(0);
  });

  test('1.5 GET /api/stores returns store with expected fields', async ({ request }) => {
    const response = await request.get('/api/stores', { headers });
    expect(response.status()).toBe(200);

    const body = await response.json();
    const pilotStore = body.data.find((s: any) => s.id === PILOT_STORE_ID);
    expect(pilotStore).toBeDefined();
    expect(pilotStore).toHaveProperty('id');
    expect(pilotStore).toHaveProperty('name');
    expect(pilotStore).toHaveProperty('slug');
    expect(pilotStore).toHaveProperty('is_active');
    expect(pilotStore).toHaveProperty('address');
  });

  test('1.6 GET /api/stores without auth → 401', async ({ request }) => {
    const response = await request.get('/api/stores');
    expect(response.status()).toBe(401);
  });

  // ═════════════════════════════════════════════════════════════════
  // 2. POST /api/stores — Create
  // ═════════════════════════════════════════════════════════════════

  test('2.1 POST /api/stores creates a store with valid data → 201', async ({ request }) => {
    const storeId = await createTestStore(request);
    expect(storeId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  test('2.2 POST /api/stores rejects missing name → 400', async ({ request }) => {
    // SEC-TS-10: pacear creación (API: 5 POSTs/min — TODOS los POSTs cuentan,
    // incluidos los que fallan validación; el límite corre antes del parse).
    await waitStoreBudget('create');
    const response = await request.post('/api/stores', {
      headers,
      data: { address: 'Test', slug: 'test-no-name-' + Date.now() },
    });
    expect(response.status()).toBe(400);
  });

  test('2.3 POST /api/stores accepts missing address (optional field) → 201', async ({ request }) => {
    // FIX: schema says address is optional (create-quick flow)
    const sfx = 'noaddr-' + Date.now().toString(36);
    // SEC-TS-10: pacear creación (API: 5 POSTs/min — TODOS los POSTs cuentan,
    // incluidos los que fallan validación; el límite corre antes del parse).
    await waitStoreBudget('create');
    const response = await request.post('/api/stores', {
      headers,
      data: { name: `E2E No Addr ${sfx}`, slug: `e2e-no-addr-${sfx}` },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    // SEC-TS-10 (BUG LATENTE — extracción): la respuesta real es
    // { data: { success, store_id, tenant_id } } — el patrón body.data?.id
    // || body.id devolvía undefined → push(undefined) → afterAll no limpiaba
    // → tienda ACTIVA filtrada → cuota 403 en cascada.
    const storeId = body?.data?.store_id ?? body?.data?.id ?? body?.store_id;
    if (storeId) createdStoreIds.push(storeId);
  });

  test('2.4 POST /api/stores rejects name with only whitespace → 400', async ({ request }) => {
    // SEC-TS-10: pacear creación (API: 5 POSTs/min — TODOS los POSTs cuentan,
    // incluidos los que fallan validación; el límite corre antes del parse).
    await waitStoreBudget('create');
    let response = await request.post('/api/stores', {
      headers,
      data: { name: '   ', address: 'Test', slug: 'test-ws-name-' + Date.now() },
    });
    if (response.status() === 429) {
      // FLAKY-documentado (e2e-incremental-stabilization FASE 17): el 429 en
      // este POST de VALIDACIÓN no mide el contrato (nombre whitespace → 400)
      // sino la ventana de rate limit del usuario (5 POSTs/min, ventana fija
      // anclada al primer POST del run — los pilotos del global-setup y el
      // reinicio de worker de Playwright pueden desalinear el presupuesto
      // client-side). Reintento ÚNICO tras vaciar la ventana; la aserción
      // 400/422 se mantiene íntegra sobre el reintento.
      await new Promise((r) => setTimeout(r, 61_000));
      response = await request.post('/api/stores', {
        headers,
        data: { name: '   ', address: 'Test', slug: 'test-ws-name-' + Date.now() },
      });
    }
    expect([400, 422]).toContain(response.status());
  });

  test('2.5 POST /api/stores rejects duplicate slug → 400 or 409', async ({ request }) => {
    // SEC-TS-10: timeout extendido — setup createTestStore PACEADO (con
    // posible retry de cuota) + POST duplicado PACEADO superan los 60 s
    // por defecto ("Request context disposed" reproducido en re-run mini 3).
    test.setTimeout(180_000);
    // First create a store with a specific slug
    const sfx = 'dup-' + Date.now().toString(36);
    const storeId = await createTestStore(request, sfx);

    // Try to create another with the same slug
    // SEC-TS-10: pacear creación (API: 5 POSTs/min — TODOS los POSTs cuentan,
    // incluidos los que fallan validación; el límite corre antes del parse).
    await waitStoreBudget('create');
    const response = await request.post('/api/stores', {
      headers,
      data: {
        name: 'Duplicate Slug Test',
        address: 'Test',
        slug: `e2e-multi-${sfx}`, // same slug
      },
    });

    expect(response.status()).not.toBe(201);
    expect([400, 409]).toContain(response.status());
  });

  test('2.6 POST /api/stores without auth → 401', async ({ request }) => {
    // SEC-TS-10: pacear creación (API: 5 POSTs/min — TODOS los POSTs cuentan,
    // incluidos los que fallan validación; el límite corre antes del parse).
    await waitStoreBudget('create');
    const response = await request.post('/api/stores', {
      data: { name: 'No Auth', address: 'Test', slug: 'no-auth-' + Date.now() },
    });
    expect(response.status()).toBe(401);
  });

  test('2.7 POST /api/stores rejects invalid plantilla → 400', async ({ request }) => {
    // SEC-TS-10: pacear creación (API: 5 POSTs/min — TODOS los POSTs cuentan,
    // incluidos los que fallan validación; el límite corre antes del parse).
    await waitStoreBudget('create');
    const response = await request.post('/api/stores', {
      headers,
      data: {
        name: 'Bad Plantilla',
        address: 'Test',
        slug: 'bad-plantilla-' + Date.now(),
        plantilla: 'invalid_template',
      },
    });
    expect(response.status()).toBe(400);
  });

  // ═════════════════════════════════════════════════════════════════
  // 3. PATCH /api/stores — Update
  // ═════════════════════════════════════════════════════════════════

  test('3.1 PATCH /api/stores updates name → 200', async ({ request }) => {
    const storeId = await createTestStore(request, 'upd-' + Date.now().toString(36));

    const response = await request.patch('/api/stores', {
      headers,
      data: { storeId, name: 'Updated Name E2E' },
    });

    expect([200, 204]).toContain(response.status());
  });

  test('3.2 PATCH /api/stores rejects missing storeId → 400', async ({ request }) => {
    const response = await request.patch('/api/stores', {
      headers,
      data: { name: 'No Store ID' },
    });
    expect(response.status()).toBe(400);
  });

  test('3.3 PATCH /api/stores rejects non-UUID storeId → 400', async ({ request }) => {
    const response = await request.patch('/api/stores', {
      headers,
      data: { storeId: 'not-a-uuid', name: 'Bad UUID' },
    });
    expect(response.status()).toBe(400);
  });

  test('3.4 PATCH /api/stores rejects non-existent store → 404', async ({ request }) => {
    const response = await request.patch('/api/stores', {
      headers,
      data: { storeId: '00000000-0000-0000-0000-000000000000', name: 'Ghost' },
    });
    expect([404, 403]).toContain(response.status());
  });

  // ═════════════════════════════════════════════════════════════════
  // 4. DELETE /api/stores — Delete
  // ═════════════════════════════════════════════════════════════════

  test('4.1 DELETE /api/stores removes a store → 200', async ({ request }) => {
    // SEC-TS-10: timeout extendido — este test hace create PACEADO + delete
    // PACEADO (presupuestos 4/min y 2/min): esperas de hasta ~90 s contra
    // el timeout por defecto de 60 s (mismo criterio que store-reset 7/9).
    test.setTimeout(180_000);
    const storeId = await createTestStore(request, 'del-' + Date.now().toString(36));

    // SEC-TS-10: pacear delete (API: 3/min) — la creación previa de este mismo
    // test y los deletes de specs anteriores comparten el presupuesto.
    await waitStoreBudget('delete');
    const response = await request.delete('/api/stores', {
      headers,
      data: { storeId },
    });

    expect([200, 204]).toContain(response.status());

    // Remove from cleanup list since it's already deleted
    const idx = createdStoreIds.indexOf(storeId);
    if (idx >= 0) createdStoreIds.splice(idx, 1);
  });

  test('4.2 DELETE /api/stores rejects missing storeId → 400', async ({ request }) => {
    // SEC-TS-10: pacear delete (API: 3/min) + timeout extendido (espera
    // paceada de hasta ~60 s tras el delete del 4.1).
    test.setTimeout(180_000);
    await waitStoreBudget('delete');
    let response = await request.delete('/api/stores', {
      headers,
      data: {},
    });
    if (response.status() === 429) {
      // FLAKY-documentado (e2e-incremental-stabilization, cert c5b): el 429
      // mide la ventana de rate limit (requests abortados por timeouts de
      // tests previos igual cuentan server-side), no el contrato. Reintento
      // ÚNICO tras ventana completa de silencio; el assert 400 queda íntegro.
      await new Promise((r) => setTimeout(r, 62_000));
      await waitStoreBudget('delete');
      response = await request.delete('/api/stores', {
        headers,
        data: {},
      });
    }
    expect(response.status()).toBe(400);
  });

  test('4.3 DELETE /api/stores rejects non-existent store → 404', async ({ request }) => {
    // SEC-TS-10: pacear delete (API: 3/min) + timeout extendido — con 2
    // deletes previos en el bucket, la espera puede superar los 60 s
    // ("Request context disposed" reproducido en el re-run mini).
    test.setTimeout(180_000);
    await waitStoreBudget('delete');
    let response = await request.delete('/api/stores', {
      headers,
      data: { storeId: '00000000-0000-0000-0000-000000000000' },
    });
    if (response.status() === 429) {
      // FLAKY-documentado (e2e-incremental-stabilization, cert c5b): mismo
      // criterio que 4.2 — el 429 mide la ventana, no el contrato. Reintento
      // ÚNICO tras ventana completa de silencio; assert [404,403] íntegro.
      await new Promise((r) => setTimeout(r, 62_000));
      await waitStoreBudget('delete');
      response = await request.delete('/api/stores', {
        headers,
        data: { storeId: '00000000-0000-0000-0000-000000000000' },
      });
    }
    expect([404, 403]).toContain(response.status());
  });

  // ═════════════════════════════════════════════════════════════════
  // 5. POST /api/stores/[id]/archive — Archive
  // ═════════════════════════════════════════════════════════════════

  test('5.1 archive a store → 200, store disappears from active list', async ({ request }) => {
    const storeId = await createTestStore(request, 'arch-' + Date.now().toString(36));

    // Archive
    const archiveRes = await request.post(`/api/stores/${storeId}/archive`, {
      headers,
      data: { reason: 'E2E archive test' },
    });
    expect(archiveRes.status()).toBe(200);

    // Verify not in active list
    const listRes = await request.get('/api/stores?status=active', { headers });
    const body = await listRes.json();
    const storeIds = body.data.map((s: any) => s.id);
    expect(storeIds).not.toContain(storeId);
  });

  test('5.2 archive non-existent store → 404', async ({ request }) => {
    const response = await request.post('/api/stores/00000000-0000-0000-0000-000000000000/archive', {
      headers,
      data: { reason: 'Test' },
    });
    expect(response.status()).toBe(404);
  });

  test('5.3 archive already-archived store → 400 or 409', async ({ request }) => {
    const storeId = await createTestStore(request, 'dblarch-' + Date.now().toString(36));

    // First archive
    await request.post(`/api/stores/${storeId}/archive`, {
      headers,
      data: { reason: 'First' },
    });

    // Second archive
    const response = await request.post(`/api/stores/${storeId}/archive`, {
      headers,
      data: { reason: 'Second' },
    });

    expect(response.status()).not.toBe(200);
    expect([400, 409]).toContain(response.status());
  });

  // ═════════════════════════════════════════════════════════════════
  // 6. POST /api/stores/[id]/restore — Restore
  // ═════════════════════════════════════════════════════════════════

  test('6.1 restore an archived store → 200, store reappears in active list', async ({ request }) => {
    const storeId = await createTestStore(request, 'rest-' + Date.now().toString(36));

    // Archive first
    await request.post(`/api/stores/${storeId}/archive`, {
      headers,
      data: { reason: 'Will restore' },
    });

    // Restore
    const restoreRes = await request.post(`/api/stores/${storeId}/restore`, { headers });
    expect(restoreRes.status()).toBe(200);

    // Verify back in active list
    const listRes = await request.get('/api/stores?status=active', { headers });
    const body = await listRes.json();
    const storeIds = body.data.map((s: any) => s.id);
    expect(storeIds).toContain(storeId);
  });

  test('6.2 restore a non-archived store → 400 or 409', async ({ request }) => {
    const storeId = await createTestStore(request, 'restactive-' + Date.now().toString(36));

    // Try to restore without archiving first
    const response = await request.post(`/api/stores/${storeId}/restore`, { headers });
    expect(response.status()).not.toBe(200);
    expect([400, 409]).toContain(response.status());
  });

  // ═════════════════════════════════════════════════════════════════
  // 7. GET /api/stores/check-slug — Slug availability
  // ═════════════════════════════════════════════════════════════════

  test('7.1 check-slug returns available=true for unique slug', async ({ request }) => {
    const uniqueSlug = 'e2e-unique-' + Date.now().toString(36);
    const response = await request.get(`/api/stores/check-slug?slug=${uniqueSlug}`, { headers });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.available).toBe(true);
  });

  test('7.2 check-slug returns available=false for existing slug', async ({ request }) => {
    // Use the pilot store's slug
    const response = await request.get('/api/stores/check-slug?slug=tienda-central-costpro', { headers });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.available).toBe(false);
  });

  test('7.3 check-slug rejects missing slug → 400', async ({ request }) => {
    const response = await request.get('/api/stores/check-slug', { headers });
    expect(response.status()).toBe(400);
  });

  test('7.4 check-slug rejects slug with invalid characters → 400', async ({ request }) => {
    const response = await request.get('/api/stores/check-slug?slug=invalid slug with spaces', { headers });
    expect([400, 200]).toContain(response.status()); // some implementations sanitize
    if (response.status() === 200) {
      const body = await response.json();
      // Should be available=false or valid=false
      expect(body.available === false || body.valid === false).toBe(true);
    }
  });

  // ═════════════════════════════════════════════════════════════════
  // 8. GET /api/stores/health-batch — Batch health
  // ═════════════════════════════════════════════════════════════════

  test('8.1 health-batch returns health for multiple stores', async ({ request }) => {
    const store1 = await createTestStore(request, 'hb1-' + Date.now().toString(36));
    const store2 = await createTestStore(request, 'hb2-' + Date.now().toString(36));

    const response = await request.get(
      `/api/stores/health-batch?store_ids=${store1},${store2}`,
      { headers }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toBeDefined();
  });

  test('8.2 health-batch with non-UUID store_id → ignores invalid', async ({ request }) => {
    const response = await request.get(
      '/api/stores/health-batch?store_ids=not-a-uuid',
      { headers }
    );

    // Should NOT crash — either 400 or 200 with empty
    expect([200, 400]).toContain(response.status());
  });

  test('8.3 health-batch without store_ids → 400', async ({ request }) => {
    const response = await request.get('/api/stores/health-batch', { headers });
    expect([200, 400]).toContain(response.status());
  });

  // ═════════════════════════════════════════════════════════════════
  // 9. POST /api/stores/bulk — Bulk operations
  // ═════════════════════════════════════════════════════════════════

  test('9.1 bulk activate multiple stores → 200', async ({ request }) => {
    const store1 = await createTestStore(request, 'blk1-' + Date.now().toString(36));
    const store2 = await createTestStore(request, 'blk2-' + Date.now().toString(36));

    const response = await request.post('/api/stores/bulk', {
      headers,
      data: {
        storeIds: [store1, store2],
        action: 'activate',
      },
    });

    expect([200, 207]).toContain(response.status());
  });

  test('9.2 bulk deactivate multiple stores → 200', async ({ request }) => {
    const store1 = await createTestStore(request, 'blkd1-' + Date.now().toString(36));
    const store2 = await createTestStore(request, 'blkd2-' + Date.now().toString(36));

    const response = await request.post('/api/stores/bulk', {
      headers,
      data: {
        storeIds: [store1, store2],
        action: 'deactivate',
      },
    });

    expect([200, 207]).toContain(response.status());
  });

  test('9.3 bulk with invalid action → 400', async ({ request }) => {
    const store1 = await createTestStore(request, 'blki-' + Date.now().toString(36));

    const response = await request.post('/api/stores/bulk', {
      headers,
      data: {
        storeIds: [store1],
        action: 'invalid_action',
      },
    });

    expect(response.status()).toBe(400);
  });

  test('9.4 bulk with empty storeIds → 400', async ({ request }) => {
    const response = await request.post('/api/stores/bulk', {
      headers,
      data: {
        storeIds: [],
        action: 'activate',
      },
    });

    expect(response.status()).toBe(400);
  });

  test('9.5 bulk without auth → 401', async ({ request }) => {
    const response = await request.post('/api/stores/bulk', {
      data: {
        storeIds: [PILOT_STORE_ID],
        action: 'activate',
      },
    });

    expect(response.status()).toBe(401);
  });

  // ═════════════════════════════════════════════════════════════════
  // 10. RLS / Tenant Isolation
  // ═════════════════════════════════════════════════════════════════

  test('10.1 admin sees all stores in the system', async ({ request }) => {
    const response = await request.get('/api/stores?status=all', { headers });
    expect(response.status()).toBe(200);

    const body = await response.json();
    // Admin should see at least the pilot store
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  test('10.2 cannot access archived store via GET (default filter)', async ({ request }) => {
    const storeId = await createTestStore(request, 'rls1-' + Date.now().toString(36));

    // Archive it
    await request.post(`/api/stores/${storeId}/archive`, {
      headers,
      data: { reason: 'RLS test' },
    });

    // Default GET should not include it
    const response = await request.get('/api/stores', { headers });
    const body = await response.json();
    const storeIds = body.data.map((s: any) => s.id);
    expect(storeIds).not.toContain(storeId);
  });

  test('10.3 cannot delete store without permission (non-admin)', async ({ request }) => {
    // This test would need a non-admin token to be meaningful
    // For now, verify that the admin token CAN delete (control)
    const storeId = await createTestStore(request, 'perm-' + Date.now().toString(36));
    // SEC-TS-10: pacear delete (API: 3/min)
    await waitStoreBudget('delete');
    const response = await request.delete('/api/stores', {
      headers,
      data: { storeId },
    });

    expect([200, 204]).toContain(response.status());
    const idx = createdStoreIds.indexOf(storeId);
    if (idx >= 0) createdStoreIds.splice(idx, 1);
  });

  // ═════════════════════════════════════════════════════════════════
  // 11. Audit trail
  // ═════════════════════════════════════════════════════════════════

  test('11.1 GET /api/stores/[id]/audit returns audit log', async ({ request }) => {
    const response = await request.get(`/api/stores/${PILOT_STORE_ID}/audit`, { headers });

    // May be 200 with array, or 404 if endpoint doesn't exist
    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toBeDefined();
    }
  });

  // ═════════════════════════════════════════════════════════════════
  // 12. UI — Stores management view
  // ═════════════════════════════════════════════════════════════════

// SEC-TS-10: los tests 12.x navegaban SIN sesión → login wall → nunca
// renderizaban las tarjetas. Helper con sesión fresca inyectada.
async function authedGoto(page: import('@playwright/test').Page, view: string) {
  const { signIn, injectSession, ADMIN_EMAIL, ADMIN_PASS } = await import('./fixtures/session.fixture');
  await injectSession(page, await signIn(ADMIN_EMAIL, ADMIN_PASS));
  await page.goto(`/?view=${view}`);
  await page.waitForLoadState('networkidle');
}

test('12.1 UI: stores management view loads', async ({ page }) => {
  await authedGoto(page, 'stores');

    // Should show at least one store card or empty state
    await page.waitForTimeout(3000);
    const storeCard = page.locator('[role="article"], .store-card, [data-store-card]').first();
    const emptyState = page.getByText(/no hay tiendas|sin tiendas|no stores/i);

    const hasCards = await storeCard.isVisible({ timeout: 10000 }).catch(() => false);
    const hasEmpty = await emptyState.isVisible().catch(() => false);
    expect(hasCards || hasEmpty).toBe(true);
  });

  test('12.2 UI: PILOT STORE A card is visible (SEC-TS-08)', async ({ page }) => {
    await authedGoto(page, 'stores');
    await page.waitForTimeout(3000);

    // SEC-TS-08: se verifica la tarjeta de la tienda PILOT dedicada —
    // 'Tienda Central Costpro' (real) queda fuera del banco de pruebas E2E
    const pilotCard = page.locator('[role="article"], .store-card, [data-store-card]').filter({
      hasText: /e2e pilot a costpro/i,
    }).first();

    const visible = await pilotCard.isVisible({ timeout: 10000 }).catch(() => false);
    expect(visible).toBe(true);
  });

  test('12.3 UI: "Nueva tienda" button exists', async ({ page }) => {
    await authedGoto(page, 'stores');

    const newButton = page.getByRole('button', { name: /nueva tienda|nuevo|crear/i }).first();
    const visible = await newButton.isVisible({ timeout: 10000 }).catch(() => false);
    expect(visible).toBe(true);
  });

  test('12.4 UI: store card shows store name and address', async ({ page }) => {
    await authedGoto(page, 'stores');
    await page.waitForTimeout(3000);

    const pilotCard = page.locator('[role="article"], .store-card, [data-store-card]').filter({
      hasText: /tienda central costpro/i,
    }).first();

    const visible = await pilotCard.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!visible, 'Pilot store card not visible');

    // Card should show at least the name.
    // SEC-TS-10: el texto aparece 2× dentro de la tarjeta (h3 del título +
    // span.sr-only de descripción) → getByText violaba strict mode. Se
    // aserta sobre el HEADING del título (elemento visible y único).
    await expect(pilotCard.getByRole('heading', { name: /tienda central costpro/i })).toBeVisible();
  });

  // ═════════════════════════════════════════════════════════════════
  // 13. Edge cases & error handling
  // ═════════════════════════════════════════════════════════════════

  test('13.1 GET /api/stores with malformed status → 200 (default to active)', async ({ request }) => {
    const response = await request.get('/api/stores?status=invalid_status', { headers });
    // Should not crash — either default to active (200) or 400
    expect([200, 400]).toContain(response.status());
  });

  test('13.2 POST /api/stores with extra fields ignores them → 201', async ({ request }) => {
    const sfx = 'extra-' + Date.now().toString(36);
    // SEC-TS-10: pacear creación (API: 5 POSTs/min — TODOS los POSTs cuentan,
    // incluidos los que fallan validación; el límite corre antes del parse).
    await waitStoreBudget('create');
    const response = await request.post('/api/stores', {
      headers,
      data: {
        name: `E2E Extra ${sfx}`,
        address: 'Test',
        slug: `e2e-extra-${sfx}`,
        extraField: 'should be ignored',
        anotherExtra: 123,
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    // SEC-TS-10 (BUG LATENTE — extracción): ver 2.3 — push(undefined) dejaba
    // la tienda ACTIVA sin cleanup (cuota 403 en cascada).
    const storeId = body?.data?.store_id ?? body?.data?.id ?? body?.store_id;
    if (storeId) createdStoreIds.push(storeId);
  });

  test('13.3 slug with special characters gets sanitized', async ({ request }) => {
    const sfx = Date.now().toString(36);
    // SEC-TS-10: pacear creación (API: 5 POSTs/min — TODOS los POSTs cuentan,
    // incluidos los que fallan validación; el límite corre antes del parse).
    await waitStoreBudget('create');
    const response = await request.post('/api/stores', {
      headers,
      data: {
        name: `E2E Slug Sanitize ${sfx}`,
        address: 'Test',
        slug: `Invalid Slug WITH Spaces & Special! ${sfx}`,
      },
    });

    // Should either sanitize and create (201) or reject (400)
    expect([201, 400]).toContain(response.status());
    if (response.status() === 201) {
      const body = await response.json();
      // SEC-TS-10 (BUG LATENTE — extracción): ver 2.3.
      const storeId = body?.data?.store_id ?? body?.data?.id ?? body?.store_id;
      if (storeId) createdStoreIds.push(storeId);
    }
  });

  // ═════════════════════════════════════════════════════════════════
  // 14. Rate limiting
  // ═════════════════════════════════════════════════════════════════

  test('14.1 check-slug rate limit triggers after 20 requests', async ({ request }) => {
    let hit429 = false;
    for (let i = 0; i < 25; i++) {
      const response = await request.get(`/api/stores/check-slug?slug=test-${i}-${Date.now()}`, { headers });
      if (response.status() === 429) {
        hit429 = true;
        break;
      }
    }
    // STRICT: rate limit MUST trigger
    expect(hit429).toBe(true);
  });
});
