/**
 * CP-AP-FORENSIC-RECONCILIATION-001 — Pruebas contables del calculador
 * ============================================================================
 * Fuente única de verdad de Cuentas por Pagar. Cubre los escenarios A–E de la
 * FASE 8 de la misión sobre datos controlados:
 *   A. Pagos (sin/parcial/múltiples/reversión/moneda/corte…)
 *   B. Agrupación por proveedor
 *   C. Filtros personalizados por fechas (fecha de corte)
 *   E. Conciliación matemática en todos los niveles
 * La navegación (D) se cubre en el test de componente de la vista.
 */
import { describe, it, expect } from 'vitest';
import {
  computeAccountsPayable,
  diffDays,
  havanaDate,
  type PayableReceiptRow,
  type PayableServiceRow,
  type PayableCommissionRow,
  type PayableTxnRow,
  type AccountsPayableQuery,
} from '@/lib/accounts-payable/calculator';

const NOW = '2026-11-25'; // corte de referencia (día de negocio Habana)

const baseQuery = (over: Partial<AccountsPayableQuery> = {}): AccountsPayableQuery => ({
  tab: 'all',
  category: 'all',
  now: NOW,
  ...over,
});

const receipt = (over: Partial<PayableReceiptRow> = {}): PayableReceiptRow => ({
  id: 'r-1',
  supplier: 'Proveedor A',
  total_cost: 1000,
  paid_amount: 0,
  payment_status: 'unpaid',
  payment_method: null,
  reference_doc: 'REC-1',
  due_date: '2026-12-10',
  reception_date: '2026-11-20',
  created_at: '2026-11-20T10:00:00Z',
  ...over,
});

const service = (over: Partial<PayableServiceRow> = {}): PayableServiceRow => ({
  id: 's-1',
  supplier: 'Proveedor B',
  total_amount: 500,
  paid_amount: 0,
  payment_status: 'unpaid',
  payment_method: null,
  reference_doc: 'SRV-1',
  due_date: '2026-11-10',
  service_date: '2026-11-05',
  currency: 'CUP',
  exchange_rate: 1,
  created_at: '2026-11-05T10:00:00Z',
  ...over,
});

const commission = (over: Partial<PayableCommissionRow> = {}): PayableCommissionRow => ({
  id: 'c-1',
  final_amount: 300,
  status: 'approved',
  due_date: '2026-11-15',
  paid_at: null,
  payment_method: null,
  period_start: '2026-10-01',
  period_end: '2026-10-31',
  worker_name: 'Dependiente 1',
  created_at: '2026-11-01T10:00:00Z',
  ...over,
});

const txn = (over: Partial<PayableTxnRow> = {}): PayableTxnRow => ({
  ref_type: 'receipt',
  ref_id: 'r-1',
  amount_cup: 400,
  currency: 'CUP',
  payment_method: 'cash',
  direction: 'in',
  payment_date: '2026-11-22T15:00:00Z',
  reference: null,
  ...over,
});

// ─────────────────────────── A. PAGOS ───────────────────────────

