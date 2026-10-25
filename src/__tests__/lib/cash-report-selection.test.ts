/**
 * cash-report-selection.test.ts — MISIÓN PERSONALIZACIÓN DEL REPORTE ENTREGA
 * (2026-10-25). Núcleo puro de la selección de conceptos y de ventas.
 *
 * Cubre el contrato contable de la misión §4:
 *   · Clasificación CUP/USD/Mixta por la composición REAL de los pagos
 *     (jamás la equivalencia contable — caso exacto del incidente #1479:
 *     7 USD × 800 = 5 600 canónico NO convierte la venta en CUP ni en mixta).
 *   · Una venta excluida no contribuye a totales ni desgloses; una incluida
 *     se computa UNA sola vez; importes separados por moneda (nunca CUP+USD).
 *   · La equivalencia canónica NUNCA duplica una venta (línea propia, fuera
 *     de ventasTotales) y se recalcula con el conjunto seleccionado.
 *   · Egresos de caja INDEPENDIENTES de la selección de ventas.
 *   · buildSelectionAdjustedReport: el reporte ajustado conserva intactos los
 *     campos ajenos a las ventas (cash_flows, commissions, refund_rows…).
 *   · Persistencia de conceptos AISLADA POR TIENDA.
 *   · Recómputo de la tabla por producto con la MISMA función del servidor.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  classifySaleByPayments,
  computeSelectedSalesTotals,
  buildSelectionAdjustedReport,
  buildItemsSummaryForSales,
  buildSalesMethodGroups,
  SUMMARY_CONCEPTS,
  SUMMARY_CONCEPT_KEYS,
  DEFAULT_SUMMARY_CONCEPTS,
  selectAllSummaryConcepts,
  deselectAllSummaryConcepts,
  hasAnySummaryConcept,
  isDefaultSummaryConcepts,
  loadSummaryConcepts,
  saveSummaryConcepts,
  summaryConceptsLsKey,
  type SaleRow,
} from '@/lib/cash-report/report-selection';
import { computeDailySummary } from '@/lib/cash-report/summary';
import { buildItemsSummary } from '@/lib/cash-report/collection-currency';

// ── Fixtures: universo realista del período (misma semántica que la API) ──
// V1: venta CUP pura en efectivo (10 000).
// V2: venta USD pura en efectivo (7 USD @ 800 → canónico 5 600 — caso #1479).
// V3: venta MIXTA (2 000 CUP efectivo + 5 USD efectivo @ 800 = 4 000 canónico).
// V4: venta CUP por transferencia (3 000).
// V5: venta USD por Zelle (10 USD @ 400 → 4 000 canónico).
const mkRow = (over: Partial<SaleRow> & Pick<SaleRow, 'id' | 'buckets'>): SaleRow => ({
  created_at: '2026-10-24T15:00:00Z',
  customer_name: null,
  reference: null,
  status: 'completed',
  source: 'ledger',
  ...over,
});

const V1 = mkRow({
  id: 'v-1',
  buckets: [{ method: 'cash', currency: 'CUP', amount: 10000, amount_cup: 10000 }],
});
const V2 = mkRow({
  id: 'v-2',
  customer_name: 'Cliente USD',
  buckets: [{ method: 'cash', currency: 'USD', amount: 7, amount_cup: 5600 }],
});
const V3 = mkRow({
  id: 'v-3',
  buckets: [
    { method: 'cash', currency: 'CUP', amount: 2000, amount_cup: 2000 },
    { method: 'cash', currency: 'USD', amount: 5, amount_cup: 4000 },
  ],
});
const V4 = mkRow({
  id: 'v-4',
  buckets: [{ method: 'transfer', currency: 'CUP', amount: 3000, amount_cup: 3000 }],
});
const V5 = mkRow({
  id: 'v-5',
  buckets: [{ method: 'zelle', currency: 'USD', amount: 10, amount_cup: 4000 }],
});
const ALL_ROWS = [V1, V2, V3, V4, V5];

// Reporte base (forma que devuelve /api/cash-report con reconstrucción).
const BASE_REPORT = {
  sales: [
    { payment_method: 'cash', currency: 'CUP', transaction_count: 2, total: 12000, total_cup: 12000 },
    { payment_method: 'cash', currency: 'USD', transaction_count: 2, total: 12, total_cup: 9600 },
    { payment_method: 'transfer', currency: 'CUP', transaction_count: 1, total: 3000, total_cup: 3000 },
    { payment_method: 'zelle', currency: 'USD', transaction_count: 1, total: 10, total_cup: 4000 },
  ],
  sales_split: {
    CUP: { cash: 12000, transfer: 3000, zelle: 0, mixedUnsplit: 0, total: 15000 },
    USD: { cash: 12, transfer: 0, zelle: 10, mixedUnsplit: 0, total: 22 },
  },
  sales_equiv_cash_other_cup: 9600,
  sales_equiv_voucher_other_cup: 4000,
  payments: [],
  commissions: [],
  adjustments: [],
  cash_flows: [
    { id: 'cf-1', direction: 'out' as const, amount: 500, currency: 'CUP', amount_cup: 500, note: 'IE-000003', document_number: 'IE-000003', created_by: null, created_at: '2026-10-24T18:00:00Z' },
  ],
  refund_rows: [],
};

// ═══════════════════════════════════════════════════════════════════════════
describe('FUNCIÓN B · clasificación por composición REAL de los pagos (misión §3.1)', () => {
  it('venta CUP íntegra → CUP · venta USD íntegra → USD · componentes en ambas → MIXTA', () => {
    expect(classifySaleByPayments(V1)).toBe('CUP');
    expect(classifySaleByPayments(V2)).toBe('USD');
    expect(classifySaleByPayments(V3)).toBe('MIXTA');
    expect(classifySaleByPayments(V4)).toBe('CUP');
    expect(classifySaleByPayments(V5)).toBe('USD');
  });

  it('la EQUIVALENCIA CONTABLE no clasifica: 7 USD con canónico 5 600 CUP sigue siendo USD (no CUP, no mixta)', () => {
    // El bucket USD lleva amount_cup=5600 (equivalente canónico); la venta NO
    // tiene componente CUP → USD. La equivalencia nunca crea una segunda venta.
    expect(classifySaleByPayments(V2)).not.toBe('CUP');
    expect(classifySaleByPayments(V2)).not.toBe('MIXTA');
  });

  it('moneda distinta de CUP/USD (p. ej. MLC) → OTRA: no se excluye silenciosamente ni se clasifica mal', () => {
    const mlc = mkRow({ id: 'v-mlc', buckets: [{ method: 'cash', currency: 'MLC', amount: 40, amount_cup: 40 }] });
    expect(classifySaleByPayments(mlc)).toBe('OTRA');
  });

  it('venta sin buckets identificables → CUP (no rompe el filtro)', () => {
    expect(classifySaleByPayments({ buckets: [] })).toBe('CUP');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('FUNCIÓN B · recomputación del split con el conjunto seleccionado (misión §4)', () => {
  it('con TODO seleccionado reproduce EXACTAMENTE el split y las equivalencias de la API (una sola fuente)', () => {
    const t = computeSelectedSalesTotals(ALL_ROWS, new Set());
    expect(t.split.CUP).toEqual({ cash: 12000, transfer: 3000, zelle: 0, mixedUnsplit: 0, total: 15000 });
    expect(t.split.USD).toEqual({ cash: 12, transfer: 0, zelle: 10, mixedUnsplit: 0, total: 22 });
    expect(t.equivCashOtherCup).toBe(9600);
    expect(t.equivVoucherOtherCup).toBe(4000);
    expect(t.includedCount).toBe(5);
  });

  it('excluir V3 (mixta) la quita de AMBAS hojas (CUP −2 000 y USD −5) — cada componente una sola vez', () => {
    const t = computeSelectedSalesTotals(ALL_ROWS, new Set(['v-3']));
    expect(t.split.CUP?.cash).toBe(10000);          // V1 10 000 (V3 excluida)
    expect(t.split.USD?.cash).toBe(7);               // V2 7 USD (V3 excluida)
    expect(t.equivCashOtherCup).toBe(5600);          // solo V2 (5 600); V3 fuera
    expect(t.includedCount).toBe(4);
  });

  it('excluir V2 (USD pura) recalcula la equivalencia a 4 000 (V3) y la hoja USD queda cash=5, zelle=10', () => {
    const t = computeSelectedSalesTotals(ALL_ROWS, new Set(['v-2']));
    expect(t.split.USD?.cash).toBe(5);
    expect(t.split.USD?.zelle).toBe(10);
    expect(t.equivCashOtherCup).toBe(4000); // 5 USD de V3 @ 800
    expect(t.equivVoucherOtherCup).toBe(4000); // zelle de V5 intacto
  });

  it('excluir TODAS las ventas USD deja la hoja USD a CERO y la equivalencia a 0 (moneda vacía, sin caer a vías no ajustadas)', () => {
    const t = computeSelectedSalesTotals(ALL_ROWS, new Set(['v-2', 'v-3', 'v-5']));
    expect(t.split.USD).toEqual({ cash: 0, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 0 });
    expect(t.split.USD).toBeDefined(); // clave presente: computeDailySummary usa la vía split
    expect(t.equivCashOtherCup).toBe(0);
    expect(t.equivVoucherOtherCup).toBe(0);
  });

  it('los GRUPOS por método × moneda solo cuentan ventas seleccionadas (transaction_count incluido)', () => {
    const t = computeSelectedSalesTotals(ALL_ROWS, new Set(['v-1']));
    const cashCup = t.groups.find(g => g.payment_method === 'cash' && g.currency === 'CUP')!;
    expect(cashCup).toMatchObject({ transaction_count: 1, total: 2000, total_cup: 2000 }); // solo V3
    const cashUsd = t.groups.find(g => g.payment_method === 'cash' && g.currency === 'USD')!;
    expect(cashUsd).toMatchObject({ transaction_count: 2, total: 12, total_cup: 9600 }); // V2 + V3
  });

  it('venta mixta: NUNCA el importe completo en ambas hojas — componentes separados por moneda', () => {
    const t = computeSelectedSalesTotals([V3], new Set());
    expect(t.split.CUP?.cash).toBe(2000);   // componente CUP, no 6 000
    expect(t.split.USD?.cash).toBe(5);      // componente USD, no 6 000
    expect((t.split.CUP?.cash ?? 0) + (t.split.USD?.cash ?? 0)).not.toBe(12000); // sin dobles conteos
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('FUNCIÓN B · reporte AJUSTADO (misión §4: una sola fuente para pantalla/PDF/Excel)', () => {
  it('sin exclusión: reporte ORIGINAL intacto (comportamiento actual reproducido)', () => {
    const sel = buildSelectionAdjustedReport(BASE_REPORT, ALL_ROWS, new Set());
    expect(sel.selectionActive).toBe(false);
    expect(sel.report).toBe(BASE_REPORT);
  });

  it('sin sales_rows: selección inactiva aunque haya exclusiones (fallback del entorno)', () => {
    const sel = buildSelectionAdjustedReport(BASE_REPORT, [], new Set(['v-1']));
    expect(sel.selectionActive).toBe(false);
    expect(sel.report).toBe(BASE_REPORT);
  });

  it('con exclusión: sustituye SOLO sales/sales_split/equivs — egresos y demás conceptos INTACTOS', () => {
    const sel = buildSelectionAdjustedReport(BASE_REPORT, ALL_ROWS, new Set(['v-1']));
    expect(sel.selectionActive).toBe(true);
    expect(sel.report.sales_split?.CUP?.cash).toBe(2000);
    expect(sel.report.sales_equiv_cash_other_cup).toBe(9600);
    // Egresos de caja INDEPENDIENTES de la selección de ventas (misión §4):
    expect(sel.report.cash_flows).toBe(BASE_REPORT.cash_flows);
    expect(sel.report.payments).toBe(BASE_REPORT.payments);
    expect(sel.report.commissions).toBe(BASE_REPORT.commissions);
    expect(sel.report.refund_rows).toBe(BASE_REPORT.refund_rows);
  });

  it('computeDailySummary sobre el reporte ajustado: ventasCash/ventasTotales/esperado del conjunto seleccionado', () => {
    const base = computeDailySummary(BASE_REPORT, 'CUP');
    expect(base.ventasCash).toBe(12000);
    const sel = buildSelectionAdjustedReport(BASE_REPORT, ALL_ROWS, new Set(['v-1', 'v-3']));
    const adjusted = computeDailySummary(sel.report, 'CUP');
    // Se excluyen V1 (10 000 CUP) y el componente CUP de V3 (2 000):
    expect(adjusted.ventasCash).toBe(0);
    expect(adjusted.ventasTransfer).toBe(3000); // V4 intacto
    expect(adjusted.ventasTotales).toBe(3000);
    // MISIÓN CORRECTIVA: esperado = saldo inicial (0) + cobros BILLETES CUP
    // del conjunto (0 — V2 es USD, V4 transfer, V5 zelle) − egresos (500).
    // La equivalencia de V2 NO entra: sus billetes USD viven en la hoja USD.
    expect(adjusted.efectivoEsperado).toBe(-500);
    // Equivalencia recalculada con las seleccionadas (solo V2):
    expect(adjusted.equivCashOtraMoneda).toBe(5600);
    // Egresos de caja NO recalculados por la selección de ventas:
    expect(adjusted.egresosCaja).toBe(500);
    expect(adjusted.egresosCaja).toBe(base.egresosCaja);
  });

  it('la equivalencia NUNCA entra en ventasTotales (regla crítica anti-duplicación, #1479)', () => {
    const sel = buildSelectionAdjustedReport(BASE_REPORT, ALL_ROWS, new Set());
    const s = computeDailySummary(sel.report, 'CUP');
    // ventasTotales = cash + transfer + zelle + mixed (SIN equivalencias):
    expect(s.ventasTotales).toBe(15000);
    expect(s.equivCashOtraMoneda).toBe(9600);
    expect(s.ventasTotales).not.toBe(15000 + 9600);
  });

  it('hoja USD ajustada: importes nativos USD, sin equivalencias (hoja canónica es CUP)', () => {
    const sel = buildSelectionAdjustedReport(BASE_REPORT, ALL_ROWS, new Set(['v-2']));
    const usd = computeDailySummary(sel.report, 'USD');
    expect(usd.ventasCash).toBe(5);
    expect(usd.ventasZelle).toBe(10);
    expect(usd.equivCashOtraMoneda).toBe(0); // la hoja USD no consolida equivalencias
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('FUNCIÓN B · grupos visibles de «Ventas por Método» (subtotales correctos)', () => {
  it('grupos por método con importes SOLO de las seleccionadas y conteos N de M', () => {
    const groups = buildSalesMethodGroups(ALL_ROWS, new Set(['v-4']));
    const cashCup = groups.find(g => g.key === 'cash|CUP')!;
    expect(cashCup.includedCount).toBe(2);
    expect(cashCup.totalCount).toBe(2);
    expect(cashCup.selectedTotal).toBe(12000);
    const transfer = groups.find(g => g.key === 'transfer|CUP')!;
    expect(transfer.includedCount).toBe(0);
    expect(transfer.totalCount).toBe(1);
    expect(transfer.selectedTotal).toBe(0);
  });

  it('métodos distintos → subtotales separados (efectivo ≠ transferencia ≠ zelle)', () => {
    const groups = buildSalesMethodGroups(ALL_ROWS, new Set());
    expect(groups.map(g => g.key).sort()).toEqual(['cash|CUP', 'cash|USD', 'transfer|CUP', 'zelle|USD']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('FUNCIÓN B · tabla por producto del conjunto seleccionado (MISMA función del servidor)', () => {
  const item = (pid: string, qty: number, cupLine: number) => ({
    transaction_id: '',
    product_id: pid,
    product_name: `Producto ${pid}`,
    sku: pid,
    quantity: qty,
    price_at_sale_cup: cupLine,
    price_at_sale: cupLine,
    currency: 'CUP',
    exchange_rate: 1,
  });
  const rowsWithItems: SaleRow[] = [
    mkRow({
      id: 'w-1',
      buckets: [{ method: 'cash', currency: 'CUP', amount: 8000, amount_cup: 8000 }],
      tx: { id: 'w-1', cash_amount: 8000, transfer_amount: 0, zelle_amount: 0, sale_currency: 'CUP', sale_exchange_rate: 1 },
      items: [item('p1', 4, 8000)],
    }),
    mkRow({
      id: 'w-2',
      buckets: [{ method: 'cash', currency: 'CUP', amount: 2000, amount_cup: 2000 }],
      tx: { id: 'w-2', cash_amount: 2000, transfer_amount: 0, zelle_amount: 0, sale_currency: 'CUP', sale_exchange_rate: 1 },
      items: [item('p1', 1, 2000)],
    }),
  ];

  it('reproduce el resultado del servidor (buildItemsSummary) sobre el MISMO input', () => {
    const client = buildItemsSummaryForSales(rowsWithItems);
    const clientItems = client.items as Array<Record<string, unknown>>;
    const serverInput = rowsWithItems.flatMap(r => (r.items || []).map(it => ({ item: it, tx: r.tx!, txId: r.id, payments: r.payments })));
    const server = buildItemsSummary(serverInput);
    expect(clientItems).toHaveLength(1);
    expect(clientItems[0]).toMatchObject({ product_id: 'p1', total_quantity: 5, cash_cup: 10000 });
    expect(client.total_cup).toBe(server.totals.total_cup);
    expect(client.total_cash).toBe(server.totals.cash_cup);
  });

  it('con exclusión, la tabla por producto SOLO contiene las ventas seleccionadas', () => {
    const selected = rowsWithItems.filter(r => r.id !== 'w-2');
    const client = buildItemsSummaryForSales(selected);
    const clientItems = client.items as Array<Record<string, unknown>>;
    expect(clientItems[0]).toMatchObject({ total_quantity: 4, cash_cup: 8000 });
    expect(client.count).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('FUNCIÓN A · conceptos del Resumen del Día (misión §2)', () => {
  it('incluye los conceptos mínimos del brief (más Zelle, sin duplicar partidas)', () => {
    const keys = SUMMARY_CONCEPTS.map(c => c.key);
    expect(keys).toContain('resumenDia');
    expect(keys).toContain('ventasEfectivo');
    expect(keys).toContain('ventasTransferencia');
    expect(keys).toContain('equivalenciaCup');
    expect(keys).toContain('egresosCaja');
    expect(new Set(keys).size).toBe(keys.length); // sin duplicados
    expect(SUMMARY_CONCEPTS.find(c => c.key === 'equivalenciaCup')!.hint).toContain('no es una segunda venta');
  });

  it('todos activados por defecto — reproduce el contenido actual', () => {
    expect(isDefaultSummaryConcepts(DEFAULT_SUMMARY_CONCEPTS)).toBe(true);
    expect(SUMMARY_CONCEPT_KEYS.every(k => DEFAULT_SUMMARY_CONCEPTS[k])).toBe(true);
    expect(hasAnySummaryConcept(DEFAULT_SUMMARY_CONCEPTS)).toBe(true);
  });

  it('selectAll/deselectAll completos y coherentes', () => {
    const none = deselectAllSummaryConcepts();
    expect(SUMMARY_CONCEPT_KEYS.every(k => none[k] === false)).toBe(true);
    expect(hasAnySummaryConcept(none)).toBe(false);
    expect(hasAnySummaryConcept(selectAllSummaryConcepts())).toBe(true);
    // hasAnySummaryConcept(null/undefined) = true (sin selección guardada,
    // el comportamiento previo permanece intacto).
    expect(hasAnySummaryConcept(null)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('FUNCIÓN A · persistencia de conceptos AISLADA POR TIENDA (misión §6)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('claves distintas por tienda: una preferencia NO sobrescribe la de otra', () => {
    expect(summaryConceptsLsKey('store-a')).not.toBe(summaryConceptsLsKey('store-b'));
    saveSummaryConcepts('store-a', { ...DEFAULT_SUMMARY_CONCEPTS, egresosCaja: false });
    saveSummaryConcepts('store-b', deselectAllSummaryConcepts());
    const a = loadSummaryConcepts('store-a');
    const b = loadSummaryConcepts('store-b');
    expect(a.egresosCaja).toBe(false);
    expect(b.egresosCaja).toBe(false);
    expect(a.ventasEfectivo).toBe(true);  // store-a conserva el resto
    expect(b.ventasEfectivo).toBe(false); // store-b los desactivó todos
  });

  it('sin preferencia guardada → defaults (comportamiento actual); JSON corrupto → defaults sin romper', () => {
    expect(loadSummaryConcepts('store-x')).toEqual(DEFAULT_SUMMARY_CONCEPTS);
    window.localStorage.setItem(summaryConceptsLsKey('store-x'), '{no-es-json');
    expect(loadSummaryConcepts('store-x')).toEqual(DEFAULT_SUMMARY_CONCEPTS);
    window.localStorage.setItem(summaryConceptsLsKey('store-x'), JSON.stringify({ egresosCaja: 'no-bool', unknown: true }));
    const sel = loadSummaryConcepts('store-x');
    expect(sel.egresosCaja).toBe(true); // no-boolean se descarta → default
    expect(sel).toEqual(DEFAULT_SUMMARY_CONCEPTS); // claves desconocidas ignoradas
  });

  it('tienda sin id («sin-tienda») aislada de las tiendas nombradas', () => {
    saveSummaryConcepts(undefined, deselectAllSummaryConcepts());
    expect(summaryConceptsLsKey(undefined)).toContain('sin-tienda');
    expect(loadSummaryConcepts('store-a')).toEqual(DEFAULT_SUMMARY_CONCEPTS);
  });

  it('el esquema v1 descarta claves no conocidas al GUARDAR (estable ante crecimiento)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    saveSummaryConcepts('store-a', { ...DEFAULT_SUMMARY_CONCEPTS, egresosCaja: false });
    const written = JSON.parse(String(spy.mock.calls.at(-1)?.[1])) as Record<string, boolean>;
    expect(Object.keys(written).sort()).toEqual([...SUMMARY_CONCEPT_KEYS].sort());
    spy.mockRestore();
  });
});
