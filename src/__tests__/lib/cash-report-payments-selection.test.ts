/**
 * cash-report-payments-selection.test.ts — MISIÓN
 * COSTPRO-SRV-PAYMENT-DATE-AND-DELIVERY-REPORT-FILTERS-001 (FASE 2).
 *
 * Núcleo puro de la SELECCIÓN DE PAGOS del Reporte Entrega — espejo exacto de
 * la selección de ventas (cash-report-selection.test.ts). Cubre el contrato:
 *
 *   · Un pago DESMARCADO permanece visible pero NO computa en el cuadre:
 *     recibosProveedoresCash / serviciosRecibidosCash / efectivoEsperado
 *     recalculados EXACTAMENTE por el importe excluido (fórmula única
 *     computeDailySummary — sin algoritmo paralelo).
 *   · El DELTA es exacto por grupo (method × currency × ref_type) aunque la
 *     vista solo conozca las filas de los acordeones expandidos: restar una
 *     fila nunca depende de filas no cargadas.
 *   · Reversiones (direction='reversal') NUNCA son seleccionables: el grupo
 *     del RPC no las incluye y el delta sería contablemente falso.
 *   · Hoja por moneda: excluir un pago USD no mueve la hoja CUP.
 *   · Grupo completamente desmarcado → se OMITE (sin fila huérfana).
 *   · Campos ajenos (sales, commissions, cash_flows, payment_reversals,
 *     opening_balance) quedan INTACTOS en el reporte ajustado.
 *   · Idempotencia: el mismo conjunto excluido produce el mismo ajuste.
 */
import { describe, it, expect } from 'vitest';
import {
  buildPaymentsAdjustedReport,
  buildPaymentsAdjustedGroups,
  isSelectablePaymentRow,
  filterEligiblePaymentDetailRows,
  paymentGroupKey,
  type PaymentSelectionRow,
  type PaymentsGroup,
} from '@/lib/cash-report/payments-selection';
import { computeDailySummary } from '@/lib/cash-report/summary';

// ── Fixtures: universo del RPC get_cash_report (20261124120200) ──
// Grupo receipt CUP efectivo: 2 pagos (5 000 + 10 000 = 15 000).
// Grupo service CUP efectivo: 1 pago (10 200 — caso real SRV-20261126-00152).
// Grupo receipt USD efectivo: 1 pago (50 USD → canónico 40 000 CUP).
const BASE_GROUPS: PaymentsGroup[] = [
  { payment_method: 'cash', currency: 'CUP', ref_type: 'receipt', payment_count: 2, total: 15000, total_cup: 15000 },
  { payment_method: 'cash', currency: 'CUP', ref_type: 'service', payment_count: 1, total: 10200, total_cup: 10200 },
  { payment_method: 'cash', currency: 'USD', ref_type: 'receipt', payment_count: 1, total: 50, total_cup: 40000 },
];

const R1: PaymentSelectionRow = { id: 'r1', ref_type: 'receipt', payment_method: 'cash', currency: 'CUP', amount: 5000, amount_cup: 5000, direction: 'in' };
const R2: PaymentSelectionRow = { id: 'r2', ref_type: 'receipt', payment_method: 'cash', currency: 'CUP', amount: 10000, amount_cup: 10000, direction: 'in' };
const S1: PaymentSelectionRow = { id: 's1', ref_type: 'service', payment_method: 'cash', currency: 'CUP', amount: 10200, amount_cup: 10200, direction: 'in' };
const U1: PaymentSelectionRow = { id: 'u1', ref_type: 'receipt', payment_method: 'cash', currency: 'USD', amount: 50, amount_cup: 40000, direction: 'in' };
const REV: PaymentSelectionRow = { id: 'rev', ref_type: 'receipt', payment_method: 'cash', currency: 'CUP', amount: 3000, amount_cup: 3000, direction: 'reversal' };

const ROWS = [R1, R2, S1, U1, REV];

const mkReport = () => ({
  payments: BASE_GROUPS.map(g => ({ ...g })),
  payment_reversals: [{ payment_method: 'cash', currency: 'CUP', ref_type: 'receipt', reversal_count: 1, total: 3000, total_cup: 3000 }],
  sales: [{ payment_method: 'cash', currency: 'CUP', transaction_count: 1, total: 20000, total_cup: 20000 }],
  commissions: [{ payment_method: 'cash', currency: 'CUP', commission_count: 1, total: 500, total_cup: 500 }],
  cash_flows: [{ currency: 'CUP', direction: 'in', amount: 1000, amount_cup: 1000 }],
  opening_balance: { CUP: 1000, USD: 0 },
});

