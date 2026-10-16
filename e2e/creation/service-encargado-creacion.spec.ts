/**
 * MISIÓN ENCARGADO-SERVICIOS 2026-10-17 — E2E: rol encargado crea servicios
 * (y tipos de servicio) en Servicios Recibidos + FECHA DE CREACIÓN escogida.
 *
 * Órdenes del negocio verificadas aquí:
 *  1. Los usuarios con rol 'encargado' PUEDEN crear servicios desde
 *     OPERACIÓN → Almacén → Servicios Recibidos (backend ya lo autorizaba:
 *     canManageStore + has_store_access_as; el bloqueo real era el fetch
 *     crudo sin Authorization → 401 SEC-024 para TODOS los roles).
 *  2. El usuario ESCOGE la fecha de creación del servicio (no se infiere la
 *     actual). Reglas: NO anterior a la última fecha registrada de la tienda
 *     (excluye anulados) y NO posterior al día actual (Habana) — validadas
 *     en cliente Y servidor (400).
 *  3. Encargado global también gestiona el catálogo de tipos (POST 201).
 *
 * RESTRICTION DEL NEGOCIO: NO se tocan las tiendas ENERVIDA ni Puerto Padre
 * (ni ninguna tienda real). El spec corre bajo el proyecto 'creation' con el
 * entorno aislado por-run (E2E_ALLOW_CREATION=1 E2E_ISOLATION=1): la tienda
 * es el PILOTO A del run y el usuario encargado lo provisiona run-env; el
 * teardown del run (teardownRunEnv) hace HARD delete de tiendas/usuarios del
 * run → net zero. El tipo de prueba (GLOBAL) y las filas de servicio creadas
 * se eliminan en afterAll de forma defensiva (net-zero independiente).
 *
 * Ejecución autorizada:
 *   E2E_ALLOW_CREATION=1 E2E_ISOLATION=1 npx playwright test --project=creation e2e/service-encargado-creacion.spec.ts
 */
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { signIn, apiHeaders, ENCARGADO_EMAIL, ENCARGADO_PASS, BASE_URL } from '../fixtures/session.fixture';
import { readRunContext } from '../fixtures/run-env';
import { hardDeleteRunUser } from '../fixtures/hard-cleanup';

test.use({ timezoneId: 'America/Havana' });

const OUT_DIR = 'audit-evidence/20261017-encargado-servicios';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function todayHavana(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Havana' });
}
function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

