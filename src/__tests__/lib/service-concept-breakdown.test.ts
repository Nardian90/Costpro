/**
 * service-concept-breakdown.test.ts — MISIÓN 2026-11-11 (Reporte Entrega).
 *
 * Desglose por CONCEPTO de los Servicios Recibidos pagados en efectivo:
 *   · Agrupación dinámica por el concepto real (snapshot service_type_name).
 *   · Solo el componente EN EFECTIVO: transfer/zelle fuera, pagos mixtos sin
 *     doble contabilización (defensa en profundidad + criterios de la consulta).
 *   · «Sin concepto» absorbe nombre vacío/ref_id nulo/ref_id desconocido —
 *     el desglose SIGUE conciliando con el total global.
 *   · Conciliación por construcción: Σ conceptos == Σ filas (§12) con
 *     importes decimales reales.
 *   · Consulta con LOS MISMOS criterios del grupo `payments` del RPC
 *     get_cash_report: tienda (aislamiento multitienda §10) + ventana
 *     payment_date (§11) + include_all_dates; degradación limpia (fallo ⇒
 *     null + warn, el reporte no se rompe) y chunking de received_services.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildServicesConceptBreakdown,
  groupServiceCashByConcept,
  fetchServiceConceptBreakdown,
  SIN_CONCEPTO_LABEL,
  type ServicePaymentRow,
  type SupabaseLikeClient,
  type SupabaseLikeQuery,
  type PostgrestLikeResult,
} from '@/lib/cash-report/service-concept-breakdown';

afterEach(() => {
  vi.restoreAllMocks();
});

/* ── Fixtures: pagos de servicios (cada fila = componente de un método) ── */
const SVC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SVC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SVC_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const CONCEPTOS = new Map<string, string | null>([
  [SVC_A, 'Comisión'],
  [SVC_B, 'Salario Fijo'],
  // SVC_C sin entrada en el mapa → «Sin concepto»
]);

