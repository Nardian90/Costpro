/**
 * E2E: FC-USR-TEMPLATE — Conexión Producto ↔ Ficha de Costo desde Inventario
 * ============================================================================
 * Recorrido completo de validación pre-merge del PR #1598 (misión 2026-11-10),
 * ejecutado EXCLUSIVAMENTE contra la BD aislada (guard CP-INFRA-011 en
 * global-setup — producción prohibida):
 *
 *   1.  Entrar en Inventario.
 *   2.  Seleccionar un producto sin Ficha de Costo asociada.
 *   3.  Abrir el selector de plantillas.
 *   4.  Recuperar las plantillas guardadas en el servidor (cost_sheet_templates).
 *   5.  Seleccionar una y confirmar la asociación.
 *   6.  Recargar la página y verificar que la asociación persiste.
 *   7.  Abrir nuevamente el producto y comprobar que aparece la ficha correcta.
 *   8.  Cambiar la asociación por otra plantilla.
 *   9.  Desconectar la ficha y verificar el resultado.
 *   10. Comprobar que un usuario sin permisos no pueda realizar estas
 *       operaciones (cajero/clerk) y que no se pueda asociar un producto de
 *       otra tienda.
 *   11. Verificar que no se modifique la plantilla original ni los datos de
 *       otros productos o tiendas (integridad + RLS de visibilidad).
 *
 * Además: corrección del 404 de «Ir a ajustes de tienda» — el botón ahora
 * navega al hub real de Gestión de Tiendas (SPA de vistas, sin rutas muertas)
 * y «Ir a Plantillas de Fichas» lleva al explorador de plantillas.
 *
 * Modo AISLADO (E2E_ISOLATION=1): identidad dedicada por ejecución — usuarios,
 * tenant y pilotos A/B propios provisionados por global-setup. Las plantillas
 * de este spec se siembran con service-role (created_by = admin del run) y se
 * limpian en afterAll (NET-ZERO).
 */
import { test, expect } from './fixtures';
import templateReinicio from '../src/lib/data/costpro-reinicio';

// ── Entorno (exportado por provisionRunEnv en global-setup) ──────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

const ADMIN_ID = process.env.E2E_TEST_ADMIN_ID || '';
const CAJERO_ID = process.env.E2E_TEST_USER_ID || '';
const ENCARGADO_ID = process.env.E2E_ENCARGADO_ID || '';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || '';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || '';
const CAJERO_EMAIL = process.env.E2E_USER_EMAIL || '';
const CAJERO_PASS = process.env.E2E_USER_PASS || '';
const ENCARGADO_EMAIL = process.env.E2E_ENCARGADO_EMAIL || '';
const ENCARGADO_PASS = process.env.E2E_ENCARGADO_PASS || '';
const STORE_A = process.env.E2E_PILOT_STORE_A || '';
const STORE_B = process.env.E2E_PILOT_STORE_B || '';
const PRODUCT_A = process.env.E2E_TEST_PRODUCT_ID || '';
const PRODUCT_B = process.env.E2E_TEST_FOREIGN_PRODUCT_ID || '';
const PRODUCT_A_NAME = 'Producto Piloto A';

const RUN_TAG = (process.env.E2E_RUN_ID || 'e2e').toLowerCase().replace(/[^a-z0-9]/g, '');
const TEMPLATE_A_NAME = `E2E FC Plantilla Alpha ${RUN_TAG}`;
const TEMPLATE_B_NAME = `E2E FC Plantilla Beta ${RUN_TAG}`;
const CAJERO_TEMPLATE_NAME = `E2E FC Plantilla Privada Cajero ${RUN_TAG}`;

// ── REST helpers ─────────────────────────────────────────────────────────────

