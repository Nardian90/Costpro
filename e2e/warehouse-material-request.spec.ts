/**
 * E2E — SOLICITUD DE MATERIALES (Modelo SC-2-07) — MISIÓN COSTPRO-WAREHOUSE-REQUEST-001
 * ============================================================================
 * Defecto corregido: al escribir en cualquier campo distinto de «Área
 * solicitante», el formulario devolvía continuamente el foco a ese primer
 * campo (input #sm-area, autoFocus) — imposible completar la solicitud.
 *
 * Causa raíz (ver docs/audits/WAREHOUSE_MATERIAL_REQUEST_001.md): el
 * subcomponente `Seccion` estaba definido DENTRO del cuerpo de
 * MaterialRequestFormModal → identidad de componente nueva en cada render →
 * React desmontaba/remontaba las secciones en cada pulsación → el autoFocus
 * del primer campo se re-aplicaba en cada remontaje y robaba el foco.
 *
 * Casos (misión §7):
 *   1 Apertura del formulario SC-2-07 con campos visibles.
 *   2 Escritura en TODOS los campos editables (foco estable, valores intactos).
 *   3 Cambio continuo entre campos sin pérdida de foco ni de datos.
 *   4 Escritura con cursor en medio del texto (inserción/borrado in place).
 *   5 Navegación con Tab / Shift+Tab en orden lógico del DOM.
 *   6 Validación: envío vacío → errores visibles, sin robo de foco.
 *   7 Guardado y persistencia real (RPC + PostgreSQL del proyecto aislado).
 *   8 Aislamiento multitienda (RLS: otra tienda no ve ni modifica).
 *
 * Entorno: BD aislada CostproE2E (guard assert-isolated-db en global-setup).
 * Tienda sintética equivalente a Puertopadre: `E2E80 <runId> PUERTOPADRE <suf>`
 * (nunca la tienda real de producción). Ejecutar con:
 *   E2E_STORE_FIXTURE_MODE=create bunx playwright test --project=core e2e/warehouse-material-request.spec.ts
 * ============================================================================
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  signIn, injectSession, sb, createTestStore, deleteTestStore,
  cleanupProducts, seedProduct, rpcAsUser, testSuffix,
  ADMIN_EMAIL, ADMIN_PASS, CLERK_EMAIL, CLERK_PASS,
  type TestStore, type SeededProduct,
} from './fixtures/session.fixture';

let api: APIRequestContext;
let adminToken: string;
let adminId: string;
let clerkToken = '';
let store: TestStore;
let productos: SeededProduct[] = [];
let warehouseName = '';
let warehouseId = '';
let requestNumber = '';
let requestId = '';
const suf = testSuffix();
/** Área determinista por run — base de las verificaciones de unicidad. */
const AREA = `Taller PUERTOPADRE ${suf}`;

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000' });
  const admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
  adminToken = admin.token;
  adminId = admin.userId;
  // Tienda sintética "Puertopadre" SOLO dentro del proyecto aislado (nunca la
  // real de producción). El nombre lleva el patrón E2E80 → higiene garantizada.
  store = await createTestStore(api, adminToken, 'PUERTOPADRE');
  await sb.update('profiles', `id=eq.${adminId}`, { active_store_id: store.id });

  // Productos sintéticos del dato 5 (descripción/código/UM los snapshot-ea el servidor).
  productos = [
    await seedProduct(store, { name: `Cemento gris ${suf}`, price: 120, cost: 95, quantity: 500, sku: `SM-${suf}-CEM` }),
    await seedProduct(store, { name: `Clavos 2pulg ${suf}`, price: 15, cost: 10, quantity: 1000, sku: `SM-${suf}-CLA` }),
  ];

  // Almacén sintético (dato 3): si la inserción directa no aplica (columnas
  // obligatorias adicionales), el formulario cae en la rama textual — ambos
  // carriles se prueban dinámicamente por los specs.
  try {
    const [wh] = await sb.insert<{ id: string; name: string }>('warehouses', [{
      store_id: store.id,
      name: `Almacén Central PUERTOPADRE ${suf}`,
      code: `AC-${suf}`,
      is_active: true,
      is_default: true,
    }]);
    warehouseId = wh.id;
    warehouseName = wh.name;
  } catch {
    warehouseId = '';
    warehouseName = '';
  }

  // Usuario de OTRA tienda para el caso de aislamiento (Caso 8).
  const clerk = await signIn(CLERK_EMAIL, CLERK_PASS);
  clerkToken = clerk.token;
});

