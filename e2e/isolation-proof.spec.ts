/**
 * E2E-RUNNER-ISOLATION — Spec de prueba de aislamiento entre corridas
 * ============================================================================
 * Vehículo de evidencia para FASES 9 y 10 (concurrencia + cleanup cruzado).
 * Se lanza DOS VECES simultáneamente por e2e/scripts/concurrency-proof.cjs,
 * cada instancia como un runner INDEPENDIENTE (E2E_RUN_ID/usuarios/tenant/
 * pilotos propios provisionados por su global-setup en modo aislado).
 *
 * Verifica, contra la API REAL y la DB (service-role, lectura):
 *
 *   ISO-001  Identidad del run: RUN_ID/tenant/pilotos activos/productos.
 *   ISO-002  createTestStore crea la tienda efímera en el TENANT del run.
 *   ISO-003  sweepStaleTestStores NO modifica tiendas de PRUEBA de otros
 *            tenants (snapshot antes/después, incluye pilotos legacy T0).
 *   ISO-004  freeActiveTestQuota NO archiva tiendas de otros tenants.
 *   ISO-005  active_store: tras simular un switch a la tienda efímera y
 *            restaurar, apunta al PILOT A del run (nunca al hardcode
 *            legacy Puerto Padre ni a nada ajeno).
 *   ISO-006  Cleanup propio: la tienda efímera propia queda eliminada y el
 *            PEER (si E2E_PEER_RUN_CONTEXT apunta al context del otro run)
 *            permanece INTACTO (store activa, active_store no invadido).
 *
 * Este spec NO cambia asserts de negocio de la suite existente: es aditivo
 * y solo ejercita los mecanismos de aislamiento introducidos.
 * ============================================================================
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'fs';
import {
  ADMIN_EMAIL,
  ADMIN_PASS,
  signIn,
  apiHeaders,
  sb,
  createTestStore,
  deleteTestStore,
  restoreActiveStore,
  sweepStaleTestStores,
  freeActiveTestQuota,
  type TestStore,
} from './fixtures/session.fixture';

const RUN_ID = process.env.E2E_RUN_ID || '';
const TENANT_ID = process.env.E2E_RUN_TENANT_ID || '';
const PILOT_A = process.env.E2E_PILOT_STORE_A || '';
const PILOT_B = process.env.E2E_PILOT_STORE_B || '';
const PRODUCT_A = process.env.E2E_TEST_PRODUCT_ID || '';
const PEER_CONTEXT = process.env.E2E_PEER_RUN_CONTEXT || '';

interface StoreRow {
  id: string;
  name: string;
  is_active: boolean;
  is_archived: boolean;
  tenant_id: string | null;
}

/** Tiendas de PRUEBA activas en tenants AJENOS (incluye T0 legacy/pilotos). */
async function foreignTestStores(): Promise<StoreRow[]> {
  return sb.select<StoreRow>(
    'stores',
    `select=id,name,is_active,is_archived,tenant_id&is_active=eq.true&tenant_id=neq.${TENANT_ID}&name=like.E2E*`,
  );
}

interface PeerContext {
  runId: string;
  tenantId: string;
  users: { admin: { id: string } };
  pilotStoreA: { id: string; name: string };
}

function loadPeer(): PeerContext | null {
  if (!PEER_CONTEXT) return null;
  try {
    return JSON.parse(readFileSync(PEER_CONTEXT, 'utf8')) as PeerContext;
  } catch {
    return null;
  }
}