describe('A. Pagos', () => {
  it('A1. Documento sin pagos: saldo=total, estado unpaid, sin aging vencido si no ha vencido', () => {
    const r = computeAccountsPayable([receipt()], [], [], [], baseQuery());
    const doc = r.payables[0];
    expect(doc.paid_cup).toBe(0);
    expect(doc.balance_cup).toBe(1000);
    expect(doc.payment_status).toBe('unpaid');
    expect(doc.is_settled).toBe(false);
    expect(doc.aging_bucket).toBe('current'); // vence 2026-12-10 > 7 días
    expect(r.kpis.totalPaid).toBe(0);
    expect(r.kpis.totalPending).toBe(1000);
  });

  it('A2. Pago parcial: saldo reducido, estado partial, aging sobre saldo', () => {
    const r = computeAccountsPayable([receipt()], [], [], [txn({ amount_cup: 400 })], baseQuery());
    const doc = r.payables[0];
    expect(doc.paid_cup).toBe(400);
    expect(doc.balance_cup).toBe(600);
    expect(doc.payment_status).toBe('partial');
    expect(r.kpis.totalPaid).toBe(400); // el KPI Pagado concilia con lo aplicado
    expect(r.kpis.totalPending).toBe(600);
  });

  it('A3. Documento con varios pagos: acumulación correcta', () => {
    const r = computeAccountsPayable(
      [receipt()],
      [],
      [],
      [txn({ amount_cup: 300, payment_date: '2026-11-21T10:00:00Z' }), txn({ amount_cup: 300, payment_date: '2026-11-22T10:00:00Z' })],
      baseQuery(),
    );
    expect(r.payables[0].paid_cup).toBe(600);
    expect(r.payables[0].balance_cup).toBe(400);
  });

  it('A4. Un pago por cada documento de un mismo proveedor (lote): ambos docs reflejan su aplicación', () => {
    const r = computeAccountsPayable(
      [receipt({ id: 'r-1' }), receipt({ id: 'r-2', total_cost: 200, due_date: '2026-11-05', reception_date: '2026-10-30' })],
      [],
      [],
      [txn({ ref_id: 'r-1', amount_cup: 1000 }), txn({ ref_id: 'r-2', amount_cup: 200 })],
      baseQuery(),
    );
    expect(r.payables.find(p => p.ref_id === 'r-1')?.is_settled).toBe(true);
    expect(r.payables.find(p => p.ref_id === 'r-2')?.is_settled).toBe(true);
    expect(r.kpis.totalPaid).toBe(1200);
    expect(r.kpis.totalPending).toBe(0);
  });

  it('A5/A6. Pago con reversión (fila contraria): neteo — la obligación se restablece', () => {
    const r = computeAccountsPayable(
      [receipt()],
      [],
      [],
      [
        txn({ amount_cup: 1000, payment_date: '2026-11-20T10:00:00Z' }),
        txn({ amount_cup: 1000, direction: 'reversal', payment_date: '2026-11-21T10:00:00Z' }),
      ],
      baseQuery(),
    );
    const doc = r.payables[0];
    expect(doc.paid_cup).toBe(0);
    expect(doc.balance_cup).toBe(1000);
    expect(doc.payment_status).toBe('unpaid');
    expect(r.kpis.totalPaid).toBe(0);
  });

  it('A7. Pago posterior a la fecha de corte NO reduce el saldo (reconstrucción histórica)', () => {
    const r = computeAccountsPayable(
      [receipt()],
      [],
      [],
      [txn({ amount_cup: 1000, payment_date: '2026-11-26T09:00:00Z' })], // > corte 25/11
      baseQuery({ date_from: '2026-11-01', date_to: '2026-11-25' }),
    );
    expect(r.payables[0].paid_cup).toBe(0);
    expect(r.payables[0].balance_cup).toBe(1000);
    expect(r.kpis.totalPaid).toBe(0);
  });

  it('A8. Anticipo/pago sobre documento FUERA del período no contamina el cálculo', () => {
    const r = computeAccountsPayable(
      [receipt({ id: 'r-in', reception_date: '2026-11-20' }), receipt({ id: 'r-out', reception_date: '2026-08-01', total_cost: 9999 })],
      [],
      [],
      [txn({ ref_id: 'r-in', amount_cup: 100 }), txn({ ref_id: 'r-out', amount_cup: 9999 })],
      baseQuery({ date_from: '2026-11-01', date_to: '2026-11-25' }),
    );
    expect(r.payables).toHaveLength(1); // solo r-in está en el período
    expect(r.kpis.totalPaid).toBe(100); // el pago del doc excluido no entra
  });

  it('A9. Aplicación duplicada: el calculador refleja el libro (suma ambas) — su detección es forense, no silenciamiento', () => {
    const r = computeAccountsPayable(
      [receipt()],
      [],
      [],
      [txn({ amount_cup: 1000, payment_date: '2026-11-20T10:00:00Z' }), txn({ amount_cup: 1000, payment_date: '2026-11-20T10:00:01Z' })],
      baseQuery(),
    );
    expect(r.payables[0].paid_cup).toBe(2000); // el libro manda; el overpay queda visible
    expect(r.payables[0].balance_cup).toBe(-1000);
  });

  it('A10. Documento totalmente pagado: is_settled, bucket paid, aporta a Pagado y NO a pendiente', () => {
    const r = computeAccountsPayable([receipt()], [], [], [txn({ amount_cup: 1000 })], baseQuery());
    const doc = r.payables[0];
    expect(doc.is_settled).toBe(true);
    expect(doc.aging_bucket).toBe('paid');
    expect(doc.balance_cup).toBe(0);
    expect(r.kpis.totalPaid).toBe(1000);
    expect(r.kpis.totalPending).toBe(0);
    expect(r.totals.total_cup).toBe(1000);
    expect(r.totals.paid_cup).toBe(1000);
    expect(r.totals.balance_cup).toBe(0);
  });

  it('A11. Pago en moneda distinta: el CUP aplicado es amount_cup (tasa del registro)', () => {
    const r = computeAccountsPayable(
      [],
      [service({ currency: 'USD', exchange_rate: 680, total_amount: 100, due_date: '2026-12-20', service_date: '2026-11-20' })],
      [],
      [txn({ ref_type: 'service', ref_id: 's-1', amount_cup: 68000, currency: 'USD', payment_date: '2026-11-22T10:00:00Z' })],
      baseQuery(),
    );
    const doc = r.payables[0];
    expect(doc.total_cup).toBe(68000);
    expect(doc.paid_cup).toBe(68000);
    expect(doc.is_settled).toBe(true);
  });

  it('A12. Comisión pagada por su canal propio (paid_at ≤ corte) cuenta como Pagado', () => {
    const r = computeAccountsPayable(
      [],
      [],
      [commission({ status: 'paid', paid_at: '2026-11-10T12:00:00Z' })],
      [],
      baseQuery(),
    );
    expect(r.kpis.totalPaid).toBe(300);
    expect(r.kpis.totalPending).toBe(0);
  });

  it('A12b. Comisión con paid_at POSTERIOR al corte no cuenta (reconstrucción histórica)', () => {
    const r = computeAccountsPayable(
      [],
      [],
      [commission({ status: 'paid', paid_at: '2026-11-26T12:00:00Z' })],
      [],
      baseQuery({ date_to: '2026-11-25' }),
    );
    expect(r.kpis.totalPaid).toBe(0);
    expect(r.kpis.totalPending).toBe(300);
  });
});