describe('groupServiceCashByConcept — agrupación por concepto', () => {
  it('escenario 3 · varios servicios del MISMO concepto se agrupan (Σ importes, count 3)', () => {
    const rows: ServicePaymentRow[] = [
      { ref_id: SVC_A, amount: 1000, currency: 'CUP', payment_method: 'cash' },
      { ref_id: SVC_A, amount: 900.5, currency: 'CUP', payment_method: 'cash' },
      { ref_id: SVC_A, amount: 999.5, currency: 'CUP', payment_method: 'cash' },
    ];
    const out = groupServiceCashByConcept(rows, CONCEPTOS, 'CUP');
    expect(out).toEqual([{ concept: 'Comisión', total: 2900, count: 3 }]);
  });

  it('escenario 4 · varios conceptos quedan SEPARADOS y ordenados (mayor impacto primero)', () => {
    const rows: ServicePaymentRow[] = [
      { ref_id: SVC_A, amount: 2900, currency: 'CUP', payment_method: 'cash' },
      { ref_id: SVC_B, amount: 5000, currency: 'CUP', payment_method: 'cash' },
      { ref_id: SVC_C, amount: 3200, currency: 'CUP', payment_method: 'cash' },
    ];
    const out = groupServiceCashByConcept(rows, CONCEPTOS, 'CUP');
    expect(out.map(t => t.concept)).toEqual(['Salario Fijo', SIN_CONCEPTO_LABEL, 'Comisión']);
    expect(out.map(t => t.total)).toEqual([5000, 3200, 2900]);
  });

  it('escenario 5 · pagos exclusivamente en efectivo se contabilizan completos', () => {
    const rows: ServicePaymentRow[] = [
      { ref_id: SVC_A, amount: 11100, currency: 'CUP', payment_method: 'cash' },
    ];
    expect(groupServiceCashByConcept(rows, CONCEPTOS, 'CUP')).toEqual([
      { concept: 'Comisión', total: 11100, count: 1 },
    ]);
  });

  it('escenario 6 · pagos EXCLUSIVAMENTE por transferencia NO entran al desglose de efectivo', () => {
    const rows: ServicePaymentRow[] = [
      { ref_id: SVC_A, amount: 7500, currency: 'CUP', payment_method: 'transfer' },
      { ref_id: SVC_B, amount: 2500, currency: 'CUP', payment_method: 'zelle' },
    ];
    expect(groupServiceCashByConcept(rows, CONCEPTOS, 'CUP')).toEqual([]);
  });

  it('escenario 7 · pago MIXTO (cash + transfer): solo el componente EN EFECTIVO, sin doble contabilización', () => {
    const rows: ServicePaymentRow[] = [
      // Un servicio de 11.100 pagado 5.000 efectivo + 6.100 transferencia:
      { ref_id: SVC_A, amount: 5000, currency: 'CUP', payment_method: 'cash' },
      { ref_id: SVC_A, amount: 6100, currency: 'CUP', payment_method: 'transfer' },
    ];
    const out = groupServiceCashByConcept(rows, CONCEPTOS, 'CUP');
    expect(out).toEqual([{ concept: 'Comisión', total: 5000, count: 1 }]);
  });

  it('escenario 8 · servicios SIN concepto: nombre vacío/espacios, ref_id nulo o desconocido → «Sin concepto»', () => {
    const rows: ServicePaymentRow[] = [
      { ref_id: SVC_C, amount: 100, currency: 'CUP', payment_method: 'cash' }, // no está en el mapa
      { ref_id: null, amount: 200, currency: 'CUP', payment_method: 'cash' }, // sin ref_id
      { ref_id: 'def00000-0000-4000-8000-000000000000', amount: 300, currency: 'CUP', payment_method: 'cash' }, // ref_id sin fila
    ];
    const map = new Map<string, string | null>([
      [SVC_C, null], // concepto vacío en BD
      ['def00000-0000-4000-8000-000000000000', '   '], // solo espacios
    ]);
    const out = groupServiceCashByConcept(rows, map, 'CUP');
    expect(out).toEqual([{ concept: SIN_CONCEPTO_LABEL, total: 600, count: 3 }]);
  });

  it('escenario 5.D · conceptos sin importes (Σ 0) NO se muestran', () => {
    const rows: ServicePaymentRow[] = [
      { ref_id: SVC_A, amount: 0, currency: 'CUP', payment_method: 'cash' },
    ];
    expect(groupServiceCashByConcept(rows, CONCEPTOS, 'CUP')).toEqual([]);
  });

  it('monedas por separado: el desglose de CUP no mezcla importes USD (aislamiento de hoja)', () => {
    const rows: ServicePaymentRow[] = [
      { ref_id: SVC_A, amount: 5000, currency: 'CUP', payment_method: 'cash' },
      { ref_id: SVC_A, amount: 7, currency: 'USD', payment_method: 'cash' },
    ];
    const cup = groupServiceCashByConcept(rows, CONCEPTOS, 'CUP');
    const usd = groupServiceCashByConcept(rows, CONCEPTOS, 'USD');
    expect(cup).toEqual([{ concept: 'Comisión', total: 5000, count: 1 }]);
    expect(usd).toEqual([{ concept: 'Comisión', total: 7, count: 1 }]);
  });

  it('importes decimales originales preservados (redondeo a 2 decimales, sin centavos inventados)', () => {
    const rows: ServicePaymentRow[] = [
      { ref_id: SVC_A, amount: 1450.55, currency: 'CUP', payment_method: 'cash' },
      { ref_id: SVC_A, amount: 2349.45, currency: 'CUP', payment_method: 'cash' },
    ];
    expect(groupServiceCashByConcept(rows, CONCEPTOS, 'CUP')).toEqual([
      { concept: 'Comisión', total: 3800, count: 2 },
    ]);
  });

  it('orden determinista con empates: alfabético (documento reproducible)', () => {
    const rows: ServicePaymentRow[] = [
      { ref_id: SVC_A, amount: 100, currency: 'CUP', payment_method: 'cash' },
      { ref_id: SVC_B, amount: 100, currency: 'CUP', payment_method: 'cash' },
    ];
    const out = groupServiceCashByConcept(rows, CONCEPTOS, 'CUP');
    expect(out.map(t => t.concept)).toEqual(['Comisión', 'Salario Fijo']);
  });
});

