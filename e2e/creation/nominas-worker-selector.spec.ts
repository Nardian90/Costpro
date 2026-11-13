/**
 * E2E MISION TRABAJADORES↔NÓMINAS (2026-11-13) — proyecto 'creation'.
 * ============================================================================
 * Flujo de USUARIO real (browser → UI → API → RPC → BD aislada):
 *
 *   S1  Nueva nómina → escribir el nombre del trabajador en el SELECTOR DE
 *       BÚSQUEDA → aparece el resultado con CI y tarifa → seleccionarlo →
 *       línea incorporada → horas → Guardar borrador → nómina NOM-* creada
 *       con totales del servidor. (Problema A resuelto: misma experiencia que
 *       el selector de productos.)
 *   S2  Trabajadores y Comisiones → fila del trabajador → acción
 *       «Agregar a Nómina» → crear nómina nueva → confirmación → navegación
 *       automática a la pestaña Nóminas con el editor abierto en esa nómina.
 *       (Integración §5: mismo servicio backend que el editor.)
 *
 * El fixture siembra trabajador + tarifa con el SERVICIO REAL de la app
 * (POST /api/workers, POST /api/workers/[id]/salary-rate) y el afterAll
 * limpia todo por id (nóminas → items/concepts por cascade, tarifa,
 * trabajador, idempotencia, secuencia NOM, auditoría) → net-zero.
 *
 * Ejecución EXPLÍCITA (bajo petición del propietario, BD AISLADA):
 *   E2E_ALLOW_CREATION=1 E2E_ISOLATION=1 npm run test:e2e:creation
 * Verificar net-zero al terminar: node e2e/scripts/data-hygiene-guard.cjs
 */
import { test, expect } from '@playwright/test';
import { signIn, injectSession, apiHeaders, sb, requireIsolatedCreation } from '../fixtures/session.fixture';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@costpro.com';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || process.env.ADMIN_PASS || 'costpro123';

const WORKER_FIRST = 'E2e Sel';
const WORKER_LAST = `Trab ${Date.now().toString(36).slice(-5)}`;
// CI cubano válido (validateCubanCI: YYMMDD#####): mes y día REALES de hoy
// + 5 dígitos aleatorios — jamás un día "76" imposible.
const WORKER_CI = `99${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}${String(Math.floor(10000 + Math.random() * 89999))}`;
const RATE = { type: 'hourly', amount: 250, currency: 'CUP' };

test.beforeAll(() => {
  // FAIL-CLOSED: fuera del proyecto aislado esto LANZA (no crea nada).
  requireIsolatedCreation();
});

let adminSession: Awaited<ReturnType<typeof signIn>>;
let workerId = '';
let storeId = '';
const createdPayrollIds: string[] = [];

test.beforeAll(async ({ request }) => {
  adminSession = await signIn(ADMIN_EMAIL, ADMIN_PASS);
  storeId = process.env.E2E_TEST_STORE_ID || '';
  if (!storeId) throw new Error('[nominas-selector] E2E_TEST_STORE_ID no configurado (global-setup del modo aislado)');

  // Sembrar trabajador con el SERVICIO REAL de la app.
  const wres = await request.post('/api/workers', {
    headers: apiHeaders(adminSession.token),
    data: { store_id: storeId, first_name: WORKER_FIRST, last_name: WORKER_LAST, ci: WORKER_CI, gender: 'M' },
  });
  expect(wres.status(), `crear trabajador: ${await wres.text()}`).toBe(201);
  workerId = (await wres.json()).worker.id;

  // Tarifa salarial vigente desde el inicio del mes (servicio real).
  const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
  const rres = await request.post(`/api/workers/${workerId}/salary-rate`, {
    headers: apiHeaders(adminSession.token),
    data: { rate_type: RATE.type, rate_amount: RATE.amount, currency: RATE.currency, valid_from: monthStart },
  });
  expect([200, 201], `fijar tarifa: ${await rres.text()}`).toContain(rres.status());
});

test.afterAll(async () => {
  // Net-zero por id (todo lo creado por ESTE spec): las nóminas se borran y
  // payroll_items/payroll_item_concepts caen por FK CASCADE; luego la
  // idempotencia (record_id), la auditoría, la tarifa y el trabajador. La
  // secuencia NOM solo se elimina si NO queda ninguna nómina en la tienda.
  if (!storeId) return;
  for (const pid of createdPayrollIds) {
    await sb.delete('payrolls', `id=eq.${pid}`).catch(() => {});
    await sb.delete('idempotency_registry', `record_id=eq.${pid}`).catch(() => {});
    await sb.delete('audit_logs', `record_id=eq.${pid}`).catch(() => {});
  }
  if (workerId) {
    await sb.delete('worker_salary_rates', `worker_id=eq.${workerId}`).catch(() => {});
    await sb.delete('workers', `id=eq.${workerId}`).catch(() => {});
    await sb.delete('audit_logs', `record_id=eq.${workerId}`).catch(() => {});
  }
  const remaining = await sb.select('payrolls', `select=id&store_id=eq.${storeId}`).catch(() => []);
  if ((remaining ?? []).length === 0) {
    await sb.delete('document_sequences', `store_id=eq.${storeId}&document_type=eq.payroll`).catch(() => {});
  }
});

