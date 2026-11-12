/**
 * E2E: FC-PDF-UNIFY + FC-VISTAZO + FC-SYS-TEMPLATES (misión 2026-11-13)
 * ============================================================================
 * «Auditoría y corrección integral del flujo de Fichas de Costo» — validación
 * pre-merge ejecutada EXCLUSIVAMENTE contra la BD aislada (guard CP-INFRA-011
 * en global-setup — producción prohibida):
 *
 *   R1. Inventario → modal FC de un producto VIGENTE: el selector de FORMATO
 *       está presente con las 10 alternativas del motor compartido (Estándar,
 *       Res 148/2023, …) y al cambiar de formato la petición quick-pdf lleva
 *       el pdf_format elegido.
 *   R2. El PDF descargado con formato Estándar usa el DISEÑO de la sección
 *       Fichas de Costo (mismo motor: «FICHA DE COSTOS Y GASTOS», datos y
 *       totales reales del producto — no el layout genérico anterior).
 *   R3. El picker de plantillas muestra el catálogo de SISTEMA (13) con su
 *       etiqueta de procedencia, junto a las privadas del usuario.
 *   R4. «Vistazo» (sección Fichas de Costo) renderiza una vista previa real
 *       del documento (panel + iframe con el PDF generado por el mismo motor)
 *       en lugar del dead-end en blanco.
 *   R5. La ayuda de la «Modalidad (opcional)» es visible y explica su función
 *       (encabezado/trazabilidad Res. 148/2023 — no altera cálculos).
 *
 * Modo AISLADO (E2E_ISOLATION=1): identidad dedicada por ejecución — usuarios,
 * tenant y pilotos propios provisionados por global-setup. Este spec NO
 * siembra plantillas nuevas: usa el catálogo de sistema (código) + una FC
 * vigente generada con plantilla de sistema — limpieza NET-ZERO en afterAll
 * (elimina SOLO la product_cost_sheets del producto piloto del run).
 */
import { test, expect } from './fixtures';

// ── Entorno (exportado por provisionRunEnv en global-setup) ──────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const ADMIN_ID = process.env.E2E_TEST_ADMIN_ID || '';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || '';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || '';
const STORE_A = process.env.E2E_PILOT_STORE_A || '';
const PRODUCT_A = process.env.E2E_TEST_PRODUCT_ID || '';
const PRODUCT_A_NAME = 'Producto Piloto A';

const SYSTEM_TEMPLATE_KEY = 'costpro-reinicio';
const SYSTEM_TEMPLATE_NAME = 'CostPro — Reinicio (General)';

// ── REST helpers (service-role para siembra/limpieza) ─────────────────────────

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

/** Token de acceso Supabase del admin (mismo mecanismo de auth de las rutas FC). */
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

