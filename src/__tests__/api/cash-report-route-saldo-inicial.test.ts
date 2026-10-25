/**
 * cash-report-route-saldo-inicial.test.ts — MISIÓN CORRECTIVA DEFINITIVA
 * (2026-10-25). Contrato del SALDO INICIAL y los COBROS EN BILLETES en
 * GET /api/cash-report.
 *
 * Drive el handler REAL (mismo patrón del test de sales_rows / D4) y blinda:
 *   · `opening_balance` llega del RPC autoritativo get_cash_currency_summary
 *     (service_role, tras canManageStore — patrón del libro de caja) con
 *     ventana [origen, inicio del período) — NUNCA el saldo actual.
 *   · Límite µs-exacto: el saldo inicial cubre hasta startDate − 1µs (sin
 *     solapamiento ni hueco con el período, que filtra >= startDate).
 *   · `sales_bills_split`: ventas con liquidación explícita aportan el NETO
 *     de billetes (recibido − vuelto) por moneda; legadas aportan su bucket
 *     cash. `sales_rows[].settlement` viaja para la recomputación por selección.
 *   · `cash_balance_cup` = esperado CUP con el saldo inicial integrado
 *     (fórmula única de summary.ts — misma que pantalla/PDF/Excel).
 *   · Fallo del RPC de apertura ⇒ degradación limpia (opening 0 + warn),
 *     NUNCA un 500 del reporte.
 *   · include_all_dates ⇒ el período ES toda la historia ⇒ apertura 0 (sin
 *     llamar al RPC).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as CASH_REPORT } from '@/app/api/cash-report/route';

const TX_MC4 = '23ccd04f-db81-4537-a3db-2dabf40e31a8';
const TX_LEGACY = '11111111-1111-4111-8111-111111111111';

type OpeningMode = 'ok' | 'fail';
let openingMode: OpeningMode = 'ok';
let openingCalls: Array<{ p_store_id: string; p_from: string | null; p_to: string | null }> = [];

const sessionState = {
  value: { user: { id: 'user-1', role: 'manager', memberships: [{ store_id: 'store-1', role: 'manager', status: 'active' }] } } as any,
};
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, sessionState.value),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/supabase-session', () => ({ getSupabaseForSession: () => mockClient() }));
vi.mock('@/lib/supabase-admin', () => ({
  // Patrón del libro de caja: RPC service_role tras validar canManageStore.
  getSupabaseAdminSafe: () => ({
    rpc: async (_fn: string, args: any) => {
      openingCalls.push({ p_store_id: args.p_store_id, p_from: args.p_from, p_to: args.p_to });
      if (openingMode === 'fail') return { data: null, error: { message: 'function not found (simulado)' } };
      // Neto acumulado del libro ANTES del 23/10 (caso ENERVIDA documental):
      return { data: { net: { CUP: 8438079.98, USD: 357 } }, error: null };
    },
  }),
}));
const rolesState = { canManage: true };
vi.mock('@/lib/roles', () => ({
  canManageStore: vi.fn(() => rolesState.canManage),
  canViewStore: () => true,
}));

const DB: Record<string, any[]> = {
  profiles: [{ id: 'user-1', active_store_id: 'store-1' }],
  transactions: [
    // La venta del 23/10 (caso ENERVIDA): 7 USD @ 800, liquidación explícita
    // con billete de 10 USD y 2.400 CUP de vuelto.
    {
      id: TX_MC4, store_id: 'store-1', status: 'completed', created_at: '2026-10-23T22:15:24Z',
      customer_name: null, notes: null, sale_currency: 'CUP', sale_exchange_rate: 1,
      cash_amount: 5600, transfer_amount: 0, zelle_amount: 0, total_amount: 5600,
      cash_received_cup: null, change_given_cup: 2400, cash_received_usd: 10, change_given_usd: null,
    },
    // Venta legada (sin liquidación): bucket cash por moneda como billetes.
    {
      id: TX_LEGACY, store_id: 'store-1', status: 'completed', created_at: '2026-10-23T15:00:00Z',
      customer_name: 'Ana', notes: null, sale_currency: 'CUP', sale_exchange_rate: 1,
      cash_amount: 2000, transfer_amount: 0, zelle_amount: 0, total_amount: 2000,
      cash_received_cup: null, change_given_cup: null, cash_received_usd: null, change_given_usd: null,
    },
  ],
  transaction_items: [
    { transaction_id: TX_MC4, product_id: 'p-mc4', products: { name: 'Conectores MC4', sku: '999' }, quantity: 1, price_at_sale: 7, price_at_sale_cup: 5600, currency: 'USD', exchange_rate: 800, cash_paid: 7, cash_currency: 'USD', transfer_paid: 0, transfer_currency: null, zelle_paid: 0, zelle_currency: null },
    { transaction_id: TX_LEGACY, product_id: 'p-cemento', products: { name: 'Cemento', sku: '141' }, quantity: 1, price_at_sale: 2000, price_at_sale_cup: 2000, currency: 'CUP', exchange_rate: 1, cash_paid: 2000, cash_currency: 'CUP', transfer_paid: 0, transfer_currency: null, zelle_paid: 0, zelle_currency: null },
  ],
  payment_transactions: [
    // Fila de pago de la venta MC4 (canónico CUP 5.600 — trazabilidad).
    { transaction_id: TX_MC4, ref_type: 'sale', payment_method: 'cash', currency: 'CUP', amount: 5600, exchange_rate: 1 },
    { transaction_id: TX_LEGACY, ref_type: 'sale', payment_method: 'cash', currency: 'CUP', amount: 2000, exchange_rate: 1 },
    // ENTREGA IE-000001-2026: salida real de 8.435.679,98 CUP del período.
    { id: '8e4fd8d7-d70a-4c5b-a9d5-7fcb6bffb06e', store_id: 'store-1', ref_type: 'cash_flow', direction: 'out', payment_method: 'cash', currency: 'CUP', amount: 8435679.98, amount_cup: 8435679.98, notes: 'IE-000001-2026 · entrega_efectivo: Entregado', paid_by: null, created_at: '2026-10-24T17:30:38Z', payment_date: '2026-10-23T16:00:00Z', ref_id: 'f158d156-d067-4d88-8eae-a0638424d39a', transaction_id: null },
  ],
  commission_payments: [],
};

function makeChain(table: string) {
  const filters: Array<[string, string, unknown]> = [];
  let isSingle = false;
  const chain = {
    select() { return chain; },
    eq(col: string, val: unknown) { filters.push([col, 'eq', val]); return chain; },
    gte(col: string, val: unknown) { filters.push([col, 'gte', val]); return chain; },
    lte(col: string, val: unknown) { filters.push([col, 'lte', val]); return chain; },
    in(col: string, val: unknown) { filters.push([col, 'in', val]); return chain; },
    not(col: string, _op: string, val: unknown) { filters.push([col, 'not', val]); return chain; },
    or(_exp: string) { return chain; },
    single() { isSingle = true; return chain; },
    then(resolve: (v: any) => void) {
      let rows: any[] = DB[table] || [];
      for (const [col, op, val] of filters) {
        if (op === 'eq') rows = rows.filter((r) => r[col] === val);
        else if (op === 'in') rows = rows.filter((r) => (val as unknown[]).includes(r[col]));
        else if (op === 'gte') rows = rows.filter((r) => String(r[col]) >= String(val));
        else if (op === 'lte') rows = rows.filter((r) => String(r[col]) <= String(val));
        else if (op === 'not') rows = rows.filter((r) => r[col] != null);
      }
      if (table === 'transactions') {
        // La ruta consulta ventas del período por created_at.
        rows = rows.filter((r) => String(r.created_at) >= String(filters.find(([c, o]) => c === 'created_at' && o === 'gte')?.[2] ?? '')
          && String(r.created_at) <= String(filters.find(([c, o]) => c === 'created_at' && o === 'lte')?.[2] ?? '9999'));
      }
      if (isSingle) { resolve({ data: rows[0] ?? null, error: null }); return; }
      resolve({ data: rows.length ? rows : null, error: null });
    },
  };
  return chain;
}

function mockClient() {
  return {
    from: (table: string) => makeChain(table),
    rpc: async () => ({ data: { totals: {}, sales: [], commissions: [], adjustments: [] }, error: null }),
  };
}

function makeReq(url: string): Request {
  return { method: 'GET', headers: new Map(), url } as unknown as Request;
}
// Día de negocio 23/10 Habana: [04:00Z, 23:59:59.999Z).
const URL_2310 = 'http://localhost:3000/api/cash-report?start_date=2026-10-23T04:00:00.000Z&end_date=2026-10-24T03:59:59.999Z';

beforeEach(() => {
  openingMode = 'ok';
  openingCalls = [];
});

describe('MISIÓN CORRECTIVA · GET /api/cash-report → saldo inicial y cobros en billetes', () => {
  it('opening_balance del RPC autoritativo con ventana [origen, inicio del período) — límite µs-exacto', async () => {
    const res = await CASH_REPORT(makeReq(URL_2310) as any);
    expect(res.status).toBe(200);
    // UNA llamada al libro, con p_from NULL (desde el origen) y p_to =
    // startDate − 1µs (03:59:59.999999Z): sin solapamiento con el período.
    expect(openingCalls).toHaveLength(1);
    expect(openingCalls[0].p_from).toBeNull();
    expect(openingCalls[0].p_to).toBe('2026-10-23T03:59:59.999999Z');
    const body = await res.json();
    expect(body.opening_balance).toEqual({ CUP: 8438079.98, USD: 357 });
  });

  it('la tienda del caller se pasa al RPC (aislamiento por tienda)', async () => {
    await CASH_REPORT(makeReq(URL_2310) as any);
    expect(openingCalls[0].p_store_id).toBe('store-1');
  });

  it('sales_bills_split: liquidación explícita aporta el NETO de billetes por moneda (regla del libro §1)', async () => {
    const res = await CASH_REPORT(makeReq(URL_2310) as any);
    const body = await res.json();
    // Venta MC4: +10 USD − 2.400 CUP. Venta legada: +2.000 CUP (bucket cash).
    expect(body.sales_bills_split).toEqual({ CUP: 2000 - 2400, USD: 10 });
    // La fila de venta viaja con su liquidación (recomputación por selección):
    const mc4 = (body.sales_rows as any[]).find((r) => r.id === TX_MC4)!;
    expect(mc4.settlement).toEqual({ cash_received_cup: null, change_given_cup: 2400, cash_received_usd: 10, change_given_usd: null });
    const legacy = (body.sales_rows as any[]).find((r) => r.id === TX_LEGACY)!;
    expect(legacy.settlement).toBeNull();
  });

  it('cash_balance_cup = esperado CUP con el saldo inicial integrado (fórmula única)', async () => {
    const res = await CASH_REPORT(makeReq(URL_2310) as any);
    const body = await res.json();
    // 8.438.079,98 (apertura) + 2.000 (legada) − 2.400 (vuelto MC4)
    // − 8.435.679,98 (entrega IE-000001) = 2.000... y el cobro MC4 en USD:
    // espera CUP = 8.438.079,98 + (2.000 − 2.400) − 8.435.679,98 = 2.000.
    expect(Number(body.cash_balance_cup.toFixed(2))).toBe(2000);
  });

  it('fallo del RPC de apertura ⇒ degradación limpia (opening 0), NUNCA 500', async () => {
    openingMode = 'fail';
    const res = await CASH_REPORT(makeReq(URL_2310) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.opening_balance).toEqual({ CUP: 0, USD: 0 });
    // El resto del reporte sigue completo:
    expect(body.sales_bills_split).toEqual({ CUP: 2000 - 2400, USD: 10 });
  });

  it('include_all_dates ⇒ apertura 0 por definición (el período ES toda la historia; sin llamada al RPC)', async () => {
    const res = await CASH_REPORT(makeReq('http://localhost:3000/api/cash-report?include_all_dates=true') as any);
    expect(res.status).toBe(200);
    expect(openingCalls).toHaveLength(0);
    const body = await res.json();
    expect(body.opening_balance).toEqual({ CUP: 0, USD: 0 });
  });

  it('sin permiso sobre la tienda ⇒ 403 (autenticación y aislamiento intactos)', async () => {
    rolesState.canManage = false;
    try {
      const res = await CASH_REPORT(makeReq(URL_2310) as any);
      expect(res.status).toBe(403);
      expect(openingCalls).toHaveLength(0); // el RPC service_role NO se toca
    } finally {
      rolesState.canManage = true;
    }
  });
});