// ─────────────────────────── B. AGRUPACIÓN ───────────────────────────

describe('B. Agrupación por proveedor', () => {
  const docs = () => {
    const receipts = [
      receipt({ id: 'r-1', supplier: 'Juan', total_cost: 100, due_date: '2026-11-20', reception_date: '2026-11-10' }),
      receipt({ id: 'r-2', supplier: 'Juan', total_cost: 200, due_date: '2026-10-01', reception_date: '2026-09-20' }),
      receipt({ id: 'r-3', supplier: 'Pedro', total_cost: 400, due_date: '2026-12-15', reception_date: '2026-11-01' }),
      receipt({ id: 'r-4', supplier: null, total_cost: 75, due_date: '2026-11-24', reception_date: '2026-11-01' }),
      receipt({ id: 'r-5', supplier: 'Tienda Pueblo', total_cost: 10, due_date: '2026-12-01', reception_date: '2026-11-01' }),
      receipt({ id: 'r-6', supplier: 'TiendaPueblo', total_cost: 20, due_date: '2026-12-01', reception_date: '2026-11-01' }),
    ];
    const services = [
      service({ id: 's-1', supplier: 'Juan', total_amount: 50, due_date: '2026-11-28', service_date: '2026-11-20' }),
    ];
    return { receipts, services };
  };

  it('B1. Un proveedor con múltiples documentos: una fila, suma correcta', () => {
    const d = docs();
    const r = computeAccountsPayable(d.receipts, d.services, [], [], baseQuery());
    const juan = r.grouped.find(g => g.supplier === 'Juan');
    expect(juan).toBeDefined();
    expect(juan!.count).toBe(3);
    expect(juan!.total_cup).toBe(350);
  });

  it('B2. Un documento con varios pagos acumula en la fila del proveedor', () => {
    const d = docs();
    const r = computeAccountsPayable(
      d.receipts,
      d.services,
      [],
      [txn({ ref_id: 'r-1', amount_cup: 60 }), txn({ ref_id: 'r-1', amount_cup: 40, payment_date: '2026-11-21T10:00:00Z' })],
      baseQuery(),
    );
    const juan = r.grouped.find(g => g.supplier === 'Juan')!;
    expect(juan.paid_cup).toBe(100);
    expect(juan.balance_cup).toBe(250);
  });

  it('B4. Registros sin proveedor se agrupan como «Sin proveedor» (no se ocultan)', () => {
    const d = docs();
    const r = computeAccountsPayable(d.receipts, d.services, [], [], baseQuery());
    const sp = r.grouped.find(g => g.supplier === 'Sin proveedor');
    expect(sp).toBeDefined();
    expect(sp!.total_cup).toBe(75);
  });

  it('B5. Proveedores con nombres similares NO se fusionan (agrupación por string exacto)', () => {
    const d = docs();
    const r = computeAccountsPayable(d.receipts, d.services, [], [], baseQuery());
    expect(r.grouped.find(g => g.supplier === 'Tienda Pueblo')).toBeDefined();
    expect(r.grouped.find(g => g.supplier === 'TiendaPueblo')).toBeDefined();
  });

  it('B6. Mezcla de recepciones y servicios en la misma agrupación', () => {
    const d = docs();
    const r = computeAccountsPayable(d.receipts, d.services, [], [], baseQuery());
    expect(r.summary.receipts.count).toBe(6);
    expect(r.summary.services.count).toBe(1);
  });
});