describe('payments-selection · elegibilidad de filas', () => {
  it('acepta pagos direction=in (o ausente — legacy) de receipt/service', () => {
    expect(isSelectablePaymentRow(R1)).toBe(true);
    expect(isSelectablePaymentRow({ ...S1, direction: null })).toBe(true);
    expect(isSelectablePaymentRow({ ...S1, direction: undefined })).toBe(true);
  });

  it('rechaza reversiones, otros ref_types y filas sin id', () => {
    expect(isSelectablePaymentRow(REV)).toBe(false);
    expect(isSelectablePaymentRow({ ...S1, ref_type: 'production_order' })).toBe(false);
    expect(isSelectablePaymentRow({ ...S1, id: '' })).toBe(false);
    expect(isSelectablePaymentRow(null)).toBe(false);
    expect(isSelectablePaymentRow(undefined)).toBe(false);
  });

  it('la clave de grupo es method|currency|ref_type estable (moneda normalizada)', () => {
    expect(paymentGroupKey('cash', 'cup', 'receipt')).toBe(paymentGroupKey('cash', 'CUP', 'receipt'));
    expect(paymentGroupKey('cash', 'CUP', 'receipt')).toBe('cash|CUP|receipt');
  });
});

describe('payments-selection · delta exacto por grupo', () => {
  it('sin exclusiones: reporte ORIGINAL por referencia y grupos intactos', () => {
    const base = mkReport();
    const adj = buildPaymentsAdjustedReport(base, ROWS, new Set<string>());
    expect(adj.selectionActive).toBe(false);
    expect(adj.report).toBe(base); // misma referencia — cero riesgo de desviación
    expect(adj.totals.groups).toEqual(BASE_GROUPS);
    expect(adj.totals.paymentCountIncluded).toBe(4);
    expect(adj.totals.paymentCountTotal).toBe(4);
  });

  it('excluir 1 de 2 pagos: grupo exacto, los demás grupos INTACTOS (misma referencia)', () => {
    const base = mkReport();
    const adj = buildPaymentsAdjustedReport(base, ROWS, new Set(['r1']));
    expect(adj.selectionActive).toBe(true);
    const gReceipt = adj.report.payments!.find(g => g.ref_type === 'receipt' && g.currency === 'CUP')!;
    expect(gReceipt.payment_count).toBe(1);
    expect(gReceipt.total).toBe(10000);
    expect(gReceipt.total_cup).toBe(10000);
    // Los grupos sin exclusiones conservan el MISMO objeto (sin redondeo).
    const gService = adj.report.payments!.find(g => g.ref_type === 'service')!;
    expect(gService).toBe(base.payments[1]);
    const gUsd = adj.report.payments!.find(g => g.currency === 'USD')!;
    expect(gUsd).toBe(base.payments[2]);
    // Campos ajenos intactos.
    expect(adj.report.sales).toEqual(base.sales);
    expect(adj.report.commissions).toEqual(base.commissions);
    expect(adj.report.cash_flows).toEqual(base.cash_flows);
    expect(adj.report.payment_reversals).toEqual(base.payment_reversals);
    expect(adj.report.opening_balance).toEqual(base.opening_balance);
    expect(adj.totals.paymentCountIncluded).toBe(3);
    expect(adj.totals.paymentCountTotal).toBe(4);
    expect(adj.totals.includedRows).toBe(3); // conocidas 4 (rev no es seleccionable) − excluidas 1
    expect(adj.totals.knownRows).toBe(4);
  });

  it('excluir TODOS los pagos de un grupo: el grupo se OMITE (sin fila huérfana)', () => {
    const adj = buildPaymentsAdjustedReport(mkReport(), ROWS, new Set(['r1', 'r2']));
    expect(adj.report.payments!.find(g => g.ref_type === 'receipt' && g.currency === 'CUP')).toBeUndefined();
    expect(adj.report.payments!.find(g => g.ref_type === 'service')).toEqual(BASE_GROUPS[1]);
    expect(adj.totals.paymentCountIncluded).toBe(2);
  });

  it('excluir un pago cuyo grupo NO está en el reporte es un NO-OP seguro', () => {
    const adj = buildPaymentsAdjustedReport(mkReport(), ROWS, new Set('zz' as unknown as string));
    // id inexistente → sin deltas → grupos intactos
    expect(adj.totals.groups).toEqual(BASE_GROUPS);
  });

  it('una reversión en el conjunto excluido NO altera ningún grupo (no es seleccionable)', () => {
    const adj = buildPaymentsAdjustedReport(mkReport(), ROWS, new Set(['rev']));
    expect(adj.totals.groups).toEqual(BASE_GROUPS);
    expect(adj.totals.knownRows).toBe(4);
  });

  it('es idempotente: el mismo conjunto excluido produce el mismo ajuste', () => {
    const excl = new Set(['r1', 's1']);
    const a = buildPaymentsAdjustedReport(mkReport(), ROWS, excl);
    const b = buildPaymentsAdjustedReport(mkReport(), ROWS, excl);
    expect(b.report.payments).toEqual(a.report.payments);
    expect(b.totals.paymentCountIncluded).toBe(a.totals.paymentCountIncluded);
  });

  it('funciona sin filas conocidas (acordeones sin expandir): grupos intactos', () => {
    const adj = buildPaymentsAdjustedReport(mkReport(), [], new Set<string>());
    expect(adj.selectionActive).toBe(false);
    expect(adj.totals.groups).toEqual(BASE_GROUPS);
  });

  it('tolera grupos sin total_cup (fuente legacy) y filas con importes string', () => {
    const legacy: PaymentsGroup[] = [{ payment_method: 'cash', currency: 'CUP', ref_type: 'receipt', payment_count: 1, total: 5000 }];
    const rows = [{ id: 'x', ref_type: 'receipt', payment_method: 'cash', currency: 'CUP', amount: '5000', amount_cup: '5000', direction: 'in' } as unknown as PaymentSelectionRow];
    const adj = buildPaymentsAdjustedReport({ payments: legacy }, rows, new Set(['x']));
    expect(adj.report.payments!.length).toBe(0); // grupo sin filas incluidas → omitido
  });
});

