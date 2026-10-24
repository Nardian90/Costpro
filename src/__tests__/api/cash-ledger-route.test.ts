/**
 * MISIÓN AUDITORÍA CAJA (2026-10-24) — GET /api/cash-flow/ledger.
 *
 * Regresión del incidente de producción de ENERVIDA-VITALLCONS:
 *   «No se pudo cargar el libro de caja» · PSQL 42703
 *   «column commission_payments.amount does not exist».
 *
 * Causa raíz: la ruta seleccionaba `amount` y `notes` en commission_payments,
 * columnas que NO EXISTEN ni en producción ni en ninguna migración (las
 * reales son final_amount / amount_cup / payment_reference /
 * manual_adjustment_reason). Verificado en vivo (introspección de solo
 * lectura) y reproducido en BD aislada.
 *
 * Este test drive el handler REAL con un mock capturador que emula el
 * comportamiento de PostgREST: si el select pide una columna que no está en
 * el esquema real, devuelve el MISMO error 42703 que producción — así el
 * contrato de columnas queda blindado (un select con columnas inexistentes
 * vuelve a romper el libro de caja).
 *
 * Esquema de referencia (columnas reales de commission_payments en
 * producción, verificado 2026-10-24 vía OpenAPI de PostgREST, solo lectura):
 *   id, store_id, worker_id, period_start, period_end, calculated_amount,
 *   final_amount, manual_adjustment_reason, calculated_breakdown,
 *   rule_applied_id, status, approved_by, approved_at, paid_by, paid_at,
 *   created_at, updated_at, created_by, tenant_id, payment_method, currency,
 *   exchange_rate, amount_cup, due_date, payment_reference
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as LEDGER } from '@/app/api/cash-flow/ledger/route';

// ── Columnas REALES de cada tabla (espejo del esquema de producción) ──
const SCHEMA: Record<string, string[]> = {
  transactions: ['id', 'store_id', 'seller_id', 'total_amount', 'status', 'created_at', 'updated_at', 'payment_method', 'cash_amount', 'transfer_amount', 'zelle_amount', 'sale_currency', 'sale_exchange_rate', 'invoice_number', 'notes', 'idempotency_key', 'customer_name', 'cash_received_cup', 'cash_received_usd', 'change_given_cup', 'change_given_usd', 'change_currency', 'change_exchange_rate', 'change_rate_source'],
  transaction_items: ['id', 'transaction_id', 'product_id', 'variant_id', 'quantity', 'price_at_sale', 'created_at', 'cash_paid', 'transfer_paid', 'price_currency', 'price_at_sale_cup', 'zelle_paid', 'currency', 'exchange_rate', 'cash_currency', 'transfer_currency', 'zelle_currency', 'item_discount_value', 'item_discount_pct'],
  payment_transactions: ['id', 'store_id', 'ref_type', 'ref_id', 'amount', 'payment_method', 'currency', 'exchange_rate', 'amount_cup', 'payment_date', 'reference', 'notes', 'paid_by', 'created_at', 'updated_at', 'idempotency_key', 'transaction_id', 'direction'],
  commission_payments: ['id', 'store_id', 'worker_id', 'period_start', 'period_end', 'calculated_amount', 'final_amount', 'manual_adjustment_reason', 'calculated_breakdown', 'rule_applied_id', 'status', 'approved_by', 'approved_at', 'paid_by', 'paid_at', 'created_at', 'updated_at', 'created_by', 'tenant_id', 'payment_method', 'currency', 'exchange_rate', 'amount_cup', 'due_date', 'payment_reference'],
  cash_closures: ['id', 'user_id', 'store_id', 'session_reference', 'declared_cash', 'declared_vouchers', 'system_total', 'notes', 'closed_at', 'created_at', 'declared_total', 'system_expected_total', 'status', 'difference', 'opening_balance', 'cash_movements_total', 'opening_balance_cup', 'opening_balance_usd', 'opening_difference_cup', 'opening_difference_usd', 'opening_difference_note', 'declared_cash_usd', 'system_expected_cash_usd', 'difference_usd'],
  profiles: ['id', 'store_id', 'full_name', 'email', 'role', 'roles', 'is_active', 'active_store_id', 'created_at', 'updated_at', 'plan', 'tenant_id'],
};

/** Datos por tabla que el mock devuelve (controlables por test). */
const tableData: Record<string, any[]> = {};
/** Selects capturados: table → columnas pedidas. */
const selects: Array<{ table: string; columns: string }> = [];
/** Errores forzados por tabla (para probar el camino de error real). */
const forcedErrors: Record<string, string | null> = {};

const sessionState = {
  value: { user: { id: 'user-1', role: 'manager', memberships: [{ store_id: 'store-1', role: 'manager', status: 'active' }] } } as any,
};
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, sessionState.value),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/csrf', () => ({ validateOrigin: () => true }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }) }));
const rolesState = { canManage: true };
vi.mock('@/lib/roles', () => ({
  canManageStore: vi.fn(() => rolesState.canManage),
  canViewStore: () => true,
}));