// ─────────────────────── C. FILTROS POR FECHAS ───────────────────────

describe('C. Filtro personalizado por fechas (fecha contable del documento)', () => {
  const docs = () => [
    receipt({ id: 'r-oct', reception_date: '2026-10-15', total_cost: 10, due_date: '2026-11-20' }),
    receipt({ id: 'r-nov1', reception_date: '2026-11-01', total_cost: 20, due_date: '2026-11-20' }),
    receipt({ id: 'r-nov25', reception_date: '2026-11-25', total_cost: 40, due_date: '2026-12-20' }),
    receipt({ id: 'r-dic', reception_date: '2026-12-05', total_cost: 80, due_date: '2027-01-05' }),
  ];

  it('C1. Período de un día', () => {
    const r = computeAccountsPayable(docs(), [], [], [], baseQuery({ date_from: '2026-11-25', date_to: '2026-11-25' }));
    expect(r.payables.map(p => p.ref_id)).toEqual(['r-nov25']);
  });

  it('C2/C3. Período de un mes y de varios meses', () => {
    const nov = computeAccountsPayable(docs(), [], [], [], baseQuery({ date_from: '2026-11-01', date_to: '2026-11-30' }));
    expect(nov.payables.map(p => p.ref_id).sort()).toEqual(['r-nov1', 'r-nov25']);
    const octNov = computeAccountsPayable(docs(), [], [], [], baseQuery({ date_from: '2026-10-01', date_to: '2026-11-30' }));
    expect(octNov.payables).toHaveLength(3);
  });

  it('C4. Fecha inicial igual a fecha final (límites inclusivos)', () => {
    const r = computeAccountsPayable(docs(), [], [], [], baseQuery({ date_from: '2026-11-01', date_to: '2026-11-01' }));
    expect(r.payables.map(p => p.ref_id)).toEqual(['r-nov1']);
  });

  it('C5. Documento sin fecha contable queda fuera cuando hay período activo (conservador)', () => {
    const r = computeAccountsPayable(
      [receipt({ id: 'r-nodate', reception_date: null, created_at: null })],
      [],
      [],
      [],
      baseQuery({ date_from: '2026-11-01', date_to: '2026-11-25' }),
    );
    expect(r.payables).toHaveLength(0);
  });

  it('C8. Pago ANTERIOR al período aplicado a un documento incluido SÍ cuenta', () => {
    const r = computeAccountsPayable(
      docs(),
      [],
      [],
      [txn({ ref_id: 'r-nov1', amount_cup: 20, payment_date: '2026-10-20T10:00:00Z' })], // pago de octubre
      baseQuery({ date_from: '2026-11-01', date_to: '2026-11-25' }),
    );
    expect(r.kpis.totalPaid).toBe(20);
    expect(r.kpis.totalPending).toBe(40); // r-nov25 (40) + r-nov1 saldado (0)
    expect(r.payables.find(p => p.ref_id === 'r-nov1')?.is_settled).toBe(true);
  });

  it('C10. Cambio sucesivo de filtros: cada llamada es independiente y predecible', () => {
    const q1 = computeAccountsPayable(docs(), [], [], [], baseQuery({ date_from: '2026-10-01', date_to: '2026-10-31' }));
    const q2 = computeAccountsPayable(docs(), [], [], [], baseQuery({ date_from: '2026-12-01', date_to: '2026-12-31' }));
    const q1b = computeAccountsPayable(docs(), [], [], [], baseQuery({ date_from: '2026-10-01', date_to: '2026-10-31' }));
    expect(q1.payables.map(p => p.ref_id)).toEqual(['r-oct']);
    expect(q2.payables.map(p => p.ref_id)).toEqual(['r-dic']);
    expect(q1b.kpis).toEqual(q1.kpis); // re-evaluación estable
  });

  it('C.boundary. date_to es la fecha de corte: aging y saldos usan esa fecha', () => {
    const r = computeAccountsPayable(
      [receipt({ id: 'r-x', reception_date: '2026-10-15', total_cost: 10, due_date: '2026-11-20' })],
      [],
      [],
      [],
      baseQuery({ date_from: '2026-10-01', date_to: '2026-11-19' }),
    );
    // Al corte 19/11 el doc aún no vencía (vence 20/11) → corriente/próx7
    expect(r.payables[0].is_overdue).toBe(false);
    const r2 = computeAccountsPayable(
      [receipt({ id: 'r-x', reception_date: '2026-10-15', total_cost: 10, due_date: '2026-11-20' })],
      [],
      [],
      [],
      baseQuery({ date_from: '2026-10-01', date_to: '2026-11-20' }),
    );
    // Al corte 20/11 vence HOY → próximos 7 días, NO vencido
    expect(r2.payables[0].is_overdue).toBe(false);
    expect(r2.payables[0].aging_bucket).toBe('upcoming7');
  });
});

