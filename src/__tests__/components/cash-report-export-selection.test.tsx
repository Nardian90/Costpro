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
/** Textos del CUERPO del documento (antes del Anexo de Auditoría): las filas
 *  omitidas NO aparecen aquí, aunque el anexo las documenta (misión §5). */
const bodyTexts = () => {
  const cut = textLog.findIndex(t => t.text.startsWith('Anexo de Auditoría'));
  return textLog.slice(0, cut === -1 ? textLog.length : cut).map(t => t.text).join('\n');
};

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

  it('desactivar «Egresos de caja» OMITE la fila del PDF y el cálculo personalizado EXCLUYE el término (misión 2026-10-26)', async () => {
    const concepts = { ...DEFAULT_SUMMARY_CONCEPTS, egresosCaja: false };
    await buildCashReportPdf(buildContext(), SUMMARIES);
    const aEsperado = allTexts();
    // Valor contable base: esperado = 2 000 (saldo inicial) + 12 000 (cobros
    // billetes CUP) − 3 000 (comisión) − 500 (egreso) = 10 500. La
    // equivalencia (5 600) NO entra: presentación de la hoja USD.
    expect(aEsperado).toContain('10.500,00');
    textLog.length = 0;
    await buildCashReportPdf(buildContext({ concepts }), SUMMARIES);
    const body = bodyTexts();
    const t = allTexts();
    // La fila NO aparece en el CUERPO del documento (el anexo la documenta):
    expect(body).not.toContain('Egresos de caja');
    // MISIÓN CONCILIACIÓN: el cálculo personalizado se actualiza SIN el término
    // (10 500 + 500 = 11 000) y se identifica como personalizado (§4.3):
    expect(t).toContain('11.000,00');
    expect(t).toContain('Efectivo esperado (personalizado)');
    expect(t).toContain('Reporte personalizado — conceptos seleccionados');
    // El ANEXO DE AUDITORÍA documenta el egreso omitido con su importe oficial:
    expect(t).toContain('Anexo de Auditoría');
    expect(t).toContain('Egresos de caja (fondo y otros)');
    // El saldo inicial viaja con el documento (partida real):
    expect(t).toContain('Saldo inicial / fondo de caja');
  });

  it('desactivar cada concepto omite SU fila y recalcula el esperado personalizado', async () => {
    const concepts = {
      ...DEFAULT_SUMMARY_CONCEPTS,
      resumenDia: false,
      ventasEfectivo: false,
      ventasTransferencia: false,
      ventasZelle: false,
      equivalenciaCup: false,
    };
    await buildCashReportPdf(buildContext({ concepts }), SUMMARIES);
    const body = bodyTexts();
    const t = allTexts();
    expect(body).not.toContain('Resumen del día (efectivo + transferencia)');
    expect(body).not.toContain('Ventas en efectivo');
    expect(body).not.toContain('Ventas por transferencia');
    // Sin equivalencia en el cuerpo (el anexo la documenta como omitida):
    expect(body).not.toContain('Equivalencia CUP');
    // Sin filas huérfanas: el bloque conserva su título.
    expect(body).toContain('Resumen del Día');
    // MISIÓN CONCILIACIÓN: sin cobros de ventas, el esperado personalizado =
    // 2 000 (saldo) − 3 000 (comisión) − 500 (egreso) = −1.500,00 (§4.3):
    expect(t).toContain('-1.500,00');
    expect(t).toContain('Efectivo esperado (personalizado)');
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

  it('desactivar «Egresos de caja» OMITE la fila del Excel y el cálculo personalizado EXCLUYE el término (sin literales)', async () => {
    const concepts = { ...DEFAULT_SUMMARY_CONCEPTS, egresosCaja: false };
    const { wb } = await buildCashReportExcelWorkbook(buildContext({ concepts }), SUMMARIES, new Map());
    const ws = wb.Sheets['Reporte Entrega']!;
    const rs = rows(ws);
    // La fila NO existe (omitida realmente, no en blanco):
    expect(rs.findIndex(r => String(r[0] ?? '') === 'Egresos de caja (fondo y otros)')).toBe(-1);
    // MISIÓN CONCILIACIÓN: el esperado personalizado EXCLUYE el egreso
    // (10 500 + 500 = 11 000) y se identifica como personalizado (§4.3):
    const esp = findRow(rs, 'Efectivo esperado (personalizado)');
    expect(esp.row[3]).toBe(11000);
    // La FÓRMULA viva solo suma las filas VISIBLES (sin literal oculto):
    const f = String(cell(ws, `D${esp.idx + 1}`).f ?? '');
    expect(f).not.toMatch(/500/); // sin literal del egreso omitido
    expect(evalFormula(f, ws)).toBe(11000);
    // La hoja «Auditoría» documenta el egreso omitido con su importe oficial
    // y su EFECTO FIRMADO (misión P1 §3/§6-A):
    const aud = rows(wb.Sheets['Auditoría']!);
    const egRow = findRow(aud, 'Egresos de caja (fondo y otros)');
    expect(egRow.row[1]).toBe('omitido');
    expect(egRow.row[2]).toBe(500);    // importe oficial
    expect(egRow.row[3]).toBe(0);      // incluido en personalizado
    expect(egRow.row[4]).toBe(-500);   // dif. importe = pers. − ofi.
    expect(egRow.row[5]).toBe(500);    // efecto FIRMADO sobre el esperado
    expect(egRow.row[6]).toBe('CUP');  // base monetaria
    // La fórmula viva del efecto: (personalizado − oficial) × signo −1:
    const fEfecto = String(cell(wb.Sheets['Auditoría']!, `F${egRow.idx + 1}`).f ?? '');
    expect(fEfecto).toBe(`(D${egRow.idx + 1}-C${egRow.idx + 1})*-1`);
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

  it('desactivar «Ventas en efectivo»: total recalculado por fórmula y esperado personalizado sin cobros', async () => {
    const concepts = { ...DEFAULT_SUMMARY_CONCEPTS, ventasEfectivo: false };
    const { wb } = await buildCashReportExcelWorkbook(buildContext({ concepts }), SUMMARIES, new Map());
    const ws = wb.Sheets['Reporte Entrega']!;
    const rs = rows(ws);
    expect(rs.findIndex(r => String(r[0] ?? '') === 'Ventas en efectivo')).toBe(-1);
    // MISIÓN CONCILIACIÓN: el agregado se recalcula SOLO con los componentes
    // activos (sin literal del componente oculto) — aquí solo transferencias
    // (0): el total es 0 (misma cifra que el PDF):
    const total = findRow(rs, 'Resumen del día (efectivo + transferencia)');
    expect(total.row[3]).toBe(0);
    const fTotal = String(cell(ws, `D${total.idx + 1}`).f ?? '');
    expect(fTotal).not.toMatch(/12000/);
    expect(evalFormula(fTotal, ws)).toBe(0);
    // Esperado personalizado sin el neto de billetes de las ventas:
    // 2 000 − 3 000 − 500 = −1 500:
    expect(findRow(rs, 'Efectivo esperado (personalizado)').row[3]).toBe(-1500);
  });

  it('SIN conceptos: el builder de Excel falla cerrado', async () => {
    await expect(buildCashReportExcelWorkbook(buildContext({ concepts: deselectAllSummaryConcepts() }), SUMMARIES, new Map()))
      .rejects.toThrow('al menos un concepto');
  });

  it('venta desmarcada → el Excel recibe el reporte AJUSTADO: importes y metadatos del conjunto', async () => {
    const sel = buildSelectionAdjustedReport(REPORT_FULL, SALES_ROWS, new Set(['v-1']));
    // Contrato MISIÓN CONCILIACIÓN: el ctx lleva el reporte OFICIAL (universo
    // completo) + conteos — igual que inyecta la vista (buildSelectionCtx).
    const { wb } = await buildCashReportExcelWorkbook(buildContext({
      report: sel.report,
      officialReport: REPORT_FULL,
      salesCounts: { validas: 3, seleccionadas: 2 },
      selectionMeta: { included: 2, total: 3 },
    }), SUMMARIES, new Map());
    const rs = rows(wb.Sheets['Reporte Entrega']!);
    expect(findRow(rs, 'Ventas en efectivo').row[3]).toBe(2000);
    // esperado = 2 000 (saldo inicial INVARIANTE) + 2 000 − 3 000 − 500 = 500.
    // MISIÓN CONCILIACIÓN: con ventas excluidas el resultado se identifica
    // como personalizado (misma cifra que el PDF — paridad §6):
    expect(findRow(rs, 'Efectivo esperado (personalizado)').row[3]).toBe(500);
    // El saldo inicial no cambia por la selección (misión §7):
    expect(findRow(rs, 'Saldo inicial / fondo de caja').row[3]).toBe(2000);
    // Metadatos del conjunto en la identidad del documento:
    expect(rs.some(r => String(r[0] ?? '').startsWith('Ventas incluidas: 2 de 3'))).toBe(true);
    // La fila oculta no deja huecos: el importe de la venta excluida no aparece:
    expect(rs.some(r => String(r[3] ?? '') === '10000')).toBe(false);
    // La hoja «Auditoría» separa el efecto de ventas del de conceptos
    // (la venta excluida permanece en el universo oficial — misión §5.2):
    const aud = rows(wb.Sheets['Auditoría']!);
    const dv = findRow(aud, 'Efecto de ventas excluidas de la selección (independiente)');
    expect(dv.row[2]).toBe(-10000);
    const dc = findRow(aud, 'Efecto de conceptos desactivados (firmado, independiente)');
    expect(dc.row[2]).toBe(0);
    // CONVENCIÓN (misión P1 §2): diferencia total = personalizado − oficial:
    const dt = findRow(aud, 'DIFERENCIA TOTAL del efectivo esperado (personalizado − oficial)');
    expect(dt.row[2]).toBe(-10000);
    // El estado tri-estado NO dice «Conciliado»: hay diferencias explicadas:
    const est = findRow(aud, 'Estado');
    expect(est.row[2]).toBe('Diferencias explicadas por la configuración');
    // El oficial de referencia queda íntegro (10 500): no se recalcula con la
    // selección ni con los conceptos:
    const eo = findRow(aud, 'Efectivo esperado OFICIAL (fórmula completa COSTPRO)');
    expect(eo.row[2]).toBe(10500);
  });

  it('PDF y Excel con el MISMO ctx: mismos importes de resumen (vista previa = PDF = Excel)', async () => {
    const sel = buildSelectionAdjustedReport(REPORT_FULL, SALES_ROWS, new Set(['v-1']));
    const ctx = buildContext({ report: sel.report, selectionMeta: { included: 2, total: 3 } });
    // PDF:
    await buildCashReportPdf(ctx, SUMMARIES);
    const pdfText = allTexts();
    expect(pdfText).toContain('2.000,00');
    expect(pdfText).toContain('Saldo inicial / fondo de caja');
    expect(pdfText).toContain('500,00'); // esperado personalizado (CUP)
    // Excel: MISMO esperado personalizado (paridad exacta §6):
    const { wb } = await buildCashReportExcelWorkbook(ctx, SUMMARIES, new Map());
    const rs = rows(wb.Sheets['Reporte Entrega']!);
    expect(findRow(rs, 'Ventas en efectivo').row[3]).toBe(2000);
    expect(findRow(rs, 'Efectivo esperado (personalizado)').row[3]).toBe(500);
    // La vista previa usa el MISMO builder del PDF (mismo ctx) → idéntico.
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MISIÓN P1 §6 · CASO E — FORMATOS: vista, vista previa, PDF, impresión y
// Excel muestran EXACTAMENTE los mismos signos, importes, bases monetarias y
// estado de auditoría (Caso A: egreso omitido ⇒ +500). La impresión y la
// vista previa consumen el MISMO builder del PDF; el Excel se RECALCULA.
// ═══════════════════════════════════════════════════════════════════════════
describe('CASO E · integridad de formatos (signos, importes, bases y estado)', () => {
  const conceptsA = { ...DEFAULT_SUMMARY_CONCEPTS, egresosCaja: false };

  /** Evalúa fórmulas del anexo: `D5-C5`, `(D5-C5)*-1`, `C12-SUM(F3:F14)`. */
  function evalAuditFormula(f: string, ws: XLSX.WorkSheet): number {
    const val = (ref: string) => Number(((ws[ref] ?? {}) as Record<string, unknown>).v ?? 0);
    const mSum = f.match(/^C(\d+)-SUM\(F(\d+):F(\d+)\)$/);
    if (mSum) {
      let acc = val(`C${mSum[1]}`);
      for (let r = Number(mSum[2]); r <= Number(mSum[3]); r += 1) acc -= val(`F${r}`);
      return acc;
    }
    const mEfecto = f.match(/^\(D(\d+)-C(\d+)\)\*(-?\d+)$/);
    if (mEfecto) return (val(`D${mEfecto[1]}`) - val(`C${mEfecto[2]}`)) * Number(mEfecto[3]);
    const mDif = f.match(/^D(\d+)-C(\d+)$/);
    if (mDif) return val(`D${mDif[1]}`) - val(`C${mDif[2]}`);
    throw new Error(`fórmula no soportada por el evaluador: ${f}`);
  }

  it('PDF (Diario): convención +500 visible, base y estado tri-estado', async () => {
    await buildCashReportPdf(buildContext({ concepts: conceptsA }), SUMMARIES);
    const t = allTexts();
    // Convención documentada en el anexo (misión P1 §2):
    expect(t).toContain('diferencia = personalizado − oficial');
    // Diferencia total y efecto del egreso con signo EXPLÍCITO +500:
    expect(t).toContain('+500,00');
    // Dif. de importe de la partida con signo −500 (pers. − ofi.):
    expect(t).toContain('-500,00');
    // Importes normativos del Caso A en el MISMO documento:
    expect(t).toContain('11.000,00'); // personalizado
    expect(t).toContain('10.500,00'); // oficial
    // Columnas del anexo: efecto firmado y base monetaria (misión P1 §3):
    expect(t).toContain('Efecto en esperado');
    expect(t).toContain('Dif. importe');
    // Estado tri-estado (NO «Conciliado»):
    expect(t).toContain('Diferencias explicadas por la configuración');
    expect(t).not.toContain('Estado: Conciliado');
  });

  it('Excel: mismos signos e importes que el PDF; fórmulas vivas recalculan EXACTO', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext({ concepts: conceptsA }), SUMMARIES, new Map());
    const aud = rows(wb.Sheets['Auditoría']!);
    const ws = wb.Sheets['Auditoría']!;
    // Misma convención visible:
    expect(aud.some(r => String(r[0] ?? '') === 'Convención de signos:')).toBe(true);
    // Fila del egreso: −500 de importe, +500 de efecto, base CUP:
    const egRow = findRow(aud, 'Egresos de caja (fondo y otros)');
    expect(egRow.row[4]).toBe(-500);
    expect(egRow.row[5]).toBe(500);
    expect(egRow.row[6]).toBe('CUP');
    // Diferencia total = personalizado − oficial = +500:
    const dt = findRow(aud, 'DIFERENCIA TOTAL del efectivo esperado (personalizado − oficial)');
    expect(dt.row[2]).toBe(500);
    // RECALCULO en vivo (misión §6-E: «abre y recalcula el Excel»):
    //  · fórmula de dif. importe (D − C):
    const fDif = String(cell(ws, `E${egRow.idx + 1}`).f ?? '');
    expect(evalAuditFormula(fDif, ws)).toBe(-500);
    //  · fórmula de efecto firmado ((D − C) × signo):
    const fEfecto = String(cell(ws, `F${egRow.idx + 1}`).f ?? '');
    expect(evalAuditFormula(fEfecto, ws)).toBe(500);
    //  · VERIFICACIÓN INDEPENDIENTE: total − Σ efectos del detalle = 0
    //    (NO la identidad tautológica anterior):
    const ver = findRow(aud, 'Verificación: diferencia total − Σ efectos del detalle = 0');
    const fVer = String(cell(ws, `C${ver.idx + 1}`).f ?? '');
    expect(fVer).toMatch(/^C\d+-SUM\(F\d+:F\d+\)$/);
    expect(evalAuditFormula(fVer, ws)).toBe(0);
    // El residuo del MODELO también es 0 (verificación no tautológica §4):
    expect(findRow(aud, 'Diferencia no explicada (residuo independiente)').row[2]).toBe(0);
    // Mismo estado que el PDF:
    expect(findRow(aud, 'Estado').row[2]).toBe('Diferencias explicadas por la configuración');
    // Mismos importes normativos del Caso A:
    expect(findRow(aud, 'Efectivo esperado OFICIAL (fórmula completa COSTPRO)').row[2]).toBe(10500);
    expect(findRow(aud, 'Efectivo esperado PERSONALIZADO (conceptos activos)').row[2]).toBe(11000);
  });

  it('Excel: la verificación viva ABRE si el detalle dejara de explicar el total (no tautológica)', async () => {
    // Sabotaje controlado del libro exportado: alteramos el importe oficial del
    // egreso (C) SIN tocar su efecto (F, fórmula viva que recalcula) ⇒ al
    // recalcular, la verificación total − Σ efectos debe abrir ≠ 0.
    const { wb } = await buildCashReportExcelWorkbook(buildContext({ concepts: conceptsA }), SUMMARIES, new Map());
    const ws = wb.Sheets['Auditoría']!;
    const aud = rows(wb.Sheets['Auditoría']!);
    const egRow = findRow(aud, 'Egresos de caja (fondo y otros)');
    const dt = findRow(aud, 'DIFERENCIA TOTAL del efectivo esperado (personalizado − oficial)');
    const ver = findRow(aud, 'Verificación: diferencia total − Σ efectos del detalle = 0');
    // El efecto firmado del egreso recalcula con el C sabotado (D − C) × −1:
    ws[`C${egRow.idx + 1}`] = { ...ws[`C${egRow.idx + 1}`] as Record<string, unknown>, v: 600 };
    // D − C = 0 − 600 = −600 ⇒ efecto = (−600) × −1 = +600 ⇒ Σ efectos = +600.
    // total (celda C de «DIFERENCIA TOTAL», sin fórmula: valor del modelo) = +500.
    const fVer = String(cell(ws, `C${ver.idx + 1}`).f ?? '');
    const val = (ref: string) => Number(((ws[ref] ?? {}) as Record<string, unknown>).v ?? 0);
    const mSum = fVer.match(/^C(\d+)-SUM\(F(\d+):F(\d+)\)$/)!;
    let efectos = 0;
    for (let r = Number(mSum[2]); r <= Number(mSum[3]); r += 1) {
      const fCell = String((ws[`F${r}`] ?? {} as Record<string, unknown>).f ?? '');
      efectos += fCell ? evalLocal(fCell) : val(`F${r}`);
    }
    function evalLocal(fx: string): number {
      const m = fx.match(/^\(D(\d+)-C(\d+)\)\*(-?\d+)$/)!;
      return (val(`D${m[1]}`) - val(`C${m[2]}`)) * Number(m[3]);
    }
    expect(efectos).toBe(600);        // el detalle recalculado explica +600…
    expect(val(`C${dt.idx + 1}`)).toBe(500); // …pero el total del modelo es +500
    expect(val(`C${dt.idx + 1}`) - efectos).toBe(-100); // ⇒ verificación ABRE ≠ 0
  });

  it('plantilla Estándar: MISMA convención y estado en su anexo (impresión = PDF)', async () => {
    await buildCashReportPdf(buildContext({ concepts: conceptsA, template: 'estandar' }), SUMMARIES);
    const t = allTexts();
    expect(t).toContain('ANEXO DE AUDITORÍA');
    expect(t).toContain('diferencia = personalizado − oficial');
    // formatCurrency (es-CU) antepone $ — el signo + sigue siendo explícito:
    expect(t).toContain('+$500.00');
    expect(t).toContain('Diferencias explicadas por la configuración');
    expect(t).not.toContain('Estado: Conciliado');
  });
});
