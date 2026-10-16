/**
 * MISIÓN 2026-10-16 — Reporte Entrega: criterio canónico del negocio = FECHA DEL PAGO
 * (FIX-RE-1510 v2, adenda del negocio del mismo día).
 *
 * El negocio define (textual): «en el reporte siempre mostrará la fecha en que se
 * confirmó el pago, porque puede ser que aunque la comisión corresponda al día
 * 15/octubre/2026 no se haya pagado ese día sino el 16 — y sí sería correcto que se
 * refleje en el reporte de ese día 16». La incidencia original era del DATO: el pago
 * del 15/10 se ejecutó a las 5:00 PM pero la UI no dejaba escoger la fecha y asumió
 * "ahora" (16/10). Corrección ordenada: paid_at → 15/10 17:00 Habana + date picker
 * nuevo en la confirmación (Trabajadores y Comisiones → Pagos).
 *
 * Este spec verifica contra la API REAL (tienda E2E dedicada, nunca operativa):
 *   A1. Pago con periodo D−2 pagado HOY (sin payment_date → hoy): aparece en el
 *       reporte/detalle de HOY (día de pago), NO en el día del periodo.
 *   A2. Rango D−2..HOY: aparece EXACTAMENTE una vez; total == detalle.
 *   B1. Pago con payment_date = D−2 (fecha explícita): paid_at cae en el día D−2 y
 *       aparece en el detalle de D−2, no en HOY.
 *   B2. Validación de la fecha del pago: fecha futura → 400; fecha anterior al último
 *       pago realizado del trabajador → 400 (reglas del negocio).
 *
 * Prerequisitos: E2E_TEST_ADMIN_TOKEN + E2E_TEST_STORE_ID (global-setup) y servidor
 * en localhost:3000 (el config no auto-arranca webServer).
 */
import { test, expect } from '@playwright/test';
import { getAuthHeaders } from './fixtures/auth.fixture';
import { businessDayWindow, businessDayOf, todayBusinessDay } from '../src/lib/cash-report/period-attribution';

const TEST_STORE_ID = process.env.E2E_TEST_STORE_ID || '';
const UNIQUE_AMOUNT = 777; // importe distintivo para aislar el pago sembrado

/** Día de negocio (Habana) desplazado n días desde hoy (sonda al mediodía: inmune a DST). */
function businessDayShifted(days: number): string {
  const today = todayBusinessDay();
  const [y, m, d] = today.split('-').map(Number);
  return businessDayOf(new Date(Date.UTC(y, m - 1, d, 12, 0, 0) + days * 86_400_000).toISOString());
}

const TODAY = todayBusinessDay();
const PERIOD_DAY = businessDayShifted(-2);      // día del periodo de ventas (≠ día de pago)
const DAY_BEFORE = businessDayShifted(-3);      // para el caso "anterior al último pago"
const TOMORROW = businessDayShifted(1);         // para el caso "no futura"

let headers: Record<string, string>;
let workerAId: string | null = null;   // pago atribuido al día de pago (hoy)
let workerBId: string | null = null;   // pago con payment_date explícita (retroactivo)
let payAId: string | null = null;
let payB1Id: string | null = null;
let payB2Id: string | null = null;