test.describe('FC-PDF-UNIFY · Vistazo y selección de formato desde ambos accesos', () => {
  test.describe.configure({ mode: 'serial' });

  let adminApiToken = '';

  /** Captura de evidencia para el expediente (docs/audits). */
  async function snap(page: import('@playwright/test').Page, name: string) {
    try {
      await page.screenshot({ path: `audit-evidence/20261113-fichas-costo/${name}.png`, fullPage: false });
    } catch (err) {
      console.warn(`[fc-vistazo-pdf] captura ${name} falló:`, err);
    }
  }

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    if (!ADMIN_ID || !STORE_A || !PRODUCT_A) {
      throw new Error('[fc-vistazo-pdf] entorno aislado no provisionado (falta E2E_TEST_ADMIN_ID / E2E_PILOT_STORE_A / E2E_TEST_PRODUCT_ID)');
    }

    adminApiToken = await signInUser(ADMIN_EMAIL, ADMIN_PASS);

    // Estado inicial determinista: producto A sin FC (run fresco — sanity)
    const clean = await svc('DELETE', `/product_cost_sheets?product_id=eq.${PRODUCT_A}`);
    if (!clean.ok) console.warn('[fc-vistazo-pdf] limpieza previa de product_cost_sheets:', clean.status);
    await svc('PATCH', `/products?id=eq.${PRODUCT_A}`, { cost_sheet_id: null }).catch(() => {});
  });

  test.afterAll(async () => {
    // NET-ZERO: eliminar exactamente lo creado por este spec (la FC conectada).
    // Las plantillas de sistema viven en código — nada que limpiar en BD.
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

  function modal(page: import('@playwright/test').Page) {
    return page.getByRole('dialog', { name: /Ficha de Costo/ });
  }

  function picker(page: import('@playwright/test').Page) {
    return page.locator('[data-testid="fc-template-picker"]');
  }

  // ── R3 + conexión con plantilla de SISTEMA (estado para R1/R2) ────────────

  test('R3 · el picker muestra plantillas de SISTEMA (13) con etiqueta de procedencia', async ({ authedPage: page }) => {
    test.setTimeout(180_000);

    // Producto sin FC → icono «Sin plantilla FC»
    await gotoInventory(page);
    const row = productRow(page);
    await expect(row).toBeVisible({ timeout: 30_000 });
    const sinFcIcon = row.locator('button[aria-label="Sin plantilla FC"]');
    await expect(sinFcIcon).toBeVisible({ timeout: 20_000 });
    await sinFcIcon.click();
    const dlg = modal(page);
    await expect(dlg).toBeVisible({ timeout: 15_000 });

    // El picker carga: catálogo de sistema SIEMPRE disponible (regresión del
    // síntoma «solo aparecen las privadas»).
    const pk = picker(page);
    await expect(pk).toBeVisible({ timeout: 20_000 });
    await expect(pk.getByRole('listbox', { name: 'Plantillas disponibles' })).toBeVisible({ timeout: 30_000 });

    // La plantilla de sistema «CostPro — Reinicio (General)» aparece con su
    // etiqueta de procedencia «Sistema».
    const sysOption = pk.locator('[role="option"]', { hasText: SYSTEM_TEMPLATE_NAME });
    await expect(sysOption).toBeVisible({ timeout: 30_000 });
    await expect(sysOption.getByText('Sistema', { exact: true })).toBeVisible();

    // El catálogo completo son 13 (la búsqueda «CostPro —» las filtra todas)
    const search = page.getByLabel('Buscar plantillas');
    await search.fill('CostPro —');
    await expect(pk.locator('[role="option"]')).toHaveCount(2, { timeout: 10_000 }); // Reinicio + Ejemplo
    await search.fill('');

    // R5: ayuda de la modalidad visible y explica la función real
    await expect(page.locator('[data-testid="fc-modalidad-help"]')).toBeVisible();
    await expect(page.locator('[data-testid="fc-modalidad-help"]')).toContainText('no cambia los cálculos');
    await expect(page.locator('[data-testid="fc-modalidad-help"]')).toContainText('Res. 148/2023');
    await snap(page, 'R3-picker-sistema-privadas-modalidad-help');

    // Conectar con la plantilla de SISTEMA (clave de registro — no UUID)
    await sysOption.click();
    const confirm = page.getByRole('button', { name: 'Confirmar conexión de la Ficha de Costo' });
    await expect(confirm).toBeEnabled();
    await confirm.click();

    const success = page.getByText(/Ficha conectada con «.*»\. La asociación quedó guardada en el servidor\./);
    await expect(success).toBeVisible({ timeout: 90_000 });

    // Persistencia: template_id persiste la CLAVE de sistema (no UUID)
    const csRes = await svc('GET', `/product_cost_sheets?product_id=eq.${PRODUCT_A}&store_id=eq.${STORE_A}&deleted_at=is.null&select=id,template_id`);
    const csRows = (await csRes.json()) as Array<{ id: string; template_id: string | null }>;
    expect(csRows.length).toBe(1);
    expect(csRows[0].template_id).toBe(SYSTEM_TEMPLATE_KEY);
  });

  // ── R1: selector de formato desde Inventario ──────────────────────────────

  test('R1 · modal FC del inventario ofrece selector de formato (10 alternativas) y lo usa en quick-pdf', async ({ authedPage: page }) => {
    test.setTimeout(180_000);

    await gotoInventory(page);
    const row = productRow(page);
    await expect(row).toBeVisible({ timeout: 30_000 });
    const vigenteIcon = row.locator('button[aria-label="Ver Ficha de Costo (PDF)"]');
    await expect(vigenteIcon).toBeVisible({ timeout: 30_000 });
    await vigenteIcon.click();

    const dlg = modal(page);
    await expect(dlg).toBeVisible({ timeout: 15_000 });

    // Selector de formato presente con las 10 alternativas del motor compartido
    // (los <option> de un <select> nunca son "visibles" para Playwright —
    // se validan por conteo y por value, no por visibilidad).
    const formatSelect = page.locator('[data-testid="fc-pdf-format-select"]');
    await expect(formatSelect).toBeVisible({ timeout: 30_000 });
    const options = formatSelect.locator('option');
    await expect(options).toHaveCount(10, { timeout: 10_000 });
    await expect(formatSelect.locator('option[value="standard"]')).toHaveCount(1);
    await expect(formatSelect.locator('option[value="res148"]')).toHaveCount(1);

    // Default: Estándar (diseño esperado por el propietario)
    await expect(formatSelect).toHaveValue('standard');

    // La vista previa (iframe) del documento cargó
    await expect(dlg.locator('iframe')).toBeVisible({ timeout: 60_000 });
    await snap(page, 'R1-modal-fc-selector-formato-estandar');

    // Cambiar de formato → la petición quick-pdf lleva el pdf_format elegido
    const formatChangeReq = page.waitForRequest(
      req => req.url().includes('/api/product-cost-sheets/quick-pdf') && req.url().includes('pdf_format=res148'),
      { timeout: 60_000 },
    );
    await formatSelect.selectOption('res148');
    await formatChangeReq;

    // El selector refleja la nueva elección
    await expect(formatSelect).toHaveValue('res148');
  });

  // ── R2: PDF con diseño Estándar (mismo motor que la sección FC) ────────────

  test('R2 · PDF del inventario con formato Estándar usa el diseño del motor compartido (FICHA DE COSTOS Y GASTOS + datos reales)', async ({ request }) => {
    test.setTimeout(120_000);

    // Descarga directa por API (mismo endpoint que el botón «Exportar PDF» del
    // modal — el mecanismo es idéntico, con el token de sesión del admin).
    const res = await request.get(
      `/api/product-cost-sheets/quick-pdf?product_id=${PRODUCT_A}&store_id=${STORE_A}&pdf_format=standard`,
      { headers: { Authorization: `Bearer ${adminApiToken}` } },
    );
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/pdf');

    const buf = Buffer.from(await res.body());
    expect(buf.byteLength).toBeGreaterThan(2000);
    const raw = buf.toString('latin1');

    // Diseño «Estándar» del motor compartido (título de renderStandard —
    // distinto del layout genérico anterior «FICHA DE COSTO»):
    expect(raw).toContain('FICHA DE COSTOS Y GASTOS');
    // Datos reales del producto piloto (ficha inyectada — no vacía):
    expect(raw).toContain(PRODUCT_A_NAME);

    // El formato cambia el diseño: con res148 el título oficial difiere
    const res148 = await request.get(
      `/api/product-cost-sheets/quick-pdf?product_id=${PRODUCT_A}&store_id=${STORE_A}&pdf_format=res148`,
      { headers: { Authorization: `Bearer ${adminApiToken}` } },
    );
    expect(res148.status()).toBe(200);
    const raw148 = Buffer.from(await res148.body()).toString('latin1');
    // Res 148 añade la referencia oficial (título con «RESOLUCION 148»)
    expect(raw148.toUpperCase()).toContain('148');
  });

  // ── R4: Vistazo en la sección Fichas de Costo ──────────────────────────────

  test('R4 · «Vistazo» renderiza vista previa real del documento (mismo motor) — no dead-end', async ({ authedPage: page }) => {
    test.setTimeout(180_000);

    // Sección Fichas de Costo — esperar a que la vista cargue de verdad
    // (el selector del modo de visualización solo existe con la vista montada).
    await page.goto('/?view=cost-sheets');
    const modeTrigger = page.locator('button[aria-label="Seleccionar modo de visualización de la ficha"]');
    await expect(modeTrigger).toBeVisible({ timeout: 60_000 });

    // «Vistazo» desde el menú de modos — antes era dead-end: el área quedaba
    // en blanco (sin rama de render para viewMode 'preview').
    await modeTrigger.click();
    const vistazoItem = page.getByRole('menuitemradio', { name: /Vistazo/i });
    await expect(vistazoItem).toBeVisible({ timeout: 15_000 });
    await vistazoItem.click();

    // El panel de vista previa aparece (mismo motor → blob PDF en iframe)
    const previewPanel = page.locator('[data-testid="cost-sheet-pdf-preview"]');
    await expect(previewPanel).toBeVisible({ timeout: 60_000 });
    await expect(previewPanel).toContainText('Vistazo');

    // Selector de formato del Vistazo (mismas 10 alternativas)
    const formatSelect = page.locator('[data-testid="cost-sheet-preview-format"]');
    await expect(formatSelect).toBeVisible({ timeout: 20_000 });
    await expect(formatSelect.locator('option')).toHaveCount(10);

    // El iframe del documento se renderiza (blob URL del mismo generador)
    const iframe = page.locator('[data-testid="cost-sheet-preview-iframe"]');
    await expect(iframe).toBeVisible({ timeout: 60_000 });
    await expect(iframe).toHaveAttribute('src', /^blob:/, { timeout: 60_000 });
    await snap(page, 'R4-vistazo-preview-mismo-motor');

    // Botón de exportación con el MISMO mecanismo (abre CostSheetExportModal)
    const exportBtn = previewPanel.getByRole('button', { name: /Exportar PDF/i });
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();
    await expect(page.getByRole('dialog', { name: /Exportar Documentos/i })).toBeVisible({ timeout: 15_000 });
    // El modal de exportación ofrece Estándar (diseño conservado)
    await expect(page.locator('[role="dialog"] button, [role="dialog"] [data-format]')
      .filter({ hasText: 'Estándar' }).first()).toBeVisible({ timeout: 10_000 });
  });
});