describe('buildServicesConceptBreakdown — conciliación con el total global', () => {
  it('escenario 12 · Σ conceptos == Σ filas (caso del brief: 2.900 + 5.000 + 3.200 = 11.100)', () => {
    const rows: ServicePaymentRow[] = [
      { ref_id: SVC_A, amount: 1200, currency: 'CUP', payment_method: 'cash' },
      { ref_id: SVC_A, amount: 1700, currency: 'CUP', payment_method: 'cash' }, // Comisión: 2.900
      { ref_id: SVC_B, amount: 5000, currency: 'CUP', payment_method: 'cash' }, // Salario Fijo: 5.000
      { ref_id: SVC_C, amount: 3200, currency: 'CUP', payment_method: 'cash' }, // Sin concepto: 3.200
    ];
    const bd = buildServicesConceptBreakdown(rows, CONCEPTOS);
    const suma = (bd.CUP || []).reduce((s, t) => s + t.total, 0);
    const global = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
    expect(suma).toBe(11100);
    expect(suma).toBe(global); // conciliación exacta
    expect(bd.USD).toEqual([]); // sin filas USD
  });

  it('conciliación con importes «quebrados» (centavos) — sin diferencias por redondeo', () => {
    const rows: ServicePaymentRow[] = Array.from({ length: 7 }, (_, i) => ({
      ref_id: SVC_A,
      amount: 111.11,
      currency: 'CUP',
      payment_method: 'cash',
    }));
    const bd = buildServicesConceptBreakdown(rows, CONCEPTOS);
    const suma = (bd.CUP || []).reduce((s, t) => s + t.total, 0);
    expect(suma).toBeCloseTo(777.77, 2);
    expect((bd.CUP || [])[0].count).toBe(7);
  });

  it('sin servicios en el período → desglose VACÍO (no es un error; escena 9)', () => {
    expect(buildServicesConceptBreakdown([], CONCEPTOS)).toEqual({ CUP: [], USD: [] });
  });
});

/* ── Cliente PostgREST falso (registra los criterios reales de la consulta) ── */
interface RecordedQuery {
  table: string;
  select?: string;
  filters: Array<{ op: string; column: string; value: unknown }>;
}
function makeFakeClient(opts: {
  paymentRows?: Array<Record<string, unknown>>;
  serviceRows?: Array<Record<string, unknown>>;
  failOn?: string;
  queries?: RecordedQuery[];
}): SupabaseLikeClient {
  const makeQuery = (table: string, select?: string): SupabaseLikeQuery => {
    const rec: RecordedQuery = { table, select, filters: [] };
    opts.queries?.push(rec);
    const thenable = (): PromiseLike<PostgrestLikeResult> & PostgrestLikeResult => {
      const data = table === 'payment_transactions'
        ? (opts.paymentRows || [])
        : (opts.serviceRows || []);
      const failed = opts.failOn === table;
      const result: PostgrestLikeResult = failed
        ? { data: null, error: { message: `mock failure on ${table}` } }
        : { data, error: null };
      const p = Promise.resolve(result) as unknown as PromiseLike<PostgrestLikeResult> & PostgrestLikeResult;
      p.then = Promise.resolve(result).then.bind(Promise.resolve(result));
      p.data = result.data;
      p.error = result.error;
      return p;
    };
    const q: SupabaseLikeQuery = {
      eq: (column, value) => { rec.filters.push({ op: 'eq', column, value }); return q; },
      gte: (column, value) => { rec.filters.push({ op: 'gte', column, value }); return q; },
      lte: (column, value) => { rec.filters.push({ op: 'lte', column, value }); return q; },
      in: (column, values) => { rec.filters.push({ op: 'in', column, value: values }); return q; },
      then: (onFulfilled) => Promise.resolve(thenable()).then(onFulfilled),
    };
    return q;
  };
  return {
    from: (table: string) => ({ select: (columns: string) => makeQuery(table, columns) }),
  };
}

const STORE = 'store-1111';
const WINDOW = { dateFrom: '2026-11-10T04:00:00.000Z', dateTo: '2026-11-11T03:59:59.999Z' };