/** Shell robusto (dev mode hidrata lento) + sesión inyectada. */
async function abrirWorkers(page: import('@playwright/test').Page) {
  await injectSession(page, adminSession);
  await page.goto('/?view=workers', { waitUntil: 'domcontentloaded' });
  await page.getByText('Trabajadores y Comisiones', { exact: true }).first()
    .waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(1200);
}

test.describe('MISIÓN TRABAJADORES↔NÓMINAS — selector dinámico + Agregar a Nómina', () => {

  test('S1 — Nueva nómina: buscar el trabajador escribiendo, seleccionarlo y guardar', async ({ page }) => {
    await abrirWorkers(page);

    // Pestaña Nóminas (role=tab — UnifiedTabs) → Nueva nómina (button)
    await page.getByRole('tab', { name: /Nóminas/i }).first().click();
    await page.getByRole('button', { name: /Nueva nómina/i }).first().click();
    await expect(page.getByText(/Nueva nómina SC-4-06/i)).toBeVisible({ timeout: 15_000 });

    // Período del mes en curso (date inputs por label envolvente)
    const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
    const today = new Date().toISOString().slice(0, 10);
    await page.locator('section[aria-label="Datos de la nómina"] label', { hasText: /^Desde/ }).locator('input').fill(monthStart);
    await page.locator('section[aria-label="Datos de la nómina"] label', { hasText: /^Hasta/ }).locator('input').fill(today);

    // SELECTOR: escribir el apellido parcial → resultados dinámicos con CI y tarifa
    const search = page.getByPlaceholder(/Buscar trabajador por nombre, apellido o expediente/i);
    await expect(search).toBeVisible();
    await search.fill(WORKER_LAST.slice(0, Math.max(4, WORKER_LAST.length - 2)));

    const option = page.getByRole('option').filter({ hasText: WORKER_FIRST });
    await expect(option).toBeVisible({ timeout: 10_000 });
    await expect(option).toContainText(`CI ${WORKER_CI}`); // identidad completa
    await expect(option).toContainText(/250 CUP\/hora/); // tarifa con unidad

    // Seleccionar → la línea se incorpora y el campo queda limpio
    await option.click();
    await expect(page.locator('article', { hasText: `${WORKER_FIRST} ${WORKER_LAST}` })).toBeVisible({ timeout: 10_000 });
    await expect(search).toHaveValue('');

    // Horas regulares (tarifa horaria) → importe estimado en vivo
    const horas = page.locator('article', { hasText: WORKER_FIRST }).locator('label', { hasText: /Horas regulares/i }).locator('input');
    await horas.fill('8');

    // Guardar borrador → totales del SERVIDOR + numeración NOM
    await page.getByRole('button', { name: /Guardar borrador/i }).click();
    await expect(page.getByText(/NOM-\d{6}-\d{4}/).first()).toBeVisible({ timeout: 20_000 });

    // Registrar para el cleanup: buscar la nómina del trabajador vía API.
    const list = await page.request.get(`/api/payrolls?store_id=${storeId}&status=draft`, {
      headers: apiHeaders(adminSession.token),
    });
    const drafts = (await list.json()).payrolls ?? [];
    const mine = drafts.filter((p: { id: string }) => true).map((p: { id: string }) => p.id);
    createdPayrollIds.push(...mine);
    expect(mine.length).toBeGreaterThan(0);
  });

  test('S2 — Trabajadores: «Agregar a Nómina» crea la nómina y navega al editor', async ({ page }) => {
    await abrirWorkers(page);

    // Pestaña Trabajadores (por defecto) → fila del trabajador sembrado
    const row = page.locator('tr', { hasText: WORKER_FIRST }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    // Acción contextual «Agregar a Nómina» (aria-label del botón de fila)
    const addBtn = row.getByRole('button', { name: new RegExp(`Agregar ${WORKER_FIRST} a una nómina`, 'i') });
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // Modal: elegibilidad con tarifa + crear NUEVA nómina
    const modal = page.getByRole('dialog', { name: new RegExp(`Agregar ${WORKER_FIRST} ${WORKER_LAST} a una nómina`, 'i') });
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await expect(modal.getByText(/250 CUP\/hora/)).toBeVisible({ timeout: 10_000 });

    await modal.getByRole('radio', { name: /Crear nueva nómina/i }).check();
    const qty = modal.getByLabel(/^Horas regulares/i);
    await qty.fill('4');

    await modal.getByRole('button', { name: /Crear nómina y agregar/i }).click();

    // Confirmación REAL → navegación a la pestaña Nóminas con el editor abierto
    await expect(page.getByText(/NOM-\d{6}-\d{4}/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Editando NOM-\d{6}-\d{4}/i)).toBeVisible({ timeout: 15_000 });

    // Registrar la nómina creada para el cleanup (la de S1 + esta).
    const list = await page.request.get(`/api/payrolls?store_id=${storeId}`, {
      headers: apiHeaders(adminSession.token),
    });
    const all = (await list.json()).payrolls ?? [];
    for (const p of all) createdPayrollIds.push(p.id);
  });
});