describe('payments-selection · cuadre (fórmula única computeDailySummary)', () => {
  const base = mkReport();
  const baseCup = computeDailySummary(base as never, 'CUP');
  const baseUsd = computeDailySummary(base as never, 'USD');

  it('hoja CUP base: recibos 15 000 + servicios 10 200 afectan el esperado', () => {
    expect(baseCup.recibosProveedoresCash).toBe(15000);
    expect(baseCup.serviciosRecibidosCash).toBe(10200);
    // esperado = saldo(1000) + ventas billetes(20000) + ingresosCaja(1000)
    //            − comisiones(500) − servicios(10200) − recibos(15000) + reversiones(3000)
    expect(baseCup.efectivoEsperado).toBe(1000 + 20000 + 1000 - 500 - 10200 - 15000 + 3000);
  });

  it('excluir un pago de RECEPCIÓN: recibos y esperado recalculados EXACTAMENTE (+5 000)', () => {
    const adj = buildPaymentsAdjustedReport(base, ROWS, new Set(['r1']));
    const cup = computeDailySummary(adj.report as never, 'CUP');
    expect(cup.recibosProveedoresCash).toBe(10000);
    expect(cup.serviciosRecibidosCash).toBe(10200); // intacto
    expect(cup.efectivoEsperado).toBe(baseCup.efectivoEsperado + 5000);
  });

  it('excluir un pago de SERVICIO: servicios y esperado recalculados EXACTAMENTE (+10 200)', () => {
    const adj = buildPaymentsAdjustedReport(base, ROWS, new Set(['s1']));
    const cup = computeDailySummary(adj.report as never, 'CUP');
    expect(cup.serviciosRecibidosCash).toBe(0);
    expect(cup.recibosProveedoresCash).toBe(15000); // intacto
    expect(cup.efectivoEsperado).toBe(baseCup.efectivoEsperado + 10200);
  });

  it('excluir el pago USD NO mueve la hoja CUP; la hoja USD refleja el valor físico', () => {
    const adj = buildPaymentsAdjustedReport(base, ROWS, new Set(['u1']));
    const cup = computeDailySummary(adj.report as never, 'CUP');
    expect(cup.efectivoEsperado).toBe(baseCup.efectivoEsperado);
    // flujosOtraMonedaValorCup (hoja CUP): el pago USD dejaba de ser salida física.
    const baseCupFlows = baseCup.flujosOtraMonedaValorCup;
    expect(cup.flujosOtraMonedaValorCup).toBe(baseCupFlows + 40000);
    // La hoja USD no consolida equivalencias (regla 2) y el pago USD es
    // salida de SU hoja — su esperado baja con el pago incluido y sube al excluirlo.
    const usd = computeDailySummary(adj.report as never, 'USD');
    const baseUsdFlows = computeDailySummary(base as never, 'USD').flujosOtraMonedaValorCup;
    expect(usd.flujosOtraMonedaValorCup).toBe(baseUsdFlows); // reversión del -= del pago
  });

  it('las REVERSIONES siguen computando igual (fuera de la selección de pagos)', () => {
    const adj = buildPaymentsAdjustedReport(base, ROWS, new Set(['r1', 's1']));
    const cup = computeDailySummary(adj.report as never, 'CUP');
    expect(cup.reversionesPagosCash).toBe(baseCup.reversionesPagosCash);
  });
});

