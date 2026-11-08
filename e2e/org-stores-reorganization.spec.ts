/**
 * CP-UX-ORG-STORES-001 — E2E: reorganización Organizaciones / Gestión de
 * Tiendas.
 * ============================================================================
 * Flujos de la misión (§6) contra la app REAL (Browser → API → DB; sin mocks):
 *
 *   1 · Navegación: SISTEMA → Organizaciones lista las organizaciones del
 *       alcance; el hub Gestión de Tiendas expone los nuevos tabs
 *       (Configuración | Resumen | Vitrina | Catálogo).
 *   2 · Acceso evidente: la acción «Tiendas» de la organización abre el
 *       detalle en el tab de gestión con el banner de contexto y las tiendas
 *       de ESA organización.
 *   3 · Separación de datos (run aislado + superadmin): una segunda
 *       organización creada vía API muestra SOLO su tienda — ni las piloto
 *       A/B ni nada ajeno. La creación con organization_id fija el tenant
 *       server-side (verificación service-role de stores.tenant_id).
 *   4 · Configuración: la pestaña del hub edita la TIENDA ACTIVA (no otra
 *       sucursal), persiste en DB y se restaura.
 *   5 · Compatibilidad: el deep-link /?view=stores sigue operativo.
 *
 * Entorno: CostproE2E (BD aislada; global-setup verifica el centinela).
 * NUNCA se modifican tiendas protegidas (Enervida, Puerto Padre, Tienda
 * Central). La edición de Configuración opera sobre la tienda activa (piloto)
 * y se RESTAURA al valor original en el mismo test.
 * ============================================================================
 */
import { test, expect } from '@playwright/test';
import {
  ADMIN_EMAIL, ADMIN_PASS,
  signIn, injectSession, apiHeaders, sb,
  type Session,
} from './fixtures/session.fixture';
import { getPilotEnv } from './fixtures/pilot-env';
import { isIsolatedRun, getRunId } from './fixtures/run-env';

const E2E_PHONE = '70000000';

let adminSession: Session;
let adminToken: string;
let adminId: string;
let adminRole = '';
let pilotA: { id: string; name: string };
let pilotB: { id: string; name: string };
let pilotTenantId: string | null = null;
let pilotPhone: string | null = null;

// Recursos efímeros del run (solo modo aislado + superadmin) — cleanup en afterAll
let extraOrgId: string | null = null;
let extraStoreId: string | null = null;

test.beforeAll(async () => {
  const session = await signIn(ADMIN_EMAIL, ADMIN_PASS);
  adminSession = session;
  adminToken = session.token;
  adminId = session.userId;

  const pilot = await getPilotEnv();
  pilotA = pilot.storeA;
  pilotB = pilot.storeB;

  const tenantRows = await sb.select<{ tenant_id: string | null }>(
    'stores', `id=eq.${pilotA.id}&select=tenant_id`,
  );
  pilotTenantId = tenantRows[0]?.tenant_id ?? null;

  const prof = await sb.select<{ role: string }>('profiles', `id=eq.${adminId}&select=role`);
  adminRole = prof[0]?.role ?? '';
});

test.afterAll(async () => {
  // Cleanup de los recursos efímeros (run aislado): hard-delete con
  // service-role — la org de prueba no tiene usuarios asignados y la tienda
  // de prueba no tiene datos operativos.
  try {
    if (extraStoreId) await sb.delete('stores', `id=eq.${extraStoreId}`);
    if (extraOrgId) await sb.delete('tenants', `id=eq.${extraOrgId}`);
  } catch (e) {
    console.warn('[org-stores] cleanup afterAll:', e);
  }
});

