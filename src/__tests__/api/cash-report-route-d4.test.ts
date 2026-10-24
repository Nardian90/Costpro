/**
 * CP-MONEY-002 (D4, posmerge #1467) — GET /api/cash-report a nivel de RUTA.
 *
 * El defecto D4 original era de RUTA: fetchSalePaymentsByTx lanzaba y ni
 * /api/cash-report ni /api/cash-report/payment-totals capturaban → un fallo
 * transitorio del ledger tiraba el Reporte Entrega COMPLETO (500). Este test
 * drive el handler REAL y blinda el contrato exigido por la orden de cierre:
 *   · Ledger disponible → desglose por moneda real con tasa persistida.
 *   · Fallo de lectura del ledger → 200 con degradación a heurística (NUNCA 500).
 *   · Ledger vacío → ídem (heurística, sin inventar importes).
 *   · Venta REVERTIDA → excluida por el filtro status='completed' de la ruta.
 *   · Datos parciales → solo las ventas con ledger usable lo usan.
 *
 * Patrón del propio repo (misión caja 2026-10-24, cash-ledger-route.test.ts):
 * mock capturador que APLICA los filtros eq/in que la ruta pide, para que el
 * comportamiento (y no solo la cadena de llamadas) quede verificado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as CASH_REPORT } from '@/app/api/cash-report/route';

const TX_OK = '11111111-1111-4111-8111-111111111111';
const TX_REV = '22222222-2222-4222-8222-222222222222';

type Mode = 'happy' | 'fail' | 'empty';
let paymentsMode: Mode = 'happy';

const sessionState = {
  value: { user: { id: 'user-1', role: 'manager', memberships: [{ store_id: 'store-1', role: 'manager', status: 'active' }] } } as any,
};
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, sessionState.value),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/supabase-session', () => ({ getSupabaseForSession: () => mockClient() }));
const rolesState = { canManage: true };
vi.mock('@/lib/roles', () => ({
  canManageStore: vi.fn(() => rolesState.canManage),
  canViewStore: () => true,
}));

/** Filtros capturados por tabla: pares (columna, operador, valor). */
const filtersByTable: Record<string, Array<[string, string, unknown]>> = {};

const DB: Record<string, any[]> = {
  profiles: [{ id: 'user-1', active_store_id: 'store-1' }],
  transactions: [
    { id: TX_OK, store_id: 'store-1', status: 'completed', created_at: '2026-10-24T01:00:00Z', sale_currency: 'CUP', cash_amount: 20000, transfer_amount: 0, zelle_amount: 0, total_amount: 20000 },
    { id: TX_REV, store_id: 'store-1', status: 'reverted', created_at: '2026-10-24T02:00:00Z', sale_currency: 'CUP', cash_amount: 99999, transfer_amount: 0, zelle_amount: 0, total_amount: 99999 },
  ],
  transaction_items: [
    { transaction_id: TX_OK, quantity: 2, price_at_sale: 10, price_at_sale_cup: 20000, currency: 'USD', exchange_rate: 1000, cash_paid: 20000, cash_currency: 'CUP', transfer_paid: 0, transfer_currency: null, zelle_paid: 0, zelle_currency: null },
  ],
  payment_transactions: [
    { transaction_id: TX_OK, ref_type: 'sale', payment_method: 'cash', currency: 'USD', amount: 5, exchange_rate: 1000 },
    { transaction_id: TX_OK, ref_type: 'sale', payment_method: 'cash', currency: 'CUP', amount: 15000, exchange_rate: 1 },
  ],
  commission_payments: [],
};

function applyFilters(table: string, rows: any[], filters: Array<[string, string, unknown]>): any[] {
  let out = rows;
  for (const [col, op, val] of filters) {
    if (op === 'eq') out = out.filter((r) => r[col] === val);
    else if (op === 'in') out = out.filter((r) => (val as unknown[]).includes(r[col]));
    else if (op === 'gte') out = out.filter((r) => String(r[col]) >= String(val));
    else if (op === 'lte') out = out.filter((r) => String(r[col]) <= String(val));
    else if (op === 'not') out = out.filter((r) => r[col] != null);
    else if (op === 'or') { /* filtro de atribución de comisiones — dataset vacío */ }
  }
  void table;
  return out;
}