describe('payments-selection · elegibilidad del DETALLE (endpoint /api/cash-report/details)', () => {
  // Contrato: el detalle del acordeón == universo del grupo del RPC
  // (direction='in' + documento fuente válido). El DELTA de la selección
  // depende de que NINGUNA fila de más entre al acordeón.
  const svcStatuses = new Map<string, string>([['s-ok', 'active'], ['s-void', 'voided']]);
  const rcptStatuses = new Map<string, string>([['r-ok', 'completed'], ['r-rev', 'reversed']]);
  const docs = { serviceStatusById: svcStatuses, receiptStatusById: rcptStatuses };
  const mkRow = (o: Record<string, unknown>) => o;

  it('descarta reversiones (direction=reversal) aunque el documento sea válido', () => {
    const out = filterEligiblePaymentDetailRows([
      mkRow({ id: 'p1', ref_type: 'receipt', ref_id: 'r-ok', direction: 'in' }),
      mkRow({ id: 'p2', ref_type: 'receipt', ref_id: 'r-rev', direction: 'reversal' }),
    ], docs);
    expect(out.map(r => r.id)).toEqual(['p1']);
  });

  it('descarta pagos de documentos anulados (service voided/cancelled, receipt voided/reversed)', () => {
    const out = filterEligiblePaymentDetailRows([
      mkRow({ id: 'p1', ref_type: 'service', ref_id: 's-ok', direction: 'in' }),
      mkRow({ id: 'p2', ref_type: 'service', ref_id: 's-void', direction: 'in' }),
      mkRow({ id: 'p3', ref_type: 'service', ref_id: 's-desconocido', direction: 'in' }), // sin estado → fuera (fail-closed)
      mkRow({ id: 'p4', ref_type: 'receipt', ref_id: 'r-rev', direction: 'in' }),
      mkRow({ id: 'p5', ref_type: 'receipt', ref_id: 'r-ok', direction: 'in' }),
    ], docs);
    expect(out.map(r => r.id)).toEqual(['p1', 'p5']);
  });

  it('trata direction ausente como in (legacy) y deja pasar ref_types ajenos sin filtrado', () => {
    const out = filterEligiblePaymentDetailRows([
      mkRow({ id: 'p1', ref_type: 'receipt', ref_id: 'r-ok' }),
      mkRow({ id: 'p2', ref_type: 'production_order', ref_id: 'po-1' }),
    ], docs);
    expect(out.map(r => r.id)).toEqual(['p1', 'p2']);
  });

  it('tolera null/undefined y filas sin ref_id (fail-closed para ref_type conocido)', () => {
    const out = filterEligiblePaymentDetailRows(null, docs);
    expect(out).toEqual([]);
    const out2 = filterEligiblePaymentDetailRows([
      mkRow({ id: 'p1', ref_type: 'service' }), // sin ref_id → sin estado → fuera
    ], docs);
    expect(out2).toEqual([]);
  });
});

describe('payments-selection · buildPaymentsAdjustedGroups (forma bruta)', () => {
  it('devuelve knownRows/includedRows consistentes con la elegibilidad', () => {
    const r = buildPaymentsAdjustedGroups(BASE_GROUPS, ROWS, new Set(['r1', 'rev']));
    expect(r.knownRows).toBe(4);
    expect(r.includedRows).toBe(3);
  });

  it('sin exclusiones devuelve copia de los grupos de entrada', () => {
    const r = buildPaymentsAdjustedGroups(BASE_GROUPS, ROWS, new Set<string>());
    expect(r.groups).toEqual(BASE_GROUPS);
    expect(r.groups).not.toBe(BASE_GROUPS);
  });
});