async function openOrgStoresTab(page: import('@playwright/test').Page, orgName: string) {
  await page.goto('/?view=organizations');
  await expect(page.getByRole('heading', { name: 'Organizaciones' })).toBeVisible({ timeout: 30_000 });
  const row = page.locator('tr', { hasText: orgName }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole('button', { name: `Opciones de ${orgName}` }).click();
  await page.getByRole('menuitem', { name: 'Tiendas' }).click();
  // El detalle abre en el tab Tiendas con el banner de contexto
  await expect(page.getByText('Tiendas de').first()).toBeVisible({ timeout: 30_000 });
}

test.describe('CP-UX-ORG-STORES-001 · Organizaciones y Gestión de Tiendas', () => {

  test('1 · SISTEMA → Organizaciones: la vista lista organizaciones con acción «Tiendas»', async ({ page }) => {
    await injectSession(page, adminSession);
    await page.goto('/?view=organizations');
    await expect(page.getByRole('heading', { name: 'Organizaciones' })).toBeVisible({ timeout: 30_000 });
    // La tabla de organizaciones renderiza filas (alcance del rol: todas o la propia)
    await expect(page.locator('table[aria-label="Listado de organizaciones"] tbody tr').first())
      .toBeVisible({ timeout: 20_000 });
    // El hub Gestión de Tiendas conserva su identidad con los nuevos tabs
    await page.goto('/?view=management-hub');
    await expect(page.getByRole('heading', { name: 'Gestión de Tiendas' })).toBeVisible({ timeout: 30_000 });
    const tablist = page.getByRole('tablist', { name: 'Secciones de Gestión' });
    await expect(tablist.getByRole('tab', { name: 'Configuración' })).toBeVisible();
    await expect(tablist.getByRole('tab', { name: 'Resumen' })).toBeVisible();
    await expect(tablist.getByRole('tab', { name: 'Vitrina' })).toBeVisible();
    await expect(tablist.getByRole('tab', { name: 'Catálogo' })).toBeVisible();
    // El listado organizativo ya NO es tab del hub (vive en Organizaciones)
    await expect(tablist.getByRole('tab', { name: 'Tiendas' })).toHaveCount(0);
  });

  test('2 · La organización seleccionada administra SUS tiendas (scoping server-side)', async ({ page }) => {
    test.skip(!pilotTenantId, 'Pilotos persistentes legacy sin organización: el flujo por organización se valida en run aislado');
    const orgRows = await sb.select<{ name: string }>('tenants', `id=eq.${pilotTenantId}&select=name`);
    const orgName = orgRows[0]?.name;
    test.skip(!orgName, 'Organización de los pilotos no encontrada');

    await injectSession(page, adminSession);
    await openOrgStoresTab(page, orgName!);

    // Las tiendas de ESA organización están en la gestión scoped
    await expect(page.getByText(pilotA.name).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(pilotB.name).first()).toBeVisible();
  });

  test('3 · Separación de organizaciones: la segunda organización muestra SOLO su tienda', async ({ page }) => {
    test.skip(!isIsolatedRun() || adminRole !== 'superadmin',
      'Creación de organizaciones/tiendas efímeras: solo run aislado con superadmin');

    await injectSession(page, adminSession);

    // a) Crear organización efímera (solo superadmin — acción de plataforma)
    const orgName = `E2E ORG ORGSTORES ${getRunId()}`;
    const resOrg = await fetch(`${BASE_URL}/api/organizations`, {
      method: 'POST',
      headers: apiHeaders(adminToken),
      body: JSON.stringify({ name: orgName, is_active: true }),
    });
    expect(resOrg.status).toBe(201);
    const orgBody = await resOrg.json();
    extraOrgId = orgBody.organization.id;

    // b) Crear tienda DENTRO de esa organización (organization_id → tenant server-side)
    const storeName = `E2E STORE ORGSTORES ${getRunId()}`;
    const resStore = await fetch(`${BASE_URL}/api/stores`, {
      method: 'POST',
      headers: apiHeaders(adminToken),
      body: JSON.stringify({ name: storeName, address: 'Calle E2E 1', organization_id: extraOrgId }),
    });
    expect(resStore.status).toBe(201);

    // c) Prueba dura: la tienda quedó registrada en la organización destino
    const tenantRows = await sb.select<{ tenant_id: string | null }>(
      'stores', `name=eq.${encodeURIComponent(storeName)}&select=tenant_id`,
    );
    expect(tenantRows[0]?.tenant_id).toBe(extraOrgId);
    const storeRows = await sb.select<{ id: string }>('stores', `name=eq.${encodeURIComponent(storeName)}&select=id`);
    extraStoreId = storeRows[0]?.id;

    // d) UI: la org de prueba muestra SU tienda y no las de otras organizaciones
    await openOrgStoresTab(page, orgName);
    await expect(page.getByText(storeName).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(pilotA.name)).toHaveCount(0);
    await expect(page.getByText(pilotB.name)).toHaveCount(0);
  });

  test('4 · Pestaña Configuración: edita la TIENDA ACTIVA, persiste y se restaura', async ({ page }) => {
    await injectSession(page, adminSession);

    // Contexto determinista: tienda activa = piloto A (mismo patrón que sc212)
    await sb.update('profiles', `id=eq.${adminId}`, { active_store_id: pilotA.id });

    await page.goto('/?view=management-hub');
    await expect(page.getByRole('heading', { name: 'Gestión de Tiendas' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('tab', { selected: true })).toHaveText(/Configuración/);

    const form = page.getByTestId('store-edit-form');
    await expect(form).toBeVisible({ timeout: 30_000 });
    // El formulario muestra la tienda ACTIVA (nunca otra sucursal)
    await expect(form.getByText(pilotA.name).first()).toBeVisible();

    // Edición segura: teléfono → guardar → verificar en DB → restaurar
    const phoneRows = await sb.select<{ phone: string | null }>('stores', `id=eq.${pilotA.id}&select=phone`);
    pilotPhone = phoneRows[0]?.phone ?? null;

    const phoneInput = form.locator('#store-settings-phone');
    await phoneInput.fill(E2E_PHONE);
    await form.getByRole('button', { name: /saveChanges|Guardar/ }).click();
    await expect(page.getByText(/updateSuccess|actualizada/i).first()).toBeVisible({ timeout: 15_000 });

    // Persistencia REAL en DB (service-role verification)
    await expect.poll(async () => {
      const rows = await sb.select<{ phone: string | null }>('stores', `id=eq.${pilotA.id}&select=phone`);
      return rows[0]?.phone ?? null;
    }, { timeout: 20_000 }).toBe(E2E_PHONE);

    // Restauración al valor original
    const restoreValue = pilotPhone ?? '';
    await phoneInput.fill(restoreValue);
    await form.getByRole('button', { name: /saveChanges|Guardar/ }).click();
    await expect.poll(async () => {
      const rows = await sb.select<{ phone: string | null }>('stores', `id=eq.${pilotA.id}&select=phone`);
      return rows[0]?.phone ?? '';
    }, { timeout: 20_000 }).toBe(restoreValue);
  });

  test('5 · Compatibilidad: el deep-link /?view=stores sigue operativo', async ({ page }) => {
    await injectSession(page, adminSession);
    await page.goto('/?view=stores');
    // La vista técnica transversal sigue renderizando el listado (StoreCard)
    await expect(page.getByText(pilotA.name).first()).toBeVisible({ timeout: 30_000 });
  });
});