test.describe('E2E-RUNNER-ISOLATION — aislamiento entre corridas', () => {
  test.skip(!RUN_ID || !TENANT_ID, 'Requiere modo aislado (E2E_RUN_ID / E2E_RUN_TENANT_ID)');

  let api: APIRequestContext;
  let adminToken = '';
  let adminId = '';
  let ephemeral: TestStore | null = null;
  let foreignBefore: StoreRow[] = [];

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000' });
    const session = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    adminToken = session.token;
    adminId = session.userId;
  });

  test.afterAll(async () => {
    if (ephemeral?.id && adminToken) {
      await deleteTestStore(api, adminToken, ephemeral.id);
    }
    await api?.dispose().catch(() => {});
  });

  test('ISO-001 identidad del run es única y autocontenida', async () => {
    expect(RUN_ID).toMatch(/^E2E-\d{8}-[A-F0-9]{6}$/);
    expect(PILOT_A).toBeTruthy();
    expect(PILOT_B).toBeTruthy();
    expect(PRODUCT_A).toBeTruthy();
    expect(adminId).toBeTruthy();

    const own = await sb.select<StoreRow>(
      'stores',
      `select=id,name,is_active,is_archived,tenant_id&id=in.("${PILOT_A}","${PILOT_B}")`,
    );
    expect(own.length, 'los dos pilotos del run existen').toBe(2);
    for (const s of own) {
      expect(s.tenant_id, `piloto ${s.name} en el tenant del run`).toBe(TENANT_ID);
      expect(s.is_active, `piloto ${s.name} activo`).toBe(true);
      expect(s.is_archived, `piloto ${s.name} no archivado`).toBe(false);
    }

    const products = await sb.select<{ id: string }>(
      'products',
      `select=id&store_id=eq.${PILOT_A}&id=eq.${PRODUCT_A}`,
    );
    expect(products.length, 'producto de referencia sembrado en el piloto A del run').toBe(1);

    const adminEmail = process.env.E2E_ADMIN_EMAIL || '';
    expect(adminEmail, 'email del admin del run namespaced').toContain('e2e-');
  });

  test('ISO-002 createTestStore crea la tienda efímera en el TENANT del run', async () => {
    ephemeral = await createTestStore(api, adminToken, 'ISO');
    expect(ephemeral.id).toBeTruthy();
    expect(ephemeral.name, 'nombre namespaced por run').toContain(RUN_ID);

    const rows = await sb.select<StoreRow>(
      'stores',
      `select=id,name,is_active,is_archived,tenant_id&id=eq.${ephemeral.id}`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].tenant_id, 'la tienda efímera vive en el tenant del run').toBe(TENANT_ID);
    expect(rows[0].is_active).toBe(true);
  });

  test('ISO-003 sweepStaleTestStores NO toca tiendas de otros tenants', async () => {
    foreignBefore = await foreignTestStores();
    // El sweep aplica la higiene como en cualquier corrida (patrones globales
    // + edad) — en modo aislado debe quedar acotado al tenant propio.
    await sweepStaleTestStores();
    const after = await foreignTestStores();
    expect(
      new Set(after.map((s) => s.id)),
      'ninguna tienda de prueba ajena cambia de estado (mismo conjunto activo)',
    ).toEqual(new Set(foreignBefore.map((s) => s.id)));
  });

  test('ISO-004 freeActiveTestQuota NO archiva tiendas de otros tenants', async () => {
    foreignBefore = await foreignTestStores();
    const freed = await freeActiveTestQuota(ephemeral ? [ephemeral.id] : []);
    const after = await foreignTestStores();
    expect(
      new Set(after.map((s) => s.id)),
      'ninguna tienda de prueba ajena fue archivada para liberar cuota',
    ).toEqual(new Set(foreignBefore.map((s) => s.id)));
    // La cuota liberada, si la hay, solo proviene del tenant propio.
    expect(typeof freed).toBe('number');
  });

  test('ISO-005 active_store del admin propio se restaura al PILOT A del run', async () => {
    // Simular el switch que hacen los specs UI hacia la tienda efímera propia
    if (ephemeral?.id) {
      await sb.update('profiles', `id=eq.${adminId}`, { active_store_id: ephemeral.id });
    }
    await restoreActiveStore(adminId);
    const rows = await sb.select<{ active_store_id: string | null }>(
      'profiles',
      `id=eq.${adminId}&select=active_store_id&limit=1`,
    );
    expect(rows[0]?.active_store_id, 'restaurado al piloto A del RUN').toBe(PILOT_A);
    expect(rows[0]?.active_store_id, 'nunca al hardcode legacy compartido (Puerto Padre)')
      .not.toBe('43a4dabc-b8b4-4b66-82b3-0c75335ca5d1');
  });

  test('ISO-006 cleanup propio elimina SOLO lo propio — el peer permanece intacto', async () => {
    expect(ephemeral?.id, 'ISO-002 debe haber corrido antes').toBeTruthy();
    const peer = loadPeer();

    let peerStoreBefore: StoreRow | null = null;
    if (peer) {
      const rows = await sb.select<StoreRow>(
        'stores',
        `select=id,name,is_active,is_archived,tenant_id&id=eq.${peer.pilotStoreA.id}`,
      );
      peerStoreBefore = rows[0] ?? null;
      expect(peerStoreBefore, 'la tienda piloto del PEER existe y está activa').toBeTruthy();
      expect(peerStoreBefore!.is_active).toBe(true);
      expect(peerStoreBefore!.tenant_id, 'el peer vive en otro tenant').not.toBe(TENANT_ID);
    }

    // Cleanup propio (flujo REAL de DELETE con fallback de archivado)
    await deleteTestStore(api, adminToken, ephemeral!.id);

    const ownRows = await sb.select<StoreRow>(
      'stores',
      `select=id,is_active,is_archived&id=eq.${ephemeral!.id}`,
    );
    expect(ownRows.length).toBe(1);
    expect(
      ownRows[0].is_active === false || ownRows[0].is_archived === true,
      'la tienda efímera propia queda inactiva/archivada',
    ).toBe(true);
    ephemeral = null; // afterAll no debe reintentar el cleanup

    if (peer) {
      const peerRows = await sb.select<StoreRow>(
        'stores',
        `select=id,name,is_active,is_archived,tenant_id&id=eq.${peer.pilotStoreA.id}`,
      );
      expect(peerRows[0], 'la tienda del PEER sigue existiendo').toBeTruthy();
      expect(peerRows[0].is_active, 'la tienda del PEER sigue ACTIVA tras el cleanup propio').toBe(true);
      expect(peerRows[0].is_archived, 'la tienda del PEER no fue archivada').toBe(false);
      expect(peerRows[0].name).toBe(peerStoreBefore!.name);

      // El active_store del admin del PEER nunca apunta a una tienda del RUN
      const peerProfile = await sb.select<{ active_store_id: string | null }>(
        'profiles',
        `id=eq.${peer.users.admin.id}&select=active_store_id&limit=1`,
      );
      const peerActive = peerProfile[0]?.active_store_id ?? null;
      expect(
        peerActive === null || peerActive === peer.pilotStoreA.id || peerActive === PILOT_B,
        `active_store del peer (${peerActive}) no fue invadido por este run`,
      ).toBe(true);
    }
  });
});
