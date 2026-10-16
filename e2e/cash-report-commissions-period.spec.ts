/**
 * MISIÓN 2026-10-16 — Reporte Entrega: atribución de comisiones por PERIODO (FIX-RE-1510)
 *
 * Causa raíz demostrada: el reporte filtraba commission_payments por paid_at (instante de
 * confirmación) en vez del periodo de ventas al que la comisión corresponde
 * (period_start/period_end). Caso real: pago del periodo 15/10 ejecutado el 16/10 10:25
 * Habana aparecía en el reporte del 16 y no en el del 15.
 *
 * Este spec reproduce el caso contra la API REAL (tienda E2E dedicada, nunca operativa):
 *   1. Siembra un pago de comisión con period_start=period_end=15/10/2026 pagado HOY
 *      (paid_at = ahora → día 16) por el flujo oficial: POST draft → approve → pay.
 *   2. Día 15: el pago DEBE aparecer (grupo del reporte + detalle por fila).
 *   3. Día 16: el pago NO debe aparecer.
 *   4. Rango 15–16: el pago aparece EXACTAMENTE una vez; total rango = suma de ambos días.
 *   5. Totales y detalles comparten el mismo criterio temporal.
 *
 * FALLA con el comportamiento defectuoso (atribución por paid_at) y PASA con el fix.
 * Prerequisitos: E2E_TEST_ADMIN_TOKEN + E2E_TEST_STORE_ID (los provisiona global-setup)
 * y el servidor corriendo en localhost:3000 (el config no auto-arranca webServer).
 */
import { test, expect } from '@playwright/test';
import { getAuthHeaders } from './fixtures/auth.fixture';
import { businessDayWindow } from '../src/lib/cash-report/period-attribution';

const TEST_STORE_ID = process.env.E2E_TEST_STORE_ID || '';
const UNIQUE_AMOUNT = 777; // importe distintivo para aislar el pago sembrado
const PERIOD_DAY = '2026-10-15'; // el pago se ejecuta HOY (16/10) → paid_at ≠ periodo

let headers: Record<string, string>;
let testWorkerId: string | null = null;
let testPaymentId: string | null = null;