// ─────────────────────── E. CONCILIACIÓN MATEMÁTICA ───────────────────────

describe('E. Conciliación matemática (misión §10.E)', () => {
  const docs = () => {
    const receipts = [
      receipt({ id: 'r-1', supplier: 'Alpha', total_cost: 1000, due_date: '2026-12-10', reception_date: '2026-11-20' }),
      receipt({ id: 'r-2', supplier: 'Alpha', total_cost: 500, due_date: '2026-11-01', reception_date: '2026-10-20' }),
      receipt({ id: 'r-3', supplier: 'Beta', total_cost: 300, due_date: '2026-09-01', reception_date: '2026-08-15' }),
    ];
    const services = [
      service({ id: 's-1', supplier: 'Beta', total_amount: 200, due_date: '2026-11-24', service_date: '2026-11-10' }),
      service({ id: 's-2', supplier: 'Gamma', total_amount: 800, due_date: '2026-11-05', service_date: '2026-10-30' }),
      service({ id: 's-3', supplier: 'Gamma', total_amount: 120, due_date: '2026-12-01', service_date: '2026-11-15' }),
    ];
    return { receipts, services };
  };
  const txns = () => [
    txn({ ref_id: 'r-1', amount_cup: 400 }),
    txn({ ref_id: 'r-2', amount_cup: 500, payment_date: '2026-11-05T10:00:00Z' }), // saldado
    txn({ ref_type: 'service', ref_id: 's-2', amount_cup: 300, payment_date: '2026-11-10T10:00:00Z' }),
    txn({ ref_type: 'service', ref_id: 's-2', amount_cup: 500, direction: 'reversal', payment_date: '2026-11-12T10:00:00Z' }),
  ];

  it('E1. Por documento: Total − Pagado = Saldo', () => {
    const d = docs();
    const r = computeAccountsPayable(d.receipts, d.services, [], txns(), baseQuery());
    for (const p of r.payables) {
      expect(p.total_cup - p.paid_cup).toBeCloseTo(p.balance_cup, 6);
    }
  });

  it('E2. Σ saldos por documentos = Σ saldos por proveedores = Total pendiente', () => {
    const d = docs();
    const r = computeAccountsPayable(d.receipts, d.services, [], txns(), baseQuery());
    const sumDocs = r.payables.reduce((s, p) => s + p.balance_cup, 0);
    const sumGroups = r.grouped.reduce((s, g) => s + g.balance_cup, 0);
    expect(sumDocs).toBeCloseTo(sumGroups, 6);
    expect(sumGroups).toBeCloseTo(r.kpis.totalPending, 6);
  });

  it('E3. Σ intervalos de aging = Total pendiente (partición exacta, sin solapes)', () => {
    const d = docs();
    const r = computeAccountsPayable(d.receipts, d.services, [], txns(), baseQuery());
    const a = r.totals.aging;
    const intervals = a.current + a.upcoming7 + a['30'] + a['60'] + a['90'] + a['120'] + a['120+'];
    expect(intervals).toBeCloseTo(r.kpis.totalPending, 6);
    // El bloque «Vencido» = suma de los 5 intervalos vencidos
    expect(a['30'] + a['60'] + a['90'] + a['120'] + a['120+']).toBeCloseTo(a.overdue, 6);
  });

  it('E4. Pagado del resumen = Σ pagos aplicados a los documentos incluidos', () => {
    const d = docs();
    const r = computeAccountsPayable(d.receipts, d.services, [], txns(), baseQuery());
    const sumPaid = r.payables.reduce((s, p) => s + p.paid_cup, 0);
    expect(r.kpis.totalPaid).toBeCloseTo(sumPaid, 6);
    // 400 (r-1 parcial) + 500 (r-2 total) + 300 − 500 (s-2 neto) = 700
    expect(r.kpis.totalPaid).toBe(700);
    // Total global − Pagado = Saldo global
    expect(r.totals.total_cup - r.totals.paid_cup).toBeCloseTo(r.totals.balance_cup, 6);
  });

  it('E5. Vencido del resumen = Σ saldos vencidos (misma base)', () => {
    const d = docs();
    const r = computeAccountsPayable(d.receipts, d.services, [], txns(), baseQuery());
    const overdueDocs = r.payables.filter(p => p.is_overdue).reduce((s, p) => s + p.balance_cup, 0);
    expect(r.kpis.totalOverdue).toBeCloseTo(overdueDocs, 6);
  });

  it('E.boundary. Fronteras de antigüedad: 0, 7, 30, 31, 60, 90, 120, 121 días', () => {
    const mk = (due: string) => [receipt({ id: 'r-b', due_date: due, reception_date: '2026-01-01', total_cost: 100 })];
    const bucket = (due: string) => computeAccountsPayable(mk(due), [], [], [], baseQuery()).payables[0].aging_bucket;
    expect(bucket(NOW)).toBe('upcoming7');            // vence HOY → próximos 7d, no vencido
    expect(bucket('2026-12-02')).toBe('upcoming7');   // exactamente 7 días
    expect(bucket('2026-12-03')).toBe('current');     // 8 días → corriente
    expect(bucket('2026-11-24')).toBe('30');          // vencido 1 día → 0-30
    expect(bucket('2026-10-26')).toBe('30');          // vencido 30 días exactos
    expect(bucket('2026-10-25')).toBe('60');          // vencido 31 días
    expect(bucket('2026-09-26')).toBe('60');          // 60 exactos
    expect(bucket('2026-09-25')).toBe('90');          // 61
    expect(bucket('2026-08-27')).toBe('90');          // 90 exactos
    expect(bucket('2026-08-26')).toBe('120');         // 91
    expect(bucket('2026-07-28')).toBe('120');         // 120 exactos
    expect(bucket('2026-07-27')).toBe('120+');        // 121
    expect(bucket('2026-07-26')).toBe('120+');        // 122
  });

  it('E.docs-pagados. La tabla incluye docs totalmente pagados: fila y totales concilian', () => {
    const d = docs();
    const r = computeAccountsPayable(d.receipts, d.services, [], txns(), baseQuery());
    const alpha = r.grouped.find(g => g.supplier === 'Alpha')!;
    // Alpha: r-1 (1000, pagado 400) + r-2 (500, pagado 500) → Total 1500, Pagado 900, Saldo 600
    expect(alpha.total_cup).toBe(1500);
    expect(alpha.paid_cup).toBe(900);
    expect(alpha.balance_cup).toBe(600);
  });
});