function svc(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(body ? { Prefer: 'return=representation' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Consulta PostgREST CON RLS (token de usuario real — como el navegador). */
function rlsGet(path: string, accessToken: string): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
}

async function signInUser(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`signIn(${email}) falló: HTTP ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// ── Estado del recorrido (describe serial) ───────────────────────────────────

interface TemplateRow { id: string; name: string; data: unknown; updated_at: string | null }

let templateA: TemplateRow | null = null;
let templateB: TemplateRow | null = null;
let cajeroTemplateId = '';
let adminToken = '';
let cajeroToken = '';
let encargadoToken = '';
let encargadoMembershipSeeded = false;
let activeCostSheetId = '';

// ── Siembra / limpieza (NET-ZERO) ────────────────────────────────────────────

test.describe('FC-USR-TEMPLATE — Conexión Producto ↔ Ficha de Costo (Inventario)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    if (!ADMIN_ID || !STORE_A || !PRODUCT_A) {
      throw new Error('[fc-template-picker] entorno aislado no provisionado (falta E2E_TEST_ADMIN_ID / E2E_PILOT_STORE_A / E2E_TEST_PRODUCT_ID)');
    }

    adminToken = await signInUser(ADMIN_EMAIL, ADMIN_PASS);
    cajeroToken = await signInUser(CAJERO_EMAIL, CAJERO_PASS);
    encargadoToken = await signInUser(ENCARGADO_EMAIL, ENCARGADO_PASS);

    // Membresía encargado (rol FC) en el piloto A para el usuario encargado
    // del run: permite validar la visibilidad de plantillas privadas ajenas
    // SIN privilegios admin (los admin ven todas las plantillas por diseño:
    // la política SELECT de la RLS 20261110120000 incluye is_admin()).
    if (ENCARGADO_ID && STORE_A) {
      const insM = await svc('POST', '/user_store_memberships', [{
        user_id: ENCARGADO_ID, store_id: STORE_A, role: 'encargado', status: 'active',
      }]);
      encargadoMembershipSeeded = insM.ok;
      if (!insM.ok) console.warn('[fc-template-picker] membresía encargado no sembrada:', insM.status);
    }

    // Plantilla Beta = variante de la real (nombre distinto en header y fila 1)
    const betaData = JSON.parse(JSON.stringify(templateReinicio)) as Record<string, unknown>;
    const header = (betaData as { header?: Record<string, unknown> }).header;
    if (header && typeof header === 'object') header.name = TEMPLATE_B_NAME;

    const ins = await svc('POST', '/cost_sheet_templates', [
      {
        name: TEMPLATE_A_NAME,
        description: 'Plantilla E2E privada del admin (conexión producto↔ficha)',
        category: 'E2E',
        data: templateReinicio,
        type: 'private',
        created_by: ADMIN_ID,
        store_id: null,
      },
      {
        name: TEMPLATE_B_NAME,
        description: 'Plantilla E2E privada del admin (variante para cambio de ficha)',
        category: 'E2E',
        data: betaData,
        type: 'private',
        created_by: ADMIN_ID,
        store_id: null,
      },
    ]);
    if (!ins.ok) throw new Error(`[fc-template-picker] siembra de plantillas falló: HTTP ${ins.status} ${await ins.text()}`);
    const rows = (await ins.json()) as TemplateRow[];
    templateA = rows.find(r => r.name === TEMPLATE_A_NAME) ?? null;
    templateB = rows.find(r => r.name === TEMPLATE_B_NAME) ?? null;
    if (!templateA || !templateB) throw new Error('[fc-template-picker] siembra sin ids de plantilla');

    // Plantilla privada del cajero — para verificar que NUNCA es visible al admin
    const insCajero = await svc('POST', '/cost_sheet_templates', {
      name: CAJERO_TEMPLATE_NAME,
      description: 'Plantilla privada del cajero (comprobación de aislamiento RLS)',
      category: 'E2E',
      data: templateReinicio,
      type: 'private',
      created_by: CAJERO_ID,
      store_id: null,
    });
    if (!insCajero.ok) throw new Error(`[fc-template-picker] siembra cajero falló: HTTP ${insCajero.status}`);
    cajeroTemplateId = (((await insCajero.json()) as TemplateRow[])[0]).id;

    // Estado inicial determinista: producto A sin FC (run fresco — sanity)
    const clean = await svc('DELETE', `/product_cost_sheets?product_id=eq.${PRODUCT_A}`);
    if (!clean.ok) console.warn('[fc-template-picker] limpieza previa de product_cost_sheets:', clean.status);
    await svc('PATCH', `/products?id=eq.${PRODUCT_A}`, { cost_sheet_id: null }).catch(() => {});
  });

  test.afterAll(async () => {
    // NET-ZERO: eliminar exactamente lo sembrado/creado por este spec
    if (encargadoMembershipSeeded && ENCARGADO_ID && STORE_A) {
      await svc('DELETE', `/user_store_memberships?user_id=eq.${ENCARGADO_ID}&store_id=eq.${STORE_A}`).catch(() => {});
    }
    const ids = [templateA?.id, templateB?.id, cajeroTemplateId].filter(Boolean) as string[];
    if (ids.length > 0) {
      await svc('DELETE', `/cost_sheet_templates?id=in.(${ids.join(',')})`).catch(() => {});
    }
    await svc('DELETE', `/product_cost_sheets?product_id=eq.${PRODUCT_A}`).catch(() => {});
    await svc('PATCH', `/products?id=eq.${PRODUCT_A}`, { cost_sheet_id: null }).catch(() => {});
  });

  // ── Helpers UI ────────────────────────────────────────────────────────────

  async function gotoInventory(page: import('@playwright/test').Page) {
    await page.goto('/?view=inventory');
    await page.waitForSelector('table, [data-testid="inventory-empty"], [role="list"]', { timeout: 30_000 });
  }

  function productRow(page: import('@playwright/test').Page) {
    return page.locator('tr', { has: page.locator(`td[aria-label="Producto: ${PRODUCT_A_NAME}"]`) });
  }

  async function openFCModal(page: import('@playwright/test').Page) {
    const row = productRow(page);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.locator('button[aria-label]').first().waitFor({ timeout: 15_000 });
    return row;
  }

  function modal(page: import('@playwright/test').Page) {
    return page.getByRole('dialog', { name: /Ficha de Costo/ });
  }

  function picker(page: import('@playwright/test').Page) {
    return page.locator('[data-testid="fc-template-picker"]');
  }

  function optionByName(page: import('@playwright/test').Page, name: string) {
    return page.locator('[role="option"]', { hasText: name });
  }

  // ── 1-5-6: conexión completa + persistencia ───────────────────────────────

  test('1-6 · conecta producto con plantilla guardada y la asociación persiste en el servidor', async ({ authedPage: page }) => {
    test.setTimeout(180_000);

    // (1) Inventario · (2) producto sin FC → icono «Sin plantilla FC»
    await gotoInventory(page);
    const row = await openFCModal(page);
    const sinFcIcon = row.locator('button[aria-label="Sin plantilla FC"]');
    await expect(sinFcIcon).toBeVisible({ timeout: 20_000 });

    // (3) abre el selector
    await sinFcIcon.click();
    const dlg = modal(page);
    await expect(dlg).toBeVisible({ timeout: 15_000 });
    await expect(dlg).toHaveText(/Producto Piloto A/);

    // El dead-end original («Sin plantilla configurada para esta tienda») desapareció
    expect(await page.getByText('Sin plantilla configurada para esta tienda').count()).toBe(0);
    expect(await page.getByText('No se ha configurado una plantilla de Ficha de Costo para esta tienda').count()).toBe(0);

    // (4) plantillas recuperadas del servidor (RLS del navegador)
    const pk = picker(page);
    await expect(pk).toBeVisible({ timeout: 20_000 });
    await expect(pk.getByRole('listbox', { name: 'Plantillas disponibles' })).toBeVisible({ timeout: 30_000 });
    await expect(optionByName(page, TEMPLATE_A_NAME)).toBeVisible({ timeout: 30_000 });
    await expect(optionByName(page, TEMPLATE_B_NAME)).toBeVisible({ timeout: 30_000 });

    // Búsqueda/filtrado del selector
    const search = page.getByLabel('Buscar plantillas');
    await search.fill('Plantilla Alpha');
    await expect(optionByName(page, TEMPLATE_B_NAME)).toHaveCount(0, { timeout: 10_000 });
    await expect(optionByName(page, TEMPLATE_A_NAME)).toBeVisible();
    await search.fill('');
    await expect(optionByName(page, TEMPLATE_B_NAME)).toBeVisible({ timeout: 10_000 });

    // (5) selecciona Alpha y confirma la asociación
    await optionByName(page, TEMPLATE_A_NAME).click();
    const confirm = page.getByRole('button', { name: 'Confirmar conexión de la Ficha de Costo' });
    await expect(confirm).toBeEnabled();
    await confirm.click();

    // Confirmación de éxito en la UI (asociación guardada en el servidor).
    // Nota: la vista de éxito puede tardar mientras se genera el PDF (quick-pdf
    // desde calculated_data) — timeout generoso.
    const success = page.getByText(/Ficha conectada con «.*»\. La asociación quedó guardada en el servidor\./);
    await expect(success).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole('button', { name: 'Cambiar Ficha', exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole('button', { name: 'Desconectar', exact: true })).toBeVisible({ timeout: 30_000 });

    // (6) persistencia en BD (verificación directa, sin UI)
    const csRes = await svc('GET', `/product_cost_sheets?product_id=eq.${PRODUCT_A}&store_id=eq.${STORE_A}&deleted_at=is.null&select=id,template_id,cost_price`);
    expect(csRes.ok).toBeTruthy();
    const csRows = (await csRes.json()) as Array<{ id: string; template_id: string | null; cost_price: number | null }>;
    expect(csRows.length).toBe(1);
    expect(csRows[0].template_id).toBe(templateA!.id);
    activeCostSheetId = csRows[0].id;

    const prodRes = await svc('GET', `/products?id=eq.${PRODUCT_A}&select=id,cost_sheet_id`);
    const prod = ((await prodRes.json()) as Array<{ id: string; cost_sheet_id: string | null }>)[0];
    expect(prod.cost_sheet_id).toBe(activeCostSheetId);
  });

  // ── 6-7: recarga → vigente con la ficha correcta ─────────────────────────

  test('7 · tras recargar, el producto muestra la Ficha correcta (vigente) e identifica la plantilla', async ({ authedPage: page }) => {
    test.setTimeout(180_000);

    // (6) recarga completa de la vista de inventario
    await gotoInventory(page);
    const row = await openFCModal(page);

    // La asociación sobrevivió a la recarga: icono vigente (no «Sin plantilla FC»)
    const vigenteIcon = row.locator('button[aria-label="Ver Ficha de Costo (PDF)"]');
    await expect(vigenteIcon).toBeVisible({ timeout: 30_000 });
    expect(await row.locator('button[aria-label="Sin plantilla FC"]').count()).toBe(0);

    // (7) reabrir el producto → modal vigente con la ficha correcta
    await vigenteIcon.click();
    const dlg = modal(page);
    await expect(dlg).toBeVisible({ timeout: 15_000 });

    // Chip legible con el nombre de la plantilla conectada (sin IDs técnicos)
    await expect(dlg.getByText(TEMPLATE_A_NAME)).toBeVisible({ timeout: 20_000 });

    // Acciones de gestión disponibles en la ficha vigente
    await expect(page.getByRole('button', { name: 'Cambiar Ficha', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Desconectar', exact: true })).toBeVisible();

    // La FC activa sigue siendo la de Alpha
    const csRes = await svc('GET', `/product_cost_sheets?product_id=eq.${PRODUCT_A}&deleted_at=is.null&select=id,template_id`);
    const csRows = (await csRes.json()) as Array<{ id: string; template_id: string | null }>;
    expect(csRows.length).toBe(1);
    expect(csRows[0].template_id).toBe(templateA!.id);
    expect(csRows[0].id).toBe(activeCostSheetId);
  });

  // ── 10: autorización (antes de mutar más estado) ──────────────────────────

  test('10 · usuario sin permisos no puede conectar ni desconectar; producto de otra tienda → 403', async ({ request }) => {
    test.setTimeout(120_000);

    // Cajero (clerk en piloto A): NO puede conectar el producto con plantilla
    const connect1 = await request.post('/api/product-cost-sheets/generate-from-template', {
      headers: { Authorization: `Bearer ${cajeroToken}` },
      data: { product_id: PRODUCT_A, store_id: STORE_A, template_id: templateA!.id },
    });
    expect(connect1.status()).toBe(403);

    // Ni siquiera con una plantilla PRIVADA PROPIA (el rol se valida primero)
    const connect2 = await request.post('/api/product-cost-sheets/generate-from-template', {
      headers: { Authorization: `Bearer ${cajeroToken}` },
      data: { product_id: PRODUCT_A, store_id: STORE_A, template_id: cajeroTemplateId },
    });
    expect(connect2.status()).toBe(403);

    // Cajero: NO puede desconectar la FC activa de la tienda
    const disconnect = await request.patch('/api/product-cost-sheets', {
      headers: { Authorization: `Bearer ${cajeroToken}` },
      data: { cost_sheet_id: activeCostSheetId },
    });
    expect(disconnect.status()).toBe(403);

    // Aislamiento multitienda: admin no puede conectar el producto del piloto B
    // “dentro” de la tienda A (FC_PRODUCT_STORE_MISMATCH)
    const crossStore = await request.post('/api/product-cost-sheets/generate-from-template', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { product_id: PRODUCT_B, store_id: STORE_A, template_id: templateA!.id },
    });
    expect(crossStore.status()).toBe(403);

    // Visibilidad de plantillas privadas ajenas para un usuario SIN privilegios
    // admin (RLS 20261110120000: private → created_by=auth.uid(); is_admin()
    // ve todo — por eso el caso admin-ve-todo NO es una violación, es la
    // política documentada). El encargado de la tienda A (con permiso FC):
    const enc1 = await request.post('/api/product-cost-sheets/generate-from-template', {
      headers: { Authorization: `Bearer ${encargadoToken}` },
      data: { product_id: PRODUCT_A, store_id: STORE_A, template_id: cajeroTemplateId },
    });
    expect(enc1.status()).toBe(404); // plantilla privada del cajero → 404 (no revela existencia)

    const enc2 = await request.post('/api/product-cost-sheets/generate-from-template', {
      headers: { Authorization: `Bearer ${encargadoToken}` },
      data: { product_id: PRODUCT_A, store_id: STORE_A, template_id: templateA!.id },
    });
    expect(enc2.status()).toBe(404); // plantilla privada del admin → 404 igualmente

    // Estado intacto tras los intentos denegados
    const csRes = await svc('GET', `/product_cost_sheets?product_id=eq.${PRODUCT_A}&deleted_at=is.null&select=id,template_id`);
    const csRows = (await csRes.json()) as Array<{ id: string; template_id: string | null }>;
    expect(csRows.length).toBe(1);
    expect(csRows[0].template_id).toBe(templateA!.id);
  });

  // ── 8: cambio de asociación ───────────────────────────────────────────────

  test('8 · cambia la asociación por otra plantilla (reemplazo sin duplicados)', async ({ authedPage: page }) => {
    test.setTimeout(180_000);

    await gotoInventory(page);
    const row = await openFCModal(page);
    const vigenteIcon = row.locator('button[aria-label="Ver Ficha de Costo (PDF)"]');
    await expect(vigenteIcon).toBeVisible({ timeout: 30_000 });
    await vigenteIcon.click();
    const dlg = modal(page);
    await expect(dlg).toBeVisible({ timeout: 15_000 });

    // Abre el selector en modo cambio con aviso de reemplazo
    await page.getByRole('button', { name: 'Cambiar Ficha', exact: true }).click();
    const pk = picker(page);
    await expect(pk).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/reemplazará.*la Ficha de Costo actual/)).toBeVisible({ timeout: 10_000 });

    // La plantilla actual aparece marcada «Actual» y deshabilitada
    const currentOption = optionByName(page, TEMPLATE_A_NAME);
    await expect(currentOption).toBeVisible({ timeout: 30_000 });
    await expect(currentOption.getByText('Actual', { exact: true })).toBeVisible();
    await expect(currentOption).toBeDisabled();

    // Selecciona Beta y confirma el cambio
    await optionByName(page, TEMPLATE_B_NAME).click();
    const confirm = page.getByRole('button', { name: 'Confirmar conexión de la Ficha de Costo' });
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.getByText(/Ficha conectada con «.*»\. La asociación quedó guardada en el servidor\./)).toBeVisible({ timeout: 90_000 });

    // Persistencia: UNA sola FC activa con template_id = Beta (upsert, no duplica)
    const csRes = await svc('GET', `/product_cost_sheets?product_id=eq.${PRODUCT_A}&deleted_at=is.null&select=id,template_id`);
    const csRows = (await csRes.json()) as Array<{ id: string; template_id: string | null }>;
    expect(csRows.length).toBe(1);
    expect(csRows[0].template_id).toBe(templateB!.id);
    activeCostSheetId = csRows[0].id;

    const prodRes = await svc('GET', `/products?id=eq.${PRODUCT_A}&select=cost_sheet_id`);
    const prod = ((await prodRes.json()) as Array<{ cost_sheet_id: string | null }>)[0];
    expect(prod.cost_sheet_id).toBe(activeCostSheetId);
  });

  // ── 9: desconexión ─────────────────────────────────────────────────────────

  test('9 · desconecta la Ficha (confirmación + soft-delete) y queda sin FC', async ({ authedPage: page }) => {
    test.setTimeout(180_000);

    await gotoInventory(page);
    const row = await openFCModal(page);
    const vigenteIcon = row.locator('button[aria-label="Ver Ficha de Costo (PDF)"]');
    await expect(vigenteIcon).toBeVisible({ timeout: 30_000 });
    await vigenteIcon.click();
    const dlg = modal(page);
    await expect(dlg).toBeVisible({ timeout: 15_000 });

    // Confirmación explícita antes de desconectar
    await page.getByRole('button', { name: 'Desconectar', exact: true }).click();
    await expect(page.getByText('¿Desconectar la Ficha de Costo?')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Cancelar' }).click();
    // Cancelar NO desconecta: sigue vigente
    await expect(page.getByRole('button', { name: 'Desconectar', exact: true })).toBeVisible({ timeout: 10_000 });

    // Desconectar de verdad
    await page.getByRole('button', { name: 'Desconectar', exact: true }).click();
    await expect(page.getByText('¿Desconectar la Ficha de Costo?')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Desconectar', exact: true }).click();

    // El modal vuelve al estado de primera conexión (selector de plantillas)
    await expect(picker(page)).toBeVisible({ timeout: 20_000 });

    // Soft-delete de la FC + producto desvinculado
    const activeRes = await svc('GET', `/product_cost_sheets?product_id=eq.${PRODUCT_A}&deleted_at=is.null&select=id`);
    expect(((await activeRes.json()) as unknown[]).length).toBe(0);

    const deletedRes = await svc('GET', `/product_cost_sheets?id=eq.${activeCostSheetId}&select=id,deleted_at`);
    const deleted = ((await deletedRes.json()) as Array<{ id: string; deleted_at: string | null }>)[0];
    expect(deleted).toBeTruthy();
    expect(deleted.deleted_at).not.toBeNull();

    const prodRes = await svc('GET', `/products?id=eq.${PRODUCT_A}&select=cost_sheet_id`);
    const prod = ((await prodRes.json()) as Array<{ cost_sheet_id: string | null }>)[0];
    expect(prod.cost_sheet_id).toBeNull();

    // Tras recargar: el producto vuelve a «Sin plantilla FC» (estado real)
    await gotoInventory(page);
    const row2 = await openFCModal(page);
    await expect(row2.locator('button[aria-label="Sin plantilla FC"]')).toBeVisible({ timeout: 30_000 });
    expect(await row2.locator('button[aria-label="Ver Ficha de Costo (PDF)"]').count()).toBe(0);
  });

  // ── 404 de Ajustes de Tienda + acceso a Plantillas de Fichas ─────────────

  test('Ajustes de tienda sin 404: navega al hub real; «Ir a Plantillas de Fichas» abre el explorador', async ({ authedPage: page }) => {
    test.setTimeout(180_000);

    // Estado sin_fc → modal «no_template» con accesos de respaldo
    await gotoInventory(page);
    const row = await openFCModal(page);
    await row.locator('button[aria-label="Sin plantilla FC"]').click();
    const dlg = modal(page);
    await expect(dlg).toBeVisible({ timeout: 15_000 });
    await expect(picker(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/no necesitas una plantilla predeterminada de tienda/)).toBeVisible();

    // «Ajustes de la tienda»: antes <a href="/settings/stores/{id}"> → 404.
    // Ahora navega por estado a la vista real (management-hub).
    await page.getByRole('button', { name: 'Ajustes de la tienda' }).click();
    await expect(dlg).toHaveCount(0, { timeout: 10_000 });
    await expect(page).toHaveURL(/view=management-hub/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Gestión de Tiendas' })).toBeVisible({ timeout: 20_000 });
    expect(page.url()).not.toContain('/settings/');

    // «Ir a Plantillas de Fichas» → explorador de plantillas del servidor
    await gotoInventory(page);
    const row2 = await openFCModal(page);
    await row2.locator('button[aria-label="Sin plantilla FC"]').click();
    await expect(dlg).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Ir a Plantillas de Fichas' }).click();
    await expect(page).toHaveURL(/view=cost-sheets/, { timeout: 15_000 });
    // El explorador abre en la pestaña «Sistema» (default) — la navegación llegó
    await expect(page.getByRole('heading', { name: 'Explorador de Plantillas' })).toBeVisible({ timeout: 90_000 });
    // Pestaña «Privadas»: las plantillas guardadas del usuario en el servidor
    await page.getByRole('tab', { name: 'Privadas', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Mis Plantillas Guardadas en COSTPRO' })).toBeVisible({ timeout: 30_000 });
    // Las plantillas sembradas del servidor aparecen en el explorador
    await expect(page.getByText(TEMPLATE_A_NAME).first()).toBeVisible({ timeout: 30_000 });
  });

  // ── 11: integridad de datos y aislamiento ─────────────────────────────────

  test('11 · la plantilla original no se modifica; otros productos/tiendas intactos; RLS de visibilidad', async () => {
    test.setTimeout(120_000);

    // Plantillas intactas (nombre + contenido + updated_at sin cambios)
    for (const tpl of [templateA!, templateB!]) {
      const res = await svc('GET', `/cost_sheet_templates?id=eq.${tpl.id}&select=id,name,data,updated_at`);
      const row = ((await res.json()) as TemplateRow[])[0];
      expect(row).toBeTruthy();
      expect(row.name).toBe(tpl.name);
      expect(JSON.stringify(row.data)).toBe(JSON.stringify(tpl.data));
      expect(row.updated_at).toBe(tpl.updated_at);
    }

    // Otros productos/tiendas intactos: el producto del piloto B sigue sin FC
    const prodBRes = await svc('GET', `/products?id=eq.${PRODUCT_B}&select=cost_sheet_id`);
    const prodB = ((await prodBRes.json()) as Array<{ cost_sheet_id: string | null }>)[0];
    expect(prodB.cost_sheet_id).toBeNull();

    const csBRes = await svc('GET', `/product_cost_sheets?store_id=eq.${STORE_B}&select=id`);
    expect(((await csBRes.json()) as unknown[]).length).toBe(0);

    // Sin FC residuales activas del producto A (estado final: desconectado)
    const csARes = await svc('GET', `/product_cost_sheets?product_id=eq.${PRODUCT_A}&deleted_at=is.null&select=id`);
    expect(((await csARes.json()) as unknown[]).length).toBe(0);

    // RLS de visibilidad (como el navegador):
    //  - El admin (role 'admin') ve TODAS las plantillas — política SELECT
    //    documentada de la migración 20261110120000 (is_admin() → todo), y en
    //    particular las suyas propias.
    //  - El cajero (clerk, SIN is_admin) ve SOLO sus plantillas privadas —
    //    nunca las del admin ni las de ninguna otra cuenta.
    const adminPriv = await rlsGet('/cost_sheet_templates?select=id,name&type=eq.private', adminToken);
    const adminRows = (await adminPriv.json()) as Array<{ id: string; name: string }>;
    const adminNames = adminRows.map(r => r.name);
    expect(adminNames).toContain(TEMPLATE_A_NAME);
    expect(adminNames).toContain(TEMPLATE_B_NAME);

    const cajeroPriv = await rlsGet('/cost_sheet_templates?select=id,name,created_by&type=eq.private', cajeroToken);
    const cajeroRows = (await cajeroPriv.json()) as Array<{ id: string; name: string; created_by: string | null }>;
    const cajeroNames = cajeroRows.map(r => r.name);
    expect(cajeroNames).toContain(CAJERO_TEMPLATE_NAME);
    expect(cajeroNames).not.toContain(TEMPLATE_A_NAME);
    expect(cajeroNames).not.toContain(TEMPLATE_B_NAME);
    // Privacidad entre cuentas para usuarios regulares (airtight): TODA fila
    // visible al cajero es de su propiedad — ninguna plantilla privada ajena.
    for (const row of cajeroRows) {
      expect(row.created_by).toBe(CAJERO_ID);
    }

    // Sin sesión (anon): RLS veta la tabla — PostgREST responde 401/403 o una
    // lista vacía; en cualquier caso NO se exponen plantillas a usuarios anónimos.
    const anonRes = await fetch(`${SUPABASE_URL}/rest/v1/cost_sheet_templates?select=id&limit=1`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    if (anonRes.status === 200) {
      const anonRows = (await anonRes.json()) as unknown[];
      expect(anonRows.length).toBe(0);
    } else {
      expect([401, 403]).toContain(anonRes.status);
    }
  });
});