test.describe('Reporte Entrega — comisiones por periodo (FIX-RE-1510)', () => {
  test.skip(!process.env.E2E_TEST_ADMIN_TOKEN, 'E2E_TEST_ADMIN_TOKEN not configured');

  test.beforeAll(async ({ request }) => {
    headers = getAuthHeaders('admin')!;
    test.expect(headers).toBeDefined();

    // 1) Trabajador de prueba en la tienda E2E
    const workerRes = await request.post('/api/workers', {
      headers,
      data: { store_id: TEST_STORE_ID, first_name: 'PeriodFix', last_name: 'Worker',
              ci: '990101' + Math.floor(10000 + Math.random() * 89999), gender: 'M' },
    });
    if (workerRes.status() === 201) {
      const body = await workerRes.json();
      testWorkerId = (body.worker || body).id;
    }
    expect(testWorkerId, 'worker de prueba creado').toBeTruthy();

    // 2) Pago de comisión por flujo oficial: draft → approve → pay (paid_at = HOY)
    const payRes = await request.post('/api/commissions/payments', {
      headers,
      data: {
        store_id: TEST_STORE_ID, worker_id: testWorkerId,
        period_start: PERIOD_DAY, period_end: PERIOD_DAY,
        calculated_amount: UNIQUE_AMOUNT, final_amount: UNIQUE_AMOUNT,
        calculated_breakdown: { calculation_mode: 'manual', worker_id: testWorkerId },
        status: 'draft',
      },
    });
    expect(payRes.status(), 'pago creado (draft)').toBe(201);
    testPaymentId = (await payRes.json()).payment.id;

    const apprRes = await request.patch(`/api/commissions/payments/${testPaymentId}`, {
      headers, data: { action: 'approve' },
    });
    expect(apprRes.status(), 'pago aprobado').toBeLessThan(300);

    const paidRes = await request.patch(`/api/commissions/payments/${testPaymentId}`, {
      headers, data: { action: 'pay', payment_method: 'cash', currency: 'CUP', exchange_rate: 1 },
    });
    expect(paidRes.status(), 'pago pagado (paid_at = hoy)').toBeLessThan(300);
    const paidBody = await paidRes.json();
    // precondición del caso real: paid_at pertenece a OTRO día que el periodo
    expect(paidBody.paid_at || paidBody.payment?.paid_at).toBeTruthy();
  });

  test.afterAll(async ({ request }) => {
    if (testPaymentId) await request.delete(`/api/commissions/payments?id=${testPaymentId}`, { headers }).catch(() => {});
    if (testWorkerId) await request.delete(`/api/workers?id=${testWorkerId}`, { headers }).catch(() => {});
  });

  const w15 = businessDayWindow('2026-10-15');
  const w16 = businessDayWindow('2026-10-16');
  const wRange = { startIso: w15.startIso, endIso: w16.endIso };

  async function detailsFor(request: import('@playwright/test').APIRequestContext, w: { startIso: string; endIso: string }) {
    const res = await request.get(
      `/api/cash-report/details?type=payment&ref_type=commission&method=cash&currency=CUP` +
      `&start_date=${encodeURIComponent(w.startIso)}&end_date=${encodeURIComponent(w.endIso)}`, { headers });
    expect(res.status(), 'details commission 200').toBe(200);
    return res.json();
  }

  test('día 15/10: el detalle incluye el pago del periodo 15 (antes del fix NO aparecía)', async ({ request }) => {
    const rows = await detailsFor(request, w15);
    const mine = rows.filter((r: { id: string }) => r.id === testPaymentId);
    expect(mine.length, 'pago del periodo 15/10 presente en su día').toBe(1);
    expect(Number(mine[0].amount)).toBe(UNIQUE_AMOUNT);
    expect(String(mine[0].reference)).toContain('2026-10-15');
  });

  test('día 16/10 exclusivo: el detalle NO incluye el pago del periodo 15 (antes del fix SÍ aparecía)', async ({ request }) => {
    const rows = await detailsFor(request, w16);
    const mine = rows.filter((r: { id: string }) => r.id === testPaymentId);
    expect(mine.length, 'pago del periodo 15/10 ausente del 16').toBe(0);
  });

  test('rango 15–16: el pago aparece EXACTAMENTE una vez (sin duplicación)', async ({ request }) => {
    const rows = await detailsFor(request, wRange);
    const mine = rows.filter((r: { id: string }) => r.id === testPaymentId);
    expect(mine.length, 'una sola aparición en el rango').toBe(1);
  });

  test('grupo del reporte (total) y detalle comparten el mismo criterio temporal', async ({ request }) => {
    const repRes = await request.get(
      `/api/cash-report?start_date=${encodeURIComponent(w15.startIso)}&end_date=${encodeURIComponent(w15.endIso)}`, { headers });
    expect(repRes.status()).toBe(200);
    const report = await repRes.json();
    const cashCup = (report.commissions || []).find(
      (c: { payment_method: string; currency: string }) => c.payment_method === 'cash' && c.currency === 'CUP');
    const details = await detailsFor(request, w15);
    const detailsSum = details.reduce((s: number, r: { amount: number }) => s + Number(r.amount || 0), 0);
    // ambos criterios deben cuadrar (checklist FASE C #8)
    expect(Number(cashCup?.total || 0), 'total del grupo == suma del detalle').toBeCloseTo(detailsSum, 2);
    expect(Number(cashCup?.total || 0)).toBeGreaterThanOrEqual(UNIQUE_AMOUNT);
  });

  test('regresión rango: suma(15) + suma(16) == suma(rango 15–16) sin duplicados', async ({ request }) => {
    const d15 = await detailsFor(request, w15);
    const d16 = await detailsFor(request, w16);
    const dRange = await detailsFor(request, wRange);
    const sum = (rows: Array<{ amount: number }>) => rows.reduce((s, r) => s + Number(r.amount || 0), 0);
    expect(sum(dRange)).toBeCloseTo(sum(d15) + sum(d16), 2);
    // ids únicos en el rango (sin duplicación)
    const ids = dRange.map((r: { id: string }) => r.id);
    expect(new Set(ids).size, 'sin ids repetidos en el rango').toBe(ids.length);
  });
});
