/**
 * ADENDA del negocio 2026-10-16 — E2E de UI: FECHA DEL PAGO al confirmar comisiones.
 *
 * Recorrido real en la interfaz (tienda piloto E2E dedicada, nunca operativa; el store
 * del run se hard-deleta en el teardown global — net zero):
 *   OPERACIÓN → Trabajadores y Comisiones → tab «Pagos» → 💰 Pagar →
 *   el formulario de confirmación incluye «Fecha del pago» (input date):
 *     · default = HOY (día de negocio Habana)
 *     · max = hoy (no futura)  · min = último pago realizado del trabajador
 *     · confirmar con fecha futura → error visible y NO se paga
 *     · confirmar con fecha pasada válida → se paga y el reporte la atribuye a ese día
 *
 * Prerequisitos: E2E_TEST_ADMIN_TOKEN + E2E_TEST_STORE_ID + E2E_ADMIN_EMAIL/PASS
 * (los provisiona global-setup en modo aislado) y servidor en localhost:3000.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { getAuthHeaders } from './fixtures/auth.fixture';
import { businessDayOf, todayBusinessDay } from '../src/lib/cash-report/period-attribution';

test.use({ timezoneId: 'America/Havana' });

const TEST_STORE_ID = process.env.E2E_TEST_STORE_ID || '';
const OUT_DIR = 'audit-evidence/20261016-reporte-entrega-1510/adenda-postfix';
const PERIOD_DAY = businessDayOf(new Date(Date.now() - 86_400_000).toISOString()); // ayer de negocio

let headers: Record<string, string>;
let workerId: string | null = null;
let draftId: string | null = null;

test.describe('UI Pagos — fecha del pago elegible (adenda 2026-10-16)', () => {
  test.skip(!process.env.E2E_TEST_ADMIN_TOKEN || !TEST_STORE_ID, 'entorno E2E no configurado');
  test.skip(!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASS, 'credenciales UI del runner no disponibles');

  test.beforeAll(async ({ request }) => {
    headers = getAuthHeaders('admin')!;
    const w = await request.post('/api/workers', {
      headers,
      data: { store_id: TEST_STORE_ID, first_name: 'DatePickerUI', last_name: 'Worker',
              ci: '990103' + Math.floor(10000 + Math.random() * 89999), gender: 'M' },
    });
    expect(w.status()).toBe(201);
    const wBody = await w.json();
    workerId = (wBody.worker || wBody).id;

    const p = await request.post('/api/commissions/payments', {
      headers,
      data: {
        store_id: TEST_STORE_ID, worker_id: workerId,
        period_start: PERIOD_DAY, period_end: PERIOD_DAY,
        calculated_amount: 450, final_amount: 450,
        calculated_breakdown: { calculation_mode: 'manual', worker_id: workerId },
        status: 'draft',
      },
    });
    expect(p.status(), 'draft creado para la prueba de UI').toBe(201);
    draftId = (await p.json()).payment.id;
    fs.mkdirSync(OUT_DIR, { recursive: true });
  });

  test.afterAll(async ({ request }) => {
    if (draftId) {
      await request.patch(`/api/commissions/payments/${draftId}`, { headers, data: { action: 'cancel' } }).catch(() => {});
      await request.delete(`/api/commissions/payments?id=${draftId}`, { headers }).catch(() => {});
    }
    if (workerId) await request.delete(`/api/workers?id=${workerId}`, { headers }).catch(() => {});
  });

  test('el formulario de pago muestra «Fecha del pago» (default hoy) y valida las reglas del negocio', async ({ page }) => {
    test.setTimeout(180_000);

    // ── Login UI con el admin del runner aislado ──
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    for (const t of ['Iniciar sesión', 'Entrar', 'Acceder']) {
      const btn = page.getByText(t, { exact: false }).first();
      if (await btn.count() && await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); break; }
    }
    await page.waitForTimeout(1200);
    await page.locator('input[type="email"], input[name="email"]').first().fill(process.env.E2E_ADMIN_EMAIL!);
    await page.locator('input[type="password"]').first().fill(process.env.E2E_ADMIN_PASS!);
    await page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Iniciar")').first().click();
    await page.waitForTimeout(6000);
    const cookie = page.getByText('Aceptar todas', { exact: false }).first();
    if (await cookie.count() && await cookie.isVisible().catch(() => false)) { await cookie.click(); await page.waitForTimeout(800); }

    // ── Navegación: OPERACIÓN → Trabajadores y Comisiones → tab Pagos ──
    await page.getByText('OPERACIÓN', { exact: true }).first().click();
    await page.waitForTimeout(900);
    await page.getByText('Trabajadores y Comisiones', { exact: true }).first().click();
    await page.waitForTimeout(2000);
    await page.getByRole('tab', { name: 'Pagos' }).click();
    await page.waitForTimeout(1800);

    // ── Abrir el formulario de pago del borrador sembrado ──
    const payBtn = page.getByRole('button', { name: /Pagar/ }).first();
    await expect(payBtn).toBeVisible({ timeout: 15_000 });
    await payBtn.click();
    await page.waitForTimeout(600);

    // ── El selector de fecha está presente, con default HOY y max = hoy ──
    // (la vista renderiza variantes móvil y escritorio; solo una es visible según viewport)
    const dateInput = page.locator('[data-testid="payment-date-input"]:visible').first();
    await expect(dateInput).toBeVisible();
    const today = todayBusinessDay();
    await expect(dateInput).toHaveValue(today);
    await expect(dateInput).toHaveAttribute('max', today);
    await page.screenshot({ path: `${OUT_DIR}/ui-date-picker-default-hoy.png`, fullPage: false });

    // ── Regla 1: fecha futura → rechazada ANTES de tocar el servidor ──
    const tomorrow = businessDayOf(new Date(Date.now() + 86_400_000).toISOString());
    await dateInput.fill(tomorrow);
    await page.getByRole('button', { name: /Confirmar Pago/ }).first().click();
    await page.waitForTimeout(900);
    await expect(page.getByText(/no puede ser posterior al día actual/).first()).toBeVisible({ timeout: 8_000 });
    await page.screenshot({ path: `${OUT_DIR}/ui-date-picker-rechazo-futura.png`, fullPage: false });

    // el pago sigue sin pagarse (ausencia verificada por API)
    const st = await page.request.get(`/api/commissions/payments/${draftId}`, { headers });
    expect(((await st.json()) as { status: string }).status).toBe('draft');

    // ── Regla 2: fecha pasada válida → confirmada y atribuida a ese día ──
    await dateInput.fill(PERIOD_DAY);
    await page.getByRole('button', { name: /Confirmar Pago/ }).first().click();
    await page.waitForTimeout(1600);
    const paid = await page.request.get(`/api/commissions/payments/${draftId}`, { headers });
    const paidBody = (await paid.json()) as { status: string; paid_at: string };
    expect(paidBody.status, 'pago confirmado desde la UI').toBe('paid');
    expect(businessDayOf(paidBody.paid_at), 'paid_at = fecha elegida en la UI').toBe(PERIOD_DAY);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT_DIR}/ui-date-picker-pago-confirmado.png`, fullPage: false });
  });
});
