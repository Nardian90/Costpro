/**
 * cash-report-export-selection.test.tsx — MISIÓN PERSONALIZACIÓN DEL REPORTE
 * ENTREGA (2026-10-25). Consistencia de las EXPORTACIONES con la selección.
 *
 * Misión §5 (obligatorio):
 *   · Un concepto desactivado NO aparece en el PDF (texto real de jsPDF)
 *     ni en el Excel (filas de la hoja) — sin títulos/subtotales huérfanos.
 *   · Una venta desmarcada no forma parte de los totales exportados: el
 *     reporte AJUSTADO alimenta al MISMO builder que usa la vista previa.
 *   · El «Efectivo esperado a entregar» (saldo) NO se recalcula por ocultar
 *     conceptos (presentación pura) pero SÍ refleja la selección de ventas.
 *   · PDF y Excel reciben el MISMO ctx (reporte ajustado + concepts +
 *     selectionMeta) → vista previa = PDF = Excel por construcción.
 *   · Sin conceptos activos: los builders fallan cerrados (nada de reporte
 *     aparentemente vacío).
 *
 * REGRESIÓN DEL DEFECTO PREEXISTENTE (demostrado con expectativa
 * pre-calculada): la fórmula viva del esperado en Excel unía los términos de
 * egreso con '-' cuando las filas ya llevan SU signo contable negativo →
 * 20 000 − (−3 000) − (−500) = 23 500 ≠ 16 500 contable, y Excel recalculaba
 * MAL al abrir (fullCalcOnLoad). Ahora los términos se SUMAN (los negativos
 * restan solos) y el literal de conceptos ocultos conserva el saldo exacto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx-js-style';

// ── Spy de TODOS los doc.text del jsPDF real (inspección sin pdf-parser) ────
const textLog = vi.hoisted(() => [] as Array<{ page: number; text: string }>);

vi.mock('@/lib/export/lazy-pdf', () => ({
  createPDFDocument: async (orientation?: unknown, unit?: unknown, format?: unknown) => {
    const { jsPDF } = await import('jspdf');
    const doc = new (jsPDF as any)(orientation, unit, format);
    const orig = doc.text.bind(doc);
    doc.text = (t: unknown, x: number, y: number, opts?: unknown) => {
      const s = Array.isArray(t) ? t.map(String).join(' ') : String(t);
      textLog.push({ page: doc.getNumberOfPages(), text: s });
      return orig(t, x, y, opts);
    };
    return doc;
  },
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(async (url: string) => {
    if (String(url).includes('/api/commissions/calculate')) return [];
    return {};
  }),
}));

import {
  buildCashReportPdf,
  DEFAULT_PDF_OPTIONS,
  type CashReportPdfContext,
  type CashReportSummaries,
} from '@/components/views/terminal/views/cash/cash-report-pdf';
import {
  buildCashReportExcelWorkbook,
} from '@/components/views/terminal/views/cash/cash-report-excel';
import {
  buildSelectionAdjustedReport,
  deselectAllSummaryConcepts,
  DEFAULT_SUMMARY_CONCEPTS,
  type SaleRow,
} from '@/lib/cash-report/report-selection';

// ── Fixture: 2 ventas CUP (10 000 + 2 000) + 1 venta USD (7 @ 800) + egreso 500 ──
const SALES_ROWS: SaleRow[] = [
  { id: 'v-1', created_at: '2026-10-24T15:00:00Z', status: 'completed', source: 'reconstruction', buckets: [{ method: 'cash', currency: 'CUP', amount: 10000, amount_cup: 10000 }], items: [], payments: [] },
  { id: 'v-2', created_at: '2026-10-24T16:00:00Z', status: 'completed', source: 'reconstruction', buckets: [{ method: 'cash', currency: 'CUP', amount: 2000, amount_cup: 2000 }], items: [], payments: [] },
  { id: 'v-3', created_at: '2026-10-24T17:00:00Z', status: 'completed', source: 'ledger', buckets: [{ method: 'cash', currency: 'USD', amount: 7, amount_cup: 5600 }], items: [], payments: [] },
];

const REPORT_FULL = {
  sales: [
    { payment_method: 'cash', currency: 'CUP', transaction_count: 2, total: 12000, total_cup: 12000 },
    { payment_method: 'cash', currency: 'USD', transaction_count: 1, total: 7, total_cup: 5600 },
  ],
  sales_split: {
    CUP: { cash: 12000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 12000 },
    USD: { cash: 7, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 7 },
  },
  sales_equiv_cash_other_cup: 5600,
  sales_equiv_voucher_other_cup: 0,
  // MISIÓN CORRECTIVA 2026-10-25: saldo inicial del período (libro de caja)
  // y cobros en BILLETES por moneda (vista física del ledger — aquí sin
  // liquidación explícita ⇒ coinciden con el split de cobros).
  opening_balance: { CUP: 2000, USD: 0 },
  sales_bills_split: { CUP: 12000, USD: 7 },
  payments: [],
  commissions: [
    { payment_method: 'cash', currency: 'CUP', commission_count: 1, total: 3000 },
  ],
  production: [],
  adjustments: [],
  cash_flows: [
    { id: 'cf-1', direction: 'out' as const, amount: 500, currency: 'CUP', amount_cup: 500, note: 'IE-000001', document_number: 'IE-000001', created_by: null, created_at: '2026-10-24T19:00:00Z' },
  ],
  refund_rows: [],
  totals: { sales_total_cup: 12000, payments_total_cup: 0, commissions_total_cup: 3000, balance_cup: 14100 },
  start_date: '2026-10-24',
  end_date: '2026-10-24',
  cash_balance_cup: 14100,
  cash_breakdown: [],
  period: { start: '2026-10-24T00:00:00Z', end: '2026-10-24T23:59:59Z' },
} as unknown as CashReportPdfContext['report'];

const SUMMARIES: Required<CashReportSummaries> = {
  itemsSummary: { items: [], total_cup: 0, total_cash: 0, total_transfer: 0, total_zelle: 0 },
  paymentTotals: { totals: { CUP: { cash: 12000, transfer: 0, zelle: 0, total: 12000 }, USD: { cash: 7, transfer: 0, zelle: 0, total: 7 } } },
  commissionsSummary: { workers: [], total_cup: 3000 },
  productionOrders: [],
};

function buildContext(over?: Partial<CashReportPdfContext>): CashReportPdfContext {
  return {
    report: REPORT_FULL,
    template: 'diario',
    startDate: '2026-10-24',
    endDate: '2026-10-24',
    storeInfo: { name: 'ENERVIDA-VITALLCONS', logo_url: null, address: 'Calle 23', phone: null, email: null, reeup: null, nit: null },
    deliveredBy: 'Israel Leyva',
    recipientName: 'Belkis Olivera',
    madeBy: 'Ana Torres',
    cupDenoms: [1000, 500, 100],
    usdDenoms: [5, 1],
    cupBreakdown: {},
    usdBreakdown: {},
    options: { ...DEFAULT_PDF_OPTIONS, includeUsd: true },
    orientation: 'vertical',
    ...over,
  };
}

const allTexts = () => textLog.map(t => t.text).join('\n');

// ── Helpers de hoja Excel (mismo patrón del test de Excel existente) ──
type Row = Array<string | number | undefined>;
function rows(ws: XLSX.WorkSheet): Row[] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: '' }) as Row[];
}
function findRow(rs: Row[], label: string): { idx: number; row: Row } {
  const idx = rs.findIndex(r => String(r[0] ?? '') === label);
  expect(idx).toBeGreaterThanOrEqual(0);
  return { idx, row: rs[idx]! };
}
function cell(ws: XLSX.WorkSheet, addr: string): Record<string, unknown> {
  return (ws[addr] ?? {}) as Record<string, unknown>;
}
/** Evalúa una fórmula simple `D3+D5-12.5` contra las filas de la hoja. */
function evalFormula(f: string, ws: XLSX.WorkSheet): number {
  let acc = 0;
  for (const part of f.split(/(?=[+-])/)) {
    const m = part.match(/([+-]?)(D\d+|[\d.]+)/);
    if (!m) continue;
    const sgn = m[1] === '-' ? -1 : 1;
    const tok = m[2]!;
    const val = tok.startsWith('D')
      ? Number(cell(ws, `D${tok.slice(1)}`).v ?? 0)
      : Number(tok);
    acc += sgn * val;
  }
  return acc;
}