describe('fetchServiceConceptBreakdown — criterios idénticos al RPC get_cash_report', () => {
  it('escenario 10+11 · consulta con store_id + ref_type=service + payment_method=cash + ventana payment_date exacta', async () => {
    const queries: RecordedQuery[] = [];
    const client = makeFakeClient({
      queries,
      paymentRows: [{ ref_id: SVC_A, amount: 11100, currency: 'CUP', payment_method: 'cash' }],
      serviceRows: [{ id: SVC_A, service_type_name: 'Comisión' }],
    });
    const out = await fetchServiceConceptBreakdown(client, { storeId: STORE, includeAllDates: false, ...WINDOW });
    expect(queries).toHaveLength(2);
    const pay = queries[0];
    expect(pay.table).toBe('payment_transactions');
    expect(pay.select).toBe('ref_id, amount, currency, payment_method');
    expect(pay.filters).toContainEqual({ op: 'eq', column: 'store_id', value: STORE });
    expect(pay.filters).toContainEqual({ op: 'eq', column: 'ref_type', value: 'service' });
    expect(pay.filters).toContainEqual({ op: 'eq', column: 'payment_method', value: 'cash' });
    expect(pay.filters).toContainEqual({ op: 'gte', column: 'payment_date', value: WINDOW.dateFrom });
    expect(pay.filters).toContainEqual({ op: 'lte', column: 'payment_date', value: WINDOW.dateTo });
    expect(out).toEqual({ CUP: [{ concept: 'Comisión', total: 11100, count: 1 }], USD: [] });
  });

  it('include_all_dates=true → SIN ventana de fechas (idéntico al RPC p_include_all_dates)', async () => {
    const queries: RecordedQuery[] = [];
    const client = makeFakeClient({ queries, paymentRows: [], serviceRows: [] });
    await fetchServiceConceptBreakdown(client, { storeId: STORE, includeAllDates: true, ...WINDOW });
    expect(queries[0].filters.some(f => f.column === 'payment_date')).toBe(false);
    expect(queries[0].filters).toContainEqual({ op: 'eq', column: 'store_id', value: STORE });
  });

  it('el aislamiento multitienda es server-side: el store_id sale del perfil, no del cliente (escena 10)', async () => {
    const queries: RecordedQuery[] = [];
    const client = makeFakeClient({ queries, paymentRows: [], serviceRows: [] });
    await fetchServiceConceptBreakdown(client, { storeId: 'store-otra', includeAllDates: false, ...WINDOW });
    const pay = queries[0];
    expect(pay.filters.filter(f => f.column === 'store_id')).toEqual([{ op: 'eq', column: 'store_id', value: 'store-otra' }]);
  });

  it('degradación limpia: fallo de payment_transactions → null + warn (el reporte no se rompe)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = makeFakeClient({ failOn: 'payment_transactions' });
    const out = await fetchServiceConceptBreakdown(client, { storeId: STORE, includeAllDates: false, ...WINDOW });
    expect(out).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('desglose de servicios');
  });

  it('degradación limpia: fallo de received_services → null + warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = makeFakeClient({
      paymentRows: [{ ref_id: SVC_A, amount: 100, currency: 'CUP', payment_method: 'cash' }],
      failOn: 'received_services',
    });
    const out = await fetchServiceConceptBreakdown(client, { storeId: STORE, includeAllDates: false, ...WINDOW });
    expect(out).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('chunking: >150 ref_ids consulta received_services en lotes de 150', async () => {
    const ids = Array.from({ length: 301 }, (_, i) => `id-${String(i).padStart(4, '0')}`);
    const paymentRows = ids.map(id => ({ ref_id: id, amount: 10, currency: 'CUP', payment_method: 'cash' }));
    const serviceRows = ids.map(id => ({ id, service_type_name: 'Otros' }));
    const queries: RecordedQuery[] = [];
    // El fake devuelve TODAS las filas en cada lote (suficiente para contar consultas).
    const client = makeFakeClient({ queries, paymentRows, serviceRows });
    const out = await fetchServiceConceptBreakdown(client, { storeId: STORE, includeAllDates: false, ...WINDOW });
    const svcQueries = queries.filter(q => q.table === 'received_services');
    expect(svcQueries).toHaveLength(3); // 150 + 150 + 1
    expect((out?.CUP || [])[0].count).toBe(301);
  });

  it('sin filas → desglose vacío sin consultar received_services (escena 9)', async () => {
    const queries: RecordedQuery[] = [];
    const client = makeFakeClient({ queries, paymentRows: [], serviceRows: [] });
    const out = await fetchServiceConceptBreakdown(client, { storeId: STORE, includeAllDates: false, ...WINDOW });
    expect(out).toEqual({ CUP: [], USD: [] });
    expect(queries.filter(q => q.table === 'received_services')).toHaveLength(0);
  });
});
