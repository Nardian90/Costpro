/**
 * E2E P0 — ROLES, PERMISOS Y AISLAMIENTO MULTI-TIENDA
 * ============================================================================
 * Escenarios (ver e2e/SCENARIO-INVENTORY.md):
 *   E2E-RBAC-001 (P0) clerk no puede crear tiendas → 403
 *   E2E-RBAC-002 (P0) clerk no puede crear usuarios gestionados → 403
 *   E2E-RBAC-003 (P0) clerk no puede resetear una tienda → 403
 *   E2E-RBAC-004 (P0) warehouse no accede a endpoints de administración → 403
 *   E2E-RBAC-005 (P0) encargado CON membership activa SÍ puede gestionar su tienda
 *   E2E-RBAC-006 (P0) usuario sin membership NO ve la tienda ajena en su listado
 *   E2E-RBAC-007 (P1) UI: vista de administración bloqueada para clerk (Acceso Denegado)
 *
 * E2E-FIXTURE-REUSE (2026-10-09): este spec FUNCIONAL reutiliza identidades
 * demo preexistentes (admin@costpro.com, cajero@demo.com, almacen@demo.com,
 * encargado@demo.com — protegidas por gobernanza) y la tienda PILOTO
 * PERSISTENTE A vía el modo reuse de session.fixture (createTestStore →
 * Piloto A, deleteTestStore → no-op). NADA se crea ni se elimina:
 *   * La membership temporal del encargado sobre la piloto se inserta en el
 *     beforeAll y se ELIMINA en el afterAll (reversible).
 *   * E2E-RBAC-005 verifica autorización + persistencia con un PATCH no-op
 *     (address = address actual) → estado de la piloto net-zero.
 *
 * NOTA: E2E-RBAC-008 (creación de usuario gestionado) se SEPARÓ al proyecto
 * 'creation' → e2e/creation/rbac008-managed-user-creation.spec.ts.
 *
 * Roles reales del sistema: admin | encargado | usuario | manager | clerk |
 * warehouse | costo (src/types/index.ts). Usuarios demo reales:
 * cajero@demo.com (clerk), almacen@demo.com (warehouse), encargado@demo.com.
 * ============================================================================
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  ADMIN_EMAIL, ADMIN_PASS, CLERK_EMAIL, CLERK_PASS,
  WAREHOUSE_EMAIL, WAREHOUSE_PASS, ENCARGADO_EMAIL, ENCARGADO_PASS,
  signIn, apiHeaders, sb, createTestStore, TestStore,
} from '../fixtures/session.fixture';

let api: APIRequestContext;
let adminToken: string;
let clerkToken: string;
let warehouseToken: string;
let encargadoToken: string;
let encargadoId: string;
let store: TestStore;
let originalAddress: string | null = null;

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000' });
  const admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
  adminToken = admin.token;
  const clerk = await signIn(CLERK_EMAIL, CLERK_PASS);
  clerkToken = clerk.token;
  const warehouse = await signIn(WAREHOUSE_EMAIL, WAREHOUSE_PASS);
  warehouseToken = warehouse.token;
  const encargado = await signIn(ENCARGADO_EMAIL, ENCARGADO_PASS);
  encargadoToken = encargado.token;

  // Identidad REAL del encargado demo (el placeholder legacy no sirve para
  // insertar memberships). En modo aislado el global-setup exporta el ID;
  // en legacy compartido se resuelve por email (usuario protegido).
  if (process.env.E2E_ENCARGADO_ID) {
    encargadoId = process.env.E2E_ENCARGADO_ID;
  } else {
    const rows = await sb.select<{ id: string }>(
      'profiles', `email=eq.${encodeURIComponent(ENCARGADO_EMAIL)}&select=id&limit=1`,
    );
    if (!rows[0]?.id) throw new Error(`[roles-permissions] No se encontró el perfil del encargado (${ENCARGADO_EMAIL})`);
    encargadoId = rows[0].id;
  }
});

test.afterAll(async () => {
  if (store?.id && encargadoId) {
    // Reversión de la membership temporal insertada en el beforeAll del describe
    await sb.delete('user_store_memberships', `user_id=eq.${encargadoId}&store_id=eq.${store.id}`).catch(() => {});
  }
  await api?.dispose().catch(() => {});
});

test.describe('Roles y permisos — autorización por rol', () => {
  test.beforeAll(async () => {
    // E2E-FIXTURE-REUSE: devuelve la PILOTO A persistente (no crea nada).
    store = await createTestStore(api, adminToken, 'RBAC');

    // Address original de la piloto (para el PATCH no-op de RBAC-005)
    const rows = await sb.select<{ address: string | null }>(
      'stores', `id=eq.${store.id}&select=address`,
    ).catch(() => [] as Array<{ address: string | null }>);
    originalAddress = rows[0]?.address ?? '';

    // Setup REVERSIBLE: membership activa de encargado en la piloto (eliminada
    // en el afterAll del archivo). El encargado demo no la tiene por defecto.
    await sb.delete('user_store_memberships', `user_id=eq.${encargadoId}&store_id=eq.${store.id}`).catch(() => {});
    await sb.insert('user_store_memberships', [{
      user_id: encargadoId,
      store_id: store.id,
      role: 'encargado',
      status: 'active',
    }]);
  });

  test('E2E-RBAC-001 (P0) clerk no puede crear tiendas → 403', async () => {
    const res = await api.post('/api/stores', {
      headers: apiHeaders(clerkToken),
      data: { name: 'Tienda Hackeada E2E', address: 'X', plantilla: 'construccion' },
    });
    expect(res.status()).toBe(403);
  });

  test('E2E-RBAC-002 (P0) clerk no puede crear usuarios gestionados → 403', async () => {
    const res = await api.post('/api/users/managed-create', {
      headers: apiHeaders(clerkToken),
      data: { p_email: 'hacker-e2e@costpro.test', p_role: 'usuario', p_store_id: store.id },
    });
    expect(res.status()).toBe(403);
  });

  test('E2E-RBAC-003 (P0) clerk no puede resetear una tienda → 403', async () => {
    const res = await api.post('/api/stores/reset', {
      headers: apiHeaders(clerkToken),
      data: { storeId: store.id },
    });
    expect(res.status(), 'reset es operación destructiva: solo gestión').toBe(403);
  });

  test('E2E-RBAC-004 (P0) warehouse no accede a endpoints de administración → 403', async () => {
    const res = await api.post('/api/users/toggle-status', {
      headers: apiHeaders(warehouseToken),
      data: { userId: encargadoId },
    });
    expect(res.status()).toBe(403);
  });

  test('E2E-RBAC-005 (P0) encargado con membership activa puede gestionar su tienda', async () => {
    // PATCH /api/stores requiere canManageStore (admin global O membership
    // admin/manager/encargado activa en esa tienda).
    // E2E-FIXTURE-REUSE: la piloto es PERSISTENTE → el PATCH es NO-OP
    // (address = address actual) y así la verificación de autorización y de
    // persistencia conserva su valor sin mutar el estado de la piloto.
    const targetAddress = originalAddress ?? 'Calle Piloto A';
    const res = await api.patch('/api/stores', {
      headers: apiHeaders(encargadoToken),
      data: { storeId: store.id, address: targetAddress },
    });
    expect(res.status(), `body: ${await res.text()}`).toBe(200);

    // Persistido (idempotente: el valor enviado es el ya vigente)
    const rows = await sb.select('stores', `id=eq.${store.id}&select=address`);
    expect(rows[0].address).toBe(targetAddress);
  });

  test('E2E-RBAC-006 (P0) usuario sin membership NO ve la tienda ajena en su listado', async () => {
    const res = await api.get('/api/stores', { headers: apiHeaders(clerkToken) });
    expect(res.status()).toBe(200);
    const json = await res.json();
    const storesList = json.data ?? json ?? [];
    const ids = JSON.stringify(storesList);
    expect(ids.includes(store.id), 'la tienda sin membership no debe aparecer para el clerk').toBe(false);
  });

  test('E2E-RBAC-007 (P1) UI: vista de administración bloqueada para clerk (Acceso Denegado)', async ({ page }) => {
    test.setTimeout(90_000);
    const session = await signIn(CLERK_EMAIL, CLERK_PASS);
    await page.addInitScript(([key, val]: any) => window.localStorage.setItem(key, val), [
      `sb-${(process.env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https?:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]}-auth-token`,
      JSON.stringify({
        access_token: session.token, token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: session.refreshToken || 'mock-refresh',
        user: { id: session.userId, email: CLERK_EMAIL },
      }),
    ]);

    await page.goto('/?view=users');
    // El guard de vista (isViewAllowedForRole) renderiza el aviso de acceso denegado
    await expect(
      page.getByText(/acceso denegado/i).first(),
      'la vista users debe estar bloqueada para rol clerk',
    ).toBeVisible({ timeout: 45_000 });
  });
});