/** Query builder emulando el comportamiento de PostgREST (aplica filtros). */
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
    or(exp: string) { filters.push(['__or', 'or', exp]); return chain; },
    single() { isSingle = true; return chain; },
    then(resolve: (v: any) => void, reject: (e: any) => void) {
      (filtersByTable[table] ||= []).push(...filters);
      const isSaleLedger = table === 'payment_transactions' && filters.some(([c, o, v]) => c === 'ref_type' && o === 'eq' && v === 'sale');
      if (isSaleLedger && paymentsMode === 'fail') {
        reject(new Error('connection reset by peer (simulado)'));
        return;
      }
      let rows = applyFilters(table, DB[table] || [], filters);
      if (isSaleLedger && paymentsMode === 'empty') rows = [];
      if (isSingle) { resolve({ data: rows[0] ?? null, error: null }); return; }
      resolve({ data: rows.length ? rows : null, error: null });
    },
  };
  return chain;
}

function mockClient() {
  return {
    from: (table: string) => makeChain(table),
    rpc: async (fn: string) => ({ data: { totals: {}, sales: [], commissions: [], adjustments: [] }, error: null, fn }),
  };
}

function makeReq(url: string): Request {
  return { method: 'GET', headers: new Map(), url } as unknown as Request;
}
const URL_REPORT = 'http://localhost:3000/api/cash-report?start_date=2026-10-24T00:00:00Z&end_date=2026-10-24T23:59:59Z';

beforeEach(() => {
  paymentsMode = 'happy';
  for (const k of Object.keys(filtersByTable)) delete filtersByTable[k];
});

describe('CP-MONEY-002 D4 · GET /api/cash-report — contrato del Reporte Entrega', () => {
  it('ledger DISPONIBLE → desglose por moneda REAL con tasa PERSISTIDA (cash|USD 5 @1000 + cash|CUP 15000)', async () => {
    const res = await CASH_REPORT(makeReq(URL_REPORT) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    const usd = (body.sales || []).find((g: any) => g.currency === 'USD');
    expect(usd).toMatchObject({ payment_method: 'cash', total: 5, total_cup: 5000 });
    const cup = (body.sales || []).find((g: any) => g.currency === 'CUP');
    expect(cup).toMatchObject({ payment_method: 'cash', total: 15000, total_cup: 15000 });
    expect(body.sales_split?.USD?.cash).toBe(5); // nativo USD en la hoja USD (la hoja refleja su cobro real; equivalente CUP en total_cup)
  });

  it('fallo de lectura del ledger → 200 con degradación a heurística (NUNCA 500 — defecto D4 blindado a nivel de ruta)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    paymentsMode = 'fail';
    const res = await CASH_REPORT(makeReq(URL_REPORT) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Heurística: la venta se reconstruye desde las filas de pago del ítem —
    // CUP canónico 20000; sin inventar componente USD que el ledger no aportó.
    const cup = (body.sales || []).find((g: any) => g.currency === 'CUP');
    expect(cup).toMatchObject({ payment_method: 'cash', total: 20000, total_cup: 20000 });
    expect((body.sales || []).some((g: any) => g.currency === 'USD')).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('ledger VACÍO (sin filas) → 200 con heurística, sin importes inventados', async () => {
    paymentsMode = 'empty';
    const res = await CASH_REPORT(makeReq(URL_REPORT) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    const cup = (body.sales || []).find((g: any) => g.currency === 'CUP');
    expect(cup).toMatchObject({ payment_method: 'cash', total: 20000 });
  });

  it('venta REVERTIDA queda excluida: la ruta filtra status=completed y su importe NUNCA aparece', async () => {
    const res = await CASH_REPORT(makeReq(URL_REPORT) as any);
    expect(res.status).toBe(200);
    const txFilters = (filtersByTable.transactions || []).filter(([c, o]) => c === 'status' && o === 'eq');
    expect(txFilters).toContainEqual(['status', 'eq', 'completed']);
    const body = await res.json();
    const totals = JSON.stringify(body.sales || []);
    expect(totals).not.toContain('99999');
    expect((body.sales || []).reduce((s: number, g: any) => s + g.transaction_count, 0)).toBe(2); // cash|USD + cash|CUP de la ÚNICA venta completada
  });

  it('datos PARCIALES: la venta revertida sin filas de ledger no produce grupos fantasma y la completada sí', async () => {
    const res = await CASH_REPORT(makeReq(URL_REPORT) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    const groups = (body.sales || []).filter((g: any) => g.payment_method === 'cash');
    expect(groups).toHaveLength(2);
    expect(groups.reduce((s: number, g: any) => s + g.total, 0)).toBe(15005); // 15000 CUP + 5 USD nativos
  });
});