/** Emula el query builder de supabase-js con validación de columnas PostgREST. */
function makeChain(table: string, columns: string) {
  selects.push({ table, columns });
  const bare = columns.split('(')[0];
  // Embeds PostgREST (alias:tabla(cols)) no son columnas de la tabla base —
  // se validan aparte (la tabla embebida sí debe existir en el esquema).
  const asked = bare.split(',').map(c => c.trim()).filter(c => c && !c.includes(':'));
  const embedTable = (() => {
    const m = columns.match(/:\s*([a-z_]+)\s*\(/i);
    return m?.[1] ?? null;
  })();
  if (embedTable && !SCHEMA[embedTable]) {
    throw new Error(`tabla embebida desconocida en el mock: ${embedTable}`);
  }
  const missing = asked.filter(c => !SCHEMA[table]?.includes(c));
  const err = missing.length
    ? `column ${table}.${missing[0]} does not exist`
    : forcedErrors[table] ?? null;
  const data = tableData[table] ?? [];
  // Thenable único estilo supabase-js: resuelve { data, error } (nunca reject)
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    gt: () => chain,
    lte: () => chain,
    in: () => chain,
    or: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (resolve: any, _reject: any) =>
      Promise.resolve(err ? { data: null, error: { message: err, code: '42703' } } : { data, error: null }).then(resolve),
  };
  return chain;
}

const rpcCalls: Array<{ name: string; args: any }> = [];
const rpcResult = { value: { data: null as any, error: null as any } };
const mockAdminClient = {
  rpc: (name: string, args: any) => {
    rpcCalls.push({ name, args });
    return Promise.resolve(rpcResult.value);
  },
  from: (table: string) => ({
    select: (columns: string) => makeChain(table, columns),
  }),
};
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdminSafe: () => mockAdminClient }));

function makeReq(url: string): Request {
  return {
    method: 'GET',
    headers: new Map(),
    url,
  } as any;
}
/** El handler firma NextRequest — cast del Request de prueba (patrón cash-flow-route.test.ts). */
const makeReqAsNext = makeReq as unknown as (url: string) => import('next/server').NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
  selects.length = 0;
  rpcCalls.length = 0;
  for (const k of Object.keys(tableData)) delete tableData[k];
  for (const k of Object.keys(forcedErrors)) delete forcedErrors[k];
  rolesState.canManage = true;
  rpcResult.value = {
    data: { window: { from: '1970-01-01T00:00:00Z', to: '2026-10-24T00:00:00Z' }, terms: {}, net: { CUP: 0, USD: 0 } },
    error: null,
  };
  sessionState.value = { user: { id: 'user-1', role: 'manager', memberships: [] } };
});

const STORE = '11111111-1111-4111-8111-111111111111';
const LEDGER_URL = `http://localhost:3000/api/cash-flow/ledger?store_id=${STORE}`;

