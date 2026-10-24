import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/payments/route';
import { todayBusinessDay } from '@/lib/cash-report/period-attribution';

/**
 * MISIÓN SERVICIOS RECIBIDOS (2026-10-23) — contrato de /api/payments:
 * fecha financiera del pago (V2.12.32, paridad con
 * /api/production-orders/[id]/payments).
 *
 * Reglas verificadas:
 * 1. payment_date FUTURA → 422 accionable (ERR_FUTURE_OPERATION_DATE) ANTES
 *    de tocar la BD. Tope = HOY (día de negocio America/Havana) — la fecha es
 *    un dato de cliente NO confiable.
 * 2. payment_date legítima (pasada) → se pasa p_payment_date al RPC
 *    register_supplier_payment (el RPC ya lo acepta; la ruta nunca lo enviaba).
 * 3. Sin payment_date → NO se pasa p_payment_date (backward compatible: el
 *    RPC usa NOW()).
 * 4. Rechazo del gate de la BD (P0001 ERR_FUTURE_DATED_DOCUMENT /
 *    ERR_BACKDATED_DOCUMENT — validate_operation_date es la fuente de verdad
 *    de los límites) → 422, no 500 opaco.
 * 5. payment_date mal formada (no ISO 8601 datetime) → 400 de schema.
 *
 * checkNotFutureOperationDate NO se mockea: la aserción cubre la semántica
 * real del gate (mismo criterio que received-services-authz con roles).
 */

const sessionUser = { id: 'u1111111-1111-4111-8111-111111111111' };

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, { token: 't', user: sessionUser }),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/with-security', () => ({
  withSecurity: (fn: any) => fn,
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

// Mock del cliente de sesión: profiles.active_store_id + rpc capturado.
const rpcCalls: Array<Record<string, unknown>> = [];
let rpcResult: { data: unknown; error: any } = { data: 'pay-0001', error: null };

vi.mock('@/lib/supabase-session', () => ({
  getSupabaseForSession: () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { active_store_id: 'a1111111-1111-4111-8111-111111111111' },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
      };
    },
    rpc: async (_name: string, params: Record<string, unknown>) => {
      rpcCalls.push(params);
      return rpcResult;
    },
  }),
}));

function makeRequest(body: unknown): any {
  return {
    method: 'POST',
    headers: new Map(),
    json: async () => body,
    url: 'http://localhost:3000/api/payments',
  } as any;
}

const REF_ID = 'c3333333-3333-4333-8333-333333333333';

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    ref_type: 'service',
    ref_id: REF_ID,
    amount: 100,
    payment_method: 'cash',
    currency: 'CUP',
    exchange_rate: 1.0,
    ...overrides,
  };
}

/** ISO de hace N días, al mediodía (misma convención del cliente). */
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

/** ISO de dentro de N días (futuro). */
function isoDaysAhead(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

beforeEach(() => {
  rpcCalls.length = 0;
  rpcResult = { data: 'pay-0001', error: null };
});

describe('POST /api/payments — fecha financiera del pago (V2.12.32)', () => {
  it('payment_date futura → 422 ERR_FUTURE_OPERATION_DATE sin tocar la BD', async () => {
    const res = await POST(makeRequest(baseBody({ payment_date: isoDaysAhead(3) })));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('ERR_FUTURE_OPERATION_DATE');
    expect(body.error).toBe('Fecha del pago no admisible');
    expect(rpcCalls.length).toBe(0);
  });

  it('payment_date legítima (pasada) → p_payment_date llega al RPC', async () => {
    const yesterday = isoDaysAgo(1);
    const res = await POST(makeRequest(baseBody({ payment_date: yesterday })));
    expect(res.status).toBe(201);
    expect(rpcCalls.length).toBe(1);
    expect(rpcCalls[0].p_payment_date).toBe(yesterday);
    expect(rpcCalls[0].p_ref_type).toBe('service');
    expect(rpcCalls[0].p_ref_id).toBe(REF_ID);
    expect(rpcCalls[0].p_amount).toBe(100);
  });

  it('sin payment_date → NO se pasa p_payment_date (backward compatible, RPC usa NOW())', async () => {
    const res = await POST(makeRequest(baseBody()));
    expect(res.status).toBe(201);
    expect(rpcCalls.length).toBe(1);
    expect(rpcCalls[0]).not.toHaveProperty('p_payment_date');
  });

  it('hoy al mediodía es admisible (tope = HOY, no ayer)', async () => {
    // Determinista a cualquier hora UTC del runner: «hoy» se toma del día de
    // negocio America/Havana (misma fuente que el gate de la ruta). Entre
    // 00:00–04:00 UTC el runner ya está en el día calendario siguiente y el
    // «hoy UTC al mediodía» anterior era FUTURO para el gate Habana → fallo
    // flaky diario en esa ventana (reproducido 2026-10-24T00:16Z en CI del
    // PR #1468 y 00:20Z local). Mediodía LOCAL del día de negocio — misma
    // convención del cliente (operation-date.ts resolvePosOperationDate):
    // con |offset| < 12h cae SIEMPRE dentro del mismo día civil Habana.
    const todayNoon = new Date(`${todayBusinessDay()}T12:00:00`).toISOString();
    const res = await POST(makeRequest(baseBody({ payment_date: todayNoon })));
    expect(res.status).toBe(201);
    expect(rpcCalls[0].p_payment_date).toBe(todayNoon);
  });

  it('rechazo del gate de la BD (ERR_FUTURE_DATED_DOCUMENT) → 422, no 500', async () => {
    rpcResult = {
      data: null,
      error: { code: 'P0001', message: 'ERR_FUTURE_DATED_DOCUMENT: la fecha excede el tope' },
    };
    const res = await POST(makeRequest(baseBody({ payment_date: isoDaysAgo(1) })));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('ERR_FUTURE_DATED_DOCUMENT');
  });

  it('rechazo del gate de la BD (ERR_BACKDATED_DOCUMENT) → 422', async () => {
    rpcResult = {
      data: null,
      error: { code: 'P0001', message: 'ERR_BACKDATED_DOCUMENT: antes del piso de 6 meses' },
    };
    const res = await POST(makeRequest(baseBody({ payment_date: isoDaysAgo(1) })));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('ERR_BACKDATED_DOCUMENT');
  });

  it('payment_date mal formada (no ISO datetime) → 400 de schema', async () => {
    const res = await POST(makeRequest(baseBody({ payment_date: '2026-10-23' })));
    expect(res.status).toBe(400);
    expect(rpcCalls.length).toBe(0);
  });

  it('pago mixto: payment_date aplica a todas las filas (misma fecha del dinero)', async () => {
    const yesterday = isoDaysAgo(2);
    const res = await POST(
      makeRequest(
        baseBody({
          payment_method: undefined,
          amount: undefined,
          payment_date: yesterday,
          payments: [
            { payment_method: 'cash', amount: 80, currency: 'CUP', exchange_rate: 1.0 },
            { payment_method: 'transfer', amount: 20, currency: 'CUP', exchange_rate: 1.0, reference: 'TR-1' },
          ],
        })
      )
    );
    expect(res.status).toBe(201);
    expect(rpcCalls.length).toBe(2);
    expect(rpcCalls[0].p_payment_date).toBe(yesterday);
    expect(rpcCalls[1].p_payment_date).toBe(yesterday);
  });

  it('cuerpo sin amount ni payments → 400 (refine del schema intacto)', async () => {
    const res = await POST(makeRequest({ ref_type: 'service', ref_id: REF_ID }));
    expect(res.status).toBe(400);
    expect(rpcCalls.length).toBe(0);
  });
});