beforeEach(() => {
  textLog.length = 0;
});

// ═══════════════════════════════════════════════════════════════════════════
describe('PDF Diario · conceptos y selección (texto REAL del documento)', () => {
  it('todos los conceptos activados (default): el documento reproduce el contenido actual', async () => {
    await buildCashReportPdf(buildContext(), SUMMARIES);
    const t = allTexts();
    expect(t).toContain('Resumen del Día');
    expect(t).toContain('Ventas en efectivo');
    expect(t).toContain('Ventas por transferencia');
    // Etiqueta larga truncada con «…» por geometría del bloque — prefijo estable:
    expect(t).toContain('Equivalencia CUP');
    expect(t).toContain('Egresos de caja');
    expect(t).toContain('Efectivo esperado a entregar');
  });

  it('desactivar «Egresos de caja» OMITE la fila del PDF (el esperado NO cambia)', async () => {
    const concepts = { ...DEFAULT_SUMMARY_CONCEPTS, egresosCaja: false };
    const a = await buildCashReportPdf(buildContext(), SUMMARIES);
    const aEsperado = allTexts();
    // Valor contable base: esperado = 2 000 (saldo inicial) + 12 000 (cobros
    // billetes CUP) − 3 000 (comisión) − 500 (egreso) = 10 500. La
    // equivalencia (5 600) NO entra: presentación de la hoja USD.
    expect(aEsperado).toContain('10.500,00');
    textLog.length = 0;
    await buildCashReportPdf(buildContext({ concepts }), SUMMARIES);
    const t = allTexts();
    expect(t).not.toContain('Egresos de caja');
    // El SALDO se conserva (presentación pura — misión §4/§7):
    expect(t).toContain('10.500,00');
    expect(t).toContain('Efectivo esperado a entregar');
    // El saldo inicial viaja con el documento (partida real):
    expect(t).toContain('Saldo inicial / fondo de caja');
  });

  it('desactivar cada concepto omite SU fila (venta total, efectivo, transferencia, equivalencia)', async () => {
    const concepts = {
      ...DEFAULT_SUMMARY_CONCEPTS,
      resumenDia: false,
      ventasEfectivo: false,
      ventasTransferencia: false,
      ventasZelle: false,
      equivalenciaCup: false,
    };
    await buildCashReportPdf(buildContext({ concepts }), SUMMARIES);
    const t = allTexts();
    expect(t).not.toContain('Resumen del día (efectivo + transferencia)');
    expect(t).not.toContain('Ventas en efectivo');
    expect(t).not.toContain('Ventas por transferencia');
    // Sin equivalencia (ni su versión truncada):
    expect(t).not.toContain('Equivalencia CUP');
    // Sin filas huérfanas: el bloque conserva su título y su total contable.
    expect(t).toContain('Resumen del Día');
    expect(t).toContain('Efectivo esperado a entregar');
    expect(t).toContain('10.500,00');
  });

  it('SIN conceptos activados: el builder falla cerrado (no genera un reporte vacío)', async () => {
    await expect(buildCashReportPdf(buildContext({ concepts: deselectAllSummaryConcepts() }), SUMMARIES))
      .rejects.toThrow('al menos un concepto');
    expect(textLog.length).toBe(0); // nada se dibujó
  });

  it('venta desmarcada → el reporte AJUSTADO reduce los importes del PDF (misma fuente que la vista)', async () => {
    // Excluir v-1 (10 000 CUP): ventasCash 2 000 · esperado = 2 000 (saldo
    // inicial, INVARIANTE ante la selección) + 2 000 (cobros billetes CUP del
    // conjunto) − 3 000 − 500 = 500. El saldo inicial NO cambia (§7).
    const sel = buildSelectionAdjustedReport(REPORT_FULL, SALES_ROWS, new Set(['v-1']));
    expect(sel.selectionActive).toBe(true);
    await buildCashReportPdf(buildContext({
      report: sel.report,
      selectionMeta: { included: 2, total: 3 },
    }), SUMMARIES);
    const t = allTexts();
    expect(t).toContain('2.000,00');          // ventas en efectivo (CUP)
    expect(t).not.toContain('12.000,00');     // la venta excluida no reaparece
    expect(t).toContain('Saldo inicial / fondo de caja'); // partida invariante
    // Metadatos del conjunto: «Ventas incluidas: 2 de 3».
    expect(t).toContain('Ventas incluidas: 2 de 3');
    // La equivalencia sigue siendo línea propia (5 600), jamás suma a ventas:
    expect(t).toContain('5.600,00');
  });

  it('metadatos de filtro: con filtro activo se imprime la etiqueta del conjunto', async () => {
    await buildCashReportPdf(buildContext({
      selectionMeta: { included: 2, total: 3, filterLabel: 'Mixta' },
    }), SUMMARIES);
    expect(allTexts()).toContain('Ventas incluidas: 2 de 3 · Filtro: Mixta');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Excel · conceptos, selección y fórmula del esperado', () => {
  it('todos activados: filas completas y esperado con su valor contable', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, new Map());
    const rs = rows(wb.Sheets['Reporte Entrega']!);
    expect(findRow(rs, 'Saldo inicial / fondo de caja').row[3]).toBe(2000);
    expect(findRow(rs, 'Ventas en efectivo').row[3]).toBe(12000);
    expect(findRow(rs, 'Egresos de caja (fondo y otros)').row[3]).toBe(-500); // signo contable
    // esperado = 2 000 + 12 000 − 3 000 − 500 (la equivalencia NO es término):
    expect(findRow(rs, 'Efectivo esperado a entregar').row[3]).toBe(10500);
  });

  it('desactivar «Egresos de caja» OMITE la fila del Excel y el esperado conserva el saldo (literal en fórmula)', async () => {
    const concepts = { ...DEFAULT_SUMMARY_CONCEPTS, egresosCaja: false };
    const { wb } = await buildCashReportExcelWorkbook(buildContext({ concepts }), SUMMARIES, new Map());
    const ws = wb.Sheets['Reporte Entrega']!;
    const rs = rows(ws);
    // La fila NO existe (omitida realmente, no en blanco):
    expect(rs.findIndex(r => String(r[0] ?? '') === 'Egresos de caja (fondo y otros)')).toBe(-1);
    // El valor del esperado conserva el saldo contable:
    const esp = findRow(rs, 'Efectivo esperado a entregar');
    expect(esp.row[3]).toBe(10500);
    // La FÓRMULA viva incluye el LITERAL del término oculto (mismo resultado):
    const f = String(cell(ws, `D${esp.idx + 1}`).f ?? '');
    expect(f).toMatch(/500/); // literal del egreso oculto
    expect(evalFormula(f, ws)).toBe(10500);
  });

  it('REGRESIÓN signo de la fórmula: 2 000 + 12 000 − 3 000 − 500 = 10 500 (antes evaluaba 23 500)', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, new Map());
    const ws = wb.Sheets['Reporte Entrega']!;
    const rs = rows(ws);
    const esp = findRow(rs, 'Efectivo esperado a entregar');
    const f = String(cell(ws, `D${esp.idx + 1}`).f ?? '');
    // Los términos de egreso ya llevan SU signo negativo → se SUMAN:
    expect(f).not.toMatch(/-D\d+/);
    expect(evalFormula(f, ws)).toBe(10500); // contable EXACTO
  });

  it('desactivar «Ventas en efectivo»: total de ventas por fórmula con literal + esperado íntegro', async () => {
    const concepts = { ...DEFAULT_SUMMARY_CONCEPTS, ventasEfectivo: false };
    const { wb } = await buildCashReportExcelWorkbook(buildContext({ concepts }), SUMMARIES, new Map());
    const ws = wb.Sheets['Reporte Entrega']!;
    const rs = rows(ws);
    expect(rs.findIndex(r => String(r[0] ?? '') === 'Ventas en efectivo')).toBe(-1);
    // El total de ventas conserva el valor (literal del componente oculto):
    const total = findRow(rs, 'Resumen del día (efectivo + transferencia)');
    expect(total.row[3]).toBe(12000);
    const fTotal = String(cell(ws, `D${total.idx + 1}`).f ?? '');
    expect(fTotal).toMatch(/12000/);
    expect(evalFormula(fTotal, ws)).toBe(12000);
    // Esperado íntegro (presentación pura):
    expect(findRow(rs, 'Efectivo esperado a entregar').row[3]).toBe(10500);
  });

  it('SIN conceptos: el builder de Excel falla cerrado', async () => {
    await expect(buildCashReportExcelWorkbook(buildContext({ concepts: deselectAllSummaryConcepts() }), SUMMARIES, new Map()))
      .rejects.toThrow('al menos un concepto');
  });

  it('venta desmarcada → el Excel recibe el reporte AJUSTADO: importes y metadatos del conjunto', async () => {
    const sel = buildSelectionAdjustedReport(REPORT_FULL, SALES_ROWS, new Set(['v-1']));
    const { wb } = await buildCashReportExcelWorkbook(buildContext({
      report: sel.report,
      selectionMeta: { included: 2, total: 3 },
    }), SUMMARIES, new Map());
    const rs = rows(wb.Sheets['Reporte Entrega']!);
    expect(findRow(rs, 'Ventas en efectivo').row[3]).toBe(2000);
    // esperado = 2 000 (saldo inicial INVARIANTE) + 2 000 − 3 000 − 500 = 500:
    expect(findRow(rs, 'Efectivo esperado a entregar').row[3]).toBe(500);
    // El saldo inicial no cambia por la selección (misión §7):
    expect(findRow(rs, 'Saldo inicial / fondo de caja').row[3]).toBe(2000);
    // Metadatos del conjunto en la identidad del documento:
    expect(rs.some(r => String(r[0] ?? '').startsWith('Ventas incluidas: 2 de 3'))).toBe(true);
    // La fila oculta no deja huecos: el importe de la venta excluida no aparece:
    expect(rs.some(r => String(r[3] ?? '') === '10000')).toBe(false);
  });

  it('PDF y Excel con el MISMO ctx: mismos importes de resumen (vista previa = PDF = Excel)', async () => {
    const sel = buildSelectionAdjustedReport(REPORT_FULL, SALES_ROWS, new Set(['v-1']));
    const ctx = buildContext({ report: sel.report, selectionMeta: { included: 2, total: 3 } });
    // PDF:
    await buildCashReportPdf(ctx, SUMMARIES);
    const pdfText = allTexts();
    expect(pdfText).toContain('2.000,00');
    expect(pdfText).toContain('Saldo inicial / fondo de caja');
    // Excel:
    const { wb } = await buildCashReportExcelWorkbook(ctx, SUMMARIES, new Map());
    const rs = rows(wb.Sheets['Reporte Entrega']!);
    expect(findRow(rs, 'Ventas en efectivo').row[3]).toBe(2000);
    expect(findRow(rs, 'Efectivo esperado a entregar').row[3]).toBe(500);
    // La vista previa usa el MISMO builder del PDF (mismo ctx) → idéntico.
  });
});