describe('GET /api/cash-flow/ledger — regresión commission_payments (incidente ENERVIDA)', () => {
  it('REGRESIÓN DEL BUG: el select de commission_payments usa SOLO columnas reales (sin amount/notes)', async () => {
    const res = await LEDGER(makeReqAsNext(LEDGER_URL));
    expect(res.status).toBe(200);
    const commSelect = selects.find(s => s.table === 'commission_payments');
    expect(commSelect).toBeDefined();
    const cols = commSelect!.columns.split(',').map(c => c.trim());
    expect(cols).not.toContain('amount');        // ← la columna del incidente
    expect(cols).not.toContain('notes');         // ← segunda columna fantasma
    expect(cols).toContain('final_amount');      // importe nativo editable
    expect(cols).toContain('amount_cup');        // canónico CUP
    expect(cols).toContain('payment_reference'); // descripción/referencia real
  });

  it('el contrato de columnas se cumple para TODAS las tablas del libro (emulación PostgREST 42703)', async () => {
    const res = await LEDGER(makeReqAsNext(LEDGER_URL));
    expect(res.status).toBe(200);
    // Cada select pedido existe en el esquema real — el mock habría devuelto
    // error 42703 y la ruta 500 si alguna columna fuera fantasma.
    expect(selects.length).toBeGreaterThanOrEqual(4);
    for (const s of selects) {
      const asked = s.columns.split('(')[0].split(',').map(c => c.trim()).filter(c => c && !c.includes(':'));
      const missing = asked.filter(c => !SCHEMA[s.table]?.includes(c));
      expect(missing, `columnas fantasma en ${s.table}: ${missing.join(',')}`).toEqual([]);
    }
  });

  it('clasificación CUP: native = final_amount, canónico firmado = -abs(amount_cup), descripción con payment_reference', async () => {
    tableData.commission_payments = [{
      id: 'comm-1',
      final_amount: 300,
      amount_cup: 300,
      currency: 'CUP',
      exchange_rate: 1,
      payment_method: 'cash',
      status: 'paid',
      paid_at: '2026-10-24T15:00:00.000Z',
      paid_by: 'user-9',
      payment_reference: 'REF-77',
      manual_adjustment_reason: null,
    }];
    tableData.profiles = [{ id: 'user-9', full_name: 'Israel Q.' }];
    const res = await LEDGER(makeReqAsNext(LEDGER_URL));
    expect(res.status).toBe(200);
    const body = await res.json();
    const commRow = body.rows.find((r: any) => r.id === 'comm-comm-1');
    expect(commRow).toBeDefined();
    expect(commRow.movement_type).toBe('comision');
    expect(commRow.movement_label).toBe('Comisión pagada (efectivo)');
    expect(commRow.currency).toBe('CUP');
    expect(commRow.amount_native).toBe(300);           // final_amount (nativo)
    expect(commRow.amount_cup_signed).toBe(-300);      // salida del libro físico
    expect(commRow.reference).toBe('REF-77');          // referencia real
    expect(commRow.description).toBe('REF-77');
    expect(commRow.user_name).toBe('Israel Q.');       // resuelto vía paid_by → profiles
    expect(commRow.status).toBe('paid');
  });

  it('clasificación USD: native = amount_cup / exchange_rate (espejo del RPC get_cash_currency_summary)', async () => {
    tableData.commission_payments = [{
      id: 'comm-2',
      final_amount: 20,
      amount_cup: 480,
      currency: 'USD',
      exchange_rate: 24,
      payment_method: 'cash',
      status: 'paid',
      paid_at: '2026-10-24T16:00:00.000Z',
      paid_by: null,
      payment_reference: null,
      manual_adjustment_reason: null,
    }];
    const res = await LEDGER(makeReqAsNext(LEDGER_URL));
    expect(res.status).toBe(200);
    const body = await res.json();
    const commRow = body.rows.find((r: any) => r.id === 'comm-comm-2');
    expect(commRow.currency).toBe('USD');
    expect(commRow.amount_native).toBe(20);        // 480 / 24 — misma fórmula del RPC
    expect(commRow.amount_cup_signed).toBe(-480);  // canónico CUP íntegro
    expect(commRow.description).toBe('Comisión pagada en efectivo'); // sin referencia → estática
  });

  it('USD sin tasa registrada (0/null): native = amount_cup sin inventar tasa; canónico intacto', async () => {
    tableData.commission_payments = [{
      id: 'comm-3',
      final_amount: 25,
      amount_cup: 0, // sin canónico calculado
      currency: 'USD',
      exchange_rate: 0, // tasa inválida — antes: exchange_rate||1 → nativo=amount_cup (tasa inventada 1)
      payment_method: 'cash',
      status: 'paid',
      paid_at: '2026-10-24T17:00:00.000Z',
      paid_by: null,
      payment_reference: null,
      manual_adjustment_reason: null,
    }];
    const res = await LEDGER(makeReqAsNext(LEDGER_URL));
    const body = await res.json();
    const commRow = body.rows.find((r: any) => r.id === 'comm-comm-3');
    expect(commRow.amount_native).toBe(0);  // muestra el canónico (0) — nunca 0/1 con tasa inventada
    expect(commRow.amount_cup_signed).toBe(0);
  });

  it('si una fuente falla con error real, la ruta devuelve 500 con el MENSAJE real (no se oculta)', async () => {
    forcedErrors.commission_payments = 'column commission_payments.amount does not exist';
    const res = await LEDGER(makeReqAsNext(LEDGER_URL));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('commission_payments.amount'); // error real visible al cliente
  });

  it('CUP con final_amount nulo: respaldo amount_cup (nunca NaN ni columna fantasma)', async () => {
    tableData.commission_payments = [{
      id: 'comm-4',
      final_amount: null,
      amount_cup: 150,
      currency: 'CUP',
      exchange_rate: 1,
      payment_method: 'cash',
      status: 'paid',
      paid_at: '2026-10-24T18:00:00.000Z',
      paid_by: null,
      payment_reference: null,
      manual_adjustment_reason: 'ajuste manual documentado',
    }];
    const res = await LEDGER(makeReqAsNext(LEDGER_URL));
    const body = await res.json();
    const commRow = body.rows.find((r: any) => r.id === 'comm-comm-4');
    expect(commRow.amount_native).toBe(150);      // respaldo amount_cup
    expect(commRow.amount_cup_signed).toBe(-150);
  });

  it('sin tienda autorizada → 403 (aislamiento multitienda en la ruta)', async () => {
    rolesState.canManage = false;
    const res = await LEDGER(makeReqAsNext(LEDGER_URL));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('No tienes acceso a esta tienda');
  });

  it('parametría inválida → 400 con detalles (uuid inválido, moneda ilegal)', async () => {
    const res = await LEDGER(makeReqAsNext('http://localhost:3000/api/cash-flow/ledger?store_id=no-uuid'));
    expect(res.status).toBe(400);
    const res2 = await LEDGER(makeReqAsNext(`http://localhost:3000/api/cash-flow/ledger?store_id=${STORE}&currency=EUR`));
    expect(res2.status).toBe(400);
  });
});