test.describe('Reporte Entrega — comisiones por FECHA DEL PAGO (FIX-RE-1510 v2)', () => {
  test.skip(!process.env.E2E_TEST_ADMIN_TOKEN, 'E2E_TEST_ADMIN_TOKEN not configured');

  test.beforeAll(async ({ request }) => {
    headers = getAuthHeaders('admin')!;
    test.expect(headers).toBeDefined();

    const mkWorker = async (first: string): Promise<string> => {
      const res = await request.post('/api/workers', {
        headers,
        data: { store_id: TEST_STORE_ID, first_name: first, last_name: 'PaidDate',
                ci: '990102' + Math.floor(10000 + Math.random() * 89999), gender: 'M' },
      });
      expect(res.status(), `${first} creado`).toBe(201);
      const body = await res.json();
      return (body.worker || body).id;
    };
    workerAId = await mkWorker('PaidDayA');
    workerBId = await mkWorker('PaidDayB');

    const mkDraft = async (workerId: string, period: string): Promise<string> => {
      const res = await request.post('/api/commissions/payments', {
        headers,
        data: {
          store_id: TEST_STORE_ID, worker_id: workerId,
          period_start: period, period_end: period,
          calculated_amount: UNIQUE_AMOUNT, final_amount: UNIQUE_AMOUNT,
          calculated_breakdown: { calculation_mode: 'manual', worker_id: workerId },
          status: 'draft',
        },
      });
      expect(res.status(), 'pago creado (draft)').toBe(201);
      return (await res.json()).payment.id;
    };

    // A: periodo D−2 pagado HOY sin fecha explícita (compatibilidad: asume hoy)
    payAId = await mkDraft(workerAId, PERIOD_DAY);
    expect((await request.patch(`/api/commissions/payments/${payAId}`, { headers, data: { action: 'approve' } })).status()).toBeLessThan(300);
    const paidA = await request.patch(`/api/commissions/payments/${payAId}`, {
      headers, data: { action: 'pay', payment_method: 'cash', currency: 'CUP', exchange_rate: 1 },
    });
    expect(paidA.status(), 'pago A pagado (paid_at = hoy)').toBeLessThan(300);
    expect(businessDayOf((await paidA.json()).paid_at), 'A atribuido a HOY').toBe(TODAY);

    // B1: mismo periodo D−2 pero con payment_date = D−2 (fecha explícita, flujo nuevo)
    payB1Id = await mkDraft(workerBId, PERIOD_DAY);
    await request.patch(`/api/commissions/payments/${payB1Id}`, { headers, data: { action: 'approve' } });
    const paidB1 = await request.patch(`/api/commissions/payments/${payB1Id}`, {
      headers, data: { action: 'pay', payment_method: 'cash', currency: 'CUP', exchange_rate: 1, payment_date: PERIOD_DAY },
    });
    expect(paidB1.status(), 'pago B1 pagado con payment_date retroactiva').toBeLessThan(300);
    expect(businessDayOf((await paidB1.json()).paid_at), 'paid_at de B1 cae en el día elegido').toBe(PERIOD_DAY);
  });

  test.afterAll(async ({ request }) => {
    // Limpieza: cancelar drafts residuales + borrar pagos y trabajadores de prueba.
    for (const pid of [payAId, payB1Id, payB2Id].filter(Boolean) as string[]) {
      await request.patch(`/api/commissions/payments/${pid}`, { headers, data: { action: 'cancel' } }).catch(() => {});
      await request.delete(`/api/commissions/payments?id=${pid}`, { headers }).catch(() => {});
    }
    for (const wid of [workerAId, workerBId].filter(Boolean) as string[]) {
      await request.delete(`/api/workers?id=${wid}`, { headers }).catch(() => {});
    }
  });

  const wToday = businessDayWindow(TODAY);
  const wPeriod = businessDayWindow(PERIOD_DAY);
  const wRange = { startIso: wPeriod.startIso, endIso: wToday.endIso };

  async function detailsFor(request: import('@playwright/test').APIRequestContext, w: { startIso: string; endIso: string }) {
    const res = await request.get(
      `/api/cash-report/details?type=payment&ref_type=commission&method=cash&currency=CUP` +
      `&start_date=${encodeURIComponent(w.startIso)}&end_date=${encodeURIComponent(w.endIso)}`, { headers });
    expect(res.status(), 'details commission 200').toBe(200);
    return res.json();
  }

  test('día de HOY: el detalle incluye el pago pagado hoy (criterio fecha de pago) — A1', async ({ request }) => {
    const rows = await detailsFor(request, wToday);
    const mine = rows.filter((r: { id: string }) => r.id === payAId);
    expect(mine.length, 'pago A presente en su día de pago').toBe(1);
    expect(Number(mine[0].amount)).toBe(UNIQUE_AMOUNT);
    expect(String(mine[0].reference)).toContain(PERIOD_DAY); // el periodo es metadata informativa
  });

  test('día del periodo D−2: el pago pagado HOY NO aparece (semántica del negocio) — A1', async ({ request }) => {
    const rows = await detailsFor(request, wPeriod);
    const mine = rows.filter((r: { id: string }) => r.id === payAId);
    expect(mine.length, 'pago A ausente del día del periodo (se pagó hoy)').toBe(0);
  });

  test('pago con payment_date = D−2 aparece en el detalle de D−2 y NO en HOY — B1', async ({ request }) => {
    const rowsPeriod = await detailsFor(request, wPeriod);
    const minePeriod = rowsPeriod.filter((r: { id: string }) => r.id === payB1Id);
    expect(minePeriod.length, 'pago B1 presente en la fecha elegida').toBe(1);
    expect(Number(minePeriod[0].amount)).toBe(UNIQUE_AMOUNT);

    const rowsToday = await detailsFor(request, wToday);
    expect(rowsToday.filter((r: { id: string }) => r.id === payB1Id).length, 'pago B1 ausente de HOY').toBe(0);
  });

  test('rango D−2..HOY: cada pago aparece EXACTAMENTE una vez (sin duplicación) — A2', async ({ request }) => {
    const rows = await detailsFor(request, wRange);
    expect(rows.filter((r: { id: string }) => r.id === payAId).length).toBe(1);
    expect(rows.filter((r: { id: string }) => r.id === payB1Id).length).toBe(1);
  });

  test('grupo del reporte (total) y detalle comparten el mismo criterio temporal — A2', async ({ request }) => {
    const repRes = await request.get(
      `/api/cash-report?start_date=${encodeURIComponent(wToday.startIso)}&end_date=${encodeURIComponent(wToday.endIso)}`, { headers });
    expect(repRes.status()).toBe(200);
    const report = await repRes.json();
    const cashCup = (report.commissions || []).find(
      (c: { payment_method: string; currency: string }) => c.payment_method === 'cash' && c.currency === 'CUP');
    const details = await detailsFor(request, wToday);
    const detailsSum = details.reduce((s: number, r: { amount: number }) => s + Number(r.amount || 0), 0);
    // ambos criterios deben cuadrar (checklist FASE C #8)
    expect(Number(cashCup?.total || 0), 'total del grupo == suma del detalle').toBeCloseTo(detailsSum, 2);
    expect(Number(cashCup?.total || 0)).toBeGreaterThanOrEqual(UNIQUE_AMOUNT);
  });

  test('regresión rango: suma(D−2) + suma(HOY) == suma(rango D−2..HOY) sin duplicados — A2', async ({ request }) => {
    const dPeriod = await detailsFor(request, wPeriod);
    const dToday = await detailsFor(request, wToday);
    const dRange = await detailsFor(request, wRange);
    const sum = (rows: Array<{ amount: number }>) => rows.reduce((s, r) => s + Number(r.amount || 0), 0);
    expect(sum(dRange)).toBeCloseTo(sum(dPeriod) + sum(dToday), 2);
    const ids = dRange.map((r: { id: string }) => r.id);
    expect(new Set(ids).size, 'sin ids repetidos en el rango').toBe(ids.length);
  });

  test('fecha del pago FUTURA → rechazada (no superior al día actual) — B2', async ({ request }) => {
    const res = await request.post('/api/commissions/payments', {
      headers,
      data: {
        store_id: TEST_STORE_ID, worker_id: workerBId,
        period_start: DAY_BEFORE, period_end: DAY_BEFORE,
        calculated_amount: UNIQUE_AMOUNT, final_amount: UNIQUE_AMOUNT,
        calculated_breakdown: { calculation_mode: 'manual', worker_id: workerBId },
        status: 'draft',
      },
    });
    expect(res.status()).toBe(201);
    payB2Id = (await res.json()).payment.id;
    await request.patch(`/api/commissions/payments/${payB2Id}`, { headers, data: { action: 'approve' } });

    const pay = await request.patch(`/api/commissions/payments/${payB2Id}`, {
      headers, data: { action: 'pay', payment_method: 'cash', currency: 'CUP', exchange_rate: 1, payment_date: TOMORROW },
    });
    expect(pay.status(), 'fecha futura rechazada').toBe(400);
    expect((await pay.json()).error).toContain('no puede ser posterior');
  });

  test('fecha ANTERIOR al último pago realizado del trabajador → rechazada — B2', async ({ request }) => {
    // B1 quedó pagado en D−2 → un nuevo pago de B con fecha D−3 debe ser rechazado.
    const pay = await request.patch(`/api/commissions/payments/${payB2Id}`, {
      headers, data: { action: 'pay', payment_method: 'cash', currency: 'CUP', exchange_rate: 1, payment_date: DAY_BEFORE },
    });
    expect(pay.status(), 'fecha anterior al último pago rechazada').toBe(400);
    expect((await pay.json()).error).toContain('último pago realizado');
  });
});