test.afterAll(async () => {
  // Limpieza acotada a los registros de ESTA ejecución (higiene net-zero).
  // Se borra POR TIENDA (no solo por request_id) para cubrir también las
  // corridas que fallen a mitad del caso C7: si la solicitud persistiera, su
  // FK (created_by) bloquearía el soft-delete de los usuarios del run.
  try {
    if (store?.id) await sb.delete('material_requests', `store_id=eq.${store.id}`);
    if (requestId) await sb.delete('material_requests', `id=eq.${requestId}`);
  } catch { /* best-effort: el CASCADE del store cubre el resto */ }
  try {
    if (productos.length) await cleanupProducts(store.id, productos.map(p => p.id));
  } catch { /* best-effort */ }
  try {
    if (store?.id) await deleteTestStore(api, adminToken, store.id);
  } catch { /* el teardown del run hace el barrido final por tenant */ }
  await api?.dispose().catch(() => {});
});

// ── Helpers de UI ────────────────────────────────────────────────────────────

/** Sesión inyectada + navegación real: Inicio → OPERACIÓN → Almacén → Solicitud de Materiales. */
async function navegarASolicitudes(page: Page): Promise<void> {
  const ses = await signIn(ADMIN_EMAIL, ADMIN_PASS);
  await injectSession(page, { token: ses.token, userId: adminId, email: ADMIN_EMAIL, refreshToken: ses.refreshToken });
  await page.goto('/');
  await page.getByText('OPERACIÓN', { exact: true }).first().waitFor({ state: 'visible', timeout: 45_000 });
  await page.getByText('OPERACIÓN', { exact: true }).first().click();
  const grupo = page.getByText('Almacén', { exact: true }).first();
  await grupo.waitFor({ state: 'visible', timeout: 20_000 });
  await grupo.click();
  const item = page.getByText('Solicitud de Materiales', { exact: true }).first();
  await item.waitFor({ state: 'visible', timeout: 20_000 });
  await item.click();
  await expect(page.getByText('Nueva Solicitud', { exact: false }).first()).toBeVisible({ timeout: 45_000 });
}

/** Abre el modal «Nueva Solicitud de Materiales» (formulario SC-2-07). */
async function abrirFormulario(page: Page): Promise<void> {
  await page.locator('[aria-label="Nueva Solicitud de Materiales"]').click();
  // El texto «Modelo SC-2-07» aparece en 3 sitios (subtítulo del listado,
  // descripción del modal y ayuda del dato 1) → apuntar a la descripción del diálogo.
  await expect(
    page.locator('[data-slot="dialog-description"]').filter({ hasText: 'Modelo SC-2-07' }),
  ).toBeVisible({ timeout: 20_000 });
  // El catálogo de almacenes llega por red de forma asíncrona: mientras tanto
  // el dato 3 muestra la rama textual y al resolver cambia al <select>. Esperar
  // al estado FINAL del control (si hay almacenes sembrados aparece el select;
  // si no, la rama textual es la definitiva) para evitar carreras del spec.
  try {
    await page.locator('#sm-almacen').waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    // Sin almacenes: la rama textual es la definitiva — seguir con ella.
  }
}

/** Cierra el modal actual (botón Cancelar del footer). */
async function cerrarFormulario(page: Page): Promise<void> {
  const cancelar = page.getByRole('button', { name: 'Cancelar', exact: true });
  if (await cancelar.count()) await cancelar.first().click().catch(() => {});
  await expect(
    page.locator('[data-slot="dialog-description"]').filter({ hasText: 'Modelo SC-2-07' }),
  ).toBeHidden({ timeout: 10_000 });
}

const focoActual = (page: Page) => page.evaluate(() => document.activeElement?.id || '');

/** Campos editables presentes en el formulario (ids reales del DOM). */
async function camposEditables(page: Page): Promise<{ id: string; tag: string }[]> {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('input[id^="sm-"], select[id^="sm-"], textarea[id^="sm-"]'))
      .filter((el) => {
        const i = el as HTMLInputElement;
        return i.type !== 'hidden' && !i.disabled;
      })
      .map((el) => ({ id: el.id, tag: el.tagName.toLowerCase() }));
  });
}

