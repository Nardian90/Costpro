/**
 * cash-report-route-sales-rows.test.ts — MISIÓN PERSONALIZACIÓN DEL REPORTE
 * ENTREGA (2026-10-25). Contrato de `sales_rows` en GET /api/cash-report.
 *
 * Drive el handler REAL (mismo patrón del test D4) y blinda:
 *   · Cada venta completada aparece UNA vez, con sus buckets de composición
 *     real (método × moneda) coherentes con sales_split y los grupos `sales`.
 *   · Las filas llevan created_at/customer_name/reference (presentación) y el
 *     input EXACTO de buildItemsSummary (items + tx + payments) para que el
 *     cliente recalcule la tabla por producto con la MISMA función.
 *   · Las ventas revertidas/voided NUNCA aparecen (status='completed').
 *   · Ventas sin ítems se exponen con buckets sintéticos del pool.
 *   · Fallo de la reconstrucción → respuesta SIN sales_rows (fallback limpio
 *     del módulo, NUNCA 500): la selección queda no disponible, no rota.
 *   · La respuesta NO altera nada ya existente: sales_split/equivs intactos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as CASH_REPORT } from '@/app/api/cash-report/route';

const TX_CUP = '11111111-1111-4111-8111-111111111111';
const TX_USD = '33333333-3333-4333-8333-333333333333';
const TX_MIXED = '44444444-4444-4444-8444-444444444444';
const TX_REV = '22222222-2222-4222-8222-222222222222';
const TX_NOITEMS = '55555555-5555-4555-8555-555555555555';

type Mode = 'happy' | 'fail';
let paymentsMode: Mode = 'happy';
let txMode: Mode = 'happy';

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

const DB: Record<string, any[]> = {
  profiles: [{ id: 'user-1', active_store_id: 'store-1' }],
  transactions: [
    // Venta CUP pura con ítems y fila de pago explícita CUP.
    { id: TX_CUP, store_id: 'store-1', status: 'completed', created_at: '2026-10-24T01:00:00Z', customer_name: 'Ana', notes: 'venta mostrador', sale_currency: 'CUP', sale_exchange_rate: 1, cash_amount: 15000, transfer_amount: 0, zelle_amount: 0, total_amount: 15000 },
    // Venta USD pura con ledger (v2.25): 7 USD @ 800 → canónico 5 600.
    { id: TX_USD, store_id: 'store-1', status: 'completed', created_at: '2026-10-24T02:00:00Z', customer_name: 'Bob', notes: null, sale_currency: 'USD', sale_exchange_rate: 800, cash_amount: 5600, transfer_amount: 0, zelle_amount: 0, total_amount: 7 },
    // Venta MIXTA: 2 000 CUP + 5 USD @ 800.
    { id: TX_MIXED, store_id: 'store-1', status: 'completed', created_at: '2026-10-24T03:00:00Z', customer_name: null, notes: 'mixta', sale_currency: 'MIXED', sale_exchange_rate: 800, cash_amount: 6000, transfer_amount: 0, zelle_amount: 0, total_amount: 25 },
    // Revertida: NUNCA en sales_rows.
    { id: TX_REV, store_id: 'store-1', status: 'reversed', created_at: '2026-10-24T04:00:00Z', sale_currency: 'CUP', sale_exchange_rate: 1, cash_amount: 99999, transfer_amount: 0, zelle_amount: 0, total_amount: 99999 },
    // Sin ítems ni ledger: buckets sintéticos del pool.
    { id: TX_NOITEMS, store_id: 'store-1', status: 'completed', created_at: '2026-10-24T05:00:00Z', customer_name: 'Sin items', notes: null, sale_currency: 'CUP', sale_exchange_rate: 1, cash_amount: 300, transfer_amount: 0, zelle_amount: 0, total_amount: 300 },
  ],
  transaction_items: [
    { transaction_id: TX_CUP, product_id: 'p-cemento', products: { name: 'Cemento', sku: '141' }, quantity: 2, price_at_sale: 7500, price_at_sale_cup: 7500, currency: 'CUP', exchange_rate: 1, cash_paid: 15000, cash_currency: 'CUP', transfer_paid: 0, transfer_currency: null, zelle_paid: 0, zelle_currency: null },
    { transaction_id: TX_USD, product_id: 'p-mc4', products: { name: 'Conector MC4', sku: '22' }, quantity: 7, price_at_sale: 1, price_at_sale_cup: 800, currency: 'USD', exchange_rate: 800, cash_paid: null, cash_currency: null, transfer_paid: 0, transfer_currency: null, zelle_paid: 0, zelle_currency: null },
    { transaction_id: TX_MIXED, product_id: 'p-cable', products: { name: 'Cable', sku: '31' }, quantity: 1, price_at_sale: 8000, price_at_sale_cup: 8000, currency: 'CUP', exchange_rate: 800, cash_paid: null, cash_currency: null, transfer_paid: 0, transfer_currency: null, zelle_paid: 0, zelle_currency: null },
  ],
  payment_transactions: [
    { transaction_id: TX_CUP, ref_type: 'sale', payment_method: 'cash', currency: 'CUP', amount: 15000, exchange_rate: 1 },
    { transaction_id: TX_USD, ref_type: 'sale', payment_method: 'cash', currency: 'USD', amount: 7, exchange_rate: 800 },
    { transaction_id: TX_MIXED, ref_type: 'sale', payment_method: 'cash', currency: 'CUP', amount: 2000, exchange_rate: 1 },
    { transaction_id: TX_MIXED, ref_type: 'sale', payment_method: 'cash', currency: 'USD', amount: 5, exchange_rate: 800 },
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
    else if (op === 'or') { /* atribución de comisiones — dataset vacío */ }
  }
  void table;
  return out;
}

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
      const isSaleLedger = table === 'payment_transactions' && filters.some(([c, o, v]) => c === 'ref_type' && o === 'eq' && v === 'sale');
      if (isSaleLedger && paymentsMode === 'fail') {
        reject(new Error('connection reset by peer (simulado)'));
        return;
      }
      if (table === 'transactions' && txMode === 'fail') {
        reject(new Error('transactions caído (simulado)'));
        return;
      }
      let rows = applyFilters(table, DB[table] || [], filters);
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
const URL_REPORT = 'http://localhost:3000/api/cash-report?start_date=2026-10-24T00:00:00Z&end_date=2026-10-24T23:59:59Z';

