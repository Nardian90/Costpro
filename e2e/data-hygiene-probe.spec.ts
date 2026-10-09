/**
 * PROBE — E2E DATA HYGIENE (FASE 12)
 * ============================================================================
 * Prueba controlada de que el mecanismo CREATE → VERIFY → DELETE →
 * VERIFY ABSENCE funciona de extremo a extremo sobre Supabase real.
 *
 * Crea UNA tienda temporal con identificador inequívoco
 * `E2E-CLEANUP-PROBE-<run-id>` y al terminar DEBE quedar eliminada:
 *
 *   E2E-CLEANUP-PROBE = 0
 *
 * Esta spec es el demostrador ejecutable del principio de higiene: una
 * entidad temporal creada por una prueba no permanece en el proyecto.
 * ============================================================================
 */
import { test, expect } from '@playwright/test';
import { getRunId } from './fixtures/run-env';
import { apiHeaders, sb, signIn } from './fixtures/session.fixture';
import { hardDeleteTestStore } from './fixtures/hard-cleanup';

// ============================================================================
// ⛔ DESHABILITADO POR EL PROPIETARIO (2026-10-09) — NO ELIMINAR ESTE BLOQUE
// ----------------------------------------------------------------------------
// Este spec CREA un entorno de run aislado + una tienda probe ('E2E-CLEANUP-PROBE-*') en el proyecto Supabase COMPARTIDO (wthkddeleylijmonclxg)
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

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.E2E_TEST_ADMIN_EMAIL || process.env.E2E_ADMIN_EMAIL || 'admin@costpro.com';
const ADMIN_PASS = process.env.E2E_TEST_ADMIN_PASS || process.env.E2E_ADMIN_PASS || 'costpro123';

test.describe('E2E DATA HYGIENE — probe de creación/eliminación', () => {
  let adminToken = '';
  let probeStoreId = '';

  test('CREATE → VERIFY EXISTS → DELETE → VERIFY ABSENCE (net zero)', async () => {
    test.setTimeout(120_000);
    const runId = getRunId() || `LOCAL-${Date.now().toString(36).toUpperCase()}`;
    const probeName = `E2E-CLEANUP-PROBE-${runId}`;

    // ── CREATE (vía API REAL) ────────────────────────────────────────────
    const session = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    adminToken = session.token;
    await sb.update('profiles', `id=eq.${session.userId}`, { plan: 'enterprise' }).catch(() => {});

    const res = await fetch(`${BASE_URL}/api/stores`, {
      method: 'POST',
      headers: apiHeaders(adminToken),
      body: JSON.stringify({
        name: probeName,
        address: 'Probe de higiene E2E (temporal)',
        phone: '+5355550000',
        email: `e2e-probe-${runId.toLowerCase()}@costpro.test`,
        slug: `e2e_cleanup_probe_${runId.toLowerCase()}`,
        plantilla: 'construccion',
      }),
    });
    expect(res.ok, `CREATE falló: ${res.status}`).toBeTruthy();
    const json = await res.json();
    probeStoreId = json?.data?.store_id ?? json?.data?.id ?? json?.store_id;
    expect(probeStoreId, 'respuesta sin store_id').toBeTruthy();

    // ── VERIFY EXISTS (service-role, estado persistido) ──────────────────
    const created = await sb.select('stores', `select=id,name&id=eq.${probeStoreId}&limit=1`);
    expect(created.length).toBe(1);
    expect(created[0].name).toBe(probeName);

    // ── DELETE (hard delete — mecanismo de higiene) ──────────────────────
    await hardDeleteTestStore(probeStoreId);

    // ── VERIFY ABSENCE ───────────────────────────────────────────────────
    const gone = await sb.select('stores', `select=id&id=eq.${probeStoreId}&limit=1`);
    expect(gone.length).toBe(0);
    probeStoreId = '';
  });

  test.afterAll(async () => {
    // FASE 14 — cleanup garantizado también ante fallo/timeout del test:
    // si el probe quedó creado (fallo a mitad), se elimina aquí.
    if (probeStoreId) {
      await hardDeleteTestStore(probeStoreId).catch(() => {});
    }
  });
});