// ─────────────────────── Utilidades de fecha ───────────────────────

describe('Utilidades de fecha', () => {
  it('diffDays: diferencias exactas sin aritmética UTC', () => {
    expect(diffDays('2026-11-25', '2026-11-25')).toBe(0);
    expect(diffDays('2026-11-25', '2026-12-02')).toBe(7);
    expect(diffDays('2026-11-25', '2026-11-24')).toBe(-1);
    // Atraviesa un cambio de mes y un cambio de año
    expect(diffDays('2026-11-30', '2026-12-01')).toBe(1);
    expect(diffDays('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('havanaDate: formato ISO corto y día correcto en el huso de negocio', () => {
    const d = havanaDate('2026-11-25T04:30:00Z'); // 23:30 del 24/11 en Habana (UTC-5)
    expect(d).toBe('2026-11-24');
    const d2 = havanaDate('2026-11-25T05:30:00Z'); // 00:30 del 25/11 en Habana
    expect(d2).toBe('2026-11-25');
  });
});

// ─────────────────────── Reproducción ENERVIDA (regresión dorada) ───────────────────────

describe('Regresión dorada — forma ENERVIDA (cifras del diagnóstico forense)', () => {
  it('KPI «Pagado» concilia con la columna Pagado de la tabla (defecto D1/D2 erradicado)', () => {
    // 27 servicios pagados al contado + 1 comisión pagada + 1 recepción de $1
    const servicesPaid: PayableServiceRow[] = Array.from({ length: 26 }, (_, i) =>
      service({ id: `sp-${i}`, supplier: 'Tienda Pueblo', total_amount: 100, service_date: '2026-11-10', due_date: '2026-12-10', paid_amount: 100, payment_status: 'paid' }),
    );
    const txnsPaid: PayableTxnRow[] = servicesPaid.map(s =>
      txn({ ref_type: 'service', ref_id: s.id, amount_cup: 100, payment_date: '2026-11-10T15:00:00Z' }),
    );
    const r = computeAccountsPayable(
      [receipt({ id: 'r-jc', supplier: 'Juan Carlos', total_cost: 1, due_date: '2026-12-23', reception_date: '2026-11-23', paid_amount: 1, payment_status: 'paid' })],
      servicesPaid,
      [commission({ status: 'paid', paid_at: '2026-10-15T12:00:00Z', final_amount: 300 })],
      [...txnsPaid, txn({ ref_id: 'r-jc', amount_cup: 1, payment_date: '2026-11-23T15:00:00Z' })],
      baseQuery(),
    );
    // El indicador y la tabla usan LA MISMA definición → idénticos por construcción
    expect(r.kpis.totalPaid).toBeCloseTo(r.totals.paid_cup, 6);
    expect(r.kpis.totalPaid).toBe(26 * 100 + 1 + 300);
    expect(r.kpis.totalPending).toBe(0);
    expect(r.totals.total_cup - r.totals.paid_cup).toBeCloseTo(r.totals.balance_cup, 6);
  });
});