beforeEach(() => {
  paymentsMode = 'happy';
  txMode = 'happy';
});

describe('MISIÓN PERSONALIZACIÓN · GET /api/cash-report → sales_rows', () => {
  it('cada venta completada aparece UNA vez con buckets de composición real coherentes con el split', async () => {
    const res = await CASH_REPORT(makeReq(URL_REPORT) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    const rows = body.sales_rows as Array<Record<string, unknown>>;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(4); // CUP + USD + MIXTA + no-items (la revertida NO)

    const cup = rows.find(r => r.id === TX_CUP)!;
    // Ledger CUP-only → heurística (ledgerIsAuthoritative exige filas USD o
    // zelle puro); la fila de pago explícita del ítem da el mismo bucket.
    expect(cup.source).toBe('reconstruction');
    expect(cup.buckets).toEqual([{ method: 'cash', currency: 'CUP', amount: 15000, amount_cup: 15000 }]);
    expect(cup.created_at).toBe('2026-10-24T01:00:00Z');
    expect(cup.customer_name).toBe('Ana');
    expect(cup.reference).toBe('venta mostrador');
    expect(cup.status).toBe('completed');

    const usd = rows.find(r => r.id === TX_USD)!;
    expect(usd.source).toBe('ledger'); // filas cash-USD → ledger autoritativo
    expect(usd.buckets).toEqual([{ method: 'cash', currency: 'USD', amount: 7, amount_cup: 5600 }]);

    const mixed = rows.find(r => r.id === TX_MIXED)!;
    expect(mixed.source).toBe('ledger');
    expect((mixed.buckets as unknown[]).length).toBe(2); // componentes separados por moneda
    const mixedCup = (mixed.buckets as Array<Record<string, unknown>>).find(b => b.currency === 'CUP')!;
    const mixedUsd = (mixed.buckets as Array<Record<string, unknown>>).find(b => b.currency === 'USD')!;
    expect(mixedCup.amount).toBe(2000);
    expect(mixedUsd.amount).toBe(5);
    expect(mixedUsd.amount_cup).toBe(4000);

    // Coherencia con el split: Σ buckets por (moneda, método) == sales_split.
    expect(body.sales_split.CUP.cash).toBe(15000 + 2000 + 300); // CUP + mixta + no-items
    expect(body.sales_split.USD.cash).toBe(7 + 5);
  });

  it('las filas llevan el input EXACTO de buildItemsSummary (items con producto + tx + payments)', async () => {
    const res = await CASH_REPORT(makeReq(URL_REPORT) as any);
    const body = await res.json();
    const rows = body.sales_rows as Array<Record<string, any>>;
    const cup = rows.find(r => r.id === TX_CUP)!;
    expect(cup.items).toHaveLength(1);
    expect(cup.items[0]).toMatchObject({ product_id: 'p-cemento', product_name: 'Cemento', sku: '141' });
    expect(cup.tx).toMatchObject({ cash_amount: 15000, sale_currency: 'CUP' });
    expect(cup.payments).toEqual([{ payment_method: 'cash', currency: 'CUP', amount: 15000, exchange_rate: 1 }]);
    const usd = rows.find(r => r.id === TX_USD)!;
    expect(usd.items[0]).toMatchObject({ product_id: 'p-mc4', product_name: 'Conector MC4' });
  });

  it('venta SIN ítems: fila con buckets sintéticos del pool (selección cubre TODO el universo)', async () => {
    const res = await CASH_REPORT(makeReq(URL_REPORT) as any);
    const body = await res.json();
    const noItems = (body.sales_rows as Array<Record<string, any>>).find(r => r.id === TX_NOITEMS)!;
    expect(noItems.source).toBe('no-items');
    expect(noItems.buckets).toEqual([{ method: 'cash', currency: 'CUP', amount: 300, amount_cup: 300 }]);
    expect(noItems.items).toEqual([]);
    expect(noItems.payments).toEqual([]);
  });

  it('venta REVERTIDA excluida: nunca aparece en sales_rows (filtro status=completed)', async () => {
    const res = await CASH_REPORT(makeReq(URL_REPORT) as any);
    const body = await res.json();
    const ids = (body.sales_rows as Array<Record<string, unknown>>).map(r => r.id);
    expect(ids).not.toContain(TX_REV);
    expect(JSON.stringify(body.sales_rows)).not.toContain('99999');
  });

  it('fallo de la reconstrucción (transactions caído) → 200 SIN sales_rows (fallback limpio, NUNCA 500)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    txMode = 'fail';
    const res = await CASH_REPORT(makeReq(URL_REPORT) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sales_rows).toEqual([]);
    expect(body.sales_split).toEqual({});
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('fallo del ledger de pagos → 200 con heurística: filas presentes con source reconstruction', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    paymentsMode = 'fail';
    const res = await CASH_REPORT(makeReq(URL_REPORT) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    const rows = body.sales_rows as Array<Record<string, any>>;
    expect(rows).toHaveLength(4);
    const cup = rows.find(r => r.id === TX_CUP)!;
    // Heurística: reconstrucción desde la fila de pago del ítem (CUP canónico).
    expect(cup.source).toBe('reconstruction');
    expect(cup.buckets).toEqual([{ method: 'cash', currency: 'CUP', amount: 15000, amount_cup: 15000 }]);
    expect(cup.payments).toEqual([]);
    warn.mockRestore();
  });

  it('sales_rows_truncated solo con >1000 filas (payload acotado, split sobre el universo completo)', async () => {
    const res = await CASH_REPORT(makeReq(URL_REPORT) as any);
    const body = await res.json();
    expect(body.sales_rows_truncated).toBe(false); // 4 filas en el fixture
  });
});
