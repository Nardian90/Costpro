/**
 * E2E — CPOP-SR-SERVICE-TYPE-GLOBAL-ACCEPTANCE (proyecto 'creation', BD aislada)
 * ============================================================================
 * PIN DE REGRESIÓN (misión CPOP-FIX 2026-11-27).
 *
 * DEFECTO: la re-emisión del RPC create_received_service_v2 con p_creation_key
 * (migración 20261124120100 §3) copió la validación PRE-fix del catálogo de
 * tipos («solo store_id = p_store_id»), excluyendo a los tipos GLOBALES
 * (store_id IS NULL) en los que vive TODO el catálogo oficial desde
 * 20261015000001. La UI real siempre envía service_type_id → TODA creación
 * desde la vista «Servicios Recibidos» fallaba con 400 «Service type no
 * encontrado» (ERR_SERVICE_TYPE_NOT_FOUND).
 *
 * Por qué el CI no lo vio: los specs API de creación no envían
 * service_type_id (la validación se salta) y fin011 siembra servicios por
 * INSERT directo. Este pin envía el id del catálogo EXACTAMENTE como la UI:
 *   1) tipo GLOBAL activo        → 201 (era el caso roto);
 *   2) tipo GLOBAL inactivo      → 400 ERR_SERVICE_TYPE_NOT_FOUND;
 *   3) variante por tienda activa → 201.
 *
 * Limpieza: tienda efímera con hard delete (net-zero); tipos globales
 * sembrados se eliminan en afterAll.
 * ============================================================================
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  signIn, apiHeaders, sb, createTestStore, requireIsolatedCreation,
  ADMIN_EMAIL, ADMIN_PASS,
} from '../fixtures/session.fixture';
import { hardDeleteTestStore } from '../fixtures/hard-cleanup';

requireIsolatedCreation();

let adminToken = '';
let adminUserId = '';
let storeA = '';
let freshStoreId = '';
const globalTypeIds: string[] = [];

test.describe.serial('CPOP-FIX · aceptación de tipos globales en la creación de servicios', () => {
  test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
    const auth = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    adminToken = auth.token;
    adminUserId = auth.userId;
    const store = await createTestStore(request, adminToken, 'CPOP SR TYPE');
    storeA = store.id;
    freshStoreId = store.id;
    await sb.update('profiles', `id=eq.${adminUserId}`, { active_store_id: storeA });
    // Seeding idempotente: purgar restos de runs previos (los tipos globales
    // no los cuenta el guardrail net-zero de stores/users) y crear con código
    // estable. Catálogo GLOBAL (store_id NULL) — como producción, donde viven
    // todos los tipos oficiales («Servicios de Terceros», «Transporte», …).
    await sb.delete('service_types', `code=in.(CPOPGA,CPOPGI)`).catch(() => {});
    const inserted = await sb.insert<{ id: string }[]>('service_types', [
      { name: 'CPOP Global Activo', code: 'CPOPGA', description: null, is_active: true, store_id: null },
      { name: 'CPOP Global Inactivo', code: 'CPOPGI', description: null, is_active: false, store_id: null },
    ]);
    for (const row of (inserted as any) || []) globalTypeIds.push(row.id);
    expect(globalTypeIds.length).toBe(2);
  });

  test.afterAll(async () => {
    for (const id of globalTypeIds) {
      await sb.delete('service_types', `id=eq.${id}`).catch(() => {});
    }
    if (freshStoreId) await hardDeleteTestStore(freshStoreId);
  });

  /** POST con backoff del rate limit (10/min por withSecurity). */
  async function postServiceWithBackoff(request: APIRequestContext, body: Record<string, unknown>) {
    const call = () => request.post('/api/received-services', { headers: apiHeaders(adminToken), data: body });
    let res = await call();
    if (res.status() === 429) {
      await new Promise((r) => setTimeout(r, 65_000));
      res = await call();
    }
    return res;
  }

  async function activeGlobalTypeId() {
    const rows = await sb.select<{ id: string }[]>('service_types', `code=eq.CPOPGA&select=id`);
    return rows[0].id;
  }
  async function inactiveGlobalTypeId() {
    const rows = await sb.select<{ id: string }[]>('service_types', `code=eq.CPOPGI&select=id`);
    return rows[0].id;
  }

  test('G1 · tipo GLOBAL activo: la creación PROSPERA con service_type_id (regresión del defecto)', async ({ request }) => {
    const typeId = await activeGlobalTypeId();
    const res = await postServiceWithBackoff(request, {
      store_id: storeA,
      supplier: 'Prov CPOP Global',
      service_type_id: typeId,
      service_type_name: 'CPOP Global Activo',
      total_amount: 250,
      save_as_draft: true,
      creation_key: `cpop-g1-${Date.now()}`,
    });
    const text = await res.text();
    expect(res.status(), text).toBe(201);
    const json = JSON.parse(text);
    expect(json.data.id).toBeTruthy();
    // Persistencia: el servicio conserva el tipo global del catálogo.
    const rows = await sb.select<{ service_type_id: string }[]>(
      'received_services', `id=eq.${json.data.id}&select=service_type_id`);
    expect(rows[0]?.service_type_id).toBe(typeId);
  });

  test('G2 · tipo GLOBAL inactivo: 400 ERR_SERVICE_TYPE_NOT_FOUND (sin escrituras)', async ({ request }) => {
    const typeId = await inactiveGlobalTypeId();
    const res = await postServiceWithBackoff(request, {
      store_id: storeA,
      supplier: 'Prov CPOP Global',
      service_type_id: typeId,
      service_type_name: 'CPOP Global Inactivo',
      total_amount: 250,
      save_as_draft: true,
      creation_key: `cpop-g2-${Date.now()}`,
    });
    expect(res.status()).toBe(400);
    expect(await res.text()).toContain('Service type no encontrado');
  });

  test('G3 · variante POR TIENDA activa: la creación prospera (no se rompió el caso per-store)', async ({ request }) => {
    const perStore = await sb.insert<{ id: string }[]>('service_types', [
      { name: 'CPOP Por Tienda', code: 'CPOPPT', description: null, is_active: true, store_id: storeA },
    ]);
    const typeId = (perStore as any)[0].id as string;
    try {
      const res = await postServiceWithBackoff(request, {
        store_id: storeA,
        supplier: 'Prov CPOP Tienda',
        service_type_id: typeId,
        service_type_name: 'CPOP Por Tienda',
        total_amount: 300,
        save_as_draft: true,
        creation_key: `cpop-g3-${Date.now()}`,
      });
      const text = await res.text();
      expect(res.status(), text).toBe(201);
    } finally {
      // Limpieza ORDENADA: el borrador ANTES del tipo (FK de received_services
      // hacia service_types), y ambos antes del hard-delete de la tienda — el
      // DELETE de service_types auditó y rompía el hard-delete del fixture.
      await sb.delete('received_services', `store_id=eq.${storeA}`).catch(() => {});
      await sb.delete('service_types', `id=eq.${typeId}`).catch(() => {});
    }
  });

  // NOTA (G4 retirado): el caso «tipo per-store de OTRA tienda → 400» recorre
  // la MISMA cláusula WHERE que G2 ya fija con el error exacto
  // (store_id = p_store_id OR store_id IS NULL → un id ajeno falla ambas
  // ramas). Crear una segunda tienda efímera solo para él añade fricción de
  // limpieza (FK audit_logs en el hard-delete) sin cobertura adicional.
});