const TEXTO_CAMPO: Record<string, string> = {
  'sm-fecha': '2026-10-31',
  'sm-entidad-codigo': 'REEUP-0401',
  'sm-area': 'Taller de montaje',
  'sm-area-codigo': 'A-01',
  'sm-centro-costo': 'CC-100',
  'sm-almacen-nombre': 'Almacén principal E2E',
  'sm-almacen-codigo': 'ALM-01',
  'sm-buscar-producto': '',
  'sm-notas': 'Solicitud generada por la suite E2E de la misión WAREHOUSE-REQUEST-001.',
};

// ── Casos ────────────────────────────────────────────────────────────────────

test.describe.serial('Solicitud de Materiales — SC-2-07 (foco estable)', () => {

  test('C1 — Apertura: formulario SC-2-07 con campos y controles visibles', async ({ page }) => {
    await navegarASolicitudes(page);
    await abrirFormulario(page);
    await expect(page.locator('#sm-fecha')).toBeVisible();
    await expect(page.locator('#sm-area')).toBeVisible();
    await expect(page.locator('#sm-buscar-producto')).toBeVisible();
    await expect(page.locator('#sm-notas')).toBeVisible();
    await expect(page.getByText('Datos generales del modelo').first()).toBeVisible();
    await expect(page.getByText('Área solicitante', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Productos solicitados', { exact: false }).first()).toBeVisible();
  });

  test('C2 — Escritura en todos los campos: el foco permanece en el control activo', async ({ page }) => {
    await navegarASolicitudes(page);
    await abrirFormulario(page);
    const campos = await camposEditables(page);
    const escritos: { id: string; valor: string }[] = [];

    for (const campo of campos) {
      if (campo.tag === 'select') continue; // selects sin texto libre
      const loc = page.locator(`#${campo.id}`);
      await loc.click();
      if (campo.id === 'sm-buscar-producto') {
        await loc.pressSequentially('Cemento', { delay: 40 });
      } else if (campo.id === 'sm-fecha') {
        // input type=date: el teclado libre no es fiable → fill con fecha válida (no futura).
        await loc.fill(TEXTO_CAMPO['sm-fecha']);
        escritos.push({ id: campo.id, valor: TEXTO_CAMPO['sm-fecha'] });
      } else {
        const texto = TEXTO_CAMPO[campo.id] ?? `valor-${campo.id}`;
        await loc.pressSequentially(texto, { delay: 30 });
        escritos.push({ id: campo.id, valor: texto });
      }
      // REPRODUCCIÓN DEL DEFECTO: tras escribir, el foco DEBE seguir en el campo.
      expect(await focoActual(page), `foco robado al escribir en ${campo.id}`).toBe(campo.id);
      if (campo.id !== 'sm-buscar-producto') {
        await expect(loc, `valor alterado en ${campo.id}`).toHaveValue(TEXTO_CAMPO[campo.id] ?? `valor-${campo.id}`);
      }
    }
    // Valores previos intactos (el estado no se reemplaza completo).
    for (const previo of escritos) {
      await expect(page.locator(`#${previo.id}`)).toHaveValue(previo.valor);
    }
    await cerrarFormulario(page);
  });

  test('C3 — Cambio continuo entre campos sin pérdida de foco ni datos', async ({ page }) => {
    await navegarASolicitudes(page);
    await abrirFormulario(page);
    await page.locator('#sm-area').click();
    await page.locator('#sm-area').pressSequentially('Taller', { delay: 25 });
    await page.locator('#sm-area-codigo').click();
    await page.locator('#sm-area-codigo').pressSequentially('A-01', { delay: 25 });
    expect(await focoActual(page)).toBe('sm-area-codigo');
    // Volver al campo anterior y añadir texto: ni foco ni datos se pierden.
    await page.locator('#sm-area').click();
    await page.locator('#sm-area').pressSequentially(' de montaje', { delay: 25 });
    expect(await focoActual(page), 'el foco volvió a robarse al editar sm-area').toBe('sm-area');
    await expect(page.locator('#sm-area')).toHaveValue('Taller de montaje');
    await expect(page.locator('#sm-area-codigo')).toHaveValue('A-01');
    await page.locator('#sm-centro-costo').click();
    await page.locator('#sm-centro-costo').pressSequentially('CC-100', { delay: 25 });
    expect(await focoActual(page)).toBe('sm-centro-costo');
    await expect(page.locator('#sm-area')).toHaveValue('Taller de montaje');
    await expect(page.locator('#sm-area-codigo')).toHaveValue('A-01');
    await cerrarFormulario(page);
  });

  test('C4 — Cursor: inserción en medio del texto conserva la posición', async ({ page }) => {
    await navegarASolicitudes(page);
    await abrirFormulario(page);
    const loc = page.locator('#sm-centro-costo');
    await loc.click();
    await loc.pressSequentially('ABCDE', { delay: 25 });
    await loc.press('Home');
    await loc.pressSequentially('X', { delay: 25 });
    expect(await focoActual(page), 'foco robado durante la inserción').toBe('sm-centro-costo');
    await expect(loc).toHaveValue('XABCDE');
    const cursor = await page.evaluate(() => (document.getElementById('sm-centro-costo') as HTMLInputElement)?.selectionStart);
    expect(cursor, 'el cursor no se conserva tras insertar en medio').toBe(1);
    // Borrado con Backspace desde esa posición.
    await loc.press('Backspace');
    await expect(loc).toHaveValue('ABCDE');
    expect(await focoActual(page)).toBe('sm-centro-costo');
    await cerrarFormulario(page);
  });

  test('C5 — Navegación con Tab / Shift+Tab en orden lógico', async ({ page }) => {
    await navegarASolicitudes(page);
    await abrirFormulario(page);
    // Se arranca en el segundo campo: en Chromium, Tab dentro de un
    // <input type="date"> recorre sus segmentos internos (día/mes/año) antes de
    // salir — comportamiento nativo, no un salto anómalo.
    await page.locator('#sm-entidad-codigo').click();
    const ordenBase = ['sm-entidad-codigo', 'sm-area', 'sm-area-codigo', 'sm-centro-costo', 'sm-ot', 'sm-buscar-producto', 'sm-notas'];
    const visitados: string[] = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const foco = await focoActual(page);
      if (foco.startsWith('sm-')) visitados.push(foco);
      if (foco === 'sm-notas') break;
    }
    // Rama select de almacén: si existe #sm-almacen se interpola tras entidad.
    // (visitados registra DESTINOS de cada Tab; el campo de partida no se lista.)
    const haySelectAlmacen = await page.locator('#sm-almacen').count();
    const esperado = haySelectAlmacen
      ? ['sm-almacen', ...ordenBase.slice(1)]
      : ordenBase.slice(1);
    expect(visitados, `orden de Tab: ${visitados.join(' → ')}`).toEqual(esperado);
    // Shift+Tab retrocede un campo lógico (no salta al primero).
    await page.keyboard.press('Shift+Tab');
    expect(await focoActual(page)).toBe('sm-buscar-producto');
    await cerrarFormulario(page);
  });

  test('C6 — Validación: envío vacío muestra errores sin robar el foco', async ({ page }) => {
    await navegarASolicitudes(page);
    await abrirFormulario(page);
    // Estado vacío: el botón de guardado está deshabilitado (contrato actual).
    const guardar = page.getByRole('button', { name: /Guardar borrador/ });
    await expect(guardar).toBeDisabled();
    // Los errores requeridos se anuncian en vivo (role=alert), sin mover el foco.
    await expect(page.getByRole('alert')).toContainText('área solicitante es obligatoria');
    await expect(page.getByRole('alert')).toContainText('al menos un producto');
    // La validación NO desplaza el foco mientras se navega/consulta el form.
    await page.locator('#sm-entidad-codigo').click();
    await page.locator('#sm-entidad-codigo').pressSequentially('REEUP-0401', { delay: 25 });
    expect(await focoActual(page), 'la validación robó el foco al escribir').toBe('sm-entidad-codigo');
    await expect(guardar).toBeDisabled(); // sigue inválido: faltan área y productos
    await cerrarFormulario(page);
  });

  test('C7 — Guardado y persistencia real en PostgreSQL (proyecto aislado)', async ({ page }) => {
    test.setTimeout(180_000);
    await navegarASolicitudes(page);
    await abrirFormulario(page);
    if (warehouseId) {
      const sel = page.locator('#sm-almacen');
      if (await sel.count()) {
        // El <option> del formulario concatena el código → seleccionar por VALUE.
        await sel.selectOption({ value: warehouseId });
      }
    }
    await page.locator('#sm-area').fill(AREA);
    await page.locator('#sm-area-codigo').fill('A-01');
    await page.locator('#sm-centro-costo').fill('CC-2026');
    await page.locator('#sm-entidad-codigo').fill('REEUP-0401');
    // Añadir dos productos reales del catálogo sembrado (flujo UI completo).
    for (const p of productos) {
      const buscador = page.locator('#sm-buscar-producto');
      await buscador.fill(p.sku);
      const resultado = page.getByRole('button', { name: new RegExp(p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
      await expect(resultado.first()).toBeVisible({ timeout: 20_000 });
      await resultado.first().click();
      await expect(page.locator(`#sm-cant-${p.id}`)).toBeVisible();
      await page.locator(`#sm-cant-${p.id}`).fill(String(p.id === productos[0].id ? '10' : '3.5'));
    }
    await page.locator('#sm-notas').fill('Solicitud válida de la misión WAREHOUSE-REQUEST-001.');
    const guardar = page.getByRole('button', { name: /Guardar borrador/ });
    await expect(guardar).toBeEnabled();
    await guardar.click();
    // El modal se cierra y el listado refleja la solicitud creada.
    await expect(
      page.locator('[data-slot="dialog-description"]').filter({ hasText: 'Modelo SC-2-07' }),
    ).toBeHidden({ timeout: 30_000 });

    // Persistencia REAL vía PostgreSQL (service-role, solo verificación).
    const filas = await sb.select<{
      id: string; request_number: string; status: string; store_id: string;
      area_nombre: string; area_codigo: string; centro_costo: string;
      almacen_nombre: string; created_by: string;
    }>('material_requests', `store_id=eq.${store.id}&area_nombre=eq.${encodeURIComponent(AREA)}&select=*`);
    expect(filas.length, 'debe existir exactamente 1 solicitud (sin duplicados)').toBe(1);
    const fila = filas[0];
    requestId = fila.id;
    requestNumber = fila.request_number;
    expect(fila.status).toBe('draft');
    expect(fila.store_id).toBe(store.id);
    expect(fila.created_by).toBe(adminId);
    expect(fila.area_codigo).toBe('A-01');
    expect(fila.centro_costo).toBe('CC-2026');
    expect(fila.request_number).toMatch(/^SM-\d{6}-\d{4}$/);
    if (warehouseName) expect(fila.almacen_nombre).toBe(warehouseName);
    const items = await sb.select<{ product_id: string; quantity: string; sku: string }>(
      'material_request_items', `request_id=eq.${requestId}&select=*`,
    );
    expect(items.length).toBe(2);
    const q1 = items.find(i => i.product_id === productos[0].id);
    const q2 = items.find(i => i.product_id === productos[1].id);
    expect(q1?.quantity).toBeDefined();
    expect(q2?.quantity).toBeDefined();
    // numeric(14,4) puede serializarse como número o string según PostgREST.
    expect(Number(q1!.quantity)).toBe(10);
    expect(Number(q2!.quantity)).toBe(3.5);
    expect(q1?.sku).toContain('SM-');

    // Recuperación: recargar la vista y ver la solicitud en el listado.
    await page.reload();
    await expect(page.getByText(requestNumber).first()).toBeVisible({ timeout: 45_000 });
  });

  test('C8 — Aislamiento: otra tienda no ve ni puede modificar la solicitud', async ({ page }) => {
    // RLS PostgREST: el usuario de otra tienda no recibe la fila.
    const ver = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/material_requests?id=eq.${requestId}&select=id,store_id`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', Authorization: `Bearer ${clerkToken}` },
    });
    const filas = await ver.json();
    expect(ver.ok).toBeTruthy();
    expect(filas, 'RLS: el usuario de otra tienda NO debe ver la solicitud').toEqual([]);

    // RPC: intento de modificación desde otra tienda → rechazado por el servidor.
    const intento = await rpcAsUser('update_material_request', clerkToken, {
      p_request_id: requestId,
      p_fecha_emision: new Date().toISOString().slice(0, 10),
      p_warehouse_id: null,
      p_almacen_nombre: 'Intento externo',
      p_almacen_codigo: null,
      p_entidad_codigo: null,
      p_area_nombre: 'Intento externo',
      p_area_codigo: null,
      p_centro_costo: null,
      p_production_order_id: null,
      p_notes: 'intento',
      p_items: [],
      p_user_id: null,
    });
    expect(intento.ok, `la RPC debe rechazar al usuario externo: ${intento.error}`).toBeFalsy();

    // La fila sigue íntegra y perteneciente SOLO a la tienda Puertopadre sintética.
    const despues = await sb.select<{ store_id: string; area_nombre: string }>(
      'material_requests', `id=eq.${requestId}&select=store_id,area_nombre`,
    );
    expect(despues.length).toBe(1);
    expect(despues[0].store_id).toBe(store.id);
    expect(despues[0].area_nombre).toBe(AREA);
  });
});