/** REST con service-role: SOLO seeding/verificación/limpieza de datos de prueba. */
async function svc(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(body ? { Prefer: 'return=representation' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

test.describe('Encargado — crear servicios y tipos (Servicios Recibidos) + fecha escogida', () => {
  test.skip(!process.env.E2E_ISOLATION || !ENCARGADO_EMAIL.startsWith('e2e-'),
    'Requiere el entorno aislado por-run (E2E_ALLOW_CREATION=1 E2E_ISOLATION=1 npm run test:e2e:creation)');

  const runContext = readRunContext();
  const storeId = process.env.E2E_PILOT_STORE_A || runContext?.pilotStoreA.id || '';
  const storeName = process.env.E2E_PILOT_A_NAME || runContext?.pilotStoreA.name || 'PILOTO A';
  const encId = process.env.E2E_ENCARGADO_ID || runContext?.users.encargado.id || '';
  const TIPO_PRUEBA = `QA Encargado E2E ${process.env.E2E_RUN_ID || 'manual'}`;
  const createdServiceIds: string[] = [];
  let encToken = '';

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    expect(storeId, 'E2E_PILOT_STORE_A debe existir en el run aislado').toBeTruthy();
    expect(encId, 'E2E_ENCARGADO_ID debe existir en el run aislado').toBeTruthy();
    mkdirSync(OUT_DIR, { recursive: true });

    // ── Setup (solo recursos del RUN) ─────────────────────────────────────
    // 0) Cronología limpia del piloto A: sin servicios previos del run, la
    //    regla «no anterior a la última fecha» arranca sin mínimo.
    await svc('DELETE', `/service_reception_links?store_id=eq.${storeId}`).catch(() => {});
    await svc('DELETE', `/service_cost_distributions?store_id=eq.${storeId}`).catch(() => {});
    await svc('DELETE', `/service_audit_log?store_id=eq.${storeId}`).catch(() => {});
    await svc('DELETE', `/received_services?store_id=eq.${storeId}`).catch(() => {});
    // 1) Membresía encargado del run en el piloto A (run-env no la crea).
    await svc('POST', '/user_store_memberships', [{
      user_id: encId, store_id: storeId, role: 'encargado', status: 'active',
    }]);
    // 2) Perfil del encargado: tenant del run + tienda activa = piloto A.
    await svc('PATCH', `/profiles?id=eq.${encId}`, {
      tenant_id: process.env.E2E_RUN_TENANT_ID || runContext?.tenantId,
      active_store_id: storeId,
      role: 'encargado',
    });
    // 3) Verificación del perfil (fail-closed: sin rol encargado el E2E no es válido)
    const prof = await svc('GET', `/profiles?select=id,email,role,active_store_id&id=eq.${encId}`);
    expect(prof.data?.[0]?.role).toBe('encargado');
    expect(prof.data?.[0]?.active_store_id).toBe(storeId);

    // 4) Sesión real del encargado (password grant) para las pruebas API.
    const session = await signIn(ENCARGADO_EMAIL, ENCARGADO_PASS);
    encToken = session.token;
    expect(encToken).toBeTruthy();
  });

  test.afterAll(async () => {
    // ── Teardown defensivo (net-zero independiente del teardown del run) ──
    // 1) Filas de servicio creadas por el spec (store-scoped, piloto del run).
    for (const id of createdServiceIds) {
      await svc('DELETE', `/received_services?id=eq.${id}`).catch(() => {});
    }
    // 2) Tipo GLOBAL creado por el spec (fuera del alcance del teardown del run).
    if (TIPO_PRUEBA) {
      await svc('DELETE', `/service_types?name=eq.${encodeURIComponent(TIPO_PRUEBA)}`).catch(() => {});
    }
    // 3) Membresía añadida en beforeAll + tienda activa restaurada.
    if (encId && storeId) {
      await svc('DELETE', `/user_store_memberships?user_id=eq.${encId}&store_id=eq.${storeId}`).catch(() => {});
    }
    // NOTA: el USUARIO del run lo elimina teardownRunEnv (global-teardown).
    // Si este spec se ejecutara fuera del run, el cleanup del usuario:
    if (!process.env.E2E_ISOLATION && encId) await hardDeleteRunUser(encId).catch(() => {});
  });

  test('encargado crea servicio (fecha escogida), rechazos de fecha, y crea tipo de servicio', async ({ page, request }) => {
    test.setTimeout(300_000);
    const hoy = todayHavana();
    const repro: Record<string, unknown> = { store: storeName, storeId, hoy, encargado: ENCARGADO_EMAIL };

    // ── 1. Login UI real del encargado ───────────────────────────────────
    await page.goto('/');
    await page.waitForTimeout(2500);
    const cookies = page.getByRole('button', { name: /aceptar todas/i }).first();
    if (await cookies.isVisible().catch(() => false)) await cookies.click();
    const entrar = page.getByText(/entrar a costpro/i).first();
    if (await entrar.isVisible().catch(() => false)) { await entrar.click(); await page.waitForTimeout(1800); }
    await page.locator('input[type="email"]').first().fill(ENCARGADO_EMAIL);
    await page.locator('input[type="password"]').first().fill(ENCARGADO_PASS);
    await page.locator('input[type="password"]').first().press('Enter');
    await page.waitForTimeout(5000);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await page.screenshot({ path: `${OUT_DIR}/01-login-encargado.png`, fullPage: true });

    // ── 2. Navegación: OPERACIÓN → Almacén → Servicios Recibidos ─────────
    await page.getByText('OPERACIÓN', { exact: false }).first().click();
    await page.waitForTimeout(1200);
    await page.getByText('Almacén', { exact: false }).first().click();
    await page.waitForTimeout(1200);
    await page.getByText('Servicios Recibidos', { exact: false }).first().click();
    await page.waitForTimeout(2500);
    await expect(page.getByRole('heading', { name: /servicios recibidos/i }).first()).toBeVisible();
    await page.screenshot({ path: `${OUT_DIR}/02-vista-servicios.png`, fullPage: true });

    // ── 3. Abrir «Nuevo Servicio»: el campo de fecha EXISTE y propone HOY ──
    await page.getByRole('button', { name: /nuevo servicio/i }).first().click();
    await page.waitForTimeout(1200);
    const dateInput = page.locator('#service-date');
    await expect(dateInput).toBeVisible();
    const fechaDefault = await dateInput.inputValue();
    expect(fechaDefault, 'la fecha se PROPONE (hoy Habana) y es editable — no se infiere oculta').toBe(hoy);
    expect(await dateInput.getAttribute('max'), 'max = día actual (no futuras)').toBe(hoy);
    repro.fecha_default = fechaDefault;
    await page.screenshot({ path: `${OUT_DIR}/03-modal-fecha-default-hoy.png`, fullPage: true });

    // ── 4. Crear servicio #1 con fecha = HOY (encargado, flujo real UI) ──
    await page.getByRole('radio').first().click();
    await page.locator('input[type="number"]').first().fill('50.25');
    await page.locator('input[placeholder="Ej: TransCaribe S.A."]').fill('QA Proveedor Encargado E2E');
    await page.getByRole('button', { name: /crear servicio/i }).first().click();
    await expect(page.getByText(/servicio creado correctamente/i).first()).toBeVisible({ timeout: 20_000 });
    const fila = page.locator('table tbody tr').first();
    await expect(fila).toBeVisible({ timeout: 15_000 });
    await expect(fila).toContainText(hoy);
    const serviceNumber = (await fila.locator('td').first().innerText()).trim();
    repro.servicio1 = { service_number: serviceNumber, fecha: hoy };
    await page.screenshot({ path: `${OUT_DIR}/04-servicio-creado-hoy.png`, fullPage: true });

    // Persistencia tras recarga completa
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await page.getByText('OPERACIÓN', { exact: false }).first().click();
    await page.waitForTimeout(1000);
    await page.getByText('Almacén', { exact: false }).first().click();
    await page.waitForTimeout(1000);
    await page.getByText('Servicios Recibidos', { exact: false }).first().click();
    await page.waitForTimeout(2500);
    await expect(page.locator('table tbody tr').first()).toContainText(serviceNumber);
    await expect(page.locator('table tbody tr').first()).toContainText(hoy);
    await page.screenshot({ path: `${OUT_DIR}/05-persistencia-tras-recarga.png`, fullPage: true });

    // Localizar el id del servicio creado (verificación de estado en BD)
    const svcRow = await svc('GET', `/received_services?select=id,service_number,service_date,status&store_id=eq.${storeId}&service_number=eq.${serviceNumber}`);
    const service1Id = svcRow.data?.[0]?.id;
    expect(service1Id, 'servicio #1 persistido en BD').toBeTruthy();
    expect(svcRow.data[0].service_date).toBe(hoy);
    createdServiceIds.push(service1Id);

    // ── 5. Fecha ANTERIOR a la última registrada → rechazada en la UI ────
    // Doble defensa observable: (a) atributo min=nueva última fecha — el
    // navegador bloquea el submit (rangeUnderflow), (b) validación cliente
    // validateServiceCreationDate como red de seguridad (unitaria).
    await page.getByRole('button', { name: /nuevo servicio/i }).first().click();
    await page.waitForTimeout(1200);
    const dateInput2 = page.locator('#service-date');
    expect(await dateInput2.inputValue()).toBe(hoy);
    expect(await dateInput2.getAttribute('min'), 'min = última fecha registrada (hoy)').toBe(hoy);
    const ayer = addDays(hoy, -1);
    await dateInput2.fill(ayer);
    expect(await dateInput2.evaluate((el) => (el as HTMLInputElement).validity.rangeUnderflow),
      'fecha anterior → rangeUnderflow (bloqueo nativo)').toBe(true);
    await page.getByRole('radio').first().click();
    await page.locator('input[type="number"]').first().fill('10');
    await page.getByRole('button', { name: /crear servicio/i }).first().click();
    await page.waitForTimeout(1500);
    repro.rechazo_anterior = { fecha_intentada: ayer, ultima: hoy, bloqueo: 'min nativo (rangeUnderflow)' };
    await page.screenshot({ path: `${OUT_DIR}/06-rechazo-fecha-anterior.png`, fullPage: true });
    const filasTrasRechazo = await page.locator('table tbody tr').count();
    // el modal sigue abierto; la tabla debajo no cambió (1 fila)
    expect(filasTrasRechazo).toBe(1);

    // ── 6. Fecha FUTURA → bloqueada (cliente max) y 400 en el servidor ───
    await dateInput2.fill(addDays(hoy, 1));
    expect(await dateInput2.evaluate((el) => (el as HTMLInputElement).validity.rangeOverflow),
      'fecha futura → rangeOverflow (bloqueo nativo)').toBe(true);
    await page.getByRole('button', { name: /crear servicio/i }).first().click();
    await page.waitForTimeout(1500);
    // El navegador bloquea el submit por rangeOverflow O el cliente muestra el toast;
    // en ambos casos NO hay fila nueva y el servidor la rechazaría con 400 (se prueba API).
    const filasTrasFutura = await page.locator('table tbody tr').count();
    expect(filasTrasFutura).toBe(1);
    await page.screenshot({ path: `${OUT_DIR}/07-fecha-futura-bloqueada.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);

    // Prueba server-side explícita (el servidor NUNCA confía en la UI):
    const postFuture = await request.post(`${BASE_URL}/api/received-services`, {
      headers: apiHeaders(encToken),
      data: {
        store_id: storeId,
        supplier: 'QA Futura API',
        total_amount: 10,
        service_type_name: 'Transporte',
        service_date: addDays(hoy, 1),
      },
    });
    expect(postFuture.status()).toBe(400);
    expect((await postFuture.json()).error).toContain('no puede ser posterior al día actual');

    const postBack = await request.post(`${BASE_URL}/api/received-services`, {
      headers: apiHeaders(encToken),
      data: {
        store_id: storeId,
        supplier: 'QA Anterior API',
        total_amount: 10,
        service_type_name: 'Transporte',
        service_date: ayer,
      },
    });
    expect(postBack.status()).toBe(400);
    expect((await postBack.json()).error).toContain('no puede ser anterior a la última fecha registrada');

    // ── 7. Igual a la última fecha → permitida (el igual no es «menor») ──
    const postEqual = await request.post(`${BASE_URL}/api/received-services`, {
      headers: apiHeaders(encToken),
      data: {
        store_id: storeId,
        supplier: 'QA Igual API',
        total_amount: 12.5,
        service_type_name: 'Transporte',
        service_date: hoy,
      },
    });
    expect(postEqual.status()).toBe(201);
    const eqJson = await postEqual.json();
    if (eqJson?.data?.id) createdServiceIds.push(eqJson.data.id);

    // ── 8. Sin Authorization → 401 (el defecto de clase que bloqueaba a todos) ──
    const postNoAuth = await request.post(`${BASE_URL}/api/received-services`, {
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      data: { store_id: storeId, supplier: 'QA Anon', total_amount: 5, service_date: hoy },
    });
    expect([401, 403]).toContain(postNoAuth.status());

    repro.api = { futura: 400, anterior: 400, igual: 201, sin_auth: await postNoAuth.status() };
    await page.screenshot({ path: `${OUT_DIR}/08-api-server-side.png`, fullPage: true });

    // ── 9. Encargado gestiona el catálogo: crea un TIPO de servicio ──────
    await page.getByRole('button', { name: /nuevo servicio/i }).first().click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Gestionar tipos de servicio' }).first().click();
    await page.waitForTimeout(2500);
    const yaExiste = await page.locator('[data-testid="service-types-list"] li').filter({ hasText: TIPO_PRUEBA }).count();
    if (yaExiste === 0) {
      await page.getByRole('button', { name: /agregar nuevo tipo/i }).first().click();
      await page.locator('#service-type-name').fill(TIPO_PRUEBA);
      await page.locator('#service-type-desc').fill('Tipo de prueba E2E misión encargado 2026-10-17');
      await page.getByRole('button', { name: /crear tipo/i }).first().click();
      await expect(page.getByText('creado correctamente')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('[data-testid="service-types-list"]').getByText(TIPO_PRUEBA)).toBeVisible();
    } else {
      test.info().annotations.push({ type: 'note', description: 'El tipo de prueba ya existía — no se crea de nuevo' });
    }
    repro.tipo_creado_por_encargado = TIPO_PRUEBA;
    await page.screenshot({ path: `${OUT_DIR}/09-tipo-creado-por-encargado.png`, fullPage: true });

    writeFileSync(`${OUT_DIR}/repro_log.json`, JSON.stringify(repro, null, 2));
  });
});
